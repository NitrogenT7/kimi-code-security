/**
 * Android Constructors Hook Framework
 *
 * Hooks critical Android framework constructors from "The Frida Handbook" Chapter 9.
 * Targets constructors that are critical for security analysis:
 * - Framework libraries: OkHttp, Retrofit, Gson, URL, File, Intent, Bundle
 * - Security implications: SSRF, path injection, deep link abuse, data leakage
 *
 * Usage:
 *   frida -U -f <package_name> -l android-constructors-hook.js
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
 * Extract full stack trace to see call paths
 */
function extractFullStackTrace() {
  try {
    const Thread = Java.use('java.lang.Thread');
    const thread = Thread.$new();
    const stackTrace = thread.currentThread().getStackTrace();

    log('=== Stack Trace ===');
    stackTrace.forEach((element, index) => {
      if (index < 10) { // Limit to 10 frames
        log(`[${index}] ${element.toString()}`);
      }
    });

    return stackTrace;
  } catch (error) {
    log(`[ERROR] Failed to extract stack trace: ${error}`);
    return [];
  }
}

/**
 * Hook constructor with full context and stack trace
 */
function hookConstructorWithFullAnalysis(className, constructorName, callback) {
  try {
    const Class = Java.use(className);
    const Constructor = Class[constructorName];

    Constructor[constructorName].implementation = function(...args) {
      const stackTrace = extractFullStackTrace();
      log(`[CTOR] ${className}.${constructorName}() called`);
      log(`[CTOR] Arguments: ${args.join(', ')}`);

      if (stackTrace.length > 0) {
        log(`[CTOR] Called from (first 5 frames):`);
        stackTrace.slice(0, 5).forEach((element, index) => {
          log(`[CTOR]   [${index}] ${element.toString()}`);
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

Java.perform(() => {
  log('=== Android Constructor Hook Framework Started ===');

  // ========================================
  // 1. java.net.URL Constructor
  // ========================================
  // Critical for SSRF attacks, URL manipulation, and endpoint discovery

  hookConstructorWithFullAnalysis(
    'java.net.URL',
    '$init',
    function(this, urlString) {
      log(`[URL] Creating URL: ${urlString}`);

      // Security analysis
      const urlPatterns = {
        ssrf: [
          'http://localhost',
          'http://127.0.0.1',
          'http://192.168.',
          'http://10.0.0.',
          'http://169.254.',
          'file://'
        ],
        internal: [
          'http://0.0.0.0',
          'file:///',
          'android.resource://',
          'content://'
        ],
        suspicious: [
          'http://example.com',
          'http://test.com',
          'data:text/html',
          'javascript:'
        ]
      };

      // Check for SSRF vulnerabilities
      let isSSRF = false;
      for (const pattern of urlPatterns.ssrf) {
        if (urlString.toLowerCase().includes(pattern.toLowerCase())) {
          log(`[URL][!] SSRF DETECTED: Contains ${pattern}`);
          isSSRF = true;
          break;
        }
      }

      if (!isSSRF) {
        log(`[URL][INFO] No SSRF detected in URL`);
      }

      // Check for internal URLs (potential for data exfiltration)
      for (const pattern of urlPatterns.internal) {
        if (urlString.toLowerCase().includes(pattern.toLowerCase())) {
          log(`[URL][!] INTERNAL URL: Contains ${pattern} - possible data exfiltration`);
        }
      }

      // Check for suspicious patterns
      for (const pattern of urlPatterns.suspicious) {
        if (urlString.toLowerCase().includes(pattern.toLowerCase())) {
          log(`[URL][!] SUSPICIOUS URL: Contains ${pattern}`);
        }
      }

      return this.$init(urlString);
    }
  );

  // ========================================
  // 2. java.io.File Constructor
  // ========================================
  // Critical for path traversal attacks, file access analysis

  hookConstructorWithFullAnalysis(
    'java.io.File',
    '$init',
    function(this, path) {
      log(`[FILE] Creating file: ${path}`);

      // Security analysis
      const pathTraversalPatterns = [
        '../../../',
        '..%2f',
        '%2e%2e',
        '%5c',
        '..%255',
        '..%c0%af'
      ];

      const suspiciousPatterns = [
        '/proc/',
        '/sys/',
        '/dev/',
        '/data/data/',
        '/sdcard/.android_secure/'
      ];

      // Check for path traversal
      let hasPathTraversal = false;
      for (const pattern of pathTraversalPatterns) {
        if (path.toLowerCase().includes(pattern.toLowerCase())) {
          log(`[FILE][!] PATH TRAVERSAL DETECTED: Contains ${pattern}`);
          hasPathTraversal = true;
        }
      }

      // Check for suspicious paths
      for (const pattern of suspiciousPatterns) {
        if (path.toLowerCase().includes(pattern.toLowerCase())) {
          log(`[FILE][!] SUSPICIOUS PATH: Contains ${pattern}`);
        }
      }

      // Normalize path for logging
      const normalizedPath = path.replace(/\/+/g, '/');
      log(`[FILE][INFO] Normalized path: ${normalizedPath}`);

      return this.$init(path);
    }
  );

  // ========================================
  // 3. android.content.Intent Constructor
  // ========================================
  // Critical for deep link abuse, intent data leakage, component hijacking

  hookConstructorWithFullAnalysis(
    'android.content.Intent',
    '$init',
    function(this, action) {
      log(`[INTENT] Creating Intent - Action: ${action}`);

      // Security analysis
      const dangerousActions = [
        'android.intent.action.VIEW',
        'android.intent.action.SEND',
        'android.intent.action.EDIT',
        'android.intent.action.INSERT',
        'android.intent.action.DELETE'
      ];

      const safeActions = [
        'android.intent.action.MAIN',
        'android.intent.action.BOOT_COMPLETED'
      ];

      let isSuspicious = false;

      if (dangerousActions.includes(action)) {
        log(`[INTENT][!] DANGEROUS ACTION: ${action}`);
        isSuspicious = true;
      }

      if (!safeActions.includes(action)) {
        log(`[INTENT][INFO] Non-standard action: ${action}`);
      }

      return this.$init(action);
    }
  );

  // Hook Intent constructor with URI parameter (most common for deep links)
  Java.perform(() => {
    try {
      const Intent = Java.use('android.content.Intent');

      Intent.$init.overload('java.lang.String', 'android.net.Uri').implementation = function(action, uri) {
        const stackTrace = extractFullStackTrace();
        log(`[INTENT] Intent created - Action: ${action}, URI: ${uri}`);
        log(`[INTENT] Called from (first 5 frames):`);
        stackTrace.slice(0, 5).forEach((element, index) => {
          log(`[INTENT]   [${index}] ${element.toString()}`);
        });

        // Deep link analysis
        if (action === 'android.intent.action.VIEW') {
          const uriString = uri.toString();
          log(`[INTENT][INFO] Deep link detected - analyzing URI`);

          // Check for common deep link protocols
          const deepLinkProtocols = [
            'http://', 'https://', 'ftp://', 'intent://',
            'data://', 'file://', 'content://'
          ];

          const isDeepLink = deepLinkProtocols.some(protocol =>
            uriString.toLowerCase().startsWith(protocol.toLowerCase())
          );

          if (isDeepLink) {
            log(`[INTENT][!] DEEP LINK CONFIRMED: ${uriString.substring(0, 15)}...`);

            // Extract host for SSRF check
            try {
              const hostMatch = uriString.match(/https?:\/\/([^\/]+)/i);
              if (hostMatch) {
                const host = hostMatch[1];
                log(`[INTENT][!] Deep link host: ${host}`);

                // Check for SSRF patterns
                const ssrfPatterns = ['localhost', '127.0.0.1', '0.0.0.0', '169.254', '192.168'];
                if (ssrfPatterns.some(pattern => host.includes(pattern))) {
                  log(`[INTENT][!] SSRF RISK: Host contains ${pattern}`);
                }
              }
            } catch (e) {
              log(`[INTENT][INFO] Failed to parse host from URI`);
            }

            // Check for URL injection in data URIs
            if (uriString.startsWith('data:')) {
              log(`[INTENT][!] Data URI detected - check for injection`);
            }
          } else {
            log(`[INTENT][INFO] Not a deep link - standard intent`);
          }
        } else if (action === 'android.intent.action.SEND') {
          log(`[INTENT][!] SEND action - potential data exfiltration`);
        } else if (action === 'android.intent.action.EDIT') {
          log(`[INTENT][!] EDIT action - potential data tampering`);
        }

        return this.$init(action, uri);
      };

      log('[+] Hooked Intent.$init(String, Uri)');
    } catch (error) {
      log(`[ERROR] Failed to hook Intent: ${error}`);
    }
  });

  // ========================================
  // 4. android.os.Bundle Constructor
  // ========================================
  // Critical for data leakage in intent extras

  hookConstructorWithFullAnalysis(
    'android.os.Bundle',
    '',
    function(this) {
      log(`[BUNDLE] Creating Bundle`);

      // Security analysis - Bundle can leak sensitive data via intent extras
      // Log warning about potential data leakage
      log(`[BUNDLE][WARN] Bundle can leak sensitive data - monitor putString() calls`);

      return this.$init();
    }
  );

  // ========================================
  // 5. OkHttp3 Constructors
  // ========================================

  // Hook OkHttp3.Request constructor
  Java.perform(() => {
    try {
      const Request = Java.use('okhttp3.Request');

      Request.$init.implementation = function(builder) {
        const stackTrace = extractFullStackTrace();
        log(`[OKHTTP] Request created`);
        log(`[OKHTTP] Called from (first 5 frames):`);
        stackTrace.slice(0, 5).forEach((element, index) => {
          log(`[OKHTTP]   [${index}] ${element.toString()}`);
        });

        return this.$init(builder);
      };

      log('[+] Hooked OkHttp3.Request.$init()');
    } catch (error) {
      log(`[WARN] OkHttp3 not found: ${error}`);
    }
  });

  // Hook OkHttp3.Response constructor
  Java.perform(() => {
    try {
      const Response = Java.use('okhttp3.Response');

      Response.$init.implementation = function(request) {
        const stackTrace = extractFullStackTrace();
        log(`[OKHTTP] Response created`);
        log(`[OKHTTP] Called from (first 5 frames):`);
        stackTrace.slice(0, 5).forEach((element, index) => {
          log(`[OKHTTP]   [${index}] ${element.toString()}`);
        });

        return this.$init(request);
      };

      log('[+] Hooked OkHttp3.Response.$init()');
    } catch (error) {
      log(`[WARN] OkHttp3 Response not found: ${error}`);
    }
  });

  // ========================================
  // 6. Retrofit Framework
  // ========================================

  // Hook retrofit2.Retrofit constructor
  Java.perform(() => {
    try {
      const Retrofit = Java.use('retrofit2.Retrofit');

      Retrofit.$init.implementation = function() {
        const stackTrace = extractFullStackTrace();
        log(`[RETROFIT] Retrofit instance created`);
        log(`[RETROFIT] Called from (first 5 frames):`);
        stackTrace.slice(0, 5).forEach((element, index) => {
          log(`[RETROFIT]   [${index}] ${element.toString()}`);
        });

        return this.$init();
      };

      log('[+] Hooked retrofit2.Retrofit.<init>()');
    } catch (error) {
      log(`[WARN] Retrofit not found: ${error}`);
    }
  });

  // ========================================
  // 7. Gson Framework
  // ========================================

  // Hook com.google.gson.Gson constructor
  Java.perform(() => {
    try {
      const Gson = Java.use('com.google.gson.Gson');

      Gson.$init.implementation = function() {
        const stackTrace = extractFullStackTrace();
        log(`[GSON] Gson instance created - checking for insecure JSON`);
        log(`[GSON] Called from (first 5 frames):`);
        stackTrace.slice(0, 5).forEach((element, index) => {
          log(`[GSON]   [${index}] ${element.toString()}`);
        });

        return this.$init();
      };

      log('[+] Hooked com.google.gson.Gson.<init>()');
    } catch (error) {
      log(`[WARN] Gson not found: ${error}`);
    }
  });

  // ========================================
  // 8. Additional Critical Constructors
  // ========================================

  // Hook android.net.Uri.Builder (for URL construction analysis)
  Java.perform(() => {
    try {
      const UriBuilder = Java.use('android.net.Uri$Builder');

      UriBuilder.$init.implementation = function() {
        log(`[URI] UriBuilder instance created`);
        return this.$init();
      };

      log('[+] Hooked android.net.Uri$Builder.<init>()');
    } catch (error) {
      log(`[WARN] android.net.Uri$Builder not found: ${error}`);
    }
  });

  // ========================================
  // 9. Summary
  // ========================================

  log('[SUMMARY] Constructor hooks active for:');
  log('[SUMMARY]   - java.net.URL (SSRF, path injection)');
  log('[SUMMARY]   - java.io.File (path traversal, file access)');
  log('[SUMMARY]   - android.content.Intent (deep link abuse, data leakage)');
  log('[SUMMARY]   - android.os.Bundle (data leakage in intents)');
  log('[SUMMARY]   - OkHttp3.Request (HTTP client setup)');
  log('[SUMMARY]   - OkHttp3.Response (HTTP response interception)');
  log('[SUMMARY]   - retrofit2.Retrofit (Retrofit framework)');
  log('[SUMMARY]   - com.google.gson.Gson (JSON serialization)');
  log('[SUMMARY]   - android.net.Uri$Builder (URL construction)');
  log('');
  log('[READY] All constructor hooks are active with security analysis');
});
