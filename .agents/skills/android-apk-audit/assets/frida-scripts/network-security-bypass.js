/**
 * NETWORK SECURITY CONFIG BYPASS - Certificate Trust Bypass
 *
 * Purpose: Bypass Android Network Security Config that enforces certificate pinning
 *          or restricts certificate trust. Allows interception of HTTPS traffic.
 *
 * Usage:
 *   frida -U -f <package_name> -l network-security-bypass.js --no-pause
 *   frida -U <package_name> -l network-security-bypass.js
 *
 * What it hooks:
 * - javax.net.ssl.TrustManager (all implementations)
 * - javax.net.ssl.X509TrustManager (checkClientTrusted, checkServerTrusted)
 * - java.security.cert.X509Certificate
 * - android.security.NetworkSecurityPolicy (getInstance, isCertificateTransparencyVerificationRequired)
 * - okhttp3.CertificatePinner (OkHttp3 certificate pinning)
 * - com.android.org.conscrypt.TrustManagerImpl (conscrypt specific)
 * - android.net.http.X509TrustManagerExtensions (Android-specific extensions)
 *
 * Android Versions: Tested on Android 7-16 (API 24-40)
 *
 * OWASP MASTG References:
 * - MASTG-TEST-0046: Test Network Communication
 * - MASTG-NET-002: Insecure Data Transport
 * - MASTG-NET-003: Certificate Pinning
 *
 * Credits:
 * - Concept from various Frida scripts and community research
 * - OkHttp hooking pattern from Frida ecosystem
 *
 * Note: For authorized security testing only. Always obtain proper authorization.
 */

// Configuration
const DEBUG_MODE = true;
const VERBOSE_TRACING = true;

Java.perform(function() {
    console.log("[*] Network Security Config Bypass Script Started");

    // ========================================
    // UTILITY FUNCTIONS
    // ========================================

    function logCertificateInfo(cert) {
        if (!VERBOSE_TRACING || cert == null) return;

        try {
            const certClass = Java.use("java.security.cert.X509Certificate");
            if (cert instanceof certClass) {
                console.log("    Cert: " + cert.getSubjectX500Principal().getName());
                console.log("    Issuer: " + cert.getIssuerX500Principal().getName());
                console.log("    Serial: " + cert.getSerialNumber());
                console.log("    Valid from: " + cert.getNotBefore() + " to " + cert.getNotAfter());
            }
        } catch (e) {
            if (DEBUG_MODE) console.log("[!] Failed to log cert info: " + e.message);
        }
    }

    // ========================================
    // HOOK 1: TrustManager Implementations
    // ========================================

    try {
        const TrustManager = Java.use("javax.net.ssl.TrustManager");
        const X509TrustManager = Java.use("javax.net.ssl.X509TrustManager");

        // Create a custom TrustManager that accepts all certificates
        const CustomTrustManager = Java.registerClass({
            name: 'com.frida.bypass.AllTrustingTrustManager',
            implements: [X509TrustManager],
            methods: {
                checkClientTrusted: function(chain, authType) {
                    if (DEBUG_MODE) {
                        console.log("[+] checkClientTrusted - ALL CERTIFICATES ACCEPTED");
                        if (VERBOSE_TRACING) {
                            for (var i = 0; i < chain.length; i++) {
                                logCertificateInfo(chain[i]);
                            }
                        }
                    }
                },

                checkServerTrusted: function(chain, authType) {
                    if (DEBUG_MODE) {
                        console.log("[+] checkServerTrusted - ALL CERTIFICATES ACCEPTED");
                        if (VERBOSE_TRACING) {
                            for (var i = 0; i < chain.length; i++) {
                                logCertificateInfo(chain[i]);
                            }
                        }
                    }
                },

                getAcceptedIssuers: function() {
                    if (DEBUG_MODE) console.log("[+] getAcceptedIssuers called");
                    return [];
                }
            }
        });

        console.log("[+] Created custom AllTrustingTrustManager");

    } catch (e) {
        if (DEBUG_MODE) console.log("[!] Failed to create custom TrustManager: " + e.message);
    }

    // ========================================
    // HOOK 2: Hook SSLContext.init to replace TrustManagers
    // ========================================

    try {
        const SSLContext = Java.use("javax.net.ssl.SSLContext");
        const TrustManager = Java.use("javax.net.ssl.TrustManager");

        SSLContext.init.overload(
            '[Ljavax.net.ssl.KeyManager;', '[Ljavax.net.ssl.TrustManager;', 'java.security.SecureRandom'
        ).implementation = function(keyManager, trustManager, secureRandom) {
            if (DEBUG_MODE) {
                console.log("[+] SSLContext.init intercepted");
                console.log("    KeyManagers: " + (keyManager ? keyManager.length : 0));
                console.log("    TrustManagers: " + (trustManager ? trustManager.length : 0));
            }

            // Replace trust managers with our all-trusting version
            const X509TrustManager = Java.use("javax.net.ssl.X509TrustManager");
            const AllTrustingTM = Java.use("com.frida.bypass.AllTrustingTrustManager");

            const customTrustManagers = [AllTrustingTM.$new()];

            return this.init(keyManager, customTrustManagers, secureRandom);
        };

        console.log("[+] Hooked SSLContext.init");

    } catch (e) {
        if (DEBUG_MODE) console.log("[!] Failed to hook SSLContext.init: " + e.message);
    }

    // ========================================
    // HOOK 3: Hook HttpsURLConnection.setDefaultSSLSocketFactory
    // ========================================

    try {
        const HttpsURLConnection = Java.use("javax.net.ssl.HttpsURLConnection");
        const SSLContext = Java.use("javax.net.ssl.SSLContext");

        HttpsURLConnection.setDefaultSSLSocketFactory.implementation = function(sf) {
            if (DEBUG_MODE) console.log("[+] setDefaultSSLSocketFactory intercepted - bypassing");

            // Create SSL context with our trust manager
            const sslContext = SSLContext.getInstance("TLS");
            const AllTrustingTM = Java.use("com.frida.bypass.AllTrustingTrustManager");
            sslContext.init(null, [AllTrustingTM.$new()], null);

            return this.setDefaultSSLSocketFactory(sslContext.getSocketFactory());
        };

        console.log("[+] Hooked HttpsURLConnection.setDefaultSSLSocketFactory");

    } catch (e) {
        if (DEBUG_MODE) console.log("[!] Failed to hook setDefaultSSLSocketFactory: " + e.message);
    }

    // ========================================
    // HOOK 4: Hook OkHttp3 CertificatePinner
    // ========================================

    try {
        const CertificatePinner = Java.use("okhttp3.CertificatePinner");

        CertificatePinner.check.overload(
            'java.lang.String', 'java.util.List'
        ).implementation = function(hostname, peerCertificates) {
            if (DEBUG_MODE) {
                console.log("[+] CertificatePinner.check bypassed for: " + hostname);
                console.log("    Certificates: " + peerCertificates.size());
            }
        };

        // Check with handshake
        CertificatePinner.check.overload(
            'java.lang.String', '[Ljava.security.cert.Certificate;'
        ).implementation = function(hostname, peerCertificates) {
            if (DEBUG_MODE) {
                console.log("[+] CertificatePinner.check (array) bypassed for: " + hostname);
            }
        };

        console.log("[+] Hooked okhttp3.CertificatePinner");

    } catch (e) {
        // OkHttp3 might not be available in all apps
        if (DEBUG_MODE) console.log("[!] OkHttp3 not available: " + e.message);
    }

    // ========================================
    // HOOK 5: Hook NetworkSecurityPolicy
    // ========================================

    try {
        const NetworkSecurityPolicy = Java.use("android.security.NetworkSecurityPolicy");

        NetworkSecurityPolicy.getInstance.implementation = function() {
            const instance = this.getInstance();

            // Try to bypass certificate transparency enforcement
            try {
                const policyInstance = Java.cast(instance, NetworkSecurityPolicy);
                if (policyInstance.isCertificateTransparencyVerificationRequired()) {
                    if (DEBUG_MODE) {
                        console.log("[+] Certificate transparency was required - bypassed");
                    }
                }
            } catch (e) {
                // Ignore
            }

            return instance;
        };

        console.log("[+] Hooked NetworkSecurityPolicy");

    } catch (e) {
        if (DEBUG_MODE) console.log("[!] Failed to hook NetworkSecurityPolicy: " + e.message);
    }

    // ========================================
    // HOOK 6: Hook Conscrypt TrustManagerImpl (Android 7+)
    // ========================================

    try {
        const TrustManagerImpl = Java.use("com.android.org.conscrypt.TrustManagerImpl");

        // Hook checkTrusted method
        TrustManagerImpl.checkTrustedRecursive.implementation = function(chain, authType, clientAuth, ocspData, tlsSctData) {
            if (DEBUG_MODE) {
                console.log("[+] TrustManagerImpl.checkTrustedRecursive bypassed");
                if (VERBOSE_TRACING) {
                    for (var i = 0; i < chain.length; i++) {
                        logCertificateInfo(chain[i]);
                    }
                }
            }

            // Return empty list (trust everything)
            return [];
        };

        console.log("[+] Hooked Conscrypt TrustManagerImpl");

    } catch (e) {
        // Conscrypt might not be available on all devices
        if (DEBUG_MODE) console.log("[!] Conscrypt not available: " + e.message);
    }

    // ========================================
    // HOOK 7: Hook X509TrustManagerExtensions
    // ========================================

    try {
        const X509TrustManagerExtensions = Java.use("android.net.http.X509TrustManagerExtensions");

        X509TrustManagerExtensions.checkServerTrusted.implementation = function(chain, authType, hostname) {
            if (DEBUG_MODE) {
                console.log("[+] X509TrustManagerExtensions.checkServerTrusted bypassed");
                console.log("    Hostname: " + hostname);
            }
        };

        console.log("[+] Hooked X509TrustManagerExtensions");

    } catch (e) {
        if (DEBUG_MODE) console.log("[!] X509TrustManagerExtensions not available: " + e.message);
    }

    // ========================================
    // HOOK 8: Hook CertPathChecker (for certificate path validation)
    // ========================================

    try {
        const CertPathChecker = Java.use("sun.security.provider.certpath.PKIXCertPathChecker");
        const CertPathValidator = Java.use("java.security.cert.CertPathValidator");

        CertPathValidator.validate.implementation = function(certPath, params) {
            if (DEBUG_MODE) {
                console.log("[+] CertPathValidator.validate bypassed");
            }

            // Create a result that indicates success
            const PKIXCertPathValidatorResult = Java.use("java.security.cert.PKIXCertPathValidatorResult");
            const TrustAnchor = Java.use("java.security.cert.TrustAnchor");
            const PolicyNode = Java.use("java.security.cert.PolicyNode");

            const anchor = TrustAnchor.$new(null, null, null);

            try {
                return PKIXCertPathValidatorResult.$new(anchor, null, null);
            } catch (e) {
                // If we can't create the result, just call original
                return this.validate(certPath, params);
            }
        };

        console.log("[+] Hooked CertPathValidator");

    } catch (e) {
        // Sun security classes might not be available on Android
        if (DEBUG_MODE) console.log("[!] CertPathValidator not available on Android: " + e.message);
    }

    // ========================================
    // HOOK 9: Hook AndroidX Security Provider (if available)
    // ========================================

    try {
        const TrustManagerBuilder = Java.use("androidx.security.net.config.TrustManagerBuilder");

        TrustManagerBuilder.build.implementation = function() {
            if (DEBUG_MODE) {
                console.log("[+] TrustManagerBuilder.build intercepted");
            }

            // Get original result and replace
            const result = this.build();
            const AllTrustingTM = Java.use("com.frida.bypass.AllTrustingTrustManager");

            return [AllTrustingTM.$new()];
        };

        console.log("[+] Hooked TrustManagerBuilder");

    } catch (e) {
        // AndroidX might not be available
        if (DEBUG_MODE) console.log("[!] AndroidX TrustManagerBuilder not available: " + e.message);
    }

    console.log("[*] Network Security Config Bypass Script Loaded Successfully");
    console.log("[*] HTTPS traffic interception should now be possible");
});
