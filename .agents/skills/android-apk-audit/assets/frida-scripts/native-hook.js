/**
 * Frida Native Hook Script for Android (JNI/C++)
 *
 * Usage:
 *   frida -U -f com.target.app -l native-hook.js
 *   frida -U com.target.app -l native-hook.js
 *
 * Requirements:
 *   - Frida >= 12.0
 *   - Android device/emulator with frida-server
 *   - Target app with native libraries
 *
 * Compatibility:
 *   - ARM (32-bit)
 *   - ARM64 (64-bit)
 *   - x86/x86_64 (emulator)
 */

console.log("[*] Native Hook Script Loaded");
console.log("[*] Target:", Java.available ? "Java App" : "Native App");
console.log("[*] Arch:", Process.arch);
console.log("[*] Platform:", Process.platform);
console.log("[*] PID:", Process.id);

// ============================================
// CONFIGURATION
// ============================================

const TARGET_LIBS = [
    "libnative.so",
    "libapp.so",
    "libsecurity.so"
];

const COMMON_NATIVE_FUNCTIONS = [
    "open", "openat", "fopen", "fopen64",
    "read", "write", "close", "fclose",
    "fgets", "fputs", "fprintf", "printf",
    "access", "stat", "lstat", "fstat",
    "getenv", "setenv", "unsetenv",
    "system", "popen",
    "connect", "bind", "listen", "accept",
    "send", "recv", "sendto", "recvfrom"
];

const JNI_FUNCTIONS = [
    "JNI_OnLoad",
    "JNI_OnUnload",
    "RegisterNatives",
    "FindClass",
    "GetMethodID",
    "GetFieldID",
    "NewObject",
    "CallObjectMethod",
    "CallVoidMethod",
    "CallIntMethod",
    "CallLongMethod",
    "GetStringUTFChars",
    "NewStringUTF",
    "GetByteArrayElements",
    "ReleaseByteArrayElements"
];

// ============================================
// UTILITY FUNCTIONS
// ============================================

/**
 * Format hex address
 */
function formatPtr(ptr) {
    return ptr ? ptr.toString() : "NULL";
}

/**
 * Read null-terminated string from memory
 */
function readCStringSafe(ptr, maxLength) {
    maxLength = maxLength || 256;
    try {
        const buffer = ptr.readByteArray(maxLength);
        let result = "";
        const byteBuffer = new Uint8Array(buffer);
        for (let i = 0; i < byteBuffer.length; i++) {
            if (byteBuffer[i] === 0) break;
            result += String.fromCharCode(byteBuffer[i]);
        }
        return result;
    } catch (e) {
        return "<error: " + e.message + ">";
    }
}

/**
 * Read Java string safely
 */
function readJavaString(jstring) {
    if (jstring.isNull()) return "NULL";
    try {
        const str = jstring.readUtf8String();
        return str;
    } catch (e) {
        return "<error: " + e.message + ">";
    }
}

/**
 * Log function with timestamp
 */
function log() {
    const timestamp = new Date().toISOString();
    const args = Array.prototype.slice.call(arguments);
    console.log.apply(console, ["[" + timestamp + "]"].concat(args));
}

/**
 * Hex dump memory
 */
function hexDump(address, length) {
    const buffer = address.readByteArray(length);
    console.log(hexdump(buffer, {
        offset: 0,
        length: length,
        header: true,
        ansi: true
    }));
}

// ============================================
// JNI_OnLoad HOOKING
// ============================================

// JNI Version Constants
var JNI_VERSION_1_2 = 0x00010002;
var JNI_VERSION_1_4 = 0x00010004;
var JNI_VERSION_1_6 = 0x00010006;
var JNI_VERSION_1_8 = 0x00010008;

/**
 * Hook JNI_OnLoad function to detect native library loading
 */
function hookJNILoad() {
    log("[*] Hooking JNI_OnLoad...");

    TARGET_LIBS.forEach(function(libName) {
        const lib = Process.findModuleByName(libName);
        if (!lib) {
            log("[-] Library not found:", libName);
            return;
        }

        const JNI_OnLoad = Module.findExportByName(libName, "JNI_OnLoad");
        if (!JNI_OnLoad) {
            log("[-] JNI_OnLoad not found in", libName);
            return;
        }

        log("[+] Hooking JNI_OnLoad in", libName, "at", JNI_OnLoad);

        Interceptor.attach(JNI_OnLoad, {
            onEnter: function(args) {
                log("[+] JNI_OnLoad called:", libName);
                log("    JavaVM:", formatPtr(args[0]));
                log("    Reserved:", args[1]);

                this.javaVM = args[0];
            },
            onLeave: function(retval) {
                log("[+] JNI_OnLoad returned:", retval);
                log("    Version:", retval);

                if (retval.toInt32() === JNI_VERSION_1_2) {
                    log("    JNI Version: 1.2");
                } else if (retval.toInt32() === JNI_VERSION_1_4) {
                    log("    JNI Version: 1.4");
                } else if (retval.toInt32() === JNI_VERSION_1_6) {
                    log("    JNI Version: 1.6");
                } else if (retval.toInt32() === JNI_VERSION_1_8) {
                    log("    JNI Version: 1.8");
                }
            }
        });
    });
}

// ============================================
// REGISTER NATIVES HOOKING
// ============================================

/**
 * Hook RegisterNatives to discover dynamically registered native methods
 */
function hookRegisterNatives() {
    log("[*] Hooking RegisterNatives...");

    const RegisterNatives = Module.findExportByName(null, "RegisterNatives");
    if (!RegisterNatives) {
        log("[-] RegisterNatives not found");
        return;
    }

    log("[+] Hooking RegisterNatives at", RegisterNatives);

    Interceptor.attach(RegisterNatives, {
        onEnter: function(args) {
            const env = args[0];
            const clazz = args[1];
            const methods = args[2];
            const nMethods = args[3].toInt32();

            log("[+] RegisterNatives called");
            log("    Class:", formatPtr(clazz));
            log("    Methods:", methods);
            log("    Count:", nMethods);

            // Try to get class name
            try {
                const className = Java.vm.tryGetEnv().getClassName(clazz);
                log("    Class Name:", className);
            } catch (e) {
                log("    Class Name: <cannot retrieve>");
            }

            // Parse method table
            for (let i = 0; i < nMethods; i++) {
                const methodPtr = methods.add(i * Process.pointerSize * 3);

                const namePtr = methodPtr.readPointer();
                const sigPtr = methodPtr.add(Process.pointerSize).readPointer();
                const fnPtr = methodPtr.add(Process.pointerSize * 2).readPointer();

                const name = readCStringSafe(namePtr);
                const sig = readCStringSafe(sigPtr);

                log("    Method[" + i + "]:");
                log("        Name:", name);
                log("        Signature:", sig);
                log("        Address:", formatPtr(fnPtr));
            }
        },
        onLeave: function(retval) {
            log("[+] RegisterNatives returned:", retval);
            if (retval.toInt32() !== 0) {
                log("    ERROR: Failed to register natives");
            }
        }
    });
}

// ============================================
// NATIVE FUNCTION HOOK BY OFFSET
// ============================================

/**
 * Hook native function by offset from module base
 * Useful when function is not exported
 *
 * @param {string} libName - Library name (e.g., "libapp.so")
 * @param {number} offset - Offset from module base
 * @param {function} callbacks - onEnter/onLeave callbacks
 */
function hookByOffset(libName, offset, callbacks) {
    const module = Process.findModuleByName(libName);
    if (!module) {
        log("[-] Module not found:", libName);
        return null;
    }

    const address = module.base.add(offset);
    log("[+] Hooking by offset:", libName, "+", "0x" + offset.toString(16), "=", address);

    Interceptor.attach(address, {
        onEnter: callbacks.onEnter || function(args) {
            log("[+] Function at", address, "called");
            log("    Args:", Array.prototype.slice.call(args).map(formatPtr).join(", "));
        },
        onLeave: callbacks.onLeave || function(retval) {
            log("[+] Function at", address, "returned:", formatPtr(retval));
        }
    });

    return address;
}

// ============================================
// NATIVE FUNCTIONS HOOK PATTERN
// ============================================

/**
 * Generic native function hook
 *
 * @param {string} libName - Library name or null for any
 * @param {string} funcName - Function name
 * @param {object} callbacks - onEnter/onLeave callbacks
 */
function hookNativeFunction(libName, funcName, callbacks) {
    var funcAddr = Module.findExportByName(libName, funcName);
    if (!funcAddr) {
        log("[-] Function not found:", libName, funcName);
        return false;
    }

    log("[+] Hooking:", libName || "<global>", funcName, "at", funcAddr);

    Interceptor.attach(funcAddr, {
        onEnter: callbacks.onEnter || function(args) {
            log("[+] " + funcName + " called");
        },
        onLeave: callbacks.onLeave || function(retval) {
            log("[+] " + funcName + " returned:", formatPtr(retval));
        }
    });

    return true;
}

// ============================================
// JAVA DECLARED NATIVE METHODS HOOK
// ============================================

/**
 * Hook all native methods declared in Java classes
 */
function hookJavaDeclaredNativeMethods() {
    if (!Java.available) {
        log("[-] Java not available");
        return;
    }

    log("[*] Enumerating Java native methods...");

    Java.perform(function() {
        Java.enumerateLoadedClasses({
            onMatch: function(className) {
                try {
                    const clazz = Java.use(className);
                    const methods = clazz.class.getDeclaredMethods();
                    const Modifier = Java.use("java.lang.reflect.Modifier");

                    methods.forEach(function(method) {
                        const modifiers = method.getModifiers();
                        if (Modifier.isNative(modifiers)) {
                            const methodName = method.getName();
                            log("[+] Native method found:", className + "." + methodName);
                        }
                    });
                } catch (e) {
                    // Ignore classes that cannot be loaded
                }
            },
            onComplete: function() {
                log("[*] Enumeration complete");
            }
        });
    });
}

/**
 * Hook specific Java native method
 *
 * @param {string} className - Fully qualified class name
 * @param {string} methodName - Method name
 * @param {function} callbacks - onEnter/onLeave callbacks
 */
function hookJavaNativeMethod(className, methodName, callbacks) {
    if (!Java.available) {
        log("[-] Java not available");
        return;
    }

    Java.perform(function() {
        try {
            const clazz = Java.use(className);
            const overload = clazz[methodName].overloads[0];

            log("[+] Hooking Java native method:", className + "." + methodName);

            overload.implementation = function() {
                if (callbacks.onEnter) {
                    callbacks.onEnter(this, arguments);
                }

                const retval = this[methodName].apply(this, arguments);

                if (callbacks.onLeave) {
                    callbacks.onLeave(this, retval);
                }

                return retval;
            };
        } catch (e) {
            log("[-] Failed to hook:", className + "." + methodName, "-", e.message);
        }
    });
}

// ============================================
// ANTI-DEBUG BYPASS
// ============================================

/**
 * Bypass ptrace anti-debug detection
 */
function bypassPtrace() {
    const ptrace = Module.findExportByName(null, "ptrace");
    if (!ptrace) {
        log("[-] ptrace not found");
        return;
    }

    log("[+] Hooking ptrace for anti-debug bypass");

    Interceptor.attach(ptrace, {
        onEnter: function(args) {
            const request = args[0].toInt32();

            // PTRACE_TRACEME = 0
            if (request === 0) {
                log("[+] ptrace(PTRACE_TRACEME) detected - bypassing");
                this.bypass = true;
            }
        },
        onLeave: function(retval) {
            if (this.bypass) {
                retval.replace(ptr(0));
                log("[+] ptrace bypassed");
            }
        }
    });
}

/**
 * Bypass Debug.isDebuggerConnected() and related methods
 */
function bypassJavaDebugChecks() {
    if (!Java.available) {
        return;
    }

    log("[+] Hooking Java debug checks");

    Java.perform(function() {
        try {
            const Debug = Java.use("android.os.Debug");

            Debug.isDebuggerConnected.implementation = function() {
                log("[+] isDebuggerConnected() called - returning false");
                return false;
            };

            Debug.waitingForDebugger.implementation = function() {
                log("[+] waitingForDebugger() called - returning false");
                return false;
            };

            log("[+] Java debug checks bypassed");
        } catch (e) {
            log("[-] Failed to bypass Java debug checks:", e.message);
        }
    });
}

/**
 * Bypass status file checks (/proc/self/status, /proc/self/task/* /status)
 */
function bypassStatusChecks() {
    const fopen = Module.findExportByName(null, "fopen");
    if (!fopen) {
        return;
    }

    log("[+] Hooking fopen for status check bypass");

    Interceptor.attach(fopen, {
        onEnter: function(args) {
            const filename = readCStringSafe(args[0]);

            if (filename.indexOf("TracerPid") !== -1 ||
                filename.indexOf("status") !== -1) {
                log("[+] Status file access detected:", filename);
                this.isStatus = true;
                this.filename = filename;
            }
        },
        onLeave: function(retval) {
            if (this.isStatus && !retval.isNull()) {
                log("[+] Intercepting status file:", this.filename);

                // Return a fake file handle
                retval.replace(ptr(0));
            }
        }
    });
}

// ============================================
// COMMON NATIVE FUNCTIONS HOOK
// ============================================

/**
 * Hook common native functions for file I/O monitoring
 */
function hookFileIO() {
    log("[*] Hooking file I/O functions...");

    // Hook open
    hookNativeFunction(null, "open", {
        onEnter: function(args) {
            const filename = readCStringSafe(args[0]);
            const flags = args[1].toInt32();
            log("[+] open(\"" + filename + "\", 0x" + flags.toString(16) + ")");
            this.filename = filename;
        },
        onLeave: function(retval) {
            log("[+] open returned:", retval.toInt32(), "for", this.filename);
        }
    });

    // Hook fopen
    hookNativeFunction(null, "fopen", {
        onEnter: function(args) {
            const filename = readCStringSafe(args[0]);
            const mode = readCStringSafe(args[1]);
            log("[+] fopen(\"" + filename + "\", \"" + mode + "\")");
            this.filename = filename;
        },
        onLeave: function(retval) {
            log("[+] fopen returned:", formatPtr(retval), "for", this.filename);
        }
    });

    // Hook read
    hookNativeFunction(null, "read", {
        onEnter: function(args) {
            const fd = args[0].toInt32();
            const buf = args[1];
            const count = args[2].toInt32();
            log("[+] read(fd=" + fd + ", buf=" + formatPtr(buf) + ", count=" + count + ")");
        },
        onLeave: function(retval) {
            log("[+] read returned:", retval.toInt32());
        }
    });

    // Hook write
    hookNativeFunction(null, "write", {
        onEnter: function(args) {
            const fd = args[0].toInt32();
            const buf = args[1];
            const count = args[2].toInt32();
            log("[+] write(fd=" + fd + ", buf=" + formatPtr(buf) + ", count=" + count + ")");

            // Log first 100 bytes of data
            if (count > 0) {
                const data = buf.readByteArray(Math.min(count, 100));
                log("    Data:", data);
            }
        },
        onLeave: function(retval) {
            log("[+] write returned:", retval.toInt32());
        }
    });
}

/**
 * Hook environment variable functions
 */
function hookEnvFunctions() {
    log("[*] Hooking environment functions...");

    hookNativeFunction(null, "getenv", {
        onEnter: function(args) {
            const name = readCStringSafe(args[0]);
            log("[+] getenv(\"" + name + "\")");
            this.name = name;
        },
        onLeave: function(retval) {
            const value = retval.isNull() ? "NULL" : readCStringSafe(retval);
            log("[+] getenv returned:", value);
        }
    });

    hookNativeFunction(null, "setenv", {
        onEnter: function(args) {
            const name = readCStringSafe(args[0]);
            const value = readCStringSafe(args[1]);
            const overwrite = args[2].toInt32();
            log("[+] setenv(\"" + name + "\", \"" + value + "\", " + overwrite + ")");
        },
        onLeave: function(retval) {
            log("[+] setenv returned:", retval.toInt32());
        }
    });
}

/**
 * Hook SSL/TLS functions
 */
function hookSSLFunctions() {
    log("[*] Hooking SSL/TLS functions...");

    // Hook SSL_write
    hookNativeFunction("libssl.so", "SSL_write", {
        onEnter: function(args) {
            log("[+] SSL_write called");
        },
        onLeave: function(retval) {
            log("[+] SSL_write returned:", retval.toInt32());
        }
    });

    // Hook SSL_read
    hookNativeFunction("libssl.so", "SSL_read", {
        onEnter: function(args) {
            log("[+] SSL_read called");
        },
        onLeave: function(retval) {
            log("[+] SSL_read returned:", retval.toInt32());
        }
    });
}

/**
 * Hook crypto functions
 */
function hookCryptoFunctions() {
    log("[*] Hooking crypto functions...");

    // Hook MD5_Init
    hookNativeFunction("libcrypto.so", "MD5_Init", {
        onEnter: function(args) {
            log("[+] MD5_Init called");
        }
    });

    // Hook SHA256_Init
    hookNativeFunction("libcrypto.so", "SHA256_Init", {
        onEnter: function(args) {
            log("[+] SHA256_Init called");
        }
    });

    // NOTE: AES_encrypt and AES_decrypt are OpenSSL 1.0 functions (pre-Android 5).
    // Android 5+ uses BoringSSL which uses EVP_* functions instead.
    // To hook AES encryption on Android 5+, use EVP_EncryptInit_ex, EVP_EncryptUpdate, EVP_EncryptFinal_ex
    // or AES_cbc_encrypt.
    try {
        hookNativeFunction("libcrypto.so", "AES_encrypt", {
            onEnter: function(args) {
                log("[+] AES_encrypt called (OpenSSL 1.0 only, pre-Android 5)");
            }
        });

        hookNativeFunction("libcrypto.so", "AES_decrypt", {
            onEnter: function(args) {
                log("[+] AES_decrypt called (OpenSSL 1.0 only, pre-Android 5)");
            }
        });
    } catch (e) {
        log("[-] AES_encrypt/AES_decrypt not found (may be BoringSSL on Android 5+)");
    }
}

// ============================================
// MODULE ENUMERATION
// ============================================

/**
 * Enumerate all loaded modules
 */
function enumerateModules() {
    log("[*] Loaded modules:");

    Process.enumerateModules().forEach(function(module) {
        const base = module.base;
        const size = module.size;
        const name = module.name;

        log("    " + name + ": base=" + base + ", size=" + size);
    });
}

/**
 * Enumerate exports of a module
 *
 * @param {string} libName - Library name
 */
function enumerateExports(libName) {
    const module = Process.findModuleByName(libName);
    if (!module) {
        log("[-] Module not found:", libName);
        return;
    }

    log("[*] Exports in", libName + ":");

    module.enumerateExports().forEach(function(exp) {
        log("    " + exp.name + ": " + exp.address);
    });
}

// ============================================
// MAIN EXECUTION
// ============================================

/**
 * Main function to run all hooks
 */
function main() {
    log("========================================");
    log("Native Hook Script Starting");
    log("========================================");

    // Enumerate modules
    enumerateModules();

    // Hook JNI functions
    hookJNILoad();
    hookRegisterNatives();

    // Hook common native functions
    hookFileIO();
    hookEnvFunctions();

    // Try to hook SSL/crypto if available
    try {
        hookSSLFunctions();
        hookCryptoFunctions();
    } catch (e) {
        log("[-] SSL/Crypto hooks failed (libraries may not be loaded)");
    }

    // Bypass anti-debug
    bypassPtrace();
    bypassJavaDebugChecks();
    bypassStatusChecks();

    // Hook Java native methods (if Java available)
    if (Java.available) {
        hookJavaDeclaredNativeMethods();
    }

    log("========================================");
    log("Native Hook Script Loaded Successfully");
    log("========================================");
}

// ============================================
// AUTO-RUN
// ============================================

// Wait for the process to be fully loaded
setTimeout(function() {
    main();
}, 1000);

// Export functions for use in Frida REPL
rpc.exports = {
    hookNativeFunction: hookNativeFunction,
    hookByOffset: hookByOffset,
    hookJavaNativeMethod: hookJavaNativeMethod,
    enumerateModules: enumerateModules,
    enumerateExports: enumerateExports,
    main: main
};
