# Android Dynamic Analysis Setup

Complete guide for runtime testing, ADB commands, Frida/Objection usage, and APK repackaging.

## 1. ADB Commands for Security Testing

### Activity Manager (am)

```bash
# Start activity
adb shell am start -n com.target.app/.MainActivity

# With extras (string)
adb shell am start -n com.target.app/.Activity -e key "value"

# With extras (various types)
adb shell am start -n com.target.app/.Activity \
  --es string_key "value" \          # String extra
  --ei int_key 123 \                 # Integer extra
  --ez bool_key true \                # Boolean extra
  --el long_key 999999L \            # Long extra
  --ed double_key 1.23 \              # Double extra (bundle)
  --eu uri_key "content://test" \    # URI extra
  --ea float_key 1.0                  # Float extra

# With URI (deep link)
adb shell am start -a android.intent.action.VIEW -d "myapp://path?key=value"

# Flags
adb shell am start -S -W -n com.target.app/.Activity  # Stop app first, wait for launch
adb shell am start --display 0 -n com.target.app/.Activity  # On specific display

# Test exported activity
adb shell am start -n com.target.app/.ExportedActivity
```

### Service Testing

```bash
# Start service
adb shell am startservice -n com.target.app/.MyService

# With extras
adb shell am startservice -n com.target.app/.AuthService \
  --es token "stolen_token" \
  --ei user_id 1

# Stop service
adb shell am stopservice com.target.app/.MyService

# Foreground service (Android 8+)
adb shell am start-foreground-service -n com.target.app/.ForegroundService
```

### Broadcast Testing

```bash
# Send broadcast
adb shell am broadcast -a android.intent.action.BOOT_COMPLETED

# To specific receiver
adb shell am broadcast -n com.target.app/.MyReceiver

# With action
adb shell am broadcast -a com.target.app.CUSTOM_ACTION

# With extras
adb shell am broadcast -n com.target.app/.ExportedReceiver \
  --es data "malicious_payload"

# Test implicit receivers
adb shell am broadcast -a android.intent.action.ACTION
```

### Content Provider Testing

```bash
# Query all data
adb shell content query --uri content://com.target.app.provider/

# Query specific table
adb shell content query --uri content://com.target.app.provider/users

# With projection (columns)
adb shell content query --uri content://com.target.app.provider/users \
  --projection "_id,username,password"

# With selection (WHERE clause)
adb shell content query --uri content://com.target.app.provider/users \
  --where "username='admin'"

# SQL injection via projection
adb shell content query --uri "content://com.target.app.provider/users" \
  --projection "* FROM sqlite_master--"

# SQL injection via WHERE
adb shell content query --uri content://com.target.app.provider/users \
  --where "id=1 UNION SELECT username,password FROM users--"

# Bind for INSERT
adb shell content insert --uri content://com.target.app.provider/users \
  --bind username:s:admin \
  --bind password:s:admin123

# Update
adb shell content update --uri content://com.target.app.provider/users \
  --bind username:s:newadmin \
  --where "id=1"

# Delete
adb shell content delete --uri content://com.target.app.provider/users \
  --where "1=1"

# Path traversal
adb shell content query --uri "content://com.target.app.provider/../../../etc/passwd"
```

### Package Management

```bash
# List packages
adb shell pm list packages
adb shell pm list packages -3  # Third-party only
adb shell pm list packages -f  # With APK path
adb shell pm list packages -d  # Disabled packages

# Package info
adb shell dumpsys package com.target.app

# Get APK path
adb shell pm path com.target.app

# Clear app data
adb shell pm clear com.target.app

# Grant permissions
adb shell pm grant com.target.app android.permission.READ_CONTACTS

# Revoke permissions
adb shell pm revoke com.target.app android.permission.READ_CONTACTS

# Install APK
adb install app.apk
adb install -r app.apk  # Replace
adb install -d app.apk  # Allow downgrade
adb install -g app.apk  # Grant all permissions

# Uninstall
adb shell pm uninstall com.target.app
```

### Logcat

```bash
# Filter by package
adb logcat --pid=$(adb shell pidof com.target.app)

# Filter by tag
adb logcat -s "ActivityManager:D" "WebView:E"

# Filter by keywords
adb logcat | grep -iE "password|token|secret|key|auth|exception|error|crash"

# Save to file
adb logcat -v threadtime > logcat.txt

# Clear buffer
adb logcat -c

# Specific buffer
adb logcat -b main -b system -b events

# Time format
adb logcat -v time
adb logcat -v threadtime
adb logcat -v brief
```

## 2. Frida Setup and Commands

### Device Setup

```bash
# Check architecture
adb shell getprop ro.product.cpu.abi
# Output: arm64-v8a, armeabi-v7a, x86, x86_64

# Download matching frida-server (version must match frida-tools)
# From: https://github.com/frida/frida/releases
# Check your version: frida --version

# Download Frida server matching your version (example for Frida 17.x)
FRIDA_VER=$(frida --version)
wget https://github.com/frida/frida/releases/download/${FRIDA_VER}/frida-server-${FRIDA_VER}-android-arm64.xz

# Decompress and push
xz -d frida-server-*-android-arm64.xz
adb push frida-server-*-android-arm64 /data/local/tmp/frida-server
adb shell chmod 755 /data/local/tmp/frida-server

# Start frida-server
adb shell /data/local/tmp/frida-server &

# Verify
frida-ps -U
frida-ps -Uai  # All installed apps
```

### Frida Scripts

#### SSL Pinning Bypass (Universal)

```javascript
// ssl-pinning-bypass.js
Java.perform(function() {
    console.log("[*] SSL Pinning Bypass Started");

    // OkHttp v3/v4 CertificatePinner
    // Note: Modern apps may use OkHttp v4+ with API changes
    try {
        var CertificatePinner = Java.use('okhttp3.CertificatePinner');
        CertificatePinner.check.overload('java.lang.String', 'java.util.List').implementation = function(hostname, peerCertificates) {
            console.log("[+] OkHttp CertificatePinner.check() bypassed for: " + hostname);
            return;
        };
        CertificatePinner.check.overload('java.lang.String', '[Ljava.security.cert.Certificate;').implementation = function(hostname, peerCertificates) {
            console.log("[+] OkHttp CertificatePinner.check() bypassed for: " + hostname);
            return;
        };
        CertificatePinner.check$okhttp.overload('java.lang.String', 'java.util.List').implementation = function(hostname, peerCertificates) {
            console.log("[+] OkHttp CertificatePinner.check$okhttp() bypassed for: " + hostname);
            return;
        };
    } catch(e) {
        console.log("[!] OkHttp not found: " + e);
    }

    // OkHttp v4+ (if used, API may differ)
    // Check for okhttp4 package in modern apps
    try {
        var CertificatePinner4 = Java.use('okhttp4.CertificatePinner');
        if (CertificatePinner4) {
            console.log("[+] OkHttp4 CertificatePinner detected - additional hooks may be needed");
            CertificatePinner4.check.implementation = function(hostname, peerCertificates) {
                console.log("[+] OkHttp4 CertificatePinner.check() bypassed for: " + hostname);
                return;
            };
        }
    } catch(e) {
        // OkHttp v4 not present, continue with v3 hooks
    }

    // TrustManager (javax.net.ssl)
    try {
        var X509TrustManager = Java.use('javax.net.ssl.X509TrustManager');
        var TrustManager = Java.registerClass({
            name: 'com.custom.TrustManager',
            implements: [X509TrustManager],
            methods: {
                checkClientTrusted: function(chain, authType) {
                    console.log("[+] checkClientTrusted() bypassed");
                },
                checkServerTrusted: function(chain, authType) {
                    console.log("[+] checkServerTrusted() bypassed");
                },
                getAcceptedIssuers: function() {
                    return [];
                }
            }
        });

        var SSLContext = Java.use('javax.net.ssl.SSLContext');
        SSLContext.init.overload('[Ljavax.net.ssl.KeyManager;', '[Ljavax.net.ssl.TrustManager;', 'java.security.SecureRandom').implementation = function(km, tm, sr) {
            console.log("[+] SSLContext.init() - replacing TrustManager");
            this.init(km, [TrustManager.$new()], sr);
        };
    } catch(e) {
        console.log("[!] TrustManager hook failed: " + e);
    }

    // WebView SSL error handler
    try {
        var WebViewClient = Java.use('android.webkit.WebViewClient');
        WebViewClient.onReceivedSslError.implementation = function(view, handler, error) {
            console.log("[+] WebViewClient.onReceivedSslError() bypassed");
            handler.proceed();
        };
    } catch(e) {
        console.log("[!] WebView SSL handler not found: " + e);
    }

    console.log("[*] SSL Pinning Bypass Complete");
});
```

#### Root Detection Bypass

```javascript
// root-detection-bypass.js
Java.perform(function() {
    console.log("[*] Root Detection Bypass Started");

    // File.exists() hooks (legacy methods)
    var File = Java.use('java.io.File');
    File.exists.implementation = function() {
        var path = this.getAbsolutePath();
        var rootPaths = ['/su', '/system/app/Superuser.apk', '/sbin/su', '/system/xbin/su',
                        '/system/bin/su', '/system/su', '/vendor/bin/su', '/magisk', '/proc/self/mounts'];

        for (var i = 0; i < rootPaths.length; i++) {
            if (path.indexOf(rootPaths[i]) >= 0) {
                console.log("[+] Blocking root path check: " + path);
                return false;
            }
        }
        return this.exists();
    };

    // Runtime.exec() hooks (legacy methods)
    try {
        var Runtime = Java.use('java.lang.Runtime');
        Runtime.exec.overload('java.lang.String').implementation = function(cmd) {
            if (cmd.indexOf('su') >= 0 || cmd.indexOf('which su') >= 0) {
                console.log("[+] Blocking exec: " + cmd);
                throw Java.use('java.io.IOException').$new("Command not found");
            }
            return this.exec(cmd);
        };
    } catch(e) {
        console.log("[!] Runtime.exec hook failed: " + e);
    }

    // Common root detection libraries (legacy methods)
    try {
        var RootBeer = Java.use('com.scottyab.rootbeer.RootBeer');
        RootBeer.isRooted.implementation = function() {
            console.log("[+] RootBeer.isRooted() -> false");
            return false;
        };
        RootBeer.isRootedWithoutBusyboxCheck.implementation = function() {
            console.log("[+] RootBeer.isRootedWithoutBusyboxCheck() -> false");
            return false;
        };
    } catch(e) {}

    // Modern root detection bypass (2025)
    // Bypassing Magisk DenyList, Zygisk, Shamiko, and systemless root hiding
    try {
        // Hook process listing to hide root processes
        var Process = Java.use('android.os.Process');
        // NOTE: This hook uses an approximate signature. Verify against target Android version.
        Process.start.overload('java.lang.String', 'java.lang.String', '[Ljava.lang.String', 'java.io.FileDescriptor', 'java.io.FileDescriptor').implementation = function(cmd, dir, env, redirectsOut, redirectsErr) {
            var commandStr = cmd.toString();
            if (commandStr.indexOf('magisk') >= 0 || commandStr.indexOf('zygisk') >= 0) {
                console.log("[+] Blocking process listing: " + commandStr);
                return;
            }
            return this.start(cmd, dir, env, redirectsOut, redirectsErr);
        };

        // Hook SELinux/AVC denials
        try {
            var SELinux = Java.use('android.os.SELinux');
            SELinux.checkContext.implementation = function(context) {
                var ctx = context.toString();
                console.log("[+] SELinux.checkContext() called: " + ctx);
                // Return unconfined to bypass some checks
                if (ctx.indexOf('unconfined') >= 0) {
                    console.log("[+] Allowing unconfined context");
                    return;
                }
                return this.checkContext(context);
            };
        } catch(e) {}

        // Hook native library detection (JNI)
        try {
            var System = Java.use('java.lang.System');
            System.loadLibrary.implementation = function(libname) {
                console.log("[+] System.loadLibrary(" + libname + ") called");
                if (libname.indexOf('libriru') >= 0 || libname.indexOf('libzygisk') >= 0) {
                    console.log("[+] Blocking root library load: " + libname);
                    return;
                }
                return this.loadLibrary(libname);
            };
        } catch(e) {}

        // Hook service binding for hidden root services
        try {
            var ServiceManager = Java.use('android.app.ServiceManager');
            // NOTE: android.app.ServiceManager may not have startService with these params. Verify class methods before hooking.
            ServiceManager.startService.implementation = function(service, name, isForeground, startId) {
                var serviceStr = name.toString();
                if (serviceStr.indexOf('magisk') >= 0 || serviceStr.indexOf('shamiko') >= 0) {
                    console.log("[+] Blocking root service: " + serviceStr);
                    return;
                }
                return this.startService(service, name, isForeground, startId);
            };
        } catch(e) {}
    } catch(e) {
        console.log("[!] Modern root bypass hooks failed: " + e);
    }

    console.log("[*] Root Detection Bypass Complete (Legacy + Modern methods)");
});
```

#### Crypto Interception

```javascript
// crypto-intercept.js
Java.perform(function() {
    console.log("[*] Crypto Interception Started");

    // Cipher
    var Cipher = Java.use('javax.crypto.Cipher');
    Cipher.init.overload('int', 'java.security.Key').implementation = function(mode, key) {
        var modeStr = mode === 1 ? 'ENCRYPT' : 'DECRYPT';
        console.log("[+] Cipher.init(" + modeStr + ", " + key.getClass().getName() + ")");
        return this.init(mode, key);
    };
    Cipher.doFinal.overload('[B').implementation = function(data) {
        var result = this.doFinal(data);
        var algorithm = this.getAlgorithm();
        console.log("[+] Cipher.doFinal() - Algorithm: " + algorithm);
        console.log("    Input (" + data.length + " bytes): " + bytesToHex(data));
        console.log("    Output (" + result.length + " bytes): " + bytesToHex(result));
        return result;
    };

    // MessageDigest (hash)
    var MessageDigest = Java.use('java.security.MessageDigest');
    MessageDigest.digest.overload('[B').implementation = function(data) {
        var result = this.digest(data);
        console.log("[+] MessageDigest.digest() - Algorithm: " + this.getAlgorithm());
        console.log("    Input: " + bytesToHex(data));
        console.log("    Output: " + bytesToHex(result));
        return result;
    };

    // SecretKeySpec (key creation)
    var SecretKeySpec = Java.use('javax.crypto.spec.SecretKeySpec');
    SecretKeySpec.$init.overload('[B', 'java.lang.String').implementation = function(key, algorithm) {
        console.log("[+] SecretKeySpec created - Algorithm: " + algorithm);
        console.log("    Key material: " + bytesToHex(key));
        return this.$init(key, algorithm);
    };

    function bytesToHex(bytes) {
        var hex = '';
        for (var i = 0; i < Math.min(bytes.length, 64); i++) {
            hex += ('0' + (bytes[i] & 0xFF).toString(16)).slice(-2);
        }
        return hex + (bytes.length > 64 ? '...' : '');
    }

    console.log("[*] Crypto Interception Active");
});
```

### Frida Command Reference

```bash
# List processes
frida-ps -U
frida-ps -Uai

# Attach to running app
frida -U -n "App Name"

# Spawn app (before any code runs)
frida -U -f com.target.app

# Spawn with script
frida -U -f com.target.app -l script.js

# Attach with script
frida -U -n "App Name" -l script.js

# Load script after attach
frida -U -n "App Name"
# Then in REPL: %load script.js
```

## 3. Objection Commands

```bash
# Installation
pip install objection

# Start
objection -g com.target.app explore

# SSL pinning
android sslpinning disable

# Root detection
android root disable
android root status

# Memory
memory list modules
memory search "password"
memory dump all dump.bin

# Hooking
android hooking list classes
android hooking list class_methods com.target.app.ClassName
android hooking watch class_method com.target.app.ClassName.methodName

# File system
ls /data/data/com.target.app/
cat /data/data/com.target.app/shared_prefs/prefs.xml

# WebView
android webview get_javascript_interfaces
android webview intercept on

# Keystore
android keystore list

# SQLite
sqlite connect /data/data/com.target.app/databases/app.db
sqlite execute "SELECT * FROM users"

# Clipboard
android clipboard monitor
android clipboard get

# Custom command
! ls -la /data/data/com.target.app/
```

## 4. SSL Pinning Escalation Playbook

### Decision Tree

Use the lowest-noise technique that works, then escalate only when needed:

1. **Validate proxy trust first**
   Confirm the device trusts your Burp/mitmproxy CA. If CA trust is broken, pinning bypass alone will not restore traffic interception.
2. **Try Objection for common Java pinning**
   `android sslpinning disable`
3. **Escalate to Frida bypass scripts**
   Use the bundled `ssl-pinning-bypass.js` or a vetted CodeShare script such as `akabe1/frida-multiple-unpinning`.
4. **Trace custom pinning logic**
   Use `frida-trace`, class search, or targeted hooks when the app uses custom `TrustManager`, `CertificatePinner`, TrustKit, or obfuscated logic.
5. **Choose one static tampering path**
   Override `network_security_config`, replace pins, swap packaged certificates, or update `BKS/JKS` truststores.
6. **Escalate to native analysis**
   If traffic still fails, treat it as native / BoringSSL / custom TLS and pivot to `native-hook.js`, `rasp-bypass.md`, or framework-specific references.

### Fast Path Commands

```bash
# 1. Common Java pinning
objection -g com.target.app explore --startup-command "android sslpinning disable"

# 2. Bundled Frida bypass
frida -U -f com.target.app -l assets/frida-scripts/ssl-pinning-bypass.js

# 3. CodeShare escalation (broad coverage)
frida --codeshare akabe1/frida-multiple-unpinning -U -f com.target.app

# 4. Trace suspected custom pinning methods
frida-trace -U -f com.target.app -j 'okhttp3.CertificatePinner!*'
frida-trace -U -f com.target.app -j '*TrustManager*!*'
```

### Static Triage for Custom Pinning

Prefer `rg` for cross-platform searches:

```bash
rg -n 'networkSecurityConfig|CertificatePinner|TrustManager|TrustKit|PinningTrustManager|sha256/|sha1/' jadx-output/sources decoded
rg --files decoded | rg '\\.(cer|crt|pem|bks|jks)$'
rg -n 'BEGIN CERTIFICATE|subjectAltName|public key hash' decoded jadx-output/sources
```

### Choose One Static Tampering Path

| Path | Use when | Notes |
|---|---|---|
| Add / override `network_security_config.xml` | App only blocks user CAs on Android 7+ | Fastest route for testing user-installed CA trust |
| Remove manifest `android:networkSecurityConfig` reference | App does not depend on NSC-specific behavior | Do **not** do this blindly for TrustKit-backed apps |
| Edit existing NSC pins | NSC already contains pin sets | Prefer replacing pins over deleting the file |
| Replace packaged CA / cert files | App ships `*.cer`, `*.crt`, `*.pem` | Good when trust anchors are bundled in assets or `res/raw` |
| Import proxy CA into `BKS` / `JKS` truststore | App ships `*.bks` / `*.jks` | Requires `keytool` and correct store password/provider |

### TrustKit & NSC Guidance

- If the app uses platform trust only, adding a permissive `network_security_config.xml` is often enough.
- If the app uses **TrustKit**, removing the NSC reference may break app initialization or leave pinning logic intact.
- For TrustKit and similar frameworks, prefer:
  1. editing pin values;
  2. replacing packaged trust anchors;
  3. dynamic hooks via `ssl-pinning-bypass.js`.

### Truststore Replacement (`BKS` / `JKS`)

```bash
# Inspect truststore contents
keytool -list \
  -keystore decoded/res/raw/truststore.bks \
  -storetype BKS \
  -provider org.bouncycastle.jce.provider.BouncyCastleProvider \
  -providerpath /path/to/bcprov.jar \
  -storepass password

# Import proxy CA
keytool -importcert -v -trustcacerts \
  -file proxy.cer \
  -alias proxyca \
  -keystore decoded/res/raw/truststore.bks \
  -storetype BKS \
  -provider org.bouncycastle.jce.provider.BouncyCastleProvider \
  -providerpath /path/to/bcprov.jar \
  -storepass password
```

### When to Escalate Beyond Java Hooks

Escalate immediately when you see:

- Flutter / BoringSSL traffic that ignores Java `TrustManager` hooks
- native libraries performing TLS or certificate parsing
- obfuscated pinning code that survives Objection and universal Frida scripts
- packaged certs plus runtime checks

Relevant follow-ups:
- `rasp-bypass.md` (covers BoringSSL native TLS)
- `flutter-security.md`
- `native-hook.js`
- `apk-modification-guide.md`

## 5. APK Repackaging

### Complete Workflow

```bash
# 1. Decode
apktool d app.apk -o decoded/

# 2. Edit
# - Modify smali files
# - Edit AndroidManifest.xml
# - Modify resources

# 3. Rebuild
apktool b decoded/ -o modified.apk

# 4. Align
zipalign -v 4 modified.apk aligned.apk

# 5. Sign
apksigner sign --ks debug.keystore --ks-key-alias androiddebugkey aligned.apk

# 6. Verify
apksigner verify --verbose --print-certs aligned.apk

# 7. Install
adb install aligned.apk
```

### Common Patches

**Debuggable App:**
```xml
<!-- In AndroidManifest.xml, add or modify: -->
<application android:debuggable="true" ...>
```

**Allow Backup:**
```xml
<!-- For extracting data later -->
<application android:allowBackup="true" ...>
```

**Override SSL Trust via `network_security_config`:**
```xml
<!-- 1. Create or edit res/xml/network_security_config.xml -->
<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
    <base-config cleartextTrafficPermitted="true">
        <trust-anchors>
            <certificates src="system"/>
            <certificates src="user"/>
        </trust-anchors>
    </base-config>
</network-security-config>

<!-- 2. Reference it in AndroidManifest.xml <application> tag -->
<!-- If the app already uses TrustKit or an existing pinned NSC, edit the existing config instead of replacing it blindly. -->
<application
    android:networkSecurityConfig="@xml/network_security_config"
    ...>
```

## 6. Traffic Interception

### Burp Suite Setup

```bash
# 1. Configure proxy on device
# Settings > WiFi > Long-press network > Modify > Advanced > Proxy > Manual
# Hostname: <PC-IP-ADDRESS>
# Port: 8080

# 2. Install Burp CA certificate
# a. Export from Burp: http://burp/cert (save as .cer)
# b. Copy to device: adb push burp.cer /sdcard/Download/
# c. Install: Settings > Security > Install certificate > CA certificate

# 3. Android 7+ requires either:
#    - network_security_config.xml with user certificates
#    - Or install cert as system cert (requires root)
```

### mitmproxy Setup

```bash
# Start proxy
mitmproxy --listen-port 8080

# Or mitmdump for CLI
mitmdump --listen-port 8080

# Certificate installation same as Burp
```

### Android 7+ Certificate Trust

```xml
<!-- res/xml/network_security_config.xml -->
<network-security-config>
    <debug-overrides>
        <trust-anchors>
            <certificates src="user"/>
        </trust-anchors>
    </debug-overrides>
    <base-config>
        <trust-anchors>
            <certificates src="system"/>
            <certificates src="user"/>
        </trust-anchors>
    </base-config>
</network-security-config>
```

```bash
# System cert (root required)
# Android 10-13:
# Note: /system/etc/security/cacerts/ is the legacy path, works for Android 10-13 only
adb root
adb remount
adb push burp.cer /system/etc/security/cacerts/
adb shell chmod 644 /system/etc/security/cacerts/burp.cer
adb reboot

# Android 14+ (NEW PATH - uses APEX module):
# Note: Android 14 changed system certificate store location to Conscrypt APEX module (/apex/com.android.conscrypt/cacerts/)
# The old path (/system/etc/security/cacerts/) no longer works on Android 14+
adb root
adb remount
adb push burp.cer /apex/com.android.conscrypt/cacerts/
adb shell chmod 644 /apex/com.android.conscrypt/cacerts/burp.cer
adb reboot

# Alternative: Use Magisk module for user cert injection (no reboot needed)
# Some modern devices require module-based approach for Android 14+
```