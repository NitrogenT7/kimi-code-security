/**
 * Native Root Detection Probe
 *
 * Observe-first helper for native root/RASP investigations when generic bypasses
 * are not enough. It focuses on the most common libc primitives used by modern
 * native checks: access/stat/fopen/strstr.
 *
 * Recommended flow:
 * 1. Run in observe-only mode first.
 * 2. Set TARGET_LIB_SUBSTRINGS once you know the library name.
 * 3. Enable one mutation toggle at a time after confirming the failing primitive.
 *
 * Usage:
 *   frida -U -f com.target.app -l native-root-detection-probe.js
 *   frida -U com.target.app -l native-root-detection-probe.js
 */

'use strict';

const CONFIG = {
    TARGET_LIB_SUBSTRINGS: [], // Example: ["inappprotections", "security", "root"]
    WAIT_FOR_TARGET_LIBRARY: true,
    OBSERVE_ONLY: true,
    MUTATE_SU_PATHS: false,
    MUTATE_SELINUX_PATHS: false,
    MUTATE_ROOT_NEEDLES: false,
    VERBOSE: true
};

const PATH_KEYWORDS = [
    '/su',
    'busybox',
    'magisk',
    'zygisk',
    '/proc/self/attr/prev',
    '/proc/self/mountinfo',
    '/selinux',
    'sepolicy',
    '/system/bin/su',
    '/system/xbin/su'
];

const ROOT_NEEDLES = ['magisk', 'zygisk', 'zygote', 'supersu', 'busybox', 'test-keys'];

const CACHED_STRINGS = {
    su_path: Memory.allocUtf8String('/system/nonexisting'),
    selinux_path: Memory.allocUtf8String('/non/existing'),
    benign_needle: Memory.allocUtf8String('not_rooted')
};

let hooksInstalled = false;
let pendingLibraryPath = null;

function log(message) {
    console.log('[native-root-probe] ' + message);
}

function verbose(message) {
    if (CONFIG.VERBOSE) {
        log(message);
    }
}

function safeReadCString(ptr) {
    try {
        if (!ptr || ptr.isNull()) {
            return null;
        }
        return ptr.readCString();
    } catch (e) {
        return null;
    }
}

function includesAny(value, needles) {
    if (!value) {
        return false;
    }
    const lowered = value.toLowerCase();
    return needles.some(function(needle) {
        return lowered.indexOf(needle.toLowerCase()) !== -1;
    });
}

function shouldTracePath(path) {
    return includesAny(path, PATH_KEYWORDS);
}

function isSuPath(path) {
    return includesAny(path, ['/su', 'busybox', 'magisk', '/system/bin/su', '/system/xbin/su']);
}

function isSelinuxPath(path) {
    return includesAny(path, ['/selinux', 'sepolicy', '/proc/self/attr/prev']);
}

function shouldTraceNeedle(haystack, needle) {
    return includesAny(needle, ROOT_NEEDLES) || includesAny(haystack, ['zygote', 'magisk', 'zygisk', '/proc/self/mountinfo']);
}

function setArg(args, index, replacement) {
    try {
        args[index] = replacement;
        return true;
    } catch (e) {
        log('Failed to replace argument ' + index + ': ' + e.message);
        return false;
    }
}

function findExport(name) {
    return Module.findExportByName('libc.so', name) || Module.findExportByName(null, name);
}

function installAccessHook() {
    const accessPtr = findExport('access');
    if (!accessPtr) {
        return;
    }

    Interceptor.attach(accessPtr, {
        onEnter(args) {
            this.path = safeReadCString(args[0]);
            this.mutated = false;

            if (!shouldTracePath(this.path)) {
                return;
            }

            verbose('access("' + this.path + '")');

            if (!CONFIG.OBSERVE_ONLY && CONFIG.MUTATE_SU_PATHS && isSuPath(this.path)) {
                this.mutated = setArg(args, 0, CACHED_STRINGS.su_path);
                if (this.mutated) {
                    log('Redirected access() root path -> /system/nonexisting');
                }
            }
        }
    });
}

function installStatHook() {
    ['stat', 'stat64'].forEach(function(name) {
        const statPtr = findExport(name);
        if (!statPtr) {
            return;
        }

        Interceptor.attach(statPtr, {
            onEnter(args) {
                this.path = safeReadCString(args[0]);
                this.mutated = false;

                if (!shouldTracePath(this.path)) {
                    return;
                }

                verbose(name + '("' + this.path + '")');

                if (!CONFIG.OBSERVE_ONLY && CONFIG.MUTATE_SELINUX_PATHS && isSelinuxPath(this.path)) {
                    this.mutated = setArg(args, 0, CACHED_STRINGS.selinux_path);
                    if (this.mutated) {
                        log('Redirected ' + name + '() SELinux path -> /non/existing');
                    }
                }
            }
        });
    });
}

function installFopenHook() {
    ['fopen', 'fopen64'].forEach(function(name) {
        const fopenPtr = findExport(name);
        if (!fopenPtr) {
            return;
        }

        Interceptor.attach(fopenPtr, {
            onEnter(args) {
                this.path = safeReadCString(args[0]);

                if (!shouldTracePath(this.path)) {
                    return;
                }

                verbose(name + '("' + this.path + '")');
            }
        });
    });
}

function installStrstrHook() {
    const strstrPtr = findExport('strstr');
    if (!strstrPtr) {
        return;
    }

    Interceptor.attach(strstrPtr, {
        onEnter(args) {
            this.haystack = safeReadCString(args[0]);
            this.needle = safeReadCString(args[1]);
            this.mutated = false;

            if (!shouldTraceNeedle(this.haystack, this.needle)) {
                return;
            }

            verbose('strstr(haystack="' + (this.haystack || '<null>') + '", needle="' + (this.needle || '<null>') + '")');

            if (!CONFIG.OBSERVE_ONLY && CONFIG.MUTATE_ROOT_NEEDLES && includesAny(this.needle, ROOT_NEEDLES)) {
                this.mutated = setArg(args, 1, CACHED_STRINGS.benign_needle);
                if (this.mutated) {
                    log('Replaced strstr() root needle -> not_rooted');
                }
            }
        }
    });
}

function installHooks() {
    if (hooksInstalled) {
        return;
    }

    hooksInstalled = true;
    log('Installing native probes for access/stat/fopen/strstr');
    installAccessHook();
    installStatHook();
    installFopenHook();
    installStrstrHook();
}

function targetAlreadyLoaded() {
    if (!CONFIG.TARGET_LIB_SUBSTRINGS.length) {
        return false;
    }

    return Process.enumerateModules().some(function(module) {
        return includesAny(module.name, CONFIG.TARGET_LIB_SUBSTRINGS);
    });
}

function hookTargetLibraryLoad() {
    const linker = Process.findModuleByName('linker64') || Process.findModuleByName('linker');
    if (!linker) {
        log('linker/linker64 not found, installing hooks immediately');
        installHooks();
        return;
    }

    let doDlopen = null;
    let callConstructor = null;

    try {
        linker.enumerateSymbols().forEach(function(symbol) {
            if (!doDlopen && symbol.name.indexOf('do_dlopen') !== -1) {
                doDlopen = symbol.address;
            } else if (!callConstructor && symbol.name.indexOf('call_constructor') !== -1) {
                callConstructor = symbol.address;
            }
        });
    } catch (e) {
        log('Failed to enumerate linker symbols: ' + e.message);
    }

    if (!doDlopen || !callConstructor) {
        log('linker symbols not found, installing hooks immediately');
        installHooks();
        return;
    }

    Interceptor.attach(doDlopen, {
        onEnter(args) {
            const libPath = safeReadCString(args[0]);
            if (includesAny(libPath, CONFIG.TARGET_LIB_SUBSTRINGS)) {
                pendingLibraryPath = libPath;
                log('Target library loading: ' + libPath);
            }
        }
    });

    Interceptor.attach(callConstructor, {
        onEnter() {
            if (!pendingLibraryPath || hooksInstalled) {
                return;
            }

            log('Target library initialized: ' + pendingLibraryPath);
            installHooks();
            pendingLibraryPath = null;
        }
    });
}

function start() {
    log('Probe starting (observe-only=' + CONFIG.OBSERVE_ONLY + ')');

    if (!CONFIG.WAIT_FOR_TARGET_LIBRARY || !CONFIG.TARGET_LIB_SUBSTRINGS.length) {
        installHooks();
        return;
    }

    if (targetAlreadyLoaded()) {
        log('Target library already loaded, installing hooks immediately');
        installHooks();
        return;
    }

    hookTargetLibraryLoad();
}

setImmediate(start);

    // ============================================================
    // CMODULE OPTIMIZATION - NEW FROM FRIDA HANDBOOK
    // ============================================================

    log('[CMODULE] Implementing CModule optimization from Frida Handbook...');

    /**
     * CModule for performance optimization
     * From Frida Handbook Chapter 7: CModule can provide 4.5x performance improvement
     * over JavaScript agent for hot paths
     *
     * Example use case: Repeated native function calls (e.g., in hot paths)
     * - JavaScript only: 5.8s
     * - JavaScript + CModule: 1.3s
     * - Performance improvement: 4.5x faster
     */

    /**
     * CModule with shared state for native function hooking
     * Uses extern variables to share state between JS and C code
     */
    var sqrtStatePtr = null;
    var sqrtState = Memory.alloc(Process.pointerSize);

    var cmodule = null;

    try {
        cmodule = new CModule(`
            #include <gum/guminterceptor.h>
            #include <stdio.h>
            #include <gum/guminvocationcontext.h>

            extern double sqrtValuePtr;

            void onEnter(GumInvocationContext *ic)
            {
                double result;
                result = (double)gum_invocation_context_get_return_value(ic);
                sqrtValuePtr = result;  // Compartir estado
            }

            void onLeave(GumInvocationContext *ic)
            {
                printf("[C MODULE] sqrt onLeave: result = %lf\\n", result);
            }
        `, {
            sqrtValuePtr: sqrtStatePtr  // Variable compartida
        });

        log('[CMODULE] CModule for native function hooking created');
        log('[CMODULE] Performance: ~4.5x faster than JavaScript-only for hot paths');

        // Hook a target native function to demonstrate CModule integration
        var sqrtFunctionPtr = Module.findExportByName(null, 'sqrt');

        if (sqrtFunctionPtr) {
            var targetAddr = sqrtFunctionPtr.address;

            log('[CMODULE] Hooking sqrt() with CModule onEnter/onLeave callbacks');

            Interceptor.attach(targetAddr, {
                onEnter: cmodule.onEnter,
                onLeave: cmodule.onLeave
            });
        } else {
            log('[!] sqrt function not found');
        }

    } catch (e) {
        log('[ERROR] Failed to create CModule: ' + e.message);
    }

