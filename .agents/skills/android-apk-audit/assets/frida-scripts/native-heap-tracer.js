/**
 * Native Heap Tracer for Android
 *
 * Usage:
 *   frida -U -f com.target.app -l native-heap-tracer.js
 *   frida -U com.target.app -l native-heap-tracer.js
 *
 * This script traces heap allocations, deallocations, and provides
 * real-time heap state visualization. It helps pentesters understand
 * heap behavior during testing.
 *
 * Features:
 * - Track malloc/free calls
 * - Capture allocation sizes and addresses
 * - Record backtraces for each allocation
 * - Detect memory leaks
 * - Show heap statistics
 * - Export allocation data to file
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

console.log("[*] Native Heap Tracer Loaded");
console.log("[*] Process:", Process.getCurrentThreadId());
console.log("[*] PID:", Process.id);
console.log("[*] Arch:", Process.arch);
console.log("[*] Platform:", Process.platform);

// ============================================
// CONFIGURATION
// ============================================

const CONFIG = {
    // Enable/disable tracing
    enabled: true,

    // Log each allocation/deallocation
    logOperations: true,

    // Capture backtraces (may impact performance)
    captureBacktrace: true,

    // Maximum backtrace depth
    backtraceDepth: 10,

    // Track statistics
    trackStatistics: true,

    // Detect memory leaks
    detectLeaks: true,

    // Limit number of tracked allocations (prevent memory exhaustion)
    maxTracked: 10000,

    // Export data to file
    exportToFile: false,
    exportPath: "/data/local/tmp/heap-trace.json",

    // Filter by size (0 = no filter)
    minSize: 0,
    maxSize: 0,

    // Show statistics interval (ms)
    statsInterval: 5000,
};

// ============================================
// STATE
// ============================================

// Track all allocations
const allocations = new Map();

// Statistics
const stats = {
    totalMalloc: 0,
    totalFree: 0,
    totalBytesAllocated: 0,
    totalBytesFreed: 0,
    currentAllocations: 0,
    currentBytesAllocated: 0,
    peakAllocations: 0,
    peakBytesAllocated: 0,
};

// Leak detection
const leakedAllocations = [];

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
 * Get current timestamp
 */
function getTimestamp() {
    return new Date().toISOString();
}

/**
 * Capture backtrace
 */
function captureBacktrace() {
    if (!CONFIG.captureBacktrace) {
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
 * Update statistics
 */
function updateStats(deltaMalloc, deltaFree, deltaBytesAllocated, deltaBytesFreed) {
    stats.totalMalloc += deltaMalloc;
    stats.totalFree += deltaFree;
    stats.totalBytesAllocated += deltaBytesAllocated;
    stats.totalBytesFreed += deltaBytesFreed;

    stats.currentAllocations += deltaMalloc - deltaFree;
    stats.currentBytesAllocated += deltaBytesAllocated - deltaBytesFreed;

    if (stats.currentAllocations > stats.peakAllocations) {
        stats.peakAllocations = stats.currentAllocations;
    }
    if (stats.currentBytesAllocated > stats.peakBytesAllocated) {
        stats.peakBytesAllocated = stats.currentBytesAllocated;
    }
}

/**
 * Print statistics
 */
function printStatistics() {
    console.log("\n[*] Heap Statistics:");
    console.log("  Total malloc calls: " + stats.totalMalloc);
    console.log("  Total free calls: " + stats.totalFree);
    console.log("  Total bytes allocated: " + formatSize(stats.totalBytesAllocated));
    console.log("  Total bytes freed: " + formatSize(stats.totalBytesFreed));
    console.log("  Current allocations: " + stats.currentAllocations);
    console.log("  Current bytes allocated: " + formatSize(stats.currentBytesAllocated));
    console.log("  Peak allocations: " + stats.peakAllocations);
    console.log("  Peak bytes allocated: " + formatSize(stats.peakBytesAllocated));
    console.log();
}

/**
 * Detect memory leaks
 */
function detectLeaks() {
    if (!CONFIG.detectLeaks) {
        return;
    }

    // Find allocations that have been around for a while
    const now = Date.now();
    const leakThreshold = 30000; // 30 seconds

    allocations.forEach(function(info, ptr) {
        if (info.state === 'allocated' && (now - info.timestamp) > leakThreshold) {
            leakedAllocations.push({
                ptr: ptr,
                size: info.size,
                timestamp: info.timestamp,
                age: now - info.timestamp,
                backtrace: info.backtrace
            });
        }
    });

    if (leakedAllocations.length > 0) {
        console.log("\n[!] Potential Memory Leaks Detected:");
        console.log("[*] Found " + leakedAllocations.length + " long-lived allocations");
        leakedAllocations.forEach(function(leak, index) {
            if (index < 10) { // Show first 10
                console.log("\n  Leak #" + (index + 1) + ":");
                console.log("    Address: " + leak.ptr);
                console.log("    Size: " + formatSize(leak.size));
                console.log("    Age: " + (leak.age / 1000).toFixed(2) + "s");
                console.log("    Backtrace:");
                console.log(formatBacktrace(leak.backtrace));
            }
        });
    }
}

/**
 * Export allocation data to JSON
 */
function exportToJSON() {
    if (!CONFIG.exportToFile) {
        return;
    }

    try {
        const data = {
            timestamp: getTimestamp(),
            stats: stats,
            allocations: Array.from(allocations.entries()).map(function(entry) {
                return {
                    ptr: entry[0],
                    info: entry[1]
                };
            })
        };

        const json = JSON.stringify(data, null, 2);
        const file = new File(CONFIG.exportPath, "w");
        file.write(json);
        file.close();

        console.log("[*] Exported " + allocations.size + " allocations to " + CONFIG.exportPath);
    } catch (e) {
        console.log("[-] Failed to export to file: " + e);
    }
}

/**
 * Clear tracked allocations
 */
function clearTrackedAllocations() {
    const count = allocations.size;
    allocations.clear();
    console.log("[*] Cleared " + count + " tracked allocations");
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
                if (CONFIG.logOperations) {
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

            // Update statistics
            updateStats(1, 0, this.size, 0);

            if (CONFIG.logOperations) {
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

            this.ptr = args[0].toString();
            const info = allocations.get(this.ptr);

            if (CONFIG.logOperations) {
                console.log("[-] free(" + formatPtr(args[0]) + ")");
            }

            if (info) {
                this.size = info.size;
                this.state = info.state;

                if (info.state === 'freed') {
                    console.log("[!] DOUBLE FREE detected: " + formatPtr(args[0]));
                    console.log("[*] Original free timestamp: " + new Date(info.timestamp));
                } else {
                    info.state = 'freed';
                    info.timestamp = Date.now();

                    // Update statistics
                    updateStats(0, 1, 0, info.size);
                }
            }
        }
    });
    console.log("[*] Hooked free");
} else {
    console.log("[-] Could not find free");
}

// Hook calloc
var calloc_func = Module.findExportByName(null, 'calloc');
if (calloc_func) {
    Interceptor.attach(calloc_func, {
        onEnter: function(args) {
            if (!CONFIG.enabled) {
                return;
            }

            this.num = args[0].toInt32();
            this.size = args[1].toInt32();
            this.total = this.num * this.size;

            // Filter by size
            if (CONFIG.minSize > 0 && this.total < CONFIG.minSize) {
                this.skip = true;
                return;
            }
            if (CONFIG.maxSize > 0 && this.total > CONFIG.maxSize) {
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
                if (CONFIG.logOperations) {
                    console.log("[-] calloc(" + this.num + ", " + this.size + ") = NULL");
                }
                return;
            }

            const ptr = retval.toString();

            // Store allocation info
            if (allocations.size < CONFIG.maxTracked) {
                allocations.set(ptr, {
                    size: this.total,
                    backtrace: this.backtrace,
                    state: 'allocated',
                    timestamp: Date.now()
                });
            }

            // Update statistics
            updateStats(1, 0, this.total, 0);

            if (CONFIG.logOperations) {
                console.log("[+] calloc(" + this.num + ", " + this.size + ") = " + formatPtr(retval));
            }
        }
    });
    console.log("[*] Hooked calloc");
}

// Hook realloc
var realloc_func = Module.findExportByName(null, 'realloc');
if (realloc_func) {
    Interceptor.attach(realloc_func, {
        onEnter: function(args) {
            if (!CONFIG.enabled) {
                return;
            }

            this.ptr = args[0].toString();
            this.size = args[1].toInt32();

            // Filter by size
            if (CONFIG.minSize > 0 && this.size < CONFIG.minSize) {
                this.skip = true;
                return;
            }
            if (CONFIG.maxSize > 0 && this.size > CONFIG.maxSize) {
                this.skip = true;
                return;
            }

            this.oldInfo = allocations.get(this.ptr);
            this.backtrace = captureBacktrace();
        },
        onLeave: function(retval) {
            if (!CONFIG.enabled || this.skip) {
                return;
            }

            if (retval.isNull()) {
                if (CONFIG.logOperations) {
                    console.log("[-] realloc(" + formatPtr(ptr(this.ptr)) + ", " + this.size + ") = NULL");
                }
                return;
            }

            const newPtr = retval.toString();

            // Handle old allocation
            if (this.oldInfo) {
                allocations.delete(this.ptr);
                updateStats(0, 1, 0, this.oldInfo.size);
            }

            // Store new allocation
            if (allocations.size < CONFIG.maxTracked) {
                allocations.set(newPtr, {
                    size: this.size,
                    backtrace: this.backtrace,
                    state: 'allocated',
                    timestamp: Date.now()
                });
            }

            // Update statistics
            updateStats(1, 0, this.size, 0);

            if (CONFIG.logOperations) {
                console.log("[+] realloc(" + formatPtr(ptr(this.ptr)) + ", " + this.size + ") = " + formatPtr(retval));
            }
        }
    });
    console.log("[*] Hooked realloc");
}

// ============================================
// COMMANDS
// ============================================

/**
 * Print help
 */
function help() {
    console.log("\n[*] Available Commands:");
    console.log("  help() - Show this help message");
    console.log("  printStats() - Print heap statistics");
    console.log("  detectLeaks() - Detect potential memory leaks");
    console.log("  exportToJSON() - Export allocation data to JSON file");
    console.log("  clearTracked() - Clear all tracked allocations");
    console.log("  printAllocations() - Print all tracked allocations");
    console.log("  printAllocation(ptr) - Print allocation details");
    console.log("  setConfig(key, value) - Set configuration option");
    console.log();
}

/**
 * Print all tracked allocations
 */
function printAllocations() {
    console.log("\n[*] Tracked Allocations:");
    console.log("  Total: " + allocations.size);
    console.log();

    let allocated = 0;
    let freed = 0;

    allocations.forEach(function(info, ptr) {
        if (info.state === 'allocated') {
            allocated++;
            console.log("[+] " + formatPtr(ptr(ptr)) + " (" + formatSize(info.size) + ")");
        } else {
            freed++;
            console.log("[-] " + formatPtr(ptr(ptr)) + " (freed)");
        }
    });

    console.log();
    console.log("  Allocated: " + allocated);
    console.log("  Freed: " + freed);
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

// ============================================
// INITIALIZATION
// ============================================

// Setup periodic statistics
if (CONFIG.trackStatistics) {
    setInterval(function() {
        printStatistics();
        if (CONFIG.detectLeaks) {
            detectLeaks();
        }
    }, CONFIG.statsInterval);
}

// Expose commands to console
rpc.exports = {
    help: help,
    printStats: printStatistics,
    detectLeaks: detectLeaks,
    exportToJSON: exportToJSON,
    clearTracked: clearTrackedAllocations,
    printAllocations: printAllocations,
    printAllocation: printAllocation,
    setConfig: setConfig,
};

console.log("[*] Heap Tracer ready");
console.log("[*] Type help() for available commands");
console.log("[*] Tracing will impact performance - disable when not needed");
console.log();
