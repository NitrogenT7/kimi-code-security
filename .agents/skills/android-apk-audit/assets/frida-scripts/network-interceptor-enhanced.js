/**
 * Enhanced Network Traffic Interceptor (Frida Handbook Edition)
 *
 * Based on original network-interceptor.js with improvements from "The Frida Handbook" Chapter 9.
 * Enhancements:
 * - Stack trace extraction using extractFullStackTrace() from Frida Handbook
 * - Constructor hooks for OkHttp Request/Response
 *
 * Usage: frida -U -f <package_name> -l network-interceptor-enhanced.js
 *
 * Compatible with: Frida 16.x+, Android 7-16
 *
 * Based on: "The Frida Handbook" by Fernando Diaz (@entdark_)
 * Chapter 9: Android instrumentation (pages 146-167)
 */

// ========================================
// ORIGINAL CONFIGURATION AND UTILITY FUNCTIONS
// ========================================

Java.perform(function() {
    console.log("[*] ================================================");
    console.log("[*] ENHANCED NETWORK INTERCEPTOR STARTED");
    console.log("[*] ================================================");

    // Original CONFIG from network-interceptor.js
    var CONFIG = {
        // Filter by domain/host (empty = all domains)
        domainFilter: "",

        // Log full request/response bodies
        logBodies: true,

        // Truncate body length (0 = no truncation)
        maxBodyLength: 2000,

        // Log headers
        logHeaders: true,

        // Detect and alert on sensitive data
        detectSensitiveData: true,

        // Sensitive patterns to detect
        sensitivePatterns: [
            /password/i,
            /token/i,
            /api[_-]?key/i,
            /secret/i,
            /authorization/i,
            /session/i,
            /credit[_-]?card/i,
            /ssn/i,
            /pin/i,
            /auth/i
        ],

        // Color codes (terminal)
        colors: {
            reset: "\x1b[0m",
            bright: "\x1b[1m",
            dim: "\x1b[2m",

            method: "\x1b[36m",     // Cyan
            url: "\x1b[33m",        // Yellow
            status: "\x1b[32m",      // Green
            statusErr: "\x1b[31m",    // Red
            statusWarn: "\x1b[35m",   // Magenta
            warn: "\x1b[35m",        // Magenta
            error: "\x1b[31m",       // Red
            info: "\x1b[34m",        // Blue
            debug: "\x1b[90m",       // Gray
            interceptor: "\x1b[93m",    // Bright Yellow
            request: "\x1b[36m",      // Cyan
            response: "\x1b[32m",     // Green
            websocket: "\x1b[95m",   // Bright Magenta
            retrofit: "\x1b[96m"      // Bright Cyan
        }
    };

    // ========================================
    // ENHANCED UTILITY FUNCTIONS FROM FRIDA HANDBOOK
    // ========================================

    /**
     * Extract full stack trace with colors - NEW FROM HANDBOOK
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
     * Log with colored output - ENHANCED
     */
    function log(message, color) {
        const color = color || CONFIG.colors.info;
        console.log(color + message + CONFIG.colors.reset);
    }

    function shouldLogDomain(url) {
        if (CONFIG.domainFilter === "") return true;
        return url.toLowerCase().indexOf(CONFIG.domainFilter.toLowerCase()) !== -1;
    }

    function formatMethod(method) {
        return CONFIG.colors.method + CONFIG.colors.bright + method + CONFIG.colors.reset;
    }

    function formatUrl(url) {
        return CONFIG.colors.url + url + CONFIG.colors.reset;
    }

    function formatStatus(status) {
        var statusColor = status >= 200 && status < 300 ? CONFIG.colors.status :
                          status >= 300 && status < 400 ? CONFIG.colors.statusWarn :
                          status >= 400 ? CONFIG.colors.statusErr :
                          CONFIG.colors.warn;
        return statusColor + CONFIG.colors.bright + status + CONFIG.colors.reset;
    }

    function colorLabel(label, color) {
        return CONFIG.colors[color] + CONFIG.colors.bright + label + CONFIG.colors.reset;
    }

    function detectSensitiveData(text, source) {
        if (!CONFIG.detectSensitiveData || !text) return;

        var found = [];
        for (var i = 0; i < CONFIG.sensitivePatterns.length; i++) {
            var pattern = CONFIG.sensitivePatterns[i];
            if (pattern.test(text)) {
                found.push(pattern.source);
            }
        }

        if (found.length > 0) {
            log(colorLabel("[!] SENSITIVE DATA DETECTED", "error") + " in " + source + ": " + found.join(", "));
            console.log("    Content: " + text.substring(0, 200) + (text.length > 200 ? "..." : ""));
        }
    }

    function formatHeaders(headers, indent) {
        if (!CONFIG.logHeaders || !headers) return "";
        var result = "";
        try {
            var size = headers.size();
            for (var i = 0; i < size; i++) {
                var name = headers.name(i);
                var value = headers.value(i);
                // Don't log full Authorization header
                var displayValue = name.toLowerCase().indexOf("authorization") !== -1 ||
                                 name.toLowerCase().indexOf("cookie") !== -1 ?
                                   "***REDACTED***" : value;
                result += indent + name + ": " + displayValue + "\n";
            }
        } catch (e) {
            result += indent + "[Error reading headers: " + e + "]\n";
        }
        return result;
    }

    // ========================================
    // ENHANCED OKHTTP HOOKS - NEW FROM FRIDA HANDBOOK
    // ========================================

    log("[" + colorLabel("[1/5]", "debug") + " Hooking OkHttp3 Request/Response constructors with stack traces...");

    try {
        const Request = Java.use('okhttp3.Request');
        const Response = Java.use('okhttp3.Response');

        /**
         * Hook OkHttp3.Request constructor - ENHANCED
         */
        Request.$init.implementation = function(builder) {
            log("[" + formatMethod("Request.$init") + " called");

            const stackTrace = extractFullStackTrace();

            log("[" + colorLabel("STACK", "info") + " Called from (first 5 frames):");
            stackTrace.slice(0, 5).forEach((element, index) => {
                console.log("[" + colorLabel("STACK", "info") + "   [" + index + "] " + element.toString());
            });

            return this.$init(builder);
        };

        log("[" + colorLabel("[+]", "success") + " Hooked OkHttp3.Request.$init()");
    } catch (error) {
        log("[" + colorLabel("[!]", "warn") + " OkHttp3 not found: " + error);
    }

        /**
         * Hook OkHttp3.Response constructor - ENHANCED
         */
        Response.$init.implementation = function(request) {
            log("[" + formatMethod("Response.$init") + " called");

            const url = request.url().toString();
            log("[" + colorLabel("URL", "url") + " Response created for request: " + url);

            const stackTrace = extractFullStackTrace();

            log("[" + colorLabel("STACK", "info") + " Called from (first 5 frames):");
            stackTrace.slice(0, 5).forEach((element, index) => {
                console.log("[" + colorLabel("STACK", "info") + "   [" + index + "] " + element.toString());
            });

            return this.$init(request);
        };

        log("[" + colorLabel("[+]", "success") + " Hooked OkHttp3.Response.$init()");
    } catch (error) {
        log("[" + colorLabel("[!]", "warn") + " OkHttp3 Response not found: " + error);
    }

    hooksApplied += 2;
    log("[" + colorLabel("[+]", "success") + " OkHttp3 constructor hooks with stack traces applied");
});

