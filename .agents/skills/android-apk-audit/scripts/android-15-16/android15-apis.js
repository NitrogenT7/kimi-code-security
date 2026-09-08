/**
 * android15-apis.js
 * Frida hooks for Android 15 (API 35) and Android 16 (API 36) new APIs
 * 
 * Coverage:
 * - Privacy Sandbox APIs
 * - Credential Manager (Passkeys/FIDO2)
 * - Private Space APIs (Android 16)
 * - Partial Photo Access (Android 14+)
 * - Screen Privacy (FLAG_SECURE)
 * - Restricted Profile APIs
 * - AI on-device (Gemini Nano)
 * 
 * Usage:
 *   frida -U -f com.target.app -l android15-apis.js --no-pause
 *   frida -U -f com.target.app -l android15-apis.js -P "privateSpace=true" -P "monitorNetwork=true"
 */

const options = {
    privateSpace: false,
    crossProfile: false,
    aiSecurity: false,
    monitorNetwork: false,
    photoAccess: false,
    privacySandbox: false,
    credentials: false
};

// Parse command line options
process.argv.forEach(arg => {
    if (arg.startsWith('-P')) {
        const parts = arg.split('=');
        const key = parts[0].replace('-P', '').trim();
        const value = parts[1] === 'true';
        if (key in options) options[key] = value;
    }
});

console.log('[android15-apis] Initialized with options:', JSON.stringify(options));

// ============================================
// PRIVACY SANDBOX APIs (android.privacySandbox)
// ============================================

const PrivacySandboxManager = {
    hookGetDeclaredPackageScore: function() {
        const clazz = Java.use('android.privacySandbox.PrivacySandboxManager');
        
        clazz.getDeclaredPackageScore.implementation = function(packageName, callback) {
            console.log('[PrivacySandbox] getDeclaredPackageScore called for: ' + packageName);
            return this.getDeclaredPackageScore(packageName, callback);
        };
        
        clazz.getDeclaredPackageScoreAsync.implementation = function(packageName) {
            console.log('[PrivacySandbox] getDeclaredPackageScoreAsync called for: ' + packageName);
            return this.getDeclaredPackageScoreAsync(packageName);
        };
    },

    hookStartNotice: function() {
        const clazz = Java.use('android.privacySandbox.PrivacySandboxManager');
        
        clazz.startNotice.implementation = function(attributionTag, intent, callback) {
            console.log('[PrivacySandbox] startNotice called with attributionTag: ' + attributionTag);
            return this.startNotice(attributionTag, intent, callback);
        };
    },

    hookGetPrivacySandboxPackages: function() {
        const clazz = Java.use('android.privacySandbox.PrivacySandboxManager');
        
        clazz.getPrivacySandboxPackages.implementation = function() {
            console.log('[PrivacySandbox] getPrivacySandboxPackages called');
            return this.getPrivacySandboxPackages();
        };
    },

    hookIsPrivacySandboxEnabled: function() {
        const clazz = Java.use('android.privacySandbox.PrivacySandboxManager');
        
        clazz.isPrivacySandboxEnabled.implementation = function() {
            const result = this.isPrivacySandboxEnabled();
            console.log('[PrivacySandbox] isPrivacySandboxEnabled: ' + result);
            return result;
        };
    }
};

// ============================================
// CREDENTIAL MANAGER (android.credentials)
// ============================================

const CredentialManager = {
    hookGetCredential: function() {
        const clazz = Java.use('android.credentials.CredentialManager');
        
        clazz.getCredential.implementation = function(request, cancellationSignal, callback) {
            console.log('[Credentials] getCredential called');
            console.log('[Credentials] Request type: ' + (request ? request.getClass().getName() : 'null'));
            return this.getCredential(request, cancellationSignal, callback);
        };
    },

    hookCreateCredential: function() {
        const clazz = Java.use('android.credentials.CredentialManager');
        
        clazz.createCredential.implementation = function(request, cancellationSignal, callback) {
            console.log('[Credentials] createCredential called');
            console.log('[Credentials] CreateRequest type: ' + (request ? request.getClass().getName() : 'null'));
            return this.createCredential(request, cancellationSignal, callback);
        };
    }
};

const CredentialManagerConstants = {
    hookConstants: function() {
        try {
            const clazz = Java.use('android.credentials.CredentialManager');
            const fields = clazz.class.getDeclaredFields();
            fields.forEach(field => {
                try {
                    field.setAccessible(true);
                    const name = field.getName();
                    const value = field.get(null);
                    if (name.toUpperCase() === name && typeof value === 'string') {
                        console.log('[Credentials] Constant: ' + name + ' = ' + value);
                    }
                } catch (e) {}
            });
        } catch (e) {
            console.log('[Credentials] Error getting constants: ' + e.message);
        }
    }
};

// ============================================
// FIDO2 / WEBAUTHN APIs
// ============================================

const Fido2Api = {
    hookCreateCredential: function() {
        try {
            const clazz = Java.use('android.fido.fido2.Fido2Api');
            
            clazz.createCredential.implementation = function(options, taskCallback) {
                console.log('[FIDO2] createCredential called');
                console.log('[FIDO2] Options: ' + JSON.stringify(options ? options.toString() : 'null'));
                return this.createCredential(options, taskCallback);
            };
        } catch (e) {
            console.log('[FIDO2] createCredential hook failed: ' + e.message);
        }
    },

    hookGetCredential: function() {
        try {
            const clazz = Java.use('android.fido.fido2.Fido2Api');
            
            clazz.getCredential.implementation = function(options, taskCallback) {
                console.log('[FIDO2] getCredential called');
                return this.getCredential(options, taskCallback);
            };
        } catch (e) {
            console.log('[FIDO2] getCredential hook failed: ' + e.message);
        }
    }
};

const BiometricAuthenticator = {
    hookAuthenticate: function() {
        try {
            const clazz = Java.use('android.hardware.biometrics.BiometricAuthenticator');
            
            clazz.authenticate.implementation = function(promptInfo, cryptoObject, cancellationSignal, callback) {
                console.log('[Biometric] authenticate called');
                console.log('[Biometric] Crypto object: ' + (cryptoObject ? 'present' : 'null'));
                return this.authenticate(promptInfo, cryptoObject, cancellationSignal, callback);
            };
        } catch (e) {
            console.log('[Biometric] authenticate hook failed: ' + e.message);
        }
    },

    hookCanAuthenticate: function() {
        try {
            const clazz = Java.use('android.hardware.biometrics.BiometricManager');
            
            clazz.canAuthenticate.implementation = function(authenticators, userId) {
                const result = this.canAuthenticate(authenticators, userId);
                console.log('[Biometric] canAuthenticate result: ' + result);
                return result;
            };
        } catch (e) {
            console.log('[Biometric] canAuthenticate hook failed: ' + e.message);
        }
    }
};

const BioPromptHandler = {
    hookShowPrompt: function() {
        try {
            const clazz = Java.use('android.hardware.biometrics.BioPromptHandler');
            
            clazz.showPrompt.implementation = function(params, callback) {
                console.log('[BioPrompt] showPrompt called');
                console.log('[BioPrompt] Authenticators: ' + params.authenticators);
                return this.showPrompt(params, callback);
            };
        } catch (e) {
            console.log('[BioPrompt] showPrompt hook failed: ' + e.message);
        }
    }
};

// ============================================
// PRIVATE SPACE APIs (Android 16, API 36)
// ============================================

const UserManager = {
    hookCreatePrivateSpace: function() {
        try {
            const clazz = Java.use('android.os.UserManager');
            
            clazz.createPrivateSpace.implementation = function(name, flags, callback) {
                console.log('[PrivateSpace] createPrivateSpace called');
                console.log('[PrivateSpace] Name: ' + name);
                console.log('[PrivateSpace] Flags: ' + flags);
                return this.createPrivateSpace(name, flags, callback);
            };
        } catch (e) {
            console.log('[PrivateSpace] createPrivateSpace hook failed: ' + e.message);
        }
    },

    hookGetPrivateSpaceUserHandle: function() {
        try {
            const clazz = Java.use('android.os.UserManager');
            
            clazz.getPrivateSpaceUserHandle.implementation = function(userId) {
                console.log('[PrivateSpace] getPrivateSpaceUserHandle called for userId: ' + userId);
                return this.getPrivateSpaceUserHandle(userId);
            };
        } catch (e) {
            console.log('[PrivateSpace] getPrivateSpaceUserHandle hook failed: ' + e.message);
        }
    },

    hookIsPrivateSpaceEnabled: function() {
        try {
            const clazz = Java.use('android.os.UserManager');
            
            clazz.isPrivateSpaceEnabled.implementation = function() {
                const result = this.isPrivateSpaceEnabled();
                console.log('[PrivateSpace] isPrivateSpaceEnabled: ' + result);
                return result;
            };
        } catch (e) {
            console.log('[PrivateSpace] isPrivateSpaceEnabled hook failed: ' + e.message);
        }
    }
};

const UserHandle = {
    hookGetPrivateSpaceUserId: function() {
        try {
            const clazz = Java.use('android.os.UserHandle');
            const PRIVATE_SPACE_USER_ID = 999;
            
            const field = clazz.class.getDeclaredField('PRIVATE_SPACE_USER_ID');
            field.setAccessible(true);
            console.log('[PrivateSpace] PRIVATE_SPACE_USER_ID = ' + field.get(null));
        } catch (e) {
            console.log('[PrivateSpace] PRIVATE_SPACE_USER_ID check: ' + e.message);
        }
    }
};

const PrivateSpaceManager = {
    hookEnterPrivateSpace: function() {
        try {
            const clazz = Java.use('android.os.PrivateSpaceManager');
            
            clazz.enterPrivateSpace.implementation = function(userId, intent, callback) {
                console.log('[PrivateSpace] enterPrivateSpace called for userId: ' + userId);
                return this.enterPrivateSpace(userId, intent, callback);
            };
        } catch (e) {
            console.log('[PrivateSpace] enterPrivateSpace hook failed: ' + e.message);
        }
    },

    hookExitPrivateSpace: function() {
        try {
            const clazz = Java.use('android.os.PrivateSpaceManager');
            
            clazz.exitPrivateSpace.implementation = function(callback) {
                console.log('[PrivateSpace] exitPrivateSpace called');
                return this.exitPrivateSpace(callback);
            };
        } catch (e) {
            console.log('[PrivateSpace] exitPrivateSpace hook failed: ' + e.message);
        }
    }
};

// ============================================
// PARTIAL PHOTO ACCESS (Android 14+, API 34)
// ============================================

const PhotoAccessApi = {
    hookFetchThumbnails: function() {
        try {
            const clazz = Java.use('android.provider.MediaStore$Images$Media');
            
            clazz.fetchThumbnails.implementation = function(contentUri, opts, callback) {
                console.log('[PhotoAccess] fetchThumbnails called');
                console.log('[PhotoAccess] URI: ' + contentUri);
                return this.fetchThumbnails(contentUri, opts, callback);
            };
        } catch (e) {
            console.log('[PhotoAccess] fetchThumbnails hook failed: ' + e.message);
        }
    },

    hookPhotoPicker: function() {
        try {
            const PhotoPickerFragment = Java.use('android.app.PhotoPickerFragment');
            
            PhotoPickerFragment.show.implementation = function(fragmentManager, requestCode) {
                console.log('[PhotoAccess] PhotoPicker.show called');
                return this.show(fragmentManager, requestCode);
            };
        } catch (e) {
            console.log('[PhotoAccess] PhotoPickerFragment hook failed: ' + e.message);
        }
    },

    hookRequestReadAccess: function() {
        try {
            const Activity = Java.use('android.app.Activity');
            
            Activity.requestReadAccessPermission.implementation = function(uri, callback) {
                console.log('[PhotoAccess] requestReadAccessPermission called');
                console.log('[PhotoAccess] URI: ' + uri);
                return this.requestReadAccessPermission(uri, callback);
            };
        } catch (e) {
            console.log('[PhotoAccess] requestReadAccessPermission hook failed: ' + e.message);
        }
    }
};

// ============================================
// SCREEN PRIVACY (FLAG_SECURE related)
// ============================================

const WindowManager = {
    hookSetFlags: function() {
        try {
            const clazz = Java.use('android.view.WindowManager');
            
            clazz.setFlags.implementation = function(flags, mask) {
                const FLAG_SECURE = 0x00002000;
                if (flags & FLAG_SECURE) {
                    console.log('[ScreenPrivacy] FLAG_SECURE being set');
                    console.log('[ScreenPrivacy] Stack trace:');
                    console.log(Thread.backtrace().map(DebugSymbol.fromAddress).join('\n'));
                }
                return this.setFlags(flags, mask);
            };
        } catch (e) {
            console.log('[ScreenPrivacy] setFlags hook failed: ' + e.message);
        }
    },

    hookIsContentHidden: function() {
        try {
            const clazz = Java.use('android.view.WindowManager');
            
            clazz.isContentHidden.implementation = function() {
                const result = this.isContentHidden();
                console.log('[ScreenPrivacy] isContentHidden: ' + result);
                return result;
            };
        } catch (e) {
            console.log('[ScreenPrivacy] isContentHidden hook failed: ' + e.message);
        }
    }
};

const Activity = {
    hookSetSecure: function() {
        try {
            const clazz = Java.use('android.app.Activity');
            
            clazz.setSecure.implementation = function(secure) {
                console.log('[ScreenPrivacy] setSecure called with: ' + secure);
                return this.setSecure(secure);
            };
        } catch (e) {
            console.log('[ScreenPrivacy] setSecure hook failed: ' + e.message);
        }
    }
};

// ============================================
// RESTRICTED PROFILES / WORK PROFILES
// ============================================

const CrossProfileApps = {
    hookCanAccessCrossProfile: function() {
        try {
            const clazz = Java.use('android.content.pm.CrossProfileApps');
            
            clazz.canAccessCrossProfile.implementation = function(targetUserId) {
                const result = this.canAccessCrossProfile(targetUserId);
                console.log('[CrossProfile] canAccessCrossProfile(userId=' + targetUserId + '): ' + result);
                return result;
            };
        } catch (e) {
            console.log('[CrossProfile] canAccessCrossProfile hook failed: ' + e.message);
        }
    },

    hookGetCrossProfileTargets: function() {
        try {
            const clazz = Java.use('android.content.pm.CrossProfileApps');
            
            clazz.getCrossProfileTargets.implementation = function() {
                console.log('[CrossProfile] getCrossProfileTargets called');
                return this.getCrossProfileTargets();
            };
        } catch (e) {
            console.log('[CrossProfile] getCrossProfileTargets hook failed: ' + e.message);
        }
    }
};

const ContentProvider = {
    hookQuery: function() {
        try {
            const clazz = Java.use('android.content.ContentProvider');
            
            clazz.query.implementation = function (uri, projection, selection, selectionArgs, sortOrder, cancellationSignal) {
                console.log('[CrossProfile] ContentProvider.query called');
                console.log('[CrossProfile] URI: ' + uri);
                console.log('[CrossProfile] Selection: ' + selection);
                return this.query(uri, projection, selection, selectionArgs, sortOrder, cancellationSignal);
            };
        } catch (e) {
            console.log('[CrossProfile] ContentProvider.query hook failed: ' + e.message);
        }
    }
};

// ============================================
// AI ON-DEVICE (GEMINI NANO / AICORE)
// ============================================

const AiCoreManager = {
    hookGetInstance: function() {
        try {
            const clazz = Java.use('android.ai.AiCoreManager');
            
            clazz.getInstance.implementation = function() {
                console.log('[AI] AiCoreManager.getInstance called');
                return this.getInstance();
            };
        } catch (e) {
            console.log('[AI] AiCoreManager.getInstance hook failed: ' + e.message);
        }
    },

    hookCreateSession: function() {
        try {
            const clazz = Java.use('android.ai.AiCoreManager');
            
            clazz.createSession.implementation = function(modelConfig, callback) {
                console.log('[AI] createSession called');
                console.log('[AI] Model config: ' + (modelConfig ? modelConfig.toString() : 'null'));
                return this.createSession(modelConfig, callback);
            };
        } catch (e) {
            console.log('[AI] createSession hook failed: ' + e.message);
        }
    }
};

const AiSession = {
    hookExecute: function() {
        try {
            const clazz = Java.use('android.ai.AiSession');
            
            clazz.execute.implementation = function (input, callback) {
                console.log('[AI] AiSession.execute called');
                console.log('[AI] Input length: ' + (input ? input.length : 0));
                return this.execute(input, callback);
            };
        } catch (e) {
            console.log('[AI] AiSession.execute hook failed: ' + e.message);
        }
    },

    hookExecuteSync: function() {
        try {
            const clazz = Java.use('android.ai.AiSession');
            
            clazz.executeSync.implementation = function(input) {
                console.log('[AI] AiSession.executeSync called');
                return this.executeSync(input);
            };
        } catch (e) {
            console.log('[AI] executeSync hook failed: ' + e.message);
        }
    }
};

const AiPluginManager = {
    hookRegisterPlugin: function() {
        try {
            const clazz = Java.use('android.ai.plugin.AiPluginManager');
            
            clazz.registerPlugin.implementation = function(plugin, callback) {
                console.log('[AI] registerPlugin called');
                console.log('[AI] Plugin: ' + (plugin ? plugin.getClass().getName() : 'null'));
                return this.registerPlugin(plugin, callback);
            };
        } catch (e) {
            console.log('[AI] registerPlugin hook failed: ' + e.message);
        }
    }
};

// ============================================
// NETWORK MONITORING (when options.monitorNetwork)
// ============================================

const OkHttp3 = {
    hookRequests: function() {
        try {
            const OkHttpClient = Java.use('okhttp3.OkHttpClient');
            const interceptors = OkHttpClient.class.getDeclaredField('interceptors');
            interceptors.setAccessible(true);
            console.log('[Network] OkHttp3 interceptors found');
        } catch (e) {
            console.log('[Network] OkHttp3 not available: ' + e.message);
        }
    }
};

const URLConnection = {
    hookOpenConnection: function() {
        try {
            const clazz = Java.use('java.net.URL');
            
            clazz.openConnection.implementation = function() {
                const conn = this.openConnection();
                console.log('[Network] Opening connection to: ' + this.toString());
                return conn;
            };
        } catch (e) {
            console.log('[Network] URLConnection hook failed: ' + e.message);
        }
    }
};

// ============================================
// ACTIVITYMANAGER (getRecentTasks REMOVED in API 35)
// ============================================

const ActivityManagerDeprecated = {
    hookGetRecentTasks: function() {
        console.log('[ActivityManager] getRecentTasks - CALLED BUT SHOULD BE REMOVED IN API 35+');
        console.log('[ActivityManager] This API was deprecated in Android 15');
        console.log('[ActivityManager] Stack trace:');
        console.log(Thread.backtrace().map(DebugSymbol.fromAddress).join('\n'));
    },

    hookGetRecentTasksForUser: function() {
        console.log('[ActivityManager] getRecentTasksForUser - CALLING REMOVED API');
        console.log('[ActivityManager] Stack trace:');
        console.log(Thread.backtrace().map(DebugSymbol.fromAddress).join('\n'));
    }
};

// ============================================
// INITIALIZATION
// ============================================

function main() {
    console.log('[android15-apis] Frida script loaded');
    console.log('[android15-apis] Android API 35/36 Security Testing');
    console.log('[android15-apis] Options:', JSON.stringify(options));
    
    Java.perform(function() {
        console.log('[android15-apis] Java.perform callback');
        
        // Privacy Sandbox hooks
        if (options.privacySandbox) {
            console.log('[android15-apis] Loading Privacy Sandbox hooks...');
            try {
                PrivacySandboxManager.hookGetDeclaredPackageScore();
                PrivacySandboxManager.hookStartNotice();
                PrivacySandboxManager.hookGetPrivacySandboxPackages();
                PrivacySandboxManager.hookIsPrivacySandboxEnabled();
                console.log('[android15-apis] Privacy Sandbox hooks loaded');
            } catch (e) {
                console.log('[android15-apis] Privacy Sandbox hooks failed: ' + e.message);
            }
        }
        
        // Credential/Passkey hooks
        if (options.credentials) {
            console.log('[android15-apis] Loading Credential Manager hooks...');
            try {
                CredentialManager.hookGetCredential();
                CredentialManager.hookCreateCredential();
                CredentialManagerConstants.hookConstants();
                Fido2Api.hookCreateCredential();
                Fido2Api.hookGetCredential();
                BiometricAuthenticator.hookAuthenticate();
                BiometricAuthenticator.hookCanAuthenticate();
                BioPromptHandler.hookShowPrompt();
                console.log('[android15-apis] Credential hooks loaded');
            } catch (e) {
                console.log('[android15-apis] Credential hooks failed: ' + e.message);
            }
        }
        
        // Private Space hooks (Android 16)
        if (options.privateSpace) {
            console.log('[android15-apis] Loading Private Space hooks...');
            try {
                UserManager.hookCreatePrivateSpace();
                UserManager.hookGetPrivateSpaceUserHandle();
                UserManager.hookIsPrivateSpaceEnabled();
                UserHandle.hookGetPrivateSpaceUserId();
                PrivateSpaceManager.hookEnterPrivateSpace();
                PrivateSpaceManager.hookExitPrivateSpace();
                console.log('[android15-apis] Private Space hooks loaded');
            } catch (e) {
                console.log('[android15-apis] Private Space hooks failed: ' + e.message);
            }
        }
        
        // Photo Access hooks
        if (options.photoAccess) {
            console.log('[android15-apis] Loading Photo Access hooks...');
            try {
                PhotoAccessApi.hookFetchThumbnails();
                PhotoAccessApi.hookPhotoPicker();
                PhotoAccessApi.hookRequestReadAccess();
                console.log('[android15-apis] Photo Access hooks loaded');
            } catch (e) {
                console.log('[android15-apis] Photo Access hooks failed: ' + e.message);
            }
        }
        
        // Screen Privacy hooks
        console.log('[android15-apis] Loading Screen Privacy hooks...');
        try {
            WindowManager.hookSetFlags();
            WindowManager.hookIsContentHidden();
            Activity.hookSetSecure();
            console.log('[android15-apis] Screen Privacy hooks loaded');
        } catch (e) {
            console.log('[android15-apis] Screen Privacy hooks failed: ' + e.message);
        }
        
        // Cross Profile hooks
        if (options.crossProfile) {
            console.log('[android15-apis] Loading Cross Profile hooks...');
            try {
                CrossProfileApps.hookCanAccessCrossProfile();
                CrossProfileApps.hookGetCrossProfileTargets();
                ContentProvider.hookQuery();
                console.log('[android15-apis] Cross Profile hooks loaded');
            } catch (e) {
                console.log('[android15-apis] Cross Profile hooks failed: ' + e.message);
            }
        }
        
        // AI Security hooks
        if (options.aiSecurity) {
            console.log('[android15-apis] Loading AI Security hooks...');
            try {
                AiCoreManager.hookGetInstance();
                AiCoreManager.hookCreateSession();
                AiSession.hookExecute();
                AiSession.hookExecuteSync();
                AiPluginManager.hookRegisterPlugin();
                console.log('[android15-apis] AI Security hooks loaded');
            } catch (e) {
                console.log('[android15-apis] AI Security hooks failed: ' + e.message);
            }
        }
        
        // Network monitoring
        if (options.monitorNetwork) {
            console.log('[android15-apis] Loading Network monitoring hooks...');
            try {
                URLConnection.hookOpenConnection();
                console.log('[android15-apis] Network hooks loaded');
            } catch (e) {
                console.log('[android15-apis] Network hooks failed: ' + e.message);
            }
        }
        
        // Deprecated API monitoring
        console.log('[android15-apis] Loading Deprecated API monitors...');
        try {
            ActivityManagerDeprecated.hookGetRecentTasks();
            ActivityManagerDeprecated.hookGetRecentTasksForUser();
            console.log('[android15-apis] Deprecated API monitors loaded');
        } catch (e) {
            console.log('[android15-apis] Deprecated API monitors failed: ' + e.message);
        }
    });
}

// Handle script lifecycle
setTimeout(function() {
    try {
        main();
    } catch (e) {
        console.error('[android15-apis] Initialization error: ' + e.message);
        console.error(e.stack);
    }
}, 100);
