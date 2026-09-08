# Android Pentesting Quick Start Guide

One-page guide for setting up your environment and running your first Android pentest.

---

## Tool Installation Checklist

Before starting, verify all tools are installed and working:

### Required Tools

| Tool | Version | Install Command | Verify |
|------|---------|----------------|--------|
| APKTool | 3.0.1+ | `brew install apktool` | `apktool --version` |
| JADX | 1.5.5+ | `brew install jadx` | `jadx --version` |
| ADB (SDK Platform Tools) | 36.0.2+ | `brew install android-platform-tools` | `adb version` |
| Frida | 17.9.1+ | `pip install frida-tools` | `frida --version` |
| Objection | 1.12.4+ | `pip install objection` | `objection --version` |
| APKiD | 3.0.0+ | `pip install apkid` | `apkid --version` |

### Optional Tools

| Tool | Install | Use Case |
|------|---------|----------|
| MobSF | Docker | Automated static analysis |
| Drozer | `pip install drozer` | Advanced IPC testing |
| Androguard | `pip install androguard` | Python APK analysis |
| Ghidra | `brew install ghidra` | Native library analysis |

### Quick Verify Script

```bash
# Run preflight check
bash /path/to/scripts/preflight-check.sh

# Or Python version
python3 /path/to/scripts/preflight-check.py

# Verify all at once
echo "=== APKTool ===" && apktool --version
echo "=== JADX ===" && jadx --version
echo "=== ADB ===" && adb version
echo "=== Frida ===" && frida --version
echo "=== Objection ===" && objection --version
echo "=== APKiD ===" && apkid --version
```

---

## Environment Setup

### 1. Android Device/Emulator

```bash
# Physical device - enable developer options
# Settings > About Phone > tap Build Number 7 times
# Settings > Developer Options > enable USB Debugging

# Connect and verify
adb devices
# Should show: "device" not "unauthorized"

# If unauthorized, check "Allow USB debugging" prompt on device

# Emulator - start emulator first
emulator -avd Pixel_6_API_33 &
adb devices
```

### 2. Frida Server on Device

```bash
# Download frida-server matching your frida-tools version
# https://github.com/frida/frida/releases

# Push to device
adb push frida-server /data/local/tmp/
adb shell chmod 755 /data/local/tmp/frida-server

# Start frida-server (in background)
adb shell "/data/local/tmp/frida-server &"

# Or forward port
adb forward tcp:27042 tcp:27042
adb shell "/data/local/tmp/frida-server -l 0.0.0.0"
```

### 3. Verify Frida Connection

```bash
frida-ps -U
# Should list running apps on device

frida-ps -Uai
# Shows apps with info (name, identifier, bundle)
```

---

## First Pentest Walkthrough

### Step 1: Obtain and Decode APK

```bash
# Get APK (from device or provide path)
adb pull $(adb shell pm path com.example.app | grep base | cut -d: -f2) ./app.apk

# Decode with APKTool
apktool d app.apk -o decoded/

# Decompile with JADX
jadx -d jadx_output app.apk

# Detect framework
apkid app.apk
```

### Step 2: Analyze Manifest

```bash
# Quick package info
aapt dump badging app.apk | grep -E "package:|sdkVersion|targetSdkVersion|application-label"

# List permissions
aapt dump permissions app.apk

# Find exported components
adb shell dumpsys package com.example.app | grep -E "Activity|Service|Provider|Receiver" | grep exported
```

### Step 3: Identify Attack Surface

```bash
# Look for deep links
grep -r "intent-filter" decoded/AndroidManifest.xml
grep -r "data android:scheme" decoded/AndroidManifest.xml

# Check for backup enabled
grep -r "allowBackup" decoded/AndroidManifest.xml
grep -r "android:debuggable" decoded/AndroidManifest.xml
```

### Step 4: Search for Vulnerabilities

```bash
# Hardcoded secrets
grep -rE "api[_-]?key|token|password|secret" jadx_output/

# Weak crypto
grep -rE "DES|MD5|SHA1|ECB" jadx_output/

# Insecure storage
grep -r "MODE_WORLD_READABLE|MODE_WORLD_WRITABLE" decoded/

# WebView issues
grep -r "addJavascriptInterface|loadUrl|evaluateJavascript" jadx_output/
```

### Step 5: Dynamic Testing (If Needed)

```bash
# Spawn app with bypass scripts
frida -U -f com.example.app \
  -l ssl-pinning-bypass.js \
  -l root-detection-bypass.js \
  -l intent-logger.js

# In another terminal, use Objection
objection -g com.example.app explore

# Test exported activity
adb shell am start -n com.example.app/.MainActivity

# Test exported receiver
adb shell am broadcast -a com.example.app.ACTION -e key value

# Monitor logs
adb logcat | grep com.example.app
```

---

## Common First-Use Issues and Solutions

### "adb: no devices found"

```bash
# Check device connection
adb devices

# Restart ADB server
adb kill-server
adb start-server

# Try USB port (use USB 2.0 ports, avoid hubs)
# Or use WiFi connection
adb connect <device-ip>:5555
```

### "frida-server not found" / "Unable to launch"

```bash
# Verify frida-server is running
adb shell "ps -A | grep frida"

# If not running, start it
adb shell "/data/local/tmp/frida-server &"

# Check version match
frida --version
adb shell "/data/local/tmp/frida-server --version"
# These MUST match
```

### "jadx: command not found" / "apktool: command not found"

```bash
# macOS with Homebrew
brew install jadx apktool

# Verify PATH
which jadx
which apktool

# If not in PATH, add to ~/.zshrc or ~/.bashrc
export PATH="$PATH:/opt/homebrew/bin"
```

### "Permission denied" when running frida-server

```bash
# Fix permissions
adb shell chmod 755 /data/local/tmp/frida-server

# If still failing, may need root
adb shell "su -c '/data/local/tmp/frida-server &'"
```

### APK fails to decode / Decode error

```bash
# Update APKTool
brew upgrade apktool

# Install framework if system APK
apktool if framework-res.apk

# Try force decode
apktool d app.apk -f -o decoded/
```

### SSL pinning bypass not working

```bash
# App may use custom TLS implementation
# Try loading multiple bypass scripts
frida -U -f pkg \
  -l ssl-pinning-bypass.js \
  -l root-detection-bypass.js \
  -l anti-frida-bypass.js

# Or use Objection
objection -g pkg explore
android sslpinning disable
```

### Device shows "unauthorized"

```bash
# Revoke USB debugging authorizations
adb shell "rm -rf /data/misc/adb/adb_keys"

# Disconnect and reconnect USB
# Accept the debugging prompt on device
# Check "Always allow from this computer"
```

---

## Key Files and Their Purposes

| File/Directory | Purpose |
|----------------|---------|
| `decoded/AndroidManifest.xml` | App permissions, exported components, deep links |
| `decoded/res/values/strings.xml` | Hardcoded strings, API keys, secrets |
| `decoded/smali/` | Disassembled DEX code (if APKTool used) |
| `jadx_output/` | Decompiled Java/Kotlin source (if JADX used) |
| `jadx_output/assets/` | Embedded files (React Native bundle, Flutter assets) |
| `jadx_output/lib/` | Native libraries (.so files) |
| `assets/frida-scripts/` | Bundled Frida scripts |
| `references/` | Documentation and guides |
| `scripts/` | Automation and reporting scripts |

---

## Quick Command Reference

```bash
# 1. Decode APK
apktool d app.apk -o decoded/
jadx -d jadx_output app.apk
apkid app.apk

# 2. Analyze manifest
aapt dump badging app.apk | head -20
aapt dump permissions app.apk

# 3. Search for secrets
grep -rE "api.key|secret|password" jadx_output/ --include="*.java"

# 4. Dynamic test
frida -U -f com.example.app -l ssl-pinning-bypass.js
adb shell am start -n com.example.app/.Activity

# 5. Generate report
python3 scripts/generate-report.py --input findings.json --output report.html
```

---

## Next Steps

1. **Read the references** in `references/` directory for detailed guidance
2. **Study OWASP MASTG** for comprehensive testing methodology
3. **Practice with vulnerable APKs** from OWASP MSTG Lab or similar resources
4. **Practice root detection bypass** with the [SecQuest Root Detection Bypass Whitepaper](https://www.secquest.co.uk/white-papers/root-detection-bypass) — step-by-step lab with InsecureBankv2 + Genymotion + Frida (see also: `references/rasp-bypass.md`)
5. **Join communities** for latest techniques and bypass scripts

---

## Getting Help

| Resource | Purpose |
|----------|---------|
| `references/cvss-scoring-guide.md` | CVSS 4.0 scoring |
| `references/reporting-templates.md` | Report templates |
| `references/frida-scripts-index.md` | Frida script catalog |
| `references/intent-injection.md` | IPC testing |
| `references/dynamic-analysis-setup.md` | Dynamic testing setup |
| OWASP MASTG | Mobile App Security Testing Guide |
| Frida Documentation | https://frida.re/docs/ |
