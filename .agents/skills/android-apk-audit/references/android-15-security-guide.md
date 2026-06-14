---
name: android-15-security
description: Comprehensive security testing skill for Android 15 (API 35) and Android 16 (API 36). Covers Privacy Sandbox, Passkeys/FIDO2, Private Space, Partial Photo Access, Restricted Profiles, MTE, APK Signature v3.1, and new platform security changes. Activate with triggers: "Android 15", "Android 16", "passkeys", "privacy sandbox", "MTE testing", "restricted profiles", "AI security", "Android API 35", "Android API 36", "private space", "photo picker bypass".
compatibility: Standalone (requires Frida, Android SDK 35/36, and frida-tools)
allowed-tools: "Bash, WebFetch, Frida (frida, frida-ps, frida-trace)"
metadata:
  author: DragonJar Security Team
  version: 1.0.0
  category: offensive-security
  tags: [android, mobile-pentest, api-35, api-36, privacy-sandbox, passkeys, fido2, mte, apk-signing]
---

# Android 15/16 Security Testing Skill

## IDENTITY

Specialist agent for Android 15 (API 35) and Android 16 (API 36) security assessments. Performs deep-dive analysis of new platform security features, privacy controls, credential management, and emerging attack surfaces introduced in Android 15/16. Targets pentesters, bug bounty hunters, and security researchers evaluating Android 15+ devices and applications.

## FIRST ACTION — READ CONTEXT

```bash
cd /Users/jaimearestrepo/Proyectos/Android-Pentesting-Skill
cat SESSION_CONTEXT.md 2>/dev/null || echo "No session context"
ls -la scripts/android-15-16/ 2>/dev/null || echo "Scripts directory ready"
```

## TRIGGERS DE ACTIVACIÓN

Se activa automáticamente cuando el usuario menciona:
- "Android 15 security", "Android 16 security"
- "API 35 testing", "API 36 testing"
- "passkeys", "FIDO2", "WebAuthn"
- "Privacy Sandbox", "privacy-sandbox-api"
- "Private Space Android"
- "Partial Photo Access", "photo picker bypass"
- "MTE testing", "Memory Tagging Extension"
- "APK Signature v3.1"
- "Restricted Profiles", "work profiles Android"
- "Gemini Nano security", "AI on-device"
- "FLAG_SECURE bypass"
- "android 15 breaking changes", "android 16 breaking changes"

## DEPENDENCIAS

### Herramientas obligatorias
- **Frida** (>= 16.0): `npm install -g frida frida-tools`
- **Android SDK** (API 35/36): Descargar via Android Studio SDK Manager
- **apktool** o **jadx**: Para decompilación
- **objection**: Runtime mobile exploration

### Scripts incluidos
- `scripts/android-15-16/android15-apis.js`: Hooks para nuevas APIs de Android 15/16
- `scripts/android-15-16/passkey-test.js`: Testing de Passkeys/FIDO2/WebAuthn
- `scripts/android-15-16/privacy-sandbox-test.sh`: Privacy Sandbox API enumeration

###Instalación de dependencias
```bash
# Instalar Frida
npm install -g frida frida-tools

# Verificar versión
frida --version

# Instalar frida-server en dispositivo Android
adb push frida-server /data/local/tmp/
adb shell "chmod 755 /data/local/tmp/frida-server"
adb shell "/data/local/tmp/frida-server &"

# Verificar conexión
frida-ps -U
```

## INSTRUCCIONES DE USO

### FLUJO PRINCIPAL

```
┌─────────────────────────────────────────────────────────────┐
│  1. ORIENTATION          │  2. TARGET ANALYSIS             │
│  ─────────────────────    │  ───────────────────────────    │
│  • Identify Android ver   │  • Decompile APK                │
│  • Check API level        │  • Identify new API usage        │
│  • Map attack surface     │  • Map Privacy Sandbox usage     │
│                           │  • Map passkey/fido2 usage       │
├───────────────────────────┼─────────────────────────────────┤
│  3. STATIC ANALYSIS       │  4. DYNAMIC ANALYSIS            │
│  ─────────────────────     │  ───────────────────────────     │
│  • Analyze manifest       │  • Frida instrumentation         │
│  • Find new permissios    │  • Hook new APIs                │
│  • Audit new APIs         │  • Bypass privacy controls      │
│  • Check APK signing      │  • Test credential extraction    │
├───────────────────────────┼─────────────────────────────────┤
│  5. SECURITY TESTING       │  6. REPORTING                   │
│  ─────────────────────     │  ───────────────────────────     │
│  • Privacy Sandbox fuzz   │  • CVSS 4.0 scoring             │
│  • Passkey extraction     │  • Evidence collection          │
│  • Cross-profile leak     │  • Remediation recommendations │
│  • MTE bypass attempts    │  • References to CVEs          │
└───────────────────────────┴─────────────────────────────────┘
```

### PASO 1: IDENTIFICACIÓN DE VERSIÓN

```bash
# Identificar versión de Android del dispositivo
adb shell getprop ro.build.version.release
adb shell getprop ro.build.version.sdk

# Identificar API level exacto
adb shell getprop ro.build.version.preview_sdk

# Kernel supports MTE?
adb shell "cat /proc/cpu/maa" 2>/dev/null || echo "MTE not available"
```

### PASO 2: ANÁLISIS ESTÁTICO DEL APK

```bash
# Decompilar APK
apktool d target.apk -o decompiled/

# Analizar AndroidManifest.xml (buscar nuevas APIs)
grep -E "(privacySandbox|useFramework|passkey|fido2|PRIVATE_SPACE)" decompiled/AndroidManifest.xml

# Buscar usages de nuevas APIs
grep -r "Landroid/privacySandbox" decompiled/smali/ | head -50
grep -r "Landroid/credentials" decompiled/smali/ | head -50
grep -r "Landroid/service/gmshell" decompiled/smali/ | head -50

# AnalizarPrivacy Sandbox SDK ads
find decompiled/ -name "*.so" -type f | xargs strings | grep -i "privacy_sandbox" | head -20
```

### PASO 3: ANÁLISIS DINÁMICO CON FRIDA

#### Hook para nuevas APIs Android 15/16
```bash
# Cargar hooks de android15-apis.js
frida -U -f com.target.app -l scripts/android-15-16/android15-apis.js --no-pause

# En otra terminal, monitorear output
frida-trace -U -f com.target.app -i "*privacySandbox*" -i "*credentials*"
```

#### Hook para Passkeys/FIDO2
```bash
# Testing de passkey storage y biometric gates
frida -U -f com.target.app -l scripts/android-15-16/passkey-test.js --no-pause

# Monitorear WebAuthn operations
frida-trace -U -f com.target.app -i "*fido2*" -i "*authenticator*"
```

### PASO 4: TESTING DE PRIVACY SANDBOX

```bash
# Enumerar Privacy Sandbox packages
adb shell pm list packages | grep -i privacy_sandbox

# Enumerar SDK ads registrados
adb shell sdk_attestation

# Launch privacy sandbox testing script
./scripts/android-15-16/privacy-sandbox-test.sh com.target.app
```

### PASO 5: TESTING DE PRIVATE SPACE (Android 16)

```bash
# Verificar si Private Space está habilitado
adb shell dumpsys privacy_manager

# Intentar enumerate apps en Private Space
adb shell pm list packages --user 999  # Private Space user ID

# Hook para detectar acceso a Private Space
frida -U -f com.target.app -l scripts/android-15-16/android15-apis.js -P "privateSpace=true"
```

### PASO 6: TESTING DE RESTRICTED PROFILES

```bash
# Listar profiles
adb shell pm list users

# Intentar acceso cross-profile
adb shell am start --user 0 com.target.app
adb shell am start --user 10 com.target.app  # Restricted profile

# Hook para data leakage detection
frida -U -f com.target.app -l scripts/android-15-16/android15-apis.js -P "crossProfile=true"
```

## ANDROID 15 BREAKING CHANGES (API 34 → 35)

### Permisos removidos
| Permiso removido | Reemplazo | Impacto |
|-----------------|-----------|---------|
| READ_EXTERNAL_STORAGE | READ_MEDIA_IMAGES (granular) | Photo access more restricted |
| WRITE_EXTERNAL_STORAGE | No replacement | Apps must use scoped storage |
| READ_CONTACTS | READ_CONTACTS (now GET_ACCOUNTS removed) | Account enumeration blocked |

### APIs deprecated/removidas
- `ActivityManager.getRecentTasks()` - COMPLETAMENTE REMOVIDO
- `AppRestrictionObserver` - Background restrictions усилены
- `DevicePolicyManager.getRemoveWarning()` - Work profile warnings changed

### Nuevas APIs de privacy
```java
// Partial Photo Access (Android 14+)
MediaStore.Images.Media.fetchThumbnails()
PhotoPickerFragment.ResultCallback

// Privacy Sandbox
PrivacySandboxManager.getDeclaredPackageScore()
PrivacySandboxManager.startNotice()

// Private Space (Android 16)
UserManager.createUserHandle()
UserManager.LIFECYCLE_EVENT_PRIVATE_SPACE_CHANGED
```

## ANDROID 16 BREAKING CHANGES (API 35 → 36)

### Nuevas restricciones
- **Private Space**: Apps pueden ser movidas a espacio privado con PIN/biométrico
- **Screen Privacy**: Content hidden in screenshots will be stricter
- **MTE Mandatory on some devices**: ARM v8.5-A memory tagging
- **APK Signature v3.1**: New signing scheme with better key rotation

### APIs nuevas
```java
// Private Space APIs
UserManager.createPrivateSpace()
UserHandle.PRIVATE_SPACE_USER_ID  // = 999

// AI Security (Gemini Nano)
AiCoreManager.getInstance()
AiSession.create()
// NEW: AI data handling callbacks

// Screen Privacy
WindowManager.isContentHidden()
WindowManager.setContentHidden()
```

## CVSS 4.0 VULNERABILITY TEMPLATES

### Template para hallazgos Android 15/16

```
## [FINDING-N] [SEVERITY] - [Vulnerability Title]

**Severity**: CVSS 4.0 [X.X]
**Vector**: CVSS:4.0/AV:[A]/AC:[L]/PR:[L]/UI:[N]/SB:[S]/SC:[N]/SI:[N]/SA:[N]
**Confianza**: [High/Medium/Low]
**CVEs related**: CVE-XXXX-XXXXX

### Descripción
[Brief description of the vulnerability in Android 15/16 context]

### Affected Component
- Package: [package name]
- API Level: [35/36]
- Feature: [Privacy Sandbox/Passkeys/Private Space/etc]

### Proof of Concept
[Step-by-step exploitation with Frida/adb commands]

### Impact
[Security impact with specific Android 15/16 considerations]

### Remediación
[Google's recommended fix + implementation guidance]

### Referencias
- https://source.android.com/docs/core/permissions/android-15-changes
- https://developer.android.com/about/versions/15/changes
- https://developer.android.com/about/versions/16/changes
```

## INPUT FORMAT

### Estructura de sesión de testing

```
TARGET_APP=com.example.targetapp
TARGET_VERSION=Android 15 (API 35)
TESTING_SCOPE=[full|privacy|credentials|profile|sandbox]
OUTPUT_FORMAT=[json|markdown]
```

### Artifactos de entrada
- **APK file**: Ruta al APK a analizar
- **Package name**: Identifier de la app
- **Android version**: Versión objetivo del SO
- **Testing focus**: Áreas específicas a testar

## OUTPUT FORMAT

### JSON Output Structure
```json
{
  "engagement": {
    "target": "com.example.app",
    "android_version": "15",
    "api_level": 35,
    "testing_focus": ["privacy_sandbox", "passkeys"],
    "timestamp": "ISO-8601"
  },
  "findings": [
    {
      "id": "AND15-001",
      "title": "Privacy Sandbox SDK data exfiltration",
      "severity": "HIGH",
      "cvss40": 7.8,
      "cvss_vector": "CVSS:4.0/AV:N/AC:L/...",
      "confidence": "HIGH",
      "affected_apis": ["PrivacySandboxManager.getDeclaredPackageScore"],
      "poc": ["frida command", "output"],
      "remediation": "Disable ads personalization..."
    }
  ],
  "enumeration_results": {
    "privacy_sandbox_sdks": ["com.sdk.ads", "com.sdk.analytics"],
    "passkey_credentials": 3,
    "private_space_aware": false,
    "mte_supported": true
  }
}
```

### Markdown Report Structure
```markdown
# Android 15/16 Security Assessment Report

## Executive Summary
[High-level findings overview]

## Scope
- Target: [package]
- Android Version: [15/16]
- API Level: [35/36]
- Assessment Date: [date]

## Methodology
1. Static Analysis
2. Dynamic Analysis (Frida)
3. Privacy Sandbox Testing
4. Credential Security Assessment

## Findings
### [AND15-001] [HIGH] Privacy Sandbox Data Leakage

**CVSS 4.0**: 7.8

**Description**:...

**Proof of Concept**:...
```

## FRIDA SCRIPTS REFERENCE

### android15-apis.js — Hook Categories

| Category | Hooked APIs | Purpose |
|----------|-------------|---------|
| Privacy Sandbox | `PrivacySandboxManager.getDeclaredPackageScore()` | Enumerate SDK scores |
| Privacy Sandbox | `PrivacySandboxManager.startNotice()` | Detect notice triggers |
| Credentials | `CredentialManager.getCredential()` | Passkey access monitoring |
| Credentials | `BiometricAuthenticator.authenticate()` | Biometric gate bypass |
| Private Space | `UserManager.createPrivateSpace()` | Detect private space creation |
| Photo Access | `PhotoPickerFragment.*` | Partial photo access bypass |
| Screen Privacy | `Window.setFlags(FLAG_SECURE)` | Detect screenshot protection |

### passkey-test.js — FIDO2/WebAuthn Testing

| Function | Hook Target | Security Check |
|----------|-------------|----------------|
| `createPublicKeyCredential()` | Fido2Api.createCredential() | Credential creation |
| `getPublicKeyCredential()` | Fido2Api.getCredential() | Credential retrieval |
| `assertionPromise()` | WebAuthnBroker.authenticate() | Authentication flow |
| `BioPromptHandler` | BiometricAuthentication | Biometric bypass |

### privacy-sandbox-test.sh — Testing Commands

```bash
# List registered Privacy Sandbox packages
adb shell pm list packages --user 0 | grep -E "(sandbox|adsdk)"

# Get package attestation scores
adb shell dumpsys privacy_sandbox

# Test SDK-to-SDK communication
adb shell am start -n com.target.app/.MainActivity
```

## ERROR HANDLING

### Common Issues

| Error | Cause | Resolution |
|-------|-------|------------|
| `frida-server not running` | Device disconnected | `adb shell "/data/local/tmp/frida-server &"` |
| `API not found in trace` | Wrong API level | Verify device SDK version |
| `Permission denied` | SELinux enforced | `adb shell "su -c '...'"` |
| `Hook failed` | App anti-Frida | Use `frida --unpin` or `-C` mode |

### Fallback Procedures

```bash
# If Frida fails, use objection
objection -g com.target.app run

# If static analysis inconclusive, use backup method
jadx -d decompiled_backup target.apk

# If hooks fail on protected apps
frida -U -f com.target.app -C --no-pause -s android15-apis.js
```

## PRIVACY SANDBOX TESTING METHODOLOGY

### Phase 1: SDK Enumeration
```bash
# Find all privacy sandbox aware packages
adb shell pm list packages -s | grep -v system

# Get detailed package info
adb shell dumpsys package com.sdk.ads | grep -A5 "privacySandbox"
```

### Phase 2: API Surface Analysis
```bash
# Hook all PrivacySandboxManager methods
frida-trace -U -f com.target.app -i "*PrivacySandbox*"

# Monitor SDK communication
frida -U -f com.target.app -l scripts/android-15-16/android15-apis.js --no-pause
```

### Phase 3: Data Flow Testing
```bash
# Monitor file access patterns
adb shell "cat /proc/$(pgrep com.target.app)/fd/*" 2>/dev/null

# Monitor network connections
frida -U -f com.target.app -l scripts/android-15-16/android15-apis.js -P "monitorNetwork=true"
```

### Phase 4: Attribution Testing
```bash
# Test cross-SDK attribution
adb shell am broadcast -a android.privacy.action.SANDBOX_BOOKMARK_EVENT
```

## MTE (MEMORY TAGGING EXTENSION) TESTING

### Overview
MTE is ARM v8.5-A memory tagging to detect use-after-free and buffer overflows.

### Detection
```bash
# Check if device supports MTE
adb shell "cat /proc/cpu/maa" 2>/dev/null | grep -i "mte"
# Output: MTE: 3 (mte_enabled)

# Check kernel support
adb shell "cat /sys/kernel/mm/arm64/mte_maa" 2>/dev/null
```

### Security Implications
- MTE can PREVENT exploitation of memory corruption bugs
- But attackers can DETECT MTE and adapt behavior
- Key question: Does app expose data if MTE is disabled/monkey?

### Testing Checklist
- [ ] Identify memory allocation patterns
- [ ] Test for UAF vulnerabilities with MTE disabled
- [ ] Verify MTE doesn't leak sensitive metadata
- [ ] Check if MTE status affects security decisions

## APK SIGNATURE v3.1 TESTING

### Overview
Android 15 introduces APK Signature Scheme v3.1 with key rotation support.

### Testing Steps
```bash
# Verify signature scheme version
apksigner verify --min-sdk-version=35 target.apk

# Check for key rotation capability
apksigner verify --verbose target.apk | grep -i "key rotation"

# Extract signing certificate
apksigner get Fingerprint --file target.apk
```

### Security Checks
- [ ] Verify no SHA-1 in signing certificates
- [ ] Check for key rotation capability
- [ ] Verify attestation records if present
- [ ] Test rollback protection

## AI ON-DEVICE SECURITY (GEMINI NANO)

### Attack Surface
- **AiSession**: Manages AI model execution
- **AiPlugin**: Extensibility for AI capabilities
- **Model data**: May contain sensitive inference data

### Testing Approach
```bash
# Enumerate AI services
adb shell dumpsys | grep -i "aicore\|gemini"

# Check for AI data exfiltration vectors
frida -U -f com.target.app -l scripts/android-15-16/android15-apis.js -P "aiSecurity=true"
```

### Security Considerations
- AI inference may expose sensitive data in memory
- Model weights could contain training data leakage
- Plugin system may allow arbitrary code execution

## REPORTING TEMPLATE

### Structure
1. Executive Summary
2. Scope and Methodology
3. Detailed Findings (CVSS 4.0 scored)
4. Enumeration Results
5. Recommendations
6. References

### Severity Matrix

| Rating | CVSS 4.0 Score | Example |
|--------|-----------------|---------|
| CRITICAL | 9.0-10.0 | Unprotected passkey extraction |
| HIGH | 7.0-8.9 | Privacy Sandbox data exfiltration |
| MEDIUM | 4.0-6.9 | Screenshot protection bypass |
| LOW | 0.1-3.9 | Minor information disclosure |

## REFERENCES

- Android 15 Changes: https://developer.android.com/about/versions/15/changes
- Android 16 Changes: https://developer.android.com/about/versions/16/changes
- Privacy Sandbox: https://developer.android.com/design/privacy-sandbox
- FIDO2 Spec: https://fidoalliance.org/specs/fido-v2.1-rd-20201208/
- WebAuthn Spec: https://www.w3.org/TR/webauthn/
- MTE ARM Documentation: https://developer.arm.com/documentation
- APK Signature v3.1: https://source.android.com/docs/core/ota/apexSigning
