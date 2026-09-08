# Native Library Analysis Reference for Android APK Security Auditing

This reference covers security analysis of native `.so` libraries found in Android APKs. Many security-critical operations (crypto, auth, anti-tampering) are implemented in native code.

## 1. Native Library Basics

### Where to Find .so Files

```
lib/
├── armeabi-v7a/     # 32-bit ARM
│   ├── libapp.so    # Flutter app code
│   ├── libnative.so # Custom native lib
│   └── libflutter.so # Flutter engine
├── arm64-v8a/       # 64-bit ARM (most common)
├── x86/             # Emulator (32-bit)
└── x86_64/          # Emulator (64-bit)
```

### Common Native Libraries

| Library | Purpose | Security Relevance |
|---------|---------|-------------------|
| libapp.so | Flutter compiled code | May contain business logic, crypto, secrets |
| libunity.so | Unity game engine | Game logic, anti-cheat |
| libil2cpp.so | Unity IL2CPP backend | Compiled C# code |
| libssl.so / libcrypto.so | OpenSSL | Custom TLS implementation |
| libsqlite.so | SQLite | Custom database handling |
| libjni*.so | JNI bridges | Java↔Native interface |

## 2. Static Analysis of .so Files

### String Extraction (Cross-OS)

**macOS/Linux**

```bash
# Extract all strings (minimum 8 chars)
strings -n 8 lib/arm64-v8a/libnative.so | sort -u

# Search for specific patterns
strings lib/arm64-v8a/libnative.so | grep -iE "password|token|secret|key|api|http"

# Extract URLs
strings lib/arm64-v8a/libnative.so | grep -E "https?://"

# Extract Base64-like strings
strings -n 20 lib/arm64-v8a/libnative.so | grep -E "^[A-Za-z0-9+/=]{20,}$"
```

**Windows (PowerShell)**

```powershell
# Extract strings
[System.Text.Encoding]::ASCII.GetString([System.IO.File]::ReadAllBytes("lib\arm64-v8a\libnative.so")) -split '[\x00-\x1F]+' | Where-Object { $_.Length -ge 8 }
```

### Symbol Analysis

**macOS/Linux**

```bash
# List exported symbols
nm -D lib/arm64-v8a/libnative.so 2>/dev/null

# Alternative with readelf
readelf -Ws lib/arm64-v8a/libnative.so 2>/dev/null

# Find JNI functions (Java_com_*)
nm -D lib/arm64-v8a/libnative.so | grep Java_

# macOS alternative (NOTE: otool is for Mach-O only)
# For ELF (.so), use readelf (Linux) or llvm-readelf (macOS via Homebrew: brew install llvm)
# llvm-readelf -Ws lib/arm64-v8a/libnative.so

# List all symbols including dynamic
objdump -T lib/arm64-v8a/libnative.so 2>/dev/null
```

**Windows (dumpbin from Visual Studio)**

```cmd
dumpbin /exports libnative.so
```

### Security-Relevant Patterns in Strings

```bash
# Crypto operations
strings libnative.so | grep -iE "AES|RSA|SHA|MD5|DES|ECB|CBC|GCM|HMAC|PBKDF"

# Hardcoded keys (hex patterns)
strings libnative.so | grep -E "^[0-9a-fA-F]{32,}$"

# SSL/TLS
strings libnative.so | grep -iE "SSL|TLS|certificate|pinning|trust"

# Anti-analysis
strings libnative.so | grep -iE "frida|xposed|substrate|magisk|root|su |debug|ptrace"

# Network endpoints
strings libnative.so | grep -E "https?://[a-zA-Z0-9]"

# File paths
strings libnative.so | grep -E "^/data/|^/system/|^/proc/|^/dev/"
```

## 3. JNI Function Mapping

### Finding JNI Method Signatures

```bash
# From native code
nm -D libnative.so | grep Java_
# Output: Java_com_example_app_CryptoHelper_encrypt

# Map to Java class
# com.example.app.CryptoHelper.encrypt(byte[])
```

### Common JNI Security Patterns

| JNI Function | Security Risk | What to Check |
|-------------|---------------|---------------|
| Java_.*_encrypt | Crypto implementation | Algorithm, key management |
| Java_.*_decrypt | Crypto implementation | Where plaintext goes |
| Java_.*_checkLicense | License validation | Bypass possibility |
| Java_.*_verifySignature | Integrity check | Tamper detection |
| Java_.*_getRootStatus | Root detection | Bypass approach |
| Java_.*_signRequest | Request signing | Key exposure |
| Java_.*_getDeviceId | Fingerprinting | Privacy concern |
| Java_.*_checkIntegrity | Anti-tampering | Patch approach |

## 4. Frida for Native Analysis

### Hook Native Functions

```javascript
// Hook by name
var encrypt = Module.findExportByName("libnative.so", "Java_com_example_Crypto_encrypt");
Interceptor.attach(encrypt, {
    onEnter: function(args) {
        console.log("[+] encrypt() called");
        console.log("    arg0: " + args[0]);
        console.log("    arg1: " + args[1]);
    },
    onLeave: function(retval) {
        console.log("[+] encrypt() returned: " + retval);
    }
});

// Hook by offset (if stripped)
var base = Module.findBaseAddress("libnative.so");
var funcAddr = base.add(0x1234); // offset from reverse engineering
Interceptor.attach(funcAddr, {
    onEnter: function(args) {
        console.log("[+] Function at offset 0x1234 called");
    }
});

// Hook all exports of a library
var exports = Module.enumerateExportsSync("libnative.so");
exports.forEach(function(exp) {
    if (exp.name.indexOf("Java_") !== -1) {
        console.log("[*] JNI export: " + exp.name + " @ " + exp.address);
    }
});
```

### Native Crypto Hooking

```javascript
// Hook OpenSSL EVP_EncryptFinal
var EVP_EncryptFinal = Module.findExportByName("libcrypto.so", "EVP_EncryptFinal");
if (EVP_EncryptFinal) {
    Interceptor.attach(EVP_EncryptFinal, {
        onEnter: function(args) {
            console.log("[+] EVP_EncryptFinal called");
            var outBuf = args[1];
            var outLen = args[2].readU32();
            console.log("    Output length: " + outLen);
        }
    });
}
```

## 5. Ghidra Integration (Advanced)

### Quick Setup

```bash
# Install Ghidra (requires JDK 17+)
# macOS: brew install --cask ghidra
# Linux: Download from https://ghidra-sre.org/

# Headless analysis
analyzeHeadless /tmp/ghidra_project MyProject \
  -import libnative.so \
  -postScript DecryptStrings.java \
  -scriptPath /path/to/scripts
```

### What to Look For in Ghidra

1. **String decryption functions** - XOR, AES decrypt patterns
2. **Hardcoded keys** - Check .rodata section
3. **Anti-debug** - ptrace(PTRACE_TRACEME) calls
4. **SSL context setup** - SSL_CTX_new, SSL_CTX_set_verify
5. **JNI_OnLoad** - Initial setup, method registration

## 6. Flutter-Specific Analysis

### libapp.so Analysis

```bash
# Extract Dart snapshots
strings lib/arm64-v8a/libapp.so | grep -E "^[A-Za-z0-9+/=]{50,}$"

# Use reFlutter for Flutter analysis
# pip install reflutter
reflutter app.apk
# Produces patched APK with Frida instrumentation
```

### Flutter Frida Hooks

```javascript
// Monitor Flutter crypto
// Note: "crypto_operate" is a placeholder name. Replace with actual export names
// found via: nm -D libflutter.so | grep -i crypto
// or: readelf -Ws libflutter.so | grep -i crypto

var flutter_crypto = Module.findExportByName("libflutter.so", "crypto_operate");
if (flutter_crypto) {
    Interceptor.attach(flutter_crypto, {
        onEnter: function(args) {
            console.log("[+] Flutter crypto operation");
        }
    });
}

// Common crypto exports to monitor:
// - SSL_* functions for network crypto
// - EVP_* functions for OpenSSL operations
// - Custom Flutter crypto functions
```

## 7. Unity IL2CPP Analysis

### Extracting Metadata

```bash
# Find global-metadata.dat
find decoded/ -name "global-metadata.dat"

# Use Il2CppDumper
# https://github.com/Perfare/Il2CppDumper
Il2CppDumper lib/arm64-v8a/libil2cpp.so decoded/assets/bin/Data/Managed/Metadata/global-metadata.dat output/

# Produces: dump.cs (C# pseudo-code with class/method definitions)
```

## 8. Cross-OS Tool Equivalents

| Task | macOS/Linux | Windows |
|------|-------------|---------|
| Strings | `strings` | `strings` (Sysinternals) |
| Symbols | `nm -D` | `dumpbin /exports` |
| ELF headers | `readelf -h` | `dumpbin /headers` |
| Disassembly | `objdump -d` | `dumpbin /disasm` |
| Hex dump | `xxd` | `certutil -dump` |
| File type | `file` | manual check |

## 9. Native Analysis Checklist

```
[ ] List all .so files and their sizes
[ ] Extract strings from each .so file
[ ] Identify JNI function signatures (Java_*)
[ ] Check for hardcoded secrets in strings
[ ] Check for crypto algorithm names
[ ] Check for anti-analysis strings (frida, root, debug)
[ ] Check for hardcoded URLs/IPs
[ ] Map JNI exports to Java class methods
[ ] For Flutter: run reFlutter
[ ] For Unity: run Il2CppDumper
[ ] Document native boundaries that block static analysis
```

## 10. Common Vulnerabilities in Native Code

### Hardcoded Secrets

Native code often contains hardcoded API keys, encryption keys, or certificates that attackers can extract using string analysis.

### Weak Crypto Implementation

Custom implementations of crypto primitives in native code may use:
- Weak algorithms (DES, MD5)
- Insecure modes (ECB without IV)
- Hardcoded keys/IVs
- Side-channel vulnerable implementations

### Broken Root Detection

Root detection logic in native code can be bypassed by:
- Hooking detection functions
- Patching comparison results
- Emulating clean environment

### Insecure Certificate Pinning

Custom pinning in native code may be bypassed by:
- Hooking SSL verification functions
- Modifying certificate checks
- Disabling pinning entirely

---

**Last updated:** 2025
