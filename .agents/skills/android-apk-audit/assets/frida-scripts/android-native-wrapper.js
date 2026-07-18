/**
 * Android Native Function Wrappers
 *
 * NativeFunction wrappers for system calls from "The Frida Handbook" Chapter 9.
 * Provides complete wrappers for mkdir, stat, fopen, fclose, chmod, getprop.
 * Includes Android-specific system properties handling.
 *
 * Usage:
 *   frida -U -f <package_name> -l android-native-wrapper.js
 *
 * Compatible with: Frida 16.x+, Android 7-16
 *
 * Based on: The Frida Handbook by Fernando Diaz (@entdark_)
 * Chapter 9: Android instrumentation (pages 146-167)
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

// ========================================
// NATIVE FUNCTION WRAPPERS
// ========================================

/**
 * Create a complete NativeFunction wrapper with error handling
 * Returns an object with the function, error status, and cleanup
 */
function createNativeFunctionWrapper(exportName, returnType, argTypes, moduleName = 'libc') {
  try {
    const exportPtr = Module.getExportByName(moduleName, exportName);

    if (exportPtr) {
      const nativeFunc = new NativeFunction(
        exportPtr,
        returnType,
        argTypes
      );

      log(`[NATIVE] Created wrapper for ${exportName}`);
      log(`[NATIVE]   Address: ${exportPtr}`);
      log(`[NATIVE]   Return type: ${returnType}`);
      log(`[NATIVE]   Arg types: [${argTypes.join(', ')}]`);

      // Hook the function to log all calls
      Interceptor.attach(exportPtr, {
        onEnter: function(args) {
          const argDescriptions = [];

          // Convert arguments to readable strings if possible
          for (let i = 0; i < args.length; i++) {
            const arg = args[i];
            if (!arg.isNull()) {
              try {
                const argStr = arg.readUtf8String();
                argDescriptions.push(`"${argStr}"`);
              } catch (e) {
                argDescriptions.push(`<pointer:${arg}>`);
              }
            } else {
              argDescriptions.push('null');
            }
          }

          log(`[NATIVE] ${exportName}(${argDescriptions.join(', ')})`);
        },
        onLeave: function(retval) {
          log(`[NATIVE] ${exportName} returned: ${retval}`);
        }
      });

      return {
        function: nativeFunc,
        ptr: exportPtr,
        success: true
      };
    } else {
      log(`[ERROR] Export ${exportName} not found in ${moduleName}`);
      return {
        function: null,
        ptr: null,
        success: false
      };
    }
  } catch (error) {
    log(`[ERROR] Failed to create wrapper for ${exportName}: ${error}`);
    return {
      function: null,
      ptr: null,
      success: false
    };
  }
}

/**
 * Wrap a native function with path argument handling
 */
function createPathWrapper(exportName, moduleName = 'libc') {
  return createNativeFunctionWrapper(
    exportName,
    'int',
    ['pointer'],
    moduleName
  );
}

/**
 * Wrap a native function with pointer and size arguments
 */
function createPointerSizeWrapper(exportName, moduleName = 'libc') {
  return createNativeFunctionWrapper(
    exportName,
    'int',
    ['pointer', 'int'],
    moduleName
  );
}

// ========================================
// MAIN SCRIPT
// ========================================

Java.perform(() => {
  log('=== Android Native Function Wrappers Initialized ===');
  log('[INFO] Creating complete NativeFunction wrappers for system calls');
  log('');

  // ========================================
  // 1. mkdir wrapper (directory creation)
  // ========================================

  const mkdirWrapper = createPathWrapper('mkdir');
  if (mkdirWrapper.success && mkdirWrapper.function) {
    // Hook to add stack trace capability
    Interceptor.attach(mkdirWrapper.ptr, {
      onEnter: function(args) {
        const path = args[0].readCString();
        log(`[NATIVE][STACK] mkdir("${path}") called from:`);

        // Extract stack trace to see who's calling mkdir
        try {
          const Thread = Java.use('java.lang.Thread');
          const thread = Thread.$new();
          const stackTrace = thread.currentThread().getStackTrace();

          if (stackTrace.length > 0) {
            log(`[NATIVE][STACK] Stack trace (first 5 frames):`);
            stackTrace.slice(0, 5).forEach((element, index) => {
              log(`[NATIVE][STACK]   [${index}] ${element.toString()}`);
            });
          }
        } catch (e) {
          log(`[NATIVE][STACK] Failed to extract stack trace: ${e}`);
        }
      },
      onLeave: function(retval) {
        const result = retval.toInt32();
        log(`[NATIVE][STACK] mkdir returned: ${result} (0=success, -1=error)`);
      }
    });

    // Expose globally
    global.mkdir = mkdirWrapper.function;
    log('[+] mkdir wrapper created and exposed globally');
  } else {
    log('[!] mkdir wrapper creation failed');
  }

  // ========================================
  // 2. stat wrapper (file status)
  // ========================================

  const statWrapper = createPointerSizeWrapper('stat');
  if (statWrapper.success && statWrapper.function) {
    // Hook to add stack trace capability
    Interceptor.attach(statWrapper.ptr, {
      onEnter: function(args) {
        const path = args[0].readCString();
        log(`[NATIVE][STACK] stat("${path}") called from:`);

        // Extract stack trace
        try {
          const Thread = Java.use('java.lang.Thread');
          const thread = Thread.$new();
          const stackTrace = thread.currentThread().getStackTrace();

          if (stackTrace.length > 0) {
            log(`[NATIVE][STACK] Stack trace (first 5 frames):`);
            stackTrace.slice(0, 5).forEach((element, index) => {
              log(`[NATIVE][STACK]   [${index}] ${element.toString()}`);
            });
          }
        } catch (e) {
          log(`[NATIVE][STACK] Failed to extract stack trace: ${e}`);
        }
      },
      onLeave: function(retval) {
        const result = retval.toInt32();
        log(`[NATIVE][STACK] stat returned: ${result}`);
      }
    });

    global.stat = statWrapper.function;
    log('[+] stat wrapper created and exposed globally');
  } else {
    log('[!] stat wrapper creation failed');
  }

  // ========================================
  // 3. fopen wrapper (file opening)
  // ========================================

  const fopenWrapper = createNativeFunctionWrapper(
    'fopen',
    'pointer',
    ['pointer', 'pointer'],
    'libc'
  );

  if (fopenWrapper.success && fopenWrapper.function) {
    // Hook to add stack trace capability
    Interceptor.attach(fopenWrapper.ptr, {
      onEnter: function(args) {
        const filename = args[0].readCString();
        const mode = args[1] ? args[1].readCString() : 'r';
        log(`[NATIVE][STACK] fopen("${filename}", "${mode}") called from:`);

        // Extract stack trace
        try {
          const Thread = Java.use('java.lang.Thread');
          const thread = Thread.$new();
          const stackTrace = thread.currentThread().getStackTrace();

          if (stackTrace.length > 0) {
            log(`[NATIVE][STACK] Stack trace (first 5 frames):`);
            stackTrace.slice(0, 5).forEach((element, index) => {
              log(`[NATIVE][STACK]   [${index}] ${element.toString()}`);
            });
          }
        } catch (e) {
          log(`[NATIVE][STACK] Failed to extract stack trace: ${e}`);
        }
      },
      onLeave: function(retval) {
        const filePtr = retval;
        if (!filePtr.isNull()) {
          log(`[NATIVE][STACK] fopen returned file pointer: ${filePtr}`);
        } else {
          log(`[NATIVE][STACK] fopen failed (returned null)`);
        }
      }
    });

    global.fopen = fopenWrapper.function;
    log('[+] fopen wrapper created and exposed globally');
  } else {
    log('[!] fopen wrapper creation failed');
  }

  // ========================================
  // 4. fclose wrapper (file closing)
  // ========================================

  const fcloseWrapper = createNativeFunctionWrapper(
    'fclose',
    'int',
    ['pointer'],
    'libc'
  );

  if (fcloseWrapper.success && fcloseWrapper.function) {
    // Hook to add stack trace capability
    Interceptor.attach(fcloseWrapper.ptr, {
      onEnter: function(args) {
        const filePtr = args[0];
        log(`[NATIVE][STACK] fclose(${filePtr}) called from:`);

        // Extract stack trace
        try {
          const Thread = Java.use('java.lang.Thread');
          const thread = Thread.$new();
          const stackTrace = thread.currentThread().getStackTrace();

          if (stackTrace.length > 0) {
            log(`[NATIVE][STACK] Stack trace (first 5 frames):`);
            stackTrace.slice(0, 5).forEach((element, index) => {
              log(`[NATIVE][STACK]   [${index}] ${element.toString()}`);
            });
          }
        } catch (e) {
          log(`[NATIVE][STACK] Failed to extract stack trace: ${e}`);
        }
      }
    });

    global.fclose = fcloseWrapper.function;
    log('[+] fclose wrapper created and exposed globally');
  } else {
    log('[!] fclose wrapper creation failed');
  }

  // ========================================
  // 5. chmod wrapper (file permissions)
  // ========================================

  const chmodWrapper = createNativeFunctionWrapper(
    'chmod',
    'int',
    ['pointer', 'int'],
    'libc'
  );

  if (chmodWrapper.success && chmodWrapper.function) {
    // Hook to add stack trace capability
    Interceptor.attach(chmodWrapper.ptr, {
      onEnter: function(args) {
        const path = args[0].readCString();
        const mode = args[1].toInt32();
        log(`[NATIVE][STACK] chmod("${path}", 0o${mode.toString(16)}) called from:`);

        // Extract stack trace
        try {
          const Thread = Java.use('java.lang.Thread');
          const thread = Thread.$new();
          const stackTrace = thread.currentThread().getStackTrace();

          if (stackTrace.length > 0) {
            log(`[NATIVE][STACK] Stack trace (first 5 frames):`);
            stackTrace.slice(0, 5).forEach((element, index) => {
              log(`[NATIVE][STACK]   [${index}] ${element.toString()}`);
            });
          }
        } catch (e) {
          log(`[NATIVE][STACK] Failed to extract stack trace: ${e}`);
        }
      },
      onLeave: function(retval) {
        const result = retval.toInt32();
        log(`[NATIVE][STACK] chmod returned: ${result} (0=success)`);
      }
    });

    global.chmod = chmodWrapper.function;
    log('[+] chmod wrapper created and exposed globally');
  } else {
    log('[!] chmod wrapper creation failed');
  }

  // ========================================
  // 6. Android System Properties Wrappers
  // ========================================

  log('[6/5] Creating Android system properties wrappers...');

  /**
   * Hook __system_property_get (getprop)
   */
  Java.perform(() => {
    try {
      const getpropPtr = Module.getExportByName('libc', '__system_property_get');

      if (getpropPtr) {
        const getprop = new NativeFunction(
          getpropPtr,
          'int',
          ['pointer', 'pointer', 'pointer']
        );

        // Hook with stack trace
        Interceptor.attach(getpropPtr, {
          onEnter: function(args) {
            const key = args[0].readCString();
            log(`[NATIVE][PROP] getprop("${key}") called from:`);

            // Extract stack trace
            try {
              const Thread = Java.use('java.lang.Thread');
              const thread = Thread.$new();
              const stackTrace = thread.currentThread().getStackTrace();

              if (stackTrace.length > 0) {
                log(`[NATIVE][PROP] Stack trace (first 3 frames):`);
                stackTrace.slice(0, 3).forEach((element, index) => {
                  log(`[NATIVE][PROP]   [${index}] ${element.toString()}`);
                });
              }
            } catch (e) {
              log(`[NATIVE][PROP] Failed to extract stack trace: ${e}`);
            }
          },
          onLeave: function(retval) {
            const result = retval.toInt32();
            log(`[NATIVE][PROP] getprop returned: ${result}`);
          }
        });

        global.getprop = getprop;
        log('[+] getprop wrapper created and exposed globally');
      } else {
        log('[!] __system_property_get not found');
      }
    } catch (error) {
      log(`[ERROR] Failed to create getprop wrapper: ${error}`);
    }
  });

  /**
   * Hook __system_property_set (setprop)
   */
  Java.perform(() => {
    try {
      const setpropPtr = Module.getExportByName('libc', '__system_property_set');

      if (setpropPtr) {
        const setprop = new NativeFunction(
          setpropPtr,
          'int',
          ['pointer', 'pointer', 'pointer']
        );

        // Hook with stack trace
        Interceptor.attach(setpropPtr, {
          onEnter: function(args) {
            const key = args[0].readCString();
            const value = args[1] ? args[1].readCString() : null;
            log(`[NATIVE][PROP] setprop("${key}", "${value}") called from:`);

            // Extract stack trace
            try {
              const Thread = Java.use('java.lang.Thread');
              const thread = Thread.$new();
              const stackTrace = thread.currentThread().getStackTrace();

              if (stackTrace.length > 0) {
                log(`[NATIVE][PROP] Stack trace (first 3 frames):`);
                stackTrace.slice(0, 3).forEach((element, index) => {
                  log(`[NATIVE][PROP]   [${index}] ${element.toString()}`);
                });
              }
            } catch (e) {
              log(`[NATIVE][PROP] Failed to extract stack trace: ${e}`);
            }
          },
          onLeave: function(retval) {
            const result = retval.toInt32();
            log(`[NATIVE][PROP] setprop returned: ${result}`);
          }
        });

        global.setprop = setprop;
        log('[+] setprop wrapper created and exposed globally');
      } else {
        log('[!] __system_property_set not found');
      }
    } catch (error) {
      log(`[ERROR] Failed to create setprop wrapper: ${error}`);
    }
  });

  // ========================================
  // 7. Demo Functions
  // ========================================

  log('[7/5] Creating demo functions...');

  /**
   * Demo: Create directory using mkdir wrapper
   */
  function demoMkdir() {
    log('[DEMO] Creating test directory with mkdir wrapper...');

    const testPath = Memory.allocUtf8String('/data/local/tmp/frida_test_dir');
    const result = global.mkdir(testPath);

    log(`[DEMO] mkdir("${testPath}") returned: ${result} (0=success, -1=error)`);

    if (result === 0) {
      log('[DEMO] ✓ Directory created successfully');

      // Verify creation with stat
      const statResult = global.stat(testPath);
      log(`[DEMO] stat("${testPath}") returned: ${statResult} (0=exists)`);
    } else {
      log('[DEMO] ✗ Directory creation failed');
    }

    return result;
  }

  /**
   * Demo: File operations using fopen/fclose wrappers
   */
  function demoFileOperations() {
    log('[DEMO] Performing file operations with wrappers...');

    const testFile = '/data/local/tmp/frida_test_file.txt';
    const testContent = Memory.allocUtf8String('Frida Native Wrapper Test\nCreated by android-native-wrapper.js\n');

    // Write file
    const filePtr = global.fopen(testFile, 'w');
    if (!filePtr.isNull()) {
      // Write content
      const writeResult = filePtr.writeUtf8String(testContent);
      log(`[DEMO] Writing to file: ${writeResult} bytes written`);

      // Close file
      const closeResult = global.fclose(filePtr);
      log(`[DEMO] fclose() returned: ${closeResult} (0=success)`);
    } else {
      log('[DEMO] ✗ Failed to open file for writing');
    }
  }

  /**
   * Demo: System property operations using getprop/setprop wrappers
   */
  function demoSystemProperties() {
    log('[DEMO] Testing system property wrappers...');

    // Test reading a property
    const roDebuggableKey = Memory.allocUtf8String('ro.debuggable');
    const debugValue = global.getprop(roDebuggableKey, null, null);

    log(`[DEMO] getprop("ro.debuggable") returned: "${debugValue}"`);

    // Test setting a property (this would require root, so we just demonstrate the API)
    log('[DEMO] Note: setprop requires root privileges, demonstrating API only');
    log(`[DEMO] setprop("test.prop", "test-value") would be called like:`);
    log(`[DEMO]   const result = global.setprop(Memory.allocUtf8String("test.prop"), Memory.allocUtf8String("test-value"), null);`);
    log(`[DEMO] This would set test.prop=test-value temporarily`);
  }

  // ========================================
  // 8. Initialization and Summary
  // ========================================

  log('[8/5] Native function wrappers initialized');
  log('[INFO] Available global NativeFunctions:');
  log('[INFO]   - global.mkdir(path)');
  log('[INFO]   - global.stat(path)');
  log('[INFO]   - global.fopen(filename, mode)');
  log('[INFO]   - global.fclose(file)');
  log('[INFO]   - global.chmod(path, mode)');
  log('[INFO]   - global.getprop(key, value, default)');
  log('[INFO]   - global.setprop(key, value, default)');
  log('');
  log('[INFO] All wrappers include stack trace extraction capabilities');
  log('');
  log('[DEMO] Running demo functions...');
  demoMkdir();
  demoFileOperations();
  demoSystemProperties();
  log('');
  log('[READY] Native function wrappers are ready for use');
});
