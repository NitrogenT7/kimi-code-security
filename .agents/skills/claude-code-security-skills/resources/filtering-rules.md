# False Positive Filtering Rules

This document contains the complete false positive filtering rule set. Use these rules to evaluate and filter findings produced by the security audit.

---

## Filtering Role

When filtering findings, act as a security expert reviewing results from a code audit.
Your task is to filter out false positives and low-signal findings to reduce alert fatigue.
You must maintain high recall (don't miss real vulnerabilities) while improving precision.

---

## Hard Exclusions

Automatically exclude findings matching these patterns:

1. **Denial of Service (DOS)** vulnerabilities or resource exhaustion attacks.
2. **Secrets/credentials stored on disk** — these are managed separately.
3. **Rate limiting concerns** or service overload scenarios. Services do not need to implement rate limiting.
4. **Memory consumption or CPU exhaustion** issues.
5. **Lack of input validation** on non-security-critical fields without proven security impact.
6. **Input sanitization concerns for CI/CD workflows** unless they are clearly triggerable via untrusted input.
7. **Lack of hardening measures.** Code is not expected to implement all security best practices, just avoid obvious vulnerabilities.
8. **Race conditions or timing attacks** that are theoretical rather than practical. Only report if extremely problematic.
9. **Outdated third-party libraries.** These are managed separately and should not be reported here.
10. **Memory safety issues in memory-safe languages.** Buffer overflows, use-after-free etc. are impossible in Rust, Go, Java, Python, etc. Do not report memory safety issues in these languages.
11. **Test files.** Files that are only unit tests or only used as part of running tests.
12. **Log spoofing.** Outputting un-sanitized user input to logs is not a vulnerability.
13. **SSRF controlling only the path.** SSRF is only a concern if it can control the host or protocol.
14. **AI prompt injection.** Including user-controlled content in AI system prompts is not a vulnerability.
15. **Regex injection.** Injecting untrusted content into a regex is not a vulnerability. Regex DOS is also excluded.
16. **Insecure documentation.** Do not report findings in documentation files such as markdown files.
17. **Missing audit logs.** A lack of audit logs is not a vulnerability.
18. **Unavailable internal dependencies.** Depending on internal libraries that are not publicly available is not a vulnerability.
19. **Non-vulnerability crashes.** Code that crashes (e.g., undefined or null variable) but is not actually a vulnerability.

---

## Precedents

Specific guidance for common security patterns:

1. **Logging secrets**: Logging high-value secrets in plaintext is a vulnerability. Logging URLs is assumed to be safe. Logging request headers is assumed to be dangerous since they likely contain credentials.
2. **UUIDs**: Can be assumed to be unguessable and do not need to be validated. If a vulnerability requires guessing a UUID, it is not valid.
3. **Audit logs**: Are not a critical security feature and should not be reported as a vulnerability if missing or modified.
4. **Environment variables and CLI flags**: Are trusted values. Attackers are not able to modify them in a secure environment. Any attack that relies on controlling an environment variable is invalid.
5. **Resource management**: Issues such as memory or file descriptor leaks are not valid vulnerabilities.
6. **Low-impact web vulnerabilities**: Tabnabbing, XS-Leaks, prototype pollution, and open redirects should not be reported unless extremely high confidence.
7. **Outdated libraries**: Managed separately; do not report.
8. **React/Angular XSS**: These frameworks are generally secure against XSS. Do not report XSS unless using `dangerouslySetInnerHTML`, `bypassSecurityTrustHtml`, or similar unsafe methods.
9. **CI/CD workflows**: Most vulnerabilities in CI/CD workflow files are not exploitable in practice. Before validating, ensure it is concrete with a very specific attack path.
10. **Client-side JS/TS permission checks**: A lack of permission checking or authentication in client-side code is not a vulnerability. Client-side code is not trusted. Backend is responsible for validation. Same applies for path-traversal and SSRF in client-side JS.
11. **MEDIUM findings**: Only include if they are obvious and concrete issues.
12. **Jupyter notebooks (*.ipynb)**: Most vulnerabilities are not exploitable in practice. Ensure concrete attack path with untrusted input.
13. **Logging non-PII data**: Not a vulnerability even if data may be sensitive. Only report if exposing secrets, passwords, or PII.
14. **Command injection in shell scripts**: Generally not exploitable since shell scripts generally do not run with untrusted user input. Only report if concrete attack path for untrusted input exists.
15. **SSRF in client-side JS/TS**: Not valid since client-side code cannot make server-side requests that bypass firewalls. Only report SSRF in server-side code.
16. **Path traversal in HTTP requests**: Using `../` is generally not a problem when triggering HTTP requests. Only relevant when reading files where `../` may allow accessing unintended files.
17. **Log query injection**: Generally not an issue. Only report if the injection will definitely lead to exposing sensitive data to external users.

---

## Signal Quality Criteria

For remaining findings, assess:

1. Is there a **concrete, exploitable vulnerability** with a clear attack path?
2. Does this represent a **real security risk** vs theoretical best practice?
3. Are there **specific code locations** and reproduction steps?
4. Would this finding be **actionable** for a security team?

---

## Confidence Scoring (1-10 scale)

| Score | Meaning | Action |
|-------|---------|--------|
| 1-3 | Low confidence, likely false positive or noise | **Exclude** |
| 4-6 | Medium confidence, needs investigation | **Exclude** (unless very concrete) |
| 7-10 | High confidence, likely true vulnerability | **Keep** |

> **Threshold**: Only keep findings with confidence score ≥ 7.

---

## Single Finding Analysis

For each finding, determine:

- **Severity**: The severity from the original finding (HIGH / MEDIUM / LOW)
- **Confidence Score**: 1-10 score based on criteria above
- **Keep or Exclude**: Whether to keep or exclude the finding
- **Exclusion Reason**: If excluded, the reason
- **Justification**: Explanation of the decision
