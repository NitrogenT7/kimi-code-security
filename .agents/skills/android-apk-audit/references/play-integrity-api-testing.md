# Play Integrity API Testing Guide

## Overview

Google Play Integrity API provides hardware-based device attestation through Google Play Services, requiring server-side verification for security. This guide covers testing applications that implement Play Integrity checks.

### Migration Context

| Aspect | SafetyNet | Play Integrity (Current) |
|--------|-----------|--------------------------|
| **Status** | Discontinued Jan 2025 | Active, mandatory for Play Store |
| **Attestation Type** | Software-based (weak) | Hardware-backed (strong) |
| **Verification** | Could be client-side | Must be server-side |
| **Device Requirements** | Basic Android | Google Play Services required |
| **Token Format** | JWT with limited claims | JWT with detailed device/app verdicts |

### Key Differences

- **Hardware-based attestation**: Uses Trusted Execution Environment (TEE) and key attestation
- **Stronger verdict system**: Multiple integrity levels with granular controls
- **Mandatory server-side verification**: Client-side validation is insecure and exploitable
- **Play Store integration**: Only Play Store apps can achieve full verdicts

## Play Integrity API Architecture

### Architecture Components

```
┌─────────────────────────────────────────────────────────────────┐
│                         Client App                                │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  IntegrityManager.requestIntegrityToken()               │  │
│  │  - Generates cryptographic nonce                        │  │
│  │  - Sends to Play Services                                │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────┬───────────────────────────────────────────┘
                      │
                      │ IPC (Binder)
                      ▼
┌─────────────────────────────────────────────────────────────────┐
│                   Google Play Services                          │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  IntegrityService                                       │  │
│  │  - Hardware attestation (TEE/Keybox)                     │  │
│  │  - Device integrity evaluation                           │  │
│  │  - App integrity verification                            │  │
│  │  - Account licensing check                              │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────┬───────────────────────────────────────────┘
                      │
                      │ HTTPS
                      ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Google Play Servers                          │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  Play Integrity API Backend                             │  │
│  │  - Verifies device hardware signatures                   │  │
│  │  - Checks app store signatures                           │  │
│  │  - Validates licensing status                           │  │
│  │  - Generates signed JWT token                           │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────┬───────────────────────────────────────────┘
                      │
                      │ Returns JWT Token
                      ▼
┌─────────────────────────────────────────────────────────────────┐
│                         Client App                                │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  Token received (IntegrityTokenResponse)                │  │
│  │  - Sends token to your server for verification           │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────┬───────────────────────────────────────────┘
                      │
                      │ HTTPS
                      ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Application Server                           │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  Server-Side Verification                              │  │
│  │  - Calls Google Play Integrity API endpoint             │  │
│  │  - Verifies JWT signature                               │  │
│  │  - Enforces verdict requirements                        │  │
│  │  - Checks timestamp and nonce validity                   │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

### Token Request Flow

1. **Client generates nonce**: Cryptographic random string (recommended 16+ bytes)
2. **Request token sent to Play Services**: Via `IntegrityManager.requestIntegrityToken()`
3. **Play Services performs attestation**:
   - Hardware key attestation (TEE/keybox)
   - Device integrity evaluation (root, ROM modifications)
   - App signature verification (Play Store recognition)
   - Licensing verification (if enabled)
4. **Google Play servers sign token**: JWT with device verdicts and timestamps
5. **Token returned to client**: Base64-encoded JWT string
6. **Client sends token to server**: For verification and enforcement
7. **Server verifies token**: Via Google Play Integrity API or local JWT verification
8. **Server enforces verdicts**: Based on integrity requirements

## Integrity Verdict Types

### 1. Classic Integrity Token

**Use Case**: Basic app genuineness verification for non-Play Store apps

**Request Structure**:
```java
IntegrityTokenRequest request = IntegrityTokenRequest.builder()
    .setNonce(generateNonce())
    .setCloudProjectNumber(PROJECT_NUMBER)
    .build();
```

**Response Verdicts**:
- **Basic**: Device meets basic integrity requirements
- **No verdict**: Insufficient device capabilities

### 2. Device Integrity Verdicts

| Verdict | Meaning | Security Level | Pass Condition |
|---------|---------|----------------|----------------|
| **MEETS_DEVICE_INTEGRITY** | Device passes Google Play Protect certification | HIGH | Unmodified ROM, certified device, no root |
| **MEETS_BASIC_INTEGRITY** | Device passes basic integrity checks | MEDIUM | Non-rooted, no major tampering detected |
| **MEETS_STRONG_INTEGRITY** | Strong hardware-backed integrity (requires secure boot chain) | HIGH | Secure boot chain verified, strong hardware guarantees |

**Note:** `MEETS_BASIC_INTEGRITY` is returned by **DEFAULT** — no Play Console configuration required.
| **MEETS_VIRTUAL_INTEGRITY** | App running in approved emulator/virtual environment | LOW | Google Play Games on PC, approved cloud gaming |
| **UNEVALUATED** | Device integrity not evaluated | NONE | Play Services outdated or unavailable |

**Security Implications**:
- `MEETS_DEVICE_INTEGRITY`: Recommended for high-risk operations
- `MEETS_BASIC_INTEGRITY`: Acceptable for low-risk features, vulnerable to Magisk bypasses
- `MEETS_VIRTUAL_INTEGRITY`: Approved emulators only, general emulators will fail
- `UNEVALUATED`: Should be rejected for any security-sensitive operation

### 3. App Integrity Verdicts

| Verdict | Meaning | Security Impact |
|---------|---------|-----------------|
| **PLAY_RECOGNIZED** | App is installed from Google Play Store with matching signature | TRUSTED |
| **UNRECOGNIZED_VERSION** | App signature matches but version unrecognized by Play Store | SUSPICIOUS |
| **UNEVALUATED** | App integrity not evaluated | UNTRUSTED |

**Security Implications**:
- **PLAY_RECOGNIZED**: Only accept this verdict for Play Store apps
- **UNRECOGNIZED_VERSION**: May indicate tampered APK or sideloaded version
- **UNEVALUATED**: Reject for security-sensitive features

### 4. Account Details Verdicts (Optional)

| Verdict | Meaning |
|---------|---------|
| **LICENSED** | User has valid app license |
| **UNLICENSED** | User lacks valid license |
| **UNEVALUATED** | Licensing not checked |

**Note**: Account licensing requires Google Play Billing integration

### 5. Environment Details Verdicts

| Verdict | Meaning |
|---------|---------|
| **APP_ACCESS_RISK_UNDETECTED** | No malicious app access detected |
| **APP_ACCESS_RISK_DETECTED** | Malicious app access detected |
| **PLAY_PROTECT_UNDETECTED** | No Play Protect threats found |
| **PLAY_PROTECT_DETECTED** | Play Protect threats detected |

**Note**: Environment details provide additional context about device security posture.

## Server-Side Verification Implementation

### Why Server-Side is Mandatory

**Client-side verification vulnerabilities**:
- **Token forgery**: Attacker can intercept and replay valid tokens
- **Replay attacks**: Stolen tokens can be reused indefinitely
- **Man-in-the-middle**: Intercept and modify verdict responses
- **Tampering**: Client code can be modified to bypass checks

### Server-Side Verification Flow

#### 1. Google Play Integrity API Verification

```bash
# Endpoint
POST https://playintegrity.googleapis.com/v1/{package_name}:decodeIntegrityToken

# Request
{
  "token": "<base64_encoded_jwt>"
}

# Response
{
  "tokenPayloadExternal": {
    "accountDetails": {
      "appLicensingVerdict": "LICENSED"
    },
    "appIntegrity": {
      "appRecognitionVerdict": "PLAY_RECOGNIZED",
      "packageName": "com.target.app",
      "certificateSha256Digests": ["abc123..."]
    },
    "deviceIntegrity": {
      "deviceRecognitionVerdict": [
        "MEETS_DEVICE_INTEGRITY"
      ]
    },
    "requestDetails": {
      "requestPackageName": "com.target.app",
      "nonce": "<base64_nonce>",
      "timestampMillis": "1234567890123"
    }
  }
}
```

#### 2. Server-Side Verification Implementation (Node.js)

```javascript
const {google} = require('googleapis');
const playIntegrity = google.playintegrity('v1');

async function verifyPlayIntegrityToken(packageName, accessToken, integrityToken) {
  const auth = new google.auth.OAuth2();
  auth.setCredentials({access_token: accessToken});

  try {
    const response = await playIntegrity.v1.packages.decodeIntegrityToken({
      name: `packages/${packageName}`,
      resource: {
        token: integrityToken
      },
      auth: auth
    });

    const payload = response.data.tokenPayloadExternal;

    // 1. Verify timestamp freshness (token valid for ~5 minutes)
    const timestamp = payload.requestDetails.timestampMillis;
    const currentTime = Date.now();
    const tokenAge = (currentTime - timestamp) / 1000;

    if (tokenAge > 300) { // 5 minutes
      throw new Error('Token expired');
    }

    // 2. Verify nonce (prevent replay attacks)
    const storedNonce = getNonceFromSession(payload.requestDetails.nonce);
    if (!storedNonce || !crypto.timingSafeEqual(
      Buffer.from(payload.requestDetails.nonce, 'base64'),
      Buffer.from(storedNonce, 'base64')
    )) {
      throw new Error('Invalid or reused nonce');
    }

    // 3. Verify package name matches
    if (payload.requestDetails.requestPackageName !== packageName) {
      throw new Error('Package name mismatch');
    }

    // 4. Verify device integrity verdict
    const deviceVerdicts = payload.deviceIntegrity?.deviceRecognitionVerdict || [];
    if (!deviceVerdicts.includes('MEETS_DEVICE_INTEGRITY')) {
      throw new Error('Device integrity check failed');
    }

    // 5. Verify app integrity verdict
    const appVerdict = payload.appIntegrity?.appRecognitionVerdict;
    if (appVerdict !== 'PLAY_RECOGNIZED') {
      throw new Error('App not recognized from Play Store');
    }

    // 6. (Optional) Verify licensing
    const licenseVerdict = payload.accountDetails?.appLicensingVerdict;
    if (licenseVerdict !== 'LICENSED') {
      throw new Error('App not licensed');
    }

    // 7. Verify certificate matches expected signature
    const certHashes = payload.appIntegrity?.certificateSha256Digests || [];
    if (!certHashes.includes(EXPECTED_CERT_HASH)) {
      throw new Error('App certificate mismatch');
    }

    return { valid: true, payload };

  } catch (error) {
    console.error('Integrity verification failed:', error);
    return { valid: false, error: error.message };
  }
}
```

#### 3. Local JWT Verification (Performance Alternative)

```javascript
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

// Google Play Integrity public keys
const GOOGLE_PLAY_INTEGRITY_PUBLIC_KEYS = {
  "keys": [
    // Load from: https://www.googleapis.com/oauth2/v1/certs
  ]
};

async function verifyTokenLocally(token, expectedPackage, expectedCert) {
  try {
    // 1. Decode JWT header to get key ID
    const decoded = jwt.decode(token, {complete: true});
    const kid = decoded.header.kid;

    // 2. Get public key
    const publicKey = getPublicKeyById(kid);
    if (!publicKey) {
      throw new Error('Invalid key ID');
    }

    // 3. Verify JWT signature
    const payload = jwt.verify(token, publicKey, {
      algorithms: ['RS256'],
      issuer: 'https://play.googleapis.com'
    });

    // 4. Verify timestamp freshness
    const tokenAge = (Date.now() - payload.requestDetails.timestampMillis) / 1000;
    if (tokenAge > 300) {
      throw new Error('Token expired');
    }

    // 5. Verify nonce
    const storedNonce = getNonceFromSession(payload.requestDetails.nonce);
    if (!storedNonce) {
      throw new Error('Invalid nonce');
    }

    // 6. Verify package name
    if (payload.requestDetails.requestPackageName !== expectedPackage) {
      throw new Error('Package name mismatch');
    }

    // 7. Verify device integrity
    const deviceVerdicts = payload.deviceIntegrity?.deviceRecognitionVerdict || [];
    if (!deviceVerdicts.includes('MEETS_DEVICE_INTEGRITY')) {
      throw new Error('Device integrity insufficient');
    }

    // 8. Verify app integrity
    if (payload.appIntegrity?.appRecognitionVerdict !== 'PLAY_RECOGNIZED') {
      throw new Error('App not recognized');
    }

    // 9. Verify certificate
    const certHashes = payload.appIntegrity?.certificateSha256Digests || [];
    if (!certHashes.includes(expectedCert)) {
      throw new Error('Certificate mismatch');
    }

    return { valid: true, payload };

  } catch (error) {
    return { valid: false, error: error.message };
  }
}
```

### Verification Checklist

- [ ] Verify JWT signature using Google's public keys
- [ ] Check token timestamp (reject tokens older than 5 minutes)
- [ ] Verify nonce matches server-generated value (prevent replay)
- [ ] Verify package name matches expected value
- [ ] Enforce device integrity verdict (MEETS_DEVICE_INTEGRITY recommended)
- [ ] Verify app recognition verdict (PLAY_RECOGNIZED required)
- [ ] Check certificate hash against expected app signature
- [ ] (Optional) Verify licensing verdict if billing is integrated
- [ ] Reject tokens with UNEVALUATED verdicts
- [ ] Implement rate limiting on verification endpoint

## Static Analysis Checklist

### 1. Manifest Analysis

```bash
# Check for Play Integrity library dependency
grep -r "com.google.android.play.core.integrity" decoded/AndroidManifest.xml

# Check for Play Services dependency
grep -r "com.google.android.gms" decoded/AndroidManifest.xml

# Look for Play Integrity permissions
grep -r "PLAY_INTEGRITY" decoded/AndroidManifest.xml

# Check for internet permission (required for token verification)
grep -r "android.permission.INTERNET" decoded/AndroidManifest.xml
```

### 2. Dependency Analysis

```bash
# Check build.gradle dependencies
grep -r "play:integrity" decoded/gradle/ 2>/dev/null
grep -r "play-core" decoded/gradle/ 2>/dev/null

# Check for Play Integrity in APK libraries
unzip -l app.apk | grep -i integrity
unzip -l app.apk | grep -i "play-core"

# Check DEX files for Play Integrity classes
find decoded/ -name "*.dex" -exec strings {} \; | grep -i "play.integrity"
```

### 3. Code Pattern Search

```bash
# Search decompiled code for Play Integrity imports
grep -rn "IntegrityTokenRequest" jadx_output/
grep -rn "IntegrityTokenResponse" jadx_output/
grep -rn "IntegrityManager" jadx_output/

# Search for Play Integrity method calls
grep -rn "requestIntegrityToken" jadx_output/
grep -rn "setNonce" jadx_output/
grep -rn "request(" jadx_output/ | grep -i integrity

# Search for token validation logic
grep -rn "token()" jadx_output/
grep -rn "verify" jadx_output/ | grep -i integrity
grep -rn "MEETS_DEVICE_INTEGRITY" jadx_output/
grep -rn "PLAY_RECOGNIZED" jadx_output/

# Search for server communication
grep -rn "http.*verify" jadx_output/
grep -rn "integrity.*token" jadx_output/
grep -rn "decodeIntegrityToken" jadx_output/
```

### 4. Typical Implementation Patterns

#### Correct Implementation

```java
// Correct: Server-side verification
public void checkIntegrity(String userId, String operation) {
    String nonce = generateNonce(userId, operation, System.currentTimeMillis());
    storeNonce(nonce);

    IntegrityTokenRequest request = IntegrityTokenRequest.builder()
        .setNonce(nonce)
        .build();

    integrityManager.requestIntegrityToken(request)
        .addOnSuccessListener(response -> {
            String token = response.token();
            // Send token to server for verification
            apiService.verifyIntegrity(userId, token, operation);
        })
        .addOnFailureListener(e -> {
            // Log error, block operation
            blockOperation("Integrity check failed");
        });
}
```

#### Vulnerable Implementation Patterns

##### Pattern 1: Client-Side Token Verification

```java
// VULNERABLE: Token validation on client
public void checkIntegrity() {
    integrityManager.requestIntegrityToken(request)
        .addOnSuccessListener(response -> {
            String token = response.token();
            // VULNERABILITY: Validating token locally
            if (isValidToken(token)) {
                // Attacker can hook and bypass this check
                grantAccess();
            }
        });
}
```

**Why it's vulnerable**:
- Token can be intercepted and replayed
- Client code can be modified to always return true
- No server-side enforcement of security requirements

##### Pattern 2: Weak Verdict Enforcement

```java
// VULNERABLE: Accepting weak integrity verdicts
public void checkIntegrity() {
    integrityManager.requestIntegrityToken(request)
        .addOnSuccessListener(response -> {
            String token = response.token();
            // VULNERABILITY: Accepting MEETS_BASIC_INTEGRITY
            // This can be bypassed with Magisk modules
            if (token.contains("MEETS_BASIC_INTEGRITY")) {
                grantAccess();
            }
        });
}
```

**Why it's vulnerable**:
- `MEETS_BASIC_INTEGRITY` can be bypassed with Magisk
- Should require `MEETS_DEVICE_INTEGRITY` for high-risk operations

##### Pattern 3: No Timestamp Validation

```java
// VULNERABLE: No token freshness check
public void verifyToken(String token) {
    // VULNERABILITY: Not checking token expiration
    DecodedToken decoded = decodeToken(token);
    if (decoded.deviceIntegrity.contains("MEETS_DEVICE_INTEGRITY")) {
        grantAccess(); // Token can be replayed indefinitely
    }
}
```

**Why it's vulnerable**:
- Tokens can be captured and reused
- No protection against replay attacks
- Should enforce 5-minute token window

##### Pattern 4: Missing Nonce Validation

```java
// VULNERABLE: Not verifying nonce
public void verifyToken(String token) {
    DecodedToken decoded = decodeToken(token);
    // VULNERABILITY: Not checking nonce
    if (decoded.deviceIntegrity.contains("MEETS_DEVICE_INTEGRITY")) {
        grantAccess();
    }
}
```

**Why it's vulnerable**:
- No prevention of token replay
- Should verify server-generated nonce matches

##### Pattern 5: No Package Verification

```java
// VULNERABLE: Not verifying package name
public void verifyToken(String token) {
    DecodedToken decoded = decodeToken(token);
    // VULNERABILITY: Not checking package name
    if (decoded.deviceIntegrity.contains("MEETS_DEVICE_INTEGRITY")) {
        grantAccess();
    }
}
```

**Why it's vulnerable**:
- Token could be from different app
- Cross-app token replay possible

##### Pattern 6: Missing App Integrity Check

```java
// VULNERABLE: Not checking app recognition
public void verifyToken(String token) {
    DecodedToken decoded = decodeToken(token);
    // VULNERABILITY: Not checking appIntegrity
    if (decoded.deviceIntegrity.contains("MEETS_DEVICE_INTEGRITY")) {
        grantAccess();
    }
}
```

**Why it's vulnerable**:
- Doesn't verify app is from Play Store
- Tampered APKs can pass device integrity checks

### 5. Finding Verification Logic

```bash
# Look for HTTP requests with integrity tokens
grep -rn "OkHttp\|Retrofit\|HttpClient\|HttpURLConnection" jadx_output/ | grep -i token

# Find endpoints that verify integrity
grep -rn "/verify\|/check\|/validate" jadx_output/ | grep -i integrity

# Search for token extraction patterns
grep -rn "response.token()\|response.body()" jadx_output/

# Find nonce generation code
grep -rn "SecureRandom\|Random\|UUID" jadx_output/ | grep -i nonce

# Find JWT decoding
grep -rn "JWT\|JsonWebToken\|decode" jadx_output/ | grep -i token
```

### 6. Vulnerability Detection Checklist

- [ ] **Client-side token validation**: Look for token verification in client code
- [ ] **Weak verdict enforcement**: Check for acceptance of MEETS_BASIC_INTEGRITY
- [ ] **No timestamp check**: Verify server validates token expiration
- [ **Missing nonce validation**: Ensure nonce is generated and verified server-side
- [ ] **No package verification**: Check if package name is verified
- [ ] **Missing app integrity**: Verify PLAY_RECOGNIZED is enforced
- [ ] **No certificate verification**: Check if app cert hash is validated
- [ ] **Hardcoded secrets**: Search for hardcoded access tokens or API keys
- [ ] **Insecure transport**: Check if tokens sent over HTTP (not HTTPS)
- [ ] **Lack of rate limiting**: Verify server has rate limiting on verification endpoint

## Dynamic Testing Methodology

### 1. Token Request Interception

Use Frida to intercept and analyze Play Integrity token requests:

```javascript
// frida_play_integrity_intercept.js
Java.perform(() => {
    console.log('[+] Hooking Play Integrity API...');

    try {
        const IntegrityManager = Java.use('com.google.android.play.core.integrity.IntegrityManager');

        // Hook IntegrityManager.create()
        const IntegrityManagerFactory = Java.use('com.google.android.play.core.integrity.IntegrityManagerFactory');
        IntegrityManagerFactory.create.implementation = function(context) {
            console.log('[+] IntegrityManager.create() called');
            const result = this.create(context);
            console.log('[+] IntegrityManager instance: ' + result);
            return result;
        };
    } catch (e) {
        console.log('[-] Failed to hook IntegrityManager: ' + e);
    }

    try {
        const IntegrityTokenRequest = Java.use('com.google.android.play.core.integrity.IntegrityTokenRequest');

        // Hook IntegrityTokenRequest.Builder.setNonce()
        const Builder = Java.use('com.google.android.play.core.integrity.IntegrityTokenRequest$Builder');
        Builder.setNonce.implementation = function(nonce) {
            console.log('[+] setNonce() called');
            console.log('    Nonce (base64): ' + nonce);
            console.log('    Nonce (decoded): ' + Java.use('android.util.Base64').decode(nonce, 0).toString());
            return this.setNonce(nonce);
        };

        // Hook IntegrityTokenRequest.Builder.setCloudProjectNumber()
        Builder.setCloudProjectNumber.implementation = function(projectNumber) {
            console.log('[+] setCloudProjectNumber() called');
            console.log('    Project Number: ' + projectNumber);
            return this.setCloudProjectNumber(projectNumber);
        };

        // Hook IntegrityTokenRequest.Builder.build()
        Builder.build.implementation = function() {
            console.log('[+] build() called - Token request created');
            return this.build();
        };
    } catch (e) {
        console.log('[-] Failed to hook IntegrityTokenRequest: ' + e);
    }
});
```

### 2. Response Token Analysis

```javascript
// frida_play_integrity_response.js
Java.perform(() => {
    console.log('[+] Hooking Play Integrity Token Response...');

    try {
        // Hook OnSuccessListener to capture token
        Java.choose('com.google.android.gms.tasks.OnSuccessListener', {
            onMatch: function(listener) {
                console.log('[+] Found OnSuccessListener: ' + listener);
            },
            onComplete: function() {}
        });
    } catch (e) {
        console.log('[-] Failed to find OnSuccessListener: ' + e);
    }

    try {
        const IntegrityTokenResponse = Java.use('com.google.android.play.core.integrity.IntegrityTokenResponse');

        // Hook token() method
        IntegrityTokenResponse.token.implementation = function() {
            const token = this.token();
            console.log('[+] IntegrityTokenResponse.token() called');
            console.log('[+] TOKEN CAPTURED (first 200 chars): ' + token.substring(0, 200));
            console.log('[+] Full token length: ' + token.length);
            return token;
        };
    } catch (e) {
        console.log('[-] Failed to hook IntegrityTokenResponse: ' + e);
    }

    try {
        const Task = Java.use('com.google.android.gms.tasks.Task');

        // Hook Task.isSuccessful()
        Task.isSuccessful.implementation = function() {
            const result = this.isSuccessful();
            console.log('[+] Task.isSuccessful() returned: ' + result);
            if (result) {
                try {
                    const resultObject = this.getResult();
                    if (resultObject) {
                        console.log('[+] Task result class: ' + resultObject.getClass().getName());
                    }
                } catch (e) {
                    console.log('[-] Failed to get task result: ' + e);
                }
            }
            return result;
        };
    } catch (e) {
        console.log('[-] Failed to hook Task: ' + e);
    }
});
```

### 3. Server Communication Analysis

```javascript
// frida_network_intercept.js
Java.perform(() => {
    console.log('[+] Hooking network calls for token verification...');

    try {
        // Hook OkHttp3 (most common)
        const OkHttpClient = Java.use('okhttp3.OkHttpClient');
        const Request = Java.use('okhttp3.Request');
        const RequestBody = Java.use('okhttp3.RequestBody');

        Request.Builder.build.implementation = function() {
            const request = this.build();
            const url = request.url().toString();
            const body = request.body();

            if (url.includes('verify') || url.includes('check') || url.includes('integrity')) {
                console.log('[+] Sending integrity verification request:');
                console.log('    URL: ' + url);
                console.log('    Method: ' + request.method());

                if (body) {
                    // This requires hooking RequestBody to capture content
                    console.log('    Body: [capture required]');
                }
            }

            return request;
        };
    } catch (e) {
        console.log('[-] OkHttp3 not found: ' + e);
    }

    try {
        // Hook HttpURLConnection
        const HttpURLConnection = Java.use('java.net.HttpURLConnection');
        const URL = Java.use('java.net.URL');

        URL.openConnection.implementation = function() {
            const conn = this.openConnection();
            const urlString = this.toString();

            if (urlString.includes('verify') || urlString.includes('integrity')) {
                console.log('[+] HttpURLConnection to: ' + urlString);
            }

            return conn;
        };
    } catch (e) {
        console.log('[-] HttpURLConnection hook failed: ' + e);
    }
});
```

### 4. Dynamic Testing Workflow

```bash
# 1. Install app on rooted device
adb install -r app.apk

# 2. Start Frida server (if not running)
adb shell su -c "/data/local/tmp/frida-server &"

# 3. Launch app with Frida attached
frida -U -f com.target.app -l frida_play_integrity_intercept.js

# 4. Trigger integrity check in app (navigate to sensitive feature)

# 5. Capture token output from Frida
# Example output:
# [+] setNonce() called
#     Nonce (base64): aGVsbG8gd29ybGQ=
#     Nonce (decoded): hello world
# [+] TOKEN CAPTURED (first 200 chars): eyJhbGciOiJSUzI1NiIsImtpZCI6IjEyMzQ1Njc4OTAifQ...

# 6. Decode captured token locally for analysis
TOKEN="eyJhbGciOiJSUzI1NiIsImtpZCI6IjEyMzQ1Njc4OTAifQ..."
echo $TOKEN | cut -d'.' -f2 | tr '_-' '/+' | base64 -d | jq .

# 7. Test token replay attack
# Replay captured token to server
curl -X POST https://api.target.com/verify-integrity \
    -H "Content-Type: application/json" \
    -d '{
        "token": "'$TOKEN'",
        "user_id": "test_user"
    }'

# Expected response if secure:
# {"error": "Token expired or invalid", "code": 401}

# Expected response if vulnerable (replay works):
# {"status": "success", "granted": true}
```

### 5. Testing Checklist

- [ ] **Token capture**: Successfully capture integrity tokens via Frida
- [ ] **Token decoding**: Verify token structure and verdicts
- [ ] **Nonce analysis**: Check if nonce is generated and sent
- [ ] **Timestamp check**: Verify token expiration is enforced
- [ ] **Replay attack test**: Attempt to replay captured token
- [ ] **Verdict enforcement**: Test with weak verdicts (MEETS_BASIC_INTEGRITY)
- [ ] **Network interception**: Analyze token transmission to server
- [ ] **Server response**: Check server verification logic
- [ ] **Bypass testing**: Attempt Magisk-based bypasses
- [ ] **SSL pinning bypass**: If needed to intercept HTTPS traffic

## Bypass Techniques for Security Testing

### 1. Magisk-Based Bypass (Primary Method)

#### Overview

Magisk modules can bypass Play Integrity checks by:
- Injecting code into Play Services process via Zygisk
- Providing fake hardware attestation data
- Modifying device fingerprint
- Hiding root detection

#### Popular Magisk Modules

| Module | GitHub | Status | Notes |
|--------|--------|--------|-------|
| **PlayIntegrityFork** | [PlayIntegrityFork](https://github.com/osm0sis/PlayIntegrityFork) | Active | Fork maintained by osm0sis (v13+) |
| **PlayIntegrityFix-NEXT (PIF-NEXT)** | [PIF-NEXT](https://github.com/EricInacio01/PlayIntegrityFix-NEXT) | Active | Experimental implementations, frequent updates |
| **TrickyStore** | [TrickyStore](https://github.com/5ec1cff/TrickyStore) | Active | Keybox injection method |
| **Play Integrity Fork** | [PlayIntegrityFork](https://github.com/5ec1cff/PlayIntegrityFork) | Active | Alternative implementation |
| **Integrity Bypass** | Various | Varies | Check for recent updates |

#### Installation Workflow (PIF)

```bash
# 1. Prerequisites
# - Rooted device with Magisk (24.0+)
# - Magisk Delta or Kitsune Magisk (for Zygisk support)
# - Latest Google Play Services
# - Zygisk enabled in Magisk

# 2. Download PlayIntegrityFork module
cd ~/Downloads
wget https://github.com/osm0sis/PlayIntegrityFork/releases/latest/download/PlayIntegrityFork.zip

# 3. Push to device
adb push PlayIntegrityFork.zip /sdcard/Download/

# 4. Install via Magisk
adb shell su -c "magisk --install-module /sdcard/Download/PlayIntegrityFork.zip"

# 5. Reboot device
adb reboot

# 6. Wait for device to boot (2-3 minutes)
adb wait-for-device

# 7. Verify module installed
adb shell su -c "ls -la /data/adb/modules/ | grep -i pif"
# Output should show: PlayIntegrityFork

# 8. Check module status
adb shell su -c "cat /data/adb/modules/PlayIntegrityFork/module.prop"

# 9. Test Play Integrity
adb shell am start -n com.target.app/.MainActivity

# 10. Verify bypass with target app
# Navigate to feature requiring integrity check
# Should now pass MEETS_DEVICE_INTEGRITY
```

#### Zygisk Configuration

```bash
# 1. Enable Zygisk in Magisk
adb shell su -c "magisk --settings set zygisk true"

# 2. Configure DenyList
# Open Magisk app > Settings > Zygisk DenyList
# Add target app to DenyList (so Zygisk doesn't hide from app)
# This is tricky: you want Zygisk active but not detected

# 3. Alternative: Use Magisk Delta with built-in bypass
# Magisk Delta includes better root hiding and integrity bypass
```

#### TrickyStore Installation

```bash
# 1. Download TrickyStore
wget https://github.com/5ec1cff/TrickyStore/releases/latest/download/Tricky-Store-v1.4.1-245-72b2e84-release.zip

# 2. Install module
adb push tricky-store.zip /sdcard/Download/
adb shell su -c "magisk --install-module /sdcard/Download/tricky-store.zip"

# 3. Reboot
adb reboot

# 4. Configure TrickyStore
# TrickyStore requires valid keybox data
# This is more complex and requires valid hardware keys

# 5. Verify
adb shell su -c "ls -la /data/adb/modules/ | grep -i tricky"
```

### 2. Zygisk Next Configuration

Zygisk Next is an advanced Zygisk implementation with better bypass capabilities.

```bash
# 1. Install Magisk Delta (includes Zygisk Next)
# Download from: https://github.com/topjohnwu/Magisk

# 2. Flash via recovery or Magisk app

# 3. Enable Zygisk in Magisk settings

# 4. Install Play Integrity Fix

# 5. Configure advanced settings
adb shell su -c "cat /data/adb/modules/PlayIntegrityFork/module.prop"

# Key configuration options:
# pif.json contains device fingerprint data
# Can be customized for specific device profiles
```

### 3. Magisk DenyList Configuration

```bash
# 1. Open Magisk app
# 2. Go to Settings > Zygisk DenyList
# 3. Configure for target app

# Strategy A: Don't hide from target app
# Remove target app from DenyList
# Allows Zygisk to inject into app process

# Strategy B: Hide from app but keep bypass active
# Add target app to DenyList
# Play Integrity check should still work via Play Services injection

# 4. Test both configurations
# One may work better depending on app implementation
```

### 4. Testing Bypass Effectiveness

```bash
# 1. Before bypass - get baseline
# Target app should fail integrity check
# Frida hook shows: MEETS_BASIC_INTEGRITY or UNEVALUATED

# 2. Install bypass module
adb shell su -c "magisk --install-module /path/to/bypass.zip"
adb reboot

# 3. After bypass - test again
# Target app should now pass integrity check
# Frida hook shows: MEETS_DEVICE_INTEGRITY

# 4. Verify with Play Integrity Checker app
# Download from: Play Store (search "Play Integrity Checker")
# Should show green checks for device integrity

# 5. Check Play Services logs
adb logcat -s "PlayIntegrity:*" | grep -i verdict

# 6. Monitor for bypass detection
# Some apps may detect Magisk/Zygisk presence
# Check for app blocking access despite passing integrity
```

### 5. Troubleshooting Bypass Issues

| Issue | Cause | Solution |
|-------|-------|----------|
| **Bypass not working** | Play Services updated | Update Play Integrity Fix to latest version |
| **MEETS_BASIC_INTEGRITY only** | Zygisk disabled | Enable Zygisk in Magisk settings |
| **App detects Magisk** | DenyList misconfigured | Remove app from DenyList or adjust |
| **Module not loading** | Magisk version incompatible | Upgrade to Magisk 24.0+ |
| **Device not certified** | Custom ROM without Play Protect | Use certified ROM or alternative bypass |
| **Keybox injection failed** | Invalid hardware data | Try PIF instead of TrickyStore |

## Frida Scripts for Hooking Play Integrity API

### 1. Comprehensive Hook Script

```javascript
// frida_play_integrity_comprehensive.js

if (Java.available) {
    Java.perform(() => {
        console.log('[*] Starting Play Integrity API comprehensive hook...');

        // ==================== INTEGRITY MANAGER HOOKS ====================
        try {
            const IntegrityManagerFactory = Java.use('com.google.android.play.core.integrity.IntegrityManagerFactory');

            IntegrityManagerFactory.create.overload('android.content.Context').implementation = function(context) {
                console.log('[+] IntegrityManagerFactory.create() called');
                console.log('    Context: ' + context);
                const result = this.create(context);
                console.log('[+] IntegrityManager created: ' + result);
                return result;
            };
        } catch (e) {
            console.log('[-] IntegrityManagerFactory not available: ' + e);
        }

        // ==================== REQUEST BUILDER HOOKS ====================
        try {
            const Builder = Java.use('com.google.android.play.core.integrity.IntegrityTokenRequest$Builder');

            Builder.setNonce.implementation = function(nonce) {
                console.log('[+] setNonce() called');
                console.log('    Nonce (base64): ' + nonce);
                if (nonce) {
                    try {
                        const decoded = Java.use('android.util.Base64').decode(nonce, 0);
                        console.log('    Nonce (hex): ' + bytesToHex(decoded));
                        console.log('    Nonce (decoded): ' + decoded);
                    } catch (e) {
                        console.log('    Nonce decode error: ' + e);
                    }
                }
                return this.setNonce(nonce);
            };

            Builder.setCloudProjectNumber.implementation = function(projectNumber) {
                console.log('[+] setCloudProjectNumber() called');
                console.log('    Project Number: ' + projectNumber);
                return this.setCloudProjectNumber(projectNumber);
            };

            Builder.build.implementation = function() {
                console.log('[+] build() called - Token request built');
                const request = this.build();
                console.log('    Request: ' + request);
                return request;
            };

        } catch (e) {
            console.log('[-] IntegrityTokenRequest.Builder not available: ' + e);
        }

        // ==================== RESPONSE HOOKS ====================
        try {
            const IntegrityTokenResponse = Java.use('com.google.android.play.core.integrity.IntegrityTokenResponse');

            IntegrityTokenResponse.token.implementation = function() {
                console.log('[+] IntegrityTokenResponse.token() called');
                const token = this.token();
                if (token) {
                    console.log('[+] ============ TOKEN CAPTURED ============');
                    console.log('    Length: ' + token.length);
                    console.log('    First 100 chars: ' + token.substring(0, 100));
                    console.log('    Last 100 chars: ' + token.substring(token.length - 100));

                    // Decode and show structure
                    const parts = token.split('.');
                    if (parts.length == 3) {
                        console.log('[+] JWT Structure (header.payload.signature)');

                        // Decode header
                        try {
                            const headerDecoded = Java.use('android.util.Base64').decode(parts[0], 2);
                            const headerJson = JSON.parse(headerDecoded.toString());
                            console.log('[+] Header:');
                            console.log('    ' + JSON.stringify(headerJson, null, 2));
                        } catch (e) {
                            console.log('[-] Header decode error: ' + e);
                        }

                        // Decode payload
                        try {
                            const payloadDecoded = Java.use('android.util.Base64').decode(parts[1], 2);
                            const payloadJson = JSON.parse(payloadDecoded.toString());
                            console.log('[+] Payload:');
                            console.log('    ' + JSON.stringify(payloadJson, null, 2));

                            // Extract and display verdicts
                            if (payloadJson.deviceIntegrity) {
                                console.log('[+] Device Integrity Verdicts:');
                                if (payloadJson.deviceIntegrity.deviceRecognitionVerdict) {
                                    payloadJson.deviceIntegrity.deviceRecognitionVerdict.forEach(v => {
                                        console.log('      - ' + v);
                                    });
                                }
                            }

                            if (payloadJson.appIntegrity) {
                                console.log('[+] App Integrity Verdict:');
                                console.log('      - ' + payloadJson.appIntegrity.appRecognitionVerdict);
                                if (payloadJson.appIntegrity.packageName) {
                                    console.log('      Package: ' + payloadJson.appIntegrity.packageName);
                                }
                            }

                            if (payloadJson.accountDetails) {
                                console.log('[+] Account Details:');
                                console.log('      - ' + payloadJson.accountDetails.appLicensingVerdict);
                            }

                            if (payloadJson.requestDetails) {
                                console.log('[+] Request Details:');
                                if (payloadJson.requestDetails.timestampMillis) {
                                    const timestamp = payloadJson.requestDetails.timestampMillis;
                                    const date = new Date(parseInt(timestamp));
                                    console.log('      Timestamp: ' + date.toISOString());
                                }
                                if (payloadJson.requestDetails.requestPackageName) {
                                    console.log('      Package: ' + payloadJson.requestDetails.requestPackageName);
                                }
                            }
                        } catch (e) {
                            console.log('[-] Payload decode error: ' + e);
                        }
                    }

                    console.log('[+] =======================================');
                }
                return token;
            };
        } catch (e) {
            console.log('[-] IntegrityTokenResponse not available: ' + e);
        }

        // ==================== TASK HOOKS ====================
        try {
            const Task = Java.use('com.google.android.gms.tasks.Task');

            Task.isSuccessful.implementation = function() {
                const result = this.isSuccessful();
                console.log('[+] Task.isSuccessful(): ' + result);
                if (result) {
                    try {
                        const resultObj = this.getResult();
                        if (resultObj) {
                            console.log('[+] Task result class: ' + resultObj.getClass().getName());
                        }
                    } catch (e) {
                        console.log('[-] Failed to get task result: ' + e);
                    }
                }
                return result;
            };

            Task.getResult.overload().implementation = function() {
                console.log('[+] Task.getResult() called (no args)');
                const result = this.getResult();
                if (result) {
                    console.log('    Result class: ' + result.getClass().getName());
                }
                return result;
            };

            Task.getResult.overload('java.lang.Class').implementation = function(type) {
                console.log('[+] Task.getResult(Class) called');
                console.log('    Type: ' + type);
                const result = this.getResult(type);
                if (result) {
                    console.log('    Result class: ' + result.getClass().getName());
                }
                return result;
            };
        } catch (e) {
            console.log('[-] Task hooks failed: ' + e);
        }

        // ==================== SUCCESS LISTENER HOOKS ====================
        try {
            const OnSuccessListener = Java.use('com.google.android.gms.tasks.OnSuccessListener');

            OnSuccessListener.onSuccess.implementation = function(result) {
                console.log('[+] OnSuccessListener.onSuccess() called');
                if (result) {
                    console.log('    Result class: ' + result.getClass().getName());
                }
                return this.onSuccess(result);
            };
        } catch (e) {
            console.log('[-] OnSuccessListener hook failed: ' + e);
        }

        try {
            const OnFailureListener = Java.use('com.google.android.gms.tasks.OnFailureListener');

            OnFailureListener.onFailure.implementation = function(exception) {
                console.log('[+] OnFailureListener.onFailure() called');
                console.log('    Exception: ' + exception);
                console.log('    Message: ' + exception.getMessage());
                return this.onFailure(exception);
            };
        } catch (e) {
            console.log('[-] OnFailureListener hook failed: ' + e);
        }

        // ==================== UTILITY FUNCTIONS ====================
        function bytesToHex(bytes) {
            let hex = '';
            for (let i = 0; i < bytes.length; i++) {
                hex += ('0' + (bytes[i] & 0xFF).toString(16)).slice(-2) + ' ';
            }
            return hex.trim();
        }

        console.log('[*] Play Integrity API hooks installed successfully');
    });
} else {
    console.log('[-] Java runtime not available');
}
```

### 2. Token Manipulation Hook (Testing Only)

```javascript
// frida_play_integrity_modify.js
// WARNING: For educational purposes only - demonstrates vulnerabilities

if (Java.available) {
    Java.perform(() => {
        console.log('[*] Installing Play Integrity token manipulation hook...');

        try {
            const IntegrityTokenResponse = Java.use('com.google.android.play.core.integrity.IntegrityTokenResponse');

            // Hook token() to return modified token
            IntegrityTokenResponse.token.implementation = function() {
                console.log('[+] Intercepting token request...');

                // Get original token
                const originalToken = this.token();
                console.log('[+] Original token length: ' + originalToken.length);

                // Decode JWT
                const parts = originalToken.split('.');
                if (parts.length !== 3) {
                    console.log('[-] Invalid JWT format');
                    return originalToken;
                }

                // Decode payload
                try {
                    const Base64 = Java.use('android.util.Base64');
                    const payloadDecoded = Base64.decode(parts[1], 2);
                    const payloadJson = JSON.parse(payloadDecoded);

                    console.log('[+] Original device verdicts:');
                    if (payloadJson.deviceIntegrity && payloadJson.deviceIntegrity.deviceRecognitionVerdict) {
                        payloadJson.deviceIntegrity.deviceRecognitionVerdict.forEach(v => {
                            console.log('    - ' + v);
                        });
                    }

                    // MODIFICATION: Upgrade verdicts (testing vulnerability)
                    // This demonstrates what a malicious actor could do
                    if (payloadJson.deviceIntegrity) {
                        // Ensure MEETS_DEVICE_INTEGRITY is present
                        if (!payloadJson.deviceIntegrity.deviceRecognitionVerdict) {
                            payloadJson.deviceIntegrity.deviceRecognitionVerdict = [];
                        }

                        if (!payloadJson.deviceIntegrity.deviceRecognitionVerdict.includes('MEETS_DEVICE_INTEGRITY')) {
                            console.log('[+] Adding MEETS_DEVICE_INTEGRITY to verdicts');
                            payloadJson.deviceIntegrity.deviceRecognitionVerdict.push('MEETS_DEVICE_INTEGRITY');
                        }
                    }

                    if (payloadJson.appIntegrity) {
                        // Ensure PLAY_RECOGNIZED
                        if (payloadJson.appIntegrity.appRecognitionVerdict !== 'PLAY_RECOGNIZED') {
                            console.log('[+] Setting appRecognitionVerdict to PLAY_RECOGNIZED');
                            payloadJson.appIntegrity.appRecognitionVerdict = 'PLAY_RECOGNIZED';
                        }
                    }

                    // Re-encode payload
                    const modifiedPayloadJson = JSON.stringify(payloadJson);
                    const modifiedPayloadEncoded = Base64.encodeToString(
                        Java.use('java.lang.String').$new(modifiedPayloadJson).getBytes(),
                        2
                    );

                    // Reconstruct JWT (note: signature will be invalid!)
                    // This only works if server doesn't verify signature (VULNERABLE)
                    const modifiedToken = parts[0] + '.' + modifiedPayloadEncoded + '.' + parts[2];

                    console.log('[+] Modified token created (signature invalid)');
                    console.log('[+] Modified device verdicts:');
                    if (payloadJson.deviceIntegrity && payloadJson.deviceIntegrity.deviceRecognitionVerdict) {
                        payloadJson.deviceIntegrity.deviceRecognitionVerdict.forEach(v => {
                            console.log('    - ' + v);
                        });
                    }

                    // In a real attack, this would bypass client-side checks
                    // But server-side verification would detect invalid signature
                    return modifiedToken;

                } catch (e) {
                    console.log('[-] Token modification failed: ' + e);
                    return originalToken;
                }
            };

            console.log('[+] Token manipulation hook installed');
        } catch (e) {
            console.log('[-] Failed to install token manipulation hook: ' + e);
        }
    });
}
```

### 3. Server Request Hook

```javascript
// frida_network_hook.js
// Hook network calls to capture token transmission

if (Java.available) {
    Java.perform(() => {
        console.log('[*] Installing network hooks for Play Integrity tokens...');

        // Hook OkHttp3
        try {
            const OkHttpClient = Java.use('okhttp3.OkHttpClient');
            const Request = Java.use('okhttp3.Request');
            const RequestBody = Java.use('okhttp3.RequestBody');

            Request.Builder.build.implementation = function() {
                const request = this.build();
                const url = request.url().toString();

                // Log requests to verification endpoints
                if (url.includes('verify') ||
                    url.includes('check') ||
                    url.includes('integrity') ||
                    url.includes('token')) {

                    console.log('[+] ========== NETWORK REQUEST ==========');
                    console.log('[+] URL: ' + url);
                    console.log('[+] Method: ' + request.method());
                    console.log('[+] Headers:');

                    // Log headers
                    try {
                        const headers = request.headers();
                        const iterator = headers.names().iterator();
                        while (iterator.hasNext()) {
                            const name = iterator.next();
                            const value = headers.get(name);
                            console.log('      ' + name + ': ' + value);
                        }
                    } catch (e) {
                        console.log('[-] Failed to read headers: ' + e);
                    }

                    console.log('[+] ======================================');
                }

                return request;
            };

            console.log('[+] OkHttp3 hooks installed');
        } catch (e) {
            console.log('[-] OkHttp3 not available: ' + e);
        }

        // Hook HttpURLConnection
        try {
            const URL = Java.use('java.net.URL');
            const HttpURLConnection = Java.use('java.net.HttpURLConnection');

            URL.openConnection.implementation = function() {
                const urlString = this.toString();

                if (urlString.includes('verify') ||
                    urlString.includes('check') ||
                    urlString.includes('integrity') ||
                    urlString.includes('token')) {

                    console.log('[+] HttpURLConnection to: ' + urlString);
                }

                const conn = this.openConnection();
                return conn;
            };

            HttpURLConnection.getResponseCode.implementation = function() {
                const url = this.getURL().toString();

                if (url.includes('verify') || url.includes('integrity')) {
                    console.log('[+] Response code for: ' + url);
                    console.log('    Code: ' + this.getResponseCode());

                    try {
                        const response = this.getResponseMessage();
                        console.log('    Message: ' + response);
                    } catch (e) {
                        // Some implementations don't support this
                    }
                }

                return this.getResponseCode();
            };

            console.log('[+] HttpURLConnection hooks installed');
        } catch (e) {
            console.log('[-] HttpURLConnection hooks failed: ' + e);
        }

        console.log('[*] Network hooks installed successfully');
    });
}
```

### 4. Root Detection Hook

```javascript
// frida_root_detection.js
// Hook root detection methods (testing bypass capabilities)

if (Java.available) {
    Java.perform(() => {
        console.log('[*] Installing root detection hooks...');

        // Common root detection methods to bypass
        const rootChecks = [
            'java.io.File.exists',
            'java.lang.Runtime.exec',
            'android.os.SystemProperties.get'
        ];

        try {
            const File = Java.use('java.io.File');
            const Runtime = Java.use('java.lang.Runtime');
            const SystemProperties = Java.use('android.os.SystemProperties');

            // Hook File.exists() - common root check method
            File.exists.implementation = function() {
                const path = this.getAbsolutePath();
                const rootIndicators = [
                    '/system/app/Superuser.apk',
                    '/sbin/su',
                    '/system/bin/su',
                    '/system/xbin/su',
                    '/data/local/xbin/su',
                    '/data/local/bin/su',
                    '/system/sd/xbin/su',
                    '/system/bin/failsafe/su',
                    '/data/local/su',
                    '/su/bin/su',
                    '/magisk/.core/bin/su',
                    '/system/usr/we-need-root/su-backup',
                    '/system/xbin/daemonsu',
                    '/system/etc/init.d/99SuperSUDaemon',
                    '/dev/com.koushikdutta.superuser.daemon/',
                    '/system/app/SuperSU.apk',
                    '/system/etc/init.d/99SuperSUDaemon',
                    '/system/bin/.ext/.su',
                    '/system/usr/we-need-root/su-backup',
                    '/system/xbin/magisk',
                    '/system/bin/magisk',
                    '/sbin/.magisk',
                    '/sbin/.core/mirror/bin/su',
                    '/sbin/.core/img/magisk',
                    '/dev/magisk',
                    '/cache/.disable_magisk',
                    '/data/adb/magisk',
                    '/data/adb/magisk.img',
                    '/system/addon.d/99-magisk.sh',
                    '/system/etc/init/magisk.rc',
                    '/system/xbin/magiskpolicy',
                    '/system/bin/magiskpolicy'
                ];

                // Hide root indicators
                for (let indicator of rootIndicators) {
                    if (path == indicator) {
                        console.log('[+] Root detection blocked: ' + path);
                        return false;
                    }
                }

                return this.exists();
            };
        } catch (e) {
            console.log('[-] Root detection hooks failed: ' + e);
        }

        console.log('[+] Root detection hooks installed');
    });
}
```

### 5. Running Frida Scripts

```bash
# 1. Spawn app with Frida (recommended)
frida -U -f com.target.app -l frida_play_integrity_comprehensive.js

# 2. Attach to running app
frida -U com.target.app -l frida_play_integrity_comprehensive.js

# 3. Spawn and save output to file
frida -U -f com.target.app -l frida_play_integrity_comprehensive.js > frida_output.log 2>&1

# 4. Run multiple scripts
frida -U -f com.target.app -l frida_play_integrity_comprehensive.js -l frida_network_hook.js

# 5. Run with Python wrapper
cat > run_frida.py << 'EOF'
import frida
import sys

device = frida.get_usb_device()
session = device.attach('com.target.app')

with open('frida_play_integrity_comprehensive.js') as f:
    script_code = f.read()

script = session.create_script(script_code)
script.on('message', lambda message, data: print(message))
script.load()

print('[*] Frida script loaded. Press Ctrl+C to exit...')
sys.stdin.read()
EOF

python run_frida.py
```

## Common Vulnerabilities and Test Cases

### 1. Client-Side Token Validation

**Description**: App validates Play Integrity token locally without server-side verification.

**Vulnerability**:
```java
// VULNERABLE CODE
public boolean verifyIntegrity(String token) {
    try {
        // Decode and validate token locally
        DecodedToken decoded = decodeJWT(token);
        return decoded.deviceIntegrity.contains("MEETS_DEVICE_INTEGRITY");
    } catch (Exception e) {
        return false;
    }
}
```

**Attack Vector**:
- Attacker can hook `decodeJWT()` or verification logic
- Modify token payload to include desired verdicts
- Bypass entire integrity check

**Test Case**:
1. Install app on non-rooted device
2. Use Frida to hook integrity verification method
3. Force verification to return true regardless of token
4. Access restricted feature
5. Verify bypass works

**Expected Result (Secure)**: Server rejects client-side verification

**Expected Result (Vulnerable)**: App accepts local validation

**CVSS 4.0 Vector**: `CVSS:4.0/AV:N/AC:L/AT:N/PR:N/UI:A/VC:H/VI:H/VA:N/SC:N/SI:N/SA:N`

**Score**: 7.8 HIGH

---

### 2. Weak Verdict Enforcement

**Description**: App accepts weak integrity verdicts (MEETS_BASIC_INTEGRITY) instead of requiring MEETS_DEVICE_INTEGRITY.

**Vulnerability**:
```java
// VULNERABLE CODE
public boolean isDeviceSecure(String token) {
    DecodedToken decoded = verifyTokenWithServer(token);
    // Accepting weak verdict - bypassable with Magisk
    return decoded.deviceIntegrity.contains("MEETS_BASIC_INTEGRITY");
}
```

**Attack Vector**:
- Install Magisk with Play Integrity Fix
- Device obtains MEETS_BASIC_INTEGRITY verdict
- Bypass failsafe requirements

**Test Case**:
1. Install app on rooted device without bypass
2. Verify app rejects access (weak verdict or no verdict)
3. Install Play Integrity Fix module
4. Reboot device
5. Re-test access
6. If access granted, vulnerability confirmed

**Expected Result (Secure)**: Requires MEETS_DEVICE_INTEGRITY

**Expected Result (Vulnerable)**: Accepts MEETS_BASIC_INTEGRITY

**CVSS 4.0 Vector**: `CVSS:4.0/AV:N/AC:L/AT:N/PR:N/UI:A/VC:H/VI:H/VA:N/SC:N/SI:N/SA:N`

**Score**: 7.8 HIGH

---

### 3. No Token Freshness Check

**Description**: Server does not validate token timestamp, allowing replay attacks.

**Vulnerability**:
```java
// VULNERABLE CODE
public boolean verifyToken(String token) {
    DecodedToken decoded = decodeJWT(token);

    // Missing timestamp check!
    if (decoded.deviceIntegrity.contains("MEETS_DEVICE_INTEGRITY")) {
        return true;
    }

    return false;
}
```

**Attack Vector**:
- Capture valid token via network interception
- Replay token indefinitely
- Maintain unauthorized access

**Test Case**:
1. Capture valid integrity token via Frida
2. Extract token payload (includes timestamp)
3. Wait 10+ minutes (token should expire)
4. Reuse captured token in verification request
5. If token accepted, vulnerability confirmed

**Expected Result (Secure)**: Server rejects expired tokens (should fail after 5 minutes)

**Expected Result (Vulnerable)**: Token accepted regardless of age

**CVSS 4.0 Vector**: `CVSS:4.0/AV:N/AC:L/AT:P/PR:N/UI:N/VC:H/VI:L/VA:N/SC:N/SI:N/SA:N`

**Score**: 6.4 MEDIUM

---

### 4. Missing Nonce Validation

**Description**: Server does not verify nonce, allowing token replay.

**Vulnerability**:
```java
// VULNERABLE CODE
public boolean verifyToken(String token) {
    DecodedToken decoded = decodeJWT(token);

    // Missing nonce check!
    // Attackers can replay captured tokens
    if (decoded.deviceIntegrity.contains("MEETS_DEVICE_INTEGRITY")) {
        return true;
    }

    return false;
}
```

**Attack Vector**:
- Capture valid token
- Replay token to server
- Server accepts token without nonce verification

**Test Case**:
1. Trigger integrity check in app
2. Capture token via Frida
3. Send same token to server again (without app interaction)
4. If token accepted, vulnerability confirmed

**Expected Result (Secure)**: Server rejects replayed token (nonce mismatch)

**Expected Result (Vulnerable)**: Token accepted multiple times

**CVSS 4.0 Vector**: `CVSS:4.0/AV:N/AC:L/AT:N/PR:N/UI:N/VC:H/VI:L/VA:N/SC:N/SI:N/SA:N`

**Score**: 6.8 MEDIUM

---

### 5. No Package Verification

**Description**: Server does not verify package name in token, allowing cross-app token replay.

**Vulnerability**:
```java
// VULNERABLE CODE
public boolean verifyToken(String token) {
    DecodedToken decoded = decodeJWT(token);

    // Missing package name check!
    // Token from any app is accepted
    if (decoded.deviceIntegrity.contains("MEETS_DEVICE_INTEGRITY")) {
        return true;
    }

    return false;
}
```

**Attack Vector**:
- Attacker has legitimate app with Play Integrity
- Captures token from that app
- Replays token to target app's server
- Cross-app authentication bypass

**Test Case**:
1. Install helper app with Play Integrity (e.g., from Google)
2. Capture token from helper app via Frida
3. Send token to target app's verification endpoint
4. If token accepted, vulnerability confirmed

**Expected Result (Secure)**: Server rejects token with wrong package name

**Expected Result (Vulnerable)**: Token accepted regardless of package

**CVSS 4.0 Vector**: `CVSS:4.0/AV:N/AC:L/AT:N/PR:N/UI:A/VC:H/VI:L/VA:N/SC:N/SI:N/SA:N`

**Score**: 7.0 HIGH

---

### 6. Missing App Integrity Check

**Description**: Server does not verify PLAY_RECOGNIZED verdict, accepting tampered APKs.

**Vulnerability**:
```java
// VULNERABLE CODE
public boolean verifyToken(String token) {
    DecodedToken decoded = decodeJWT(token);

    // Missing app integrity check!
    // Tampered APKs can pass device integrity
    if (decoded.deviceIntegrity.contains("MEETS_DEVICE_INTEGRITY")) {
        return true;
    }

    return false;
}
```

**Attack Vector**:
- Attacker modifies APK (adds malicious code)
- Re-signs APK
- On rooted device with bypass, obtains device integrity
- Server accepts tampered app

**Test Case**:
1. Download APK from official source
2. Modify APK (add logging or trivial change)
3. Re-sign APK with different certificate
4. Install on device with bypass
5. Verify app passes integrity check
6. If accepted, vulnerability confirmed

**Expected Result (Secure)**: Server requires PLAY_RECOGNIZED

**Expected Result (Vulnerable)**: Server accepts any device integrity verdict

**CVSS 4.0 Vector**: `CVSS:4.0/AV:N/AC:L/AT:N/PR:N/UI:A/VC:H/VI:H/VA:N/SC:N/SI:N/SA:N`

**Score**: 7.8 HIGH

---

### 7. No Certificate Verification

**Description**: Server does not verify app certificate hash.

**Vulnerability**:
```java
// VULNERABLE CODE
public boolean verifyToken(String token) {
    DecodedToken decoded = decodeJWT(token);

    // Missing certificate verification!
    // Any app with valid device integrity passes
    if (decoded.deviceIntegrity.contains("MEETS_DEVICE_INTEGRITY") &&
        decoded.appIntegrity.appRecognitionVerdict == "PLAY_RECOGNIZED") {
        return true;
    }

    return false;
}
```

**Attack Vector**:
- Attacker creates malicious app with same package name
- Obtains Play Store listing
- Uses certificate from legitimate app (if available)
- Bypasses security checks

**Test Case**:
1. Create malicious APK with same package name
2. Re-sign with different certificate
3. Use bypass to obtain device integrity
4. Send token to server
5. If accepted (wrong cert), vulnerability confirmed

**Expected Result (Secure)**: Server verifies certificate hash

**Expected Result (Vulnerable)**: Server accepts any certificate

**CVSS 4.0 Vector**: `CVSS:4.0/AV:N/AC:H/AT:N/PR:N/UI:A/VC:H/VI:H/VA:N/SC:N/SI:N/SA:N`

**Score**: 6.6 MEDIUM

---

### 8. Insecure Token Transmission

**Description**: Tokens sent over HTTP instead of HTTPS.

**Vulnerability**:
```java
// VULNERABLE CODE
public void sendTokenToServer(String token) {
    // Using HTTP instead of HTTPS!
    String url = "http://api.target.com/verify-integrity";
    // ... send token ...
}
```

**Attack Vector**:
- Attacker on same network intercepts traffic
- Captures integrity tokens
- Replays tokens to server

**Test Case**:
1. Use Wireshark or mitmproxy to capture app traffic
2. Trigger integrity check
3. Verify if token sent over HTTP (plaintext) or HTTPS (encrypted)
4. If HTTP, vulnerability confirmed

**Expected Result (Secure)**: Token sent over HTTPS only

**Expected Result (Vulnerable)**: Token sent over HTTP

**CVSS 4.0 Vector**: `CVSS:4.0/AV:A/AC:L/AT:N/PR:N/UI:N/VC:H/VI:L/VA:N/SC:N/SI:N/SA:N`

**Score**: 6.3 MEDIUM

---

### 9. Hardcoded Secrets

**Description**: Google Cloud access tokens or API keys hardcoded in app.

**Vulnerability**:
```java
// VULNERABLE CODE
public class IntegrityVerifier {
    private static final String ACCESS_TOKEN = "ya29.a0AfH6..."; // Hardcoded!
    private static final String API_KEY = "AIzaSy..."; // Hardcoded!

    public boolean verifyToken(String token) {
        // Using hardcoded token for API calls
        String url = "https://playintegrity.googleapis.com/v1/..." +
                    "?key=" + API_KEY;
        // ... verify token ...
    }
}
```

**Attack Vector**:
- Attacker extracts secrets via decompilation
- Uses credentials to call Google Play Integrity API directly
- Generates fake tokens or manipulates verification

**Test Case**:
1. Decompile APK with JADX or Apktool
2. Search for access tokens or API keys:
   ```bash
   grep -r "ya29\." jadx_output/  # Google access tokens
   grep -r "AIzaSy" jadx_output/  # Google API keys
   ```
3. If secrets found, vulnerability confirmed

**Expected Result (Secure)**: No secrets in app, server-side authentication only

**Expected Result (Vulnerable)**: Secrets hardcoded in app

**CVSS 4.0 Vector**: `CVSS:4.0/AV:N/AC:L/AT:N/PR:N/UI:N/VC:H/VI:H/VA:N/SC:N/SI:N/SA:N`

**Score**: 8.2 HIGH

---

### 10. Missing Rate Limiting

**Description**: Verification endpoint has no rate limiting, enabling brute-force attacks.

**Vulnerability**:
```java
// VULNERABLE CODE (server-side)
@PostMapping("/verify-integrity")
public ResponseEntity<?> verifyToken(@RequestBody VerificationRequest request) {
    // No rate limiting!
    // Attackers can spam requests
    DecodedToken decoded = verifyToken(request.getToken());
    return ResponseEntity.ok(decoded);
}
```

**Attack Vector**:
- Attacker spams verification endpoint
- Causes DoS or bypasses security checks
- Exhausts Google API quota

**Test Case**:
1. Write script to send multiple verification requests rapidly
2. Monitor server response times
3. If all requests succeed without throttling, vulnerability confirmed

**Expected Result (Secure)**: Server enforces rate limiting

**Expected Result (Vulnerable)**: No rate limiting, unlimited requests accepted

**CVSS 4.0 Vector**: `CVSS:4.0/AV:N/AC:L/AT:N/PR:N/UI:N/VC:N/VI:N/VA:H/SC:N/SI:N/SA:N`

**Score**: 5.3 MEDIUM

---

### 11. UNEVALUATED Verdict Acceptance

**Description**: Server accepts tokens with UNEVALUATED verdicts.

**Vulnerability**:
```java
// VULNERABLE CODE
public boolean verifyToken(String token) {
    DecodedToken decoded = decodeJWT(token);

    // Accepting any verdict, including UNEVALUATED
    if (decoded.deviceIntegrity.deviceRecognitionVerdict.length > 0) {
        return true;
    }

    return false;
}
```

**Attack Vector**:
- Attacker forces UNEVALUATED verdict (e.g., outdated Play Services)
- Server accepts anyway
- Security checks bypassed

**Test Case**:
1. Uninstall or disable Google Play Services
2. Trigger integrity check
3. Verify token shows UNEVALUATED verdict
4. Send to server
5. If accepted, vulnerability confirmed

**Expected Result (Secure)**: Server rejects UNEVALUATED verdicts

**Expected Result (Vulnerable)**: Server accepts UNEVALUATED

**CVSS 4.0 Vector**: `CVSS:4.0/AV:N/AC:L/AT:N/PR:N/UI:A/VC:H/VI:H/VA:N/SC:N/SI:N/SA:N`

**Score**: 7.8 HIGH

---

### 12. No Bypass Detection

**Description**: Server does not detect known bypass tools (Magisk, Zygisk, etc.).

**Vulnerability**:
```java
// VULNERABLE CODE
public boolean verifyToken(String token) {
    DecodedToken decoded = decodeJWT(token);

    // No bypass detection!
    // Accepts tokens even from bypassed devices
    if (decoded.deviceIntegrity.contains("MEETS_DEVICE_INTEGRITY")) {
        return true;
    }

    return false;
}
```

**Attack Vector**:
- Attacker installs Magisk with Play Integrity Fix
- Obtains MEETS_DEVICE_INTEGRITY verdict
- Server accepts bypassed device

**Test Case**:
1. Install Magisk + Play Integrity Fix
2. Verify app passes integrity check
3. Check server logs for bypass detection
4. If no detection, vulnerability confirmed

**Expected Result (Secure)**: Server detects and blocks bypassed devices

**Expected Result (Vulnerable)**: Server accepts bypassed devices

**CVSS 4.0 Vector**: `CVSS:4.0/AV:N/AC:L/AT:N/PR:N/UI:A/VC:H/VI:H/VA:N/SC:N/SI:N/SA:N`

**Score**: 7.8 HIGH

---

### Vulnerability Summary Matrix

| Vulnerability | Severity | Detection Method | Exploitability |
|---------------|----------|------------------|----------------|
| Client-side validation | HIGH | Static analysis | Easy |
| Weak verdict enforcement | HIGH | Dynamic testing | Easy (Magisk) |
| No timestamp check | MEDIUM | Network testing | Easy |
| Missing nonce validation | MEDIUM | Replay testing | Easy |
| No package verification | HIGH | Cross-app testing | Medium |
| Missing app integrity | HIGH | APK tampering | Medium |
| No certificate verification | MEDIUM | APK re-signing | Medium |
| Insecure transmission | MEDIUM | Traffic analysis | Medium |
| Hardcoded secrets | HIGH | Decompilation | Easy |
| Missing rate limiting | MEDIUM | Load testing | Easy |
| UNEVALUATED acceptance | HIGH | Service disable | Easy |
| No bypass detection | HIGH | Bypass testing | Medium |

## Reporting Template for Play Integrity Findings

### Finding Template

```markdown
## [FINDING-ID] Play Integrity API Implementation Vulnerability

### Summary
[Brief description of the vulnerability]

### Vulnerability Type
- Play Integrity Weak Implementation
- Client-Side Token Validation
- Weak Verdict Enforcement
- [Other]

### Affected Components
- App Package: `com.target.app`
- Version: [Version number]
- Affected APIs/Endpoints:
  - `POST /api/v1/verify-integrity`
  - `IntegrityManager.requestIntegrityToken()`

### Technical Details

#### Current Implementation
[Describe current vulnerable implementation with code snippets]

#### Vulnerable Code Snippet
```java
// Vulnerable code from decompiled APK
public void checkIntegrity() {
    // ... vulnerable implementation ...
}
```

#### Vulnerability Explanation
[Explain why this is vulnerable, attack vectors]

### Proof of Concept

#### Steps to Reproduce
1. [Step 1]
2. [Step 2]
3. [Step 3]

#### Evidence
```
[ Frida output, network captures, or screenshots ]
```

### Impact Assessment

#### Confidentiality Impact
- [ ] HIGH
- [ ] MEDIUM
- [ ] LOW
- [ ] NONE

#### Integrity Impact
- [ ] HIGH
- [ ] MEDIUM
- [ ] LOW
- [ ] NONE

#### Availability Impact
- [ ] HIGH
- [ ] MEDIUM
- [ ] LOW
- [ ] NONE

#### Business Impact
[Describe business impact: unauthorized access, data theft, account takeover, etc.]

### CVSS 4.0 Score

**Vector**: `CVSS:4.0/AV:N/AC:L/AT:N/PR:N/UI:A/VC:H/VI:H/VA:N/SC:N/SI:N/SA:N`

**Base Score**: [Score] [SEVERITY]

**Rationale**:
- **AV:N** - Attack vector is network (app sends token to server)
- **AC:L** - Low attack complexity (simple to exploit)
- **AT:N** - No attack requirements
- **PR:N** - No privileges required
- **UI:A** - Some user interaction required
- **VC:H/VI:H** - High confidentiality/integrity impact
- **VA:N** - No availability impact
- **SC:N/SI:N/SA:N** - No subsequent system impact

### Affected Users/Scope
- Estimated affected users: [Number or percentage]
- Risk level: HIGH/MEDIUM/LOW
- Critical operations affected:
  - [ ] Financial transactions
  - [ ] Personal data access
  - [ ] Account authentication
  - [ ] [Other]

### Exploit Scenarios

#### Scenario 1: Rooted Device Bypass
Attacker with rooted device can bypass integrity checks using Magisk modules:
- Install Magisk + Play Integrity Fix
- Obtain MEETS_DEVICE_INTEGRITY verdict on rooted device
- Access restricted features or perform unauthorized actions

#### Scenario 2: Token Replay Attack
Attacker captures valid token and replays to server:
- Intercept token via network or client hooking
- Replay token indefinitely
- Maintain unauthorized access to user account

#### Scenario 3: Cross-App Token Replay
Attacker uses token from legitimate app to authenticate in target app:
- Install app with Play Integrity (e.g., from Google)
- Capture token from that app
- Replay to target app's verification endpoint
- Bypass authentication in target app

### Remediation Recommendations

#### Immediate Actions
1. Implement server-side verification (Google Play Integrity API endpoint)
2. Reject client-side token validation
3. Enforce MEETS_DEVICE_INTEGRITY verdict for high-risk operations
4. Add timestamp validation (reject tokens older than 5 minutes)
5. Implement nonce verification (one-time use tokens)

#### Short-term Actions (1-2 weeks)
1. Verify package name matches expected value
2. Enforce PLAY_RECOGNIZED verdict
3. Verify app certificate hash
4. Implement rate limiting on verification endpoint
5. Add logging and monitoring for suspicious patterns

#### Long-term Actions (1-3 months)
1. Implement multi-layer detection (Play Integrity + root detection + behavioral analysis)
2. Add bypass detection (Magisk, Zygisk, known bypass packages)
3. Implement native detection for Frida and other tools
4. Regular security audits of implementation
5. Consider additional security layers (device fingerprinting, behavioral analysis)

#### Sample Secure Implementation

```java
// Client-side - send token to server
public void checkIntegrity(String userId, String operation) {
    String nonce = generateCryptographicNonce();
    storeNonce(userId, nonce);

    IntegrityTokenRequest request = IntegrityTokenRequest.builder()
        .setNonce(nonce)
        .build();

    integrityManager.requestIntegrityToken(request)
        .addOnSuccessListener(response -> {
            String token = response.token();
            // Send to server for verification
            apiService.verifyIntegrity(userId, token, operation);
        });
}

// Server-side - verify token
public VerificationResult verifyToken(String packageName, String token) {
    // 1. Verify JWT signature using Google's public keys
    DecodedToken decoded = verifyJWTSignature(token);
    if (!decoded.valid) {
        return VerificationResult.fail("Invalid token signature");
    }

    // 2. Check timestamp freshness (5 minute window)
    long tokenAge = (System.currentTimeMillis() - decoded.timestamp) / 1000;
    if (tokenAge > 300) {
        return VerificationResult.fail("Token expired");
    }

    // 3. Verify nonce (prevent replay)
    if (!isValidNonce(decoded.nonce)) {
        return VerificationResult.fail("Invalid nonce");
    }

    // 4. Verify package name
    if (!decoded.packageName.equals(packageName)) {
        return VerificationResult.fail("Package name mismatch");
    }

    // 5. Enforce device integrity
    if (!decoded.deviceVerdicts.contains("MEETS_DEVICE_INTEGRITY")) {
        return VerificationResult.fail("Insufficient device integrity");
    }

    // 6. Verify app integrity
    if (!decoded.appVerdict.equals("PLAY_RECOGNIZED")) {
        return VerificationResult.fail("App not recognized from Play Store");
    }

    // 7. Verify certificate
    if (!decoded.certificates.contains(EXPECTED_CERT_HASH)) {
        return VerificationResult.fail("Certificate mismatch");
    }

    return VerificationResult.success(decoded);
}
```

### Testing Recommendations

#### Before Deployment
- [ ] Test with legitimate Play Store version (should pass)
- [ ] Test with sideloaded APK (should fail app integrity)
- [ ] Test with rooted device (should fail device integrity)
- [ ] Test with Magisk + bypass module (should detect and block)
- [ ] Test token replay attacks (should block)
- [ ] Test cross-app token replay (should block)

#### After Deployment
- [ ] Monitor verification failure rates
- [ ] Track bypass detection attempts
- [ ] Analyze suspicious patterns in logs
- [ ] Conduct regular security audits
- [ ] Update detection rules based on new bypass techniques

### References

#### Official Documentation
- [Play Integrity API Overview](https://developer.android.com/google/play/integrity/overview)
- [Play Integrity API Setup](https://developer.android.com/google/play/integrity/setup)
- [Play Integrity Verdicts](https://developer.android.com/google/play/integrity/verdicts)
- [Standard Integrity Token](https://developer.android.com/google/play/integrity/standard)
- [Classic Integrity Token](https://developer.android.com/google/play/integrity/classic)

#### Security Research
- [Play Integrity Bypass Research](https://github.com/osm0sis/PlayIntegrityFork)
- [Magisk Documentation](https://topjohnwu.github.io/Magisk/)

#### Tools
- [Frida](https://frida.re/docs/) - Dynamic instrumentation framework
- [Objection](https://github.com/sensepost/objection) - Mobile exploration toolkit
- [Burp Suite](https://portswigger.net/burp) - Web application security testing
```

### Sample Completed Finding

```markdown
## [HALL-001] Weak Play Integrity Verdict Enforcement

### Summary
The target application accepts MEETS_BASIC_INTEGRITY verdicts from Play Integrity API, which can be bypassed using Magisk modules. This allows attackers with rooted devices to bypass device integrity checks.

### Vulnerability Type
- Weak Verdict Enforcement
- Play Integrity Bypass Vulnerability

### Affected Components
- App Package: `com.target.bankapp`
- Version: 3.2.1
- Affected APIs:
  - `POST https://api.targetbank.com/v1/auth/verify-integrity`
  - `IntegrityManager.requestIntegrityToken()` in client app

### Technical Details

#### Current Implementation
The server verifies Play Integrity tokens but accepts weak verdicts.

**Server-side verification code (reversed from APK):**
```java
public boolean verifyIntegrityToken(String token) {
    try {
        DecodedToken decoded = decodeToken(token);

        // VULNERABILITY: Accepts MEETS_BASIC_INTEGRITY
        List<String> verdicts = decoded.deviceIntegrity.deviceRecognitionVerdict;
        if (verdicts.contains("MEETS_BASIC_INTEGRITY") ||
            verdicts.contains("MEETS_DEVICE_INTEGRITY")) {
            return true;
        }

        return false;
    } catch (Exception e) {
        return false;
    }
}
```

#### Vulnerability Explanation
MEETS_BASIC_INTEGRITY can be obtained on rooted devices using Magisk with Play Integrity Fix module. This verdict only indicates the device is not heavily tampered with, but does not guarantee Play Protect certification or absence of root. Attackers can exploit this by:
1. Installing Magisk on rooted device
2. Installing Play Integrity Fix module
3. Obtaining MEETS_BASIC_INTEGRITY verdict
4. Bypassing security checks meant to protect against rooted devices

### Proof of Concept

#### Steps to Reproduce
1. Install target app on rooted Android device (Magisk 24.0+)
2. Attempt to access sensitive feature (e.g., financial transaction)
3. Observe app blocks access with error: "Device integrity check failed"
4. Download and install Play Integrity Fix module:
   ```bash
   wget https://github.com/osm0sis/PlayIntegrityFork/releases/latest/download/PlayIntegrityFork.zip
   adb push PlayIntegrityFork.zip /sdcard/Download/
   adb shell su -c "magisk --install-module /sdcard/Download/PlayIntegrityFork.zip"
   adb reboot
   ```
5. After reboot, re-attempt access to sensitive feature
6. Observe app now grants access despite being on rooted device

#### Evidence - Before Bypass
```
[+] IntegrityTokenResponse.token() called
[+] ============ TOKEN CAPTURED ============
[+] Payload:
{
  "deviceIntegrity": {
    "deviceRecognitionVerdict": ["MEETS_BASIC_INTEGRITY"]
  },
  "appIntegrity": {
    "appRecognitionVerdict": "PLAY_RECOGNIZED"
  }
}
[+] =======================================

App response: "Security check failed. This device is not supported."
```

#### Evidence - After Bypass
```
[+] IntegrityTokenResponse.token() called
[+] ============ TOKEN CAPTURED ============
[+] Payload:
{
  "deviceIntegrity": {
    "deviceRecognitionVerdict": ["MEETS_DEVICE_INTEGRITY"]
  },
  "appIntegrity": {
    "appRecognitionVerdict": "PLAY_RECOGNIZED"
  }
}
[+] =======================================

App response: "Verification successful. Access granted."
Financial transaction initiated.
```

### Impact Assessment

#### Confidentiality Impact
- [x] HIGH - Attackers can access sensitive user data

#### Integrity Impact
- [x] HIGH - Attackers can perform unauthorized financial transactions

#### Availability Impact
- [ ] NONE

#### Business Impact
This vulnerability allows attackers with rooted devices to:
- Bypass device integrity checks
- Perform unauthorized financial transactions
- Access other users' accounts (if combined with other vulnerabilities)
- Compromise the security model of the banking application
- Potentially cause financial losses to customers and the bank

### CVSS 4.0 Score

**Vector**: `CVSS:4.0/AV:N/AC:L/AT:N/PR:N/UI:A/VC:H/VI:H/VA:N/SC:N/SI:N/SA:N`

**Base Score**: **7.8 HIGH**

**Rationale**:
- **AV:N** - Attack vector is network (app sends token to server)
- **AC:L** - Low attack complexity (simple Magisk module installation)
- **AT:N** - No special attack requirements
- **PR:N** - No privileges beyond having a rooted device
- **UI:A** - User interaction required (install module, reboot)
- **VC:H/VI:H** - Full access to confidential data and ability to modify transactions
- **VA:N** - No impact on availability
- **SC:N/SI:N/SA:N** - No subsequent system impact

### Affected Users/Scope
- Estimated affected users: 100% of app users (implementation flaw affects all)
- Risk level: HIGH - Financial application
- Critical operations affected:
  - [x] Financial transactions
  - [x] Account authentication
  - [x] Personal data access

### Exploit Scenarios

#### Scenario 1: Financial Fraud
Attacker steals user credentials and uses rooted device to bypass integrity checks:
1. Attacker obtains user's login credentials (phishing, data breach)
2. Attacker logs in from rooted device with Magisk + Play Integrity Fix
3. Integrity check passes due to weak verdict enforcement
4. Attacker performs unauthorized money transfer

#### Scenario 2: Mass Bot Attacks
Attacker automates account creation on rooted emulators:
1. Script creates accounts using emulators with integrity bypass
2. Each emulator bypasses integrity checks
3. Attacker creates hundreds of fraudulent accounts
4. Uses accounts for referral fraud, bonuses exploitation, etc.

### Remediation Recommendations

#### Immediate Actions (Critical - Within 1 week)
1. **Change verdict enforcement**: Require MEETS_DEVICE_INTEGRITY for all security-sensitive operations
2. **Add bypass detection**: Implement server-side detection for Magisk and known bypass modules
3. **Enhanced monitoring**: Flag devices passing integrity checks with suspicious patterns

#### Short-term Actions (2-4 weeks)
1. Implement multi-layer detection:
    - Play Integrity (MEETS_DEVICE_INTEGRITY required)
    - Root detection (native checks)
    - Known bypass package detection

2. Add behavioral analysis:
   - Flag unusual transaction patterns
   - Monitor for rapid account creation from same device
   - Implement velocity limits

#### Long-term Actions (1-3 months)
1. Implement device fingerprinting
2. Add CAPTCHA for suspicious activities
3. Implement risk-based authentication
4. Regular penetration testing of Play Integrity implementation
5. Subscribe to bypass intelligence feeds (when available)

#### Sample Secure Implementation

```java
// Server-side - secure verification
public VerificationResult verifyIntegrityToken(String packageName, String token) {
    // 1. Verify JWT signature
    DecodedToken decoded = verifyJWTSignature(token);
    if (!decoded.valid) {
        return VerificationResult.fail("Invalid token");
    }

    // 2. Check timestamp (5 minute window)
    long tokenAge = (System.currentTimeMillis() - decoded.timestamp) / 1000;
    if (tokenAge > 300) {
        return VerificationResult.fail("Token expired");
    }

    // 3. Verify nonce (one-time use)
    if (!isNonceValid(decoded.nonce)) {
        return VerificationResult.fail("Replay attack detected");
    }

    // 4. Verify package name
    if (!decoded.packageName.equals(packageName)) {
        return VerificationResult.fail("Package mismatch");
    }

    // 5. REQUIRE MEETS_DEVICE_INTEGRITY (not just MEETS_BASIC_INTEGRITY)
    if (!decoded.deviceVerdicts.contains("MEETS_DEVICE_INTEGRITY")) {
        return VerificationResult.fail("Insufficient device integrity");
    }

    // 6. Verify app integrity
    if (!decoded.appVerdict.equals("PLAY_RECOGNIZED")) {
        return VerificationResult.fail("App not recognized");
    }

    // 7. Verify certificate hash
    if (!decoded.certificates.contains(EXPECTED_CERT_HASH)) {
        return VerificationResult.fail("Certificate mismatch");
    }

    // 8. Check for known bypass indicators (from Play Integrity API)
    if (hasBypassIndicators(decoded)) {
        return VerificationResult.fail("Bypass detected");
    }

    return VerificationResult.success(decoded);
}
```

### Testing Recommendations

#### Before Deployment
- [x] Test with legitimate device: Should pass
- [x] Test with rooted device without bypass: Should fail
- [x] Test with rooted device + Magisk + PIF: Should fail (even with MEETS_DEVICE_INTEGRITY, bypass indicators present)
- [x] Test token replay: Should be blocked

#### After Deployment
- Monitor verification failure rates
- Track bypass detection attempts
- Analyze device fingerprint patterns
- Conduct quarterly security audits

### References

#### Official Documentation
- [Play Integrity API Overview](https://developer.android.com/google/play/integrity/overview)
- [Play Integrity Verdicts](https://developer.android.com/google/play/integrity/verdicts)

#### Security Research
- [PlayIntegrityFork](https://github.com/osm0sis/PlayIntegrityFork) - Magisk module for bypass testing
- [Play Integrity Bypass Research](https://github.com/osm0sis/PlayIntegrityFork/blob/main/README.md)

#### Tools Used
- Frida 17.x
- Magisk 24.0+
- Play Integrity Fix v4.2+
- JADX 1.5+
```

## References

### Official Google Documentation
- [Play Integrity API Overview](https://developer.android.com/google/play/integrity/overview) - Complete API documentation
- [Play Integrity API Setup](https://developer.android.com/google/play/integrity/setup) - Integration guide
- [Play Integrity Verdicts](https://developer.android.com/google/play/integrity/verdicts) - Verdict types and meanings
- [Standard Integrity Token](https://developer.android.com/google/play/integrity/standard) - Standard API usage
- [Classic Integrity Token](https://developer.android.com/google/play/integrity/classic) - Classic API for non-Play Store apps

### Security Research & Bypasses
- [PlayIntegrityFork (PIF)](https://github.com/osm0sis/PlayIntegrityFork) - Magisk module for testing bypasses
- [PlayIntegrityFix-NEXT (PIF-NEXT)](https://github.com/EricInacio01/PlayIntegrityFix-NEXT) - Experimental implementations, frequent updates
- [TrickyStore](https://github.com/5ec1cff/TrickyStore) - Keybox injection bypass
- [PlayIntegrityFork](https://github.com/osm0sis/PlayIntegrityFork) - Alternative bypass implementation
- [Magisk Official Repository](https://github.com/topjohnwu/Magisk) - Root solution with Zygisk
- [Zygisk Documentation](https://topjohnwu.github.io/Magisk/) - Zygisk internals

### Tools & Frameworks
- [Frida](https://frida.re/docs/) - Dynamic instrumentation framework
- [Objection](https://github.com/sensepost/objection) - Mobile exploration toolkit
- [Burp Suite](https://portswigger.net/burp) - Web security testing
- [JADX](https://github.com/skylot/jadx) - APK decompiler
- [Apktool](https://ibotpeaches.github.io/Apktool/) - APK reverse engineering tool

### CVSS 4.0 Scoring
- [CVSS 4.0 Calculator](https://www.first.org/cvss/calculator/4.0) - Official CVSS calculator
- [CVSS 4.0 Specification](https://www.first.org/cvss/specification-document) - CVSS standard

### Pentesting Methodologies
- [OWASP Mobile Top 10](https://owasp.org/www-project-mobile-top-10/) - Mobile security risks
- [OWASP MASVS](https://owasp.org/www-project-mobile-app-security-verification-standard/) - Mobile app security verification standard
- [Android Pentesting Checklist](https://github.com/Android-Pentesting-Resources/Android-Pentesting-Resources) - Comprehensive checklist

---

**Document Version**: 1.0
**Last Updated**: January 2025
**Author**: Android Security Team
**Purpose**: Reference guide for security testing of Play Integrity API implementations
