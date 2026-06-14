# Flutter Application Security Analysis Guide

**Last Updated:** 2026-04-02

This guide covers security analysis techniques for Flutter/Dart mobile applications, including reverse engineering, dynamic instrumentation, and vulnerability detection.

---

## Table of Contents
1. [Flutter Architecture Overview](#1-flutter-architecture-overview)
2. [Static Analysis Techniques](#2-static-analysis-techniques)
3. [Reverse Engineering Flutter Apps](#3-reverse-engineering-flutter-apps)
4. [Dynamic Instrumentation](#4-dynamic-instrumentation)
5. [Flutter-Specific Vulnerabilities](#5-flutter-specific-vulnerabilities)
6. [Platform Channel Security](#6-platform-channel-security)
7. [Code Obfuscation Analysis](#7-code-obfuscation-analysis)
8. [Common Vulnerability Patterns](#8-common-vulnerability-patterns)

---

## 1. Flutter Architecture Overview

### Flutter Engine Architecture

Flutter uses a unique architecture that affects security analysis:

| Component | Purpose | Security Implications |
|-----------|---------|------------------------|
| Dart VM | Executes Dart code | Compiled to native ARM/x86, harder to reverse |
| Skia Graphics Engine | Renders UI | Not typically security-relevant |
| Flutter Engine | Bridges Dart and platform | Native code (C++) can contain security logic |
| Platform Channels | Dart ↔ Native communication | Sensitive data may pass through |
| Dart Snapshot | Compiled Dart bytecode | Contains app logic and potential secrets |

### Dart Snapshot Files

```
lib/
├── app_flutter/
│   ├── kernel_snapshot.bin     # Compiled Dart code (AOT)
│   ├── vm_snapshot_data        # VM metadata
│   └── isolate_snapshot_data   # Isolate metadata
├── arm64-v8a/
│   ├── libapp.so             # Flutter app code (ARM64)
│   └── libflutter.so         # Flutter engine
└── armeabi-v7a/
    ├── libapp.so             # Flutter app code (ARMv7)
    └── libflutter.so         # Flutter engine
```

### Analysis Challenges

1. **AOT Compilation**: Dart code compiled to native ARM/x86
2. **No DEX Files**: Traditional Android reverse engineering tools (jadx, apktool) don't work
3. **Snapshots**: Binary format requiring specialized tools
4. **Obfuscation**: Names may be minified even without ProGuard

---

## 2. Static Analysis Techniques

### Extracting Dart Snapshots

#### Cross-Platform Commands

```bash
# Extract APK
unzip target.apk -d extracted/

# Find Dart snapshot files
find extracted/ -name "*.snapshot.bin" -o -name "vm_snapshot_data" -o -name "isolate_snapshot_data"

# Find libapp.so (contains compiled Dart code)
find extracted/ -name "libapp.so"
```

#### Analyzing libapp.so

```bash
# macOS/Linux
strings lib/arm64-v8a/libapp.so | grep -iE "http|https|api|key|token|password|secret"

# Extract URLs
strings lib/arm64-v8a/libapp.so | grep -E "https?://[a-zA-Z0-9]"

# Find Firebase URLs
strings lib/arm64-v8a/libapp.so | grep -E "firebaseio\.com|firebase\.app"

# Extract potential secrets
strings -n 20 lib/arm64-v8a/libapp.so | grep -E "^[A-Za-z0-9+/=]{30,}$"
```

#### Windows PowerShell Equivalents

```powershell
# Extract strings from libapp.so
Select-String -Path "lib\arm64-v8a\libapp.so" -Pattern "http|https|api|key|token" -AllMatches

# Find URLs
Select-String -Path "lib\arm64-v8a\libapp.so" -Pattern "https?://" -AllMatches
```

### Analyzing Flutter Assets

```bash
# List all Flutter assets
find extracted/assets/flutter_assets/ -type f

# Check for configuration files
find extracted/assets/flutter_assets/ -name "*.json" -o -name "*.yaml"

# Look for embedded configuration
cat extracted/assets/flutter_assets/AssetManifest.json
cat extracted/assets/flutter_assets/FontManifest.json
```

### Finding Platform Channels

Platform channels are the interface between Dart and native code:

```bash
# Search for MethodChannel usage
find extracted/ -name "*.dart" -o -name "*.so" | xargs strings | grep -iE "MethodChannel|EventChannel|BasicMessageChannel"

# Find specific channel names
strings lib/arm64-v8a/libapp.so | grep -iE "com\.[a-z]+\.[a-z]+"

# Common Flutter channel patterns
strings lib/arm64-v8a/libapp.so | grep -E "flutter/platform|flutter/native"
```

### OWASP Mobile Top 10 Mappings

| OWASP Category | Flutter-Specific Check |
|----------------|----------------------|
| M1: Improper Credential Usage | Search libapp.so for hardcoded secrets |
| M5: Insecure Communication | Check for cleartext URLs, missing SSL pinning |
| M7: Insufficient Binary Protections | Verify code obfuscation, check for debug builds |
| M9: Insecure Data Storage | Analyze Flutter plugin usage for storage |
| M10: Insufficient Cryptography | Check crypto operations in native code |

---

## 3. Reverse Engineering Flutter Apps

### reFlutter (Primary Tool)

#### Installation

```bash
# Install via pip
pip install reflutter

# Or clone and install
git clone https://github.com/Impact-I/reFlutter
cd reFlutter
pip install .
```

#### Basic Usage

```bash
# Analyze APK and patch it
reflutter target.apk

# Output structure:
# target.apk -> target_reflutter.apk (patched with Frida instrumentation)
# patched_flutter.so (replaced Flutter engine)
# patches/ (applied patches)
```

#### Extracting Dart Source

```bash
# reFlutter includes snapshot extraction
# Note: No --extract-snapshots flag exists. Snapshot extraction is automatic.
reflutter target.apk

# This extracts:
# - kernel_snapshot.bin
# - vm_snapshot_data
# - isolate_snapshot_data
```

### blutter (Recommended for Modern Analysis)

**blutter** — Essential tool for Flutter reverse engineering. Extracts class info, functions, and strings from libapp.so.

```bash
# Install blutter (NOT on PyPI — must install from GitHub)
git clone https://github.com/worawit/blutter
cd blutter
pip install -r requirements.txt

# Analyze libapp.so
python blutter.py lib/arm64-v8a/libapp.so

# Output:
# - Class information
# - Function signatures
# - String table
# - Symbol table
```

### Manual Snapshot Analysis

#### Using Ghidra

```bash
# Load libapp.so into Ghidra
ghidraRun

# Analyze ARM64 code
# Look for:
# - Dart runtime functions
# - String references
# - Crypto operations
# - Network calls
```

#### Using IDA Pro

```bash
# Load libapp.so
# Set processor to ARM:ARMv7-A (32-bit) or ARM64 (64-bit)

# Analyze:
# - Imports from libflutter.so
# - String references
# - Function signatures
```

### Flutter Inspector (Runtime Analysis)

```bash
# Enable Flutter DevTools on debug builds
flutter pub global activate devtools

# Connect to running app
flutter pub global run devtools

# Inspect widget tree
# View performance metrics
# Analyze network requests
```

---

## 4. Dynamic Instrumentation

### Frida Scripts for Flutter

#### Hooking Dart Runtime

```javascript
// Hook Flutter engine initialization
Java.perform(function() {
    var FlutterMain = Java.use("io.flutter.embedding.engine.FlutterMain");

    FlutterMain.startInitialization.implementation = function(context) {
        console.log("[*] FlutterMain.startInitialization called");
        return this.startInitialization(context);
    };
});
```

#### Intercepting MethodChannel Calls

```javascript
// Hook MethodChannel.invokeMethod
Java.perform(function() {
    var MethodChannel = Java.use("io.flutter.plugin.common.MethodChannel");

    MethodChannel.invokeMethod.overload('java.lang.String', 'java.lang.Object').implementation = function(method, arguments) {
        console.log("[MethodChannel] Method: " + method);
        console.log("[MethodChannel] Arguments: " + JSON.stringify(arguments));
        return this.invokeMethod(method, arguments);
    };
});
```

#### Monitoring Network Requests

```javascript
// Hook HTTP requests in Flutter
// WARNING: PlatformPlugin handles system UI, NOT networking
// Flutter uses dart:io HttpClient via BoringSSL (native)
// Java-level SSL hooks do NOT intercept Flutter traffic

Java.perform(function() {
    var IOClient = Java.use("io.flutter.plugin.platform.PlatformPlugin");

    // PlatformPlugin handles system UI settings (status bar, navigation)
    // It does NOT handle network requests
    // Flutter's networking is implemented in native code via BoringSSL

    console.log("[!] Flutter uses dart:io HttpClient via BoringSSL (native)");
    console.log("[!] Java-level SSL hooks (X509TrustManager) will NOT intercept Flutter traffic");
    console.log("[!] Use BoringSSL native hooks or Frida's Interceptor for SSL_read/SSL_write");
});
```

#### Extracting SharedPreferences

```javascript
// Get SharedPreferences used by Flutter
Java.perform(function() {
    var Context = Java.use("android.content.Context");

    Java.scheduleOnMainThread(function() {
        var currentApplication = Java.use("android.app.ActivityThread").currentApplication();
        var prefs = currentApplication.getSharedPreferences("FlutterSharedPreferences", 0);

        var all = prefs.getAll();
        console.log("[*] Flutter SharedPreferences:");
        all.forEach(function(key, value) {
            console.log("    " + key + " = " + value.toString());
        });
    });
});
```

### Using reFlutter Patched APK

```bash
# Install patched APK
adb install target_reflutter.apk

# Start with Frida server
adb shell
su
cd /data/local/tmp
./frida-server &

# Inject Frida script
frida -U -f com.example.app -l hook_methodchannel.js

# Or attach to running app
frida -U "Example App" -l hook_methodchannel.js
```

### Flutter DevTools Integration

```bash
# Enable DevTools in release build (requires configuration)
# In pubspec.yaml:
flutter:
  uses-material-design: true
  devtools:
    enabled: true

# Connect to app
flutter attach
flutter pub global run devtools
```

---

## 5. Flutter-Specific Vulnerabilities

### Hardcoded Secrets in Dart Code

#### Detection

```bash
# Search libapp.so for common secret patterns
strings lib/arm64-v8a/libapp.so | grep -iE "api.*key|secret|token|password|private.*key"

# Search for AWS keys
strings lib/arm64-v8a/libapp.so | grep -E "AKIA[0-9A-Z]{16}"

# Search for Firebase keys
strings lib/arm64-v8a/libapp.so | grep -E "AIza[A-Za-z0-9_-]{35}"
```

#### Common Locations

- API keys in configuration
- Firebase project IDs
- OAuth tokens
- Database credentials
- Encryption keys

### Insecure Platform Channel Communication

#### Vulnerable Pattern

```dart
// VULNERABLE: No validation of channel names
void main() {
  const platform = MethodChannel('com.example.app/insecure');
  platform.invokeMethod('sensitiveOperation', {'data': 'userInput'});
}
```

#### Secure Pattern

```dart
// SECURE: Validate channel names and data
void main() {
  final platform = MethodChannel('com.example.app/secure');

  platform.setMethodCallHandler((call) async {
    if (call.method == 'sensitiveOperation') {
      final data = call.arguments as Map<String, dynamic>;

      // Validate data structure
      if (!_isValidData(data)) {
        throw PlatformException(code: 'INVALID_ARGUMENT');
      }

      // Perform secure operation
      return await _performOperation(data);
    }
  });
}
```

### WebView Security in Flutter

#### Detection

```bash
# Find WebView plugin usage
find extracted/ -name "*.dart" | xargs grep -l "WebViewPlugin\|InAppWebView"

# Check for JavaScript interface exposure
find extracted/ -name "*.dart" | xargs grep -l "javascriptChannels\|addJavaScriptHandler"
```

#### Vulnerable Patterns

```dart
// VULNERABLE: Load untrusted URLs
WebView(
  initialUrl: 'http://example.com',  // Cleartext HTTP
  javascriptMode: JavascriptMode.unrestricted,
)

// VULNERABLE: Expose sensitive methods to JavaScript
WebView(
  javascriptChannels: JavascriptChannel({
    'sensitiveOperation',
    onMessageReceived: (JavascriptMessage message) {
      _performSensitiveAction(message.message);  // No validation
    },
  }),
)
```

### Certificate Pinning Bypass

#### Detection

```bash
# Search for certificate pinning implementations
strings lib/arm64-v8a/libapp.so | grep -iE "pinning|certificate|ssl|tls"

# Check for custom TrustManager
strings lib/arm64-v8a/libapp.so | grep -iE "trustmanager|x509"
```

#### Bypass with Frida

```javascript
// Bypass certificate pinning in Flutter apps
// IMPORTANT: Flutter uses Dart's HTTP client via BoringSSL (native), not Java's

// X509TrustManager hook DOES NOT work for Flutter apps
// Flutter networking is implemented in native code (BoringSSL)
// Java-level hooks cannot intercept Flutter network traffic

// If app uses platform channel for networking (rare):
Java.perform(function() {
    var X509TrustManager = Java.use("javax.net.ssl.X509TrustManager");

    X509TrustManager.checkServerTrusted.implementation = function(chain, authType) {
        console.log("[+] Bypassing certificate check (Java only)");
        return;
    };
});

// If using Flutter's HTTP client (common):
// Hook BoringSSL native functions instead
var SSL_CTX_set_custom_verify = Module.findExportByName("libflutter.so", "SSL_CTX_set_custom_verify");
if (SSL_CTX_set_custom_verify) {
    Interceptor.attach(SSL_CTX_set_custom_verify, {
        onEnter: function(args) {
            console.log("[+] Flutter SSL custom verification called");
            // Bypass custom verification
        }
    });
}

// Alternatively hook SSL_read/SSL_write to intercept encrypted traffic
var ssl_read = Module.findExportByName("libflutter.so", "SSL_read");
var ssl_write = Module.findExportByName("libflutter.so", "SSL_write");
```

---

## 6. Platform Channel Security

### Understanding Platform Channels

Platform channels are the bridge between Dart and native code:

```
Dart Code (Flutter) ──→ Platform Channel ──→ Native Code (Java/Kotlin/Swift/Obj-C)
```

### Security Considerations

| Issue | Risk | Detection |
|--------|------|-----------|
| Unvalidated input | SQL injection, command injection | Check channel handlers |
| Sensitive data in channels | Data leakage | Monitor channel traffic |
| No authentication | Unauthorized access | Check channel permissions |
| Cleartext communication | MITM | Intercept network traffic |

### Analyzing Channel Implementation

```bash
# Find all platform channels
find extracted/ -name "*.dart" | xargs grep -h "MethodChannel\|EventChannel\|BasicMessageChannel" | sort -u

# Find channel names
find extracted/ -name "*.dart" | xargs grep -oE "MethodChannel\(['\"][^'\"]+['\"]" | sort -u

# Find plugin registrations
find extracted/ -name "*.dart" | xargs grep -h "registerWith\|registerPlugin"
```

### Hooking Platform Channels with Frida

```javascript
// Hook all MethodChannel calls
Java.perform(function() {
    var MethodChannel = Java.use("io.flutter.plugin.common.MethodChannel");

    // Track all channel invocations
    MethodChannel.invokeMethod.overload('java.lang.String', 'java.lang.Object').implementation = function(method, args) {
        console.log("[*] MethodChannel invoked:");
        console.log("    Channel: " + this.getName());
        console.log("    Method: " + method);
        console.log("    Arguments: " + JSON.stringify(args));

        // Log sensitive data
        if (method.toLowerCase().indexOf('auth') !== -1 ||
            method.toLowerCase().indexOf('password') !== -1 ||
            method.toLowerCase().indexOf('token') !== -1) {
            console.log("[!] Sensitive method called!");
        }

        return this.invokeMethod(method, args);
    };
});
```

### Flutter Plugins Security

#### Common Security-Sensitive Plugins

| Plugin | Security Concerns |
|---------|------------------|
| `shared_preferences` | Plaintext storage |
| `flutter_secure_storage` | KeyStore usage, encryption |
| `local_auth` | Biometric bypass, UI-only checks |
| `http` | SSL pinning, certificate validation |
| `webview_flutter` | XSS, file access |
| `flutter_local_notifications` | Notification hijacking |

#### Analyzing Plugin Usage

```bash
# List all Flutter plugins
grep -r "dependencies:" extracted/pubspec.yaml 2>/dev/null

# Find plugin source code
find extracted/ -path "*/.dart_tool/*" -prune -o -name "*.dart" -print | xargs grep -l "plugin\|package:"

# Check for vulnerable plugin versions
grep -A1 "dependencies:" extracted/pubspec.yaml | grep -E "http|dio|flutter_secure_storage"
```

---

## 7. Code Obfuscation Analysis

### Flutter Obfuscation Flags

#### Without Obfuscation (Debug Builds)

```dart
// Clear method names
void performSensitiveOperation(String userToken) {
  // Business logic here
}
```

#### With Obfuscation (Release Builds)

```yaml
# pubspec.yaml
flutter:
  build-name: 1.0.0
  build-number: 1

# Build with obfuscation
flutter build apk --obfuscate --split-debug-info=./debug-info
```

```bash
# Analyze obfuscated libapp.so
strings lib/arm64-v8a/libapp.so | grep -iE "performSensitiveOperation"  # No results
```

### Detecting Obfuscation

```bash
# Check if method names are readable
strings lib/arm64-v8a/libapp.so | grep -E "void.*\(|function.*\(" | head -20

# Compare with expected patterns
# If mostly single letters or random strings → Obfuscated
# If readable names → Not obfuscated

# Check for mapping files
find extracted/ -name "obfuscate.map" -o -name "R.mapping.txt"
```

### Analyzing Obfuscated Code

#### Using Mapping Files

```bash
# If mapping file exists
cat obfuscate.map

# Format:
# com.example.app.SensitiveOperation -> a.b
# void performOperation -> a
```

#### Ghidra Analysis of Obfuscated Code

```python
# Ghidra Python script to rename functions
# script: rename_flutter_functions.py
# Run via: Scripting → Script Manager → Run

from ghidra.program.model.listing import FunctionManager
from ghidra.program.model.symbol import SourceType

# Get current program
currentProgram = getCurrentProgram()

# Read mapping file
mapping = {}
with open('obfuscate.map', 'r') as f:
    for line in f:
        original, obfuscated = line.strip().split(' -> ')
        mapping[obfuscated] = original

# Rename functions
functionManager = currentProgram.getFunctionManager()
for func in functionManager.getFunctions(True):
    name = func.getName()
    if name in mapping:
        func.setName(mapping[name], SourceType.USER_DEFINED)
```

---

## 8. Common Vulnerability Patterns

### Insecure Data Storage

#### SharedPreferences (Insecure)

```dart
// VULNERABLE: Storing sensitive data in SharedPreferences
final prefs = await SharedPreferences.getInstance();
prefs.setString('api_token', userToken);  // Plaintext storage

// Secure alternative
final storage = new FlutterSecureStorage();
await storage.write(key: 'api_token', value: userToken);
```

#### Detection

```bash
# Find SharedPreferences usage
find extracted/ -name "*.dart" | xargs grep -l "SharedPreferences\|shared_preferences"

# Find sensitive data storage
find extracted/ -name "*.dart" | xargs grep -iE "token.*=|password.*=|secret.*="
```

### Insecure Cryptography

#### Weak Algorithms

```dart
// VULNERABLE: Using weak encryption
import 'dart:convert';
import 'package:crypto/crypto.dart';

final key = 'hardcodedKey';  // Weak key
final encrypted = encrypt(data, key);

// SECURE: Use strong encryption with proper key derivation
import 'package:encrypt/encrypt.dart';

final key = Key.fromSecureRandom(32);  // 256-bit key
final iv = IV.fromSecureRandom(16);
final encryptor = Encrypter(AES(key));
```

#### Detection

```bash
# Find crypto operations in native code
strings lib/arm64-v8a/libapp.so | grep -iE "AES|RSA|DES|MD5|SHA1|encrypt|decrypt"

# Check for weak algorithms
strings lib/arm64-v8a/libapp.so | grep -iE "DES|MD5|SHA1|ECB"
```

### Hardcoded URLs and Endpoints

```bash
# Find all URLs
strings lib/arm64-v8a/libapp.so | grep -E "https?://"

# Check for cleartext HTTP
strings lib/arm64-v8a/libapp.so | grep -P "http://(?!localhost)"

# Find API endpoints
strings lib/arm64-v8a/libapp.so | grep -E "(api|endpoint|service)"
```

### Missing Certificate Pinning

#### Detection

```bash
# Search for SSL/TLS configurations
strings lib/arm64-v8a/libapp.so | grep -iE "certificate|pinning|ssl|tls"

# Check for custom TrustManager
strings lib/arm64-v8a/libapp.so | grep -iE "trustmanager|x509"

# Verify if SSL pinning is implemented
strings lib/arm64-v8a/libapp.so | grep -iE "pinning|certificatepinner"
```

---

## Quick Reference

### Essential Commands

```bash
# Extract APK
unzip target.apk -d extracted/

# Find Dart snapshot files
find extracted/ -name "libapp.so"

# Extract strings from libapp.so
strings lib/arm64-v8a/libapp.so | grep -iE "api|key|token|password"

# Run reFlutter
reflutter target.apk

# Find Flutter plugins
grep -r "dependencies:" extracted/pubspec.yaml

# Find platform channels
find extracted/ -name "*.dart" | xargs grep -h "MethodChannel"

# Hook with Frida
frida -U -f com.example.app -l hook_flutter.js
```

### Tool Matrix

| Task | Tool | Platform |
|------|------|----------|
| Reverse engineering | reFlutter, **blutter** ✅ | Cross-platform |
| Static analysis | strings, Ghidra, IDA Pro | Cross-platform |
| Dynamic instrumentation | Frida | Cross-platform |
| Network analysis | mitmproxy, Burp Suite | Cross-platform |
| Snapshot extraction | reFlutter | Cross-platform |

---

## References

- reFlutter: https://github.com/Impact-I/reFlutter
- blutter: https://github.com/worawit/blutter (recommended)
- Flutter Security: https://github.com/flutter/flutter/wiki/Security
- OWASP Mobile Top 10: https://owasp.org/www-project-mobile-top-10/
- Flutter Documentation: https://flutter.dev/docs
- Ghidra: https://ghidra-sre.org/

---

**Maintainer:** android-apk-audit skill
**Related Files:** native-analysis.md, flutter-blutter-analysis.md
**Category:** Reference Document
**Last Updated:** 2026-04-02
