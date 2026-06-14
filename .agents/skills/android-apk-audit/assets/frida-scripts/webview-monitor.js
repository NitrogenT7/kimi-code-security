/**
 * WebView Monitor
 *
 * Hooks and monitors all WebView operations:
 * - WebView.loadUrl: URL loading with headers
 * - WebView.loadData/loadDataWithBaseURL: data content, MIME type, encoding
 * - WebView.evaluateJavascript: script execution
 * - WebView.setWebViewClient: client type
 * - WebSettings.setJavaScriptEnabled: JavaScript state
 * - WebSettings.setAllowFileAccess/setAllowFileAccessFromFileURLs/setAllowUniversalAccessFromFileURLs/setMixedContentMode/setBlockNetworkLoads: security settings
 * - WebView.addJavascriptInterface: exposed Java objects and methods
 * - WebViewClient.shouldOverrideUrlLoading/onPageStarted/onPageFinished: URL interception and page lifecycle
 * - WebChromeClient.onJsAlert/onJsConfirm/onJsPrompt: JavaScript dialogs
 *
 * Compatible with: Frida 16.x+ and Android 7-16
 * Usage: frida -U -f <package_name> -l webview-monitor.js
 */

Java.perform(function() {
    console.log("[*] WebView Monitor Script Started");

    // ========================================
    // 1. Hook WebView.loadUrl
    // ========================================
    try {
        var WebView = Java.use("android.webkit.WebView");

        WebView.loadUrl.overload("java.lang.String").implementation = function(url) {
            console.log("[+] WebView.loadUrl() - URL: " + url);
            this.loadUrl(url);
        };

        WebView.loadUrl.overload("java.lang.String", "java.util.Map").implementation = function(url, additionalHttpHeaders) {
            console.log("[+] WebView.loadUrl() - URL: " + url);
            console.log("[+]   Headers: " + additionalHttpHeaders.toString());
            this.loadUrl(url, additionalHttpHeaders);
        };

        console.log("[+] WebView.loadUrl hooked successfully");
    } catch (e) {
        console.log("[!] WebView.loadUrl hook failed: " + e.message);
    }

    // ========================================
    // 2. Hook WebView.loadData
    // ========================================
    try {
        WebView.loadData.overload("java.lang.String", "java.lang.String", "java.lang.String").implementation = function(data, mimeType, encoding) {
            console.log("[+] WebView.loadData()");
            console.log("[+]   MIME Type: " + mimeType);
            console.log("[+]   Encoding: " + encoding);
            console.log("[+]   Data (first 200 chars): " + (data ? data.substring(0, Math.min(200, data.length)) : "null"));
            this.loadData(data, mimeType, encoding);
        };

        console.log("[+] WebView.loadData hooked successfully");
    } catch (e) {
        console.log("[!] WebView.loadData hook failed: " + e.message);
    }

    // ========================================
    // 3. Hook WebView.loadDataWithBaseURL
    // ========================================
    try {
        WebView.loadDataWithBaseURL.implementation = function(baseUrl, data, mimeType, encoding, historyUrl) {
            console.log("[+] WebView.loadDataWithBaseURL()");
            console.log("[+]   Base URL: " + baseUrl);
            console.log("[+]   MIME Type: " + mimeType);
            console.log("[+]   Encoding: " + encoding);
            console.log("[+]   History URL: " + historyUrl);
            console.log("[+]   Data (first 200 chars): " + (data ? data.substring(0, Math.min(200, data.length)) : "null"));
            this.loadDataWithBaseURL(baseUrl, data, mimeType, encoding, historyUrl);
        };

        console.log("[+] WebView.loadDataWithBaseURL hooked successfully");
    } catch (e) {
        console.log("[!] WebView.loadDataWithBaseURL hook failed: " + e.message);
    }

    // ========================================
    // 4. Hook WebView.evaluateJavascript
    // ========================================
    try {
        WebView.evaluateJavascript.implementation = function(script, resultCallback) {
            console.log("[+] WebView.evaluateJavascript()");
            console.log("[+]   Script: " + script);
            this.evaluateJavascript(script, resultCallback);
        };

        console.log("[+] WebView.evaluateJavascript hooked successfully");
    } catch (e) {
        console.log("[!] WebView.evaluateJavascript hook failed: " + e.message);
    }

    // ========================================
    // 5. Hook WebView.setWebViewClient
    // ========================================
    try {
        WebView.setWebViewClient.implementation = function(client) {
            console.log("[+] WebView.setWebViewClient() - Client: " + (client ? client.getClass().getName() : "null"));
            this.setWebViewClient(client);
        };

        console.log("[+] WebView.setWebViewClient hooked successfully");
    } catch (e) {
        console.log("[!] WebView.setWebViewClient hook failed: " + e.message);
    }

    // ========================================
    // 6. Hook WebSettings.setJavaScriptEnabled
    // ========================================
    try {
        var WebSettings = Java.use("android.webkit.WebSettings");

        WebSettings.setJavaScriptEnabled.implementation = function(flag) {
            console.log("[+] WebSettings.setJavaScriptEnabled() - Enabled: " + flag);
            this.setJavaScriptEnabled(flag);
        };

        console.log("[+] WebSettings.setJavaScriptEnabled hooked successfully");
    } catch (e) {
        console.log("[!] WebSettings.setJavaScriptEnabled hook failed: " + e.message);
    }

    // ========================================
    // 7. Hook WebView.addJavascriptInterface
    // ========================================
    try {
        WebView.addJavascriptInterface.implementation = function(obj, name) {
            console.log("[+] WebView.addJavascriptInterface()");
            console.log("[+]   Interface Name: " + name);
            console.log("[+]   Object Class: " + obj.getClass().getName());

            // Log all public methods of interface object
            var methods = obj.getClass().getMethods();
            console.log("[+]   Exposed Methods:");
            for (var i = 0; i < methods.length; i++) {
                var method = methods[i];
                console.log("[+]     - " + method.getName() + "(" + getParameterTypes(method.getParameterTypes()) + ")");
            }

            this.addJavascriptInterface(obj, name);
        };

        // Helper function to get parameter types
        function getParameterTypes(paramTypes) {
            if (!paramTypes || paramTypes.length === 0) return "";
            var types = [];
            for (var i = 0; i < paramTypes.length; i++) {
                types.push(paramTypes[i].getSimpleName());
            }
            return types.join(", ");
        }

        console.log("[+] WebView.addJavascriptInterface hooked successfully");
    } catch (e) {
        console.log("[!] WebView.addJavascriptInterface hook failed: " + e.message);
    }

    // ========================================
    // 8. Hook WebViewClient.shouldOverrideUrlLoading
    // ========================================
    try {
        var WebViewClient = Java.use("android.webkit.WebViewClient");

        // Android API 24+
        WebViewClient.shouldOverrideUrlLoading.overload("android.webkit.WebView", "android.webkit.WebResourceRequest").implementation = function(view, request) {
            var url = request.getUrl().toString();
            console.log("[+] WebViewClient.shouldOverrideUrlLoading() - URL: " + url);
            console.log("[+]   Method: " + request.getMethod());
            console.log("[+]   Is Redirect: " + request.isRedirect());
            console.log("[!] URL interception detected!");
            return this.shouldOverrideUrlLoading(view, request);
        };

        // Legacy API
        WebViewClient.shouldOverrideUrlLoading.overload("android.webkit.WebView", "java.lang.String").implementation = function(view, url) {
            console.log("[+] WebViewClient.shouldOverrideUrlLoading() (Legacy) - URL: " + url);
            console.log("[!] URL interception detected!");
            return this.shouldOverrideUrlLoading(view, url);
        };

        console.log("[+] WebViewClient.shouldOverrideUrlLoading hooked successfully");
    } catch (e) {
        console.log("[!] WebViewClient.shouldOverrideUrlLoading hook failed: " + e.message);
    }

    // ========================================
    // 9. Hook WebViewClient.onPageStarted/Finished
    // ========================================
    try {
        WebViewClient.onPageStarted.implementation = function(view, url, favicon) {
            console.log("[+] WebViewClient.onPageStarted() - URL: " + url);
            this.onPageStarted(view, url, favicon);
        };

        WebViewClient.onPageFinished.implementation = function(view, url) {
            console.log("[+] WebViewClient.onPageFinished() - URL: " + url);
            this.onPageFinished(view, url);
        };

        console.log("[+] WebViewClient page lifecycle hooked successfully");
    } catch (e) {
        console.log("[!] WebViewClient page lifecycle hook failed: " + e.message);
    }

    // ========================================
    // 10. Hook WebChromeClient methods
    // ========================================
    try {
        var WebChromeClient = Java.use("android.webkit.WebChromeClient");

        WebChromeClient.onJsAlert.implementation = function(view, url, message, result) {
            console.log("[+] WebChromeClient.onJsAlert() - URL: " + url);
            console.log("[+]   Message: " + message);
            console.log("[!] JavaScript Alert detected!");
            this.onJsAlert(view, url, message, result);
        };

        WebChromeClient.onJsConfirm.implementation = function(view, url, message, result) {
            console.log("[+] WebChromeClient.onJsConfirm() - URL: " + url);
            console.log("[+]   Message: " + message);
            console.log("[!] JavaScript Confirm detected!");
            this.onJsConfirm(view, url, message, result);
        };

        WebChromeClient.onJsPrompt.implementation = function(view, url, message, defaultValue, result) {
            console.log("[+] WebChromeClient.onJsPrompt() - URL: " + url);
            console.log("[+]   Message: " + message);
            console.log("[+]   Default Value: " + defaultValue);
            console.log("[!] JavaScript Prompt detected!");
            this.onJsPrompt(view, url, message, defaultValue, result);
        };

        console.log("[+] WebChromeClient dialogs hooked successfully");
    } catch (e) {
        console.log("[!] WebChromeClient hook failed: " + e.message);
    }

    // ========================================
    // 11. Hook WebSettings other security settings
    // ========================================
    try {
        WebSettings.setAllowFileAccess.implementation = function(allow) {
            console.log("[+] WebSettings.setAllowFileAccess() - Allowed: " + allow);
            this.setAllowFileAccess(allow);
        };

        WebSettings.setAllowFileAccessFromFileURLs.implementation = function(allow) {
            console.log("[+] WebSettings.setAllowFileAccessFromFileURLs() - Allowed: " + allow);
            this.setAllowFileAccessFromFileURLs(allow);
        };

        WebSettings.setAllowUniversalAccessFromFileURLs.implementation = function(allow) {
            console.log("[+] WebSettings.setAllowUniversalAccessFromFileURLs() - Allowed: " + allow);
            this.setAllowUniversalAccessFromFileURLs(allow);
        };

        WebSettings.setMixedContentMode.implementation = function(mode) {
            var modeStr = "Unknown";
            if (mode === 0) modeStr = "MIXED_CONTENT_ALWAYS_ALLOW";
            else if (mode === 1) modeStr = "MIXED_CONTENT_NEVER_ALLOW";
            else if (mode === 2) modeStr = "MIXED_CONTENT_COMPATIBILITY_MODE";
            console.log("[+] WebSettings.setMixedContentMode() - Mode: " + modeStr + " (" + mode + ")");
            this.setMixedContentMode(mode);
        };

        WebSettings.setBlockNetworkLoads.implementation = function(flag) {
            console.log("[+] WebSettings.setBlockNetworkLoads() - Blocked: " + flag);
            this.setBlockNetworkLoads(flag);
        };

        console.log("[+] WebSettings security settings hooked successfully");
    } catch (e) {
        console.log("[!] WebSettings security settings hook failed: " + e.message);
    }

    console.log("[*] WebView Monitor Script Completed");
});