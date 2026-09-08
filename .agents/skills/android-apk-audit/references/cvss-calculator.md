# CVSS 4.0 Calculator Quick Reference

Quick reference card for calculating CVSS 4.0 severity scores for Android vulnerabilities.

---

## Base Metrics

All 8 base metrics are **MANDATORY** in CVSS 4.0 vectors.

### Attack Vector (AV)

How the vulnerability is exploited.

| Value | Name | Description | Android Example |
|-------|------|-------------|-----------------|
| **N** | Network | Remotely exploitable | Malicious deep link, API exploit |
| **A** | Adjacent | Same network required | WiFi MITM, Bluetooth attack |
| **L** | Local | Requires local access | Malicious app, file access |
| **P** | Physical | Physical access required | USB, device theft |

**Scoring Impact**: N > A > L > P (Network is most severe)

---

### Attack Complexity (AC)

Conditions beyond attacker's control.

| Value | Name | Description | Android Example |
|-------|------|-------------|-----------------|
| **L** | Low | Straightforward exploit | Direct SQL injection |
| **H** | High | Specific conditions needed | Race condition, heap spray |

**Scoring Impact**: L > H (Low complexity is more severe)

---

### Attack Requirements (AT) — NEW IN 4.0

Prerequisite deployment conditions of the vulnerable system.

| Value | Name | Description | Android Example |
|-------|------|-------------|-----------------|
| **N** | None | No special conditions | Default config, standard permissions |
| **P** | Present | Specific conditions required | App must be in foreground, specific Android version |

**Scoring Impact**: N > P (No requirements is more severe)

---

### Privileges Required (PR)

Level of privileges attacker must possess.

| Value | Name | Description | Android Example |
|-------|------|-------------|-----------------|
| **N** | None | No authentication needed | Exported component with no protection |
| **L** | Low | Basic user-level access | Normal app permissions (INTERNET) |
| **H** | High | Elevated privileges needed | Dangerous permissions, signature-level |

**Scoring Impact**: N > L > H (No privileges is most severe)

---

### User Interaction (UI)

Degree of user interaction required.

| Value | Name | Description | Android Example |
|-------|------|-------------|-----------------|
| **N** | None | Zero-click exploit | Background service, broadcast receiver |
| **P** | Passive | Limited involuntary action | Opening app, receiving notification |
| **A** | Active | Conscious user action | Clicking link, granting permission |

**Scoring Impact**: N > P > A (No interaction is most severe)

---

### Vulnerable System Impact Metrics

Impact on the vulnerable app/system itself.

#### VC — Vulnerable System Confidentiality

| Value | Description | Android Example |
|-------|-------------|-----------------|
| **H** | Total loss of confidentiality | Full database access, token theft |
| **L** | Limited information disclosure | Single setting exposed |
| **N** | No confidentiality impact | Integrity or availability only |

---

#### VI — Vulnerable System Integrity

| Value | Description | Android Example |
|-------|-------------|-----------------|
| **H** | Total loss of integrity | Arbitrary code execution, full database modification |
| **L** | Limited modification | Single preference changed |
| **N** | No integrity impact | Confidentiality or availability only |

---

#### VA — Vulnerable System Availability

| Value | Description | Android Example |
|-------|-------------|-----------------|
| **H** | Total loss of availability | App crash, complete DoS |
| **L** | Limited disruption | Single feature unavailable |
| **N** | No availability impact | Confidentiality or integrity only |

---

## Vector String Format

```
CVSS:4.0/AV:X/AC:X/AT:X/PR:X/UI:X/VC:X/VI:X/VA:X
```

### Example Vectors

| Vulnerability | Vector | Score |
|--------------|--------|-------|
| Exported activity no auth | `CVSS:4.0/AV:N/AC:L/AT:N/PR:N/UI:N/VC:H/VI:N/VA:N` | 7.5 |
| Hardcoded API key | `CVSS:4.0/AV:N/AC:L/AT:N/PR:N/UI:N/VC:H/VI:L/VA:N` | 7.5 |
| SQL injection via provider | `CVSS:4.0/AV:L/AC:L/AT:N/PR:L/UI:N/VC:H/VI:L/VA:N` | 6.7 |
| Insecure SharedPreferences | `CVSS:4.0/AV:L/AC:L/AT:N/PR:L/UI:N/VC:H/VI:N/VA:N` | 5.5 |
| Cleartext HTTP | `CVSS:4.0/AV:A/AC:H/AT:N/PR:N/UI:P/VC:L/VI:N/VA:N` | 3.4 |

---

## Severity Ratings

| Rating | Score Range | Response Timeline |
|--------|-------------|------------------|
| **None** | 0.0 | N/A |
| **Low** | 0.1 - 3.9 | 90+ days |
| **Medium** | 4.0 - 6.9 | 30-90 days |
| **High** | 7.0 - 8.9 | 1-30 days |
| **Critical** | 9.0 - 10.0 | 0-7 days |

---

## Quick Scoring Decision Tree

```
START: Identify Base Metrics
         ↓
    AV = Network? ──Yes──→ Highest AV score
         ↓No
    AV = Adjacent? ──Yes──→ Second highest
         ↓No
    AV = Local? ──Yes──→ Third highest
         ↓No
    AV = Physical ──→ Lowest AV score
         ↓
    AC = Low? ──Yes──→ Higher severity
         ↓No
    AC = High ──→ Lower severity
         ↓
    AT = None? ──Yes──→ Higher severity
         ↓No
    AT = Present ──→ Lower severity
         ↓
    PR = None? ──Yes──→ Highest PR score
         ↓No
    PR = Low? ──Yes──→ Medium PR score
         ↓No
    PR = High ──→ Lowest PR score
         ↓
    UI = None? ──Yes──→ Highest UI score
         ↓No
    UI = Passive? ──Yes──→ Medium UI score
         ↓No
    UI = Active ──→ Lowest UI score
         ↓
    Impact: Combine VC + VI + VA
    Higher impacts = Higher severity
         ↓
    CALCULATE FINAL SCORE
```

---

## Subsequent System Impact (SC/SI/SA)

When vulnerability affects OTHER systems (NOT the vulnerable app).

| Metric | Use When | Example |
|--------|----------|---------|
| **SC** | XSS affecting user's browser | WebView XSS |
| **SI** | Code execution in browser | Universal XSS |
| **SA** | Browser/system crash | DoS via app |

**Default if N/A**: `SC:N/SI:N/SA:N`

---

## Threat Metrics (Optional)

### Exploit Maturity (E)

| Value | Description | Score Impact |
|-------|-------------|--------------|
| **U** | Unreported (no public exploit) | None (default) |
| **P** | Proof-of-concept exists | Slight reduction |
| **A** | Active exploitation in wild | Significant reduction |

---

## Environmental Metrics (Optional)

Modify base score based on organizational context.

| Metric | If Different from Base | Example |
|--------|------------------------|---------|
| **MAV** | Modified Attack Vector | Network → Adjacent (firewall) |
| **MAC** | Modified Attack Complexity | Low → High (mitigations) |
| **MAT** | Modified Attack Requirements | None → Present |
| **MPR** | Modified Privileges Required | None → Low |
| **MUI** | Modified User Interaction | None → Passive |
| **MVC** | Modified VC | High → Low (data not sensitive) |
| **MVI** | Modified VI | High → Low |
| **MVA** | Modified VA | High → Low |

---

## Common Android Vulnerability CVSS Examples

### Exported Activity (No Permission)

```
Vector:   AV:N/AC:L/AT:N/PR:N/UI:N/VC:H/VI:N/VA:N
Score:    7.5 (HIGH)
Rationale: Network-accessible, no auth, high confidentiality impact
```

### Hardcoded API Key

```
Vector:   AV:N/AC:L/AT:N/PR:N/UI:N/VC:H/VI:L/VA:N
Score:    7.5 (HIGH)
Rationale: Static analysis only, network-accessible extraction, moderate integrity
```

### SQL Injection (Content Provider)

```
Vector:   AV:L/AC:L/AT:N/PR:L/UI:N/VC:H/VI:L/VA:N
Score:    6.7 (MEDIUM)
Rationale: Requires local app install, straightforward exploit, high confidentiality
```

### Insecure SharedPreferences (WORLD_READABLE)

```
Vector:   AV:L/AC:L/AT:N/PR:L/UI:N/VC:H/VI:N/VA:N
Score:    5.5 (MEDIUM)
Rationale: Requires malicious app co-installed, basic permissions
```

### WebView XSS with Cookie Theft

```
Vector:   AV:N/AC:L/AT:N/PR:N/UI:A/VC:L/VI:L/VA:N/SC:H/SI:H/SA:N
Score:    7.8 (HIGH)
Rationale: Network-deliverable, active UI (click required), subsequent system impact
```

### Cleartext HTTP Traffic

```
Vector:   AV:A/AC:H/AT:N/PR:N/UI:P/VC:L/VI:N/VA:N
Score:    3.4 (LOW)
Rationale: Adjacent network, high complexity (MITM), passive UI
```

### Missing Certificate Pinning

```
Vector:   AV:A/AC:H/AT:N/PR:N/UI:P/VC:L/VI:L/VA:N
Score:    4.1 (MEDIUM)
Rationale: Adjacent network, high complexity (CA compromise), passive UI
```

### Path Traversal (External Storage)

```
Vector:   AV:L/AC:L/AT:N/PR:L/UI:A/VC:N/VI:H/VA:L
Score:    5.3 (MEDIUM)
Rationale: Local access, active UI, no confidentiality, high integrity
```

### Broadcast Receiver (No Permission)

```
Vector:   AV:L/AC:L/AT:N/PR:L/UI:N/VC:N/VI:H/VA:L
Score:    5.6 (MEDIUM)
Rationale: Local app required, no auth, integrity impact
```

### Intent Redirection (Activity Hijacking)

```
Vector:   AV:L/AC:L/AT:N/PR:L/UI:N/VC:L/VI:L/VA:N
Score:    4.9 (MEDIUM)
Rationale: Local access, straightforward, limited confidentiality/integrity
```

---

## CVSS 4.0 vs 3.1 Key Differences

| Aspect | CVSS 3.1 | CVSS 4.0 |
|--------|----------|----------|
| Scope | S:U / S:C | SC / SI / SA |
| User Interaction | None / Required | None / Passive / Active |
| Attack Requirements | Part of AC | New mandatory metric AT |
| Vector Prefix | CVSS:3.1 | CVSS:4.0 |
| AC Values | Low / High | Low / High |
| PR Values | None / Low / High | None / Low / High |
| UI Values | None / Required | None / Passive / Active |

---

## Severity-to-Priority Mapping

| Severity | Priority | Remediation | Example Android Issues |
|----------|----------|-------------|------------------------|
| CRITICAL (9.0-10.0) | Immediate | 0-7 days | RCE, hardcoded prod credentials, auth bypass |
| HIGH (7.0-8.9) | Urgent | 1-30 days | XSS, SQLi, path traversal, intent injection |
| MEDIUM (4.0-6.9) | Standard | 30-90 days | Insecure storage, weak crypto, cleartext HTTP |
| LOW (0.1-3.9) | Low | 90+ days | Info disclosure, debug flags, minor hardening |

---

## OWASP Mobile Top 10 CVSS Ranges

| Category | Typical Range | Most Severe |
|----------|--------------|-------------|
| M1: Improper Credential Usage | 6.0 - 9.5 | Hardcoded API keys |
| M2: Supply Chain | 5.0 - 8.0 | Vulnerable SDK |
| M3: Insecure Auth | 6.5 - 9.5 | Auth bypass |
| M4: Insufficient Input Validation | 4.0 - 7.5 | SQL injection |
| M5: Insecure Communication | 4.0 - 7.0 | No TLS pinning |
| M6: Inadequate Privacy | 5.0 - 8.0 | Excessive data collection |
| M7: Insufficient Binary Protections | 3.0 - 6.0 | No obfuscation |
| M8: Security Misconfiguration | 5.0 - 9.0 | Debug enabled |
| M9: Insecure Data Storage | 5.0 - 8.0 | Plaintext SharedPrefs |
| M10: Insufficient Cryptography | 4.0 - 7.5 | DES/MD5 usage |

---

## Calculator Resources

- **Official Calculator**: https://www.first.org/cvss/calculator/4.0
- **Specification**: https://www.first.org/cvss/v4.0/specification-document
- **User Guide**: https://www.first.org/cvss/v4.0/user-guide
