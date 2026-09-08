# Android Pentesting Command Cheat Sheet

Quick reference for all commands used during Android APK security assessments.

---

## JADX (Decompilation)

```bash
jadx app.apk                              # Launch GUI
jadx -d output/ app.apk                   # Decompile to folder
jadx --show-bad-code app.apk              # Show code even with errors
jadx --no-res app.apk                     # Skip resources (faster)
jadx --no-debug-info app.apk              # Strip debug info
jadx -e app.apk                          # Export as Eclipse project
jadx -p app.apk                          # Save as gradle project
```

**JADX GUI Options:**
- Search: Ctrl+Shift+F (global search)
- Code view: Ctrl+Space (switch)
- Bookmarks: F11

---

## APKTool (Resource Extraction)

```bash
apktool d app.apk -o decoded/            # Decode resources + smali
apktool b decoded/ -o rebuilt.apk        # Rebuild to APK
apktool d app.apk -f -o decoded/        # Force decode (overwrite)
apktool d app.apk --no-res -o code/     # Decode code only (no resources)
apktool b decoded/ --use-aapt2          # Use AAPT2 for building
apktool if app.apk                      # Install framework (for system APKs)
apktool empty-framework-dir             # Clear cached framework files
```

---

## AAPT / AAPT2 (APK Inspection)

### AAPT (Read-Only Operations)

```bash
aapt dump badging app.apk               # Package name, SDK, activities
aapt dump permissions app.apk           # Required permissions
aapt dump xmltree app.apk AndroidManifest.xml   # Full manifest
aapt dump strings app.apk               # String resources
aapt dump resources app.apk             # Resource table
aapt dump configurations app.apk        # Screen configs, locales
aapt dump badging app.apk | grep -E "sdkVersion|targetSdkVersion"
```

### AAPT2 (Build Operations)

```bash
aapt2 compile -o compiled/ res/drawable/foo.xml    # Compile single resource
aapt2 link -o app.apk -I android.jar compiled/*.flat AndroidManifest.xml
```

> **Note**: Use `aapt` for inspection, `aapt2` for building

---

## ADB (Android Debug Bridge)

### Device Management

```bash
adb devices                              # List connected devices
adb devices -l                           # List with details (serial, product)
adb kill-server                          # Restart ADB server
adb start-server                         # Start ADB server
adb reconnect                            # Force reconnect device
adb usb                                 # Restart ADB over USB
adb tcpip 5555                          # Enable TCPIP mode on port 5555
adb shell getprop ro.build.version.sdk  # Get Android SDK version
```

### App Installation

```bash
adb install app.apk                      # Install
adb install -r app.apk                   # Reinstall (keep data)
adb install -t app.apk                   # Allow test packages
adb install -d app.apk                  # Downgrade
adb uninstall com.package.name          # Uninstall
adb uninstall -k com.package.name       # Uninstall keeping data
```

### Shell Access

```bash
adb shell                                # Interactive shell
adb shell cmd package list packages      # List installed packages
adb shell pm list packages -s           # System packages only
adb shell pm list packages -3           # Third-party only
adb shell pm path com.package.name       # Get APK path
adb shell pm clear com.package.name      # Clear app data
adb shell dumpsys package com.package.name    # Dump package info
```

### Activity Manager (am)

```bash
adb shell am start -n pkg/.Activity      # Start activity
adb shell am start -n pkg/.Activity -a action   # With action
adb shell am start -n pkg/.Activity -d "scheme://host"  # With deep link
adb shell am broadcast -a action -e key value   # Send broadcast
adb shell am startservice pkg/.Service   # Start service
adb shell am force-stop pkg              # Force stop app
adb shell am stack list                  # List activity stacks
adb shell am dumpheap pid /sdcard/dump.hprof   # Dump heap
```

### File Operations

```bash
adb pull /data/app/app.apk ./           # Pull APK from device
adb push app.apk /sdcard/               # Push APK to device
adb shell ls /data/data/pkg/            # List app data directory
adb shell cat /data/data/pkg/shared_prefs/prefs.xml   # Read SharedPreferences
```

### Logcat

```bash
adb logcat                              # Live logs
adb logcat --pid=$(adb shell pidof pkg) # Filter by PID
adb logcat -s TAG:D                      # Filter by tag:debug
adb logcat *:W                          # Warning and above
adb logcat -f /sdcard/log.txt           # Write to file
adb logcat -r 1000 -n 5                 # Rotate logs
adb logcat -- UTC                       # Timestamps in UTC
adb logcat -b system                    # Bugreport buffer
adb bugreport > bugreport.zip           # Full bugreport
```

### Reverse Shell

```bash
adb shell "su -c 'command'"             # Run as root (if rooted)
adb reverse localabstract:unix:SocketName localabstract:Unixagram_External
```

---

## Frida (Dynamic Instrumentation)

### Basic Usage

```bash
frida -U -f com.example.app -l script.js           # Spawn + attach
frida -U com.example.app -l script.js                # Attach to running
frida -U -F                                         # Attach to frontmost app
frida-ps -U                                        # List running apps
frida-ps -Uai                                      # List apps with info
frida-trace -U -i "Java.*" com.example.app         # Trace Java methods
```

### Spawn vs Attach

```bash
# SPAWN (recommended for bypasses) - app starts fresh
frida -U -f com.example.app -l bypass.js -l hook.js

# ATTACH (when app already running or need to re-attach)
frida -U com.example.app -l script.js

# GADGET (for persistent script loading)
frida -U -g com.example.app -l script.js
```

### Script Loading

```bash
# Multiple scripts (load order matters!)
frida -U -f pkg -l ssl-bypass.js -l root-bypass.js -l monitor.js

# One-liner inline script
frida -U pkg --eval "Java.perform(() => { console.log('Hello'); })"

# Reload script (in REPL)
%resume
%load script.js
```

### Frida CLI Options

```bash
-U          # USB device
-f          # Spawn package
-F          # Attach to frontmost app
-l          # Load script
-p          # PID to attach
-n          # Hostname (remote)
-H          # Remote host
--no-pause  # Don't pause on spawn
-O          # Options file
-v          # Version
```

---

## Objection (Mobile Exploration)

```bash
objection -g com.example.app explore              # Start exploration
objection -g com.example.app explore --startup "android hooking watch class java.lang.String"

# In exploration session:
android sslpinning disable                         # Bypass SSL pinning
android root disable                              # Bypass root detection
android hooking list classes                      # List all classes
android hooking list class_methods com.target.Class   # List class methods
android hooking watch class_method com.target.Class.method  # Watch method
android hooking generate simple hook CreateUser    # Generate hook template
android keystore list                             # List Keystore entries
android webview get_javascript_interfaces        # List JS interfaces
android memory list modules                       # List loaded modules
android memory dump /local/dump.mem              # Dump memory
android intent launch_activity com.example.app.MainActivity
```

### Objection Startup Commands

```bash
# Auto-hook on start
objection -g pkg explore \
  --startup-command "android hooking watch class_method com.example.Class.method" \
  --startup-command "android sslpinning disable"
```

---

## APKiD (Framework Detection)

```bash
apkid app.apk                                 # Detect
apkid -r app.apk                              # Recursive (APK + inside)
apkid -j app.apk                              # JSON output
apkid -t 30 app.apk                           # Timeout (seconds)
apkid --help                                  # Full options
```

---

## Dexdump (DEX Inspection)

```bash
dexdump -d classes.dex                       # Disassemble
dexdump -f classes.dex                       # File header
dexdump -h classes.dex                       # Headers
dexdump -a classes.dex                       # All headers
```

---

## Keytool (Keystore Operations)

```bash
keytool -list -v -keystore keystore.jks      # View keystore
keytool -printcert -file cert.pem            # View certificate
keytool -genkeypair -keystore store.jks -alias alias -keyalg RSA -validity 10000
```

---

## Apksigner / Zipalign (APK Signing)

```bash
# Zipalign (before signing)
zipalign -v 4 app-unsigned.apk app-aligned.apk

# Sign with apksigner
apksigner sign --ks keystore.jks --out app-signed.apk app-aligned.apk
apksigner verify app-signed.apk              # Verify signature
apksigner verify --print-certs app.apk       # Show certificate info

# Sign with jarsigner (legacy)
jarsigner -verbose -sigalg SHA1withRSA -digestalg SHA1 \
  -keystore keystore.jks app-unsigned.apk alias
```

---

## Common One-Liners

```bash
# Get package info
adb shell pm dump com.example.app | grep -E "versionName|versionCode|firstInstallTime"

# Find exported components
adb shell dumpsys package com.example.app | grep -E "Activity|Service|Provider|Receiver" | grep -E "exported"

# Extract all APKs
adb shell pm list packages -3 -f | cut -d= -f2 | while read apk; do adb pull "$apk"; done

# Monitor network
adb shell "tcpdump -i any -p -s 0 -w /sdcard/capture.pcap"
adb pull /sdcard/capture.pcap . && wireshark capture.pcap

# Find sensitive files
adb shell find /data/data/com.example.app -name "*.xml" -o -name "*.db" -o -name "*.json"
```

---

## Tool Version Reference

| Tool | Min Version | Check Command |
|------|-------------|---------------|
| APKTool | 3.0.1+ | `apktool --version` |
| JADX | 1.5.5+ | `jadx --version` |
| ADB | 36.0.2+ | `adb version` |
| Frida | 17.9.1+ | `frida --version` |
| Objection | 1.12.4+ | `objection --version` |
| APKiD | 3.0.0+ | `apkid --version` |
| aapt | - | `aapt version` |
| aapt2 | - | `aapt2 version` |
