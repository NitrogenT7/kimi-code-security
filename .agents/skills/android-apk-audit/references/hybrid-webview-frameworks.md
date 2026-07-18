# Hybrid WebView Frameworks Analysis

## Overview

Hybrid frameworks (Cordova, React Native, Ionic/Capacitor, Flutter) use WebViews to render content, exposing attack surfaces through JavaScript bridges, plugins, and CSP misconfigurations.

---

## 1. Cordova/PhoneGap

### Identification

```bash
# Check for Cordova
unzip -p app.apk assets/www/config.xml | grep -E "allow-(navigation|intent)"
apktool d app.apk
find smali -name "*cordova*" | head -20

# Common indicators:
# - assets/www/cordova.js
# - assets/www/cordova_plugins.js
# - res/xml/config.xml with <allow-navigation>
```

### Decompilation and Analysis

```bash
# Extract web assets
unzip -d www app.apk "assets/www/*"

# Check config.xml for security misconfigurations
cat www/assets/www/config.xml | grep -E "allow-navigation|allow-intent|content-src"

# Find exposed Cordova plugins
grep -r "cordova.exec\|window.plugins" www/assets/www/
```

### Security Issues

**Common Vulnerabilities:**
- `config.xml` lax: `<allow-navigation origin="*"/>` allows any domain
- `allow-intent` too broad: `<allow-intent href="*"/>` exposes intents
- CSP (Content Security Policy) absent or weak
- Plugins with exec() callbacks exposed to XSS
- No code obfuscation by default - source code is fully visible

### WebView Debug Enable (Cordova)

```javascript
Java.perform(function() {
    // Generic WebView hook
    var WebView = Java.use('android.webkit.WebView');
    WebView.$init.overload('android.content.Context').implementation = function(ctx) {
        this.$init(ctx);
        this.setWebContentsDebuggingEnabled(true);
        console.log('[+] WebView debug enabled');
    };

    // Cordova WebView
    try {
        var CordovaWebView = Java.use('org.apache.cordova.CordovaWebView');
        console.log('[+] CordovaWebView detected');
    } catch(e) {}
});
```

### Reconstrucción (Cloning)

```bash
# Extract source
unzip bank.apk

# Get Cordova version from cordova.js
grep "PLATFORM_VERSION_BUILD_LABEL" bank/assets/www/cordova.js

# Create clone with same package name
npm install -g cordova@latest
cordova create bank-new com.android.bank Bank
cd bank-new

# Copy assets (exclude cordova.js, cordova_plugins.js, plugins/)
cp -r ../bank/assets/www/* www/
# DO NOT copy: cordova.js, cordova_plugins.js, plugins/

# Add platform (use same version as original)
cordova platform add android@10.1.2

# Install plugins from cordova_plugins.js
# Find plugins in: bank/assets/www/cordova_plugins.js
cordova plugin add cordova-plugin-dialogs@2.0.1
cordova plugin add cordova-plugin-camera@6.0.0

# Build modified APK
cordova build android --packageType=apk
```

### XSS Test

```bash
# Test for XSS-to-native
adb shell am start -a android.intent.action.VIEW \
  -d "javascript:alert(document.domain)" --es package com.app

# Test deep link XSS
adb shell am start -a android.intent.action.VIEW \
  -d "file:///android_asset/www/xss.html"
```

---

## 2. React Native (JS Bundles)

### Identification

```bash
# Check for React Native
unzip -l app.apk | grep -E "index.android.bundle|main.jsbundle"

# Hermes bytecode indicator
unzip -l app.apk | grep "assets/index.android.bundle"

# JSC (JavaScriptCore) indicator
jadx app.apk | grep -i "ReactNativeJS\|Hermes"

# Common indicators:
# - assets/index.android.bundle (Hermes)
# - assets/index.bundle (JSC)
# - com/facebook/react/ packages in smali
```

### Decompilation (Hermes)

```bash
# Install hermes-dec (P1sec's actively maintained decompiler)
pip install hermes-dec

# Decompile Hermes bytecode to pseudo-JS
hermes-dec decompile assets/index.android.bundle -o output_dir/

# Disassemble to human-readable assembly
hermes-dec disassemble assets/index.android.bundle -o output.hasm

# Parse bytecode and show metadata
hermes-dec parse assets/index.android.bundle
```

### Decompilation (JavaScriptCore)

```bash
# Install react-native-decompiler
npm i -g react-native-decompiler

# Decompile JSC bundle
rnd -i index.android.bundle -o rn_src/

# Find NativeModules
grep -r "NativeModules\|RCTBridge" rn_src/
```

### NativeModules Bridge Analysis

```javascript
Java.perform(function() {
    // Hook NativeModules registry
    var NativeModules = Java.use('com.facebook.react.bridge.NativeModules');

    // Hook callNative
    NativeModules.callNative.overload('java.lang.String', 'com.facebook.react.bridge.ReadableArray', 'com.facebook.react.bridge.Promise').implementation = function(module, method, args, promise) {
        console.log('[+] NativeModules.callNative: ' + module + '!' + method);
        console.log('    Args: ' + args.toString());
        return this.callNative(module, method, args, promise);
    };

    // Hook RCTBridge
    try {
        var RCTBridge = Java.use('com.facebook.react.bridge.RCTBridge');
        console.log('[+] RCTBridge found');
    } catch(e) {}
});
```

### Security Issues

**Common Vulnerabilities:**
- NativeModules registry exposes sensitive bridges
- Hermes bytecode can be decompiled with hermes-dec
- Metro bundler leaks in development builds
- JS bundle modification attacks (modify response from server)

---

## 3. Ionic/Capacitor

### Identification

```bash
# Check for Ionic/Capacitor
jadx app.apk | grep -E "CapacitorWebView|IonicWebView|com.getcapacitor"
grep -r "ion://localhost" assets/

# Common indicators:
# - com/getcapacitor/ packages
# - com/ionicframework/ packages
# - assets/www/ with Ionic app
# - capacitor.config.json in assets
```

### WebView Debug for Ionic

```javascript
Java.perform(function() {
    // Hook WebView $init
    var WebView = Java.use('android.webkit.WebView');
    WebView.$init.overload('android.content.Context').implementation = function(ctx) {
        this.$init(ctx);
        this.setWebContentsDebuggingEnabled(true);
        console.log('[+] WebView debug enabled');
    };

    // Hook IonicWebView
    try {
        var IonicWebViewEngine = Java.use('com.ionicframework.common.IonicWebViewEngine');
        IonicWebViewEngine.$init.overload('android.content.Context', 'android.util.AttributeSet').implementation = function(ctx, attrs) {
            this.$init(ctx, attrs);
            console.log('[+] IonicWebView debug enabled');
        };
    } catch(e) {}

    // Hook CapacitorWebView
    try {
        var BridgeWebViewClient = Java.use('com.getcapacitor.BridgeWebViewClient');
        console.log('[+] Capacitor WebView found');
    } catch(e) {}
});
```

### Chrome Inspector Connection

```bash
# Reverse port for debugging
adb reverse tcp:9222 tcp:9222

# Open Chrome DevTools
# chrome://inspect#devices

# List WebView contexts
frida -U -f com.app -l webview-debug.js
```

### Security Issues

**Common Vulnerabilities:**
- `ion://` scheme bypasses CSP
- postMessage bridges exposed
- CSP weak by default
- Navigation delegates bypass

---

## 4. Flutter WebView

### Identification

```bash
# Check for Flutter
strings lib/*/libflutter.so | grep -i webview
apktool d app.apk
grep -r "flutter.plugin.webview" smali/

# Common indicators:
# - lib/*/libflutter.so
# - assets/flutter_assets/
# - io/flutter/plugins/webviewflutter/
```

### Flutter WebView Content

```bash
# Flutter assets location
ls -la assets/flutter_assets/

# Dart code is compiled to native - difficult to decompile
# Analyze strings instead
strings lib/*/libflutter.so | grep -iE "api|url|endpoint|key|token"
```

### Flutter Channel Hook

```javascript
Java.perform(function() {
    // Hook MethodChannel (Java side)
    var MethodChannel = Java.use('io.flutter.plugin.common.MethodChannel');

    MethodChannel.invokeMethod.overload('java.lang.String', 'java.lang.Object').implementation = function(method, args) {
        console.log('[+] MethodChannel.invokeMethod: ' + method);
        console.log('    Args: ' + JSON.stringify(args));
        return this.invokeMethod(method, args);
    };
});

// Native Flutter hook (requires offset analysis from Ghidra)
// Hook platform invoke
Interceptor.attach(Module.findExportByName("libflutter.so", "_ZNK5flutter15PlatformChannel14InvokeMethodEx"), {
    onEnter: function(args) {
        console.log('[+] Flutter platform invoke detected');
    }
});
```

### Security Issues

**Common Vulnerabilities:**
- Platform invokes exposed
- `file://` scheme access
- Flutter asset leaks
- Native bridges with little sandboxing

---

## 5. Master Bash Script for Hybrid Analysis

```bash
#!/bin/bash
# hybrid-webview-analyzer.sh
# Auto-detect framework and run appropriate analysis

APP=$1
FRAMEWORK=""

# Detect framework
detect_framework() {
    if unzip -l "$APP.apk" | grep -q "cordova.js"; then
        FRAMEWORK="cordova"
        echo "[+] Detected: Cordova/PhoneGap"
    elif unzip -l "$APP.apk" | grep -q "index.android.bundle"; then
        FRAMEWORK="react-native"
        echo "[+] Detected: React Native"
    elif unzip -l "$APP.apk" | grep -q "libflutter.so"; then
        FRAMEWORK="flutter"
        echo "[+] Detected: Flutter"
    elif jadx "$APP.apk" 2>/dev/null | grep -q "CapacitorWebView\|IonicWebView"; then
        FRAMEWORK="ionic"
        echo "[+] Detected: Ionic/Capacitor"
    else
        echo "[!] Unknown framework"
    fi
}

# Start Frida server
start_frida() {
    adb push frida-server-arm64 /data/local/tmp/frida-server
    adb shell "chmod 755 /data/local/tmp/frida-server"
    adb root
    adb shell "/data/local/tmp/frida-server &"
}

# Cordova analysis
analyze_cordova() {
    echo "[*] Extracting Cordova source..."
    unzip -d www "$APP.apk" "assets/www/*"

    echo "[*] Checking config.xml..."
    grep -E "allow-(navigation|intent)" www/assets/www/config.xml

    echo "[*] Searching for exposed plugins..."
    grep -r "cordova.exec\|window.plugins" www/assets/www/

    echo "[*] WebView XSS test..."
    adb shell am start -a android.intent.action.VIEW \
      -d "javascript:alert(document.domain)" --es package "$APP"
}

# React Native analysis
analyze_react_native() {
    echo "[*] Extracting React Native bundle..."
    unzip -d assets "$APP.apk" "assets/index.android.bundle"

    echo "[*] Decompiling Hermes bytecode..."
    hermes-dec decompile assets/assets/index.android.bundle -o rn_src/

    echo "[*] Searching for NativeModules..."
    grep -r "NativeModules\|RCTBridge" rn_src/
}

# Ionic analysis
analyze_ionic() {
    echo "[*] Enabling WebView debug..."
    frida -U -f "$APP" -l webview-debug.js

    echo "[*] Setting up Chrome inspector..."
    adb reverse tcp:9222 tcp:9222

    echo "[*] Open chrome://inspect#devices to inspect WebView"
}

# Flutter analysis
analyze_flutter() {
    echo "[*] Extracting Flutter assets..."
    unzip -d flutter_assets "$APP.apk" "assets/flutter_assets/*"

    echo "[*] Searching WebView references in native lib..."
    strings lib/*/libflutter.so | grep -i "webview\|channel\|platform"

    echo "[*] Hooking Flutter channels..."
    frida -U -f "$APP" -l flutter-channel-hook.js
}

# Main workflow
detect_framework
start_frida

case $FRAMEWORK in
    "cordova") analyze_cordova ;;
    "react-native") analyze_react_native ;;
    "ionic") analyze_ionic ;;
    "flutter") analyze_flutter ;;
    *) echo "[!] Unknown framework" ;;
esac

# Common WebView analysis
echo "[*] WebView tracing..."
frida-trace -U -f "$APP" -j "*WebView* *bridge*"

echo "[+] Analysis complete"
```

---

## 6. Security Issues Summary

| Framework | Key Vulnerabilities | Attack Vectors |
|-----------|-------------------|----------------|
| **Cordova** | No obfuscation, lax config.xml, CSP missing | XSS-to-native, code tampering, source exposure |
| **React Native** | NativeModules exposed, Metro leaks | JS bundle modification, bridge abuse |
| **Ionic** | ion:// scheme, weak CSP, postMessage | Scheme bypass, navigation delegate abuse |
| **Flutter** | Platform invokes, file:// access | Channel abuse, asset leaks, native bridge |

---

## 7. Workflow Sequence

```bash
# Phase 1: Detect Framework
unzip -l app.apk | grep -E "cordova|index.android.bundle|libflutter|Capacitor"

# Phase 2: Extract Assets
apktool d app.apk
unzip -d assets app.apk assets/*

# Phase 3: Enable WebView Debug
frida -U -l webview-debug.js -f com.app

# Phase 4: Trace Bridges
frida-trace -U -f com.app -j "*WebView* *bridge*"

# Phase 5: Chrome Inspector
adb reverse tcp:9222 tcp:9222
chrome://inspect#devices

# Phase 6: Test XSS/FILE Access
adb shell am start -a android.intent.action.VIEW \
  -d "javascript:alert(document.domain)" --es package com.app
```

---

## References

- [GitHub Gist - SSL Pinning & WebView Debug](https://gist.github.com/1mm0rt41PC/4f37f3df552699e52061dcdc8c75930b)
- [InfoSec Writeups - Cordova Cloning](https://infosecwriteups.com/recreating-cordova-mobile-apps-to-bypass-security-implementations-8845ff7bdc58)
- [HackTricks - React Native](https://book.hacktricks.xyz/mobile-pentesting/android-app-pentesting/react-native-application)
- [HackTheDome - WebView Security](https://hackthedome.com/module-17-webview-hybrid-in-app-browser-security-exhaustive-detail/)