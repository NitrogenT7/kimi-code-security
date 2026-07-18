/**
 * COMPREHENSIVE TRACER - Java Method and Native Function Tracing
 *
 * Purpose: Advanced tracing tool for Android applications combining Java method
 *          tracing with native function interception. Useful for reverse engineering
 *          and understanding application behavior.
 *
 * Based on concepts from:
 * - raptor_frida_android_trace.js (0xdea)
 * - raptor_frida_android_enum.js (0xdea)
 *
 * Usage:
 *   # Trace all methods in a class
 *   frida -U -f <package_name> -l comprehensive-tracer.js --no-pause \
 *     --eval='JavaTracer.traceClass("com.example.app.MainActivity")'
 *
 *   # Trace specific method pattern
 *   frida -U -f <package_name> -l comprehensive-tracer.js --no-pause \
 *     --eval='JavaTracer.tracePattern("com.example.app.*")'
 *
 *   # Trace native library functions
 *   frida -U -f <package_name> -l comprehensive-tracer.js --no-pause \
 *     --eval='NativeTracer.traceModule("libnative-lib.so")'
 *
 *   # Find all loaded classes matching pattern
 *   frida -U -f <package_name> -l comprehensive-tracer.js --no-pause \
 *     --eval='JavaTracer.findClasses("com.example.app.*")'
 *
 * Features:
 * - Java method tracing with parameter and return value logging
 * - Native function interception with backtrace
 * - Class enumeration and discovery
 * - Module export enumeration
 * - Regex-based pattern matching for class/method names
 * - Configurable verbosity and filtering
 * - Thread-safe logging with color coding
 *
 * Android Versions: Android 5-16 (API 21-40)
 *
 * OWASP MASTG References:
 * - MASTG-ANLYS-0001: Static Analysis
 * - MASTG-ANLYS-0002: Dynamic Analysis
 *
 * Credits:
 * - Based on raptor_frida_android_trace by 0xdea
 * - Enhanced with ApiResolver and better error handling
 *
 * Note: For authorized security testing only.
 */

// Configuration
var CONFIG = {
    // Logging verbosity
    verbose: true,
    debug: false,

    // Log method parameters
    logParams: true,

    // Log return values
    logReturns: true,

    // Maximum parameter/return value length to log
    maxStringLength: 200,

    // Thread-safe logging (recommended)
    threadSafe: true,

    // Color output (terminal only)
    useColors: true,

    // Filter methods by name pattern (regex)
    methodFilter: null,

    // Exclude methods by pattern
    excludeMethodPattern: /^(toString|hashCode|equals|getClass)/,

    // Native function backtrace depth
    backtraceDepth: 8
};

// ========================================
// GLOBAL UTILITIES
// ========================================

var colors = {
    reset: '\x1b[0m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m',
    white: '\x1b[37m',
    gray: '\x1b[90m'
};

function colorize(text, color) {
    if (!CONFIG.useColors) return text;
    return colors[color] + text + colors.reset;
}

function shortenString(str) {
    if (str == null) return 'null';
    if (typeof str !== 'string') return String(str);
    if (str.length <= CONFIG.maxStringLength) return str;
    return str.substring(0, CONFIG.maxStringLength) + '...';
}

function getTimestamp() {
    var now = new Date();
    return now.toISOString().split('T')[1].replace('Z', '');
}

function getCurrentThread() {
    if (CONFIG.threadSafe && Java.available) {
        return Thread.currentThread().getName();
    }
    return 'Thread-' + Process.getCurrentThreadId();
}

// ========================================
// JAVA TRACER
// ========================================

var JavaTracer = {
    tracedMethods: {},

    traceClass: function(className) {
        try {
            if (!Java.available) {
                console.log(colorize("[!] Java not available", colors.red));
                return;
            }

            Java.perform(function() {
                console.log(colorize("[*] Tracing class: " + className, colors.cyan));

                try {
                    var clazz = Java.use(className);
                    var methods = clazz.class.getDeclaredMethods();
                    var methodCount = 0;

                    methods.forEach(function(method) {
                        var methodName = method.getName();
                        var methodSignature = method.toString();

                        // Skip excluded methods
                        if (CONFIG.excludeMethodPattern.test(methodName)) {
                            return;
                        }

                        // Apply method filter if set
                        if (CONFIG.methodFilter && !CONFIG.methodFilter.test(methodName)) {
                            return;
                        }

                        try {
                            var overloadCount = method.getParameterTypes().length;
                            for (var i = 0; i < overloadCount; i++) {
                                try {
                                    var targetMethod = clazz[methodName].overloads[i];
                                    if (targetMethod && !targetMethod.implementation) {
                                        JavaTracer._hookMethod(className, methodName, targetMethod, i);
                                        methodCount++;
                                    }
                                } catch (e) {
                                    // Overload might not exist
                                }
                            }
                        } catch (e) {
                            // Method might not be accessible
                        }
                    });

                    console.log(colorize("[+] Traced " + methodCount + " methods in " + className, colors.green));

                } catch (e) {
                    console.log(colorize("[!] Error tracing class " + className + ": " + e.message, colors.red));
                }
            });
        } catch (e) {
            console.log(colorize("[!] Java.perform error: " + e.message, colors.red));
        }
    },

    tracePattern: function(pattern) {
        try {
            if (!Java.available) {
                console.log(colorize("[!] Java not available", colors.red));
                return;
            }

            Java.perform(function() {
                console.log(colorize("[*] Tracing pattern: " + pattern, colors.cyan));

                var regex = new RegExp(pattern);

                try {
                    Java.enumerateLoadedClasses({
                        onMatch: function(className) {
                            if (regex.test(className)) {
                                JavaTracer.traceClass(className);
                            }
                        },
                        onComplete: function() {
                            console.log(colorize("[+] Pattern tracing complete", colors.green));
                        }
                    });
                } catch (e) {
                    console.log(colorize("[!] Error enumerating classes: " + e.message, colors.red));
                }
            });
        } catch (e) {
            console.log(colorize("[!] Java.perform error: " + e.message, colors.red));
        }
    },

    findClasses: function(pattern) {
        try {
            if (!Java.available) {
                console.log(colorize("[!] Java not available", colors.red));
                return;
            }

            Java.perform(function() {
                console.log(colorize("[*] Finding classes matching: " + pattern, colors.cyan));

                var regex = new RegExp(pattern);
                var found = [];

                Java.enumerateLoadedClasses({
                    onMatch: function(className) {
                        if (regex.test(className)) {
                            found.push(className);
                        }
                    },
                    onComplete: function() {
                        console.log(colorize("[+] Found " + found.length + " classes:", colors.green));
                        found.sort().forEach(function(className) {
                            console.log("  " + className);
                        });
                    }
                });
            });
        } catch (e) {
            console.log(colorize("[!] Java.perform error: " + e.message, colors.red));
        }
    },

    _hookMethod: function(className, methodName, method, overloadIdx) {
        var methodKey = className + '.' + methodName + '#' + overloadIdx;

        if (JavaTracer.tracedMethods[methodKey]) {
            return;
        }

        method.implementation = function() {
            var thread = getCurrentThread();
            var timestamp = getTimestamp();
            var prefix = colorize('[' + timestamp + '] [' + thread + ']', colors.gray);

            console.log(prefix + ' ' + colorize('->', colors.green) + ' ' +
                       colorize(className + '.' + methodName, colors.cyan));

            // Log parameters
            if (CONFIG.logParams && arguments.length > 0) {
                console.log(prefix + '    Params: ' + arguments.length);
                for (var i = 0; i < arguments.length; i++) {
                    console.log(prefix + '      [' + i + '] = ' +
                               shortenString(String(arguments[i])));
                }
            }

            // Call original method
            var result = this[methodName].apply(this, arguments);

            // Log return value
            if (CONFIG.logReturns) {
                console.log(prefix + ' ' + colorize('<-', colors.red) + ' returns: ' +
                           shortenString(String(result)));
            }

            return result;
        };

        JavaTracer.tracedMethods[methodKey] = true;
    }
};

// ========================================
// NATIVE TRACER
// ========================================

var NativeTracer = {
    tracedFunctions: {},

    traceModule: function(moduleName, pattern) {
        console.log(colorize("[*] Tracing module: " + moduleName, colors.cyan));

        var module = Process.findModuleByName(moduleName);
        if (!module) {
            console.log(colorize("[!] Module not found: " + moduleName, colors.red));
            return;
        }

        var regex = pattern ? new RegExp(pattern) : null;
        var functionCount = 0;

        var exports = module.enumerateExports();
        exports.forEach(function(exp) {
            if (exp.type !== 'function') {
                return;
            }

            // Apply pattern filter if set
            if (regex && !regex.test(exp.name)) {
                return;
            }

            try {
                NativeTracer._hookFunction(moduleName, exp.name, exp.address);
                functionCount++;
            } catch (e) {
                // Function might not be hookable
            }
        });

        console.log(colorize("[+] Traced " + functionCount + " functions in " + moduleName, colors.green));
    },

    traceAddress: function(address, name) {
        console.log(colorize("[*] Tracing address: " + address + ' (' + name + ')', colors.cyan));
        NativeTracer._hookFunction('native', name, ptr(address));
    },

    listModules: function() {
        console.log(colorize("[*] Loaded modules:", colors.cyan));
        Process.enumerateModules().forEach(function(module) {
            console.log('  ' + module.name + ' @ ' + module.base);
        });
    },

    listExports: function(moduleName) {
        var module = Process.findModuleByName(moduleName);
        if (!module) {
            console.log(colorize("[!] Module not found: " + moduleName, colors.red));
            return;
        }

        console.log(colorize("[*] Exports of " + moduleName + ":", colors.cyan));
        module.enumerateExports().forEach(function(exp) {
            console.log('  ' + exp.name + ' @ ' + exp.address);
        });
    },

    _hookFunction: function(moduleName, functionName, address) {
        var funcKey = moduleName + '!' + functionName;

        if (NativeTracer.tracedFunctions[funcKey]) {
            return;
        }

        Interceptor.attach(address, {
            onEnter: function(args) {
                var thread = getCurrentThread();
                var timestamp = getTimestamp();
                var prefix = colorize('[' + timestamp + '] [' + thread + ']', colors.gray);

                console.log(prefix + ' ' + colorize('->', colors.green) + ' ' +
                           colorize(moduleName + '!' + functionName, colors.magenta));

                // Log arguments
                if (CONFIG.logParams && args.length > 0) {
                    console.log(prefix + '    Args: ' + args.length);
                    for (var i = 0; i < Math.min(4, args.length); i++) {
                        console.log(prefix + '      [' + i + '] = ' +
                                   args[i] + ' (0x' + args[i].toString(16) + ')');
                    }
                }

                // Store args for onLeave
                this.args = args;
            },

            onLeave: function(retval) {
                var thread = getCurrentThread();
                var timestamp = getTimestamp();
                var prefix = colorize('[' + timestamp + '] [' + thread + ']', colors.gray);

                if (CONFIG.logReturns) {
                    console.log(prefix + ' ' + colorize('<-', colors.red) + ' returns: ' +
                               retval + ' (0x' + retval.toString(16) + ')');
                }

                // Log backtrace if configured
                if (CONFIG.debug) {
                    var backtrace = Thread.backtrace(this.context)
                        .slice(0, CONFIG.backtraceDepth);

                    if (backtrace.length > 0) {
                        console.log(prefix + '    Backtrace:');
                        backtrace.forEach(function(addr) {
                            var symbol = DebugSymbol.fromAddress(addr);
                            var module = Process.findModuleByAddress(addr);
                            var moduleName = module ? module.name : 'unknown';

                            if (symbol && symbol.name) {
                                console.log(prefix + '      ' + moduleName + '!' +
                                           symbol.name + ' @ ' + addr);
                            } else {
                                console.log(prefix + '      ' + addr);
                            }
                        });
                    }
                }

                this.retval = retval;
            }
        });

        NativeTracer.tracedFunctions[funcKey] = true;
    }
};

// ========================================
// API RESOLVER (Frida 12+)
// ========================================

var ApiResolverTracer = {
    traceImports: function(moduleName) {
        if (typeof ApiResolver === 'undefined') {
            console.log(colorize("[!] ApiResolver not available (Frida < 12)", colors.red));
            return;
        }

        console.log(colorize("[*] Resolving imports for: " + moduleName, colors.cyan));

        var resolver = new ApiResolver('module');
        var matches = resolver.enumerateMatches('imports:' + moduleName + '!*');

        matches.forEach(function(match) {
            console.log('  ' + match.name + ' @ ' + match.address);
        });

        console.log(colorize("[+] Found " + matches.length + " imports", colors.green));
    },

    traceExports: function(moduleName) {
        if (typeof ApiResolver === 'undefined') {
            console.log(colorize("[!] ApiResolver not available (Frida < 12)", colors.red));
            return;
        }

        console.log(colorize("[*] Resolving exports for: " + moduleName, colors.cyan));

        var resolver = new ApiResolver('module');
        var matches = resolver.enumerateMatches('exports:' + moduleName + '!*');

        matches.forEach(function(match) {
            console.log('  ' + match.name + ' @ ' + match.address);
        });

        console.log(colorize("[+] Found " + matches.length + " exports", colors.green));
    }
};

// ========================================
// INITIALIZATION
// ========================================

console.log(colorize('[*] Comprehensive Tracer Loaded', colors.cyan));
console.log(colorize('[*] Usage:', colors.cyan));
console.log('  JavaTracer.traceClass("com.example.app.Class")');
console.log('  JavaTracer.tracePattern("com.example.app.*")');
console.log('  JavaTracer.findClasses("com.example.app.*")');
console.log('  NativeTracer.traceModule("libnative-lib.so")');
console.log('  NativeTracer.traceAddress(ptr(0x12345678), "custom")');
console.log('  NativeTracer.listModules()');
console.log('  NativeTracer.listExports("libnative-lib.so")');

if (typeof ApiResolver !== 'undefined') {
    console.log('  ApiResolverTracer.traceImports("libnative-lib.so")');
    console.log('  ApiResolverTracer.traceExports("libnative-lib.so")');
} else {
    console.log(colorize('[!] ApiResolver not available (Frida < 12)', colors.yellow));
}
