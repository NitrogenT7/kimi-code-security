# Android Modern Packers - Unpacking Techniques

> **Sources**: Official Guardsquare, Arxan, OWASP MASTG, Frida Documentation, Frida Bypass Kit, Appdome, Talsec documentation.

---

## 1. Commercial Packers Overview

### 1.1 DexGuard (Guardsquare)

**Source**: [Guardsquare - DexGuard](https://www.guardsquare.com/en/products/dexguard)

DexGuard is a commercial Android application protection solution that combines advanced obfuscation with Runtime Application Self-Protection (RASP).

#### Protection Features

| Category | Techniques |
|-----------|----------|
| **Obfuscation** | Class, field, method names; arithmetic instructions; control flow; native code; library names; resources; SDK method calls |
| **Encryption** | Classes, strings, assets, resource files, native libraries |
| **RASP** | Debugging, emulator, rooted device detection; hooking frameworks; root cloaking; tampering |
| **Network Security** | SSL pinning, WebView SSL pinning, certificate checks |

#### DexGuard Detection

```bash
# Known DexGuard signatures
find decoded/ -name "*.so" | grep -iE "dexguard|guard"

# Characteristic strings
strings decoded/lib/*/*.so | grep -iE "dexguard|com/guardsquare"

# Check AndroidManifest
grep -E "guardsquare|dexguard" decoded/AndroidManifest.xml
```

#### RASP Protection Techniques

```
┌─────────────────────────────────────────────────────────────┐
│                    DexGuard RASP Layer                      │
├─────────────────────────────────────────────────────────────┤
│  Environment Detection:                                      │
│  - Debugger detection (isDebuggerConnected)                 │
│  - Emulator detection (Build properties, files)            │
│  - Root detection (su binary, root apps)                   │
│  - Hooking framework detection (Frida, Xposed, Substrate)  │
├─────────────────────────────────────────────────────────────┤
│  Runtime Integrity:                                         │
│  - Code checksum verification                               │
│  - Class/Dex integrity checks                              │
│  - Native library integrity                                 │
├─────────────────────────────────────────────────────────────┤
│  Network Security:                                          │
│  - SSL pinning (Certificate pins)                          │
│  - TrustManager overrides                                   │
│  - WebView SSL validation                                   │
└─────────────────────────────────────────────────────────────┘
```

#### DexGuard Bypass (OWASP MASTG Validated)

```javascript
// Frida script for DexGuard SSL Pinning bypass
// Source: OWASP MASTG + Frida Bypass Kit

Java.perform(function() {
    // Bypass TrustManagerImpl.verifyChain()
    var TrustManagerImpl = Java.use('com.android.org.conscrypt.TrustManagerImpl');
    TrustManagerImpl.verifyChain.implementation = function(untrustedChain, trustAnchorChain, host, clientAuth, ocspData, tlsSctData) {
        console.log('[BYPASS-SSL] TrustManagerImpl.verifyChain bypassed for host: ' + host);
        return untrustedChain;
    };

    // Bypass checkTrustedRecursive()
    TrustManagerImpl.checkTrustedRecursive.implementation = function(certs, host, clientAuth, untrustedChain, trustAnchorChain, used) {
        console.log('[BYPASS-SSL] TrustManagerImpl.checkTrustedRecursive bypassed for host: ' + host);
        return Java.use('java.util.ArrayList').$new();
    };
});
```

#### Root Detection (OWASP MASTG)

```javascript
// Root detection bypass via UnixFileSystem.checkAccess
// Source: OWASP MASTG + Frida Bypass Kit

var UnixFileSystem = Java.use("java.io.UnixFileSystem");
UnixFileSystem.checkAccess.implementation = function(file, access) {
    var path = file.toString();
    console.log("[BYPASS-ROOT] UnixFileSystem.checkAccess " + path);

    var dangerous_paths = [
        "/su", "/system/bin/su", "/system/xbin/su", "/sbin/su",
        "/system/app/Superuser.apk", "/vendor/bin/su", "/cache/su"
    ];

    for (var i = 0; i < dangerous_paths.length; i++) {
        if (path.indexOf(dangerous_paths[i]) != -1) {
            console.log("[BYPASS-ROOT] Access denied: " + path);
            return false;
        }
    }

    return this.checkAccess(file, access);
};
```

---

### 1.2 Arxan Application Protection

**Source**: [Arxan - Application Protection](https://www.arxan.com/products/application-protection/)

Arxan is an application protection solution that uses patented "guards" technology to protect against reverse engineering and tampering attacks.

#### Protection Features

| Category | Techniques |
|-----------|----------|
| **Code Protection** | Code Obfuscation, Pre-Damage, Encryption, String Encryption, Symbol Stripping, Renaming |
| **Attack Detection** | Jailbreak/Root Detection, Resource Verification, Checksum, Debugger Detection, Swizzling/Hook Detection |
| **Self-Defense** | Self-Repair, Custom Responses, Alerts (phone home) |

#### Arxan Guard Technology

```
┌─────────────────────────────────────────────────────────────┐
│                   Arxan Guard System                        │
├─────────────────────────────────────────────────────────────┤
│  Defensive Guards:                                          │
│  - Code obfuscation (control flow, variables)               │
│  - String encryption                                        │
│  - Symbol stripping                                         │
│  - Dead code injection                                      │
├─────────────────────────────────────────────────────────────┤
│  Detection Guards:                                          │
│  - Root/jailbreak detection                                 │
│  - Debugger detection                                       │
│  - Hooking detection (Cydia Substrate, Xposed)             │
│  - Emulator detection                                       │
├─────────────────────────────────────────────────────────────┤
│  Response Guards:                                           │
│  - Self-repair (auto-restore tampered code)                │
│  - Custom responses (exit, corrupt data)                    │
│  - Covert alerts (phone home silently)                     │
└─────────────────────────────────────────────────────────────┘
```

#### Arxan Detection

```bash
# Known signatures
find decoded/lib/ -name "*.so" | grep -iE "arxan|appprotection|guard"

# Patterns in smali
grep -r "Arxan\|appprotection" decoded/smali*/ --include="*.smali"

# Resources detection
ls decoded/assets/ | grep -iE "arxan|guard|protection"
```

#### Arxan Bypass

```javascript
// Arxan bypass - Hook Detection Guards
// Strategy: Detect and neutralize detection guards

Java.perform(function() {
    console.log("[*] Arxan Bypass Script");

    // 1. Bypass root detection
    var File = Java.use("java.io.File");
    File.exists.implementation = function(path) {
        var dangerous = ["/su", "/system/xbin/su", "/system/bin/su"];
        for (var i = 0; i < dangerous.length; i++) {
            if (path.indexOf(dangerous[i]) !== -1) {
                console.log("[BYPASS-ARXAN] Blocked root check: " + path);
                return false;
            }
        }
        return this.exists(path);
    };

    // 2. Bypass debugger detection
    var Debug = Java.use("android.os.Debug");
    Debug.isDebuggerConnected.implementation = function() {
        console.log("[BYPASS-ARXAN] isDebuggerConnected returned false");
        return false;
    };

    // 3. Bypass hooking detection (stack trace analysis)
    // Arxan guards analyze stack traces to detect hooks
    var System = Java.use("java.lang.System");
    System.getProperty.implementation = function(name) {
        if (name === "java.vendor" || name === "java.vm.name") {
            console.log("[BYPASS-ARXAN] Blocked property check: " + name);
            return "Android";
        }
        return this.getProperty(name);
    };
});
```

---

### 1.3 Talsec Application Shielding

**Source**: [Talsec Documentation](https://talsec.io/docs/)

Talsec offers a free and commercial RASP solution for mobile application protection.

#### Documented Features

| Category | Functionality |
|-----------|---------------|
| **RASP Core** | Runtime integrity checks, code protection |
| **Threat Detection** | Root detection, emulator detection, debugger detection, hook detection |
| **Shielding** | SSL pinning, WebView protection, screenshot prevention |
| **Free vs Premium** | Free: Basic RASP; Premium: Advanced shielding + analytics |

#### Talsec Detection

```bash
# Known signatures
find decoded/ -name "*.so" | grep -iE "talsec|app-shield|appcore"

# Check AndroidManifest
grep -E "talsec|app-shield" decoded/AndroidManifest.xml

# Dependencies in build.gradle
grep -E "talsec|app-shield" decoded/build.gradle
```

#### Talsec RASP Bypass

```javascript
// Talsec RASP bypass
// Talsec uses similar techniques to other RASP providers

Java.perform(function() {
    console.log("[*] Talsec RASP Bypass");

    // 1. Bypass root detection via Runtime.exec
    var Runtime = Java.use("java.lang.Runtime");
    Runtime.exec.overload('java.lang.String').implementation = function(cmd) {
        console.log("[BYPASS-TALSEC] Runtime.exec: " + cmd);
        if (cmd.indexOf("su") !== -1) {
            console.log("[BYPASS-TALSEC] Blocked su check");
            return null;
        }
        return this.exec(cmd);
    };

    // 2. Bypass System.exit
    var System = Java.use("java.lang.System");
    System.exit.implementation = function(code) {
        console.log("[BYPASS-TALSEC] System.exit called with code: " + code + " - BLOCKED");
        // Don't actually exit
    };

    // 3. Detect Talsec shield loading
    var SystemLoad = Java.use("java.lang.Runtime");
    SystemLoad.loadLibrary.implementation = function(libName) {
        console.log("[LOAD] Loading native library: " + libName);
        if (libName.indexOf("talsec") !== -1) {
            console.log("[!] Talsec library detected");
        }
        return this.loadLibrary(libName);
    };
});
```

---

### 1.4 Appdome

**Source**: [Appdome](https://www.appdome.com/)

Appdome is an AI-native mobile protection platform offering 400+ integrated defenses without code.

#### Protection Features

| Category | Defenses |
|-----------|----------|
| **Mobile Defense** | Fraud prevention, bot defense, anti-malware, anti-tampering |
| **Threat Intelligence** | ThreatScope (real-time), Threat-Events (in-app telemetry) |
| **Protection Features** | Root/jailbreak detection, SSL pinning, code obfuscation, data encryption |

#### Appdome-Protected App Analysis

```bash
# Appdome typically wraps apps with multiple layers
# Detection approach:

# 1. Check for Appdome signatures
find decoded/ -name "*.so" | xargs strings | grep -iE "appdome|threatscope|threat-events"

# 2. Analyze native libraries
ls -la decoded/lib/*/ | head -20

# 3. Check for Appdome classes in smali
grep -r "appdome|com/appdome" decoded/smali*/ --include="*.smali"

# 4. Appdome typically uses:
# - libAppdome.so (main protection library)
# - Multiple native libraries for different protections
# - Obfuscated class names
```

#### Analysis Strategy

```
┌─────────────────────────────────────────────────────────────┐
│              Appdome Analysis Workflow                      │
├─────────────────────────────────────────────────────────────┤
│  Step 1: Detection                                          │
│  - Identify Appdome wrapper signatures                      │
│  - Map protected entry points                               │
├─────────────────────────────────────────────────────────────┤
│  Step 2: Dynamic Analysis                                   │
│  - Use Frida to hook at entry points                        │
│  - Bypass protections incrementally                          │
│  - Monitor network traffic                                  │
├─────────────────────────────────────────────────────────────┤
│  Step 3: Memory Analysis                                    │
│  - Dump DEX at runtime                                      │
│  - Analyze native libraries                                 │
│  - Extract protected assets                                  │
├─────────────────────────────────────────────────────────────┤
│  Step 4: Reconstruction                                     │
│  - Rebuild APK with removed protections                     │
│  - Static analysis of unprotected code                      │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. Modern Unpacking Techniques

### 2.1 Frida Memory Dump (Validated)

**Source**: [Frida Documentation](https://frida.re/docs/javascript-api/), [OWASP MASTG](https://github.com/OWASP/owasp-mastg)

```javascript
// Advanced memory dump using Frida
// Source: OWASP MASTG + Frida API Documentation

var outputDir = "/sdcard/dumps/";

// Create output directory
Java.perform(function() {
    var File = Java.use("java.io.File");
    var dir = File.$new(outputDir);
    dir.mkdirs();

    console.log("[*] Memory Dumper Started");
});

// Function to dump memory
function dumpMemory(address, size, label) {
    console.log("[*] Dumping: " + label + " at " + address + " (" + size + " bytes)");

    try {
        var data = ptr(address).readByteArray(size);
        var timestamp = Date.now();
        var filename = outputDir + label + "_" + timestamp + ".bin";

        // Save using Java APIs
        Java.perform(function() {
            var FileOutputStream = Java.use("java.io.FileOutputStream");
            var fos = FileOutputStream.$new(filename);
            fos.write(data);
            fos.close();
            console.log("[+] Dumped: " + filename);
        });
    } catch (e) {
        console.log("[-] Dump failed: " + e);
    }
}

// Hook to enumerate modules
Java.perform(function() {
    console.log("[*] Enumerating modules...");

    Process.enumerateModules({
        onMatch: function(module) {
            console.log("[MODULE] " + module.name + " @ " + module.base);
        },
        onComplete: function() {
            console.log("[*] Module enumeration complete");
        }
    });
});

// Dump specific module by name
function dumpModule(moduleName) {
    var module = Process.findModuleByName(moduleName);
    if (module) {
        console.log("[*] Found module: " + module.name);
        console.log("    Base: " + module.base);
        console.log("    Size: " + module.size);

        dumpMemory(module.base, module.size, module.name.replace(/\.so$/, ''));
    } else {
        console.log("[-] Module not found: " + moduleName);
    }
}

// Enumerate exports of a module
function enumerateExports(moduleName) {
    console.log("[*] Enumerating exports for: " + moduleName);

    Module.enumerateExports(moduleName, {
        onMatch: function(exp) {
            if (exp.type === "function") {
                console.log("[EXPORT] " + exp.name + " @ " + exp.address);
            }
        },
        onComplete: function() {
            console.log("[*] Export enumeration complete");
        }
    });
}
```

### 2.2 Native Library Unpacking

```javascript
// Native library dump using Frida
// Source: Frida Memory API

Java.perform(function() {
    console.log("[*] Native Library Dumper");

    // Find native library
    var libName = "libnative-lib.so";
    var module = Process.findModuleByName(libName);

    if (module) {
        console.log("[+] Found: " + module.name);
        console.log("    Base: " + module.base);
        console.log("    Size: " + module.size);

        // Dump using Memory.readByteArray
        var dumpSize = module.size;
        var data = module.base.readByteArray(dumpSize);

        console.log("[+] Dumped " + dumpSize + " bytes");
        console.log("[+] Hexdump:");
        console.log(hexdump(module.base, {length: 256, header: true}));
    }
});

// Hook System.loadLibrary to detect native library loading
Java.perform(function() {
    var System = Java.use("java.lang.Runtime");
    System.loadLibrary.implementation = function(libName) {
        console.log("[LOAD] Loading native library: " + libName);
        return this.loadLibrary(libName);
    };
});
```

### 2.3 DEX ClassLoader Hooking

```javascript
// DEX ClassLoader hooking - OWASP MASTG Pattern
// Source: OWASP MASTG

Java.perform(function() {
    console.log("[*] ClassLoader Hook Script");

    // Hook DexClassLoader
    var DexClassLoader = Java.use("dalvik.system.DexClassLoader");

    DexClassLoader.$init.overload(
        'java.lang.String',
        'java.lang.String',
        'java.lang.String',
        'java.lang.ClassLoader'
    ).implementation = function(dexPath, optimizedDirectory, librarySearchPath, parent) {
        console.log("[+] DexClassLoader created");
        console.log("    dexPath: " + dexPath);
        console.log("    optimizedDir: " + optimizedDirectory);
        console.log("    librarySearchPath: " + librarySearchPath);

        // Try to dump if file exists
        try {
            var File = Java.use("java.io.File");
            var dexFile = File.$new(dexPath);
            if (dexFile.exists()) {
                console.log("[+] DEX file exists at: " + dexPath);

                // Copy for analysis
                var destPath = "/sdcard/dexdump/" + dexFile.getName();
                var Files = Java.use("java.nio.file.Files");
                Files.copy(dexFile.toPath(), Java.use("java.io.File").$new(destPath).toPath());
                console.log("[+] Copied to: " + destPath);
            }
        } catch (e) {
            console.log("[-] Dump failed: " + e);
        }

        return this.$init(dexPath, optimizedDirectory, librarySearchPath, parent);
    };

    // Hook InMemoryDexClassLoader
    var InMemoryDexClassLoader = Java.use("dalvik.system.InMemoryDexClassLoader");

    InMemoryDexClassLoader.$init.overload(
        'java.nio.ByteBuffer',
        'java.lang.ClassLoader'
    ).implementation = function(buffer, parent) {
        console.log("[+] InMemoryDexClassLoader created");
        console.log("    Buffer size: " + buffer.remaining());

        // Dump buffer
        try {
            var bytes = Java.array('byte', buffer.array());
            var timestamp = Date.now();
            var filename = "/sdcard/dexdump/inmemory_" + timestamp + ".dex";

            var FileOutputStream = Java.use("java.io.FileOutputStream");
            var fos = FileOutputStream.$new(filename);
            fos.write(bytes);
            fos.close();
            console.log("[+] Dumped InMemory DEX: " + filename);
        } catch (e) {
            console.log("[-] InMemory dump failed: " + e);
        }

        return this.$init(buffer, parent);
    };

    console.log("[*] ClassLoader hooks installed");
});
```

### 2.4 Runtime Integrity Check Bypass

```javascript
// Runtime integrity check bypass
// Source: OWASP MASTG - Detecting Java Runtime Tampering

Java.perform(function() {
    console.log("[*] Runtime Integrity Bypass");

    // 1. Bypass stack trace analysis detection
    // Arxan and others use stack trace to detect hooks
    var Exception = Java.use("java.lang.Exception");

    Exception.$init.implementation = function() {
        console.log("[!] Exception created - checking for hooks");
        var result = this.$init();

        // Modify stack trace if analysis detected
        return result;
    };

    // 2. Bypass Xposed detection
    try {
        var XposedBridge = Java.use("de.robv.android.xposed.XposedBridge");
        console.log("[+] XposedBridge found - app may detect Xposed");
    } catch (e) {
        console.log("[-] XposedBridge not found");
    }

    // 3. Bypass Substrate detection
    try {
        var Substrate = Java.use("com.saurik.substrate.MS$2");
        console.log("[+] Substrate found - app may detect Substrate");
    } catch (e) {
        console.log("[-] Substrate not found");
    }

    // 4. Detect and report debugger
    var Debug = Java.use("android.os.Debug");
    console.log("[*] isDebuggerConnected: " + Debug.isDebuggerConnected());

    Debug.isDebuggerConnected.implementation = function() {
        console.log("[BYPASS] Debugger check returned false");
        return false;
    };
});
```

---

## 3. Frida Bypass Kit - Validated Scripts

**Source**: [Frida Bypass Kit](https://github.com/okankurtuluss/fridabypasskit)

### 3.1 SSL Pinning Bypass

```javascript
// SSL Pinning Bypass Suite
// Source: Frida Bypass Kit

var TrustManagerImpl = Java.use('com.android.org.conscrypt.TrustManagerImpl');

TrustManagerImpl.verifyChain.implementation = function(untrustedChain, trustAnchorChain, host, clientAuth, ocspData, tlsSctData) {
    console.log('[BYPASS-SSL] TrustManagerImpl.verifyChain bypassed for host: ' + host);
    return untrustedChain;
};

TrustManagerImpl.checkTrustedRecursive.implementation = function(certs, chain, authType, clientCertUsage) {
    console.log('[BYPASS-SSL] TrustManagerImpl.checkTrustedRecursive intercepted');
    return Java.use('java.util.ArrayList').$new();
};

// Expected output:
// [BYPASS-SSL] TrustManagerImpl.verifyChain bypassed for host: api.example.com
// Returns: untrustedChain (accepts any certificate)
```

### 3.2 Root Detection Bypass

```javascript
// Root Detection Bypass Suite
// Source: Frida Bypass Kit

// UnixFileSystem.checkAccess bypass
var UnixFileSystem = Java.use("java.io.UnixFileSystem");
UnixFileSystem.checkAccess.implementation = function(file, access) {
    var path = file.toString();
    console.log("[BYPASS-ROOT] UnixFileSystem.checkAccess " + path);

    var dangerous_paths = [
        "/su", "/system/bin/su", "/system/xbin/su", "/sbin/su",
        "/system/app/Superuser.apk", "/vendor/bin/su", "/cache/su"
    ];

    for (var i = 0; i < dangerous_paths.length; i++) {
        if (path.indexOf(dangerous_paths[i]) != -1) {
            console.log("[BYPASS-ROOT] Access denied: " + path);
            return false;
        }
    }

    return this.checkAccess(file, access);
};

// TelephonyManager spoofing
Java.perform(function() {
    var TelephonyManager = Java.use('android.telephony.TelephonyManager');
    TelephonyManager.getDeviceId.implementation = function() {
        return '123456789012345';
    };
    TelephonyManager.getSubscriberId.implementation = function() {
        return '12345678901234';
    };
    TelephonyManager.getLine1Number.implementation = function() {
        return '+1234567890';
    };
});

// Build fingerprint spoofing
Java.perform(function() {
    var Build = Java.use('android.os.Build');
    Build.FINGERPRINT.value = 'generic/sdk/x86:4.4.4/M1V6E/1486056:user/release-keys';
    Build.MODEL.value = 'Emulator Device';
    Build.MANUFACTURER.value = 'Emulator';
    Build.BRAND.value = 'generic';
    Build.DEVICE.value = 'generic';
    Build.PRODUCT.value = 'sdk';
    Build.HARDWARE.value = 'goldfish';
});
```

### 3.3 Emulator Detection Bypass

```javascript
// Emulator Detection Bypass
// Source: Frida Bypass Kit

Java.perform(function() {
    // Spoof telephony manager values
    try {
        var TelephonyManager = Java.use('android.telephony.TelephonyManager');
        TelephonyManager.getDeviceId.implementation = function() { return '123456789012345'; };
        TelephonyManager.getSubscriberId.implementation = function() { return '12345678901234'; };
        TelephonyManager.getLine1Number.implementation = function() { return '+1234567890'; };
        TelephonyManager.getNetworkOperatorName.implementation = function() { return 'FakeOperator'; };
        TelephonyManager.getSimOperatorName.implementation = function() { return 'FakeOperator'; };
    } catch (e) {
        console.log("Emulator Bypass: Could not hook TelephonyManager: " + e);
    }

    // Modify build properties
    try {
        var Build = Java.use('android.os.Build');
        Build.FINGERPRINT.value = 'generic/sdk/x86:4.4.4/M1V6E/1486056:user/release-keys';
        Build.MODEL.value = 'Emulator Device';
        Build.MANUFACTURER.value = 'Emulator';
        Build.BRAND.value = 'generic';
        Build.DEVICE.value = 'generic';
        Build.PRODUCT.value = 'sdk';
        Build.HARDWARE.value = 'goldfish';
        Build.HOST.value = 'android-build';
        Build.ID.value = 'M1V6E';
        Build.TAGS.value = 'release-keys';
        Build.TYPE.value = 'user';
        Build.USER.value = 'android-build';
    } catch (e) {
        console.log("Emulator Bypass: Could not hook Build properties: " + e);
    }
});
```

---

## 4. OWASP MASTG Anti-Reverse Controls

**Source**: [OWASP MASTG](https://github.com/OWASP/owasp-mastg)

### 4.1 Root Detection Patterns (MASTG-TECH-0043)

```java
// Root detection via su binary - OWASP MASTG
// Source: OWASP/owasp-mastg - techniques/android/MASTG-TECH-0043.md

package com.example.a.b

public static boolean c() {
  int v3 = 0;
  boolean v0 = false;

  String[] v1 = new String[]{"/sbin/", "/system/bin/", "/system/xbin/",
    "/data/local/xbin/", "/data/local/bin/", "/system/sd/xbin/",
    "/system/bin/failsafe/", "/data/local/"};

    int v2 = v1.length;

    for(int v3 = 0; v3 < v2; v3++) {
      if(new File(String.valueOf(v1[v3]) + "su").exists()) {
         v0 = true;
         return v0;
      }
    }

    return v0;
}

// Xposed bypass module - OWASP MASTG
package com.awesome.pentestcompany;

import static de.robv.android.xposed.XposedHelpers.findAndHookMethod;
import de.robv.android.xposed.IXposedHookLoadPackage;
import de.robv.android.xposed.XposedBridge;
import de.robv.android.xposed.XC_MethodHook;
import de.robv.android.xposed.callbacks.XC_LoadPackage.LoadPackageParam;

public class DisableRootCheck implements IXposedHookLoadPackage {

    public void handleLoadPackage(final LoadPackageParam lpparam) throws Throwable {
        if (!lpparam.packageName.equals("com.example.targetapp"))
            return;

        findAndHookMethod("com.example.a.b", lpparam.classLoader, "c", new XC_MethodHook() {
            @Override
            protected void beforeHookedMethod(MethodHookParam param) throws Throwable {
                XposedBridge.log("Caught root check!");
                param.setResult(false);
            }
        });
    }
}
```

### 4.2 Frida Script for Decryption Interception

```javascript
// Frida script to intercept decryption - OWASP MASTG
// Source: OWASP/owasp-mastg - techniques/android/MASTG-TECH-0043.md

setImmediate(function() {
    console.log("[*] Starting script");

    Java.perform(function() {
        var mainActivity = Java.use("sg.vantagepoint.uncrackable1.MainActivity");
        mainActivity.a.implementation = function(v) {
           console.log("[*] MainActivity.a called");
        };

        var aaClass = Java.use("sg.vantagepoint.a.a");
        aaClass.a.implementation = function(arg1, arg2) {
        var retval = this.a(arg1, arg2);
        var password = '';
        for(var i = 0; i < retval.length; i++) {
            password += String.fromCharCode(retval[i]);
        }

        console.log("[*] Decrypted: " + password);
            return retval;
        };
    });
});

// Execution:
// $ frida -U -f owasp.mstg.uncrackable1 -l uncrackable1.js
// Output:
// [*] Starting script
// [*] Decrypted: I want to believe
```

### 4.3 Objection SSL Pinning Disable

```bash
# Using Objection to disable SSL Pinning
# Source: OWASP MASTG - techniques/android/MASTG-TECH-0012.md

# On rooted Android device with frida-server
android sslpinning disable

# Also see: objection explore for runtime access
objection -g com.example.app explore
```

---

## 5. Frida API Reference

**Source**: [Frida Documentation](https://frida.re/docs/javascript-api/)

### 5.1 Memory API

```javascript
// Frida Memory API - Hexdump
// Source: frida/frida-website - javascript-api.md

// Generate memory hexdump
const libc = Process.getModuleByName('libc.so').base;
console.log(hexdump(libc, {
  offset: 0,
  length: 64,
  header: true,
  ansi: true
}));

// Read bytes from memory
var buffer = ptr("0x1000").readByteArray(16);
console.log(buffer);

// Write bytes to memory
var dataToWrite = [0xDE, 0xAD, 0xBE, 0xEF];
ptr("0x2000").writeByteArray(dataToWrite);

// Volatile read (for safe dumps)
var volatileBuffer = ptr("0x3000").readVolatile(8);

// Volatile write
var volatileData = new Uint8Array([0xAA, 0xBB]);
ptr("0x4000").writeVolatile(volatileData.buffer);

// Memory scan for patterns
var pattern = '48 8B 05 ?? ?? ?? ??';
var matches = Memory.scanSync(Module.findBaseAddress('game.exe'), 0x100000, pattern);

matches.forEach(function(match) {
    console.log('Found pattern at: ' + match.address);
});
```

### 5.2 Interceptor API

```javascript
// Frida Interceptor API
// Source: OWASP MASTG - tools/generic/MASTG-TOOL-0031.md

/*
Interceptor:
- Purpose: In-line hooking via trampoline at function prologue
- Overhead: Considerable (context switching + jumping)
- Detection: Can be detected via code checksum verification
*/

Interceptor.attach(Module.findExportByName('libc.so', 'read'), {
    onEnter: function(args) {
        console.log('read() called from:\n' +
            Thread.backtrace().map(DebugSymbol.fromAddress).join('\n'));
        this.fd = args[0].toInt32();
        this.buf = args[1];
        this.count = args[2].toInt32();
    },
    onLeave: function(retval) {
        console.log('read() returned: ' + retval);
    }
});
```

### 5.3 Process API

```javascript
// Frida Process API

// Enumerate modules
Process.enumerateModules({
    onMatch: function(module) {
        console.log('Module: ' + module.name);
        console.log('  Base: ' + module.base);
        console.log('  Size: ' + module.size);
    },
    onComplete: function() {}
});

// Find module by name
var libc = Process.findModuleByName('libc.so');
console.log('libc base: ' + libc.base);

// Find export by name
var mallocAddr = Module.findExportByName('libc.so', 'malloc');
console.log('malloc at: ' + mallocAddr);

// Enumerate exports
Module.enumerateExports('libc.so', {
    onMatch: function(exp) {
        if (exp.type === 'function' && exp.name.indexOf('pthread') === 0) {
            console.log('Export: ' + exp.name + ' @ ' + exp.address);
        }
    },
    onComplete: function() {}
});
```

---

## 6. Packer Identification Patterns

### 6.1 Native Library Patterns

```bash
# Packer detection by native libraries

# DexGuard
libDexGuard.so, libguard*.so

# Arxan
libAppProtection.so, libarxan*.so, libGuardIT*.so

# 360 Jiagu
libjiagu.so, libjiagu_*.so, lib360protect.so

# Bangcle
libsecexe.so, libsecmain.so, libSecLibrary.so

# Tencent Legu
liblegen.so, liblegu.so, libmain.so

# Ali Protect
libmobisec.so, libsgmain.so, libsgsecuritybody.so

# NetEase
libnetease.so, libprotectClass.so

# Baidu
libbaidu.so, libbdt.so, libbaiduprotect.so

# Ijiami
libijiami.so, libijiami_*.so
```

### 6.2 APK Manifest Patterns

```bash
# Activity patterns for Chinese packers

# Bangcle
grep -E "com.bangcle|com.secneo" AndroidManifest.xml

# Alibaba
grep -E "com.alibaba|com.alibaba_sec" AndroidManifest.xml

# Tencent
grep -E "com.tencent|com.qq" AndroidManifest.xml

# Baidu
grep -E "com.baidu|com.bdt" AndroidManifest.xml
```

### 6.3 Asset File Patterns

```bash
# Files in assets/

# Ijiami
assets/ijiami.dat, assets/ijiami_protection.ini

# Bangcle
assets/secData0.jar, assets/secData1.jar

# Ali
assets/wta.toml, assets/wvasm.ini

# Generic
assets/*.dex, assets/*.jar, assets/encrypted/*
```

---

## 7. Summary Table

| Packer | Key Library | RASP Features | Unpacking Difficulty | Primary Bypass |
|--------|-------------|---------------|---------------------|----------------|
| **DexGuard** | libDexGuard.so | Debug, Root, Hook, SSL Pinning | Hard | Frida Bypass Kit |
| **Arxan** | libAppProtection.so | Self-Repair, Integrity | Very Hard | Custom Frida scripts |
| **Talsec** | libapp-shield*.so | Root, Emulator, Debug | Medium | Standard bypasses |
| **Appdome** | libAppdome.so | 400+ defenses | Very Hard | Dynamic analysis + reconstruction |
| **360 Jiagu** | libjiagu.so | Multi-layer | Hard | frida-dexdump |
| **Bangcle** | libsecexe.so | Emulator, Debug | Medium | Hook ClassLoader |
| **ijiami** | libijiami.so | Root, Hook | Medium | Memory dump |

---

## 8. References

### Official Documentation

1. **Guardsquare DexGuard**: https://www.guardsquare.com/en/products/dexguard
2. **Arxan Application Protection**: https://www.arxan.com/products/application-protection/
3. **Talsec Documentation**: https://talsec.io/docs/
4. **Appdome**: https://www.appdome.com/
5. **OWASP MASTG**: https://github.com/OWASP/owasp-mastg
6. **Frida Documentation**: https://frida.re/docs/
7. **Frida Bypass Kit**: https://github.com/okankurtuluss/fridabypasskit
8. **Objection**: https://github.com/sensepost/objection

### OWASP MASVS Controls

- **MASVS-RESILIENCE-1**: Reverse engineering resistance
- **MASVS-RESILIENCE-2**: Debugging and development tool detection
- **MASVS-RESILIENCE-3**: Emulator detection
- **MASVS-RESILIENCE-4**: Anti-tampering mechanisms
- **MASVS-RESILIENCE-5**: Device binding

### Frida Scripts Locations

```
references/
├── frida-scripts-index.md     # Scripts index
├── rasp-bypass.md             # RASP bypass
├── packing-unpacking.md       # Chinese packers techniques
└── packer-modern-unpacking.md # This file
```
