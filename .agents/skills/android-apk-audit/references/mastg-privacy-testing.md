# Android Privacy Testing Reference

Privacy-focused security testing based on OWASP MASVS-PRIVACY and MASTG tests.

---

## 1. Privacy Compliance Overview

| Regulation | Key Requirements | Testing Focus |
|------------|------------------|---------------|
| **GDPR** (EU) | Consent, data minimization, right to be forgotten | Data collection, retention, export |
| **CCPA** (California) | Opt-out rights, disclosure requirements | Data sharing, third-party access |
| **PIPEDA** (Canada) | Consent, data accuracy, security | Privacy policies, data handling |
| **LGPD** (Brazil) | Legal basis, data protection | Consent mechanisms |
| **APP** (Australia) | Collection notice, use limitation | Data handling practices |

---

## 2. MASTG Privacy Tests (MASVS-PRIVACY)

### MASWE-0108: Sensitive Data in Network Traffic

**Description**: Verify that sensitive data is not leaked in network traffic.

**Checklist**:
- [ ] Credentials not in URL parameters
- [ ] PII not in URL paths
- [ ] Tokens not in query strings
- [ ] Session IDs not in headers (use Authorization headers)

**Testing**:
```bash
# Intercept with Burp/mitmproxy
# Search for:
# - Password parameters
# - Social security numbers
# - Email addresses in URLs
# - Phone numbers
```

**⚠️ CROSS-PLATFORM COMPATIBILITY:** All `grep -rnP` commands in this file use PCRE (Perl regex), which is **NOT supported on macOS BSD grep**. Use ripgrep (rg) instead:

```bash
# Replace all grep -rnP with:
rg "pattern" "$APP/"

# Or use grep -rnE (extended regex - cross-platform):
grep -rnE "pattern" "$APP/"
```

**Grep Patterns**:
```bash
# Find credentials in URLs (use ripgrep - cross-platform)
rg "https?://.*password=|https?://.*token=|https?://.*key=" "$APP/"

# Find PII patterns in URLs
grep -rnP "http[s]?://.*email=|http[s]?://.*phone=|http[s]?://.*ssn=" "$APP/"
grep -rnE "https?://.*email=|https?://.*phone=|https?://.*ssn=" "$APP/"
rg "https?://.*email=|https?://.*phone=|https?://.*ssn=" "$APP/"
```

### MASWE-0109: Lack of Anonymization

**Description**: Data should be anonymized or pseudonymized when possible.

**Testing**:
```java
// Check if app uses anonymized IDs vs. direct identifiers
// Look for patterns like:
// - Device ID (IMEI, Android ID) used for tracking
// - Advertising ID without consent
// - MAC address collection
```

**Grep Patterns**:
```bash
# Device identifiers
grep -rnP "getDeviceId\(|ANDROID_ID|IMEI|getMacAddress\(" "$APP/"
grep -rnE "getDeviceId\(|ANDROID_ID|IMEI|getMacAddress\(" "$APP/"
rg "getDeviceId\(|ANDROID_ID|IMEI|getMacAddress\(" "$APP/"

# Advertising ID
grep -rnP "AdvertisingIdClient|getId\(\)" "$APP/"
grep -rnE "AdvertisingIdClient|getId\(\)" "$APP/"
rg "AdvertisingIdClient|getId\(\)" "$APP/"
```

### MASWE-0110: Unique Identifiers for Tracking

**Description**: Apps should not use device identifiers for tracking without consent.

**Testing**:
```java
// Check for:
// - android.permission.READ_PHONE_STATE (IMEI)
// - android.permission.ACCESS_WIFI_STATE (MAC)
// - Bluetooth MAC address collection
```

**Analysis**:
```bash
# Check permissions
grep -n "READ_PHONE_STATE\|ACCESS_WIFI_STATE\|BLUETOOTH" AndroidManifest.xml

# Check identifier usage
grep -rnP "Settings\.Secure\.getString.*android_id|Settings\.System\.getString.*android_id" "$APP/"
grep -rnE "Settings\.Secure\.getString.*android_id|Settings\.System\.getString.*android_id" "$APP/"
rg "Settings\.Secure\.getString.*android_id|Settings\.System\.getString.*android_id" "$APP/"
```

### MASWE-0111: Privacy Policy Issues

**Description**: App must have accessible privacy policy.

**Testing**:
- [ ] Privacy policy URL accessible from app
- [ ] Privacy policy page loads correctly
- [ ] Privacy policy covers required topics
- [ ] Privacy policy language matches user's locale

**Check in Manifest**:
```bash
# Look for privacy policy metadata
grep -n "privacy" AndroidManifest.xml
grep -n "policy_url\|privacy_policy\|legal_info" "$APP/res/values/strings.xml"
```

### MASWE-0112: Consent Mechanisms

**Description**: App must obtain consent before collecting/processing data.

**Testing**:
- [ ] Consent dialog shown before data collection
- [ ] Consent is granular (can accept/reject specific purposes)
- [ ] Consent is stored and can be withdrawn
- [ ] Non-essential data collection is opt-in, not opt-out

**Dynamic Analysis**:
```javascript
// Frida: Hook consent dialogs
Java.perform(function() {
    var AlertDialog = Java.use("android.app.AlertDialog");
    AlertDialog.Builder.show.overload("[]").implementation = function() {
        console.log("[*] Dialog shown");
        // Check if consent dialog
        return this.show();
    };
});
```

### MASWE-0113-0117: Permission Management

**Description**: App must properly handle permission requests.

**Testing**:
- [ ] Permissions requested are necessary
- [ ] Permission rationale is shown before request
- [ ] App handles permission denial gracefully
- [ ] Data collection respects permission grants

---

## 3. Data Collection Analysis

### 3.1 Identify Collected Data

**Manifest Analysis**:
```bash
# All declared permissions
grep -n "<uses-permission" AndroidManifest.xml

# Dangerous permissions
grep -n "CAMERA\|LOCATION\|CONTACTS\|SMS\|PHONE\|MICROPHONE\|BODY_SENSORS" AndroidManifest.xml
```

**Code Analysis**:
```bash
# Location collection
grep -rnP "getLastKnownLocation|requestLocationUpdates|FusedLocationProviderClient" "$APP/"
grep -rnE "getLastKnownLocation|requestLocationUpdates|FusedLocationProviderClient" "$APP/"
rg "getLastKnownLocation|requestLocationUpdates|FusedLocationProviderClient" "$APP/"

# Contact access
grep -rnP "getContentResolver.*ContactsContract\|READ_CONTACTS" "$APP/"
grep -rnE "getContentResolver.*ContactsContract|READ_CONTACTS" "$APP/"
rg "getContentResolver.*ContactsContract|READ_CONTACTS" "$APP/"

# SMS/MMS access
grep -rnP "SmsManager|content://sms" "$APP/"
grep -rnE "SmsManager|content://sms" "$APP/"
rg "SmsManager|content://sms" "$APP/"

# Call log access
grep -rnP "CallLog\.Calls|READ_CALL_LOG" "$APP/"
grep -rnE "CallLog\.Calls|READ_CALL_LOG" "$APP/"
rg "CallLog\.Calls|READ_CALL_LOG" "$APP/"

# Camera access
grep -rnP "Camera\.open|CameraManager|ImageCapture" "$APP/"
grep -rnE "Camera\.open|CameraManager|ImageCapture" "$APP/"
rg "Camera\.open|CameraManager|ImageCapture" "$APP/"

# Microphone access
grep -rnP "MediaRecorder|AudioRecord" "$APP/"
grep -rnE "MediaRecorder|AudioRecord" "$APP/"
rg "MediaRecorder|AudioRecord" "$APP/"
```

### 3.2 Data Minimization Check

**Test**: App should only collect data necessary for its functionality.

| Permission | When Justified | When Unjustified |
|------------|---------------|-------------------|
| `CAMERA` | Photo/video app, QR scanner | News reader, calculator |
| `LOCATION` | Maps, delivery, ride-share | Note-taking app, theme app |
| `READ_CONTACTS` | Social app, contact manager | Weather app, game |
| `READ_SMS` | SMS backup, verification app | Photo editor, fitness app |
| `READ_CALL_LOG` | Dialer, call blocker | Calculator, flashlight |
| `MICROPHONE` | Voice recorder, call app | Keyboard (unless voice input), calculator |

---

## 4. Third-Party Data Sharing

### 4.1 Identify Third-Party SDKs

**Common SDKs**:
```bash
# Analytics
grep -rnP "google-analytics|firebase_analytics|mixpanel|amplitude|segment" "$APP/"
grep -rnE "google-analytics|firebase_analytics|mixpanel|amplitude|segment" "$APP/"
rg "google-analytics|firebase_analytics|mixpanel|amplitude|segment" "$APP/"

# Advertising
grep -rnP "admob|facebook-ads|unity-ads|ironsource|mopub" "$APP/"
grep -rnE "admob|facebook-ads|unity-ads|ironsource|mopub" "$APP/"
rg "admob|facebook-ads|unity-ads|ironsource|mopub" "$APP/"

# Social
grep -rnP "facebook-sdk|twitter-sdk|linkedin-sdk" "$APP/"
grep -rnE "facebook-sdk|twitter-sdk|linkedin-sdk" "$APP/"
rg "facebook-sdk|twitter-sdk|linkedin-sdk" "$APP/"

# Payment
grep -rnP "stripe|paypal|braintree|square" "$APP/"
grep -rnE "stripe|paypal|braintree|square" "$APP/"
rg "stripe|paypal|braintree|square" "$APP/"

# Crash reporting
grep -rnP "crashlytics|sentry|bugsnag|raygun" "$APP/"
grep -rnE "crashlytics|sentry|bugsnag|raygun" "$APP/"
rg "crashlytics|sentry|bugsnag|raygun" "$APP/"
```

### 4.2 Data Sharing Analysis

**Check Data Sent to Third Parties**:
```javascript
// Frida: Hook network requests to third parties
Java.perform(function() {
    var OkHttpClient = Java.use("okhttp3.OkHttpClient");
    var Request = Java.use("okhttp3.Request");

    OkHttpClient.newCall.implementation = function(request) {
        var url = request.url().toString();
        var host = request.url().host();

        // Log third-party endpoints
        var thirdParty = !host.contains("myapp.com");
        if (thirdParty) {
            console.log("[THIRD-PARTY] " + url);
            console.log("  Headers: " + request.headers());
            console.log("  Body: " + request.body());
        }

        return this.newCall(request);
    };
});
```

### 4.3 WebView Third-Party Tracking

**Check Tracking in WebViews**:
```java
// Look for tracking URLs being loaded
grep -rnP "doubleclick|googleadservices|facebook.com/tr|google-analytics.com/collect" "$APP/"
grep -rnE "doubleclick|googleadservices|facebook.com/tr|google-analytics.com/collect" "$APP/"
rg "doubleclick|googleadservices|facebook.com/tr|google-analytics.com/collect" "$APP/"

// Check for webview tracking
grep -rnP "addJavascriptInterface.*ga_|trackPageView|trackEvent" "$APP/"
grep -rnE "addJavascriptInterface.*ga_|trackPageView|trackEvent" "$APP/"
rg "addJavascriptInterface.*ga_|trackPageView|trackEvent" "$APP/"
```

---

## 5. Data Retention

### 5.1 Check Retention Policies

**Local Storage**:
```bash
# Find stored data
adb shell run-as com.target.app ls -laR /data/data/com.target.app/

# Check if old data is cleaned
# Look for scheduled cleanup:
grep -rnP "deleteOldData|cleanup|purge|removeOldData|prune" "$APP/"
grep -rnE "deleteOldData|cleanup|purge|removeOldData|prune" "$APP/"
rg "deleteOldData|cleanup|purge|removeOldData|prune" "$APP/"
```

**SharedPreferences**:
```javascript
// Frida: Check SharedPreferences timestamps
Java.perform(function() {
    var SharedPreferences = Java.use("android.content.SharedPreferences");
    SharedPreferences.Editor.putLong.implementation = function(key, value) {
        console.log("[PREF] " + key + " = " + value);
        if (key.contains("timestamp") || key.contains("date")) {
            // Check if timestamp is cleaned appropriately
            var now = Java.use("java.lang.System").currentTimeMillis();
            var age = (now - value) / (1000 * 60 * 60 * 24); // days
            console.log("    Age: " + age + " days");
        }
        return this.putLong(key, value);
    };
});
```

### 5.2 Right to Deletion

**Test Deletion Functionality**:
- [ ] Account deletion feature exists
- [ ] Deletion removes all local data
- [ ] Deletion request sent to server
- [ ] Confirmation that all data is deleted

**Code Analysis**:
```bash
# Find deletion functions
grep -rnP "deleteAccount|removeAll|clearUserData|deleteUser|forgotPassword.*delete" "$APP/"
grep -rnE "deleteAccount|removeAll|clearUserData|deleteUser|forgotPassword.*delete" "$APP/"
rg "deleteAccount|removeAll|clearUserData|deleteUser|forgotPassword.*delete" "$APP/"
```

---

## 6. Consent and Opt-Out

### 6.1 GDPR/CCPA Requirements

**Consent Dialog Testing**:
- [ ] Consent requested before first data collection
- [ ] Can accept/reject specific purposes
- [ ] Consent can be withdrawn later
- [ ] App behavior changes based on consent

**Check for Consent SDKs**:
```bash
# Google User Messaging Platform (UMP)
grep -rnP "UserMessagingPlatform|ConsentInformation|consentform" "$APP/"

# OneTrust
grep -rnP "OneTrust|OTSdk" "$APP/"

# TrustArc
grep -rnP "TrustArc" "$APP/"
```

### 6.2 Advertising ID Consent

**Requirement**: Must respect user's advertising ID preference.

```java
// Check for advertising ID consent
AdvertisingIdClient.Info adInfo = AdvertisingIdClient.getAdvertisingIdInfo(context);
if (!adInfo.isLimitAdTrackingEnabled()) {
    // Can use advertising ID
} else {
    // Must respect opt-out
}
```

**Check**:
```bash
# Find advertising ID usage
grep -rnP "AdvertisingIdClient|isLimitAdTrackingEnabled|getAdvertisingId" "$APP/"
```

---

## 7. Privacy Checklist for Audit

```markdown
## Privacy Consent Checklist

### Data Collection
- [ ] All collected data is necessary for app functionality
- [ ] Privacy policy is accessible from app settings
- [ ] Privacy policy lists all data types collected
- [ ] Third-party data sharing is disclosed in privacy policy

### Permissions
- [ ] Each permission is necessary for app functionality
- [ ] Permission rationale is shown before request
- [ ] App works correctly when permissions are denied
- [ ] Dangerous permissions are requested in context

### Consent
- [ ] Consent is obtained before collecting personal data
- [ ] Consent is granular (specific purposes can be rejected)
- [ ] Consent can be withdrawn
- [ ] Non-consent does not break core functionality

### Data Retention
- [ ] Data retention period is defined
- [ ] Old data is automatically cleaned up
- [ ] Account deletion is possible
- [ ] Deletion removes all associated data

### User Rights
- [ ] Users can export their data
- [ ] Users can view collected data
- [ ] Users can delete their data
- [ ] Users can opt-out of data sharing

### Third Parties
- [ ] All third-party SDKs are documented
- [ ] Data shared with third parties is minimized
- [ ] Third-party privacy policies are linked
- [ ] Advertising ID opt-out is respected
```

---

## 8. Privacy Test Commands

```bash
# Find all network endpoints
grep -rnP "http[s]?://[a-zA-Z0-9\./-]+" "$APP/" --include="*.java" | \
    grep -v "http://schemas\|http://xml\|http://www.w3\|example.com"
grep -rnE "https?://[a-zA-Z0-9\./-]+" "$APP/" --include="*.java" | \
    grep -v "http://schemas\|http://xml\|http://www.w3\|example.com"
rg "https?://[a-zA-Z0-9\./-]+" "$APP/" --glob="*.java" | \
    grep -v "http://schemas\|http://xml\|http://www.w3\|example.com"

# Find all data collection calls
grep -rnP "collect|track|analytics|log.*event|send.*data" "$APP/"
grep -rnE "collect|track|analytics|log.*event|send.*data" "$APP/"
rg "collect|track|analytics|log.*event|send.*data" "$APP/"

# Find all persistent storage
grep -rnP "getSharedPreferences|openOrCreateDatabase|getWritableDatabase|getFilesDir" "$APP/"
grep -rnE "getSharedPreferences|openOrCreateDatabase|getWritableDatabase|getFilesDir" "$APP/"
rg "getSharedPreferences|openOrCreateDatabase|getWritableDatabase|getFilesDir" "$APP/"

# Find user identifiers
grep -rnP "getDeviceId\|getSerial\|ANDROID_ID\|AdvertisingIdClient\|Settings\.Secure\|getMacAddress" "$APP/"
grep -rnE "getDeviceId\|getSerial\|ANDROID_ID\|AdvertisingIdClient\|Settings\.Secure\|getMacAddress" "$APP/"
rg "getDeviceId\|getSerial\|ANDROID_ID\|AdvertisingIdClient\|Settings\.Secure\|getMacAddress" "$APP/"

# Find location access
grep -rnP "getLastKnownLocation|requestLocationUpdates|FusedLocationProviderClient\|getCurrentLocation" "$APP/"
grep -rnE "getLastKnownLocation|requestLocationUpdates|FusedLocationProviderClient\|getCurrentLocation" "$APP/"
rg "getLastKnownLocation|requestLocationUpdates|FusedLocationProviderClient\|getCurrentLocation" "$APP/"

# Find contact access
grep -rnP "ContactsContract\|getContentResolver.*contacts\|READ_CONTACTS" "$APP/"
grep -rnE "ContactsContract\|getContentResolver.*contacts\|READ_CONTACTS" "$APP/"
rg "ContactsContract\|getContentResolver.*contacts\|READ_CONTACTS" "$APP/"

# Find consent-related code
grep -rnP "consent|privacy|gdpr|ccpa|optIn|optOut|acceptTerms" "$APP/"
grep -rnE "consent|privacy|gdpr|ccpa|optIn|optOut|acceptTerms" "$APP/"
rg "consent|privacy|gdpr|ccpa|optIn|optOut|acceptTerms" "$APP/"

# Check for right-to-delete implementation
grep -rnP "deleteAccount|deleteUser|removeAll|clearAll|forgetMe|forgetAccount" "$APP/"
grep -rnE "deleteAccount|deleteUser|removeAll|clearAll|forgetMe|forgetAccount" "$APP/"
rg "deleteAccount|deleteUser|removeAll|clearAll|forgetMe|forgetAccount" "$APP/"
```

---

## 9. Dynamic Privacy Testing

### 9.1 Traffic Analysis for PII

```bash
# Start mitmproxy
mitmdump -p 8080 --set block_global=false

# Configure Android proxy
adb shell settings put global http_proxy <PC_IP>:8080

# Filter for PII
# In mitmproxy console: 'focus ~b "email|password|address|phone|ssn"'
```

### 9.2 Logcat Privacy Check

```bash
# Monitor for PII in logs
adb logcat | grep -iE "email|password|address|phone|ssn|credit_card|account"

# Look for sensitive data in verbose output
adb logcat -v threadtime | grep -E "password.*=|token.*=|secret.*=|key.*="
```

### 9.3 SharedPreferences Privacy Check

```bash
# Extract SharedPreferences
adb shell run-as com.target.app cat shared_prefs/*.xml

# Look for PII
adb shell run-as com.target.app cat shared_prefs/*.xml | \
    grep -iE "email|password|address|phone|ssn|credit"
```

---

## 10. Privacy Report Findings Template

```markdown
### [PRIVACY-001] Excessive Data Collection

| Field | Value |
|-------|-------|
| **Category** | Privacy - Data Minimization |
| **MASWE** | MASWE-0110 |
| **Severity** | MEDIUM |
| **Confidence** | Confirmed |

**Description:**
The application collects device identifiers (IMEI, Android ID) and location data without a clear need for its core functionality.

**Evidence:**
- `com/example/app/TrackingHelper.java:45` collects Android ID
- `com/example/app/LocationTracker.java:23` requests continuous location
- No consent dialog shown before data collection

**Impact:**
User privacy is violated. Data is collected without consent and without clear purpose.

**Remediation:**
1. Remove unnecessary location tracking if not required
2. Obtain explicit consent before collecting device identifiers
3. Implement user control to opt-out of tracking
```

---

*Last Updated: 2024*
*Reference: OWASP MASVS-PRIVACY, GDPR, CCPA requirements*