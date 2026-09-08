# Android APK Audit - Professional Reporting Templates

This document provides standardized templates for findings and reports in Android APK security assessments. All reports should follow these templates for consistency and professionalism.

---

## 1. Finding Template (Main Template)

Use this template for every security finding in your report.

```markdown
### [AUDIT-NNN] Short Descriptive Title

| Field | Value |
|-------|-------|
| **File** | `path/to/File.java:line` |
| **OWASP Mobile** | M-category (e.g., M1 - Improper Credential Usage) |
| **MASVS** | MASVS-category (e.g., MASVS-STORAGE) |
| **MASTG Test** | MASTG-TEST-XXXX (if applicable) |
| **CWE** | CWE-XXX |
| **CVSS 4.0** | X.X (AV:N/AC:L/PR:N/UI:N/VC:H/VI:H/VA:N) |
| **Severity** | CRITICAL / HIGH / MEDIUM / LOW |
| **Confidence** | Confirmed / Likely / Needs Dynamic Confirmation |

**Description:**
One paragraph explaining what the vulnerability is and why it matters in this specific context. Be specific about the app's behavior.

**Vulnerable Code:**
(code block with relevant lines and enough context)

**Data Flow:**
Source:    file:line (where attacker input enters)
    ↓      propagation step
    ↓      validation check (present/missing/bypassable)
Sink:      file:line (where it becomes dangerous)

**Proof of Concept:**
Concrete, reproducible PoC:
- adb command (for exported components)
- Frida hook script (for runtime bypass)
- Malicious intent/app snippet (for IPC attacks)
- Crafted deep link URL (for deeplink attacks)
- curl command (for API issues)

**Impact:**
Concrete attacker impact:
- What an attacker can DO (not what COULD happen)
- What data can be accessed
- What actions can be performed
- Realistic attack scenario

**Remediation:**
Specific engineering fix:
- Code-level changes with before/after examples
- Configuration changes needed
- Testing steps to verify fix
```

### Finding Template Guidelines

- **ID Format:** Use `AUDIT-NNN` starting from 001, incrementing sequentially
- **Title:** Keep it concise (under 10 words) but descriptive
- **Severity Mapping:**
  - CRITICAL: Remote code execution, credential exposure, data breach
  - HIGH: Privilege escalation, data exposure to attackers, bypass of security controls
  - MEDIUM: Information disclosure, weak cryptography, insecure defaults
  - LOW: Minor info leaks, missing headers, best practice violations
- **Confidence Levels:**
  - **Confirmed:** Static analysis clearly demonstrates the vulnerability
  - **Likely:** Code suggests the issue but requires runtime confirmation
  - **Needs Dynamic Confirmation:** Code structure indicates potential issue that can only be confirmed with dynamic testing

---

## 2. Executive Summary Template

```markdown
# Mobile Application Security Assessment

## Executive Summary

**Application:** [App Name] v[Version]
**Package:** com.example.app
**Platform:** Android (minSDK X, targetSDK Y)
**Assessment Date:** YYYY-MM-DD
**Methodology:** OWASP MASTG-aligned static analysis with targeted dynamic testing

### Risk Overview

| Severity | Count |
|----------|-------|
| CRITICAL | X |
| HIGH | X |
| MEDIUM | X |
| LOW | X |

**Overall Risk Rating:** [CRITICAL/HIGH/MEDIUM/LOW]

### Key Findings Summary
1. [CRITICAL] Brief description of most critical finding
2. [HIGH] Brief description of second finding
3. [HIGH] Brief description of third finding

### Business Impact
Plain language description of what these findings mean for the business:
- Data exposure risk
- Compliance implications
- User impact
- Recommended immediate actions

### Testing Coverage
- Framework detected: [Java/Kotlin/React Native/Flutter/etc.]
- Exported components reviewed: X activities, Y services, Z receivers, W providers
- Dynamic testing performed: Yes/No (if No, list what would need dynamic confirmation)
- Blind spots: [obfuscated code, native libraries, etc.]
```

### Executive Summary Guidelines

- **Risk Rating Formula:**
  - CRITICAL if any CRITICAL finding exists
  - HIGH if 3+ HIGH findings OR CRITICAL mitigated but present
  - MEDIUM if 1-2 HIGH findings OR multiple MEDIUM findings
  - LOW if only LOW findings
- **Key Findings:** List top 3 findings by severity, one sentence each
- **Business Impact:** Write for non-technical stakeholders. Focus on:
  - Data breach potential
  - Regulatory compliance (GDPR, PCI-DSS, etc.)
  - User trust and reputation impact
  - Legal liability
  - Financial impact

---

## 3. Coverage Statement Template

```markdown
## Assessment Coverage

| Area | Status | Notes |
|------|--------|-------|
| Manifest Analysis | ✅ Complete | All exported components reviewed |
| Data Storage | ✅ Complete | SharedPreferences, SQLite, files |
| Cryptography | ✅ Complete | Key management, algorithms |
| Network Communication | ✅ Complete | TLS, certificate pinning |
| Authentication | ✅ Complete | Session management, token handling |
| Inter-Component Communication | ✅ Complete | Intents, deep links, providers |
| WebView | ✅ Complete | JS interfaces, URL loading |
| Native Libraries | ⚠️ Partial | 3 .so files, strings-only analysis |
| Obfuscated Code | ⚠️ Limited | ProGuard detected, class names obfuscated |
| React Native Bundle | ❌ Not Tested | N/A |
| Dynamic Testing | ❌ Not Performed | Requires device/emulator |

### Framework Detection
- Primary: Java/Kotlin
- Secondary: [React Native/Flutter/Xamarin if detected]
- Obfuscation: [ProGuard/R8/DexGuard if detected]
- Min SDK: XX | Target SDK: XX

### Blind Spots
1. [List areas that couldn't be fully analyzed]
2. [List findings marked "Needs Dynamic Confirmation"]
3. [List third-party libraries not reviewed in depth]
```

### Coverage Statement Guidelines

- **Status Levels:**
  - ✅ Complete: Full review performed
  - ⚠️ Partial: Partial review, limitations documented
  - ❌ Not Tested: Area not covered in this assessment
- **Always document limitations** to manage stakeholder expectations
- **Mention dynamic testing needs** if you did not perform runtime analysis

---

## 4. Remediation Priority Matrix

```markdown
## Remediation Roadmap

### Immediate (0-7 days)
| ID | Title | Action Required |
|----|-------|----------------|
| AUDIT-001 | [Title] | [Specific fix] |

### High Priority (1-30 days)
| ID | Title | Action Required |
|----|-------|----------------|

### Medium Priority (30-90 days)
| ID | Title | Action Required |
|----|-------|----------------|

### Low Priority (90+ days)
| ID | Title | Action Required |
|----|-------|----------------|
```

### Priority Matrix Guidelines

- **Immediate (0-7 days):**
  - All CRITICAL findings
  - HIGH findings with active exploitation risk
  - Credential exposure issues
- **High Priority (1-30 days):**
  - Remaining HIGH findings
  - MEDIUM findings with compliance implications
- **Medium Priority (30-90 days):**
  - MEDIUM findings
  - Best practice improvements
- **Low Priority (90+ days):**
  - LOW findings
  - Nice-to-have security enhancements

---

## 5. Weak Crypto Finding Example

This is a complete example demonstrating the finding template in action.

```
### [AUDIT-003] AES ECB Mode Used for Sensitive Data Encryption

| Field | Value |
|-------|-------|
| **File** | `com/example/app/CryptoHelper.java:45` |
| **OWASP Mobile** | M4 - Insufficient Cryptography |
| **MASVS** | MASVS-CRYPTO |
| **MASTG Test** | MASTG-TEST-0020 |
| **CWE** | CWE-327 (Use of a Broken or Risky Cryptographic Algorithm) |
| **CVSS 4.0** | 5.3 (AV:L/AC:L/PR:N/UI:N/VC:H/VI:N/VA:N) |
| **Severity** | MEDIUM |
| **Confidence** | Confirmed |

**Description:**
The application uses AES in ECB mode to encrypt user credentials before storing them in SharedPreferences. ECB mode encrypts identical plaintext blocks into identical ciphertext blocks, making it vulnerable to pattern analysis attacks. An attacker with access to the encrypted data (via backup, root access, or exported content provider) can identify repeated patterns and deduce information about the encrypted credentials.

**Vulnerable Code:**
```java
// CryptoHelper.java:45
public String encrypt(String plaintext) {
    SecretKeySpec key = new SecretKeySpec("hardcodedKey12345".getBytes(), "AES");  // Also: hardcoded key!
    Cipher cipher = Cipher.getInstance("AES/ECB/PKCS5Padding");  // ECB mode
    cipher.init(Cipher.ENCRYPT_MODE, key);
    byte[] encrypted = cipher.doFinal(plaintext.getBytes());
    return Base64.encodeToString(encrypted, Base64.DEFAULT);
}
```

**Data Flow:**
Source:    User input (password field)
    ↓      getPassword() returns plaintext
    ↓      encrypt() called with plaintext
    ↓      No IV generation (ECB doesn't use IV)
    ↓      Hardcoded key used (no KeyStore)
Sink:      SharedPreferences edit().putString("enc_pass", encrypted)

**Proof of Concept:**
```bash
# Extract SharedPreferences (if device rooted or backup enabled)
adb shell cat /data/data/com.example.app/shared_prefs/AppPrefs.xml

# Identify repeated Base64 patterns indicating ECB-encrypted identical passwords
# Two users with password "password123" will have identical ciphertext
```

**Impact:**
An attacker who obtains the SharedPreferences file (via adb backup if allowBackup=true, physical access, or root) can:
1. Identify users with identical passwords through ciphertext pattern matching
2. Build a dictionary of known plaintext-ciphertext pairs
3. The hardcoded key "hardcodedKey12345" can be extracted from the APK, enabling full decryption of all stored credentials

**Remediation:**
```java
// BEFORE (vulnerable):
SecretKeySpec key = new SecretKeySpec("hardcodedKey12345".getBytes(), "AES");
Cipher cipher = Cipher.getInstance("AES/ECB/PKCS5Padding");

// AFTER (secure):
KeyStore keyStore = KeyStore.getInstance("AndroidKeyStore");
keyStore.load(null);
KeyGenerator keyGenerator = KeyGenerator.getInstance(
    KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
keyGenerator.init(new KeyGenParameterSpec.Builder(
    "user_cred_key",
    KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
    .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
    .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
    .setRandomizedEncryptionRequired(true)
    .build());
SecretKey key = keyGenerator.generateKey();
Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
cipher.init(Cipher.ENCRYPT_MODE, key); // IV generated automatically by AndroidKeyStore
```
```

---

## Additional Finding Examples

### Example: Exported Activity without Permission

```
### [AUDIT-007] Exported Activity Exposes Sensitive User Data

| Field | Value |
|-------|-------|
| **File** | `AndroidManifest.xml:42` |
| **OWASP Mobile** | M8 - Security Misconfiguration |
| **MASVS** | MASVS-PLATFORM |
| **MASTG Test** | MASTG-TEST-0143 |
| **CWE** | CWE-926 (Improper Export of Android Application Components) |
| **CVSS 4.0** | 7.5 (AV:A/AC:L/PR:N/UI:N/VC:H/VI:N/VA:N) |
| **Severity** | HIGH |
| **Confidence** | Confirmed |

**Description:**
The UserProfileActivity is exported and has no permission protection, allowing any installed application to launch it and potentially access user profile data. The activity displays full user information including email, phone number, and address.

**Vulnerable Code:**
```xml
<!-- AndroidManifest.xml:42 -->
<activity
    android:name=".UserProfileActivity"
    android:exported="true"  <!-- No android:permission attribute -->
    android:label="User Profile">
    <intent-filter>
        <action android:name="com.example.app.VIEW_PROFILE" />
        <category android:name="android.intent.category.DEFAULT" />
    </intent-filter>
</activity>
```

**Data Flow:**
Source:    Any app can construct intent
    ↓      startActivity(new Intent("com.example.app.VIEW_PROFILE"))
    ↓      UserProfileActivity launched
    ↓      Loads user data from SharedPreferences
Sink:      User data displayed in UI (can be scraped)

**Proof of Concept:**
```bash
# Create malicious app or use adb to launch activity
adb shell am start -n com.example.app/.UserProfileActivity

# The activity launches and displays user data
# Any third-party app can do the same
```

**Impact:**
Any installed application can:
1. Launch UserProfileActivity without user consent
2. Read user profile data from the activity's UI (via UI automation)
3. If the activity returns data via setResult(), a malicious app can extract it directly
4. Privacy violation: PII exposed to all apps on device

**Remediation:**
```xml
<!-- BEFORE (vulnerable): -->
<activity
    android:name=".UserProfileActivity"
    android:exported="true">

<!-- AFTER (secure): -->
<!-- Option 1: Make non-exported (preferred) -->
<activity
    android:name=".UserProfileActivity"
    android:exported="false">

<!-- Option 2: Add custom permission protection -->
<permission
    android:name="com.example.app.permission.ACCESS_USER_PROFILE"
    android:protectionLevel="signature" />

<activity
    android:name=".UserProfileActivity"
    android:exported="true"
    android:permission="com.example.app.permission.ACCESS_USER_PROFILE">
```
```

### Example: Hardcoded API Key

```
### [AUDIT-012] Production API Key Hardcoded in Application

| Field | Value |
|-------|-------|
| **File** | `com/example/app/ApiClient.java:23` |
| **OWASP Mobile** | M1 - Improper Credential Usage |
| **MASVS** | MASVS-CODE |
| **MASTG Test** | MASTG-TEST-0039 |
| **CWE** | CWE-798 (Use of Hard-coded Credentials) |
| **CVSS 4.0** | 6.5 (AV:N/AC:L/PR:N/UI:N/VC:H/VI:N/VA:N) |
| **Severity** | MEDIUM |
| **Confidence** | Confirmed |

**Description:**
A production API key is hardcoded in the ApiClient class. Anyone who decompiles the APK can extract this key and make unauthorized API calls on behalf of the application. The key has no rate limiting or IP restrictions, allowing unlimited abuse.

**Vulnerable Code:**
```java
// ApiClient.java:23
public class ApiClient {
    private static final String API_KEY = "API_KEY_EXAMPLE_REPLACE_ME_12345";  // Production key
    private static final String BASE_URL = "https://api.example.com/v1/";

    public static OkHttpClient getClient() {
        return new OkHttpClient.Builder()
            .addInterceptor(chain -> {
                Request request = chain.request().newBuilder()
                    .addHeader("Authorization", "Bearer " + API_KEY)
                    .build();
                return chain.proceed(request);
            })
            .build();
    }
}
```

**Data Flow:**
Source:    APK decompilation (jadx, apktool)
    ↓      Extract classes.dex
    ↓      Disassemble ApiClient.class
    ↓      Read string constant "API_KEY_EXAMPLE..."
Sink:      Attacker has valid API key

**Proof of Concept:**
```bash
# Extract API key from APK
unzip app.apk classes*.dex
jadx --output jadx_output classes*.dex
cat jadx_output/com/example/app/ApiClient.java | grep "API_KEY"

# Verify key works
curl -H "Authorization: Bearer API_KEY_EXAMPLE_REPLACE_ME_12345" \
     https://api.example.com/v1/users
```

**Impact:**
An attacker who extracts the API key can:
1. Make unlimited API calls without any authentication
2. Access user data if the API permits it
3. Consume API quota, causing DoS for legitimate users
4. Potentially modify data if the API key has write permissions
5. Financial impact if the API service charges per request

**Remediation:**
```java
// BEFORE (vulnerable):
private static final String API_KEY = "API_KEY_EXAMPLE_REPLACE_ME_12345";

// AFTER (secure): Never include production keys in APK

// Options:
// 1. Server-side proxy: App authenticates to your backend, backend calls external API
// 2. Backend authentication: Use OAuth/OpenID Connect with refresh tokens
// 3. Environment-specific keys: Debug keys only for development, prod keys never in APK
// 4. If API key must be in app, use AndroidKeyStore with hardware backing

// Example using backend proxy:
public class ApiClient {
    private static final String BASE_URL = "https://api.example.com/v1/";
    private final String sessionToken; // Obtained after login

    public ApiClient(String sessionToken) {
        this.sessionToken = sessionToken;
    }

    public OkHttpClient getClient() {
        return new OkHttpClient.Builder()
            .addInterceptor(chain -> {
                Request request = chain.request().newBuilder()
                    .addHeader("Authorization", "Bearer " + sessionToken)
                    .build();
                return chain.proceed(request);
            })
            .build();
    }
}
```
```

---

## CVSS 4.0 Scoring Reference

### Severity Mapping

> **See [CVSS 4.0 Severity Scoring](cvss-scoring-guide.md#severity-ratings) for complete scoring methodology.**

### Common Android Vulnerability CVSS Vectors

#### Exported Component (No Permission)
```
Base Score: 7.5 (HIGH)
Vector: AV:A/AC:L/PR:N/UI:N/VC:H/VI:N/VA:N
- Attack Vector (AV): Adjacent (another app)
- Attack Complexity (AC): Low
- Privileges Required (PR): None
- User Interaction (UI): None
- Confidentiality (VC): High
- Integrity (VI): None
- Availability (VA): None
```

#### Hardcoded Credentials
```
Base Score: 6.5 (MEDIUM)
Vector: AV:N/AC:L/PR:N/UI:N/VC:H/VI:N/VA:N
- Attack Vector (AV): Network (APK can be distributed)
- Attack Complexity (AC): Low
- Privileges Required (PR): None
- User Interaction (UI): None
- Confidentiality (VC): High
- Integrity (VI): None
- Availability (VA): None
```

#### Weak Cryptography
```
Base Score: 5.3 (MEDIUM)
Vector: AV:L/AC:L/PR:N/UI:N/VC:H/VI:N/VA:N
- Attack Vector (AV): Local (need access to device/data)
- Attack Complexity (AC): Low
- Privileges Required (PR): None
- User Interaction (UI): None
- Confidentiality (VC): High
- Integrity (VI): None
- Availability (VA): None
```

#### SQL Injection (via content provider)
```
Base Score: 9.8 (CRITICAL)
Vector: AV:N/AC:L/PR:N/UI:N/VC:H/VI:H/VA:H
- Attack Vector (AV): Network (via exported provider)
- Attack Complexity (AC): Low
- Privileges Required (PR): None
- User Interaction (UI): None
- Confidentiality (VC): High
- Integrity (VI): High
- Availability (VA): High
```

---

## OWASP Mobile Top 10 Categories Reference (2024)

| Category | Name | Description |
|----------|------|-------------|
| M1 | Improper Credential Usage | Hardcoded credentials, API keys in code, weak auth |
| M2 | Inadequate Supply Chain Security | Vulnerable third-party libraries, SDKs, dependencies |
| M3 | Insecure Authentication/Authorization | Weak session management, auth bypass, missing server validation |
| M4 | Insufficient Input/Output Validation | Unsafe deserialization, path traversal, injection flaws |
| M5 | Insecure Communication | Cleartext traffic, missing TLS, certificate pinning bypass |
| M6 | Inadequate Privacy Controls | Excessive data collection, missing consent mechanisms |
| M7 | Insufficient Binary Protections | Reverse engineering, anti-tampering, code obfuscation |
| M8 | Security Misconfiguration | Debug enabled, default credentials, exposed components |
| M9 | Insecure Data Storage | Plaintext SharedPrefs, unencrypted databases, SD card storage |
| M10 | Insufficient Cryptography | Weak algorithms (DES, MD5, SHA1), hardcoded keys, ECB mode |

---

## MASVS Categories Reference

| Category | Name | Focus Area |
|----------|------|-----------|
| MASVS-STORAGE | Storage | Data encryption, secure storage |
| MASVS-CRYPTO | Cryptography | Algorithm selection, key management |
| MASVS-AUTH | Authentication | Session management, multi-factor auth |
| MASVS-NETWORK | Network Communication | TLS, certificate pinning |
| MASVS-PLATFORM | Platform Interaction | IPC, permissions, intents |
| MASVS-PRIVACY | Privacy | Data collection, consent |
| MASVS-CODE | Code Quality | Input validation, output encoding |
| MASVS-RESILIENCE | Resilience | Anti-tampering, anti-debugging |

---

## Finding Template Fields Explained

### ID
Unique identifier for the finding. Use sequential numbering (e.g., `AUDIT-001`, `AUDIT-002`).

### Title
Concise, descriptive title that summarizes the vulnerability. Keep it under 10 words.

### Confidence
- **Confirmed**: Full source-to-sink trace validated with clear evidence from static analysis
- **Likely**: Strong evidence from static analysis with minor gaps, may require runtime confirmation
- **Needs Dynamic Confirmation**: Static analysis inconclusive, requires runtime verification

### Severity
Based on CVSS 4.0 score:
- **Critical** (9.0 - 10.0): Remote code execution, full device compromise
- **High** (7.0 - 8.9): Privilege escalation, credential theft, data exfiltration
- **Medium** (4.0 - 6.9): Local DoS, information disclosure, phishing
- **Low** (0.1 - 3.9): Minimal impact, requires significant user interaction

### CWE
MITRE CWE identifier (e.g., `CWE-89` for SQL injection, `CWE-79` for XSS).

### OWASP Mobile
OWASP Mobile Top 10 2024 category (e.g., `M1: Improper Credential Usage`, `M2: Inadequate Supply Chain Security`, `M9: Insecure Data Storage`).

### MASVS
Mobile App Security Verification Standard category (e.g., `MASVS-STORAGE`, `MASVS-CRYPTO`).

### MASTG Test
Mobile App Security Testing Guide test case reference (e.g., `MASTG-TEST-0143`).

### CVSS 4.0
Full CVSS 4.0 vector string and score using the [CVSS Calculator](https://www.first.org/cvss/calculator/4.0).

---

## Finding Writing Best Practices

1. **Be specific**: Include exact file paths, method names, and line numbers
2. **Provide PoC**: Every finding must have a testable proof of concept (ADB command, Frida script, etc.)
3. **Explain impact**: Don't just state the vulnerability - explain concrete consequences and what an attacker can DO
4. **Offer concrete remediation**: Provide working code examples with before/after comparisons, not just suggestions
5. **Mark uncertainty**: If unsure about exploitability, mark as "Needs Dynamic Confirmation"
6. **Avoid duplication**: Merge findings with the same root cause into a single comprehensive finding
7. **Use imperative language**: "Validate input", "Sanitize data", "Check permissions" not "Should validate"
8. **Show the data flow**: Trace attacker-controlled input from source to sink to demonstrate the vulnerability path
9. **Test your PoC**: Verify that your proof of concept actually demonstrates the vulnerability
10. **Document assumptions**: Clearly state any assumptions made (e.g., "Assuming app is installed on rooted device")

---

## Compact Coverage Statement Format

For quick reference, a compact coverage statement can be included at the end of reports:

```
Coverage Analysis:
- Static Analysis: Complete (all decompiled sources analyzed)
- Dynamic Analysis: [Complete/Partial/Not Performed] (reason if partial)
- Scope: [com.example.app.* namespace only]
- Framework: [React Native/Flutter/Native/Standard]
- Obfuscation: [ProGuard/R8/DexGuard/Custom/None]

Limitations:
- [List any limitations, e.g., "Native code analysis requires additional tools"]
- [Any components that could not be analyzed]
- [Any findings requiring additional verification]

Total Findings: X (Critical: Y, High: Z, Medium: A, Low: B)
```
