---
name: android-apk-audit
description: >
  Comprehensive Android APK security audit with static analysis, dynamic instrumentation, source-to-sink tracing, IPC/component abuse analysis, and CVSS 4.0 reporting. Covers decompilation, manifest analysis, deep links and intent injection, secrets detection, crypto analysis, Frida/Objection integration, and APK repackaging. Use when user says "audit APK", "analyze android app", "mobile pentest", "APK security", "decompile APK", "android vulnerability assessment", "reverse engineer android", "modify APK", "intent injection", "deep link abuse", "bypass SSL pinning", "bypass root detection", or provides an APK for security review, decompiled Android sources, or decoded resources.
license: Apache-2.0
allowed-tools: "Bash(apktool:*) Bash(jadx:*) Bash(aapt2:*) Bash(d8:*) Bash(frida:*) Bash(objection:*) Bash(adb:*) Bash(keytool:*) Bash(zipalign:*) Bash(apksigner:*) Bash(python3:*) Bash(apkid:*) Read Write Edit Glob Grep"
metadata:
  author: DragonJAR SAS
  version: "1.5.0"
  category: mobile-security
  tags:
    - android
    - apk-audit
    - static-analysis
    - dynamic-analysis
    - frida
    - objection
    - security-pentest
    - cvss-scoring
    - reverse-engineering
    - ai-powered
    - ai-analysis
---

# Android APK Security Audit

## Overview
Deterministic 6-phase static analysis + optional dynamic confirmation workflow. Remove noise early, keep the package scope tight. Only report vulnerabilities where source, propagation, and sink are understood or clearly marked as needing dynamic confirmation.

## When to Use
- User provides an APK file for security review
- User asks to analyze decompiled Android source code
- User needs to modify or repackage an APK for testing
- User wants mobile security testing or vulnerability assessment
- User needs help testing exported components, deep links, or intent injection
- User mentions Android reverse engineering or malware analysis

## Critical Rules
1. NEVER report bare grep hits without traced context
2. ALWAYS constrain searches to the app namespace (avoid library noise)
3. STOP and report immediately if decoding fails
4. ALWAYS use imperative language in findings
5. NEVER skip validation — if unsure, mark as "Needs Dynamic Confirmation"
6. ALWAYS provide concrete PoC (adb command, Frida hook, or malicious intent)
7. NEVER duplicate findings for the same root cause

> **Quality Note**: Take your time to analyze thoroughly. Quality is more important than speed. Do not skip validation steps — a false positive is worse than a missed finding.

## Execution Model
Tools to use: bash, write, edit, read, glob, grep for core workflow.

## Toolchain Requirements
Before starting, verify these tools are installed:
- **APKTool** 3.0.1+ (`apktool --version`) — aapt2-only mode; requires Java 17+
- **JADX** 1.5.5+ (`jadx --version`)
- **Android SDK Platform Tools 36.0.2** (`adb`, `fastboot`)
- **Android SDK Build Tools 36.0.0** (`apksigner`, `zipalign`, `aapt2`, `d8`)
- **Frida** 17.9.1 (`frida --version`) — ⚠️ Frida-server on device must match frida-tools version exactly
- **Objection** 1.12.4 (`objection --version`) — Note: Objection is in maintenance mode
- **APKiD** 3.0.0 (`apkid --version`)

Run `scripts/preflight-check.sh` (bash), `scripts/preflight-check.py` (universal, JSON output), or `scripts/preflight-check.ps1` (PowerShell) to verify all tools. See `references/environment-setup.md` for installation instructions.

---

## AI-Powered Analysis

This skill includes AI-powered analysis capabilities. The AI model running this skill has built-in code analysis - use it strategically to enhance findings.

### When to Use AI
- Analyzing decompiled code for semantic vulnerabilities
- Tracing complex data flows (source-to-sink)
- Generating Proof-of-Concept exploits
- Filtering false positives from automated scans
- Understanding obfuscated code behavior
- Enhancing report quality and context

### How to Use AI
1. **Analyze specific code sections**: Don't ask AI to find ALL vulnerabilities - target specific suspicious code
2. **Provide context**: Include the full function/class, not just snippets
3. **Ask for CVSS scoring**: Request severity assessment with CVSS 4.0
4. **Verify findings**: Always validate AI findings against code and Frida testing

### AI Analysis Prompts
See `references/ai-pentesting-guide.md` for complete methodology and prompt templates.

Quick examples:
```
ANALYZE: Is this SQL injection exploitable?
Code: <vulnerable_query_with_user_input>
Context: <userId from Intent extra>

For each finding provide:
- CWE ID and CVSS 4.0 score
- Exploitation scenario
- Frida script to demonstrate (if applicable)
```

> **Reference**: `references/ai-pentesting-guide.md` - Complete AI analysis methodology

---

## Phase 0 — Decode and Detect Framework

### Decode APK
```bash
apktool d app.apk -o decoded/         # Decode resources + smali
jadx -d jadx_output app.apk           # Decompile to Java
apkid app.apk                         # Detect framework/packer
```

### Framework Detection
Identify the app's architecture early to tailor analysis.

**React Native**: `grep -r "com.facebook.react" decoded/AndroidManifest.xml` · Check for `libhermes.so` and `index.android.bundle` in assets/

**Flutter**: `grep -r "io.flutter" decoded/AndroidManifest.xml` · Check for `libflutter.so` and `assets/flutter_assets/`

**Cordova/Ionic**: `grep -r "org.apache.cordova" decoded/AndroidManifest.xml` · Check `assets/www/` for cordova.js

**Xamarin**: `grep -r "mono\|com.xamarin" decoded/AndroidManifest.xml` · Check for `libmonodroid.so`

> **Reference**: `references/hybrid-webview-frameworks.md` for complete detection scripts, Frida detection hooks, and framework-specific security considerations.

> **Cross-Platform Analysis Scripts**: Use `scripts/cross-platform/cordova-analysis.sh`, `scripts/cross-platform/flutter-analysis.sh`, `scripts/cross-platform/react-native-analysis.sh`, and `scripts/cross-platform/unity-analysis.sh` for framework-specific static analysis of Cordova/Ionic, Flutter, React Native, and Unity applications respectively. These scripts extract framework-specific metadata, identify native module usage, and highlight security considerations unique to each framework.

### Obfuscation Detection
- **ProGuard/R8**: Class names like `a.b.c`, `a$a`, `a$1`
- **DexGuard**: Additional string encryption and native methods
- **Custom obfuscation**: Unusual patterns, mixed naming schemes

> **Reference**: `references/static-analysis-patterns.md` for detailed detection patterns.

---

## Phase 1 — Attack Surface Mapping

### Analyze AndroidManifest.xml
```bash
cat decoded/AndroidManifest.xml
aapt2 dump badging app.apk
```

### Exported Components
Exported components are attack surfaces:

| Component | Exported If | Security Checks |
|-----------|-------------|-----------------|
| Activities | `android:exported="true"` | Intent filters, permission requirements |
| Services | `android:exported="true"` | Intent filters, permission requirements |
| Receivers | `android:exported="true"` | Intent filters, permission requirements |
| Providers | `android:exported="true"` | Path permissions, read/write permissions |

### Deep Link Schemes
Extract and document all deep link schemes:
```xml
<intent-filter>
    <data android:scheme="scheme" android:host="host" />
</intent-filter>
```

### Security-Relevant XML Resources
Check `res/xml/` for: `network_security_config.xml` (TLS/cleartext), file provider paths, preferences.

> **Reference**: `references/android-manifest-checklist.md` for complete 50+ manifest checks.
> **IPC / intent abuse**: see `references/intent-injection.md` and `references/pendingintent-security.md`.

---

## Phase 2 — Targeted Triage

### Scoped Grep Patterns
ALWAYS grep within the app namespace only. Use patterns from `references/static-analysis-patterns.md`:

| Category | Example Patterns | What to Look For |
|----------|------------------|------------------|
| WebView sinks | `loadUrl\(`, `evaluateJavascript` | Loading untrusted URLs |
| IPC sources | `getIntent()`, `onNewIntent()` | Unsanitized data entry |
| Intent relays | `getParcelableExtra`, `getSerializableExtra`, `startActivity\(`, `sendBroadcast\(` | Nested intent / confused deputy patterns |
| Hardcoded secrets | `password\s*=`, `api[_-]?key` | Credentials in code |
| Encoded literals | `Base64\.decode`, `"\x[0-9a-f]"` | Obfuscated strings |
| Weak crypto | `DES/`, `MD5`, `"AES/ECB"` | Insecure algorithms |
| Insecure storage | `SharedPreferences`, `MODE_WORLD_READABLE` | Unprotected data |
| Network/TLS | `TrustManager`, `X509TrustManager` | SSL validation bypass |
| Native bridges | `System\.loadLibrary`, JNI methods | Native code interfaces |

### Resource File Analysis
Check `res/values/strings.xml` for secrets:
```bash
grep -iE "(key|token|secret|password|api)" decoded/res/values/strings.xml
```

> **Reference**: `references/static-analysis-patterns.md` for 100+ grep patterns organized by vulnerability type.

---

## Phase 3 — Data Flow Tracing

### Source-to-Sink Methodology
Map data flow from untrusted sources to dangerous sinks:

#### Common Sources

| Source | Method | Example |
|--------|--------|---------|
| IPC (Activities) | `getIntent()` | Malicious intent data |
| IPC (Services) | `onStartCommand()` | Start extras |
| Deep Links | `getIntent().getData()` | URL parameters |
| WebView | `JavascriptInterface` | Untrusted JS calls |
| Network | `HttpResponse` | API responses |
| Storage | `SharedPreferences` | Stored user input |
| External | `Environment.getExternalStorageDirectory()` | File system data |

#### Common Sinks

| Sink | Method | Impact |
|------|--------|--------|
| Command Execution | `Runtime.exec()`, `ProcessBuilder` | RCE |
| WebView Load | `loadUrl()`, `loadData()` | XSS, Phishing |
| File Operations | `FileWriter`, `FileOutputStream` | Path traversal, LFI |
| IPC Broadcast | `sendBroadcast()` | Intent injection |
| Reflection | `Class.forName()`, `getMethod()` | Code execution |
| Native Calls | JNI | Native code execution |
| SQL | `SQLiteDatabase.execSQL()` | SQL injection |

### Decision Rules

| Rule | Condition | Action |
|------|-----------|--------|
| 1 | Direct flow source → sink | Report as **Likely** |
| 2 | Indirect flow via static analysis | Report as **Likely** if path clear |
| 3 | Dynamic/reflective call | Mark as **Needs Dynamic Confirmation** |
| 4 | Native boundary | Mark as **Needs Dynamic Confirmation** |
| 5 | Library code | Verify if app wraps securely |
| 6 | No sanitization | Escalate severity |

### Manual Checks Grep Misses

| Check | Why grep misses | How to verify |
|-------|----------------|---------------|
| Runtime permissions | `requestPermissions()` calls | Trace `onRequestPermissionsResult` |
| Custom permission protections | `checkPermission()` | Look for permission checks |
| Activity transitions & intent relays | `startActivity()` hides nested-intent forwarding and grant flags | Follow intent construction, `Parcelable` relays, and `FLAG_GRANT_*` usage |
| File provider paths | XML + code | Map paths to exposed content URIs |
| Content provider queries | `query()` | Trace URI construction |

> **Reference**: `references/attack-patterns.md` for modern attack vectors: intent injection, deep link abuse, WebView universal XSS, task hijacking, file provider path traversal, broadcast theft, component hijacking.

---

## Phase 4 — Dynamic Analysis (Optional)

Use when static analysis hits a wall: obfuscation, reflection, native code, runtime protections.

### Frida Integration

```bash
# Spawn app with hook
frida -U -f com.example.app -l script.js

# Attach to running process
frida -U com.example.app -l script.js
```

### Using frida-exploit-helper.py

The `frida-exploit-helper.py` script provides a convenient wrapper for Frida operations with bundled scripts and common patterns.

**When to use**: Prefer `frida-exploit-helper.py` over direct Frida CLI for:
- Bundled Frida scripts (SSL pinning bypass, root detection bypass, etc.)
- Quick memory operations (read, write, find base address)
- Discovering available scripts
- Simplified Frida workflow

**Examples with bundled scripts**:
```bash
# SSL pinning bypass
python3 scripts/frida-exploit-helper.py -p com.target.app --script ssl-pinning-bypass

# Root detection bypass
python3 scripts/frida-exploit-helper.py -p com.target.app --script root-detection-bypass

# List all available bundled scripts
python3 scripts/frida-exploit-helper.py --list-scripts

# Display app memory layout (find base addresses)
python3 scripts/frida-exploit-helper.py -p com.target.app --layout

# Hook specific functions (malloc, free, etc.)
python3 scripts/frida-exploit-helper.py -p com.target.app --hook malloc,free

# Read memory at address
python3 scripts/frida-exploit-helper.py -p com.target.app --read 0x12345678

# Write to memory address
python3 scripts/frida-exploit-helper.py -p com.target.app --write 0x12345678 --value 0x41
```

**Key flags**:
- `-p, --package` — Target package name (required)
- `-s, --script` — Use bundled script name (use `--list-scripts` to see options)
- `--list-scripts` — Display all available bundled Frida scripts
- `--layout` — Show memory layout and base addresses
- `--hook` — Comma-separated list of functions to hook
- `--read` — Read memory at specified address
- `--write` — Write value to memory address
- `--base` — Get base address of specified module

> **Reference**: See `scripts/frida-exploit-helper.py --help` for complete options and bundled script catalog.

> **Reference**: bundled Frida scripts in `assets/frida-scripts/`. See `references/frida-scripts-index.md` for the canonical catalog.
> **Focused runtime triage**: use `assets/frida-scripts/android-file-access-monitor.js` for filesystem/storage visibility, `assets/frida-scripts/jni-tracer.js` for JNI/native boundary discovery, and `assets/frida-scripts/ipc-abuse-helper.js` for passive IPC logging plus intentional provider/deep-link validation.

> **Script Maturity Levels**:
> - **STABLE**: Production-ready (`ssl-pinning-bypass.js`, `root-detection-bypass.js`, `biometric-bypass.js`, `network-interceptor.js`, etc.)
> - **BETA**: Functional but incomplete — use with caution

### JNI Trace (Native Library Tracing)

For advanced JNI and native library analysis, use `jnitrace`:

```bash
# Install jnitrace
pip install jnitrace

# Trace all JNI functions in a native library
jnitrace -l libnative-lib.so -f com.target.app

# Trace with additional options
jnitrace -l libnative-lib.so -f com.target.app \
  --ignore-vm-threads \
  --attach-after-delay=5

# Trace JNI calls from specific Java methods
jnitrace -l libnative-lib.so -f com.target.app \
  -c "com.example.app.NativeHelper.*"
```

**Programmatic usage** (via npm package):
```bash
npm install jnitrace-engine
```

Use `jnitrace` when:
- Analyzing custom JNI bindings
- Understanding native library behavior
- Debugging native crashes
- Tracing crypto operations in native code

> **Note**: `jnitrace` requires the app to be started with Frida spawn mode. For more details, see `references/native-analysis.md` and `jni-tracer.js` for an alternative Frida-based approach.

### Objection Commands

```bash
objection -g com.example.app explore

# Enumerate components
android hooking list activities
android hooking list services
android hooking list receivers

# Bypass protections
android sslpinning disable
android keystore dump
```

### ADB Runtime Testing

```bash
# Test exported activity
adb shell am start -n com.example.app/.MainActivity -a android.intent.action.VIEW -d "scheme://host"

# Test exported receiver
adb shell am broadcast -a com.example.app.ACTION -e key "value"

# Monitor logs
adb logcat | grep com.example.app
```

> **SSL Pinning bypass**: `references/dynamic-analysis-setup.md` + `assets/frida-scripts/ssl-pinning-bypass.js`
> **RASP bypass**: `references/rasp-bypass.md` + `assets/frida-scripts/native-root-detection-probe.js` for anti-debug, anti-frida, emulator detection, and native root-check escalation.

---

## Phase 5 — Classification and Reporting

### Confidence Levels

| Level | Definition | Example Evidence |
|-------|-----------|------------------|
| **Confirmed** | Full source-to-sink trace validated | Direct call chain from IPC source to `Runtime.exec()` with no sanitization |
| **Likely** | Strong evidence, minor gaps | Static trace clear but reflection obscures final sink |
| **Needs Dynamic Confirmation** | Static analysis inconclusive | Obfuscated code or native boundary requiring runtime verification |

### Severity
Use CVSS 4.0. See `references/cvss-scoring-guide.md` for complete methodology and severity mapping.

### Finding Template

```markdown
## [ID] - [Title]

**Confidence**: [Confirmed/Likely/Needs Dynamic Confirmation]
**Severity**: [Critical/High/Medium/Low] (CVSS: [X.X])
**CWE**: [CWE-ID]
**OWASP**: [OWASP Category]

### Description
[1-2 sentences explaining what the vulnerability is]

### Affected Components
- **File**: `path/to/file.java`
- **Method**: `methodName()`
- **Component**: `[Activity/Service/Receiver/Provider]` (if applicable)

### Attack Scenario
1. Attacker [action, e.g., sends malicious intent with crafted data]
2. App [processing step, e.g., extracts parameter without validation]
3. Data propagates through [call chain]
4. Reaches sink [dangerous operation]
5. Results in [impact, e.g., arbitrary command execution]

### Proof of Concept
```bash
adb shell am start -n com.example.app/.MainActivity \
  -a android.intent.action.VIEW \
  -d 'exploit://host/path?payload=cmd%7Ccat%20/data/data/com.example.app/databases/db'
```
Or provide Frida hook script for dynamic verification.

### Impact
- **Confidentiality**: [High/Medium/Low/None] — [explanation]
- **Integrity**: [High/Medium/Low/None] — [explanation]
- **Availability**: [High/Medium/Low/None] — [explanation]

### Remediation
```java
// Provide secure code example
Intent intent = getIntent();
if (intent != null && intent.getData() != null) {
    String input = intent.getData().getQueryParameter("path");
    if (isValidPath(input)) {
        loadUrl(input);
    } else {
        Log.w(TAG, "Invalid path detected");
    }
}
private boolean isValidPath(String path) {
    return path != null && !path.contains("..") &&
           path.matches("^/safe/\\w+\\.html$");
}
```

### CVSS 4.0 Calculation
[Show vector string and score breakdown]
```

### Coverage Statement
End your report with:

```
Coverage Analysis:
- Static Analysis: Complete (all decompiled sources analyzed)
- Dynamic Analysis: [Complete/Partial/Not Performed] (reason if partial)
- Scope: [com.example.app.* namespace only]
- Framework: [React Native/Flutter/Native/Standard]
- Obfuscation: [ProGuard/R8/DexGuard/Custom/None]

Limitations:
- [List any limitations, e.g., "Native code analysis requires additional tools"]
- [Any components that could not be analyzed]
- [Any findings requiring additional verification]

Total Findings: X (Critical: Y, High: Z, Medium: A, Low: B)
```

> **Reference**: `references/reporting-templates.md` for executive summary format, remediation priority matrix, and presentation templates.

### Automated Report Generation

Use the `generate-report.py` script to generate professional HTML or Markdown reports from findings JSON:

```bash
# Generate HTML report
python3 scripts/generate-report.py \
  --input findings.json \
  --output report.html \
  --app-name "My App" \
  --package-name "com.example.app"

# Generate Markdown report
python3 scripts/generate-report.py \
  --input findings.json \
  --output report.md \
  --app-name "My App" \
  --package-name "com.example.app"
```

The script supports both JSON array format and JSONL (one finding per line) and automatically:
- Sorts findings by severity (Critical first)
- Calculates CVSS 4.0 severity scores
- Generates executive summary with risk rating
- Maps OWASP MASTG categories
- Provides formatted proof of concept and remediation sections

See `scripts/test-findings.json` for the expected JSON structure.

---

## APK Modification Workflow

### 1. Decode
```bash
apktool d app.apk -o app-modified/
```

### 2. Modify — Smali Patching
Edit smali files in `app-modified/smali/`:
```smali
.method public checkSecurity()Z
    .locals 1
    # Original: iget-boolean v0, p0, Lcom/example/App;->securityEnabled:Z
    # Patched — always return true
    const/4 v0, 0x1
    return v0
.end method
```

#### Resource Modification
Edit XML or resource files in `app-modified/res/`:
```xml
<!-- Example: enable debug flag -->
<bool name="debug_mode">true</bool>
```

### 3. Rebuild
```bash
apktool b app-modified/ -o app-modified.apk
```

### 4. Sign
```bash
# Generate keystore (first time only)
keytool -genkeypair -v -keystore my-release-key.jks -alias androiddebugkey -keyalg RSA -keysize 2048 -validity 10000

# Align first
zipalign -v 4 app-modified.apk app-aligned.apk

# Sign (apksigner supports v1, v2, v3, v3.1 signatures)
# Verify keystore exists before signing
if [ ! -f "my-release-key.jks" ]; then
    echo "Error: Keystore not found. Create it with keytool first."
    exit 1
fi
apksigner sign --ks my-release-key.jks --ks-pass pass:myPassword --key-pass pass:myPassword --out app-signed.apk app-aligned.apk

# Verify signature
apksigner verify --verbose app-signed.apk
```

### 5. Install and Verify
```bash
adb install -r app-signed.apk
```

> **Reference**: `references/dynamic-analysis-setup.md` for advanced repackaging, signature verification bypass, and ADB debugging. See `references/apk-modification-guide.md` for smali editing edge cases and troubleshooting.

---

## Troubleshooting

### APK Decoding Fails
```bash
apktool d -f app.apk -o decoded/ -api 35  # Force mode with target Android API
aapt2 dump badging app.apk                # Verify APK integrity
apkid app.apk                             # Detect packer/protector
```
If packed → see `references/packing-unpacking.md` for unpacking techniques.

### JADX Shows Bad Code
```bash
jadx --show-bad-code -v app.apk           # Show code even with errors
jadx --decompilation-mode fallback app.apk
jadx-gui app.apk                          # GUI for manual inspection
```

### Frida Cannot Attach
```bash
adb shell ps -A | grep frida
adb shell getprop ro.product.cpu.abi
adb shell "su -c 'killall frida-server'"
adb shell "su -c '/data/local/tmp/frida-server -D &'"
```
> Full setup: `references/dynamic-analysis-setup.md`

### Obfuscated Code Unreadable
- Identify obfuscator: `apkid app.apk`
- Enable JADX deobfuscation: `jadx --deobf app.apk`
- See `references/static-analysis-patterns.md` → "Obfuscation Patterns"
- Switch to Phase 4 for runtime behavior

### When to Escalate to Dynamic Analysis
Static analysis reaches limits when: obfuscation unclear, reflection, JNI boundaries, anti-debug/root detection, SSL pinning. → Proceed to Phase 4 using `references/dynamic-analysis-setup.md`.

---

## Examples

### Example 1: Quick Assessment
`com.example.app.apk` → Decode → Framework detect → Manifest audit → Secrets grep → CVSS report

### Example 2: SSL Pinning Bypass
`frida -U -f com.target.app -l ssl-pinning-bypass.js` → See `references/rasp-bypass.md` if fails

### Example 3: APK Repackaging
Decode → Modify → Rebuild → Sign → Install (see `references/apk-modification-guide.md`)

---

## References Index

| Phase | Files | Phase | Files |
|-------|-------|-------|-------|
| 0 | `environment-setup`, `opencode-tooling`, `static-analysis-patterns`, `hybrid-webview-frameworks`, `kotlin-patterns`, `kotlin-async-security`, `kotlin-compose-security`, `kotlin-multiplatform-security` | 3 | `attack-patterns`, `intent-injection`, `pendingintent-security`, `firebase-security`, `deep-link-exploitation`, `real-world-android-vulnerabilities` |
| 1 | `android-manifest-checklist`, `android-version-security`, `android-14-15-security-changes`, `android-15-security-guide`, `android-16-security-guide`, `androidx-security-migration`, `secure-storage-migration` | 4 | `dynamic-analysis-setup`, `native-code-analysis`, `native-analysis`, `rasp-bypass`, `packing-unpacking`, `react-native-hermes-analysis`, `frida-version-matching-guide`, `android-keystore2-testing`, `biometric-testing-comprehensive`, `frida-advanced-patterns`, `android-anti-frida-countermeasures` |
| 2 | `dependency-analysis`, `supply-chain-security` | 5 | `cvss-scoring-guide`, `cvss-calculator`, `reporting-templates`, `finding-template-cards`, `frida-scripts-index`, `cheat-sheet-commands`, `cheat-sheet-frida-scripts` |
| Mod | `apk-modification-guide` | FW | `react-native-security`, `react-native-new-arch`, `flutter-security`, `flutter-blutter-analysis`, `jetpack-compose-security-deep-dive`, `fuzzing-guide`, `passkey-fido2-security`, `mobsf-integration` |
| CI | `automation-scripts`, `ci-cd-integration` | AI | `ai-prompts/java-security-analyzer`, `ai-prompts/native-binary-analyzer`, `ai-prompts/exploit-generator`, `ai-prompts/report-enhancer` |
| Plat | `scripts/android-15-16/android15-apis.js`, `scripts/android-15-16/passkey-test.js`, `scripts/android-15-16/privacy-sandbox-test.sh` | Ker | `android-binder-cve-2023-20938` |
| All | `mastg-quick-reference`, `mastg-best-practices`, `mastg-privacy-testing`, `quick-commands`, `quick-start-guide`, `workflow-diagram`, `cross-platform-testing-setup`, `play-integrity-api-testing`, `burp-mobsf-integration-guide` |

**Scripts**: `preflight-check.sh`, `preflight-check.py`, `preflight-check.ps1`, `auto-audit-static.sh`, `audit-android-components.sh`, `generate-report.py`, `correlate-findings.py`, `mobsf-api-scan.py`, `burp-findings-export.py`, `frida-exploit-helper.py`, `rop-helper.py`, `validate-frida-scripts.sh`, `validate-shell-scripts.sh`, `cross-platform/cordova-analysis.sh`, `cross-platform/flutter-analysis.sh`, `cross-platform/react-native-analysis.sh`, `cross-platform/unity-analysis.sh`
**Exploitation**: `exploitation-guide`, `heap-exploitation`, `exploitation-decisions`, `android-binder-cve-2023-20938`
**Assets**: Frida scripts in `assets/frida-scripts/` (see `references/frida-scripts-index.md`)

> **Loading Strategy**: Load reference files only when encountering the specific technical challenge they cover. Do NOT load all references at once.

---

## Platform-Specific Notes

> See `references/environment-setup.md` for detailed Windows (PowerShell), macOS, and Linux setup. On macOS, use `rg` (ripgrep) instead of `grep -P` — BSD grep does not support PCRE.
