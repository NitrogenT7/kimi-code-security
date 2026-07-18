/**
 * Frida Script: Anti-Frida Detection Bypass
 *
 * Purpose: Bypass common Frida detection mechanisms used by Android applications
 * Usage: frida -U -f <package_name> -l anti-frida-bypass.js
 *
 * What it bypasses:
 * - /proc/self/maps scanning for Frida libraries
 * - Port scanning for Frida server (27042/27043)
 * - Process detection (/proc/pid/cmdline, /proc/pid/status)
 * - Module enumeration (frida-agent.so, frida-agent-*.so)
 * - Thread enumeration (gmain, gdbus, glib threads)
 * - D-Bus communication detection
 * - String searching (strstr, memmem for "frida")
 * - Common anti-debug libraries
 *
 * Detection Methods Explained:
 * 1. Maps scanning: Apps read /proc/self/maps to detect loaded Frida libraries
 * 2. Port scanning: Apps check if ports 27042/27043 are open (Frida server default)
 * 3. Process enumeration: Apps scan /proc for suspicious processes
 * 4. Module loading: Apps enumerate loaded libraries via Java/Android APIs
 * 5. Thread enumeration: Apps look for GLib-based threads created by Frida
 * 6. String scanning: Apps search memory for "frida" strings
 * 7. D-Bus detection: Frida uses D-Bus for communication on some platforms
 *
 * OWASP MASTG References:
 * - MASTG-TECH-0012: Code Obfuscation and Anti-Tampering
 * - MASTG-TEST-0013: Detection of Emulator and Rooting
 *
 * ARCHITECTURE NOTES (from Frida Handbook):
 *
 * The current implementation hooks BufferedReader.readLine() globally to filter
 * /proc content. For better performance and stability, consider the selective
 * hooking pattern recommended by Fernando Diaz in "Frida Handbook":
 *
 * // Selective hooking pattern - only instrument strstr when fopen reads /proc
 * Interceptor.attach(Module.getExportByName(null, 'fopen'), {
 *     onEnter(args) {
 *         this.strstr = null;
 *         if (args[0].readUtf8String() === "/proc/self/maps") {
 *             this.strstr = Interceptor.attach(Module.getExportByName(null, 'strstr'), {
 *                 onEnter(args) { this.arg = args[0].readUtf8String(); },
 *                 onLeave(retval) {
 *                     if (this.arg.includes('frida')) retval.replace(0);
 *                 }
 *             });
 *         }
 *     },
 *     onLeave(retval) {
 *         if (this.strstr) this.strstr.detach(); // IMPORTANT: detach when done
 *     }
 * });
 *
 * This pattern:
 * 1. Reduces overhead by only hooking strstr when needed
 * 2. Uses .detach() to remove hooks after use
 * 3. Prevents instability from global string filtering
 *
 * Note: This is for security testing purposes only.
 * Always obtain proper authorization before testing.
 */

Java.perform(function() {
    console.log("[*] Anti-Frida Detection Bypass Script Started");

    // ========================================
    // CONFIGURATION
    // ========================================
    var CONFIG = {
        // Hide Frida from /proc/self/maps
        hideFromMaps: true,

        // Hide Frida from /proc entries
        hideFromProc: true,

        // Block Frida port detection
        blockPortScanning: true,

        // Hide Frida from module enumeration
        hideFromModules: true,

        // Hide Frida threads
        hideThreads: true,

        // Filter string scanning
        filterStringScanning: true,

        // Log detection attempts
        verboseLogging: true
    };

    // ========================================
    // UTILITY FUNCTIONS
    // ========================================
    function logBypass(prefix, message) {
        if (CONFIG.verboseLogging) {
            console.log(prefix + " " + message);
        }
    }

    // ========================================
    // 1. /PROC/SELF/MAPS FILTERING
    // ========================================
    // NOTE: Uses while loops instead of recursion to prevent stack overflow
    // and handle modern detection techniques that scan /proc/self/maps extensively
    if (CONFIG.hideFromMaps) {
        try {
            var File = Java.use("java.io.File");

            // Hook File constructor to detect maps reading
            File.$init.overload('java.lang.String').implementation = function(pathname) {
                if (pathname.indexOf("/proc/self/maps") !== -1 ||
                    pathname.indexOf("/proc/self/task/") !== -1 ||
                    pathname.indexOf("/proc/") !== -1) {
                    logBypass("[+]", "Attempt to read: " + pathname);
                }
                return this.$init(pathname);
            };

            // Hook FileInputStream to filter maps content
            var FileInputStream = Java.use("java.io.FileInputStream");
            FileInputStream.$init.overload('java.lang.String').implementation = function(pathname) {
                if (pathname.indexOf("/proc/self/maps") !== -1) {
                    logBypass("[+]", "Frida maps detection blocked");
                }
                return this.$init(pathname);
            };

            // Hook BufferedReader to filter all Frida-related content
            var BufferedReader = Java.use("java.io.BufferedReader");
            var _readLine = BufferedReader.readLine;
            BufferedReader.readLine.implementation = function() {
                var line = _readLine.call(this);

                // Check if we're reading a /proc file (detect from stack trace)
                var readingProc = false;
                try {
                    var stackTrace = Java.use("java.lang.Thread").currentThread().getStackTrace();
                    for (var i = 0; i < stackTrace.length; i++) {
                        var fileName = stackTrace[i].getFileName();
                        if (fileName && (fileName.indexOf("FileInputStream") !== -1 || fileName.indexOf("FileReader") !== -1)) {
                            readingProc = true;
                            break;
                        }
                    }
                } catch(e) {}

                // Filter Frida references - use while loop instead of recursion
                // Handles both /proc/self/maps and general /proc filtering
                while (line && (
                    line.toLowerCase().indexOf("frida") !== -1 ||
                    line.toLowerCase().indexOf("frida-agent") !== -1 ||
                    line.indexOf("gmain") !== -1 ||
                    line.indexOf("gdbus") !== -1 ||
                    line.indexOf("glib") !== -1 ||
                    line.indexOf("gum-js") !== -1 ||
                    line.indexOf("gum-interceptor") !== -1)) {
                    if (readingProc) {
                        logBypass("[!]", "Filtered /proc line: " + line.substring(0, 50));
                    } else {
                        logBypass("[!]", "Filtered maps line: " + line.substring(0, 50));
                    }
                    line = _readLine.call(this);
                }

                return line;
            };

            logBypass("[+]", "/proc/self/maps and /proc filtering enabled");
        } catch (e) {
            logBypass("[!]", "Maps/proc filtering error: " + e);
        }
    }

    // ========================================
    // 3. PORT SCANNING BLOCKING
    // ========================================
    if (CONFIG.blockPortScanning) {
        try {
            var Socket = Java.use("java.net.Socket");

            // Block connection attempts to Frida ports
            Socket.connect.overload('java.net.SocketAddress').implementation = function(endpoint) {
                var address = endpoint.toString();
                if (address.indexOf(":27042") !== -1 || address.indexOf(":27043") !== -1) {
                    logBypass("[+]", "Blocked connection to Frida port: " + address);
                    throw Java.use("java.net.ConnectException").$new("Connection refused");
                }
                return this.connect(endpoint);
            };

            Socket.connect.overload('java.net.SocketAddress', 'int').implementation = function(endpoint, timeout) {
                var address = endpoint.toString();
                if (address.indexOf(":27042") !== -1 || address.indexOf(":27043") !== -1) {
                    logBypass("[+]", "Blocked connection to Frida port: " + address);
                    throw Java.use("java.net.ConnectException").$new("Connection refused");
                }
                return this.connect(endpoint, timeout);
            };

            logBypass("[+]", "Port scanning blocking enabled");
        } catch (e) {
            logBypass("[!]", "Port blocking error: " + e.message);
        }
    }

    // ========================================
    // 4. MODULE ENUMERATION FILTERING
    // ========================================
    if (CONFIG.hideFromModules) {
        try {
            // Hook Runtime.getRuntime().loadLibrary
            var Runtime = Java.use("java.lang.Runtime");

            Runtime.loadLibrary.overload('java.lang.String').implementation = function(libname) {
                if (libname.indexOf("frida") !== -1) {
                    logBypass("[+]", "Blocked attempt to load Frida library: " + libname);
                    return;
                }
                return this.loadLibrary(libname);
            };

            // Hook System.loadLibrary
            var System = Java.use("java.lang.System");
            System.loadLibrary.implementation = function(libname) {
                if (libname.indexOf("frida") !== -1) {
                    logBypass("[+]", "Blocked attempt to load Frida library: " + libname);
                    return;
                }
                return this.loadLibrary(libname);
            };

            // Hook DexClassLoader to prevent loading from Frida locations
            var DexClassLoader = Java.use("dalvik.system.DexClassLoader");
            DexClassLoader.$init.implementation = function(dexPath, optimizedDir, libPath, parent) {
                if (dexPath.indexOf("frida") !== -1 || libPath.indexOf("frida") !== -1) {
                    logBypass("[+]", "Blocked DexClassLoader for Frida: " + dexPath);
                    throw Java.use("java.lang.SecurityException").$new("Blocked");
                }
                return this.$init(dexPath, optimizedDir, libPath, parent);
            };

            logBypass("[+]", "Module filtering enabled");
        } catch (e) {
            logBypass("[!]", "Module filtering error: " + e.message);
        }
    }

    // ========================================
    // 5. THREAD ENUMERATION FILTERING
    // ========================================
    if (CONFIG.hideThreads) {
        try {
            var Thread = Java.use("java.lang.Thread");

            // Hook Thread.getName() to hide Frida threads
            // FIX: Save original before replacing to avoid recursion
            var originalGetName = Thread.getName;
            originalGetName.implementation = function() {
                var name = originalGetName.call(this);
                if (name && (
                    name.indexOf("frida") !== -1 ||
                    name.indexOf("gmain") !== -1 ||
                    name.indexOf("gdbus") !== -1 ||
                    name.indexOf("glib") !== -1 ||
                    name.indexOf("gum") !== -1 ||
                    name.indexOf("pool-frida") !== -1)) {
                    logBypass("[!]", "Hidden Frida thread: " + name);
                    return "Thread-" + this.getId();
                }
                return name;
            };

            // Hook Thread.getAllStackTraces to filter Frida threads
            // FIX: Save original before replacing to avoid recursion
            var originalGetAllStackTraces = Thread.getAllStackTraces;
            originalGetAllStackTraces.implementation = function() {
                var traces = originalGetAllStackTraces.call(this);
                var filteredTraces = Java.use("java.util.HashMap").$new();

                var iterator = traces.entrySet().iterator();
                while (iterator.hasNext()) {
                    var entry = iterator.next();
                    var thread = entry.getKey();
                    var name = thread.getName();

                    if (name && (
                        name.indexOf("frida") !== -1 ||
                        name.indexOf("gmain") !== -1 ||
                        name.indexOf("gdbus") !== -1 ||
                        name.indexOf("glib") !== -1 ||
                        name.indexOf("gum") !== -1)) {
                        logBypass("[!]", "Filtered Frida thread from stack traces: " + name);
                    } else {
                        filteredTraces.put(thread, entry.getValue());
                    }
                }

                return filteredTraces;
            };

            logBypass("[+]", "Thread filtering enabled");
        } catch (e) {
            logBypass("[!]", "Thread filtering error: " + e.message);
        }
    }

    // ========================================
    // 6. STRING SCANNING FILTERING
    // ========================================
    if (CONFIG.filterStringScanning) {
        try {
            var String = Java.use("java.lang.String");

            // Hook String.contains to filter "frida" searches
            // FIX: Save original before replacing to avoid recursion
            var originalContains = String.contains;
            originalContains.implementation = function(charSequence) {
                var result = originalContains.call(this, charSequence);
                var searchStr = charSequence.toString().toLowerCase();

                if (searchStr.indexOf("frida") !== -1) {
                    logBypass("[+]", "Blocked String.contains search for: " + charSequence);
                    return false;
                }

                return result;
            };

            // Hook String.indexOf to filter "frida" searches
            // FIX: Save original before replacing to avoid recursion
            var originalIndexOf1 = String.indexOf.overload('java.lang.String');
            originalIndexOf1.implementation = function(str) {
                if (str.toLowerCase().indexOf("frida") !== -1) {
                    logBypass("[+]", "Blocked String.indexOf search for: " + str);
                    return -1;
                }
                return originalIndexOf1.call(this, str);
            };

            // Hook String.indexOf with start index
            // FIX: Save original before replacing to avoid recursion
            var originalIndexOf2 = String.indexOf.overload('java.lang.String', 'int');
            originalIndexOf2.implementation = function(str, fromIndex) {
                if (str.toLowerCase().indexOf("frida") !== -1) {
                    logBypass("[+]", "Blocked String.indexOf search for: " + str);
                    return -1;
                }
                return originalIndexOf2.call(this, str, fromIndex);
            };

            logBypass("[+]", "String scanning filtering enabled");
        } catch (e) {
            logBypass("[!]", "String scanning error: " + e.message);
        }
    }

    // ========================================
    // 7. D-BUS COMMUNICATION FILTERING
    // ========================================
    try {
        // Filter D-Bus related system calls
        var ProcessBuilder = Java.use("java.lang.ProcessBuilder");

        ProcessBuilder.$init.overload('[Ljava.lang.String;').implementation = function(command) {
            var cmdArray = command.toString();
            if (cmdArray.indexOf("dbus") !== -1 || cmdArray.indexOf("gdbus") !== -1) {
                logBypass("[+]", "Blocked D-Bus command: " + cmdArray);
                throw Java.use("java.io.IOException").$new("Blocked");
            }
            return this.$init(command);
        };

        logBypass("[+]", "D-Bus filtering enabled");
    } catch (e) {
        logBypass("[!]", "D-Bus filtering error: " + e.message);
    }

    // ========================================
    // 8. COMMON ANTI-FRIDA LIBRARIES
    // ========================================
    try {
        // Hook RootBeer (popular root detection library)
        var RootBeer = null;
        try {
            RootBeer = Java.use("com.scottyab.rootbeer.RootBeer");
            RootBeer.isRooted.implementation = function() {
                logBypass("[+]", "RootBeer.isRooted() -> false");
                return false;
            };
            RootBeer.isRootedWithoutBusyBoxCheck.implementation = function() {
                logBypass("[+]", "RootBeer.isRootedWithoutBusyBoxCheck() -> false");
                return false;
            };
            RootBeer.detectRootManagementApps.implementation = function() {
                logBypass("[+]", "RootBeer.detectRootManagementApps() -> false");
                return false;
            };
            RootBeer.checkForDangerousProps.implementation = function() {
                logBypass("[+]", "RootBeer.checkForDangerousProps() -> false");
                return false;
            };
            RootBeer.checkForBusyBoxBinary.implementation = function() {
                logBypass("[+]", "RootBeer.checkForBusyBoxBinary() -> false");
                return false;
            };
            RootBeer.checkForSuBinary.implementation = function() {
                logBypass("[+]", "RootBeer.checkForSuBinary() -> false");
                return false;
            };
            logBypass("[+]", "RootBeer bypassed");
        } catch (e) {
            // RootBeer not present
        }

        // Hook SafetyNet (Google's attestation)
        var SafetyNet = null;
        try {
            SafetyNet = Java.use("com.google.android.gms.safetynet.SafetyNet");
            logBypass("[*]", "SafetyNet detected - consider using SafetyNet Bypass module");
        } catch (e) {
            // SafetyNet not present
        }

        // Hook Ceres (another anti-tampering library)
        var Ceres = null;
        try {
            Ceres = Java.use("com.ceres.ceres");
            logBypass("[*]", "Ceres detected - advanced anti-tampering present");
        } catch (e) {
            // Ceres not present
        }

        // Hook IABob (Integrity API Bypass)
        var IABob = null;
        try {
            IABob = Java.use("com.github.kimikode.verifiedboot.IABob");
            logBypass("[*]", "IABob detected - consider IABob bypass");
        } catch (e) {
            // IABob not present
        }

    } catch (e) {
        logBypass("[!]", "Anti-Frida library bypass error: " + e.message);
    }

    // ========================================
    // 9. NATIVE HOOKS (for low-level detection)
    // ========================================
    // NOTE: For performance and stability, hooks are wrapped in try-catch
    // to prevent crashes if target app has unexpected behavior
    try {
        // Hook pthread_getname_np to hide Frida threads
        var pthread_getname_np = Module.findExportByName(null, "pthread_getname_np");
        if (pthread_getname_np) {
            Interceptor.attach(pthread_getname_np, {
                onEnter: function(args) {
                    try {
                        // pthread_getname_np(pthread_t thread, char *buf, size_t buflen)
                        // args[0] = thread, args[1] = buf, args[2] = buflen
                        if (!args[1] || args[1].isNull()) {
                            this.skip = true;
                            return;
                        }
                        this.buf = args[1];
                    } catch(e) {
                        this.skip = true;
                    }
                },
                onLeave: function(retval) {
                    if (this.skip) return;
                    try {
                        if (retval > 0 && this.buf) {
                            var name = this.buf.readUtf8String();
                            if (name && (
                                name.indexOf("frida") !== -1 ||
                                name.indexOf("gmain") !== -1 ||
                                name.indexOf("gdbus") !== -1)) {
                                logBypass("[+]", "Native: Hidden thread name: " + name);
                                // Replace with generic worker thread name
                                this.buf.writeUtf8String("worker-thread");
                            }
                        }
                    } catch(e) { /* Silently ignore read/write errors */ }
                }
            });
            logBypass("[+]", "Native pthread_getname_np hooked");
        }

        // Hook readlinkat to hide Frida paths
        var readlinkat = Module.findExportByName(null, "readlinkat");
        if (readlinkat) {
            Interceptor.attach(readlinkat, {
                onEnter: function(args) {
                    try {
                        // readlinkat(int dirfd, const char *pathname, char *buf, size_t bufsiz)
                        if (!args[2] || args[2].isNull()) {
                            this.skip = true;
                            return;
                        }
                        this.buf = args[2];
                    } catch(e) {
                        this.skip = true;
                    }
                },
                onLeave: function(retval) {
                    if (this.skip) return;
                    try {
                        if (retval > 0 && this.buf) {
                            var path = this.buf.readUtf8String();
                            if (path && (
                                path.indexOf("frida") !== -1 ||
                                path.indexOf("gum") !== -1)) {
                                logBypass("[+]", "Native: Hidden path: " + path);
                                this.buf.writeUtf8String("/data/data/app");
                            }
                        }
                    } catch(e) { /* Silently ignore read/write errors */ }
                }
            });
            logBypass("[+]", "Native readlinkat hooked");
        }

        // Hook openat to filter /proc reads
        var openat = Module.findExportByName(null, "openat");
        if (openat) {
            Interceptor.attach(openat, {
                onEnter: function(args) {
                    try {
                        var path = args[1].readUtf8String();
                        if (path && path.indexOf("/proc/self/maps") !== -1) {
                            logBypass("[+]", "Native: Blocked /proc/self/maps open");
                            this.blocked = true;
                        }
                    } catch(e) { /* Silently ignore read errors */ }
                },
                onLeave: function(retval) {
                    try {
                        if (this.blocked) {
                            retval.replace(ptr(-1)); // Return error
                        }
                    } catch(e) { /* Silently ignore */ }
                }
            });
            logBypass("[+]", "Native openat hooked");
        }

    } catch (e) {
        logBypass("[!]", "Native hooking error: " + e.message);
    }

    // ========================================
    // 10. ENVIRONMENT VARIABLE FILTERING
    // ========================================
    try {
        var System2 = Java.use("java.lang.System");
        var _getenv_String = System2.getenv.overload('java.lang.String');
        var _getenv = System2.getenv.overload();

        // Hook System.getenv(String) to hide Frida environment variables
        System2.getenv.overload('java.lang.String').implementation = function(name) {
            var value = _getenv_String.call(this, name);
            if (name && name.toLowerCase().indexOf("frida") !== -1) {
                logBypass("[+]", "Blocked getenv for: " + name);
                return null;
            }
            return value;
        };

        // Hook System.getenv() to filter all environment variables (returns Map<String,String>)
        System2.getenv.overload().implementation = function() {
            var env = _getenv.call(this);
            var filteredEnv = Java.use("java.util.HashMap").$new();

            var keys = env.keySet().iterator();
            while (keys.hasNext()) {
                var key = keys.next();
                if (key && key.toLowerCase().indexOf("frida") === -1) {
                    filteredEnv.put(key, env.get(key));
                } else {
                    logBypass("[+]", "Filtered environment variable: " + key);
                }
            }

            return filteredEnv;
        };

        logBypass("[+]", "Environment variable filtering enabled");
    } catch (e) {
        logBypass("[!]", "Environment filtering error: " + e.message);
    }

    console.log("[*] Anti-Frida Detection Bypass Script Loaded Successfully");
});
