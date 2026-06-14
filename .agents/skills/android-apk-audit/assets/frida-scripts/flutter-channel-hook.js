/**
 * Flutter Method Channel Hook
 * ============================
 *
 * Maturity: BETA
 *
 * ⚠️ IMPORTANT LIMITATION: Method Channel hooking only works with Flutter DEBUG/PROFILE builds.
 * Release builds use AOT compilation where MethodChannel is not accessible via Java hooks.
 * The SSL pinning bypass works on all build types.
 *
 * What works:
 * - Method Channel detection, enumeration and live invocation
 * - Event Channel monitoring
 * - Channel registry with method history
 * - RPC exports for programmatic access
 * - Message logging to file with timestamps
 * - Flutter Engine internals hooking
 * - SSL Pinning bypass for Flutter
 *
 * Comprehensive Frida script for analyzing Flutter applications.
 * Hooks Method Channels, Event Channels, and JavaScript bridge.
 *
 * Features:
 * - Live channel invocation via RPC exports
 * - Channel registry with method call history
 * - Per-channel method listing and filtering
 * - Dump registry to file or return as JSON
 * - SSL Pinning bypass for OkHttp and standard Android
 *
 * NOTE: This script only works with Flutter DEBUG/PROFILE builds.
 * Release builds use AOT compilation and MethodChannel is not
 * accessible via Java hooks.
 *
 * Usage:
 *   frida -U -f com.example.app -l flutter-channel-hook.js
 *
 * RPC Usage (from frida CLI or via frida-python):
 *   session.enable_jit()
 *   script = session.create_script(open("flutter-channel-hook.js").read())
 *   script.load()
 *   exports = script.exports
 *
 *   exports.listchannels()           -> array of channel names
 *   exports.testchannel("name","method",{}) -> invoke method
 *   exports.dumpregistry()           -> channel registry as array
 *   exports.gethistory("channel")     -> method call history for channel
 *
 * Requirements:
 *   - Rooted device or emulator
 *   - Frida server running
 *   - Flutter app (DEBUG or PROFILE mode, NOT release)
 */

// ============================================
// Channel Registry (global state)
// ============================================

var ChannelRegistry = {
    channels: {},      // name -> { methods: Set, calls: [], createdAt: timestamp }
    callHistory: [],    // recent calls across all channels

    registerChannel: function(name) {
        if (!this.channels[name]) {
            this.channels[name] = {
                methods: new Set(),
                calls: [],
                createdAt: new Date().toISOString()
            };
        }
        return this.channels[name];
    },

    registerCall: function(channelName, method, args, direction, result) {
        var entry = this.registerChannel(channelName);
        entry.methods.add(method);
        var callRecord = {
            method: method,
            args: args,
            direction: direction,
            result: result !== undefined ? result : null,
            timestamp: new Date().toISOString()
        };
        entry.calls.push(callRecord);
        this.callHistory.push({
            channel: channelName,
            ...callRecord
        });
        // Keep last 500 calls to prevent memory exhaustion
        if (this.callHistory.length > 500) {
            this.callHistory = this.callHistory.slice(-500);
        }
        // Keep last 200 calls per channel
        if (entry.calls.length > 200) {
            entry.calls = entry.calls.slice(-200);
        }
    },

    getChannelNames: function() {
        return Object.keys(this.channels).sort();
    },

    getChannelMethods: function(channelName) {
        var ch = this.channels[channelName];
        if (!ch) return [];
        return Array.from(ch.methods).sort();
    },

    getChannelHistory: function(channelName, limit) {
        var ch = this.channels[channelName];
        if (!ch) return [];
        var history = ch.calls.slice();
        return limit ? history.slice(-limit) : history;
    },

    getAllHistory: function(limit) {
        var hist = this.callHistory.slice();
        return limit ? hist.slice(-limit) : hist;
    },

    getRegistry: function() {
        var result = [];
        var self = this;
        Object.keys(this.channels).sort().forEach(function(name) {
            var ch = self.channels[name];
            result.push({
                name: name,
                methodCount: ch.methods.size,
                callCount: ch.calls.length,
                methods: Array.from(ch.methods).sort(),
                createdAt: ch.createdAt
            });
        });
        return result;
    }
};

// ============================================
// Configuration
// ============================================

var CONFIG = {
    outputDir: "/sdcard/flutter_analysis/",
    methodChannels: true,
    eventChannels: true,
    flutterEngine: true,
    sslPinning: true,
    debugLogging: true,
    channelFilters: [],
    verbose: true,
    saveLogs: true,
    maxCalls: 200   // per-channel call history limit
};

// ============================================
// Utility Functions
// ============================================

function log(message, level) {
    if (level === undefined) level = "INFO";
    var timestamp = new Date().toISOString();
    var prefix = "[" + timestamp + "] [" + level + "]";
    var fullMessage = prefix + " " + message;
    console.log(fullMessage);
    if (CONFIG.saveLogs) saveLogToFile(fullMessage);
}

function safeStringify(obj) {
    try {
        return JSON.stringify(obj);
    } catch (e) {
        return "[unserializable]";
    }
}

function saveLogToFile(message) {
    try {
        var File = Java.use("java.io.File");
        var FileWriter = Java.use("java.io.FileWriter");
        var dir = File.$new(CONFIG.outputDir);
        if (!dir.exists()) dir.mkdirs();
        var file = File.$new(CONFIG.outputDir, "flutter_channel.log");
        var writer = FileWriter.$new(file, true);
        writer.write(message + "\n");
        writer.close();
    } catch (e) { /* non-critical */ }
}

function filterChannel(channelName) {
    if (CONFIG.channelFilters.length === 0) return true;
    return CONFIG.channelFilters.some(function(f) {
        return channelName.indexOf(f) !== -1;
    });
}

// ============================================
// Method Channel Hooking
// ============================================

function hookMethodChannels() {
    if (!CONFIG.methodChannels) return;
    log("Hooking Method Channels...");

    Java.perform(function() {
        // Hook FlutterMethodChannel.invokeMethod (Flutter -> Native, no callback)
        try {
            var MethodChannel = Java.use("io.flutter.plugin.common.MethodChannel");
            MethodChannel.invokeMethod.overload("java.lang.String", "java.lang.Object").implementation = function(method, args) {
                var name = this.name;
                if (filterChannel(name)) {
                    log("[MethodChannel] " + name + ": invokeMethod(\"" + method + "\", " + safeStringify(args) + ")", "METHOD");
                    ChannelRegistry.registerCall(name, method, args, "flutter-to-native", null);
                }
                return this.invokeMethod(method, args);
            };
            log("[+] FlutterMethodChannel.invokeMethod(String,Object) hooked", "SUCCESS");
        } catch (e) {
            log("[-] FlutterMethodChannel.invokeMethod hook failed: " + e, "ERROR");
        }

        // Hook FlutterMethodChannel.invokeMethod (Flutter -> Native, with callback)
        try {
            var MethodChannel2 = Java.use("io.flutter.plugin.common.MethodChannel");
            MethodChannel2.invokeMethod.overload("java.lang.String", "java.lang.Object", "io.flutter.plugin.common.MethodChannel$Result").implementation = function(method, args, callback) {
                var name = this.name;
                if (filterChannel(name)) {
                    log("[MethodChannel] " + name + ": invokeMethod(\"" + method + "\", " + safeStringify(args) + ") [callback]", "METHOD");
                    ChannelRegistry.registerCall(name, method, args, "flutter-to-native-async", null);
                }
                return this.invokeMethod(method, args, callback);
            };
            log("[+] FlutterMethodChannel.invokeMethod(String,Object,Result) hooked", "SUCCESS");
        } catch (e) {
            log("[-] FlutterMethodChannel.invokeMethod(callback) hook failed: " + e, "ERROR");
        }

        // Hook setMethodCallHandler — captures native -> Flutter calls
        try {
            var HandlerClass = Java.registerClass({
                name: "com.frida.FlutterMethodCallHandler",
                implements: [Java.use("io.flutter.plugin.common.MethodChannel$MethodCallHandler")],
                methods: {
                    onMethodCall: function(call, result) {
                        // FIX: MethodCall.channel and MethodCall.method are Strings, not JavaScript wrapped objects with .value
                        var channelName = call.channel;
                        var methodName = call.method;
                        var args = call.arguments;
                        log("[MethodChannel] " + channelName + ": onMethodCall(\"" + methodName + "\", " + safeStringify(args) + ") [native-to-flutter]", "METHOD");
                        ChannelRegistry.registerCall(channelName, methodName, args, "native-to-flutter", null);
                        // Forward to original handler
                        this._originalHandler.onMethodCall(call, result);
                    }
                }
            });

            var MethodChannel3 = Java.use("io.flutter.plugin.common.MethodChannel");
            var originalSetHandler = MethodChannel3.setMethodCallHandler.implementation;
            MethodChannel3.setMethodCallHandler.overload("io.flutter.plugin.common.MethodChannel$MethodCallHandler").implementation = function(handler) {
                var name = this.name;
                if (handler !== null) {
                    try {
                        // Wrap the handler to intercept calls
                        var wrapper = HandlerClass.$new();
                        wrapper._originalHandler = handler;
                        if (filterChannel(name)) {
                            log("[MethodChannel] " + name + ": setMethodCallHandler (intercepted)", "METHOD");
                        }
                        return this.setMethodCallHandler(wrapper);
                    } catch (e) {
                        log("[-] Handler wrapping failed for " + name + ": " + e, "ERROR");
                    }
                }
                if (filterChannel(name)) {
                    log("[MethodChannel] " + name + ": setMethodCallHandler (null)", "METHOD");
                }
                return this.setMethodCallHandler(handler);
            };
            log("[+] FlutterMethodChannel.setMethodCallHandler hooked (with call interception)", "SUCCESS");
        } catch (e) {
            log("[-] setMethodCallHandler hook failed: " + e, "ERROR");
            // Fallback: at least register when handlers are set
            try {
                var MethodChannelFB = Java.use("io.flutter.plugin.common.MethodChannel");
                MethodChannelFB.setMethodCallHandler.implementation = function(handler) {
                    var name = this.name;
                    if (filterChannel(name)) {
                        log("[MethodChannel] " + name + ": setMethodCallHandler registered", "METHOD");
                        if (handler !== null) ChannelRegistry.registerChannel(name);
                    }
                    return this.setMethodCallHandler(handler);
                };
                log("[+] setMethodCallHandler fallback hooked", "SUCCESS");
            } catch (e2) {
                log("[-] setMethodCallHandler fallback failed: " + e2, "ERROR");
            }
        }

        // Hook BinaryMessenger for low-level visibility
        try {
            var BinaryMessenger = Java.use("io.flutter.plugin.common.BinaryMessenger");
            BinaryMessenger.send.overload("java.lang.String", "java.nio.ByteBuffer", "io.flutter.plugin.common.BinaryMessenger$BinaryReply").implementation = function(channel, message, callback) {
                if (filterChannel(channel)) {
                    var bytes = message ? message.remaining() : 0;
                    log("[BinaryMessenger] " + channel + ": send(" + bytes + " bytes)", "BINARY");
                }
                return this.send(channel, message, callback);
            };
            BinaryMessenger.setMessageHandler.overload("java.lang.String", "io.flutter.plugin.common.BinaryMessenger$BinaryMessageHandler").implementation = function(channel, handler) {
                if (filterChannel(channel)) {
                    log("[BinaryMessenger] " + channel + ": setMessageHandler registered", "BINARY");
                    if (handler !== null) ChannelRegistry.registerChannel(channel);
                }
                return this.setMessageHandler(channel, handler);
            };
            log("[+] BinaryMessenger hooked", "SUCCESS");
        } catch (e) {
            log("[-] BinaryMessenger hook failed: " + e, "ERROR");
        }
    });
}

// ============================================
// Event Channel Hooking
// ============================================

function hookEventChannels() {
    if (!CONFIG.eventChannels) return;
    log("Hooking Event Channels...");

    Java.perform(function() {
        try {
            var EventChannel = Java.use("io.flutter.plugin.common.EventChannel");
            EventChannel.setStreamHandler.implementation = function(handler) {
                var name = this.name;
                if (filterChannel(name)) {
                    log("[EventChannel] " + name + ": setStreamHandler registered", "EVENT");
                    if (handler !== null) ChannelRegistry.registerChannel(name);
                }
                return this.setStreamHandler(handler);
            };
            log("[+] EventChannel hooked", "SUCCESS");
        } catch (e) {
            log("[-] EventChannel hook failed: " + e, "ERROR");
        }
    });
}

// ============================================
// Flutter Engine Internals
// ============================================

function hookFlutterEngine() {
    if (!CONFIG.flutterEngine) return;
    log("Hooking Flutter Engine...");

    Java.perform(function() {
        try {
            var FlutterJNI = Java.use("io.flutter.embedding.engine.FlutterJNI");
            FlutterJNI.dispatchPlatformMessage.implementation = function(channel, message, position, callback) {
                log("[FlutterJNI] Platform message on " + channel, "ENGINE");
                return this.dispatchPlatformMessage(channel, message, position, callback);
            };
            FlutterJNI.dispatchPointerData.implementation = function(data) {
                log("[FlutterJNI] Pointer data dispatched", "ENGINE");
                return this.dispatchPointerData(data);
            };
            log("[+] FlutterJNI hooked", "SUCCESS");
        } catch (e) {
            log("[-] FlutterJNI hook failed: " + e, "ERROR");
        }

        try {
            var FlutterEngine = Java.use("io.flutter.embedding.engine.FlutterEngine");
            FlutterEngine.getDartExecutor.implementation = function() {
                var executor = this.getDartExecutor();
                log("[FlutterEngine] DartExecutor accessed", "ENGINE");
                return executor;
            };
            log("[+] FlutterEngine hooked", "SUCCESS");
        } catch (e) {
            log("[-] FlutterEngine hook failed: " + e, "ERROR");
        }

        try {
            var DartExecutor = Java.use("io.flutter.embedding.engine.DartExecutor");
            DartExecutor.executeDartEntrypoint.implementation = function(entrypoint) {
                log("[DartExecutor] Executing entrypoint: " + entrypoint, "ENGINE");
                return this.executeDartEntrypoint(entrypoint);
            };
            log("[+] DartExecutor hooked", "SUCCESS");
        } catch (e) {
            log("[-] DartExecutor hook failed: " + e, "ERROR");
        }
    });
}

// ============================================
// SSL Pinning Bypass for Flutter
// ============================================

function hookSSLPinning() {
    if (!CONFIG.sslPinning) return;
    log("Hooking SSL Pinning (Flutter)...");

    Java.perform(function() {
        try {
            var CertificatePinner = Java.use("okhttp3.CertificatePinner");
            CertificatePinner.check.overload("java.lang.String", "java.util.List").implementation = function(hostname, certificates) {
                log("[SSL] CertificatePinner.check bypassed for: " + hostname, "SSL");
            };
            log("[+] OkHttp CertificatePinner bypassed", "SUCCESS");
        } catch (e) { /* OkHttp not used */ }

        try {
            var X509TrustManager = Java.use("javax.net.ssl.X509TrustManager");
            var SSLContext = Java.use("javax.net.ssl.SSLContext");
            var TrustManager = Java.registerClass({
                name: "com.frida.TrustManager",
                implements: [X509TrustManager],
                methods: {
                    checkClientTrusted: function(chain, authType) { },
                    checkServerTrusted: function(chain, authType) { },
                    getAcceptedIssuers: function() { return []; }
                }
            });
            var sslContext = SSLContext.getInstance("TLS");
            sslContext.init(null, [TrustManager.$new()], null);
            SSLContext.setDefault(sslContext);
            log("[+] TrustManager bypassed", "SUCCESS");
        } catch (e) {
            log("[-] TrustManager bypass failed: " + e, "ERROR");
        }

        try {
            var URL = Java.use("java.net.URL");
            URL.openConnection.overload().implementation = function() {
                var conn = this.openConnection();
                log("[HTTP] Opening connection to: " + this.toString(), "HTTP");
                return conn;
            };
        } catch (e) { /* non-critical */ }
    });
}

// ============================================
// Debug Logging
// ============================================

function enableDebugLogging() {
    if (!CONFIG.debugLogging) return;
    log("Enabling Debug Logging...");

    Java.perform(function() {
        try {
            var Log = Java.use("android.util.Log");
            ["d", "i", "w", "e"].forEach(function(level) {
                Log[level].overload("java.lang.String", "java.lang.String").implementation = function(tag, message) {
                    if (tag.toLowerCase().indexOf("flutter") !== -1 || CONFIG.verbose) {
                        log("[Log." + level + "] " + tag + ": " + message, level.toUpperCase());
                    }
                    return Log[level].call(Log, tag, message);
                };
            });
            log("[+] Android Log hooked", "SUCCESS");
        } catch (e) {
            log("[-] Log hook failed: " + e, "ERROR");
        }
    });
}

// ============================================
// Main Entry Point
// ============================================

function main() {
    log("====================================", "INFO");
    log("Flutter Channel Hook Started", "INFO");
    log("====================================", "INFO");
    log("Output Directory: " + CONFIG.outputDir, "INFO");
    log("Verbose: " + CONFIG.verbose, "INFO");
    log("Save Logs: " + CONFIG.saveLogs, "INFO");
    log("====================================", "INFO");

    setTimeout(function() {
        Java.perform(function() {
            log("Hooking Flutter components...", "INFO");
            hookMethodChannels();
            hookEventChannels();
            hookFlutterEngine();
            hookSSLPinning();
            enableDebugLogging();
            log("====================================", "INFO");
            log("Flutter hooks installed successfully", "SUCCESS");
            log("Monitor console for channel activity", "INFO");
            log("Logs saved to: " + CONFIG.outputDir + "flutter_channel.log", "INFO");
            log("====================================", "INFO");
        });
    }, 3000);
}

// Execute
main();

// ============================================
// RPC Exports
// ============================================

/**
 * List all registered channel names
 */
function listMethodChannels() {
    return ChannelRegistry.getChannelNames();
}

/**
 * Invoke a method on a specific channel
 * @param {string} channelName - The channel name
 * @param {string} method - The method name to invoke
 * @param {object} args - Arguments to pass (default: {})
 */
function testMethodChannel(channelName, method, args) {
    if (args === undefined) args = {};
    if (!channelName || !method) {
        return { error: "channelName and method are required" };
    }
    var result = { success: false, error: null, result: null };
    try {
        Java.perform(function() {
            var MethodChannel = Java.use("io.flutter.plugin.common.MethodChannel");
            var FlutterJNI = Java.use("io.flutter.embedding.engine.FlutterJNI");
            // Find the channel instance — we use BinaryMessenger to invoke
            var messenger = null;
            Java.choose("io.flutter.embedding.engine.FlutterEngine", {
                onMatch: function(instance) {
                    try {
                        var executor = instance.getDartExecutor();
                        messenger = executor;
                    } catch (e) { }
                },
                onComplete: function() { }
            });
            if (messenger === null) {
                // Fallback: try to find via FlutterPluginRegistry
                Java.choose("io.flutter.app.FlutterPluginRegistry", {
                    onMatch: function(instance) {
                        try {
                            messenger = instance;
                        } catch (e) { }
                    },
                    onComplete: function() { }
                });
            }
            if (messenger === null) {
                result.error = "FlutterEngine not found. Is the app running with DEBUG/PROFILE mode?";
                return;
            }
            // Build method call encoded data
            var MethodCall = Java.use("io.flutter.plugin.common.MethodCall");
            var StandardMethodCodec = Java.use("io.flutter.plugin.common.StandardMethodCodec");
            var StandardMessageCodec = Java.use("io.flutter.plugin.common.StandardMessageCodec");
            var ByteBuffer = Java.use("java.nio.ByteBuffer");
            var javaArgs = Java.to(JSON.parse(JSON.stringify(args)), "java.lang.Object");
            var call = MethodCall.$new(method, javaArgs);
            var encoded = StandardMethodCodec.getInstance().encodeMethodCall(call);
            // Send via BinaryMessenger
            var semaphore = false;
            var reply = Java.registerClass({
                name: "com.frida.BinaryReply",
                implements: [Java.use("io.flutter.plugin.common.BinaryMessenger$BinaryReply")],
                methods: {
                    reply: function(buffer) {
                        semaphore = true;
                        if (buffer !== null) {
                            try {
                                var decoded = StandardMethodCodec.getInstance().decodeEnvelope(buffer);
                                result.result = JSON.parse(safeStringify(decoded));
                                result.success = true;
                            } catch (e) {
                                result.result = safeStringify(buffer);
                                result.success = true;
                            }
                        } else {
                            result.success = true;
                            result.result = null;
                        }
                    }
                }
            });
            log("[RPC] Invoking " + channelName + "/" + method + " with args " + safeStringify(args), "RPC");
            messenger.send(channelName, encoded, reply);
            // Wait briefly for async reply (max 5s)
            var waited = 0;
            while (!semaphore && waited < 5000) {
                Java.perform(function() { });
                var start = Date.now();
                while (Date.now() - start < 100) { }
                waited += 100;
            }
            if (!semaphore) {
                result.error = "No reply received within 5 seconds. Channel may not have a handler registered.";
            }
        });
    } catch (e) {
        result.error = e.toString();
    }
    if (result.error && !result.success) {
        log("[RPC] testMethodChannel error: " + result.error, "ERROR");
    }
    return result;
}

/**
 * Get all channel names, methods, and stats
 */
function dumpChannelRegistry() {
    var registry = ChannelRegistry.getRegistry();
    var summary = "Channel Registry Dump\n";
    summary += "======================\n\n";
    registry.forEach(function(ch) {
        summary += "Channel: " + ch.name + "\n";
        summary += "  Methods (" + ch.methodCount + "): " + ch.methods.join(", ") + "\n";
        summary += "  Calls: " + ch.callCount + "\n";
        summary += "  Created: " + ch.createdAt + "\n\n";
    });
    summary += "\nTotal channels: " + registry.length;
    log("[RPC] Registry dumped (" + registry.length + " channels)", "RPC");
    try {
        var File = Java.use("java.io.File");
        var FileWriter = Java.use("java.io.FileWriter");
        var dir = File.$new(CONFIG.outputDir);
        if (!dir.exists()) dir.mkdirs();
        var file = File.$new(CONFIG.outputDir, "channel_registry.txt");
        var writer = FileWriter.$new(file, false);
        writer.write(summary);
        writer.close();
        log("[RPC] Registry saved to " + CONFIG.outputDir + "channel_registry.txt", "SUCCESS");
    } catch (e) {
        log("[-] Failed to write registry file: " + e, "ERROR");
    }
    return registry;
}

/**
 * Get call history for a specific channel
 * @param {string} channelName - Channel name
 * @param {number} limit - Max number of calls to return (default: 50)
 */
function getChannelHistory(channelName, limit) {
    if (!channelName) return { error: "channelName is required" };
    if (limit === undefined) limit = 50;
    var history = ChannelRegistry.getChannelHistory(channelName, limit);
    log("[RPC] History for " + channelName + ": " + history.length + " calls", "RPC");
    return history;
}

// Export via RPC
rpc.exports = {
    listchannels: function() {
        return listMethodChannels();
    },
    testchannel: function(channelName, method, args) {
        return testMethodChannel(channelName, method, args);
    },
    dumpregistry: function() {
        return dumpChannelRegistry();
    },
    gethistory: function(channelName, limit) {
        return getChannelHistory(channelName, limit);
    }
};
