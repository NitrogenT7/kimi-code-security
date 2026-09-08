# CVSS 4.0 Scoring Guide for Android/Mobile Vulnerabilities

## Table of Contents

1. [CVSS 4.0 Overview](#1-cvss-40-overview-for-mobile)
2. [Base Metrics](#2-base-metrics)
3. [Threat Metrics](#3-threat-metrics)
4. [Environmental Metrics](#4-environmental-metrics)
5. [Supplemental Metrics](#5-supplemental-metrics)
6. [Vector String Format](#6-vector-string-format)
7. [Severity Ratings](#7-severity-ratings)
8. [Mobile-Specific Examples](#8-mobile-specific-cvss-scoring-examples)
9. [Quick Scoring Cheat Sheet](#9-quick-scoring-cheat-sheet)
10. [Severity-to-Priority Mapping](#10-severity-to-priority-mapping)

---

## 1. CVSS 4.0 Overview for Mobile

CVSS (Common Vulnerability Scoring System) version 4.0 is an open framework for communicating the characteristics and severity of software vulnerabilities. CVSS v4.0 introduces significant changes from v3.1:

- **Scope removed**: Replaced with Vulnerable System (VC, VI, VA) and Subsequent System (SC, SI, SA) concepts
- **Attack Requirements (AT) added**: New mandatory base metric separating deployment conditions from exploit engineering complexity
- **User Interaction expanded**: Three values (None, Passive, Active) instead of two (None, Required)
- **Temporal renamed to Threat**: Metric group now focuses on exploit maturity and subsequent system impacts
- **Supplemental Metrics added**: Optional metrics for Safety, Automatable, Recovery, Value Density, Response Effort, and Provider Urgency

### CVSS Nomenclature

Always specify which metric groups are used when communicating scores:

| Score Type | Metrics Used |
|-------------|---------------|
| CVSS-B | Base metrics only |
| CVSS-BT | Base + Threat metrics |
| CVSS-BE | Base + Environmental metrics |
| CVSS-BTE | Base + Threat + Environmental metrics |

---

## 2. Base Metrics

Base metrics represent intrinsic qualities of a vulnerability that are constant over time and across user environments. All 8 base metrics are MANDATORY in the vector string.

### Attack Vector (AV)

How the vulnerable component is exploited.

| Value | Description | Mobile Examples |
|--------|-------------|-----------------|
| Network (N) | Exploitable remotely without requiring network adjacency | Malicious deep link URL, push notification, server-side API vulnerability |
| Adjacent (A) | Exploitable from same network (broadcast, shared LAN) | WiFi MITM, Bluetooth attack, same adb-connected host |
| Local (L) | Requires local execution or device access | Malicious app co-installed, local file system access |
| Physical (P) | Requires physical device access | USB connection, device theft, physical tampering |

### Attack Complexity (AC)

The conditions beyond the attacker's control that must exist to exploit.

| Value | Description | Mobile Examples |
|--------|-------------|-----------------|
| Low (L) | No special conditions, straightforward exploit | Direct SQL injection, predictable deep link structure |
| High (H) | Requires specific conditions or timing | Race condition, requires specific app state, memory corruption requiring heap grooming |

### Attack Requirements (AT) — NEW IN 4.0

Prerequisite deployment and execution conditions of the vulnerable system that enable the attack. This is MANDATORY in all v4.0 vectors.

| Value | Description | Mobile Examples |
|--------|-------------|-----------------|
| None (N) | No special deployment conditions needed | Default app configuration, standard Android permissions |
| Present (P) | Requires specific deployment conditions | App must be in foreground, specific Android version, rooted device, custom ROM |

### Privileges Required (PR)

The level of privileges the attacker must possess before successfully exploiting.

| Value | Description | Mobile Examples |
|--------|-------------|-----------------|
| None (N) | No authentication or permissions needed | Unauthenticated API endpoint, exported activity with no protection |
| Low (L) | Basic user-level access | Normal Android app permissions (INTERNET, READ_EXTERNAL_STORAGE) |
| High (H) | Requires elevated privileges | Dangerous permissions (SYSTEM), root access, signature level permissions |

### User Interaction (UI)

The degree of user interaction required for exploitation.

| Value | Description | Mobile Examples |
|--------|-------------|-----------------|
| None (N) | Zero-click exploit | Background service, broadcast receiver, push notification exploit |
| Passive (P) | Limited involuntary interaction | Opening app, receiving notification, view rendering |
| Active (A) | Conscious user action required | Clicking deep link, granting permission, opening attachment |

### Vulnerable System Impact Metrics

Impact on the vulnerable app/system itself (NOT the Subsequent System).

#### Vulnerable System Confidentiality (VC)

| Value | Description | Mobile Examples |
|--------|-------------|-----------------|
| High (H) | Total loss of confidentiality | Full database access, token theft, credential exposure |
| Low (L) | Limited information disclosure | Single setting exposed, partial user data |
| None (N) | No confidentiality impact | Integrity or availability only |

#### Vulnerable System Integrity (VI)

| Value | Description | Mobile Examples |
|--------|-------------|-----------------|
| High (H) | Total loss of integrity | Arbitrary code execution, full database modification |
| Low (L) | Limited modification | Single preference changed, partial file modification |
| None (N) | No integrity impact | Confidentiality or availability only |

#### Vulnerable System Availability (VA)

| Value | Description | Mobile Examples |
|--------|-------------|-----------------|
| High (H) | Total loss of availability | App crash preventing all functions, denial of service |
| Low (L) | Limited disruption | Single feature unavailable, temporary performance degradation |
| None (N) | No availability impact | Confidentiality or integrity only |

---

## 3. Threat Metrics

Threat metrics reflect characteristics that change over time based on exploit intelligence. These metrics can reduce the Base score (not increase it).

### Exploit Maturity (E)

Current state of exploit intelligence.

| Value | Description | Mobile Examples |
|--------|-------------|-----------------|
| Unreported (U) | No public exploit or PoC | Recently discovered, not weaponized |
| PoC (P) | Proof-of-concept exists but not active | Academic exploit, limited PoC available |
| Active (A) | Active exploitation in the wild | Exploit kits, in-the-wild attacks, weaponized malware |

---

## 4. Environmental Metrics

Environmental metrics represent characteristics unique to a user's environment. These modify the Base score based on organizational context.

### Security Requirements

Impact of confidentiality, integrity, or availability loss on the organization.

| Metric | High | Medium | Low |
|--------|------|--------|-----|
| Confidentiality Requirement (CR) | Critical data, credentials, PII | Sensitive business data | Public data |
| Integrity Requirement (IR) | Financial transactions, PII, business decisions | Non-critical business data | General data |
| Availability Requirement (AR) | < 24h recovery required | 1-5 days recovery required | > 5 days or redundant |

### Modified Base Metrics

If the environment differs from baseline assumptions, modify these metrics:

- MAV (Modified Attack Vector): E.g., Network but protected by firewall → Adjacent (A)
- MAC (Modified Attack Complexity): E.g., Additional mitigations increase complexity
- MAT (Modified Attack Requirements): E.g., Specific environment adds requirements
- MPR (Modified Privileges Required): E.g., App requires additional permissions in deployment
- MUI (Modified User Interaction): E.g., User awareness training changes interaction needed

### Modified Impact Metrics

If the vulnerable system's impact is amplified or reduced in your environment:

- MVC (Modified Vulnerable System Confidentiality)
- MVI (Modified Vulnerable System Integrity)
- MVA (Modified Vulnerable System Availability)

---

## 5. Supplemental Metrics

Supplemental metrics provide additional context but do NOT modify the CVSS score. All are optional. Use a single "S:" prefix.

### Safety (S)

| Value | Description | Mobile Examples |
|--------|-------------|-----------------|
| Negligible (N) | No safety impact | Banking app, social media app |
| Present (P) | Safety impact possible | Medical device app, automotive app, ICS control |

### Automatable (AU)

Can the full exploit chain be automated at scale?

| Value | Description | Mobile Examples |
|--------|-------------|-----------------|
| No (N) | Requires human intervention per target | Social engineering, complex multi-step |
| Yes (Y) | Fully automatable | Unauthenticated RCE, automated scanning exploitation |

### Recovery (RE)

Resilience after successful exploitation.

| Value | Description | Mobile Examples |
|--------|-------------|-----------------|
| Automated (A) | Auto-recovery | App auto-restarts, health check restores service |
| User (U) | Requires manual recovery | Clear app data, reinstall needed |
| Irreversible (I) | Cannot recover | Persistent data corruption, permanent damage |

### Value Density (V)

Concentration of value in the vulnerable system.

| Value | Description | Mobile Examples |
|--------|-------------|-----------------|
| Diffuse (D) | Distributed value | Consumer banking apps, email accounts, personal phones |
| Concentrated (C) | Centralized value | Corporate device management, MDM controllers, key servers |

### Vulnerability Response Effort (U)

Effort required to remediate.

| Value | Description |
|--------|-------------|
| Low (L) | Simple patch or configuration change |
| Moderate (M) | Requires testing, some code changes |
| High (H) | Major architectural changes, significant testing required |

### Provider Urgency

Vendor-assessed urgency (optional pass-through metric).

| Value | Description |
|--------|-------------|
| Clear (C) | Urgency is clear |
| Green (G) | Low urgency |
| Amber (A) | Medium urgency |
| Red (R) | High urgency |

---

## 6. Vector String Format

### Correct CVSS 4.0 Format

```
CVSS:4.0/AV:N/AC:L/AT:N/PR:N/UI:N/VC:H/VI:H/VA:L/SC:N/SI:N/SA:N/E:U
```

#### Format Breakdown

1. **Prefix**: `CVSS:4.0/`
2. **Base Metrics (mandatory)**: `AV:N/AC:L/AT:N/PR:N/UI:N/VC:H/VI:H/VA:L`
3. **Subsequent System Impact** (optional, use if applicable): `SC:N/SI:N/SA:N`
4. **Threat Metrics** (optional): `E:U` (Exploit Maturity only - no CI, II, IA in CVSS 4.0)
5. **Environmental Metrics** (optional): `CR:H/IR:H/AR:H/MAV:A/...`
6. **Supplemental Metrics** (optional, single "S:" prefix): `S:Safety:N/AU:Y/...`

### Vector String Ordering

Metrics MUST appear in this order (as defined in specification):

**Base:**
1. AV (Attack Vector)
2. AC (Attack Complexity)
3. AT (Attack Requirements)
4. PR (Privileges Required)
5. UI (User Interaction)
6. VC (Vulnerable System Confidentiality)
7. VI (Vulnerable System Integrity)
8. VA (Vulnerable System Availability)

**Subsequent System Impacts:**
9. SC (Subsequent System Confidentiality)
10. SI (Subsequent System Integrity)
11. SA (Subsequent System Availability)

**Threat Metrics:**
12. E (Exploit Maturity)

**Environmental Metrics:**
13. CR (Confidentiality Requirement)
14. IR (Integrity Requirement)
15. AR (Availability Requirement)
16. MAV (Modified Attack Vector)
17. MAC (Modified Attack Complexity)
18. MAT (Modified Attack Requirements)
19. MPR (Modified Privileges Required)
20. MUI (Modified User Interaction)
21. MVC (Modified Vulnerable System Confidentiality)
22. MVI (Modified Vulnerable System Integrity)
23. MVA (Modified Vulnerable System Availability)

**Supplemental Metrics:**
24. S: (Single prefix for all supplemental metrics)

---

## 7. Severity Ratings

| Qualitative Rating | Score Range |
|------------------|-------------|
| None | 0.0 |
| Low | 0.1 - 3.9 |
| Medium | 4.0 - 6.9 |
| High | 7.0 - 8.9 |
| Critical | 9.0 - 10.0 |

---

## 8. Mobile-Specific CVSS Scoring Examples

### Example 1: Exported Activity with Auth Bypass

An exported Activity has no authentication checks and exposes sensitive user data to any app that launches it.

**Vulnerability:**
- Attack can be triggered by malicious deep link from any app
- No authentication required
- Exposes full user profile data

**CVSS 4.0 Vector:**
```
CVSS:4.0/AV:N/AC:L/AT:N/PR:N/UI:N/VC:H/VI:N/VA:N/SC:N/SI:N/SA:N/E:U
```

**Metrics breakdown:**
- AV:N — Exploitable via malicious deep link (network)
- AC:L — Straightforward exploit, no special conditions
- AT:N — No special deployment requirements
- PR:N — No authentication/privileges needed
- UI:N — No user interaction required
- VC:H — Complete user data exposed
- VI:N — No data modification
- VA:N — Service not disrupted
- SC:N/SI:N/SA:N — No impact on other systems
- E:U — No public exploit (default/base score)

**Score:** CVSS-B: 9.1 (CRITICAL)

---

### Example 2: Hardcoded API Key in APK

App contains a hardcoded production API key in plaintext strings.xml that allows full API access.

**Vulnerability:**
- Static analysis reveals API key in decompiled code
- Any attacker with decompiled APK can extract key
- API provides full read/write access to user accounts

**CVSS 4.0 Vector:**
```
CVSS:4.0/AV:N/AC:L/AT:N/PR:N/UI:N/VC:H/VI:L/VA:N/SC:N/SI:N/SA:N/E:U
```

**Metrics breakdown:**
- AV:N — APK can be downloaded from public sources (network exposure)
- AC:L — Simple string extraction from decompiled APK
- AT:N — No special conditions needed
- PR:N — No app installation required to extract key
- UI:N — No user interaction for key extraction
- VC:H — API key exposes full user account data
- VI:L — Limited ability to modify data via API
- VA:N — Service availability not impacted
- SC:N/SI:N/SA:N — No cross-system impact

**Score:** CVSS-B: 7.5 (HIGH)

---

### Example 3: SQL Injection in Content Provider

Content Provider has SQL injection vulnerability that allows reading from another app's database.

**Vulnerability:**
- Requires local app installation (to call Content Provider)
- Injection allows full database read from vulnerable app
- Impact limited to data stored by vulnerable app

**CVSS 4.0 Vector:**
```
CVSS:4.0/AV:L/AC:L/AT:N/PR:L/UI:N/VC:H/VI:L/VA:N/SC:N/SI:N/SA:N/E:U
```

**Metrics breakdown:**
- AV:L — Requires malicious app installed on same device
- AC:L — Straightforward SQL injection
- AT:N — No special deployment conditions
- PR:L — Requires basic app permissions (to query Content Provider)
- UI:N — No user interaction after malicious app installed
- VC:H — Full database read access
- VI:L — Can read but not modify data
- VA:N — Service not disrupted
- SC:N/SI:N/SA:N — No impact on other systems

**Score:** CVSS-B: 6.7 (MEDIUM)

---

### Example 4: WebView XSS via Deep Link

WebView loads arbitrary URLs from deep links without validation, allowing XSS.

**Vulnerability:**
- Triggered by malicious deep link from SMS or email
- User must click link (user interaction)
- XSS can execute JavaScript in WebView context
- Potential to steal session tokens or user input

**CVSS 4.0 Vector:**
```
CVSS:4.0/AV:N/AC:L/AT:N/PR:N/UI:A/VC:L/VI:L/VA:N/SC:H/SI:H/SA:N/E:U
```

**Metrics breakdown:**
- AV:N — Deep link can be delivered remotely
- AC:L — Straightforward XSS exploitation
- AT:N — No special deployment conditions
- PR:N — No app permissions needed
- UI:A — User must click malicious link (Active interaction)
- VC:L — Can read WebView data/cookies (limited scope)
- VI:L — Limited JavaScript execution in WebView
- VA:N — App functionality not disrupted
- SC:H — XSS steals cookies/data from user's browser (subsequent system)
- SI:H — XSS can perform actions in user's browser
- SA:N — No browser crash/DoS

**Score:** CVSS-B: 7.8 (HIGH)

---

### Example 5: Insecure SharedPreferences Storing PII

App stores user credentials in plain text SharedPreferences with WORLD_READABLE flag.

**Vulnerability:**
- Requires malicious app installed on same device
- Can read SharedPreferences from other app (due to WORLD_READABLE)
- Credential exposure is confidentiality impact only

**CVSS 4.0 Vector:**
```
CVSS:4.0/AV:L/AC:L/AT:N/PR:L/UI:N/VC:H/VI:N/VA:N/SC:N/SI:N/SA:N/E:U
```

**Metrics breakdown:**
- AV:L — Requires malicious app co-installed
- AC:L — Direct file read from SharedPreferences
- AT:N — No special deployment conditions
- PR:L — Malicious app needs READ_EXTERNAL_STORAGE or equivalent
- UI:N — No user interaction required after malicious app installed
- VC:H — Full credentials exposed
- VI:N — Cannot modify credentials (read-only)
- VA:N — App functionality not disrupted
- SC:N/SI:N/SA:N — No cross-system impact

**Score:** CVSS-B: 5.5 (MEDIUM)

---

### Example 6: Cleartext HTTP API Communication

App communicates with API over HTTP (no TLS), exposing all network traffic to MITM.

**Vulnerability:**
- Requires network adjacency (MITM position)
- Passive attack (no user interaction after app starts)
- All API data exposed during transmission

**CVSS 4.0 Vector:**
```
CVSS:4.0/AV:A/AC:H/AT:N/PR:N/UI:P/VC:L/VI:N/VA:N/SC:N/SI:N/SA:N/E:U
```

**Metrics breakdown:**
- AV:A — Requires same network (WiFi MITM, rogue AP)
- AC:H — Requires attacker-controlled network (complex to establish)
- AT:N — No special deployment conditions
- PR:N — No authentication needed to sniff traffic
- UI:P — Passive interaction (user must be using app)
- VC:L — Network traffic exposed (limited scope vs data at rest)
- VI:N — Cannot modify data during transit (read-only MITM)
- VA:N — App continues to function normally
- SC:N/SI:N/SA:N — No impact on other systems

**Score:** CVSS-B: 3.4 (LOW)

---

### Example 7: SSL Pinning Missing with MITM Risk

App performs HTTPS API calls but lacks SSL pinning, vulnerable to MITM on compromised networks.

**Vulnerability:**
- Requires network adjacency
- Passive attack once MITM established
- Exposes session tokens and API data

**CVSS 4.0 Vector:**
```
CVSS:4.0/AV:A/AC:H/AT:N/PR:N/UI:P/VC:L/VI:L/VA:N/SC:N/SI:N/SA:N/E:U
```

**Metrics breakdown:**
- AV:A — Requires network adjacency
- AC:H — Requires attacker-controlled network (CA compromise needed)
- AT:N — No special deployment conditions
- PR:N — No authentication to perform MITM
- UI:P — Passive interaction (user using app)
- VC:L — Network traffic exposed
- VI:L — Possible session hijacking or token modification
- VA:N — App functionality not disrupted
- SC:N/SI:N/SA:N — No cross-system impact

**Score:** CVSS-B: 4.1 (MEDIUM)

---

### Example 8: Path Traversal to External Storage

App vulnerable to path traversal allowing writing files to external storage.

**Vulnerability:**
- Requires user interaction (upload file, click link)
- Allows writing arbitrary files to external storage
- Can overwrite app's private data or user documents

**CVSS 4.0 Vector:**
```
CVSS:4.0/AV:L/AC:L/AT:N/PR:L/UI:A/VC:N/VI:H/VA:L/SC:N/SI:N/SA:N/E:U
```

**Metrics breakdown:**
- AV:L — Requires malicious app installed or file from external source
- AC:L — Straightforward path traversal
- AT:N — No special deployment conditions
- PR:L — Requires WRITE_EXTERNAL_STORAGE permission
- UI:A — User must trigger file write operation
- VC:N — No data disclosure (write operation)
- VI:H — Arbitrary file overwrite possible
- VA:L — Can overwrite app data causing partial unavailability
- SC:N/SI:N/SA:N — No cross-system impact

**Score:** CVSS-B: 5.3 (MEDIUM)

---

### Example 9: Broadcast Receiver with Permission Bypass

Exported Broadcast Receiver accepts commands without proper permission checks.

**Vulnerability:**
- Triggered by any app sending broadcast
- No authentication or permission validation
- Can perform privileged actions within vulnerable app

**CVSS 4.0 Vector:**
```
CVSS:4.0/AV:L/AC:L/AT:N/PR:L/UI:N/VC:N/VI:H/VA:L/SC:N/SI:N/SA:N/E:U
```

**Metrics breakdown:**
- AV:L — Requires malicious app installed (to send broadcast)
- AC:L — Direct broadcast send
- AT:N — No special deployment conditions
- PR:L — Malicious app needs basic permissions
- UI:N — No user interaction required
- VC:N — No data disclosure
- VI:H — Can perform privileged actions (data modification)
- VA:L — Can disrupt app functionality
- SC:N/SI:N/SA:N — No cross-system impact

**Score:** CVSS-B: 5.6 (MEDIUM)

---

### Example 10: Intent Redirection (Activity Hijacking)

Activity accepts arbitrary Intent data without validation, redirecting to unintended activities.

**Vulnerability:**
- Triggered by malicious app sending crafted Intent
- No proper Intent validation or component protection
- Can hijack or launch other app components

**CVSS 4.0 Vector:**
```
CVSS:4.0/AV:L/AC:L/AT:N/PR:L/UI:N/VC:L/VI:L/VA:N/SC:N/SI:N/SA:N/E:U
```

**Metrics breakdown:**
- AV:L — Requires malicious app installed (to send Intent)
- AC:L — Straightforward Intent crafting
- AT:N — No special deployment conditions
- PR:L — Malicious app needs basic permissions
- UI:N — No user interaction required
- VC:L — May expose limited data via Intent extras
- VI:L — Can redirect to unintended components
- VA:N — App functionality not disrupted
- SC:N/SI:N/SA:N — No cross-system impact

**Score:** CVSS-B: 4.9 (MEDIUM)

---

## 9. Quick Scoring Cheat Sheet

### Base Metrics Quick Reference

| Metric | Value | Severity Level | Typical Android Scenario |
|--------|--------|----------------|----------------------|
| AV | N (Network) | Highest | Remote deep link, API exploit |
| AV | A (Adjacent) | High | WiFi MITM, Bluetooth |
| AV | L (Local) | Medium | Co-installed app, local file access |
| AV | P (Physical) | Low | USB, device theft |
| AC | L (Low) | Higher | Simple injection, predictable input |
| AC | H (High) | Lower | Race condition, heap spray |
| AT | N (None) | Higher | Default config, standard permissions |
| AT | P (Present) | Lower | Specific Android version, rooted device |
| PR | N (None) | Higher | No auth, exported component |
| PR | L (Low) | Medium | Basic app permissions |
| PR | H (High) | Lower | Dangerous permissions, root |
| UI | N (None) | Higher | Zero-click, background service |
| UI | P (Passive) | Medium | App open, notification received |
| UI | A (Active) | Lower | Click link, grant permission |
| VC/VI/VA | H (High) | Highest | Full impact |
| VC/VI/VA | L (Low) | Medium | Partial impact |
| VC/VI/VA | N (None) | Lower | No impact |

### Subsequent System Impact Decision Tree

```
Does vulnerability affect OTHER systems?
├─ YES → Assess SC/SI/SA
│   ├─ Is it XSS/redirect to browser? → SC:H/SI:H/SA:N
│   ├─ Does it read/write other app's data? → SC:L/SI:L/SA:N
│   └─ Can it crash other components? → SC:N/SI:N/SA:H
└─ NO → SC:N/SI:N/SA:N
```

### Exploit Maturity (Threat Metric)

| Exploit Status | E Value | Score Impact |
|---------------|---------|--------------|
| No public exploit | U (Unreported) | None (default) |
| PoC exists | P (PoC) | Reduces score slightly |
| In the wild | A (Active) | Reduces score significantly |

---

## 10. Severity-to-Priority Mapping

| Severity | Priority | Remediation Timeline | Example Android Vulnerabilities |
|----------|----------|---------------------|----------------------------|
| CRITICAL (9.0-10.0) | Immediate | 0-7 days | Exported component with auth bypass, RCE, hardcoded production API keys |
| HIGH (7.0-8.9) | Urgent | 1-30 days | XSS with subsequent system impact, SQL injection, path traversal |
| MEDIUM (4.0-6.9) | Standard | 30-90 days | Insecure SharedPreferences, missing SSL pinning, weak crypto, cleartext HTTP |
| LOW (0.1-3.9) | Low | 90+ days | Information disclosure, debug flags, minor hardening issues |

### OWASP Mobile Top 10 Mapping to Typical CVSS 4.0 Ranges

| OWASP M10 Category | Typical CVSS 4.0 Base Range |
|-------------------|----------------------------|
| M1: Improper Credential Usage | 6.0-9.5 |
| M2: Supply Chain Issues | 5.0-8.0 |
| M3: Insecure Authentication | 6.5-9.5 |
| M4: Insufficient Cryptography | 4.0-7.5 |
| M5: Insecure Communication | 4.0-7.0 |
| M6: Insecure Data Storage | 5.0-8.0 |
| M7: Insecure Authorization | 6.0-9.0 |
| M8: Code Quality | 3.0-6.0 |
| M9: Platform Misuse | 5.0-9.0 |
| M10: Extraneous Functionality | 3.0-7.0 |

---

## 11. Key Differences from CVSS 3.1

| Aspect | CVSS 3.1 | CVSS 4.0 |
|--------|-----------|-----------|
| Scope | S:U / S:C (Changed/Unchanged) | Removed → SC/SI/SA (Subsequent System impacts) |
| User Interaction | None / Required | None (N) / Passive (P) / Active (A) |
| Attack Requirements | None (part of AC) | New mandatory metric AT:N/P |
| Temporal Metrics | RL, RC, E | Threat: E (Exploit Maturity only) |
| Supplemental Metrics | None (optional) | Safety, Automatable, Recovery, Value Density, Response Effort, Provider Urgency |
| Vector Prefix | CVSS:3.1 | CVSS:4.0 |

---

## 12. Confidence Levels (Android Pentesting)

| Confidence Level | Description | Action Required |
|----------------|-------------|-----------------|
| Confirmed | Full source-to-sink trace completed, exploitability verified via dynamic testing | Report with full CVSS vector |
| Likely | Most of the attack path traced, one hop ambiguous or unverified | Report with CVSS vector, note uncertainty |
| Needs Dynamic Confirmation | Static analysis cannot settle the path due to obfuscation, native boundary, or reflection | Report as potential, do not assign CVSS score until confirmed |

---

## Additional Resources

- **CVSS v4.0 Calculator**: https://www.first.org/cvss/calculator/4.0
- **CVSS v4.0 Specification**: https://www.first.org/cvss/v4.0/specification-document
- **CVSS v4.0 User Guide**: https://www.first.org/cvss/v4.0/user-guide
- **CVSS v4.0 Examples**: https://www.first.org/cvss/v4.0/examples
- **CVSS v4.0 FAQ**: https://www.first.org/cvss/v4.0/faq

---

## Notes for Android/Mobile Pentesters

1. **Always specify CVSS nomenclature** (CVSS-B, CVSS-BT, CVSS-BE, CVSS-BTE) when communicating scores
2. **Attack Requirements (AT) is mandatory** in all CVSS 4.0 vectors — never omit this metric
3. **Use SC/SI/SA for XSS/redirects** that impact user browsers or other apps — this is the "Subsequent System" concept
4. **Supplemental metrics do NOT modify the score** — use them for additional context only
5. **Threat metrics can only reduce** the Base score based on exploit intelligence — they never increase severity
6. **Default/Not Defined values** are assumed for Threat and Environmental metrics unless explicitly specified
7. **Scope is gone** — do not use S:U or S:C notation; use SC/SI/SA for cross-system impacts
8. **User Interaction has 3 values** in 4.0 — distinguish between Passive (involuntary) and Active (conscious user action)
