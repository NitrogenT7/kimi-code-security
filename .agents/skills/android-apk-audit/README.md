# Android APK Security Audit Skill

[![License](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](LICENSE)
[![Version](https://img.shields.io/badge/version-1.5.0-green.svg)](https://github.com/DragonJAR/Android-Pentesting-Skill/blob/main/SKILL.md)
[![Author](https://img.shields.io/badge/author-DragonJAR%20SAS-orange.svg)](https://www.DragonJAR.org)
[![Español](https://img.shields.io/badge/read%20in-Espa%C3%B1ol-blue.svg)](README.es.md)

> Comprehensive Android APK security audit skill for AI agents. Performs static analysis, dynamic instrumentation, source-to-sink tracing, and generates CVSS 4.0 reports.

## 🎯 What This Skill Does

This skill transforms an AI agent into an **Android security auditor** capable of:

- **Decompiling and analyzing APKs** — JADX, APKTool, APKiD integration
- **Detecting vulnerabilities** — 50+ security patterns, OWASP Mobile Top 10 aligned
- **Testing IPC/component abuse** — Intent injection, deep links, PendingIntent, FileProvider misuse
- **Tracing data flows** — Source-to-sink methodology with confidence levels
- **Bypassing protections** — SSL pinning, root detection, RASP, native checks, packers
- **Modifying APKs** — Smali patching, resource editing, repackaging
- **Generating reports** — CVSS 4.0 scoring, MASTG mapping, professional templates

## 📦 Installation

### Option 1: Clone into Agent Skills Directory

```bash
# For Claude Code / OpenCode agents
cd ~/.agents/skills/
git clone https://github.com/DragonJAR/Android-Pentesting-Skill android-apk-audit

# For other agents, place in your skills directory
```

### Option 2: Install Globally

```bash
# Clone to any location
git clone https://github.com/DragonJAR/Android-Pentesting-Skill.git

# Add to your agent's skill path configuration
```

## ⚙️ Prerequisites

The skill expects these tools to be installed:

| Tool | Version | Purpose |
|------|---------|---------|
| APKTool | 3.0.1+ | APK decoding/rebuilding (aapt2-only mode) |
| JADX | 1.5.5+ | Java/Kotlin decompilation |
| Android SDK | Platform 36+, Build 36+ | adb, aapt2, zipalign, apksigner |
| Frida | 17.9+ | Dynamic instrumentation |
| Objection | 1.12.4+ | Mobile exploration (maintenance mode) |
| APKiD | 3.0.0+ | Framework detection |

### Verification

Run the preflight check to verify all dependencies:

```bash
./scripts/preflight-check.sh
```

Or use the Python version for cross-platform compatibility:

```bash
python3 scripts/preflight-check.py
```

PowerShell variant for Windows environments:

```powershell
./scripts/preflight-check.ps1
```

## 🚀 Usage Examples

### Example 1: Basic APK Audit

**User prompt:**
```
Audit this APK: /path/to/app.apk
```

**Agent response:**
```
I'll analyze the APK for security vulnerabilities.

[Phase 0] Decoding APK with APKTool...
[Phase 1] Analyzing AndroidManifest.xml...
[Phase 2] Running targeted security patterns...
[Phase 3] Tracing data flows...
[Phase 5] Generating findings report...

Found 3 issues:
1. [HIGH] Exported Activity Without Permission (M8: Security Misconfiguration)
2. [MEDIUM] Hardcoded API Key (M1: Improper Credential Usage)
3. [LOW] Debug Logging Enabled (M8: Security Misconfiguration)
```

### Example 2: SSL Pinning Bypass

**User prompt:**
```
The app has SSL pinning. Bypass it with Frida and intercept traffic.
```

**Agent response:**
```
I'll use the SSL pinning bypass script to intercept HTTPS traffic.

[1] Identifying SSL pinning implementation...
    Found: OkHttp3 CertificatePinner
[2] Loading Frida script: ssl-pinning-bypass.js
[3] Hooking CertificatePinner.check()
[4] SSL pinning bypassed. Traffic now decrypted.

Intercepted request:
POST /api/login
{"email": "user@example.com", "password": "secret123"}
```

### Example 3: React Native Analysis

**User prompt:**
```
Analyze this React Native APK for hardcoded secrets in the JavaScript bundle.
```

**Agent response:**
```
[Phase 0] Detected React Native framework (libhermes.so found)
[Phase 0] Extracting JavaScript bundle from assets/index.android.bundle
[Phase 2] Scanning for secrets in JavaScript bundle...

Found 2 hardcoded secrets:
- API_KEY = "sk_live_abc123..." at bundle.js:4521 (M1: Improper Credential Usage)
- AWS_SECRET = "wJalrXUtnFEMI/K7MDENG..." at bundle.js:8912 (M1: Improper Credential Usage)
```

### Example 4: APK Modification

**User prompt:**
```
Disable the root detection in this APK and repackage it.
```

**Agent response:**
```
[1] Decoding APK with APKTool...
[2] Locating root detection code...
    Found: com/app/security/RootDetector.checkRoot()
[3] Patching smali to return false...
    const/4 v0, 0x0  # Always return false
[4] Rebuilding with APKTool...
[5] Aligning with zipalign...
[6] Signing with apksigner...
[7] Verifying signature...

Modified APK ready: app_patched.apk
SHA-256: abc123def456...
```

### Example 5: Flutter Analysis

**User prompt:**
```
Analyze this Flutter APK. I need to intercept HTTPS traffic from the app.
```

**Agent response:**
```
[Phase 0] Detected Flutter framework (libflutter.so found)
[Phase 0] Flutter uses BoringSSL natively - Java SSL hooks won't work
[Phase 0] Using Blutter to extract Dart code: python3 blutter.py lib/arm64-v8a/
[Phase 4] Loading Frida script: native-hook.js (BoringSSL targets)
[Phase 4] Hooking SSL_CTX_set_custom_verify() for certificate bypass
[Phase 4] Hooking SSL_read/SSL_write() for traffic interception

Flutter traffic now intercepted and decrypted.
```

## 📖 Skill Capabilities

### Static Analysis (Phases 0-3)

| Capability | Description |
|------------|-------------|
| APK Decompilation | JADX for Java/Kotlin, APKTool for smali/resources |
| Framework Detection | React Native, Flutter, Cordova, Xamarin, Native |
| Obfuscation Analysis | ProGuard/R8, DexGuard, custom patterns |
| Manifest Analysis | 50+ security checks for exported components, permissions, deep links |
| IPC / Intent Abuse | Intent injection, nested intent relays, PendingIntent, FileProvider, deep link pivot patterns |
| Secrets Detection | API keys, passwords, tokens in code and resources |
| Data Flow Tracing | Source-to-sink methodology with confidence levels |

### Dynamic Analysis (Phase 4)

| Capability | Description |
|------------|-------------|
| Frida Scripts | 30 scripts for hooking, bypass, interception, and native triage |
| SSL Pinning Bypass | 30+ implementations (OkHttp, TrustManager, WebView, React Native, Flutter) |
| Root Detection Bypass | 30+ root packages, 80+ paths, native hooks (fopen, access, stat) plus a focused native root detection probe |
| RASP Bypass | APK integrity, debug/emulator detection, Frida evasion |
| Crypto Interception | Monitor Cipher, MessageDigest, Mac, Signature operations |
| Biometric Bypass | BiometricPrompt, FingerprintManager, crypto-object binding |
| Keystore Inspection | List entries, extract metadata, check security flags |
| Network Interception | OkHttp chains, HttpURLConnection, WebSocket monitoring |
| Native Hooking | JNI_OnLoad, RegisterNatives, by-offset hooks, and library-load-aware native probes |

### Frida Exploit Helper
```bash
# List available bundled scripts
python3 scripts/frida-exploit-helper.py --list-scripts

# Hook memory functions
python3 scripts/frida-exploit-helper.py -p com.target.app --hook malloc,free

# Use bundled SSL pinning bypass script
python3 scripts/frida-exploit-helper.py -p com.target.app --script ssl-pinning-bypass

# Memory layout analysis
python3 scripts/frida-exploit-helper.py -p com.target.app --layout
```

### APK Modification

| Capability | Description |
|------------|-------------|
| Smali Patching | Modify Dalvik bytecode directly |
| Resource Editing | Change XML, strings, configurations |
| Static Pinning Tampering | Override `network_security_config`, replace pins, bundled certs, or `BKS/JKS` truststores |
| Repackaging | Rebuild, align, sign with correct flow: zipalign → apksigner |

### Reporting (Phase 5)

| Capability | Description |
|------------|-------------|
| CVSS 4.0 Scoring | FIRST.org compliant severity ratings |
| OWASP MASTG Mapping | Test IDs and MASVS categories |
| Professional Templates | Executive summary, findings, remediation |

## 🔧 Skill Structure

```
Android-Pentesting-Skill/
├── SKILL.md                              # Skill definition (Phases 0-5)
├── references/                           # 69 reference documents
│   ├── attack-patterns.md                # OWASP M1-M10 patterns
│   ├── intent-injection.md               # Nested intent / confused deputy guide
│   ├── pendingintent-security.md         # PendingIntent abuse and hardening
│   ├── dynamic-analysis-setup.md         # Frida/Objection + SSL pinning playbook
│   ├── frida-scripts-index.md            # Canonical bundled script catalog
│   ├── cvss-scoring-guide.md             # CVSS 4.0 methodology
│   ├── reporting-templates.md            # Finding templates
│   ├── flutter-security.md               # Flutter security guide
│   ├── react-native-security.md          # React Native security guide
│   ├── android-keystore2-testing.md      # Keystore2 testing (Android 12+)
│   ├── biometric-testing-comprehensive.md # BiometricPrompt testing
│   ├── deep-link-exploitation.md         # Deep link attacks
│   └── ... (55 more)
├── assets/frida-scripts/                 # 37 Frida scripts
│   ├── ssl-pinning-bypass.js             # SSL pinning bypass
│   ├── root-detection-bypass.js          # Root detection bypass
│   ├── native-root-detection-probe.js    # Focused native root/RASP triage
│   ├── native-hook.js                    # Generic JNI / native helper
│   ├── biometric-bypass.js               # Biometric auth bypass
│   ├── network-interceptor.js            # HTTP/HTTPS interception
│   ├── crypto-intercept.js               # Crypto operations hooking
│   └── ... (23 more)
├── scripts/                              # Utility and validation scripts
│   ├── preflight-check.sh                # Bash dependency verification
│   ├── preflight-check.py                 # Cross-platform dependency verification
│   ├── preflight-check.ps1               # PowerShell dependency verification
│   ├── auto-audit-static.sh             # Static audit automation (Phases 0-3)
│   ├── audit-android-components.sh       # Component security audit
│   ├── generate-report.py                 # Report generation
│   ├── correlate-findings.py             # Correlate findings from multiple tools
│   ├── mobsf-api-scan.py                 # MobSF API integration
│   ├── burp-findings-export.py           # Burp Suite findings export
│   ├── frida-exploit-helper.py          # Exploitation helper
│   ├── rop-helper.py                     # ROP gadget finder
│   ├── validate-frida-scripts.sh         # Frida script validation
│   ├── validate-shell-scripts.sh        # Shell script validation
│   └── test-findings.json               # Sample report input
├── scripts/cross-platform/               # Framework-specific analysis
│   ├── cordova-analysis.sh
│   ├── flutter-analysis.sh
│   ├── react-native-analysis.sh
│   └── unity-analysis.sh
├── scripts/android-15-16/                 # Android 15/16 specific scripts
│   ├── android15-apis.js                 # Android 15 API testing
│   ├── passkey-test.js                   # Passkey/FIDO2 testing
│   └── privacy-sandbox-test.sh           # Privacy Sandbox testing
└── references/ai-prompts/                 # AI-powered analysis prompts
    ├── java-security-analyzer.md         # Java code analysis prompts
    ├── native-binary-analyzer.md          # Native binary analysis prompts
    ├── exploit-generator.md              # Exploit PoC generation prompts
    └── report-enhancer.md                # Report enhancement prompts
```

## 🎓 Trigger Phrases

The skill activates when the user says:

- "audit this APK"
- "analyze android app"
- "mobile pentest"
- "APK security"
- "decompile APK"
- "android vulnerability assessment"
- "reverse engineer android"
- "modify APK"
- "bypass SSL pinning"
- "bypass root detection"
- "intent injection"
- "deep link abuse"

## ⚠️ Limitations

1. **Dynamic analysis requires a device or emulator** — Frida needs a running Android system
2. **Some packers require manual unpacking** — DexGuard 9+, Arxan may need interactive debugging
3. **Android 14+ restrictions** — Certain Intent behaviors require explicit `-n package/activity` flags
4. **Frida version matching** — frida-server on device must match frida-tools on host exactly
5. **Flutter uses BoringSSL natively** — Java SSL hooks don't work, need native hooks

## 📚 Standards Alignment

This skill is aligned with:

- **OWASP MASTG** — Mobile Application Security Testing Guide
- **OWASP MASVS** — Mobile Application Security Verification Standard
- **OWASP Mobile Top 10 2024** — Top 10 mobile risks
- **CVSS 4.0** — Common Vulnerability Scoring System

## 🔐 OWASP Mobile Top 10 (2024)

| ID | Category |
|----|----------|
| M1 | Improper Credential Usage |
| M2 | Inadequate Supply Chain Security |
| M3 | Insecure Authentication/Authorization |
| M4 | Insufficient Input/Output Validation |
| M5 | Insecure Communication |
| M6 | Inadequate Privacy Controls |
| M7 | Insufficient Binary Protections |
| M8 | Security Misconfiguration |
| M9 | Insecure Data Storage |
| M10 | Insufficient Cryptography |

## 🤝 Contributing

Contributions are welcome! Please see the [references/](references/) directory for areas that need expansion.

## 📄 License

Apache License 2.0 — See [LICENSE](LICENSE) for details.

## 👨‍💻 Author

**DragonJAR SAS** — [https://www.DragonJAR.org](https://www.DragonJAR.org)

[Experts in IT security services, proactive validation, and offensive security.](https://www.dragonjar.org/servicios-de-seguridad-informatica)

---

**⚠️ Disclaimer:** This skill is intended for **authorized security testing only**. Users must obtain proper authorization before conducting any security assessment. The authors are not responsible for misuse of this tool.