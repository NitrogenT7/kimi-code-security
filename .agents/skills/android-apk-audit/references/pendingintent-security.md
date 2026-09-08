# PendingIntent Security Testing Guide

## Overview

**PendingIntents** are tokens that grant another application the ability to perform actions with your application's identity and permissions. They are a powerful Android mechanism that, if misconfigured, can lead to severe security vulnerabilities including:

- **Privilege escalation**: A malicious app can execute actions with your app's permissions
- **Intent spoofing**: Attackers can redirect intents to malicious components
- **Data manipulation**: Sensitive data in PendingIntents can be modified
- **Provenance confusion**: Malicious apps can impersonate legitimate PendingIntent senders

PendingIntents are particularly dangerous because they **persist beyond the creating application's lifecycle** and can be passed to other applications. The receiving application holds a token that allows them to execute actions **with the original app's permissions and identity**.

### OWASP Mobile Top 10 Relevance

PendingIntent vulnerabilities are relevant to OWASP Mobile Top 10 2024 M3 (Insecure Authentication/Authorization) and M8 (Security Misconfiguration) because:

1. **Widespread usage**: Used for notifications, widgets, alarms, and inter-process communication
2. **High-impact vulnerabilities**: Can lead to data theft, account takeover, and system compromise
3. **Active exploitation**: Multiple zero-day exploits in 2024 targeted PendingIntents
4. **Complexity**: Many developers don't understand the security implications of flags

## Attack Vectors

### 1. FLAG_MUTABLE Exploitation

**Problem**: When a PendingIntent is created with `FLAG_MUTABLE`, the receiving application can modify the Intent's action, data, extras, and component name before sending it.

**Attack Scenario**:
```java
// Vulnerable code
PendingIntent pendingIntent = PendingIntent.getActivity(
    context,
    REQUEST_CODE,
    intent,  // Contains sensitive data
    PendingIntent.FLAG_MUTABLE  // ❌ ALLOWS MODIFICATION
);
```

An attacker receiving this PendingIntent can:
- Extract sensitive data from the Intent extras
- Redirect the Intent to a malicious component
- Change the Intent action to perform unauthorized actions
- Add malicious extras

**Impact**:
- **Data exposure**: Sensitive data in extras can be read
- **Intent redirection**: Redirect to attacker-controlled component
- **Privilege escalation**: Execute actions with the victim app's permissions

### 2. PendingIntent Provenance Confusion

**Problem**: Applications often trust PendingIntents based on their content rather than verifying the sender's identity. A malicious app can create a PendingIntent that appears to be from a legitimate app.

**Attack Scenario**:
```java
// Vulnerable receiver - trusts PendingIntent content
public void onReceivePendingIntent(PendingIntent pi) {
    try {
        pi.send();  // ❌ Executes PendingIntent without verifying sender
    } catch (Exception e) { ... }
}
```

**Attack Vector**:
1. Malicious app creates a PendingIntent targeting a system component
2. Sends it to a victim app that accepts PendingIntents
3. Victim app executes the PendingIntent, thinking it's from a trusted source
4. System component executes the action with the victim app's permissions

**Impact**:
- **Account takeover**: Perform actions on behalf of the victim
- **CSRF-like attacks**: Cross-application request forgery
- **Authentication bypass**: Execute authenticated actions without credentials

### 3. Intent Redirection Attacks

**Problem**: PendingIntents can be redirected to different components than originally intended, especially when using implicit intents or weak component targeting.

**Attack Scenario**:
```java
// Vulnerable - uses implicit intent
Intent intent = new Intent("com.example.VIEW_SECRET");
intent.putExtra("secret_data", "sensitive_info");
PendingIntent pi = PendingIntent.getService(context, 0, intent, FLAG_MUTABLE);
```

**Attack Vector**:
1. Attacker intercepts the PendingIntent
2. Modifies the Intent to target a malicious exportable component
3. The malicious component receives and processes the sensitive data

**Impact**:
- **Data theft**: Redirect sensitive intents to malicious components
- **Privilege escalation**: Use victim app's permissions to access protected data
- **Component hijacking**: Hijack legitimate components to perform malicious actions

### 4. Privilege Escalation via PendingIntents

**Problem**: Applications with higher permissions (system apps, privileged apps) may create PendingIntents that can be exploited by less privileged apps.

**Attack Scenario**:
```java
// System app with high permissions
PendingIntent pi = PendingIntent.getActivity(
    context, 0, new Intent(Intent.ACTION_CALL), FLAG_MUTABLE
);
// Passed to unprivileged app
```

**Attack Vector**:
1. System app creates mutable PendingIntent with elevated permissions
2. Unprivileged app receives the PendingIntent
3. Modifies the Intent to perform actions it normally couldn't
4. System executes the action with elevated permissions

**Impact**:
- **System compromise**: Execute privileged operations
- **Permission bypass**: Access protected resources
- **Device takeover**: Gain control over system functions

## Static Analysis Patterns

### Finding PendingIntent Usage

**Search for PendingIntent creation methods**:
```bash
grep -rnE "(PendingIntent\.(getActivity|getService|getBroadcast|getForegroundService)|PendingIntent\.getActivities)" decompiled/
```

**Search for PendingIntent imports**:
```bash
grep -rnE "import android\.app\.PendingIntent" decompiled/
grep -rnE "import androidx\.core\.app\.PendingIntentCompat" decompiled/
```

**Search for PendingIntent variable declarations**:
```bash
grep -rnE "PendingIntent\s+\w+\s*[=;]" decompiled/
```

### Detecting Flag Configurations

**Find FLAG_MUTABLE usage**:
```bash
grep -rnE "PendingIntent\.FLAG_MUTABLE" decompiled/
grep -rnE "int\s+0x\d+[02468aAcCeE]" decompiled/ | grep -i pendingintent
```

**Find FLAG_IMMUTABLE usage**:
```bash
grep -rnE "PendingIntent\.FLAG_IMMUTABLE" decompiled/
```

**Find PendingIntent creation without flags**:
```bash
grep -rnE "PendingIntent\.(getActivity|getService|getBroadcast)\([^)]+\)" decompiled/ | grep -v "FLAG_"
```

**Search for flag constants**:
```bash
grep -rnE "FLAG_(UPDATE_CURRENT|CANCEL_CURRENT|NO_CREATE|ONE_SHOT|IMMUTABLE|MUTABLE)" decompiled/ | head -20
```

### Finding Unsafe PendingIntent Creation Patterns

**Pattern: PendingIntent with FLAG_MUTABLE**:
```bash
grep -rnA 5 -B 5 "PendingIntent\.FLAG_MUTABLE" decompiled/
```

**Pattern: PendingIntent with implicit Intent**:
```bash
grep -rnA 3 "PendingIntent\.(getActivity|getService|getBroadcast)" decompiled/ | grep -vE "setComponent|setClass|setPackage"
```

**Pattern: PendingIntent with sensitive data in extras**:
```bash
grep -rnA 10 "PendingIntent\.(getActivity|getService|getBroadcast)" decompiled/ | grep -E "(putExtra|getStringExtra|getBundle)"
```

**Pattern: PendingIntent passing to other apps**:
```bash
grep -rnA 3 -B 3 "PendingIntent" decompiled/ | grep -E "(Notification\.Builder|RemoteViews|sendIntent|addPendingIntent)"
```

### Detecting PendingIntent Send Operations

**Find PendingIntent.send() calls**:
```bash
grep -rnE "PendingIntent\.\w+\.send\(" decompiled/
grep -rnE "\.send\(\)" decompiled/ | grep -i pendingintent
```

**Find PendingIntent usage in notifications**:
```bash
grep -rnA 5 "Notification\.Builder" decompiled/ | grep -i pendingintent
grep -rnE "setContentIntent|setDeleteIntent|setFullScreenIntent" decompiled/
```

**Find PendingIntent in widgets**:
```bash
grep -rnA 5 "RemoteViews" decompiled/ | grep -i pendingintent
grep -rnE "setOnClickPendingIntent|setPendingIntentTemplate" decompiled/
```

**Find PendingIntent in App Widgets**:
```bash
grep -rnE "AppWidgetManager|updateAppWidget" decompiled/ | grep -i pendingintent
```

### Detecting PendingIntent Receiver Patterns

**Find methods that accept PendingIntents**:
```bash
grep -rnE "(PendingIntent\s+\w+|void\s+\w+.*PendingIntent)" decompiled/
```

**Find onReceive methods that might handle PendingIntents**:
```bash
grep -rnE "public\s+void\s+onReceive\(.*\)" decompiled/ | head -20
```

**Search for intent.send() in receivers**:
```bash
grep -rnA 10 "onReceive" decompiled/ | grep -E "\.send\(\)|PendingIntent"
```

## Dynamic Testing

### Frida Scripts for PendingIntent Interception

**Script 1: Intercept PendingIntent Creation**
```javascript
Java.perform(function() {
    const PendingIntent = Java.use("android.app.PendingIntent");

    PendingIntent.getActivity.overloads.forEach(function(overload) {
        overload.implementation = function(context, requestCode, intent, flags) {
            console.log("[*] PendingIntent.getActivity called");
            console.log("    Intent:", intent);
            console.log("    Flags:", flags);
            console.log("    Action:", intent.getAction());
            console.log("    Component:", intent.getComponent());
            console.log("    Extras:", JSON.stringify(intent.getExtras()));
            return this.getActivity(context, requestCode, intent, flags);
        };
    });

    PendingIntent.getService.overloads.forEach(function(overload) {
        overload.implementation = function(context, requestCode, intent, flags) {
            console.log("[*] PendingIntent.getService called");
            console.log("    Intent:", intent);
            console.log("    Flags:", flags);
            return this.getService(context, requestCode, intent, flags);
        };
    });

    PendingIntent.getBroadcast.overloads.forEach(function(overload) {
        overload.implementation = function(context, requestCode, intent, flags) {
            console.log("[*] PendingIntent.getBroadcast called");
            console.log("    Intent:", intent);
            console.log("    Flags:", flags);
            return this.getBroadcast(context, requestCode, intent, flags);
        };
    });
});
```

**Script 2: Intercept PendingIntent Send**
```javascript
Java.perform(function() {
    const PendingIntent = Java.use("android.app.PendingIntent");

    PendingIntent.send.overloads.forEach(function(overload) {
        overload.implementation = function() {
            console.log("[*] PendingIntent.send called");
            console.log("    PendingIntent:", this.toString());
            console.log("    Intent:", getIntent());

            // Try to extract sensitive data
            try {
                const intent = this.getIntent();
                if (intent) {
                    console.log("    Action:", intent.getAction());
                    console.log("    Extras:", JSON.stringify(intent.getExtras()));
                }
            } catch(e) {
                console.log("    [!] Could not extract intent:", e);
            }

            return this.send.apply(this, arguments);
        };
    });
});
```

**Script 3: Modify Mutable PendingIntents**
```javascript
Java.perform(function() {
    const Intent = Java.use("android.content.Intent");
    const PendingIntent = Java.use("android.app.PendingIntent");

    PendingIntent.send.overloads.forEach(function(overload) {
        overload.implementation = function() {
            console.log("[*] Intercepting PendingIntent.send");

            // Check if mutable
            const flags = Java.cast(this, PendingIntent).isMutable();
            console.log("    Is Mutable:", flags);

            if (flags) {
                console.log("[!] FLAG_MUTABLE detected - Intent can be modified!");

                // Get the intent
                try {
                    const intent = this.getIntent();
                    if (intent) {
                        console.log("    Original Action:", intent.getAction());
                        console.log("    Original Extras:", JSON.stringify(intent.getExtras()));
                        // Attacker could modify here
                    }
                } catch(e) {
                    console.log("    [!] Could not access intent:", e);
                }
            }

            return this.send.apply(this, arguments);
        };
    });
});
```

### Drozer Commands for PendingIntent Testing

**Find components that accept PendingIntents**:
```bash
run app.package.attacksurface com.target.app
```

**Export activities that might process PendingIntents**:
```bash
run app.activity.info -a com.target.app
```

**Test broadcast receivers**:
```bash
run app.broadcast.info -a com.target.app
```

**Send malicious Intent to test component**:
```bash
run app.activity.start --component com.target.app com.target.app.MainActivity --extra string action "MALICIOUS_ACTION"
```

**Test if component accepts external PendingIntents**:
```bash
run app.broadcast.send --action com.target.app.ACCEPT_PENDING_INTENT --extra parcelable malicious_intent
```

### ADB Commands for PendingIntent Testing

**Start activity with Intent extras**:
```bash
adb shell am start -n com.target.app/.MainActivity \
  --es action "TEST_ACTION" \
  --es sensitive_data "test_value"
```

**Send broadcast to test receiver**:
```bash
adb shell am broadcast -a com.target.app.TEST_BROADCAST \
  --es key1 "value1" \
  --es key2 "value2"
```

**Send Intent to service**:
```bash
adb shell am startservice -n com.target.app/.TestService \
  --es action "TEST_SERVICE"
```

**Start activity with explicit component**:
```bash
adb shell am start -n com.target.app/.MainActivity
```

**Test exported activities**:
```bash
adb shell dumpsys package com.target.app | grep -E "Activity|Receiver|Service"
```

**Get pending intent information**:
```bash
adb shell dumpsys notification | grep -A 10 "PendingIntent"
```

**Clear app data to reset state**:
```bash
adb shell pm clear com.target.app
```

**Install test APK to simulate attack**:
```bash
adb install -r attacker.apk
adb shell am start -n com.attacker/.MainActivity
```

## Remediation

### 1. Always Use FLAG_IMMUTABLE

**Rule**: Create all PendingIntents with `FLAG_IMMUTABLE` unless mutability is explicitly required.

```java
// ✅ Secure - Immutable PendingIntent
PendingIntent pendingIntent = PendingIntent.getActivity(
    context,
    REQUEST_CODE,
    intent,
    PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT
);
```

**When to use FLAG_MUTABLE** (rare cases):
- When you explicitly need to allow the receiving app to modify the Intent
- When implementing specific callback mechanisms
- When the PendingIntent is only used internally within your app

```java
// ⚠️ Use FLAG_MUTABLE only when absolutely necessary
PendingIntent pendingIntent = PendingIntent.getActivity(
    context,
    REQUEST_CODE,
    intent,
    PendingIntent.FLAG_MUTABLE | PendingIntent.FLAG_UPDATE_CURRENT
);
```

### 2. Verify Sender Identity

**Rule**: When accepting PendingIntents from external sources, always verify the sender's identity and trust level.

```java
public void onReceivePendingIntent(PendingIntent pi, String senderPackage) {
    // ✅ Verify sender package
    PackageManager pm = context.getPackageManager();
    PackageInfo senderInfo = pm.getPackageInfo(senderPackage, 0);

    // Check if sender is trusted
    if (!isTrustedSender(senderInfo)) {
        Log.e(TAG, "Untrusted sender: " + senderPackage);
        return;
    }

    // Check signature (for system apps)
    if (!verifySignature(senderInfo)) {
        Log.e(TAG, "Invalid signature from: " + senderPackage);
        return;
    }

    // ✅ Execute only after verification
    try {
        pi.send();
    } catch (Exception e) {
        Log.e(TAG, "Failed to send PendingIntent", e);
    }
}
```

**Verification methods**:
- Package name whitelist
- Signature verification
- Permission checks
- App signing certificate comparison

### 3. Use Explicit Intents

**Rule**: Always use explicit intents (with explicit component, class, or package) when creating PendingIntents.

```java
// ❌ Vulnerable - Implicit Intent
Intent intent = new Intent("com.example.VIEW_SECRET");
PendingIntent pi = PendingIntent.getActivity(context, 0, intent, FLAG_IMMUTABLE);

// ✅ Secure - Explicit Intent with component
Intent intent = new Intent(context, SecretActivity.class);
PendingIntent pi = PendingIntent.getActivity(context, 0, intent, FLAG_IMMUTABLE);

// ✅ Secure - Explicit Intent with package
Intent intent = new Intent();
intent.setComponent(new ComponentName("com.example", "com.example.SecretActivity"));
PendingIntent pi = PendingIntent.getActivity(context, 0, intent, FLAG_IMMUTABLE);

// ✅ Secure - Explicit Intent with class
Intent intent = new Intent();
intent.setClass(context, SecretActivity.class);
PendingIntent pi = PendingIntent.getActivity(context, 0, intent, FLAG_IMMUTABLE);
```

### 4. Component Restrictions

**Rule**: Restrict which components can receive PendingIntents by setting the package and component explicitly.

```java
// ✅ Set explicit package
intent.setPackage("com.example.app");

// ✅ Set explicit component
intent.setComponent(new ComponentName(
    "com.example.app",
    "com.example.app.TargetActivity"
));

// ✅ Use explicit class
intent.setClass(context, TargetActivity.class);

// ✅ For services
PendingIntent servicePi = PendingIntent.getService(
    context,
    REQUEST_CODE,
    new Intent(context, TargetService.class),
    PendingIntent.FLAG_IMMUTABLE
);

// ✅ For broadcasts
PendingIntent broadcastPi = PendingIntent.getBroadcast(
    context,
    REQUEST_CODE,
    new Intent(context, TargetReceiver.class),
    PendingIntent.FLAG_IMMUTABLE
);
```

### 5. Avoid Sensitive Data in PendingIntents

**Rule**: Never include sensitive data (passwords, tokens, PII) in Intent extras passed to PendingIntents.

```java
// ❌ Vulnerable - Sensitive data in extras
Intent intent = new Intent(context, ProfileActivity.class);
intent.putExtra("auth_token", "secret_token_12345");
intent.putExtra("user_password", "user_pass");
PendingIntent pi = PendingIntent.getActivity(context, 0, intent, FLAG_IMMUTABLE);

// ✅ Secure - Use secure storage instead
Intent intent = new Intent(context, ProfileActivity.class);
intent.putExtra("user_id", userId);
PendingIntent pi = PendingIntent.getActivity(context, 0, intent, FLAG_IMMUTABLE);

// In TargetActivity, retrieve sensitive data from secure storage
String token = SecureStorage.getAuthToken(userId);
```

### 6. Implement Proper Error Handling

**Rule**: Always wrap PendingIntent.send() calls in try-catch blocks and handle security exceptions.

```java
// ✅ Secure - Proper error handling
try {
    pendingIntent.send();
} catch (PendingIntent.CanceledException e) {
    Log.e(TAG, "PendingIntent was canceled", e);
} catch (Exception e) {
    Log.e(TAG, "Failed to send PendingIntent", e);
    // Consider security implications
}
```

### 7. Use PendingIntentCompat for Backward Compatibility

**Rule**: Use AndroidX's PendingIntentCompat for consistent behavior across Android versions.

```java
// ✅ Using PendingIntentCompat
import androidx.core.app.PendingIntentCompat;

PendingIntent pendingIntent = PendingIntentCompat.getActivity(
    context,
    REQUEST_CODE,
    intent,
    PendingIntent.FLAG_IMMUTABLE,
    false  // mutable
);
```

### 8. Implement PendingIntent Expiry

**Rule**: Set expiration time for PendingIntents when appropriate to reduce attack window.

```java
// ✅ Set expiration time
AlarmManager alarmManager = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
long triggerTime = System.currentTimeMillis() + TimeUnit.HOURS.toMillis(1);
alarmManager.set(
    AlarmManager.RTC_WAKEUP,
    triggerTime,
    pendingIntent
);
```

### 9. Use Permissions for Sensitive Actions

**Rule**: Require custom permissions for actions triggered via PendingIntents.

```java
// AndroidManifest.xml
<permission
    android:name="com.example.app.PERFORM_SENSITIVE_ACTION"
    android:protectionLevel="signature" />

// In component
<intent-filter>
    <action android:name="com.example.app.SENSITIVE_ACTION" />
</intent-filter>

// Require permission
<intent-filter android:permission="com.example.app.PERFORM_SENSITIVE_ACTION">
    <action android:name="com.example.app.SENSITIVE_ACTION" />
</intent-filter>
```

### 10. Security Best Practices Summary

| Practice | Implementation |
|----------|---------------|
| Always use FLAG_IMMUTABLE | `PendingIntent.FLAG_IMMUTABLE` |
| Use explicit intents | `intent.setClass()`, `intent.setComponent()` |
| Verify sender identity | Check package name and signature |
| Avoid sensitive data | Store in secure storage, not extras |
| Set explicit package | `intent.setPackage("com.example.app")` |
| Handle exceptions | Try-catch around PendingIntent.send() |
| Use PendingIntentCompat | `PendingIntentCompat.getActivity()` |
| Set expiration | Time-based expiry for time-sensitive PendingIntents |
| Require permissions | Custom permissions for sensitive actions |
| Test thoroughly | Static analysis + dynamic testing |

## Testing Checklist

### Static Analysis

- [ ] Find all PendingIntent creations in the codebase
- [ ] Verify FLAG_IMMUTABLE is used for all PendingIntents
- [ ] Check for explicit Intents (no implicit targeting)
- [ ] Verify no sensitive data in Intent extras
- [ ] Check for proper sender verification in receivers
- [ ] Review PendingIntent usage in notifications
- [ ] Check PendingIntent usage in widgets
- [ ] Verify PendingIntent usage in alarms
- [ ] Review error handling around PendingIntent.send()
- [ ] Check for PendingIntent passing to external apps

### Dynamic Testing

- [ ] Intercept PendingIntent creation with Frida
- [ ] Test PendingIntent.send() interception
- [ ] Try to modify mutable PendingIntents
- [ ] Test PendingIntent redirection
- [ ] Test with Drozer for exposed components
- [ ] Test with ADB for Intent injection
- [ ] Verify sender verification mechanisms
- [ ] Test PendingIntent expiry logic
- [ ] Test error handling with invalid PendingIntents
- [ ] Verify component restrictions work correctly

### Code Review

- [ ] Review all PendingIntent usage patterns
- [ ] Verify FLAG_IMMUTABLE is the default
- [ ] Check for proper Intent targeting
- [ ] Verify sensitive data handling
- [ ] Review security checks in receivers
- [ ] Check permission requirements for sensitive actions
- [ ] Verify PendingIntentCompat usage for compatibility
- [ ] Review error handling and logging

## Additional Resources

- [Android PendingIntent Documentation](https://developer.android.com/reference/android/app/PendingIntent)
- [OWASP Mobile Top 10 2024](https://owasp.org/www-project-mobile-top-10/)
- [Android Security Best Practices](https://developer.android.com/topic/security/best-practices)
- [CVE-2024-43093 Details](https://cve.mitre.org/cgi-bin/cvename.cgi?name=CVE-2024-43093)

---

**Document Version**: 1.0
**Last Updated**: 2025-03-31
**Maintainer**: Android APK Audit Framework
**Related**: OWASP Mobile M9 - Insecure Data Storage, OWASP Mobile M5 - Insecure Communication
