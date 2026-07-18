/**
 * JNI Tracer
 *
 * Low-noise JNI tracing for Android apps. Defaults focus on class/method/field
 * resolution and native registration; high-volume call and string tracing stay
 * off until explicitly enabled.
 *
 * Usage:
 *   frida -U -f com.target.app -l jni-tracer.js
 *   frida -U com.target.app -l jni-tracer.js
 */

'use strict';

const CONFIG = {
    TARGET_LIB_SUBSTRINGS: [],
    CLASS_INCLUDE_SUBSTRINGS: [],
    CLASS_EXCLUDE_PREFIXES: [
        'android/',
        'androidx/',
        'dalvik/',
        'java/',
        'javax/',
        'kotlin/',
        'sun/'
    ],
    TRACE_CLASS_LOOKUPS: true,
    TRACE_METHOD_LOOKUPS: true,
    TRACE_FIELD_LOOKUPS: true,
    TRACE_REGISTER_NATIVES: true,
    TRACE_STRING_BRIDGES: false,
    TRACE_CALL_FAMILY: false,
    STACK_ON_MATCH: false,
    MAX_STRING_LENGTH: 180,
    VERBOSE: true
};

const JNI_INDEX = {
    FindClass: 6,
    GetMethodID: 33,
    CallObjectMethod: 34,
    CallBooleanMethod: 37,
    CallIntMethod: 49,
    CallLongMethod: 52,
    CallVoidMethod: 61,
    GetFieldID: 94,
    GetStaticMethodID: 113,
    CallStaticObjectMethod: 114,
    CallStaticBooleanMethod: 117,
    CallStaticIntMethod: 129,
    CallStaticLongMethod: 132,
    CallStaticVoidMethod: 141,
    GetStaticFieldID: 144,
    NewStringUTF: 167,
    GetStringUTFChars: 169,
    RegisterNatives: 215
};

const classPointerCache = {};
const methodIdCache = {};
const fieldIdCache = {};
const registeredNativeCache = {};
const installedAddresses = {};

function log(message) {
    console.log('[jni-tracer] ' + message);
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

function includesAny(value, needles) {
    if (!value) {
        return false;
    }

    const haystack = String(value).toLowerCase();
    return needles.some(function(needle) {
        return haystack.indexOf(String(needle).toLowerCase()) !== -1;
    });
}

function startsWithAny(value, prefixes) {
    if (!value) {
        return false;
    }

    return prefixes.some(function(prefix) {
        return String(value).indexOf(prefix) === 0;
    });
}

function matchesTargetModule(moduleName) {
    if (!CONFIG.TARGET_LIB_SUBSTRINGS.length) {
        return true;
    }

    return includesAny(moduleName, CONFIG.TARGET_LIB_SUBSTRINGS);
}

function matchesClassName(className) {
    if (!className) {
        return true;
    }

    if (CONFIG.CLASS_INCLUDE_SUBSTRINGS.length && !includesAny(className, CONFIG.CLASS_INCLUDE_SUBSTRINGS)) {
        return false;
    }

    return !startsWithAny(className, CONFIG.CLASS_EXCLUDE_PREFIXES);
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

function pointerKey(pointer) {
    try {
        if (!pointer || pointer.isNull()) {
            return null;
        }
        return pointer.toString();
    } catch (error) {
        return null;
    }
}

function resolveCallerInfo(returnAddress) {
    try {
        const module = Process.findModuleByAddress(returnAddress);
        if (!module) {
            return {
                moduleName: null,
                summary: returnAddress ? returnAddress.toString() : '<unknown>'
            };
        }

        return {
            moduleName: module.name,
            summary: module.name + '+' + returnAddress.sub(module.base)
        };
    } catch (error) {
        return {
            moduleName: null,
            summary: '<unknown>'
        };
    }
}

function printBacktrace(context) {
    if (!CONFIG.STACK_ON_MATCH) {
        return;
    }

    try {
        Thread.backtrace(context, Backtracer.ACCURATE).slice(0, 8).forEach(function(address) {
            console.log('[jni-tracer]   ' + DebugSymbol.fromAddress(address).toString());
        });
    } catch (error) {
        log('Backtrace unavailable: ' + error.message);
    }
}

function currentEnv() {
    try {
        return Java.vm.tryGetEnv();
    } catch (error) {
        return null;
    }
}

function resolveClassName(jclassPtr) {
    const key = pointerKey(jclassPtr);
    if (key && classPointerCache[key]) {
        return classPointerCache[key];
    }

    try {
        const env = currentEnv();
        if (!env) {
            return null;
        }

        const className = env.getClassName(jclassPtr);
        if (className && key) {
            classPointerCache[key] = className;
        }
        return className;
    } catch (error) {
        return null;
    }
}

function rememberClassPointer(pointer, className) {
    const key = pointerKey(pointer);
    if (key && className) {
        classPointerCache[key] = className;
    }
}

function rememberMethodId(pointer, metadata) {
    const key = pointerKey(pointer);
    if (key) {
        methodIdCache[key] = metadata;
    }
}

function rememberFieldId(pointer, metadata) {
    const key = pointerKey(pointer);
    if (key) {
        fieldIdCache[key] = metadata;
    }
}

function describeMethodId(pointer) {
    const key = pointerKey(pointer);
    const metadata = key ? methodIdCache[key] : null;
    if (!metadata) {
        return key || '<unknown-method-id>';
    }

    return metadata.className + '->' + metadata.name + metadata.signature;
}

function hookEnvMethod(name, index, callbacks) {
    const envHandle = Java.vm.getEnv().handle;
    const table = envHandle.readPointer();
    const address = table.add(index * Process.pointerSize).readPointer();
    const key = pointerKey(address);

    if (!key) {
        log('Unable to resolve address for ' + name);
        return;
    }

    if (installedAddresses[key]) {
        return;
    }

    installedAddresses[key] = name;

    Interceptor.attach(address, {
        onEnter(args) {
            this.traceName = name;
            this.callerInfo = resolveCallerInfo(this.returnAddress);
            this.shouldLog = matchesTargetModule(this.callerInfo.moduleName);
            this.args = args;

            if (!this.shouldLog) {
                return;
            }

            if (callbacks && callbacks.onEnter) {
                callbacks.onEnter.call(this, args);
            }
        },
        onLeave(retval) {
            if (!this.shouldLog) {
                return;
            }

            if (callbacks && callbacks.onLeave) {
                callbacks.onLeave.call(this, retval);
            }
        }
    });

    verbose('Hooked ' + name + ' at ' + address);
}

function installFindClassHook() {
    hookEnvMethod('FindClass', JNI_INDEX.FindClass, {
        onEnter(args) {
            if (!CONFIG.TRACE_CLASS_LOOKUPS) {
                this.shouldLog = false;
                return;
            }

            this.className = safeReadCString(args[1]);
            if (!matchesClassName(this.className)) {
                this.shouldLog = false;
            }
        },
        onLeave(retval) {
            if (retval && !retval.isNull() && this.className) {
                rememberClassPointer(retval, this.className);
            }

            log('FindClass class=' + truncate(this.className) + ' caller=' + this.callerInfo.summary);
            printBacktrace(this.context);
        }
    });
}

function installMethodLookupHook(name, index, isStatic) {
    hookEnvMethod(name, index, {
        onEnter(args) {
            if (!CONFIG.TRACE_METHOD_LOOKUPS) {
                this.shouldLog = false;
                return;
            }

            this.className = resolveClassName(args[1]) || pointerKey(args[1]);
            this.methodName = safeReadCString(args[2]);
            this.signature = safeReadCString(args[3]);

            if (!matchesClassName(this.className)) {
                this.shouldLog = false;
            }
        },
        onLeave(retval) {
            rememberMethodId(retval, {
                className: this.className || '<unknown-class>',
                name: this.methodName || '<unknown-method>',
                signature: this.signature || '',
                isStatic: isStatic
            });

            log(name + ' target=' + truncate(this.className) + '->' + truncate(this.methodName) + truncate(this.signature) + ' caller=' + this.callerInfo.summary);
            printBacktrace(this.context);
        }
    });
}

function installFieldLookupHook(name, index, isStatic) {
    hookEnvMethod(name, index, {
        onEnter(args) {
            if (!CONFIG.TRACE_FIELD_LOOKUPS) {
                this.shouldLog = false;
                return;
            }

            this.className = resolveClassName(args[1]) || pointerKey(args[1]);
            this.fieldName = safeReadCString(args[2]);
            this.signature = safeReadCString(args[3]);

            if (!matchesClassName(this.className)) {
                this.shouldLog = false;
            }
        },
        onLeave(retval) {
            rememberFieldId(retval, {
                className: this.className || '<unknown-class>',
                name: this.fieldName || '<unknown-field>',
                signature: this.signature || '',
                isStatic: isStatic
            });

            log(name + ' target=' + truncate(this.className) + '::' + truncate(this.fieldName) + ' ' + truncate(this.signature) + ' caller=' + this.callerInfo.summary);
            printBacktrace(this.context);
        }
    });
}

function installStringHooks() {
    hookEnvMethod('NewStringUTF', JNI_INDEX.NewStringUTF, {
        onEnter(args) {
            if (!CONFIG.TRACE_STRING_BRIDGES) {
                this.shouldLog = false;
                return;
            }

            this.value = safeReadCString(args[1]);
        },
        onLeave() {
            log('NewStringUTF value="' + truncate(this.value) + '" caller=' + this.callerInfo.summary);
            printBacktrace(this.context);
        }
    });

    hookEnvMethod('GetStringUTFChars', JNI_INDEX.GetStringUTFChars, {
        onEnter() {
            if (!CONFIG.TRACE_STRING_BRIDGES) {
                this.shouldLog = false;
            }
        },
        onLeave(retval) {
            const value = safeReadCString(retval);
            log('GetStringUTFChars value="' + truncate(value) + '" caller=' + this.callerInfo.summary);
            printBacktrace(this.context);
        }
    });
}

function installCallHook(name, index, isStatic) {
    hookEnvMethod(name, index, {
        onEnter(args) {
            if (!CONFIG.TRACE_CALL_FAMILY) {
                this.shouldLog = false;
                return;
            }

            this.methodId = args[2];
            this.methodDescription = describeMethodId(args[2]);
        },
        onLeave(retval) {
            const returnText = retval ? retval.toString() : '<void>';
            const prefix = isStatic ? 'static-call' : 'call';
            log(prefix + ' ' + name + ' target=' + truncate(this.methodDescription) + ' retval=' + truncate(returnText) + ' caller=' + this.callerInfo.summary);
            printBacktrace(this.context);
        }
    });
}

function installRegisterNativesHook() {
    hookEnvMethod('RegisterNatives', JNI_INDEX.RegisterNatives, {
        onEnter(args) {
            if (!CONFIG.TRACE_REGISTER_NATIVES) {
                this.shouldLog = false;
                return;
            }

            this.className = resolveClassName(args[1]) || pointerKey(args[1]);
            this.methods = args[2];
            this.count = args[3].toInt32();

            if (!matchesClassName(this.className)) {
                this.shouldLog = false;
            }
        },
        onLeave(retval) {
            const classLabel = truncate(this.className);
            for (let index = 0; index < this.count; index++) {
                const entry = this.methods.add(index * Process.pointerSize * 3);
                const namePtr = entry.readPointer();
                const signaturePtr = entry.add(Process.pointerSize).readPointer();
                const functionPtr = entry.add(Process.pointerSize * 2).readPointer();
                const nativeName = safeReadCString(namePtr) || '<unnamed>';
                const signature = safeReadCString(signaturePtr) || '';
                const module = Process.findModuleByAddress(functionPtr);
                const moduleName = module ? module.name : '<unknown-module>';

                if (!matchesTargetModule(moduleName)) {
                    continue;
                }

                const cacheKey = pointerKey(functionPtr);
                if (cacheKey) {
                    registeredNativeCache[cacheKey] = {
                        className: this.className || '<unknown-class>',
                        name: nativeName,
                        signature: signature,
                        moduleName: moduleName
                    };
                }

                log('RegisterNatives class=' + classLabel + ' method=' + nativeName + signature + ' module=' + moduleName + ' addr=' + functionPtr);
            }

            if (retval.toInt32() !== 0) {
                log('RegisterNatives returned error=' + retval + ' caller=' + this.callerInfo.summary);
            }

            printBacktrace(this.context);
        }
    });
}

function installHooks() {
    if (!Java.available) {
        log('Java runtime is not available in this process');
        return;
    }

    Java.perform(function() {
        installFindClassHook();
        installMethodLookupHook('GetMethodID', JNI_INDEX.GetMethodID, false);
        installMethodLookupHook('GetStaticMethodID', JNI_INDEX.GetStaticMethodID, true);
        installFieldLookupHook('GetFieldID', JNI_INDEX.GetFieldID, false);
        installFieldLookupHook('GetStaticFieldID', JNI_INDEX.GetStaticFieldID, true);
        installRegisterNativesHook();
        installStringHooks();

        installCallHook('CallObjectMethod', JNI_INDEX.CallObjectMethod, false);
        installCallHook('CallBooleanMethod', JNI_INDEX.CallBooleanMethod, false);
        installCallHook('CallIntMethod', JNI_INDEX.CallIntMethod, false);
        installCallHook('CallLongMethod', JNI_INDEX.CallLongMethod, false);
        installCallHook('CallVoidMethod', JNI_INDEX.CallVoidMethod, false);
        installCallHook('CallStaticObjectMethod', JNI_INDEX.CallStaticObjectMethod, true);
        installCallHook('CallStaticBooleanMethod', JNI_INDEX.CallStaticBooleanMethod, true);
        installCallHook('CallStaticIntMethod', JNI_INDEX.CallStaticIntMethod, true);
        installCallHook('CallStaticLongMethod', JNI_INDEX.CallStaticLongMethod, true);
        installCallHook('CallStaticVoidMethod', JNI_INDEX.CallStaticVoidMethod, true);

        log('Hooks installed');
    });
}

setImmediate(installHooks);
