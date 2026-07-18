# Hard Exclusion Patterns (Regex-Based)

Pre-compiled regex patterns for the **first-pass, fast filter** applied before any AI-based analysis.

---

## How It Works

For each security finding, the **title** and **description** are concatenated and checked against these patterns. If any pattern matches, the finding is automatically excluded.

Additionally, **file-level rules** apply:
- Findings in **Markdown files** (`.md`) are unconditionally excluded.
- **Memory safety** findings are excluded unless the file is C/C++ (`.c`, `.cc`, `.cpp`, `.h`).
- **SSRF** findings are excluded if the file is an HTML file (`.html`).

---

## Pattern Groups

### 1. DOS / Resource Exhaustion

**Exclusion Reason**: `Generic DOS/resource exhaustion finding (low signal)`

```regex
\b(denial of service|dos attack|resource exhaustion)\b                    [IGNORECASE]
\b(exhaust|overwhelm|overload).*?(resource|memory|cpu)\b                  [IGNORECASE]
\b(infinite|unbounded).*?(loop|recursion)\b                               [IGNORECASE]
```

### 2. Rate Limiting

**Exclusion Reason**: `Generic rate limiting recommendation`

```regex
\b(missing|lack of|no)\s+rate\s+limit                                    [IGNORECASE]
\brate\s+limiting\s+(missing|required|not implemented)                    [IGNORECASE]
\b(implement|add)\s+rate\s+limit                                         [IGNORECASE]
\bunlimited\s+(requests|calls|api)                                       [IGNORECASE]
```

### 3. Resource Management

**Exclusion Reason**: `Resource management finding (not a security vulnerability)`

```regex
\b(resource|memory|file)\s+leak\s+potential                              [IGNORECASE]
\bunclosed\s+(resource|file|connection)                                   [IGNORECASE]
\b(close|cleanup|release)\s+(resource|file|connection)                    [IGNORECASE]
\bpotential\s+memory\s+leak                                              [IGNORECASE]
\b(database|thread|socket|connection)\s+leak                              [IGNORECASE]
```

### 4. Open Redirect

**Exclusion Reason**: `Open redirect vulnerability (not high impact)`

```regex
\b(open redirect|unvalidated redirect)\b                                 [IGNORECASE]
\b(redirect.(attack|exploit|vulnerability))\b                            [IGNORECASE]
\b(malicious.redirect)\b                                                 [IGNORECASE]
```

### 5. Memory Safety (non-C/C++ only)

**Exclusion Reason**: `Memory safety finding in non-C/C++ code (not applicable)`

> Only applied when file extension is NOT in {`.c`, `.cc`, `.cpp`, `.h`}

```regex
\b(buffer overflow|stack overflow|heap overflow)\b                        [IGNORECASE]
\b(oob)\s+(read|write|access)\b                                          [IGNORECASE]
\b(out.?of.?bounds?)\b                                                   [IGNORECASE]
\b(memory safety|memory corruption)\b                                    [IGNORECASE]
\b(use.?after.?free|double.?free|null.?pointer.?dereference)\b           [IGNORECASE]
\b(segmentation fault|segfault|memory violation)\b                       [IGNORECASE]
\b(bounds check|boundary check|array bounds)\b                           [IGNORECASE]
\b(integer overflow|integer underflow|integer conversion)\b              [IGNORECASE]
\barbitrary.?(memory read|pointer dereference|memory address|memory pointer)\b [IGNORECASE]
```

### 6. Regex Injection / ReDoS

**Exclusion Reason**: `Regex injection finding (not applicable)`

```regex
\b(regex|regular expression)\s+injection\b                               [IGNORECASE]
\b(regex|regular expression)\s+denial of service\b                       [IGNORECASE]
\b(regex|regular expression)\s+flooding\b                                [IGNORECASE]
```

### 7. SSRF (HTML files only)

**Exclusion Reason**: `SSRF finding in HTML file (not applicable to client-side code)`

> Only applied when file extension is `.html`

```regex
\b(ssrf|server\s+.?side\s+.?request\s+.?forgery)\b                      [IGNORECASE]
```

---

## File-Level Rules Summary

| File Extension | Rule |
|---------------|------|
| `.md` | **All findings excluded** — "Finding in Markdown documentation file" |
| NOT `.c`, `.cc`, `.cpp`, `.h` | Memory safety findings excluded |
| `.html` | SSRF findings excluded |

---

## Implementation Reference

In Python, these patterns are pre-compiled using `re.compile()` with `re.IGNORECASE` flag:

```python
import re
from typing import List, Pattern

_DOS_PATTERNS: List[Pattern] = [
    re.compile(r'\b(denial of service|dos attack|resource exhaustion)\b', re.IGNORECASE),
    re.compile(r'\b(exhaust|overwhelm|overload).*?(resource|memory|cpu)\b', re.IGNORECASE),
    re.compile(r'\b(infinite|unbounded).*?(loop|recursion)\b', re.IGNORECASE),
]

# Check a finding:
def should_exclude(title: str, description: str) -> bool:
    combined = f"{title} {description}".lower()
    for pattern in _DOS_PATTERNS:
        if pattern.search(combined):
            return True
    return False
```
