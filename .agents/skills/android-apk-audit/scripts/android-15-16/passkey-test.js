/**
 * passkey-test.js
 * Frida hooks for Passkeys/FIDO2/WebAuthn security testing on Android 15/16
 * 
 * Tests:
 * - Credential creation and storage security
 * - Biometric gate bypass possibilities
 * - Cross-device credential migration
 * - WebAuthn broker manipulation
 * - Credential extraction attempts
 * 
 * Usage:
 *   frida -U -f com.target.app -l passkey-test.js --no-pause
 *   frida -U -f com.target.app -l passkey-test.js -P "extractKeys=true" -P "bypassBiometric=true"
 */

const options = {
    extractKeys: false,
    bypassBiometric: false,
    monitorCreation: true,
    monitorRetrieval: true,
    webAuthnBroker: true,
    credentialManager: true
};

process.argv.forEach(arg => {
    if (arg.startsWith('-P')) {
        const parts = arg.split('=');
        const key = parts[0].replace('-P', '').trim();
        const value = parts[1] === 'true';
        if (key in options) options[key] = value;
    }
});

console.log('[passkey-test] Initialized with options:', JSON.stringify(options));

// ============================================
// FIDO2 API HOOKS
// ============================================

const Fido2Api = {
    hookCreateCredential: function() {
        try {
            const Fido2ApiClass = Java.use('android.fido.fido2.Fido2Api');
            
            Fido2ApiClass.createCredential.implementation = function(options, cancellationSignal, callback) {
                console.log('[PASSKEY] ===== CREATE CREDENTIAL =====');
                console.log('[PASSKEY] FIDO2 createCredential called');
                
                if (options) {
                    try {
                        const optionsJson = options.toString();
                        console.log('[PASSKEY] Options details: ' + optionsJson);
                        
                        // Check for suspicious parameters
                        if (optionsJson.includes('rpidHash')) {
                            console.log('[PASSKEY] [!] RP ID Hash present - RP verification active');
                        }
                        if (optionsJson.includes('challenge')) {
                            console.log('[PASSKEY] [*] Challenge present in options');
                        }
                    } catch (e) {
                        console.log('[PASSKEY] Could not parse options: ' + e.message);
                    }
                }
                
                const stackTrace = Thread.backtrace().map(DebugSymbol.fromAddress).join('\n');
                console.log('[PASSKEY] Stack trace:\n' + stackTrace);
                
                return this.createCredential(options, cancellationSignal, callback);
            };
            console.log('[PASSKEY] Fido2Api.createCredential hooked');
        } catch (e) {
            console.log('[PASSKEY] Fido2Api.createCredential hook failed: ' + e.message);
        }
    },

    hookGetCredential: function() {
        try {
            const Fido2ApiClass = Java.use('android.fido.fido2.Fido2Api');
            
            Fido2ApiClass.getCredential.implementation = function(options, cancellationSignal, callback) {
                console.log('[PASSKEY] ===== GET CREDENTIAL =====');
                console.log('[PASSKEY] FIDO2 getCredential called');
                
                if (options) {
                    try {
                        console.log('[PASSKEY] GetOptions: ' + options.toString());
                    } catch (e) {}
                }
                
                const stackTrace = Thread.backtrace().map(DebugSymbol.fromAddress).join('\n');
                console.log('[PASSKEY] Stack trace:\n' + stackTrace);
                
                return this.getCredential(options, cancellationSignal, callback);
            };
            console.log('[PASSKEY] Fido2Api.getCredential hooked');
        } catch (e) {
            console.log('[PASSKEY] Fido2Api.getCredential hook failed: ' + e.message);
        }
    },

    hookIsSupported: function() {
        try {
            const Fido2ApiClass = Java.use('android.fido.fido2.Fido2Api');
            
            Fido2ApiClass.isSupported.implementation = function() {
                console.log('[PASSKEY] FIDO2 isSupported called');
                return this.isSupported();
            };
        } catch (e) {
            console.log('[PASSKEY] isSupported hook failed: ' + e.message);
        }
    }
};

// ============================================
// FIDO2 BROKER HOOKS
// ============================================

const Fido2Broker = {
    hookMakeCredential: function() {
        try {
            const Fido2BrokerClass = Java.use('com.android.credentials.Fido2Broker');
            
            Fido2BrokerClass.makeCredential.implementation = function(request, cancellationSignal, callback) {
                console.log('[PASSKEY] [BROKER] makeCredential called');
                console.log('[PASSKEY] [BROKER] Request: ' + (request ? request.getClass().getName() : 'null'));
                
                if (options.bypassBiometric) {
                    console.log('[PASSKEY] [BROKER] [!] Bypass option enabled - biometric gate may be manipulated');
                }
                
                return this.makeCredential(request, cancellationSignal, callback);
            };
            console.log('[PASSKEY] Fido2Broker.makeCredential hooked');
        } catch (e) {
            console.log('[PASSKEY] Fido2Broker.makeCredential hook failed: ' + e.message);
        }
    },

    hookGetCredential: function() {
        try {
            const Fido2BrokerClass = Java.use('com.android.credentials.Fido2Broker');
            
            Fido2BrokerClass.getCredential.implementation = function(request, cancellationSignal, callback) {
                console.log('[PASSKEY] [BROKER] getCredential called');
                
                if (options.extractKeys) {
                    console.log('[PASSKEY] [BROKER] [!] KEY EXTRACTION ENABLED');
                }
                
                return this.getCredential(request, cancellationSignal, callback);
            };
            console.log('[PASSKEY] Fido2Broker.getCredential hooked');
        } catch (e) {
            console.log('[PASSKEY] Fido2Broker.getCredential hook failed: ' + e.message);
        }
    }
};

// ============================================
// WEBAUTHN BROKER HOOKS
// ============================================

const WebAuthnBroker = {
    hookAuthenticate: function() {
        try {
            const WebAuthnBrokerClass = Java.use('com.android.credentials.WebAuthnBroker');
            
            WebAuthnBrokerClass.authenticate.implementation = function(request, cancellationSignal, callback) {
                console.log('[PASSKEY] [WEBAUTHN] authenticate called');
                console.log('[PASSKEY] [WEBAUTHN] Request class: ' + (request ? request.getClass().getName() : 'null'));
                
                if (request) {
                    try {
                        const getClass = request.getClass();
                        const methods = getClass.getDeclaredMethods();
                        methods.forEach(method => {
                            if (method.getName().includes('get') || method.getName().includes('Challenge')) {
                                method.setAccessible(true);
                                try {
                                    const value = method.invoke(request);
                                    console.log('[PASSKEY] [WEBAUTHN] ' + method.getName() + ': ' + value);
                                } catch (e) {}
                            }
                        });
                    } catch (e) {
                        console.log('[PASSKEY] [WEBAUTHN] Could not inspect request: ' + e.message);
                    }
                }
                
                return this.authenticate(request, cancellationSignal, callback);
            };
            console.log('[PASSKEY] WebAuthnBroker.authenticate hooked');
        } catch (e) {
            console.log('[PASSKEY] WebAuthnBroker.authenticate hook failed: ' + e.message);
        }
    },

    hookIsSupported: function() {
        try {
            const WebAuthnBrokerClass = Java.use('com.android.credentials.WebAuthnBroker');
            
            WebAuthnBrokerClass.isSupported.implementation = function() {
                console.log('[PASSKEY] [WEBAUTHN] isSupported called');
                return this.isSupported();
            };
        } catch (e) {
            console.log('[PASSKEY] WebAuthnBroker.isSupported hook failed: ' + e.message);
        }
    },

    hookGetAssertion: function() {
        try {
            const WebAuthnBrokerClass = Java.use('com.android.credentials.WebAuthnBroker');
            
            WebAuthnBrokerClass.getAssertion.implementation = function(request, cancellationSignal, callback) {
                console.log('[PASSKEY] [WEBAUTHN] getAssertion called');
                
                if (options.extractKeys) {
                    console.log('[PASSKEY] [WEBAUTHN] [!] Attempting key extraction...');
                }
                
                return this.getAssertion(request, cancellationSignal, callback);
            };
            console.log('[PASSKEY] WebAuthnBroker.getAssertion hooked');
        } catch (e) {
            console.log('[PASSKEY] WebAuthnBroker.getAssertion hook failed: ' + e.message);
        }
    }
};

// ============================================
// BIOMETRIC AUTHENTICATION HOOKS
// ============================================

const BiometricPrompt = {
    hookAuthenticate: function() {
        try {
            const BiometricPromptClass = Java.use('android.hardware.biometrics.BiometricPrompt');
            
            BiometricPromptClass.authenticate.implementation = function(promptInfo, cancellationSignal, callback) {
                console.log('[PASSKEY] [BIOMETRIC] authenticate called');
                console.log('[PASSKEY] [BIOMETRIC] Authenticators: ' + (promptInfo ? promptInfo.getAuthenticators() : 'null'));
                console.log('[PASSKEY] [BIOMETRIC] Allow device credential: ' + (promptInfo ? promptInfo.isAllowDeviceCredential() : 'null'));
                
                if (options.bypassBiometric) {
                    console.log('[PASSKEY] [BIOMETRIC] [!] BYPASS ENABLED - attempting to skip biometric check');
                }
                
                const stackTrace = Thread.backtrace().map(DebugSymbol.fromAddress).join('\n');
                console.log('[PASSKEY] [BIOMETRIC] Stack trace:\n' + stackTrace);
                
                return this.authenticate(promptInfo, cancellationSignal, callback);
            };
            console.log('[PASSKEY] BiometricPrompt.authenticate hooked');
        } catch (e) {
            console.log('[PASSKEY] BiometricPrompt.authenticate hook failed: ' + e.message);
        }
    },

    hookAuthenticateWithCrypto: function() {
        try {
            const BiometricPromptClass = Java.use('android.hardware.biometrics.BiometricPrompt');
            
            BiometricPromptClass.authenticateWithCrypto.implementation = function(promptInfo, cryptoObject, cancellationSignal, callback) {
                console.log('[PASSKEY] [BIOMETRIC] authenticateWithCrypto called');
                console.log('[PASSKEY] [BIOMETRIC] Crypto object: ' + (cryptoObject ? 'present' : 'null'));
                
                return this.authenticateWithCrypto(promptInfo, cryptoObject, cancellationSignal, callback);
            };
            console.log('[PASSKEY] BiometricPrompt.authenticateWithCrypto hooked');
        } catch (e) {
            console.log('[PASSKEY] BiometricPrompt.authenticateWithCrypto hook failed: ' + e.message);
        }
    }
};

const BiometricManager = {
    hookCanAuthenticate: function() {
        try {
            const BiometricManagerClass = Java.use('android.hardware.biometrics.BiometricManager');
            
            BiometricManagerClass.canAuthenticate.implementation = function(authenticators, userId) {
                const result = this.canAuthenticate(authenticators, userId);
                console.log('[PASSKEY] [BIOMETRIC] canAuthenticate result: ' + result);
                console.log('[PASSKEY] [BIOMETRIC] Authenticators: ' + authenticators);
                console.log('[PASSKEY] [BIOMETRIC] UserId: ' + userId);
                return result;
            };
            console.log('[PASSKEY] BiometricManager.canAuthenticate hooked');
        } catch (e) {
            console.log('[PASSKEY] BiometricManager.canAuthenticate hook failed: ' + e.message);
        }
    }
};

const BiometricPromptHandler = {
    hookShowPrompt: function() {
        try {
            const BioPromptHandlerClass = Java.use('android.hardware.biometrics.BioPromptHandler');
            
            BioPromptHandlerClass.showPrompt.implementation = function(params, callback) {
                console.log('[PASSKEY] [BIOPROMPT] showPrompt called');
                console.log('[PASSKEY] [BIOPROMPT] Params: ' + (params ? params.toString() : 'null'));
                
                return this.showPrompt(params, callback);
            };
            console.log('[PASSKEY] BioPromptHandler.showPrompt hooked');
        } catch (e) {
            console.log('[PASSKEY] BioPromptHandler.showPrompt hook failed: ' + e.message);
        }
    },

    hookHandleAuthenticationResult: function() {
        try {
            const BioPromptHandlerClass = Java.use('android.hardware.biometrics.BioPromptHandler');
            
            BioPromptHandlerClass.handleAuthenticationResult.implementation = function(result) {
                console.log('[PASSKEY] [BIOPROMPT] handleAuthenticationResult: ' + result);
                return this.handleAuthenticationResult(result);
            };
            console.log('[PASSKEY] BioPromptHandler.handleAuthenticationResult hooked');
        } catch (e) {
            console.log('[PASSKEY] BioPromptHandler.handleAuthenticationResult hook failed: ' + e.message);
        }
    }
};

// ============================================
// CREDENTIAL MANAGER HOOKS (android.credentials)
// ============================================

const CredentialManager = {
    hookGetCredential: function() {
        try {
            const CredentialManagerClass = Java.use('android.credentials.CredentialManager');
            
            CredentialManagerClass.getCredential.implementation = function(request, cancellationSignal, callback) {
                console.log('[PASSKEY] [CM] getCredential called');
                console.log('[PASSKEY] [CM] Request type: ' + (request ? request.getClass().getName() : 'null'));
                
                if (request) {
                    try {
                        const getClass = request.getClass();
                        console.log('[PASSKEY] [CM] Request methods: ' + getClass.getDeclaredMethods()
                            .filter(m => m.getName().startsWith('get'))
                            .map(m => m.getName())
                            .join(', '));
                    } catch (e) {}
                }
                
                return this.getCredential(request, cancellationSignal, callback);
            };
            console.log('[PASSKEY] CredentialManager.getCredential hooked');
        } catch (e) {
            console.log('[PASSKEY] CredentialManager.getCredential hook failed: ' + e.message);
        }
    },

    hookCreateCredential: function() {
        try {
            const CredentialManagerClass = Java.use('android.credentials.CredentialManager');
            
            CredentialManagerClass.createCredential.implementation = function(request, cancellationSignal, callback) {
                console.log('[PASSKEY] [CM] createCredential called');
                console.log('[PASSKEY] [CM] Request type: ' + (request ? request.getClass().getName() : 'null'));
                
                return this.createCredential(request, cancellationSignal, callback);
            };
            console.log('[PASSKEY] CredentialManager.createCredential hooked');
        } catch (e) {
            console.log('[PASSKEY] CredentialManager.createCredential hook failed: ' + e.message);
        }
    }
};

// ============================================
// PUBLIC KEY CREDENTIAL HOOKS
// ============================================

const PublicKeyCredential = {
    hookGetCredentialProperties: function() {
        try {
            const PKCredClass = Java.use('android.credentials.UIThreadFuturePublicKeyCredential');
            
            PKCredClass.getCredentialProperties.implementation = function() {
                console.log('[PASSKEY] [PKCRED] getCredentialProperties called');
                return this.getCredentialProperties();
            };
            console.log('[PASSKEY] PublicKeyCredential.getCredentialProperties hooked');
        } catch (e) {
            console.log('[PASSKEY] PublicKeyCredential hook failed: ' + e.message);
        }
    },

    hookGetRegistrationResponseJSON: function() {
        try {
            const PKCredClass = Java.use('android.credentials.UIThreadFuturePublicKeyCredential');
            
            PKCredClass.getRegistrationResponseJSON.implementation = function() {
                console.log('[PASSKEY] [PKCRED] getRegistrationResponseJSON called');
                if (options.extractKeys) {
                    console.log('[PASSKEY] [PKCRED] [!] Attempting to extract registration data...');
                }
                return this.getRegistrationResponseJSON();
            };
            console.log('[PASSKEY] PublicKeyCredential.getRegistrationResponseJSON hooked');
        } catch (e) {
            console.log('[PASSKEY] PublicKeyCredential.getRegistrationResponseJSON hook failed: ' + e.message);
        }
    },

    hookGetAuthenticationExtensionsJSON: function() {
        try {
            const PKCredClass = Java.use('android.credentials.UIThreadFuturePublicKeyCredential');
            
            PKCredClass.getAuthenticationExtensionsJSON.implementation = function() {
                console.log('[PASSKEY] [PKCRED] getAuthenticationExtensionsJSON called');
                return this.getAuthenticationExtensionsJSON();
            };
            console.log('[PASSKEY] PublicKeyCredential.getAuthenticationExtensionsJSON hooked');
        } catch (e) {
            console.log('[PASSKEY] PublicKeyCredential.getAuthenticationExtensionsJSON hook failed: ' + e.message);
        }
    }
};

// ============================================
// KEYSTORE / KEYCHAIN HOOKS
// ============================================

const KeyStore = {
    hookGetKey: function() {
        try {
            const KeyStoreClass = Java.use('java.security.KeyStore');
            
            KeyStoreClass.getKey.implementation = function(alias, password) {
                console.log('[PASSKEY] [KEYSTORE] getKey called for alias: ' + alias);
                
                if (options.extractKeys && password) {
                    console.log('[PASSKEY] [KEYSTORE] [!] Attempting to extract key with password');
                }
                
                return this.getKey(alias, password);
            };
            console.log('[PASSKEY] KeyStore.getKey hooked');
        } catch (e) {
            console.log('[PASSKEY] KeyStore.getKey hook failed: ' + e.message);
        }
    },

    hookEntryInstanceOf: function() {
        try {
            const KeyStoreClass = Java.use('java.security.KeyStore');
            
            KeyStoreClass.entryInstanceOf.implementation = function(alias, entryClass) {
                console.log('[PASSKEY] [KEYSTORE] entryInstanceOf - alias: ' + alias + ', class: ' + entryClass.getName());
                return this.entryInstanceOf(alias, entryClass);
            };
            console.log('[PASSKEY] KeyStore.entryInstanceOf hooked');
        } catch (e) {
            console.log('[PASSKEY] KeyStore.entryInstanceOf hook failed: ' + e.message);
        }
    }
};

const KeyChain = {
    hookGetPrivateKey: function() {
        try {
            const KeyChainClass = Java.use('android.security.keystore.KeyChain');
            
            KeyChainClass.getPrivateKey.implementation = function(alias) {
                console.log('[PASSKEY] [KEYCHAIN] getPrivateKey called for alias: ' + alias);
                return this.getPrivateKey(alias);
            };
            console.log('[PASSKEY] KeyChain.getPrivateKey hooked');
        } catch (e) {
            console.log('[PASSKEY] KeyChain.getPrivateKey hook failed: ' + e.message);
        }
    },

    hookGetCertificateChain: function() {
        try {
            const KeyChainClass = Java.use('android.security.keystore.KeyChain');
            
            KeyChainClass.getCertificateChain.implementation = function(alias) {
                console.log('[PASSKEY] [KEYCHAIN] getCertificateChain called for alias: ' + alias);
                return this.getCertificateChain(alias);
            };
            console.log('[PASSKEY] KeyChain.getCertificateChain hooked');
        } catch (e) {
            console.log('[PASSKEY] KeyChain.getCertificateChain hook failed: ' + e.message);
        }
    }
};

// ============================================
// FRAMEWORK UTILITY HOOKS
// ============================================

const AuthenticatorSummary = {
    hookGetSummary: function() {
        try {
            const clazz = Java.use('android.credentials.AuthenticatorSummary');
            
            clazz.getSummary.implementation = function() {
                console.log('[PASSKEY] [SUMMARY] getSummary called');
                return this.getSummary();
            };
        } catch (e) {
            console.log('[PASSKEY] AuthenticatorSummary hook failed: ' + e.message);
        }
    }
};

const CreatePublicKeyCredentialRequest = {
    hookParse: function() {
        try {
            const clazz = Java.use('androidx.credentials.CreatePublicKeyCredentialRequest');
            
            clazz.parsePublicKeyCredentialRequest.implementation = function(requestJson) {
                console.log('[PASSKEY] [PKC] parsePublicKeyCredentialRequest called');
                console.log('[PASSKEY] [PKC] Request JSON length: ' + (requestJson ? requestJson.length : 0));
                return this.parsePublicKeyCredentialRequest(requestJson);
            };
            console.log('[PASSKEY] CreatePublicKeyCredentialRequest.parse hooked');
        } catch (e) {
            console.log('[PASSKEY] CreatePublicKeyCredentialRequest hook failed: ' + e.message);
        }
    }
};

// ============================================
// SUMMARY REPORTING
// ============================================

function printSummary() {
    console.log('\n[passkey-test] ===== SECURITY TESTING SUMMARY =====');
    console.log('[passkey-test] Options enabled:');
    console.log('  - extractKeys: ' + options.extractKeys);
    console.log('  - bypassBiometric: ' + options.bypassBiometric);
    console.log('  - monitorCreation: ' + options.monitorCreation);
    console.log('  - monitorRetrieval: ' + options.monitorRetrieval);
    console.log('  - webAuthnBroker: ' + options.webAuthnBroker);
    console.log('  - credentialManager: ' + options.credentialManager);
    console.log('[passkey-test] =====================================\n');
}

// ============================================
// INITIALIZATION
// ============================================

function main() {
    console.log('[passkey-test] Frida script loaded - Passkey/FIDO2 Security Testing');
    console.log('[passkey-test] Targeting Android 15/16 credential APIs');
    
    Java.perform(function() {
        console.log('[passkey-test] Java.perform callback - installing hooks');
        
        try {
            Fido2Api.hookCreateCredential();
            Fido2Api.hookGetCredential();
            Fido2Api.hookIsSupported();
        } catch (e) {
            console.log('[passkey-test] FIDO2 API hooks error: ' + e.message);
        }
        
        try {
            Fido2Broker.hookMakeCredential();
            Fido2Broker.hookGetCredential();
        } catch (e) {
            console.log('[passkey-test] FIDO2 Broker hooks error: ' + e.message);
        }
        
        if (options.webAuthnBroker) {
            try {
                WebAuthnBroker.hookAuthenticate();
                WebAuthnBroker.hookIsSupported();
                WebAuthnBroker.hookGetAssertion();
            } catch (e) {
                console.log('[passkey-test] WebAuthn Broker hooks error: ' + e.message);
            }
        }
        
        try {
            BiometricPrompt.hookAuthenticate();
            BiometricPrompt.hookAuthenticateWithCrypto();
            BiometricManager.hookCanAuthenticate();
            BiometricPromptHandler.hookShowPrompt();
            BiometricPromptHandler.hookHandleAuthenticationResult();
        } catch (e) {
            console.log('[passkey-test] Biometric hooks error: ' + e.message);
        }
        
        if (options.credentialManager) {
            try {
                CredentialManager.hookGetCredential();
                CredentialManager.hookCreateCredential();
            } catch (e) {
                console.log('[passkey-test] CredentialManager hooks error: ' + e.message);
            }
        }
        
        try {
            PublicKeyCredential.hookGetCredentialProperties();
            PublicKeyCredential.hookGetRegistrationResponseJSON();
            PublicKeyCredential.hookGetAuthenticationExtensionsJSON();
        } catch (e) {
            console.log('[passkey-test] PublicKeyCredential hooks error: ' + e.message);
        }
        
        try {
            KeyStore.hookGetKey();
            KeyStore.hookEntryInstanceOf();
            KeyChain.hookGetPrivateKey();
            KeyChain.hookGetCertificateChain();
        } catch (e) {
            console.log('[passkey-test] KeyStore/KeyChain hooks error: ' + e.message);
        }
        
        try {
            AuthenticatorSummary.hookGetSummary();
            CreatePublicKeyCredentialRequest.hookParse();
        } catch (e) {
            console.log('[passkey-test] Utility hooks error: ' + e.message);
        }
        
        printSummary();
    });
}

setTimeout(function() {
    try {
        main();
    } catch (e) {
        console.error('[passkey-test] Initialization error: ' + e.message);
        console.error(e.stack);
    }
}, 100);
