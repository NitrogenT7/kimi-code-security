/**
 * Android File Access Monitor
 *
 * Observe-first helper for tracing file, database, and provider-backed I/O.
 * Defaults are tuned for low noise: open events are logged, read/write dumps
 * stay off until explicitly enabled.
 *
 * Usage:
 *   frida -U -f com.target.app -l android-file-access-monitor.js
 *   frida -U com.target.app -l android-file-access-monitor.js
 */

'use strict';

const CONFIG = {
    PATH_INCLUDE_SUBSTRINGS: [],
    PATH_EXCLUDE_SUBSTRINGS: [
        '/proc/self/task',
        '/system/framework/',
        '/apex/',
        '/dev/ashmem'
    ],
    ENABLE_JAVA_IO: true,
    ENABLE_CONTENT_RESOLVER: true,
    ENABLE_SQLITE: true,
    ENABLE_NATIVE_IO: true,
    LOG_JAVA_OPENS: true,
    LOG_JAVA_READS: false,
    LOG_JAVA_WRITES: false,
    LOG_NATIVE_OPENS: true,
    LOG_NATIVE_READS: false,
    LOG_NATIVE_WRITES: false,
    DUMP_BYTES: false,
    MAX_PREVIEW_BYTES: 128,
    MAX_PATH_LENGTH: 220,
    STACK_ON_MATCH: false,
    VERBOSE: true
};

const SENSITIVE_HINTS = [
    'authorization',
    'bearer',
    'cookie',
    'password',
    'secret',
    'session',
    'token'
];

const javaStreamPaths = {};
const javaDescriptorPaths = {};
const nativeFdPaths = {};

let threadClass = null;

function log(message) {
    console.log('[file-monitor] ' + message);
}

function verbose(message) {
    if (CONFIG.VERBOSE) {
        log(message);
    }
}

function truncate(value, maxLength) {
    if (value === null || value === undefined) {
        return '<null>';
    }

    const text = String(value);
    if (text.length <= maxLength) {
        return text;
    }

    return text.slice(0, maxLength) + '...';
}

function includesAny(value, needles) {
    if (!value) {
        return false;
    }

    const haystack = String(value).toLowerCase();
    return needles.some(function(needle) {
        return haystack.indexOf(String(needle).toLowerCase()) !== -1;
    });
}

function shouldTrackPath(path) {
    if (!path) {
        return false;
    }

    if (includesAny(path, CONFIG.PATH_EXCLUDE_SUBSTRINGS)) {
        return false;
    }

    if (!CONFIG.PATH_INCLUDE_SUBSTRINGS.length) {
        return true;
    }

    return includesAny(path, CONFIG.PATH_INCLUDE_SUBSTRINGS);
}

function stackIfEnabled() {
    if (!CONFIG.STACK_ON_MATCH || !threadClass) {
        return;
    }

    try {
        const stack = threadClass.currentThread().getStackTrace();
        for (let index = 0; index < stack.length; index++) {
            console.log('[file-monitor]   at ' + stack[index].toString());
        }
    } catch (error) {
        log('Stack trace unavailable: ' + error.message);
    }
}

function safeToString(value) {
    try {
        if (value === null || value === undefined) {
            return null;
        }
        return String(value);
    } catch (error) {
        return null;
    }
}

function safeReadCString(pointer) {
    try {
        if (!pointer || pointer.isNull()) {
            return null;
        }
        return pointer.readCString();
    } catch (error) {
        return null;
    }
}

function safeJavaPath(fileObject) {
    try {
        if (!fileObject) {
            return null;
        }
        return safeToString(fileObject.getAbsolutePath());
    } catch (error) {
        return null;
    }
}

function javaStreamKey(streamObject) {
    try {
        return 'stream:' + streamObject.hashCode();
    } catch (error) {
        return null;
    }
}

function javaDescriptorKey(descriptor) {
    try {
        return 'fd:' + descriptor.hashCode();
    } catch (error) {
        return null;
    }
}

function rememberJavaDescriptor(descriptor, path) {
    const key = descriptor ? javaDescriptorKey(descriptor) : null;
    if (!key || !path) {
        return;
    }
    javaDescriptorPaths[key] = path;
}

function rememberJavaStream(streamObject, path) {
    const streamKey = javaStreamKey(streamObject);
    if (streamKey && path) {
        javaStreamPaths[streamKey] = path;
    }

    try {
        rememberJavaDescriptor(streamObject.getFD(), path);
    } catch (error) {
        verbose('Unable to resolve FileDescriptor for stream: ' + error.message);
    }
}

function resolveJavaStreamPath(streamObject) {
    const streamKey = javaStreamKey(streamObject);
    if (streamKey && javaStreamPaths[streamKey]) {
        return javaStreamPaths[streamKey];
    }

    try {
        const descriptor = streamObject.getFD();
        const descriptorKey = javaDescriptorKey(descriptor);
        if (descriptorKey && javaDescriptorPaths[descriptorKey]) {
            return javaDescriptorPaths[descriptorKey];
        }
    } catch (error) {
    }

    return null;
}

function logOpen(prefix, path, extra) {
    if (!path || !shouldTrackPath(path)) {
        return;
    }

    log(prefix + ' path=' + truncate(path, CONFIG.MAX_PATH_LENGTH) + (extra ? ' ' + extra : ''));
    stackIfEnabled();
}

function asciiPreview(bytes) {
    let output = '';

    for (let index = 0; index < bytes.length; index++) {
        const value = bytes[index];
        if (value === 9 || value === 10 || value === 13 || (value >= 32 && value <= 126)) {
            output += String.fromCharCode(value);
        } else {
            output += '.';
        }
    }

    return output.replace(/\r/g, '\\r').replace(/\n/g, '\\n');
}

function bytesToHex(bytes) {
    const hex = [];

    for (let index = 0; index < bytes.length; index++) {
        const value = bytes[index].toString(16);
        hex.push((value.length === 1 ? '0' : '') + value);
    }

    return hex.join(' ');
}

function looksText(bytes) {
    if (!bytes.length) {
        return false;
    }

    let printable = 0;

    for (let index = 0; index < bytes.length; index++) {
        const value = bytes[index];
        if (value === 9 || value === 10 || value === 13 || (value >= 32 && value <= 126)) {
            printable += 1;
        }
    }

    return printable / bytes.length >= 0.85;
}

function containsSensitiveMaterial(text) {
    return includesAny(text, SENSITIVE_HINTS);
}

function formatPreviewFromBytes(bytes) {
    if (!CONFIG.DUMP_BYTES || !bytes.length) {
        return '';
    }

    if (looksText(bytes)) {
        const textPreview = asciiPreview(bytes);
        if (containsSensitiveMaterial(textPreview)) {
            return ' preview=[redacted-sensitive-text]';
        }
        return ' preview="' + truncate(textPreview, CONFIG.MAX_PREVIEW_BYTES) + '"';
    }

    return ' hex=' + truncate(bytesToHex(bytes), CONFIG.MAX_PREVIEW_BYTES * 3);
}

function formatJavaBytePreview(byteArray, offset, length) {
    if (!CONFIG.DUMP_BYTES || !byteArray || length <= 0) {
        return '';
    }

    try {
        const converted = Java.array('byte', byteArray);
        const start = Math.max(offset || 0, 0);
        const end = Math.min(converted.length, start + length, start + CONFIG.MAX_PREVIEW_BYTES);
        const bytes = [];

        for (let index = start; index < end; index++) {
            bytes.push((converted[index] + 256) % 256);
        }

        return formatPreviewFromBytes(bytes);
    } catch (error) {
        return ' preview=<unavailable>';
    }
}

function formatNativeBytePreview(pointer, length) {
    if (!CONFIG.DUMP_BYTES || !pointer || length <= 0) {
        return '';
    }

    try {
        const buffer = Memory.readByteArray(pointer, Math.min(length, CONFIG.MAX_PREVIEW_BYTES));
        if (!buffer) {
            return '';
        }

        const bytes = Array.prototype.slice.call(new Uint8Array(buffer));
        return formatPreviewFromBytes(bytes);
    } catch (error) {
        return ' preview=<unavailable>';
    }
}

function findExport(name) {
    return Module.findExportByName('libc.so', name) || Module.findExportByName(null, name);
}

function installNativeOpenHook(symbolName, pathArgumentIndex) {
    const address = findExport(symbolName);
    if (!address) {
        return;
    }

    Interceptor.attach(address, {
        onEnter(args) {
            this.path = safeReadCString(args[pathArgumentIndex]);
        },
        onLeave(retval) {
            const fd = retval.toInt32();
            if (fd < 0 || !this.path || !shouldTrackPath(this.path)) {
                return;
            }

            nativeFdPaths[fd] = this.path;
            if (CONFIG.LOG_NATIVE_OPENS) {
                log('native ' + symbolName + ' fd=' + fd + ' path=' + truncate(this.path, CONFIG.MAX_PATH_LENGTH));
            }
        }
    });
}

function installNativeFopenHook(symbolName) {
    const address = findExport(symbolName);
    if (!address) {
        return;
    }

    Interceptor.attach(address, {
        onEnter(args) {
            this.path = safeReadCString(args[0]);
            this.mode = safeReadCString(args[1]);
        },
        onLeave(retval) {
            if (!retval || retval.isNull() || !this.path || !shouldTrackPath(this.path) || !CONFIG.LOG_NATIVE_OPENS) {
                return;
            }

            log('native ' + symbolName + ' path=' + truncate(this.path, CONFIG.MAX_PATH_LENGTH) + ' mode=' + (this.mode || '?'));
        }
    });
}

function installNativeReadWriteHook(symbolName, logEnabled, isRead) {
    const address = findExport(symbolName);
    if (!address) {
        return;
    }

    Interceptor.attach(address, {
        onEnter(args) {
            this.fd = args[0].toInt32();
            this.buffer = args[1];
            this.count = args[2].toInt32();
            this.path = nativeFdPaths[this.fd];
            this.shouldLog = logEnabled && this.path && shouldTrackPath(this.path);
        },
        onLeave(retval) {
            if (!this.shouldLog) {
                return;
            }

            const transferred = retval.toInt32();
            if (transferred <= 0) {
                return;
            }

            const preview = formatNativeBytePreview(this.buffer, isRead ? transferred : Math.min(this.count, transferred));
            log('native ' + symbolName + ' fd=' + this.fd + ' bytes=' + transferred + ' path=' + truncate(this.path, CONFIG.MAX_PATH_LENGTH) + preview);
        }
    });
}

function installNativeCloseHook() {
    const address = findExport('close');
    if (!address) {
        return;
    }

    Interceptor.attach(address, {
        onEnter(args) {
            this.fd = args[0].toInt32();
        },
        onLeave() {
            delete nativeFdPaths[this.fd];
        }
    });
}

function installNativeHooks() {
    if (!CONFIG.ENABLE_NATIVE_IO) {
        return;
    }

    installNativeOpenHook('open', 0);
    installNativeOpenHook('__open_2', 0);
    installNativeOpenHook('openat', 1);
    installNativeFopenHook('fopen');
    installNativeFopenHook('fopen64');
    installNativeReadWriteHook('read', CONFIG.LOG_NATIVE_READS, true);
    installNativeReadWriteHook('write', CONFIG.LOG_NATIVE_WRITES, false);
    installNativeCloseHook();
}

function hookFileInputStream() {
    const FileInputStream = Java.use('java.io.FileInputStream');

    const ctorFile = FileInputStream.$init.overload('java.io.File');
    ctorFile.implementation = function(file) {
        const result = ctorFile.call(this, file);
        const path = safeJavaPath(file);
        rememberJavaStream(this, path);
        if (CONFIG.LOG_JAVA_OPENS) {
            logOpen('FileInputStream', path, 'source=File');
        }
        return result;
    };

    const ctorString = FileInputStream.$init.overload('java.lang.String');
    ctorString.implementation = function(path) {
        const result = ctorString.call(this, path);
        rememberJavaStream(this, safeToString(path));
        if (CONFIG.LOG_JAVA_OPENS) {
            logOpen('FileInputStream', path, 'source=String');
        }
        return result;
    };

    const ctorDescriptor = FileInputStream.$init.overload('java.io.FileDescriptor');
    ctorDescriptor.implementation = function(descriptor) {
        const result = ctorDescriptor.call(this, descriptor);
        const path = javaDescriptorPaths[javaDescriptorKey(descriptor)] || '[descriptor-only]';
        rememberJavaStream(this, path);
        if (CONFIG.LOG_JAVA_OPENS) {
            logOpen('FileInputStream', path, 'source=FileDescriptor');
        }
        return result;
    };

    const readArray = FileInputStream.read.overload('[B');
    readArray.implementation = function(buffer) {
        const count = readArray.call(this, buffer);
        if (CONFIG.LOG_JAVA_READS) {
            const path = resolveJavaStreamPath(this);
            if (path && shouldTrackPath(path) && count > 0) {
                log('FileInputStream.read bytes=' + count + ' path=' + truncate(path, CONFIG.MAX_PATH_LENGTH) + formatJavaBytePreview(buffer, 0, count));
            }
        }
        return count;
    };

    const readArraySlice = FileInputStream.read.overload('[B', 'int', 'int');
    readArraySlice.implementation = function(buffer, offset, length) {
        const count = readArraySlice.call(this, buffer, offset, length);
        if (CONFIG.LOG_JAVA_READS) {
            const path = resolveJavaStreamPath(this);
            if (path && shouldTrackPath(path) && count > 0) {
                log('FileInputStream.read bytes=' + count + ' path=' + truncate(path, CONFIG.MAX_PATH_LENGTH) + formatJavaBytePreview(buffer, offset, count));
            }
        }
        return count;
    };
}

function hookFileOutputStream() {
    const FileOutputStream = Java.use('java.io.FileOutputStream');

    [
        {
            overload: FileOutputStream.$init.overload('java.io.File'),
            resolvePath(args) {
                return safeJavaPath(args[0]);
            },
            source: 'File'
        },
        {
            overload: FileOutputStream.$init.overload('java.io.File', 'boolean'),
            resolvePath(args) {
                return safeJavaPath(args[0]);
            },
            source: 'File'
        },
        {
            overload: FileOutputStream.$init.overload('java.lang.String'),
            resolvePath(args) {
                return safeToString(args[0]);
            },
            source: 'String'
        },
        {
            overload: FileOutputStream.$init.overload('java.lang.String', 'boolean'),
            resolvePath(args) {
                return safeToString(args[0]);
            },
            source: 'String'
        },
        {
            overload: FileOutputStream.$init.overload('java.io.FileDescriptor'),
            resolvePath(args) {
                return javaDescriptorPaths[javaDescriptorKey(args[0])] || '[descriptor-only]';
            },
            source: 'FileDescriptor'
        }
    ].forEach(function(item) {
        item.overload.implementation = function() {
            const result = item.overload.apply(this, arguments);
            const path = item.resolvePath(arguments);
            rememberJavaStream(this, path);
            if (CONFIG.LOG_JAVA_OPENS) {
                logOpen('FileOutputStream', path, 'source=' + item.source);
            }
            return result;
        };
    });

    const writeArray = FileOutputStream.write.overload('[B');
    writeArray.implementation = function(buffer) {
        if (CONFIG.LOG_JAVA_WRITES) {
            const path = resolveJavaStreamPath(this);
            if (path && shouldTrackPath(path)) {
                log('FileOutputStream.write bytes=' + buffer.length + ' path=' + truncate(path, CONFIG.MAX_PATH_LENGTH) + formatJavaBytePreview(buffer, 0, buffer.length));
            }
        }
        return writeArray.call(this, buffer);
    };

    const writeArraySlice = FileOutputStream.write.overload('[B', 'int', 'int');
    writeArraySlice.implementation = function(buffer, offset, length) {
        if (CONFIG.LOG_JAVA_WRITES) {
            const path = resolveJavaStreamPath(this);
            if (path && shouldTrackPath(path)) {
                log('FileOutputStream.write bytes=' + length + ' path=' + truncate(path, CONFIG.MAX_PATH_LENGTH) + formatJavaBytePreview(buffer, offset, length));
            }
        }
        return writeArraySlice.call(this, buffer, offset, length);
    };
}

function hookRandomAccessFile() {
    const RandomAccessFile = Java.use('java.io.RandomAccessFile');

    [
        {
            overload: RandomAccessFile.$init.overload('java.lang.String', 'java.lang.String'),
            resolvePath(args) {
                return safeToString(args[0]);
            },
            resolveMode(args) {
                return safeToString(args[1]);
            }
        },
        {
            overload: RandomAccessFile.$init.overload('java.io.File', 'java.lang.String'),
            resolvePath(args) {
                return safeJavaPath(args[0]);
            },
            resolveMode(args) {
                return safeToString(args[1]);
            }
        }
    ].forEach(function(item) {
        item.overload.implementation = function() {
            const result = item.overload.apply(this, arguments);
            const path = item.resolvePath(arguments);
            const mode = item.resolveMode(arguments);
            rememberJavaStream(this, path);
            if (CONFIG.LOG_JAVA_OPENS) {
                logOpen('RandomAccessFile', path, 'mode=' + mode);
            }
            return result;
        };
    });

    const readArray = RandomAccessFile.read.overload('[B');
    readArray.implementation = function(buffer) {
        const count = readArray.call(this, buffer);
        if (CONFIG.LOG_JAVA_READS) {
            const path = resolveJavaStreamPath(this);
            if (path && shouldTrackPath(path) && count > 0) {
                log('RandomAccessFile.read bytes=' + count + ' path=' + truncate(path, CONFIG.MAX_PATH_LENGTH) + formatJavaBytePreview(buffer, 0, count));
            }
        }
        return count;
    };

    const writeArray = RandomAccessFile.write.overload('[B');
    writeArray.implementation = function(buffer) {
        if (CONFIG.LOG_JAVA_WRITES) {
            const path = resolveJavaStreamPath(this);
            if (path && shouldTrackPath(path)) {
                log('RandomAccessFile.write bytes=' + buffer.length + ' path=' + truncate(path, CONFIG.MAX_PATH_LENGTH) + formatJavaBytePreview(buffer, 0, buffer.length));
            }
        }
        return writeArray.call(this, buffer);
    };
}

function hookContentResolver() {
    if (!CONFIG.ENABLE_CONTENT_RESOLVER) {
        return;
    }

    const ContentResolver = Java.use('android.content.ContentResolver');

    [
        {
            overload: ContentResolver.openInputStream.overload('android.net.Uri'),
            label: 'ContentResolver.openInputStream'
        },
        {
            overload: ContentResolver.openOutputStream.overload('android.net.Uri'),
            label: 'ContentResolver.openOutputStream'
        },
        {
            overload: ContentResolver.openOutputStream.overload('android.net.Uri', 'java.lang.String'),
            label: 'ContentResolver.openOutputStream'
        },
        {
            overload: ContentResolver.openFileDescriptor.overload('android.net.Uri', 'java.lang.String'),
            label: 'ContentResolver.openFileDescriptor'
        }
    ].forEach(function(item) {
        item.overload.implementation = function() {
            const result = item.overload.apply(this, arguments);
            const uri = safeToString(arguments[0]);
            const mode = arguments.length > 1 ? safeToString(arguments[1]) : null;
            if (uri && shouldTrackPath(uri)) {
                log(item.label + ' uri=' + truncate(uri, CONFIG.MAX_PATH_LENGTH) + (mode ? ' mode=' + mode : ''));
            }
            return result;
        };
    });
}

function hookSQLite() {
    if (!CONFIG.ENABLE_SQLITE) {
        return;
    }

    try {
        const SQLiteDatabase = Java.use('android.database.sqlite.SQLiteDatabase');

        [
            {
                overload: SQLiteDatabase.openDatabase.overload('java.lang.String', 'android.database.sqlite.SQLiteDatabase$CursorFactory', 'int'),
                resolvePath(args) {
                    return safeToString(args[0]);
                },
                resolveExtra(args) {
                    return 'flags=' + args[2];
                }
            },
            {
                overload: SQLiteDatabase.openDatabase.overload('java.lang.String', 'android.database.sqlite.SQLiteDatabase$CursorFactory', 'int', 'android.database.DatabaseErrorHandler'),
                resolvePath(args) {
                    return safeToString(args[0]);
                },
                resolveExtra(args) {
                    return 'flags=' + args[2];
                }
            },
            {
                overload: SQLiteDatabase.openOrCreateDatabase.overload('java.lang.String', 'android.database.sqlite.SQLiteDatabase$CursorFactory'),
                resolvePath(args) {
                    return safeToString(args[0]);
                }
            },
            {
                overload: SQLiteDatabase.openOrCreateDatabase.overload('java.io.File', 'android.database.sqlite.SQLiteDatabase$CursorFactory'),
                resolvePath(args) {
                    return safeJavaPath(args[0]);
                }
            }
        ].forEach(function(item) {
            item.overload.implementation = function() {
                const result = item.overload.apply(this, arguments);
                const path = item.resolvePath(arguments);
                if (path && shouldTrackPath(path)) {
                    const extra = item.resolveExtra ? item.resolveExtra(arguments) : null;
                    log('SQLiteDatabase path=' + truncate(path, CONFIG.MAX_PATH_LENGTH) + (extra ? ' ' + extra : ''));
                }
                return result;
            };
        });
    } catch (error) {
        verbose('SQLite hooks unavailable: ' + error.message);
    }
}

function installJavaHooks() {
    if (!Java.available || !CONFIG.ENABLE_JAVA_IO) {
        return;
    }

    Java.perform(function() {
        threadClass = Java.use('java.lang.Thread');
        hookFileInputStream();
        hookFileOutputStream();
        hookRandomAccessFile();
        hookContentResolver();
        hookSQLite();
        log('Java hooks installed');
    });
}

setImmediate(function() {
    installNativeHooks();
    installJavaHooks();
});
