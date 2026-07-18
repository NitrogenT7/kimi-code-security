/**
 * ROP Gadget Finder for Android
 *
 * Usage:
 *   frida -U com.target.app -l rop-gadget-finder.js
 *   frida -U -f com.target.app -l rop-gadget-finder.js --no-pause
 *
 * This script dynamically finds ROP (Return-Oriented Programming) gadgets
 * in loaded native libraries. It searches for common gadgets used in
 * exploitation.
 *
 * Features:
 * - Find ROP gadgets in loaded modules
 * - Search for specific gadget patterns
 * - Find common ARM/ARM64 gadgets
 * - Search in specific libraries or all modules
 * - Export gadgets to JSON
 * - Filter by instruction type
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

console.log("[*] ROP Gadget Finder Loaded");
console.log("[*] Process:", Process.getCurrentThreadId());
console.log("[*] PID:", Process.id);
console.log("[*] Arch:", Process.arch);
console.log("[*] Platform:", Process.platform);

// ============================================
// CONFIGURATION
// ============================================

const CONFIG = {
    // Enable/disable gadget finding
    enabled: true,

    // Maximum gadget length (instructions)
    maxGadgetLength: 5,

    // Search specific library (null = all modules)
    targetLibrary: null,

    // Search in executable sections only
    executableOnly: true,

    // Log all found gadgets
    logAllGadgets: false,

    // Export to JSON
    exportToJSON: false,
    exportPath: "/data/local/tmp/rop-gadgets.json",

    // Filter by gadget type
    filterType: null, // "pop", "mov", "ldr", "bl", etc.
};

// ============================================
// GADGET PATTERNS
// ============================================

// Common ARM64 ROP gadgets
const ARM64_GADGETS = {
    "pop_x0": ["pop {x0}", "ret"],
    "pop_x1": ["pop {x1}", "ret"],
    "pop_x2": ["pop {x2}", "ret"],
    "pop_x3": ["pop {x3}", "ret"],
    "pop_x0_x1": ["pop {x0, x1}", "ret"],
    "pop_x0_x1_x2": ["pop {x0, x1, x2}", "ret"],
    "pop_x0_x1_x2_x3": ["pop {x0, x1, x2, x3}", "ret"],
    "pop_x0_lr": ["pop {x0, lr}", "b lr"],
    "pop_x19_x20": ["pop {x19, x20}", "ret"],
    "pop_x19_x20_x21": ["pop {x19, x20, x21}", "ret"],
    "pop_x19_x20_x21_x22": ["pop {x19, x20, x21, x22}", "ret"],
    "pop_x19_lr": ["pop {x19, lr}", "ret"],
    "mov_x0_x19": ["mov x0, x19", "ret"],
    "mov_x1_x20": ["mov x1, x20", "ret"],
    "mov_x2_x21": ["mov x2, x21", "ret"],
    "ldr_x0_sp": ["ldr x0, [sp]", "ret"],
    "ldr_x1_sp": ["ldr x1, [sp]", "ret"],
    "ldr_x2_sp": ["ldr x2, [sp]", "ret"],
    "add_sp_sp": ["add sp, sp, #0x10", "ret"],
    "sub_sp_sp": ["sub sp, sp, #0x10", "ret"],
    "bl_x19": ["bl x19"],
    "br_x19": ["br x19"],
    "blr_x19": ["blr x19"],
    "ret": ["ret"],
    "b_lr": ["b lr"],
};

// Common ARM (32-bit) ROP gadgets
const ARM_GADGETS = {
    "pop_r0": ["pop {r0}", "bx lr"],
    "pop_r1": ["pop {r1}", "bx lr"],
    "pop_r2": ["pop {r2}", "bx lr"],
    "pop_r3": ["pop {r3}", "bx lr"],
    "pop_r0_r1": ["pop {r0, r1}", "bx lr"],
    "pop_r0_r1_r2": ["pop {r0, r1, r2}", "bx lr"],
    "pop_r0_r1_r2_r3": ["pop {r0, r1, r2, r3}", "bx lr"],
    "pop_r4": ["pop {r4}", "bx lr"],
    "pop_r4_pc": ["pop {r4, pc}"],
    "pop_r5_pc": ["pop {r5, pc}"],
    "mov_r0_r4": ["mov r0, r4", "bx lr"],
    "mov_r1_r5": ["mov r1, r5", "bx lr"],
    "ldr_r0_sp": ["ldr r0, [sp]", "bx lr"],
    "ldr_r1_sp": ["ldr r1, [sp]", "bx lr"],
    "blx_r4": ["blx r4"],
    "bx_r4": ["bx r4"],
    "bx_lr": ["bx lr"],
    "pop_pc": ["pop {pc}"],
};

// ============================================
// STATE
// ============================================

const foundGadgets = [];
const searchedModules = [];

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
 * Format bytes as hex
 */
function formatBytes(bytes, length) {
    var result = [];
    for (var i = 0; i < Math.min(length, bytes.length); i++) {
        result.push(bytes[i].toString(16).padStart(2, '0'));
    }
    return result.join(' ');
}

/**
 * Normalize instruction string for comparison
 */
function normalizeInstruction(inst) {
    return inst.toLowerCase()
        .replace(/\s+/g, ' ')
        .replace(/#/g, '')
        .trim();
}

/**
 * Check if gadget matches pattern
 */
function gadgetMatches(gadget, pattern) {
    var normalized = gadget.map(normalizeInstruction);
    var normalizedPattern = pattern.map(normalizeInstruction);

    // Check if all pattern instructions are present
    for (var i = 0; i < normalizedPattern.length; i++) {
        if (!normalized[i] || !normalized[i].includes(normalizedPattern[i])) {
            return false;
        }
    }

    return true;
}

/**
 * Get gadget patterns for current architecture
 */
function getGadgetPatterns() {
    if (Process.arch === 'arm64') {
        return ARM64_GADGETS;
    } else if (Process.arch === 'arm') {
        return ARM_GADGETS;
    } else {
        console.log("[-] Unsupported architecture: " + Process.arch);
        return {};
    }
}

// ============================================
// GADGET FINDING
// ============================================

/**
 * Scan memory region for gadgets
 */
function scanRegion(module, region, patterns) {
    try {
        var base = region.base;
        var size = region.size;
        var end = base.add(size);

        console.log("[*] Scanning region: " + formatPtr(base) + " - " + formatPtr(end));

        // Read region memory
        var data = base.readByteArray(size);

        // Disassemble and search for gadgets
        var gadgetCount = 0;
        for (var offset = 0; offset < size; offset += 4) {
            var addr = base.add(offset);

            // Try to disassemble instruction at this address
            try {
                var insts = [];
                var currentAddr = addr;

                // Try to build a gadget
                for (var len = 0; len < CONFIG.maxGadgetLength; len++) {
                    try {
                        var inst = Instruction.parse(currentAddr);
                        insts.push(inst.toString());

                        // Check if this is a terminating instruction
                        var mnemonic = inst.mnemonic.toLowerCase();
                        if (mnemonic === 'ret' || mnemonic === 'b' || mnemonic === 'bx' ||
                            mnemonic === 'bl' || mnemonic === 'br' || mnemonic === 'blr') {

                            // Check if gadget matches any pattern
                            for (var patternName in patterns) {
                                if (gadgetMatches(insts, patterns[patternName])) {
                                    var gadget = {
                                        address: addr.toString(),
                                        module: module.name,
                                        base: module.base.toString(),
                                        instructions: insts,
                                        pattern: patternName,
                                        offset: offset
                                    };

                                    foundGadgets.push(gadget);
                                    gadgetCount++;

                                    if (CONFIG.logAllGadgets) {
                                        console.log("[+] Found gadget: " + formatPtr(addr) + " " + patternName);
                                        console.log("    " + insts.join("; "));
                                    }
                                    break;
                                }
                            }
                            break;
                        }

                        currentAddr = currentAddr.add(4);
                    } catch (e) {
                        // Could not disassemble, skip
                        break;
                    }
                }
            } catch (e) {
                // Could not disassemble at this address, continue
            }
        }

        console.log("[*] Found " + gadgetCount + " gadgets in this region");
        return gadgetCount;

    } catch (e) {
        console.log("[-] Failed to scan region: " + e);
        return 0;
    }
}

/**
 * Find gadgets in a module
 */
function findGadgetsInModule(module, patterns) {
    console.log("\n[*] Finding gadgets in module: " + module.name);
    console.log("    Base: " + formatPtr(module.base));
    console.log("    Size: " + formatSize(module.size));

    var totalGadgets = 0;

    // Get memory regions
    var regions = module.enumerateRanges('r-x'); // Readable, executable

    if (regions.length === 0) {
        console.log("[-] No executable regions found");
        return 0;
    }

    // Scan each region
    for (var i = 0; i < regions.length; i++) {
        totalGadgets += scanRegion(module, regions[i], patterns);
    }

    searchedModules.push(module.name);

    console.log("[*] Total gadgets in " + module.name + ": " + totalGadgets);
    return totalGadgets;
}

/**
 * Find all gadgets
 */
function findAllGadgets() {
    if (!CONFIG.enabled) {
        console.log("[-] Gadget finding disabled");
        return;
    }

    console.log("\n[*] Starting gadget search");
    console.log("[*] Architecture: " + Process.arch);
    console.log("[*] Max gadget length: " + CONFIG.maxGadgetLength);

    var patterns = getGadgetPatterns();
    if (Object.keys(patterns).length === 0) {
        console.log("[-] No patterns for this architecture");
        return;
    }

    console.log("[*] Searching for " + Object.keys(patterns).length + " gadget patterns");

    var modules = Process.enumerateModules();
    var totalGadgets = 0;

    if (CONFIG.targetLibrary) {
        // Search specific library
        var targetModule = modules.find(function(m) {
            return m.name === CONFIG.targetLibrary || m.path.includes(CONFIG.targetLibrary);
        });

        if (targetModule) {
            totalGadgets += findGadgetsInModule(targetModule, patterns);
        } else {
            console.log("[-] Target library not found: " + CONFIG.targetLibrary);
        }
    } else {
        // Search all modules
        for (var i = 0; i < modules.length; i++) {
            var module = modules[i];

            // Skip system modules that are unlikely to be useful
            if (module.name.startsWith('app_process') ||
                module.name.startsWith('linker')) {
                continue;
            }

            totalGadgets += findGadgetsInModule(module, patterns);
        }
    }

    console.log("\n[*] Gadget search complete");
    console.log("[*] Total gadgets found: " + totalGadgets);
    console.log("[*] Searched modules: " + searchedModules.length);

    if (CONFIG.exportToJSON) {
        exportToJSON();
    }
}

/**
 * Export gadgets to JSON
 */
function exportToJSON() {
    try {
        var data = {
            timestamp: new Date().toISOString(),
            arch: Process.arch,
            modules: searchedModules,
            gadgets: foundGadgets
        };

        var json = JSON.stringify(data, null, 2);
        var file = new File(CONFIG.exportPath, "w");
        file.write(json);
        file.close();

        console.log("[*] Exported " + foundGadgets.length + " gadgets to " + CONFIG.exportPath);
    } catch (e) {
        console.log("[-] Failed to export to file: " + e);
    }
}

/**
 * Print found gadgets
 */
function printGadgets(limit) {
    limit = limit || foundGadgets.length;

    console.log("\n[*] Found Gadgets:");
    console.log("=" * 80);

    for (var i = 0; i < Math.min(limit, foundGadgets.length); i++) {
        var gadget = foundGadgets[i];
        console.log((i + 1) + ". " + gadget.pattern + ":");
        console.log("    Address: " + gadget.address);
        console.log("    Module: " + gadget.module);
        console.log("    Base: " + gadget.base);
        console.log("    Offset: 0x" + gadget.offset.toString(16));
        console.log("    Instructions: " + gadget.instructions.join("; "));
        console.log();
    }

    if (foundGadgets.length > limit) {
        console.log("... and " + (foundGadgets.length - limit) + " more gadgets");
    }
}

/**
 * Search for specific gadget
 */
function searchGadget(pattern) {
    console.log("\n[*] Searching for gadget: " + pattern);

    var results = foundGadgets.filter(function(g) {
        return g.pattern === pattern ||
               g.instructions.join("; ").toLowerCase().includes(pattern.toLowerCase());
    });

    if (results.length === 0) {
        console.log("[-] No gadgets found matching: " + pattern);
        return [];
    }

    console.log("[*] Found " + results.length + " gadgets");
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
    console.log("  findAllGadgets() - Find all ROP gadgets");
    console.log("  printGadgets([limit]) - Print found gadgets");
    console.log("  searchGadget(pattern) - Search for specific gadget");
    console.log("  exportToJSON() - Export gadgets to JSON file");
    console.log("  setConfig(key, value) - Set configuration option");
    console.log("  setTargetLibrary(name) - Set target library");
    console.log("  getPatterns() - Get available gadget patterns");
    console.log();
}

/**
 * Set target library
 */
function setTargetLibrary(name) {
    CONFIG.targetLibrary = name;
    console.log("[*] Set target library: " + name);
}

/**
 * Get gadget patterns
 */
function getPatterns() {
    var patterns = getGadgetPatterns();
    console.log("\n[*] Available Gadget Patterns:");
    console.log("=" * 80);

    for (var name in patterns) {
        console.log(name + ": " + patterns[name].join("; "));
    }
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

// Expose commands to console
rpc.exports = {
    help: help,
    findAllGadgets: findAllGadgets,
    printGadgets: printGadgets,
    searchGadget: searchGadget,
    exportToJSON: exportToJSON,
    setConfig: setConfig,
    setTargetLibrary: setTargetLibrary,
    getPatterns: getPatterns,
};

console.log("[*] ROP Gadget Finder ready");
console.log("[*] Type help() for available commands");
console.log("[*] To find gadgets, call findAllGadgets()");
console.log();
