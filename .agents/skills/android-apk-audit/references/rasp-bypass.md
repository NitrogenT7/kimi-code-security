# RASP (Runtime Application Self-Protection) Bypass

## Overview

RASP techniques detect and prevent tampering, debugging, and runtime attacks. This reference covers bypass methods for common RASP implementations in Android apps.

---

## 1. APK Integrity Check Bypass

### PackageManager Signature Verification

```javascript
Java.perform(function() {
    // Hook PackageManager.getPackageInfo
    var PackageManager = Java.use("android.app.ApplicationPackageManager");

    PackageManager.getPackageInfo.overload('java.lang.String', 'int').implementation = function(pkg, flags) {
        console.log('[+] getPackageInfo called for: ' + pkg);

        // Get real package info
        var result = this.getPackageInfo(pkg, flags);

        // Bypass signature verification by returning cached/good signature
        // This prevents detection of modified APK

        return result;
    };
});
```

### Checksum Patching in Smali

```bash
# Find integrity checks in smali
grep -rnE "checksum|MessageDigest|CRC32|verify" decoded/smali --include="*.smali"

# Common patterns:
# const-string v1, "expected_checksum"
# invoke-static {v0, v1}, Lcom/app/Integrity;->verify(Ljava/lang/String;Ljava/lang/String;)Z

# Bypass: return true unconditionally
# .method public static verify(Ljava/lang/String;Ljava/lang/String;)Z
#     const/4 v0, 0x1
#     return v0
# .end method
```

### Signature Extraction from Original APK

```bash
# Get original signature
keytool -printcert -jarfile original.apk

# Or extract from APK
unzip -p original.apk META-INF/CERT.RSA | openssl pkcs7 -inform DER -print_certs -text
```

---

## 2. Debug Detection Bypass

### android.os.Debug Hooks

```javascript
Java.perform(function() {
    var Debug = Java.use("android.os.Debug");

    // isDebuggerConnected
    Debug.isDebuggerConnected.implementation = function() {
        console.log('[+] isDebuggerConnected bypassed');
        return false;
    };

    // waitingForDebugger
    Debug.waitingForDebugger.implementation = function() {
        console.log('[+] waitingForDebugger bypassed');
        return false;
    };
});
```

### TracerPid Detection

```javascript
// Anti-debug often reads /proc/self/status for TracerPid
var LIB_C = Process.findModuleByName("libc.so");

var fopen = LIB_C.findExportByName("fopen");
Interceptor.attach(fopen, {
    onEnter: function(args) {
        this.path = args[0].readUtf8String();
    },
    onLeave: function(retval) {
        if (this.path && (this.path.includes("/proc/") || this.path.includes("/status"))) {
            // Return fake file handle
            retval.replace(ptr(0x0));
        }
    }
});

// Alternative: Hook fgets to fake TracerPid value
var fgets = LIB_C.findExportByName("fgets");
Interceptor.attach(fgets, {
    onEnter: function(args) {
        this.buf = args[0];
        this.size = args[1];
        this.stream = args[2];
    },
    onLeave: function(retval) {
        if (this.buf.readUtf8String().includes("TracerPid")) {
            // Replace TracerPid: N with TracerPid: 0
            var fake = "TracerPid:\t0\n";
            this.buf.writeUtf8String(fake);
        }
    }
});
```

---

## 3. Emulator Detection Evasion

### Build Properties Spoofing

```javascript
Java.perform(function() {
    var Build = Java.use("android.os.Build");

    // Common emulator indicators to hide
    var BRAND_FIXES = {
        "BRAND": "Samsung",
        "MANUFACTURER": "Samsung",
        "MODEL": "SM-G998B",
        "PRODUCT": "beyond2q",
        "DEVICE": "beyond2q",
        "HARDWARE": "qcom",
        "BOARD": "beyond2q",
        "HOST": "BUILD-Samsung",
        "FINGERPRINT": "Samsung/beyond2q/beyond2q:12/SP1A.210812.016/G998BXXUCCVKH:user/release-keys"
    };

    Object.entries(BRAND_FIXES).forEach(function([prop, value]) {
        try {
            var field = Build.class.getDeclaredField(prop);
            field.setAccessible(true);
            field.set(null, value);
            console.log('[+] Build.' + prop + ' = ' + value);
        } catch(e) {
            console.log('[!] Failed to set Build.' + prop);
        }
    });
});
```

### Emulator File Detection Bypass

```javascript
Java.perform(function() {
    var File = Java.use("java.io.File");

    File.exists.implementation = function() {
        var path = this.getAbsolutePath();

        // Emulator indicator files
        var emulator_files = [
            "/system/bin/qemu-props",
            "/dev/socket/qemud",
            "/dev/qemu_trace",
            "/sys/qemu_trace",
            "/dev/goldfish_pipe",
            "/system/lib/libcork_android.so",
            "/sys/class/dmi/id/bios_vendor",
            // Genymotion files
            "/dev/vboxguest",
            "/dev/vboxuser",
            // BlueStacks files
            "/data/Bluetooth",
            "/data/app/com.bluestacks",
            // NOX files
            "/dev/binder",
            "/dev/input/mouse0"
        ];

        for (var i = 0; i < emulator_files.length; i++) {
            if (path.startsWith(emulator_files[i])) {
                console.log('[+] Hiding emulator file: ' + path);
                return false;
            }
        }

        return this.exists();
    };
});
```

---

## 4. Frida Detection Evasion

### Port 27042 Hiding

```javascript
// Frida detection often checks for port 27042
Java.perform(function() {
    var ServerSocket = Java.use("java.net.ServerSocket");

    ServerSocket.$init.overload('int').implementation = function(port) {
        if (port === 27042 || port === 27043) {
            console.log('[+] Blocking ServerSocket on Frida port: ' + port);
            // Don't bind to Frida ports
            return;
        }
        return this.$init(port);
    };
});
```

### Process Name Hiding

```javascript
var LIB_C = Process.findModuleByName("libc.so");

// Hook strstr to hide "frida" in process list
var strstr = LIB_C.findExportByName("strstr");
Interceptor.attach(strstr, {
    onEnter: function(args) {
        this.haystack = args[0].readUtf8String();
        this.needle = args[1].readUtf8String();
    },
    onLeave: function(retval) {
        if (this.needle && (this.needle.includes("frida") || this.needle.includes("27042"))) {
            retval.replace(ptr(0x0)); // Return NULL = not found
        }
    }
});
```

### /data/local/tmp/frida-server Hiding

```javascript
Java.perform(function() {
    var File = Java.use("java.io.File");

    var FRIDA_PATHS = [
        "/data/local/tmp/frida-server",
        "/data/local/tmp/frida",
        "/data/local/tmp/",
        "/system/bin/frida-server",
        "/system/xbin/frida-server"
    ];

    File.exists.implementation = function() {
        var path = this.getAbsolutePath();

        for (var i = 0; i < FRIDA_PATHS.length; i++) {
            if (path.indexOf(FRIDA_PATHS[i]) === 0) {
                console.log('[+] Hiding Frida file: ' + path);
                return false;
            }
        }

        return this.exists();
    };
});
```

---

## 5. Native Root Detection Escalation

Use this escalation path when `root-detection-bypass.js` is not enough and the app still reports root on obfuscated or native-heavy builds.

### When to Escalate

Escalate beyond generic bypasses when you see any of:

- `System.loadLibrary(...)` or `native` methods in the suspect flow
- inconsistent return values from root checks
- checks surviving `File.exists`, `Runtime.exec`, and standard RootBeer hooks
- signals tied to `zygisk`, `mountinfo`, SELinux state, or native string comparisons

### Investigation Order

1. **Identify the native boundary**
   Trace `System.loadLibrary(...)`, `JNI_OnLoad`, or suspicious `native` methods.
2. **Gate hooks to the target library load**
   Use `linker64` / `linker`, `do_dlopen`, and `call_constructor` to reduce noise.
3. **Probe native primitives**
   Observe `access`, `stat`, `fopen`, and `strstr` before mutating anything.
4. **Look for modern root indicators**
   `su`, `magisk`, `zygisk`, `/proc/self/attr/prev`, `/proc/self/mountinfo`, SELinux policy files.
5. **Mutate the smallest possible primitive**
   Redirect a path or needle only after you know which primitive causes detection.
6. **Escalate to by-offset hooks**
   If libc hooks miss the real logic, pivot to Ghidra plus `native-hook.js` offset hooks or syscall/SVC analysis.

### Common Native Signals

| Primitive | Typical signal | What it often means |
|---|---|---|
| `access()` | `/system/bin/su`, `/system/xbin/su`, `magisk` | direct root binary detection |
| `stat()` | SELinux policy files, root artifacts | metadata-based root checks |
| `fopen()` | `/proc/self/attr/prev`, `/proc/self/mountinfo` | zygote / mount-based detection |
| `strstr()` | `zygote`, `magisk`, `zygisk` needles | string search over procfs or policy data |

### Practical Notes

- Prefer **observe-first** instrumentation so you can map the check before breaking app behavior.
- Replace arguments by assigning cached strings instead of overwriting read-only memory in place.
- If `mountinfo` or `attr/prev` is involved, log both the file access and the follow-up `strstr()` needle.
- When generic hooks are too noisy, target only the suspicious library once it is loaded.

### Bundled Frida Template

Use the focused probe when generic bypasses fail:

```bash
frida -U -f com.target.app \
  -l assets/frida-scripts/native-root-detection-probe.js \
 
```

The template supports:
- `linker64` / `linker` library-load gating
- observe-only tracing for `access` / `stat` / `fopen` / `strstr`
- optional pointer replacement for `su`, SELinux, `zygote`, `magisk`, and `zygisk` indicators

### Final Escalation: SVC/syscall Hooks by Offset

If libc hooks miss the detection, the app may use **indirect branches** or **syscall/SVC instructions** to hide function names. This is common in obfuscated native libraries.

**Workflow:**

1. Identify suspicious SVC instruction offsets in Ghidra
2. Map syscall numbers (arm64: syscall number in X8, arguments in X0-X5)
3. Hook by offset using Frida's `Interceptor.attach`

**Complete Frida script for SVC hooking:**

```javascript
// 1. Wait for library to load via linker64 gate
var do_dlopen = null;
var call_constructor = null;
Process.findModuleByName('linker64').enumerateSymbols().forEach(function(symbol) {
    if (symbol.name.indexOf('do_dlopen') >= 0) do_dlopen = symbol.address;
    else if (symbol.name.indexOf('call_constructor') >= 0) call_constructor = symbol.address;
});

var libLoaded = 0;
Interceptor.attach(do_dlopen, function() {
    var libPath = this.context.x0.readCString();
    if (libPath.indexOf('libinappprotections.so') >= 0) {
        console.log('[+] Target library loading...');
        Interceptor.attach(call_constructor, function() {
            if (libLoaded === 0) {
                var nativeMod = Process.findModuleByName('libinappprotections.so');
                console.log('[+] Loaded at: ' + nativeMod.base);
            }
            libLoaded = 1;
        });
    }
});

// 2. Hook strstr to detect string comparisons
Interceptor.attach(Module.findExportByName('libc.so', 'strstr'), {
    onEnter: function(args) {
        this.haystack = args[0].readCString();
        this.needle = args[1].readCString();
        console.log('[strstr] haystack: ' + this.haystack + ' | needle: ' + this.needle);
        // Block known root indicators
        if (this.needle.indexOf('zygote') >= 0 || this.needle.indexOf('magisk') >= 0) {
            args[1].writeUtf8String('nomatch');
        }
    }
});

// 3. Hook access/stat to detect path checks
Interceptor.attach(Module.findExportByName('libc.so', 'access'), {
    onEnter: function(args) {
        var path = args[0].readCString();
        if (path && path.indexOf('/su') >= 0) {
            // Redirect to non-existent path
            args[0].writeUtf8String('/system/nonexistent');
        }
    }
});

// 4. Hook fopen for procfs checks
Interceptor.attach(Module.findExportByName('libc.so', 'fopen'), {
    onEnter: function(args) {
        var path = args[0].readCString();
        console.log('[fopen] ' + path);
        // Redirect /proc/self/attr/prev to non-root context
        if (path.indexOf('/proc/self/attr') >= 0) {
            args[0].writeUtf8String('/non/existent');
        }
    }
});

// 5. Hook by offset for indirect/SVC calls
// Map: https://chromium.googlesource.com/chromiumos/docs/+/master/constants/syscalls.md#arm64-64_bit
function hookSvcByOffset(baseAddr, offsets) {
    offsets.forEach(function(offset) {
        try {
            Interceptor.attach(baseAddr.add(offset), function() {
                var syscallNum = this.context.x8.toInt32();
                var path = this.context.x1.readCString();
                console.log('[SVC:' + syscallNum + '] ' + path);
            });
        } catch(e) {
            console.log('[-] Hook failed at offset ' + offset + ': ' + e.message);
        }
    });
}

// Usage after library loads:
// hookSvcByOffset(nativeMod.base, [0x1998, 0x19bc, 0x19dc, 0x1a00, 0x1a20]);

// 6. Memory.protect before writing to read-only memory
Interceptor.attach(Module.findExportByName('libc.so', 'strstr'), {
    onEnter: function(args) {
        if (args[1].readCString().indexOf('target_string') >= 0) {
            Memory.protect(args[1], Process.pointerSize, 'rwx');
            args[1].writeUtf8String('replacement');
        }
    }
});
```

**Key techniques demonstrated:**
- `linker64` gate to hook only when target library loads
- `strstr` needle replacement for zygote/magisk bypass
- `access()` path redirection for `/su` binary checks
- `fopen` redirection for `/proc/self/attr/prev` SELinux checks
- By-offset SVC hooking for obfuscated syscalls
- `Memory.protect()` to enable writes to read-only memory

**Source:** [8ksec - Advanced Root Detection & Bypass Techniques](https://8ksec.io/advanced-root-detection-bypass-techniques/)

---

## 6. Advanced Objection Usage

### Objection Gadget Mode

```bash
# Patch APK with Frida gadget automatically
objection patchapk --source app.apk

# This injects Frida gadget directly into APK for:
# - Persistence across app restarts
# - Bypassing Frida detection
# - No root required
```

### Memory Dump Workflow

```bash
# Start objection
objection -g com.target.app explore

# Dump memory
android heap dump

# Search in memory dump
memory search "password"
memory search "token"

# List loaded classes
android hooking list classes

# Watch specific method
android hooking watch class_method com.target.Class.method

# Dump specific object
android heap print <object-handle>
```

### Hook Persistence Techniques

```bash
# Use startup commands for persistent hooks
objection -g com.target.app explore --startup-command "android sslpinning disable"

# Multiple startup commands
objection -g com.target.app explore --startup-command "android root disable" --startup-command "android sslpinning disable"

# Save to file for reuse
# startup.txt:
android sslpinning disable
android root disable
android hooking watch class_method com.target.Class.sensitiveMethod

# Run with file
objection -g com.target.app explore --startup-command-file startup.txt
```

---

## 7. RASP-Specific Bypass Scripts

### Talsec/Free-RASP Bypass

```javascript
Java.perform(function() {
    // Talsec RASP detection bypass
    try {
        var Talsec = Java.use("com.talsec.RaspClass");

        // Common Talsec methods to hook
        var methods = Talsec.class.getDeclaredMethods();
        methods.forEach(function(method) {
            var methodName = method.getName();
            if (methodName.includes("detect") || methodName.includes("check")) {
                console.log('[+] Talsec method: ' + methodName);
            }
        });

        // Override integrity check
        if (Talsec.checkIntegrity) {
            Talsec.checkIntegrity.implementation = function() {
                console.log('[+] Talsec.checkIntegrity bypassed');
                return true;
            };
        }

    } catch(e) {
        console.log('[!] Talsec not found');
    }
});
```

### Approov Bypass Patterns

```javascript
Java.perform(function() {
    // Approov uses certificate transparency
    try {
        var CertificateTransparency = Java.use("com.appmattus.certificatetransparency.internal.verifier.CertificateTransparencyTrustManager");

        CertificateTransparency.checkServerTrusted.overload('[Ljava.security.cert.X509Certificate;', 'java.lang.String').implementation = function(certs, str) {
            console.log('[+] Approov CT check bypassed');
            return;
        };

    } catch(e) {
        console.log('[!] Approov not found');
    }

    // Approov also uses custom interceptor
    try {
        var ApproovInterceptor = Java.use("com.appmattus.certificatetransparency.internal.verifier.CertificateTransparencyInterceptor");

        ApproovInterceptor.intercept.implementation = function(chain) {
            console.log('[+] Approov interceptor bypassed');
            return chain.proceed(chain.request());
        };

    } catch(e) {
        console.log('[!] Approov interceptor not found');
    }
});
```

---

## 8. Timing-Based Bypass

### Delay Hook Activation

```javascript
// Some RASP checks only run at startup
// Delay hook activation to bypass initial checks

setTimeout(function() {
    Java.perform(function() {
        // Hook RASP checks after initial detection window
        console.log('[+] Activating RASP bypass hooks (delayed)');

        // Add your RASP bypass hooks here
        // ...
    });
}, 3000); // 3 second delay

// Alternative: Wait for specific trigger
Java.perform(function() {
    var Activity = Java.use("android.app.Activity");

    Activity.onResume.implementation = function() {
        // First resume = app passed initial checks
        console.log('[+] First resume, activating bypass hooks');

        // Enable bypass hooks
        enableBypassHooks();

        return this.onResume();
    };
});
```

---

## 9. Complete RASP Bypass Script Template

```javascript
// rasp-bypass.js - Complete RASP bypass template
// Usage: frida -U -f com.target.app -l rasp-bypass.js

var CONFIG = {
    ENABLE_DEBUG_BYPASS: true,
    ENABLE_EMULATOR_BYPASS: true,
    ENABLE_FRIDA_BYPASS: true,
    ENABLE_INTEGRITY_BYPASS: true,
    ENABLE_ROOT_BYPASS: true,  // Set to false if app uses Play Integrity
    VERBOSE_LOGGING: true
};

setTimeout(function() {
    Java.perform(function() {
        console.log('=== RASP Bypass Script Loaded ===');

        if (CONFIG.ENABLE_DEBUG_BYPASS) {
            bypassDebugDetection();
        }

        if (CONFIG.ENABLE_EMULATOR_BYPASS) {
            bypassEmulatorDetection();
        }

        if (CONFIG.ENABLE_FRIDA_BYPASS) {
            bypassFridaDetection();
        }

        if (CONFIG.ENABLE_INTEGRITY_BYPASS) {
            bypassIntegrityChecks();
        }

        if (CONFIG.ENABLE_ROOT_BYPASS) {
            // Note: This is also covered by root-detection-bypass.js
            // You may want to use only one script
        }

        console.log('=== All RASP Bypasses Active ===');
    });
}, 2000); // 2 second delay
```

---

---

## 10. BoringSSL Native SSL Pinning Bypass

Flutter and Cronet apps use BoringSSL at the native level, bypassing Java TrustManager hooks.

### Identifying BoringSSL Libraries

```bash
# List native libraries
find extracted/ -name "*.so" -exec sh -c 'echo "=== $1 ===" && strings "$1" | grep -i "boringssl\|ssl_set_custom_verify" | head -3' _ {} \;

# Libraries using BoringSSL
# - libflutter.so (Flutter apps)
# - libsscronet.so (Cronet - Chrome, TikTok, Google apps)
# - libboringssl.so (direct BoringSSL)
```

### Native Frida Hooks for BoringSSL

```javascript
// boringssl-native-bypass.js
var libs = ["libflutter.so", "libsscronet.so", "libboringssl.so"];

libs.forEach(function(lib) {
    try {
        var m = Process.getModuleByName(lib);
        console.log("[*] Processing: " + lib);

        // SSL_set_custom_verify - PRIMARY bypass target
        var func = m.getExportByName("SSL_set_custom_verify");
        if (func) {
            Interceptor.attach(func, {
                onEnter: function(args) {
                    console.log("[+] " + lib + " SSL_set_custom_verify(mode=" + args[1] + ")");
                }
            });
        }

        // SSL_CTX_set_custom_verify - context-level
        var ctxFunc = m.getExportByName("SSL_CTX_set_custom_verify");
        if (ctxFunc) {
            Interceptor.attach(ctxFunc, {
                onEnter: function(args) {
                    console.log("[+] " + lib + " SSL_CTX_set_custom_verify");
                }
            });
        }

        // SSL_read/SSL_write - intercept plaintext
        var sslRead = m.getExportByName("SSL_read");
        if (sslRead) {
            Interceptor.attach(sslRead, {
                onLeave: function(retval) {
                    var bytes = retval.toInt32();
                    if (bytes > 0) {
                        console.log("[SSL_read] " + bytes + " bytes");
                    }
                }
            });
        }

    } catch(e) {
        console.log("[-] " + lib + ": " + e.message);
    }
});
```

### Flutter Interception Workflow

```bash
# 1. Prepare proxy (Burp/MITMproxy) with CA cert in DER format

# 2. Run with combined hooks
frida -U -f com.target.app \
  -l native-tls-hook.js \
  -l android-proxy-override.js \
  -l android-certificate-unpinning.js

# 3. Verify output shows:
# == Hooked native TLS lib libflutter.so ==
```

### Key BoringSSL APIs for Hooking

| API | Purpose |
|-----|---------|
| `SSL_set_custom_verify()` | Configure certificate validation - PRIMARY |
| `SSL_CTX_set_custom_verify()` | Context-level validation config |
| `SSL_read()` / `SSL_write()` | Intercept plaintext traffic |
| `SSL_get_psk_identity()` | PSK cases |

### Note on Java Hooks

Java-level SSL pinning bypass (TrustManager hooks) **DO NOT WORK** on Flutter/Cronet apps because they use native BoringSSL directly, bypassing Java entirely.

---

## References

- [Appknox - KMM Security](https://www.appknox.com/blog/kmm-security-root-jailbreak-detection-ssl-pinning)
- [8ksec - Advanced Root Detection & Bypass Techniques](https://8ksec.io/advanced-root-detection-bypass-techniques/)
- [Sekurno - Mobile Pentesting Guide](https://www.sekurno.com/post/a-definitive-guide-to-mobile-app-pentesting)
- [GitHub - Talsec RASP Issues](https://github.com/talsec/Free-RASP-Android/issues/65)
- [Medium - Bypassing RASP](https://proandroiddev.com/bypassing-rasp-and-white-box-protections-24e677ad17ef)
- [BoringSSL GitHub](https://github.com/google/boringssl)
- [HTTP Toolkit Frida Interception](https://github.com/httptoolkit/frida-interception-and-unpinning)
