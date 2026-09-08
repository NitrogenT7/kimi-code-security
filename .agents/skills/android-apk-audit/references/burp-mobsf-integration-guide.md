---
name: burp-mobsf-integration
description: >
  Integration layer for exporting Android pentest findings to Burp Suite (JSON/SARIF), 
  importing into MobSF for automated analysis, correlating manual findings with automated 
  scans, and generating unified reports combining Burp + MobSF + Frida findings.
  Use when user says "export to Burp", "MobSF integration", "correlate findings", 
  "Burp JSON", "unified report", "combine Burp and MobSF", "SARIF export", 
  "MobSF API scan", or needs to merge findings from multiple Android security tools.
compatibility: Standalone (requires Python3, requests, and access to Burp Suite + MobSF)
allowed-tools: "Bash(python3:*) Bash(curl:*) Read Write Glob"
metadata:
  author: DragonJar Security Team
  version: 1.0.0
  category: reporting
  tags:
    - burp-suite
    - mobsfsync
    - json-export
    - sarif-format
    - unified-report
    - automation
    - api-integration
---

# Burp Suite + MobSF Integration

## IDENTITY

Specialist integration agent that bridges Android pentest findings with professional security tools. Exports vulnerability data to Burp Suite for further manual testing, triggers MobSF automated scans via REST API, correlates findings from multiple sources (manual pentest + MobSF + Frida), and generates unified JSON reports.

## FIRST ACTION — READ CONTEXT

```bash
# Check for existing findings from pentest pipeline
ls -la *.json 2>/dev/null || echo "No JSON files found"
cat pipeline_queue.jsonl 2>/dev/null | head -20 || echo "No pipeline queue found"

# Check for previous reports
ls -la reports/ 2>/dev/null || echo "No reports directory"

# Verify MobSF connectivity
curl -s http://localhost:8000/api/v1/user_data --connect-timeout 5 || echo "MobSF not reachable at localhost:8000"
```

## TRIGGERS DE ACTIVACIÓN

- "export to Burp" / "Burp JSON export" / "export findings to Burp Suite"
- "MobSF integration" / "MobSF API scan" / "upload to MobSF"
- "correlate findings" / "merge Burp and MobSF" / "unified report"
- "SARIF format" / "SARIF export"
- "combine Burp + MobSF + Frida" / "unified Android report"
- "Burp findings JSON" / "MobSF scan results"

## DEPENDENCIAS

### Required Tools
- **Python 3.8+** (`python3 --version`)
- **requests library** (`python3 -c "import requests; print(requests.__version__)"`)
- **curl** (for MobSF API fallback)
- **Burp Suite Professional** (for JSON import via Sitemap)
- **MobSF** (local or cloud instance)

### Installation
```bash
# Install Python dependencies
pip install requests --break-system-packages

# Verify MobSF is running
curl http://localhost:8000/api/v1/user_data

# For remote MobSF instances, set environment variables:
# export MOBSF_URL="https://mobsf.example.com"
# export MOBSF_API_KEY="your-api-key"
```

### Environment Variables
| Variable | Description | Default |
|----------|-------------|---------|
| `MOBSF_URL` | MobSF server URL | `http://localhost:8000` |
| `MOBSF_API_KEY` | MobSF REST API key | ` ` (empty - local instance) |
| `BURP_OUTPUT_DIR` | Output directory for exports | `./burp-exports` |

## INSTRUCCIONES DE USO

### Step 1 — Identify Source Findings

Locate pentest findings from the pipeline:
```bash
# Check for findings in various formats
cat findings.json 2>/dev/null || cat findings.jsonl 2>/dev/null || cat test-findings.json 2>/dev/null
ls -la *.json
```

Supported input formats:
- `pipeline_queue.jsonl` — DRAGONJAR pentest pipeline format
- `findings.json` / `findings.jsonl` — Standard finding export
- `test-findings.json` — Android pentest skill output
- Raw list of findings passed directly in the prompt

### Step 2 — Export to Burp Suite JSON

Convert findings to Burp Suite Professional compatible JSON:

```bash
python3 scripts/burp-findings-export.py \
  --input findings.json \
  --output burp-findings.json \
  --format burp
```

The output JSON follows Burp's Issue Definition format and can be imported via:
- Burp Suite → Project options → Issues → Import issues
- Or use in Burp's Target Site Map for manual verification

### Step 3 — Upload to MobSF

If MobSF is available, trigger automated analysis:

```bash
python3 scripts/mobsf-api-scan.py \
  --apk /path/to/app.apk \
  --scan
```

For existing MobSF installations:
```bash
python3 scripts/mobsf-api-scan.py \
  --hash <mobsf_scan_hash> \
  --report
```

### Step 4 — Correlate Findings

Merge findings from multiple sources:

```bash
python3 scripts/correlate-findings.py \
  --manual findings.json \
  --mobsf mobsf-report.json \
  --frida frida-traces.json \
  --output unified-report.json
```

### Step 5 — Generate Unified Report

The correlation script produces a unified JSON report with:
- Deduplicated findings (same vulnerability from multiple sources merged)
- Source attribution for each finding
- Confidence scoring based on source diversity
- Severity normalization across tools

## INPUT FORMAT

### Pentest Findings (JSON Array)
```json
[
  {
    "id": "VULN-001",
    "title": "Hardcoded API Key",
    "severity": "Critical",
    "confidence": "Confirmed",
    "owasp_category": "M07 - Code Quality",
    "cwe_id": "CWE-798",
    "cvss_4_0_score": "9.1",
    "description": "...",
    "proof_of_concept": "...",
    "remediation": "...",
    "source": "manual-pentest"
  }
]
```

### MobSF Report (JSON)
```json
{
  "scan_results": {
    "app_name": "...",
    "package_name": "...",
    "findings": [...]
  }
}
```

### Frida Traces (JSON)
```json
[
  {
    "type": "hook",
    "target": "com.example.App.method",
    "finding": "...",
    "timestamp": "..."
  }
]
```

## OUTPUT FORMAT

### Burp JSON Export
```json
{
  "issues": [
    {
      "name": "Hardcoded API Key",
      "severity": "Critical",
      "confidence": "Confirmed",
      "host": "android-app",
      "path": "/",
      "issue_background": "...",
      "remediation_background": "...",
      "references": []
    }
  ],
  "tool": "dragojar-burp-export",
  "export_time": "2024-01-15T10:30:00Z"
}
```

### SARIF Export
```json
{
  "runs": [{
    "tool": {
      "driver": {
        "name": "dragojar-android-pentest",
        "version": "1.0.0"
      }
    },
    "results": [...]
  }]
}
```

### Unified Report
```json
{
  "metadata": {
    "generated_at": "2024-01-15T10:30:00Z",
    "sources": ["manual-pentest", "mobsf", "frida"],
    "total_findings": 15,
    "unique_vulnerabilities": 12
  },
  "findings": [
    {
      "id": "VULN-001",
      "title": "...",
      "severity": "Critical",
      "sources": ["manual-pentest", "mobsf"],
      "confirmed": true,
      "merged_from": ["VULN-001", "MOB-042"],
      "evidence": {...}
    }
  ]
}
```

## CORRELATION RULES

1. **Exact Match**: Same CWE + similar description → merge, flag as "Confirmed by multiple sources"
2. **Partial Match**: Same category + different CWE → add as "Related finding"
3. **Source Priority**: manual-pentest > mobsf > frida (for confidence scoring)
4. **Deduplication**: Remove exact duplicates across sources
5. **Severity Escalation**: If any source flags as Critical, merged finding is Critical

## ERROR HANDLING

| Error | Handling |
|-------|----------|
| MobSF unreachable | Log warning, continue with manual findings only |
| Invalid JSON input | Fail fast with clear error message and line number |
| Empty findings array | Return empty report with metadata explaining no findings |
| API timeout | Retry once after 5s, then fail with timeout error |
| Missing required field | Skip finding with warning, continue processing |

## ARCHIVOS ADICIONALES

```
scripts/
├── burp-findings-export.py            # Export findings to Burp JSON/SARIF
├── mobsf-api-scan.py                  # MobSF REST API integration
└── correlate-findings.py              # Correlate findings from multiple sources
```
```

## EJEMPLOS

### Example 1 — Export to Burp JSON
```
Input:  findings.json with 5 Android vulnerabilities
Command: python3 scripts/burp-findings-export.py --input findings.json --output burp-issues.json
Output: burp-issues.json (Burp Suite compatible format)
Usage:  Burp Suite → Project Options → Issues → Import issues from JSON
```

### Example 2 — MobSF API Scan
```
Input:  app.apk for analysis
Command: python3 scripts/mobsf-api-scan.py --apk app.apk --scan --wait
Output: JSON report with MobSF findings
Note:   Requires MobSF running at http://localhost:8000
```

### Example 3 — Generate Unified Report
```
Input:  manual findings + MobSF report + Frida traces
Command: python3 scripts/correlate-findings.py \
  --manual manual-findings.json \
  --mobsf mobsf-report.json \
  --frida frida-output.json \
  --output unified-report.json
Output: unified-report.json with merged, deduplicated findings
```

### Example 4 — SARIF Export for CI/CD
```
Input:  findings.json
Command: python3 scripts/burp-findings-export.py --input findings.json --output sarif-report.json --format sarif
Output: SARIF format suitable for GitHub Security tab integration
```

## MANEJO DE ERRORES

### Common Issues

1. **MobSF Connection Refused**
   ```
   Error: Cannot connect to MobSF at http://localhost:8000
   Action: Verify MobSF is running with: curl http://localhost:8000/api/v1/user_data
   Fallback: Continue with manual findings only, mark MobSF sources as "unavailable"
   ```

2. **Invalid Input Format**
   ```
   Error: JSON decode error at line 42
   Action: Validate JSON before processing with: python3 -m json.tool input.json > /dev/null
   ```

3. **Empty Results**
   ```
   Result: Empty unified report
   Action: Return report with metadata showing 0 findings, explanation field
   ```

4. **API Rate Limiting**
   ```
   Error: MobSF API returned 429
   Action: Implement 10-second delay between requests, retry up to 3 times
   ```

## INTEGRATION WITH PENTEST PIPELINE

This skill integrates with the DRAGONJAR pentest pipeline:

1. **Input Source**: Reads from `pipeline_queue.jsonl` or passed findings
2. **Processing**: Adds Burp-compatible exports and MobSF correlation
3. **Output**: Updates `pipeline_queue.jsonl` with new finding status (e.g., `exported_to_burp: true`)
4. **Report Generation**: Produces unified reports for the final pentest report

## NOTES

- All scripts support `--help` for usage information
- Use `--verbose` flag for detailed debugging output
- Environment variables can replace command-line arguments for repeated operations
- Timeouts are set to 30 seconds for network operations to prevent hanging