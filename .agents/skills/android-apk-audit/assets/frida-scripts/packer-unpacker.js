/**
 * Packer Unpacker Script for Frida
 * Detects and unpacks common Android APK packers
 *
 * Usage: frida -U -f com.target.app -l packer-unpacker.js
 */

Java.perform(function() {
    console.log('=== Packer Unpacker Script Loaded ===\n');

    var CONFIG = {
        AUTO_DETECT_PACKER: true,
        DUMP_DEX: true,
        DUMP_SO: true,
        VERBOSE: true
    };

    var PACKER_SIGNATURES = {
        'bangcle': {
            libraries: ['libsecsec.so', 'libsecexe.so', 'libsecexe.main.so'],
            classes: ['com/bangcle/', 'com/secneo/'],
            name: 'Bangcle'
        },
        'jiagu': {
            libraries: ['libjiagu.so', 'libjiagu_*.so', 'libsecexe.so'],
            classes: ['com/jiagu/', 'com/qihoo/'],
            name: 'Jiagu (360)'
        },
        '360': {
            libraries: ['lib360protect.so', 'lib360safe.so'],
            classes: ['com/360/', 'com/qihoo/'],
            name: '360 Protect'
        },
        'ijiami': {
            libraries: ['libijiami.so', 'libijm_*'],
            classes: ['com/ijiami/'],
            name: 'iJiami'
        },
        'aliprotect': {
            libraries: ['libmobisec.so', 'libsgmain.so', 'libsgsecuritybody.so'],
            classes: ['com/alipay/', 'com/taobao/'],
            name: 'AliProtect'
        },
        'tencent': {
            libraries: ['libtup.so', 'libexec.so', 'libshell.so'],
            classes: ['com/tencent/', 'com/qq/'],
            name: 'Tencent Legu'
        }
    };

    var detectedPacker = null;
    var dumpedFiles = [];

    /**
     * Find package name
     */
    function findPackageName() {
        var ActivityThread = Java.use('android.app.ActivityThread');
        var currentApplication = ActivityThread.currentApplication();
        var context = currentApplication.getApplicationContext();
        return context.getPackageName();
    }

    /**
     * Detect packer from loaded libraries
     */
    function detectPacker() {
        console.log('[*] Scanning for packer signatures...\n');

        Process.enumerateModules().forEach(function(module) {
            Object.keys(PACKER_SIGNATURES).forEach(function(key) {
                var packer = PACKER_SIGNATURES[key];
                packer.libraries.forEach(function(lib) {
                    if (module.name.indexOf(lib.replace('*', '')) !== -1) {
                        detectedPacker = { key: key, name: packer.name };
                        console.log('[+] Detected packer library: ' + module.name);
                        console.log('[+] Packer identified: ' + packer.name);
                    }
                });
            });
        });

        // Also check classes in smali
        return detectedPacker;
    }

    /**
     * Dump DEX from memory
     */
    function dumpDexFromMemory() {
        if (!CONFIG.DUMP_DEX) return;

        console.log('\n[*] Scanning memory for DEX files...');

        // DEX magic: "dex\n" followed by version and null byte
        // Supported versions: 035, 037, 038, 039 (modern DEX files)
        var DEX_MAGIC_HEADER = [0x64, 0x65, 0x78, 0x0a];

        Process.enumerateRanges('r--').forEach(function(range) {
            try {
                var header = range.base.readByteArray(8);
                var magic = Array.from(new Uint8Array(header));

                // Check for DEX magic header
                var isDex = DEX_MAGIC_HEADER.every(function(byte, i) {
                    return magic[i] === byte;
                });

                if (isDex && magic.length >= 8 && magic[7] === 0) {
                    var version = String.fromCharCode(magic[4], magic[5], magic[6]);
                    var validVersions = ['035', '037', '038', '039'];

                    if (validVersions.indexOf(version) !== -1) {
                        // Read DEX header to get size (file_size is at offset 32)
                        var dexSize = Memory.readU32(range.base.add(32));
                        var fileName = '/data/data/' + findPackageName() + '/dumped_' + Date.now() + '.dex';

                        var dexBytes = range.base.readByteArray(Math.min(dexSize, range.size));
                        var FileOutputStream = Java.use('java.io.FileOutputStream');
                        var BufferedOutputStream = Java.use('java.io.BufferedOutputStream');
                        var fos = FileOutputStream.$new(fileName);
                        var bos = BufferedOutputStream.$new(fos);
                        bos.write(dexBytes);
                        bos.flush();
                        bos.close();
                        fos.close();

                        console.log('[+] Dumped DEX: ' + fileName);
                        dumpedFiles.push(fileName);
                    }
                }
            } catch (e) {}
        });
    }

    /**
     * Dump SO files
     */
    function dumpSoFiles() {
        if (!CONFIG.DUMP_SO) return;

        console.log('\n[*] Dumping suspicious SO files...');

        Process.enumerateModules().forEach(function(module) {
            if (module.name.indexOf('.so') !== -1) {
                // Check if it's packer-related
                var isPackerSO = false;
                Object.keys(PACKER_SIGNATURES).forEach(function(key) {
                    PACKER_SIGNATURES[key].libraries.forEach(function(lib) {
                        if (module.name.indexOf(lib.replace('*', '')) !== -1) {
                            isPackerSO = true;
                        }
                    });
                });

                if (isPackerSO) {
                    try {
                        var fileName = '/data/data/' + findPackageName() + '/' + module.name;
                        var moduleBytes = module.base.readByteArray(module.size);
                        var FileOutputStream = Java.use('java.io.FileOutputStream');
                        var BufferedOutputStream = Java.use('java.io.BufferedOutputStream');
                        var fos = FileOutputStream.$new(fileName);
                        var bos = BufferedOutputStream.$new(fos);
                        bos.write(moduleBytes);
                        bos.flush();
                        bos.close();
                        fos.close();

                        console.log('[+] Dumped SO: ' + fileName + ' (' + module.size + ' bytes)');
                        dumpedFiles.push(fileName);
                    } catch (e) {
                        console.log('[-] Could not dump ' + module.name + ': ' + e);
                    }
                }
            }
        });
    }

    /**
     * Hook DexClassLoader for runtime unpacking
     */
    Java.perform(function() {
        var DexClassLoader = Java.use('dalvik.system.DexClassLoader');

        DexClassLoader.$init.overload('java.lang.String', 'java.lang.String', 'java.lang.String', 'java.lang.ClassLoader').implementation = function(dexPath, optimizedDir, libPath, parent) {
            console.log('[+] DexClassLoader: ' + dexPath);

            if (dexPath) {
                var File = Java.use('java.io.File');
                var dexFile = File.$new(dexPath);
                if (dexFile.exists()) {
                    console.log('[+] DEX file exists, may need unpacking: ' + dexPath);
                }
            }

            return this.$init(dexPath, optimizedDir, libPath, parent);
        };
    });

    /**
     * Hook InMemoryDexClassLoader for in-memory unpacking
     */
    Java.perform(function() {
        try {
            var InMemoryDexClassLoader = Java.use('dalvik.system.InMemoryDexClassLoader');

            InMemoryDexClassLoader.$init.overload('[Ljava.nio.ByteBuffer;', 'java.lang.ClassLoader').implementation = function(dexBuffers, parent) {
                console.log('[+] InMemoryDexClassLoader detected - packed DEX in memory (' + dexBuffers.length + ' buffer(s))');

                try {
                    for (var i = 0; i < dexBuffers.length; i++) {
                        var buffer = dexBuffers[i];
                        var bytes = Java.array('byte', new Array(buffer.remaining()));
                        buffer.get(bytes);
                        buffer.rewind();

                        // Dump to file
                        var fileName = '/data/data/' + findPackageName() + '/inmemory_' + Date.now() + '_' + i + '.dex';
                        var FileOutputStream = Java.use('java.io.FileOutputStream');
                        var BufferedOutputStream = Java.use('java.io.BufferedOutputStream');
                        var fos = FileOutputStream.$new(fileName);
                        var bos = BufferedOutputStream.$new(fos);
                        bos.write(bytes);
                        bos.flush();
                        bos.close();
                        fos.close();

                        console.log('[+] Dumped in-memory DEX: ' + fileName);
                        dumpedFiles.push(fileName);
                    }
                } catch (e) {
                    console.log('[-] Could not dump in-memory DEX: ' + e);
                }

                return this.$init(dexBuffers, parent);
            };
        } catch (e) {
            console.log('[!] InMemoryDexClassLoader not available (Android < 8)');
        }
    });

    /**
     * Hook native unpacking stubs
     */
    function hookUnpackingStubs() {
        if (!detectedPacker) return;

        console.log('\n[*] Hooking unpacking stubs for ' + detectedPacker.name);

        // Common unpacking function names
        var unpackFunctions = [
            '_ZN6unpack*',
            'unzip',
            'extract',
            'decrypt',
            'loadDex',
            'loadClass'
        ];

        Process.enumerateModules().forEach(function(module) {
            if (module.name.indexOf('.so') !== -1) {
                module.enumerateExports().forEach(function(exp) {
                    unpackFunctions.forEach(function(func) {
                        if (exp.name.indexOf(func.replace('*', '')) !== -1) {
                            console.log('[+] Found unpacking function: ' + exp.name + ' in ' + module.name);

                            try {
                                Interceptor.attach(exp.address, {
                                    onEnter: function(args) {
                                        console.log('[+] ' + exp.name + ' called');
                                    },
                                    onLeave: function(retval) {
                                        console.log('[+] ' + exp.name + ' returned');

                                        // Check if DEX was unpacked to memory
                                        if (CONFIG.DUMP_DEX) {
                                            setTimeout(dumpDexFromMemory, 100);
                                        }
                                    }
                                });
                            } catch (e) {}
                        }
                    });
                });
            }
        });
    }

    /**
     * Main execution
     */
    setTimeout(function() {
        console.log('=== Starting Packer Detection ===\n');

        if (CONFIG.AUTO_DETECT_PACKER) {
            detectPacker();
        }

        if (detectedPacker) {
            console.log('\n[!] Warning: App is packed with ' + detectedPacker.name);
            console.log('[*] Attempting to unpack...\n');

            hookUnpackingStubs();
        }

        // Initial memory scan
        dumpDexFromMemory();
        dumpSoFiles();

        // Hook DexClassLoader for runtime dumps
        console.log('\n[*] Waiting for DEX loading...');
        console.log('[*] DEX files will be dumped automatically');
        console.log('[*] Check /data/data/<package>/ for dumped files');

    }, 2000); // Wait 2 seconds for app initialization

    console.log('=== Packer Unpacker Hooks Active ===');
});