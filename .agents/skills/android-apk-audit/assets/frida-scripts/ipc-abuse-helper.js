/**
 * IPC Abuse Helper
 *
 * Passive-by-default helper for Android IPC testing. It provides lightweight
 * runtime logging plus optional helper functions for provider queries, crafted
 * intents, broadcasts, and service starts.
 *
 * Usage:
 *   frida -U -f com.target.app -l ipc-abuse-helper.js
 *   frida -U com.target.app -l ipc-abuse-helper.js
 */

'use strict';

const CONFIG = {
    PASSIVE_MONITORING: true,
    LOG_DISPATCHES: true,
    LOG_PROVIDER_CALLS: true,
    LOG_DEEP_LINK_DATA: true,
    STACK_ON_MATCH: false,
    MAX_STRING_LENGTH: 220,
    VERBOSE: true
};

const FLAG_NAMES = [
    { value: 0x1, name: 'GRANT_READ_URI_PERMISSION' },
    { value: 0x2, name: 'GRANT_WRITE_URI_PERMISSION' },
    { value: 0x40, name: 'GRANT_PERSISTABLE_URI_PERMISSION' },
    { value: 0x80, name: 'GRANT_PREFIX_URI_PERMISSION' },
    { value: 0x10000000, name: 'ACTIVITY_NEW_TASK' },
    { value: 0x20000000, name: 'ACTIVITY_SINGLE_TOP' },
    { value: 0x4000000, name: 'ACTIVITY_CLEAR_TOP' }
];

let classes = {};

function log(message) {
    console.log('[ipc-helper] ' + message);
}

function verbose(message) {
    if (CONFIG.VERBOSE) {
        log(message);
    }
}

function truncate(value) {
    if (value === null || value === undefined) {
        return '<null>';
    }

    const text = String(value);
    if (text.length <= CONFIG.MAX_STRING_LENGTH) {
        return text;
    }

    return text.slice(0, CONFIG.MAX_STRING_LENGTH) + '...';
}

function stackIfEnabled() {
    if (!CONFIG.STACK_ON_MATCH) {
        return;
    }

    try {
        const stack = classes.Thread.currentThread().getStackTrace();
        for (let index = 0; index < stack.length; index++) {
            console.log('[ipc-helper]   at ' + stack[index].toString());
        }
    } catch (error) {
        log('Stack trace unavailable: ' + error.message);
    }
}

function parseSpec(spec) {
    if (!spec) {
        return {};
    }

    if (typeof spec === 'string') {
        return JSON.parse(spec);
    }

    return spec;
}

function toJavaStringArray(value) {
    if (!value || !value.length) {
        return null;
    }

    const list = Array.isArray(value) ? value : [value];
    return Java.array('java.lang.String', list.map(function(entry) {
        return String(entry);
    }));
}

function describeFlags(flags) {
    if (!flags) {
        return '0x0';
    }

    const decoded = FLAG_NAMES.filter(function(item) {
        return (flags & item.value) === item.value;
    }).map(function(item) {
        return item.name;
    });

    return '0x' + flags.toString(16) + (decoded.length ? ' [' + decoded.join(', ') + ']' : '');
}

function safeValueSummary(value) {
    try {
        if (value === null || value === undefined) {
            return '<null>';
        }

        const className = value.getClass ? value.getClass().getName() : typeof value;
        if (className === 'android.content.Intent') {
            return '<Intent ' + truncate(describeIntent(value)) + '>';
        }
        if (className === 'android.net.Uri') {
            return '<Uri ' + value.toString() + '>';
        }

        return truncate(value.toString());
    } catch (error) {
        return '<unprintable>';
    }
}

function extrasToSummary(extras) {
    if (!extras) {
        return 'none';
    }

    try {
        const keys = extras.keySet().toArray();
        if (!keys.length) {
            return 'none';
        }

        const parts = [];
        for (let index = 0; index < keys.length; index++) {
            const key = keys[index];
            const value = extras.get(key);
            parts.push(key + '=' + safeValueSummary(value));
        }
        return truncate(parts.join(', '));
    } catch (error) {
        return '<extras-unavailable>';
    }
}

function describeIntent(intent) {
    if (!intent) {
        return '<null-intent>';
    }

    try {
        const component = intent.getComponent();
        const data = intent.getData();
        return [
            'action=' + truncate(intent.getAction()),
            'component=' + truncate(component ? component.flattenToShortString() : '<implicit>'),
            'data=' + truncate(data ? data.toString() : '<none>'),
            'flags=' + describeFlags(intent.getFlags()),
            'extras=' + extrasToSummary(intent.getExtras())
        ].join(' ');
    } catch (error) {
        return '<intent-summary-error ' + error.message + '>';
    }
}

function getContext() {
    const app = classes.ActivityThread.currentApplication();
    if (!app) {
        throw new Error('currentApplication() returned null');
    }
    return app.getApplicationContext();
}

function buildBundleFromObject(rawExtras) {
    const extras = rawExtras || {};
    const bundle = classes.Bundle.$new();

    Object.keys(extras).forEach(function(key) {
        const value = extras[key];
        if (value === null || value === undefined) {
            return;
        }

        if (typeof value === 'string') {
            bundle.putString(key, value);
            return;
        }

        if (typeof value === 'boolean') {
            bundle.putBoolean(key, value);
            return;
        }

        if (typeof value === 'number') {
            if (Number.isInteger(value)) {
                if (value >= -2147483648 && value <= 2147483647) {
                    bundle.putInt(key, value);
                } else {
                    bundle.putLong(key, value);
                }
            } else {
                bundle.putDouble(key, value);
            }
            return;
        }

        if (Array.isArray(value) && value.every(function(item) { return typeof item === 'string'; })) {
            bundle.putStringArray(key, Java.array('java.lang.String', value));
            return;
        }

        if (typeof value === 'object' && value.__uri__) {
            bundle.putParcelable(key, classes.Uri.parse(String(value.__uri__)));
            return;
        }

        if (typeof value === 'object' && value.__intent__) {
            bundle.putParcelable(key, buildIntent(value.__intent__));
            return;
        }

        bundle.putString(key, JSON.stringify(value));
    });

    return bundle;
}

function buildContentValues(rawValues) {
    const ContentValues = classes.ContentValues;
    const Integer = classes.Integer;
    const Long = classes.Long;
    const Double = classes.Double;
    const BooleanClass = classes.Boolean;
    const values = ContentValues.$new();
    const input = rawValues || {};

    Object.keys(input).forEach(function(key) {
        const value = input[key];
        if (value === null || value === undefined) {
            values.putNull(key);
            return;
        }

        if (typeof value === 'string') {
            values.put.overload('java.lang.String', 'java.lang.String').call(values, key, value);
            return;
        }

        if (typeof value === 'boolean') {
            values.put.overload('java.lang.String', 'java.lang.Boolean').call(values, key, BooleanClass.valueOf(value));
            return;
        }

        if (typeof value === 'number') {
            if (Number.isInteger(value)) {
                if (value >= -2147483648 && value <= 2147483647) {
                    values.put.overload('java.lang.String', 'java.lang.Integer').call(values, key, Integer.valueOf(value));
                } else {
                    values.put.overload('java.lang.String', 'java.lang.Long').call(values, key, Long.valueOf(value));
                }
            } else {
                values.put.overload('java.lang.String', 'java.lang.Double').call(values, key, Double.valueOf(value));
            }
            return;
        }

        values.put.overload('java.lang.String', 'java.lang.String').call(values, key, JSON.stringify(value));
    });

    return values;
}

function buildIntent(rawSpec) {
    const spec = parseSpec(rawSpec);
    const intent = classes.Intent.$new();

    if (spec.action) {
        intent.setAction(String(spec.action));
    }

    if (spec.dataUri) {
        intent.setData(classes.Uri.parse(String(spec.dataUri)));
    }

    if (spec.type) {
        intent.setType(String(spec.type));
    }

    if (spec.packageName && spec.className) {
        intent.setClassName(String(spec.packageName), String(spec.className));
    } else if (spec.component) {
        const parts = String(spec.component).split('/');
        if (parts.length === 2) {
            intent.setClassName(parts[0], parts[1].charAt(0) === '.' ? parts[0] + parts[1] : parts[1]);
        }
    } else if (spec.packageName) {
        intent.setPackage(String(spec.packageName));
    }

    if (Array.isArray(spec.categories)) {
        spec.categories.forEach(function(category) {
            intent.addCategory(String(category));
        });
    }

    if (Array.isArray(spec.flags)) {
        spec.flags.forEach(function(flag) {
            intent.addFlags(flag);
        });
    } else if (typeof spec.flags === 'number') {
        intent.setFlags(spec.flags);
    }

    if (spec.extras) {
        intent.putExtras(buildBundleFromObject(spec.extras));
    }

    return intent;
}

function performQuery(spec) {
    const parsed = parseSpec(spec);
    const resolver = getContext().getContentResolver();
    const uri = classes.Uri.parse(String(parsed.uri));
    const projection = toJavaStringArray(parsed.projection);
    const selectionArgs = toJavaStringArray(parsed.selectionArgs);
    const sortOrder = parsed.sortOrder ? String(parsed.sortOrder) : null;
    const selection = parsed.selection ? String(parsed.selection) : null;

    const cursor = resolver.query(uri, projection, selection, selectionArgs, sortOrder);
    if (!cursor) {
        return '[queryProvider] cursor=null';
    }

    try {
        return classes.DatabaseUtils.dumpCursorToString(cursor);
    } finally {
        cursor.close();
    }
}

function performInsert(spec) {
    const parsed = parseSpec(spec);
    const resolver = getContext().getContentResolver();
    const uri = classes.Uri.parse(String(parsed.uri));
    const values = buildContentValues(parsed.values);
    const result = resolver.insert(uri, values);
    return result ? result.toString() : 'null';
}

function performUpdate(spec) {
    const parsed = parseSpec(spec);
    const resolver = getContext().getContentResolver();
    const uri = classes.Uri.parse(String(parsed.uri));
    const values = buildContentValues(parsed.values);
    const selectionArgs = toJavaStringArray(parsed.selectionArgs);
    const selection = parsed.selection ? String(parsed.selection) : null;
    return String(resolver.update(uri, values, selection, selectionArgs));
}

function performDelete(spec) {
    const parsed = parseSpec(spec);
    const resolver = getContext().getContentResolver();
    const uri = classes.Uri.parse(String(parsed.uri));
    const selectionArgs = toJavaStringArray(parsed.selectionArgs);
    const selection = parsed.selection ? String(parsed.selection) : null;
    return String(resolver.delete(uri, selection, selectionArgs));
}

function dispatchIntent(kind, spec) {
    const parsed = parseSpec(spec);
    const context = getContext();
    const intent = buildIntent(parsed);

    if (kind === 'activity' && intent.getFlags() === 0) {
        intent.addFlags(0x10000000);
    }

    if (kind === 'activity') {
        context.startActivity(intent);
    } else if (kind === 'broadcast') {
        context.sendBroadcast(intent);
    } else if (kind === 'service') {
        context.startService(intent);
    } else {
        throw new Error('Unsupported dispatch kind: ' + kind);
    }

    return describeIntent(intent);
}

function passiveIntentLog(label, intent) {
    if (!CONFIG.PASSIVE_MONITORING || !CONFIG.LOG_DISPATCHES || !intent) {
        return;
    }

    log(label + ' ' + describeIntent(intent));
    stackIfEnabled();
}

function installContextHook(className) {
    try {
        const ContextClass = Java.use(className);

        if (ContextClass.startActivity) {
            const startActivity = ContextClass.startActivity.overload('android.content.Intent');
            startActivity.implementation = function(intent) {
                passiveIntentLog(className + '.startActivity', intent);
                return startActivity.call(this, intent);
            };
        }

        if (ContextClass.sendBroadcast) {
            const sendBroadcast = ContextClass.sendBroadcast.overload('android.content.Intent');
            sendBroadcast.implementation = function(intent) {
                passiveIntentLog(className + '.sendBroadcast', intent);
                return sendBroadcast.call(this, intent);
            };
        }

        if (ContextClass.startService) {
            const startService = ContextClass.startService.overload('android.content.Intent');
            startService.implementation = function(intent) {
                passiveIntentLog(className + '.startService', intent);
                return startService.call(this, intent);
            };
        }
    } catch (error) {
        verbose('Context hook skipped for ' + className + ': ' + error.message);
    }
}

function installProviderHooks() {
    if (!CONFIG.PASSIVE_MONITORING || !CONFIG.LOG_PROVIDER_CALLS) {
        return;
    }

    const ContentResolver = classes.ContentResolver;

    try {
        const queryLegacy = ContentResolver.query.overload('android.net.Uri', '[Ljava.lang.String;', 'java.lang.String', '[Ljava.lang.String;', 'java.lang.String');
        queryLegacy.implementation = function(uri, projection, selection, selectionArgs, sortOrder) {
            log('ContentResolver.query uri=' + truncate(uri) + ' selection=' + truncate(selection) + ' selectionArgs=' + truncate(selectionArgs ? JSON.stringify(selectionArgs) : 'null'));
            return queryLegacy.call(this, uri, projection, selection, selectionArgs, sortOrder);
        };
    } catch (error) {
        verbose('Legacy query hook unavailable: ' + error.message);
    }

    try {
        const queryBundle = ContentResolver.query.overload('android.net.Uri', '[Ljava.lang.String;', 'android.os.Bundle', 'android.os.CancellationSignal');
        queryBundle.implementation = function(uri, projection, queryArgs, cancellationSignal) {
            log('ContentResolver.query uri=' + truncate(uri) + ' queryArgs=' + truncate(queryArgs));
            return queryBundle.call(this, uri, projection, queryArgs, cancellationSignal);
        };
    } catch (error) {
        verbose('Bundle query hook unavailable: ' + error.message);
    }

    const insert = ContentResolver.insert.overload('android.net.Uri', 'android.content.ContentValues');
    insert.implementation = function(uri, values) {
        log('ContentResolver.insert uri=' + truncate(uri) + ' values=' + truncate(values));
        return insert.call(this, uri, values);
    };

    const update = ContentResolver.update.overload('android.net.Uri', 'android.content.ContentValues', 'java.lang.String', '[Ljava.lang.String;');
    update.implementation = function(uri, values, selection, selectionArgs) {
        log('ContentResolver.update uri=' + truncate(uri) + ' selection=' + truncate(selection) + ' values=' + truncate(values));
        return update.call(this, uri, values, selection, selectionArgs);
    };

    const remove = ContentResolver.delete.overload('android.net.Uri', 'java.lang.String', '[Ljava.lang.String;');
    remove.implementation = function(uri, selection, selectionArgs) {
        log('ContentResolver.delete uri=' + truncate(uri) + ' selection=' + truncate(selection));
        return remove.call(this, uri, selection, selectionArgs);
    };
}

function installDeepLinkHook() {
    if (!CONFIG.PASSIVE_MONITORING || !CONFIG.LOG_DEEP_LINK_DATA) {
        return;
    }

    try {
        const Intent = classes.Intent;
        const getData = Intent.getData.overload();
        getData.implementation = function() {
            const result = getData.call(this);
            if (result) {
                log('Intent.getData uri=' + truncate(result.toString()) + ' action=' + truncate(this.getAction()));
            }
            return result;
        };
    } catch (error) {
        verbose('Deep link hook unavailable: ' + error.message);
    }
}

function withJava(action) {
    let result;
    let failure = null;

    Java.perform(function() {
        try {
            result = action();
        } catch (error) {
            failure = error;
        }
    });

    if (failure) {
        throw failure;
    }

    return result;
}

function exposeHelpers() {
    const api = {
        queryProvider: function(spec) {
            return withJava(function() {
                return performQuery(spec);
            });
        },
        insertProvider: function(spec) {
            return withJava(function() {
                return performInsert(spec);
            });
        },
        updateProvider: function(spec) {
            return withJava(function() {
                return performUpdate(spec);
            });
        },
        deleteProvider: function(spec) {
            return withJava(function() {
                return performDelete(spec);
            });
        },
        startActivityIntent: function(spec) {
            return withJava(function() {
                return dispatchIntent('activity', spec);
            });
        },
        sendBroadcastIntent: function(spec) {
            return withJava(function() {
                return dispatchIntent('broadcast', spec);
            });
        },
        startServiceIntent: function(spec) {
            return withJava(function() {
                return dispatchIntent('service', spec);
            });
        }
    };

    globalThis.queryProvider = api.queryProvider;
    globalThis.insertProvider = api.insertProvider;
    globalThis.updateProvider = api.updateProvider;
    globalThis.deleteProvider = api.deleteProvider;
    globalThis.startActivityIntent = api.startActivityIntent;
    globalThis.sendBroadcastIntent = api.sendBroadcastIntent;
    globalThis.startServiceIntent = api.startServiceIntent;

    rpc.exports = {
        queryprovider(spec) {
            return api.queryProvider(spec);
        },
        insertprovider(spec) {
            return api.insertProvider(spec);
        },
        updateprovider(spec) {
            return api.updateProvider(spec);
        },
        deleteprovider(spec) {
            return api.deleteProvider(spec);
        },
        startactivityintent(spec) {
            return api.startActivityIntent(spec);
        },
        sendbroadcastintent(spec) {
            return api.sendBroadcastIntent(spec);
        },
        startserviceintent(spec) {
            return api.startServiceIntent(spec);
        }
    };

    log('Active helpers exported: queryProvider/insertProvider/updateProvider/deleteProvider/startActivityIntent/sendBroadcastIntent/startServiceIntent');
}

function installHooks() {
    if (!Java.available) {
        log('Java runtime is not available in this process');
        return;
    }

    Java.perform(function() {
        classes = {
            ActivityThread: Java.use('android.app.ActivityThread'),
            Boolean: Java.use('java.lang.Boolean'),
            Bundle: Java.use('android.os.Bundle'),
            ContentResolver: Java.use('android.content.ContentResolver'),
            ContentValues: Java.use('android.content.ContentValues'),
            DatabaseUtils: Java.use('android.database.DatabaseUtils'),
            Double: Java.use('java.lang.Double'),
            Integer: Java.use('java.lang.Integer'),
            Intent: Java.use('android.content.Intent'),
            Long: Java.use('java.lang.Long'),
            Thread: Java.use('java.lang.Thread'),
            Uri: Java.use('android.net.Uri')
        };

        installContextHook('android.content.ContextWrapper');
        installContextHook('android.app.ContextImpl');
        installProviderHooks();
        installDeepLinkHook();
        exposeHelpers();
    });
}

setImmediate(installHooks);
