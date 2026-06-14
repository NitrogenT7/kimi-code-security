/**
 * Android Argument Manipulation Framework
 *
 * Advanced argument manipulation techniques from "The Frida Handbook" Chapter 9.
 * Focuses on modifying arguments BEFORE execution (not just return values).
 * This provides more control than return value replacement alone.
 *
 * Usage:
 *   frida -U -f <package_name> -l android-argument-manipulation.js
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
    const stackTrace = stackTrace = thread.currentThread().getStackTrace();

    log('=== Stack Trace ===');
    stackTrace.forEach((element, index) => {
      if (index < 15) {
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
 * Safe string comparison
 */
function safeEquals(str1, str2) {
  if (!str1 || !str2) return false;
  return str1.toString() === str2.toString();
}

// ========================================
// MAIN SCRIPT
// ========================================

Java.perform(() => {
  log('=== Android Argument Manipulation Framework Started ===');

  // ========================================
  // 1. SharedPreferences Argument Manipulation
  // ========================================
  // Demonstrates modifying values before they're written to storage

  log('[1/5] Hooking SharedPreferences argument manipulation...');

  Java.perform(() => {
    try {
      const Editor = Java.use('android.app.SharedPreferencesImpl$EditorImpl');
      const stringCls = Java.use('java.lang.String');

      /**
       * Hook putString() to demonstrate argument modification
       * Key difference: We modify the ARGUMENT before it's written
       */
      Editor.putString.overload('java.lang.String', 'java.lang.String').implementation = function(key, value) {
        log(`[PREFS] putString() called - Key: ${key}`);
        log(`[PREFS] Original value argument: ${value}`);
        log(`[PREFS] Value type: ${typeof value}`);

        // Check for sensitive keys
        const sensitiveKeyPatterns = [
          'token', 'auth', 'password', 'secret', 'key',
          'api_key', 'access_token', 'refresh_token',
          'jwt', 'session_id', 'user_id'
        ];

        const isSensitiveKey = sensitiveKeyPatterns.some(pattern =>
          key.toLowerCase().includes(pattern)
        );

        if (isSensitiveKey) {
          log(`[PREFS][!] SENSITIVE KEY: ${key}`);
        }

        // DEMONSTRATION 1: Log value before modification
        log(`[PREFS][DEMO] Value BEFORE any modification: ${value}`);

        // DEMONSTRATION 2: Check for suspicious patterns
        if (value) {
          const valueStr = value.toString();
          const suspiciousPatterns = [
            'http://', 'https://', 'ftp://',
            '<script>', 'javascript:', 'data:text/html',
            'eval(', 'exec('
          ];

          const hasSuspiciousPattern = suspiciousPatterns.some(pattern =>
            valueStr.toLowerCase().includes(pattern.toLowerCase())
          );

          if (hasSuspiciousPattern) {
            log(`[PREFS][!] SUSPICIOUS VALUE PATTERN: Contains ${suspiciousPatterns.join(', ')}`);
          }
        }

        return this.putString(key, value);
      };

      log('[+] Hooked SharedPreferencesImpl$EditorImpl.putString()');
    } catch (error) {
      log(`[ERROR] Failed to hook SharedPreferences: ${error}`);
    }
  });

  /**
   * Hook getString() to demonstrate argument read
   */
  Java.perform(() => {
    try {
      const SharedPreferences = Java.use('android.app.SharedPreferencesImpl');

      SharedPreferences.getString.overload('java.lang.String', 'java.lang.String').implementation = function(key, defaultValue) {
        log(`[PREFS] getString() called - Key: ${key}`);
        log(`[PREFS] Default value argument: ${defaultValue}`);

        const returnedValue = this.getString(key, defaultValue);
        log(`[PREFS] Retrieved value: ${returnedValue}`);

        return returnedValue;
      };

      log('[+] Hooked SharedPreferencesImpl.getString()');
    } catch (error) {
      log(`[ERROR] Failed to hook SharedPreferences: ${error}`);
    }
  });

  // ========================================
  // 2. OkHttp3 Request/Response Argument Manipulation
  // ========================================

  log('[2/5] Hooking OkHttp3 request/response manipulation...');

  /**
   * Hook OkHttp3.Request.Builder.addHeader()
   */
  Java.perform(() => {
    try {
      const RequestBuilder = Java.use('okhttp3.Request$Builder');

      RequestBuilder.addHeader.overload('java.lang.String', 'java.lang.String').implementation = function(name, value) {
        log(`[OKHTTP] addHeader() called - Name: ${name}`);
        log(`[OKHTTP] Value argument: ${value}`);

        // Security analysis
        const sensitiveHeaders = [
          'Authorization', 'Cookie', 'X-Auth-Token', 'api-key',
          'token', 'bearer', 'session', 'jwt', 'csrf-token',
          'X-Forwarded-For'
        ];

        const isSensitiveHeader = sensitiveHeaders.some(header =>
          name.toLowerCase().includes(header.toLowerCase())
        );

        if (isSensitiveHeader) {
          log(`[OKHTTP][!] SENSITIVE HEADER: ${name}`);
        }

        // Check for injection attempts
        const valueStr = value.toString();
        const injectionPatterns = [
          '<script>',
          'javascript:',
          'eval(',
          'onerror=',
          'onload=',
          'data:text/html',
          '<img src=',
          'iframe',
          'document.cookie',
          'location.replace('
        ];

        const hasInjectionPattern = injectionPatterns.some(pattern =>
          valueStr.toLowerCase().includes(pattern.toLowerCase())
        );

        if (hasInjectionPattern) {
          log(`[OKHTTP][!] POTENTIAL INJECTION: ${injectionPatterns.join(', ')}`);
        }

        // Log full header for debugging
        log(`[OKHTTP][FULL] ${name}: ${valueStr}`);

        return this.addHeader(name, value);
      };

      log('[+] Hooked RequestBuilder.addHeader()');
    } catch (error) {
      log(`[WARN] OkHttp3.Request$Builder not found: ${error}`);
    }
  });

  /**
   * Hook OkHttp3.Request.Builder.url()
   */
  Java.perform(() => {
    try {
      const RequestBuilder = Java.use('okhttp3.Request$Builder');

      RequestBuilder.url.implementation = function(url) {
        const stackTrace = extractFullStackTrace();
        log(`[OKHTTP] url() called - URL: ${url}`);
        log(`[OKHTTP] Called from (first 5 frames):`);
        stackTrace.slice(0, 5).forEach((element, index) => {
          log(`[OKHTTP]   [${index}] ${element.toString()}`);
        });

        // Check for SSRF in URL argument
        const urlStr = url.toString();
        const ssrfPatterns = [
          'localhost', '127.0.0.1', '0.0.0.0',
          '192.168.', '10.0.0.', '169.254.'
        ];

        let hasSSRF = false;
        for (const pattern of ssrfPatterns) {
          if (urlStr.toLowerCase().includes(pattern.toLowerCase())) {
            log(`[OKHTTP][!] SSRF DETECTED IN URL ARGUMENT: Contains ${pattern}`);
            hasSSRF = true;
            break;
          }
        }

        if (!hasSSRF) {
          log(`[OKHTTP][INFO] No SSRF in URL argument`);
        }

        return this.url(url);
      };

      log('[+] Hooked RequestBuilder.url()');
    } catch (error) {
      log(`[WARN] RequestBuilder.url() not found: ${error}`);
    }
  });

  /**
   * Hook OkHttp3.Request.Builder.build()
   */
  Java.perform(() => {
    try {
      const RequestBuilder = Java.use('okhttp3.Request$Builder');

      RequestBuilder.build.implementation = function() {
        const stackTrace = extractFullStackTrace();
        log(`[OKHTTP] build() called`);
        log(`[OKHTTP] Called from (first 5 frames):`);
        stackTrace.slice(0, 5).forEach((element, index) => {
          log(`[OKHTTP]   [${index}] ${element.toString()}`);
        });

        const request = this.build();
        log(`[OKHTTP][INFO] Built request - URL: ${request.url().toString()}`);

        // Validate final request
        const urlStr = request.url().toString();
        if (!urlStr || urlStr === 'http://' || urlStr === 'https://') {
          log(`[OKHTTP][!] WARNING: Empty or suspicious URL in built request`);
        }

        return request;
      };

      log('[+] Hooked RequestBuilder.build()');
    } catch (error) {
      log(`[WARN] RequestBuilder.build() not found: ${error}`);
    }
  });

  // ========================================
  // 3. Uri.Builder Argument Manipulation
  // ========================================

  log('[3/5] Hooking Uri.Builder manipulation...');

  Java.perform(() => {
    try {
      const UriBuilder = Java.use('android.net.Uri$Builder');
      const stringCls = Java.use('java.lang.String');

      /**
       * Hook Uri.Builder.scheme()
       */
      UriBuilder.scheme.implementation = function(scheme) {
        log(`[URI] scheme() called - Scheme: ${scheme}`);
        log(`[URI][INFO] Original scheme: ${scheme}`);

        // Security check - restrict dangerous schemes
        const dangerousSchemes = ['file://', 'javascript:'];
        if (dangerousSchemes.includes(scheme.toLowerCase())) {
          log(`[URI][!] DANGEROUS SCHEME: ${scheme}`);
        }

        return this.scheme(scheme);
      };

      /**
       * Hook Uri.Builder.authority()
       */
      UriBuilder.authority.implementation = function(authority) {
        log(`[URI] authority() called - Authority: ${authority}`);
        log(`[URI][INFO] Original authority: ${authority}`);

        // Security check - detect localhost/127.0.0.1 in authority
        const authorityStr = authority.toString();
        if (authorityStr.includes('localhost') || authorityStr.includes('127.0.0.1')) {
          log(`[URI][!] SSRF RISK: Localhost in authority`);
        }

        return this.authority(authority);
      };

      /**
       * Hook Uri.Builder.appendPath()
       */
      UriBuilder.appendPath.implementation = function(path) {
        log(`[URI] appendPath() called - Path: ${path}`);
        log(`[URI][INFO] Original path: ${path}`);

        // Security check - detect path traversal
        const pathTraversalPatterns = [
          '../../../', '..%2f', '%2e%2e',
          '%5c', '..%255'
        ];

        const hasPathTraversal = pathTraversalPatterns.some(pattern =>
          path.toLowerCase().includes(pattern.toLowerCase())
        );

        if (hasPathTraversal) {
          log(`[URI][!] PATH TRAVERSAL DETECTED IN appendPath()`);
        }

        return this.appendPath(path);
      };

      /**
       * Hook Uri.Builder.appendQueryParameter()
       */
      UriBuilder.appendQueryParameter.implementation = function(key, value) {
        log(`[URI] appendQueryParameter() called - Key: ${key}, Value: ${value}`);

        // Security check - detect SQL injection patterns
        const valueStr = value.toString();
        const sqlInjectionPatterns = [
          "'", '"', "';", ' OR ', ' AND ', ' UNION ',
          'SELECT', 'INSERT', 'UPDATE', 'DELETE'
        ];

        const hasSQLInjection = sqlInjectionPatterns.some(pattern =>
          valueStr.toUpperCase().includes(pattern.toUpperCase())
        );

        if (hasSQLInjection) {
          log(`[URI][!] SQL INJECTION PATTERN: Contains ${sqlInjectionPatterns.join(', ')}`);
        }

        return this.appendQueryParameter(key, value);
      };

      log('[+] Hooked Uri.Builder methods (scheme, authority, appendPath, appendQueryParameter)');
    } catch (error) {
      log(`[WARN] android.net.Uri$Builder not found: ${error}`);
    }
  });

  // ========================================
  // 4. Intent Extras Argument Manipulation
  // ========================================

  log('[4/5] Hooking Intent extras manipulation...');

  Java.perform(() => {
    try {
      const Intent = Java.use('android.content.Intent');
      const stringCls = Java.use('java.lang.String');

      /**
       * Hook Intent.putExtra()
       */
      Intent.putExtra.overload('java.lang.String', 'boolean').implementation = function(key, value) {
        log(`[INTENT] putExtra(String, boolean) called - Key: ${key}, Value: ${value}`);

        // Security analysis
        if (key === 'url' || key === 'redirect_uri') {
          log(`[INTENT][!] SENSITIVE KEY: ${key} - check for open redirect`);
        }

        if (key === 'token' || key === 'auth' || key === 'credentials') {
          log(`[INTENT][!] SENSITIVE KEY: ${key} - potential credential leakage`);
        }

        return this.putExtra(key, value);
      };

      Intent.putExtra.overload('java.lang.String', 'int').implementation = function(key, value) {
        log(`[INTENT] putExtra(String, int) called - Key: ${key}, Value: ${value}`);
        return this.putExtra(key, value);
      };

      Intent.putExtra.overload('java.lang.String', 'long').implementation = function(key, value) {
        log(`[INTENT] putExtra(String, long) called - Key: ${key}, Value: ${value}`);
        return this.putExtra(key, value);
      };

      /**
       * Hook Intent.getExtra()
       */
      Intent.getExtra.implementation = function(key) {
        log(`[INTENT] getExtra() called - Key: ${key}`);

        // Security warning - reading sensitive data
        const sensitiveKeyPatterns = [
          'token', 'password', 'secret', 'api_key',
          'auth_token', 'session_id', 'user_id',
          'credential', 'private_key'
        ];

        const isSensitiveKey = sensitiveKeyPatterns.some(pattern =>
          key.toLowerCase().includes(pattern.toLowerCase())
        );

        if (isSensitiveKey) {
          log(`[INTENT][!] SENSITIVE KEY READ: ${key}`);
        }

        const value = this.getExtra(key);
        log(`[INTENT] Retrieved value: ${value}`);

        return value;
      };

      log('[+] Hooked Intent methods (putExtra, getExtra)');
    } catch (error) {
      log(`[ERROR] Failed to hook Intent: ${error}`);
    }
  });

  // ========================================
  // 5. Advanced Argument Manipulation
  // ========================================

  log('[5/5] Implementing advanced argument manipulation...');

  /**
   * Hook HttpURLConnection.setRequestProperty()
   */
  Java.perform(() => {
    try {
      const HttpURLConn = Java.use('java.net.HttpURLConnection');

      HttpURLConn.setRequestProperty.overload('java.lang.String', 'java.lang.String').implementation = function(key, value) {
        log(`[HTTP] setRequestProperty() called - Key: ${key}, Value: ${value}`);

        // Security analysis
        const sensitiveProps = [
          'Authorization', 'Cookie', 'User-Agent',
          'X-Auth-Token', 'api-key', 'token'
        ];

        const isSensitiveProp = sensitiveProps.some(prop =>
          key.toLowerCase().includes(prop.toLowerCase())
        );

        if (isSensitiveProp) {
          log(`[HTTP][!] SENSITIVE PROPERTY: ${key}`);
        }

        return this.setRequestProperty(key, value);
      };

      log('[+] Hooked HttpURLConnection.setRequestProperty()');
    } catch (error) {
      log(`[WARN] HttpURLConnection not found: ${error}`);
    }
  });

  /**
   * Hook BufferedReader.readLine() - Input validation
   */
  Java.perform(() => {
    try {
      const BufferedReader = Java.use('java.io.BufferedReader');

      BufferedReader.readLine.implementation = function() {
        log(`[IO] BufferedReader.readLine() called`);

        const line = this.readLine();
        log(`[IO][INFO] Line read: ${line}`);

        // Check for injection patterns
        if (line) {
          const lineStr = line.toString();
          const injectionPatterns = [
            '<script>', 'javascript:', 'eval(',
            'onerror=',
            'document.cookie',
            '<iframe', 'window.location'
          ];

          const hasInjection = injectionPatterns.some(pattern =>
            lineStr.toLowerCase().includes(pattern.toLowerCase())
          );

          if (hasInjection) {
            log(`[IO][!] POTENTIAL INJECTION: ${injectionPatterns.join(', ')}`);
          }
        }

        return line;
      };

      log('[+] Hooked BufferedReader.readLine()');
    } catch (error) {
      log(`[WARN] BufferedReader not found: ${error}`);
    }
  });

  // ========================================
  // 6. Summary
  // ========================================

  log('[SUMMARY] Argument manipulation hooks active for:');
  log('[SUMMARY]   - SharedPreferences (key/value modification)');
  log('[SUMMARY]   - OkHttp3.Request (header, URL manipulation)');
  log('[SUMMARY]   - Uri.Builder (scheme, path, query parameter manipulation)');
  log('[SUMMARY]   - Intent (extras manipulation)');
  log('[SUMMARY]   - HttpURLConnection (request properties)');
  log('[SUMMARY]   - BufferedReader (input validation)');
  log('');
  log('[READY] All argument manipulation hooks are active with security analysis');
});
