/*
 * Universal WebView Debug + SSL Pinning Bypass
 *
 * Description:
 * Enables WebView debugging for all hybrid frameworks and bypasses SSL pinning
 *
 * Supported Frameworks:
 * - Native Android WebView
 * - Cordova
 * - Ionic
 * - Capacitor
 * - React Native WebView
 * - Flutter WebView
 *
 * SSL Bypass covers:
 * - SSLContext.init
 * - OkHttp3
 * - Trustkit
 * - TrustManagerImpl
 * - Appcelerator
 * - Android 7+ certificate checks
 *
 * Usage: frida -U -f com.target.app -l webview-debug.js
 */

// Configuration
var ENABLE_DEBUG = true;
var ENABLE_SSL_BYPASS = true;
var VERBOSE_LOGGING = true;

Java.perform(function() {
    console.log('');
    console.log('===');
    console.log('[*] Universal WebView Debug + SSL Bypass Script');
    console.log('===');
    console.log('');

    // ==========================================
    // 1. NATIVE ANDROID WEBVIEW
    // ==========================================
    if (ENABLE_DEBUG) {
        try {
            console.log('[+] Hooking Native Android WebView...');
            var WebView = Java.use('android.webkit.WebView');

            // Hook WebView constructor with Context
            WebView.$init.overload('android.content.Context').implementation = function(ctx) {
                this.$init(ctx);
                try {
                    this.setWebContentsDebuggingEnabled(true);
                    if (VERBOSE_LOGGING) {
                        console.log('[+] Native WebView debug enabled (Context constructor)');
                    }
                } catch(e) {
                    if (VERBOSE_LOGGING) {
                        console.log('[-] Failed to enable debug: ' + e);
                    }
                }
            };

            // Hook WebView constructor with Context + AttributeSet
            WebView.$init.overload('android.content.Context', 'android.util.AttributeSet').implementation = function(ctx, attrs) {
                this.$init(ctx, attrs);
                try {
                    this.setWebContentsDebuggingEnabled(true);
                    if (VERBOSE_LOGGING) {
                        console.log('[+] Native WebView debug enabled (Context + AttributeSet constructor)');
                    }
                } catch(e) {
                    if (VERBOSE_LOGGING) {
                        console.log('[-] Failed to enable debug: ' + e);
                    }
                }
            };

            // Hook WebView constructor with Context + AttributeSet + int
            WebView.$init.overload('android.content.Context', 'android.util.AttributeSet', 'int').implementation = function(ctx, attrs, defStyleAttr) {
                this.$init(ctx, attrs, defStyleAttr);
                try {
                    this.setWebContentsDebuggingEnabled(true);
                    if (VERBOSE_LOGGING) {
                        console.log('[+] Native WebView debug enabled (Context + AttributeSet + defStyleAttr constructor)');
                    }
                } catch(e) {
                    if (VERBOSE_LOGGING) {
                        console.log('[-] Failed to enable debug: ' + e);
                    }
                }
            };

            // Hook loadUrl to ensure debug is enabled on every load
            WebView.loadUrl.overload('java.lang.String').implementation = function(url) {
                try {
                    this.setWebContentsDebuggingEnabled(true);
                    if (VERBOSE_LOGGING) {
                        console.log('[+] WebView debug re-enabled for URL: ' + url.toString());
                    }
                } catch(e) {}
                return this.loadUrl.overload('java.lang.String').call(this, url);
            };

            console.log('[*] Native Android WebView hooks installed');
        } catch(e) {
            console.log('[-] Failed to hook Native WebView: ' + e);
        }
    }

    // ==========================================
    // 2. CORDOVA WEBVIEW
    // ==========================================
    if (ENABLE_DEBUG) {
        try {
            console.log('[+] Hooking Cordova WebView...');

            // Hook SystemWebView (Cordova)
            var SystemWebView = Java.use('org.apache.cordova.engine.SystemWebView');
            SystemWebView.$init.overload('android.content.Context').implementation = function(ctx) {
                this.$init(ctx);
                try {
                    this.setWebContentsDebuggingEnabled(true);
                    console.log('[+] Cordova SystemWebView debug enabled');
                } catch(e) {}
            };

            // Hook CordovaWebView (older versions)
            var CordovaWebView = Java.use('org.apache.cordova.CordovaWebView');
            CordovaWebView.init.implementation = function() {
                this.init();
                try {
                    this.setWebContentsDebuggingEnabled(true);
                    console.log('[+] CordovaWebView debug enabled');
                } catch(e) {}
            };

            console.log('[*] Cordova WebView hooks installed');
        } catch(e) {
            console.log('[-] Cordova not detected or hook failed: ' + e);
        }
    }

    // ==========================================
    // 3. IONIC WEBVIEW
    // ==========================================
    if (ENABLE_DEBUG) {
        try {
            console.log('[+] Hooking Ionic WebView...');
            var IonicWebViewEngine = Java.use('com.ionicframework.common.IonicWebViewEngine');

            IonicWebViewEngine.init.implementation = function() {
                this.init();
                try {
                    this.getWebView().setWebContentsDebuggingEnabled(true);
                    console.log('[+] Ionic WebView debug enabled');
                } catch(e) {}
            };

            console.log('[*] Ionic WebView hooks installed');
        } catch(e) {
            console.log('[-] Ionic not detected or hook failed: ' + e);
        }
    }

    // ==========================================
    // 4. CAPACITOR WEBVIEW
    // ==========================================
    if (ENABLE_DEBUG) {
        try {
            console.log('[+] Hooking Capacitor WebView...');
            var CapacitorWebView = Java.use('com.getcapacitor.BridgeWebView');
            var CapacitorWebViewClient = Java.use('com.getcapacitor.BridgeWebViewClient');

            CapacitorWebView.$init.overload('android.content.Context').implementation = function(ctx) {
                this.$init(ctx);
                try {
                    this.setWebContentsDebuggingEnabled(true);
                    console.log('[+] Capacitor BridgeWebView debug enabled');
                } catch(e) {}
            };

            CapacitorWebViewClient.onPageStarted.implementation = function(view, url, favicon) {
                try {
                    view.setWebContentsDebuggingEnabled(true);
                    if (VERBOSE_LOGGING) {
                        console.log('[+] Capacitor WebView debug enabled for: ' + url);
                    }
                } catch(e) {}
                return this.onPageStarted(view, url, favicon);
            };

            console.log('[*] Capacitor WebView hooks installed');
        } catch(e) {
            console.log('[-] Capacitor not detected or hook failed: ' + e);
        }
    }

    // ==========================================
    // 5. REACT NATIVE WEBVIEW
    // ==========================================
    if (ENABLE_DEBUG) {
        try {
            console.log('[+] Hooking React Native WebView...');
            var RNCWebViewManager = Java.use('com.reactnativecommunity.webview.RNCWebViewManager');
            var RNCWebView = Java.use('com.reactnativecommunity.webview.RNCWebView');

            RNCWebViewManager.createViewInstance.implementation = function(reactContext) {
                var view = this.createViewInstance(reactContext);
                try {
                    view.setWebContentsDebuggingEnabled(true);
                    console.log('[+] React Native WebView debug enabled');
                } catch(e) {}
                return view;
            };

            console.log('[*] React Native WebView hooks installed');
        } catch(e) {
            console.log('[-] React Native WebView not detected or hook failed: ' + e);
        }
    }

    // ==========================================
    // 6. FLUTTER WEBVIEW PLUGIN
    // ==========================================
    if (ENABLE_DEBUG) {
        try {
            console.log('[+] Hooking Flutter WebView...');
            var WebViewFlutterPlugin = Java.use('io.flutter.plugins.webviewflutter.WebViewFlutterPlugin');
            var FlutterWebView = Java.use('io.flutter.plugins.webviewflutter.WebViewFlutterPlugin$1');

            FlutterWebView.onMethodCall.implementation = function(call, result) {
                try {
                    if (this.webView != null) {
                        this.webView.setWebContentsDebuggingEnabled(true);
                        console.log('[+] Flutter WebView debug enabled');
                    }
                } catch(e) {}
                return this.onMethodCall(call, result);
            };

            console.log('[*] Flutter WebView hooks installed');
        } catch(e) {
            console.log('[-] Flutter WebView not detected or hook failed: ' + e);
        }
    }

    // ==========================================
    // SSL PINNING BYPASS
    // ==========================================
    if (ENABLE_SSL_BYPASS) {
        console.log('');
        console.log('===');
        console.log('[*] Injecting hooks into common certificate pinning methods');
        console.log('===');
        console.log('');

        var X509TrustManager = Java.use('javax.net.ssl.X509TrustManager');
        var SSLContext = Java.use('javax.net.ssl.SSLContext');

        // Build fake trust manager
        var TrustManager = Java.registerClass({
            name: 'com.audit.TrustManager_' + Date.now(),
            implements: [X509TrustManager],
            methods: {
                checkClientTrusted: function(chain, authType) {
                    if (VERBOSE_LOGGING) {
                        console.log('[SSL] checkClientTrusted bypassed');
                    }
                },
                checkServerTrusted: function(chain, authType) {
                    if (VERBOSE_LOGGING) {
                        console.log('[SSL] checkServerTrusted bypassed for: ' + chain[0].getSubjectDN());
                    }
                },
                getAcceptedIssuers: function() {
                    return [];
                }
            }
        });

        // Pass our own custom trust manager through when requested
        var TrustManagers = [TrustManager.$new()];
        var SSLContext_init = SSLContext.init.overload(
            '[Ljavax.net.ssl.KeyManager;', '[Ljavax.net.ssl.TrustManager;', 'java.security.SecureRandom'
        );

        SSLContext_init.implementation = function(keyManager, trustManager, secureRandom) {
            if (VERBOSE_LOGGING) {
                console.log('[SSL] Intercepted TrustManager request');
            }
            SSLContext_init.call(this, keyManager, TrustManagers, secureRandom);
        };

        console.log('[*] Setup custom TrustManager');

        // OkHttp3 and OkHttp4 (same package name)
        try {
            var CertificatePinner = Java.use('okhttp3.CertificatePinner');
            CertificatePinner.check.overload('java.lang.String', 'java.util.List').implementation = function(hostname, peerCertificates) {
                if (VERBOSE_LOGGING) {
                    console.log('[SSL] Intercepted OkHttp CertificatePinner for: ' + hostname);
                }
                return;
            };
            console.log('[*] Setup OkHttp CertificatePinner bypass (covers both OkHttp 3.x and 4.x)');
            console.log('[*] Note: OkHttp 4.x uses the same package name (okhttp3) as OkHttp 3.x due to Kotlin migration. A single hook covers both.');
        } catch(err) {
            console.log('[-] Unable to hook into OkHttp pinner: ' + err);
        }

        // Trustkit
        try {
            var Activity = Java.use("com.datatheorem.android.trustkit.pinning.OkHostnameVerifier");
            Activity.verify.overload('java.lang.String', 'javax.net.ssl.SSLSession').implementation = function(hostname, session) {
                if (VERBOSE_LOGGING) {
                    console.log('[SSL] Intercepted Trustkit (SSLSession) for: ' + hostname);
                }
                return true;
            };
            Activity.verify.overload('java.lang.String', 'java.security.cert.X509Certificate').implementation = function(hostname, cert) {
                if (VERBOSE_LOGGING) {
                    console.log('[SSL] Intercepted Trustkit (X509Certificate) for: ' + hostname);
                }
                return true;
            };
            console.log('[*] Setup TrustKit bypass');
        } catch(err) {
            console.log('[-] Unable to hook into TrustKit pinner: ' + err);
        }

        // TrustManagerImpl (Android 7+)
        try {
            var TrustManagerImpl = Java.use('com.android.org.conscrypt.TrustManagerImpl');
            TrustManagerImpl.verifyChain.implementation = function(untrustedChain, trustAnchorChain, host, clientAuth, ocspData, tlsSctData) {
                if (VERBOSE_LOGGING) {
                    console.log('[SSL] Intercepted TrustManagerImpl for: ' + host);
                }
                return untrustedChain;
            };
            console.log('[*] Setup TrustManagerImpl bypass');
        } catch (err) {
            console.log('[-] Unable to hook into TrustManagerImpl: ' + err);
        }

        // Appcelerator
        try {
            var PinningTrustManager = Java.use('appcelerator.https.PinningTrustManager');
            PinningTrustManager.checkServerTrusted.implementation = function() {
                if (VERBOSE_LOGGING) {
                    console.log('[SSL] Intercepted Appcelerator PinningTrustManager');
                }
            };
            console.log('[*] Setup Appcelerator bypass');
        } catch (err) {
            console.log('[-] Unable to hook into Appcelerator pinning: ' + err);
        }

        // Netty
        try {
            var NettyTrustManager = Java.use('io.netty.handler.ssl.util.InsecureTrustManagerFactory');
            console.log('[*] Netty TrustManager detected');
        } catch (err) {}

        // Bypass SSL pinning for Android 7+ (checkTrustedRecursive)
        try {
            var array_list = Java.use("java.util.ArrayList");
            var ApiClient = Java.use('com.android.org.conscrypt.TrustManagerImpl');
            ApiClient.checkTrustedRecursive.implementation = function(a1, a2, a3, a4, a5, a6) {
                if (VERBOSE_LOGGING) {
                    console.log('[SSL] Bypassing Android 7+ checkTrustedRecursive');
                }
                var k = array_list.$new();
                return k;
            };
            console.log('[*] Setup Android 7+ checkTrustedRecursive bypass');
        } catch (err) {
            try {
                // Alternative for Android 8+
                var TrustManagerImpl8 = Java.use('com.android.org.conscrypt.TrustManagerImpl');
                TrustManagerImpl8.checkTrustedRecursive.implementation = function(certs, ocspData, tlsSctData, host, clientAuth, constraints) {
                    if (VERBOSE_LOGGING) {
                        console.log('[SSL] Bypassing Android 8+ checkTrustedRecursive for: ' + host);
                    }
                    var k = array_list.$new();
                    return k;
                };
            } catch (err2) {
                console.log('[-] Unable to bypass Android 7+ pinning: ' + err2);
            }
        }

        // NetworkSecurityConfig (Android 7.0+)
        try {
            var NetworkSecurityConfig = Java.use('android.security.NetworkSecurityConfig');
            console.log('[*] NetworkSecurityConfig detected');
        } catch (err) {}
    }

    // ==========================================
    // FINAL INSTRUCTIONS
    // ==========================================
    setTimeout(function() {
        console.log('');
        console.log('===');
        console.log('[*] Script loaded successfully!');
        console.log('===');
        console.log('');
        console.log('NEXT STEPS:');
        console.log('1. Open Chrome: chrome://inspect/#devices');
        console.log('2. Connect your device via USB with USB debugging enabled');
        console.log('3. The WebView should appear in Chrome DevTools');
        console.log('4. Click "inspect" to open DevTools for the WebView');
        console.log('');
        console.log('Chrome DevTools Features:');
        console.log('- Elements: Inspect HTML/CSS');
        console.log('- Console: Execute JavaScript');
        console.log('- Network: Monitor HTTP/HTTPS requests');
        console.log('- Sources: View and debug JavaScript');
        console.log('- Application: LocalStorage, SessionStorage, Cookies');
        console.log('');
        if (ENABLE_SSL_BYPASS) {
            console.log('SSL PINNING BYPASS: ACTIVE');
            console.log('All SSL certificate validations have been disabled');
            console.log('You can now intercept HTTPS traffic with Burp Suite, OWASP ZAP, etc.');
            console.log('');
        }
    }, 1000);
});
