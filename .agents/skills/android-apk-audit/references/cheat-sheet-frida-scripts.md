# Frida Scripts Cheat Sheet

Complete reference for bundled Frida scripts used in Android pentesting.

---

## Script Catalog

### Bypass Scripts (Load First)

| Script | Purpose | Command |
|--------|---------|---------|
| `ssl-pinning-bypass.js` | Universal SSL/TLS bypass | `frida -U -f pkg -l ssl-pinning-bypass.js` |
| `root-detection-bypass.js` | Root/emulator/debug bypass | `frida -U -f pkg -l root-detection-bypass.js` |
| `anti-frida-bypass.js` | Hide Frida indicators | `frida -U -f pkg -l anti-frida-bypass.js` |
| `biometric-bypass.js` | BiometricPrompt bypass | `frida -U -f pkg -l biometric-bypass.js` |
| `rasp-bypass.js` | RASP integrity checks | `frida -U -f pkg -l rasp-bypass.js` |

### Monitor Scripts (Load Second)

| Script | Purpose | Command |
|--------|---------|---------|
| `intent-logger.js` | Log IPC intents | `frida -U -f pkg -l intent-logger.js` |
| `ipc-abuse-helper.js` | Passive IPC logging | `frida -U -f pkg -l ipc-abuse-helper.js` |
| `network-interceptor.js` | HTTP/HTTPS intercept | `frida -U -f pkg -l network-interceptor.js` |
| `android-file-access-monitor.js` | File I/O monitoring | `frida -U -f pkg -l android-file-access-monitor.js` |
| `webview-monitor.js` | WebView URL monitoring | `frida -U -f pkg -l webview-monitor.js` |

### Deep-Dive Scripts (Load Third)

| Script | Purpose | Command |
|--------|---------|---------|
| `native-root-detection-probe.js` | Native root checks | `frida -U -f pkg -l native-root-detection-probe.js` |
| `jni-tracer.js` | JNI boundary tracing | `frida -U -f pkg -l jni-tracer.js` |
| `native-hook.js` | Native function hooking | `frida -U -f pkg -l native-hook.js` |
| `method-tracer.js` | Java method tracing | `frida -U -f pkg -l method-tracer.js` |
| `crypto-intercept.js` | Crypto operation tracing | `frida -U -f pkg -l crypto-intercept.js` |

### Specialized Scripts

| Script | Purpose | Command |
|--------|---------|---------|
| `shared-prefs-dumper.js` | Dump SharedPreferences | `frida -U -f pkg -l shared-prefs-dumper.js` |
| `jwt-token-monitor.js` | JWT/token monitoring | `frida -U -f pkg -l jwt-token-monitor.js` |
| `keystore-inspector.js` | Keystore enumeration | `frida -U -f pkg -l keystore-inspector.js` |
| `dexdump.js` | Dump DEX files | `frida -U -f pkg -l dexdump.js` |
| `flutter-channel-hook.js` | Flutter channel inspection | `frida -U -f pkg -l flutter-channel-hook.js` |
| `packer-unpacker.js` | Packer detection | `frida -U -f pkg -l packer-unpacker.js` |

---

## Quick Selection Guide

| Goal | Start With | Escalate To |
|------|------------|-------------|
| Bypass SSL pinning | `ssl-pinning-bypass.js` | `native-hook.js`, `rasp-bypass.md` |
| Bypass root detection | `root-detection-bypass.js` | `native-root-detection-probe.js` |
| Inspect IPC abuse | `intent-logger.js` | `ipc-abuse-helper.js`, `method-tracer.js` |
| Validate provider/deep-link | `ipc-abuse-helper.js` | `intent-logger.js` |
| Trace file I/O | `android-file-access-monitor.js` | `shared-prefs-dumper.js` |
| Investigate Keystore | `keystore-inspector.js` | `biometric-bypass.js`, `crypto-intercept.js` |
| Trace JNI/native | `jni-tracer.js` | `native-hook.js`, Ghidra |
| Analyze native libs | `native-hook.js` | `jni-tracer.js`, by-offset hooks |
| Dump WebViews | `webview-monitor.js` | `webview-debug.js` |

---

## Recommended Load Order

```
┌─────────────────────────────────────────────────────────────┐
│ 1. BYPASS (load first)                                      │
│    ssl-pinning-bypass.js                                    │
│    root-detection-bypass.js                                 │
│    anti-frida-bypass.js                                     │
│    rasp-bypass.js (if RASP detected)                        │
│    biometric-bypass.js (if biometric auth)                  │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ 2. MONITOR (load second - observe mode)                    │
│    intent-logger.js                                         │
│    ipc-abuse-helper.js                                      │
│    network-interceptor.js                                   │
│    android-file-access-monitor.js                          │
│    webview-monitor.js                                       │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ 3. DEEP-DIVE (load third - when needed)                     │
│    native-root-detection-probe.js                           │
│    jni-tracer.js                                            │
│    native-hook.js                                           │
│    method-tracer.js                                         │
│    crypto-intercept.js                                      │
└─────────────────────────────────────────────────────────────┘
```

---

## Script Chaining Examples

### Basic SSL + Root Bypass

```bash
frida -U -f com.example.app \
  -l ssl-pinning-bypass.js \
  -l root-detection-bypass.js
```

### Full Bypass + Monitoring

```bash
frida -U -f com.example.app \
  -l ssl-pinning-bypass.js \
  -l anti-frida-bypass.js \
  -l root-detection-bypass.js \
  -l intent-logger.js \
  -l ipc-abuse-helper.js \
  -l android-file-access-monitor.js
```

### Framework-Specific

```bash
# React Native
frida -U -f com.example.app \
  -l ssl-pinning-bypass.js \
  -l root-detection-bypass.js \
  -l flutter-channel-hook.js

# Flutter
frida -U -f com.example.app \
  -l ssl-pinning-bypass.js \
  -l flutter-channel-hook.js \
  -l native-hook.js
```

### Deep Investigation

```bash
frida -U -f com.example.app \
  -l ssl-pinning-bypass.js \
  -l jni-tracer.js \
  -l native-hook.js \
  -l method-tracer.js \
  -l crypto-intercept.js
```

---

## SSL Pinning Bypass Coverage

The `ssl-pinning-bypass.js` script handles:

| Framework/Tool | Hook Target |
|----------------|------------|
| OkHttp | `TrustManager`, `CertificateChainCleaner` |
| HttpURLConnection | `TrustManagerImpl` |
| WebView | `WebViewClient`, `SSLErrorHandler` |
| React Native | `RNCertManager` |
| Flutter | `FlutterHttpClientAdapter` |
| Xamarin | `NativeCertificateVerify` |
| TrustKit | `TrustKit.initialize` |

---

## Root Detection Bypass Coverage

The `root-detection-bypass.js` script handles:

| Category | Checks Bypassed |
|----------|----------------|
| File-based | `/system/app/Superuser.apk`, `/su`, `/system/xbin/su` |
| Command-based | `which su`, `su -c id` |
| Properties | `ro.build.tags`, `ro.debuggable` |
| Magisk | `su/sugote` mount detection |
| KernelSU | Kernel module detection |
| RootBeer | Library-based root checks |
| Emulator | `ro.kernel.*`, `qemu.*` properties |
| Debug | `android.os.Debug.isDebuggable` |

---

## Native Hook Pattern

```javascript
// Hook native function by offset
native-hook.js --help

// Basic native hook
var offset = ptr("0x12345678");
var module = "libnative-lib.so";

// Hook with Interceptor
Interceptor.attach(base.add(offset), {
  onEnter: function(args) {
    console.log("Called!");
    console.log(JSON.stringify(args));
  },
  onLeave: function(retval) {
    console.log("Returned: " + retval);
  }
});
```

---

## Frida One-Liners

```bash
# List classes
frida -U -f pkg --no-pause -q "Objc.classes" 2>/dev/null || \
frida -U -f pkg --no-pause -q "Java.enumerateLoadedClasses()"

# Find class
frida -U -f pkg -q "Java.perform(() => { Java.choose('com.example.Class', {}) })"

# Hook method
frida -U -f pkg -l - << 'EOF'
Java.perform(() => {
  var m = Java.use("com.example.Class").method;
  m.implementation = function(x) {
    console.log("Hooked! x=" + x);
    return this.method(x);
  };
});
EOF

# Dump memory
frida -U -f pkg -q "Process.findRangeByAddress(ptr('0x12345678'))"

# Spawn and inject
frida -U -f pkg -l script.js --no-pause
```

---

## Frida-Server Management

```bash
# Check frida-server version on device
adb shell "frida-server --version"

# Kill existing frida-server
adb shell "pkill frida-server"

# Start frida-server
adb shell "frida-server &"

# Or with specific port
adb shell "frida-server -l 0.0.0.0:27042"

# Port forwarding (if remote)
adb forward tcp:27042 tcp:27042
```

---

## Script Maturity Levels

| Level | Scripts | Notes |
|-------|---------|-------|
| **STABLE** | `ssl-pinning-bypass.js`, `root-detection-bypass.js`, `biometric-bypass.js`, `network-interceptor.js` | Production-ready, tested |
| **BETA** | `anti-frida-bypass.js`, `rasp-bypass.js`, `ipc-abuse-helper.js`, `intent-logger.js` | Functional but may need tuning |
| **EXPERIMENTAL** | `native-root-detection-probe.js`, `packer-unpacker.js` | Use with caution |

---

## External Resources

| Tool | Repository | Notes |
|------|------------|-------|
| FridaBypassKit | [okankurtuluss/FridaBypassKit](https://github.com/okankurtuluss/FridaBypassKit) | Optional multi-bypass bundle |
| objection | [sensepost/objection](https://github.com/sensepost/objection) | Runtime mobile exploration |
| frida-gadget | Bundled | For persistent instrumentation |

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Script not loading | Check Frida version matches `frida-tools` |
| Device not found | Run `adb devices`, check USB debugging |
| "Process terminated" | App crashed; try attach mode instead of spawn |
| Hook not firing | Verify class/method names with `jadx` |
| SSL bypass not working | App may use custom TrustManager; try `native-hook.js` |
