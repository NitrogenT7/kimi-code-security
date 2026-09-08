# Fuzzing Guide for Android Applications

**Last Updated:** 2025

This guide covers fuzzing techniques for Android applications, including native library fuzzing, Intent fuzzing, ContentProvider fuzzing, and coverage-guided fuzzing with AFL++ and other tools.

---

## Table of Contents
1. [Fuzzing Concepts](#1-fuzzing-concepts)
2. [AFL++ for Android](#2-afl-for-android)
3. [Honggfuzz Setup](#3-honggfuzz-setup)
4. [libFuzzer Integration](#4-libfuzzer-integration)
5. [Intent Fuzzing](#5-intent-fuzzing)
6. [ContentProvider Fuzzing](#6-contentprovider-fuzzing)
7. [Protocol Fuzzing](#7-protocol-fuzzing)
8. [UI/Application Fuzzing](#8-uiapplication-fuzzing)
9. [Coverage-Guided Fuzzing](#9-coverage-guided-fuzzing)
10. [Crash Triage](#10-crash-triage)

---

## 1. Fuzzing Concepts

### What is Fuzzing?

Fuzzing is an automated testing technique that provides invalid, unexpected, or random data as input to a program to find vulnerabilities.

### Fuzzing Terminology

| Term | Description |
|------|-------------|
| **Fuzzer** | Tool that generates and executes test cases |
| **Target** | Application, library, or component being fuzzed |
| **Corpus** | Initial set of valid inputs for mutation |
| **Mutation** | Process of modifying inputs to create new test cases |
| **Coverage** | Percentage of code executed by test cases |
| **Crash** | Failure or vulnerability found during fuzzing |
| **Hang** | Target stops responding but doesn't crash |

### Fuzzing Android Components

| Component | Fuzzing Target | Common Vulnerabilities |
|------------|----------------|----------------------|
| Native libraries (.so) | JNI functions, crypto operations | Buffer overflows, integer overflows |
| Activities | Intents, deep links | Intent redirection, task hijacking |
| Content Providers | query(), insert(), update(), delete() | SQL injection, path traversal |
| Broadcast Receivers | Broadcast intents | Intent injection, privilege escalation |
| Services | Bound services | Intent injection, data leakage |
| Network protocols | HTTP, socket protocols | Protocol parsing errors |

---

## 2. AFL++ for Android

### AFL++ Overview

AFL++ is an advanced fuzzer with:
- Coverage-guided fuzzing
- Genetic algorithm for input generation
- Multiple mutation strategies
- Support for multi-threaded fuzzing

### Setting up AFL++ on Android

#### Cross-Compilation

```bash
# Clone AFL++
git clone https://github.com/AFLplusplus/AFLplusplus
cd AFL++

# Cross-compile for Android
# Install NDK (use r27 or latest)
wget https://dl.google.com/android/repository/android-ndk-r27-linux.zip
unzip android-ndk-r27-linux.zip
export NDK_ROOT=$PWD/android-ndk-r27

# Configure AFL++ for Android
export CC=$NDK_ROOT/toolchains/llvm/prebuilt/linux-x86_64/bin/aarch64-linux-android21-clang
export CXX=$NDK_ROOT/toolchains/llvm/prebuilt/linux-x86_64/bin/aarch64-linux-android21-clang++

# Build AFL++
make clean
make all
```

#### Building Instrumented Target

```bash
# Compile target with AFL++ instrumentation
afl-clang -O3 -fPIE -pie target.c -o target

# Or with NDK
afl-clang -target aarch64-linux-android21 -O3 -fPIE target.c -o target

# Build shared library
afl-clang -target aarch64-linux-android21 -shared -O3 -fPIE target.c -o libtarget.so
```

### Running AFL++ on Device

#### Preparation

```bash
# Push AFL++ to device
adb push afl-fuzz /data/local/tmp/
adb push afl-cc /data/local/tmp/
adb shell chmod 755 /data/local/tmp/afl-fuzz

# Push target binary
adb push target /data/local/tmp/
adb shell chmod 755 /data/local/tmp/target

# Create corpus directory
adb shell mkdir -p /data/local/tmp/input
adb shell mkdir -p /data/local/tmp/output
```

#### Execution

```bash
# Start fuzzing
adb shell "cd /data/local/tmp && ./afl-fuzz -i input -o output -- target @@"

# Run in background
adb shell "cd /data/local/tmp && nohup ./afl-fuzz -i input -o output -- target @@ > fuzz.log 2>&1 &"

# Monitor progress
adb shell "while true; do cat /data/local/tmp/output/fuzzer_stats; sleep 10; done"
```

### AFL++ Frida Mode

#### Setup

```bash
# Install AFL++ Frida support
cd AFL++
export USE_FRIDA=1
make frida

# Build Frida mode
make
```

#### Usage

```bash
# Run AFL++ with Frida instrumentation
./afl-frida-trace.so -i input -o output -d 1000 -- com.example.app

# Or attach to running process
./afl-frida-trace.so -i input -o output -p $(pidof com.example.app) -- com.example.app
```

---

## 3. Honggfuzz Setup

### Honggfuzz Overview

Honggfuzz is:
- Security-oriented fuzzer
- Supports multiple architectures (x86, ARM, AArch64)
- Intel PT (Processor Trace) support
- Persistent mode for better performance

### Installation

```bash
# Clone honggfuzz
git clone https://github.com/google/honggfuzz
cd honggfuzz

# Install dependencies
apt-get install -y libblocksruntime-dev libunwind8-dev cmake libbfd-dev

# Build honggfuzz
make
```

### Android Setup

#### Cross-Compilation

```bash
# Build honggfuzz for Android
export ANDROID_NDK_ROOT=/path/to/ndk
make HFUZZ_CC_ANDROID=$ANDROID_NDK_ROOT/toolchains/llvm/prebuilt/linux-x86_64/bin/aarch64-linux-android21-clang
```

#### Preparing Target

```bash
# Compile target with honggfuzz instrumentation
honggfuzz -i input -- target --sanitizers

# Or with manual instrumentation
export HFUZZ_CC=clang
export HFUZZ_CXX=clang++
honggfuzz -i input -- target
```

### Running Honggfuzz on Device

```bash
# Push honggfuzz to device
adb push hfuzz /data/local/tmp/
adb push hfuzz-android /data/local/tmp/
adb chmod 755 /data/local/tmp/hfuzz

# Run fuzzing
adb shell "cd /data/local/tmp && ./hfuzz -i input -o output -- target @@"

# Monitor with web interface
# honggfuzz provides HTTP interface for monitoring
```

---

## 4. libFuzzer Integration

### libFuzzer Overview

libFuzzer is:
- In-process, coverage-guided fuzzer
- Part of LLVM
- Fast and efficient
- Easy integration with C/C++ code

### Building Target with libFuzzer

```c
// target.c
#include <stdint.h>
#include <stddef.h>

// Fuzz target entry point
int LLVMFuzzerTestOneInput(const uint8_t *data, size_t size) {
    // Process input
    if (size > 0) {
        // Call target function
        target_function(data, size);
    }
    return 0;
}
```

```bash
# Compile with libFuzzer
clang -fsanitize=fuzzer target.c -o target_fuzzer

# Or with NDK
aarch64-linux-android21-clang -fsanitize=fuzzer target.c -o target_fuzzer

# Run fuzzing
./target_fuzzer -max_len=4096 -jobs=4 -workers=4
```

### Android NDK Integration

```bash
# Set up NDK
export NDK_ROOT=/path/to/ndk

# Build with libFuzzer support
$NDK_ROOT/toolchains/llvm/prebuilt/linux-x86_64/bin/aarch64-linux-android21-clang \
  -fsanitize=fuzzer \
  -target aarch64-linux-android21 \
  target.c -o target_fuzzer

# Push to device
adb push target_fuzzer /data/local/tmp/
adb shell chmod 755 /data/local/tmp/target_fuzzer

# Run on device
adb shell /data/local/tmp/target_fuzzer
```

---

## 5. Intent Fuzzing

### Intent Fuzzing Concepts

Intent fuzzing sends malformed or unexpected intents to Android components to find:
- Intent redirection vulnerabilities
- Type confusion
- Serialization issues
- Deserialization attacks

### Manual Intent Fuzzing

#### Using ADB

```bash
# Send malformed intent
adb shell am start -a android.intent.action.VIEW \
  -d "malicious://data" \
  --es extra_key "$(python -c 'print("A"*10000)')"

# Send with oversized extras
adb shell am broadcast -a com.example.action \
  --es large_data "$(python -c 'print("X"*100000)')"

# Send with null bytes
adb shell am start -a com.example.action \
  --es null_byte "$(python -c 'import sys; sys.stdout.write("\x00"*100)')"
```

#### Intent Fuzzer Scripts

```python
# intent_fuzzer.py
import subprocess
import random

# Target components
components = [
    "com.example.app/.MainActivity",
    "com.example.app/.SecondActivity"
]

# Actions
actions = [
    "android.intent.action.VIEW",
    "com.example.action.CUSTOM"
]

# Data URIs
uris = [
    "http://example.com",
    "file:///data/data/com.example.app/file.txt",
    "content://com.example.provider/data",
    "malicious://exploit"
]

# Extra types
extra_types = [
    "--es",  # String
    "--ei",  # Integer
    "--el",  # Long
    "--ef",  # Float
]

# Generate random intents
for _ in range(1000):
    component = random.choice(components)
    action = random.choice(actions)
    uri = random.choice(uris)

    # Build intent command
    cmd = f"adb shell am start -n {component} -a {action} -d {uri}"

    # Add random extras
    for _ in range(random.randint(0, 5)):
        extra_type = random.choice(extra_types)
        key = f"extra_{random.randint(0, 1000)}"
        value = "X" * random.randint(0, 10000)
        cmd += f" {extra_type} {key} {value}"

    # Execute
    try:
        subprocess.run(cmd, shell=True, timeout=5)
    except:
        pass
```

### Automated Intent Fuzzing Tools

#### Intent Fuzzer

```bash
# Clone intent-fuzzer
git clone https://github.com/MindMac/IntentFuzzer
cd IntentFuzzer

# Install dependencies
pip3 install -r requirements.txt

# Run intent fuzzer
python3 intent_fuzzer.py -p com.example.app -t 1000
```

---

## 6. ContentProvider Fuzzing

### ContentProvider Fuzzing Concepts

ContentProvider fuzzing tests:
- SQL injection vulnerabilities
- Path traversal
- Type confusion
- Buffer overflows

### Manual Testing

#### SQL Injection Fuzzing

```bash
# Test SQL injection in query
adb shell content query --uri content://com.example.provider/users \
  --where "name = 'admin' OR 1=1--'"

# Test with union-based injection
adb shell content query --uri content://com.example.provider/users \
  --where "id = 1 UNION SELECT * FROM other_table--"

# Test with stacked queries
adb shell content query --uri content://com.example.provider/users \
  --where "id = 1; DROP TABLE users--"
```

#### Path Traversal Fuzzing

```bash
# Test path traversal
adb shell content query --uri "content://com.example.provider/../../../data/data/com.example.app/shared_prefs/config.xml"

# Test with null bytes
adb shell content query --uri "content://com.example.provider/\x00../data/data/com.example.app/file.txt"
```

### Automated Fuzzing

#### ContentProvider Fuzzer Script

```python
# content_fuzzer.py
import subprocess

target_uri = "content://com.example.provider/"

# SQL injection payloads
sql_payloads = [
    "' OR '1'='1",
    "' UNION SELECT * FROM users--",
    "1' DROP TABLE users--",
    "' OR 1=1--",
    "admin'--",
    "' OR '1'='1' UNION SELECT null,null,null--"
]

# Path traversal payloads
path_payloads = [
    "../../../etc/passwd",
    "..\\..\\..\\..\\windows\\system32\\drivers\\etc\\hosts",
    "%2e%2e%2f..%2f..%2f..%2fetc%2fpasswd",
    "\x00\x00\x00\x00"
]

# Fuzz SQL injection
for payload in sql_payloads:
    try:
        cmd = f"adb shell content query --uri {target_uri}users --where \"name = '{payload}'\""
        subprocess.run(cmd, shell=True, timeout=5)
    except:
        pass

# Fuzz path traversal
for payload in path_payloads:
    try:
        cmd = f"adb shell content query --uri {target_uri}{payload}"
        subprocess.run(cmd, shell=True, timeout=5)
    except:
        pass
```

---

## 7. Protocol Fuzzing

### HTTP Protocol Fuzzing

#### Using AFL++ for HTTP

```bash
# Create HTTP corpus
mkdir -p http_corpus
echo -e "GET / HTTP/1.1\r\nHost: example.com\r\n\r\n" > http_corpus/valid_request.txt

# Run AFL++ on HTTP client
./afl-fuzz -i http_corpus -o http_output -- http_client @@

# Or use AFL++ with Frida to intercept HTTP calls
./afl-frida-trace.so -i http_corpus -o http_output -- com.example.app
```

#### Using Boofuzz

```bash
# Install Boofuzz
pip3 install boofuzz

# Create fuzzer script
# fuzzer.py
from boofuzz import *

session = Session(target=Target(connection=SocketConnection("192.168.1.100", 8080)))

# Define HTTP request
s_initialize(name="HTTP Request")
s_block_start("Request Line", "Request-Line")
s_static(b"GET", name="Method")
s_delim(b" ", name="Space-1")
s_static(b"/", name="URI")
s_delim(b" ", name="Space-2")
s_static(b"HTTP/1.1", name="Protocol")
s_block_end()

# Add headers
s_block_start("Headers", "Headers")
s_static(b"Host: example.com\r\n", name="Host")
s_static(b"User-Agent: Boofuzz\r\n", name="User-Agent")
s_block_end()

s_static(b"\r\n", name="CRLF")

# Start fuzzing
session.fuzz()
```

### Socket Protocol Fuzzing

#### Using Boofuzz

```bash
# ⚠️ Sulley is deprecated. Use boofuzz: pip install boofuzz
pip3 install boofuzz

# Create fuzzer script
from boofuzz import *

# Define protocol
s_initialize("test_protocol")

s_static(b"\x01\x02", name="header")
s_random("data", min_length=10, max_length=1000)
s_static(b"\xff\xff", name="footer")

# Start fuzzing
session = Session(target=Target(connection=SocketConnection("192.168.1.100", 26001)))
session.connect(s_get("test_protocol"))
```

---

## 8. UI/Application Fuzzing

### Monkey Fuzzer

#### Android Monkey

```bash
# Run monkey with random events
adb shell monkey -p com.example.app -v 5000

# Specify seed for reproducibility
adb shell monkey -p com.example.app -s 12345 -v 1000

# Monitor for crashes
adb logcat | grep -i "crash|fatal|exception"

# Save monkey output
adb shell monkey -p com.example.app -v 1000 > monkey_output.txt 2>&1
```

#### Monkey Options

| Option | Description |
|---------|-------------|
| `-p` | Package name |
| `-s` | Seed number |
| `-v` | Verbosity level |
| `--throttle` | Delay between events (ms) |
| `--pct-touch` | Percentage of touch events |
| `--pct-motion` | Percentage of motion events |
| `--pct-nav` | Percentage of navigation events |
| `--pct-majornav` | Percentage of major navigation events |
| `--pct-syskeys` | Percentage of system key events |

### UI/Application Exerciser Monkey

```bash
# UI Automator documentation
# https://developer.android.com/training/testing/other-components/ui-automator
./uiautomator com.example.app --time 3600
```

### Advanced UI Fuzzing

#### Using Appium

```python
# ui_fuzzer.py
from appium import webdriver

# Connect to device
driver = webdriver.Remote('http://localhost:4723/wd/hub', {
    'platformName': 'Android',
    'deviceName': 'emulator-5554',
    'appPackage': 'com.example.app',
    'appActivity': '.MainActivity'
})

# Fuzz UI elements
for _ in range(1000):
    try:
# Find all clickable elements (Appium 2+ syntax)
from appium.webdriver.common.appiumby import AppiumBy
elements = driver.find_elements(AppiumBy.ANDROID_UIAUTOMATOR, 'new UiSelector().clickable(true)')

        if elements:
            # Click random element
            import random
            element = random.choice(elements)
            element.click()

            # Random swipe
            driver.swipe(500, 500, random.randint(0, 1000), random.randint(0, 2000))
    except:
        driver.quit()
        break
```

---

## 9. Coverage-Guided Fuzzing

### Coverage Analysis

#### Using GCOV

```c
// Compile with coverage
afl-gcc -O3 -fprofile-arcs -ftest-coverage target.c -o target

# Run target
./target @@ 2>&1

# Generate coverage report
gcov target.c

# View coverage
less target.c.gcov
```

#### Using Sanitizers

```bash
# Compile with ASAN
afl-clang -fsanitize=address target.c -o target_asan

# Compile with UBSAN
afl-clang -fsanitize=undefined target.c -o target_ubsan

# Compile with MSAN
afl-clang -fsanitize=memory target.c -o target_msan
```

### Corpus Generation

#### Seed Corpus

```bash
# Create initial corpus
mkdir -p corpus

# Add valid inputs
echo "valid input 1" > corpus/input1.txt
echo "valid input 2" > corpus/input2.txt
echo '{"key": "value"}' > corpus/input3.json

# Run fuzzer with seed corpus
./afl-fuzz -i corpus -o output -- target @@
```

#### Dictionary Attack

```bash
# Create dictionary
cat > dict.txt << EOF
POST
GET
PUT
DELETE
Authorization
Bearer
token
password
EOF

# Run fuzzer with dictionary
./afl-fuzz -i corpus -o output -x dict.txt -- target @@
```

---

## 10. Crash Triage

### Collecting Crashes

#### AFL++ Crashes

```bash
# AFL++ saves crashes to output directory
ls -la output/default/crashes/

# Analyze crash
./afl-tmin -i output/default/crashes/id:000000,sig:11,src:* -o minimized_crash

# Reproduce crash
./target @minimized_crash
```

#### Honggfuzz Crashes

```bash
# Honggfuzz saves crashes to HFUZZ_WORKSPACE
ls -la HFUZZ_WORKSPACE/

# Analyze with gdb
gdb target
(gdb) run @crash_file
```

### Crash Analysis

#### Using GDB

```bash
# Start GDB
gdb target

# Run with crash input
(gdb) run @crash_file

# Backtrace when crash occurs
(gdb) bt

# Examine registers
(gdb) info registers

# Disassemble around crash
(gdb) disassemble
```

#### Using ADB Logcat

```bash
# Monitor for crashes
adb logcat | grep -i "FATAL\|crash\|exception"

# Filter by package
adb logcat | grep "com.example.app"

# Save crash log
adb logcat -d > crash_log.txt
```

---

## Quick Reference

### Essential Commands

```bash
# AFL++ fuzzing
./afl-fuzz -i input -o output -- target @@

# Honggfuzz fuzzing
honggfuzz -i input -- target @@

# libFuzzer fuzzing
./target_fuzzer -max_len=4096 -jobs=4

# Intent fuzzing
adb shell am start -n com.example.app/.MainActivity -d "malicious://data"

# ContentProvider fuzzing
adb shell content query --uri content://com.example.provider/users \
  --where "name = 'admin' OR 1=1--'"

# Monkey fuzzing
adb shell monkey -p com.example.app -v 5000
```

### Tool Matrix

| Task | Tool | Platform |
|------|------|----------|
| Native library fuzzing | AFL++, Honggfuzz, libFuzzer | Cross-platform |
| Intent fuzzing | ADB, custom scripts | Cross-platform |
| ContentProvider fuzzing | ADB, custom scripts | Android |
| Protocol fuzzing | Boofuzz, Sulley | Cross-platform |
| UI fuzzing | Monkey, Appium | Cross-platform |

---

## References

- AFL++: https://github.com/AFLplusplus/AFLplusplus
- Honggfuzz: https://github.com/google/honggfuzz
- libFuzzer: https://llvm.org/docs/LibFuzzer.html
- Boofuzz: https://github.com/jtpereyda/boofuzz
- OWASP Mobile Top 10: https://owasp.org/www-project-mobile-top-10/

---

**Maintainer:** android-apk-audit skill
**Related Files:** native-analysis.md, attack-patterns.md, ci-cd-integration.md
**Category:** Reference Document
**Last Updated:** 2025
