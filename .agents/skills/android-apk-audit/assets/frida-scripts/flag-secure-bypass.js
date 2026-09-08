/**
 * FLAG_SECURE BYPASS - Screen Capture/Recording Protection Bypass
 *
 * Purpose: Bypass FLAG_SECURE protection that prevents screenshots and screen recording
 *          in Android applications. Useful for security testing and documentation.
 *
 * Usage:
 *   frida -U -f <package_name> -l flag-secure-bypass.js --no-pause
 *   frida -U <package_name> -l flag-secure-bypass.js
 *
 * What it hooks:
 * - android.view.WindowManager.LayoutParams (FLAG_SECURE constant)
 * - android.view.LayoutInflater (inflate methods that set flags)
 * - android.view.WindowManagerImpl (addView method)
 * - android.app.Activity (onCreate, onResume for dynamic flag setting)
 *
 * Android Versions: Tested on Android 10-14 (API 29-34)
 *
 * OWASP MASTG References:
 * - MASTG-TEST-0048: Test Screen Capture Protection
 * - MASTG-STO-002: Screen Capture Prevention
 *
 * Credits:
 * - Concept based on various Android security research
 * - FLAG_SECURE constant: 0x8000 (32768)
 *
 * Note: For educational and authorized security testing purposes only.
 * Always obtain proper authorization before testing.
 */

// Configuration
const DEBUG_MODE = true;
const FORCE_REMOVE_SECURE = true;

Java.perform(function() {
    console.log("[*] FLAG_SECURE Bypass Script Started");

    try {
        // ========================================
        // METHOD 1: Hook LayoutInflater (most common)
        // ========================================

        const LayoutInflater = Java.use("android.view.LayoutInflater");

        // Hook inflate with AttributeSet
        const inflateOverload1 = LayoutInflater.inflate.overload(
            'int', 'android.view.ViewGroup', 'boolean'
        );
        inflateOverload1.implementation = function(resource, root, attachToRoot) {
            var result = this.inflate(resource, root, attachToRoot);
            this._removeFlagSecureFromView(result);
            return result;
        };

        // Hook inflate with ViewStub
        const inflateOverload2 = LayoutInflater.inflate.overload(
            'android.view.XmlPullParser', 'android.view.ViewGroup', 'boolean'
        );
        inflateOverload2.implementation = function(parser, root, attachToRoot) {
            var result = this.inflate(parser, root, attachToRoot);
            this._removeFlagSecureFromView(result);
            return result;
        };

        LayoutInflater._removeFlagSecureFromView = function(view) {
            if (view == null) return;

            try {
                const WindowManager = Java.use("android.view.WindowManager");
                const FLAG_SECURE = 0x8000;

                // Try to get LayoutParams
                const layoutParams = view.value.getLayoutParams();
                if (layoutParams != null) {
                    const oldFlags = layoutParams.value.flags;
                    if ((oldFlags & FLAG_SECURE) === FLAG_SECURE) {
                        const newFlags = oldFlags & ~FLAG_SECURE;
                        layoutParams.value.flags = newFlags;
                        if (DEBUG_MODE) {
                            console.log("[+] Removed FLAG_SECURE from view: " +
                                      view.value.getClass().getName());
                        }
                    }
                }
            } catch (e) {
                // View might not have LayoutParams, ignore
            }

            // Recursively check child views
            if (view.value instanceof Java.use("android.view.ViewGroup")) {
                const ViewGroup = Java.use("android.view.ViewGroup");
                const childCount = ViewGroup.getChildCount.call(view.value);
                for (var i = 0; i < childCount; i++) {
                    const child = ViewGroup.getChildAt.call(view.value, i);
                    this._removeFlagSecureFromView(child);
                }
            }
        };

        console.log("[+] Hooked LayoutInflater.inflate methods");

    } catch (e) {
        if (DEBUG_MODE) console.log("[!] Failed to hook LayoutInflater: " + e.message);
    }

    try {
        // ========================================
        // METHOD 2: Hook WindowManagerImpl.addView
        // ========================================

        const WindowManagerImpl = Java.use("android.view.WindowManagerImpl");
        const FLAG_SECURE = 0x8000;

        WindowManagerImpl.addView.overload(
            'android.view.View', 'android.view.ViewGroup$LayoutParams'
        ).implementation = function(view, params) {
            try {
                const oldFlags = params.flags;
                if ((oldFlags & FLAG_SECURE) === FLAG_SECURE) {
                    params.flags = oldFlags & ~FLAG_SECURE;
                    if (DEBUG_MODE) {
                        console.log("[+] Removed FLAG_SECURE in addView");
                    }
                }
            } catch (e) {
                // Ignore
            }
            return this.addView(view, params);
        };

        console.log("[+] Hooked WindowManagerImpl.addView");

    } catch (e) {
        if (DEBUG_MODE) console.log("[!] Failed to hook WindowManagerImpl: " + e.message);
    }

    try {
        // ========================================
        // METHOD 3: Hook Activity.onCreate/onResume
        // (catches dynamic flag setting)
        // ========================================

        const Activity = Java.use("android.app.Activity");
        const FLAG_SECURE = 0x8000;

        Activity.onCreate.overload('android.os.Bundle').implementation = function(savedInstanceState) {
            this.onCreate(savedInstanceState);

            setTimeout(function() {
                try {
                    const window = Activity.getWindow.call(this);
                    if (window != null) {
                        const windowParams = window.getAttributes();
                        if (windowParams != null) {
                            const oldFlags = windowParams.flags;
                            if ((oldFlags & FLAG_SECURE) === FLAG_SECURE) {
                                windowParams.flags = oldFlags & ~FLAG_SECURE;
                                window.setAttributes(windowParams);
                                if (DEBUG_MODE) {
                                    console.log("[+] Removed FLAG_SECURE from Activity window in onCreate: " +
                                              this.getClass().getName());
                                }
                            }
                        }
                    }
                } catch (e) {
                    if (DEBUG_MODE) console.log("[!] Error in onCreate hook: " + e.message);
                }
            }, 100);
        };

        Activity.onResume.implementation = function() {
            this.onResume();

            setTimeout(function() {
                try {
                    const window = Activity.getWindow.call(this);
                    if (window != null) {
                        const windowParams = window.getAttributes();
                        if (windowParams != null) {
                            const oldFlags = windowParams.flags;
                            if ((oldFlags & FLAG_SECURE) === FLAG_SECURE) {
                                windowParams.flags = oldFlags & ~FLAG_SECURE;
                                window.setAttributes(windowParams);
                                if (DEBUG_MODE) {
                                    console.log("[+] Removed FLAG_SECURE from Activity window in onResume: " +
                                              this.getClass().getName());
                                }
                            }
                        }
                    }
                } catch (e) {
                    if (DEBUG_MODE) console.log("[!] Error in onResume hook: " + e.message);
                }
            }, 100);
        };

        console.log("[+] Hooked Activity.onCreate and onResume");

    } catch (e) {
        if (DEBUG_MODE) console.log("[!] Failed to hook Activity: " + e.message);
    }

    try {
        // ========================================
        // METHOD 4: Hook Dialog window creation
        // ========================================

        const Dialog = Java.use("android.app.Dialog");
        const FLAG_SECURE = 0x8000;

        Dialog.show.implementation = function() {
            try {
                const window = this.getWindow();
                if (window != null) {
                    const windowParams = window.getAttributes();
                    if (windowParams != null) {
                        const oldFlags = windowParams.flags;
                        if ((oldFlags & FLAG_SECURE) === FLAG_SECURE) {
                            windowParams.flags = oldFlags & ~FLAG_SECURE;
                            window.setAttributes(windowParams);
                            if (DEBUG_MODE) {
                                console.log("[+] Removed FLAG_SECURE from Dialog");
                            }
                        }
                    }
                }
            } catch (e) {
                if (DEBUG_MODE) console.log("[!] Error in Dialog hook: " + e.message);
            }

            return this.show();
        };

        console.log("[+] Hooked Dialog.show");

    } catch (e) {
        if (DEBUG_MODE) console.log("[!] Failed to hook Dialog: " + e.message);
    }

    try {
        // ========================================
        // METHOD 5: Patch setSecure method directly
        // ========================================

        const View = Java.use("android.view.View");
        const ViewGroup = Java.use("android.view.ViewGroup");
        const WindowManager = Java.use("android.view.WindowManager");
        const LayoutParams = Java.use("android.view.WindowManager$LayoutParams");

        View.setSecure.implementation = function(secure) {
            if (DEBUG_MODE) {
                console.log("[+] Intercepted setSecure(" + secure + ") on " +
                          this.getClass().getName() + " - bypassing");
            }
            // Always set to false regardless of input
            return this.setSecure(false);
        };

        LayoutParams.setSecure.implementation = function(secure) {
            if (DEBUG_MODE) {
                console.log("[+] Intercepted LayoutParams.setSecure(" + secure + ") - bypassing");
            }
            // Always set to false
            return this.setSecure(false);
        };

        console.log("[+] Hooked View.setSecure and LayoutParams.setSecure");

    } catch (e) {
        if (DEBUG_MODE) console.log("[!] Failed to hook setSecure: " + e.message);
    }

    console.log("[*] FLAG_SECURE Bypass Script Loaded Successfully");
    console.log("[*] You should now be able to take screenshots and record screen");
});
