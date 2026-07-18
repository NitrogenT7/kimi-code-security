# Flutter Blutter Analysis — Validated Reference

**Last Updated:** April 2026
**Status:** Verified against official sources

---

## Executive Summary

This document provides **validated, source-verified** information about Blutter and alternative tools for Flutter application reverse engineering. Key findings:

| Tool | Official Repo | Status | Support |
|------|---------------|--------|---------|
| **blutter** | `worawit/blutter` | ✅ ACTIVE | Android arm64, recent Dart |
| **reFlutter** | `Impact-I/reFlutter` | ✅ ACTIVE | Android arm64/arm32, x86_64 |

> ⚠️ **CRITICAL**: `github.com/google/blutter` does NOT exist. Blutter is a **third-party tool**, not a Google product.

---

## 1. Blutter (blutter) — Primary Recommendation

### 1.1 Official Repository

```
https://github.com/worawit/blutter
```

| Attribute | Value |
|-----------|-------|
| **Author** | Worawit Wangwarunyoo (@worawit) |
| **License** | MIT |
| **Stars** | 2.2k |
| **Forks** | 303 |
| **Language** | C++ (89.3%), Python (7.2%) |
| **Status** | ✅ ACTIVE — 106 commits, maintained |
| **OWASP Reference** | [MASTG-TOOL-0116](https://mas.owasp.org/MASTG/tools/android/MASTG-TOOL-0116/) |

### 1.2 Official Description

> *"Flutter Mobile Application Reverse Engineering Tool by Compiling Dart AOT Runtime"*

**Key capabilities (from official README):**
- Extract and analyze Dart objects
- Provide annotations for instructions, including function names or pool objects
- Static analysis — does NOT require running the app on a device
- Generates Frida script template for dynamic analysis

### 1.3 Supported Targets

| Platform | Architecture | Status |
|----------|--------------|--------|
| Android | arm64-v8a | ✅ Supported |
| Android | armeabi-v7a | ❌ Not supported |

**Dart Version Support:** Recent Dart versions only (AOT runtime compiled)

### 1.4 Environment Setup

#### Debian/Ubuntu (gcc ≥ 13)

```bash
apt install python3-pyelftools python3-requests git cmake ninja-build \
    build-essential pkg-config libicu-dev libcapstone-dev
```

#### Windows

```bash
# Install git, python 3, Visual Studio with:
# - "Desktop development with C++"
# - "C++ CMake tools"

# Run setup script
python scripts\init_env_win.py

# Open: x64 Native Tools Command Prompt
```

#### macOS (Sequoia)

```bash
brew install cmake ninja pkg-config icu4c capstone
pip3 install pyelftools requests
```

#### macOS (Ventura/Sonoma) — clang 16

```bash
brew install llvm@16 cmake ninja pkg-config icu4c capstone
pip3 install pyelftools requests
```

### 1.5 Verified Commands

#### Basic Analysis

```bash
# Extract "lib" directory from APK first
python3 blutter.py path/to/app/lib/arm64-v8a out_dir
```

> ⚠️ **NOTE**: blutter expects the **path to the `lib` directory**, NOT the `libapp.so` file directly. The tool automatically detects Dart version and builds required executables.

#### Force Rebuild

```bash
# Update and rebuild
python3 blutter.py path/to/app/lib/arm64-v8a out_dir --rebuild
```

#### Visual Studio Development

```bash
# Generate VS solution
python3 blutter.py path\to\lib\arm64-v8a build\vs --vs-sln
```

### 1.6 Output Files

| File | Description |
|------|-------------|
| `asm/*` | libapp.so assemblies with symbols |
| `blutter_frida.js` | Frida script template for target app |
| `objs.txt` | Complete nested dump of Objects from Object Pool |
| `pp.txt` | All Dart objects in Object Pool |

### 1.7 Known Limitations (from Official README)

- Only Android libapp.so (arm64)
- Only recent Dart versions
- Input as APK supported
- Obfuscated apps may have missing functions

---

## 2. reFlutter — Alternative Dynamic Analysis

### 2.1 Official Repository

```
https://github.com/Impact-I/reFlutter
```

| Attribute | Value |
|-----------|-------|
| **Author** | Impact-I |
| **PyPI Package** | `reflutter` |

### 2.2 Official Description

> *"Flutter Reverse Engineering Framework using patched Flutter library for app repacking"*

**Key Features:**
- Patched `socket.cc` for traffic monitoring and interception
- Patched `dart.cc` to print classes and method names
- Snapshot deserialization modified for dynamic analysis
- Works with both rooted and non-rooted devices (via Zygisk module)

### 2.3 Installation

```bash
# Via pip
pip install reflutter

# Or from source
git clone https://github.com/Impact-I/reFlutter
cd reFlutter
pip install .
```

### 2.4 Verified Commands

```bash
# Analyze and patch APK
reflutter target.apk

# Output:
# target_reflutter.apk  (patched with Frida instrumentation)
# patched_flutter.so    (replaced Flutter engine)
# patches/              (applied patches)
```

### 2.5 Zygisk-based Variant

For rooted Android devices:

```
https://github.com/yohanes/zygisk-reflutter
```

### 2.6 Alternative Repos

- `Impact-I/reFlutter` — fork activo mantenido

---

## 3. Flutter Reverse Engineering Comparison

### 3.1 Tool Comparison Matrix

| Feature | blutter | reFlutter |
|---------|---------|-----------|
| **Analysis Type** | Static | Dynamic |
| **Requires Running App** | No | Yes (patched APK) |
| **Android arm64** | ✅ | ✅ |
| **Android arm32** | ❌ | ✅ |
| **Android x86_64** | ❌ | ✅ |
| **Recent Dart** | ✅ | ✅ |
| **Frida Integration** | ✅ | ✅ |
| **Active Development** | ✅ | ✅ |
| **OWASP Listed** | ✅ (MASTG-TOOL-0116) | ❌ |

### 3.2 Recommended Workflow

```
1. EXTRACT APK
   └─> unzip target.apk -d extracted/

2. STATIC ANALYSIS (blutter)
   └─> python3 blutter.py extracted/lib/arm64-v8a output/
   └─> Analyze asm/*, objs.txt, pp.txt

3. DYNAMIC ANALYSIS (reFlutter)
   └─> reflutter target.apk
   └─> Install target_reflutter.apk
   └─> Run with Frida server

4. TRAFFIC INTERCEPTION
   └─> Use reFlutter patched socket.cc
   └─> Or native BoringSSL hooks
```

---

## 4. Validated Command Reference

### 5.1 APK Extraction

```bash
# Standard extraction
unzip target.apk -d extracted/

# Find Flutter files
find extracted/ -name "libapp.so" -o -name "libflutter.so"
```

### 5.2 Blutter Analysis

```bash
# Prerequisites (Debian)
apt install python3-pyelftools python3-requests git cmake ninja-build \
    build-essential pkg-config libicu-dev libcapstone-dev

# Clone and setup
git clone https://github.com/worawit/blutter
cd blutter

# Run analysis (OUT_DIR will be created)
python3 blutter.py /path/to/extracted/lib/arm64-v8a ./blutter_output

# View results
ls -la blutter_output/
cat blutter_output/objs.txt | head -100
cat blutter_output/pp.txt | head -100
cat blutter_output/blutter_frida.js
```

### 5.3 reFlutter Patched APK

```bash
# Install reflutter
pip install reflutter

# Generate patched APK
reflutter target.apk

# Install patched APK
adb install target_reflutter.apk

# Run with Frida
frida -U -f com.example.app -l your_script.js
```

### 5.4 Frida Hooks for Flutter

```javascript
// Hook MethodChannel (works with blutter-generated frida script)
Java.perform(function() {
    var MethodChannel = Java.use("io.flutter.plugin.common.MethodChannel");

    MethodChannel.invokeMethod.overload('java.lang.String', 'java.lang.Object')
        .implementation = function(method, args) {
            console.log("[MethodChannel] " + method);
            return this.invokeMethod(method, args);
        };
});

// Hook BoringSSL for traffic interception
// (Flutter uses dart:io HttpClient via BoringSSL — native hooks required)
var SSL_read = Module.findExportByName("libflutter.so", "SSL_read");
var SSL_write = Module.findExportByName("libflutter.so", "SSL_write");

if (SSL_read) {
    Interceptor.attach(SSL_read, {
        onEnter: function(args) { console.log("[SSL_read]"); }
    });
}
```

---

## 5. OWASP MASTG References

### 6.1 Official MASTG Entry

**Tool:** MASTG-TOOL-0116 — blutter
**URL:** https://mas.owasp.org/MASTG/tools/android/MASTG-TOOL-0116/

**Description (from MASTG):**
> *"blutter is an open-source tool created to support the reverse engineering of Flutter applications. Unlike other Flutter tools, blutter parses the libapp.so file statically, without requiring you to run the app on a device."*

### 6.2 MASTG Testing Workflow

The MASTG recommends:

1. **Static Analysis Phase:**
   - Extract APK and locate `libapp.so`
   - Use blutter for symbol extraction
   - Analyze with Ghidra/IDA for ARM64

2. **Dynamic Analysis Phase:**
   - Use reFlutter for patched APK
   - Hook with Frida using generated template
   - Monitor network traffic via BoringSSL hooks

---

## 6. Flutter Engine Detection

### 7.1 Official Flutter Documentation

From [Flutter docs](https://docs.flutter.dev/deployment/android):

```bash
# Detect Flutter via libflutter.so
apkanalyzer files list some-flutter-app.apk | grep flutter.so | wc -l
# Returns > 0 if Flutter app

# Detect via flutterEmbedding in manifest
apkanalyzer manifest print some-flutter-app.apk | grep flutterEmbedding -C 2
```

### 7.2 Dart Version Detection

```bash
# Check for Dart version indicators in libapp.so
strings lib/arm64-v8a/libapp.so | grep -iE "dart_|vm_|isolate_"

# Flutter embedding version
strings lib/arm64-v8a/libflutter.so | grep -iE "flutterEmbedding"
```

---

## 7. Common Errors and Solutions

| Error | Cause | Solution |
|-------|-------|----------|
| `gcc version too old` | Need gcc ≥ 13 | Use Debian unstable or compile gcc |
| `dart version not supported` | blutter doesn't have build for this Dart version | Use `--rebuild` or wait for update |
| `lib directory not found` | Passed wrong path | Use path to `lib/`, not `libapp.so` directly |
| `No output files generated` | App may be obfuscated | Obfuscated apps may produce incomplete output — use alternative methods |

---

## 8. Source Verification Checklist

Before using any tool or command, verify against these official sources:

- [x] Blutter official repo: https://github.com/worawit/blutter
- [x] reFlutter official repo: https://github.com/Impact-I/reFlutter
- [x] OWASP MASTG-TOOL-0116: https://mas.owasp.org/MASTG/tools/android/MASTG-TOOL-0116/
- [x] Flutter detection docs: https://docs.flutter.dev/deployment/android

---

## 9. Quick Reference Card

```
┌─────────────────────────────────────────────────────────────┐
│  FLUTTER REVERSE ENGINEERING — VALIDATED COMMANDS           │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  1. EXTRACT                                                 │
│     unzip app.apk -d extracted/                            │
│     find extracted/ -name "libapp.so"                       │
│                                                             │
│  2. STATIC (blutter)                                        │
│     python3 blutter.py extracted/lib/arm64-v8a output/     │
│                                                             │
│  3. DYNAMIC (reFlutter)                                     │
│     reflutter app.apk                                      │
│     adb install app_reflutter.apk                          │
│                                                             │
│  4. FRIDA HOOK                                              │
│     frida -U -f com.example -l blutter_frida.js            │
│                                                             │
│  ⚠️  blutter: worawit/blutter (NOT google/blutter)         │
└─────────────────────────────────────────────────────────────┘
```

---

## References

### Official Sources Verified ✅

1. **Blutter (worawit/blutter)**
   - Repo: https://github.com/worawit/blutter
   - OWASP: https://mas.owasp.org/MASTG/tools/android/MASTG-TOOL-0116/
   - HITB Talk: https://conference.hitb.org/hitbsecconf2023hkt/materials/D2%20COMMSEC%20-%20B(l)utter%20%E2%80%93%20Reversing%20Flutter%20Applications%20by%20using%20Dart%20Runtime%20-%20Worawit%20Wangwarunyoo.pdf

2. **reFlutter (Impact-I/reFlutter)**
   - Repo: https://github.com/Impact-I/reFlutter
   - PyPI: https://pypi.org/project/reflutter/

3. **Flutter Documentation**
   - Detection: https://docs.flutter.dev/deployment/android
   - Obfuscation: https://docs.flutter.dev/deployment/obfuscate

5. **OWASP Mobile Application Security**
   - MASTG: https://mas.owasp.org/MASTG/
   - MASVS: https://mas.owasp.org/MASVS/

### Incorrect/Unverified Sources ❌

| Source | Issue |
|--------|-------|
| `github.com/google/blutter` | Does NOT exist (404) |

---

**Document Status:** ✅ VALIDATED
**Last Validation:** April 2026
**Next Review:** When tool updates are announced
