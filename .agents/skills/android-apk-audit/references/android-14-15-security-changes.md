# Android 14 & 15 Security Changes - Pentesting Reference

## Overview

This document covers critical security changes in Android 14 (API 34) and Android 15 (API 35) that impact mobile penetration testing techniques. As of August 2024, Google Play requires apps to target API 34+.

**Key Impact:**
- Intent hijacking significantly harder
- PendingIntent exploitation mitigated
- Background attack vectors reduced
- New restrictions on inter-app communication
- Enhanced sandboxing and malware detection

---

## Android 14 (API 34) Security Changes

### 1. Implicit Intent Restrictions

**Change:** Implicit intents are blocked when targeting apps that don't explicitly handle them.

**Technical Details:**
- System prevents implicit intents from reaching apps not designed to handle them
- Exported components must explicitly handle specific intent actions
- Reduces attack surface for intent hijacking and confused deputy attacks

**Pentesting Impact:**
- Traditional implicit intent injection attacks fail
- Must use explicit intents with package/component names
- Requires more precise targeting of vulnerable components

**Testing Commands:**

```bash
# Check if target API is 34+
adb shell dumpsys package com.target.app | grep targetSdk

# Attempt implicit intent injection (will fail on API 34+)
adb shell am start -a android.intent.action.VIEW -d "malicious://data"

# Use explicit intent instead
adb shell am start -n com.target.app/com.target.app.VulnerableActivity

# List exported components
adb shell dumpsys package com.target.app | grep -A 5 "exported=true"
```

**Drozer Example (API 34+ limitations):**

```python
# Old method - implicit intent injection (may fail on API 34+)
run app.activity.start --action android.intent.action.VIEW \
  --data-uri "malicious://payload"

# New method - explicit component targeting
run app.activity.start --component com.target.app \
  com.target.app.VulnerableActivity
```

**Frida Script - Testing Implicit Intent Restrictions:**

```javascript
// test-implicit-intents.js
Java.perform(function() {
    var Intent = Java.use("android.content.Intent");
    var Context = Java.use("android.content.Context");

    // Hook startActivity to log intent types
    Context.startActivity.overload('android.content.Intent').implementation = function(intent) {
        console.log("[*] startActivity called");
        console.log("    Action: " + intent.getAction());
        console.log("    Component: " + intent.getComponent());
        console.log("    Package: " + intent.getPackage());
        console.log("    Data: " + intent.getDataString());
        console.log("    Explicit: " + intent.isExplicit());

        this.startActivity(intent);
    };

    // Monitor SecurityException for blocked intents
    var Exception = Java.use("java.lang.SecurityException");
    Exception.$init.overload('java.lang.String').implementation = function(msg) {
        console.log("[!] SecurityException: " + msg);
        this.$init(msg);
    };
});
```

---

### 2. PendingIntent Mutability Requirements

**Change:** FLAG_IMMUTABLE is required for all PendingIntents to prevent malicious modification.

**Technical Details:**
- Apps targeting API 31+ (Android 12) must use FLAG_IMMUTABLE
- Prevents malicious apps from modifying PendingIntent contents
- Default mutable PendingIntents deprecated and blocked

**Pentesting Impact:**
- PendingIntent hijacking significantly harder
- Cannot inject malicious extras into PendingIntents
- Reduces effectiveness of confused deputy attacks

**Testing Commands:**

```bash
# Search for PendingIntent creation in APK
apktool d app.apk -o app-decompiled
grep -r "PendingIntent" app-decompiled/smali*/ | grep -i "getActivity\|getService\|getBroadcast"

# Check for FLAG_IMMUTABLE usage
grep -r "FLAG_IMMUTABLE" app-decompiled/smali*/
grep -r "0x04000000" app-decompiled/smali*/  # FLAG_IMMUTABLE value (1<<26)

# List all PendingIntents in decompiled code
find app-decompiled -name "*.smali" -exec grep -l "PendingIntent" {} \;
```

**Manifest Analysis:**

```xml
<!-- Check for PendingIntent permissions in manifest -->
<uses-permission android:name="android.permission.SEND_RESPOND_VIA_MESSAGE" />

<!-- Vulnerable pattern (pre-API 34) -->
<!-- PendingIntents without FLAG_IMMUTABLE -->
```

**Frida Script - PendingIntent Analysis:**

```javascript
// pendingintent-analysis.js
Java.perform(function() {
    var PendingIntent = Java.use("android.app.PendingIntent");
    var Flags = Java.use("android.app.PendingIntent").FLAG_IMMUTABLE.value;

    // Hook PendingIntent.getActivity
    PendingIntent.getActivity.overload(
        'android.content.Context', 'int', 'android.content.Intent', 'int'
    ).implementation = function(context, requestCode, intent, flags) {
        var isImmutable = (flags & Flags) !== 0;
        console.log("[*] PendingIntent.getActivity");
        console.log("    Intent: " + intent.getAction());
        console.log("    Flags: " + flags + " (0x" + flags.toString(16) + ")");
        console.log("    Immutable: " + isImmutable);

        if (!isImmutable) {
            console.log("[!] WARNING: Mutable PendingIntent detected!");
        }

        return this.getActivity(context, requestCode, intent, flags);
    };

    // Hook PendingIntent.getService
    PendingIntent.getService.overload(
        'android.content.Context', 'int', 'android.content.Intent', 'int'
    ).implementation = function(context, requestCode, intent, flags) {
        var isImmutable = (flags & Flags) !== 0;
        console.log("[*] PendingIntent.getService");
        console.log("    Intent: " + intent.getAction());
        console.log("    Flags: " + flags);
        console.log("    Immutable: " + isImmutable);

        if (!isImmutable) {
            console.log("[!] WARNING: Mutable PendingIntent detected!");
        }

        return this.getService(context, requestCode, intent, flags);
    };
});
```

---

### 3. Stricter Certificate Validation and TLS Defaults

**Change:** Enhanced certificate validation and stricter TLS defaults.

**Technical Details:**
- Improved default TLS configuration
- Stricter certificate pinning validation
- Better protection against MITM attacks
- Network Security Config enforcement

**Pentesting Impact:**
- MITM attacks harder without certificate bypass
- Default Burp CA certificates rejected
- Requires explicit trust configuration for testing
- SSL pinning bypass still possible but more complex

**Testing Commands:**

```bash
# Check network security configuration
adb shell dumpsys package com.target.app | grep -A 20 "NetworkSecurityConfig"

# Extract Network Security Config from APK
unzip -p app.apk AndroidManifest.xml | grep -i networkSecurityConfig
unzip -p app.apk res/xml/network_security_config.xml

# Check if custom trust stores are used
adb shell dumpsys package com.target.app | grep "uses-permission" | grep network

# Test TLS connection with custom CA
openssl s_client -connect api.target.com:443 -showcerts
```

**Network Security Config Analysis:**

```xml
<!-- res/xml/network_security_config.xml -->
<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
    <domain-config cleartextTrafficPermitted="false">
        <domain includeSubdomains="true">api.target.com</domain>
    </domain-config>

    <!-- Check for debug-overrides -->
    <debug-overrides>
        <trust-anchors>
            <certificates src="user" />
            <certificates src="system" />
        </trust-anchors>
    </debug-overrides>
</network-security-config>
```

**Frida Script - TLS Monitoring:**

```javascript
// tls-monitoring.js
Java.perform(function() {
    var SSLContext = Java.use("javax.net.ssl.SSLContext");
    var TrustManager = Java.use("javax.net.ssl.TrustManager");
    var X509TrustManager = Java.use("javax.net.ssl.X509TrustManager");

    // Hook SSLContext initialization
    SSLContext.init.overload(
        '[Ljavax.net.ssl.KeyManager;', '[Ljavax.net.ssl.TrustManager;', 'java.security.SecureRandom'
    ).implementation = function(keyManagers, trustManagers, secureRandom) {
        console.log("[*] SSLContext.init called");
        console.log("    TrustManagers: " + trustManagers.length);

        for (var i = 0; i < trustManagers.length; i++) {
            var tm = trustManagers[i];
            if (tm.getClass().getName().equals("javax.net.ssl.X509TrustManager")) {
                console.log("    X509TrustManager: " + tm.getClass().getName());
            }
        }

        return this.init(keyManagers, trustManagers, secureRandom);
    };

    // Hook X509TrustManager checkServerTrusted
    X509TrustManager.checkServerTrusted.implementation = function(chain, authType) {
        console.log("[*] checkServerTrusted called");
        console.log("    AuthType: " + authType);
        console.log("    Chain length: " + chain.length);

        try {
            return this.checkServerTrusted(chain, authType);
        } catch (e) {
            console.log("[!] Certificate validation failed: " + e);
            throw e;
        }
    };
});
```

---

### 4. New Runtime Permission Patterns

**Change:** Enhanced runtime permission handling with new groupings.

**Technical Details:**
- New permission groups and behaviors
- Better user control over sensitive data
- One-time permissions for camera, microphone, location
- Improved permission revocation handling

**Pentesting Impact:**
- Easier to test permission boundaries
- Better visibility into permission usage
- Temporary grants require re-approval

**Testing Commands:**

```bash
# Grant/revoke permissions
adb shell pm grant com.target.app android.permission.CAMERA
adb shell pm revoke com.target.app android.permission.CAMERA

# List granted permissions
adb shell dumpsys package com.target.app | grep "granted=true"

# List requested permissions
adb shell dumpsys package com.target.app | grep "requested permissions"

# Check for runtime permissions in manifest
apktool d app.apk -o app-decompiled
grep -r "uses-permission" app-decompiled/AndroidManifest.xml
```

**Frida Script - Permission Monitoring:**

```javascript
// permission-monitor.js
Java.perform(function() {
    var Context = Java.use("android.content.Context");
    var PackageManager = Java.use("android.content.pm.PackageManager");

    // Hook checkSelfPermission
    Context.checkSelfPermission.implementation = function(permission) {
        var result = this.checkSelfPermission(permission);
        console.log("[*] checkSelfPermission: " + permission);
        console.log("    Result: " + result);

        if (result === PackageManager.PERMISSION_GRANTED.value) {
            console.log("    Status: GRANTED");
        } else {
            console.log("    Status: DENIED");
        }

        return result;
    };

    // Hook requestPermissions
    Context.requestPermissions.overload('[Ljava.lang.String;', 'int').implementation = function(permissions, requestCode) {
        console.log("[*] requestPermissions called");
        console.log("    RequestCode: " + requestCode);
        console.log("    Permissions: " + Java.array('java.lang.String', permissions).join(', '));

        return this.requestPermissions(permissions, requestCode);
    };
});
```

---

## Android 15 (API 35) Security Changes

### 1. Foreground Service Restrictions

**Change:** Stricter requirements for foreground service types with timeouts.

**Technical Details:**
- `dataSync` jobs have a maximum runtime of 6 hours within a 24-hour period
- New `mediaProjection` and `mediaProcessing` types
- Enhanced type validation and enforcement
- Better resource management and battery optimization

**Pentesting Impact:**
- Long-running foreground services limited
- Monitoring background activities harder
- Requires explicit service type declarations
- Timeout-based attacks harder to execute

**Testing Commands:**

```bash
# Check foreground service types in manifest
adb shell dumpsys package com.target.app | grep -A 5 "service"

# List running foreground services
adb shell dumpsys activity services | grep "fg=" | grep "Fg"

# Check service type declarations
grep -r "foregroundServiceType" app-decompiled/AndroidManifest.xml

# Monitor foreground service lifecycle
adb shell logcat | grep -i "foreground.*service"
```

**Manifest Analysis:**

```xml
<!-- AndroidManifest.xml - Required for API 35 -->
<service
    android:name=".MyForegroundService"
    android:foregroundServiceType="dataSync|mediaPlayback|location"
    android:exported="false" />

<!-- Vulnerable pattern - missing type or timeout -->
<service
    android:name=".BackgroundService"
    android:exported="true">
    <!-- Missing foregroundServiceType -->
</service>
```

**Frida Script - Foreground Service Analysis:**

```javascript
// foreground-service-analysis.js
Java.perform(function() {
    var Service = Java.use("android.app.Service");
    var NotificationManager = Java.use("android.app.NotificationManager");

    // Hook startForeground
    Service.startForeground.overload('int', 'android.app.Notification').implementation = function(id, notification) {
        console.log("[*] startForeground called");
        console.log("    ID: " + id);
        console.log("    Notification: " + notification.getChannelId());

        this.startForeground(id, notification);
    };

    // Hook startForeground with type
    Service.startForeground.overload('int', 'android.app.Notification', 'int').implementation = function(id, notification, foregroundServiceType) {
        console.log("[*] startForeground with type called");
        console.log("    ID: " + id);
        console.log("    Type: " + foregroundServiceType);

        this.startForeground(id, notification, foregroundServiceType);
    };

    // Hook stopForeground
    Service.stopForeground.implementation = function(removeNotification) {
        console.log("[*] stopForeground called");
        console.log("    RemoveNotification: " + removeNotification);

        this.stopForeground(removeNotification);
    };
});
```

---

### 2. Safer Intents Policy

**Change:** Intents without explicit action no longer match intent-filters.

**Technical Details:**
- Intents without action field don't match implicit intent-filters
- Requires explicit action declaration for matching
- Prevents confused deputy attacks via action-less intents
- More precise intent routing

**Pentesting Impact:**
- Action-less intent attacks eliminated
- Intent hijacking requires precise action matching
- Reduces attack surface for intent-based exploits

**Testing Commands:**

```bash
# Test action-less intent (will not match in API 35+)
adb shell am start -n com.target.app/.TargetActivity

# Test with explicit action
adb shell am start -a android.intent.action.MAIN \
  -n com.target.app/.TargetActivity

# Check intent-filter declarations
adb shell dumpsys package com.target.app | grep -A 10 "intent-filter"

# Monitor intent delivery
adb shell logcat | grep -i "intent.*delivery"
```

**Drozer Example (API 35+):**

```python
# Action-less intent - will not match on API 35+
run app.activity.start --component com.target.app \
  com.target.app.TargetActivity

# Must include explicit action
run app.activity.start --action android.intent.action.MAIN \
  --component com.target.app com.target.app.TargetActivity
```

**Frida Script - Intent Policy Testing:**

```javascript
// intent-policy-test.js
Java.perform(function() {
    var Intent = Java.use("android.content.Intent");
    var Context = Java.use("android.content.Context");

    // Hook all startActivity variants
    Context.startActivity.overload('android.content.Intent').implementation = function(intent) {
        console.log("[*] startActivity");
        console.log("    Action: " + intent.getAction());
        console.log("    Component: " + intent.getComponent());
        console.log("    Package: " + intent.getPackage());
        console.log("    Data: " + intent.getDataString());

        if (intent.getAction() === null) {
            console.log("[!] WARNING: Intent has no action (won't match in API 35+)");
        }

        this.startActivity(intent);
    };

    // Hook sendBroadcast
    Context.sendBroadcast.overload('android.content.Intent').implementation = function(intent) {
        console.log("[*] sendBroadcast");
        console.log("    Action: " + intent.getAction());
        console.log("    Component: " + intent.getComponent());

        if (intent.getAction() === null) {
            console.log("[!] WARNING: Broadcast has no action (won't match in API 35+)");
        }

        this.sendBroadcast(intent);
    };
});
```

---



### 4. Enhanced Malware Protection and Sandboxing

**Change:** Improved sandboxing and malware detection mechanisms.

**Technical Details:**
- Enhanced app sandbox isolation
- Better runtime permission enforcement
- Improved API abuse detection
- Strengthened SELinux policies

**Pentesting Impact:**
- Privilege escalation harder
- Sandbox escape more difficult
- Requires more sophisticated bypasses
- Better detection of exploitation attempts

**Testing Commands:**

```bash
# Check SELinux status
adb shell getenforce

# Check app sandbox restrictions
adb shell ls -Z /data/data/com.target.app/

# Monitor SELinux denials
adb shell logcat | grep -i "avc.*denied"

# Check for system API access
adb shell dumpsys package com.target.app | grep "requested permissions"
```

**Frida Script - Sandbox Analysis:**

```javascript
// sandbox-analysis.js
Java.perform(function() {
    var File = Java.use("java.io.File");
    var Runtime = Java.use("java.lang.Runtime");

    // Monitor file access attempts
    File.$init.overload('java.lang.String').implementation = function(path) {
        console.log("[*] File access: " + path);

        // Check for sandbox escape attempts
        if (path.startsWith("/data/data/") &&
            !path.startsWith("/data/data/com.target.app/")) {
            console.log("[!] WARNING: Potential sandbox escape attempt!");
        }

        return this.$init(path);
    };

    // Monitor exec attempts
    Runtime.exec.overload('[Ljava.lang.String;').implementation = function(cmdarray) {
        var cmd = Java.array('java.lang.String', cmdarray).join(' ');
        console.log("[*] Runtime.exec: " + cmd);

        return this.exec(cmdarray);
    };
});
```

---

## Impact on Pentesting Tools and Techniques

### Traditional Techniques Affected

| Technique | API 34 Impact | API 35 Impact | Mitigation |
|-----------|--------------|--------------|------------|
| Intent Hijacking | Significantly harder | Extremely difficult | Use explicit intents |
| PendingIntent Injection | Blocked by FLAG_IMMUTABLE | Blocked | Find mutable PendingIntents (rare) |
| Background Exfiltration | Reduced | Severely limited | Trigger foreground state |
| MITM Attacks | Harder with TLS defaults | Harder | Frida SSL pinning bypass |
| Component Access | Stricter export rules | Stricter export rules | Target exported components |
| Permission Abuse | Better enforcement | Better enforcement | Request permissions first |

### Updated Pentesting Workflow

```bash
# 1. Initial reconnaissance
adb shell dumpsys package com.target.app > package_info.txt

# 2. Check target API level
grep "targetSdk" package_info.txt

# 3. Analyze manifest
apktool d app.apk -o app-decompiled
cat app-decompiled/AndroidManifest.xml

# 4. Check for security features
grep -i "android:exported" app-decompiled/AndroidManifest.xml
grep -i "networkSecurityConfig" app-decompiled/AndroidManifest.xml

# 5. Test implicit intents (API 34+)
adb shell am start -a android.intent.action.VIEW -d "test://data"

# 6. Test explicit intents (required for API 34+)
adb shell am start -n com.target.app/.TargetActivity

# 7. Monitor with Frida
frida -U -f com.target.app -l script.js

# 8. Test background network (API 35+)
# Put app in background, attempt network access
adb shell am force-stop com.target.app
adb shell am start -n com.target.app/.MainActivity
# (wait, then press home)
# Monitor network attempts
```

---

## Updated Test Cases for Each Change

### Test Case 1: Implicit Intent Restrictions (API 34+)

```bash
#!/bin/bash
# test_implicit_intents.sh

TARGET_PKG="com.target.app"

echo "[*] Testing Implicit Intent Restrictions (API 34+)"

# Test 1: Implicit intent with data
echo "[*] Test 1: Implicit intent with data URI"
adb shell am start -a android.intent.action.VIEW -d "malicious://data"
RESULT=$?

if [ $RESULT -eq 0 ]; then
    echo "[+] Intent delivered (implicit allowed)"
else
    echo "[-] Intent blocked (implicit restricted)"
fi

# Test 2: Explicit intent
echo "[*] Test 2: Explicit intent with component"
adb shell am start -n $TARGET_PKG/$TARGET_PKG.MainActivity
RESULT=$?

if [ $RESULT -eq 0 ]; then
    echo "[+] Explicit intent delivered"
else
    echo "[-] Explicit intent failed"
fi

# Test 3: Action-less intent (API 35+)
echo "[*] Test 3: Action-less intent"
adb shell am start -n $TARGET_PKG/$TARGET_PKG.TargetActivity

echo "[*] Test complete. Check logcat for SecurityExceptions."
adb logcat -d | grep -i "security.*exception" | tail -20
```

---

### Test Case 2: PendingIntent Mutability (API 34+)

```javascript
// test_pendingintent.js
// Usage: frida -U -f com.target.app -l test_pendingintent.js

Java.perform(function() {
    console.log("[*] Testing PendingIntent Mutability (API 34+)");

    var PendingIntent = Java.use("android.app.PendingIntent");
    var Intent = Java.use("android.content.Intent");
    var Context = Java.use("android.content.Context");

    // Hook getActivity
    PendingIntent.getActivity.overload(
        'android.content.Context', 'int', 'android.content.Intent', 'int'
    ).implementation = function(context, requestCode, intent, flags) {
        var IMMUTABLE = PendingIntent.FLAG_IMMUTABLE.value;
        var MUTABLE = PendingIntent.FLAG_MUTABLE.value;
        var CURRENT = PendingIntent.FLAG_UPDATE_CURRENT.value;

        console.log("[*] PendingIntent.getActivity");
        console.log("    RequestCode: " + requestCode);
        console.log("    Action: " + intent.getAction());
        console.log("    Flags: " + flags + " (0x" + flags.toString(16) + ")");
        console.log("    IMMUTABLE: " + ((flags & IMMUTABLE) !== 0));
        console.log("    MUTABLE: " + ((flags & MUTABLE) !== 0));
        console.log("    UPDATE_CURRENT: " + ((flags & CURRENT) !== 0));

        if ((flags & IMMUTABLE) === 0 && (flags & MUTABLE) === 0) {
            console.log("[!] WARNING: PendingIntent is mutable by default!");
            console.log("[!] This may be blocked on API 34+");
        }

        return this.getActivity(context, requestCode, intent, flags);
    };

    // Test injection attempt
    setTimeout(function() {
        console.log("[*] Attempting PendingIntent injection test...");
        var app = Java.use("android.app.ActivityThread").currentApplication();
        var ctx = app.getApplicationContext();

        try {
            var testIntent = Intent.$new();
            testIntent.setAction("android.intent.action.VIEW");

            // Create mutable PendingIntent (should fail on API 34+)
            var mutableFlags = PendingIntent.FLAG_UPDATE_CURRENT.value;
            var pendingIntent = PendingIntent.getActivity(ctx, 0, testIntent, mutableFlags);

            console.log("[+] Mutable PendingIntent created (pre-API 34 behavior)");
        } catch (e) {
            console.log("[-] Failed: " + e);
        }
    }, 2000);
});
```

---

### Test Case 3: Foreground Service Restrictions (API 35+)

```bash
#!/bin/bash
# test_foreground_services.sh

TARGET_PKG="com.target.app"

echo "[*] Testing Foreground Service Restrictions (API 35+)"

# Check manifest for foreground service types
echo "[*] Checking manifest for foregroundServiceType"
adb shell dumpsys package $TARGET_PKG | grep -A 10 "service"

# Test 1: Start service without type (should fail on API 35+)
echo "[*] Test 1: Start service without explicit type"
adb shell am startservice -n $TARGET_PKG/$TARGET_PKG.MyService

# Test 2: Check running foreground services
echo "[*] Test 2: List running foreground services"
adb shell dumpsys activity services | grep "Fg"

# Test 3: Monitor foreground service timeout
echo "[*] Test 3: Monitor for timeout enforcement"
adb shell logcat -c
adb shell logcat | grep -i "foreground.*timeout" &
LOGCAT_PID=$!

# Wait for timeout (6 hours max for dataSync type)
echo "[*] Waiting 6 hours for timeout test..."
sleep 21600

kill $LOGCAT_PID
echo "[*] Timeout test complete"
```

---

### Test Case 4: Background Network Restrictions (API 35+)

```javascript
// test_background_network.js
// Usage: frida -U -f com.target.app -l test_background_network.js

Java.perform(function() {
    console.log("[*] Testing Background Network Restrictions (API 35+)");

    var HttpURLConnection = Java.use("java.net.HttpURLConnection");
    var OkHttpClient = Java.use("okhttp3.OkHttpClient");

    // Track network requests
    var requestCount = 0;

    // Monitor HttpURLConnection
    HttpURLConnection.connect.implementation = function() {
        var url = this.getURL().toString();
        requestCount++;

        console.log("[*] HttpURLConnection Request #" + requestCount);
        console.log("    URL: " + url);

        // Check if app is in background
        var ActivityManager = Java.use("android.app.ActivityManager");
        var RunningAppProcessInfo = Java.use("android.app.ActivityManager$RunningAppProcessInfo");

        var app = Java.use("android.app.ActivityThread").currentApplication();
        var context = app.getApplicationContext();
        var am = context.getSystemService("activity");
        var processes = am.getRunningAppProcesses();
        var pid = android.os.Process.myPid();
        var inForeground = false;

        for (var i = 0; i < processes.size(); i++) {
            var process = processes.get(i);
            if (process.pid === pid) {
                inForeground = process.importance === RunningAppProcessInfo.IMPORTANCE_FOREGROUND.value;
                break;
            }
        }

        console.log("    In Foreground: " + inForeground);

        if (!inForeground) {
            console.log("[!] WARNING: Network request from background!");
            console.log("[!] This may be blocked on API 35+");
        }

        return this.connect();
    };

    // Monitor OkHttp
    var Request = Java.use("okhttp3.Request");
    OkHttpClient.newCall.implementation = function(request) {
        console.log("[*] OkHttp Request #" + (++requestCount));
        console.log("    URL: " + request.url().toString());
        console.log("    Method: " + request.method());

        return this.newCall(request);
    };
});
```

---

## Frida Scripts for Testing New Restrictions

### Comprehensive Testing Script

```javascript
// comprehensive-api34-35-test.js
// Usage: frida -U -f com.target.app -l comprehensive-api34-35-test.js

Java.perform(function() {
    console.log("\n[*] ==========================================");
    console.log("[*] Android 14/15 Security Changes Test Suite");
    console.log("[*] ==========================================\n");

    // 1. Intent Testing
    console.log("[*] Setting up Intent monitoring...");
    var Intent = Java.use("android.content.Intent");
    var Context = Java.use("android.content.Context");

    Context.startActivity.overload('android.content.Intent').implementation = function(intent) {
        console.log("\n[INTENT] startActivity");
        console.log("    Action: " + intent.getAction());
        console.log("    Component: " + intent.getComponent());
        console.log("    Package: " + intent.getPackage());
        console.log("    Data: " + intent.getDataString());
        console.log("    Explicit: " + intent.isExplicit());

        if (intent.getAction() === null) {
            console.log("    [API 35+] WARNING: No action specified!");
        }

        this.startActivity(intent);
    };

    Context.sendBroadcast.overload('android.content.Intent').implementation = function(intent) {
        console.log("\n[INTENT] sendBroadcast");
        console.log("    Action: " + intent.getAction());
        console.log("    Component: " + intent.getComponent());

        if (intent.getAction() === null) {
            console.log("    [API 35+] WARNING: No action specified!");
        }

        this.sendBroadcast(intent);
    };

    // 2. PendingIntent Testing
    console.log("[*] Setting up PendingIntent monitoring...");
    var PendingIntent = Java.use("android.app.PendingIntent");
    var IMMUTABLE = PendingIntent.FLAG_IMMUTABLE.value;
    var MUTABLE = PendingIntent.FLAG_MUTABLE.value;

    var pendingIntentMethods = [
        "getActivity",
        "getActivity",
        "getService",
        "getService",
        "getBroadcast",
        "getBroadcast"
    ];

    PendingIntent.getActivity.overload(
        'android.content.Context', 'int', 'android.content.Intent', 'int'
    ).implementation = function(context, requestCode, intent, flags) {
        console.log("\n[PENDINGINTENT] getActivity");
        console.log("    Intent: " + intent.getAction());
        console.log("    Flags: " + flags + " (0x" + flags.toString(16) + ")");
        console.log("    Immutable: " + ((flags & IMMUTABLE) !== 0));
        console.log("    Mutable: " + ((flags & MUTABLE) !== 0));

        if ((flags & IMMUTABLE) === 0) {
            console.log("    [API 34+] WARNING: Mutable PendingIntent!");
        }

        return this.getActivity(context, requestCode, intent, flags);
    };

    // 3. Foreground Service Testing
    console.log("[*] Setting up Foreground Service monitoring...");
    var Service = Java.use("android.app.Service");

    Service.startForeground.overload('int', 'android.app.Notification').implementation = function(id, notification) {
        console.log("\n[SERVICE] startForeground (no type)");
        console.log("    ID: " + id);
        console.log("    Notification: " + notification.getChannelId());
        console.log("    [API 35+] WARNING: No type specified!");

        this.startForeground(id, notification);
    };

    Service.startForeground.overload('int', 'android.app.Notification', 'int').implementation = function(id, notification, type) {
        console.log("\n[SERVICE] startForeground with type");
        console.log("    ID: " + id);
        console.log("    Type: " + type);
        console.log("    Notification: " + notification.getChannelId());

        this.startForeground(id, notification, type);
    };

    // 4. Network Testing
    console.log("[*] Setting up Network monitoring...");
    var HttpURLConnection = Java.use("java.net.HttpURLConnection");
    var Request = Java.use("okhttp3.Request");

    HttpURLConnection.connect.implementation = function() {
        console.log("\n[NETWORK] HttpURLConnection.connect");
        console.log("    URL: " + this.getURL().toString());

        return this.connect();
    };

    // 5. Permission Testing
    console.log("[*] Setting up Permission monitoring...");
    var PackageManager = Java.use("android.content.pm.PackageManager");

    Context.checkSelfPermission.implementation = function(permission) {
        var result = this.checkSelfPermission(permission);
        console.log("\n[PERMISSION] checkSelfPermission");
        console.log("    Permission: " + permission);
        console.log("    Granted: " + (result === PackageManager.PERMISSION_GRANTED.value));

        return result;
    };

    // 6. Certificate Testing
    console.log("[*] Setting up TLS monitoring...");
    var SSLContext = Java.use("javax.net.ssl.SSLContext");
    var X509TrustManager = Java.use("javax.net.ssl.X509TrustManager");

    SSLContext.init.overload(
        '[Ljavax.net.ssl.KeyManager;', '[Ljavax.net.ssl.TrustManager;', 'java.security.SecureRandom'
    ).implementation = function(keyManagers, trustManagers, secureRandom) {
        console.log("\n[TLS] SSLContext.init");
        console.log("    TrustManagers: " + trustManagers.length);

        for (var i = 0; i < trustManagers.length; i++) {
            var tm = trustManagers[i];
            console.log("    TM[" + i + "]: " + tm.getClass().getName());
        }

        return this.init(keyManagers, trustManagers, secureRandom);
    };

    X509TrustManager.checkServerTrusted.implementation = function(chain, authType) {
        console.log("\n[TLS] checkServerTrusted");
        console.log("    AuthType: " + authType);
        console.log("    Chain: " + chain.length + " certificates");

        try {
            return this.checkServerTrusted(chain, authType);
        } catch (e) {
            console.log("    [!] Certificate validation failed: " + e);
            throw e;
        }
    };

    console.log("[*] Monitoring active. Interact with the app to trigger events...\n");
});
```

---

## ADB Commands for Verifying Enforcement

### API Level Detection

```bash
# Check target SDK version
adb shell dumpsys package com.target.app | grep "targetSdk"

# Check installed SDK version
adb shell getprop ro.build.version.sdk

# Check all packages and their target SDK
adb shell dumpsys package <package-name> | grep targetSdk
```

---

### Intent Enforcement Verification

```bash
# Check intent delivery logs
adb shell logcat | grep -i "intent.*delivery"

# Monitor for SecurityExceptions
adb shell logcat -s AndroidRuntime:E | grep -i "security.*exception"

# Test implicit intent blocking
adb shell am start -a android.intent.action.VIEW -d "test://data"
adb shell logcat -d | grep -i "intent.*blocked"

# Check exported components
adb shell dumpsys package com.target.app | grep -A 5 "exported=true"
```

---

### PendingIntent Enforcement Verification

```bash
# Search for PendingIntent usage in logs
adb shell logcat | grep -i "pendingintent"

# Monitor for PendingIntent security violations
adb shell logcat -s ActivityManager:I | grep -i "pending.*intent"

# Check for FLAG_IMMUTABLE violations
adb shell logcat -d | grep -i "mutable.*pending.*intent"
```

---

### Foreground Service Enforcement Verification

```bash
# List running foreground services
adb shell dumpsys activity services | grep "Fg"

# Check foreground service types
adb shell dumpsys activity services | grep -A 3 "foregroundServiceType"

# Monitor foreground service lifecycle
adb shell logcat | grep -i "foreground.*service"

# Check for timeout enforcement
adb shell logcat | grep -i "foreground.*timeout"
```

---

### Background Network Enforcement Verification

```bash
# Monitor network connections
adb shell netstat | grep com.target.app

# Check for network restriction logs
adb shell logcat | grep -i "background.*network.*restrict"

# Monitor WorkManager jobs
adb shell dumpsys jobscheduler | grep com.target.app

# Check network state changes
adb shell dumpsys connectivity | grep -i "network.*restrict"
```

---

### SELinux and Sandbox Verification

```bash
# Check SELinux status
adb shell getenforce

# Check SELinux denials
adb shell logcat | grep -i "avc.*denied"

# Check app sandbox context
adb shell ls -Z /data/data/com.target.app/

# Monitor for sandbox violations
adb shell logcat -s SELinux:D | grep -i "denied.*com.target.app"
```

---

## Manifest Analysis Checklist for API 34/35

### AndroidManifest.xml Analysis

```xml
<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="https://schemas.android.com/apk/res/android"
    package="com.target.app"
    android:versionCode="1"
    android:versionName="1.0">

    <!-- ✓ Check targetSdkVersion -->
    <uses-sdk
        android:minSdkVersion="21"
        android:targetSdkVersion="34" />  <!-- Should be 34 or 35 -->

    <!-- ✓ Check permissions -->
    <uses-permission android:name="android.permission.INTERNET" />
    <uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
    <uses-permission android:name="android.permission.POST_NOTIFICATIONS" />

    <!-- ✓ Check network security config -->
    <!-- API 34+ default behavior is strict -->
    <application
        android:allowBackup="true"
        android:icon="@mipmap/ic_launcher"
        android:label="@string/app_name"
        android:networkSecurityConfig="@xml/network_security_config"
        android:theme="@style/AppTheme">

        <!-- ✓ Check exported attribute (API 34+ stricter) -->
        <activity
            android:name=".MainActivity"
            android:exported="true">  <!-- Should be false unless necessary -->

            <!-- ✓ Check intent-filter actions (API 35+) -->
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>
        </activity>

        <!-- ✓ Check service type (API 35+ required) -->
        <service
            android:name=".MyForegroundService"
            android:exported="false"
            android:foregroundServiceType="dataSync|location">  <!-- Required for API 35+ -->
        </service>

        <!-- ✓ Check receiver exported status -->
        <receiver
            android:name=".MyBroadcastReceiver"
            android:exported="false">  <!-- Should be false by default -->

            <!-- ✓ Check for action-less intent-filters (API 35+) -->
            <intent-filter>
                <action android:name="com.target.app.ACTION_CUSTOM" />
            </intent-filter>
        </receiver>

        <!-- ✓ Check provider exported status -->
        <provider
            android:name=".MyContentProvider"
            android:authorities="com.target.app.provider"
            android:exported="false" />  <!-- Should be false -->

    </application>
</manifest>
```

---

### Analysis Checklist

```
[ ] Target SDK Level
    [ ] Is targetSdkVersion >= 34?
    [ ] If yes, prepare for API 34+ restrictions

[ ] Exported Components
    [ ] Are exported components necessary?
    [ ] Are exported components properly protected?
    [ ] Intent filters have explicit actions?

[ ] PendingIntents
    [ ] Are PendingIntents using FLAG_IMMUTABLE?
    [ ] Check all PendingIntent.getActivity/getService/getBroadcast calls
    [ ] Look for mutable flags (pre-API 34 pattern)

[ ] Foreground Services
    [ ] Are foreground service types declared?
    [ ] Is timeout considered for dataSync type?
    [ ] Are exported foreground services necessary?

[ ] Network Security
    [ ] Is networkSecurityConfig defined?
    [ ] Are custom trust stores configured?
    [ ] Is cleartext traffic permitted appropriately?

[ ] Permissions
    [ ] Are runtime permissions properly requested?
    [ ] Are sensitive permissions justified?
    [ ] Are permission revocations handled?

[ ] Deep Links
    [ ] Are deep link handlers properly validated?
    [ ] Are exported activities with deep links necessary?
    [ ] Are intent-filter actions explicit?

[ ] Broadcast Receivers
    [ ] Are receivers exported?
    [ ] Are intent filters specific?
    [ ] Are actions explicitly defined?

[ ] Content Providers
    [ ] Are providers exported?
    [ ] Are permissions required for access?
    [ ] Are path permissions configured?

[ ] Background Processing
    [ ] Is background network access needed?
    [ ] Is WorkManager used for background tasks?
    [ ] Are foreground services used appropriately?
```

---

## Automated Manifest Analysis Script

```python
#!/usr/bin/env python3
# analyze_manifest.py - Automated API 34/35 manifest analysis

import sys
import xml.etree.ElementTree as ET
from pathlib import Path

def check_target_sdk(manifest_path):
    """Check target SDK version"""
    tree = ET.parse(manifest_path)
    root = tree.getroot()

    uses_sdk = root.find('uses-sdk')
    if uses_sdk is not None:
        target_sdk = uses_sdk.get('{https://schemas.android.com/apk/res/android}targetSdkVersion')
        if target_sdk:
            target_sdk = int(target_sdk)
            print(f"[+] Target SDK: {target_sdk}")

            if target_sdk >= 34:
                print("[!] API 34+ restrictions apply")
            if target_sdk >= 35:
                print("[!] API 35+ restrictions apply")

            return target_sdk
    print("[-] Could not determine target SDK")
    return None

def check_exported_components(manifest_path):
    """Check exported components"""
    tree = ET.parse(manifest_path)
    root = tree.getroot()

    print("\n[*] Checking exported components...")

    application = root.find('application')
    if application is None:
        return

    ns = {'android': 'https://schemas.android.com/apk/res/android'}

    # Check activities
    for activity in application.findall('activity'):
        name = activity.get(f"{{{ns['android']}}}name")
        exported = activity.get(f"{{{ns['android']}}}exported", "false")

        if exported.lower() == "true":
            print(f"    [!] Exported Activity: {name}")

            # Check intent-filters
            intent_filters = activity.findall('intent-filter')
            for intent_filter in intent_filters:
                actions = intent_filter.findall('action')
                if not actions:
                    print(f"        [!] Intent-filter without action (API 35+ issue)")

    # Check services
    for service in application.findall('service'):
        name = service.get(f"{{{ns['android']}}}name")
        exported = service.get(f"{{{ns['android']}}}exported", "false")
        service_type = service.get(f"{{{ns['android']}}}foregroundServiceType")

        print(f"    Service: {name}")
        print(f"        Exported: {exported}")
        if service_type:
            print(f"        Type: {service_type}")
        else:
            print(f"        [!] No foregroundServiceType (API 35+ required)")

    # Check receivers
    for receiver in application.findall('receiver'):
        name = receiver.get(f"{{{ns['android']}}}name")
        exported = receiver.get(f"{{{ns['android']}}}exported", "false")

        if exported.lower() == "true":
            print(f"    [!] Exported Receiver: {name}")

    # Check providers
    for provider in application.findall('provider'):
        name = provider.get(f"{{{ns['android']}}}name")
        exported = provider.get(f"{{{ns['android']}}}exported", "false")

        if exported.lower() == "true":
            print(f"    [!] Exported Provider: {name}")

def main():
    if len(sys.argv) < 2:
        print(f"Usage: {sys.argv[0]} <AndroidManifest.xml>")
        sys.exit(1)

    manifest_path = sys.argv[1]

    if not Path(manifest_path).exists():
        print(f"[-] File not found: {manifest_path}")
        sys.exit(1)

    print(f"[*] Analyzing: {manifest_path}")

    target_sdk = check_target_sdk(manifest_path)
    check_exported_components(manifest_path)

if __name__ == '__main__':
    main()
```

---

## References and URLs

### Official Documentation

- **Android 14 Behavior Changes**: https://developer.android.com/about/versions/14/behavior-changes-14
- **Android 15 Behavior Changes**: https://developer.android.com/about/versions/15/behavior-changes-15
- **Foreground Service Types (Android 15)**: https://developer.android.com/about/versions/15/changes/foreground-service-types
- **Android 14 Security**: https://developer.android.com/about/versions/14/features#security
- **Android 15 Security**: https://developer.android.com/about/versions/15/features#security

### Security Bulletins

- **Android Security Bulletins**: https://source.android.com/security/bulletins
- **Android 14 Security Patch Notes**: https://source.android.com/docs/security/bulletin/2023-10-01
- **Android 15 Security Patch Notes**: https://source.android.com/docs/security/bulletin/2024-10-01

### Pentesting Resources

- **OWASP Mobile Security Testing Guide**: https://owasp.org/www-project-mobile-security-testing-guide/
- **Drozer User Guide**: https://github.com/ReversecLabs/drozer
- **Frida Documentation**: https://frida.re/docs/
- **MobSF (Mobile Security Framework)**: https://github.com/MobSF/Mobile-Security-Framework-MobSF

### Tools and Scripts

- **Android Pentest Toolkit**: https://github.com/Android-Article-Pentesting/Android-Pentest-Toolkit
- **APKTool**: https://github.com/iBotPeaches/Apktool
- **JADX**: https://github.com/skylot/jadx
- **Objection**: https://github.com/sensepost/objection

---

## Appendix: Quick Reference Commands

```bash
# Quick API Level Check
adb shell getprop ro.build.version.sdk

# Quick Target SDK Check
adb shell dumpsys package com.target.app | grep "targetSdk"

# Quick Exported Components List
adb shell dumpsys package com.target.app | grep -A 3 "exported=true"

# Quick Intent Test
adb shell am start -a android.intent.action.VIEW -d "test://data"

# Quick Foreground Service Check
adb shell dumpsys activity services | grep "Fg"

# Quick Network Check
adb shell netstat | grep com.target.app

# Quick SELinux Check
adb shell getenforce

# Quick Certificate Extract
openssl s_client -connect api.target.com:443 -showcerts

# Quick Frida Test
frida -U -f com.target.app -l script.js

# Quick Logcat Filter
adb shell logcat | grep -E "(intent|pending|foreground|network|security)"
```

---

**Document Version:** 1.0
**Last Updated:** 2026-04-01
**Android Versions Covered:** API 34 (Android 14), API 35 (Android 15)
**Applicable Testing Frameworks:** Frida, Objection, Drozer, MobSF, Burp Suite
