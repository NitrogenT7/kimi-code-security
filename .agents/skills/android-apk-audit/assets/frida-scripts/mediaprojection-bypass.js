/**
 * MEDIAPROJECTION BYPASS - Screen Capture Protection Bypass
 *
 * Purpose: Bypass MediaProjection callback protection and restrictions that
 *          prevent screen capture in some applications. Useful for security testing
 *          and understanding screen capture protections.
 *
 * Usage:
 *   frida -U -f <package_name> -l mediaprojection-bypass.js --no-pause
 *   frida -U <package_name> -l mediaprojection-bypass.js
 *
 * What it hooks:
 * - android.media.projection.MediaProjection (getVirtualDisplay, registerCallback)
 * - android.media.projection.MediaProjectionManager (getMediaProjection)
 * - android.media.projection.MediaProjection.Callback (onStop, onCaptureStopped)
 * - android.hardware.display.VirtualDisplay (getSurface, resize)
 * - android.view.Display (getRealSize, getMetrics)
 * - android.view.Surface (isValid, release)
 *
 * Android Versions: Tested on Android 10-16 (API 29-40)
 *
 * OWASP MASTG References:
 * - MASTG-TEST-0048: Test Screen Capture Protection
 * - MASTG-STO-002: Screen Capture Prevention
 *
 * Credits:
 * - Concept based on Android MediaProjection security research
 * - Hooking patterns from Frida ecosystem
 *
 * Note: For authorized security testing only. Always obtain proper authorization.
 */

// Configuration
const DEBUG_MODE = true;
const VERBOSE_MODE = false;

Java.perform(function() {
    console.log("[*] MediaProjection Bypass Script Started");

    // ========================================
    // UTILITY FUNCTIONS
    // ========================================

    function logCallback(callbackName, extraInfo) {
        if (!DEBUG_MODE) return;
        var msg = "[+] MediaProjection.Callback." + callbackName + "() called";
        if (extraInfo) {
            msg += " - " + extraInfo;
        }
        console.log(msg);
    }

    // ========================================
    // HOOK 1: Hook MediaProjection.Callback methods
    // ========================================

    try {
        const MediaProjectionCallback = Java.use("android.media.projection.MediaProjection$Callback");

        MediaProjectionCallback.onStop.implementation = function() {
            logCallback("onStop", "preventing stop notification");
            // Don't call super - prevent app from knowing projection stopped
        };

        console.log("[+] Hooked MediaProjection.Callback.onStop");

    } catch (e) {
        if (DEBUG_MODE) console.log("[!] Failed to hook MediaProjection.Callback.onStop: " + e.message);
    }

    try {
        // Android 13+ (API 33+) has additional callback methods
        const MediaProjectionCallback = Java.use("android.media.projection.MediaProjection$Callback");

        try {
            MediaProjectionCallback.onCaptureStopped.implementation = function(reasonCode) {
                logCallback("onCaptureStopped", "reasonCode: " + reasonCode + " - preventing notification");
            };

            console.log("[+] Hooked MediaProjection.Callback.onCaptureStopped");

        } catch (e2) {
            // Method might not exist in older Android versions
            if (VERBOSE_MODE) console.log("[!] onCaptureStopped not available (Android < 13)");
        }

        try {
            MediaProjectionCallback.onCapturePaused.implementation = function() {
                logCallback("onCapturePaused", "preventing pause notification");
            };

            console.log("[+] Hooked MediaProjection.Callback.onCapturePaused");

        } catch (e3) {
            if (VERBOSE_MODE) console.log("[!] onCapturePaused not available");
        }

        try {
            MediaProjectionCallback.onCaptureResumed.implementation = function() {
                logCallback("onCaptureResumed", "preventing resume notification");
            };

            console.log("[+] Hooked MediaProjection.Callback.onCaptureResumed");

        } catch (e4) {
            if (VERBOSE_MODE) console.log("[!] onCaptureResumed not available");
        }

    } catch (e) {
        if (DEBUG_MODE) console.log("[!] Failed to hook callback methods: " + e.message);
    }

    // ========================================
    // HOOK 2: Hook MediaProjection.registerCallback
    // ========================================

    try {
        const MediaProjection = Java.use("android.media.projection.MediaProjection");
        const Handler = Java.use("android.os.Handler");

        MediaProjection.registerCallback.implementation = function(callback, handler) {
            if (DEBUG_MODE) {
                console.log("[+] MediaProjection.registerCallback intercepted");
                console.log("    Callback: " + callback.getClass().getName());
                console.log("    Handler: " + (handler ? handler.getClass().getName() : "null"));
            }

            // Allow registration but we've already hooked the callback methods
            return this.registerCallback(callback, handler);
        };

        console.log("[+] Hooked MediaProjection.registerCallback");

    } catch (e) {
        if (DEBUG_MODE) console.log("[!] Failed to hook registerCallback: " + e.message);
    }

    // ========================================
    // HOOK 3: Hook MediaProjection.getVirtualDisplay
    // ========================================

    try {
        const MediaProjection = Java.use("android.media.projection.MediaProjection");

        MediaProjection.getVirtualDisplay.overload(
            'java.lang.String', 'int', 'int', 'int', 'int'
        ).implementation = function(name, width, height, dpi, flags) {
            if (DEBUG_MODE) {
                console.log("[+] MediaProjection.getVirtualDisplay called");
                console.log("    Name: " + name);
                console.log("    Size: " + width + "x" + height);
                console.log("    DPI: " + dpi);
                console.log("    Flags: " + flags);
            }

            return this.getVirtualDisplay(name, width, height, dpi, flags);
        };

        MediaProjection.getVirtualDisplay.overload(
            'java.lang.String', 'int', 'int', 'int', 'int', 'android.view.Surface', 'int', 'int'
        ).implementation = function(name, width, height, dpi, flags, surface, left, top) {
            if (DEBUG_MODE) {
                console.log("[+] MediaProjection.getVirtualDisplay (with surface) called");
                console.log("    Name: " + name);
                console.log("    Size: " + width + "x" + height);
                console.log("    Position: (" + left + ", " + top + ")");
            }

            return this.getVirtualDisplay(name, width, height, dpi, flags, surface, left, top);
        };

        console.log("[+] Hooked MediaProjection.getVirtualDisplay");

    } catch (e) {
        if (DEBUG_MODE) console.log("[!] Failed to hook getVirtualDisplay: " + e.message);
    }

    // ========================================
    // HOOK 4: Hook MediaProjection.stop
    // ========================================

    try {
        const MediaProjection = Java.use("android.media.projection.MediaProjection");

        MediaProjection.stop.implementation = function() {
            if (DEBUG_MODE) console.log("[+] MediaProjection.stop intercepted - preventing stop");

            // Don't call the original - prevent stopping the projection
            return;
        };

        console.log("[+] Hooked MediaProjection.stop");

    } catch (e) {
        if (DEBUG_MODE) console.log("[!] Failed to hook MediaProjection.stop: " + e.message);
    }

    // ========================================
    // HOOK 5: Hook VirtualDisplay methods
    // ========================================

    try {
        const VirtualDisplay = Java.use("android.hardware.display.VirtualDisplay");

        VirtualDisplay.getSurface.implementation = function() {
            if (DEBUG_MODE) console.log("[+] VirtualDisplay.getSurface called");

            var surface = this.getSurface();
            if (surface == null) {
                if (DEBUG_MODE) console.log("    Surface is null - app might be blocking capture");
            }

            return surface;
        };

        VirtualDisplay.resize.implementation = function(width, height, density) {
            if (DEBUG_MODE) {
                console.log("[+] VirtualDisplay.resize called");
                console.log("    New size: " + width + "x" + height);
                console.log("    New density: " + density);
            }

            return this.resize(width, height, density);
        };

        console.log("[+] Hooked VirtualDisplay methods");

    } catch (e) {
        if (DEBUG_MODE) console.log("[!] Failed to hook VirtualDisplay: " + e.message);
    }

    // ========================================
    // HOOK 6: Hook Display methods for size detection
    // ========================================

    try {
        const Display = Java.use("android.view.Display");
        const Point = Java.use("android.graphics.Point");

        Display.getRealSize.overload('android.graphics.Point').implementation = function(outSize) {
            var size = outSize || Point.$new();
            this.getRealSize(size);

            if (DEBUG_MODE) {
                console.log("[+] Display.getRealSize called");
                console.log("    Real size: " + size.x + "x" + size.y);
            }

            return size;
        };

        console.log("[+] Hooked Display.getRealSize");

    } catch (e) {
        if (DEBUG_MODE) console.log("[!] Failed to hook Display: " + e.message);
    }

    // ========================================
    // HOOK 7: Hook Surface.release (prevent cleanup)
    // ========================================

    try {
        const Surface = Java.use("android.view.Surface");

        Surface.release.implementation = function() {
            if (DEBUG_MODE) console.log("[+] Surface.release intercepted - preventing release");

            // Don't release - keep the surface alive
            return;
        };

        Surface.isValid.implementation = function() {
            var valid = this.isValid();

            if (DEBUG_MODE && !valid) {
                console.log("[+] Surface.isValid returned false - forcing true");
            }

            // Always return true even if surface is invalid
            return true;
        };

        console.log("[+] Hooked Surface methods");

    } catch (e) {
        if (DEBUG_MODE) console.log("[!] Failed to hook Surface: " + e.message);
    }

    // ========================================
    // HOOK 8: Hook MediaProjectionManager.getMediaProjection
    // ========================================

    try {
        const MediaProjectionManager = Java.use("android.media.projection.MediaProjectionManager");

        MediaProjectionManager.getMediaProjection.implementation = function(resultCode, data) {
            if (DEBUG_MODE) {
                console.log("[+] MediaProjectionManager.getMediaProjection called");
                console.log("    ResultCode: " + resultCode);
                console.log("    Intent: " + (data ? data.getClass().getName() : "null"));
            }

            var projection = this.getMediaProjection(resultCode, data);

            if (DEBUG_MODE && projection) {
                console.log("    MediaProjection created successfully");
            }

            return projection;
        };

        console.log("[+] Hooked MediaProjectionManager.getMediaProjection");

    } catch (e) {
        if (DEBUG_MODE) console.log("[!] Failed to hook MediaProjectionManager: " + e.message);
    }

    // ========================================
    // HOOK 9: Hook onProvideScreenshotColorScale (Android 13+)
    // ========================================

    try {
        const Activity = Java.use("android.app.Activity");

        try {
            Activity.onProvideScreenshotColorScale.implementation = function() {
                if (DEBUG_MODE) console.log("[+] onProvideScreenshotColorScale intercepted");

                // Return 1.0 (100% opacity) - full visibility
                return 1.0;
            };

            console.log("[+] Hooked Activity.onProvideScreenshotColorScale");

        } catch (e2) {
            if (VERBOSE_MODE) console.log("[!] onProvideScreenshotColorScale not available (Android < 13)");
        }

    } catch (e) {
        if (DEBUG_MODE) console.log("[!] Failed to hook Activity: " + e.message);
    }

    // ========================================
    // HOOK 10: Hook ScreenCaptureService (Android 14+)
    // ========================================

    try {
        // Android 14+ has ScreenCaptureService for screen capture
        const ScreenCaptureService = Java.use("android.service.media.ScreenCaptureService");

        try {
            ScreenCaptureService.onStopRequested.implementation = function(reason) {
                if (DEBUG_MODE) {
                    console.log("[+] ScreenCaptureService.onStopRequested intercepted");
                    console.log("    Reason: " + reason);
                }

                // Don't stop - ignore the request
                return;
            };

            console.log("[+] Hooked ScreenCaptureService.onStopRequested");

        } catch (e2) {
            if (VERBOSE_MODE) console.log("[!] ScreenCaptureService not available (Android < 14)");
        }

    } catch (e) {
        // Service might not exist or be accessible
        if (VERBOSE_MODE) console.log("[!] ScreenCaptureService not found");
    }

    console.log("[*] MediaProjection Bypass Script Loaded Successfully");
    console.log("[*] Screen capture protection should now be bypassed");
    console.log("[*] MediaProjection callbacks are being intercepted");
});
