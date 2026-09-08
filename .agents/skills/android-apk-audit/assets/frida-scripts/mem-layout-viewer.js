/**
 * Memory Layout Viewer for Android
 *
 * Usage:
 *   frida -U com.target.app -l mem-layout-viewer.js
 *   frida -U -f com.target.app -l mem-layout-viewer.js --no-pause
 *
 * This script visualizes the memory layout of the target process, showing
 * loaded modules, memory regions, and their properties. It helps pentesters
 * understand the memory layout for exploitation.
 *
 * Features:
 * - List all loaded modules and their base addresses
 * - Show memory regions with permissions
 * - Visualize memory layout
 * - Search for specific addresses or patterns
 * - Show region details
 * - Export memory map to file
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

console.log("[*] Memory Layout Viewer Loaded");
console.log("[*] Process:", Process.getCurrentThreadId());
console.log("[*] PID:", Process.id);
console.log("[*] Arch:", Process.arch);
console.log("[*] Platform:", Process.platform);

// ============================================
// CONFIGURATION
// ============================================

const CONFIG = {
    // Enable/disable viewer
    enabled: true,

    // Show all memory regions
    showAllRegions: false,

    // Show region details
    showDetails: true,

    // Group by module
    groupByModule: true,

    // Sort options
    sortBy: "address", // "address", "size", "name"

    // Export to file
    exportToFile: false,
    exportPath: "/data/local/tmp/memory-map.json",

    // Search filters
    filterByName: null,
    filterByPermission: null, // "r-x", "rw-", etc.
};

// ============================================
// STATE
// ============================================

let modules = [];
let regions = [];
let memoryMap = {};

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
 * Format permission string
 */
function formatPermission(perm) {
    if (!perm) {
        return "---";
    }

    var result = "";
    result += perm.includes('r') ? 'r' : '-';
    result += perm.includes('w') ? 'w' : '-';
    result += perm.includes('x') ? 'x' : '-';
    return result;
}

/**
 * Get module for address
 */
function getModuleForAddress(addr) {
    for (var i = 0; i < modules.length; i++) {
        var module = modules[i];
        var base = ptr(module.base);
        var end = base.add(module.size);

        if (addr.compare(base) >= 0 && addr.compare(end) < 0) {
            return module;
        }
    }
    return null;
}

/**
 * Colorize output (optional)
 */
function colorize(str, color) {
    // Simple color coding
    const colors = {
        'red': '\x1b[31m',
        'green': '\x1b[32m',
        'yellow': '\x1b[33m',
        'blue': '\x1b[34m',
        'magenta': '\x1b[35m',
        'cyan': '\x1b[36m',
        'reset': '\x1b[0m'
    };

    if (colors[color]) {
        return colors[color] + str + colors['reset'];
    }
    return str;
}

// ============================================
// MEMORY ANALYSIS
// ============================================

/**
 * Enumerate all modules
 */
function enumerateModules() {
    modules = Process.enumerateModules();
    console.log("[*] Found " + modules.length + " modules");

    // Build memory map
    memoryMap = {};
    for (var i = 0; i < modules.length; i++) {
        var module = modules[i];
        memoryMap[module.name] = {
            base: module.base.toString(),
            size: module.size,
            path: module.path,
            regions: []
        };
    }
}

/**
 * Enumerate memory regions
 */
function enumerateRegions() {
    regions = Process.enumerateRanges('--all');
    console.log("[*] Found " + regions.length + " memory regions");

    // Assign regions to modules
    for (var i = 0; i < regions.length; i++) {
        var region = regions[i];
        var module = getModuleForAddress(region.base);

        if (module) {
            var moduleName = module.name;
            if (memoryMap[moduleName]) {
                memoryMap[moduleName].regions.push(region);
            }
        }
    }
}

/**
 * Analyze memory layout
 */
function analyzeMemory() {
    if (!CONFIG.enabled) {
        console.log("[-] Memory analysis disabled");
        return;
    }

    console.log("\n[*] Analyzing memory layout");
    enumerateModules();
    enumerateRegions();

    // Calculate statistics
    var stats = {
        totalSize: 0,
        readOnly: 0,
        writeOnly: 0,
        executable: 0,
        readWrite: 0,
        readExecute: 0,
        readWriteExecute: 0
    };

    for (var i = 0; i < regions.length; i++) {
        var region = regions[i];
        var perm = region.protection;

        stats.totalSize += region.size;

        if (perm.includes('r') && perm.includes('w') && perm.includes('x')) {
            stats.readWriteExecute += region.size;
        } else if (perm.includes('r') && perm.includes('x')) {
            stats.readExecute += region.size;
        } else if (perm.includes('r') && perm.includes('w')) {
            stats.readWrite += region.size;
        } else if (perm.includes('x')) {
            stats.executable += region.size;
        } else if (perm.includes('w')) {
            stats.writeOnly += region.size;
        } else if (perm.includes('r')) {
            stats.readOnly += region.size;
        }
    }

    console.log("[*] Memory Statistics:");
    console.log("  Total size: " + formatSize(stats.totalSize));
    console.log("  Read-only: " + formatSize(stats.readOnly));
    console.log("  Write-only: " + formatSize(stats.writeOnly));
    console.log("  Executable: " + formatSize(stats.executable));
    console.log("  Read+Write: " + formatSize(stats.readWrite));
    console.log("  Read+Execute: " + formatSize(stats.readExecute));
    console.log("  Read+Write+Execute: " + formatSize(stats.readWriteExecute));
    console.log();
}

// ============================================
// DISPLAY FUNCTIONS
// ============================================

/**
 * Print all modules
 */
function printModules() {
    console.log("\n[*] Loaded Modules:");
    console.log("=" * 100);

    var headers = ["Name", "Base Address", "Size", "Path"];
    var format = "%-20s %18s %12s %s";
    console.log(sprintf(format, headers[0], headers[1], headers[2], headers[3]));
    console.log("-" * 100);

    // Sort modules
    var sortedModules = modules.slice();
    if (CONFIG.sortBy === "name") {
        sortedModules.sort(function(a, b) { return a.name.localeCompare(b.name); });
    } else if (CONFIG.sortBy === "size") {
        sortedModules.sort(function(a, b) { return b.size - a.size; });
    } else {
        sortedModules.sort(function(a, b) { return a.base.compare(b.base); });
    }

    for (var i = 0; i < sortedModules.length; i++) {
        var module = sortedModules[i];
        console.log(sprintf(format,
            module.name.substring(0, 20),
            formatPtr(module.base),
            formatSize(module.size),
            module.path.substring(0, 50)
        ));
    }

    console.log();
}

/**
 * Print memory regions
 */
function printRegions() {
    console.log("\n[*] Memory Regions:");
    console.log("=" * 100);

    var headers = ["Start", "End", "Size", "Protection", "Module"];
    var format = "%18s %18s %12s %12s %s";
    console.log(sprintf(format, headers[0], headers[1], headers[2], headers[3], headers[4]));
    console.log("-" * 100);

    for (var i = 0; i < regions.length; i++) {
        var region = regions[i];

        // Filter by permission
        if (CONFIG.filterByPermission && !region.protection.includes(CONFIG.filterByPermission)) {
            continue;
        }

        var module = getModuleForAddress(region.base);
        var moduleName = module ? module.name : "(anonymous)";

        console.log(sprintf(format,
            formatPtr(region.base),
            formatPtr(region.base.add(region.size)),
            formatSize(region.size),
            formatPermission(region.protection),
            moduleName
        ));

        if (CONFIG.showDetails) {
            console.log("  Details: " + region.file ? region.file.path : "(anonymous)");
        }
    }

    console.log();
}

/**
 * Print module details
 */
function printModuleDetails(moduleName) {
    var module = modules.find(function(m) {
        return m.name === moduleName || m.path.includes(moduleName);
    });

    if (!module) {
        console.log("[-] Module not found: " + moduleName);
        return;
    }

    console.log("\n[*] Module Details: " + module.name);
    console.log("=" * 100);
    console.log("  Base: " + formatPtr(module.base));
    console.log("  Size: " + formatSize(module.size));
    console.log("  Path: " + module.path);
    console.log();

    // Get module regions
    if (memoryMap[module.name]) {
        console.log("  Memory Regions:");
        memoryMap[module.name].regions.forEach(function(region) {
            console.log("    " + formatPtr(region.base) + " - " +
                       formatPtr(region.base.add(region.size)) +
                       " (" + formatSize(region.size) + ") " +
                       formatPermission(region.protection));
        });
    }

    console.log();
}

/**
 * Visualize memory layout
 */
function visualizeLayout() {
    console.log("\n[*] Memory Layout Visualization:");
    console.log("=" * 100);

    // Group by module
    var moduleMap = {};
    for (var i = 0; i < regions.length; i++) {
        var region = regions[i];
        var module = getModuleForAddress(region.base);
        var moduleName = module ? module.name : "(anonymous)";

        if (!moduleMap[moduleName]) {
            moduleMap[moduleName] = [];
        }
        moduleMap[moduleName].push(region);
    }

    // Print layout for each module
    for (var moduleName in moduleMap) {
        console.log("\n" + colorize(moduleName, 'green') + ":");

        var moduleRegions = moduleMap[moduleName];
        var totalSize = moduleRegions.reduce(function(sum, r) { return sum + r.size; }, 0);
        var scale = 100 / totalSize;

        for (var i = 0; i < moduleRegions.length; i++) {
            var region = moduleRegions[i];
            var width = Math.round(region.size * scale);

            var color = 'reset';
            if (region.protection.includes('x')) {
                color = 'red';
            } else if (region.protection.includes('w')) {
                color = 'yellow';
            } else if (region.protection.includes('r')) {
                color = 'blue';
            }

            var bar = "█".repeat(width);
            console.log("  " + formatPtr(region.base) + " " +
                       colorize(bar, color) + " " +
                       formatSize(region.size) + " " +
                       formatPermission(region.protection));
        }
    }

    console.log();
}

/**
 * Search address
 */
function searchAddress(addrStr) {
    try {
        var addr = ptr(addrStr);
        var module = getModuleForAddress(addr);

        console.log("\n[*] Address: " + formatPtr(addr));

        if (module) {
            console.log("  Module: " + module.name);
            console.log("  Module base: " + formatPtr(module.base));
            console.log("  Offset: 0x" + addr.sub(module.base).toString(16));

            // Find region
            for (var i = 0; i < regions.length; i++) {
                var region = regions[i];
                var base = region.base;
                var end = base.add(region.size);

                if (addr.compare(base) >= 0 && addr.compare(end) < 0) {
                    console.log("  Region: " + formatPtr(base) + " - " + formatPtr(end));
                    console.log("  Protection: " + formatPermission(region.protection));
                    break;
                }
            }
        } else {
            console.log("  Module: (none - heap/stack)");
        }

        console.log();
    } catch (e) {
        console.log("[-] Invalid address: " + addrStr);
    }
}

/**
 * Export memory map to JSON
 */
function exportToJSON() {
    if (!CONFIG.exportToFile) {
        console.log("[-] Export disabled");
        return;
    }

    try {
        var data = {
            timestamp: new Date().toISOString(),
            process: {
                pid: Process.id,
                arch: Process.arch,
                platform: Process.platform
            },
            modules: modules,
            regions: regions.map(function(r) {
                return {
                    base: r.base.toString(),
                    size: r.size,
                    protection: r.protection,
                    file: r.file ? r.file.path : null
                };
            }),
            memoryMap: memoryMap
        };

        var json = JSON.stringify(data, null, 2);
        var file = new File(CONFIG.exportPath, "w");
        file.write(json);
        file.close();

        console.log("[*] Exported memory map to " + CONFIG.exportPath);
    } catch (e) {
        console.log("[-] Failed to export: " + e);
    }
}

/**
 * Find specific region type
 */
function findRegions(permissions) {
    console.log("\n[*] Finding regions with permissions: " + permissions);

    var results = regions.filter(function(r) {
        return r.protection === permissions || r.protection.includes(permissions);
    });

    console.log("[*] Found " + results.length + " regions");
    return results;
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
    console.log("  analyzeMemory() - Analyze memory layout");
    console.log("  printModules() - Print all loaded modules");
    console.log("  printRegions() - Print all memory regions");
    console.log("  printModuleDetails(name) - Print details for specific module");
    console.log("  visualizeLayout() - Visualize memory layout");
    console.log("  searchAddress(addr) - Search for specific address");
    console.log("  exportToJSON() - Export memory map to JSON");
    console.log("  findRegions(permissions) - Find regions with specific permissions");
    console.log("  setConfig(key, value) - Set configuration option");
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

// Simple sprintf implementation (not perfect but works for our use case)
function sprintf(format) {
    var args = Array.prototype.slice.call(arguments, 1);
    return format.replace(/%s|%d|%x/g, function(match) {
        var arg = args.shift();
        if (match === '%d' || match === '%x') {
            return match === '%x' ? Number(arg).toString(16) : Number(arg).toString();
        }
        return String(arg);
    });
}

// ============================================
// INITIALIZATION
// ============================================

// Initial analysis
analyzeMemory();
printModules();

// Expose commands to console
rpc.exports = {
    help: help,
    analyzeMemory: analyzeMemory,
    printModules: printModules,
    printRegions: printRegions,
    printModuleDetails: printModuleDetails,
    visualizeLayout: visualizeLayout,
    searchAddress: searchAddress,
    exportToJSON: exportToJSON,
    findRegions: findRegions,
    setConfig: setConfig,
};

console.log("[*] Memory Layout Viewer ready");
console.log("[*] Type help() for available commands");
console.log();
