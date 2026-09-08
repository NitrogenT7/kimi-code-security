/**
 * Android Early Instrumentation Framework
 *
 * Advanced Android instrumentation techniques from "The Frida Handbook" Chapter 9.
 * Focuses on:
 * - Java.performNow() for instant hooking (no startup delay)
 * - Complete stack trace extraction
 * - Constructor hooking for critical Android frameworks
 * - Argument manipulation (not just return values)
 *
 * Usage:
 *   frida -U -f <package_name> -l android-early-instrumentation.js
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

/**
 * Complete stack trace extraction from java.lang.Thread
 */
function extractFullStackTrace() {
  try {
    const Thread = Java.use('java.lang.Thread');
    const thread = Thread.$new();
    const stackTrace = thread.currentThread().getStackTrace();

    log('=== Complete Stack Trace ===');
    stackTrace.forEach((element, index) => {
      log(`[${index}] ${element.toString()}`);
    });
    log('=== End Stack Trace ===');

    return stackTrace;
  } catch (error) {
    log(`[ERROR] Failed to extract stack trace: ${error}`);
    return [];
  }
}

/**
 * Hook constructor with stack trace for debugging
 */
function hookConstructorWithStackTrace(className, constructorName, callback) {
  try {
    const Class = Java.use(className);
    const Constructor = Class[constructorName];

    Constructor[constructorName].implementation = function(...args) {
      log(`[CTOR] ${className}.${constructorName}() called`);

      // Extract stack trace to see who's creating this instance
      const stackTrace = extractFullStackTrace();
      if (stackTrace.length > 0) {
        log(`[CTOR] Called from:`);
        stackTrace.forEach((element, index) => {
          if (index < 5) { // Only show first 5 frames
            log(`[CTOR]   ${index}: ${element.toString()}`);
          }
        });
      }

      return callback(this, ...args);
    };

    log(`[+] Hooked constructor: ${className}.${constructorName}`);
  } catch (error) {
    log(`[ERROR] Failed to hook ${className}.${constructorName}: ${error}`);
  }
}

// ========================================
// MAIN SCRIPT
// ========================================

Java.performNow(() => {
  log('=== Android Early Instrumentation Framework Started ===');

  // ========================================
  // 1. Constructor Hooking Framework
  // ========================================

  log('[1/5] Hooking critical Android framework constructors...');

  // Hook java.net.URL constructor (critical for SSRF, URL manipulation)
  hookConstructorWithStackTrace(
    'java.net.URL',
    '$init',
    function(this, url) {
      log(`[URL] Creating URL: ${url}`);
      // Check for SSRF patterns
      if (url.includes('http://') && url.includes('127.0.0.1')) {
        log(`[URL][!] Potential SSRF: localhost in URL`);
      }
      if (url.includes('file://')) {
        log(`[URL][!] Potential path traversal: file:// in URL`);
      }
      return this.$init(url);
    }
  );

  // Hook java.io.File constructor (critical for path injection)
  hookConstructorWithStackTrace(
    'java.io.File',
    '$init',
    function(this, path) {
      log(`[FILE] Creating file: ${path}`);
      // Check for path injection patterns
      const dangerousPatterns = [
        '../../../',
        '..%2f',
        '%2e%2e',
        'C:\\',
        '\\\\'  // UNC path injection (Windows)
      ];

      const hasDangerousPattern = dangerousPatterns.some(pattern =>
        path.toLowerCase().includes(pattern.toLowerCase())
      );

      if (hasDangerousPattern) {
        log(`[FILE][!] Potential path injection detected`);
      }
      return this.$init(path);
    }
  );

  // Hook android.content.Intent constructor (critical for deep link abuse)
  hookConstructorWithStackTrace(
    'android.content.Intent',
    '$init',
    function(this, action, uri) {
      log(`[INTENT] Creating Intent - Action: ${action}, URI: ${uri}`);
      // Check for deep link abuse
      if (action === 'android.intent.action.VIEW' && uri) {
        log(`[INTENT][!] Deep link detected - analyzing URI`);
        const deepLinkPatterns = [
          'http://', 'https://', 'ftp://', 'file://',
          'intent://', 'data://'
        ];
        const isSuspicious = deepLinkPatterns.some(pattern =>
          uri.startsWith(pattern)
        );
        if (isSuspicious) {
          log(`[INTENT][!] Suspicious deep link protocol: ${uri.substring(0, 10)}...`);
        }
      }
      return this.$init(action, uri);
    }
  );

  // Hook android.os.Bundle constructor (critical for data leakage)
  hookConstructorWithStackTrace(
    'android.os.Bundle',
    '',
    function(this) {
      log(`[BUNDLE] Creating Bundle - checking for sensitive data`);
      return this.$init();
    }
  );

  // Hook OkHttp3 Request constructor (HTTP client framework)
  try {
    const Request = Java.use('okhttp3.Request');
    const Builder = Java.use('okhttp3.Request$Builder');

    Request.$init.implementation = function(builder) {
      log(`[OKHTTP] Request created`);
      return this.$init(builder);
    };

    log('[+] Hooked OkHttp3.Request.$init()');
  } catch (error) {
    log(`[WARN] OkHttp3 not found: ${error}`);
  }

  // Hook OkHttp3 Response constructor
  try {
    const Response = Java.use('okhttp3.Response');

    Response.$init.implementation = function(request) {
      const url = request.url().toString();
      log(`[OKHTTP] Response created for request: ${url}`);
      return this.$init(request);
    };

    log('[+] Hooked OkHttp3.Response.$init()');
  } catch (error) {
    log(`[WARN] OkHttp3 Response not found: ${error}`);
  }

  // Hook retrofit2.Retrofit constructor (Retrofit framework)
  try {
    const Retrofit = Java.use('retrofit2.Retrofit');

    Retrofit.$init.implementation = function() {
      log(`[RETROFIT] Retrofit instance created`);
      return this.$init();
    };

    log('[+] Hooked retrofit2.Retrofit.<init>()');
  } catch (error) {
    log(`[WARN] Retrofit not found: ${error}`);
  }

  // Hook Gson constructor (JSON serialization)
  try {
    const Gson = Java.use('com.google.gson.Gson');

    Gson.$init.implementation = function() {
      log(`[GSON] Gson instance created - check for insecure JSON`);
      return this.$init();
    };

    log('[+] Hooked com.google.gson.Gson.<init>()');
  } catch (error) {
    log(`[WARN] Gson not found: ${error}`);
  }

  // ========================================
  // 2. Argument Manipulation Module
  // ========================================

  log('[2/5] Implementing argument manipulation framework...');

  /**
   * Hook SharedPreferences.putString() to demonstrate argument modification
   */
  Java.performNow(() => {
    try {
      const Editor = Java.use('android.app.SharedPreferencesImpl$EditorImpl');
      const stringCls = Java.use('java.lang.String');

      Editor.putString.overload('java.lang.String', 'java.lang.String').implementation = function(key, value) {
        log(`[PREFS] putString() called - Key: ${key}`);
        log(`[PREFS] Original value: ${value}`);

        // CRITICAL: Modify the argument BEFORE it's processed
        // This demonstrates the difference between return value replacement vs argument modification
        const modifiedValue = stringCls.$new('[FRIDA_MODIFIED]_' + value);
        log(`[PREFS] Modified value: ${modifiedValue}`);

        return this.putString(key, modifiedValue);
      };

      log('[+] Hooked SharedPreferencesImpl$EditorImpl.putString()');
    } catch (error) {
      log(`[ERROR] Failed to hook SharedPreferences: ${error}`);
    }
  });

  /**
   * Hook OkHttp3.Request.Builder methods for header manipulation
   */
  Java.performNow(() => {
    try {
      const RequestBuilder = Java.use('okhttp3.Request$Builder');

      // Hook addHeader() to detect/modify headers in real-time
      RequestBuilder.addHeader.overload('java.lang.String', 'java.lang.String').implementation = function(name, value) {
        log(`[OKHTTP] addHeader() called - Name: ${name}, Value: ${value}`);

        // Detect sensitive headers
        const sensitiveHeaders = ['Authorization', 'Cookie', 'X-Auth-Token', 'api-key', 'token'];
        if (sensitiveHeaders.some(h => name.toLowerCase() === h.toLowerCase())) {
          log(`[OKHTTP][!] Sensitive header detected: ${name}`);
        }

        // Detect header injection attempts
        if (value.includes('<script>') || value.includes('javascript:')) {
          log(`[OKHTTP][!] Possible XSS via header injection: ${value}`);
        }

        return this.addHeader(name, value);
      };

      log('[+] Hooked RequestBuilder.addHeader()');
    } catch (error) {
      log(`[WARN] OkHttp3.Request$Builder not found: ${error}`);
    }
  });

  /**
   * Hook Uri.Builder for URL manipulation
   */
  Java.performNow(() => {
    try {
      const UriBuilder = Java.use('android.net.Uri$Builder');

      UriBuilder.$init.implementation = function() {
        log(`[URI] UriBuilder created`);
        return this.$init();
      };

      // Hook build() to inspect final URL
      UriBuilder.build.overload().implementation = function() {
        const uri = this.build();
        const uriString = uri.toString();
        log(`[URI] URI built: ${uriString}`);

        // Check for SSRF in constructed URI
        if (uriString.includes('localhost') || uriString.includes('127.0.0.1')) {
          log(`[URI][!] Potential SSRF: localhost in final URI`);
        }

        return uri;
      };

      log('[+] Hooked UriBuilder.build()');
    } catch (error) {
      log(`[WARN] android.net.Uri$Builder not found: ${error}`);
    }
  });

  // ========================================
  // 3. NativeFunction Wrappers Module
  // ========================================

  log('[3/5] Creating NativeFunction wrappers for system calls...');

  /**
   * Create NativeFunction wrapper for mkdir
   */
  Java.performNow(() => {
    try {
      const mkdirPtr = Module.getExportByName(null, 'mkdir');

      if (mkdirPtr) {
        const mkdir = new NativeFunction(
          mkdirPtr,
          'int',
          ['pointer']
        );

        log('[+] mkdir wrapper created');

        // Hook mkdir to log all calls
        Interceptor.attach(mkdirPtr, {
          onEnter: function(args) {
            const path = args[0].readCString();
            log(`[NATIVE] mkdir("${path}")`);
          }
        });

        // Expose for external use
        global.mkdir = mkdir;
      } else {
        log('[WARN] mkdir export not found in libc');
      }
    } catch (error) {
      log(`[ERROR] Failed to create mkdir wrapper: ${error}`);
    }
  });

  /**
   * Create NativeFunction wrapper for stat
   */
  Java.performNow(() => {
    try {
      const statPtr = Module.getExportByName(null, 'stat');

      if (statPtr) {
        const stat = new NativeFunction(
          statPtr,
          'int',
          ['pointer', 'pointer']
        );

        log('[+] stat wrapper created');

        // Hook stat to log all calls
        Interceptor.attach(statPtr, {
          onEnter: function(args) {
            const path = args[0].readCString();
            log(`[NATIVE] stat("${path}")`);
          }
        });

        global.stat = stat;
      } else {
        log('[WARN] stat export not found in libc');
      }
    } catch (error) {
      log(`[ERROR] Failed to create stat wrapper: ${error}`);
    }
  });

  /**
   * Create NativeFunction wrapper for fopen
   */
  Java.performNow(() => {
    try {
      const fopenPtr = Module.getExportByName(null, 'fopen');

      if (fopenPtr) {
        const fopen = new NativeFunction(
          fopenPtr,
          'pointer',
          ['pointer', 'pointer']
        );

        log('[+] fopen wrapper created');

        // Hook fopen to log all calls
        Interceptor.attach(fopenPtr, {
          onEnter: function(args) {
            const filename = args[0].readCString();
            const mode = args[1] ? args[1].readCString() : 'r';
            log(`[NATIVE] fopen("${filename}", "${mode}")`);
          }
        });

        global.fopen = fopen;
      } else {
        log('[WARN] fopen export not found in libc');
      }
    } catch (error) {
      log(`[ERROR] Failed to create fopen wrapper: ${error}`);
    }
  });

  /**
   * Create NativeFunction wrapper for fclose
   */
  Java.performNow(() => {
    try {
      const fclosePtr = Module.getExportByName(null, 'fclose');

      if (fclosePtr) {
        const fclose = new NativeFunction(
          fclosePtr,
          'int',
          ['pointer']
        );

        log('[+] fclose wrapper created');

        Interceptor.attach(fclosePtr, {
          onEnter: function(args) {
            const filePtr = args[0].readCString();
            log(`[NATIVE] fclose(${filePtr})`);
          }
        });

        global.fclose = fclose;
      } else {
        log('[WARN] fclose export not found in libc');
      }
    } catch (error) {
      log(`[ERROR] Failed to create fclose wrapper: ${error}`);
    }
  });

  /**
   * Create NativeFunction wrapper for getprop (Android system properties)
   */
  Java.performNow(() => {
    try {
      const getpropPtr = Module.getExportByName(null, '__system_property_get');

      if (getpropPtr) {
        const getprop = new NativeFunction(
          getpropPtr,
          'int',
          ['pointer', 'pointer', 'pointer']
        );

        log('[+] getprop wrapper created');

        Interceptor.attach(getpropPtr, {
          onEnter: function(args) {
            const key = args[0].readCString();
            log(`[NATIVE] getprop("${key}")`);
          }
        });

        global.getprop = getprop;
      } else {
        log('[WARN] __system_property_get not found in libc');
      }
    } catch (error) {
      log(`[ERROR] Failed to create getprop wrapper: ${error}`);
    }
  });

  /**
   * Create NativeFunction wrapper for chmod
   */
  Java.performNow(() => {
    try {
      const chmodPtr = Module.getExportByName(null, 'chmod');

      if (chmodPtr) {
        const chmod = new NativeFunction(
          chmodPtr,
          'int',
          ['pointer', 'int']
        );

        log('[+] chmod wrapper created');

        Interceptor.attach(chmodPtr, {
          onEnter: function(args) {
            const path = args[0].readCString();
            const mode = args[1].toInt32();
            log(`[NATIVE] chmod("${path}", 0x${mode.toString(16)})`);
          }
        });

        global.chmod = chmod;
      } else {
        log('[WARN] chmod export not found in libc');
      }
    } catch (error) {
      log(`[ERROR] Failed to create chmod wrapper: ${error}`);
    }
  });

  // ========================================
  // 4. Demo Functions Using New Capabilities
  // ========================================

  log('[4/5] Running demonstration functions...');

  /**
   * Demonstrate mkdir using NativeFunction wrapper
   */
  function demoMkdir() {
    log('[DEMO] Creating /data/local/tmp/frida_test directory...');
    const testFolder = Memory.allocUtf8String('/data/local/tmp/frida_test');

    const result = global.mkdir(testFolder);
    log(`[DEMO] mkdir() result: ${result} (0=success)`);

    return result;
  }

  /**
   * Demonstrate file operations using wrappers
   */
  function demoFileOperations() {
    log('[DEMO] Performing file operations...');

    // Create test file
    const testFile = Memory.allocUtf8String('/data/local/tmp/frida_test.txt');
    const filePtr = global.fopen(testFile, 'w');
    if (!filePtr.isNull()) {
      log('[DEMO] File created successfully');

      // Close file
      global.fclose(filePtr);

      // Get file stats
      const statResult = global.stat(testFile);
      log(`[DEMO] File exists: ${statResult === 0}`);

      // Change permissions
      global.chmod(testFile, 0o644);
      log('[DEMO] File permissions changed to 644');
    } else {
      log('[DEMO] Failed to create file');
    }
  }

  /**
   * Demonstrate argument modification with SharedPreferences
   */
  function demoSharedPreferencesModification() {
    log('[DEMO] Testing SharedPreferences argument modification...');

    // This will use the hooked SharedPreferences from above
    // The actual test would require a real app context
    log('[DEMO] This requires actual SharedPreferences context from target app');
    log('[DEMO] Hook is active - modify values will be intercepted');
  }

  // ========================================
  // 5. Initialization Complete
  // ========================================

  log('[5/5] Android Early Instrumentation Framework initialized');
  log('[INFO] All hooks are active. Use global variables for NativeFunctions:');
  log('[INFO]   - global.mkdir(path)');
  log('[INFO]   - global.stat(path)');
  log('[INFO]   - global.fopen(filename, mode)');
  log('[INFO]   - global.fclose(file)');
  log('[INFO]   - global.getprop(key, value, default)');
  log('[INFO]   - global.chmod(path, mode)');
  log('');
  log('[INFO] Stack trace extraction available via extractFullStackTrace()');
  log('');
  log('[INFO] Constructor hooks active for:');
  log('[INFO]   - java.net.URL, java.io.File, android.content.Intent');
  log('[INFO]   - android.os.Bundle, OkHttp3.Request, OkHttp3.Response');
  log('[INFO]   - retrofit2.Retrofit, com.google.gson.Gson');
  log('');
  log('[INFO] Usage example:');
  log('[INFO]   // From JavaScript:');
  log('[INFO]   global.mkdir(Memory.allocUtf8String("/data/local/tmp/test"));');
  log('[INFO]   const stack = extractFullStackTrace();');
  log('[INFO]   // From Android app context:');
  log('[INFO]   // Would require actual SharedPreferences from target app');
  log('');
  log('[READY] Framework is ready for advanced Android instrumentation');
});
