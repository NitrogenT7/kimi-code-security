<#
.SYNOPSIS
    Preflight check script for android-apk-audit skill on Windows PowerShell 5.1+

.DESCRIPTION
    Checks for all required tools for Android APK security auditing on Windows.
    Detects Windows/PowerShell versions, checks tool availability and versions,
    verifies Android SDK installation, and provides installation guidance.

.NOTES
    File:      preflight-check.ps1
    Author:    android-apk-audit skill
    Requires:  Windows PowerShell 5.1 or later
#>

[CmdletBinding()]
param()

# Set error action preference
$ErrorActionPreference = 'Stop'

# Color constants
$ColorFound = 'Green'
$ColorMissing = 'Red'
$ColorOptional = 'Yellow'
$ColorInfo = 'Cyan'
$ColorWarning = 'Magenta'

# Tool definitions
$Tools = @{
    'jadx' = @{
        CheckCommand = 'jadx'
        VersionSwitch = '--version'
        Critical = $true
        Choco = 'jadx'
        Scoop = 'jadx'
        Description = 'APK decompiler'
    }
    'apktool' = @{
        CheckCommand = 'apktool'
        VersionSwitch = '--version'
        Critical = $true
        Choco = 'apktool'
        Scoop = 'apktool'
        Description = 'APK resource decoder'
    }
    'adb' = @{
        CheckCommand = 'adb'
        VersionSwitch = 'version'
        Critical = $true
        Choco = 'adb'
        Scoop = 'adb'
        Description = 'Android Debug Bridge'
        AndroidSDK = $true
    }
    'frida' = @{
        CheckCommand = 'frida'
        VersionSwitch = '--version'
        Critical = $false
        Choco = 'frida'
        Scoop = 'frida'
        PIP = 'frida-tools'
        Description = 'Dynamic instrumentation'
    }
    'objection' = @{
        CheckCommand = 'objection'
        VersionSwitch = '--version'
        Critical = $false
        Choco = 'frida-objection'
        Scoop = 'objection'
        PIP = 'objection'
        Description = 'Mobile exploration tool'
    }
    'apkid' = @{
        CheckCommand = 'apkid'
        VersionSwitch = '--version'
        Critical = $false
        Choco = 'apkid'
        Scoop = 'apkid'
        PIP = 'apkid'
        Description = 'Framework detector'
    }
    'java' = @{
        CheckCommand = 'java'
        VersionSwitch = '-version'
        Critical = $true
        Choco = 'openjdk'
        Scoop = 'openjdk'
        Description = 'Java runtime (required by apktool)'
    }
    'keytool' = @{
        CheckCommand = 'keytool'
        VersionSwitch = ''
        Critical = $false
        Choco = 'openjdk'
        Scoop = 'openjdk'
        Description = 'Java keytool for signing'
    }
    'apksigner' = @{
        CheckCommand = 'apksigner'
        VersionSwitch = '--version'
        Critical = $false
        Choco = 'adb'
        Scoop = ''
        Description = 'APK signing tool (requires Android SDK)'
        AndroidSDK = $true
    }
    'jarsigner' = @{
        CheckCommand = 'jarsigner'
        VersionSwitch = ''
        Critical = $false
        Choco = 'openjdk'
        Scoop = 'openjdk'
        Description = 'JAR/APK signing tool'
    }
    'zipalign' = @{
        CheckCommand = 'zipalign'
        VersionSwitch = ''
        Critical = $false
        Choco = 'adb'
        Scoop = ''
        Description = 'APK alignment tool (requires Android SDK)'
        AndroidSDK = $true
    }
    'python' = @{
        CheckCommand = 'python'
        VersionSwitch = '--version'
        Critical = $false
        Choco = 'python'
        Scoop = 'python'
        Description = 'Python for helper scripts'
    }
    'sqlite3' = @{
        CheckCommand = 'sqlite3'
        VersionSwitch = '--version'
        Critical = $false
        Choco = 'sqlite'
        Scoop = 'sqlite'
        Description = 'SQLite database tool'
    }
    'rg' = @{
        CheckCommand = 'rg'
        VersionSwitch = '--version'
        Critical = $false
        Choco = 'ripgrep'
        Scoop = 'ripgrep'
        Description = 'Ripgrep (optional but recommended)'
    }
}

# Text search utilities
$TextSearchTools = @{
    'grep' = @{
        CheckCommand = 'grep'
        VersionSwitch = '--version'
        Critical = $true
        Choco = 'grep'
        Scoop = 'grep'
        Description = 'GNU grep'
    }
    'findstr' = @{
        CheckCommand = 'findstr'
        VersionSwitch = ''
        Critical = $true
        Native = $true
        Description = 'Windows findstr (native)'
    }
}

# Strings utility
$StringsTool = @{
    CheckCommand = 'strings'
    VersionSwitch = ''
    Critical = $false
    Choco = 'sysinternals'
    Scoop = 'strings'
    Description = 'Strings utility (Sysinternals/MinGW)'
    DirectURL = 'https://learn.microsoft.com/en-us/sysinternals/downloads/strings'
}

# Results storage
$Results = @()
$CriticalToolsFound = 0
$CriticalToolsTotal = 0
$OptionalToolsFound = 0
$OptionalToolsTotal = 0

# Function: Write section header
function Write-SectionHeader {
    param(
        [string]$Title
    )
    Write-Host ""
    Write-Host "═" * 80 -ForegroundColor $ColorInfo
    Write-Host "  $Title" -ForegroundColor $ColorInfo
    Write-Host "═" * 80 -ForegroundColor $ColorInfo
}

# Function: Detect Windows version
function Get-WindowsVersion {
    Write-SectionHeader "System Information"
    
    $os = Get-CimInstance -ClassName Win32_OperatingSystem
    Write-Host "Windows Version: $($os.Caption) $($os.DisplayVersion)" -ForegroundColor $ColorInfo
    Write-Host "Build Number:    $($os.BuildNumber)" -ForegroundColor $ColorInfo
    Write-Host "Architecture:    $($os.OSArchitecture)" -ForegroundColor $ColorInfo
    
    $psVersion = $PSVersionTable.PSVersion
    Write-Host "PowerShell:      $($psVersion.Major).$($psVersion.Minor).$($psVersion.Build)" -ForegroundColor $ColorInfo
    
    if ($psVersion.Major -lt 5 -or ($psVersion.Major -eq 5 -and $psVersion.Minor -lt 1)) {
        Write-Host "⚠️  WARNING: PowerShell 5.1 or later required" -ForegroundColor $ColorWarning
    }
}

# Function: Check if command exists
function Test-CommandExists {
    param(
        [string]$Command
    )
    $null = Get-Command $Command -ErrorAction SilentlyContinue
    return $?
}

# Function: Get tool version
function Get-ToolVersion {
    param(
        [string]$Command,
        [string]$VersionSwitch
    )
    
    try {
        if ([string]::IsNullOrEmpty($VersionSwitch)) {
            $output = & $Command 2>&1
        } else {
            $output = & $Command @($VersionSwitch.Split(' ')) 2>&1
        }
        
        # Try to extract version from output
        if ($output -match '(\d+\.\d+[\.\d]*)') {
            return $matches[1]
        }
        return "installed"
    }
    catch {
        return "unknown"
    }
}

# Function: Check text search utilities
function Test-TextSearchTools {
    Write-SectionHeader "Text Search Utilities"
    
    $foundAny = $false
    
    foreach ($name in $TextSearchTools.Keys) {
        $tool = $TextSearchTools[$name]
        $exists = Test-CommandExists -Command $tool.CheckCommand
        
        # FIX: Add to $Results so Show-Summary counts them correctly
        $result = @{
            Name = $name
            Found = $exists
            Critical = $tool.Critical
            Description = $tool.Description
        }
        $Results.Add($result)
        
        
        if ($exists) {
            $version = Get-ToolVersion -Command $tool.CheckCommand -VersionSwitch $tool.VersionSwitch
            Write-Host "✅ $name ($($tool.Description)) - v$version" -ForegroundColor $ColorFound
            $foundAny = $true
        }
        else {
            Write-Host "❌ $name ($($tool.Description)) - NOT FOUND" -ForegroundColor $ColorMissing
        }
    }
    
    return $foundAny
}

# Function: Check tool
function Test-Tool {
    param(
        [string]$Name,
        [hashtable]$ToolInfo
    )
    
    $exists = Test-CommandExists -Command $ToolInfo.CheckCommand
    
    $result = @{
        Name = $Name
        Found = $exists
        Critical = $ToolInfo.Critical
        Description = $ToolInfo.Description
    }
    
    if ($exists) {
        $version = Get-ToolVersion -Command $ToolInfo.CheckCommand -VersionSwitch $ToolInfo.VersionSwitch
        $result.Version = $version
        
        if ($ToolInfo.Critical) {
            Write-Host "✅ $Name" -NoNewline -ForegroundColor $ColorFound
            Write-Host " - v$version" -ForegroundColor $ColorFound
            $Script:CriticalToolsFound++
        }
        else {
            Write-Host "✅ $Name (optional)" -NoNewline -ForegroundColor $ColorOptional
            Write-Host " - v$version" -ForegroundColor $ColorOptional
            $Script:OptionalToolsFound++
        }
    }
    else {
        $result.Version = "not installed"
        
        if ($ToolInfo.Critical) {
            Write-Host "❌ $Name ($($ToolInfo.Description)) - NOT FOUND" -ForegroundColor $ColorMissing
        }
        else {
            Write-Host "⚠️  $Name ($($ToolInfo.Description)) - NOT FOUND (optional)" -ForegroundColor $ColorOptional
        }
        
        # Show installation options
        if ($ToolInfo.Choco) {
            Write-Host "   Chocolatey: choco install $($ToolInfo.Choco) -y" -ForegroundColor $ColorInfo
        }
        if ($ToolInfo.Scoop) {
            Write-Host "   Scoop:      scoop install $($ToolInfo.Scoop)" -ForegroundColor $ColorInfo
        }
        if ($ToolInfo.PIP) {
            Write-Host "   PIP:        pip install $($ToolInfo.PIP)" -ForegroundColor $ColorInfo
        }
        if ($ToolInfo.DirectURL) {
            Write-Host "   Download:   $($ToolInfo.DirectURL)" -ForegroundColor $ColorInfo
        }
    }
    
    $Script:Results += $result
}

# Function: Check strings tool
function Test-StringsTool {
    Write-Host ""
    
    $exists = Test-CommandExists -Command $StringsTool.CheckCommand
    
    if ($exists) {
        $version = Get-ToolVersion -Command $StringsTool.CheckCommand -VersionSwitch $StringsTool.VersionSwitch
        Write-Host "✅ strings - v$version" -ForegroundColor $ColorOptional
        $Script:OptionalToolsFound++
    }
    else {
        Write-Host "⚠️  strings ($($StringsTool.Description)) - NOT FOUND (optional)" -ForegroundColor $ColorOptional
        Write-Host "   Chocolatey: choco install sysinternals -y" -ForegroundColor $ColorInfo
        Write-Host "   Scoop:      scoop install strings" -ForegroundColor $ColorInfo
        Write-Host "   Download:   $($StringsTool.DirectURL)" -ForegroundColor $ColorInfo
    }
}

# Function: Check Android SDK
function Test-AndroidSDK {
    Write-SectionHeader "Android SDK Detection"
    
    $sdkPaths = @()
    
    # Check environment variables
    if ($env:ANDROID_HOME) {
        $sdkPaths += $env:ANDROID_HOME
        Write-Host "ANDROID_HOME: $($env:ANDROID_HOME)" -ForegroundColor $ColorInfo
    }
    else {
        Write-Host "ANDROID_HOME: NOT SET" -ForegroundColor $ColorWarning
    }
    
    if ($env:ANDROID_SDK_ROOT) {
        $sdkPaths += $env:ANDROID_SDK_ROOT
        Write-Host "ANDROID_SDK_ROOT: $($env:ANDROID_SDK_ROOT)" -ForegroundColor $ColorInfo
    }
    else {
        Write-Host "ANDROID_SDK_ROOT: NOT SET" -ForegroundColor $ColorWarning
    }
    
    # Check common installation path
    $localSdkPath = "C:\Users\$($env:USERNAME)\AppData\Local\Android\Sdk"
    if (Test-Path $localSdkPath) {
        $sdkPaths += $localSdkPath
        Write-Host "Local SDK Path: $localSdkPath" -ForegroundColor $ColorInfo
    }
    
    # Remove duplicates
    $sdkPaths = $sdkPaths | Select-Object -Unique
    
    $foundAny = $false
    foreach ($path in $sdkPaths) {
        if (Test-Path $path) {
            Write-Host ""
            Write-Host "✅ Android SDK found at: $path" -ForegroundColor $ColorFound
            $foundAny = $true
            
            # Check subdirectories
            $platformTools = Join-Path $path "platform-tools"
            if (Test-Path $platformTools) {
                Write-Host "   ✓ platform-tools (adb, fastboot)" -ForegroundColor $ColorFound
            }
            else {
                Write-Host "   ✗ platform-tools NOT FOUND" -ForegroundColor $ColorMissing
            }
            
            $buildTools = Join-Path $path "build-tools"
            if (Test-Path $buildTools) {
                $versions = Get-ChildItem $buildTools -Directory | Select-Object -ExpandProperty Name
                Write-Host "   ✓ build-tools: $($versions -join ', ')" -ForegroundColor $ColorFound
            }
            else {
                Write-Host "   ✗ build-tools NOT FOUND" -ForegroundColor $ColorMissing
            }
        }
    }
    
    if (-not $foundAny) {
        Write-Host ""
        Write-Host "❌ Android SDK NOT FOUND" -ForegroundColor $ColorMissing
        Write-Host ""
        Write-Host "To install Android SDK:" -ForegroundColor $ColorInfo
        Write-Host "1. Download Android Studio: https://developer.android.com/studio" -ForegroundColor $ColorInfo
        Write-Host "2. Install Android SDK from Android Studio SDK Manager" -ForegroundColor $ColorInfo
        Write-Host "3. Set environment variable: setx ANDROID_HOME `"C:\Users\$env:USERNAME\AppData\Local\Android\Sdk`"" -ForegroundColor $ColorInfo
    }
}

# Function: Check Java installation
function Test-JavaInstallation {
    Write-SectionHeader "Java Installation"
    
    $found = $false
    
    # Check JAVA_HOME
    if ($env:JAVA_HOME) {
        Write-Host "JAVA_HOME: $($env:JAVA_HOME)" -ForegroundColor $ColorInfo
        if (Test-Path $env:JAVA_HOME) {
            $found = $true
            $javaExe = Join-Path $env:JAVA_HOME "bin\java.exe"
            if (Test-Path $javaExe) {
                $versionOutput = & $javaExe -version 2>&1
                if ($versionOutput -match 'version "(\d+\.\d+\.?\d*)"') {
                    Write-Host "✅ Java found at: $javaExe" -ForegroundColor $ColorFound
                    Write-Host "   Version: $($matches[1])" -ForegroundColor $ColorFound
                }
            }
        }
    }
    else {
        Write-Host "JAVA_HOME: NOT SET" -ForegroundColor $ColorWarning
    }
    
    # Check registry for Java installations
    Write-Host ""
    Write-Host "Registry Java installations:" -ForegroundColor $ColorInfo
    
    $registryPaths = @(
        "HKLM:\SOFTWARE\JavaSoft\Java Runtime Environment",
        "HKLM:\SOFTWARE\JavaSoft\JDK",
        "HKLM:\SOFTWARE\JavaSoft\Java Development Kit",
        "HKCU:\SOFTWARE\JavaSoft\Java Runtime Environment",
        "HKCU:\SOFTWARE\JavaSoft\JDK",
        "HKCU:\SOFTWARE\JavaSoft\Java Development Kit"
    )
    
    $registryFound = $false
    foreach ($regPath in $registryPaths) {
        if (Test-Path $regPath) {
            $versions = Get-ChildItem $regPath -ErrorAction SilentlyContinue | 
                       Where-Object { $_.Name -match '\\(\d+\.\d+)' }
            
            foreach ($version in $versions) {
                $versionNumber = $version.Name | Select-String -Pattern '\\(\d+\.\d+)' |
                                 ForEach-Object { $_.Matches[0].Groups[1].Value }

                $javaHome = (Get-ItemProperty "$($version.PSPath)" -ErrorAction SilentlyContinue).JavaHome
                if ($javaHome -and (Test-Path $javaHome)) {
                    Write-Host "   ✓ Java $versionNumber at $javaHome" -ForegroundColor $ColorFound
                    $registryFound = $true
                }
            }
        }
    }
    
    if (-not $registryFound) {
        Write-Host "   No Java installations found in registry" -ForegroundColor $ColorWarning
    }
    
    if (-not $found) {
        Write-Host ""
        Write-Host "To install Java:" -ForegroundColor $ColorInfo
        Write-Host "   Chocolatey: choco install openjdk -y" -ForegroundColor $ColorInfo
        Write-Host "   Scoop:      scoop install openjdk" -ForegroundColor $ColorInfo
        Write-Host "   Download:   https://adoptium.net/" -ForegroundColor $ColorInfo
    }
}

# Function: Print summary
function Show-Summary {
    Write-SectionHeader "Summary"
    
    $totalFound = $CriticalToolsFound + $OptionalToolsFound
    $totalCritical = $Results.Where{ $_.Critical }.Count
    $totalOptional = $Results.Where{ -not $_.Critical }.Count + 1 # +1 for strings
    
    Write-Host "Critical tools:  $CriticalToolsFound/$totalCritical found" -ForegroundColor $ColorInfo
    Write-Host "Optional tools:  $OptionalToolsFound/$totalOptional found" -ForegroundColor $ColorInfo
    Write-Host "Total:           $totalFound/$($totalCritical + $totalOptional) tools found" -ForegroundColor $ColorInfo
    
    if ($CriticalToolsFound -lt $totalCritical) {
        $missingCritical = $Results.Where{ $_.Critical -and -not $_.Found }
        if ($missingCritical) {
            Write-Host ""
            Write-Host "Missing critical tools:" -ForegroundColor $ColorMissing
            foreach ($tool in $missingCritical) {
                Write-Host "  • $($tool.Name) - $($tool.Description)" -ForegroundColor $ColorMissing
            }
        }
        return $false
    }
    
    Write-Host ""
    Write-Host "✅ All critical tools are installed!" -ForegroundColor $ColorFound
    return $true
}

# ============== MAIN EXECUTION ==============

Clear-Host

Write-Host "╔══════════════════════════════════════════════════════════════════════════════╗" -ForegroundColor $ColorInfo
Write-Host "║                                                                              ║" -ForegroundColor $ColorInfo
Write-Host "║    Android APK Audit - Windows Preflight Check                             ║" -ForegroundColor $ColorInfo
Write-Host "║                                                                              ║" -ForegroundColor $ColorInfo
Write-Host "╚══════════════════════════════════════════════════════════════════════════════╝" -ForegroundColor $ColorInfo

# Count critical tools
foreach ($name in $Tools.Keys) {
    if ($Tools[$name].Critical) {
        $Script:CriticalToolsTotal++
    }
    else {
        $Script:OptionalToolsTotal++
    }
}
# Count TextSearchTools (grep, findstr) as critical — they are added to $Results by Test-TextSearchTools
foreach ($name in $TextSearchTools.Keys) {
    if ($TextSearchTools[$name].Critical) {
        $Script:CriticalToolsTotal++
    }
    else {
        $Script:OptionalToolsTotal++
    }
}

# Run all checks
Get-WindowsVersion
Test-TextSearchTools

Write-SectionHeader "Required & Optional Tools"

foreach ($name in $Tools.Keys) {
    Test-Tool -Name $name -ToolInfo $Tools[$name]
}

Test-StringsTool
Test-AndroidSDK
Test-JavaInstallation

# Show summary
$allCriticalFound = Show-Summary

Write-Host ""
Write-Host "══════════════════════════════════════════════════════════════════════════════" -ForegroundColor $ColorInfo

if ($allCriticalFound) {
    Write-Host ""
    Write-Host "✅ Preflight check PASSED" -ForegroundColor $ColorFound
    Write-Host ""
    exit 0
}
else {
    Write-Host ""
    Write-Host "❌ Preflight check FAILED - Missing critical tools" -ForegroundColor $ColorMissing
    Write-Host ""
    exit 1
}
