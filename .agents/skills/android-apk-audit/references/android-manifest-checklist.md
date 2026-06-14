# Android Manifest Security Checklist

Complete security audit checklist for `AndroidManifest.xml` analysis.

## 1. Security-Relevant Attributes

| Attribute | Risk if Misconfigured | Recommended Value | Check Command |
|-----------|----------------------|------------------|----------------|
| `android:debuggable` | Exposes debugging, allows ADB attach, heap dumps, code injection | `false` in release | `grep -n "debuggable" AndroidManifest.xml` |
| `android:allowBackup` | Data extraction via `adb backup`, includes SharedPreferences, databases, files | `false` for sensitive apps | `grep -n "allowBackup" AndroidManifest.xml` |
| `android:usesCleartextTraffic` | MITM attacks, credential interception in transit | `false` | `grep -n "usesCleartextTraffic" AndroidManifest.xml` |
| `android:exported` (components) | Unauthorized access from other apps | `false` unless explicitly needed | Check each `<activity>`, `<service>`, `<receiver>`, `<provider>` |
| `android:permission` | Missing access control on components | Custom `signature`-level permission | Verify permission exists and has `signature` protection |
| `android:protectionLevel` | `normal` = auto-granted (too permissive) | `signature` or `signature\|privileged` for sensitive | `grep -n "protectionLevel" AndroidManifest.xml` |
| `android:taskAffinity` | Task hijacking (Strandhogg) | Unique per app (not package name) | `grep -n "taskAffinity" AndroidManifest.xml` |
| `android:launchMode` | `singleTask`/`singleInstance` may allow activity injection | `standard` or `singleTop` with validation | `grep -n "launchMode" AndroidManifest.xml` |
| `android:networkSecurityConfig` | Missing HTTPS enforcement, no certificate pinning | Reference to valid NSC XML file | `grep -n "networkSecurityConfig" AndroidManifest.xml` |
| `android:fullBackupContent` | Uncontrolled data in auto backups | XML with specific exclusion rules | Check referenced file for excessive `include` |
| `android:requestLegacyExternalStorage` | Bypasses scoped storage (Android 10-11) | Remove for Android 11+ | `grep -n "requestLegacyExternalStorage" AndroidManifest.xml` |

## 2. Exported Component Analysis

### Activities

**Detection:**
```bash
# API 31+: exported must be explicit
# API < 31: intent-filter makes it implicitly exported

grep -n "android:exported=\"true\"" AndroidManifest.xml
grep -A5 "<activity" AndroidManifest.xml | grep -B5 "intent-filter"
```

**Security checks:**
- Does `onCreate()` validate intent data?
- Does `onNewIntent()` have same validation? (COMMON BUG: validated in onCreate but NOT onNewIntent)
- Does `onActivityResult()` check the calling package?
- Are intent extras used without null/sanity checks?
- Does it load URLs from intent data without validation?

**Test commands:**
```bash
# Try starting exported activity
adb shell am start -n com.target.app/.ExportedActivity

# With malicious extras
adb shell am start -n com.target.app/.ExportedActivity -e url "file:///data/data/com.target/"

# With deep link trigger
adb shell am start -a android.intent.action.VIEW -d "myapp://path?param=<script>alert(1)</script>"
```

### Services

**Detection:**
```bash
grep -n "android:exported=\"true\"" AndroidManifest.xml | grep service
grep -A5 "<service" AndroidManifest.xml | grep -B5 "intent-filter"
```

**Security checks:**
- Does `onStartCommand()` validate intent extras?
- Does `onBind()` check caller identity?
- Can unprivileged apps start this service?
- Are commands from intent executed without validation?

**Test commands:**
```bash
# Start exported service
adb shell am startservice -n com.target.app/.ExportedService

# With malicious commands
adb shell am startservice -n com.target.app/.ExportedService -e command "delete_all_data"
```

### Broadcast Receivers

**Detection:**
```bash
grep -n "android:exported=\"true\"" AndroidManifest.xml | grep receiver
grep -A5 "<receiver" AndroidManifest.xml | grep -B5 "intent-filter"
```

**Security checks:**
- Is the receiver protected by a custom permission?
- Can unprivileged apps send broadcasts to it?
- Does `onReceive()` validate the broadcast source?
- Does it perform security-sensitive actions based on broadcast data?
- Could this be used for DoS (denial of service)?

**Android 14+ restriction:**
- Exported receivers MUST have intent-filters specified
- Cannot have exported receiver without intent-filter

**Test commands:**
```bash
# Send broadcast to exported receiver
adb shell am broadcast -n com.target.app/.ExportedReceiver -a ANY_ACTION -e data "malicious"

# Test without permission
adb shell am broadcast -a android.intent.action.BOOT_COMPLETED -n com.target.app/.BootReceiver
```

### Content Providers

**Detection:**
```bash
grep -n "android:exported=\"true\"" AndroidManifest.xml | grep provider
# API < 17: DEFAULT IS TRUE!
# Always check explicitly
```

**Security checks:**
- Is `android:readPermission` and/or `android:writePermission` set?
- Does `query()` sanitize SQL (concatenation = SQLi)?
- Does `openFile()` validate path (="../../../")?
- Does `call()` method check permissions?
- Does `insert()`/`update()`/`delete()` validate input?

**Test commands:**
```bash
# Query all data
adb shell content query --uri content://com.target.app.provider/table

# SQL injection via projection
adb shell content query --uri "content://com.target.app.provider/table" --projection "* FROM sqlite_master--"

# SQL injection via WHERE
adb shell content query --uri content://com.target.app.provider/table --where "id=1 UNION SELECT username,password FROM users--"

# Path traversal
adb shell content query --uri "content://com.target.app.provider/../../etc/passwd"

# Insert malicious data
adb shell content insert --uri content://com.target.app.provider/users --bind username:s:admin --bind password:s:admin123

# Delete all
adb shell content delete --uri content://com.target.app.provider/users --where "1=1"
```

## 3. Deep Link Security

### URI Scheme Analysis

**Find all URI schemes:**
```bash
grep -A10 "<intent-filter>" AndroidManifest.xml | grep -E "scheme|host|pathPattern"
```

**Security checks:**
- Is `android:autoVerify="true"` set? (App Links)
- Are host patterns restrictive enough?
- Are path patterns validated?
- Is the scheme unique or commonly used (risk of hijacking)?
- Are query parameters sanitized before use?

### App Links (Verified HTTPS Links)

**Good setup:**
```xml
<intent-filter android:autoVerify="true">
    <action android:name="android.intent.action.VIEW"/>
    <category android:name="android.intent.category.DEFAULT"/>
    <category android:name="android.intent.category.BROWSABLE"/>
    <data android:scheme="https" android:host="example.com"/>
</intent-filter>
```

**Verification file needed:** `https://example.com/.well-known/assetlinks.json`

### Vulnerability Patterns

| Pattern | Vulnerability | Impact |
|---------|--------------|--------|
| `myapp://` custom scheme | Can be hijacked by any app | Token theft, phishing |
| `android:autoVerify="false"` or missing | App Links not verified | Open redirect possible |
| `*` in pathPattern | Too permissive | Unexpected paths accepted |
| Parameter used in `loadUrl()` | XSS or file access | Local file theft |
| Parameter used in Intent | Intent redirection | Privilege escalation |

**Test deep links:**
```bash
# Basic test
adb shell am start -a android.intent.action.VIEW -d "myapp://path"

# With XSS payload
adb shell am start -a android.intent.action.VIEW -d "myapp://path?html=<script>alert(1)</script>"

# With file access
adb shell am start -a android.intent.action.VIEW -d "myapp://path?url=file:///data/data/com.target/"

# Open redirect
adb shell am start -a android.intent.action.VIEW -d "myapp://path?redirect=https://evil.com"
```

## 4. Permission Analysis

### Permission Levels

| Level | Description | Examples |
|-------|-------------|----------|
| `normal` | Auto-granted, low risk | `INTERNET`, `VIBRATE`, `SET_WALLPAPER` |
| `dangerous` | User approval required | `CAMERA`, `LOCATION`, `READ_CONTACTS`, `WRITE_EXTERNAL_STORAGE` |
| `signature` | Same signing key required | `WRITE_SETTINGS`, `SYSTEM_ALERT_WINDOW` (via `signature\|privileged`) |
| `signatureOrSystem` / `signature\|privileged` | System apps or same signature | Pre-installed apps, system features |

### Custom Permission Risks

**Vulnerable pattern:**
```xml
<!-- BAD: No protectionLevel defaults to "normal" - anyone can use! -->
<permission android:name="com.target.app.MY_PERMISSION"/>

<!-- BAD: "normal" protection - auto-granted to any app -->
<permission android:name="com.target.app.MY_PERMISSION" android:protectionLevel="normal"/>
```

**Secure pattern:**
```xml
<!-- GOOD: signature protection - only apps with same signing key -->
<permission android:name="com.target.app.MY_PERMISSION" android:protectionLevel="signature"/>
```

### Dangerous Permissions Checklist

Check for high-risk permissions:

```bash
grep -E "CAMERA|RECORD_AUDIO|READ_CONTACTS|READ_CALL_LOG|ACCESS_FINE_LOCATION|READ_EXTERNAL_STORAGE|WRITE_EXTERNAL_STORAGE|READ_SMS|SEND_SMS|READ_PHONE_STATE|BODY_SENSORS" AndroidManifest.xml
```

**Risk assessment:**
- Is each permission necessary?
- Could functionality work with less invasive permissions?
- Is user consent properly requested at runtime?
- Is the permission used for its stated purpose?

## 5. Network Security Config Analysis

### Check for NSC File

```bash
grep -n "networkSecurityConfig" AndroidManifest.xml
# Result: android:networkSecurityConfig="@xml/network_security_config"
```

### Common Misconfigurations

```xml
<!-- BAD: Allows all user certificates -->
<trust-anchors>
    <certificates src="user"/>
</trust-anchors>

<!-- BAD: Cleartext traffic permitted -->
<base-config cleartextTrafficPermitted="true">

<!-- BAD: No certificate pinning -->
<!-- Missing <pin-set> -->

<!-- BAD: Debug overrides weaken all security -->
<debug-overrides>
    <trust-anchors>
        <certificates src="user"/> <!-- Allows debug certs -->
    </trust-anchors>
</debug-overrides>
```

### Secure NSC Pattern

```xml
<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
    <!-- Global HTTPS-only -->
    <base-config cleartextTrafficPermitted="false">
        <trust-anchors>
            <certificates src="system"/>
        </trust-anchors>
    </base-config>

    <!-- Domain-specific with pinning -->
    <domain-config>
        <domain includeSubdomains="true">api.example.com</domain>
        <pin-set expiration="2025-12-31">
            <pin digest="SHA-256">7HIpactkIAq2Y49orFOOQKurWxmmSFZhBCoQYcRhJ3Y=</pin>
            <pin digest="SHA-256">fwza0LRMXouZHUG8fSd1dce45LB745Y025L7frp+KxE=</pin> <!-- Backup pin -->
        </pin-set>
        <trust-anchors>
            <certificates src="system"/>
        </trust-anchors>
    </domain-config>

    <!-- Local development exception (remove in production) -->
    <!-- <debug-overrides>
        <trust-anchors>
            <certificates src="user"/>
        </trust-anchors>
    </debug-overrides> -->
</network-security-config>
```

### Check Commands

```bash
# Find NSC file
grep -o 'networkSecurityConfig="@[a-z_]*"' AndroidManifest.xml | cut -d'"' -f2 | tr -d '@'

# View NSC content
cat decoded/res/xml/network_security_config.xml

# Check for cleartext
grep -n "cleartextTrafficPermitted" decoded/res/xml/*.xml

# Check for user certs
grep -n 'certificates src="user"' decoded/res/xml/*.xml
```

## 6. Android Version-Specific Checks

### Android 12 (API 31)

```xml
<!-- REQUIRED: Exported must be explicit for components with intent-filters -->
<activity android:name=".ExportedActivity" android:exported="true">
    <intent-filter>...</intent-filter>
</activity>

<!-- REQUIRED: PendingIntent mutability -->
PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_MUTABLE must be specified
```

### Android 13 (API 33)

```xml
<!-- New runtime permission -->
<uses-permission android:name="android.permission.POST_NOTIFICATIONS"/>

<!-- Photo picker replaces READ_EXTERNAL_STORAGE for images/videos -->
<!-- Apps should use PhotoPicker instead of storage permission -->

<!-- Granular media permissions -->
<uses-permission android:name="android.permission.READ_MEDIA_IMAGES"/>
<uses-permission android:name="android.permission.READ_MEDIA_VIDEO"/>
<uses-permission android:name="android.permission.READ_MEDIA_AUDIO"/>
```

### Android 14 (API 34)

```xml
<!-- Exported receivers REQUIRE intent-filter specification -->
<!-- This will crash if missing -->
<receiver android:name=".MyReceiver" android:exported="true">
    <intent-filter>
        <action android:name="android.intent.action.BOOT_COMPLETED"/>
    </intent-filter>
</receiver>

<!-- Implicit intent restrictions -->
<!-- Cannot send implicit intent to export=false component -->
```

### Android 15 (API 35)

**Runtime Permissions & Behavior Changes:**
- **Enhanced notification restrictions**: Apps targeting API 35+ must respect user's notification preferences and "Enhanced notifications" setting
- **Foreground service type restrictions**: New `FOREGROUND_SERVICE_TYPE_*` values require explicit declaration
- **Background activity launch restrictions**: Stricter rules for launching activities from background
- **Private space support**: Apps can now interact with Private Space feature
- **Partial screen sharing**: New `android.content.flags` for screen sharing scenarios

**Security & Permissions:**
- **Key Attestation enforcement**: Stronger hardware-backed keystore attestation requirements for keys
- **Predictive back gesture**: Apps must support predictive back navigation (required)
- **Health Connect**: Updates to health-related permissions and data access rules
- **Edge-to-edge enforcement**: Default edge-to-edge display mode for API 35+

**Manifest Required Changes:**
```xml
<!-- Required: Specify foreground service type for API 35+ -->
<service android:name=".MyForegroundService"
    android:foregroundServiceType="dataSync"
    android:exported="false" />

<!-- Edge-to-edge: Set to false if app needs to opt-out -->
<meta-data android:name="android.window.optOutEdgeToEdge" android:value="true" />

<!-- Cross-UID activity switch: Required for API 35+ -->
<meta-data android:name="android.allowCrossUidActivitySwitchFromBelow" android:value="false" />
```

**For More Information:**
- https://developer.android.com/about/versions/15/behavior-changes-all
- https://developer.android.com/about/versions/15/summary
- Focus on: notification handling, foreground service types, private space, and health connect permissions

## 7. Common Manifest Vulnerabilities Quick Reference

| Finding | Pattern | Severity | Fix |
|---------|---------|----------|-----|
| Debuggable app | `android:debuggable="true"` | HIGH | Remove in release builds |
| Backup enabled | `android:allowBackup="true"` | MEDIUM | Set to `false` for sensitive apps |
| Cleartext traffic | `android:usesCleartextTraffic="true"` | MEDIUM | Set to `false`, use HTTPS |
| Exported activity without permission | `<activity android:exported="true">` | HIGH | Add permission or set to `false` |
| Exported provider without permission | `<provider android:exported="true">` | CRITICAL | Add `android:readPermission`/`writePermission` |
| Missing NSC file | No `networkSecurityConfig` | MEDIUM | Add NSC with pinning |
| User certificates trusted | `<certificates src="user"/>` | HIGH | Remove user cert trust |
| Weak custom permission | `protectionLevel="normal"` | HIGH | Use `signature` or `signature\|privileged` |
| Default taskAffinity | `android:taskAffinity="com.target"` | MEDIUM | Use unique taskAffinity |
| SingleTask launchMode | `android:launchMode="singleTask"` | MEDIUM | Add caller validation in `onNewIntent` |

## 8. Manifest Audit Script

Quick bash script for automated manifest checks:

```bash
#!/bin/bash
MANIFEST="decoded/AndroidManifest.xml"

echo "=== Android Manifest Security Audit ==="
echo ""

echo "[1] Debuggable:"
grep -n "debuggable" "$MANIFEST" || echo "    Not set (defaults to false)"

echo "[2] Allow Backup:"
grep -n "allowBackup" "$MANIFEST" || echo "    Not set (defaults to true on older Android)"

echo "[3] Cleartext Traffic:"
grep -n "usesCleartextTraffic" "$MANIFEST" || echo "    Not set"

echo "[4] Exported Activities:"
grep -A2 "<activity" "$MANIFEST" | grep -B2 "exported=\"true\"" || echo "    None found"

echo "[5] Exported Services:"
grep -A2 "<service" "$MANIFEST" | grep -B2 "exported=\"true\"" || echo "    None found"

echo "[6] Exported Receivers:"
grep -A2 "<receiver" "$MANIFEST" | grep -B2 "exported=\"true\"" || echo "    None found"

echo "[7] Exported Providers:"
grep -A2 "<provider" "$MANIFEST" | grep -B2 "exported=\"true\"" || echo "    None found"
# Note: API < 17 defaults to TRUE!

echo "[8] Custom Permissions:"
grep -A1 "<permission" "$MANIFEST" | grep "protectionLevel" || echo "    None found"

echo "[9] Network Security Config:"
grep -n "networkSecurityConfig" "$MANIFEST" || echo "    Not set"

echo "[10] Task Affinity Issues:"
grep -n "taskAffinity" "$MANIFEST" || echo "    None found (using package name)"

echo "[11] Deep Link Schemes:"
grep -A10 "<intent-filter>" "$MANIFEST" | grep "scheme" || echo "    None found"

echo "=== End of Audit ==="
```

Run this script after `apktool d app.apk` to get a quick overview of manifest security issues.