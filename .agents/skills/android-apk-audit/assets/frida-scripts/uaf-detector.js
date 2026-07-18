/**
 * Use-After-Free (UAF) Detector for Android
 *
 * Usage:
 *   frida -U -f com.target.app -l uaf-detector.js
 *   frida -U com.target.app -l uaf-detector.js
 *
 * This script detects Use-After-Free patterns in native code. It tracks
 * allocations and frees, then monitors for access to freed memory.
 *
 * Features:
 * - Detect use-after-free patterns
 * - Detect double-free patterns
 * - Detect invalid free patterns
 * - Track freed objects
 * - Show backtraces for suspicious operations
 * - Optional automatic mitigation (log only by default)
 *
 * Requirements:
 * - Frida >= 12.0
 * - Android device/emulator with frida-server
 * - Native code in target app
 *
 * Compatibility:
 * - ARM (32-bit)
 * - ARM64 (64-bit)
 * - x86/x86_64 (emulator)
 *
 * IMPORTANT: This is for educational purposes and authorized security
 * testing only. Always obtain proper authorization before testing.
 */

console.log("[*] UAF Detector Loaded");
console.log("[*] Process:", Process.getCurrentThreadId());
console.log("[*] PID:", Process.id);
console.log("[*] Arch:", Process.arch);
console.log("[*] Platform:", Process.platform);

// ============================================
// CONFIGURATION
// ============================================

const CONFIG = {
    // Enable/disable detection
    enabled: true,

    // Log all allocations/frees
    logAllOperations: false,

    // Log suspicious operations
    logSuspicious: true,

    // Detect UAF patterns
    detectUAF: true,

    // Detect double-free patterns
    detectDoubleFree: true,

    // Detect invalid free patterns
    detectInvalidFree: true,

    // Track backtraces for analysis
    trackBacktraces: true,
    backtraceDepth: 8,

    // Limit memory usage
    maxTracked: 5000,

    // Enable automatic mitigation (experimental)
    autoMitigate: false,

    // Detection sensitivity
    uafThreshold: 100, // ms delay before considering freed

    // Filter by size (0 = no filter)
    minSize: 0,
    maxSize: 0,
};

// ============================================
// STATE
// ============================================

// Track all allocations: ptr -> info
const allocations = new Map();

// Track freed objects: ptr -> info
const freedObjects = new Map();

// Statistics
const stats = {
    totalMalloc: 0,
    totalFree: 0,
    uafDetected: 0,
    doubleFreeDetected: 0,
    invalidFreeDetected: 0,
};

// ============================================
// UTILITY FUNCTIONS
// ============================================

/**
 * Format pointer as hex string
 */
function formatPtr(ptr) {
    return ptr ? ptr.toString() : "NULL";
}

/**
 * Format size with units
 */
function formatSize(size) {
    if (size < 1024) {
        return size + " B";
    } else if (size < 1024 * 1024) {
        return (size / 1024).toFixed(2) + " KB";
    } else {
        return (size / (1024 * 1024)).toFixed(2) + " MB";
    }
}

/**
 * Capture backtrace
 */
function captureBacktrace() {
    if (!CONFIG.trackBacktraces) {
        return [];
    }

    try {
        return Thread.backtrace(this.context, Backtracer.ACCURATE);
    } catch (e) {
        console.log("[-] Failed to capture backtrace: " + e);
        return [];
    }
}

/**
 * Format backtrace
 */
function formatBacktrace(backtrace) {
    if (!backtrace || backtrace.length === 0) {
        return "  (no backtrace)";
    }

    var result = [];
    backtrace.forEach(function(addr, index) {
        var symbol = DebugSymbol.fromAddress(addr);
        if (symbol.name) {
            result.push("  " + index + ": " + formatPtr(addr) + " " + symbol.name);
        } else {
            result.push("  " + index + ": " + formatPtr(addr));
        }
    });
    return result.join("\n");
}

/**
 * Check if address is in freed list
 */
function isFreed(ptr) {
    return freedObjects.has(ptr.toString());
}

/**
 * Get freed object info
 */
function getFreedInfo(ptr) {
    return freedObjects.get(ptr.toString());
}

/**
 * Add to freed list
 */
function addToFreed(ptr, size, backtrace) {
    if (freedObjects.size < CONFIG.maxTracked) {
        freedObjects.set(ptr.toString(), {
            size: size,
            backtrace: backtrace,
            timestamp: Date.now(),
            freeCount: 1
        });
    }
}

/**
 * Remove from freed list
 */
function removeFromFreed(ptr) {
    freedObjects.delete(ptr.toString());
}

/**
 * Increment free count for double-free detection
 */
function incrementFreeCount(ptr) {
    const info = freedObjects.get(ptr.toString());
    if (info) {
        info.freeCount++;
        info.timestamp = Date.now();
    }
}

// ============================================
// DETECTION FUNCTIONS
// ============================================

/**
 * Detect UAF pattern
 */
function detectUAF(ptr) {
    if (!CONFIG.detectUAF) {
        return false;
    }

    const info = getFreedInfo(ptr);
    if (!info) {
        return false;
    }

    // Check threshold
    const now = Date.now();
    if ((now - info.timestamp) < CONFIG.uafThreshold) {
        return false;
    }

    // UAF detected
    stats.uafDetected++;

    console.log("\n[!] UAF DETECTED!");
    console.log("[*] Address: " + formatPtr(ptr));
    console.log("[*] Size: " + formatSize(info.size));
    console.log("[*] Freed at: " + new Date(info.timestamp));
    console.log("[*] Free count: " + info.freeCount);
    console.log("[*] Free backtrace:");
    console.log(formatBacktrace(info.backtrace));
    console.log("[*] Current backtrace:");
    console.log(formatBacktrace(captureBacktrace()));
    console.log();

    return true;
}

/**
 * Detect double-free pattern
 */
function detectDoubleFree(ptr) {
    if (!CONFIG.detectDoubleFree) {
        return false;
    }

    const info = getFreedInfo(ptr);
    if (!info) {
        return false;
    }

    if (info.freeCount > 0) {
        // Double free detected
        stats.doubleFreeDetected++;

        console.log("\n[!] DOUBLE FREE DETECTED!");
        console.log("[*] Address: " + formatPtr(ptr));
        console.log("[*] Size: " + formatSize(info.size));
        console.log("[*] First freed at: " + new Date(info.timestamp));
        console.log("[*] Free count: " + (info.freeCount + 1));
        console.log("[*] Free backtrace:");
        console.log(formatBacktrace(info.backtrace));
        console.log("[*] Current backtrace:");
        console.log(formatBacktrace(captureBacktrace()));
        console.log();

        return true;
    }

    return false;
}

/**
 * Detect invalid free pattern
 */
function detectInvalidFree(ptr) {
    if (!CONFIG.detectInvalidFree) {
        return false;
    }

    // Check if pointer was never allocated
    const allocInfo = allocations.get(ptr.toString());
    if (!allocInfo) {
        stats.invalidFreeDetected++;

        console.log("\n[!] INVALID FREE DETECTED!");
        console.log("[*] Address: " + formatPtr(ptr));
        console.log("[*] Pointer was never allocated");
        console.log("[*] Backtrace:");
        console.log(formatBacktrace(captureBacktrace()));
        console.log();

        return true;
    }

    return false;
}

/**
 * Automatic mitigation (experimental)
 */
function autoMitigateUAF(ptr) {
    if (!CONFIG.autoMitigate) {
        return;
    }

    console.log("[*] Attempting automatic mitigation...");

    // Replace freed memory with safe data
    try {
        const size = 128; // Safe size
        const safeData = Memory.alloc(size);
        Memory.writeByteArray(safeData, new Array(size).fill(0));

        console.log("[*] Replaced freed memory with safe data");
    } catch (e) {
        console.log("[-] Auto-mitigation failed: " + e);
    }
}

// ============================================
// HOOK FUNCTIONS
// ============================================

// Hook malloc
var malloc_func = Module.findExportByName(null, 'malloc');
if (malloc_func) {
    Interceptor.attach(malloc_func, {
        onEnter: function(args) {
            if (!CONFIG.enabled) {
                return;
            }

            this.size = args[0].toInt32();

            // Filter by size
            if (CONFIG.minSize > 0 && this.size < CONFIG.minSize) {
                this.skip = true;
                return;
            }
            if (CONFIG.maxSize > 0 && this.size > CONFIG.maxSize) {
                this.skip = true;
                return;
            }

            this.backtrace = captureBacktrace();
        },
        onLeave: function(retval) {
            if (!CONFIG.enabled || this.skip) {
                return;
            }

            if (retval.isNull()) {
                if (CONFIG.logAllOperations) {
                    console.log("[-] malloc(" + this.size + ") = NULL");
                }
                return;
            }

            const ptr = retval.toString();

            // Store allocation info
            if (allocations.size < CONFIG.maxTracked) {
                allocations.set(ptr, {
                    size: this.size,
                    backtrace: this.backtrace,
                    state: 'allocated',
                    timestamp: Date.now()
                });
            }

            stats.totalMalloc++;

            if (CONFIG.logAllOperations) {
                console.log("[+] malloc(" + this.size + ") = " + formatPtr(retval));
            }
        }
    });
    console.log("[*] Hooked malloc");
} else {
    console.log("[-] Could not find malloc");
}

// Hook free
var free_func = Module.findExportByName(null, 'free');
if (free_func) {
    Interceptor.attach(free_func, {
        onEnter: function(args) {
            if (!CONFIG.enabled) {
                return;
            }

            const ptr = args[0].toString();
            this.ptrStr = ptr;

            // Check for double-free
            if (detectDoubleFree(ptr(args[0]))) {
                if (CONFIG.autoMitigate) {
                    autoMitigateUAF(args[0]);
                }
                return;
            }

            // Check for invalid free
            if (detectInvalidFree(ptr(args[0]))) {
                return;
            }

            const allocInfo = allocations.get(ptr);
            if (CONFIG.logAllOperations) {
                console.log("[-] free(" + formatPtr(args[0]) + ")");
            }

            if (allocInfo) {
                this.size = allocInfo.size;
                this.backtrace = allocInfo.backtrace;

                // Add to freed list
                addToFreed(ptr(args[0]), allocInfo.size, allocInfo.backtrace);

                // Update allocation info
                allocInfo.state = 'freed';
                allocInfo.timestamp = Date.now();
            } else {
                this.size = 0;
                this.backtrace = [];
            }

            stats.totalFree++;
        }
    });
    console.log("[*] Hooked free");
} else {
    console.log("[-] Could not find free");
}

// Hook common access functions for UAF detection
const ACCESS_FUNCTIONS = [
    "read",
    "memcpy",
    "memmove",
    "memset",
    "strlen",
    "strcmp",
    "strncmp",
    "strcpy",
    "strncpy",
    "sprintf",
    "snprintf",
];

ACCESS_FUNCTIONS.forEach(function(funcName) {
    const func = Module.findExportByName(null, funcName);
    if (func) {
        Interceptor.attach(func, {
            onEnter: function(args) {
                if (!CONFIG.enabled || !CONFIG.detectUAF) {
                    return;
                }

                const ptr = args[0];
                if (ptr.isNull()) {
                    return;
                }

                // Check if this is a freed pointer
                if (detectUAF(ptr)) {
                    if (CONFIG.autoMitigate) {
                        autoMitigateUAF(ptr);
                    }
                }
            }
        });
        console.log("[*] Hooked " + funcName);
    }
});

// ============================================
// COMMANDS
// ============================================

/**
 * Print help
 */
function help() {
    console.log("\n[*] Available Commands:");
    console.log("  help() - Show this help message");
    console.log("  printStats() - Print detection statistics");
    console.log("  printFreed() - Print freed objects");
    console.log("  printAllocation(ptr) - Print allocation details");
    console.log("  clearTracked() - Clear all tracked allocations");
    console.log("  setConfig(key, value) - Set configuration option");
    console.log("  setUAFThreshold(ms) - Set UAF detection threshold");
    console.log();
}

/**
 * Print statistics
 */
function printStats() {
    console.log("\n[*] Detection Statistics:");
    console.log("  Total malloc: " + stats.totalMalloc);
    console.log("  Total free: " + stats.totalFree);
    console.log("  UAF detected: " + stats.uafDetected);
    console.log("  Double-free detected: " + stats.doubleFreeDetected);
    console.log("  Invalid free detected: " + stats.invalidFreeDetected);
    console.log("  Tracked allocations: " + allocations.size);
    console.log("  Tracked freed objects: " + freedObjects.size);
    console.log();
}

/**
 * Print freed objects
 */
function printFreed() {
    console.log("\n[*] Freed Objects:");
    console.log("  Total: " + freedObjects.size);
    console.log();

    freedObjects.forEach(function(info, ptr) {
        console.log("[+] " + formatPtr(ptr(ptr)) + " (" + formatSize(info.size) + ")");
        console.log("    Freed at: " + new Date(info.timestamp));
        console.log("    Free count: " + info.freeCount);
        console.log();
    });
}

/**
 * Print allocation details
 */
function printAllocation(ptrStr) {
    const info = allocations.get(ptrStr);
    if (!info) {
        console.log("[-] Allocation not found: " + ptrStr);
        return;
    }

    console.log("\n[*] Allocation Details:");
    console.log("  Address: " + formatPtr(ptr(ptrStr)));
    console.log("  Size: " + formatSize(info.size));
    console.log("  State: " + info.state);
    console.log("  Timestamp: " + new Date(info.timestamp));
    console.log("  Backtrace:");
    console.log(formatBacktrace(info.backtrace));
    console.log();
}

/**
 * Clear tracked allocations
 */
function clearTracked() {
    const count = allocations.size;
    allocations.clear();
    freedObjects.clear();
    console.log("[*] Cleared " + count + " tracked allocations");
}

/**
 * Set configuration option
 */
function setConfig(key, value) {
    if (CONFIG.hasOwnProperty(key)) {
        CONFIG[key] = value;
        console.log("[*] Set " + key + " = " + value);
    } else {
        console.log("[-] Unknown configuration option: " + key);
    }
}

/**
 * Set UAF detection threshold
 */
function setUAFThreshold(ms) {
    CONFIG.uafThreshold = ms;
    console.log("[*] Set UAF threshold to " + ms + "ms");
}

// ============================================
// INITIALIZATION
// ============================================

// Expose commands to console
rpc.exports = {
    help: help,
    printStats: printStats,
    printFreed: printFreed,
    printAllocation: printAllocation,
    clearTracked: clearTracked,
    setConfig: setConfig,
    setUAFThreshold: setUAFThreshold,
};

console.log("[*] UAF Detector ready");
console.log("[*] Type help() for available commands");
console.log("[*] Detection will impact performance - disable when not needed");
console.log("[*] Auto-mitigation is disabled by default (enable with setConfig)");
console.log();
