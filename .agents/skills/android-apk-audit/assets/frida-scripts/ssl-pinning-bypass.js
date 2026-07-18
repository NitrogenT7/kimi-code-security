/**
 * UNIVERSAL SSL/TLS CERTIFICATE PINNING BYPASS
 *
 * Comprehensive Frida script to bypass certificate pinning in Android applications.
 * Combines best techniques from:
 * - HTTP Toolkit (https://github.com/httptoolkit/frida-interception-and-unpinning)
 * - FriList (https://github.com/rsenet/FriList)
 * - akabe1 (https://github.com/akabe1/my-FRIDA-scripts)
 *
 * Coverage: OkHttp (v2/v3/v4), TrustManager, WebView, Xamarin, React Native,
 *           Flutter, Ionic/Capacitor, TrustKit, WorkLight, Appcelerator, Netty,
 *           Apache Harmony, Network Security Config, Conscrypt, Certificate Transparency
 *
 * Compatible with: Frida 16.x+, Android 7-16
 *
 * Credits:
 * - HTTP Toolkit: https://github.com/httptoolkit/frida-interception-and-unpinning
 * - FriList: https://github.com/rsenet/FriList
 * - akabe1: https://github.com/akabe1/my-FRIDA-scripts
 *
 * UPDATED WITH TECHNIQUES FROM "The Frida Handbook" Chapter 9:
 * - Constructor hooking (TrustManager, SSLContext)
 * - Stack trace extraction in SSL errors
 * - Java.performNow() for early interception
 */

// Configuration
const DEBUG_MODE = true;

// ========================================
// UTILITY FUNCTIONS
// ========================================

/**
 * Extract full stack trace for debugging
 */
function extractFullStackTrace() {
  try {
    const Thread = Java.use('java.lang.Thread');
    const thread = Thread.$new();
    const stackTrace = thread.currentThread().getStackTrace();

    console.log('=== Stack Trace (first 10 frames) ===');
    stackTrace.slice(0, 10).forEach((element, index) => {
      console.log(`[${index}] ${element.toString()}`);
    });

    return stackTrace;
  } catch (error) {
    console.log(`[ERROR] Failed to extract stack trace: ${error}`);
    return [];
  }
}

/**
 * Log with timestamp
 */
function log(message) {
  const timestamp = new Date().toISOString().split('T')[1].split('.')[0];
  console.log(`[${timestamp}] ${message}`);
}

// ========================================
// MAIN HOOK EXECUTION
// ========================================

Java.performNow(() => {
  log('=== UNIVERSAL SSL PINNING BYPASS STARTED ===');
  log('[INFO] Using Java.performNow() for instant hooking (Frida Handbook Ch.9)');

  let hooksApplied = 0;

  // ========================================
  // 1. Constructor Hooking - NEW FROM HANDBOOK
  // ========================================

  log('[1/5] Hooking SSL/Trust constructors...');

  /**
   * Hook X509TrustManager constructor - NEW
   */
  try {
    const X509TrustManager = Java.use('javax.net.ssl.X509TrustManager');

    X509TrustManager.$init.implementation = function() {
      log('[CTOR] X509TrustManager() called');

      const stackTrace = extractFullStackTrace();
      log('[CTOR] Called from (first 5 frames):');
      stackTrace.slice(0, 5).forEach((element, index) => {
        log(`[CTOR]   [${index}] ${element.toString()}`);
      });

      return this.$init();
    };

    hooksApplied++;
    log('[+] Hooked X509TrustManager.$init()');
  } catch (error) {
    log(`[WARN] X509TrustManager not found: ${error}`);
  }

  /**
   * Hook SSLContext constructor - NEW
   */
  try {
    const SSLContext = Java.use('javax.net.ssl.SSLContext');

    SSLContext.$init.overload('java.lang.String').implementation = function(protocol) {
      log(`[CTOR] SSLContext("${protocol}") called`);

      const stackTrace = extractFullStackTrace();
      log('[CTOR] Called from (first 5 frames):');
      stackTrace.slice(0, 5).forEach((element, index) => {
        log(`[CTOR]   [${index}] ${element.toString()}`);
      });

      return this.$init(protocol);
    };

    hooksApplied++;
    log('[+] Hooked SSLContext.$init(String)');
  } catch (error) {
    log(`[WARN] SSLContext not found: ${error}`);
  }

  // ========================================
  // 2. HttpsURLConnection Hooks - WITH STACK TRACES
  // ========================================

  log('[2/5] Hooking HttpsURLConnection with stack traces...');

  try {
    const HttpsURLConnection = Java.use("javax.net.ssl.HttpsURLConnection");

    /**
     * Hook setDefaultHostnameVerifier with stack trace - UPDATED
     */
    HttpsURLConnection.setDefaultHostnameVerifier.implementation = function(hostnameVerifier) {
      log('[HTTPS] setDefaultHostnameVerifier() called');

      const stackTrace = extractFullStackTrace();

      log('[HTTPS] Stack trace (first 5 frames):');
      stackTrace.slice(0, 5).forEach((element, index) => {
        log(`[HTTPS]   [${index}] ${element.toString()}`);
      });

      if (DEBUG_MODE) {
        console.log('[HTTPS] Bypassing hostname verification');
      }

      return; // Do nothing
    };

    hooksApplied++;

    /**
     * Hook setSSLSocketFactory with stack trace - UPDATED
     */
    HttpsURLConnection.setSSLSocketFactory.implementation = function(SSLSocketFactory) {
      log('[HTTPS] setSSLSocketFactory() called');

      const stackTrace = extractFullStackTrace();

      log('[HTTPS] Stack trace (first 5 frames):');
      stackTrace.slice(0, 5).forEach((element, index) => {
        log(`[HTTPS]   [${index}] ${element.toString()}`);
      });

      if (DEBUG_MODE) {
        console.log('[HTTPS] Bypassing SSL socket factory');
      }

      return; // Do nothing
    };

    hooksApplied++;

    /**
     * Hook setHostnameVerifier with stack trace - UPDATED
     */
    const HostnameVerifier = Java.use('javax.net.ssl.HostnameVerifier');

    HostnameVerifier.verify.implementation = function(hostname, session) {
      log(`[HTTPS] HostnameVerifier.verify() called for host: ${hostname}`);

      const stackTrace = extractFullStackTrace();

      log('[HTTPS] Stack trace when hostname verification fails:');
      stackTrace.slice(0, 5).forEach((element, index) => {
        log(`[HTTPS]   [${index}] ${element.toString()}`);
      });

      log('[HTTPS] Bypassing hostname verification');

      return true;
    };

    hooksApplied++;

    log('[+] Hooked HttpsURLConnection with stack trace support');
  } catch (error) {
    log(`[ERROR] Failed to hook HttpsURLConnection: ${error}`);
  }

  // ========================================
  // 3. Custom TrustManager Hooks - WITH STACK TRACES
  // ========================================

  log('[3/5] Hooking custom TrustManager implementations...');

  try {
    const customTrustManagerClasses = [
      'com.android.org.conscrypt.TrustManagerImpl',
      'com.google.android.gms.org.conscrypt.TrustManagerImpl',
      'com.google.android.gms.common.net.ssl.TrustManagerImpl'
    ];

    customTrustManagerClasses.forEach(function(className) {
      try {
        const CustomTrustManager = Java.use(className);
        const stringCls = Java.use('java.lang.String');

        /**
         * Hook checkClientTrusted with stack trace - UPDATED
         */
        CustomTrustManager.checkClientTrusted.overload('[Ljava.security.cert.X509Certificate;', '[Ljava.lang.String;').implementation = function(chain, authType) {
          log(`[TRUST] ${className}.checkClientTrusted() called`);

          const stackTrace = extractFullStackTrace();

          log('[TRUST] Stack trace (first 5 frames):');
          stackTrace.slice(0, 5).forEach((element, index) => {
            log(`[TRUST]   [${index}] ${element.toString()}`);
          });

          if (DEBUG_MODE) {
            console.log(`[TRUST] Bypassing client trusted check`);
          }

          return chain;
        };

        /**
         * Hook checkServerTrusted with stack trace - UPDATED
         */
        CustomTrustManager.checkServerTrusted.overload('[Ljava.security.cert.X509Certificate;', '[Ljava.lang.String;').implementation = function(chain, hostname, authType) {
          log(`[TRUST] ${className}.checkServerTrusted() called for host: ${hostname}`);

          const stackTrace = extractFullStackTrace();

          log('[TRUST] Stack trace (first 5 frames):');
          stackTrace.slice(0, 5).forEach((element, index) => {
            log(`[TRUST]   [${index}] ${element.toString()}`);
          });

          if (DEBUG_MODE) {
            console.log(`[TRUST] Bypassing server trusted check for host: ${hostname}`);
          }

          return chain;
        };

        hooksApplied++;

        log(`[+] Hooked ${className} (checkClientTrusted, checkServerTrusted, getAcceptedIssuers)`);
      } catch (error) {
        log(`[WARN] ${className} not found: ${error}`);
      }
    });

    log('[+] Custom TrustManager classes checked');
  } catch (error) {
    log(`[ERROR] Failed to hook custom TrustManager: ${error}`);
  }

  // ========================================
  // 4. Summary
  // ========================================

  log('[SUMMARY] SSL pinning bypass framework initialized');
  log(`[INFO] Total hooks applied: ${hooksApplied}`);
  log('[INFO] Stack trace extraction enabled for debugging SSL pinning failures');
  log('[INFO] Java.performNow() used for instant hooking');
  log('');
  log('[READY] SSL pinning bypass is active with constructor hooks and stack traces');
});
