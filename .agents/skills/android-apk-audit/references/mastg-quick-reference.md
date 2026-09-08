# OWASP MASTG/MASVS Quick Reference

Official test IDs and categories from OWASP Mobile Application Security Testing Guide.

## MASVS Categories (Verification Standard)

| Category | Name | Focus Area |
|----------|------|------------|
| MASVS-STORAGE | Storage | Secure data storage |
| MASVS-CRYPTO | Cryptography | Crypto implementation |
| MASVS-AUTH | Authentication | Auth and session management |
| MASVS-NETWORK | Network | Network communication |
| MASVS-PLATFORM | Platform | Platform interaction |
| MASVS-CODE | Code Quality | Code quality and build settings |
| MASVS-RESILIENCE | Resilience | Anti-reverse engineering |
| MASVS-PRIVACY | Privacy | Privacy protection |

## Key MASTG Tests for Android (by Category)

### Storage (MASVS-STORAGE)

| Test ID | Description | What to Check |
|---------|-------------|---------------|
| MASTG-TEST-0001 | Hardcoded secrets in resources | strings.xml, Java code, native libs |
| MASTG-TEST-0003 | Sensitive data in logs | Log.d, Log.e, System.out.println |
| MASTG-TEST-0006 | Unencrypted storage in internal storage | SharedPreferences without EncryptedSharedPreferences |
| MASTG-TEST-0007 | Unencrypted storage in external storage | getExternalStorageDirectory without encryption |
| MASTG-TEST-0009 | Sensitive data in backups | allowBackup=true, fullBackupContent |
| MASTG-TEST-0011 | Sensitive data in process memory | Check for plaintext secrets in memory dumps |
| MASTG-TEST-0287 | Unencrypted SharedPreferences | getSharedPreferences without encryption |
| MASTG-TEST-0304 | Unencrypted SQLite | SQLiteDatabase without SQLCipher |
| MASTG-TEST-0305 | Unencrypted DataStore | DataStore without encryption |

### Cryptography (MASVS-CRYPTO)

| Test ID | Description | What to Check |
|---------|-------------|---------------|
| MASTG-TEST-0013 | Symmetric crypto usage | AES/DES usage, modes, padding |
| MASTG-TEST-0014 | Crypto standard algorithms | Weak algorithms (DES, MD5, SHA1) |
| MASTG-TEST-0015 | Key purposes | Key used for wrong purpose |
| MASTG-TEST-0016 | Random number generation | SecureRandom vs Random |
| MASTG-TEST-0208 | Insufficient key sizes | Key sizes below recommended |
| MASTG-TEST-0212 | Hardcoded crypto keys | SecretKeySpec with hardcoded bytes |
| MASTG-TEST-0221 | Broken symmetric algorithms | DES, RC4, etc. |
| MASTG-TEST-0222 | Broken symmetric modes | ECB, CBC with static IV |
| MASTG-TEST-0232 | Weak hash algorithms | MD5, SHA1 for security |

### Authentication (MASVS-AUTH)

| Test ID | Description | What to Check |
|---------|-------------|---------------|
| MASTG-TEST-0017 | Confirm credentials | BiometricPrompt, KeyguardManager |
| MASTG-TEST-0018 | Biometric authentication | BiometricPrompt usage, CryptoObject |
| MASTG-TEST-0326 | Fallback to non-biometric | Authenticator fallback |
| MASTG-TEST-0327 | Event-bound biometric | BiometricPrompt with CryptoObject |
| MASTG-TEST-0328 | Biometric enrollment changes | Key invalidation on biometric changes |
| MASTG-TEST-043 | Custom PIN not bound to KeyStore | PIN must use crypto binding |
| MASTG-TEST-044 | Biometric can be bypassed | Frida hooks, UI bypasses |

### Network (MASVS-NETWORK)

| Test ID | Description | What to Check |
|---------|-------------|---------------|
| MASTG-TEST-0019 | Data encryption on network | HTTPS, certificate validation |
| MASTG-TEST-0020 | TLS settings | TLS 1.2+, proper cipher suites |
| MASTG-TEST-0021 | Endpoint identity verification | HostnameVerifier, certificate pinning |
| MASTG-TEST-0022 | Certificate pinning | NetworkSecurityConfig, OkHttp pinning |
| MASTG-TEST-0233 | Hardcoded HTTP URLs | cleartext traffic detection |
| MASTG-TEST-0235 | Cleartext traffic allowed | usesCleartextTraffic=true |
| MASTG-TEST-0242 | Missing cert pinning in NSC | No pin-set in network_security_config |
| MASTG-TEST-0282 | Unsafe custom trust evaluation | Custom TrustManager bypass |
| MASTG-TEST-0284 | SSL error handling in WebView | onReceivedSslError handler.proceed() |

### Platform (MASVS-PLATFORM)

| Test ID | Description | What to Check |
|---------|-------------|---------------|
| MASTG-TEST-0028 | Deep links | URI scheme validation, open redirect |
| MASTG-TEST-0029 | IPC via exported components | Exported activities/services/receivers/providers |
| MASTG-TEST-0030 | PendingIntent injection | FLAG_IMMUTABLE usage |
| MASTG-TEST-0031 | JavaScript in WebViews | setJavaScriptEnabled, JS interfaces |
| MASTG-TEST-0032 | WebView protocol handlers | file://, content:// access |
| MASTG-TEST-0033 | JS objects exposed via WebView | addJavascriptInterface |
| MASTG-TEST-0035 | Overlay attacks (tapjacking) | filterTouchesWhenObscured |
| MASTG-TEST-0057 | Strandhogg/task hijacking | taskAffinity issues |
| MASTG-TEST-0058 | Insecure deep links | Deep link validation |
| MASTG-TEST-0064 | Insecure Content Providers | SQL injection, path traversal |
| MASTG-TEST-0066 | Task hijacking | taskAffinity, launchMode |

### Code Quality (MASVS-CODE)

| Test ID | Description | What to Check |
|---------|-------------|---------------|
| MASTG-TEST-0025 | Injection flaws | SQL injection, command injection |
| MASTG-TEST-0026 | Implicit intents | Intent redirection risks |
| MASTG-TEST-0034 | Object persistence | Parcelable/Serialization issues |
| MASTG-TEST-0042 | Third-party library weaknesses | CVE research, dependency analysis |
| MASTG-TEST-0043 | Memory corruption | Buffer overflows, use-after-free |
| MASTG-TEST-0044 | Security features not activated | ASLR, Stack canaries, RELRO |
| MASTG-TEST-0272 | Known vulnerable dependencies | build.gradle, Gradle dependencies |

### Resilience (MASVS-RESILIENCE)

| Test ID | Description | What to Check |
|---------|-------------|---------------|
| MASTG-TEST-0067 | Debuggable flag not disabled | android:debuggable="true" |
| MASTG-TEST-0089 | Code obfuscation | ProGuard/R8 detection |
| MASTG-TEST-0097 | Root/jailbreak detection | Root checks |
| MASTG-TEST-0100 | Device attestation | Play Integrity API |
| MASTG-TEST-0101 | Debugger detection | Debug.isDebuggerConnected() |
| MASTG-TEST-0102 | Dynamic analysis detection | Frida, Xposed detection |
| MASTG-TEST-0104 | App integrity verification | APK signature verification |

## MASWE Weakness Enumeration (Beta)

Key weaknesses mapped to MASVS categories:

### Storage Weaknesses

- **MASWE-0001**: Insertion of sensitive data into logs
- **MASWE-0002**: Sensitive data with insufficient access restrictions
- **MASWE-0003**: Backup unencrypted
- **MASWE-0004**: Sensitive data not excluded from backup
- **MASWE-0006**: Sensitive data stored unencrypted in private storage
- **MASWE-0007**: Sensitive data stored unencrypted in shared storage

### Crypto Weaknesses

- **MASWE-0009**: Improper cryptographic key generation
- **MASWE-0010**: Improper cryptographic key derivation
- **MASWE-0013**: Hardcoded cryptographic keys
- **MASWE-0014**: Cryptographic keys not properly protected at rest
- **MASWE-0019**: Risky cryptography implementations
- **MASWE-0020**: Improper encryption
- **MASWE-0022**: Predictable IVs
- **MASWE-0027**: Improper random number generation

### Auth Weaknesses

- **MASWE-0005**: API keys hardcoded in app package
- **MASWE-0044**: Biometric authentication can be bypassed
- **MASWE-0041**: Authentication enforced only locally (not server-side)

### Network Weaknesses

- **MASWE-0047**: Insecure identity pinning
- **MASWE-0050**: Cleartext traffic
- **MASWE-0052**: Insecure certificate validation

### Platform Weaknesses

- **MASWE-0056**: Tapjacking attacks
- **MASWE-0057**: Strandhogg attack / task affinity
- **MASWE-0058**: Insecure deep links
- **MASWE-0064**: Insecure content providers
- **MASWE-0068**: JavaScript bridges in WebViews

### Code Weaknesses

- **MASWE-0076**: Dependencies with known vulnerabilities
- **MASWE-0086**: SQL injection
- **MASWE-0088**: Insecure object deserialization

## Quick Reference: Common Findings

| Finding | MASTG Test | MASWE | CWE | OWASP Mobile |
|---------|-----------|-------|-----|--------------|
| Hardcoded API keys | TEST-0001 | MASWE-0005 | CWE-798 | M1 |
| Unencrypted SharedPreferences | TEST-0287 | MASWE-0006 | CWE-311 | M6 |
| SSL pinning missing | TEST-0242 | - | CWE-295 | M5 |
| Exported Activity | TEST-0029 | - | CWE-926 | M9 |
| SQL injection | TEST-0025 | MASWE-0086 | CWE-89 | M8 |
| ECB mode AES | TEST-0221 | MASWE-0020 | CWE-327 | M4 |
| Debuggable app | TEST-0067 | - | CWE-4899 | M8 |
| Root detection bypass | TEST-0097 | - | - | M8 |

## References

- **MASTG Tests**: https://mas.owasp.org/MASTG/tests/
- **MASWE Weaknesses**: https://mas.owasp.org/MASWE/
- **MASVS Controls**: https://mas.owasp.org/MASVS/controls/
- **Best Practices**: https://mas.owasp.org/MASTG/best-practices/