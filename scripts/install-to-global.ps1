#!/usr/bin/env pwsh
#Requires -Version 5.1
<#
.SYNOPSIS
  Build the local security-research fork and install it as a separate global
  package "kimi-code-security" exposing the `ksec` command.

.DESCRIPTION
  Unlike the old overwrite-in-place flow, this leaves the official
  @moonshot-ai/kimi-code install (the `kimi` command) untouched:
    1. On first run the official global package directory is cloned to
       <npm-prefix>/node_modules/kimi-code-security (without dist), so the
       native optional deps (node-pty, clipboard) come along.
    2. The clone's package.json is rewritten: name -> kimi-code-security,
       bin -> { "ksec": "dist/main.mjs" }.
    3. The freshly built apps/kimi-code/dist replaces the clone's dist; the
       previous dist is kept as dist-backup-<timestamp> inside the clone.
    4. `ksec` shims are derived from the official `kimi` shims in the global
       prefix by rewriting the package path.

.PARAMETER SkipBuild
  Skip pnpm install/build and use the existing apps/kimi-code/dist.

.PARAMETER Restore
  Do not install; restore the ksec package's most recent dist-backup-* to dist.

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
$ksecCmd = Get-Command 'ksec' -ErrorAction SilentlyContinue
if ($kimiCmd -and $kimiCmd.Source) {
  $globalPrefix = Split-Path -Parent $kimiCmd.Source
} elseif ($ksecCmd -and $ksecCmd.Source) {
  $globalPrefix = Split-Path -Parent $ksecCmd.Source
} else {
  $globalPrefix = (npm prefix -g).Trim()
}
if (-not $globalPrefix) {
  throw 'Could not determine npm global prefix and neither kimi nor ksec is in PATH.'
}

$donorPkg = Join-Path $globalPrefix 'node_modules\@moonshot-ai\kimi-code'
$ksecPkg = Join-Path $globalPrefix 'node_modules\kimi-code-security'

if (-not (Test-Path $ksecPkg) -and -not (Test-Path $donorPkg)) {
  throw "Neither $ksecPkg nor the donor package $donorPkg exists. Run 'npm install -g @moonshot-ai/kimi-code' first (needed once as the dependency donor)."
}

function Get-LatestBackup {
  $backups = Get-ChildItem -Path $ksecPkg -Directory -Filter 'dist-backup-*' -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending
  return $backups | Select-Object -First 1
}

if ($Restore) {
  if (-not (Test-Path $ksecPkg)) {
    throw "ksec package not found: $ksecPkg. Nothing to restore."
  }
  $backup = Get-LatestBackup
  if (-not $backup) {
    throw "No dist-backup-* directory found in $ksecPkg. Nothing to restore."
  }
  $distPath = Join-Path $ksecPkg 'dist'
  if (Test-Path $distPath) {
    $removed = "$ksecPkg\dist-removed-$(Get-Date -Format yyyyMMdd-HHmmss)"
    Rename-Item $distPath $removed
    Write-Host "Moved current dist to $removed" -ForegroundColor Yellow
  }
  Rename-Item $backup.FullName $distPath
  Write-Host "Restored $($backup.Name) to dist." -ForegroundColor Green
  & ksec --version
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

# First run: clone the donor package (minus any dist) so native optional deps
# (node-pty, clipboard) and metadata come along. A leftover/incomplete clone
# (no package.json) is removed and redone. CON is excluded: a stray file with
# that reserved device name exists in some donor installs and cannot be copied.
if (-not (Test-Path (Join-Path $ksecPkg 'package.json'))) {
  if (Test-Path $ksecPkg) { Remove-Item -Recurse -Force $ksecPkg }
  Write-Host "Cloning donor package to $ksecPkg (first run)..." -ForegroundColor Cyan
  robocopy $donorPkg $ksecPkg /E /XF CON /XD dist 'dist-backup-*' 'dist-removed-*' /NFL /NDL /NJH | Out-Host
  if ($LASTEXITCODE -ge 8) { throw "robocopy failed (exit $LASTEXITCODE)" }
  $global:LASTEXITCODE = 0
}

# Repoint the clone's identity: its own name, the `ksec` bin entry, and the
# fork's real version (the donor's package.json may carry an older one).
$pkgJsonPath = Join-Path $ksecPkg 'package.json'
$pkgJson = Get-Content $pkgJsonPath -Raw | ConvertFrom-Json
$pkgJson.name = 'kimi-code-security'
$pkgJson.bin = [pscustomobject]@{ ksec = 'dist/main.mjs' }
$repoPkgJson = Get-Content (Join-Path $repoRoot 'apps\kimi-code\package.json') -Raw | ConvertFrom-Json
if ($repoPkgJson.version) { $pkgJson.version = $repoPkgJson.version }
$pkgJson.PSObject.Properties.Remove('publishConfig')
$pkgJson | ConvertTo-Json -Depth 32 | ForEach-Object {
  # UTF-8 without BOM: the CLI JSON.parses its own package.json at startup and
  # chokes on the BOM that PS 5.1's `Set-Content -Encoding utf8` emits.
  [System.IO.File]::WriteAllText($pkgJsonPath, "$_`n", [System.Text.UTF8Encoding]::new($false))
}

$timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$ksecDist = Join-Path $ksecPkg 'dist'
$backupPath = Join-Path $ksecPkg "dist-backup-$timestamp"

if (Test-Path $ksecDist) {
  Rename-Item $ksecDist $backupPath
  Write-Host "Backed up ksec dist to $backupPath" -ForegroundColor Green
}

Copy-Item -Recurse -Force $localDist $ksecDist
Write-Host "Copied local dist to $ksecDist" -ForegroundColor Green

# Create / refresh the `ksec` shims in the global prefix by rewriting the
# package path inside the official `kimi` shims (both / and \ spellings).
function Install-KsecShim {
  param([string]$Source, [string]$Target)
  if (-not (Test-Path $Source)) { return }
  $content = Get-Content $Source -Raw
  $content = $content.Replace('@moonshot-ai/kimi-code', 'kimi-code-security')
  $content = $content.Replace('@moonshot-ai\kimi-code', 'kimi-code-security')
  Set-Content -Path $Target -Value $content -Encoding ascii
  Write-Host "Wrote shim $Target" -ForegroundColor Green
}
Install-KsecShim (Join-Path $globalPrefix 'kimi') (Join-Path $globalPrefix 'ksec')
Install-KsecShim (Join-Path $globalPrefix 'kimi.cmd') (Join-Path $globalPrefix 'ksec.cmd')
Install-KsecShim (Join-Path $globalPrefix 'kimi.ps1') (Join-Path $globalPrefix 'ksec.ps1')

Write-Host 'Verifying ksec --version...' -ForegroundColor Cyan
& ksec --version
if ($LASTEXITCODE -ne 0) {
  throw "ksec --version failed (exit $LASTEXITCODE). Check the shims and the ksec package."
}

Write-Host @"

Deployment complete. The fork runs as 'ksec'; the official 'kimi' is untouched.
Rollback: .\scripts\install-to-global.ps1 -Restore
"@ -ForegroundColor Green
