# Android Static Analysis Patterns

Comprehensive grep patterns, JADX/APKTool usage, and vulnerability detection for static APK analysis.

**⚠️ CROSS-PLATFORM COMPATIBILITY:** All `grep -rnP` commands in this file use PCRE (Perl regex), which is **NOT supported on macOS BSD grep**. Use:

```bash
# Option 1: Use grep -rnE (extended regex - compatible with macOS/Linux)
grep -rnE "pattern" directory/

# Option 2: Use ripgrep (recommended - faster and cross-platform)
rg "pattern" directory/
# Install: brew install ripgrep (macOS) or apt install ripgrep (Linux)

# Option 3: Install GNU grep on macOS
brew install grep
# Then use: ggrep -P "pattern" directory/

# Option 4: Use perl one-liner (universal fallback)
find . -type f -exec perl -nle 'print "$ARGV: $_" if /pattern/' {} \;
```

## 1. JADX CLI Complete Guide

### Essential Flags for Security Audits

```bash
# Basic decompilation with resources
jadx -d output app.apk

# Code only (no resources)
jadx -d output -r app.apk

# Resources only (no source)
jadx -d output -s app.apk

# Advanced options (NOTE: --export-gradle removed in jadx 1.5+)
jadx -d output \
  --show-bad-code \           # Show decompilation issues
  --deobf \                   # Enable deobfuscation
  --threads-count 8 \         # Parallel processing
  app.apk

# For Gradle project export, use jadx-gui or manually create build.gradle
```

### Handling Decompilation Failures

```bash
# Legacy DEX support
jadx --decompilation-mode fallback app.apk

# Disable security checks for corrupted APKs
JADX_DISABLE_XML_SECURITY=true jadx app.apk
JADX_DISABLE_ZIP_SECURITY=true jadx app.apk

# Use DX instead of D8
jadx --use-dx app.apk

# Show all output including errors
jadx --show-bad-code -v app.apk
```

### JSON Output for Automation

```bash
jadx -d output --output-format json app.apk
# Useful for: grep, jq, automated analysis pipelines
```

## 2. APKTool Complete Guide

### Decoding Options

```bash
# Full decode (smali + resources)
apktool d app.apk -o decoded/

# Resources only (no smali)
apktool d -r app.apk -o decoded/

# Smali only (no resources)
apktool d --no-src app.apk -o decoded/

# Force overwrite
apktool d -f app.apk -o decoded/

# Framework handling
apktool if framework-res.apk                    # Install framework
apktool d --frame-path /custom/path app.apk      # Use custom framework
```

### Rebuilding and Signing

```bash
# Rebuild
apktool b decoded/ -o modified.apk

# Align (required for Android 4+)
zipalign -v 4 modified.apk aligned.apk

# Sign with apksigner (recommended)
apksigner sign --ks debug.keystore --ks-key-alias androiddebugkey aligned.apk

# Generate keystore (first time)
keytool -genkey -v \
  -keystore debug.keystore \
  -alias androiddebugkey \
  -keyalg RSA \
  -keysize 2048 \
  -validity 10000 \
  -storepass android \
  -keypass android

# Verify
apksigner verify aligned.apk
jarsigner -verify aligned.apk
```

### Smali Patching

```smali
# Bypass boolean check
# Before: const/4 v0, 0x0  (false)
# After:  const/4 v0, 0x1  (true)

# Bypass root detection
.method public isRooted()Z
    .locals 1
    const/4 v0, 0x0
    return v0
.end method

# Bypass SSL verification
.method public checkServerTrusted([Ljava/security/cert/X509Certificate;Ljava/lang/String;)V
    .locals 0
    return-void
.end method

# Add logging
# Insert in method:
const-string v0, "AUDIT"
const-string v1, "Method called"
invoke-static {v0, v1}, Landroid/util/Log;->d(Ljava/lang/String;Ljava/lang/String;)I
```

## 3. Complete Grep Pattern Catalog

### Cross-Platform Quick Reference

All patterns in this section use `grep -rnP` (PCRE regex). For cross-platform compatibility:

```bash
# macOS/Linux (POSIX ERE - compatible)
grep -rnE "pattern" directory/

# Recommended: ripgrep (faster, cross-platform)
rg "pattern" directory/
# Install: brew install ripgrep (macOS) or apt install ripgrep (Linux)

# GNU grep (install on macOS for PCRE support)
brew install grep
ggrep -P "pattern" directory/
```

### WebView Sinks

```bash
# URL loading
grep -rnP "loadUrl\(" "$APP/"                 # PCRE (GNU grep)
grep -rnE "loadUrl\(" "$APP/"                 # POSIX ERE (macOS/Linux)
rg "loadUrl\(" "$APP/"                        # ripgrep

# Data loading
grep -rnP "loadData\(|loadDataWithBaseURL\(" "$APP/"
grep -rnE "loadData\(|loadDataWithBaseURL\(" "$APP/"
rg "loadData\(|loadDataWithBaseURL\(" "$APP/"

# JavaScript execution
grep -rnP "evaluateJavascript\(" "$APP/"
grep -rnE "evaluateJavascript\(" "$APP/"
rg "evaluateJavascript\(" "$APP/"

# JavaScript interface (bridge exposure)
grep -rnP "addJavascriptInterface\(" "$APP/"
grep -rnE "addJavascriptInterface\(" "$APP/"
rg "addJavascriptInterface\(" "$APP/"

# JavaScript enabled
grep -rnP "setJavaScriptEnabled\(true\)" "$APP/"
grep -rnE "setJavaScriptEnabled\(true\)" "$APP/"
rg "setJavaScriptEnabled\(true\)" "$APP/"

# File access
grep -rnP "setAllowUniversalAccessFromFileURLs\(true\)|setAllowFileAccess\(true\)" "$APP/"
grep -rnE "setAllowUniversalAccessFromFileURLs\(true\)|setAllowFileAccess\(true\)" "$APP/"
rg "setAllowUniversalAccessFromFileURLs\(true\)|setAllowFileAccess\(true\)" "$APP/"

# SSL error bypass
grep -rnP "onReceivedSslError.*handler\.proceed\(\)" "$APP/"
grep -rnE "onReceivedSslError.*handler\.proceed\(\)" "$APP/"
rg "onReceivedSslError.*handler\.proceed\(\)" "$APP/"
```

### Intent/IPC Sources

```bash
# Deep link parameters
grep -rnP "getQueryParameter\(|getQueryParameterNames\(" "$APP/"
grep -rnE "getQueryParameter\(|getQueryParameterNames\(" "$APP/"
rg "getQueryParameter\(|getQueryParameterNames\(" "$APP/"

# Intent extras
grep -rnP "getStringExtra|getIntExtra|getBooleanExtra|getParcelableExtra" "$APP/"
grep -rnE "getStringExtra|getIntExtra|getBooleanExtra|getParcelableExtra" "$APP/"
rg "getStringExtra|getIntExtra|getBooleanExtra|getParcelableExtra" "$APP/"

# Deep link data
grep -rnP "getData\(\)|getIntent\(\)\.getData|onNewIntent" "$APP/"
grep -rnE "getData\(\)|getIntent\(\)\.getData|onNewIntent" "$APP/"
rg "getData\(\)|getIntent\(\)\.getData|onNewIntent" "$APP/"

# Activity results
grep -rnP "onActivityResult.*getData|onActivityResult.*getIntent" "$APP/"
grep -rnE "onActivityResult.*getData|onActivityResult.*getIntent" "$APP/"
rg "onActivityResult.*getData|onActivityResult.*getIntent" "$APP/"

# Clipboard
grep -rnP "ClipboardManager|getPrimaryClip|ClipData" "$APP/"
grep -rnE "ClipboardManager|getPrimaryClip|ClipData" "$APP/"
rg "ClipboardManager|getPrimaryClip|ClipData" "$APP/"

# Provider queries
grep -rnP "\.query\(|rawQuery\(|getContentResolver\(\)\.query" "$APP/"
grep -rnE "\.query\(|rawQuery\(|getContentResolver\(\)\.query" "$APP/"
rg "\.query\(|rawQuery\(|getContentResolver\(\)\.query" "$APP/"
```

### Hardcoded Secrets

```bash
# API keys (PCRE with quantifiers - use GNU grep or ripgrep)
grep -rnP "AIza[A-Za-z0-9_-]{35}|AKIA[A-Z0-9]{16}|stripe_live_key_pattern" "$APP/"
# POSIX ERE workaround (multiple patterns)
grep -rnE "AIza[A-Za-z0-9_-]{35}|AKIA[A-Z0-9]{16}|stripe_live_key_pattern" "$APP/"
rg "AIza[A-Za-z0-9_-]{35}|AKIA[A-Z0-9]{16}|stripe_live_key_pattern" "$APP/"

# Passwords in code
grep -rnPi "password\s*=\s*\"[^\"]+\"|password\s*=\s*\'[^\']+\'" "$APP/"
grep -rnEi "password\s*=\s*\"[^\"]+\"|password\s*=\s*'[^']+'" "$APP/"
rg -i "password\s*=\s*\"[^\"]+\"|password\s*=\s*'[^']+'" "$APP/"

# Tokens
grep -rnPi "token\s*=\s*\"|bearer\s+\"|token_type\s*=" "$APP/"
grep -rnEi "token\s*=\s*\"|bearer\s+\"|token_type\s*=" "$APP/"
rg -i "token\s*=\s*\"|bearer\s+\"|token_type\s*=" "$APP/"

# Private keys
grep -rnP "-----BEGIN (RSA |PRIVATE |DSA |EC )?PRIVATE KEY-----" "$APP/"
grep -rnE "-----BEGIN RSA PRIVATE KEY-----|-----BEGIN PRIVATE KEY-----|-----BEGIN DSA PRIVATE KEY-----|-----BEGIN EC PRIVATE KEY-----" "$APP/"
rg "-----BEGIN RSA PRIVATE KEY-----|-----BEGIN PRIVATE KEY-----|-----BEGIN DSA PRIVATE KEY-----|-----BEGIN EC PRIVATE KEY-----" "$APP/"

# Firebase URLs
grep -rnP "firebaseio\.com|\.firebaseapp\.com" "$APP/"
grep -rnE "firebaseio\.com|\.firebaseapp\.com" "$APP/"
rg "firebaseio\.com|\.firebaseapp\.com" "$APP/"

# AWS URLs
grep -rnP "s3\.amazonaws\.com|execute-api\.[a-z0-9-]+\.amazonaws\.com" "$APP/"
grep -rnE "s3\.amazonaws\.com|execute-api\.[a-z0-9-]+\.amazonaws\.com" "$APP/"
rg "s3\.amazonaws\.com|execute-api\.[a-z0-9-]+\.amazonaws\.com" "$APP/"

# Generic secrets in strings (PCRE case-insensitive)
grep -rnP "(?i)(password|secret|api_key|apikey|token|credential)\s*[=:]\s*\"[^\"]{8,}" "$APP/"
# POSIX ERE workaround
grep -rnE "password|secret|api_key|apikey|token|credential" "$APP/" | grep -E "\s*[=:]\s*\"[^\"]{8,}"
rg -i "(password|secret|api_key|apikey|token|credential)\s*[=:]\s*\"[^\"]{8,}" "$APP/"

# Base64 encoded
grep -rnP "Base64\.decode|fromBase64|decodeBase64" "$APP/"
grep -rnE "Base64\.decode|fromBase64|decodeBase64" "$APP/"
rg "Base64\.decode|fromBase64|decodeBase64" "$APP/"

# Strings file (grep -iP works on all systems for simple patterns)
strings app.apk | grep -iP "password|secret|token|key|credential|api" | head -100
```

### Cryptographic Issues

```bash
# Weak algorithms
grep -rnP "DES|MD5|SHA1(?![0-9])" "$APP/"
grep -rnE "DES|MD5|SHA1[^0-9]" "$APP/"
rg "DES|MD5|SHA1[^0-9]" "$APP/"

# ECB mode
grep -rnP "AES.*ECB|AES/ECB|\"ECB\"" "$APP/"
grep -rnE "AES.*ECB|AES/ECB|\"ECB\"" "$APP/"
rg "AES.*ECB|AES/ECB|\"ECB\"" "$APP/"

# Hardcoded keys
grep -rnP "SecretKeySpec\(|new SecretKeySpec|\"AES\".*getBytes" "$APP/"
grep -rnE "SecretKeySpec\(|new SecretKeySpec|\"AES\".*getBytes" "$APP/"
rg "SecretKeySpec\(|new SecretKeySpec|\"AES\".*getBytes" "$APP/"

# Hardcoded IV
grep -rnP "IvParameterSpec\(new byte\[\]|IvParameterSpec\(\s*\{.*0x[0-9a-fA-F]+" "$APP/"
grep -rnE "IvParameterSpec\(new byte" "$APP/"
rg "IvParameterSpec\(new byte" "$APP/"

# Insecure random
grep -rnP "new Random\(\)|Random\.nextInt|Math\.random\(\)" "$APP/.*\.java"
grep -rnE "new Random\(\)|Random\.nextInt|Math\.random\(\)" "$APP/.*\.java"
rg "new Random\(\)|Random\.nextInt|Math\.random\(\)" "$APP/"

# Crypto patterns
grep -rnP "Cipher\.getInstance|MessageDigest\.getInstance|Mac\.getInstance" "$APP/"
grep -rnE "Cipher\.getInstance|MessageDigest\.getInstance|Mac\.getInstance" "$APP/"
rg "Cipher\.getInstance|MessageDigest\.getInstance|Mac\.getInstance" "$APP/"
```

### Insecure Storage

```bash
# SharedPreferences
grep -rnP "getSharedPreferences|SharedPreferences\.Editor|MODE_PRIVATE" "$APP/"
grep -rnE "getSharedPreferences|SharedPreferences\.Editor|MODE_PRIVATE" "$APP/"
rg "getSharedPreferences|SharedPreferences\.Editor|MODE_PRIVATE" "$APP/"

# Plaintext database
grep -rnP "openOrCreateDatabase|SQLiteDatabase\.openDatabase|\.db\"|\.sqlite\"" "$APP/"
grep -rnE "openOrCreateDatabase|SQLiteDatabase\.openDatabase|\.db\"|\.sqlite\"" "$APP/"
rg "openOrCreateDatabase|SQLiteDatabase\.openDatabase|\.db\"|\.sqlite\"" "$APP/"

# External storage
grep -rnP "getExternalStorageDirectory|getExternalFilesDir|Environment\.EXTERNAL" "$APP/"
grep -rnE "getExternalStorageDirectory|getExternalFilesDir|Environment\.EXTERNAL" "$APP/"
rg "getExternalStorageDirectory|getExternalFilesDir|Environment\.EXTERNAL" "$APP/"

# World readable/writable
grep -rnP "MODE_WORLD_READABLE|MODE_WORLD_WRITEABLE" "$APP/"
grep -rnE "MODE_WORLD_READABLE|MODE_WORLD_WRITEABLE" "$APP/"
rg "MODE_WORLD_READABLE|MODE_WORLD_WRITEABLE" "$APP/"

# File output
grep -rnP "openFileOutput|FileOutputStream" "$APP/"
grep -rnE "openFileOutput|FileOutputStream" "$APP/"
rg "openFileOutput|FileOutputStream" "$APP/"
```

### Network/TLS Issues

```bash
# Custom trust manager
grep -rnP "X509TrustManager|checkServerTrusted|checkClientTrusted" "$APP/"
grep -rnE "X509TrustManager|checkServerTrusted|checkClientTrusted" "$APP/"
rg "X509TrustManager|checkServerTrusted|checkClientTrusted" "$APP/"

# Hostname verifier bypass
grep -rnP "hostnameVerifier.*ALLOW_ALL|verify\(.*return true" "$APP/"
grep -rnE "hostnameVerifier.*ALLOW_ALL|verify\(.*return true" "$APP/"
rg "hostnameVerifier.*ALLOW_ALL|verify\(.*return true" "$APP/"

# SSL context
grep -rnP "SSLContext\.getInstance|TrustManager\[\]" "$APP/"
grep -rnE "SSLContext\.getInstance|TrustManager\[\]" "$APP/"
rg "SSLContext\.getInstance|TrustManager\[\]" "$APP/"

# Custom socket factory
grep -rnP "setSSLSocketFactory|SSL_SOCKET_FACTORY" "$APP/"
grep -rnE "setSSLSocketFactory|SSL_SOCKET_FACTORY" "$APP/"
rg "setSSLSocketFactory|SSL_SOCKET_FACTORY" "$APP/"

# Cleartext traffic
grep -rnP "usesCleartextTraffic.*true|http://" "$APP/res/" "$APP/AndroidManifest.xml" 2>/dev/null
grep -rnE "usesCleartextTraffic.*true|http://" "$APP/res/" "$APP/AndroidManifest.xml" 2>/dev/null
rg "usesCleartextTraffic.*true|http://" "$APP/res/" "$APP/AndroidManifest.xml"

# Network security config check
grep -rnP "networkSecurityConfig" "$APP/\.\./AndroidManifest.xml"
grep -rnE "networkSecurityConfig" "$APP/\.\./AndroidManifest.xml"
rg "networkSecurityConfig" "$APP/\.\./AndroidManifest.xml"
cat decoded/res/xml/network_security_config.xml 2>/dev/null
```

### Native Bridges

```bash
# Library loading
grep -rnP "System\.loadLibrary|System\.load\(" "$APP/"
grep -rnE "System\.loadLibrary|System\.load\(" "$APP/"
rg "System\.loadLibrary|System\.load\(" "$APP/"

# Native method declarations
grep -rnP "native\s+\w+\s+\w+\(" "$APP/"
grep -rnE "native\s+\w+\s+\w+\(" "$APP/"
rg "native\s+\w+\s+\w+\(" "$APP/"

# JNI registration
grep -rnP "RegisterNatives|JNI_OnLoad" "$APP/"
grep -rnE "RegisterNatives|JNI_OnLoad" "$APP/"
rg "RegisterNatives|JNI_OnLoad" "$APP/"

# Native method calls
grep -rnP "\.native\(|private native|public native" "$APP/"
grep -rnE "\.native\(|private native|public native" "$APP/"
rg "\.native\(|private native|public native" "$APP/"
```

### Dynamic Loading/Reflection

```bash
# Dex loading
grep -rnP "DexClassLoader|PathClassLoader|URLClassLoader|InMemoryDexClassLoader" "$APP/"
grep -rnE "DexClassLoader|PathClassLoader|URLClassLoader|InMemoryDexClassLoader" "$APP/"
rg "DexClassLoader|PathClassLoader|URLClassLoader|InMemoryDexClassLoader" "$APP/"

# Reflection
grep -rnP "Class\.forName|getDeclaredMethod|getMethod\(|\.invoke\(|getDeclaredField" "$APP/"
grep -rnE "Class\.forName|getDeclaredMethod|getMethod\(|\.invoke\(|getDeclaredField" "$APP/"
rg "Class\.forName|getDeclaredMethod|getMethod\(|\.invoke\(|getDeclaredField" "$APP/"

# Dynamic proxies
grep -rnP "Proxy\.newProxyInstance|InvocationHandler" "$APP/"
grep -rnE "Proxy\.newProxyInstance|InvocationHandler" "$APP/"
rg "Proxy\.newProxyInstance|InvocationHandler" "$APP/"
```

### Anti-Analysis Detection

```bash
# Debugger detection
grep -rnP "Debug\.isDebuggerConnected|android\.os\.Debug\.waitingForDebugger" "$APP/"
grep -rnE "Debug\.isDebuggerConnected|android\.os\.Debug\.waitingForDebugger" "$APP/"
rg "Debug\.isDebuggerConnected|android\.os\.Debug\.waitingForDebugger" "$APP/"

# Debuggable check
grep -rnP "ApplicationInfo\.FLAG_DEBUGGABLE|\.flags.*DEBUGGABLE" "$APP/"
grep -rnE "ApplicationInfo\.FLAG_DEBUGGABLE|\.flags.*DEBUGGABLE" "$APP/"
rg "ApplicationInfo\.FLAG_DEBUGGABLE|\.flags.*DEBUGGABLE" "$APP/"

# Signature verification
grep -rnP "packageInfo\.signatures|PackageManager\.GET_SIGNATURES" "$APP/"
grep -rnE "packageInfo\.signatures|PackageManager\.GET_SIGNATURES" "$APP/"
rg "packageInfo\.signatures|PackageManager\.GET_SIGNATURES" "$APP/"

# Integrity checks
grep -rnP "checksum|hash.*verify|CRC32|MessageDigest.*verify" "$APP/"
grep -rnE "checksum|hash.*verify|CRC32|MessageDigest.*verify" "$APP/"
rg "checksum|hash.*verify|CRC32|MessageDigest.*verify" "$APP/"

# Root detection (common)
grep -rnP "/su|/system/app/Superuser|Superuser\.apk|magisk|root" "$APP/" --include="*.java"
grep -rnE "/su|/system/app/Superuser|Superuser\.apk|magisk|root" "$APP/" --include="*.java"
rg "/su|/system/app/Superuser|Superuser\.apk|magisk|root" "$APP/" --glob="*.java"

# Emulator detection
grep -rnP "google_sdk|emulator|android-x86|goldfish|vbox" "$APP/"
grep -rnE "google_sdk|emulator|android-x86|goldfish|vbox" "$APP/"
rg "google_sdk|emulator|android-x86|goldfish|vbox" "$APP/"

# Frida detection
grep -rnP "frida|27042|27043|/data/local/tmp/frida" "$APP/"
grep -rnE "frida|27042|27043|/data/local/tmp/frida" "$APP/"
rg "frida|27042|27043|/data/local/tmp/frida" "$APP/"
```

## 4. Framework Detection

> **Framework detection commands and deep analysis:** See `references/hybrid-webview-frameworks.md` for comprehensive framework detection and analysis guide.

## 5. Obfuscation Detection

### APKiD

```bash
# Install
pip install apkid

# Run
apkid app.apk

# Interpret results
# anti_vm        - Anti-VM checks present
# anti_debug     - Anti-debugging code
# obfuscator     - ProGuard/R8 detected (unreadable names)
# compiler       - Shows r8, dx, d8, etc.
# packer         - Packers like Bangcle, Jiagu, 360
```

### Manual Detection

```bash
# ProGuard/R8 indicators (short names like a.b.c)
ls src/sources/com/ 2>/dev/null | head -5
# If output is like "a", "b", "c" → heavy obfuscation

# String encryption (base64, XOR patterns)
grep -rnP "decrypt\(|decode\(|xor\(" "$APP/" --include="*.java"

# Packed APK (large .so, small classes.dex)
ls -la decoded/lib/*/ 2>/dev/null
ls -la decoded/*.dex 2>/dev/null
```

## 6. Resource Analysis

### strings.xml

```bash
# Search secrets in resources
grep -rnP "password|secret|api_key|token|credential" decoded/res/values/strings.xml
grep -rnE "password|secret|api_key|token|credential" decoded/res/values/strings.xml
rg "password|secret|api_key|token|credential" decoded/res/values/strings.xml

grep -rnP "http[s]?://" decoded/res/values/strings.xml
grep -rnE "https?://" decoded/res/values/strings.xml
rg "https?://" decoded/res/values/strings.xml
```

### Network Security Config

```bash
# Check for cleartext traffic
grep -n "cleartextTrafficPermitted" decoded/res/xml/*.xml 2>/dev/null

# Check certificate pins
grep -n "pin-set" decoded/res/xml/*.xml 2>/dev/null

# Check trust anchors
grep -n "certificates src" decoded/res/xml/*.xml 2>/dev/null
```

### AndroidManifest.xml Quick Checks

```bash
# Exported components
grep -n "exported=\"true\"" decoded/AndroidManifest.xml
grep -A5 "<intent-filter" decoded/AndroidManifest.xml | grep "android:name"

# Debuggable
grep -n "debuggable" decoded/AndroidManifest.xml

# Backup
grep -n "allowBackup" decoded/AndroidManifest.xml

# Permissions
grep -n "<uses-permission" decoded/AndroidManifest.xml
grep -n "<permission " decoded/AndroidManifest.xml
```