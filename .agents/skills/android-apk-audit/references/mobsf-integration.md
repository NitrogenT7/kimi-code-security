# MobSF Integration Guide

## Overview

Mobile Security Framework (MobSF) is an automated, all-in-one mobile application security assessment framework capable of performing static and dynamic analysis.

**Repository**: https://github.com/MobSF/Mobile-Security-Framework-MobSF
**Version**: Actively maintained (verify latest at https://github.com/MobSF/Mobile-Security-Framework-MobSF/releases)
**Stars**: 20.7k+ | **Forks**: 3.6k+ | **License**: GPL-3.0

**Key Features**:
- Static analysis (Android)
- Dynamic analysis (Android)
- Malware analysis
- Web API fuzzing
- REST API for CI/CD integration
- CVSS scoring
- OWASP Mobile Top 10 mapping

## Installation

### Docker (Recommended)

```bash
# Pull latest image
docker pull opensecurity/mobile-security-framework-mobsf:latest

# Run container with persistent storage
docker run -it --rm \
    -p 8000:8000 \
    -v $(pwd)/mobsf_data:$HOME/.MobSF \
    --name mobsf \
    opensecurity/mobile-security-framework-mobsf:latest

# Access: http://localhost:8000
# Default credentials: mobsf / mobsf
```

### Local Installation (Linux/macOS)

```bash
# Clone repository
git clone https://github.com/MobSF/Mobile-Security-Framework-MobSF.git
cd Mobile-Security-Framework-MobSF

# Install dependencies
./setup.sh

# Run MobSF
./run.sh
```

### Local Installation (Windows)

```cmd
REM Clone repository
git clone https://github.com/MobSF/Mobile-Security-Framework-MobSF.git
cd Mobile-Security-Framework-MobSF

REM Install dependencies
setup.bat

REM Run MobSF
run.bat
```

## REST API v1

### Authentication

MobSF supports two authentication methods:

```bash
# Method 1: X-Mobsf-Api-Key header (MobSF-specific)
curl -H "X-Mobsf-Api-Key: YOUR_API_KEY" http://localhost:8000/api/v1/upload

# Method 2: Authorization Bearer header (Standard)
curl -H "Authorization: Bearer YOUR_API_KEY" http://localhost:8000/api/v1/upload
```

**Get API Key**:
```bash
# From running container
docker exec -it mobsf python manage.py api_key

# Or from local installation
python manage.py api_key

# Or check settings file
cat ~/.local/share/MobSF/tools/key.txt  # Linux
cat ~/Library/Application\ Support/MobSF/tools/key.txt  # macOS
```

### Core Endpoints

| Endpoint | Method | Purpose | Parameters |
|----------|--------|---------|-----------|
| `/api/v1/upload` | POST | Upload APK | `file` (binary) |
| `/api/v1/scan` | POST | Trigger scan | `file_hash` (MD5), `scan_type` |
| `/api/v1/report_json` | GET | JSON report | `file_hash` (MD5) |
| `/api/v1/download_pdf` | GET | PDF report | `file_hash` (MD5) |
| `/api/v1/delete_scan` | POST | Delete scan | `hash` (MD5) |
| `/api/v1/scans` | GET | List recent scans | None |
| `/api/v1/compare` | POST | Compare scans | `hash1`, `hash2` |
| `/api/v1/scorecard` | GET | AppSec scorecard | `hash` |

### Complete Workflow Example

```bash
#!/bin/bash
# MobSF Automated Scan Workflow

API_KEY="YOUR_API_KEY"
MOBSF_URL="http://localhost:8000"

# Step 1: Upload APK
echo "[1/5] Uploading APK..."
HASH=$(curl -s -X POST \
    -H "X-Mobsf-Api-Key: $API_KEY" \
    -F "file=@app.apk" \
    "$MOBSF_URL/api/v1/upload" | jq -r '.hash')

echo "Uploaded. Hash: $HASH"

# Step 2: Trigger scan
echo "[2/5] Starting scan..."
SCAN_RESULT=$(curl -s -X POST \
    -H "X-Mobsf-Api-Key: $API_KEY" \
    -d "file_hash=$HASH" \
    -d "scan_type=apk" \
    "$MOBSF_URL/api/v1/scan")

echo "Scan completed"

# Step 3: Get JSON report
echo "[3/5] Fetching JSON report..."
curl -s -H "X-Mobsf-Api-Key: $API_KEY" \
    "$MOBSF_URL/api/v1/report_json?file_hash=$HASH" \
    > mobsf_report.json

# Step 4: Download PDF report
echo "[4/5] Downloading PDF report..."
curl -s -H "X-Mobsf-Api-Key: $API_KEY" \
    "$MOBSF_URL/api/v1/download_pdf?file_hash=$HASH" \
    -o mobsf_report.pdf

# Step 5: Cleanup
echo "[5/5] Cleaning up..."
curl -s -X POST \
    -H "X-Mobsf-Api-Key: $API_KEY" \
    -d "hash=$HASH" \
    "$MOBSF_URL/api/v1/delete_scan"

echo "Done!"
```

### Dynamic Analysis Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/v1/dynamic/get_apps` | POST | List installed apps |
| `/api/v1/dynamic/start_analysis` | POST | Start dynamic analysis |
| `/api/v1/dynamic/stop_analysis` | POST | Stop analysis |
| `/api/v1/dynamic/report_json` | GET | Dynamic analysis report |
| `/api/v1/android/logcat` | POST | Get logcat output |
| `/api/v1/android/adb_command` | POST | Execute ADB command |
| `/api/v1/android/activity` | POST | Test activities |
| `/api/v1/android/tls_tests` | POST | Run TLS tests |

### Frida Integration

```bash
# List available Frida scripts
curl -X POST \
    -H "X-Mobsf-Api-Key: $API_KEY" \
    "$MOBSF_URL/api/v1/frida/list_scripts"

# Get specific script content
curl -X POST \
    -H "X-Mobsf-Api-Key: $API_KEY" \
    -d "script=ssl_pinning_bypass.js" \
    "$MOBSF_URL/api/v1/frida/get_script"

# Start instrumentation
curl -X POST \
    -H "X-Mobsf-Api-Key: $API_KEY" \
    -d "hash=$HASH" \
    -d "default_hooks=true" \
    -d "hooks=ssl_pinning,root_bypass" \
    "$MOBSF_URL/api/v1/frida/instrument"

# Get Frida logs
curl -X POST \
    -H "X-Mobsf-Api-Key: $API_KEY" \
    -d "hash=$HASH" \
    "$MOBSF_URL/api/v1/frida/logs"
```

## What MobSF Detects Automatically

### Static Analysis (Android)

| Category | Checks | Accuracy |
|----------|--------|----------|
| **Manifest Analysis** | Exported components, permissions, debuggable flag, backup settings | High |
| **Hardcoded Secrets** | API keys, passwords, JWT tokens, AWS credentials | Medium (many FPs) |
| **Insecure Configurations** | Debug logs, weak crypto, SQL injection patterns, insecure WebViews | High |
| **Certificate Pinning** | NetworkSecurityConfig analysis, custom trust managers | High |
| **Crypto Weaknesses** | Insecure algorithms (MD5, SHA1), hardcoded keys, weak encryption | High |
| **Code Quality** | Obfuscation detection, packer identification, code smells | Medium |

### Dynamic Analysis

| Category | Capabilities | Limitations |
|----------|-------------|-------------|
| **Network Traffic** | HTTP/HTTPS interception via proxy | Custom protocols need manual setup |
| **File System** | SharedPrefs, databases, file access | Requires root/debuggable device |
| **Logs** | Logcat monitoring | Filtered by MobSF agent |
| **Frida Hooks** | Pre-built scripts for common bypasses | May trigger anti-tampering |

## MobSF Limitations

| Limitation | Why Manual? | Solution |
|------------|-------------|----------|
| **Business logic flaws** | Requires understanding app-specific logic | Manual testing with Frida hooks |
| **Source-to-sink tracing** | Traces across libraries need filtering | Use JADX + manual trace |
| **Anti-tampering** | MobSF triggers protections | Bypass before MobSF scan |
| **Deep obfuscation** | Limited deobfuscation | JADX + manual analysis |
| **Custom protocols** | Non-HTTP traffic not analyzed | Wireshark + custom parsers |

## mobsfscan for CI/CD

### Installation

```bash
pip install mobsfscan
```

### Command-Line Usage

```bash
# Basic scan
mobsfscan app.apk

# With MobSF server
mobsfscan app.apk \
    --api-key $MOBSF_API_KEY \
    --server http://mobsf-server:8000

# JSON output
mobsfscan app.apk --format json > results.json

# Fail on threshold
mobsfscan app.apk --threshold high

# Specify rules
mobsfscan app.apk --rules ./custom_rules.json
```

### GitHub Actions Example

```yaml
name: MobSF Security Scan

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  security-scan:
    runs-on: ubuntu-latest

    services:
      mobsf:
        image: opensecurity/mobile-security-framework-mobsf:latest
        ports:
          - 8000:8000
        env:
          MOBSF_API_ONLY: 1
          MOBSF_DISABLE_AUTHENTICATION: 0

    steps:
      - uses: actions/checkout@v4

      - name: Set up Python 3.11
        uses: actions/setup-python@v5
        with:
          python-version: '3.11'

      - name: Install mobsfscan
        run: pip install mobsfscan

      - name: Build APK
        run: |
          ./gradlew assembleDebug
          find app/build/outputs -name "*.apk" -exec mv {} app-debug.apk \;

      - name: Wait for MobSF
        run: |
          timeout 60 bash -c 'until curl -s http://localhost:8000/api_docs; do sleep 2; done'

      - name: Run MobSF scan
        env:
          MOBSF_API_KEY: ${{ secrets.MOBSF_API_KEY }}
        run: |
          mobsfscan app-debug.apk \
            --api-key "${MOBSF_API_KEY}" \
            --server http://localhost:8000 \
            --format json \
            --output mobsf-results.json \
            --threshold high

      - name: Upload security report
        uses: actions/upload-artifact@v4
        with:
          name: mobsf-report
          path: mobsf-results.json

      - name: Security gate
        run: |
          # Fail if high/critical vulnerabilities found
          if grep -q '"severity": "high"' mobsf-results.json; then
            echo "High severity vulnerabilities found!"
            exit 1
          fi
```

### GitLab CI Example

```yaml
# .gitlab-ci.yml
stages:
  - build
  - security

mobsf-scan:
  stage: security
  image: python:3.11
  services:
    - name: opensecurity/mobile-security-framework-mobsf:latest
      alias: mobsf
  variables:
    MOBSF_API_KEY: $MOBSF_API_KEY
  before_script:
    - pip install mobsfscan
  script:
    - mobsfscan app.apk
        --api-key "$MOBSF_API_KEY"
        --server http://mobsf:8000
        --format json
        --output mobsf-results.json
  artifacts:
    paths:
      - mobsf-results.json
    expire_in: 1 week
```

## API-Only Mode

For CI/CD and headless environments:

```bash
# Set environment variable
export MOBSF_API_ONLY=1

# Run with API-only mode
docker run -d \
    -e MOBSF_API_ONLY=1 \
    -e MOBSF_SECRET_KEY=your_random_secret_key \
    -p 8000:8000 \
    --name mobsf-api \
    opensecurity/mobile-security-framework-mobsf:latest

# Only REST API endpoints available
# No Web UI access
```

## Integration Workflow

### Workflow 1: Fast Initial Scan + Manual Deep Dive

```
┌─────────────────┐
│ Upload APK to   │
│ MobSF           │
└────────┬────────┘
         │
         v
┌─────────────────┐
│ Automated Scan │
│ (Manifest,     │
│  Secrets, etc)  │
│ ~2-5 minutes    │
└────────┬────────┘
         │
         v
┌─────────────────┐
│ Review Report  │
│ Identify       │
│ quick wins     │
└────────┬────────┘
         │
         v
┌─────────────────┐
│ Manual Focus   │
│ - Exploit      │
│   exported     │
│ - Trace data   │
│   flow         │
│ - Test custom  │
│   protocols    │
│ - Business     │
│   logic        │
└─────────────────┘
```

### Workflow 2: Parallel Analysis

```bash
#!/bin/bash
# Parallel MobSF + Manual Analysis

# Terminal 1: MobSF automated scan
curl -X POST \
    -H "X-Mobsf-Api-Key: $API_KEY" \
    -F "file=@app.apk" \
    http://localhost:8000/api/v1/upload

# Terminal 2: Manual JADX decompilation
jadx -d jadx_output \
    -v \
    --deobf \
    app.apk &

# Terminal 3: Manual dynamic analysis
frida -U -f com.target.app \
    -l hooks.js \
    &

# Wait for MobSF scan to complete
# Then correlate findings
```

### Workflow 3: Correlation Method

```python
#!/usr/bin/env python3
"""
Correlate MobSF findings with manual analysis
"""

import json
import subprocess

def correlate_findings(mobsf_report, manual_findings):
    # Load MobSF report
    with open(mobsf_report) as f:
        mobsf = json.load(f)

    # Extract MobSF findings
    mobsf_vulns = []

    # Check for exported components
    if 'manifest_analysis' in mobsf:
        for finding in mobsf['manifest_analysis']:
            if finding.get('exported'):
                mobsf_vulns.append({
                    'type': 'exported_component',
                    'component': finding['component'],
                    'source': 'mobsf'
                })

    # Check for hardcoded secrets
    if 'secrets' in mobsf:
        for secret in mobsf['secrets']:
            mobsf_vulns.append({
                'type': 'hardcoded_secret',
                'location': secret['location'],
                'source': 'mobsf'
            })

    # Correlate with manual findings
    for manual in manual_findings:
        # Check if manual finding overlaps with MobSF
        for mobsf_vuln in mobsf_vulns:
            if manual.get('component') == mobsf_vuln.get('component'):
                manual['mobsf_verified'] = True

    return {
        'mobsf_findings': mobsf_vulns,
        'manual_findings': manual_findings,
        'correlation': 'completed'
    }

# Use with Android APK Skill workflow
```

## Comparison: MobSF vs Manual Skill

| Aspect | MobSF | Android APK Skill |
|--------|-------|-------------------|
| **Speed** | Fast (2-5 min) | Slower (hours) |
| **Coverage** | Broad (many checks) | Deep (targeted) |
| **Business Logic** | ❌ No | ✅ Yes |
| **Source-to-Sink** | ⚠️ Limited | ✅ Full control |
| **Custom Protocols** | ❌ No | ✅ Yes |
| **Anti-Tampering Bypass** | ❌ Triggers alerts | ✅ Can bypass |
| **CVSS Scoring** | Basic | CVSS 4.0 accurate |
| **Report Format** | HTML/PDF | Customizable |
| **CI/CD Integration** | ✅ Native | ⚠️ Manual |
| **Cost** | Free | Time investment |

## Best Practices

### 1. Use MobSF as First Pass

```bash
# Always start with MobSF for quick wins
mobsfscan app.apk --threshold high

# Then dive deeper with manual analysis
jadx -d output app.apk
frida -U -f com.target.app -l deep-analysis.js
```

### 2. Filter MobSF False Positives

```json
// custom_suppressions.json
{
  "suppressions": [
    {
      "rule": "hardcoded_api_key",
      "files": ["*/build/*", "*/generated/*"],
      "reason": "Build artifacts"
    },
    {
      "rule": "exported_activity",
      "components": ["*.MainActivity"],
      "reason": "Intentionally exported"
    }
  ]
}
```

### 3. Combine Reports

```bash
# Merge MobSF JSON with manual findings
jq -s '.[0] * .[1]' mobsf_report.json manual_findings.json > combined_report.json
```

### 4. Automate Repetitive Tasks

```bash
#!/bin/bash
# Reusable MobSF workflow

for apk in apks/*.apk; do
    echo "Scanning $apk..."

    HASH=$(curl -s -X POST \
        -H "X-Mobsf-Api-Key: $API_KEY" \
        -F "file=@$apk" \
        "$MOBSF_URL/api/v1/upload" | jq -r '.hash')

    curl -s -X POST \
        -H "X-Mobsf-Api-Key: $API_KEY" \
        -d "file_hash=$HASH" \
        "$MOBSF_URL/api/v1/scan" > /dev/null

    curl -s -H "X-Mobsf-Api-Key: $API_KEY" \
        "$MOBSF_URL/api/v1/report_json?file_hash=$HASH" \
        > "reports/$(basename $apk .apk)_mobsf.json"

    curl -s -X POST \
        -H "X-Mobsf-Api-Key: $API_KEY" \
        -d "hash=$HASH" \
        "$MOBSF_URL/api/v1/delete_scan" > /dev/null
done
```

## Troubleshooting

| Issue | Cause | Solution |
|-------|-------|----------|
| **Upload fails** | File too large | Increase `DATA_UPLOAD_MAX_MEMORY_SIZE` in settings |
| **Scan hangs** | Emulator not ready | Wait for emulator boot |
| **API key invalid** | Wrong key | Re-generate with `python manage.py api_key` |
| **No dynamic analysis** | Root required | Use Genymotion or rooted AVD |
| **Frida not working** | Wrong Frida version | Match Frida client/server versions |

## References

- [MobSF GitHub Repository](https://github.com/MobSF/Mobile-Security-Framework-MobSF)
- [MobSF Documentation](https://mobsf.github.io/docs)
- [mobsfscan PyPI](https://pypi.org/project/mobsfscan/)
- [Docker Hub](https://hub.docker.com/r/opensecurity/mobile-security-framework-mobsf)
- [REST API Reference](https://zread.ai/MobSF/Mobile-Security-Framework-MobSF/24-rest-api-endpoints-reference)