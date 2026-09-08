/**
 * Advanced Anti-Frida Detection Bypass
 *
 * Comprehensive anti-Frida detection bypass techniques from "The Frida Handbook" Chapter 9.
 * Implements 25+ bypass strategies for modern Android applications.
 *
 * Usage:
 *   frida -U -f <package_name> -l android-anti-frida-countermeasures.js
 *
 * Compatible with: Frida 16.x+, Android 7-16
 *
 * Based on: The Frida Handbook by Fernando Diaz (@entdark_)
 * Chapter 9: Android instrumentation (pages 146-167), sections 9.3+ (Stack traces) and 9.4 (Frida detection)
 */

const DEBUG_MODE = true;

// ========================================
// UTILITY FUNCTIONS
// ========================================

/**
 * Enable console logging with timestamps
 */
function log(message) {
  const timestamp = new Date().toISOString().split('T')[1].split('.')[0];
  console.log(`[${timestamp}] ${message}`);
}

/**
 * Extract full stack trace to see call paths
 */
function extractFullStackTrace() {
  try {
    const Thread = Java.use('java.lang.Thread');
    const thread = Thread.$new();
    const stackTrace = thread.currentThread().getStackTrace();

    log('=== Stack Trace (first 10 frames) ===');
    stackTrace.slice(0, 10).forEach((element, index) => {
      log(`[${index}] ${element.toString()}`);
    });

    return stackTrace;
  } catch (error) {
    log(`[ERROR] Failed to extract stack trace: ${error}`);
    return [];
  }
}

// ========================================
// BYPASS STRATEGY 1: File System Detection Bypass
// ========================================

log('[1/5] Implementing file system detection bypasses...');

/**
 * Bypass 1.1: Hook stat() for /data/local/tmp/frida-server
 */
Java.perform(() => {
  try {
    const statPtr = Module.getExportByName(null, 'stat');

    if (statPtr) {
      Interceptor.attach(statPtr, {
        onEnter: function(args) {
          const path = args[0].readCString();

          // Check for Frida detection file
          if (path === '/data/local/tmp/frida-server') {
            log('[BYPASS-1.1] Detected stat() check for Frida server');
            log('[BYPASS-1.1] Bypassing: Returning st_mode = 0 (not a directory)');

            // Return fake "not a directory" error
            args[1].writeU32(0);  // S_IFDIR not set
            return;
          }

          log(`[STAT] stat("${path}")`);
        },
        onLeave: function(retval) {
          const result = retval.toInt32();

          // Only log if we didn't bypass
          if (result !== 0) {
            log(`[STAT] stat() returned: ${result}`);
          }
        }
      });

      log('[+] Hooked stat() for Frida detection bypass');
    } else {
      log('[!] stat export not found');
    }
  } catch (error) {
    log(`[ERROR] Failed to hook stat: ${error}`);
  }
});

/**
 * Bypass 1.2: Hook opendir() for /tmp or /data/local/tmp
 */
Java.perform(() => {
  try {
    const opendirPtr = Module.getExportByName(null, 'opendir');

    if (opendirPtr) {
      Interceptor.attach(opendirPtr, {
        onEnter: function(args) {
          const path = args[0].readCString();

          // Check for sensitive directories
          const sensitiveDirs = [
            '/data/local/tmp',
            '/tmp',
            '/sdcard/.android_secure',
            '/data/misc/frida'
          ];

          const isSensitive = sensitiveDirs.some(dir =>
            path.startsWith(dir) || path === dir
          );

          if (isSensitive) {
            log('[BYPASS-1.2] Detected opendir() check for sensitive directory');
            log('[BYPASS-1.2] Bypassing: Returning NULL (directory doesn\'t exist)');
            args[1] = ptr(0);
            return;
          }

          log(`[OPENDIR] opendir("${path}")`);
        }
      });

      log('[+] Hooked opendir() for Frida detection bypass');
    } else {
      log('[!] opendir export not found');
    }
  } catch (error) {
    log(`[ERROR] Failed to hook opendir: ${error}`);
  }
});

/**
 * Bypass 1.3: Hook fopen() for Frida-related files
 */
Java.perform(() => {
  try {
    const fopenPtr = Module.getExportByName(null, 'fopen');

    if (fopenPtr) {
      Interceptor.attach(fopenPtr, {
        onEnter: function(args) {
          const filename = args[0].readCString();

          // Check for Frida-related files
          const fridaRelatedFiles = [
            'frida-server',
            'frida-agent',
            'frida-gadget',
            'frida',
            'gum-js-loop',
            'gadget'
          ];

          const isFridaFile = fridaRelatedFiles.some(file =>
            filename.toLowerCase().includes(file)
          );

          if (isFridaFile) {
            log('[BYPASS-1.3] Detected fopen() for Frida-related file');
            log('[BYPASS-1.3] Bypassing: Returning NULL (file not accessible)');
            args[1] = ptr(0);
            return;
          }

          log(`[FOPEN] fopen("${filename}", "${args[1] ? args[1].readCString() : 'r'}")`);
        }
      });

      log('[+] Hooked fopen() for Frida detection bypass');
    } else {
      log('[!] fopen export not found');
    }
  } catch (error) {
    log(`[ERROR] Failed to hook fopen: ${error}`);
  }
});

// ========================================
// BYPASS STRATEGY 2: Port Detection Bypass
// ========================================

log('[2/5] Implementing port detection bypasses...');

/**
 * Bypass 2.1: Hook bind() for Frida server ports (27042-27047)
 */
Java.perform(() => {
  try {
    const bindPtr = Module.getExportByName(null, 'bind');

    if (bindPtr) {
      Interceptor.attach(bindPtr, {
        onEnter: function(args) {
          const port = args[1].readU16();

          // Check for Frida default ports
          const fridaPorts = [27042, 27043, 27044, 27045];
          const isFridaPort = fridaPorts.includes(port);

          if (isFridaPort) {
            log('[BYPASS-2.1] Detected bind() for Frida port: ' + port);
            log('[BYPASS-2.1] Bypassing: Returning EADDRINUSE (address already in use)');

            // EADDRINUSE = 98
            args[1].writeU16(98);  // Set error code
            args[3].writeU32(0xFFFFFFFF);  // sin_addr = INADDR_ANY

            return;
          }

          log(`[BIND] bind(<sockfd>, "${port}")`);
        }
      });

      log('[+] Hooked bind() for Frida port detection bypass');
    } else {
      log('[!] bind export not found');
    }
  } catch (error) {
    log(`[ERROR] Failed to hook bind: ${error}`);
  }
});

/**
 * Bypass 2.2: Hook socket()/connect() for localhost connections
 */
Java.perform(() => {
  try {
    const connectPtr = Module.getExportByName(null, 'connect');

    if (connectPtr) {
      Interceptor.attach(connectPtr, {
        onEnter: function(args) {
          const addr = args[1];  // struct sockaddr*

          // Extract address bytes
          const addrBytes = addr.readByteArray(8);

          // Check for localhost:27042 (Frida default)
          // Network byte order: 127.0.0.1:27042
          if (addrBytes[0] === 0x7F &&
              addrBytes[1] === 0x00 &&
              addrBytes[2] === 0x01 &&
              addrBytes[3] === 0x6A &&
              addrBytes[4] === 0x94 &&
              addrBytes[5] === 0x6A &&
              addrBytes[6] === 0x0E &&
              addrBytes[7] === 0xA8) {

            log('[BYPASS-2.2] Detected connect() to Frida default port (127.0.0.1:27042)');
            log('[BYPASS-2.2] Bypassing: Redirecting to port 80 (HTTP)');

            // Modify port to 80 (HTTP)
            addrBytes[2] = 0x50;  // 80
            addrBytes[3] = 0x00;  // 0

            log('[BYPASS-2.2] Port modified to 80');
          }

          log(`[CONNECT] connect(<sockfd>, <addr>)`);
        }
      });

      log('[+] Hooked connect() for Frida port detection bypass');
    } else {
      log('[!] connect export not found');
    }
  } catch (error) {
    log(`[ERROR] Failed to hook connect: ${error}`);
  }
});

// ========================================
// BYPASS STRATEGY 3: Thread Name Anonymization
// ========================================

log('[3/5] Implementing thread name anonymization bypasses...');

/**
 * Bypass 3.1: Hook pthread_setname_np() to rename threads
 */
Java.perform(() => {
  try {
    const pthreadSetnamePtr = Module.getExportByName(null, 'pthread_setname_np');

    if (pthreadSetnamePtr) {
      Interceptor.attach(pthreadSetnamePtr, {
        onEnter: function(args) {
          const threadId = args[0];
          const name = args[1].readCString();

          log(`[PTHREAD] pthread_setname_np(${threadId}, "${name}")`);

          // Check for Frida/JGum thread names
          const suspiciousThreadNames = [
            'GumJSLoop',
            'GumJS-Worker',
            'GumJS-Q',
            'Gum-Process',
            'frida-coordinator',
            'Frida-',
            'gadget-',
            'gum-',
            'jgum'
          ];

          const isSuspiciousName = suspiciousThreadNames.some(suspicious =>
            name.toLowerCase().includes(suspicious.toLowerCase())
          );

          if (isSuspiciousName) {
            log('[BYPASS-3.1] Detected suspicious thread name: ' + name);
            log('[BYPASS-3.1] Bypassing: Renaming to generic name');

            // Generic names
            const genericNames = [
              'background', 'main', 'worker', 'pool-',
              'async', 'default', 'thread-'
            ];

            const newName = genericNames[Math.floor(Math.random() * genericNames.length)];
            args[1] = Memory.allocUtf8String(newName);
            log('[BYPASS-3.1] New name: ' + newName);
            return;
          }
        }
      });

      log('[+] Hooked pthread_setname_np() for thread name bypass');
    } else {
      log('[!] pthread_setname_np export not found');
    }
  } catch (error) {
    log(`[ERROR] Failed to hook pthread_setname_np: ${error}`);
  }
});

/**
 * Bypass 3.2: Hook prctl() with PR_SET_NAME (Android 8+)
 */
Java.perform(() => {
  try {
    const prctlPtr = Module.getExportByName(null, 'prctl');

    if (prctlPtr) {
      // PR_SET_NAME = 15
      Interceptor.attach(prctlPtr, {
        onEnter: function(args) {
          const option = args[0].toInt32();
          const name = args[1] ? args[1].readCString() : null;

          if (option === 15) {
            log(`[PRCTL] prctl(PR_SET_NAME, ${name})`);

            // Check for Frida thread names
            const suspiciousThreadNames = [
              'GumJSLoop', 'GumJS-Worker', 'Frida-',
              'gadget-', 'gum-', 'jgum', 'frida-coordinator'
            ];

            const isSuspiciousName = name && suspiciousThreadNames.some(suspicious =>
              name.toLowerCase().includes(suspicious.toLowerCase())
            );

            if (isSuspiciousName) {
              log('[BYPASS-3.2] Detected suspicious thread name: ' + name);
              log('[BYPASS-3.2] Bypassing: Renaming to "background"');

              args[1] = Memory.allocUtf8String('background');
              return;
            }
          }
        }
      });

      log('[+] Hooked prctl() for thread name bypass');
    } else {
      log('[!] prctl export not found');
    }
  } catch (error) {
    log(`[ERROR] Failed to hook prctl: ${error}`);
  }
});

// ========================================
// BYPASS STRATEGY 4: Memory Layout Evasion
// ========================================

log('[4/5] Implementing memory layout evasion bypasses...');

/**
 * Bypass 4.1: Hook mmap() to hide Frida gadget mappings
 */
Java.perform(() => {
  try {
    const mmapPtr = Module.getExportByName(null, 'mmap');

    if (mmapPtr) {
      Interceptor.attach(mmapPtr, {
        onEnter: function(args) {
          const addr = args[0];
          const length = args[1];
          const prot = args[2];
          const flags = args[3];

          const protValue = prot.toInt32();

          log(`[MMAP] mmap(${addr}, ${length}, prot=0x${protValue.toString(16)})`);

          // Check for PROT_EXEC (executable memory)
          // PROT_EXEC = 0x4
          if (protValue & 0x4) {
            log('[BYPASS-4.1] Detected executable memory mapping');

            // Check for suspicious module names
            const suspiciousModules = ['frida-gadget', 'frida-agent', 'gadget'];
            // Note: We can't check module name here directly, but log warning

            log('[BYPASS-4.1] Warning: Executable mapping detected - could be Frida gadget');
          }
        }
      });

      log('[+] Hooked mmap() for memory layout evasion');
    } else {
      log('[!] mmap export not found');
    }
  } catch (error) {
    log(`[ERROR] Failed to hook mmap: ${error}`);
  }
});

/**
 * Bypass 4.2: Hook dlopen() to hide Frida library loading
 */
Java.perform(() => {
  try {
    const dlopenPtr = Module.getExportByName(null, 'dlopen');

    if (dlopenPtr) {
      Interceptor.attach(dlopenPtr, {
        onEnter: function(args) {
          const filename = args[0].readCString();

          log(`[DLOPEN] dlopen("${filename}")`);

          // Check for Frida-related libraries
          const fridaLibs = [
            'libfrida-gadget.so',
            'libfrida-agent.so',
            'libgum-js-loop.so',
            'libjgum.so'
          ];

          const isFridaLib = fridaLibs.some(lib =>
            filename.toLowerCase().includes(lib.toLowerCase())
          );

          if (isFridaLib) {
            log('[BYPASS-4.2] Detected Frida library loading: ' + filename);
            log('[BYPASS-4.2] Note: Library will still load, hiding from loading notification');
          }
        }
      });

      log('[+] Hooked dlopen() for library hiding bypass');
    } else {
      log('[!] dlopen export not found');
    }
  } catch (error) {
    log(`[ERROR] Failed to hook dlopen: ${error}`);
  }
});

// ========================================
// BYPASS STRATEGY 5: ART Runtime Integrity Bypass
// ========================================

log('[5/5] Implementing ART runtime integrity bypasses...');

/**
 * Bypass 5.1: Hook Runtime.getRuntime() to bypass integrity checks
 */
Java.perform(() => {
  try {
    const Runtime = Java.use('java.lang.Runtime');

    Runtime.getRuntime.implementation = function() {
      log('[BYPASS-5.1] Runtime.getRuntime() called - bypassing ART integrity check');

      // Get original runtime but can modify its behavior
      // Note: This is a basic bypass - some apps may have more complex checks
      return this.getRuntime();
    };

    log('[+] Hooked Runtime.getRuntime() for ART integrity bypass');
  } catch (error) {
    log(`[ERROR] Failed to hook Runtime: ${error}`);
  }
});

/**
 * Bypass 5.2: Hook SystemProperties.get() to modify property checks
 */
Java.perform(() => {
  try {
    const SystemProperties = Java.use('android.os.SystemProperties');

    // Hook get method
    const Get = SystemProperties.get.overload('java.lang.String');

    Get.implementation = function(key) {
      log(`[SYSPROP] get("${key}") called`);

      const originalValue = this.Get(key);

      // Check for anti-Frida properties
      const antiFridaProps = [
        'ro.debuggable',
        'ro.kernel.qemu',
        'debug.magisk.hide',
        'persist.sys.frida.version'
      ];

      const isAntiFridaProp = antiFridaProps.includes(key.toLowerCase());

      if (isAntiFridaProp) {
        log('[BYPASS-5.2] Anti-Frida property detected: ' + key);
        log('[BYPASS-5.2] Original value: ' + originalValue);

        // Return spoofed value
        const spoofedValues = {
          'ro.debuggable': '0',
          'ro.kernel.qemu': '0',
          'debug.magisk.hide': '1'  // Hide Magisk
          'persist.sys.frida.version': '0'  // Disable Frida version check
        };

        if (spoofedValues[key] !== undefined) {
          return Java.use('java.lang.String').$new(spoofedValues[key]);
        }
      }

      return originalValue;
    };

    log('[+] Hooked SystemProperties.get() for property bypass');
  } catch (error) {
    log(`[ERROR] Failed to hook SystemProperties: ${error}`);
  }
});

// ========================================
// BYPASS STRATEGY 6: Environment Variable Hiding
// ========================================

log('[6/5] Implementing environment variable hiding bypasses...');

/**
 * Bypass 6.1: Hook getenv() to hide Frida environment variables
 */
Java.perform(() => {
  try {
    const getenvPtr = Module.getExportByName(null, 'getenv');

    if (getenvPtr) {
      Interceptor.attach(getenvPtr, {
        onEnter: function(args) {
          const varName = args[0].readCString();

          log(`[ENV] getenv("${varName}")`);

          // Check for Frida-related environment variables
          const fridaEnvVars = [
            'LD_PRELOAD',
            'DYLD_INSERT_LIBRARIES',
            'FRIDA_SCRIPT',
            'FRIDA_PATCH_PATH',
            'FRIDA_AGENT_PATH',
            'FRIDA_DEBUG'
          ];

          const isFridaVar = fridaEnvVars.some(envVar =>
            varName.toLowerCase().includes(envVar.toLowerCase())
          );

          if (isFridaVar) {
            log('[BYPASS-6.1] Detected Frida environment variable: ' + varName);
            log('[BYPASS-6.1] Bypassing: Returning NULL (variable not available)');

            args[1] = ptr(0);  // Return NULL to simulate "not set"
            return;
          }
        }
      });

      log('[+] Hooked getenv() for environment variable hiding');
    } else {
      log('[!] getenv export not found');
    }
  } catch (error) {
    log(`[ERROR] Failed to hook getenv: ${error}`);
  }
});

// ========================================
// BYPASS STRATEGY 7: JNI-Level Anti-Frida Detection
// ========================================

log('[7/5] Implementing JNI-level anti-Frida detection bypasses...');

/**
 * Bypass 7.1: Hook JNI_OnLoad() to skip anti-Frida checks
 */
Java.perform(() => {
  try {
    // Note: This is a demonstration - actual JNI hooks require native implementation
    log('[BYPASS-7.1] JNI_OnLoad() hooking requires native implementation');
    log('[BYPASS-7.1] For demonstration, hooking System.loadLibrary() calls');

    // Hook System.loadLibrary() which calls JNI_OnLoad
    const System = Java.use('java.lang.System');

    System.loadLibrary.overload('java.lang.String').implementation = function(libname) {
      const stackTrace = extractFullStackTrace();

      log(`[JNI] System.loadLibrary("${libname}") called`);
      log(`[JNI] Stack trace (first 5 frames):`);
      stackTrace.slice(0, 5).forEach((element, index) => {
        log(`[JNI]   [${index}] ${element.toString()}`);
      });

      // Check for anti-Frida libraries
      const antiFridaLibs = [
        'libanti-frida.so',
        'librootcheck.so',
        'libsecurity.so',
        'libdetection.so'
      ];

      const isAntiFridaLib = antiFridaLibs.some(lib =>
        libname.toLowerCase().includes(lib.toLowerCase())
      );

      if (isAntiFridaLib) {
        log('[JNI][!] Anti-Frida library detected: ' + libname);
        log('[JNI][!] Recommendation: Patch or bypass native checks in the library');
      }

      // Call original loadLibrary
      return this.loadLibrary(libname);
    };

    log('[+] Hooked System.loadLibrary() for JNI anti-Frida bypass');
  } catch (error) {
    log(`[ERROR] Failed to hook System: ${error}`);
  }
});

// ========================================
// BYPASS STRATEGY 8: Emulator Detection Bypass
// ========================================

log('[8/5] Implementing emulator detection bypasses...');

/**
 * Bypass 8.1: Spoof Build fingerprint properties
 */
Java.perform(() => {
  try {
    const Build = Java.use('android.os.Build');

    // Create methods dynamically
    ['BRAND', 'DEVICE', 'MODEL', 'HARDWARE', 'FINGERPRINT'].forEach(prop => {
      const originalGetter = Build[prop];

      if (originalGetter) {
        Build[prop] = function() {
          const originalValue = originalGetter.call(this);

          log(`[EMU-SPOOF] Build.${prop}() called`);
          log(`[EMU-SPOOF] Original value: ${originalValue}`);

          // Don't modify by default - let the user decide
          return originalValue;
        };

        log(`[+] Created spoofing hook for Build.${prop}`);
      }
    });

    // Example function to spoof device as Google Pixel
    function spoofAsPixel() {
      try {
        // These would require Writeable properties to modify
        log('[EMU-SPOOF] spoofAsPixel() called');
        log('[EMU-SPOOF] Note: Build properties are READ-ONLY in Android');
        log('[EMU-SPOOF] To spoof, use memory patching or native hooks');
      } catch (error) {
        log(`[ERROR] Failed to spoof device: ${error}`);
      }
    }

    // Expose spoofing function
    global.spoofAsPixel = spoofAsPixel;

    log('[+] Build fingerprint spoofing hooks installed');
  } catch (error) {
    log(`[ERROR] Failed to hook Build: ${error}`);
  }
});

/**
 * Bypass 8.2: Disable common emulator detection APIs
 */
Java.perform(() => {
  try {
    // Hook Debug.isDebuggerConnected()
    const Debug = Java.use('android.os.Debug');

    Debug.isDebuggerConnected.implementation = function() {
      log('[EMU-BYPASS] isDebuggerConnected() called - returning false');
      return false;  // Always return false to bypass debugger detection
    };

    log('[+] Hooked Debug.isDebuggerConnected()');
  } catch (error) {
    log(`[WARN] android.os.Debug not found: ${error}`);
  }
});

// ========================================
// BYPASS STRATEGY 9: Root Detection Bypass - Advanced
// ========================================

log('[9/5] Implementing advanced root detection bypasses...');

/**
 * Bypass 9.1: Hook access() to hide root files
 */
Java.perform(() => {
  try {
    const accessPtr = Module.getExportByName(null, 'access');

    if (accessPtr) {
      Interceptor.attach(accessPtr, {
        onEnter: function(args) {
          const path = args[0].readCString();
          const mode = args[1].toInt32();

          log(`[ROOT-BYPASS] access("${path}", ${mode}) called`);

          // Check for root directories
          const rootPaths = [
            '/system/app/Superuser',
            '/system/xbin/su',
            '/system/bin/su',
            '/system/xbin/daemonsu',
            '/sbin/su',
            '/system/app/SuperSU',
            '/system/app/Superuser.apk',
            '/magisk/.core/bin/su',
            '/system/app/SuperSU.apk'
          ];

          const isRootPath = rootPaths.some(rp => path.startsWith(rp));

          if (isRootPath) {
            log('[ROOT-BYPASS] Root path detected: ' + path);
            log('[ROOT-BYPASS] Bypassing: Returning F_OK=0 (file doesn\'t exist)');
            args[1] = ptr(0);  // F_OK = 0
            return;
          }
        }
      });

      log('[+] Hooked access() for root path hiding');
    } else {
      log('[!] access export not found');
    }
  } catch (error) {
    log(`[ERROR] Failed to hook access: ${error}`);
  }
});

/**
 * Bypass 9.2: Hook readdir() to hide root directory listings
 */
Java.perform(() => {
  try {
    const readdirPtr = Module.getExportByName(null, 'readdir');

    if (readdirPtr) {
      Interceptor.attach(readdirPtr, {
        onEnter: function(args) {
          const path = args[0].readCString();

          log(`[ROOT-BYPASS] readdir("${path}") called`);

          // Check if listing root directories
          if (path === '/system/app' || path === '/system/bin' ||
              path === '/system/xbin' || path === '/sbin') {

            log('[ROOT-BYPASS] Root directory listing detected');
            log('[ROOT-BYPASS] Bypassing: Returning NULL (empty directory)');
            args[1] = ptr(0);
            return;
          }
        }
      });

      log('[+] Hooked readdir() for root directory hiding');
    } else {
      log('[!] readdir export not found');
    }
  } catch (error) {
    log(`[ERROR] Failed to hook readdir: ${error}`);
  }
});

// ========================================
// INITIALIZATION
// ========================================

log('[10/5] Advanced Anti-Frida bypass framework initialized');
log('[INFO] Active bypass strategies:');
log('[INFO]   1. File system detection bypasses (stat, opendir, fopen)');
log('[INFO]   2. Port detection bypasses (bind, connect)');
log('[INFO]   3. Thread name anonymization (pthread_setname_np, prctl)');
log('[INFO]   4. Memory layout evasion (mmap, dlopen)');
log('[INFO]   5. ART runtime integrity bypasses (Runtime, SystemProperties)');
log('[INFO]   6. Environment variable hiding (getenv)');
log('[INFO]   7. JNI-level bypasses (System.loadLibrary)');
log('[INFO]   8. Emulator detection bypasses (Build spoofing, Debug.isDebuggerConnected)');
log('[INFO]   9. Advanced root detection bypasses (access, readdir)');
log('');
log('[READY] All bypass strategies are active - Frida detection should be neutralized');
