# Kotlin Multiplatform (KMP) Security Analysis

## Overview

Kotlin Multiplatform (KMP) allows sharing code between Android and other platforms. Shared code introduces unique security considerations — vulnerabilities in shared modules affect all platforms where the code is deployed.

**Last Updated:** April 2026

---

## 1. Detection

### Identifying KMP Apps

```bash
# Check for KMP structure in decompiled APK
# Look for shared module artifacts
grep -rnE "kotlinx\.coroutines|kotlinx\.serialization|io\.ktor" decoded/

# Detect KMP-specific files
find decoded/ -name "*.kt" -exec grep -l "expect\|actual" {} \;

# Check gradle files for KMP configuration
grep -rnE "kotlin\(.*multiplatform\)|kotlinMultiplatform|commonMain" decoded/

# Look for shared .klib files (Kotlin libraries)
find decoded/ -name "*.klib" 2>/dev/null

# APKiD detection
apkid app.apk | grep -i "kotlin"
```

### KMP vs Standard Kotlin

| Feature | Standard Kotlin | KMP |
|---------|----------------|-----|
| Code sharing | Android only | Cross-platform |
| Module structure | Single platform | commonMain + platformMain |
| Serialization | Gson/Moshi | kotlinx.serialization |
| Networking | OkHttp/Retrofit | Ktor |
| Coroutines | Dispatchers.Main | Dispatchers.Default/IO |
| Security boundary | Android sandbox | Shared code = shared vulns |

---

## 2. Attack Surface

### Shared Code Vulnerabilities

When a vulnerability exists in `commonMain`, it affects ALL target platforms:

```
commonMain/          ← Vulnerability here = ALL platforms affected
├── src/
│   ├── NetworkClient.kt    # Shared HTTP client
│   ├── CryptoUtils.kt      # Shared crypto
│   └── StorageManager.kt   # Shared data handling
└── androidMain/            ← Android-specific implementations
    └── PlatformStorage.kt
```

### Key Areas to Audit

1. **Shared Networking (Ktor)**
```bash
# Find Ktor HTTP client configuration
grep -rnE "HttpClient|HttpRequest|HttpResponse|Ktor" decoded/

# Check for insecure TLS configuration
grep -rnE "CipherSuite|TLS|SSLContext|TrustManager" decoded/

# Find hardcoded URLs in shared code
grep -rnE "https?://[^\"]+" decoded/ | grep -v "http://schemas"

# Check for missing certificate pinning
grep -rnE "CertificatePinner|pinning" decoded/
# If absent in Ktor config = no pinning
```

2. **Shared Serialization (kotlinx.serialization)**
```bash
# Find serialization annotations
grep -rnE "@Serializable|@SerialName|Json\.(decodeFromString|encodeToString)" decoded/

# Check for insecure deserialization
grep -rnE "Json\.decodeFromString|Json\.parseToJsonElement" decoded/

# Look for sensitive data in serializable classes
grep -rnE "@Serializable" -A 10 decoded/ | grep -iE "password|token|key|secret"
```

3. **Shared Crypto**
```bash
# Find crypto in shared modules
grep -rnE "Cipher|MessageDigest|Mac|SecretKeySpec|AEAD" decoded/

# Check for platform-specific crypto delegation
grep -rnE "expect\s+(fun|val)\s+.*crypt|hash|encrypt|decrypt" decoded/

# Verify actual implementations
grep -rnE "actual\s+(fun|val)\s+.*crypt|hash|encrypt|decrypt" decoded/
```

4. **Expect/Actual Pattern Security**
```bash
# Find expect declarations (shared interface)
grep -rnE "expect\s+(class|fun|val|object)" decoded/

# Find actual implementations (platform-specific)
grep -rnE "actual\s+(class|fun|val|object)" decoded/

# Compare expect vs actual for security gaps
# Example: expect fun secureRandom(): ByteArray
# Check if actual implementation uses SecureRandom on Android
```

---

## 3. Common Vulnerability Patterns

### KMP-Specific Issues

| Vulnerability | Pattern | Detection |
|--------------|---------|-----------|
| Shared code injection | `commonMain` processes unsanitized input | Trace source-to-sink in shared modules |
| Insecure platform delegation | `expect` declares secure function, `actual` uses weak implementation | Compare expect/actual pairs |
| Serialization attacks | `@Serializable` classes with sensitive fields | Check Json configuration for lenient parsing |
| Shared key storage | Keys stored in `commonMain` without platform keystore | Look for hardcoded keys in shared code |
| Ktor TLS bypass | Missing or disabled TLS verification | Check HttpClient engine configuration |

### Grep Patterns for KMP Security

```bash
# Shared module credential exposure
rg -i "(password|api.?key|secret|token)\s*[=:]" decoded/ --type kotlin

# Insecure Ktor configuration
rg "HttpClient\s*\(" decoded/ -A 5 | grep -iE "install|config"

# Missing input validation in shared code
rg "decodeFromString|parseToJsonElement|toObject" decoded/ --type kotlin

# Expect/actual security gap detection
rg "expect\s+(fun|val)" decoded/ --type kotlin > /tmp/expect.txt
rg "actual\s+(fun|val)" decoded/ --type kotlin > /tmp/actual.txt
# Compare both files for security inconsistencies
```

---

## 4. Testing Methodology

### Static Analysis

1. **Map shared modules**: Identify `commonMain` code and its attack surface
2. **Trace data flow**: Follow input from platform entry points through shared code
3. **Verify expect/actual**: Ensure security-critical functions have secure implementations on each platform
4. **Check serialization**: Validate JSON parsing is strict, not lenient

### Dynamic Analysis with Frida

```javascript
// Hook Ktor HTTP client
Java.perform(function() {
    try {
        // Hook kotlinx.serialization JSON parsing
        const Json = Java.use("kotlinx.serialization.json.Json");
        Json.decodeFromString.overload("kotlinx.serialization.DeserializationStrategy", "java.lang.String").implementation = function(strategy, json) {
            console.log("[KMP] JSON decodeFromString called");
            console.log("[KMP] Input: " + json);
            return this.decodeFromString(strategy, json);
        };
    } catch (e) {
        console.log("[!] Ktor/serialization hook failed: " + e);
    }
});
```

---

## 5. OWASP MASTG Mapping

| MASVS Category | KMP-Specific Check | Test ID |
|---------------|-------------------|---------|
| MASVS-CRYPTO | Verify shared crypto uses platform keystore | MSTG-CRYPTO-1 |
| MASVS-NETWORK | Verify Ktor TLS configuration | MSTG-NETWORK-1 |
| MASVS-STORAGE | Check shared prefs/DB not in commonMain | MSTG-STORAGE-1 |
| MASVS-AUTH | Verify auth tokens not in shared code | MSTG-AUTH-1 |
| MASVS-CODE | Check expect/actual for code integrity | MSTG-CODE-3 |

---

## 6. References

- [Kotlin Multiplatform Documentation](https://kotlinlang.org/docs/multiplatform.html)
- [Ktor Security Documentation](https://ktor.io/docs/security.html)
- [kotlinx.serialization Security](https://github.com/Kotlin/kotlinx.serialization)
- OWASP MASTG: https://mas.owasp.org/
