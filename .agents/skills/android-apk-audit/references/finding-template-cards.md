# Finding Template Cards

Printable finding cards and templates for documenting Android security vulnerabilities.

---

## Standard Finding Card

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ [AUDIT-NNN] Title: Short Descriptive Finding Title                          │
├─────────────────────────────────────────────────────────────────────────────┤
│ SEVERITY: CRITICAL │ CVSS: 9.1 │ CONFIDENCE: Confirmed                      │
├─────────────────────────────────────────────────────────────────────────────┤
│ CWE: CWE-XXX                    │ OWASP: M1 - Improper Credential Usage     │
│ MASVS: MASVS-PLATFORM           │ MASTG: MASTG-TEST-XXXX                   │
├─────────────────────────────────────────────────────────────────────────────┤
│ FILE: com/example/app/Component.java:42                                     │
│ COMPONENT: Activity | Service | Receiver | Provider                         │
├─────────────────────────────────────────────────────────────────────────────┤
│ DESCRIPTION:                                                                 │
│ One paragraph explaining what the vulnerability is, affected component,      │
│ and why it matters in this specific context. Be specific about the app's    │
│ behavior and attack surface.                                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│ DATA FLOW:                                                                   │
│ Source:     file:line (where attacker input enters)                          │
│     ↓       propagation step                                                 │
│     ↓       validation check (present/missing/bypassable)                   │
│ Sink:       file:line (where it becomes dangerous)                           │
├─────────────────────────────────────────────────────────────────────────────┤
│ PROOF OF CONCEPT:                                                            │
│ ```bash                                                                      │
│ # adb command or Frida hook                                                  │
│ adb shell am start -n com.example.app/.VulnerableActivity                    │
│ ```                                                                          │
├─────────────────────────────────────────────────────────────────────────────┤
│ IMPACT:                                                                       │
│ • What an attacker can DO with this vulnerability                            │
│ • What data can be accessed or modified                                       │
│ • Realistic attack scenario with concrete consequences                        │
├─────────────────────────────────────────────────────────────────────────────┤
│ REMEDIATION:                                                                 │
│ ```xml                                                                       │
│ <!-- BEFORE (vulnerable) -->                                                  │
│ <activity android:exported="true">                                           │
│                                                                              │
│ <!-- AFTER (secure) -->                                                      │
│ <activity android:exported="false">                                         │
│ <!-- OR -->                                                                  │
│ <activity android:exported="true"                                           │
│     android:permission="com.example.app.permission.Protected">               │
│ ```                                                                          │
├─────────────────────────────────────────────────────────────────────────────┤
│ VECTOR: CVSS:4.0/AV:N/AC:L/AT:N/PR:N/UI:N/VC:H/VI:H/VA:N                   │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Compact Finding Card

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ AUDIT-NNN │ [TITLE]                                          │ [CRITICAL] │
├──────────────────────────────────────────────────────────────────────────────┤
│ CVSS: X.X │ CWE: XXX │ OWASP: MX │ MASVS: MASVS-XXXX                        │
├──────────────────────────────────────────────────────────────────────────────┤
│ FILE: path/to/file.java:line                                                 │
├──────────────────────────────────────────────────────────────────────────────┤
│ SUMMARY: One sentence describing the vulnerability and its impact.           │
├──────────────────────────────────────────────────────────────────────────────┤
│ POC: Command or code snippet demonstrating the vulnerability.                │
├──────────────────────────────────────────────────────────────────────────────┤
│ FIX: Specific code or configuration change to remediate the issue.           │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## Finding ID Assignment Tracker

| ID | Finding Title | Severity | CVSS | OWASP | Status | Notes |
|----|---------------|----------|------|-------|--------|-------|
| AUDIT-001 | | CRITICAL | 9.1 | M1 | CONFIRMED | |
| AUDIT-002 | | HIGH | 7.5 | M7 | LIKELY | |
| AUDIT-003 | | MEDIUM | 5.5 | M9 | CONFIRMED | |
| AUDIT-004 | | LOW | 3.2 | M10 | NEEDS DYNAMIC | |
| AUDIT-005 | | HIGH | 8.1 | M3 | CONFIRMED | |
| AUDIT-006 | | MEDIUM | 5.3 | M4 | LIKELY | |
| AUDIT-007 | | | | | | |
| AUDIT-008 | | | | | | |
| AUDIT-009 | | | | | | |
| AUDIT-010 | | | | | | |

---

## Severity Matrix

| Severity | Score Range | Priority | Remediation Timeline | Example Vulnerabilities |
|----------|-------------|----------|---------------------|------------------------|
| **CRITICAL** | 9.0 - 10.0 | Immediate | 0-7 days | RCE, credential exposure, auth bypass |
| **HIGH** | 7.0 - 8.9 | Urgent | 1-30 days | XSS, SQL injection, path traversal |
| **MEDIUM** | 4.0 - 6.9 | Standard | 30-90 days | Insecure storage, weak crypto, cleartext HTTP |
| **LOW** | 0.1 - 3.9 | Low | 90+ days | Info disclosure, debug flags, minor hardening |
| **NONE** | 0.0 | None | N/A | No vulnerability |

---

## Confidence Level Definitions

| Level | Definition | Evidence Required |
|-------|-----------|-------------------|
| **Confirmed** | Full source-to-sink trace validated, exploitability verified via dynamic testing | Direct call chain from source to sink with no sanitization gap |
| **Likely** | Strong static evidence, minor gaps, may require runtime confirmation | Clear attack path but reflection/native boundary obscures final sink |
| **Needs Dynamic** | Static analysis inconclusive, requires runtime verification | Obfuscated code, native boundary, RASP controls, or reflective calls |

---

## OWASP Mobile Top 10 Mapping

| Code | Category | Typical CVSS Range |
|------|----------|-------------------|
| M1 | Improper Credential Usage | 6.0 - 9.5 |
| M2 | Inadequate Supply Chain Security | 5.0 - 8.0 |
| M3 | Insecure Authentication/Authorization | 6.5 - 9.5 |
| M4 | Insufficient Input/Output Validation | 4.0 - 7.5 |
| M5 | Insecure Communication | 4.0 - 7.0 |
| M6 | Inadequate Privacy Controls | 5.0 - 8.0 |
| M7 | Insufficient Binary Protections | 3.0 - 6.0 |
| M8 | Security Misconfiguration | 5.0 - 9.0 |
| M9 | Insecure Data Storage | 5.0 - 8.0 |
| M10 | Insufficient Cryptography | 4.0 - 7.5 |

---

## MASVS Categories

| Code | Category | Focus |
|------|----------|-------|
| MASVS-STORAGE | Storage | Data encryption, secure storage |
| MASVS-CRYPTO | Cryptography | Algorithm selection, key management |
| MASVS-AUTH | Authentication | Session management, MFA |
| MASVS-NETWORK | Network Communication | TLS, certificate pinning |
| MASVS-PLATFORM | Platform Interaction | IPC, permissions, intents |
| MASVS-PRIVACY | Privacy | Data collection, consent |
| MASVS-CODE | Code Quality | Input validation, output encoding |
| MASVS-RESILIENCE | Resilience | Anti-tampering, anti-debugging |

---

## Finding Template Checklist

Before finalizing a finding, verify:

- [ ] **ID assigned**: AUDIT-NNN format, sequential
- [ ] **Title**: Concise, under 10 words, descriptive
- [ ] **File path**: Exact path with line number
- [ ] **Component type**: Activity/Service/Receiver/Provider/WebView/etc.
- [ ] **Severity**: CRITICAL/HIGH/MEDIUM/LOW
- [ ] **CVSS vector**: Complete with all 8 base metrics
- [ ] **CVSS score**: Calculated correctly (0.0-10.0)
- [ ] **Confidence**: Confirmed/Likely/Needs Dynamic
- [ ] **CWE**: Correct MITRE CWE identifier
- [ ] **OWASP**: Correct M10 category
- [ ] **MASVS**: Correct MASVS category
- [ ] **MASTG**: Test case reference if applicable
- [ ] **Description**: 1-2 sentences, specific to this app
- [ ] **Data flow**: Source → propagation → sink traced
- [ ] **PoC**: Concrete, reproducible command/script
- [ ] **Impact**: Concrete attacker actions, not theoretical
- [ ] **Remediation**: Before/after code example provided

---

## Quick Finding Card (Field Format)

```
AUDIT-NNN: [TITLE]

File:      [path/to/file.java:line]
Type:      [Activity|Service|Receiver|Provider|...]
Severity:  [CRITICAL|HIGH|MEDIUM|LOW]
CVSS:      [X.X] (AV:/AC:/AT:/PR:/UI:/VC:/VI:/VA:)
Confidence:[Confirmed|Likely|Needs Dynamic]

CWE:       CWE-XXX
OWASP:     MX - [Category]
MASVS:     MASVS-[CATEGORY]

[DESCRIPTION - 1-2 sentences]

DATA FLOW:
Source → [entry point]
  ↓    [propagation]
Sink  → [dangerous operation]

POC:
[command or code]

IMPACT:
• [consequence 1]
• [consequence 2]

REMEDIATION:
[BEFORE code]
[AFTER code]
```

---

## Severity-to-Remediation Timeline

| Severity | Timeline | Actions |
|----------|----------|---------|
| CRITICAL | 0-7 days | Hotfix, emergency release, immediate mitigation |
| HIGH | 1-30 days | Prioritized patch in next release cycle |
| MEDIUM | 30-90 days | Schedule in normal release cycle |
| LOW | 90+ days | Include in future hardening sprint |
