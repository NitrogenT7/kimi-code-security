# Quick Reference Commands

Quick reference for all Android pentesting tools.

## JADX (Decompilation)

```bash
jadx app.apk                          # GUI
jadx -d output/ app.apk               # CLI decompile
jadx --show-bad-code app.apk          # Show code even if errors
```

## APKTool (Resource Extraction)

```bash
apktool d app.apk -o decoded/         # Decode
apktool b decoded/ -o rebuilt.apk     # Rebuild
apktool d app.apk -f -o decoded/       # Force decode
apktool d app.apk --no-res -o code/   # No resources
```

## AAPT (APK Information)

```bash
aapt dump badging app.apk             # Manifest info
aapt dump permissions app.apk         # Permissions
aapt dump xmltree app.apk AndroidManifest.xml  # Full manifest
```

## ADB (Android Debug Bridge)

```bash
adb install app.apk                   # Install
adb install -r app.apk                # Reinstall
adb devices                           # List devices
adb logcat                            # View logs
adb shell                             # Interactive shell
adb shell pm list packages            # List installed apps
adb shell am start -n pkg/.Activity   # Start activity
```

## Frida (Dynamic Instrumentation)

```bash
frida -U -f com.example.app -l script.js      # Spawn
frida -U com.example.app -l script.js          # Attach
frida-ps -U                                     # List processes
frida -U com.example.app --eval "Java.perform(()=>{...})"  # One-liner
```

## Objection (Mobile Exploration)

```bash
objection -g com.example.app explore           # Interactive
objection -g com.example.app explore --startup "android hooking watch class java.lang.String"  # Auto-hook
objection --gadget com.example.app explore     # Gadget injection

# Common Objection runtime commands (use inside 'explore' session):
# android sslpinning disable          # Bypass SSL pinning
# android root disable                # Bypass root detection
# android hooking list classes         # List loaded classes
# android hooking list class_methods com.target.ClassName  # List methods
# android hooking watch class_method com.target.Class.method  # Watch method
# android keystore list               # List keystore entries
# android webview get_javascript_interfaces  # List JS interfaces
```

## APKiD (Framework/Obfuscation Detection)

```bash
apkid app.apk                     # Detect
apkid -r app.apk                  # Recursive
apkid -j app.apk                 # JSON output
```

## Tool Version Notes

### aapt vs aapt2

`aapt` (Android Asset Packaging Tool v1) is deprecated for **build operations** but remains valid for **read-only operations**:

| Command | Valid | Notes |
|---------|-------|-------|
| `aapt dump badging` | ✅ | Read APK metadata |
| `aapt dump permissions` | ✅ | Read permissions |
| `aapt dump xmltree` | ✅ | Read AndroidManifest |
| `aapt2 compile` | ❌ Use `aapt2` | Build .flat files |
| `aapt2 link` | ❌ Use `aapt2` | Link resources |

**Recommendation**: Use `aapt` for analysis/inspection. Use `aapt2` for building/modifying APKs.

**Reference**: https://developer.android.com/tools/aapt2
