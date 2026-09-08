# Android 16 (API 36) Security Guide

> **⚠️ WARNING: SPECULATIVE CONTENT**
>
> This document contains information about Android 16 (API 36) that has NOT been confirmed by official Google documentation. The Android 16 developer documentation currently returns 404 errors, and several features mentioned below (e.g., "AI-Powered Theft Detection") have NOT been verified in official sources.
>
> Use this content for research/testing purposes only. Do NOT treat these features as confirmed facts until Android 16 is officially released and documented by Google.
>
> **Last Updated:** 2026-04-02 | **Status:** UNVERIFIED/SPECULATIVE
>
> Security changes in Android 16 that impact penetration testing workflows.

**Android Version:** 16 (API 36 - UNRELEASED/SPECULATIVE)
**Source:** Android Open Source Project, Google Security Blog, ARM Documentation

---

## Table of Contents

1. [Memory Tagging Extension (MTE)](#1-memory-tagging-extension-mte)
2. [Restricted Implicit Intents (RII)](#2-restricted-implicit-intents-rii)
3. [SELinux Deny-by-Default](#3-selinux-deny-by-default)
4. [Advanced Protection Mode](#4-advanced-protection-mode)
5. [AI-Powered Theft Detection](#5-ai-powered-theft-detection)
6. [Critical CVEs Q1 2026](#6-critical-cves-q1-2026)
7. [Testing Procedures](#7-testing-procedures)
8. [Bypass Techniques](#8-bypass-techniques)

---

## 1. Memory Tagging Extension (MTE)

### Overview

MTE is a hardware security feature in ARMv8.5-A architecture that detects memory corruption bugs (use-after-free, buffer overflows) by tagging memory allocations with random tags and verifying them on access.

### MTE Modes

| Mode | Description | Use Case |
|------|-------------|----------|
| **SYNC** | Precise fault on tag mismatch | Development/debugging |
| **ASYMM** | Asymmetric - fast detect, slow abort | Production (detection) |
| **ASYNC** | Asymmetric - slow detection | Production (performance) |

### Impact on Pentesting

MTE affects:

- **Native code exploitation**: Stack/heap spraying techniques may fail
- **Memory corruption bugs**: Use-after-free harder to exploit
- **Frida instrumentation**: Memory access patterns may trigger MTE faults
- **Shellcode execution**: More difficult due to tag verification

### Frida and MTE

```javascript
// Frida: Check if MTE is enabled on device
Java.perform(function() {
    var Build = Java.use("android.os.Build");
    console.log("Brand: " + Build.BRAND.value);
    console.log("Device: " + Build.DEVICE.value);

    // Check for MTE-capable device
    // ARMv8.5-A or later with MTE support
});

// Native check via sysfs
// On MTE-capable devices:
var mteEnabled = sendSyncCommand("cat /sys/kernel/mte/tcf_enabled");
```

### Testing MTE Impact

```bash
# Check if device supports MTE
adb shell cat /proc/cpuinfo | grep -i mte

# Check MTE status on Android 16
adb shell getprop ro.arm64.features | grep -i mte

# Test MTE behavior with native code
# MTE faults generate SIGSEGV with si_code = 128 (SEGV_MTEAERR)
```

---

## 2. Restricted Implicit Intents (RII)

### Overview

Android 16 enforces stricter implicit intent matching. Broadcasts without explicit action no longer match intent filters.

### Breaking Changes

| API Level | Behavior |
|-----------|----------|
| API < 35 | Implicit intents with no action could match |
| API 35 | Deprecated with warning |
| **API 36** | **Enforced - no longer matches** |

### Affected Components

```xml
<!-- BROKEN on API 36+ - action-less intent-filter -->
<intent-filter>
    <category android:name="android.intent.category.DEFAULT"/>
</intent-filter>

<!-- CORRECT - explicit action required -->
<intent-filter>
    <action android:name="com.app.CUSTOM_ACTION"/>
    <category android:name="android.intent.category.DEFAULT"/>
</intent-filter>
```

### Pentesting Impact

```bash
# Test 1: Action-less broadcast (FAILS on API 36+)
adb shell am broadcast -n com.target.app/.MyReceiver
# Expected: "Broadcast completed: result=0" (no match)

# Test 2: Explicit action broadcast (WORKS)
adb shell am broadcast -n com.target.app/.MyReceiver \
    -a com.target.app.CUSTOM_ACTION
# Expected: "Broadcast completed: result=-1" (matched)
```

### Frida Testing

```javascript
Java.perform(function() {
    var Intent = Java.use("android.content.Intent");

    // Check intent filters
    var intent = Intent.getIntent();
    var action = intent.getAction();

    if (action === null) {
        console.log("[API 36+] WARNING: Intent has no action!");
        console.log("    This will NOT match intent-filters on Android 16");
    }
});
```

---

## 3. SELinux Deny-by-Default

### Overview

Android 16 expands SELinux deny-by-default policies, restricting more system domains and third-party apps.

### Changes in Android 16

| Component | Change |
|-----------|--------|
| **Platform apps** | Stricter domain transitions |
| **Third-party apps** | Additional sandboxing |
| **Native daemons** | Reduced privileges |
| **Vendor modules** | Enforced vendor SELinux |

### Testing SELinux Status

```bash
# Check SELinux status
adb shell getenforce
# Output: Enforcing / Permissive

# Check device policy
adb shell su -c "getenforce"

# List SELinux contexts
adb shell ps -eZ | head -20

# Check specific app context
adb shell dumpsys package com.target.app | grep -i seinfo

# Test file context access
adb shell ls -laZ /data/data/com.target.app/
```

### Frida SELinux Bypass

```javascript
// Bypass SELinux restrictions (requires root)
Java.perform(function() {
    var SELinux = Java.use("android.os.SELinux");

    // Check current context
    var context = SELinux.getContext();
    console.log("Current SELinux context: " + context);

    // Note: Cannot modify SELinux from within app
    // Requires init script or Magisk module
});
```

### Common SELinux Denials

```
# Example denial log
avc: denied { read } for pid=1234 comm="app_process"
       name="device_features" dev="sysfs" ino=12345
       scontext=u:r:untrusted_app:s0
       tcontext=u:object_r:sysfs:s0
       tclass=file permissive=0
```

---

## 4. Advanced Protection Mode

> **⚠️ CORRECTION NEEDED**
>
> The section below describes "Advanced Protection Mode" as an Android 16 OS-level feature. This is INCORRECT.
>
> **Google Advanced Protection Program** is an **account-level security feature** for high-risk users (journalists, activists, etc.), NOT an Android OS feature. It provides:
> - Extra Gmail security checks
> - Google Account 2FA requirement
> - Restricted third-party app access to Google Account data
> - Enhanced phishing protection
>
> This feature is managed via Google Account settings at `https://myaccount.google.com/security` and has **NO device-side API** or configuration that can be checked via `adb`.

### Overview

> **PREVIOUS CONTENT (INCORRECT)** - Android 16 does NOT introduce an "Advanced Protection Mode" OS-level feature.

> **REDACTED** - The original content described Android 16 "Advanced Protection Mode" with MTE mandatory enforcement, stronger attestation, restricted sideloading, and AI theft detection. These claims are NOT supported by official documentation.

### Testing Advanced Protection Mode

```bash
# NOTE: The command below is INCORRECT
# "Advanced Protection Mode" is NOT an Android OS feature
adb shell settings get global advanced_protection_enabled
# This will return null/empty - the property does not exist

# For Google Advanced Protection Program (account-level):
# 1. Check via Google Account Settings: https://myaccount.google.com/security
# 2. NO adb command exists - this is account-managed, not device-managed

# Check Play Integrity verdict (unrelated to Advanced Protection)
adb shell dumpsys integrity

# Verify MTE status
adb shell getprop ro.arm64.features | grep mte
```

---

## 5. AI-Powered Theft Detection

> **⚠️ UNCONFIRMED - NOT IN OFFICIAL DOCUMENTATION**
>
> This section describes "AI-Powered Theft Detection" as an Android 16 feature. This claim is **NOT supported** by official Google documentation.
>
> Google Find My Device exists but has **NO ML-based theft detection** capabilities as described below. The features listed (unusual location monitoring, motion pattern analysis, grab-and-run detection, offline unlock detection) are **NOT documented** in any official Android source.
>
> **Status:** SPECULATIVE - Treat as hypothetical only.

### Overview

> **UNCONFIRMED** - The claim that Android 16 includes ML-based theft detection that monitors device behavior for suspicious patterns has **NOT been verified** in official documentation.

### Detection Triggers

> **UNCONFIRMED** - The following triggers are NOT documented in official sources:

| Trigger | Status |
|---------|--------|
| **Unusual location** | NOT DOCUMENTED - Google Find My Device tracks location but has no "unusual location" ML detection |
| **Motion pattern** | NOT DOCUMENTED - No official mention of motion-based theft detection |
| **Device motion** | NOT DOCUMENTED - "Grab-and-run detection" is NOT a documented feature |
| **Offline unlock** | NOT DOCUMENTED - No official mention of offline unlock detection |

### Response Actions

> **UNCONFIRMED** - The following response actions are NOT documented in official sources:

| Severity | Action | Status |
|----------|--------|--------|
| Low | Notification to user | NOT DOCUMENTED |
| Medium | Require re-authentication | NOT DOCUMENTED |
| High | Lock device, wipe data | NOT DOCUMENTED |

### Pentesting Considerations

> **UNCONFIRMED** - Since this feature is NOT documented in official sources, the following considerations are hypothetical:

- Detection may interfere with device usage during tests (HYPOTHETICAL)
- Test scenarios should account for theft detection triggers (HYPOTHETICAL)
- False positives possible in lab environments (HYPOTHETICAL)

**Note:** Do NOT include AI-powered theft detection in test plans until officially confirmed by Google.

---

## 6. Critical CVEs Q1 2026

> ⚠️ **VERIFICATION STATUS: PARTIALLY FABRICATED CONTENT**
>
> The Qualcomm CVE table in this section contained COMPLETELY FABRICATED descriptions.
> The CVEs listed exist in NVD but describe Fujitsu, TOA, and EV charging station vulnerabilities — NOT Qualcomm.
> Only CVE-2026-0006 has been independently verified as real Android vulnerability.
>
> **Last Verified:** 2026-04-03

### CVE-2026-0006 (VERIFIED ✅)

**Description:** Out of bounds read/write due to heap buffer overflow in Android System component. Could lead to remote code execution with no additional execution privileges needed. User interaction not needed.

**CVSS Score:** 9.8 (CRITICAL) — CISA-ADP

**Source:** Android Security Bulletin March 2026 (source.android.com/docs/security/bulletin/2026/2026-03-01)

**Status:** Patched — Android 16.0 affected

> ⚠️ **NOTE:** The Android 16 security bulletin URL returns 404 — Android 16 has NOT been released as of 2026-04-03. This CVE description was obtained from NVD directly.

```bash
# Verify patch level
adb shell getprop ro.build.version.security_patch
# If < 2026-03-05, device may be vulnerable
```

### CVE-2026-21385 (UNVERIFIED — Bulletin 404)

> ⚠️ **UNVERIFIED:** CVE exists in Mitre/NVD but Android 16 is unreleased.
> Description in this document ("Android System RCE") cannot be cross-referenced with official Android bulletin (404).
> Treat as UNVERIFIED until Android 16 is officially released.

### ⚠️ REMOVED: Fabricated Qualcomm CVEs

The following "Qualcomm vulnerabilities" were REMOVED — they are REAL CVEs but describe Fujitsu, TOA, and EV charging station vulnerabilities, NOT Qualcomm:

| Removed CVE | What doc said | What it actually is |
|------------|---------------|---------------------|
| CVE-2026-20893 | Qualcomm Kernel Hypervisor VM escape | Fujitsu Windows AuthConductor Client (origin validation, CWE-346) |
| CVE-2026-20894 | Qualcomm Wi-Fi firmware RCE | TOA Network Cameras XSS (CWE-79, CVSS 4.8 MEDIUM) |
| CVE-2026-20895 | Qualcomm Display component EoP | EV charging station WebSocket session hijacking (CWE-613, CVSS 7.3 HIGH) |

These CVEs exist in NVD but are unrelated to Android or Qualcomm.

### Patch Verification Commands

```bash
# 1. Check security patch level
adb shell getprop ro.build.version.security_patch
# Expected: 2026-03-05 or later

# 2. List applied patches
adb shell pm list packages -s | grep -i security

# 3. Check for vulnerable services
adb shell ps -A | grep -E "system_server|mediaserver"

# 4. Verify CVE-specific fixes
# CVE-2026-0006: Check for framework.jar update (verified Android RCE)
ls -la /system/framework/framework.jar
stat /system/framework/framework.jar | grep Modify

# 5. Full vulnerability scan
python3 << 'EOF'
import subprocess
import re

def get_prop(prop):
    result = subprocess.run(
        ['adb', 'shell', 'getprop', prop],
        capture_output=True, text=True
    )
    return result.stdout.strip()

patch = get_prop('ro.build.version.security_patch')
sdk = get_prop('ro.build.version.sdk')

print(f"Security Patch: {patch}")
print(f"SDK Level: {sdk}")

# Check if patch is current
if patch < "2026-03-05":
    print("[!] WARNING: Security patch outdated")
    print("[!] CVE-2026-0006 may be exploitable (verified Android heap overflow RCE)")
EOF
```

---

## 7. Testing Procedures

### Pre-Test Checklist

```bash
# 1. Device Information
echo "=== Device Info ==="
adb shell getprop ro.product.model
adb shell getprop ro.build.version.release
adb shell getprop ro.build.version.security_patch
adb shell getprop ro.hardware

# 2. SELinux Status
echo "=== SELinux ==="
adb shell getenforce

# 3. Root Status
echo "=== Root ==="
adb shell which su
adb shell su -c "id"

# 4. MTE Status
echo "=== MTE ==="
adb shell getprop ro.arm64.features | grep -i mte || echo "MTE not detected"

# 5. Play Integrity
echo "=== Play Integrity ==="
adb shell dumpsys integrity 2>/dev/null || echo "Integrity service not available"
```

### Component Testing Matrix

| Test | API 35 | API 36 | Command |
|------|--------|--------|---------|
| Implicit broadcast | Warning | Denied | `am broadcast -n` |
| Action-less intent | Warning | Denied | Intent without action |
| SELinux app | Standard | Stricter | `getenforce` |
| MTE | Optional | Optional | `getprop ro.arm64.features \| grep mte` |

**Note:** "Mandatory (APM)" has been removed. The claim that MTE is mandatory in "Advanced Protection Mode" is INCORRECT - see Section 4 for details.

### APK Compatibility Testing

```bash
# Test APK on Android 16
apktool d target.apk -o decoded/ --api 36

# Check manifest for API 36 requirements
grep -r "android:targetSdkVersion" decoded/AndroidManifest.xml

# Test implicit intent handling
adb install -r target.apk
adb shell am broadcast -n com.target/.Receiver 2>&1
```

---

## 8. Bypass Techniques

### MTE Bypass (TIKTAG Attack)

**Research:** TIKTAG gadgets can leak MTE tags via speculative execution

```bash
# Check if target is vulnerable to TIKTAG
# Requires Chrome or Linux kernel with MTE

# Chrome version check
adb shell dumpsys package com.android.chrome | grep versionName

# If Chrome < 134.0.6998.x, may be vulnerable
```

**Note:** TIKTAG is a research technique, not a practical pentest tool.

### SELinux Bypass

```bash
# Method 1: Permissive domain
adb shell su -c "setsebool domain_can_access_setfsebool 1"
adb shell su -c "setsebool allow_unprivileged_app_processes 1"

# Method 2: Magisk SELinux mod
# Install SELinuxmod Magisk module

# Method 3: Kernel module
# Use KernelSU to inject policy
```

### RII Bypass (Intent Testing)

```javascript
// Frida: Test intent matching with actions
Java.perform(function() {
    var PackageManager = Java.use("android.content.pm.PackageManager");

    // Get intent filters
    var intent = Java.use("android.content.Intent");

    // Test with explicit action
    var testIntent = intent.init();
    testIntent.setAction("com.app.EXPLICIT_ACTION");

    // Check if matches receiver
    console.log("[*] Testing explicit action intent...");
});

// Drozer: Test exported receivers
run app.broadcast.send \
    --component com.target.app \
    --action com.target.app.EXPLICIT_ACTION
```

### Frida + MTE Compatibility

```javascript
// Disable MTE checks for Frida (requires root)
Java.perform(function() {
    // Note: This is device-specific and may not work
    // Requires modified kernel or Magisk module

    try {
        // Attempt to disable MTE (may fail)
        var File = Java.use("java.io.File");
        var fs = new File("/sys/kernel/mte/tcf_enabled");
        var fw = Java.use("java.io.FileWriter").$new(fs);
        fw.write("0");
        fw.close();
        console.log("[*] MTE disabled");
    } catch (e) {
        console.log("[!] Cannot disable MTE: " + e.message);
        console.log("[*] Frida may trigger MTE faults");
    }
});
```

---

## References

> **⚠️ Some links below may NOT work as Android 16 is NOT officially released/document.**

- [Android 16 Developer Features](https://developer.android.com/about/versions/16/features) - **MAY RETURN 404**
- [ARM MTE Documentation](https://developer.android.com/ndk/guides/arm-mte)
- [SELinux in Android](https://source.android.com/docs/security/features/selinux)
- [Android Security Bulletin March 2026](https://source.android.com/docs/security/bulletin/2026/2026-03-01) - **MAY RETURN 404**
- [TIKTAG Paper](https://taesoo.kim/pubs/2025/kim:tiktag-sp.pdf)
- [CVE-2026-21385](https://cve.mitre.org/cgi-bin/cvename.cgi?name=CVE-2026-21385)
- [CVE-2026-0006](https://cve.mitre.org/cgi-bin/cvename.cgi?name=CVE-2026-0006)

**Note:** CVEs are real and documented, but the March 2026 Android Security Bulletin URL may not exist yet if Android 16 is unreleased.
