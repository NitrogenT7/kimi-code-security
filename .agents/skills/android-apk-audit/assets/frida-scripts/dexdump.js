/*
 * Frida DEX Dumping Script for Android Applications
 *
 * Description:
 * This script intercepts and dumps DEX files from memory at runtime, including:
 * - Statically loaded DEX files
 * - Dynamically loaded DEX files
 * - In-memory DEX files (InMemoryDexClassLoader)
 * - Multi-DEX applications
 * - Runtime generated DEX files
 *
 * Usage:
 * frida -U -f <package_name> -l assets/frida-scripts/dexdump.js
 * frida -U <package_name> -l assets/frida-scripts/dexdump.js
 *
 * Configuration options are at the top of the script for easy customization.
 *
 * Author: Android-Pentesting-Skill
 * Version: 2.0.0
 */

// ==================== CONFIGURATION ====================

const CONFIG = {
    // Output directory for dumped DEX files
    outputDir: "/data/local/tmp/dexdump",

    // File naming pattern
    namingPattern: "timestamp", // "timestamp", "sequential", "hash"

    // Minimum DEX size to dump (bytes)
    minDexSize: 1024,

    // Maximum DEX size to dump (bytes), 0 = unlimited
    maxDexSize: 0,

    // Dump DEX files on load
    dumpOnLoad: true,

    // Generate manifest file
    generateManifest: true,

    // Include verbose logging
    verbose: true,

    // Hook InMemoryDexClassLoader
    hookInMemoryDex: true,

    // Dump all existing DEX files on script load
    dumpExisting: true,

    // Monitor for new DEX files after initial dump
    monitorNewDex: true,

    // Scan memory for DEX files (slow but comprehensive)
    scanMemory: true
};

// ==================== GLOBAL VARIABLES ====================

let dumpedFiles = [];
let fileCounter = 0;
let manifestData = [];

// ==================== UTILITY FUNCTIONS ====================

function getTimestamp() {
    var now = new Date();
    return now.toISOString().replace(/[:.]/g, '-');
}

function log(message, level) {
    level = level || "INFO";
    var timestamp = getTimestamp();
    var prefix = "[" + timestamp + "][" + level + "]";

    if (CONFIG.verbose || level === "ERROR" || level === "WARN") {
        console.log(prefix + " " + message);
    }
}

function generateFilename(dexData, className) {
    var filename;

    switch (CONFIG.namingPattern) {
        case "timestamp":
            filename = getTimestamp() + "_" + className.replace(/\./g, '_') + ".dex";
            break;
        case "sequential":
            fileCounter++;
            filename = String(fileCounter).padStart(4, '0') + "_" + className.replace(/\./g, '_') + ".dex";
            break;
        case "hash":
            var hash = bytesToHex(dexData.slice(0, 8));
            filename = hash + "_" + className.replace(/\./g, '_') + ".dex";
            break;
        default:
            filename = getTimestamp() + "_dumped.dex";
    }

    return filename;
}

function bytesToHex(bytes) {
    return Array.from(bytes)
        .map(function(b) { return b.toString(16).padStart(2, '0'); })
        .join('');
}

function isValidDexFile(bytes) {
    if (bytes.length < 8) return false;

    var magic = String.fromCharCode.apply(null, bytes.slice(0, 8));
    // Check for DEX magic header: "dex\n" followed by version and null byte
    // Supported versions: 035, 037, 038, 039 (modern DEX files)
    var dexMagic = magic.substring(0, 4);
    var version = magic.substring(4, 7);
    var validVersions = ["035", "037", "038", "039"];

    return dexMagic === "dex\n" && validVersions.indexOf(version) !== -1 && magic.charCodeAt(7) === 0;
}

function writeBufferToFile(filepath, buffer) {
    try {
        // Use Java FileOutputStream instead of Frida's non-existent File API
        var FileOutputStream = Java.use('java.io.FileOutputStream');
        var BufferedOutputStream = Java.use('java.io.BufferedOutputStream');

        var fos = FileOutputStream.$new(filepath);
        var bos = BufferedOutputStream.$new(fos);
        bos.write(buffer);
        bos.close();
        fos.close();

        log("Saved: " + filepath, "SUCCESS");
        return true;
    } catch (e) {
        log("Error saving file " + filepath + ": " + e, "ERROR");
        return false;
    }
}

function saveDexFile(dexData, source, loader) {
    return new Promise(function(resolve, reject) {
        Java.performNow(function() {
            try {
                if (!dexData || dexData.length === 0) {
                    log("Empty DEX data, skipping", "WARN");
                    reject("Empty DEX data");
                    return;
                }

                if (!isValidDexFile(dexData)) {
                    log("Invalid DEX magic number, skipping", "WARN");
                    reject("Invalid DEX file");
                    return;
                }

                if (dexData.length < CONFIG.minDexSize) {
                    log("DEX too small (" + dexData.length + " bytes), skipping", "WARN");
                    reject("DEX too small");
                    return;
                }

                if (CONFIG.maxDexSize > 0 && dexData.length > CONFIG.maxDexSize) {
                    log("DEX too large (" + dexData.length + " bytes), skipping", "WARN");
                    reject("DEX too large");
                    return;
                }

                var filename = generateFilename(dexData, source || "unknown");
                var filepath = CONFIG.outputDir + "/" + filename;

                if (writeBufferToFile(filepath, dexData)) {
                    var fileInfo = {
                        filename: filename,
                        filepath: filepath,
                        size: dexData.length,
                        source: source || "unknown",
                        loader: loader || "unknown",
                        timestamp: getTimestamp(),
                        md5: bytesToHex(dexData.slice(0, 16))
                    };

                    dumpedFiles.push(fileInfo);
                    manifestData.push(fileInfo);

                    log("Dumped DEX: " + filename + " (" + dexData.length + " bytes) from " + source, "SUCCESS");
                    resolve(fileInfo);
                } else {
                    reject("Failed to save file");
                }

            } catch (error) {
                log("Error saving DEX file: " + error, "ERROR");
                reject(error);
            }
        });
    });
}

function generateManifest() {
    if (!CONFIG.generateManifest) return;

    Java.performNow(function() {
        try {
            var filepath = CONFIG.outputDir + "/manifest.json";

            // Use Java FileWriter for string writing instead of Frida's non-existent File API
            var FileWriter = Java.use('java.io.FileWriter');
            var file = FileWriter.$new(filepath);

            var manifest = {
                generatedAt: getTimestamp(),
                totalDexFiles: manifestData.length,
                totalSize: manifestData.reduce(function(sum, f) { return sum + f.size; }, 0),
                configuration: CONFIG,
                files: manifestData
            };

            file.write(JSON.stringify(manifest, null, 2));
            file.close();

            log("Generated manifest: " + filepath, "SUCCESS");

        } catch (error) {
            log("Error generating manifest: " + error, "ERROR");
        }
    });
}

function parseDexHeader(address) {
    try {
        var header = Memory.readByteArray(address, 112);

        var magic = Memory.readUtf8String(address, 8);
        var fileSize = Memory.readU32(address.add(32));
        var headerSize = Memory.readU32(address.add(36));
        var stringIdsSize = Memory.readU32(address.add(56));
        var typeIdsSize = Memory.readU32(address.add(60));
        var protoIdsSize = Memory.readU32(address.add(64));
        var fieldIdsSize = Memory.readU32(address.add(68));
        var methodIdsSize = Memory.readU32(address.add(72));
        var classDefsSize = Memory.readU32(address.add(96));

        return {
            address: address,
            magic: magic,
            fileSize: fileSize,
            headerSize: headerSize,
            stringIdsSize: stringIdsSize,
            typeIdsSize: typeIdsSize,
            protoIdsSize: protoIdsSize,
            fieldIdsSize: fieldIdsSize,
            methodIdsSize: methodIdsSize,
            classDefsSize: classDefsSize
        };
    } catch (e) {
        log("Error parsing DEX header at " + address + ": " + e, "ERROR");
        return null;
    }
}

function findDexMagicInRange(start, end) {
    var results = [];
    var MAGIC = "dex\n";

    try {
        var scanResults = Memory.scanSync(start, end.sub(start), MAGIC);
        scanResults.forEach(function(match) {
            results.push({
                address: match.address,
                size: match.size
            });
        });
    } catch (e) {
        log("Error scanning for DEX magic: " + e, "ERROR");
    }

    return results;
}

function scanMemoryForDexFiles() {
    if (!CONFIG.scanMemory) {
        log("Memory scanning disabled", "INFO");
        return;
    }

    log("Scanning process memory for DEX files...", "INFO");

    var dexCount = dumpedFiles.length;
    var timestamp = getTimestamp();

    Process.enumerateRanges('r--').forEach(function(range) {
        if (range.size < 0x100) {
            return;
        }

        var matches = findDexMagicInRange(range.base, range.base.add(range.size));

        matches.forEach(function(match) {
            var address = match.address;

            var header = parseDexHeader(address);

            if (header && header.fileSize > 0 && header.fileSize < 0x10000000) {
                log("Found DEX at: " + address, "INFO");
                log("  Magic: " + header.magic, "INFO");
                log("  File size: " + header.fileSize + " bytes", "INFO");
                log("  Classes: " + header.classDefsSize, "INFO");

                try {
                    var dexBuffer = Memory.readByteArray(address, header.fileSize);
                    var dexData = new Uint8Array(dexBuffer);

                    var source = "memory_" + address.toString().substring(2);
                    saveDexFile(Array.from(dexData), source, "MemoryScan");

                    dexCount++;
                } catch (e) {
                    log("Error dumping DEX: " + e, "ERROR");
                }
            }
        });
    });

    log("Total DEX files dumped from memory: " + (dexCount - dumpedFiles.length), "INFO");
}

function extractDexFromBuffer(buffer) {
    try {
        var ByteBuffer = Java.use("java.nio.ByteBuffer");

        if (buffer.class.getName() === "java.nio.ByteBuffer") {
            var remaining = buffer.remaining();
            var bytes = Java.array('byte', remaining);
            buffer.get(bytes);
            buffer.rewind();
            return Array.from(bytes);
        }

        if (Array.isArray(buffer) || buffer.byteLength) {
            return Array.from(buffer);
        }

        return null;

    } catch (error) {
        log("Error extracting DEX from buffer: " + error, "ERROR");
        return null;
    }
}

function hookDexFile() {
    log("Hooking Dalvik.system.DexFile...", "INFO");

    Java.perform(function() {
        try {
            var DexFile = Java.use("dalvik.system.DexFile");

            DexFile.loadDex.implementation = function(sourcePathName, outputPathName, flags) {
                log("loadDex called: " + sourcePathName + " -> " + outputPathName, "INFO");

                var result = this.loadDex(sourcePathName, outputPathName, flags);

                if (CONFIG.dumpOnLoad) {
                    setTimeout(function() {
                        try {
                            var File = Java.use("java.io.File");
                            var Files = Java.use("java.nio.file.Files");
                            var Path = Java.use("java.nio.file.Paths");

                            var path = Path.get(outputPathName);
                            var bytes = Files.readAllBytes(path);
                            var dexData = Array.from(bytes);

                            if (isValidDexFile(dexData)) {
                                saveDexFile(dexData, outputPathName, "loadDex");
                            }
                        } catch (e) {
                            log("Could not dump loadDex output: " + e, "WARN");
                        }
                    }, 200);
                }

                return result;
            };

            log("DexFile hooked successfully", "SUCCESS");
        } catch (error) {
            log("Could not hook DexFile: " + error, "ERROR");
        }
    });
}

function hookDexClassLoader() {
    log("Hooking Dalvik.system.DexClassLoader...", "INFO");

    Java.perform(function() {
        try {
            var DexClassLoader = Java.use("dalvik.system.DexClassLoader");
            var File = Java.use("java.io.File");
            var PathSeparator = File.pathSeparator;

            DexClassLoader.$init.overload('java.lang.String', 'java.lang.String', 'java.lang.String', 'java.lang.ClassLoader').implementation = function(dexPath, optimizedDirectory, librarySearchPath, parent) {
                log("DexClassLoader loading: " + dexPath, "INFO");
                log("  Optimized dir: " + optimizedDirectory, "INFO");
                log("  Library path: " + librarySearchPath, "INFO");

                var result = this.$init(dexPath, optimizedDirectory, librarySearchPath, parent);

                if (CONFIG.dumpOnLoad) {
                    setTimeout(function() {
                        var dexFiles = dexPath.split(PathSeparator);

                        dexFiles.forEach(function(dexFile) {
                            try {
                                var File = Java.use("java.io.File");
                                var Files = Java.use("java.nio.file.Files");
                                var Path = Java.use("java.nio.file.Paths");

                                var path = Path.get(dexFile);
                                var bytes = Files.readAllBytes(path);
                                var dexData = Array.from(bytes);

                                if (isValidDexFile(dexData)) {
                                    saveDexFile(dexData, dexFile, "DexClassLoader");
                                }
                            } catch (e) {
                                log("Could not read DEX file " + dexFile + ": " + e, "WARN");
                            }
                        });
                    }, 100);
                }

                return result;
            };

            log("DexClassLoader hooked successfully", "SUCCESS");
        } catch (error) {
            log("Could not hook DexClassLoader: " + error, "ERROR");
        }
    });
}

function hookPathClassLoader() {
    log("Hooking Dalvik.system.PathClassLoader...", "INFO");

    Java.perform(function() {
        try {
            var PathClassLoader = Java.use("dalvik.system.PathClassLoader");

            PathClassLoader.$init.overload('java.lang.String', 'java.lang.ClassLoader').implementation = function(dexPath, parent) {
                log("PathClassLoader loading: " + dexPath, "INFO");

                var result = this.$init(dexPath, parent);

                if (CONFIG.dumpOnLoad) {
                    setTimeout(function() {
                        try {
                            var File = Java.use("java.io.File");
                            var Files = Java.use("java.nio.file.Files");
                            var Path = Java.use("java.nio.file.Paths");

                            var path = Path.get(dexPath);
                            var bytes = Files.readAllBytes(path);
                            var dexData = Array.from(bytes);

                            if (isValidDexFile(dexData)) {
                                saveDexFile(dexData, dexPath, "PathClassLoader");
                            }
                        } catch (e) {
                            log("Could not read PathClassLoader DEX: " + e, "WARN");
                        }
                    }, 100);
                }

                return result;
            };

            log("PathClassLoader hooked successfully", "SUCCESS");
        } catch (error) {
            log("Could not hook PathClassLoader: " + error, "ERROR");
        }
    });
}

function hookInMemoryDexClassLoader() {
    if (!CONFIG.hookInMemoryDex) {
        log("Skipping InMemoryDexClassLoader (disabled in config)", "INFO");
        return;
    }

    log("Hooking Dalvik.system.InMemoryDexClassLoader...", "INFO");

    Java.perform(function() {
        try {
            var InMemoryDexClassLoader = Java.use("dalvik.system.InMemoryDexClassLoader");

            InMemoryDexClassLoader.$init.overload('[Ljava.nio.ByteBuffer;', 'java.lang.ClassLoader').implementation = function(dexBuffers, parent) {
                log("InMemoryDexClassLoader loading " + dexBuffers.length + " buffer(s)", "INFO");

                var result = this.$init(dexBuffers, parent);

                if (CONFIG.dumpOnLoad) {
                    setTimeout(function() {
                        for (var i = 0; i < dexBuffers.length; i++) {
                            var dexData = extractDexFromBuffer(dexBuffers[i]);
                            if (dexData) {
                                saveDexFile(dexData, "InMemoryDexClassLoader_buffer_" + i, "InMemoryDexClassLoader");
                            }
                        }
                    }, 100);
                }

                return result;
            };

            log("InMemoryDexClassLoader hooked successfully", "SUCCESS");

        } catch (error) {
            log("Could not hook InMemoryDexClassLoader (may not be available): " + error, "WARN");
        }
    });
}

function dumpExistingDexFiles() {
    log("Dumping existing DEX files...", "INFO");

    Java.perform(function() {
        try {
            var classCount = 0;
            var dexFiles = new Set();

            Java.enumerateLoadedClasses({
                onMatch: function(className) {
                    classCount++;

                    try {
                        var clazz = Java.use(className);
                        var classLoader = clazz.getClassLoader();

                        if (classLoader) {
                            var path = classLoader.toString();

                            if (path && (path.indexOf("dex") !== -1 || path.indexOf("apk") !== -1)) {
                                dexFiles.add(path);
                            }
                        }
                    } catch (e) {
                    }

                    if (classCount % 1000 === 0) {
                        log("Processed " + classCount + " classes...", "INFO");
                    }
                },
                onComplete: function() {
                    log("Total loaded classes: " + classCount, "INFO");
                    log("Unique DEX files found: " + dexFiles.size, "INFO");

                    dexFiles.forEach(function(path) {
                        log("  " + path, "INFO");
                    });
                }
            });

            Java.choose("dalvik.system.DexFile", {
                onMatch: function(instance) {
                    log("Found DexFile instance", "INFO");

                    try {
                        var mCookie = instance.mCookie.value;

                        log("  Cookie: " + mCookie, "DEBUG");
                        log("  File name: " + instance.mFileName.value, "DEBUG");
                    } catch (e) {
                        log("  Error reading DexFile: " + e, "WARN");
                    }
                },
                onComplete: function() {
                    log("DexFile enumeration complete", "INFO");
                }
            });

        } catch (error) {
            log("Error dumping existing DEX files: " + error, "ERROR");
        }
    });
}

function monitorNewDexFiles() {
    if (!CONFIG.monitorNewDex) {
        log("DEX file monitoring disabled", "INFO");
        return;
    }

    log("Monitoring for new DEX file loads...", "INFO");

    Java.perform(function() {
        try {
            var Class = Java.use("java.lang.Class");

            Class.forName.overload('java.lang.String').implementation = function(className) {
                log("Class.forName called: " + className, "DEBUG");
                return this.forName(className);
            };

            log("Class monitoring enabled", "SUCCESS");
        } catch (error) {
            log("Error setting up monitoring: " + error, "WARN");
        }
    });
}

function tryIntegrateFridaDexDump() {
    log("Checking for frida-dexdump integration...", "INFO");

    Java.perform(function() {
        try {
            var dexExports = [];
            Process.enumerateModules().forEach(function(mod) {
                mod.enumerateExports().forEach(function(exp) {
                    if (exp.name.indexOf("dex") !== -1 || exp.name.indexOf("Dex") !== -1) {
                        dexExports.push(exp);
                    }
                });
            });
            if (dexExports.length > 0) {
                log("Found " + dexExports.length + " DEX-related exports, manual dumping will be used", "INFO");
            } else {
                log("No native DEX exports found, will use Java hooks only", "INFO");
            }

        } catch (error) {
            log("frida-dexdump integration check failed, using manual dumping: " + error, "WARN");
        }
    });
}

function ensureOutputDirectory() {
    Java.performNow(function() {
        try {
            var File = Java.use("java.io.File");
            var outputDir = File.$new(CONFIG.outputDir);
            if (!outputDir.exists()) {
                outputDir.mkdirs();
                log("Created output directory: " + CONFIG.outputDir, "SUCCESS");
            }
        } catch (e) {
            log("Could not create output directory: " + e, "ERROR");
        }
    });
}

function main() {
    log("========================================", "INFO");
    log("DEX Dumping Script Starting", "INFO");
    log("========================================", "INFO");
    log("Configuration: " + JSON.stringify(CONFIG), "INFO");
    log("Output directory: " + CONFIG.outputDir, "INFO");

    ensureOutputDirectory();

    tryIntegrateFridaDexDump();

    hookDexFile();
    hookDexClassLoader();
    hookPathClassLoader();
    hookInMemoryDexClassLoader();

    if (CONFIG.dumpExisting) {
        setTimeout(function() {
            dumpExistingDexFiles();

            if (CONFIG.scanMemory) {
                setTimeout(function() {
                    scanMemoryForDexFiles();
                }, 1000);
            }
        }, 500);
    }

    monitorNewDexFiles();

    log("========================================", "INFO");
    log("Hooks installed successfully", "SUCCESS");
    log("Waiting for DEX files to be loaded...", "INFO");
    log("========================================", "INFO");

    if (typeof process !== 'undefined' && process.on) {
        process.on('exit', function() {
            log("Generating final manifest...", "INFO");
            generateManifest();
            log("Dumped " + dumpedFiles.length + " DEX files total", "INFO");
        });
    }
}

setImmediate(main);
