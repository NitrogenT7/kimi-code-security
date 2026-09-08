# React Native Application Security Analysis Guide

**Last Updated:** 2025

This guide covers security analysis techniques for React Native mobile applications, including reverse engineering of JavaScript bundles, dynamic instrumentation, and vulnerability detection.

---

## Table of Contents
1. [React Native Architecture Overview](#1-react-native-architecture-overview)
2. [Static Analysis Techniques](#2-static-analysis-techniques)
3. [Reverse Engineering React Native Apps](#3-reverse-engineering-react-native-apps)
4. [Hermes Bytecode Analysis](#4-hermes-bytecode-analysis)
5. [Dynamic Instrumentation](#5-dynamic-instrumentation)
6. [React Native-Specific Vulnerabilities](#6-react-native-specific-vulnerabilities)
7. [Native Module Security](#7-native-module-security)
8. [Common Vulnerability Patterns](#8-common-vulnerability-patterns)

---

## 1. React Native Architecture Overview

### React Native Bridge Architecture

React Native uses a JavaScript bridge to communicate with native code:

```
JavaScript (React/JSX)
    ↓
JavaScript Bundle (index.android.bundle)
    ↓
Hermes Engine (JavaScript VM)
    ↓
Bridge (JSC/V8)
    ↓
Native Code (Java/Kotlin, Obj-C/Swift)
```

### Key Components

| Component | Purpose | Security Implications |
|-----------|---------|------------------------|
| JavaScript Bundle | Contains app logic | Can be decompiled, may contain secrets |
| Hermes Engine | JavaScript VM | Bytecode can be disassembled/decompiled |
| Native Modules | Platform-specific code | May implement security-critical operations |
| React Native Bridge | JS ↔ Native communication | Sensitive data passes through bridge |
| AsyncStorage/SecureStorage | Local data storage | Insecure by default |
| Metro Bundler | Development server | Not present in production builds |

### Bundle File Locations

```
assets/
├── index.android.bundle          # Main JavaScript bundle
├── index.android.bundle.map      # Source map (if present)
└── index.android.bundle.meta     # Metadata

lib/
├── armeabi-v7a/
│   ├── libhermes.so            # Hermes engine (optional)
│   ├── libjsc.so               # JavaScriptCore (optional)
│   └── libreactnativejni.so    # JNI bridge
└── arm64-v8a/
    ├── libhermes.so
    ├── libjsc.so
    └── libreactnativejni.so
```

### Analysis Challenges

1. **JavaScript Bundle**: May be minified and code-split
2. **Hermes Bytecode**: Requires specialized tools to analyze
3. **Native Modules**: Security logic may be in Java/Kotlin or Obj-C
4. **Bridge Communication**: Hard to intercept without instrumentation

---

## 2. Static Analysis Techniques

### Extracting JavaScript Bundles

#### Cross-Platform Commands

```bash
# Extract APK
unzip target.apk -d extracted/

# Find JavaScript bundles
find extracted/ -name "*.bundle" -o -name "index.js"

# Copy bundle for analysis
cp extracted/assets/index.android.bundle index.bundle
```

#### Analyzing Bundle Content

```bash
# Check if bundle uses Hermes (binary) or plain JavaScript
file extracted/assets/index.android.bundle

# Output:
# JavaScript bundle  → Plain text (can read directly)
# data              → Hermes bytecode (binary, needs decompilation)

# Extract strings from bundle
strings extracted/assets/index.android.bundle | sort -u

# Search for sensitive data
strings extracted/assets/index.android.bundle | grep -iE "api.*key|secret|token|password|private.*key"
```

#### Windows PowerShell Equivalents

```powershell
# Extract APK
Expand-Archive -Path target.apk -DestinationPath extracted

# Find bundle files
Get-ChildItem -Path extracted -Recurse -Filter "*.bundle"

# Extract strings
Select-String -Path extracted\assets\index.android.bundle -Pattern "api|key|secret|token" -AllMatches
```

### Analyzing Source Maps (If Available)

```bash
# Find source map files
find extracted/ -name "*.map" -o -name "index.bundle.map"

# Analyze source map
cat extracted/assets/index.android.bundle.map

# Source maps contain:
# - Original source file names
# - Source line/column mappings
# - Original function names
```

### Finding React Native Configuration

```bash
# Find package.json
find extracted/ -name "package.json"

# Extract dependencies
cat extracted/assets/package.json | grep -A50 '"dependencies"'

# Find React Native version
cat extracted/assets/package.json | grep -oE '"react-native": "[0-9.]+"'
```

### OWASP Mobile Top 10 Mappings

| OWASP Category | React Native-Specific Check |
|----------------|-----------------------------|
| M1: Improper Credential Usage | Search bundle for hardcoded secrets |
| M5: Insecure Communication | Check for cleartext URLs, missing SSL pinning |
| M7: Insufficient Binary Protections | Verify bundle minification, code splitting |
| M9: Insecure Data Storage | Analyze AsyncStorage/SecureStorage usage |
| M10: Insufficient Cryptography | Check crypto operations in bundle/native code |

---

## 3. Reverse Engineering React Native Apps

### Determining Bundle Type

```bash
# Check if bundle is Hermes bytecode or plain JavaScript
file index.android.bundle

# Hermes bytecode output:
# index.android.bundle: data

# Plain JavaScript output:
# index.android.bundle: ASCII text, with very long lines

# Or check for Hermes magic bytes
xxd -l 4 index.android.bundle

# Hermes magic: 0x6C 1B C4 D4 (first 4 bytes)
```

### Dealing with Plain JavaScript Bundles

#### Reading Minified Code

```bash
# Extract and read bundle
cat index.android.bundle | head -100

# Minified example:
// !function(e){var t={};function n(r){if(t[r])return t[r].exports...

# Pretty-print with Node.js
node -e "console.log(require('fs').readFileSync('index.android.bundle','utf8'))" | js-beautify > pretty.js
```

#### Deobfuscation Techniques

```bash
# Extract variable names (if not fully minified)
strings index.android.bundle | grep -oE "var [a-zA-Z0-9_]+" | sort -u

# Search for function names
strings index.android.bundle | grep -oE "function [a-zA-Z0-9_]+" | sort -u

# Search for class/object definitions
strings index.android.bundle | grep -oE "class [A-Z][a-zA-Z0-9_]+" | sort -u
```

### Using react-native-decompiler

```bash
# Install react-native-decompiler
npm install -g react-native-decompiler

# Decompile bundle
react-native-decompiler index.android.bundle -o decompiled/

# Output structure:
# decompiled/
# ├── components/     # React components
# ├── screens/        # Screen components
# ├── utils/          # Utility functions
# ├── api/            # API calls
# └── config/         # Configuration
```

### Analyzing Native Code (Java/Kotlin)

```bash
# Decompile APK to Java
jadx -d jadx_output target.apk

# Find React Native native modules
find jadx_output -name "*.java" | xargs grep -l "ReactContextBaseJavaModule\|NativeModule"

# Analyze React Native bridge code
find jadx_output -name "*.java" | xargs grep -l "CatalystInstance\|JSBundleLoader"
```

---

## 4. Hermes Bytecode Analysis

### Hermes Overview

Hermes is an optimized JavaScript engine for React Native. It compiles JavaScript to bytecode:

```
JavaScript Source → Hermes Compiler → Hermes Bytecode (.bundle file)
```

### Hermes-Dec Tool

#### Installation

```bash
# Install Hermes-Dec
pip install hermes-dec

# Or clone and build
git clone https://github.com/P1sec/hermes-dec
cd hermes-dec
pip install -r requirements.txt
pip install .
```

#### Basic Usage

```bash
# Decompile Hermes bytecode
hermes-dec decompile index.android.bundle -o decompiled_hermes/
```

#### Basic Usage

```bash
# Decompile Hermes bytecode
hermes-dec index.android.bundle -o decompiled_hermes/

# Output structure:
# decompiled_hermes/
# ├── index.js           # Decompiled JavaScript
# ├── strings.json       # String table
# └── functions.json    # Function list
```

#### Advanced Options

```bash
# Output with function names
hermes-dec index.android.bundle -o decompiled/ --with-names

# Generate AST
hermes-dec index.android.bundle --ast > ast.json

# Disassemble to bytecode
hermes-dec index.android.bundle --disasm > disasm.txt
```

### Manual Hermes Analysis

#### Using Ghidra

```bash
# Load libhermes.so into Ghidra
ghidraRun

# Set processor to ARM64
# Analyze:
# - String references
# - Function imports/exports
# - Hermes VM calls

# Look for:
# - String decryption functions
# - Native bridge methods
# - Security checks
```

#### Using radare2/rizin

```bash
# Analyze libhermes.so
r2 libhermes.so

# List functions
[0x00000000]> afl

# Disassemble specific function
[0x00000000]> pdf @ sym.hermes_execute

# Search for strings
[0x00000000]> iz~api|key|token
```

---

## 5. Dynamic Instrumentation

### Frida Scripts for React Native

#### Hooking React Native Bridge

```javascript
// Hook React Native bridge calls
Java.perform(function() {
    var ReactContextBaseJavaModule = Java.use("com.facebook.react.bridge.ReactContextBaseJavaModule");

    ReactContextBaseJavaModule.getName.implementation = function() {
        var name = this.getName();
        console.log("[*] React Native Module: " + name);
        return name;
    };
});
```

#### Monitoring AsyncStorage

```javascript
// Hook AsyncStorage operations
Java.perform(function() {
    var AsyncStorage = Java.use("com.facebook.react.modules.storage.AsyncStorageModule");

    AsyncStorage.multiGet.implementation = function(keys, callback) {
        console.log("[*] AsyncStorage multiGet:");
        console.log("    Keys: " + keys);
        return this.multiGet(keys, callback);
    };

    AsyncStorage.multiSet.implementation = function(keyValuePairs, callback) {
        console.log("[*] AsyncStorage multiSet:");
        console.log("    Data: " + JSON.stringify(keyValuePairs));
        return this.multiSet(keyValuePairs, callback);
    };
});
```

#### Intercepting Native Module Calls

```javascript
// Hook specific native module
Java.perform(function() {
    var NativeModule = Java.use("com.example.app.NativeModule");

    NativeModule.sensitiveOperation.implementation = function(input) {
        console.log("[*] NativeModule.sensitiveOperation:");
        console.log("    Input: " + input);
        var result = this.sensitiveOperation(input);
        console.log("    Result: " + result);
        return result;
    };
});
```

#### Monitoring Network Requests

```javascript
// Hook networking (if using native HTTP client)
Java.perform(function() {
    var OkHttpClient = Java.use("okhttp3.OkHttpClient");

    OkHttpClient.newCall.implementation = function(request) {
        console.log("[*] HTTP Request:");
        console.log("    URL: " + request.url().toString());
        console.log("    Method: " + request.method());
        return this.newCall(request);
    };
});
```

### Using Hermes Debugger

```bash
# Enable Hermes debugger in development builds
# In app configuration:
// index.js
if (__DEV__) {
  import('./ReactotronConfig');
}

# Attach Chrome DevTools
# 1. Enable "Debug JS Remotely" from app menu
# 2. Open chrome://inspect in Chrome
# 3. Select the app target
```

### React Native DevTools

```bash
# Install React Native DevTools
npm install -g react-devtools

# Connect to app
# 1. Run app in debug mode
# 2. Shake device or press Cmd+M
# 3. Select "Debug"
# 4. Run:
react-devtools

# Or use standalone:
npx react-devtools
```

---

## 6. React Native-Specific Vulnerabilities

### Hardcoded Secrets in Bundle

#### Detection

```bash
# Search for API keys
strings index.android.bundle | grep -iE "api.*key|apikey|apiclient|client_secret"

# Search for Firebase keys
strings index.android.bundle | grep -E "AIza[A-Za-z0-9_-]{35}"

# Search for AWS keys
strings index.android.bundle | grep -E "AKIA[0-9A-Z]{16}"

# Search for OAuth tokens
strings index.android.bundle | grep -iE "oauth.*token|access.*token|bearer.*token"
```

#### Common Locations

- Configuration files
- Environment variables (if not properly excluded)
- API client initialization
- Third-party SDK initialization

### Insecure AsyncStorage Usage

#### Vulnerable Pattern

```javascript
// VULNERABLE: Storing sensitive data in AsyncStorage
import AsyncStorage from '@react-native-async-storage/async-storage';

// Storing token (plaintext)
await AsyncStorage.setItem('authToken', userToken);

// Storing password (never do this!)
await AsyncStorage.setItem('password', userPassword);
```

#### Secure Alternative

```javascript
// SECURE: Using React Native Secure Storage
import { SecureStorage } from 'react-native-secure-storage';

const secureStorage = new SecureStorage();

await secureStorage.setItem('authToken', userToken);
await secureStorage.setItem('userPassword', userPassword);
```

#### Detection

```bash
# Find AsyncStorage usage
strings index.android.bundle | grep -iE "asyncstorage|AsyncStorage"

# Find sensitive data storage
strings index.android.bundle | grep -iE "setItem.*token|setItem.*password|setItem.*secret"
```

### WebView Security in React Native

#### Detection

```bash
# Find WebView usage
strings index.android.bundle | grep -iE "webview|WebView"

# Find react-native-webview
strings index.android.bundle | grep -iE "react-native-webview|@react-native-community/webview"
```

#### Vulnerable Patterns

```javascript
// VULNERABLE: Loading untrusted URLs
import { WebView } from 'react-native-webview';

<WebView
  source={{ uri: 'http://example.com' }}  // Cleartext HTTP
  javaScriptEnabled={true}
  injectedJavaScript={userControlledJS}
/>

// VULNERABLE: Exposing sensitive methods
import { WebView } from 'react-native-webview';

<WebView
  source={{ uri: 'https://example.com' }}
  injectedJavaScript={`
    window.sendMessage = (data) => {
      window.ReactNativeWebView.postMessage(data);
    };
  `}
/>
```

### Deep Link Hijacking

#### Detection

```bash
# Find deep link handling
strings index.android.bundle | grep -iE "linking.*get\|linking.*open|openURL"

# Find custom URL schemes
strings index.android.bundle | grep -E "^[a-z0-9]+://"
```

#### Vulnerable Pattern

```javascript
// VULNERABLE: No validation of deep link URLs
import { Linking } from 'react-native';

Linking.openURL(intent.data);  // No validation, can load malicious content
```

#### Secure Pattern

```javascript
// SECURE: Validate deep link URLs
import { Linking, Platform } from 'react-native';

const handleDeepLink = async (url) => {
  // Validate URL scheme
  if (!url.startsWith('https://') && !url.startsWith('myapp://')) {
    console.warn('Invalid URL scheme');
    return;
  }

  // Validate domain
  const urlObj = new URL(url);
  const allowedDomains = ['example.com', 'trusted-domain.com'];
  if (!allowedDomains.includes(urlObj.hostname)) {
    console.warn('Invalid domain');
    return;
  }

  // Open validated URL
  await Linking.openURL(url);
};
```

---

## 7. Native Module Security

### Understanding Native Modules

Native modules bridge React Native to platform-specific code:

```
JavaScript (React Native)
    ↓
Native Module (Java/Kotlin/Obj-C/Swift)
    ↓
Platform API (Android)
```

### Security Considerations

| Issue | Risk | Detection |
|--------|------|-----------|
| Unvalidated input | SQL injection, command injection | Analyze native module code |
| Sensitive data handling | Data leakage | Monitor module calls with Frida |
| Hardcoded secrets | Credential exposure | Search native code strings |
| Missing permission checks | Unauthorized access | Check AndroidManifest.xml |
| Weak cryptography | Weak encryption | Analyze crypto implementations |

### Finding Native Modules

```bash
# Find Java native modules
find jadx_output -name "*.java" | xargs grep -l "@ReactModule\|extends ReactContextBaseJavaModule"

# Find native module packages
find jadx_output -name "*.java" | xargs grep -h "package.*\.modules\|NativeModule"

# List all exported modules
grep -r "NativeModule" jadx_output/ | grep -oE "class [A-Z][a-zA-Z0-9_]+" | sort -u
```

### Analyzing Native Module Code

```bash
# Find sensitive operations
find jadx_output -name "*.java" | xargs grep -iE "encrypt|decrypt|hash|password|token|key"

# Find SQL operations
find jadx_output -name "*.java" | xargs grep -iE "execSQL|rawQuery|query\("

# Find file operations
find jadx_output -name "*.java" | xargs grep -iE "FileOutputStream|openFile\(|File\("
```

### Hooking Native Modules with Frida

```javascript
// Hook all native module methods
Java.perform(function() {
    // Get all loaded classes
    Java.enumerateLoadedClasses({
        onMatch: function(className) {
            if (className.indexOf('com.facebook.react.modules') !== -1) {
                console.log("[*] Found React Native module: " + className);
            }
        },
        onComplete: function() {}
    });
});

// Hook specific module
Java.perform(function() {
    var SecureModule = Java.use("com.example.app.modules.SecureModule");

    SecureModule.performSecureOperation.implementation = function(data) {
        console.log("[*] SecureModule.performSecureOperation:");
        console.log("    Data: " + data);
        var result = this.performSecureOperation(data);
        console.log("    Result: " + result);
        return result;
    };
});
```

---

## 8. Common Vulnerability Patterns

### Weak Cryptography

#### Detection

```bash
# Find crypto operations in bundle
strings index.android.bundle | grep -iE "crypto|cipher|encrypt|decrypt|hash|md5|sha1|aes|rsa"

# Find crypto operations in native code
find jadx_output -name "*.java" | xargs grep -iE "Cipher\.getInstance|MessageDigest\.getInstance|SecretKeySpec"

# Check for weak algorithms
strings index.android.bundle | grep -iE "DES|MD5|SHA1|RC4"
```

### Hardcoded URLs and Endpoints

```bash
# Find all URLs
strings index.android.bundle | grep -E "https?://"

# Check for cleartext HTTP
strings index.android.bundle | grep -P "http://(?!localhost|127.0.0.1)"

# Find API endpoints
strings index.android.bundle | grep -E "/api/|/v1/|/v2/|endpoint"
```

### Missing Certificate Pinning

#### Detection

```bash
# Search for certificate pinning in bundle
strings index.android.bundle | grep -iE "pinning|certificate|ssl|tls"

# Search for certificate pinning in native code
find jadx_output -name "*.java" | xargs grep -iE "CertificatePinner|pinning|ssl|tls"

# Check for SSL pinning libraries
strings index.android.bundle | grep -iE "okhttp|trustkit|ssl-pinning"
```

### Third-Party Library Vulnerabilities

#### Detection

```bash
# Check React Native version
cat extracted/assets/package.json | grep -oE '"react-native": "[0-9.]+"'

# Check for known vulnerable libraries
cat extracted/assets/package.json | grep -A100 '"dependencies"' | grep -E "react-native|@react-navigation|@react-native-community"

# Run OWASP Dependency-Check
dependency-check --scan extracted/ --format JSON --out dependency-check.json
```

---

## Quick Reference

### Essential Commands

```bash
# Extract APK
unzip target.apk -d extracted/

# Find JavaScript bundles
find extracted/ -name "*.bundle"

# Check bundle type
file index.android.bundle

# Decompile Hermes bytecode
hermes-dec decompile index.android.bundle -o decompiled/

# Extract strings
strings index.android.bundle | grep -iE "api|key|token|password"

# Find native modules
find jadx_output -name "*.java" | xargs grep -l "ReactContextBaseJavaModule"

# Hook with Frida
frida -U -f com.example.app -l react_native_hooks.js
```

### Tool Matrix

| Task | Tool | Platform |
|------|------|----------|
| Reverse engineering | react-native-decompiler, hermes-dec | Cross-platform |
| Hermes analysis | Hermes-Dec | Cross-platform |
| Native code analysis | jadx, apktool | Cross-platform |
| Dynamic instrumentation | Frida | Cross-platform |
| Network analysis | mitmproxy, Burp Suite | Cross-platform |
| Dependency scanning | OWASP Dependency-Check, Snyk | Cross-platform |

---

## References

- React Native: https://reactnative.dev/
- Hermes Documentation: https://hermesengine.dev/
- Hermes-Dec: https://github.com/P1sec/hermes-dec
- OWASP Mobile Top 10: https://owasp.org/www-project-mobile-top-10/
- react-native-decompiler: https://github.com/numandev1/react-native-decompiler
- Frida: https://frida.re/docs/

---

**Maintainer:** android-apk-audit skill
**Related Files:** native-analysis.md, android-manifest-checklist.md
**Category:** Reference Document
**Last Updated:** 2025
