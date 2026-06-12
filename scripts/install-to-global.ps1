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
