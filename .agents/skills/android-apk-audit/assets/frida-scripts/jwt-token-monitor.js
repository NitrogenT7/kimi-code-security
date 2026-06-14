/**
 * Frida Script: JWT and Token Monitoring
 *
 * Purpose: Monitor and analyze JWT tokens and authentication credentials in Android applications
 * Usage: frida -U -f <package_name> -l jwt-token-monitor.js
 *
 * What it monitors:
 * - SharedPreferences.getString for JWT patterns (eyJ...)
 * - OkHttp Authorization headers (Bearer tokens)
 * - URL parameters containing tokens (access_token, id_token, etc.)
 * - CookieManager.getCookie for session cookies
 * - Custom token storage classes (heuristic-based)
 * - JWT decoding and analysis
 *
 * Alerts on:
 * - Tokens in URL parameters (never safe)
 * - Tokens stored in plaintext SharedPreferences
 * - Missing token expiration (exp claim)
 * - Algorithm "none" in JWT header (critical vulnerability)
 * - Weak algorithms (HS256 without proper secret)
 *
 * OWASP MASTG References:
 * - MASTG-TEST-0048: Test Local Data Storage
 * - MASTG-STORAGE-003: Insecure Storage of Sensitive Data
 * - MASWE-0045: Insecure Data Storage
 *
 * Note: This is for security testing purposes only.
 * Always obtain proper authorization before testing.
 */

Java.perform(function() {
    console.log("[*] JWT and Token Monitoring Script Started");

    // ========================================
    // CONFIGURATION
    // ========================================
    var CONFIG = {
        // Detect and log all JWT tokens
        detectJWT: true,

        // Log all tokens (including non-JWT)
        logAllTokens: true,

        // Decode JWT payload
        decodeJWT: true,

        // Alert on security issues
        alertOnIssues: true,

        // Maximum token length to log (0 = no limit)
        maxTokenLength: 2000,

        // WARNING: monitorURLExtract causes severe performance issues (ANR).
        // Hooks java.net.URI.toString() on EVERY URI operation in the app.
        // Only enable if you specifically need URL parameter token detection.
        monitorURLExtract: false,

        // Token parameter names to detect in URLs
        tokenParams: [
            "access_token",
            "id_token",
            "refresh_token",
            "auth_token",
            "api_token",
            "session_token",
            "bearer",
            "token"
        ],

        // Cookie names to detect
        cookieNames: [
            "sessionid",
            "session",
            "auth",
            "token",
            "jwt",
            "sid"
        ],

        // Color codes
        colors: {
            critical: "\x1b[31m",    // Red
            warning: "\x1b[33m",     // Yellow
            info: "\x1b[36m",        // Cyan
            success: "\x1b[32m",     // Green
            reset: "\x1b[0m"
        }
    };

    // ========================================
    // UTILITY FUNCTIONS
    // ========================================
    function formatMessage(level, message) {
        var color = CONFIG.colors[level] || CONFIG.colors.info;
        return color + message + CONFIG.colors.reset;
    }

    function isJWT(token) {
        if (!token || typeof token !== "string") return false;
        var parts = token.split(".");
        // Relaxed JWT validation: check for 3 parts and basic base64url pattern
        // Previously required both parts to start with "eyJ", which was too strict
        // Now checks for structure: header.payload.signature
        return parts.length === 3 &&
               parts[0].length > 0 &&
               parts[1].length > 0 &&
               parts[2].length > 0 &&
               /^[A-Za-z0-9_-]+$/.test(parts[0]) &&  // Header: base64url chars
               /^[A-Za-z0-9_-]+$/.test(parts[1]) &&  // Payload: base64url chars
               /^[A-Za-z0-9_-]+$/.test(parts[2]);    // Signature: base64url chars
    }

    function base64UrlDecode(str) {
        try {
            // Handle null or empty input
            if (!str || str.length === 0) return null;

            // Replace URL-safe characters BEFORE adding padding
            // Order matters: replace first, then add padding
            str = str.replace(/-/g, "+").replace(/_/g, "/");

            // Add padding if needed
            while (str.length % 4 !== 0) {
                str += "=";
            }

            var decoded = Java.use("java.util.Base64").getDecoder().decode(
                Java.use("java.lang.String").$new(str).getBytes()
            );
            return Java.use("java.lang.String").$new(decoded);
        } catch (e) {
            return null;
        }
    }

    function decodeJWT(token) {
        if (!isJWT(token)) return null;

        try {
            var parts = token.split(".");
            var headerDecoded = base64UrlDecode(parts[0]);
            if (!headerDecoded) {
                console.log("[!] JWT header decode failed");
                return null;
            }
            var header;
            try {
                header = JSON.parse(headerDecoded);
            } catch (e) {
                console.log("[!] JWT header JSON parse error: " + e);
                return null;
            }

            var payloadDecoded = base64UrlDecode(parts[1]);
            if (!payloadDecoded) {
                console.log("[!] JWT payload decode failed");
                return null;
            }
            var payload;
            try {
                payload = JSON.parse(payloadDecoded);
            } catch (e) {
                console.log("[!] JWT payload JSON parse error: " + e);
                return null;
            }

            return {
                header: header,
                payload: payload,
                signature: parts[2]
            };
        } catch (e) {
            console.log("[!] JWT decode error: " + e);
            return null;
        }
    }

    function analyzeJWT(jwtData, location) {
        if (!jwtData) return;

        console.log(formatMessage("info", "\n[*] JWT Analysis (" + location + "):"));
        console.log("    Header: " + JSON.stringify(jwtData.header));
        console.log("    Payload: " + JSON.stringify(jwtData.payload));

        // Check for algorithm "none" (CRITICAL)
        if (jwtData.header.alg === "none" || jwtData.header.alg === "None") {
            console.log(formatMessage("critical", "    [CRITICAL] Algorithm 'none' detected - JWT signature can be bypassed!"));
        }

        // Check for weak algorithm (HS256)
        if (jwtData.header.alg === "HS256") {
            console.log(formatMessage("warning", "    [WARNING] HS256 algorithm - verify secret key strength"));
        }

        // Check for expiration
        if (!jwtData.payload.exp) {
            console.log(formatMessage("warning", "    [WARNING] Missing 'exp' claim - token never expires!"));
        } else {
            var expDate = new Date(jwtData.payload.exp * 1000);
            var now = new Date();
            if (expDate < now) {
                console.log(formatMessage("critical", "    [CRITICAL] Token expired on: " + expDate.toISOString()));
            } else {
                console.log(formatMessage("success", "    Token expires on: " + expDate.toISOString()));
            }
        }

        // Check for issued at
        if (!jwtData.payload.iat) {
            console.log(formatMessage("warning", "    [WARNING] Missing 'iat' claim"));
        }

        // Check for not before
        if (jwtData.payload.nbf) {
            var nbfDate = new Date(jwtData.payload.nbf * 1000);
            var now = new Date();
            if (nbfDate > now) {
                console.log(formatMessage("warning", "    [WARNING] Token not valid until: " + nbfDate.toISOString()));
            }
        }

        // Check for issuer
        if (!jwtData.payload.iss) {
            console.log(formatMessage("warning", "    [WARNING] Missing 'iss' claim (issuer)"));
        }

        // Check for audience
        if (!jwtData.payload.aud) {
            console.log(formatMessage("warning", "    [WARNING] Missing 'aud' claim (audience)"));
        }

        // Check for subject
        if (!jwtData.payload.sub) {
            console.log(formatMessage("warning", "    [WARNING] Missing 'sub' claim (subject)"));
        }
    }

    function truncateToken(token) {
        if (CONFIG.maxTokenLength === 0 || token.length <= CONFIG.maxTokenLength) {
            return token;
        }
        return token.substring(0, CONFIG.maxTokenLength) + "... (truncated)";
    }

    function detectTokenInString(str, source) {
        if (!str || typeof str !== "string") return false;

        var found = false;

        // Check for JWT pattern
        if (isJWT(str) && CONFIG.detectJWT) {
            console.log(formatMessage("success", "\n[+] JWT Token Found in " + source + ":"));
            console.log("    " + truncateToken(str));

            if (CONFIG.decodeJWT) {
                var jwtData = decodeJWT(str);
                if (jwtData) {
                    analyzeJWT(jwtData, source);
                }
            }

            found = true;
        }

        // Check for Bearer token pattern
        if (str.indexOf("Bearer ") !== -1) {
            console.log(formatMessage("info", "\n[+] Bearer Token Found in " + source + ":"));
            console.log("    " + truncateToken(str));
            found = true;
        }

        // Check for other token patterns
        if (CONFIG.logAllTokens) {
            for (var i = 0; i < CONFIG.tokenParams.length; i++) {
                var param = CONFIG.tokenParams[i];
                var pattern = new RegExp(param + "[=:]\\s*[\\w-]+", "i");
                var match = str.match(pattern);
                if (match) {
                    console.log(formatMessage("info", "\n[+] Token Parameter Found in " + source + ":"));
                    console.log("    " + match[0]);
                    found = true;
                }
            }
        }

        return found;
    }

    // ========================================
    // SHARED PREFERENCES HOOKING
    // ========================================
    try {
        var SharedPreferences = Java.use("android.content.SharedPreferences");

        // Hook getString
        SharedPreferences.getString.implementation = function(key, defValue) {
            var result = this.getString(key, defValue);

            // Check if the retrieved value is a token
            if (result !== defValue && detectTokenInString(result, "SharedPreferences (" + key + ")")) {
                console.log(formatMessage("warning", "    [WARNING] Token stored in plaintext SharedPreferences!"));
                console.log("    Key: " + key);
                console.log("    Location: " + this.toString());
            }

            return result;
        };

        // Hook getAll
        SharedPreferences.getAll.implementation = function() {
            var all = this.getAll();
            var iterator = all.entrySet().iterator();

            while (iterator.hasNext()) {
                var entry = iterator.next();
                var key = entry.getKey();
                var value = entry.getValue();

                if (detectTokenInString(String(value), "SharedPreferences (" + key + ")")) {
                    console.log(formatMessage("warning", "    [WARNING] Token stored in SharedPreferences with key: " + key));
                }
            }

            return all;
        };

        console.log("[+] SharedPreferences hooked");
    } catch (e) {
        console.log("[!] SharedPreferences hook error: " + e);
    }

    // ========================================
    // OKHTTP HEADER HOOKING
    // ========================================
    try {
        var Headers = Java.use("okhttp3.Headers");

        // Hook Headers.get
        Headers.get.implementation = function(name) {
            var value = this.get(name);

            if (name.toLowerCase() === "authorization") {
                detectTokenInString(value, "OkHttp Authorization Header");
            }

            return value;
        };

        // Hook Headers.names
        Headers.names.implementation = function() {
            var names = this.names();
            var iterator = names.iterator();

            while (iterator.hasNext()) {
                var name = iterator.next();
                if (name.toLowerCase() === "authorization") {
                    var value = this.get(name);
                    detectTokenInString(value, "OkHttp Authorization Header");
                }
            }

            return names;
        };

        console.log("[+] OkHttp Headers hooked");
    } catch (e) {
        console.log("[!] OkHttp Headers hook error: " + e);
    }

    // ========================================
    // URL PARAMETER HOOKING
    // WARNING: This causes severe performance issues (ANR) — disabled by default
    // ========================================
    if (CONFIG.monitorURLExtract) {
        try {
            var URI = Java.use("java.net.URI");

            // Hook URI to detect tokens in URL parameters
            // CAUTION: This hooks on EVERY URI operation — can cause ANR
            URI.toString.implementation = function() {
                var url = this.toString();

                for (var i = 0; i < CONFIG.tokenParams.length; i++) {
                    var param = CONFIG.tokenParams[i];
                    if (url.toLowerCase().indexOf(param + "=") !== -1) {
                        console.log(formatMessage("critical", "\n[CRITICAL] Token Found in URL Parameter!"));
                        console.log("    Parameter: " + param);
                        console.log("    URL: " + truncateToken(url));
                        console.log("    [WARNING] Tokens in URL parameters are NEVER safe - use Authorization header!");
                    }
                }

                return url;
            };

            console.log("[+] URL parameter monitoring enabled (WARNING: may cause performance issues)");
        } catch (e) {
            console.log("[!] URL parameter monitoring error: " + e);
        }
    } else {
        console.log("[*] URL parameter monitoring DISABLED (enable via CONFIG.monitorURLExtract = true if needed)");
    }

    // ========================================
    // COOKIE MANAGER HOOKING
    // ========================================
    try {
        var CookieManager = Java.use("android.webkit.CookieManager");

        // Hook getCookie
        CookieManager.getCookie.implementation = function(url) {
            var cookies = this.getCookie(url);

            if (cookies) {
                var cookieArray = cookies.split(";");

                for (var i = 0; i < cookieArray.length; i++) {
                    var cookie = cookieArray[i].trim();
                    var parts = cookie.split("=");

                    if (parts.length >= 1) {
                        var cookieName = parts[0].trim();

                        // Check if it's a session cookie
                        for (var j = 0; j < CONFIG.cookieNames.length; j++) {
                            if (cookieName.toLowerCase().indexOf(CONFIG.cookieNames[j]) !== -1) {
                                console.log(formatMessage("info", "\n[+] Session Cookie Found:"));
                                console.log("    Name: " + cookieName);
                                console.log("    Value: " + (parts[1] ? truncateToken(parts[1]) : ""));
                                console.log("    URL: " + url);
                                break;
                            }
                        }
                    }
                }
            }

            return cookies;
        };

        // Note: CookieManager.getCookie() with no arguments does not exist in standard Android API
        // Only getCookie(String url) is available. Commenting out as it would cause hook failure.
        // CookieManager.getCookie.overload().implementation = function() {
        //     var cookies = this.getCookie();
        //     detectTokenInString(cookies, "CookieManager.getCookie()");
        //     return cookies;
        // };

        console.log("[+] CookieManager hooked");
    } catch (e) {
        console.log("[!] CookieManager hook error: " + e);
    }

    // ========================================
    // STRING HOOKING (CATCH-ALL)
    // ========================================
    // NOTE: String.contains global hook commented out due to performance impact
    // Enable only if specifically needed for token detection scenarios
    /*
    try {
        // Hook String.contains to catch token patterns
        var String = Java.use("java.lang.String");

        String.contains.implementation = function(charSequence) {
            var result = this.contains(charSequence);

            if (result && CONFIG.logAllTokens) {
                var str = charSequence.toString();
                detectTokenInString(str, "String.contains()");
            }

            return result;
        };

        console.log("[+] String monitoring enabled");
    } catch (e) {
        console.log("[!] String monitoring error: " + e);
    }
    */
    console.log("[!] String monitoring disabled (global hook causes performance impact)");

    // ========================================
    // JSON OBJECT HOOKING
    // ========================================
    try {
        var JSONObject = Java.use("org.json.JSONObject");

        // Hook JSONObject.getString
        JSONObject.getString.implementation = function(name) {
            var result = this.getString(name);

            if (detectTokenInString(result, "JSON Object (" + name + ")")) {
                console.log("    JSON Key: " + name);
            }

            return result;
        };

        // Hook JSONObject.optString
        JSONObject.optString.implementation = function(name) {
            var result = this.optString(name);

            if (result && detectTokenInString(result, "JSON Object (" + name + ")")) {
                console.log("    JSON Key: " + name);
            }

            return result;
        };

        console.log("[+] JSONObject hooked");
    } catch (e) {
        console.log("[!] JSONObject hook error: " + e);
    }

    // ========================================
    // HTTPURLCONNECTION HOOKING
    // ========================================
    try {
        var HttpURLConnection = Java.use("java.net.HttpURLConnection");

        // Hook setRequestProperty
        HttpURLConnection.setRequestProperty.implementation = function(key, value) {
            if (key.toLowerCase() === "authorization") {
                detectTokenInString(value, "HttpURLConnection Authorization Header");
            }
            return this.setRequestProperty(key, value);
        };

        console.log("[+] HttpURLConnection hooked");
    } catch (e) {
        console.log("[!] HttpURLConnection hook error: " + e);
    }

    // ========================================
    // CUSTOM TOKEN STORAGE (HEURISTIC)
    // ========================================
    try {
        // Hook common encryption/decryption methods that might be used to protect tokens
        var Cipher = Java.use("javax.crypto.Cipher");

        Cipher.doFinal.overload('[B').implementation = function(input) {
            var result = this.doFinal(input);

            // Try to decode as string
            try {
                var decoded = Java.use("java.lang.String").$new(result);

                // Check if it's a protected token
                if (isJWT(decoded) || decoded.indexOf("token") !== -1) {
                    console.log(formatMessage("warning", "\n[+] Token Decrypted via Cipher:"));
                    console.log("    Algorithm: " + this.getAlgorithm());
                    console.log("    Value: " + truncateToken(decoded));
                    console.log("    [INFO] App encrypts tokens before storage");
                }
            } catch (e) {
                // Not a valid string
            }

            return result;
        };

        console.log("[+] Cipher monitoring enabled");
    } catch (e) {
        console.log("[!] Cipher monitoring error: " + e.message);
    }

    // ========================================
    // SQLITE DATABASE HOOKING (if tokens stored in DB)
    // ========================================
    try {
        var Cursor = Java.use("android.database.Cursor");

        // Hook getString
        Cursor.getString.implementation = function(columnIndex) {
            var result = this.getString(columnIndex);

            try {
                var columnName = this.getColumnName(columnIndex);
                detectTokenInString(result, "SQLite Database (" + columnName + ")");
            } catch (e) {
                // Column name not available
            }

            return result;
        };

        console.log("[+] SQLite Cursor hooked");
    } catch (e) {
        console.log("[!] SQLite Cursor hook error: " + e);
    }

    // ========================================
    // INTENT EXTRA HOOKING (tokens passed via Intents)
    // ========================================
    try {
        var Intent = Java.use("android.content.Intent");

        // Hook getStringExtra
        Intent.getStringExtra.implementation = function(name) {
            var result = this.getStringExtra(name);

            if (detectTokenInString(result, "Intent Extra (" + name + ")")) {
                console.log(formatMessage("warning", "    [WARNING] Token passed via Intent - can be intercepted!"));
            }

            return result;
        };

        console.log("[+] Intent hooked");
    } catch (e) {
        console.log("[!] Intent hook error: " + e);
    }

    // ========================================
    // LOGGING UTILITIES
    // ========================================
    function logTokenStatistics() {
        console.log(formatMessage("info", "\n[*] Token Monitoring Statistics:"));
        console.log("    JWT Detection: " + (CONFIG.detectJWT ? "Enabled" : "Disabled"));
        console.log("    Token Logging: " + (CONFIG.logAllTokens ? "Enabled" : "Disabled"));
        console.log("    JWT Decoding: " + (CONFIG.decodeJWT ? "Enabled" : "Disabled"));
        console.log("    Max Token Length: " + (CONFIG.maxTokenLength > 0 ? CONFIG.maxTokenLength + " chars" : "Unlimited"));
        console.log("    Token Parameters: " + CONFIG.tokenParams.length);
        console.log("    Cookie Names: " + CONFIG.cookieNames.length);
    }

    logTokenStatistics();

    console.log(formatMessage("success", "\n[*] JWT and Token Monitoring Script Loaded Successfully"));
});
