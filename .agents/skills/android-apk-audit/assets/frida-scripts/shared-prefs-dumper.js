/**
 * SharedPreferences Dumper
 *
 * Extracts and monitors all SharedPreferences values:
 * - Hook Context.getSharedPreferences: capture all access
 * - Hook PreferenceManager.getDefaultSharedPreferences: default preferences
 * - Hook SharedPreferences.Editor.putString/putInt/putLong/putFloat/putBoolean/putStringSet: monitor writes
 * - Detects sensitive data (password, token, secret, key, auth)
 * - Dumps all discovered SharedPreferences files on startup
 * - Identifies values by type (String, Integer, Long, Float, Boolean, Set)
 *
 * Compatible with: Frida 16.x+ and Android 7-16
 * Usage: frida -U -f <package_name> -l shared-prefs-dumper.js
 */

Java.perform(function() {
    console.log("[*] SharedPreferences Dumper Started");

    var prefs = {};
    var prefsFiles = [];

    // Get all SharedPreferences files
    function findSharedPrefsFiles() {
        try {
            var ActivityThread = Java.use('android.app.ActivityThread');
            var app = ActivityThread.currentApplication();
            var context = app.getApplicationContext();
            var prefsDir = context.getFilesDir().getParent() + "/shared_prefs/";

            var File = Java.use('java.io.File');
            var dir = File.$new(prefsDir);

            if (dir.exists() && dir.isDirectory()) {
                var files = dir.listFiles();
                for (var i = 0; i < files.length; i++) {
                    var fileName = files[i].getName();
                    if (fileName.endsWith('.xml')) {
                        var prefsName = fileName.replace('.xml', '');
                        prefsFiles.push(prefsName);
                        console.log("[+] Found SharedPreferences: " + prefsName);
                    }
                }
            }
        } catch(e) {
            console.log("[!] Failed to list SharedPreferences files: " + e);
        }
    }

    // Dump a SharedPreferences object
    function dumpSharedPreferences(prefsName, prefs) {
        console.log("\n[+] SharedPreferences: " + prefsName);
        console.log("=".repeat(50));

        try {
            var allPrefs = prefs.getAll();
            var keys = allPrefs.keySet().toArray();

            if (keys.length === 0) {
                console.log("    (empty)");
                return;
            }

            var sensitive = ["password", "token", "secret", "key", "auth", "credential",
                           "session", "cookie", "api", "private", "pin", "otp"];

            for (var i = 0; i < keys.length; i++) {
                var key = keys[i];
                var value = allPrefs.get(key);
                var valueStr = "null";
                var typeStr = "unknown";

                if (value !== null) {
                    // Determine type
                    if (Java.use('java.lang.String').class.isInstance(value)) {
                        typeStr = "String";
                        valueStr = '"' + value.toString() + '"';
                    } else if (Java.use('java.lang.Integer').class.isInstance(value)) {
                        typeStr = "Integer";
                        valueStr = value.toString();
                    } else if (Java.use('java.lang.Long').class.isInstance(value)) {
                        typeStr = "Long";
                        valueStr = value.toString();
                    } else if (Java.use('java.lang.Float').class.isInstance(value)) {
                        typeStr = "Float";
                        valueStr = value.toString();
                    } else if (Java.use('java.lang.Boolean').class.isInstance(value)) {
                        typeStr = "Boolean";
                        valueStr = value.toString();
                    } else if (Java.use('java.util.Set').class.isInstance(value)) {
                        typeStr = "Set<String>";
                        var setArray = value.toArray();
                        var items = [];
                        // Safely iterate and convert Java array to JavaScript array
                        try {
                            for (var j = 0; j < setArray.length; j++) {
                                items.push(String(setArray[j]));
                            }
                        } catch(e) {
                            // If iteration fails, just show the Set as a string
                            items = [value.toString()];
                        }
                        // Ensure items is an array before calling join()
                        valueStr = Array.isArray(items) ? '[' + items.join(', ') + ']' : value.toString();
                    } else {
                        typeStr = value.getClass().getName();
                        valueStr = value.toString();
                    }
                }

                // Truncate long values
                if (valueStr.length > 200) {
                    valueStr = valueStr.substring(0, 200) + "...";
                }

                // Check for sensitive data
                var isSensitive = false;
                var lowerKey = key.toLowerCase();
                var lowerValue = valueStr.toLowerCase();
                for (var j = 0; j < sensitive.length; j++) {
                    if (lowerKey.indexOf(sensitive[j]) > -1 || lowerValue.indexOf(sensitive[j]) > -1) {
                        isSensitive = true;
                        break;
                    }
                }

                console.log("    [" + typeStr + "] " + key + ": " + valueStr);

                if (isSensitive) {
                    console.log("    [!] SENSITIVE DATA DETECTED: " + key);
                }
            }
        } catch(e) {
            console.log("    [!] Error dumping preferences: " + e);
        }
    }

    // Hook getSharedPreferences to capture all access
    try {
        var Context = Java.use('android.content.Context');

        Context.getSharedPreferences.overload('java.lang.String', 'int').implementation = function(name, mode) {
            console.log("[*] getSharedPreferences called: " + name + " (mode: " + mode + ")");
            var sharedPrefs = this.getSharedPreferences(name, mode);

            // Store for later dumping
            if (!prefs[name]) {
                prefs[name] = sharedPrefs;
                dumpSharedPreferences(name, sharedPrefs);
            }

            return sharedPrefs;
        };
    } catch(e) {
        console.log("[!] Failed to hook getSharedPreferences: " + e);
    }

    // Hook PreferenceManager.getDefaultSharedPreferences
    try {
        var PreferenceManager = Java.use('android.preference.PreferenceManager');
        PreferenceManager.getDefaultSharedPreferences.overload('android.content.Context').implementation = function(context) {
            console.log("[*] getDefaultSharedPreferences called");
            var sharedPrefs = this.getDefaultSharedPreferences(context);
            dumpSharedPreferences("_default", sharedPrefs);
            return sharedPrefs;
        };
    } catch(e) {
        console.log("[!] PreferenceManager hook failed (deprecated in API 29): " + e);
    }

    // Hook SharedPreferences.Editor.putXYZ methods
    try {
        var Editor = Java.use('android.content.SharedPreferences$Editor');

        Editor.putString.implementation = function(key, value) {
            if (value !== null) {
                var truncated = "";
                try {
                    truncated = value.substring(0, Math.min(50, value.length));
                } catch(e) {
                    truncated = String(value).substring(0, Math.min(50, String(value).length));
                }
                console.log("[*] Editor.putString: " + key + " = \"" + truncated + "...\"");

                // Check for sensitive
                var sensitive = ["password", "token", "secret", "key", "auth"];
                var lowerKey = key.toLowerCase();
                for (var i = 0; i < sensitive.length; i++) {
                    if (lowerKey.indexOf(sensitive[i]) > -1) {
                        console.log("[!] SENSITIVE DATA BEING STORED: " + key);
                        break;
                    }
                }
            }
            return this.putString(key, value);
        };

        Editor.putInt.implementation = function(key, value) {
            console.log("[*] Editor.putInt: " + key + " = " + value);
            return this.putInt(key, value);
        };

        Editor.putLong.implementation = function(key, value) {
            console.log("[*] Editor.putLong: " + key + " = " + value);
            return this.putLong(key, value);
        };

        Editor.putFloat.implementation = function(key, value) {
            console.log("[*] Editor.putFloat: " + key + " = " + value);
            return this.putFloat(key, value);
        };

        Editor.putBoolean.implementation = function(key, value) {
            console.log("[*] Editor.putBoolean: " + key + " = " + value);
            return this.putBoolean(key, value);
        };

        Editor.putStringSet.implementation = function(key, values) {
            if (values !== null) {
                var arr = [];
                try {
                    var iter = values.iterator();
                    while (iter.hasNext()) {
                        var item = iter.next();
                        arr.push(String(item));
                    }
                } catch(e) {
                    console.log("[!] Error iterating StringSet: " + e);
                }
                var joined = arr.join(", ");
                console.log("[*] Editor.putStringSet: " + key + " = [" + joined.substring(0, Math.min(50, joined.length)) + "...]");
            }
            return this.putStringSet(key, values);
        };

    } catch(e) {
        console.log("[!] Failed to hook SharedPreferences.Editor: " + e);
    }

    // Main dump function
    function dumpAllPrefs() {
        console.log("\n[*] Dumping all discovered SharedPreferences...\n");

        findSharedPrefsFiles();

        var ActivityThread = Java.use('android.app.ActivityThread');
        var app = ActivityThread.currentApplication();
        var context = app.getApplicationContext();

        for (var i = 0; i < prefsFiles.length; i++) {
            try {
                var prefsName = prefsFiles[i];
                var sharedPrefs = context.getSharedPreferences(prefsName, 0);
                dumpSharedPreferences(prefsName, sharedPrefs);
            } catch(e) {
                console.log("[!] Failed to dump " + prefsFiles[i] + ": " + e);
            }
        }

        // Also try default prefs
        try {
            var defaultPrefs = context.getSharedPreferences(context.getPackageName() + "_preferences", 0);
            dumpSharedPreferences(context.getPackageName() + "_preferences", defaultPrefs);
        } catch(e) {
            console.log("[!] Failed to dump default preferences: " + e);
        }
    }

    // Dump on startup after delay
    setTimeout(function() {
        dumpAllPrefs();
        console.log("\n[*] SharedPreferences Dumper Complete");
    }, 2000);
});