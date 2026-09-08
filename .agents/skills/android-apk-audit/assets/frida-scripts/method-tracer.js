/**
 * Method Tracer
 *
 * Generic method call tracing with arguments, return values, and timing:
 * - Target any class and method combination via CONFIG object
 * - Logs method entry/exit with thread timestamp
 * - Inspects method arguments and return values (configurable depth)
 * - Supports tracing constructors and method overloads
 * - Can filter getters/setters and control verbosity
 * - Optional file output for large traces
 *
 * Compatible with: Frida 16.x+ and Android 7-16
 * Usage: frida -U -f <package_name> -l method-tracer.js
 * Config: Modify CONFIG object at top to target specific classes/methods
 */

var CONFIG = {
    // Target class (use full package path)
    targetClass: "com.example.app.AuthManager",

    // Target method (use empty string "" for all methods)
    targetMethod: "",

    // Whether to include getters/setters
    includeGetters: false,

    // Whether to trace constructors
    includeConstructors: true,

    // Maximum depth for object inspection
    maxDepth: 3,

    // Maximum string length to display
    maxStringLength: 200,

    // Enable verbose output (shows full object trees)
    verbose: false,

    // Save traces to file (on device)
    saveToFile: false,
    logPath: "/data/local/tmp/frida-trace.log"
};

Java.perform(function() {
    console.log("[*] Method Tracer Started");
    console.log("[*] Target Class: " + CONFIG.targetClass);
    console.log("[*] Target Method: " + (CONFIG.targetMethod || "ALL"));

    var methodCount = 0;
    var callCount = 0;

    var SimpleDateFormat = Java.use("java.text.SimpleDateFormat");
    var Date = Java.use("java.util.Date");
    var System = Java.use("java.lang.System");

    function inspectObject(obj, depth) {
        if (depth === undefined) depth = 0;
        if (depth > CONFIG.maxDepth) return "[max depth]";
        if (obj === null) return "null";
        if (obj === undefined) return "undefined";

        var type = typeof obj;
        if (type !== 'object') {
            var str = String(obj);
            if (str.length > CONFIG.maxStringLength) {
                str = str.substring(0, CONFIG.maxStringLength) + "...";
            }
            return str;
        }

        // Java object inspection
        try {
            var clazz = obj.getClass();
            var className = clazz.getName();

            // Common safe types
            if (className.startsWith('java.lang.String')) {
                var str = obj.toString();
                if (str.length > CONFIG.maxStringLength) {
                    str = str.substring(0, CONFIG.maxStringLength) + "...";
                }
                return '"' + str + '"';
            }
            if (className.startsWith('java.lang.Number') ||
                className.startsWith('java.lang.Boolean') ||
                className.startsWith('java.lang.Integer') ||
                className.startsWith('java.lang.Long') ||
                className.startsWith('java.lang.Double') ||
                className.startsWith('java.lang.Float')) {
                return obj.toString();
            }

            if (CONFIG.verbose) {
                var result = className + " {";
                var fields = clazz.getDeclaredFields();
                // Add bounds checking to prevent accessing non-existent array elements
                var maxFields = Math.min(fields.length, 10);
                for (var i = 0; i < maxFields; i++) {
                    if (i >= fields.length) break; // Additional safety check
                    fields[i].setAccessible(true);
                    try {
                        var fieldName = fields[i].getName();
                        var fieldValue = fields[i].get(obj);
                        result += "\n" + "  ".repeat(depth + 1) + fieldName + ": " + inspectObject(fieldValue, depth + 1);
                    } catch(e) {}
                }
                result += "\n" + "  ".repeat(depth) + "}";
                return result;
            } else {
                return className + "@...";
            }
        } catch(e) {
            var objStr = String(obj);
            // Add length check before calling substring
            return objStr.length > 50 ? objStr.substring(0, 50) : objStr;
        }
    }

    function traceMethod(clazz, methodName, overloads) {
        for (var i = 0; i < overloads.length; i++) {
            var overload = overloads[i];
            var argTypes = overload.argumentTypes;
            var argTypeNames = argTypes.map(function(t) { return t.className; }).join(', ');

            console.log("[*] Hooking: " + methodName + "(" + argTypeNames + ")");
            methodCount++;

            try {
                overload.implementation = function() {
                    callCount++;
                    var time = SimpleDateFormat.$new("HH:mm:ss.SSS").format(Date.$new());
                    var threadName = Java.use("java.lang.Thread").currentThread().getName();

                    console.log("\n[" + time + "] [" + threadName + "] >>> ENTER: " + methodName);

                    // Log arguments
                    for (var j = 0; j < arguments.length; j++) {
                        var argValue = inspectObject(arguments[j], 0);
                        console.log("    arg[" + j + "] (" + (argTypes[j] ? argTypes[j].className : "unknown") + "): " + argValue);
                    }

                    // Call original
                    var startTime = System.nanoTime();
                    var result;
                    var error = null;

                    try {
                        result = overload.apply(this, arguments);
                    } catch(e) {
                        error = e;
                        console.log("    !!! EXCEPTION: " + e);
                        throw e;
                    }

                    var endTime = System.nanoTime();
                    var duration = (endTime - startTime) / 1000000; // ms

                    // Log return value
                    if (error === null) {
                        var resultStr = inspectObject(result, 0);
                        console.log("    return (" + overload.returnType.className + "): " + resultStr);
                    }
                    console.log("    duration: " + duration.toFixed(2) + "ms");
                    console.log("<<< EXIT: " + methodName + "\n");

                    return result;
                };
            } catch(e) {
                console.log("[!] Failed to hook " + methodName + ": " + e);
            }
        }
    }

    function traceClass(className) {
        try {
            var clazz = Java.use(className);
            var methods = clazz.class.getDeclaredMethods();

            for (var i = 0; i < methods.length; i++) {
                var method = methods[i];
                var methodName = method.getName();

                // Skip if not matching target
                if (CONFIG.targetMethod && CONFIG.targetMethod !== methodName) {
                    continue;
                }

                // Skip getters/setters if configured
                if (!CONFIG.includeGetters) {
                    if (methodName.startsWith("get") && method.getParameterTypes().length === 0) continue;
                    if (methodName.startsWith("is") && method.getParameterTypes().length === 0) continue;
                    if (methodName.startsWith("set") && method.getParameterTypes().length === 1) continue;
                }

                try {
                    var overloads = clazz[methodName].overloads;
                    if (overloads && overloads.length > 0) {
                        traceMethod(clazz, methodName, overloads);
                    }
                } catch(e) {}
            }

            // Trace constructors if enabled
            if (CONFIG.includeConstructors) {
                try {
                    var constructors = clazz.$init.overloads;
                    if (constructors && constructors.length > 0) {
                        // Add bounds checking for constructor overloads
                        var maxConstructors = constructors.length;
                        for (var i = 0; i < maxConstructors; i++) {
                            if (i >= constructors.length) break; // Additional safety check
                            var constructor = constructors[i];
                            var argTypes = constructor.argumentTypes;
                            // Add bounds checking for argumentTypes array
                            var argTypeNames = argTypes && argTypes.length > 0
                                ? argTypes.map(function(t) { return t.className; }).join(', ')
                                : '(no args)';
                            console.log("[*] Hooking: <init>(" + argTypeNames + ")");
                            methodCount++;

                            constructor.implementation = function() {
                                callCount++;
                                console.log("\n>>> ENTER: " + className + ".<init>");
                                // Add bounds checking for arguments array
                                var maxArgs = arguments.length;
                                for (var j = 0; j < maxArgs; j++) {
                                    console.log("    arg[" + j + "]: " + inspectObject(arguments[j], 0));
                                }
                                var result = constructor.apply(this, arguments);
                                console.log("<<< EXIT: " + className + ".<init>\n");
                                return result;
                            };
                        }
                    }
                } catch(e) {}
            }

        } catch(e) {
            console.log("[!] Class not found: " + className);
        }
    }

    // Trace the target class
    traceClass(CONFIG.targetClass);

    console.log("\n[*] Method Tracer Active");
    console.log("[*] Hooked " + methodCount + " methods");
    console.log("[*] Waiting for method calls...\n");

    // Report stats on interval
    setInterval(function() {
        if (callCount > 0) {
            console.log("[*] Stats: " + callCount + " calls captured across " + methodCount + " hooked methods");
        }
    }, 30000); // Every 30 seconds
});