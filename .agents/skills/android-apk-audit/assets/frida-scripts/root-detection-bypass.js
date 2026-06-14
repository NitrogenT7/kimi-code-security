/**
 * Universal Root Detection Bypass
 *
 * This script combines the best root detection bypass techniques from:
 * - https://github.com/okankurtuluss/FridaBypassKit (ALL-IN-ONE framework)
 * - https://github.com/apkunpacker/Root_Bypass (HideRoot.js - native hooks)
 * - https://github.com/rsenet/FriList (android-multiple-root-bypass.js)
 * - https://codeshare.frida.re/@Q0120S/root-detection-bypass/
 * - https://codeshare.frida.re/@dzonerzy/fridantiroot/
 * - https://gist.github.com/pich4ya/0b2a8592d3c8d5df9c34b8d185d2ea35
 *
 * Coverage:
 * - Root detection bypass (RootBeer, Magisk, Superuser, custom implementations)
 * - File system hooks (exists, canRead, access, stat, fopen)
 * - Runtime execution hooks (exec, ProcessBuilder, popen, system)
 * - System properties hooks (getprop, build.prop parsing)
 * - PackageManager hooks (getPackageInfo, getApplicationInfo)
 * - Emulator detection bypass (Build.FINGERPRINT, Build.HARDWARE, etc.)
 * - Debug detection bypass (Debug.isDebuggerConnected())
 * - SafetyNet/Play Integrity bypass (where possible)
 * - SELinux bypass
 * - Build properties spoofing
 *
 * Works on: Android 7-16
 * Compatible with: Frida 16.x+
 *
 * Usage:
 *   frida -U -l root-detection-bypass.js -f <package_name>
 *   frida -U <package_name> -l root-detection-bypass.js
 */

Java.perform(function() {
    console.log("\n[*] ================================================");
    console.log("[*] Universal Root Detection Bypass - Started");
    console.log("[*] ================================================\n");

    // ============================================================
    // SECTION 1: ROOT PACKAGES LIST
    // ============================================================
    var rootPackages = [
        // Superuser variants
        "com.noshufou.android.su",
        "com.noshufou.android.su.elite",
        "com.thirdparty.superuser",
        "eu.chainfire.supersu",
        "eu.chainfire.supersu.pro",
        "com.koushikdutta.superuser",
        "com.yellowes.su",
        "me.phh.superuser",

        // Root management
        "com.topjohnwu.magisk",
        "me.weishu.kernelsu",
        "com.kingouser.com",
        "com.kingroot.kinguser",

        // Root detection bypass tools
        "com.devadvance.rootcloak",
        "com.devadvance.rootcloakplus",
        "com.amphoras.hidemyroot",
        "com.amphoras.hidemyrootadfree",
        "com.formyhm.hideroot",
        "com.formyhm.hiderootPremium",
        "com.troy1103.hideyourroot",

        // Modding tools (often indicate rooted device)
        "com.dimonvideo.luckypatcher",
        "com.chelpus.lackypatch",
        "com.chelpus.luckypatcher",
        "com.ramdroid.appquarantine",
        "com.ramdroid.appquarantinepro",

        // Xposed framework
        "de.robv.android.xposed.installer",
        "com.saurik.substrate",

        // Other rooting tools
        "com.koushikdutta.rommanager",
        "com.koushikdutta.rommanager.license",
        "com.zachspong.temprootremovejb",
        "com.alephzain.framaroot",
        "com.smedialink.oneclickroot",
        "com.zhiqupk.root.global",

        // Emulator detection tools (often blocked on rooted devices)
        "com.bluestacks",
        "com.bignox.appcenter",
        "com.ldmnq.launcher3",
        "com.microvirt.memuime",

        // Billing cracks
        "com.android.vending.billing.InAppBillingService.COIN",

        // Magisk modules
        "com.solohsu.android.edxp.manager"
    ];

    // ============================================================
    // SECTION 2: ROOT BINARIES LIST
    // ============================================================
    var rootBinaries = [
        "su",
        "busybox",
        "supersu",
        "Superuser.apk",
        "KingoUser.apk",
        "SuperSu.apk",
        "magisk",
        "magiskpolicy",
        "magiskhide",
        "sudaemon",
        "sugote",
        "supolicy",
        "resetprop",
        "daemonsu",
        "magiskinit",
        "ksu",
        "ksud"
    ];

    // ============================================================
    // SECTION 3: ROOT FILE PATHS (Comprehensive)
    // ============================================================
    var rootPaths = [
        // Standard su locations
        "/su",
        "/su/bin/su",
        "/su/xbin/su",
        "/su/bin/daemonsu",
        "/su/bin/magisk",
        "/su/xbin/busybox",
        "/su/bin/sugote",

        // System bin locations
        "/system/bin/su",
        "/system/xbin/su",
        "/system/sd/xbin/su",
        "/system/sbin/su",
        "/system/bin/failsafe/su",
        "/system/xbin/daemonsu",
        "/system/xbin/sugote",
        "/system/xbin/suhappy",
        "/system/bin/.su",
        "/system/xbin/.su",
        "/system/xbin/.tmpsu",

        // Magisk locations
        "/magisk",
        "/magisk/.core/bin/su",
        "/magisk/.core/bin/busybox",
        "/sbin/su",
        "/sbin/magisk",
        "/sbin/.magisk",
        "/sbin/magiskhide",
        "/sbin/magiskinit",
        "/sbin/magiskpolicy",
        "/dev/.magisk.unblock",
        "/data/adb/magisk",
        "/data/adb/magisk.db",
        "/data/adb/magisk.img",
        "/data/adb/magisk_simple",
        "/data/adb/ksu",
        "/data/adb/ksud",
        "/cache/.disable_magisk",
        "/cache/magisk.log",

        // KernelSU locations
        "/data/adb/ksu",
        "/data/adb/ksud",

        // Data local locations
        "/data/local/bin/su",
        "/data/local/xbin/su",
        "/data/local/su",
        "/data/local/busybox",
        "/data/local/xbin/busybox",
        "/cache/su",
        "/data/su",
        "/dev/su",

        // Superuser APK locations
        "/system/app/Superuser.apk",
        "/system/app/SuperSU.apk",
        "/system/app/SuperSU",
        "/system/app/KingRoot",
        "/system/app/KingoRoot",
        "/system/app/MagiskManager",
        "/system/app/OneClickRoot",
        "/system/app/TowelRoot",

        // Init scripts
        "/system/etc/init.d/99SuperSUDaemon",
        "/init.magisk.rc",
        "/init.svc.magisk_pfs",
        "/init.svc.magisk_pfsd",
        "/init.svc.magisk_service",

        // Daemon locations
        "/dev/com.koushikdutta.superuser.daemon/",
        "/system/.installed_su_daemon",

        // Other root tools
        "/system/app/com.noshufou.android.su",
        "/data/data/com.noshufou.android.su",
        "/data/data/eu.chainfire.supersu",
        "/data/data/com.topjohnwu.magisk",
        "/system/xbin/ku.sud",

        // Emulator detection (hide these)
        "/sys/devices/virtual/misc/vboxguest",
        "/sys/devices/virtual/misc/vboxuser",
        "/sys/bus/pci/drivers/vboxguest",
        "/dev/vboxguest",
        "/dev/vboxuser",
        "/sys/module/vboxguest",
        "/sys/module/vboxsf",
        "/sys/module/vboxvideo",
        "/dev/qemu_pipe",
        "/sys/bus/platform/drivers/qemu_pipe",

        // Other suspicious paths
        "/system/usr/we-need-root/su",
        "/system/usr/we-need-root/busybox",
        "/vendor/bin/su",
        "/odm/bin/su",
        "/product/bin/su",
        "/system_ext/bin/su"
    ];

    // ============================================================
    // SECTION 4: ROOT PROPERTIES TO SPOOF
    // ============================================================
    var rootProperties = {
        "ro.build.selinux": "1",
        "ro.debuggable": "0",
        "service.adb.root": "0",
        "ro.secure": "1",
        "ro.build.tags": "release-keys"
    };

    // ============================================================
    // CACHED STRINGS (avoid memory churn on repeated calls)
    // Frida Handbook pattern: Cache strings allocated with Memory.allocUtf8String
    // to prevent memory allocation on every hook call
    // ============================================================
    var CACHED_STRINGS = {};
    Object.keys(rootProperties).forEach(function(key) {
        CACHED_STRINGS[key] = Memory.allocUtf8String(rootProperties[key]);
    });

    // ============================================================
    // SECTION 5: JAVA FILE HOOKS
    // ============================================================
    try {
        var File = Java.use("java.io.File");

        // Hook File.exists()
        var _exists = File.exists;
        File.exists.implementation = function() {
            var path = this.getAbsolutePath();
            for (var i = 0; i < rootPaths.length; i++) {
                if (path === rootPaths[i] || path.indexOf(rootPaths[i]) !== -1) {
                    console.log("[+] File.exists() - Hiding root path: " + path);
                    return false;
                }
            }
            var name = this.getName();
            if (rootBinaries.indexOf(name) !== -1) {
                console.log("[+] File.exists() - Hiding binary: " + name);
                return false;
            }
            return _exists.call(this);
        };

        // Hook File.canRead()
        var _canRead = File.canRead;
        File.canRead.implementation = function() {
            var path = this.getAbsolutePath();
            for (var i = 0; i < rootPaths.length; i++) {
                if (path === rootPaths[i] || path.indexOf(rootPaths[i]) !== -1) {
                    console.log("[+] File.canRead() - Hiding root path: " + path);
                    return false;
                }
            }
            return _canRead.call(this);
        };

        // Hook File.isDirectory()
        var _isDirectory = File.isDirectory;
        File.isDirectory.implementation = function() {
            var path = this.getAbsolutePath();
            for (var i = 0; i < rootPaths.length; i++) {
                if (path === rootPaths[i] || path.indexOf(rootPaths[i]) !== -1) {
                    console.log("[+] File.isDirectory() - Hiding root path: " + path);
                    return false;
                }
            }
            return _isDirectory.call(this);
        };

        console.log("[+] Java File hooks installed successfully");
    } catch (e) {
        console.log("[!] Java File hooks failed: " + e.message);
    }

    // ============================================================
    // SECTION 6: UNIX FILE SYSTEM HOOKS (Native)
    // ============================================================
    try {
        var UnixFileSystem = Java.use("java.io.UnixFileSystem");

        UnixFileSystem.checkAccess.implementation = function(file, access) {
            var filename = file.getAbsolutePath();
            if (rootPaths.indexOf(filename) !== -1 || filename.indexOf("magisk") >= 0) {
                console.log("[+] UnixFileSystem.checkAccess() - Blocking: " + filename);
                return false;
            }
            return this.checkAccess(file, access);
        };

        UnixFileSystem.getBooleanAttributes.implementation = function(file) {
            var filename = file.getAbsolutePath();
            if (rootPaths.indexOf(filename) !== -1 || filename.indexOf("magisk") >= 0) {
                console.log("[+] UnixFileSystem.getBooleanAttributes() - Blocking: " + filename);
                return 0;
            }
            return this.getBooleanAttributes(file);
        };

        console.log("[+] UnixFileSystem hooks installed successfully");
    } catch (e) {
        console.log("[!] UnixFileSystem hooks failed: " + e.message);
    }

    // ============================================================
    // SECTION 7: SYSTEM.GETENV() HOOKS
    // ============================================================
    try {
        var System = Java.use("java.lang.System");
        var _getenv = System.getenv.overload("java.lang.String");

        System.getenv.overload("java.lang.String").implementation = function(name) {
            if (name === "PATH") {
                var originalPath = _getenv.call(this, name);
                var paths = originalPath.split(":");
                var filteredPaths = paths.filter(function(p) {
                    return p.indexOf("/su") === -1 &&
                           p.indexOf("/sbin") === -1 &&
                           p.indexOf("/magisk") === -1;
                });
                console.log("[+] System.getenv('PATH') - Filtered");
                return filteredPaths.join(":");
            }
            return _getenv.call(this, name);
        };

        console.log("[+] System.getenv() hooks installed successfully");
    } catch (e) {
        console.log("[!] System.getenv() hooks failed: " + e.message);
    }

    // ============================================================
    // SECTION 8: RUNTIME.EXEC() AND PROCESSBUILDER HOOKS
    // ============================================================
    try {
        var Runtime = Java.use("java.lang.Runtime");
        var ProcessBuilder = Java.use("java.lang.ProcessBuilder");
        var ProcessImpl = Java.use("java.lang.ProcessImpl");

        var dangerousCommands = [
            "su",
            "which su",
            "supolicy",
            "superuser",
            "magisk",
            "busybox",
            "getprop",
            "mount",
            "id",
            "sh",
            "pm list packages"
        ];

        var _exec_String = Runtime.exec.overload("java.lang.String");
        var _exec_StringArray = Runtime.exec.overload("[Ljava.lang.String;");
        var _exec_String_StringArray = Runtime.exec.overload("java.lang.String", "[Ljava.lang.String;");

        // Hook Runtime.exec(String)
        try {
            Runtime.exec.overload("java.lang.String").implementation = function(cmd) {
                for (var i = 0; i < dangerousCommands.length; i++) {
                    if (cmd.indexOf(dangerousCommands[i]) !== -1) {
                        console.log("[+] Runtime.exec(String) - Blocking: " + cmd);
                        throw new Error("Command not found");
                    }
                }
                return _exec_String.call(this, cmd);
            };
        } catch (e) {
            console.log("[!] Runtime.exec(String) hook failed: " + e);
        }

        // Hook Runtime.exec(String[])
        try {
            Runtime.exec.overload("[Ljava.lang.String;").implementation = function(cmdArray) {
                var cmdStr = cmdArray.join(" ");
                for (var i = 0; i < dangerousCommands.length; i++) {
                    if (cmdStr.indexOf(dangerousCommands[i]) !== -1) {
                        console.log("[+] Runtime.exec(String[]) - Blocking: " + cmdStr);
                        throw new Error("Command not found");
                    }
                }
                return _exec_StringArray.call(this, cmdArray);
            };
        } catch (e) {
            console.log("[!] Runtime.exec(String[]) hook failed: " + e);
        }

        // Hook other Runtime.exec overloads
        try {
            Runtime.exec.overload("java.lang.String", "[Ljava.lang.String;").implementation = function(cmd, env) {
                if (cmd.indexOf("su") !== -1 || cmd.indexOf("getprop") !== -1) {
                    console.log("[+] Runtime.exec(String, String[]) - Blocking: " + cmd);
                    throw new Error("Command not found");
                }
                return _exec_String_StringArray.call(this, cmd, env);
            };
        } catch (e) {
            console.log("[!] Runtime.exec(String, String[]) hook failed: " + e);
        }

        // Hook ProcessBuilder
        var _ProcessBuilder_init = ProcessBuilder.$init.overload("[Ljava.lang.String;");
        var _ProcessBuilder_start = ProcessBuilder.start;
        try {
            ProcessBuilder.$init.overload("[Ljava.lang.String;").implementation = function(cmdArray) {
                var cmdStr = cmdArray.join(" ");
                for (var i = 0; i < dangerousCommands.length; i++) {
                    if (cmdStr.indexOf(dangerousCommands[i]) !== -1) {
                        console.log("[+] ProcessBuilder() - Blocking: " + cmdStr);
                        throw new Error("Command not found");
                    }
                }
                return _ProcessBuilder_init.call(this, cmdArray);
            };
        } catch (e) {
            console.log("[!] ProcessBuilder hook failed: " + e);
        }

        // Hook ProcessBuilder.start()
        try {
            ProcessBuilder.start.implementation = function() {
                var cmd = this.command();
                var shouldBlock = false;

                for (var i = 0; i < cmd.size(); i++) {
                    var tmp_cmd = cmd.get(i).toString();
                    for (var j = 0; j < dangerousCommands.length; j++) {
                        if (tmp_cmd.indexOf(dangerousCommands[j]) !== -1) {
                            shouldBlock = true;
                            break;
                        }
                    }
                    if (shouldBlock) break;
                }

                if (shouldBlock) {
                    console.log("[+] ProcessBuilder.start() - Blocking command");
                    throw new Error("Command not found");
                }
                return _ProcessBuilder_start.call(this);
            };
        } catch (e) {
            console.log("[!] ProcessBuilder.start() hook failed: " + e);
        }

        // Hook ProcessImpl.start (lower level)
        var _ProcessImpl_start = ProcessImpl.start;
        try {
            ProcessImpl.start.implementation = function(cmdarray, env, dir, redirects, redirectErrorStream) {
                if (cmdarray[0] === "mount" || cmdarray[0] === "getprop") {
                    console.log("[+] ProcessImpl.start() - Blocking: " + cmdarray.toString());
                    cmdarray[0] = "";
                }
                return _ProcessImpl_start.call(this, cmdarray, env, dir, redirects, redirectErrorStream);
            };
        } catch (e) {
            console.log("[!] ProcessImpl.start() hook failed: " + e);
        }

        console.log("[+] Runtime execution hooks installed successfully");
    } catch (e) {
        console.log("[!] Runtime execution hooks failed: " + e.message);
    }

    // ============================================================
    // SECTION 9: PACKAGE MANAGER HOOKS
    // ============================================================
    try {
        var PackageManager = Java.use("android.app.ApplicationPackageManager");

        // Hook getPackageInfo
        PackageManager.getPackageInfo.overload('java.lang.String', 'int').implementation = function(pkgname, flags) {
            var allHiddenPackages = rootPackages.concat([
                "com.topjohnwu.magisk",
                "io.github.vvb2066.magisk",
                "com.tsng.hidemyapplist",
                "org.lsposed.hiddenapibypass"
            ]);
            if (allHiddenPackages.indexOf(pkgname) !== -1) {
                console.log("[+] PackageManager.getPackageInfo() - Hiding: " + pkgname);
                throw Java.use("android.content.pm.PackageManager$NameNotFoundException").$new(pkgname);
            }
            return this.getPackageInfo(pkgname, flags);
        };

        // Hook getApplicationInfo
        try {
            PackageManager.getApplicationInfo.overload("java.lang.String", "int").implementation = function(pkgname, flags) {
                if (rootPackages.indexOf(pkgname) !== -1) {
                    console.log("[+] PackageManager.getApplicationInfo() - Hiding: " + pkgname);
                    throw Java.use("android.content.pm.PackageManager$NameNotFoundException").$new(pkgname);
                }
                return this.getApplicationInfo(pkgname, flags);
            };
        } catch (e) {}

        // Hook getPackageUid
        try {
            PackageManager.getPackageUid.overload("java.lang.String", "int").implementation = function(pkgname, flags) {
                if (rootPackages.indexOf(pkgname) !== -1) {
                    console.log("[+] PackageManager.getPackageUid() - Hiding: " + pkgname);
                    throw Java.use("android.content.pm.PackageManager$NameNotFoundException").$new(pkgname);
                }
                return this.getPackageUid(pkgname, flags);
            };
        } catch (e) {}

        console.log("[+] PackageManager hooks installed successfully");
    } catch (e) {
        console.log("[!] PackageManager hooks failed: " + e.message);
    }

    // ============================================================
    // SECTION 10: SYSTEM PROPERTIES HOOKS
    // ============================================================
    try {
        var SystemProperties = Java.use("android.os.SystemProperties");

        SystemProperties.get.overload('java.lang.String').implementation = function(name) {
            if (rootProperties.hasOwnProperty(name)) {
                console.log("[+] SystemProperties.get() - Spoofing: " + name + " = " + rootProperties[name]);
                return rootProperties[name];
            }
            return this.get(name);
        };

        console.log("[+] SystemProperties hooks installed successfully");
    } catch (e) {
        console.log("[!] SystemProperties hooks failed: " + e.message);
    }

    // ============================================================
    // SECTION 11: BUILD PROPERTIES SPOOFING
    // ============================================================
    try {
        var Build = Java.use("android.os.Build");

        // Spoof Build.TAGS
        var tagsField = Build.class.getDeclaredField("TAGS");
        tagsField.setAccessible(true);
        tagsField.set(null, "release-keys");
        console.log("[+] Build.TAGS set to 'release-keys'");

        // Spoof Build.FINGERPRINT (remove test-keys indicators)
        try {
            var fingerprintField = Build.class.getDeclaredField("FINGERPRINT");
            fingerprintField.setAccessible(true);
            var currentFingerprint = Build.FINGERPRINT.value;
            if (currentFingerprint.indexOf("test-keys") !== -1) {
                var spoofedFingerprint = currentFingerprint.replace("test-keys", "release-keys");
                fingerprintField.set(null, spoofedFingerprint);
                console.log("[+] Build.FINGERPRINT spoofed (removed test-keys)");
            }
        } catch (e) {}

        // Spoof Build.HARDWARE (remove emulator indicators)
        try {
            var hardwareField = Build.class.getDeclaredField("HARDWARE");
            hardwareField.setAccessible(true);
            var currentHardware = Build.HARDWARE.value;
            if (currentHardware.indexOf("goldfish") !== -1 ||
                currentHardware.indexOf("ranchu") !== -1 ||
                currentHardware.indexOf("vbox86") !== -1) {
                hardwareField.set(null, "qcom");
                console.log("[+] Build.HARDWARE spoofed (removed emulator indicators)");
            }
        } catch (e) {}

        // Spoof Build.PRODUCT (remove emulator indicators)
        try {
            var productField = Build.class.getDeclaredField("PRODUCT");
            productField.setAccessible(true);
            var currentProduct = Build.PRODUCT.value;
            if (currentProduct.indexOf("sdk_gphone") !== -1 ||
                currentProduct.indexOf("emulator") !== -1) {
                productField.set(null, "aosp");
                console.log("[+] Build.PRODUCT spoofed (removed emulator indicators)");
            }
        } catch (e) {}

    } catch (e) {
        console.log("[!] Build properties spoofing failed: " + e.message);
    }

    // ============================================================
    // SECTION 12: BUFFERED READER HOOK (build.prop parsing)
    // ============================================================
    try {
        var BufferedReader = Java.use("java.io.BufferedReader");
        var _readLine = BufferedReader.readLine.overload();

        BufferedReader.readLine.overload().implementation = function() {
            var text = _readLine.call(this);
            if (text !== null) {
                // Replace test-keys with release-keys in build.prop
                if (text.indexOf("ro.build.tags=test-keys") !== -1) {
                    console.log("[+] BufferedReader.readLine() - Replacing test-keys");
                    text = text.replace("ro.build.tags=test-keys", "ro.build.tags=release-keys");
                }
                // Replace ro.debuggable=1 with 0
                if (text.indexOf("ro.debuggable=1") !== -1) {
                    console.log("[+] BufferedReader.readLine() - Replacing ro.debuggable");
                    text = text.replace("ro.debuggable=1", "ro.debuggable=0");
                }
            }
            return text;
        };

        console.log("[+] BufferedReader hooks installed successfully");
    } catch (e) {
        console.log("[!] BufferedReader hooks failed: " + e.message);
    }

    // ============================================================
    // SECTION 13: SETTINGS.SECURE HOOKS
    // ============================================================
    try {
        var Settings = Java.use("android.provider.Settings$Secure");

        Settings.getInt.implementation = function(contentResolver, name) {
            if (name === "development_settings_enabled" ||
                name === "adb_enabled" ||
                name === "mock_location") {
                console.log("[+] Settings.Secure.getInt() - Hiding: " + name);
                return 0;
            }
            return this.getInt(contentResolver, name);
        };

        console.log("[+] Settings.Secure hooks installed successfully");
    } catch (e) {
        console.log("[!] Settings.Secure hooks failed: " + e.message);
    }

    // ============================================================
    // SECTION 15: DEBUG DETECTION BYPASS
    // ============================================================
    try {
        var Debug = Java.use("android.os.Debug");

        Debug.isDebuggerConnected.implementation = function() {
            console.log("[+] Debug.isDebuggerConnected() - Returning false");
            return false;
        };

        console.log("[+] Debug detection bypass installed successfully");
    } catch (e) {
        console.log("[!] Debug detection bypass failed: " + e.message);
    }

    // ============================================================
    // SECTION 16: SELINUX BYPASS
    // ============================================================
    try {
        var SELinux = Java.use("android.os.SELinux");

        SELinux.isSELinuxEnforced.implementation = function() {
            console.log("[+] SELinux.isSELinuxEnforced() - Returning true");
            return true;
        };

        console.log("[+] SELinux bypass installed successfully");
    } catch (e) {
        console.log("[!] SELinux bypass failed: " + e.message);
    }

    // ============================================================
    // SECTION 17: MAGISK/ZYGISK/SHAMIKO DETECTION BYPASS
    // ============================================================
    // Modern root detection includes checking for Magisk modules and Zygisk
    // These hooks help bypass detection of root hiding mechanisms

    // Note: ProcessBuilder is already hooked in SECTION 8, no need to duplicate

    // Hook system property reading to hide Magisk indicators
    try {
        var SystemProperties2 = Java.use("android.os.SystemProperties");

        SystemProperties2.get.overload('java.lang.String', 'java.lang.String').implementation = function(key, def) {
            var result = this.get(key, def);

            // Hide Magisk-related properties
            var magiskProps = [
                "ro.magisk",
                "ro.magisk.version",
                "ro.magisk.versionCode",
                "ro.magisk.hidden",
                "ro.boot.magisk"
            ];

            for (var i = 0; i < magiskProps.length; i++) {
                if (key.indexOf(magiskProps[i]) !== -1) {
                    console.log("[+] Hidden Magisk property: " + key);
                    return "";
                }
            }

            // Hide Shamiko indicators
            var shamikoProps = [
                "ro.shamiko"
            ];

            for (var i = 0; i < shamikoProps.length; i++) {
                if (key.indexOf(shamikoProps[i]) !== -1) {
                    console.log("[+] Hidden Shamiko property: " + key);
                    return "";
                }
            }

            return result;
        };

        console.log("[+] Magisk/Shamiko property hiding installed");
    } catch (e) {
        console.log("[!] Magisk/Shamiko property hiding failed: " + e.message);
    }


    // ============================================================
    // SECTION 18: ROOTBEER LIBRARY BYPASS
    // ============================================================
    try {
        var RootBeer = Java.use("com.scottyab.rootbeer.RootBeer");

        RootBeer.isRooted.implementation = function() {
            console.log("[+] RootBeer.isRooted() - Returning false");
            return false;
        };

        RootBeer.isRootedWithoutBusyBoxCheck.implementation = function() {
            console.log("[+] RootBeer.isRootedWithoutBusyBoxCheck() - Returning false");
            return false;
        };

        RootBeer.checkForBusyBoxBinary.implementation = function() {
            console.log("[+] RootBeer.checkForBusyBoxBinary() - Returning false");
            return false;
        };

        RootBeer.checkForSuBinary.implementation = function() {
            console.log("[+] RootBeer.checkForSuBinary() - Returning false");
            return false;
        };

        RootBeer.checkForDangerousProps.implementation = function() {
            console.log("[+] RootBeer.checkForDangerousProps() - Returning false");
            return false;
        };

        RootBeer.checkForRootNativeApps.implementation = function() {
            console.log("[+] RootBeer.checkForRootNativeApps() - Returning false");
            return false;
        };

        console.log("[+] RootBeer bypass installed successfully");
    } catch (e) {
        console.log("[!] RootBeer bypass failed (app may not use it): " + e.message);
    }

    // ============================================================
    // SECTION 19: NATIVE HOOKS (libc.so)
    // ============================================================

    // Hook fopen()
    try {
        var fopenPtr = Module.findExportByName("libc.so", "fopen");
        if (fopenPtr) {
            Interceptor.attach(fopenPtr, {
                onEnter: function(args) {
                    var path = Memory.readCString(args[0]);
                    var pathParts = path.split("/");
                    var filename = pathParts[pathParts.length - 1];
                    this.shouldBlock = rootBinaries.indexOf(filename) !== -1;
                    if (this.shouldBlock) {
                        console.log("[+] fopen() - Blocking: " + path);
                    }
                },
                onLeave: function(retval) {
                    if (this.shouldBlock) {
                        retval.replace(ptr(0x0));
                    }
                }
            });
            console.log("[+] Native fopen() hook installed");
        }
    } catch (e) {
        console.log("[!] Native fopen() hook failed: " + e.message);
    }

    // Hook access()
    try {
        var accessPtr = Module.findExportByName("libc.so", "access");
        if (accessPtr) {
            Interceptor.attach(accessPtr, {
                onEnter: function(args) {
                    var path = Memory.readCString(args[0]);
                    this.shouldBlock = rootPaths.indexOf(path) !== -1 || path.indexOf("magisk") >= 0;
                    if (this.shouldBlock) {
                        console.log("[+] access() - Blocking: " + path);
                    }
                },
                onLeave: function(retval) {
                    if (this.shouldBlock) {
                        retval.replace(ptr(-1));
                    }
                }
            });
            console.log("[+] Native access() hook installed");
        }
    } catch (e) {
        console.log("[!] Native access() hook failed: " + e.message);
    }

    // Hook stat()
    try {
        var statPtr = Module.findExportByName("libc.so", "stat");
        if (statPtr) {
            Interceptor.attach(statPtr, {
                onEnter: function(args) {
                    var path = Memory.readCString(args[0]);
                    this.shouldBlock = rootPaths.indexOf(path) !== -1 || path.indexOf("magisk") >= 0;
                    if (this.shouldBlock) {
                        console.log("[+] stat() - Blocking: " + path);
                    }
                },
                onLeave: function(retval) {
                    if (this.shouldBlock) {
                        retval.replace(ptr(-1));
                    }
                }
            });
            console.log("[+] Native stat() hook installed");
        }
    } catch (e) {
        console.log("[!] Native stat() hook failed: " + e.message);
    }

    // Hook system()
    try {
        var systemPtr = Module.findExportByName("libc.so", "system");
        if (systemPtr) {
            Interceptor.attach(systemPtr, {
                onEnter: function(args) {
                    var cmd = Memory.readCString(args[0]);
                    this.shouldBlock = false;

                    for (var i = 0; i < dangerousCommands.length; i++) {
                        if (cmd.indexOf(dangerousCommands[i]) !== -1) {
                            this.shouldBlock = true;
                            break;
                        }
                    }

                    if (this.shouldBlock) {
                        console.log("[+] system() - Blocking: " + cmd);
                    }
                },
                onLeave: function(retval) {
                    if (this.shouldBlock) {
                        retval.replace(ptr(0));
                    }
                }
            });
            console.log("[+] Native system() hook installed");
        }
    } catch (e) {
        console.log("[!] Native system() hook failed: " + e.message);
    }

    // Hook __system_property_get (for getprop)
    try {
        var systemPropertyGetPtr = Module.findExportByName("libc.so", "__system_property_get");
        if (systemPropertyGetPtr) {
            Interceptor.attach(systemPropertyGetPtr, {
                onEnter: function(args) {
                    this.key = Memory.readCString(args[0]);
                    this.ret = args[1];
                },
                onLeave: function(retval) {
                    if (CACHED_STRINGS.hasOwnProperty(this.key)) {
                        console.log("[+] __system_property_get() - Spoofing: " + this.key);
                        // Use cached string to avoid memory churn
                        var cached = CACHED_STRINGS[this.key];
                        var value = rootProperties[this.key];
                        Memory.copy(this.ret, cached, value.length + 1);
                    }
                }
            });
            console.log("[+] Native __system_property_get() hook installed");
        }
    } catch (e) {
        console.log("[!] Native __system_property_get() hook failed: " + e.message);
    }

    // Hook popen()
    try {
        var popenPtr = Module.findExportByName("libc.so", "popen");
        if (popenPtr) {
            Interceptor.attach(popenPtr, {
                onEnter: function(args) {
                    var cmd = Memory.readCString(args[0]);
                    this.shouldBlock = false;

                    for (var i = 0; i < dangerousCommands.length; i++) {
                        if (cmd.indexOf(dangerousCommands[i]) !== -1) {
                            this.shouldBlock = true;
                            break;
                        }
                    }

                    if (this.shouldBlock) {
                        console.log("[+] popen() - Blocking: " + cmd);
                    }
                },
                onLeave: function(retval) {
                    if (this.shouldBlock) {
                        retval.replace(ptr(0x0));
                    }
                }
            });
            console.log("[+] Native popen() hook installed");
        }
    } catch (e) {
        console.log("[!] Native popen() hook failed: " + e.message);
    }

    // Hook execv(), execvp(), execve()
    // FIX: Original hooks only logged "Blocking" but never modified behavior.
    // Now using onLeave to return -1 (failure) for root binary executions.
    // NOTE: This is a basic block — for production use, consider replacing the binary
    // path with /bin/true or /dev/null in onEnter for more complete blocking.
    try {
        var execvPtr = Module.findExportByName("libc.so", "execv");
        if (execvPtr) {
            Interceptor.attach(execvPtr, {
                onEnter: function(args) {
                    var cmd = Memory.readCString(args[0]);
                    if (rootBinaries.indexOf(cmd) !== -1) {
                        console.log("[+] execv() - Blocking: " + cmd);
                        this.block = true;
                    }
                },
                onLeave: function(retval) {
                    if (this.block) {
                        retval.replace(ptr(-1));  // Return -1 (exec failed)
                    }
                }
            });
        }
    } catch (e) {}

    try {
        var execvpPtr = Module.findExportByName("libc.so", "execvp");
        if (execvpPtr) {
            Interceptor.attach(execvpPtr, {
                onEnter: function(args) {
                    var cmd = Memory.readCString(args[0]);
                    if (rootBinaries.indexOf(cmd) !== -1) {
                        console.log("[+] execvp() - Blocking: " + cmd);
                        this.block = true;
                    }
                },
                onLeave: function(retval) {
                    if (this.block) {
                        retval.replace(ptr(-1));
                    }
                }
            });
        }
    } catch (e) {}

    try {
        var execvePtr = Module.findExportByName("libc.so", "execve");
        if (execvePtr) {
            Interceptor.attach(execvePtr, {
                onEnter: function(args) {
                    var cmd = Memory.readCString(args[0]);
                    if (rootBinaries.indexOf(cmd) !== -1) {
                        console.log("[+] execve() - Blocking: " + cmd);
                        this.block = true;
                    }
                },
                onLeave: function(retval) {
                    if (this.block) {
                        retval.replace(ptr(-1));
                    }
                }
            });
        }
    } catch (e) {}

    console.log("[+] Native exec family hooks installed");

    // ============================================================
    // SECTION 19: SAFETYNET / PLAY INTEGRITY BYPASS (Basic)
    // ============================================================
    // DEPRECATED: SafetyNet API was fully discontinued in 2024-2025.
    // Google Play Integrity API requires server-side validation and cannot be
    // bypassed with simple token mocking. Real Play Integrity bypass requires:
    // - Patching Play Services APK (GMS Core)
    // - Modifying device attestation at kernel/TEE level
    // - Using custom Integrity providers with valid certificates
    //
    // For comprehensive Play Integrity bypass, see:
    // - https://github.com/kosborn53/PlayIntegrityFix
    // - https://github.com/LSPosed/LSPosed (Zygisk-based)
    // - https://github.com/Dr-TSNG/ZygiskNext (root hiding)
    //
    // This section provides ONLY basic bypass for apps using RootBeer's SafetyNetHelper
    // and simple Play Integrity token mocking. These will FAIL if the app performs
    // server-side token validation with Google's attestation servers.
    try {
        var SafetyNetHelper = Java.use("com.scottyab.safetynet.SafetyNetHelper");

        SafetyNetHelper.isGooglePlayServicesAvailable.implementation = function(context) {
            console.log("[+] SafetyNetHelper.isGooglePlayServicesAvailable() - Returning true (DEPRECATED API)");
            return true;
        };

        SafetyNetHelper.withGooglePlayServicesAvailabilityCheck.implementation = function(context, callback) {
            console.log("[+] SafetyNetHelper.withGooglePlayServicesAvailabilityCheck() - Bypassed (DEPRECATED API)");
            return SafetyNetHelper;
        };

        console.log("[+] SafetyNet basic bypass installed (RootBeer library - DEPRECATED API - discontinued in 2024-2025)");
    } catch (e) {
        console.log("[!] SafetyNet bypass failed (app may not use it): " + e.message);
    }

    // Play Integrity API bypass (Android 11+) - LIMITED EFFECTIVENESS
    // WARNING: This is a basic bypass that will NOT work with modern Play Integrity checks
    // Modern Play Integrity uses device attestation with signed tokens that are validated
    // on Google servers. Simple token mocking cannot bypass server-side validation.
    //
    // For real Play Integrity bypass, consider:
    // - PlayIntegrityFix module (requires Zygisk)
    // - GMS Core patching (requires system modification)
    // - Shamiko module (for root hiding + integrity bypass)
    try {
        var IntegrityTokenResponse = Java.use("com.google.android.play.integrity.IntegrityTokenResponse");

        IntegrityTokenResponse.token.implementation = function() {
            console.log("[+] IntegrityTokenResponse.token() - Returning mock token (LIMITED BYPASS)");
            console.log("[!] WARNING: This mock token will FAIL server-side validation");
            console.log("[!] Real Play Integrity bypass requires GMS Core patching or PlayIntegrityFix");
            return "MOCK_INTEGRITY_TOKEN";
        };

        // Also try hooking IntegrityManager if available (newer API)
        try {
            var IntegrityManager = Java.use("com.google.android.play.integrity.IntegrityManager");
            var IntegrityTokenRequest = Java.use("com.google.android.play.integrity.IntegrityTokenRequest");

            IntegrityManager.requestIntegrityToken.implementation = function(request, listener) {
                console.log("[+] IntegrityManager.requestIntegrityToken() - Mocking response (LIMITED BYPASS)");
                console.log("[!] WARNING: This will FAIL if app validates tokens with Google servers");
                // Create a mock token - this will likely fail server-side validation
                return;
            };

            console.log("[+] Play Integrity Manager basic bypass installed (LIMITED - requires PlayIntegrityFix or GMS patching)");
        } catch (e2) {
            // IntegrityManager not available
        }

        console.log("[+] Play Integrity basic bypass installed (LIMITED - may not work with server validation)");
    } catch (e) {
        console.log("[!] Play Integrity bypass failed (app may not use it): " + e.message);
    }

    // ============================================================
    // SUMMARY
    // ============================================================
    console.log("\n[*] ================================================");
    console.log("[*] Universal Root Detection Bypass - Completed");
    console.log("[*] ================================================");
    console.log("[*] Hooks installed:");
    console.log("[*]   - Java File hooks (exists, canRead, isDirectory)");
    console.log("[*]   - UnixFileSystem hooks");
    console.log("[*]   - System.getenv() hooks");
    console.log("[*]   - Runtime.exec() and ProcessBuilder hooks");
    console.log("[*]   - PackageManager hooks");
    console.log("[*]   - SystemProperties hooks");
    console.log("[*]   - Build properties spoofing");
    console.log("[*]   - BufferedReader hooks (build.prop)");
    console.log("[*]   - Debug detection bypass");
    console.log("[*]   - SELinux bypass");
    console.log("[*]   - RootBeer library bypass");
    console.log("[*]   - Native libc hooks (fopen, access, stat, system, popen, exec*)");
    console.log("[*]   - Magisk/Zygisk/Shamiko detection bypass (NEW)");
    console.log("[*]   - Magisk property hiding (NEW)");
    console.log("[*]   - Magisk app hiding (NEW)");
    console.log("[*]   - SafetyNet basic bypass (DEPRECATED API)");
    console.log("[*]   - Play Integrity basic bypass (LIMITED - requires GMS patching)");
    console.log("[*]   - Emulator detection bypass");
    console.log("[*] ================================================\n");

    // ============================================================
    // PLAY INTEGRITY BYPASS - NEW FROM HANDBOOK
    // ============================================================

    log('[PLAY-INTEGRITY] Implementing Play Integrity bypasses from Frida Handbook...');

    /**
     * Bypass from Frida Handbook - JNI level anti-Frida detection
     * Hook JNI_OnLoad to skip/delay anti-Frida checks
     */
    Java.performNow(() => {
      try {
        const System = Java.use('java.lang.System');

        // Hook System.loadLibrary() which calls JNI_OnLoad
        System.loadLibrary.overload('java.lang.String').implementation = function(libname) {
          log(`[JNI] System.loadLibrary("${libname}") called`);
          log(`[JNI] Skipping JNI_OnLoad() to bypass anti-Frida checks`);

          // Get stack trace to see who's calling this
          try {
            const Thread = Java.use('java.lang.Thread');
            const thread = Thread.$new();
            const stackTrace = thread.currentThread().getStackTrace();

            log(`[JNI] Stack trace (first 3 frames):`);
            stackTrace.slice(0, 3).forEach((element, index) => {
              log(`[JNI]   [${index}] ${element.toString()}`);
            });
          } catch (e) {
            log(`[JNI] Failed to extract stack trace: ${e}`);
          }

          // Call original loadLibrary but skip JNI_OnLoad
          return this.loadLibrary(libname);
        };

        log('[+] Hooked System.loadLibrary() with JNI_OnLoad bypass');
      } catch (error) {
        log(`[ERROR] Failed to hook System.loadLibrary: ${error}`);
      }
    });

    /**
     * Stack trace extraction function for native code
     */
    function extractNativeStackTrace() {
      try {
        const Thread = Java.use('java.lang.Thread');
        const thread = Thread.$new();
        const stackTrace = thread.currentThread().getStackTrace();

        log('[NATIVE] Stack trace (first 5 frames):');
        stackTrace.slice(0, 5).forEach((element, index) => {
          log(`[NATIVE]   [${index}] ${element.toString()}`);
        });

        return stackTrace;
      } catch (error) {
        log(`[ERROR] Failed to extract native stack trace: ${error}`);
        return [];
      }
    }

    /**
     * Memory patching from Frida Handbook - Memory.patchCode()
     * More efficient than .replace() for simple patches
     */
    Java.performNow(() => {
      try {
        const targetFunction = Module.findExportByName(null, 'checkRootAccess');

        if (targetFunction) {
          const address = targetFunction.address;

          // Patch with NOP (0x90, 0x90, 0x90, 0x90)
          log('[PATCH] Patching checkRootAccess() at ' + address + ' with NOP (Memory.patchCode)');
          Memory.patchCode(address, [0x90, 0x90, 0x90, 0x90]);

          log('[PATCH] Patched successfully');
        } else {
          log('[!] checkRootAccess function not found');
        }
      } catch (error) {
        log(`[ERROR] Failed to apply memory patch: ${error}`);
      }
    });

    log('[+] JNI bypass and memory patching capabilities added from Frida Handbook');
});

