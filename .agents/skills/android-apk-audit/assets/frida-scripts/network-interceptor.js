/**
 * Frida Script: Network Traffic Interceptor (Enhanced)
 *
 * Purpose: Intercept and log all network traffic in Android applications
 * Usage: frida -U -f <package_name> -l network-interceptor.js
 *
 * What it hooks:
 * - okhttp3.OkHttpClient (OkHttp library)
 * - okhttp3.internal.http.RealInterceptorChain (Request mutations through interceptor chain)
 * - okhttp3.OkHttpWebSocket (WebSocket connections)
 * - java.net.HttpURLConnection / HttpsURLConnection
 * - retrofit2.Retrofit and retrofit2.ServiceMethod (if present)
 * - java.net.URL.openConnection (all URL connections)
 *
 * Output Format:
 * Color-coded logs with request/response pairing, interceptor chain tracking
 *
 * OWASP MASTG References:
 * - MASTG-TEST-0046: Test Network Communication
 * - MASTG-NET-002: Insecure Data Transport
 *
 * Credits:
 * OkHttp Interceptor Chain pattern inspired by FriList
 * https://github.com/rsenet/FriList
 *
 * Note: This is for security testing purposes only.
 * Always obtain proper authorization before testing.
 */

Java.perform(function() {
    console.log("[*] Network Interceptor Script Started");

    // ========================================
    // CONFIGURATION
    // ========================================
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
    // UTILITY FUNCTIONS
    // ========================================
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
            console.log(colorLabel("[!] SENSITIVE DATA DETECTED", "error") + " in " + source + ": " + found.join(", "));
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

    function formatBody(body, label, indent) {
        if (!CONFIG.logBodies || !body) return "";

        var displayBody = String(body);

        // Try to pretty-print JSON
        var isJson = false;
        try {
            if (displayBody.trim().startsWith("{") || displayBody.trim().startsWith("[")) {
                var jsonObj = JSON.parse(displayBody);
                displayBody = JSON.stringify(jsonObj, null, 2);
                isJson = true;
            }
        } catch (e) {
            // Not JSON, keep as-is
        }

        if (CONFIG.maxBodyLength > 0 && displayBody.length > CONFIG.maxBodyLength) {
            displayBody = displayBody.substring(0, CONFIG.maxBodyLength) + "\n... (truncated, " +
                      (body.length > displayBody.length ? body.length : displayBody.length) + " bytes total)";
        }

        return indent + colorLabel(label + ":", "info") +
               (isJson ? "\n" : "") + displayBody + "\n";
    }

    function readBodyToUtf8(reqBody) {
        try {
            if (!reqBody) return null;
            var Buffer = Java.use("okio.Buffer");
            var buf = Buffer.$new();
            reqBody.writeTo(buf);
            var out = buf.readUtf8();
            return out;
        } catch (e) {
            return null;
        }
    }

    function dumpRequest(req, label, indent) {
        try {
            console.log("\n" + colorLabel("=== " + label + " ===", "debug"));
            console.log(indent + colorLabel("Method:", "request") + " " + formatMethod(req.method()));
            console.log(indent + colorLabel("URL:", "url") + " " + formatUrl(req.url().toString()));

            console.log(indent + colorLabel("Headers:", "info"));
            console.log(formatHeaders(req.headers(), indent + "  "));

            var body = req.body();
            if (body) {
                try {
                    console.log(indent + colorLabel("Content-Type:", "info") + " " +
                          (body.contentType() ? body.contentType().toString() : "(null)"));
                    console.log(indent + colorLabel("Content-Length:", "info") + " " + body.contentLength());
                } catch (e) {
                    console.log(indent + colorLabel("Content-Length:", "info") + " (unknown)");
                }

                var utf8 = readBodyToUtf8(body);
                if (utf8 !== null) {
                    console.log(formatBody(utf8, "Body", indent + "  "));
                    detectSensitiveData(utf8, label + " Body");
                } else {
                    console.log(indent + "  Body: (not readable: streaming/one-shot/duplex or custom)");
                }
            } else {
                console.log(indent + colorLabel("Body:", "info") + " (none)");
            }
            console.log(indent + colorLabel("=== END ===", "debug"));
        } catch (e) {
            console.log(indent + colorLabel("dumpRequest failed:", "error") + " " + e);
        }
    }

    function dumpResponse(resp, indent) {
        try {
            console.log(indent + colorLabel("--- Response ---", "response"));
            var status = resp.code();
            console.log(indent + colorLabel("Status:", "status") + " " + formatStatus(status));
            console.log(indent + colorLabel("Message:", "info") + " " + resp.message());

            console.log(indent + colorLabel("Headers:", "info"));
            console.log(formatHeaders(resp.headers(), indent + "  "));

            var responseBody = resp.body();
            if (responseBody) {
                try {
                    console.log(indent + colorLabel("Content-Type:", "info") + " " +
                          (responseBody.contentType() ? responseBody.contentType().toString() : "(null)"));
                    console.log(indent + colorLabel("Content-Length:", "info") + " " + responseBody.contentLength());
                } catch (e) {
                    console.log(indent + colorLabel("Content-Length:", "info") + " (unknown)");
                }

                try {
                    var source = responseBody.source();
                    source.request(Number(Java.use("okio.Buffer").$new().size()));
                    var bodyText = source.buffer().readUtf8();
                    console.log(formatBody(bodyText, "Body", indent + "  "));
                    detectSensitiveData(bodyText, "Response Body");
                } catch (e) {
                    console.log(indent + "  Body: (cannot read - may be streamed)");
                }
            } else {
                console.log(indent + colorLabel("Body:", "info") + " (none)");
            }
            console.log(indent + colorLabel("--- END ---", "response"));
        } catch (e) {
            console.log(indent + colorLabel("dumpResponse failed:", "error") + " " + e);
        }
    }

    // ========================================
    // OKHTTP3 INTERCEPTOR CHAIN (ENHANCED)
    // ========================================
    // Credits: Pattern inspired by FriList
    // https://github.com/rsenet/FriList
    try {
        var RealInterceptorChain = Java.use("okhttp3.internal.http.RealInterceptorChain");
        console.log("[+] Found okhttp3.internal.http.RealInterceptorChain");

        if (RealInterceptorChain.proceed) {
            var overloads = RealInterceptorChain.proceed.overloads;
            for (var i = 0; i < overloads.length; i++) {
                var proceed_overload = overloads[i];
                console.log("[*] Hooking RealInterceptorChain.proceed overload: " +
                          proceed_overload.argumentTypes.map(function(t) { return t.className; }).join(", "));

                proceed_overload.implementation = function() {
                    // First arg is Request in all proceed overloads
                    var req = arguments[0];

                    // Get current index
                    var idx = this.index.value;

                    // Get previous interceptor name
                    // Previous interceptor is the one responsible for current req state
                    var interceptorName = "";
                    if (idx == 0) {
                        interceptorName = "Original Request";
                    } else {
                        try {
                            interceptorName = this.interceptors.value.get(idx-1).getClass().getName();
                        } catch (e) {
                            interceptorName = "Interceptor #" + (idx-1);
                        }
                    }

                    var url = req.url().toString();
                    if (shouldLogDomain(url)) {
                        dumpRequest(req, interceptorName, "  ");
                    }

                    // Call actual proceed
                    var response = proceed_overload.apply(this, arguments);

                    // Log final response
                    if (shouldLogDomain(url) && idx == this.interceptors.value.size()) {
                        dumpResponse(response, "  ");
                    }

                    return response;
                };
            }
            console.log("[+] Hooked RealInterceptorChain.proceed(*)");
        } else {
            console.log("[-] RealInterceptorChain.proceed not found (unexpected)");
        }
    } catch (e) {
        console.log("[-] RealInterceptorChain hook error: " + e);
    }

    // ========================================
    // OKHTTP3 REALCALL (SYNCHRONOUS & ASYNCHRONOUS)
    // ========================================
    try {
        var RealCall = Java.use("okhttp3.internal.connection.RealCall");

        // Hook synchronous execute - FIXED: proper recursion prevention
        var originalExecute = RealCall.execute;
        RealCall.execute.implementation = function() {
            if (this._fridaIntercepting) {
                return originalExecute.call(this);
            }

            this._fridaIntercepting = true;
            try {
                var req = this.request();
                var url = req.url().toString();
                var startTime = Date.now();

                if (shouldLogDomain(url)) {
                    console.log("\n" + colorLabel("[+] RealCall.execute()", "info"));
                    dumpRequest(req, "Execute Request", "  ");
                }

                var response = originalExecute.call(this);

                if (shouldLogDomain(url)) {
                    var duration = Date.now() - startTime;
                    console.log("  Duration: " + duration + "ms");
                    dumpResponse(response, "  ");
                }

                return response;
            } finally {
                this._fridaIntercepting = false;
            }
        };
        console.log("[+] Hooked RealCall.execute()");

        // Hook asynchronous enqueue - FIXED: proper recursion prevention
        var originalEnqueue = RealCall.enqueue;
        RealCall.enqueue.implementation = function(callback) {
            if (this._fridaIntercepting) {
                return originalEnqueue.call(this, callback);
            }

            this._fridaIntercepting = true;
            try {
                var req = this.request();
                var url = req.url().toString();
                var startTime = Date.now();

                if (shouldLogDomain(url)) {
                    console.log("\n" + colorLabel("[+] RealCall.enqueue()", "info"));
                    dumpRequest(req, "Enqueue Request", "  ");
                }

                // Wrap onResponse callback
                var onResponse = callback.onResponse;
                var originalOnResponse = onResponse.value || onResponse;
                callback.onResponse.value = function(call, response) {
                    if (shouldLogDomain(url)) {
                        var duration = Date.now() - startTime;
                        console.log("  Duration: " + duration + "ms");
                        dumpResponse(response, "  ");
                    }
                    return originalOnResponse(call, response);
                };

                return originalEnqueue.call(this, callback);
            } finally {
                this._fridaIntercepting = false;
            }
        };
        console.log("[+] Hooked RealCall.enqueue()");
    } catch (e) {
        console.log("[-] RealCall hook error: " + e);
    }

    // ========================================
    // OKHTTP WEBSOCKET MONITORING - FIXED: save original references
    // ========================================
    try {
        var OkHttpWebSocket = Java.use("okhttp3.OkHttpWebSocket");

        // Hook send method
        var originalSend = OkHttpWebSocket.send.overload('okio.ByteString');
        originalSend.implementation = function(bytes) {
            try {
                var message = bytes.utf8();
                console.log("\n" + colorLabel("[WS] SEND:", "websocket"));
                console.log("  Message: " + message.substring(0, CONFIG.maxBodyLength) +
                          (message.length > CONFIG.maxBodyLength ? "..." : ""));
                detectSensitiveData(message, "WebSocket Send");
            } catch (e) {
                console.log("\n" + colorLabel("[WS] SEND (binary):", "websocket") + " " + bytes.hex());
            }
            return originalSend.call(this, bytes);
        };

        // Hook response listener
        var WebSocketListener = Java.use("okhttp3.WebSocketListener");

        var originalOnMessage = WebSocketListener.onMessage;
        originalOnMessage.implementation = function(webSocket, bytes) {
            try {
                var message = bytes.utf8();
                console.log("\n" + colorLabel("[WS] RECV:", "websocket"));
                console.log("  Message: " + message.substring(0, CONFIG.maxBodyLength) +
                          (message.length > CONFIG.maxBodyLength ? "..." : ""));
                detectSensitiveData(message, "WebSocket Receive");
            } catch (e) {
                console.log("\n" + colorLabel("[WS] RECV (binary):", "websocket") + " " + bytes.hex());
            }
            return originalOnMessage.call(this, webSocket, bytes);
        };

        var originalOnClosing = WebSocketListener.onClosing;
        originalOnClosing.implementation = function(webSocket, code, reason) {
            console.log("\n" + colorLabel("[WS] CLOSING:", "websocket") + " code=" + code + " reason=" + reason);
            return originalOnClosing.call(this, webSocket, code, reason);
        };

        var originalOnClosed = WebSocketListener.onClosed;
        originalOnClosed.implementation = function(webSocket, code, reason) {
            console.log("\n" + colorLabel("[WS] CLOSED:", "websocket") + " code=" + code + " reason=" + reason);
            return originalOnClosed.call(this, webSocket, code, reason);
        };

        var originalOnFailure = WebSocketListener.onFailure;
        originalOnFailure.implementation = function(webSocket, t, response) {
            console.log("\n" + colorLabel("[WS] FAILURE:", "websocket") + " error=" + t);
            return originalOnFailure.call(this, webSocket, t, response);
        };

        console.log("[+] Hooked OkHttp WebSocket");
    } catch (e) {
        console.log("[-] WebSocket hook error: " + e);
    }

    // ========================================
    // RETROFIT2 SERVICE METHODS - FIXED: save original references
    // ========================================
    try {
        // Hook ServiceMethod to capture API endpoint calls
        var ServiceMethod = Java.use("retrofit2.ServiceMethod");
        var originalToRequest = ServiceMethod.toRequest;
        originalToRequest.implementation = function(args) {
            try {
                console.log("\n" + colorLabel("[Retrofit] Service Method:", "retrofit") + " " + this.name.value);
                var result = originalToRequest.call(this, args);
                console.log("  Converted to Request:");
                dumpRequest(result, "Retrofit Request", "  ");
                return result;
            } catch (e) {
                console.log("[-] Retrofit ServiceMethod error: " + e);
                return originalToRequest.call(this, args);
            }
        };
        console.log("[+] Hooked retrofit2.ServiceMethod.toRequest()");
    } catch (e) {
        console.log("[-] Retrofit2 not found: " + e);
    }

    // Hook Retrofit.create to log service initialization
    try {
        var Retrofit = Java.use("retrofit2.Retrofit");
        var originalCreate = Retrofit.create;
        originalCreate.implementation = function(service) {
            console.log("[+] " + colorLabel("Retrofit.create()", "retrofit") + " for: " + service.getName());
            return originalCreate.call(this, service);
        };
        console.log("[+] Hooked retrofit2.Retrofit.create()");
    } catch (e) {
        console.log("[-] Retrofit.create hook error: " + e);
    }

    // ========================================
    // OKHTTP3 CLIENT (LEGACY - kept for compatibility)
    // ========================================
    try {
        var OkHttpClient = Java.use("okhttp3.OkHttpClient");

        // Hook newCall - FIXED: proper recursion prevention
        var originalNewCall = OkHttpClient.newCall;
        OkHttpClient.newCall.implementation = function(request) {
            try {
                var url = request.url().toString();
                var method = request.method();
                var startTime = Date.now();

                // Prevent infinite recursion
                if (request._fridaIntercepting) {
                    return originalNewCall.call(this, request);
                }
                request._fridaIntercepting = true;

                if (shouldLogDomain(url)) {
                    console.log("\n" + colorLabel("[+] OkHttp.newCall()", "info") + ": " + formatMethod(method) + " " + formatUrl(url));
                }

                // Execute and capture response
                var call = originalNewCall.call(this, request);

                // Wrap execute to capture response
                var originalCallExecute = call.execute;
                call.execute = function() {
                    var response = originalCallExecute.call(this);
                    if (shouldLogDomain(url)) {
                        var duration = Date.now() - startTime;
                        console.log("  Duration: " + duration + "ms");
                        dumpResponse(response, "  ");
                    }
                    // Reset guard flag
                    request._fridaIntercepting = false;
                    return response;
                };

                return call;
            } catch (e) {
                console.log("[-] OkHttp.newCall error: " + e);
                return originalNewCall.call(this, request);
            }
        };

        console.log("[+] okhttp3.OkHttpClient hooked");
    } catch (e) {
        console.log("[-] OkHttp3 not found: " + e);
    }

    // ========================================
    // JAVA.NET.URLCONNECTION - FIXED: hook CLASS not instance
    // ========================================
    try {
        var URL = Java.use("java.net.URL");
        var URLConnection = Java.use("java.net.URLConnection");

        // FIX: Save original before replacing to avoid recursion
        var originalOpenConnection = URL.openConnection;
        originalOpenConnection.implementation = function() {
            var url = this.toString();
            if (shouldLogDomain(url)) {
                console.log("\n" + colorLabel("[+] URL.openConnection():", "info") + " " + formatUrl(url));
            }
            return originalOpenConnection.call(this);
        };

        // Hook getInputStream on URLConnection CLASS
        var originalGetInputStream = URLConnection.getInputStream;
        URLConnection.getInputStream.implementation = function() {
            try {
                var startTime = Date.now();
                var stream = originalGetInputStream.call(this);

                // Read and log response
                var reader = Java.use("java.io.BufferedReader").$new(
                    Java.use("java.io.InputStreamReader").$new(stream)
                );

                var response = "";
                var line;
                while ((line = reader.readLine()) !== null) {
                    response += line + "\n";
                }

                var duration = Date.now() - startTime;
                var url = this.getURL().toString();

                if (shouldLogDomain(url)) {
                    var status = "Unknown";
                    try {
                        var httpConn = Java.cast(this, Java.use("java.net.HttpURLConnection"));
                        status = httpConn.getResponseCode();
                    } catch (e) {
                        // Not an HttpURLConnection
                    }

                    console.log("  Duration: " + duration + "ms");
                    console.log("  Status: " + formatStatus(status));
                    console.log(formatBody(response, "Response Body", "  "));
                    detectSensitiveData(response, "URLConnection Response");
                }

                // Return new stream with content
                var bytes = Java.use("java.lang.String").$new(response).getBytes();
                return Java.use("java.io.ByteArrayInputStream").$new(bytes);
            } catch (e) {
                // On error, return original stream
                return originalGetInputStream.call(this);
            }
        };

        console.log("[+] java.net.URL.openConnection hooked");
    } catch (e) {
        console.log("[-] java.net.URL hook error: " + e);
    }

    // ========================================
    // JAVA.NET.HTTPURLCONNECTION - FIXED: save original references
    // ========================================
    try {
        var HttpURLConnection = Java.use("java.net.HttpURLConnection");

        // Hook getResponseCode
        var originalGetResponseCode = HttpURLConnection.getResponseCode;
        HttpURLConnection.getResponseCode.implementation = function() {
            try {
                var url = this.getURL().toString();
                var method = this.getRequestMethod();
                if (shouldLogDomain(url)) {
                    console.log("\n" + colorLabel("[+] HttpURLConnection:", "info") + " " + formatMethod(method) + " " + formatUrl(url));
                }

                var status = originalGetResponseCode.call(this);
                if (shouldLogDomain(url)) {
                    console.log("  Status: " + formatStatus(status));
                }

                return status;
            } catch (e) {
                console.log("[-] HttpURLConnection.getResponseCode error: " + e);
                throw e;
            }
        };

        // Hook connect
        var originalConnect = HttpURLConnection.connect;
        HttpURLConnection.connect.implementation = function() {
            try {
                var url = this.getURL().toString();
                var method = this.getRequestMethod();
                if (shouldLogDomain(url)) {
                    console.log("\n" + colorLabel("[+] HttpURLConnection.connect():", "info") + " " + formatMethod(method) + " " + formatUrl(url));
                }
                return originalConnect.call(this);
            } catch (e) {
                console.log("[-] HttpURLConnection.connect error: " + e);
                throw e;
            }
        };

        console.log("[+] java.net.HttpURLConnection hooked");
    } catch (e) {
        console.log("[-] HttpURLConnection hook error: " + e);
    }

    // ========================================
    // JAVAX.NET.SSL.HTTPSURLCONNECTION - FIXED: save original reference
    // ========================================
    try {
        var HttpsURLConnection = Java.use("javax.net.ssl.HttpsURLConnection");

        // Hook getResponseCode
        var originalHttpsGetResponseCode = HttpsURLConnection.getResponseCode;
        HttpsURLConnection.getResponseCode.implementation = function() {
            try {
                var url = this.getURL().toString();
                var method = this.getRequestMethod();
                var cipher = this.getCipherSuite();
                if (shouldLogDomain(url)) {
                    console.log("\n" + colorLabel("[+] HTTPS:", "info") + " " + formatMethod(method) + " " + formatUrl(url));
                    if (cipher) {
                        console.log("  Cipher: " + cipher);
                    }
                }

                var status = originalHttpsGetResponseCode.call(this);
                if (shouldLogDomain(url)) {
                    console.log("  Status: " + formatStatus(status));
                }

                return status;
            } catch (e) {
                console.log("[-] HttpsURLConnection.getResponseCode error: " + e);
                throw e;
            }
        };

        console.log("[+] javax.net.ssl.HttpsURLConnection hooked");
    } catch (e) {
        console.log("[-] HttpsURLConnection hook error: " + e);
    }

    // ========================================
    // ANDROID HTTP CLIENT (LEGACY - API 22 and below)
    // ========================================
    // NOTE: AndroidHttpClient was removed in Android 6.0 (API 23)
    // This section is kept only for compatibility with very old apps
    try {
        var AndroidHttpClient = Java.use("android.net.http.AndroidHttpClient");

        var originalAndroidExecute = AndroidHttpClient.execute;
        AndroidHttpClient.execute.implementation = function(target, context) {
            var uri = target.getURI().toString();
            var method = target.getMethod();
            console.log("\n" + colorLabel("[+] AndroidHttpClient:", "info") + " " + formatMethod(method) + " " + formatUrl(uri));

            var startTime = Date.now();
            var response = originalAndroidExecute.call(this, target, context);
            var duration = Date.now() - startTime;
            var status = response.getStatusLine().getStatusCode();

            console.log("  Duration: " + duration + "ms");
            console.log("  Status: " + formatStatus(status));

            return response;
        };

        console.log("[+] android.net.http.AndroidHttpClient hooked (LEGACY - API <23 only)");
    } catch (e) {
        console.log("[-] AndroidHttpClient not found (removed in API 23+): " + e);
    }

    // ========================================
    // APACHE HTTP CLIENT (LEGACY - API 22 and below)
    // ========================================
    // NOTE: Apache HttpClient was removed from Android SDK in Android 6.0 (API 23)
    // This section is kept only for compatibility with very old apps
    try {
        var HttpClient = Java.use("org.apache.http.client.HttpClient");

        var originalApacheExecute = HttpClient.execute.overload('org.apache.http.client.methods.HttpUriRequest');
        originalApacheExecute.implementation = function(request) {
            var uri = request.getURI().toString();
            var method = request.getMethod();
            console.log("\n" + colorLabel("[+] Apache HttpClient:", "info") + " " + formatMethod(method) + " " + formatUrl(uri));

            var startTime = Date.now();
            var response = originalApacheExecute.call(this, request);
            var duration = Date.now() - startTime;
            var status = response.getStatusLine().getStatusCode();

            console.log("  Duration: " + duration + "ms");
            console.log("  Status: " + formatStatus(status));

            return response;
        };

        console.log("[+] org.apache.http.client.HttpClient hooked (LEGACY - API <23 only)");
    } catch (e) {
        console.log("[-] Apache HttpClient not found (removed in API 23+): " + e);
    }

    // ========================================
    // SSL/TLS DETAILS - FIXED: save original reference
    // ========================================
    try {
        var SSLContext = Java.use("javax.net.ssl.SSLContext");

        var originalInit = SSLContext.init.overload('[Ljavax.net.ssl.KeyManager;', '[Ljavax.net.ssl.TrustManager;', 'java.security.SecureRandom');
        originalInit.implementation = function(keyManagers, trustManagers, secureRandom) {
            console.log("\n" + colorLabel("[+] SSLContext.init():", "info"));
            console.log("  Protocol: " + this.getProtocol());
            console.log("  TrustManagers: " + (trustManagers ? trustManagers.length : 0));
            return originalInit.call(this, keyManagers, trustManagers, secureRandom);
        };

        console.log("[+] javax.net.ssl.SSLContext hooked");
    } catch (e) {
        console.log("[-] SSLContext hook error: " + e);
    }

    console.log("[*] Network Interceptor Script Loaded Successfully");
    console.log("[*] OkHttp Interceptor Chain: Active (credits: FriList)");
    console.log("[*] WebSocket Monitoring: Active");
    console.log("[*] Retrofit Service Methods: Active");
});
