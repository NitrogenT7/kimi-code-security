#!/usr/bin/env pwsh
#Requires -Version 5.1
<#
.SYNOPSIS
  Build the local security-research fork and install it as a separate global
  package "kimi-code-security-dev" exposing the `ksec-dev` command — a
  development build that lives alongside the stable `ksec` install.

.DESCRIPTION
  Mirrors install-to-global.ps1 but targets a *dev* package so `ksec` (stable)
  and `ksec-dev` (this checkout's latest build) coexist:
    1. On first run a donor package is cloned to
       <npm-prefix>/node_modules/kimi-code-security-dev (without dist) so the
       native optional deps (node-pty, clipboard) come along. The donor is the
       existing `kimi-code-security` install when present, otherwise the
       official @moonshot-ai/kimi-code.
    2. The clone's package.json is rewritten: name ->
       kimi-code-security-dev, bin -> { "ksec-dev": "dist/main.mjs" }, and the
       version gets a -dev.<timestamp> suffix so dev builds are obvious.
    3. The freshly built apps/kimi-code/dist replaces the clone's dist; the
       previous dist is kept as dist-backup-<timestamp> inside the clone.
    4. `ksec-dev` shims are created in the global prefix. The shims export
       KSEC_DEV=1 so the runtime can tell a dev install from a stable one.

  The stable `ksec` package and shims are never touched.

.PARAMETER SkipBuild
  Skip pnpm install/build and use the existing apps/kimi-code/dist.

.PARAMETER Restore
  Do not install; restore the ksec-dev package's most recent dist-backup-* to dist.

.EXAMPLE
  .\scripts\install-ksec-dev.ps1
  .\scripts\install-ksec-dev.ps1 -SkipBuild
  .\scripts\install-ksec-dev.ps1 -Restore
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
# (Also picks up scoop's nodejs-lts when it is on PATH — the version check below is
# what matters, not where Node came from.)
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

# Global prefix resolution: prefer an existing shim dir so the dev package
# lands next to the install it shares a donor with.
$kimiCmd = Get-Command 'kimi' -ErrorAction SilentlyContinue
$ksecCmd = Get-Command 'ksec' -ErrorAction SilentlyContinue
if ($ksecCmd -and $ksecCmd.Source) {
  $globalPrefix = Split-Path -Parent $ksecCmd.Source
} elseif ($kimiCmd -and $kimiCmd.Source) {
  $globalPrefix = Split-Path -Parent $kimiCmd.Source
} else {
  $globalPrefix = (npm prefix -g).Trim()
}
if (-not $globalPrefix) {
  throw 'Could not determine npm global prefix and neither kimi nor ksec is in PATH.'
}

# Donor preference: the stable ksec clone (deps already proven) > official package.
$stablePkg = Join-Path $globalPrefix 'node_modules\kimi-code-security'
$officialPkg = Join-Path $globalPrefix 'node_modules\@moonshot-ai\kimi-code'
$donorPkg = if (Test-Path (Join-Path $stablePkg 'package.json')) { $stablePkg } else { $officialPkg }

$ksecDevPkg = Join-Path $globalPrefix 'node_modules\kimi-code-security-dev'

if (-not (Test-Path $ksecDevPkg) -and -not (Test-Path $donorPkg)) {
  throw "Neither $stablePkg nor the donor package $officialPkg exists. Run install-to-global.ps1 (or 'npm install -g @moonshot-ai/kimi-code') first — the dev package clones its native deps from one of them."
}

function Get-LatestBackup {
  $backups = Get-ChildItem -Path $ksecDevPkg -Directory -Filter 'dist-backup-*' -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending
  return $backups | Select-Object -First 1
}

if ($Restore) {
  if (-not (Test-Path $ksecDevPkg)) {
    throw "ksec-dev package not found: $ksecDevPkg. Nothing to restore."
  }
  $backup = Get-LatestBackup
  if (-not $backup) {
    throw "No dist-backup-* directory found in $ksecDevPkg. Nothing to restore."
  }
  $distPath = Join-Path $ksecDevPkg 'dist'
  if (Test-Path $distPath) {
    $removed = "$ksecDevPkg\dist-removed-$(Get-Date -Format yyyyMMdd-HHmmss)"
    Rename-Item $distPath $removed
    Write-Host "Moved current dist to $removed" -ForegroundColor Yellow
  }
  Rename-Item $backup.FullName $distPath
  Write-Host "Restored $($backup.Name) to dist." -ForegroundColor Green
  & ksec-dev --version
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
if (-not (Test-Path (Join-Path $ksecDevPkg 'package.json'))) {
  if (Test-Path $ksecDevPkg) { Remove-Item -Recurse -Force $ksecDevPkg }
  Write-Host "Cloning donor package ($donorPkg) to $ksecDevPkg (first run)..." -ForegroundColor Cyan
  robocopy $donorPkg $ksecDevPkg /E /XF CON /XD dist 'dist-backup-*' 'dist-removed-*' /NFL /NDL /NJH | Out-Host
  if ($LASTEXITCODE -ge 8) { throw "robocopy failed (exit $LASTEXITCODE)" }
  $global:LASTEXITCODE = 0
}

# Repoint the clone's identity: its own name, the `ksec-dev` bin entry, and the
# fork's real version plus a -dev timestamp suffix so dev builds are obvious.
$pkgJsonPath = Join-Path $ksecDevPkg 'package.json'
$pkgJson = Get-Content $pkgJsonPath -Raw | ConvertFrom-Json
$pkgJson.name = 'kimi-code-security-dev'
$pkgJson.bin = [pscustomobject]@{ 'ksec-dev' = 'dist/main.mjs' }
$repoPkgJson = Get-Content (Join-Path $repoRoot 'apps\kimi-code\package.json') -Raw | ConvertFrom-Json
if ($repoPkgJson.version) {
  $timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
  $pkgJson.version = "$($repoPkgJson.version)-dev.$timestamp"
}
$pkgJson.PSObject.Properties.Remove('publishConfig')
$pkgJson | ConvertTo-Json -Depth 32 | ForEach-Object {
  # UTF-8 without BOM: the CLI JSON.parses its own package.json at startup and
  # chokes on the BOM that PS 5.1's `Set-Content -Encoding utf8` emits.
  [System.IO.File]::WriteAllText($pkgJsonPath, "$_`n", [System.Text.UTF8Encoding]::new($false))
}

$timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$ksecDevDist = Join-Path $ksecDevPkg 'dist'
$backupPath = Join-Path $ksecDevPkg "dist-backup-$timestamp"

if (Test-Path $ksecDevDist) {
  Rename-Item $ksecDevDist $backupPath
  Write-Host "Backed up ksec-dev dist to $backupPath" -ForegroundColor Green
}

Copy-Item -Recurse -Force $localDist $ksecDevDist
Write-Host "Copied local dist to $ksecDevDist" -ForegroundColor Green

# Create / refresh the `ksec-dev` shims in the global prefix by rewriting the
# official `kimi` shims (both / and \ spellings). The shims export KSEC_DEV=1
# so the runtime can tell a dev install from a stable one; nothing else in the
# stable ksec shims is touched.
function Install-KsecDevShim {
  param([string]$Source, [string]$Target)
  if (-not (Test-Path $Source)) { return }
  $content = Get-Content $Source -Raw
  $content = $content.Replace('@moonshot-ai/kimi-code', 'kimi-code-security-dev')
  $content = $content.Replace('@moonshot-ai\kimi-code', 'kimi-code-security-dev')
  # Export KSEC_DEV *before* node runs, per shim dialect:
  #  - .ps1: assignment right after the shebang/param prologue lines.
  #  - .cmd: SET inside the SETLOCAL block (after :find_dp0).
  #  - sh: export line at the top.
  if ($Target -like '*.ps1') {
    $lines = $content -split "`r?`n"
    $insertAt = 0
    for ($i = 0; $i -lt $lines.Count; $i++) {
      if ($lines[$i] -match '^\s*\$basedir=') { $insertAt = $i; break }
    }
    $lines = $lines[0..($insertAt-1)] + '$env:KSEC_DEV = "1"' + $lines[$insertAt..($lines.Count-1)]
    $content = $lines -join "`n"
  } elseif ($Target -like '*.cmd') {
    $content = $content -replace '(?m)^(SETLOCAL)', "SETLOCAL`r`nSET KSEC_DEV=1"
  } else {
    $content = "export KSEC_DEV=1`n$content"
  }
  [System.IO.File]::WriteAllText($Target, $content, [System.Text.ASCIIEncoding]::new())
  Write-Host "Wrote shim $Target" -ForegroundColor Green
}
Install-KsecDevShim (Join-Path $globalPrefix 'kimi') (Join-Path $globalPrefix 'ksec-dev')
Install-KsecDevShim (Join-Path $globalPrefix 'kimi.cmd') (Join-Path $globalPrefix 'ksec-dev.cmd')
Install-KsecDevShim (Join-Path $globalPrefix 'kimi.ps1') (Join-Path $globalPrefix 'ksec-dev.ps1')

Write-Host 'Verifying ksec-dev --version...' -ForegroundColor Cyan
& ksec-dev --version
if ($LASTEXITCODE -ne 0) {
  throw "ksec-dev --version failed (exit $LASTEXITCODE). Check the shims and the ksec-dev package."
}

Write-Host @"

Deployment complete. The dev build runs as 'ksec-dev' (KSEC_DEV=1); the stable 'ksec' and official 'kimi' are untouched.
Rollback: .\scripts\install-ksec-dev.ps1 -Restore
"@ -ForegroundColor Green
