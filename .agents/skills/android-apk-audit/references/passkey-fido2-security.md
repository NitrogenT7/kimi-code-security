# Passkeys & FIDO2/WebAuthn Security Testing on Android

## Overview

Passkeys are phishing-resistant authentication credentials built on the FIDO2/WebAuthn standards. On Android, they are managed through the **Credential Manager API** (Android 14+), which provides a unified interface for passkeys, passwords, and federated sign-in methods.

**Key Security Characteristics:**
- Asymmetric cryptography (public/private key pairs)
- Private keys stored in hardware-backed keystore
- User verification required via biometrics or screen lock
- Cross-device sync via Google account (E2E encrypted)
- No shared secrets transmitted to servers

## How Passkeys Work on Android

### Registration Flow

```
┌─────────────┐      ┌──────────────┐      ┌──────────────┐
│   App       │ ──1──│ Credential   │ ──2──│  User        │
│             │  →   │   Manager    │  →   │  (Biometrics)│
└─────────────┘      └──────────────┘      └──────────────┘
       ↑                                            ↓
       └────────────────5────────────────────────────┘
                          ↓
                   ┌──────────────┐
                   │   Server     │
                   │  (Store PK)  │
                   └──────────────┘
```

1. App calls `CreateCredentialRequest` with user info
2. Credential Manager prompts user for biometric verification
3. System generates private key in hardware keystore
4. Public key and attestation sent to server
5. Server stores public key linked to user account

### Authentication Flow

```
┌─────────────┐      ┌──────────────┐      ┌──────────────┐
│   Server    │ ──1──│   App        │ ──2──│ Credential   │
│ (Challenge) │  →   │              │  →   │   Manager    │
└─────────────┘      └──────────────┘      └──────────────┘
       ↑                                            ↓
       └────────────────5────────────────────────────┘
                          ↓
                   ┌──────────────┐
                   │  User        │
                   │  (Biometrics)│
                   └──────────────┘
```

1. Server generates random challenge
2. App calls `GetCredentialRequest` with challenge
3. Credential Manager prompts user for biometric verification
4. System signs challenge with private key
5. Server verifies signature with stored public key

## Credential Manager API Security Analysis

### API Components

| Component | Purpose | Security Considerations |
|-----------|---------|------------------------|
| `CreateCredentialRequest` | Register new credential | Validates request integrity, prevents tampering |
| `GetCredentialRequest` | Retrieve existing credential | Ensures challenge freshness, prevents replay |
| `CredentialManager` | System service | Enforces user verification, secure key storage |
| `PublicKeyCredential` | FIDO2 credential format | Proper encoding, attestation validation |

### Security Boundaries

1. **Process Isolation**: Credential Manager runs in separate system process
2. **User Verification**: Required via biometrics or lockscreen
3. **Hardware Keystore**: Private keys never leave secure enclave
4. **Key Access Control**: Keys can be bound to specific apps/user verification

## Static Analysis Checklist

### Manifest Analysis

```xml
<!-- Check for required permissions -->
<uses-permission android:name="android.permission.USE_BIOMETRIC" />
<uses-permission android:name="android.permission.USE_FINGERPRINT" />

<!-- Check target SDK for Credential Manager availability -->
<uses-sdk android:targetSdkVersion="34" />
```

**Checks:**
- [ ] Proper biometric permissions declared
- [ ] Target SDK 34+ for Credential Manager
- [ ] `android:exported="false"` for credential-related activities
- [ ] No insecure backup flags (`allowBackup="false"`)
- [ ] Proper certificate pinning if API endpoints used

### Code Analysis - Registration

**Search Patterns:**
- `CreatePublicKeyCredentialRequest`
- `CredentialManager.createCredential`
- `Passkey` references

**Key Code Locations:**
```java
// Vulnerable: Skipping user verification
CreatePublicKeyCredentialRequest request =
    new CreatePublicKeyCredentialRequest(
        requestJson
        // ❌ MISSING: no user verification requirement
    );

// Secure: Enforcing user verification
CreatePublicKeyCredentialRequest request =
    new CreatePublicKeyCredentialRequest(
        requestJson
    );
// ✅ User verification configured in request JSON:
// "authenticatorSelection": {"userVerification": "required"}
```

**Static Checks:**
- [ ] User verification required in request JSON: `"authenticatorSelection": {"userVerification": "required"}`
- [ ] No hardcoded challenges or salts
- [ ] Proper exception handling for credential errors
- [ ] Challenge includes clientData (origin, type, challenge)
- [ ] Attestation validation if required

### Code Analysis - Authentication

**Search Patterns:**
- `GetPublicKeyCredentialOption`
- `CredentialManager.getCredential`
- `GetCredentialRequest`

**Key Code Locations:**
```java
// Vulnerable: No challenge validation
GetCredentialRequest request =
    new GetCredentialRequest(
        getCredentialOptions()
        // ❌ MISSING: no challenge validation
    );

// Secure: With challenge and origin validation
GetCredentialRequest request =
    new GetCredentialRequest(
        getCredentialOptions(challenge, origin)
    );
```

**Static Checks:**
- [ ] Challenge is generated server-side (random, fresh)
- [ ] Challenge size ≥ 16 bytes
- [ ] Challenge includes in clientDataHash
- [ ] Origin validation (prevent cross-origin attacks)
- [ ] Signature algorithm matches server expectations
- [ ] No credential ID reuse across sessions

### Data Flow Analysis

**Trace the following:**
1. Challenge generation → Where is it created?
2. Credential storage → Are keys hardware-backed?
3. User verification prompts → Is biometric required?
4. Network transmission → Is TLS enforced?
5. Error handling → Do errors leak information?

**Grep Commands:**
```bash
# Find credential registration
rg -i "CreatePublicKeyCredentialRequest|createCredential" --type java

# Find credential authentication
rg -i "GetCredentialRequest|getCredential" --type java

# Find challenge generation
rg -i "challenge|nonce|random" --type java

# Find biometric usage
rg -i "BiometricPrompt|FingerprintManager|USE_BIOMETRIC" --type java
```

## Dynamic Testing Methodology

### Phase 1: Setup and Recon

```bash
# 1. Identify app package and activities
adb shell pm list packages | grep -i <appname>
adb shell dumpsys package <package> | grep -A 20 "Activity"

# 2. Check API level for Credential Manager support
adb shell getprop ro.build.version.sdk

# 3. Enable Frida server
adb forward tcp:27042 tcp:27042
adb shell su -c "/data/local/tmp/frida-server &"
```

### Phase 2: Registration Flow Testing

**Test Cases:**

| # | Test | Expected Result |
|---|------|-----------------|
| 1 | Initiate registration | Biometric prompt appears |
| 2 | Cancel biometric | Registration fails gracefully |
| 3 | Use weak biometric (low quality fingerprint) | System enforces quality threshold |
| 4 | Rapid repeated registrations | Rate limiting or biometric re-auth |
| 5 | Network timeout during registration | Proper error handling |
| 6 | Tamper request JSON | Registration fails with error |

**Testing Commands:**
```bash
# Monitor for credential manager calls
frida -U -f <package> -l hook_credential_manager.js

# Check for biometric prompts
adb logcat | grep -i "BiometricPrompt|Fingerprint"
```

### Phase 3: Authentication Flow Testing

**Test Cases:**

| # | Test | Expected Result |
|---|------|-----------------|
| 1 | Normal authentication | Biometric prompt, signature verification |
| 2 | Replay captured challenge | Server rejects (challenge expired/used) |
| 3 | Modify challenge in-flight | Signature verification fails |
| 4 | Skip biometric (if bypass possible) | Test should fail or require re-auth |
| 5 | Invalid credential ID | Proper error returned |
| 6 | Expired challenge | Server rejects with proper error |

**Testing Commands:**
```bash
# Intercept network traffic
adb shell tcpdump -i any -w traffic.pcap
mitmproxy -p 8080 --set block_global=false

# Monitor signature operations
frida -U -f <package> -l hook_signature.js
```

### Phase 4: Biometric Bypass Testing

**Techniques to Test:**

1. **Root-based bypass**: Using Frida to skip biometric prompts
2. **Device credential fallback**: Testing lockscreen PIN/pattern fallback
3. **Accessibility service abuse**: Exploiting accessibility features
4. **Screen lock bypass**: Testing with disabled screen lock

**Frida Hook for Biometric Bypass:**
```javascript
// See Frida Scripts section below
```

### Phase 5: Key Storage Analysis

```bash
# Check for hardware-backed keys
adb shell keystore list

# Extract key metadata
adb shell su -c "keytool -keystore /data/misc/keystore/.system -list"

# Monitor key generation events
adb logcat | grep -i "keystore|KeyMaster"
```

## Frida Scripts for Testing

### Script 1: Hook Credential Manager Registration

```javascript
// hook_registration.js
Java.perform(function() {
    var CreatePublicKeyCredentialRequest = Java.use(
        "android.credentials.CreatePublicKeyCredentialRequest"
    );

    CreatePublicKeyCredentialRequest.$init.overload(
        'java.lang.String'
    ).implementation = function(requestJson) {
        console.log("[+] CreatePublicKeyCredentialRequest called");
        console.log("    Request JSON: " + requestJson);

        // Check if user verification is required in JSON
        try {
            var json = JSON.parse(requestJson);
            if (json.authenticatorSelection) {
                var userVerification = json.authenticatorSelection.userVerification;
                console.log("    User Verification Required: " + userVerification);

                if (userVerification !== "required") {
                    console.log("[!] ⚠️ VULNERABILITY: User verification NOT required!");
                }
            }
        } catch (e) {
            console.log("    Failed to parse JSON: " + e);
        }

        return this.$init(requestJson);
    };

    var CredentialManager = Java.use("android.credentials.CredentialManager");

    CredentialManager.createCredential.implementation = function(
        request, cancellationSignal, executor, callback
    ) {
        console.log("[+] CredentialManager.createCredential called");
        console.log("    Request: " + request.getClass().getName());

        return this.createCredential(request, cancellationSignal, executor, callback);
    };
});
```

### Script 2: Hook Credential Manager Authentication

```javascript
// hook_authentication.js
Java.perform(function() {
    var GetPublicKeyCredentialOption = Java.use(
        "android.credentials.GetPublicKeyCredentialOption"
    );

    GetPublicKeyCredentialOption.$init.overload(
        'java.lang.String'
    ).implementation = function(requestJson) {
        console.log("[+] GetPublicKeyCredentialOption called");
        console.log("    Request JSON: " + requestJson);

        // Extract challenge
        try {
            var json = JSON.parse(requestJson);
            if (json.challenge) {
                console.log("    Challenge: " + json.challenge);

                // Check challenge length
                if (json.challenge.length < 16) {
                    console.log("[!] ⚠️ VULNERABILITY: Challenge too short (< 16 bytes)");
                }
            }
        } catch (e) {
            console.log("    Failed to parse JSON: " + e);
        }

        return this.$init(requestJson);
    };

    var CredentialManager = Java.use("android.credentials.CredentialManager");

    CredentialManager.getCredential.implementation = function(
        request, cancellationSignal, executor, callback
    ) {
        console.log("[+] CredentialManager.getCredential called");
        console.log("    Request: " + request.getClass().getName());

        return this.getCredential(request, cancellationSignal, executor, callback);
    };
});
```

### Script 3: Biometric Prompt Bypass

```javascript
// hook_biometric_bypass.js
Java.perform(function() {
    // Hook BiometricPrompt to simulate successful auth
    var BiometricPrompt = Java.use("android.hardware.biometrics.BiometricPrompt");

    BiometricPrompt.authenticate.overload(
        'android.hardware.biometrics.BiometricPrompt$PromptInfo',
        'android.os.CancellationSignal',
        'java.util.concurrent.Executor',
        'android.hardware.biometrics.BiometricPrompt$AuthenticationCallback'
    ).implementation = function(promptInfo, cancellationSignal, executor, callback) {
        console.log("[+] BiometricPrompt.authenticate called");
        console.log("    This hook attempts to bypass biometric verification");

        // Simulate successful authentication
        var AuthenticationResult = Java.use(
            "android.hardware.biometrics.BiometricPrompt$AuthenticationResult"
        );

        // Call the authentication success callback
        var result = AuthenticationResult.$new(null, null, 0);
        callback.onAuthenticationSucceeded(result);

        console.log("[!] ⚠️ BIOMETRIC BYPASSED: Simulated success callback");
    };
});
```

### Script 4: Challenge Interception and Replay

```javascript
// hook_challenge_replay.js
Java.perform(function() {
    var challenges = [];

    // Hook crypto signing operations
    var Signature = Java.use("java.security.Signature");

    Signature.update.overload('[B').implementation = function(data) {
        console.log("[+] Signature.update called");
        console.log("    Data length: " + data.length);
        console.log("    Data (hex): " + bytesToHex(data));

        // Store potential challenge
        if (data.length <= 64) {
            challenges.push({
                timestamp: Date.now(),
                data: Array.from(data)
            });
            console.log("    Stored challenge #" + challenges.length);
        }

        return this.update(data);
    };

    function bytesToHex(bytes) {
        var hex = "";
        for (var i = 0; i < bytes.length; i++) {
            hex += (bytes[i] >>> 4).toString(16);
            hex += (bytes[i] & 0x0f).toString(16);
        }
        return hex;
    }

    // Print captured challenges periodically
    setInterval(function() {
        if (challenges.length > 0) {
            console.log("\n[=] Captured Challenges: " + challenges.length);
            challenges.forEach(function(challenge, idx) {
                console.log("    #" + (idx + 1) + ": " + bytesToHex(challenge.data));
            });
        }
    }, 30000);
});
```

### Script 5: Key Storage Verification

```javascript
// hook_key_storage.js
Java.perform(function() {
    var KeyGenParameterSpec = Java.use("android.security.keystore.KeyGenParameterSpec");

    KeyGenParameterSpec.Builder.$init.overload('java.lang.String', 'int').implementation = function(alias, purposes) {
        console.log("[+] KeyGenParameterSpec.Builder called");
        console.log("    Key alias: " + alias);
        console.log("    Purposes: " + purposes);

        return this.$init(alias, purposes);
    };

    var KeyProperties = Java.use("android.security.keystore.KeyProperties");

    // Check key properties for security
    KeyGenParameterSpec.Builder.setKeyValidityStart.overload('java.util.Date').implementation = function(startDate) {
        console.log("[+] Key validity start: " + startDate);
        return this.setKeyValidityStart(startDate);
    };

    KeyGenParameterSpec.Builder.setKeyValidityEnd.overload('java.util.Date').implementation = function(endDate) {
        console.log("[+] Key validity end: " + endDate);
        return this.setKeyValidityEnd(endDate);
    };

    KeyGenParameterSpec.Builder.setUserAuthenticationRequired.overload('boolean').implementation = function(required) {
        console.log("[+] User authentication required: " + required);

        if (!required) {
            console.log("[!] ⚠️ VULNERABILITY: Key can be used WITHOUT user authentication!");
        }

        return this.setUserAuthenticationRequired(required);
    };

    KeyGenParameterSpec.Builder.setUserAuthenticationValidityDurationSeconds.overload('int').implementation = function(seconds) {
        console.log("[+] User authentication validity: " + seconds + " seconds");

        if (seconds > 0) {
            console.log("[!] ⚠️ ISSUE: Key can be reused for " + seconds + " seconds without re-auth");
        }

        return this.setUserAuthenticationValidityDurationSeconds(seconds);
    };
});
```

## Common Vulnerabilities and Test Cases

### V1: Missing User Verification

**Severity:** HIGH

**Description:** App allows passkey registration or authentication without requiring biometric user verification.

**Impact:** Attacker with device access can use passkeys without biometric consent.

**Test Cases:**
```bash
# Test 1: Check if biometric prompt appears
1. Initiate registration
2. If no biometric prompt → VULNERABLE

# Test 2: Frida hook to verify userVerificationRequired flag
frida -U -f <package> -l hook_registration.js
# Look for "User Verification Required: false"

# Test 3: Attempt authentication after device unlock
# Should still require biometric → if not, VULNERABLE
```

**Remediation:**
```java
// Always enforce user verification
CreatePublicKeyCredentialRequest request = new CreatePublicKeyCredentialRequest(
    requestJson
);
// ✅ REQUIRED: Include userVerification in request JSON:
// "authenticatorSelection": {"userVerification": "required"}
```

### V2: Weak Challenge Management

**Severity:** HIGH

**Description:** Server uses weak, predictable, or non-random challenges.

**Impact:** Attacker can predict or replay challenges for authentication bypass.

**Test Cases:**
```bash
# Test 1: Capture multiple challenges and check for patterns
frida -U -f <package> -l hook_authentication.js

# Test 2: Check challenge length
# Challenge < 16 bytes → VULNERABLE

# Test 3: Replay attack
1. Capture challenge and signature
2. Replay same request
3. If server accepts → VULNERABLE

# Test 4: Predictability test
# Request multiple challenges in quick succession
# Check if they follow a pattern (sequential, timestamp-based, etc.)
```

**Remediation:**
```java
// Server-side: Use cryptographically secure random challenges
byte[] challenge = new byte[32];
SecureRandom random = new SecureRandom();
random.nextBytes(challenge);

// Challenge must be unique per session and expire quickly (< 5 minutes)
```

### V3: Fallback to Password Without Proper Enforcement

**Severity:** MEDIUM

**Description:** App allows fallback to password authentication even when passkeys are available.

**Impact:** Enables credential stuffing and password-based attacks.

**Test Cases:**
```bash
# Test 1: Attempt password login when passkey exists
# If app allows immediate password login → ISSUE

# Test 2: Check if rate limiting applies to password fallback
# If no rate limiting → VULNERABLE

# Test 3: Test credential stuffing against password endpoint
# If no MFA or additional verification → VULNERABLE
```

**Remediation:**
```java
// Prefer passkeys over passwords
// If passkey available, require passkey or multi-factor verification
// Implement rate limiting on password endpoints
```

### V4: Insecure Key Storage

**Severity:** HIGH

**Description:** Private keys are not stored in hardware-backed keystore.

**Impact:** Keys can be extracted from device storage.

**Test Cases:**
```bash
# Test 1: Check key storage location
adb shell ls -la /data/data/<package>/files/
# If private keys found → VULNERABLE

# Test 2: Verify hardware-backed storage
frida -U -f <package> -l hook_key_storage.js
# Check for "User authentication required: false"

# Test 3: Attempt to extract keys
adb shell su -c "find /data -name '*.key' -o -name '*.pem'"
```

**Remediation:**
```java
// Use Android Keystore with hardware backing
KeyGenParameterSpec spec = new KeyGenParameterSpec.Builder(
    keyAlias,
    KeyProperties.PURPOSE_SIGN | KeyProperties.PURPOSE_VERIFY
)
    .setKeySize(256)
    .setUserAuthenticationRequired(true) // ✅ Hardware-backed
    .setUserAuthenticationValidityDurationSeconds(0) // Require auth each time
    .build();
```

### V5: No Rate Limiting

**Severity:** MEDIUM

**Description:** No limits on authentication attempts.

**Impact:** Brute force attacks on authentication flows.

**Test Cases:**
```bash
# Test 1: Rapid authentication attempts
for i in {1..100}; do
    curl -X POST <auth_endpoint>
done
# If all attempts allowed → VULNERABLE

# Test 2: Check for account lockout
# After N failed attempts, account should lock → if not, VULNERABLE

# Test 3: Test with different credential IDs
# If no per-credential rate limiting → ISSUE
```

**Remediation:**
```java
// Server-side: Implement exponential backoff
// - 5 attempts: 30 second lock
// - 10 attempts: 5 minute lock
// - 20 attempts: 1 hour lock
// Consider account lockout after sustained attacks
```

### V6: Missing Origin Validation

**Severity:** MEDIUM

**Description:** ClientData doesn't properly validate origin in WebAuthn flows.

**Impact:** Cross-origin attacks, credential theft.

**Test Cases:**
```bash
# Test 1: Modify origin in WebAuthn request
# Change origin to attacker-controlled domain
# If authentication succeeds → VULNERABLE

# Test 2: Test with localhost vs production origin
# If both accepted → VULNERABLE

# Frida hook to verify origin:
console.log("Origin: " + JSON.parse(requestJson).origin);
```

**Remediation:**
```java
// Server-side: Validate origin in clientData
String expectedOrigin = "https://example.com";
String actualOrigin = clientData.getString("origin");
if (!expectedOrigin.equals(actualOrigin)) {
    throw new SecurityException("Invalid origin");
}
```

### V7: Incomplete Server-Side Verification

**Severity:** HIGH

**Description:** Server doesn't verify all signature components (challenge, origin, authenticator data).

**Impact:** Signature replay attacks, credential forgery.

**Test Cases:**
```bash
# Test 1: Replay previously captured signature
# If server accepts → VULNERABLE

# Test 2: Modify challenge in signature
# If server doesn't detect → VULNERABLE

# Test 3: Use expired challenge
# If server accepts → VULNERABLE

# Test 4: Test with wrong credential ID
# If server authenticates wrong user → VULNERABLE
```

**Remediation:**
```java
// Server-side: Verify all signature components
// 1. Challenge matches stored session challenge
// 2. Origin is correct
// 3. Authenticator data is valid
// 4. User verification flag is set
// 5. Signature verification passes
// 6. Credential ID exists and belongs to user
```

## Server-Side Testing

### Testing Checklist

| Test | Method | Expected Result |
|------|--------|-----------------|
| Challenge uniqueness | Multiple auth requests | Different challenges each time |
| Challenge expiration | Use expired challenge | Server rejects |
| Challenge size | Measure challenge length | ≥ 16 bytes (recommended 32+) |
| Signature verification | Modify signature bytes | Server rejects |
| Replay protection | Replay valid signature | Server rejects |
| Origin validation | Spoof origin | Server rejects |
| Credential ID binding | Use different user's credential | Server rejects |
| Rate limiting | Rapid auth attempts | Rate limit enforced |
| Account lockout | Failed auth attempts | Account locks after threshold |
| Fallback password | Attempt password login | Proper rate limiting/MFA |

### Server Testing with curl

```bash
# 1. Get challenge
curl -X POST https://api.example.com/auth/challenge \
  -H "Content-Type: application/json" \
  -d '{"username": "testuser"}'

# 2. Replay attack (with previously captured response)
curl -X POST https://api.example.com/auth/signin \
  -H "Content-Type: application/json" \
  -d @captured_response.json
# Should fail with "Challenge expired" or similar

# 3. Test origin spoofing
curl -X POST https://api.example.com/auth/signin \
  -H "Content-Type: application/json" \
  -d '{
    "clientDataJSON": base64encode({
      "type": "webauthn.get",
      "challenge": "...",
      "origin": "https://evil.com"  // Spoofed origin
    }),
    ...
  }'
# Should fail with "Invalid origin"
```

## Reporting Template for Passkey Findings

### Finding Template

```markdown
## [SEVERITY] Passkey Vulnerability: [Title]

### Vulnerability Type
Passkey / FIDO2 / WebAuthn Security Flaw

### Location
- **File:** `app/src/main/java/com/example/AuthManager.java`
- **Lines:** 42-58
- **API:** `android.credentials.CreatePublicKeyCredentialRequest`

### Description
[Detailed description of the vulnerability]

### Impact
- [ ] Authentication bypass
- [ ] Unauthorized access to user accounts
- [ ] Credential stuffing possible
- [ ] Key extraction from device
- [ ] Replay attacks

### Proof of Concept

**Steps to Reproduce:**
1. Install APK on rooted device
2. Run Frida script: `frida -U -f <package> -l script.js`
3. Initiate registration/authentication flow
4. Observe output
5. Vulnerability confirmed when [specific condition met]

**Frida Script:**
```javascript
// POC script
```

**Output:**
```
[+] Log output showing vulnerability
```

### Root Cause
[Technical explanation of why the vulnerability exists]

### CVSS 4.0 Score
- **Base Score:** X.X (CRITICAL/HIGH/MEDIUM/LOW)
- **Vector:** CVSS:4.0/[AV:N/AC:L/AT:N/PR:N/UI:N/VC:H/VI:H/VA:H/SC:H/SI:H/SA:H]

### OWASP MASTG Reference
- [MASTG-TEST-0015](https://mas.owasp.org/MASTG/0x05f-Testing-Local-Authentication/)
- [MASTG-TEST-0035](https://mas.owasp.org/MASTG/0x05j-Testing-Data-Storage-for-Privacy/)

### Remediation
```java
// Secure implementation example
```

**Additional Recommendations:**
- Enforce user verification for all credential operations
- Use hardware-backed keystore for key storage
- Implement server-side challenge validation
- Add rate limiting to authentication endpoints
- Regular security audits of FIDO2 implementation

### References
- [Android Credential Manager Docs](https://developer.android.com/identity/credential-manager)
- [Passkeys Best Practices](https://developer.android.com/identity/passkeys/create-passkeys)
- [FIDO2 Security Guidelines](https://fidoalliance.org/specs/fido-v2.0-ps-20190130/fido-security-considerations.html)
```

## References

### Official Documentation
- [Android Credential Manager API](https://developer.android.com/identity/credential-manager)
- [Creating Passkeys](https://developer.android.com/identity/passkeys/create-passkeys)
- [FIDO2 Migration Guide](https://developer.android.com/identity/sign-in/fido2-migration)
- [Biometric Authentication](https://developer.android.com/training/sign-in/biometric-auth)

### Security Standards
- [FIDO2/WebAuthn Specification](https://www.w3.org/TR/webauthn/)
- [FIDO Security Considerations](https://fidoalliance.org/specs/fido-v2.0-ps-20190130/fido-security-considerations.html)
- [OWASP MASTG - Local Authentication](https://mas.owasp.org/MASTG/0x05f-Testing-Local-Authentication/)

### Tools
- [Frida](https://frida.re/) - Dynamic instrumentation framework
- [Burp Suite](https://portswigger.net/burp) - Web API testing
- [Android Keystore System](https://developer.android.com/training/articles/keystore)

### Additional Resources
- [Passkeys Security Whitepaper](https://security.googleblog.com/2022/05/05/announcing-passkeys.html)
- [FIDO Alliance Testing Tools](https://fidoalliance.org/resources/testing-tools/)
- [WebAuthn Testing Checklist](https://webauthn.guide/)
