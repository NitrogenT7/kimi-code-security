# Android APK Packing and Unpacking

This document covers DEX packing techniques, packer detection, and unpacking strategies for APK analysis.

---

## 1. Packers Overview

### What is APK Packing?

APK packing is an obfuscation and protection technique that:
- Compresses and encrypts the original DEX file
- Wraps it in a loader/unpacker stub
- Decrypts and loads the real DEX at runtime
- Makes static analysis significantly harder

### Why Packers Are Used

- **Anti-reverse engineering**: Hide business logic and secrets
- **Anti-tampering**: Prevent modification and repackaging
- **Anti-piracy**: Protect intellectual property
- **Malware evasion**: Evade antivirus detection

### Impact on Analysis

- **Decompilation fails**: JADX, apktool produce empty/garbage output
- **String obfuscation**: No readable strings visible
- **Dynamic loading**: Code only exists in memory after unpacking
- **Multi-layer protection**: Some packers use multiple encryption layers

---

## 2. Common Android Packers

### Chinese Packers

| Packer | Detection | Difficulty | Notes |
|--------|------------|------------|-------|
| **360 Jiagu** | `libjiagu.so`, `libjiagu_*.so` | Hard | Most common, multi-layer encryption |
| **Bangcle** | `libsecexe.so`, `libsecmain.so` | Medium | Popular, well-documented bypasses |
| **ijiami** | `libijiami.so` | Medium | Often found in Chinese apps |
| **Qihoo 360** | `lib360protect.so` | Hard | Similar to 360 Jiagu |
| **Tencent Legu** | `liblegen.so`, `liblegu.so` | Hard | Tencent protection |
| **AliProtect** | `libmobisec.so`, `libsgmain.so` | Hard | Alibaba protection |
| **Baidu Protect** | `libbaidu.so`, `libbdt.so` | Medium | Baidu security |
| **NetEase Protect** | `libnetease.so` | Medium | NetEase protection |

### Other Packers

| Packer | Detection | Difficulty | Notes |
|--------|------------|------------|-------|
| **DexGuard** | Commercial, detection patterns | Hard | Advanced obfuscation + packing |
| **ProGuard+Packing** | Combined protection | Medium | Basic + custom packer |
| **Arxan** | `libAppProtection.so` | Very Hard | Anti-tamper + packing |
| **Dotfuscator** | Xamarin apps | Medium | .NET obfuscator |
| **Allatori** | `allatori.xml` presence | Medium | Java obfuscator |
| **Stringer** | `stringer.xml` presence | Hard | Advanced obfuscation |

### Packer Detection Methods

```bash
# Method 1: Check for packer libraries
find decoded/lib/ -name "*.so" | grep -iE "jiagu|bangcle|ijiami|360|legu|mobisec|baidu|netease|arxan"

# Method 2: Use APKiD for packer detection
apkid app.apk

# Method 3: Check AndroidManifest for packer activities
grep -E "com.bangcle|com.secneo|com.alibaba|com.tencent" decoded/AndroidManifest.xml

# Method 4: Analyze smali for packer patterns
grep -r "DexClassLoader\|InMemoryDexClassLoader\|PathClassLoader" decoded/smali*/ | head -20

# Method 5: Check asset structure
ls -laR decoded/assets/ | grep -iE "\.dex|\.jar|encrypted|packed"

# Method 6: Look for unpacker stubs
strings decoded/lib/*/lib*.so | grep -iE "loader|unpak|decrypt|classloader"
```

---

## 3. frida-dexdump Usage

### Installation

```bash
# Install frida-dexdump
pip install frida-dexdump

# Verify installation
frida-dexdump --version

# Or use the Python module directly
python3 -m frida_dexdump --help
```

### Basic DEX Dump

```bash
# Dump DEX from running app
frida-dexdump -U -f com.example.app

# Dump with output directory
frida-dexdump -U -f com.example.app -o ./dumped_dex/

# Dump from specific PID
frida-dexdump -U -p 12345 -o ./dumped_dex/

# Dump all loaded DEX files
# Verify flags against current frida-dexdump version: frida-dexdump --help
frida-dexdump -U -f com.example.app --all

# Deep inspection mode (search memory for DEX headers)
# Verify flags against current frida-dexdump version: frida-dexdump --help
frida-dexdump -U -f com.example.app --deep
```

### Multi-DEX Handling

```bash
# Apps with multiple DEX files
# frida-dexdump automatically handles this

# Check loaded DEX count
# (Note: automated DEX count check script not yet available)
# Alternative: use aapt2 to check APK structure
aapt2 dump badging com.example.apk | grep -E "application-label|package"
# frida -U -f com.example.app -l scripts/check_dex_count.js

# Output:
# classes.dex (primary)
# classes2.dex (secondary)
# classes3.dex (tertiary)
# ... (as many as needed)

# Dump with naming
frida-dexdump -U -f com.example.app --name-pattern="{package}_{timestamp}"
```

### Memory Dump Analysis

```bash
# Search for DEX magic in memory
frida -U -f com.example.app << 'EOF'
Java.perform(function() {
    var dexCount = 0;
    var loadedDex = Java.use("dalvik.system.DexFile");

    loadedDex.loadDex.overload('java.lang.String', 'java.lang.String', 'int').implementation = function(path, optimizedDir, flags) {
        console.log("[DEX] Loading: " + path);
        dexCount++;
        return this.loadDex(path, optimizedDir, flags);
    };

    console.log("[DEX] Total DEX files loaded: " + dexCount);
});
EOF
```

### Automated Dumping Script

```bash
#!/bin/bash
# auto-dexdump.sh - Automatic DEX dumping with organization

PACKAGE="${1:?Usage: $0 <package_name>}"
OUTPUT_DIR="${2:-./dexdump_$(date '+%Y%m%d_%H%M%S')}"

echo "[*] DEX Dumper for: $PACKAGE"
echo "[*] Output: $OUTPUT_DIR"

# Create output directory
mkdir -p "$OUTPUT_DIR"

# Start app and dump DEX
echo "[*] Starting app and dumping DEX files..."
frida-dexdump -U -f "$PACKAGE" -o "$OUTPUT_DIR" --all

# Wait for dumps
sleep 5

# Analyze dumped DEX files
echo "[*] Analyzing dumped DEX files..."
for dex in "$OUTPUT_DIR"/*.dex; do
    if [ -f "$dex" ]; then
        echo "  - $(basename "$dex"): $(du -h "$dex" | cut -f1)"

        # Extract strings for quick analysis
        strings "$dex" > "$OUTPUT_DIR/$(basename "$dex" .dex)_strings.txt"

        # Count classes
        dexdump -f "$dex" 2>/dev/null | grep "Class descriptor" | wc -l > "$OUTPUT_DIR/$(basename "$dex" .dex)_class_count.txt"
    fi
done

# Generate summary
echo "[*] Generating summary..."
cat > "$OUTPUT_DIR/summary.txt" << EOF
Package: $PACKAGE
Timestamp: $(date)
DEX Files: $(ls -1 "$OUTPUT_DIR"/*.dex 2>/dev/null | wc -l)
Total Size: $(du -sh "$OUTPUT_DIR"/*.dex 2>/dev/null | tail -1 | cut -f1)

Strings Files: $(ls -1 "$OUTPUT_DIR"/*_strings.txt 2>/dev/null | wc -l)
EOF

echo "[✓] DEX dump complete: $OUTPUT_DIR"
```

---

## 4. Manual Unpacking Techniques

### 4.1 Using Frida to Hook ClassLoader

```javascript
// classloader_hook.js - Hook DexClassLoader to dump loaded DEX

Java.perform(function() {
    console.log("[*] Hooking ClassLoader...");

    // Hook DexClassLoader
    var DexClassLoader = Java.use("dalvik.system.DexClassLoader");

    DexClassLoader.$init.overload('java.lang.String', 'java.lang.String', 'java.lang.String', 'java.lang.ClassLoader').implementation = function(dexPath, optimizedDirectory, librarySearchPath, parent) {
        console.log("[+] DexClassLoader instantiated");
        console.log("    DEX Path: " + dexPath);
        console.log("    Optimized: " + optimizedDirectory);
        console.log("    Library: " + librarySearchPath);
        console.log("    Parent: " + parent);

        // Save DEX path for later dumping
        var File = Java.use("java.io.File");
        if (File.$new(dexPath).exists()) {
            console.log("    [!] DEX file exists - potential target for dumping");
            // Save path to file for later processing
            var FileWriter = Java.use("java.io.FileWriter");
            var writer = FileWriter.$new("/sdcard/dex_paths.txt", true);
            writer.write(dexPath + "\n");
            writer.close();
        }

        return this.$init(dexPath, optimizedDirectory, librarySearchPath, parent);
    };

    // Hook InMemoryDexClassLoader
    var InMemoryDexClassLoader = Java.use("dalvik.system.InMemoryDexClassLoader");

    InMemoryDexClassLoader.$init.overload('java.nio.ByteBuffer', 'java.lang.ClassLoader').implementation = function(buffer, parent) {
        console.log("[+] InMemoryDexClassLoader instantiated");
        console.log("    ByteBuffer size: " + buffer.remaining());

        // Dump ByteBuffer to file
        var FileOutputStream = Java.use("java.io.FileOutputStream");
        var timestamp = Date.now();
        var outputPath = "/sdcard/dexdump_inmemory_" + timestamp + ".dex";

        try {
            var fos = FileOutputStream.$new(outputPath);
            var bytes = Java.array('byte', buffer.array());
            fos.write(bytes);
            fos.close();
            console.log("    [+] Dumped to: " + outputPath);
        } catch (e) {
            console.log("    [-] Failed to dump: " + e);
        }

        return this.$init(buffer, parent);
    };

    console.log("[*] ClassLoader hooks installed");
});
```

### 4.2 Dumping DEX from Memory

```javascript
// memory_dex_dump.js - Advanced memory DEX dumping

var outputPath = "/sdcard/dexdump/";

Java.perform(function() {
    console.log("[*] Memory DEX Dumper Started");

    // Create output directory
    var File = Java.use("java.io.File");
    var outputDir = File.$new(outputPath);
    if (!outputDir.exists()) {
        outputDir.mkdirs();
    }

    // Method 1: Hook DexFile.loadDex
    var DexFile = Java.use("dalvik.system.DexFile");

    DexFile.loadDex.overload('java.lang.String').implementation = function(path) {
        console.log("[DEX] DexFile.loadDex: " + path);

        var result = this.loadDex(path);

        // Copy DEX file to output
        try {
            var sourcePath = path;
            var destPath = outputPath + "loaded_" + Date.now() + ".dex";

            var Files = Java.use("java.nio.file.Files");
            var Paths = Java.use("java.nio.file.Paths");

            Files.copy(Paths.get(sourcePath), Paths.get(destPath));
            console.log("[+] Dumped: " + destPath);
        } catch (e) {
            console.log("[-] Copy failed: " + e);
        }

        return result;
    };

    // Method 2: Scan memory for DEX magic
    var Process = Java.use("android.os.Process");
    var Runtime = Java.use("java.lang.Runtime");

    function scanMemoryForDex() {
        console.log("[*] Scanning memory for DEX files...");

        // Read /proc/self/maps
        var BufferedReader = Java.use("java.io.BufferedReader");
        var FileReader = Java.use("java.io.FileReader");

        try {
            var reader = BufferedReader.$new(FileReader.$new("/proc/self/maps"));
            var line;
            var dexRegions = [];

            while ((line = reader.readLine()) !== null) {
                // Look for DEX file mappings
                if (line.indexOf(".dex") !== -1 || line.indexOf("classes") !== -1) {
                    dexRegions.push(line);
                    console.log("[MEM] " + line);
                }
            }

            reader.close();
            console.log("[*] Found " + dexRegions.length + " DEX memory regions");

        } catch (e) {
            console.log("[-] Memory scan failed: " + e);
        }
    }

    // Run scan after 5 seconds
    setTimeout(function() {
        scanMemoryForDex();
    }, 5000);

    console.log("[*] Memory DEX Dumper Ready");
});
```

### 4.3 Reconstructing DEX Files

```python
#!/usr/bin/env python3
"""
dex_reconstructor.py - Reconstruct DEX from memory dumps
"""

import os
import sys
import struct
from pathlib import Path

class DEXReconstructor:
    """Reconstruct valid DEX files from memory dumps"""

    DEX_MAGIC = b'dex\n035\x00'
    DEX_MAGIC_037 = b'dex\n037\x00'

    def __init__(self, output_dir: str):
        self.output_dir = Path(output_dir)
        self.output_dir.mkdir(parents=True, exist_ok=True)

    def validate_dex_header(self, data: bytes) -> bool:
        """Validate DEX file header"""
        if len(data) < 112:
            return False

        magic = data[:8]
        return magic == self.DEX_MAGIC or magic == self.DEX_MAGIC_037

    def repair_dex_header(self, data: bytes) -> bytes:
        """Repair corrupted DEX header"""
        if len(data) < 112:
            raise ValueError("Data too small for DEX file")

        # Ensure magic
        if data[:4] != b'dex\n':
            data = self.DEX_MAGIC + data[8:]

        # Recalculate checksum
        checksum = sum(data[32:]) & 0xFFFFFFFF
        data = data[:32] + struct.pack('<I', checksum) + data[36:]

        # Recalculate SHA1 signature
        import hashlib
        sha1 = hashlib.sha1(data[32:]).digest()
        data = data[:12] + sha1 + data[32:]

        return data

    def parse_dex_header(self, data: bytes) -> dict:
        """Parse DEX header information"""
        if not self.validate_dex_header(data):
            raise ValueError("Invalid DEX header")

        header = {
            'magic': data[:8].decode('utf-8', errors='ignore'),
            'checksum': struct.unpack('<I', data[8:12])[0],
            'signature': data[12:32].hex(),
            'file_size': struct.unpack('<I', data[32:36])[0],
            'header_size': struct.unpack('<I', data[36:40])[0],
            'endian_tag': data[40:44].hex(),
            'link_size': struct.unpack('<I', data[44:48])[0],
            'link_off': struct.unpack('<I', data[48:52])[0],
            'map_off': struct.unpack('<I', data[52:56])[0],
            'string_ids_size': struct.unpack('<I', data[56:60])[0],
            'string_ids_off': struct.unpack('<I', data[60:64])[0],
            'type_ids_size': struct.unpack('<I', data[64:68])[0],
            'type_ids_off': struct.unpack('<I', data[68:72])[0],
            'proto_ids_size': struct.unpack('<I', data[72:76])[0],
            'proto_ids_off': struct.unpack('<I', data[76:80])[0],
            'field_ids_size': struct.unpack('<I', data[80:84])[0],
            'field_ids_off': struct.unpack('<I', data[84:88])[0],
            'method_ids_size': struct.unpack('<I', data[88:92])[0],
            'method_ids_off': struct.unpack('<I', data[92:96])[0],
            'class_defs_size': struct.unpack('<I', data[96:100])[0],
            'class_defs_off': struct.unpack('<I', data[100:104])[0],
            'data_size': struct.unpack('<I', data[104:108])[0],
            'data_off': struct.unpack('<I', data[108:112])[0],
        }

        return header

    def reconstruct_from_memory(self, memory_dump: bytes, output_name: str = None) -> str:
        """
        Reconstruct DEX file from memory dump.
        Memory dumps may contain multiple DEX files concatenated.
        """

        dex_files = []
        offset = 0

        while offset < len(memory_dump):
            # Search for DEX magic
            dex_start = memory_dump.find(self.DEX_MAGIC, offset)
            if dex_start == -1:
                dex_start = memory_dump.find(self.DEX_MAGIC_037, offset)

            if dex_start == -1:
                break

            # Try to find file size
            try:
                file_size = struct.unpack('<I', memory_dump[dex_start+32:dex_start+36])[0]
                dex_data = memory_dump[dex_start:dex_start+file_size]

                # Validate and repair if needed
                if self.validate_dex_header(dex_data):
                    dex_files.append(dex_data)
                else:
                    # Try to repair
                    repaired = self.repair_dex_header(dex_data)
                    if self.validate_dex_header(repaired):
                        dex_files.append(repaired)

                offset = dex_start + file_size
            except:
                offset = dex_start + 1

        # Save reconstructed DEX files
        saved_files = []
        for i, dex_data in enumerate(dex_files):
            name = output_name or f"reconstructed_{i}"
            if len(dex_files) > 1:
                name = f"{name}_{i}"

            output_path = self.output_dir / f"{name}.dex"
            output_path.write_bytes(dex_data)
            saved_files.append(str(output_path))

            # Print header info
            header = self.parse_dex_header(dex_data)
            print(f"[+] Saved: {output_path}")
            print(f"    Size: {header['file_size']} bytes")
            print(f"    Classes: {header['class_defs_size']}")
            print(f"    Methods: {header['method_ids_size']}")

        return saved_files

    def merge_dex_files(self, dex_files: list, output_name: str = "merged") -> str:
        """
        Merge multiple DEX files into single APK-like structure.
        Note: This creates a valid multi-dex APK structure.
        """

        import zipfile

        output_path = self.output_dir / f"{output_name}.apk"

        with zipfile.ZipFile(output_path, 'w', zipfile.ZIP_DEFLATED) as apk:
            # Add AndroidManifest.xml (minimal)
            manifest = b'''<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android"
    package="com.reconstructed.app">
</manifest>'''
            apk.writestr("AndroidManifest.xml", manifest)

            # Add DEX files
            for i, dex_file in enumerate(dex_files):
                name = "classes.dex" if i == 0 else f"classes{i+1}.dex"
                dex_data = Path(dex_file).read_bytes() if isinstance(dex_file, str) else dex_file
                apk.writestr(name, dex_data)

        print(f"[+] Created APK: {output_path}")
        return str(output_path)


# CLI usage
if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="DEX Reconstructor")
    parser.add_argument("input", help="Memory dump file or directory")
    parser.add_argument("-o", "--output", default="./reconstructed", help="Output directory")
    parser.add_argument("--merge", action="store_true", help="Merge into APK")

    args = parser.parse_args()

    reconstructor = DEXReconstructor(args.output)

    input_path = Path(args.input)

    if input_path.is_file():
        # Single memory dump file
        data = input_path.read_bytes()
        dex_files = reconstructor.reconstruct_from_memory(data)
    elif input_path.is_dir():
        # Directory of memory dumps
        dex_files = []
        for dump_file in input_path.glob("*.dump"):
            data = dump_file.read_bytes()
            dex_files.extend(reconstructor.reconstruct_from_memory(data, dump_file.stem))
    else:
        print(f"Error: {input_path} not found")
        sys.exit(1)

    if args.merge and dex_files:
        reconstructor.merge_dex_files(dex_files)
```

---

## 5. Packer-Specific Workflows

### 5.1 360 Jiagu Unpacking

```bash
#!/bin/bash
# 360_jiagu_unpack.sh - Unpack 360 Jiagu packed APK

APK="${1:?Usage: $0 <apk_file>}"
PACKAGE="${2:?Usage: $0 <apk_file> <package_name>}"
OUTPUT="${3:-./unpacked_$(basename $APK .apk)}"

echo "[*] 360 Jiagu Unpacker"
echo "[*] APK: $APK"
echo "[*] Package: $PACKAGE"

# Step 1: Detect 360 Jiagu
echo "[1/5] Detecting 360 Jiagu..."
if ! unzip -l "$APK" | grep -q "libjiagu"; then
    echo "[-] No 360 Jiagu detected"
    exit 1
fi
echo "[+] 360 Jiagu detected"

# Step 2: Decompile wrapper
echo "[2/5] Decompiling wrapper APK..."
apktool d "$APK" -o "$OUTPUT/wrapper" -f

# Step 3: Extract encrypted DEX
echo "[3/5] Extracting encrypted DEX..."
find "$OUTPUT/wrapper" -name "*.dex" -o -name "*.jar" | while read file; do
    echo "  - Found: $file"
    cp "$file" "$OUTPUT/"
done

# Step 4: Use Frida to dump at runtime
echo "[4/5] Preparing Frida dump script..."
cat > "$OUTPUT/dump_360.js" << 'EOF'
Java.perform(function() {
    console.log("[*] 360 Jiagu Unpacker Started");

    // Hook 360 loader
    var loader = Java.use("com.qihoo.util.loader");

    // Find the decryption key in memory
    var decryptedDex = null;

    // Hook DexClassLoader after 360 loads the real DEX
    var DexClassLoader = Java.use("dalvik.system.DexClassLoader");

    // Trigger class loads to force decryption
    setTimeout(function() {
        Java.perform(function() {
            console.log("[*] Triggering DEX load...");
            // Activity entry point usually triggers this
        });
    }, 3000);

    // Dump after delay
    setTimeout(function() {
        console.log("[*] Dumping DEX files...");
        frida_dump_dex("/sdcard/360_unpacked/");
    }, 10000);
});

function frida_dump_dex(outputPath) {
    var File = Java.use("java.io.File");
    var FileOutputStream = Java.use("java.io.FileOutputStream");

    // Create output directory
    var dir = File.$new(outputPath);
    dir.mkdirs();

    // Dump loaded DEX files
    // Implementation details...
}
EOF

echo "[5/5] Instructions:"
echo "  1. Install the APK on a rooted device/emulator"
echo "  2. Run: frida -U -f $PACKAGE -l $OUTPUT/dump_360.js"
echo "  3. DEX files will be saved to /sdcard/360_unpacked/"
echo "  4. Pull files: adb pull /sdcard/360_unpacked/ $OUTPUT/dex/"
echo ""
echo "Alternative: Use FRIDA-DEXDUMP"
echo "  frida-dexdump -U -f $PACKAGE -o $OUTPUT/dex/ --deep"

echo ""
echo "[✓] Workflow complete"
```

### 5.2 Bangcle Unpacking

```bash
#!/bin/bash
# bangcle_unpack.sh - Unpack Bangcle packed APK

APK="${1:?Usage: $0 <apk_file>}"
PACKAGE="${2:?Usage: $0 <apk_file> <package_name>}"
OUTPUT="${3:-./unpacked_$(basename $APK .apk)}"

echo "[*] Bangcle Unpacker"
echo "[*] APK: $APK"
echo "[*] Package: $PACKAGE"

# Detect Bangcle
echo "[1/4] Detecting Bangcle..."
if ! unzip -l "$APK" | grep -E "libsecexe|libsecmain"; then
    echo "[-] No Bangcle detected"
    exit 1
fi
echo "[+] Bangcle detected"

# Decompile
echo "[2/4] Decompiling..."
apktool d "$APK" -o "$OUTPUT/wrapper" -f

# Bangcle-specific Frida script
echo "[3/4] Creating Bangcle unpack script..."
cat > "$OUTPUT/unpack_bangcle.js" << 'EOF'
Java.perform(function() {
    console.log("[*] Bangcle Unpacker");

    // Bangcle uses libsecexe.so and libsecmain.so
    // The real DEX is decrypted at runtime

    // Hook SecClassLoader (Bangcle's custom ClassLoader)
    try {
        var SecClassLoader = Java.use("com.secneo.ClassLoaderWrapper.SecClassLoader");
        console.log("[+] SecClassLoader found");

        // Hook the DEX loading
        SecClassLoader.loadClass.overload('java.lang.String').implementation = function(name) {
            console.log("[LOAD] " + name);
            return this.loadClass(name);
        };
    } catch (e) {
        console.log("[-] SecClassLoader not found: " + e);
    }

    // Hook generic DexClassLoader
    var DexClassLoader = Java.use("dalvik.system.DexClassLoader");
    DexClassLoader.$init.implementation = function(dexPath) {
        console.log("[DEX] Path: " + dexPath);

        // Dump the DEX
        var File = Java.use("java.io.File");
        var Files = Java.use("java.nio.file.Files");

        try {
            var source = File.$new(dexPath);
            if (source.exists()) {
                var timestamp = Date.now();
                var dest = "/sdcard/bangcle_dump_" + timestamp + ".dex";
                Files.copy(source.toPath(), File.$new(dest).toPath());
                console.log("[+] Dumped to: " + dest);
            }
        } catch (e) {
            console.log("[-] Dump failed: " + e);
        }

        return this.$init.apply(this, arguments);
    };

    console.log("[*] Hooks installed. Dump after app fully loads.");
});

// Dump after 10 seconds
setTimeout(function() {
    console.log("[*] Dumping all loaded DEX...");
    // frida-dexdump does this better
}, 10000);
EOF

echo "[4/4] Instructions:"
echo "  1. Install: adb install $APK"
echo "  2. Run Frida: frida -U -f $PACKAGE -l $OUTPUT/unpack_bangcle.js"
echo "  3. Or use frida-dexdump: frida-dexdump -U -f $PACKAGE --deep -o $OUTPUT/dex/"
```

### 5.3 ijiami Unpacking

```bash
#!/bin/bash
# ijiami_unpack.sh - Unpack ijiami packed APK

APK="${1:?Usage: $0 <apk_file>}"
PACKAGE="${2:?Usage: $0 <apk_file> <package_name>}"

echo "[*] ijiami Unpacker"

# Detect
if ! unzip -l "$APK" | grep -q "libijiami"; then
    echo "[-] No ijiami detected"
    exit 1
fi

# ijiami stores encrypted DEX in assets
echo "[+] ijiami detected"
echo "[*] Encrypted DEX usually in: assets/ijiami.dat or similar"
echo ""
echo "[*] Unpacking strategy:"
echo "  1. Runtime dumping with frida-dexdump"
echo "  2. Hook libijiami.so decryption routines"
echo "  3. Memory forensics after app loads"
echo ""
echo "Run:"
echo "  frida-dexdump -U -f $PACKAGE --deep -o ./ijiami_dump/"
```

### 5.4 Generic Packer Workflow

```javascript
// generic_unpacker.js - Detect and unpack any packer

/*
Generic Packer Unpacker
=======================
This script detects and unpacks most common Android packers.
It works by:
1. Detecting packer signatures in native libraries
2. Hooking all ClassLoader variants
3. Dumping DEX files as they're loaded
4. Saving memory regions containing DEX magic
*/

var OUTPUT_DIR = "/sdcard/unpacked_dex/";

Java.perform(function() {
    console.log("[*] Generic Packer Unpacker Started");
    console.log("[*] Output: " + OUTPUT_DIR);

    // Create output directory
    var File = Java.use("java.io.File");
    var outputDir = File.$new(OUTPUT_DIR);
    outputDir.mkdirs();

    // Detect packer from native libraries
    function detectPacker() {
        console.log("\n[*] Detecting packer...");

        var ApplicationInfo = Java.use("android.content.pm.ApplicationInfo");
        var context = Java.use("android.app.ActivityThread").currentApplication().getApplicationContext();
        var appInfo = context.getApplicationInfo();
        var nativeLibraryDir = appInfo.nativeLibraryDir;

        console.log("[*] Library dir: " + nativeLibraryDir);

        // Check for packer signatures
        var packerSignatures = {
            "360_jiagu": ["libjiagu.so", "libjiagu_"],
            "bangcle": ["libsecexe.so", "libsecmain.so"],
            "ijiami": ["libijiami.so"],
            "tencent_legu": ["liblegen.so", "liblegu.so"],
            "ali_protect": ["libmobisec.so", "libsgmain.so"],
            "qihoo": ["lib360protect.so"],
            "baidu": ["libbaidu.so", "libbdt.so"],
            "netease": ["libnetease.so"],
            "arxan": ["libAppProtection.so"]
        };

        var libDir = File.$new(nativeLibraryDir);
        var files = libDir.listFiles();

        var detectedPackers = [];

        files.forEach(function(file) {
            var name = file.getName();

            for (var packer in packerSignatures) {
                for (var i = 0; i < packerSignatures[packer].length; i++) {
                    if (name.indexOf(packerSignatures[packer][i]) !== -1) {
                        console.log("[+] Detected packer: " + packer + " (" + name + ")");
                        detectedPackers.push({
                            name: packer,
                            library: name
                        });
                    }
                }
            }
        });

        if (detectedPackers.length === 0) {
            console.log("[-] No known packer detected (may be custom or unknown)");
        }

        return detectedPackers;
    }

    // Dump DEX file
    function dumpDex(dexPath, label) {
        console.log("[*] Dumping DEX: " + dexPath);

        try {
            var Files = Java.use("java.nio.file.Files");
            var Paths = Java.use("java.nio.file.Paths");
            var timestamp = Date.now();

            var destPath = OUTPUT_DIR + label + "_" + timestamp + ".dex";

            Files.copy(Paths.get(dexPath), Paths.get(destPath));

            console.log("[+] Dumped: " + destPath);
            return destPath;
        } catch (e) {
            console.log("[-] Dump failed: " + e);
            return null;
        }
    }

    // Hook all ClassLoader variants
    function hookClassLoader() {
        console.log("\n[*] Hooking ClassLoader variants...");

        // DexClassLoader
        try {
            var DexClassLoader = Java.use("dalvik.system.DexClassLoader");
            DexClassLoader.$init.overload('java.lang.String', 'java.lang.String', 'java.lang.String', 'java.lang.ClassLoader').implementation = function(dexPath, optimizedDirectory, librarySearchPath, parent) {
                console.log("[DexClassLoader] Path: " + dexPath);
                dumpDex(dexPath, "dexclassloader");
                return this.$init(dexPath, optimizedDirectory, librarySearchPath, parent);
            };
            console.log("[+] DexClassLoader hooked");
        } catch (e) {
            console.log("[-] DexClassLoader hook failed: " + e);
        }

        // PathClassLoader
        try {
            var PathClassLoader = Java.use("dalvik.system.PathClassLoader");
            PathClassLoader.$init.overload('java.lang.String', 'java.lang.ClassLoader').implementation = function(dexPath, parent) {
                console.log("[PathClassLoader] Path: " + dexPath);
                dumpDex(dexPath, "pathclassloader");
                return this.$init(dexPath, parent);
            };
            console.log("[+] PathClassLoader hooked");
        } catch (e) {
            console.log("[-] PathClassLoader hook failed: " + e);
        }

        // InMemoryDexClassLoader
        try {
            var InMemoryDexClassLoader = Java.use("dalvik.system.InMemoryDexClassLoader");
            InMemoryDexClassLoader.$init.overload('java.nio.ByteBuffer', 'java.lang.ClassLoader').implementation = function(buffer, parent) {
                console.log("[InMemoryDexClassLoader] Buffer size: " + buffer.remaining());

                // Dump ByteBuffer
                try {
                    var timestamp = Date.now();
                    var destPath = OUTPUT_DIR + "inmemory_" + timestamp + ".dex";
                    var bytes = Java.array('byte', buffer.array());
                    var FileOutputStream = Java.use("java.io.FileOutputStream");
                    var fos = FileOutputStream.$new(destPath);
                    fos.write(bytes);
                    fos.close();
                    console.log("[+] Dumped: " + destPath);
                } catch (e) {
                    console.log("[-] ByteBuffer dump failed: " + e);
                }

                return this.$init(buffer, parent);
            };
            console.log("[+] InMemoryDexClassLoader hooked");
        } catch (e) {
            console.log("[-] InMemoryDexClassLoader hook failed: " + e);
        }

        // DexFile
        try {
            var DexFile = Java.use("dalvik.system.DexFile");
            DexFile.loadDex.overload('java.lang.String').implementation = function(path) {
                console.log("[DexFile] Loading: " + path);
                dumpDex(path, "dexfile");
                return this.loadDex(path);
            };
            console.log("[+] DexFile hooked");
        } catch (e) {
            console.log("[-] DexFile hook failed: " + e);
        }
    }

    // Memory scan for DEX files
    function scanMemoryForDex() {
        console.log("\n[*] Scanning memory for DEX files...");

        // Read /proc/self/maps
        try {
            var BufferedReader = Java.use("java.io.BufferedReader");
            var FileReader = Java.use("java.io.FileReader");
            var reader = BufferedReader.$new(FileReader.$new("/proc/self/maps"));
            var line;
            var count = 0;

            while ((line = reader.readLine()) !== null) {
                if (line.indexOf(".dex") !== -1 || line.indexOf("classes") !== -1) {
                    console.log("[MEM] " + line);
                    count++;
                }
            }

            reader.close();
            console.log("[*] Found " + count + " DEX memory regions");
        } catch (e) {
            console.log("[-] Memory scan failed: " + e);
        }
    }

    // Run detection
    var packers = detectPacker();
    hookClassLoader();

    // Delayed memory scan
    setTimeout(function() {
        scanMemoryForDex();

        console.log("\n[*] Unpacker ready. DEX files will be dumped as they load.");
        console.log("[*] Check " + OUTPUT_DIR + " for dumped files.");
        console.log("[*] Run 'adb pull " + OUTPUT_DIR + " .' after app loads.");
    }, 5000);
});

/*
Usage:
  frida -U -f com.example.app -l generic_unpacker.js

After running:
  1. Let the app fully load
  2. Navigate all screens
  3. Pull dumped files: adb pull /sdcard/unpacked_dex/ .
  4. Analyze with JADX: jadx dumped_dex/classes.dex
*/
```

---

## 6. Post-Unpacking Analysis

### Validating Unpacked DEX

```bash
#!/bin/bash
# validate_dex.sh - Validate dumped DEX files

DEX_DIR="${1:-./dumped_dex}"

echo "DEX File Validator"
echo "=================="

for dex in "$DEX_DIR"/*.dex; do
    if [ -f "$dex" ]; then
        echo ""
        echo "Analyzing: $(basename "$dex")"
        echo "----------"

        # Check DEX magic
        MAGIC=$(hexdump -C "$dex" | head -1 | grep "dex" | awk '{print $2}')
        if [ "$MAGIC" = "64" ]; then
            echo "[+] Valid DEX magic"
        else
            echo "[-] Invalid DEX magic"
        fi

        # Check file size vs header size
        HEADER_SIZE=$(hexdump -C "$dex" | grep "00000020" | awk '{print $5$6$7$8}' | tac -rs '..')
        # Cross-platform file size check: Linux: stat -c%s; macOS: stat -f%z
        if [[ "$OSTYPE" == "darwin"* ]]; then
            FILE_SIZE=$(stat -f%z "$dex")
        else
            FILE_SIZE=$(stat -c%s "$dex")
        fi
        echo "    Header size: 0x$HEADER_SIZE"
        echo "    File size: $FILE_SIZE bytes"

        # Count classes
        CLASS_COUNT=$(dexdump -f "$dex" 2>/dev/null | grep "Class descriptor" | wc -l)
        echo "    Classes: $CLASS_COUNT"

        # Extract strings for quick analysis
        STRING_COUNT=$(strings "$dex" | wc -l)
        echo "    Strings: $STRING_COUNT"

        # Check for packer signatures
        if strings "$dex" | grep -qi "bangcle\|jiagu\|ijiami\|legu\|mobisec"; then
            echo "    [!] Packer signatures found"
        fi
    fi
done

echo ""
echo "Validation complete"
```

### Deobfuscation Considerations

After unpacking, the DEX may still be obfuscated:

```bash
# 1. Use JADX with deobfuscation
jadx -d output --deobf --deobf-min 1 --deobf-max 999999 unpacked.dex

# 2. Use Dex2Jar + Procyon
d2j-dex2jar unpacked.dex -o unpacked.jar
procyon -jar unpacked.jar -o decompiled/

# 3. Use JEB (commercial) for advanced deobfuscation
# jeb unpacked.dex

# 4. Manual deobfuscation patterns
# Identify obfuscated classes:
grep -r "a/b/c/d/e" output/ --include="*.java" | head -20

# Use deobfuscation maps (if available):
# jadx --deobf --deobf-use-sourcename unpacked.dex

# 5. Dynamic analysis to trace execution
frida -U -f com.example.app -l trace_execution.js
```

### Multi-DEX Reconstruction

```python
#!/usr/bin/env python3
"""
rebuild_multidex.py - Rebuild multi-dex APK from dumped files
"""

import os
import sys
import zipfile
from pathlib import Path

def rebuild_apk(dex_dir: str, output_apk: str):
    """Rebuild APK from dumped DEX files"""

    dex_files = sorted(Path(dex_dir).glob("*.dex"))

    if not dex_files:
        print("No DEX files found")
        return

    print(f"[*] Found {len(dex_files)} DEX files")

    with zipfile.ZipFile(output_apk, 'w', zipfile.ZIP_DEFLATED) as apk:
        # Add minimal AndroidManifest.xml
        manifest = b'''<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android"
    package="com.reconstructed.app"
    android:versionCode="1"
    android:versionName="1.0">
    <application android:label="Reconstructed" />
</manifest>'''
        apk.writestr("AndroidManifest.xml", manifest)

        # Add DEX files
        for i, dex_file in enumerate(dex_files):
            name = "classes.dex" if i == 0 else f"classes{i+1}.dex"
            apk.writestr(name, dex_file.read_bytes())
            print(f"[+] Added: {name}")

    print(f"[✓] Rebuilt APK: {output_apk}")
    print(f"[*] Analyze with: jadx {output_apk}")

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python rebuild_multidex.py <dex_dir> [output.apk]")
        sys.exit(1)

    dex_dir = sys.argv[1]
    output_apk = sys.argv[2] if len(sys.argv) > 2 else "reconstructed.apk"
    rebuild_apk(dex_dir, output_apk)
```

---

## Summary

### Quick Reference

| Task | Command |
|------|---------|
| **Detect packer** | `apkid app.apk` |
| **Basic DEX dump** | `frida-dexdump -U -f com.example.app` |
| **Deep DEX scan** | `frida-dexdump -U -f com.example.app --deep` (verify flags: `frida-dexdump --help`) |
| **Hook ClassLoader** | `frida -U -f com.example.app -l classloader_hook.js` |
| **Dump memory DEX** | `frida -U -f com.example.app -l memory_dex_dump.js` |
| **Generic unpacker** | `frida -U -f com.example.app -l generic_unpacker.js` |
| **Validate DEX** | `hexdump -C classes.dex \| head -1` |
| **Rebuild APK** | `python rebuild_multidex.py ./dex_dump/ output.apk` |

### Packer-Specific Notes

| Packer | Key Library | Strategy |
|--------|-------------|----------|
| **360 Jiagu** | libjiagu.so | Hook DexClassLoader, dump after loading |
| **Bangcle** | libsecexe.so | Hook SecClassLoader, intercept DEX path |
| **ijiami** | libijiami.so | Check assets/ for encrypted DEX, runtime dump |
| **Tencent Legu** | liblegen.so | Hook after native init, dump memory |
| **AliProtect** | libmobisec.so | Hook ClassLoader, deep memory scan |
| **Arxan** | libAppProtection.so | Very hard, may need emulator with Frida gadget |

### Best Practices

1. **Always dump at runtime**: Static analysis fails on packed DEX
2. **Use frida-dexdump**: Most reliable for general cases
3. **Try deep scan**: Memory scanning finds hidden DEX
4. **Validate dumps**: Check DEX magic and file size
5. **Rebuild for analysis**: Create valid APK from dumps
6. **Consider dynamic**: Unpacked code may still be obfuscated