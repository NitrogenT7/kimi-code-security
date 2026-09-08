# Native Code Analysis (JNI/C++)

## Overview

Native code (.so libraries) contains sensitive logic that's not visible in smali. This reference covers analysis techniques for JNI bridges and native libraries.

---

## 1. Identify Native Libraries

```bash
# List .so files in APK
find decoded/lib -name "*.so" -o -name "*.a"

# Common locations:
# decoded/lib/armeabi-v7a/    (32-bit ARM)
# decoded/lib/arm64-v8a/      (64-bit ARM)
# decoded/lib/x86/            (32-bit Intel)
# decoded/lib/x86_64/         (64-bit Intel)
```

### Native Library Indicators

```bash
# Check for Flutter
ls decoded/lib/*/libflutter.so 2>/dev/null && echo "FLUTTER"

# Check for React Native Hermes (new architecture)
ls decoded/lib/*/libhermes.so 2>/dev/null && echo "HERMES"

# Check for custom native code
ls decoded/lib/*/libapp.so 2>/dev/null && echo "NATIVE_APP"
```

---

## 2. Extract Strings from Native Libraries

```bash
# Extract all strings
strings decoded/lib/arm64-v8a/libapp.so > native_strings.txt

# Search for sensitive patterns
grep -iE "api.*key|token|secret|password|decrypt|encrypt|private" native_strings.txt

# Search for URLs
grep -iE "http[s]?://|api\.|\.com|\.net" native_strings.txt

# Search for JNI method signatures
grep -E "Java_|JNI_OnLoad|RegisterNatives" native_strings.txt
```

---

## 3. Ghidra Headless Mode

### Installation

```bash
# Download from: https://ghidra-sre.org/
# Requires Java 17+

# Set environment
export GHIDRA_HOME=/path/to/ghidra
export PATH=$GHIDRA_HOME:$PATH
```

### Basic Analysis

```bash
# Analyze native library
$GHIDRA_HOME/support/analyzeHeadless /tmp ghidra_project \
  -import decoded/lib/arm64-v8a/libapp.so \
  -postScript ExportCCode.java \
  -scriptPath $GHIDRA_HOME/Ghidra/Features/Decompiler/ghidra_scripts

# Results saved to:
# /tmp/ghidra_project/libapp.so_exported/
```

### Python Automation Script

```python
#!/usr/bin/env python3
"""
analyze_native.py - Automated Ghidra analysis for Android native libraries
"""

import subprocess
import os
import sys

def analyze_so(lib_path, project_dir="/tmp/ghidra_native"):
    """Analyze native library with Ghidra headless."""

    os.makedirs(project_dir, exist_ok=True)

    ghidra_home = os.environ.get('GHIDRA_HOME', '/opt/ghidra')
    analyze_cmd = os.path.join(ghidra_home, 'support', 'analyzeHeadless')

    cmd = [
        analyze_cmd,
        project_dir,
        "NativeAnalysis",
        "-import", lib_path,
        "-postScript", "ExportCCode.java",
        "-scriptPath", os.path.join(ghidra_home, "Ghidra/Features/Decompiler/ghidra_scripts")
    ]

    result = subprocess.run(cmd, capture_output=True, text=True)
    return result.stdout, result.stderr

def find_jni_functions(lib_path):
    """Find JNI function signatures using objdump."""

    cmd = ["objdump", "-T", lib_path]
    result = subprocess.run(cmd, capture_output=True, text=True)

    jni_funcs = []
    for line in result.stdout.split('\n'):
        if 'Java_' in line or 'JNI_' in line:
            jni_funcs.append(line.strip())

    return jni_funcs

def extract_strings(lib_path):
    """Extract strings from native library."""

    cmd = ["strings", lib_path]
    result = subprocess.run(cmd, capture_output=True, text=True)

    return result.stdout

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python analyze_native.py <lib.so>")
        sys.exit(1)

    lib_path = sys.argv[1]

    print("[+] Finding JNI functions...")
    jni_funcs = find_jni_functions(lib_path)
    for func in jni_funcs:
        print(f"  {func}")

    print("\n[+] Extracting strings...")
    strings = extract_strings(lib_path)

    # Filter for interesting strings
    patterns = ["api", "key", "token", "secret", "http", "decrypt", "encrypt"]
    for line in strings.split('\n'):
        if any(p in line.lower() for p in patterns):
            print(f"  {line}")

    print("\n[+] Running Ghidra analysis...")
    if os.environ.get('GHIDRA_HOME'):
        stdout, stderr = analyze_so(lib_path)
        print("Ghidra analysis complete")
    else:
        print("Set GHIDRA_HOME to enable Ghidra analysis")
```

---

## 4. objdump Commands

### Export/Import Symbols

```bash
# List exported symbols
objdump -T libapp.so | grep -E "Java_|JNI_"

# List all symbols (exports + imports)
objdump -t libapp.so | grep -E "FUNC|OBJECT"

# Demangle C++ names
objdump -t libapp.so | c++filt
```

### Disassembly

```bash
# Full disassembly
objdump -d libapp.so > disasm.txt

# Disassemble specific function
objdump -d libapp.so | grep -A 50 "Java_com_example_App_nativeMethod"

# Extract .text section
objdump -s -j .text libapp.so

# Show section headers
objdump -h libapp.so
```

### Function Analysis

```bash
# Find function addresses
objdump -t libapp.so | grep "FUNC" | grep "Java_"

# Output format:
# 00012345 g     F .text  00000050 Java_com_example_App_processData
# ^address   ^type  ^section  ^size    ^name
```

---

## 5. Native Function Hooking with Frida

### Basic JNI Hook

```javascript
Java.perform(function() {
    // Hook native library load
    var System = Java.use("java.lang.System");

    System.loadLibrary.implementation = function(libname) {
        console.log('[+] Loading native library: ' + libname);
        return this.loadLibrary(libname);
    };
});

// Hook JNI_OnLoad
Interceptor.attach(Module.findExportByName("libnative.so", "JNI_OnLoad"), {
    onEnter: function(args) {
        console.log('[+] JNI_OnLoad called');
        this.javaVM = args[0];
    },
    onLeave: function(retval) {
        console.log('[+] JNI_OnLoad returned: ' + retval);
    }
});

// Hook RegisterNatives
Interceptor.attach(Module.findExportByName("libnative.so", "RegisterNatives"), {
    onEnter: function(args) {
        console.log('[+] RegisterNatives called');
        // args[0] = JNIEnv*
        // args[1] = jclass
        // args[2] = JNINativeMethod*
        // args[3] = method count

        var methodCount = args[3].toInt32();
        console.log('    Method count: ' + methodCount);

        // Parse method table
        for (var i = 0; i < methodCount; i++) {
            var methodPtr = args[2].add(i * Process.pointerSize * 3);
            var methodName = methodPtr.readPointer().readCString();
            var signature = methodPtr.add(Process.pointerSize).readPointer().readCString();
            var fnPtr = methodPtr.add(Process.pointerSize * 2).readPointer();

            console.log('    Method: ' + methodName + ' ' + signature);
            console.log('    Address: ' + fnPtr);
        }
    }
});
```

### Hook Native Method by Offset

```javascript
// Hook at specific offset (from Ghidra/objdump)
var module = Process.findModuleByName("libapp.so");
var offset = 0x1234;  // From objdump or Ghidra
var funcAddr = module.base.add(offset);

Interceptor.attach(funcAddr, {
    onEnter: function(args) {
        console.log('[+] Native function at offset 0x' + offset.toString(16));
        // Print arguments
        for (var i = 0; i < 4; i++) {
            console.log('    arg' + i + ': ' + args[i]);
        }
    },
    onLeave: function(retval) {
        console.log('[+] Return: ' + retval);
    }
});
```

### Hook Native Methods Declared in Java

```javascript
Java.perform(function() {
    // Find class with native methods
    var className = "com.example.NativeClass";

    try {
        var targetClass = Java.use(className);

        // Get all declared methods
        var methods = targetClass.class.getDeclaredMethods();

        methods.forEach(function(method) {
            var methodName = method.getName();
            var modifiers = method.getModifiers();

            // Check if native (Modifier.NATIVE = 256)
            if (modifiers & 256) {
                console.log('[+] Native method found: ' + methodName);

                // Hook the native method
                // Note: Requires correct overload signature
                // targetClass[methodName].implementation = function(...) { ... }
            }
        });
    } catch(e) {
        console.log('[!] Class not found: ' + className);
    }
});
```

---

## 6. Anti-Debug Bypass

### ptrace Detection Bypass

```javascript
// Hook ptrace to return 0 (success)
var LIB_C = Process.findModuleByName("libc.so");
var ptrace = LIB_C.findExportByName("ptrace");

Interceptor.replace(ptrace, new NativeCallback(function(request, pid, addr, data) {
    console.log('[+] ptrace called, returning 0');
    return 0;
}, 'long', ['int', 'int', 'pointer', 'pointer']));
```

### Debug.isDebuggerConnected Bypass

```javascript
Java.perform(function() {
    var Debug = Java.use("android.os.Debug");

    Debug.isDebuggerConnected.implementation = function() {
        console.log('[+] isDebuggerConnected bypassed');
        return false;
    };

    Debug.waitingForDebugger.implementation = function() {
        console.log('[+] waitingForDebugger bypassed');
        return false;
    };
});
```

### Anti-Debug Flags

```javascript
// Bypass debuggable flag check
Java.perform(function() {
    var ApplicationInfo = Java.use("android.content.pm.ApplicationInfo");
    var FLAG_DEBUGGABLE = 0x2;

    // Hook getApplicationInfo
    var PackageManager = Java.use("android.app.ApplicationPackageManager");
    PackageManager.getApplicationInfo.overload('java.lang.String', 'int').implementation = function(pkg, flags) {
        var result = this.getApplicationInfo(pkg, flags);
        // Clear debuggable flag
        result.flags.value = result.flags.value & ~FLAG_DEBUGGABLE;
        return result;
    };
});
```

---

## 7. Common Native Functions to Hook

### File I/O Functions

```javascript
var LIB_C = Process.findModuleByName("libc.so");

// open
Interceptor.attach(LIB_C.findExportByName("open"), {
    onEnter: function(args) {
        this.path = args[0].readUtf8String();
        console.log('[+] open(' + this.path + ')');
    }
});

// fopen
Interceptor.attach(LIB_C.findExportByName("fopen"), {
    onEnter: function(args) {
        this.path = args[0].readUtf8String();
        this.mode = args[1].readUtf8String();
        console.log('[+] fopen(' + this.path + ', ' + this.mode + ')');
    }
});

// read
Interceptor.attach(LIB_C.findExportByName("read"), {
    onEnter: function(args) {
        this.fd = args[0].toInt32();
        this.buf = args[1];
        this.count = args[2].toInt32();
    },
    onLeave: function(retval) {
        var bytesRead = retval.toInt32();
        if (bytesRead > 0 && this.buf) {
            console.log('[+] read(' + this.fd + ', ' + bytesRead + ' bytes)');
            console.log('    Data: ' + this.buf.readUtf8String(Math.min(bytesRead, 100)));
        }
    }
});
```

### SSL/TLS Functions

```javascript
// SSL_read
var ssl_read = Module.findExportByName("libssl.so", "SSL_read");
if (ssl_read) {
    Interceptor.attach(ssl_read, {
        onEnter: function(args) {
            this.ssl = args[0];
            this.buf = args[1];
            this.num = args[2].toInt32();
        },
        onLeave: function(retval) {
            var bytesRead = retval.toInt32();
            if (bytesRead > 0) {
                console.log('[+] SSL_read(' + bytesRead + ' bytes)');
                console.log('    ' + this.buf.readUtf8String(Math.min(bytesRead, 200)));
            }
        }
    });
}

// SSL_write
var ssl_write = Module.findExportByName("libssl.so", "SSL_write");
if (ssl_write) {
    Interceptor.attach(ssl_write, {
        onEnter: function(args) {
            this.ssl = args[0];
            this.buf = args[1];
            this.num = args[2].toInt32();
            console.log('[+] SSL_write(' + this.num + ' bytes)');
            console.log('    ' + this.buf.readUtf8String(Math.min(this.num, 200)));
        }
    });
}
```

### Crypto Functions

```javascript
// AES_encrypt
var aes_encrypt = Module.findExportByName(null, "AES_encrypt");
if (aes_encrypt) {
    Interceptor.attach(aes_encrypt, {
        onEnter: function(args) {
            console.log('[+] AES_encrypt called');
            // args[0] = input buffer
            // args[1] = output buffer
            // args[2] = key schedule
        }
    });
}

// EVP_EncryptInit
var evp_encrypt_init = Module.findExportByName(null, "EVP_EncryptInit_ex");
if (evp_encrypt_init) {
    Interceptor.attach(evp_encrypt_init, {
        onEnter: function(args) {
            console.log('[+] EVP_EncryptInit_ex called');
            // Extract cipher type, key, IV
        }
    });
}
```

---

## 8. Complete Analysis Workflow

```bash
# Phase 1: Identify native libraries
ls -la decoded/lib/*/

# Phase 2: Extract strings
for lib in decoded/lib/*/lib*.so; do
    strings "$lib" > "$(basename $lib).strings.txt"
done

# Phase 3: Find JNI methods
for lib in decoded/lib/*/lib*.so; do
    objdump -T "$lib" | grep -E "Java_|JNI_" >> jni_exports.txt
done

# Phase 4: Ghidra analysis
python analyze_native.py decoded/lib/arm64-v8a/libapp.so

# Phase 5: Frida hooking
frida -U -f com.target.app -l native-interceptor.js
```

---

## References

- [Mobile Hacking Lab - Native Analysis](https://www.mobilehackinglab.com/blog/damn-exploitable-android-app-dynamic-analysis-and-reverse-engineering)
- [Ghidra Documentation](https://ghidra-sre.org/)
- [Android NDK JNI Tips](https://developer.android.com/ndk/guides)
- [Frida Native Interception](https://frida.re/docs/javascript-api/#interceptor)