# Frida Scripts for Android APK Audit

> **Note**: Our Frida scripts are built upon the work of the amazing security community. See [Sources & Credits](#sources--credits) for attribution. If you find better scripts, contributions are welcome!

Ready-to-use Frida scripts for common Android security testing tasks.

## Quick Start

```bash
# Basic usage - spawn app with script
frida -U -f com.target.app -l script.js

# Attach to running app
frida -U com.target.app -l script.js

# With objection
objection -g com.target.app explore
# Then use built-in commands or paste script content
```

## Best Practices (From Frida Handbook)

### 1. Memory Management
Always cache strings allocated with `Memory.allocUtf8String()` to avoid memory churn:

```javascript
// AVOID: Allocates on every call (memory churn)
Interceptor.attach(foo, {
    onLeave: function(retval) {
        var p = Memory.allocUtf8String("release-keys"); // BAD
        Memory.copy(this.buf, p, len);
    }
});

// PREFER: Cache strings once
var CACHED_STRINGS = {
    "release-keys": Memory.allocUtf8String("release-keys")
};

Interceptor.attach(foo, {
    onLeave: function(retval) {
        if (CACHED_STRINGS[this.key]) {
            Memory.copy(this.buf, CACHED_STRINGS[this.key], len); // GOOD
        }
    }
});
```

### 2. Error Handling in Native Hooks
Always wrap native operations in try-catch to prevent app crashes:

```javascript
// AVOID: Can crash if buf is null
Interceptor.attach(Module.getExportByName(null, 'fopen'), {
    onEnter: function(args) {
        this.buf = args[1].readUtf8String(); // CRASH if invalid
    }
});

// PREFER: Defensive error handling
Interceptor.attach(Module.getExportByName(null, 'fopen'), {
    onEnter: function(args) {
        try {
            if (!args[1] || args[1].isNull()) {
                this.skip = true;
                return;
            }
            this.buf = args[1].readUtf8String();
        } catch(e) {
            this.skip = true;
        }
    },
    onLeave: function(retval) {
        if (this.skip) return;
        // ... process safely
    }
});
```

### 3. Selective Hooking with .detach()
For performance, only hook functions when needed and detach after use:

```javascript
// PATTERN: Hook strstr ONLY when fopen reads /proc/self/maps
Interceptor.attach(Module.getExportByName(null, 'fopen'), {
    onEnter: function(args) {
        this.strstr = null;
        if (args[0].readUtf8String() === "/proc/self/maps") {
            // Hook temporarily
            this.strstr = Interceptor.attach(Module.getExportByName(null, 'strstr'), {
                onEnter: function(args) { this.arg = args[0].readUtf8String(); },
                onLeave: function(retval) {
                    if (this.arg.includes('frida')) retval.replace(0);
                }
            });
        }
    },
    onLeave: function(retval) {
        if (this.strstr) this.strstr.detach(); // IMPORTANT: cleanup
    }
});
```

### 4. Pointer Validation
Always validate pointers before reading:

```javascript
// AVOID
var name = args[0].readUtf8String(); // Crash if null

// PREFER
if (!args[0] || args[0].isNull()) return;
var name = args[0].readUtf8String();
```

## Available Scripts (37 scripts)

| Script | Purpose | OWASP Ref |
|--------|---------|-----------|
| `ssl-pinning-bypass.js` | Universal SSL/TLS pinning bypass — 30+ implementations (OkHttp, TrustManager, WebView, React Native, Flutter, Xamarin, TrustKit, WorkLight, NSC) | M5 |
| `root-detection-bypass.js` | Universal root/emulator/debug bypass — 30+ root packages, 80+ paths, native hooks (fopen/access/stat), cached strings for performance | M8 |
| `crypto-intercept.js` | Intercept crypto ops (Cipher, MessageDigest, Mac, SecretKeySpec, Signature) | M4 |
| `intent-logger.js` | Log all Intent data for exported components (Activities, Services, Receivers, Providers) | M9 |
| `webview-monitor.js` | Monitor WebView URL loading, JS interfaces, settings, and SSL errors | M1 |
| `webview-debug.js` | Enable WebView debugging for hybrid apps (Native, Cordova, Ionic, Capacitor, React Native, Flutter) + SSL pinning bypass | M1, M5 |
| `method-tracer.js` | Trace method calls with arguments and return values (configurable target class) | General |
| `shared-prefs-dumper.js` | Dump all SharedPreferences values with sensitive data detection | M6 |
| `keystore-inspector.js` | List and inspect Android Keystore entries, security flags, key properties | M4 |
| `biometric-bypass.js` | Universal biometric auth bypass — BiometricPrompt, FingerprintManagerCompat, FaceManager, crypto-object binding | M3 |
| `network-interceptor.js` | HTTP/HTTPS traffic interception — OkHttp chain, HttpURLConnection, Retrofit2, WebSocket monitoring | M5 |
| `anti-frida-bypass.js` | Bypass Frida detection (proc/maps, port scanning, thread enumeration, string checks) — uses selective hooking pattern | M8 |
| `jwt-token-monitor.js` | Monitor JWT tokens and secrets in SharedPreferences, headers, URLs, cookies | M1, M6 |
| `dexdump.js` | Dump DEX files from memory (static, dynamic, in-memory, runtime-generated) with auto-detection | General |
| `flutter-channel-hook.js` | Intercept Flutter Method Channels, Event Channels, Platform Views, and SSL pinning bypass | M5 |
| `rasp-bypass.js` | Bypass Runtime Application Self-Protection (RASP) — root, debug, emulator, Frida, APK integrity, SafetyNet | M8 |
| `packer-unpacker.js` | Detect and unpack common APK packers (Bangcle, Jiagu, 360, iJiami, AliProtect, Tencent) | General |
| `native-hook.js` | Hook native JNI/C++ functions and libraries for low-level analysis | General |
| `native-root-detection-probe.js` | Focused native root/RASP triage — fopen, access, stat, system property hooks | M8 |
| `android-file-access-monitor.js` | Java and native file I/O tracing with configurable path filters and byte preview | M9 |
| `jni-tracer.js` | Low-noise JNI boundary discovery — FindClass, GetMethodID, RegisterNatives, string bridges | General |
| `ipc-abuse-helper.js` | Passive IPC/provider/deep-link logger with optional active query/insert/broadcast helpers | M8, M9 |
| `flag-secure-bypass.js` | Bypass screen capture protection (FLAG_SECURE) — WindowManager, LayoutInflater, Activity hooks | M10 |
| `network-security-bypass.js` | Bypass Network Security Config and certificate pinning — TrustManager, OkHttp3, X509TrustManager | M5 |
| `comprehensive-tracer.js` | Combined Java method + native function tracer — class enumeration, ApiResolver, backtraces | General |
| `mediaprojection-bypass.js` | Bypass MediaProjection callback protection — VirtualDisplay, Surface, registerCallback | M10 |
| `mem-layout-viewer.js` | Visualize process memory layout — mappings, permissions, regions with hex preview | General |
| `rop-gadget-finder.js` | Find ROP gadgets in native libraries for exploit development | General |
| `uaf-detector.js` | Detect use-after-free conditions in native heap allocations | General |
| `native-heap-tracer.js` | Trace native heap allocations and deallocations for memory forensics | General |
| `android-anti-frida-countermeasures.js` | Comprehensive anti-Frida detection bypass — procfs, frida-server ports (27042/27043), thread names, TLS callbacks, strstr/memmem string checks | M8 |
| `android-argument-manipulation.js` | Hook and manipulate method arguments at runtime — inspect and modify input parameters before method execution | General |
| `android-constructors-hook.js` | Hook constructors and initializer methods (`<init>`, `<clinit>`) for early instrumentation of app startup | General |
| `android-early-instrumentation.js` | Instrument app before framework loads — hook Application.attach(), library loading, preload classes | General |
| `android-native-wrapper.js` | Helper for wrapping native function calls with argument type conversion and memory management | General |
| `network-interceptor-enhanced.js` | Enhanced HTTP/HTTPS interceptor with response body capture, header logging, and timing metrics | M5 |
| `test-universal-script.js` | Testing/validation utility — verifies syntax, hooking logic, and framework compatibility of all Frida scripts (not a pentesting script) | General |

## Detailed Usage

### SSL Pinning Bypass

```bash
frida -U -f com.target.app -l ssl-pinning-bypass.js

# Hooks: X509TrustManager, OkHttp CertificatePinner, WebViewClient.onReceivedSslError,
#         HttpsURLConnection HostnameVerifier, Apache HttpClient, NetworkSecurityPolicy
```

### Root Detection Bypass

```bash
frida -U -f com.target.app -l root-detection-bypass.js

# Hooks: File.exists(), File.canRead(), Runtime.exec(), ProcessBuilder, RootBeer,
#         Settings.Secure, PackageManager, SafetyNet, Build.TAGS, SELinux
```

### Crypto Interception

```bash
frida -U -f com.target.app -l crypto-intercept.js

# Hooks: Cipher (getInstance, init, doFinal), MessageDigest, Mac, SecretKeySpec,
#         Signature, KeyGenerator, KeyPairGenerator, KeyFactory
```

### Intent Logger

```bash
frida -U -f com.target.app -l intent-logger.js

# Hooks: Activity.onCreate/onNewIntent, BroadcastReceiver.onReceive,
#         Service.onStartCommand, ContentProvider.query/insert/update/delete,
#         Context.startActivity/sendBroadcast/startService
```

### WebView Monitor

```bash
frida -U -f com.target.app -l webview-monitor.js

# Hooks: loadUrl, loadData, loadDataWithBaseURL, evaluateJavascript,
#         addJavascriptInterface (with exposed method listing),
#         setJavaScriptEnabled, setAllowFileAccess, setMixedContentMode,
#         WebViewClient lifecycle, WebChromeClient dialogs
```

### Method Tracer

```bash
# Edit CONFIG.targetClass at top of script before running
frida -U -f com.target.app -l method-tracer.js

# Configurable: target class, method filter, include getters, verbose output
```

### SharedPreferences Dumper

```bash
frida -U -f com.target.app -l shared-prefs-dumper.js

# Outputs all key-value pairs with type info and sensitive data detection
```

### Keystore Inspector

```bash
frida -U -f com.target.app -l keystore-inspector.js

# Lists all AndroidKeyStore entries with: algorithm, key size, block modes,
# security flags (user auth required, secure hardware), attestation info
```

### Biometric Bypass

```bash
frida -U -f com.target.app -l biometric-bypass.js

# Hooks: BiometricPrompt (onAuthenticationSucceeded/Failed),
#         FingerprintManagerCompat, androidx.biometric.BiometricPrompt,
#         KeyguardManager
# MASTG Ref: MASTG-TEST-0018, MASWE-0044
```

### Network Interceptor

```bash
frida -U -f com.target.app -l network-interceptor.js

# Hooks: OkHttp newCall/execute/enqueue, HttpURLConnection, Retrofit2
# Logs: method, URL, headers, status, body (first 500 chars), timing
# Configurable: filter by domain/host, detect sensitive data in transit
```

### Anti-Frida Bypass

```bash
frida -U -f com.target.app -l anti-frida-bypass.js

# Bypasses: /proc/self/maps scanning, port 27042/27043 detection,
#            frida-agent.so detection, thread name checks, strstr/memmem for "frida"
# Load FIRST before other scripts if app has anti-frida protection
```

### JWT Token Monitor

```bash
frida -U -f com.target.app -l jwt-token-monitor.js

# Detects: JWT patterns in SharedPreferences, Authorization headers,
#           URL parameters (access_token, id_token), cookies
# Decodes: JWT header + payload (base64), checks for "none" algorithm,
#           missing exp claim, tokens in URL params (never safe)
```

### FLAG-SECURE Bypass

```bash
frida -U -f com.target.app -l flag-secure-bypass.js

# Hooks: WindowManager.LayoutParams, LayoutInflater, WindowManagerImpl, Activity lifecycle
# Android: 10-16 (API 29-40)
# OWASP: MASTG-TEST-0048
```

### Network Security Bypass

```bash
frida -U -f com.target.app -l network-security-bypass.js

# Hooks: TrustManager, X509TrustManager, OkHttp3 CertificatePinner, NetworkSecurityPolicy
# Android: 7-16 (API 24-40)
# OWASP: MASTG-NET-003
```

### RASP Bypass

```bash
frida -U -f com.target.app -l rasp-bypass.js

# Bypasses: Root detection, debug check, emulator detection, Frida detection,
#           APK integrity validation, SafetyNet, Play Integrity
# Load first before other bypass scripts
```

### Packer Unpacker

```bash
frida -U -f com.target.app -l packer-unpacker.js

# Detects: Bangcle, Jiagu, 360, iJiami, AliProtect, Tencent, n玄武, libshell
# Extracts: Native libraries, DEX files, assets from protected APKs
```

### Native Hook

```bash
frida -U -f com.target.app -l native-hook.js

# Hooks: JNI functions, native library exports, custom C/C++ functions
# Usage: Configure target library and function patterns
```

### JNI Tracer

```bash
frida -U -f com.target.app -l jni-tracer.js

# Hooks: FindClass, GetMethodID, GetStaticMethodID, RegisterNatives,
#         NewStringUTF, FindNativesMethod
# Use for: Discovering native-Java bindings
```

### IPC Abuse Helper

```bash
frida -U -f com.target.app -l ipc-abuse-helper.js

# Passive: Logs exported components, deep links, providers
# Active: Optional query/insert/broadcast helpers for testing
```

### File Access Monitor

```bash
frida -U -f com.target.app -l android-file-access-monitor.js

# Hooks: FileInputStream/FileOutputStream, open/read/write native functions
# Configurable: Filter by path patterns, show hex preview
```

### Memory Layout Viewer

```bash
frida -U -f com.target.app -l mem-layout-viewer.js

# Shows: Memory regions, permissions (rwx), file mappings, heap chunks
# Use for: Rapid memory region identification
```

### ROP Gadget Finder

```bash
frida -U -f com.target.app -l rop-gadget-finder.js

# Finds: ROP gadgets in loaded native libraries
# Output: Gadget address, instruction, stack pivot candidates
```

### UAF Detector

```bash
frida -U -f com.target.app -l uaf-detector.js

# Monitors: malloc/free/realloc pairs, dangling pointers
# Use for: Detecting use-after-free vulnerabilities
```

### Native Heap Tracer

```bash
frida -U -f com.target.app -l native-heap-tracer.js

# Traces: Native heap allocations (malloc, calloc, realloc, free)
# Shows: Allocation size, source library, call stack
```

## Combining Scripts

```bash
# Traffic interception + intent monitoring + crypto logging
frida -U -f com.target.app \
  -l ssl-pinning-bypass.js \
  -l intent-logger.js \
  -l network-interceptor.js

# Full biometric + auth testing
frida -U -f com.target.app \
  -l anti-frida-bypass.js \
  -l biometric-bypass.js \
  -l jwt-token-monitor.js

# Complete storage + network audit
frida -U -f com.target.app \
  -l ssl-pinning-bypass.js \
  -l shared-prefs-dumper.js \
  -l crypto-intercept.js \
  -l network-interceptor.js

# Memory forensics
frida -U -f com.target.app \
  -l native-heap-tracer.js \
  -l mem-layout-viewer.js \
  -l uaf-detector.js
```

## Using with Objection

```bash
objection -g com.target.app explore

# Built-in commands
android sslpinning disable
android root disable
android hooking list classes
android hooking list class_methods com.target.ClassName
android hooking watch class_method com.target.Class.method
android keystore list
android webview get_javascript_interfaces
```

## Sources & Credits

### SSL Pinning Bypass
- **HTTP Toolkit** — https://github.com/httptoolkit/frida-interception-and-unpinning
- **akabe1** — https://codeshare.frida.re/@akabe1/frida-multiple-unpinning/
- **FriList** — https://github.com/rsenet/FriList

### Root Detection Bypass
- **FridaBypassKit** (okankurtuluss) — https://github.com/okankurtuluss/FridaBypassKit
- **apkunpacker** — https://github.com/apkunpacker/Root_Bypass

### Biometric Bypass
- **ax/android-fingerprint-bypass** — https://github.com/ax/android-fingerprint-bypass
- **WithSecureLABS** — https://github.com/WithSecureLABS/android-keystore-audit

### Network Interceptor
- **FriList** — https://github.com/rsenet/FriList/blob/main/01_Observer/Network/OkHttp/android-okhttp-logger.js

### Anti-Frida Bypass
- **Custom Implementation** — Comprehensive Frida detection bypass
- Covers: /proc/maps filtering, port scanning evasion, thread name masking

### RASP Bypass
- **Custom Implementation** — Runtime Application Self-Protection bypass
- Covers: RootBeer, SafetyNet, Play Integrity, APK integrity checks

### Packer Detection
- **Custom Implementation** — Common Chinese APK protector detection
- Based on: Known signatures for Bangcle, Jiagu, 360, iJiami

### Collections & Toolkits
- **FriList** — https://github.com/rsenet/FriList — 184 stars, Android security scripts
- **Objection** (SensePost) — https://github.com/sensepost/objection
- **Frida CodeShare** — https://codeshare.frida.re/
