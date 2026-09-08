---
name: code-security-review
description: "Scans source code for security vulnerabilities — injection flaws, authentication bypasses, hardcoded secrets, XSS, and more — then filters false positives and ranks findings by severity and confidence. Supports all programming languages. Uses a three-phase audit-filter-report workflow with customizable scan categories and filtering rules. Use when the user asks for a security review, vulnerability scan, security audit, code security check, or wants to find security bugs in their code."
---

# Code Security Review Skill

This skill follows a strictly ordered, three-phase process: audit, filter, then report. Complete all phases in sequence — do not report findings until filtering is complete.

---

## Skill Components

Before starting, read all of the following resource files:

| Resource | Path | Read Requirement |
|----------|------|-----------------|
| **Audit Prompt** | `resources/audit-prompt.md` | MUST read before Phase 1 |
| **Hard Exclusion Patterns** | `resources/hard-exclusion-patterns.md` | MUST read before Phase 2 |
| **False Positive Filtering Rules** | `resources/filtering-rules.md` | MUST read before Phase 2 |
| **Customization Guide** | `resources/customization-guide.md` | Read if project-specific rules are needed |

---

## Execution Process

---

### Phase 1: Security Audit

**Goal:** Produce a raw list of candidate findings. Cast a wide net — do not filter at this stage.

1. Read `resources/audit-prompt.md` before starting analysis.
2. Execute the three-phase analysis defined in that document:
   - **Phase 1a — Codebase Context Research**: Security frameworks, auth patterns, threat model.
   - **Phase 1b — Comparative Analysis**: Compare code against secure patterns, flag deviations.
   - **Phase 1c — Vulnerability Assessment**: Trace data flows, injection points, privilege boundaries.
3. Produce a raw findings list in this internal format (not shown to user yet):

```
RAW FINDING #N
- Title: <short title>
- File: <path:line>
- Category: <e.g. path_traversal, sql_injection, rce>
- Severity: HIGH / MEDIUM / LOW
- Description: <what the bug is>
- Attack Path: <how an attacker exploits it step by step>
```

**Checkpoint:** Phase 1 is complete when you have a full raw findings list (can be 0 items).

---

### Phase 2: Filter Findings

**Goal:** Remove false positives. Apply this phase to every item from Phase 1, even if a finding seems obviously valid.

#### Step 2a — Hard Exclusion Pass

Read `resources/hard-exclusion-patterns.md`. For each raw finding, check:

- Does the title or description match any hard exclusion pattern (DOS, rate limiting, resource management, open redirect, memory safety in non-C/C++, regex injection, SSRF in HTML)?
- Is the file a Markdown (`.md`) file?

If YES → mark finding as **`EXCLUDED (Hard Pattern)`** with the matching rule name.

#### Step 2b — AI Filtering Pass

Read `resources/filtering-rules.md`. For each non-excluded finding, produce this table row:

| # | Title | Hard Excl? | Precedent Hit? | Concrete Attack Path? | Confidence (1-10) | Decision | Reason |
|---|-------|-----------|----------------|-----------------------|-------------------|----------|--------|
| 1 | ... | No | No | Yes | 9 |  KEEP | Directly exploitable, specific code path |
| 2 | ... | No | UUID unguessable (Precedent #2) | Conditional | 5 |  EXCLUDE | UUID ID guessing required |

**Confidence scoring uses the 1-10 scale from `filtering-rules.md`:**

| Score | Meaning | Action |
|-------|---------|--------|
| 1-3 | Low confidence, likely false positive | **EXCLUDE** |
| 4-6 | Medium confidence, needs investigation | **EXCLUDE** (unless very concrete) |
| 7-10 | High confidence, likely true vulnerability | **KEEP** |

**Rule:** Any finding with Confidence < 7 is excluded.

**Checkpoint:** Phase 2 is complete when every raw finding has a row in the filter table with a KEEP/EXCLUDE decision.

---

### Phase 3: Report (Only KEPT findings)

**Goal:** Output only the findings that survived Phase 2 filtering. Output the filter table first, then the detailed findings.

#### Filter Summary Table (always show this)

Show the Phase 2 table so the reader can see the filtering decisions.

#### Detailed Finding Report (only KEPT items)

For each KEPT finding, output:

```
## Vuln N: <Category>: `<file:line>`

* Severity: HIGH / MEDIUM / LOW
* Confidence: <1-10 score> / 10
* Description: <what the vulnerability is>
* Exploit Scenario: <concrete step-by-step attack>
* Recommendation: <specific fix>
```

#### Non-Findings Summary

List EXCLUDED findings briefly:

```
## Excluded Findings (N total)
| # | Title | Reason |
|---|-------|--------|
| 1 | Missing rate limiting | Hard exclusion: rate limiting |
```

---

## Severity Reference

| Severity | Criteria |
|----------|----------|
| **HIGH** | Directly exploitable: RCE, data breach, authentication bypass |
| **MEDIUM** | Requires specific conditions but has significant impact |
| **LOW** | Defense-in-depth issues or lower-impact vulnerabilities |

