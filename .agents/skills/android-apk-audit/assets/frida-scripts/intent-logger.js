/**
 * Intent Logger
 *
 * Hooks and logs all Intent data in:
 * - Activity.onCreate/onNewIntent: getIntent() extras, data, action, scheme
 * - BroadcastReceiver.onReceive: intent extras and action
 * - Service.onStartCommand: intent extras
 * - ContentProvider.query/insert/update/delete: uri, projection, selection, values
 * - Intent constructor: all intent creation patterns
 * - Context.startActivity/sendBroadcast/startService: intent dispatch
 *
 * Compatible with: Frida 16.x+ and Android 7-16
 * Usage: frida -U -f <package_name> -l intent-logger.js
 */

Java.perform(function() {
    console.log("[*] Intent Logger Script Started");

    // Helper function to log Intent details
    function logIntent(intent, prefix) {
        if (!intent) {
            console.log(prefix + " Intent is null");
            return;
        }

        var String = Java.use("java.lang.String");
        var Uri = Java.use("android.net.Uri");

        console.log(prefix + "----------------");
        console.log(prefix + "Action: " + intent.getAction());

        var dataUri = intent.getData();
        if (dataUri) {
            console.log(prefix + "Data URI: " + dataUri.toString());
            console.log(prefix + "Scheme: " + dataUri.getScheme());
            console.log(prefix + "Host: " + dataUri.getHost());
            console.log(prefix + "Path: " + dataUri.getPath());
        }

        var type = intent.getType();
        if (type) {
            console.log(prefix + "Type: " + type);
        }

        var flags = intent.getFlags();
        console.log(prefix + "Flags: 0x" + flags.toString(16));

        var categories = intent.getCategories();
        if (categories) {
            var iter = categories.iterator();
            console.log(prefix + "Categories:");
            while (iter.hasNext()) {
                console.log(prefix + "  - " + iter.next());
            }
        }

        // Log extras
        var extras = intent.getExtras();
        if (extras) {
            console.log(prefix + "Extras:");
            var keys = extras.keySet().toArray();
            for (var i = 0; i < keys.length; i++) {
                var key = keys[i];
                var value = extras.get(key);

                if (value) {
                    var valueType = value.getClass().getName();
                    var valueStr = value.toString();

                    // Truncate long values
                    if (valueStr.length > 200) {
                        valueStr = valueStr.substring(0, 200) + "...";
                    }

                    console.log(prefix + "  " + key + " (" + valueType + "): " + valueStr);
                } else {
                    console.log(prefix + "  " + key + ": null");
                }
            }
        }
    }

    // ========================================
    // 1. Hook Activity.onCreate
    // ========================================
    try {
        var Activity = Java.use("android.app.Activity");
        Activity.onCreate.implementation = function(savedInstanceState) {
            console.log("[+] Activity.onCreate() - Class: " + this.getClass().getName());
            var intent = this.getIntent();
            logIntent(intent, "[+]   ");
            this.onCreate(savedInstanceState);
        };
        console.log("[+] Activity.onCreate hooked successfully");
    } catch (e) {
        console.log("[!] Activity.onCreate hook failed: " + e.message);
    }

    // ========================================
    // 2. Hook Activity.onNewIntent
    // ========================================
    try {
        Activity.onNewIntent.implementation = function(intent) {
            console.log("[+] Activity.onNewIntent() - Class: " + this.getClass().getName());
            logIntent(intent, "[+]   ");
            this.onNewIntent(intent);
        };
        console.log("[+] Activity.onNewIntent hooked successfully");
    } catch (e) {
        console.log("[!] Activity.onNewIntent hook failed: " + e.message);
    }

    // ========================================
    // 3. Hook BroadcastReceiver.onReceive
    // ========================================
    try {
        var BroadcastReceiver = Java.use("android.content.BroadcastReceiver");
        BroadcastReceiver.onReceive.implementation = function(context, intent) {
            console.log("[+] BroadcastReceiver.onReceive() - Class: " + this.getClass().getName());
            logIntent(intent, "[+]   ");
            this.onReceive(context, intent);
        };
        console.log("[+] BroadcastReceiver.onReceive hooked successfully");
    } catch (e) {
        console.log("[!] BroadcastReceiver.onReceive hook failed: " + e.message);
    }

    // ========================================
    // 4. Hook Service.onStartCommand
    // ========================================
    try {
        var Service = Java.use("android.app.Service");
        Service.onStartCommand.implementation = function(intent, flags, startId) {
            console.log("[+] Service.onStartCommand() - Class: " + this.getClass().getName() + ", StartId: " + startId);
            logIntent(intent, "[+]   ");
            return this.onStartCommand(intent, flags, startId);
        };
        console.log("[+] Service.onStartCommand hooked successfully");
    } catch (e) {
        console.log("[!] Service.onStartCommand hook failed: " + e.message);
    }

    // ========================================
    // 5. Hook ContentProvider.query
    // ========================================
    try {
        var ContentProvider = Java.use("android.content.ContentProvider");
        ContentProvider.query.implementation = function(uri, projection, selection, selectionArgs, sortOrder) {
            console.log("[+] ContentProvider.query() - Class: " + this.getClass().getName());
            console.log("[+]   URI: " + uri.toString());

            if (projection) {
                console.log("[+]   Projection:");
                for (var i = 0; i < projection.length; i++) {
                    console.log("[+]     - " + projection[i]);
                }
            }

            if (selection) {
                console.log("[+]   Selection: " + selection);
            }

            if (selectionArgs) {
                console.log("[+]   Selection Args:");
                for (var i = 0; i < selectionArgs.length; i++) {
                    console.log("[+]     - " + selectionArgs[i]);
                }
            }

            if (sortOrder) {
                console.log("[+]   Sort Order: " + sortOrder);
            }

            return this.query(uri, projection, selection, selectionArgs, sortOrder);
        };
        console.log("[+] ContentProvider.query hooked successfully");
    } catch (e) {
        console.log("[!] ContentProvider.query hook failed: " + e.message);
    }

    // ========================================
    // 6. Hook ContentProvider.insert, update, delete
    // ========================================
    try {
        ContentProvider.insert.implementation = function(uri, values) {
            console.log("[+] ContentProvider.insert() - URI: " + uri.toString());
            console.log("[+]   Values: " + values.toString());
            return this.insert(uri, values);
        };

        ContentProvider.update.implementation = function(uri, values, selection, selectionArgs) {
            console.log("[+] ContentProvider.update() - URI: " + uri.toString());
            console.log("[+]   Values: " + values.toString());
            if (selection) {
                console.log("[+]   Selection: " + selection);
            }
            return this.update(uri, values, selection, selectionArgs);
        };

        ContentProvider.delete.implementation = function(uri, selection, selectionArgs) {
            console.log("[+] ContentProvider.delete() - URI: " + uri.toString());
            if (selection) {
                console.log("[+]   Selection: " + selection);
            }
            return this.delete(uri, selection, selectionArgs);
        };

        console.log("[+] ContentProvider DML operations hooked successfully");
    } catch (e) {
        console.log("[!] ContentProvider DML hook failed: " + e.message);
    }

    // ========================================
    // 7. Hook Intent constructor (to see all Intents created)
    // ========================================
    try {
        var Intent = Java.use("android.content.Intent");

        Intent.$init.overload().implementation = function() {
            console.log("[+] Intent() - Empty intent created");
            return this.$init();
        };

        Intent.$init.overload("java.lang.String").implementation = function(action) {
            console.log("[+] Intent() - Action: " + action);
            return this.$init(action);
        };

        Intent.$init.overload("java.lang.String", "android.net.Uri").implementation = function(action, uri) {
            console.log("[+] Intent() - Action: " + action + ", URI: " + uri.toString());
            return this.$init(action, uri);
        };

        Intent.$init.overload("android.content.Context", "java.lang.Class").implementation = function(context, cls) {
            console.log("[+] Intent() - Class: " + cls.getName());
            return this.$init(context, cls);
        };

        Intent.$init.overload("java.lang.String", "android.net.Uri", "android.content.Context", "java.lang.Class").implementation = function(action, uri, context, cls) {
            console.log("[+] Intent() - Action: " + action + ", URI: " + uri.toString() + ", Class: " + cls.getName());
            return this.$init(action, uri, context, cls);
        };

        console.log("[+] Intent constructor hooked successfully");
    } catch (e) {
        console.log("[!] Intent constructor hook failed: " + e.message);
    }

    // ========================================
    // 8. Hook startActivity, sendBroadcast, startService
    // ========================================
    try {
        var Context = Java.use("android.content.Context");

        Context.startActivity.overload("android.content.Intent").implementation = function(intent) {
            console.log("[+] startActivity() called");
            logIntent(intent, "[+]   ");
            this.startActivity(intent);
        };

        Context.sendBroadcast.overload("android.content.Intent").implementation = function(intent) {
            console.log("[+] sendBroadcast() called");
            logIntent(intent, "[+]   ");
            this.sendBroadcast(intent);
        };

        Context.startService.overload("android.content.Intent").implementation = function(intent) {
            console.log("[+] startService() called");
            logIntent(intent, "[+]   ");
            return this.startService(intent);
        };

        console.log("[+] Context intent methods hooked successfully");
    } catch (e) {
        console.log("[!] Context intent methods hook failed: " + e.message);
    }

    console.log("[*] Intent Logger Script Completed");
});