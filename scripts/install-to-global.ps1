#!/usr/bin/env pwsh
#Requires -Version 5.1
<#
.SYNOPSIS
  Build the local security-research fork and overwrite the npm-global
  @moonshot-ai/kimi-code dist directory.

.DESCRIPTION
  This script bundles all workspace changes into apps/kimi-code/dist and
  copies them over the globally installed package. The previous global dist
  is renamed to dist-backup-<timestamp> so the change is reversible.

.PARAMETER SkipBuild
  Skip pnpm install/build and use the existing apps/kimi-code/dist.

.PARAMETER Restore
  Do not install; restore the most recent dist-backup-* to dist.

.EXAMPLE
  .\scripts\install-to-global.ps1
  .\scripts\install-to-global.ps1 -SkipBuild
  .\scripts\install-to-global.ps1 -Restore
#>

[CmdletBinding()]
param(
  [switch]$SkipBuild,
  [switch]$Restore
)

$ErrorActionPreference = 'Stop'

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$repoRoot = Resolve-Path (Join-Path $scriptDir '..')
$localDist = Join-Path $repoRoot 'apps\kimi-code\dist'

function Test-Command {
  param([string]$Name)
  $null -ne (Get-Command $Name -ErrorAction SilentlyContinue)
}

if (-not (Test-Command 'pnpm')) {
  throw 'pnpm is not in PATH. Please install pnpm and try again.'
}

# Prefer a local Node installation that satisfies the workspace's engine requirement.
# This avoids the ERR_PNPM_UNSUPPORTED_ENGINE error when the system Node is too old.
function Find-CompatibleLocalNode {
  $required = [version]'24.15.0'
  $localBase = Join-Path $env:USERPROFILE '.local'
  if (-not (Test-Path $localBase)) { return $null }

  $candidates = Get-ChildItem -Path $localBase -Directory -Filter 'node-*-win-x64' | ForEach-Object {
    $nodeExe = Join-Path $_.FullName 'node.exe'
    if (Test-Path $nodeExe) {
      $verString = (& $nodeExe --version) -replace '^v',''
      $ver = $null
      if ([version]::TryParse($verString, [ref]$ver) -and $ver -ge $required) {
        [pscustomobject]@{ Path = $_.FullName; Version = $ver }
      }
    }
  }

  return $candidates | Sort-Object Version -Descending | Select-Object -First 1
}

$currentNode = Get-Command 'node' -ErrorAction SilentlyContinue
$needsLocalNode = $true
if ($currentNode) {
  $currentVersionString = (& node --version) -replace '^v',''
  $currentVersion = $null
  if ([version]::TryParse($currentVersionString, [ref]$currentVersion) -and $currentVersion -ge [version]'24.15.0') {
    $needsLocalNode = $false
  } else {
    Write-Host "System Node v$currentVersionString is too old (need >=24.15.0). Looking for local Node..." -ForegroundColor Yellow
  }
}

if ($needsLocalNode) {
  $localNode = Find-CompatibleLocalNode
  if (-not $localNode) {
    throw 'No compatible Node (>=24.15.0) found in PATH or ~/.local/node-*-win-x64. Please install Node 24.15.0+ and try again.'
  }
  Write-Host "Using local Node v$($localNode.Version) from $($localNode.Path)" -ForegroundColor Green
  $env:PATH = "$($localNode.Path);$env:PATH"
}

# Sanity-check the Node that pnpm will see.
$selectedNode = (& node --version) -replace '^v',''
Write-Host "Build will use Node v$selectedNode" -ForegroundColor Cyan

$kimiCmd = Get-Command 'kimi' -ErrorAction SilentlyContinue
if ($kimiCmd -and $kimiCmd.Source) {
  $globalPrefix = Split-Path -Parent $kimiCmd.Source
} else {
  $globalPrefix = (npm prefix -g).Trim()
}
if (-not $globalPrefix) {
  throw 'Could not determine npm global prefix and kimi is not in PATH.'
}

$globalPkg = Join-Path $globalPrefix 'node_modules\@moonshot-ai\kimi-code'
if (-not (Test-Path $globalPkg)) {
  throw "Global package not found: $globalPkg. Run 'npm install -g @moonshot-ai/kimi-code' first."
}

function Get-LatestBackup {
  $backups = Get-ChildItem -Path $globalPkg -Directory -Filter 'dist-backup-*' |
    Sort-Object LastWriteTime -Descending
  return $backups | Select-Object -First 1
}

if ($Restore) {
  $backup = Get-LatestBackup
  if (-not $backup) {
    throw "No dist-backup-* directory found in $globalPkg. Nothing to restore."
  }
  $distPath = Join-Path $globalPkg 'dist'
  if (Test-Path $distPath) {
    $removed = "$globalPkg\dist-removed-$(Get-Date -Format yyyyMMdd-HHmmss)"
    Rename-Item $distPath $removed
    Write-Host "Moved current dist to $removed" -ForegroundColor Yellow
  }
  Rename-Item $backup.FullName $distPath
  Write-Host "Restored $($backup.Name) to dist." -ForegroundColor Green
  & kimi --version
  return
}

Push-Location $repoRoot
try {
  if (-not $SkipBuild) {
    if (-not (Test-Path (Join-Path $repoRoot 'node_modules'))) {
      Write-Host 'Running pnpm install...' -ForegroundColor Cyan
      pnpm install
    }
    Write-Host 'Building workspace packages and app...' -ForegroundColor Cyan
    pnpm -r run build
    if ($LASTEXITCODE -ne 0) {
      throw "pnpm build failed (exit $LASTEXITCODE). Fix the build error before deploying."
    }
  }
} finally {
  Pop-Location
}

if (-not (Test-Path $localDist)) {
  throw "Local dist not found: $localDist. Build failed or run without -SkipBuild."
}

$timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$globalDist = Join-Path $globalPkg 'dist'
$backupPath = Join-Path $globalPkg "dist-backup-$timestamp"

if (Test-Path $globalDist) {
  Rename-Item $globalDist $backupPath
  Write-Host "Backed up global dist to $backupPath" -ForegroundColor Green
}

Copy-Item -Recurse -Force $localDist $globalDist
Write-Host "Copied local dist to $globalDist" -ForegroundColor Green

Write-Host 'Verifying kimi --version...' -ForegroundColor Cyan
& kimi --version
if ($LASTEXITCODE -ne 0) {
  throw "kimi --version failed (exit $LASTEXITCODE). Check the global package."
}

Write-Host @"

Deployment complete.
Rollback: .\scripts\install-to-global.ps1 -Restore
"@ -ForegroundColor Green
