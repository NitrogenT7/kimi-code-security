# Automation Scripts for Android Pentesting

This document provides CLI automation patterns, bash scripts, and Python automation for streamlining Android security assessments.

> **Note on aapt vs aapt2**: This document uses `aapt` for read-only operations (metadata, permissions, manifest). For build operations, use `aapt2`. See `references/quick-commands.md#tool-version-notes`.

---

## 1. Bash Automation Patterns

### 1.1 Batch APK Analysis Loop

```bash
#!/bin/bash
# batch-analyze.sh - Analyze multiple APKs in parallel

APK_DIR="${1:-./apks}"
OUTPUT_DIR="${2:-./analysis}"
LOG_FILE="$OUTPUT_DIR/batch-analysis.log"
PARALLEL_JOBS="${3:-4}"

# Create output directory
mkdir -p "$OUTPUT_DIR"

# Initialize log
echo "[$(date '+%Y-%m-%d %H:%M:%S')] Starting batch analysis" | tee "$LOG_FILE"
echo "APK Directory: $APK_DIR" | tee -a "$LOG_FILE"
echo "Output Directory: $OUTPUT_DIR" | tee -a "$LOG_FILE"
echo "Parallel Jobs: $PARALLEL_JOBS" | tee -a "$LOG_FILE"
echo "----------------------------------------" | tee -a "$LOG_FILE"

# Check dependencies before running
check_dependencies() {
    local missing=()

    command -v apktool >/dev/null 2>&1 || missing+=("apktool")
    command -v jadx >/dev/null 2>&1 || missing+=("jadx")
    command -v frida >/dev/null 2>&1 || missing+=("frida")
    command -v objection >/dev/null 2>&1 || missing+=("objection")
    command -v apkid >/dev/null 2>&1 || missing+=("apkid")

    if [ ${#missing[@]} -gt 0 ]; then
        echo "Missing dependencies: ${missing[*]}"
        echo "Install with: apt install ${missing[*]}"
        exit 1
    fi
}

# Analyze single APK
analyze_apk() {
    local apk="$1"
    local basename=$(basename "$apk" .apk)
    local output="$OUTPUT_DIR/$basename"

    echo "[$(date '+%Y-%m-%d %H:%M:%S')] Processing: $apk" | tee -a "$LOG_FILE"

    # Create app-specific directory
    mkdir -p "$output"

    # 1. Extract with apktool
    echo "[*] Decompiling with apktool..." | tee -a "$LOG_FILE"
    apktool d "$apk" -o "$output/decoded" -f 2>&1 | tee -a "$LOG_FILE"

    # 2. Decompile with jadx
    echo "[*] Decompiling with jadx..." | tee -a "$LOG_FILE"
    jadx -d "$output/jadx" --deobf "$apk" 2>&1 | tee -a "$LOG_FILE"

    # 3. Framework detection with apkid
    echo "[*] Detecting framework..." | tee -a "$LOG_FILE"
    apkid "$apk" > "$output/framework-detection.txt" 2>&1

    # 4. Extract manifests and permissions
    # Note: aapt valid for read ops. See quick-commands.md#aapt-vs-aapt2
    echo "[*] Extracting manifest..." | tee -a "$LOG_FILE"
    aapt dump permissions "$apk" > "$output/permissions.txt" 2>&1
    aapt dump badging "$apk" > "$output/badging.txt" 2>&1

    # 5. Generate summary
    echo "[*] Generating summary..." | tee -a "$LOG_FILE"
    cat > "$output/summary.txt" << EOF
APK: $apk
Package: $(grep -oP 'package: name=\K[^ ]+' "$output/badging.txt" 2>/dev/null || echo 'Unknown')
Min SDK: $(grep -oP 'sdkVersion:\K[^ ]+' "$output/badging.txt" 2>/dev/null || echo 'Unknown')
Target SDK: $(grep -oP 'targetSdkVersion:\K[^ ]+' "$output/badging.txt" 2>/dev/null || echo 'Unknown')
Permissions: $(wc -l < "$output/permissions.txt" 2>/dev/null || echo '0')
Framework: $(cat "$output/framework-detection.txt" 2>/dev/null | head -5)
EOF

    echo "[✓] Completed: $basename" | tee -a "$LOG_FILE"
}

# Export function for parallel execution
export -f analyze_apk
export OUTPUT_DIR LOG_FILE

# Main execution
check_dependencies

# Find all APKs and process in parallel
find "$APK_DIR" -name "*.apk" -type f | sort | parallel -j "$PARALLEL_JOBS" analyze_apk {}

echo "----------------------------------------" | tee -a "$LOG_FILE"
echo "[$(date '+%Y-%m-%d %H:%M:%S')] Batch analysis complete" | tee -a "$LOG_FILE"
echo "Results saved to: $OUTPUT_DIR" | tee -a "$LOG_FILE"
```

---

### 1.2 Dependency Checker

```bash
#!/bin/bash
# check-dependencies.sh - Verify all tools are installed

check_tool() {
    local tool="$1"
    local package="${2:-$1}"

    if command -v "$tool" >/dev/null 2>&1; then
        local version=$("$tool" --version 2>&1 | head -1)
        echo "[✓] $tool: $version"
        return 0
    else
        echo "[✗] $tool: NOT INSTALLED (apt install $package)"
        return 1
    fi
}

echo "Android Pentesting Tools Dependency Check"
echo "==========================================="
echo

# Decompilers
echo "## Decompilers"
check_tool apktool apktool
check_tool jadx jadx
check_tool baksmali baksmali
echo

# Analysis Tools
echo "## Analysis Tools"
check_tool apkid apkid
check_tool dex2jar dex2jar
check_tool androguard androguard
echo

# Dynamic Tools
echo "## Dynamic Tools"
check_tool frida frida-tools
check_tool objection objection
check_tool adb android-tools-adb
check_tool aapt aapt
echo

# Native Analysis
echo "## Native Analysis"
check_tool ghidra ghidra
check_tool objdump binutils
check_tool strings binutils
check_tool nm binutils
echo

# Network Tools
echo "## Network Tools"
check_tool burpsuite burpsuite
check_tool mitmproxy mitmproxy
check_tool tcpdump tcpdump
echo

# Python Tools
echo "## Python Tools"
python3 -c "import androguard; print('[✓] androguard: ' + androguard.__version__)" 2>/dev/null || echo "[✗] androguard: NOT INSTALLED (pip install androguard)"
python3 -c "import frida; print('[✓] frida-python: ' + frida.__version__)" 2>/dev/null || echo "[✗] frida-python: NOT INSTALLED (pip install frida)"
python3 -c "import objection; print('[✓] objection')" 2>/dev/null || echo "[✗] objection: NOT INSTALLED (pip install objection)"
echo

echo "==========================================="
```

---

### 1.3 Logging and Error Handling

```bash
#!/bin/bash
# logging-utils.sh - Reusable logging functions

# Colors for terminal output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Log levels
LOG_DEBUG=0
LOG_INFO=1
LOG_WARN=2
LOG_ERROR=3
LOG_FATAL=4

# Current log level
CURRENT_LOG_LEVEL=${LOG_LEVEL:-$LOG_INFO}

# Log file path
LOG_FILE="${LOG_FILE:-/var/log/android-pentest.log}"

# Initialize log file
init_log() {
    mkdir -p "$(dirname "$LOG_FILE")"
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] Log initialized" > "$LOG_FILE"
}

# Log function
log() {
    local level="$1"
    shift
    local message="$*"
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')

    case "$level" in
        debug)
            [ $CURRENT_LOG_LEVEL -le $LOG_DEBUG ] && echo -e "${YELLOW}[DEBUG]${NC} $message"
            echo "[$timestamp] DEBUG: $message" >> "$LOG_FILE"
            ;;
        info)
            [ $CURRENT_LOG_LEVEL -le $LOG_INFO ] && echo -e "${GREEN}[INFO]${NC} $message"
            echo "[$timestamp] INFO: $message" >> "$LOG_FILE"
            ;;
        warn)
            [ $CURRENT_LOG_LEVEL -le $LOG_WARN ] && echo -e "${YELLOW}[WARN]${NC} $message"
            echo "[$timestamp] WARN: $message" >> "$LOG_FILE"
            ;;
        error)
            [ $CURRENT_LOG_LEVEL -le $LOG_ERROR ] && echo -e "${RED}[ERROR]${NC} $message" >&2
            echo "[$timestamp] ERROR: $message" >> "$LOG_FILE"
            ;;
        fatal)
            echo -e "${RED}[FATAL]${NC} $message" >&2
            echo "[$timestamp] FATAL: $message" >> "$LOG_FILE"
            exit 1
            ;;
    esac
}

# Convenience functions
log_debug() { log debug "$@"; }
log_info() { log info "$@"; }
log_warn() { log warn "$@"; }
log_error() { log error "$@"; }
log_fatal() { log fatal "$@"; }

# Execute command with logging
run_cmd() {
    local description="$1"
    shift
    local cmd="$*"

    log_info "$description"
    log_debug "Executing: $cmd"

    if output=$("$cmd" 2>&1); then
        log_debug "$output"
        return 0
    else
        log_error "Command failed: $cmd"
        log_error "$output"
        return 1
    fi
}

# Usage example
# init_log
# log_info "Starting APK analysis"
# run_cmd "Decompiling APK" "apktool d app.apk -o output"
```

---

### 1.4 Output Directory Structure

```bash
#!/bin/bash
# setup-structure.sh - Create standardized output directory

setup_audit_structure() {
    local output_dir="${1:-./audit}"
    local app_name="${2:-app}"
    local timestamp=$(date '+%Y%m%d_%H%M%S')

    local base_dir="$output_dir/${app_name}_${timestamp}"

    # Create main directories
    mkdir -p "$base_dir"/{static,dynamic,findings,reports}

    # Static analysis subdirectories
    mkdir -p "$base_dir/static"/{decoded,jadx,manifest,resources,native,framework}

    # Dynamic analysis subdirectories
    mkdir -p "$base_dir/dynamic"/{frida,objection,network,forensics}

    # Findings subdirectories
    mkdir -p "$base_dir/findings"/{critical,high,medium,low,info}

    # Reports subdirectories
    mkdir -p "$base_dir/reports"/{screenshots,evidence,logs}

    # Create README
    cat > "$base_dir/README.md" << EOF
# Android Security Assessment: $app_name

**Date**: $(date '+%Y-%m-%d %H:%M:%S')
**Analyst**: $(whoami)
**Tool**: Android APK Audit Skill

## Directory Structure

\`\`\`
$base_dir/
├── static/           # Static analysis results
│   ├── decoded/      # APKTool decompiled files
│   ├── jadx/         # JADX decompiled Java
│   ├── manifest/     # AndroidManifest analysis
│   ├── resources/    # Resource files
│   ├── native/       # Native library analysis
│   └── framework/    # Framework detection
├── dynamic/          # Dynamic analysis results
│   ├── frida/        # Frida scripts output
│   ├── objection/    # Objection exploration
│   ├── network/      # Network captures
│   └── forensics/    # Device forensics
├── findings/         # Security findings
│   ├── critical/     # Critical severity
│   ├── high/         # High severity
│   ├── medium/       # Medium severity
│   ├── low/          # Low severity
│   └── info/         # Informational
└── reports/          # Final reports
    ├── screenshots/  # Evidence screenshots
    ├── evidence/     # Additional evidence
    └── logs/         # Audit logs
\`\`\`

## Quick Start

1. Place APK in root directory
2. Run static analysis scripts
3. Run dynamic analysis scripts
4. Document findings
5. Generate final report

EOF

    echo "$base_dir"
}

# Usage
# AUDIT_DIR=$(setup_audit_structure "./audit" "myapp")
# echo "Audit directory created: $AUDIT_DIR"
```

---

## 2. Python Automation Patterns

### 2.1 Using apkutils and androguard

```python
#!/usr/bin/env python3
"""
apk_automation.py - Python automation for APK analysis
"""

import os
import sys
import json
import subprocess
from pathlib import Path
from typing import Dict, List, Optional

try:
    from androguard.core.bytecodes.apk import APK
    from androguard.core.bytecodes.dvm import DalvikVMFormat
    from androguard.core.analysis.analysis import Analysis
except ImportError:
    print("Install: pip install androguard")
    sys.exit(1)


class APKAnalyzer:
    """Comprehensive APK analysis using androguard"""

    def __init__(self, apk_path: str):
        self.apk_path = apk_path
        self.apk = APK(apk_path)
        self.analysis = None

    def get_basic_info(self) -> Dict:
        """Extract basic package information"""
        return {
            "package_name": self.apk.get_package(),
            "app_name": self.apk.get_app_name(),
            "version_name": self.apk.get_androidversion_name(),
            "version_code": self.apk.get_androidversion_code(),
            "min_sdk": self.apk.get_min_sdk_version(),
            "target_sdk": self.apk.get_target_sdk_version(),
            "permissions": self.apk.get_permissions(),
            "activities": [a.get_name() for a in self.apk.get_activities()],
            "services": [s.get_name() for s in self.apk.get_services()],
            "receivers": [r.get_name() for r in self.apk.get_receivers()],
            "providers": [p.get_name() for p in self.apk.get_providers()],
        }

    def get_dangerous_permissions(self) -> List[str]:
        """Extract dangerous permissions"""
        dangerous_permissions = [
            "android.permission.READ_CONTACTS",
            "android.permission.WRITE_CONTACTS",
            "android.permission.READ_CALENDAR",
            "android.permission.WRITE_CALENDAR",
            "android.permission.READ_SMS",
            "android.permission.SEND_SMS",
            "android.permission.RECEIVE_SMS",
            "android.permission.READ_CALL_LOG",
            "android.permission.WRITE_CALL_LOG",
            "android.permission.READ_PHONE_STATE",
            "android.permission.CAMERA",
            "android.permission.RECORD_AUDIO",
            "android.permission.ACCESS_FINE_LOCATION",
            "android.permission.ACCESS_COARSE_LOCATION",
            "android.permission.READ_EXTERNAL_STORAGE",
            "android.permission.WRITE_EXTERNAL_STORAGE",
        ]

        return [p for p in self.apk.get_permissions() if p in dangerous_permissions]

    def find_exported_components(self) -> Dict[str, List[str]]:
        """Find exported components"""
        return {
            "exported_activities": [
                a.get_name() for a in self.apk.get_activities()
                if a.is_exported()
            ],
            "exported_services": [
                s.get_name() for s in self.apk.get_services()
                if s.is_exported()
            ],
            "exported_receivers": [
                r.get_name() for r in self.apk.get_receivers()
                if r.is_exported()
            ],
            "exported_providers": [
                p.get_name() for p in self.apk.get_providers()
                if p.is_exported()
            ],
        }

    def find_deep_links(self) -> List[str]:
        """Extract deep link URLs"""
        deep_links = []

        # Check intent filters in activities
        for activity in self.apk.get_activities():
            for intent in activity.get_intent_filters():
                for scheme in intent.get_schemes():
                    for host in intent.get_hosts():
                        deep_links.append(f"{scheme}://{host}")

        return list(set(deep_links))

    def find_secrets(self) -> List[Dict[str, str]]:
        """Search for potential secrets in code"""
        import re

        secrets = []
        patterns = [
            (r'api[_-]?key["\s:=]+["\']([^"\']+)["\']', 'API Key'),
            (r'secret[_-]?key["\s:=]+["\']([^"\']+)["\']', 'Secret Key'),
            (r'auth[_-]?token["\s:=]+["\']([^"\']+)["\']', 'Auth Token'),
            (r'password["\s:=]+["\']([^"\']+)["\']', 'Password'),
            (r'aws[_-]?access[_-]?key["\s:=]+["\']([^"\']+)["\']', 'AWS Access Key'),
            (r'aws[_-]?secret[_-]?key["\s:=]+["\']([^"\']+)["\']', 'AWS Secret Key'),
        ]

        # Get DEX files
        for dex in self.apk.get_all_dex():
            dex_bytes = dex.get_dex()
            dex_str = dex_bytes.get_src()

            for pattern, secret_type in patterns:
                matches = re.finditer(pattern, dex_str, re.IGNORECASE)
                for match in matches:
                    secrets.append({
                        "type": secret_type,
                        "value": match.group(1),
                        "file": "DEX",
                        "line": dex_str[:match.start()].count('\n') + 1,
                    })

        return secrets

    def analyze(self) -> Dict:
        """Run full analysis"""
        return {
            "basic_info": self.get_basic_info(),
            "dangerous_permissions": self.get_dangerous_permissions(),
            "exported_components": self.find_exported_components(),
            "deep_links": self.find_deep_links(),
            "secrets": self.find_secrets(),
        }

    def save_report(self, output_path: str):
        """Save analysis to JSON report"""
        import json

        report = self.analyze()

        with open(output_path, 'w') as f:
            json.dump(report, f, indent=2)

        print(f"Report saved to: {output_path}")


# Automated report generation
def generate_markdown_report(analyzer: APKAnalyzer, output_path: str):
    """Generate Markdown security report"""

    info = analyzer.get_basic_info()
    dangerous_perms = analyzer.get_dangerous_permissions()
    exported = analyzer.find_exported_components()
    deep_links = analyzer.find_deep_links()

    report = f"""# Android Security Assessment Report

**Package**: {info['package_name']}
**App Name**: {info['app_name']}
**Version**: {info['version_name']} ({info['version_code']})
**Min SDK**: {info['min_sdk']}
**Target SDK**: {info['target_sdk']}

## Executive Summary

- **Dangerous Permissions**: {len(dangerous_perms)}
- **Exported Activities**: {len(exported['exported_activities'])}
- **Exported Services**: {len(exported['exported_services'])}
- **Exported Receivers**: {len(exported['exported_receivers'])}
- **Exported Providers**: {len(exported['exported_providers'])}
- **Deep Links**: {len(deep_links)}

## Dangerous Permissions

"""

    if dangerous_perms:
        report += "| Permission |\n|------------|\n"
        for perm in dangerous_perms:
            report += f"| {perm} |\n"
    else:
        report += "No dangerous permissions found.\n"

    report += "\n## Exported Components\n\n"

    for component_type, components in exported.items():
        if components:
            report += f"### {component_type.replace('_', ' ').title()}\n\n"
            for comp in components:
                report += f"- `{comp}`\n"
            report += "\n"

    if deep_links:
        report += "## Deep Links\n\n"
        for link in deep_links:
            report += f"- `{link}`\n"

    with open(output_path, 'w') as f:
        f.write(report)

    print(f"Markdown report saved to: {output_path}")


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="APK Security Analysis")
    parser.add_argument("apk", help="Path to APK file")
    parser.add_argument("-o", "--output", default="report.json", help="Output report path")
    parser.add_argument("-m", "--markdown", action="store_true", help="Generate Markdown report")

    args = parser.parse_args()

    analyzer = APKAnalyzer(args.apk)

    if args.markdown:
        generate_markdown_report(analyzer, args.output.replace('.json', '.md'))
    else:
        analyzer.save_report(args.output)
```

---

### 2.2 Integration with Burp Suite via MCP

```python
#!/usr/bin/env python3
"""
burp_integration.py - Integration with Burp Suite via MCP
"""

import json
import requests
from typing import Dict, List, Optional

class BurpMCPClient:
    """Client for Burp Suite MCP integration"""

    def __init__(self, mcp_url: str = "http://127.0.0.1:8080", api_key: str = ""):
        self.mcp_url = mcp_url.rstrip('/')
        self.api_key = api_key
        self.headers = {"Authorization": f"Bearer {api_key}"} if api_key else {}

    def scan_apk(self, apk_path: str) -> Dict:
        """Initiate APK scan via Burp"""
        endpoint = f"{self.mcp_url}/scan"

        with open(apk_path, 'rb') as f:
            files = {'file': f}
            response = requests.post(
                endpoint,
                files=files,
                headers=self.headers,
                verify=False
            )

        return response.json()

    def get_scan_results(self, scan_id: str) -> Dict:
        """Retrieve scan results"""
        endpoint = f"{self.mcp_url}/scan/{scan_id}"
        response = requests.get(endpoint, headers=self.headers, verify=False)
        return response.json()

    def generate_report(self, scan_id: str, format: str = "html") -> str:
        """Generate scan report"""
        endpoint = f"{self.mcp_url}/scan/{scan_id}/report"
        params = {"format": format}
        response = requests.get(
            endpoint,
            params=params,
            headers=self.headers,
            verify=False
        )
        return response.text


def integrate_findings_with_android_audit(burp_findings: Dict, android_findings: Dict) -> Dict:
    """Merge Burp findings with Android audit findings"""

    merged = {
        "package": android_findings.get("basic_info", {}).get("package_name"),
        "findings": [],
    }

    # Add network findings from Burp
    for issue in burp_findings.get("issues", []):
        merged["findings"].append({
            "source": "burp",
            "severity": issue.get("severity", "info"),
            "title": issue.get("name"),
            "description": issue.get("description"),
            "evidence": issue.get("evidence"),
        })

    # Add static findings from Android audit
    if android_findings.get("dangerous_permissions"):
        merged["findings"].append({
            "source": "static",
            "severity": "medium",
            "title": "Dangerous Permissions",
            "description": f"App requests {len(android_findings['dangerous_permissions'])} dangerous permissions",
            "evidence": android_findings["dangerous_permissions"],
        })

    if android_findings.get("exported_components"):
        for comp_type, components in android_findings["exported_components"].items():
            if components:
                merged["findings"].append({
                    "source": "static",
                    "severity": "high",
                    "title": f"Exported {comp_type.replace('_', ' ').title()}",
                    "description": f"App exposes {len(components)} {comp_type.replace('_', ' ')}",
                    "evidence": components,
                })

    return merged
```

---

### 2.3 CI/CD Pipeline Integration

```yaml
# GitLab CI/CD Pipeline for Android Security Testing
# .gitlab-ci.yml

stages:
  - build
  - static-analysis
  - dynamic-analysis
  - report

variables:
  APK_PATH: "app/build/outputs/apk/debug/app-debug.apk"
  REPORT_DIR: "security-reports"

# Build the APK
build:
  stage: build
  image: androidsdk/android-30
  script:
    - ./gradlew assembleDebug
  artifacts:
    paths:
      - $APK_PATH
    expire_in: 1 week

# Static Analysis
static-analysis:
  stage: static-analysis
  image: kalilinux/kali-rolling
  before_script:
    - apt-get update && apt-get install -y apktool jadx apkid python3-pip
    - pip3 install androguard frida-tools
  script:
    - mkdir -p $REPORT_DIR/static

    # Decompilation
    - apktool d $APK_PATH -o $REPORT_DIR/static/decoded -f
    - jadx -d $REPORT_DIR/static/jadx --deobf $APK_PATH

    # Framework detection
    - apkid $APK_PATH > $REPORT_DIR/static/framework.txt

    # Security analysis
    - python3 scripts/generate-report.py --input $APK_PATH -o $REPORT_DIR/static/analysis.json
    - python3 scripts/generate-report.py --input $APK_PATH -m -o $REPORT_DIR/static/analysis.md

    # Manifest analysis
    - aapt dump permissions $APK_PATH > $REPORT_DIR/static/permissions.txt
    - aapt dump badging $APK_PATH > $REPORT_DIR/static/badging.txt

  artifacts:
    paths:
      - $REPORT_DIR/static/
    expire_in: 1 month

# Dynamic Analysis (requires connected device or emulator)
dynamic-analysis:
  stage: dynamic-analysis
  image: kalilinux/kali-rolling
  before_script:
    - apt-get update && apt-get install -y adb frida-tools objection
  script:
    - mkdir -p $REPORT_DIR/dynamic

    # Start emulator (example)
    - adb devices

    # Install APK
    - adb install $APK_PATH

    # Run Frida scripts
    - frida -U -f com.example.app -l assets/frida-scripts/ssl-pinning-bypass.js > $REPORT_DIR/dynamic/frida-ssl-bypass.log &
    - frida -U -f com.example.app -l assets/frida-scripts/root-detection-bypass.js > $REPORT_DIR/dynamic/frida-root-bypass.log &

    # Objection exploration
    - objection -g com.example.app explore --quiet > $REPORT_DIR/dynamic/objection.log

  artifacts:
    paths:
      - $REPORT_DIR/dynamic/
    expire_in: 1 month
  only:
    - manual

# Generate Final Report
report:
  stage: report
  image: python:3.9
  script:
    - pip install jinja2 weasyprint
    - python3 scripts/generate-report.py --static $REPORT_DIR/static --dynamic $REPORT_DIR/dynamic --output $REPORT_DIR/final-report.pdf
  artifacts:
    paths:
      - $REPORT_DIR/final-report.pdf
    expire_in: 3 months
```

---

### 2.4 GitHub Actions Workflow

```yaml
# GitHub Actions Workflow for Android Security Testing
# .github/workflows/android-security.yml

name: Android Security Analysis

on:
  push:
    branches: [ main, develop ]
  pull_request:
    branches: [ main ]
  schedule:
    - cron: '0 2 * * 1'  # Weekly scan

jobs:
  static-analysis:
    runs-on: ubuntu-latest
    container: kalilinux/kali-rolling

    steps:
    - uses: actions/checkout@v3

    - name: Install dependencies
      run: |
        apt-get update
        apt-get install -y apktool jadx apkid python3-pip adb
        pip3 install androguard frida-tools

    - name: Download APK
      run: |
        mkdir -p artifacts
        # Download APK from release or build
        wget -O artifacts/app.apk ${{ secrets.APK_DOWNLOAD_URL }}

    - name: Run Static Analysis
      run: |
        mkdir -p reports/static

        # Decompilation
        apktool d artifacts/app.apk -o reports/static/decoded -f
        jadx -d reports/static/jadx --deobf artifacts/app.apk

        # Security analysis
        apkid artifacts/app.apk > reports/static/framework.txt
        python3 scripts/generate-report.py artifacts/app.apk -o reports/static/analysis.json

    - name: Upload Static Analysis Results
      uses: actions/upload-artifact@v3
      with:
        name: static-analysis
        path: reports/static/

  dynamic-analysis:
    runs-on: macos-latest  # macOS for better Android emulator support

    steps:
    - uses: actions/checkout@v3

    - name: Setup Android SDK
      uses: android-actions/setup-android@v2

    - name: Setup Emulator
      run: |
        sdkmanager "system-images;android-30;google_apis;x86_64"
        avdmanager create avd -n test -k "system-images;android-30;google_apis;x86_64" -d pixel
        emulator -avd test -no-window -no-audio -no-boot-anim &
        adb wait-for-device

    - name: Install Frida
      run: pip3 install frida-tools objection

    - name: Run Dynamic Analysis
      run: |
        mkdir -p reports/dynamic
        adb install artifacts/app.apk

        # Install Frida server (use latest version from https://github.com/frida/frida/releases)
        FRIDA_VERSION=$(curl -s https://api.github.com/repos/frida/frida/releases/latest | grep '"tag_name"' | sed -E 's/.*"([^"]+)".*/\1/')
        wget "https://github.com/frida/frida/releases/download/${FRIDA_VERSION}/frida-server-${FRIDA_VERSION}-android-x86_64.xz"
        xz -d "frida-server-${FRIDA_VERSION}-android-x86_64.xz"
        adb push "frida-server-${FRIDA_VERSION}-android-x86_64" /data/local/tmp/frida-server
        adb shell "chmod 755 /data/local/tmp/frida-server"
        adb shell "/data/local/tmp/frida-server &"

        # Run Frida scripts
        frida -U -f com.example.app -l assets/frida-scripts/ssl-pinning-bypass.js > reports/dynamic/frida.log

      env:
        PACKAGE_NAME: ${{ secrets.PACKAGE_NAME }}

    - name: Upload Dynamic Analysis Results
      uses: actions/upload-artifact@v3
      with:
        name: dynamic-analysis
        path: reports/dynamic/

  report:
    runs-on: ubuntu-latest
    needs: [static-analysis, dynamic-analysis]

    steps:
    - uses: actions/checkout@v3

    - name: Download Static Analysis
      uses: actions/download-artifact@v3
      with:
        name: static-analysis
        path: reports/static/

    - name: Download Dynamic Analysis
      uses: actions/download-artifact@v3
      with:
        name: dynamic-analysis
        path: reports/dynamic/

    - name: Generate Final Report
      run: |
        pip install jinja2 weasyprint
        python3 scripts/generate-report.py \
          --static reports/static \
          --dynamic reports/dynamic \
          --output reports/final-report.pdf

    - name: Upload Final Report
      uses: actions/upload-artifact@v3
      with:
        name: security-report
        path: reports/final-report.pdf

    - name: Create Issue on Critical Findings
      if: contains(steps.report.outputs, 'CRITICAL')
      uses: actions/github-script@v6
      with:
        script: |
          github.rest.issues.create({
            owner: context.repo.owner,
            repo: context.repo.repo,
            title: 'Critical Security Finding',
            body: 'Critical security vulnerability found. Check the security report artifact.',
            labels: ['security', 'critical']
          })
```

---

## 3. Workflow Scripts

### 3.1 Full Assessment Pipeline Script

```bash
#!/bin/bash
# full-assessment.sh - Complete Android security assessment

set -e  # Exit on error

# Configuration
APK_FILE="${1:?Usage: $0 <apk_file>}"
PACKAGE_NAME="${2}"
OUTPUT_DIR="./assessment_$(date '+%Y%m%d_%H%M%S')"
DEVICE_ID="${DEVICE_ID:-}"
FRIDA_PORT="${FRIDA_PORT:-27042}"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_info() { echo -e "${GREEN}[INFO]${NC} $*"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $*"; }
log_error() { echo -e "${RED}[ERROR]${NC} $*" >&2; }

# Check dependencies
check_dependencies() {
    log_info "Checking dependencies..."

    local missing=()
    command -v apktool >/dev/null 2>&1 || missing+=("apktool")
    command -v jadx >/dev/null 2>&1 || missing+=("jadx")
    command -v frida >/dev/null 2>&1 || missing+=("frida")
    command -v adb >/dev/null 2>&1 || missing+=("adb")
    command -v aapt >/dev/null 2>&1 || missing+=("aapt")

    if [ ${#missing[@]} -gt 0 ]; then
        log_error "Missing dependencies: ${missing[*]}"
        exit 1
    fi

    log_info "All dependencies installed ✓"
}

# Setup output directory
setup_output() {
    log_info "Setting up output directory: $OUTPUT_DIR"
    mkdir -p "$OUTPUT_DIR"/{static,dynamic,findings,reports}
    mkdir -p "$OUTPUT_DIR/static"/{decoded,jadx,manifest,resources}
    mkdir -p "$OUTPUT_DIR/dynamic"/{frida,objection,network}
    mkdir -p "$OUTPUT_DIR/findings"/{critical,high,medium,low}
}

# Static analysis
static_analysis() {
    log_info "Starting static analysis..."

    # Decompilation
    log_info "Decompiling with APKTool..."
    apktool d "$APK_FILE" -o "$OUTPUT_DIR/static/decoded" -f

    log_info "Decompiling with JADX..."
    jadx -d "$OUTPUT_DIR/static/jadx" --deobf "$APK_FILE"

    # Manifest analysis
    log_info "Analyzing AndroidManifest..."
    # aapt valid for read ops (see quick-commands.md)
    aapt dump permissions "$APK_FILE" > "$OUTPUT_DIR/static/manifest/permissions.txt"
    aapt dump badging "$APK_FILE" > "$OUTPUT_DIR/static/manifest/badging.txt"

    # Extract package name if not provided
    if [ -z "$PACKAGE_NAME" ]; then
        PACKAGE_NAME=$(grep -oP 'package: name=\K[^ ]+' "$OUTPUT_DIR/static/manifest/badging.txt")
        log_info "Detected package: $PACKAGE_NAME"
    fi

    # Python analysis
    if command -v python3 >/dev/null 2>&1; then
        log_info "Running Python analysis..."
        python3 scripts/generate-report.py "$APK_FILE" -o "$OUTPUT_DIR/static/analysis.json"
    fi

    # Find secrets
    log_info "Searching for secrets..."
    grep -rE 'api[_-]?key|secret[_-]?key|password|token' \
        "$OUTPUT_DIR/static/decoded" --include="*.xml" --include="*.smali" \
        > "$OUTPUT_DIR/static/secrets.txt" 2>/dev/null || true

    log_info "Static analysis complete ✓"
}

# Dynamic analysis
dynamic_analysis() {
    log_info "Starting dynamic analysis..."

    # Check for device
    local devices=$(adb devices | grep -v "List of devices" | wc -l)
    if [ "$devices" -eq 0 ]; then
        log_warn "No devices connected, skipping dynamic analysis"
        return
    fi

    # Install APK
    log_info "Installing APK on device..."
    adb ${DEVICE_ID:+-s $DEVICE_ID} install -r "$APK_FILE"

    # Start app
    log_info "Starting application..."
    adb ${DEVICE_ID:+-s $DEVICE_ID} shell am start -n "$PACKAGE_NAME/.MainActivity"

    # Frida scripts
    log_info "Running Frida scripts..."

    # SSL pinning bypass
    if [ -f "assets/frida-scripts/ssl-pinning-bypass.js" ]; then
        frida ${DEVICE_ID:+-D $DEVICE_ID} -f "$PACKAGE_NAME" \
            -l assets/frida-scripts/ssl-pinning-bypass.js \
            > "$OUTPUT_DIR/dynamic/frida/ssl-bypass.log" 2>&1 &
    fi

    # Root detection bypass
    if [ -f "assets/frida-scripts/root-detection-bypass.js" ]; then
        frida ${DEVICE_ID:+-s $DEVICE_ID} -f "$PACKAGE_NAME" \
            -l assets/frida-scripts/root-detection-bypass.js \
            > "$OUTPUT_DIR/dynamic/frida/root-bypass.log" 2>&1 &
    fi

    # Objection exploration
    if command -v objection >/dev/null 2>&1; then
        log_info "Running Objection exploration..."
        objection -g "$PACKAGE_NAME" explore --quiet \
            > "$OUTPUT_DIR/dynamic/objection/session.log" 2>&1 &
    fi

    log_info "Dynamic analysis complete ✓"
}

# Generate report
generate_report() {
    log_info "Generating security report..."

    cat > "$OUTPUT_DIR/reports/summary.md" << EOF
# Android Security Assessment Report

**Date**: $(date '+%Y-%m-%d %H:%M:%S')
**APK**: $APK_FILE
**Package**: $PACKAGE_NAME

## 1. Static Analysis

### Package Information
- Package Name: $PACKAGE_NAME
- Min SDK: $(grep -oP 'sdkVersion:\K[^ ]+' "$OUTPUT_DIR/static/manifest/badging.txt" 2>/dev/null || echo 'Unknown')
- Target SDK: $(grep -oP 'targetSdkVersion:\K[^ ]+' "$OUTPUT_DIR/static/manifest/badging.txt" 2>/dev/null || echo 'Unknown')

### Permissions
$(cat "$OUTPUT_DIR/static/manifest/permissions.txt")

### Secrets Found
$(cat "$OUTPUT_DIR/static/secrets.txt" 2>/dev/null || echo 'No secrets found')

## 2. Dynamic Analysis

### Frida Scripts
- SSL Pinning Bypass: $(ls "$OUTPUT_DIR/dynamic/frida/ssl-bypass.log" 2>/dev/null && echo 'Executed' || echo 'Skipped')
- Root Detection Bypass: $(ls "$OUTPUT_DIR/dynamic/frida/root-bypass.log" 2>/dev/null && echo 'Executed' || echo 'Skipped')

### Objection
- Session Log: $(ls "$OUTPUT_DIR/dynamic/objection/session.log" 2>/dev/null && echo 'Available' || echo 'Skipped')

## 3. Findings

$(find "$OUTPUT_DIR/static" -name "*.json" -exec cat {} \; 2>/dev/null)

---

**Generated by**: Android APK Audit Skill
EOF

    log_info "Report generated: $OUTPUT_DIR/reports/summary.md"
}

# Cleanup
cleanup() {
    log_info "Cleaning up..."
    pkill -f frida || true
    adb ${DEVICE_ID:+-s $DEVICE_ID} uninstall "$PACKAGE_NAME" 2>/dev/null || true
}

# Main execution
main() {
    log_info "Starting full assessment: $APK_FILE"

    check_dependencies
    setup_output
    static_analysis
    dynamic_analysis
    generate_report

    log_info "Assessment complete! Results in: $OUTPUT_DIR"
}

# Trap cleanup on exit
trap cleanup EXIT

# Run
main "$@"
```

---

### 3.2 Quick Recon Script

```bash
#!/bin/bash
# quick-recon.sh - Fast reconnaissance for APK

APK="${1:?Usage: $0 <apk_file>}"

echo "Android APK Quick Recon"
echo "======================="
echo

# Basic info
echo "## Basic Information"
aapt dump badging "$APK" 2>/dev/null | grep -E "package:|sdkVersion:|targetSdkVersion:|application-label:" | head -5
echo

# Permissions
echo "## Permissions ($(aapt dump permissions "$APK" 2>/dev/null | wc -l) total)"
aapt dump permissions "$APK" 2>/dev/null | grep "uses-permission: name=" | sed 's/.*name=//' | sort | head -20
echo

# Activities
echo "## Activities"
aapt dump badging "$APK" 2>/dev/null | grep "launchable-activity" | sed 's/.*name=/  /' | sed 's/ label=.*//'
echo

# Framework detection
echo "## Framework Detection"
apkid "$APK" 2>/dev/null | grep -v "^$"
echo

# Strings (quick secrets check)
echo "## Potential Secrets"
strings "$APK" 2>/dev/null | grep -iE '(api[_-]?key|password|secret|token|auth)' | head -10
echo

# URLs
echo "## URLs"
strings "$APK" 2>/dev/null | grep -E 'https?://' | sort -u | head -10
echo

echo "======================="
echo "Quick recon complete. Run full assessment for detailed analysis."
```

---

### 3.3 Decompile → Analyze → Repackage Workflow

```bash
#!/bin/bash
# repackage-workflow.sh - Modify and repackage APK

APK="${1:?Usage: $0 <apk_file>}"
OUTPUT_DIR="${2:-./repackage_$(date '+%Y%m%d_%H%M%S')}"
MODS_DIR="${3:-./mods}"

echo "Android APK Repackage Workflow"
echo "================================"
echo "Input: $APK"
echo "Output: $OUTPUT_DIR"
echo "Modifications: $MODS_DIR"
echo

# Step 1: Decompile
echo "[1/6] Decompiling APK..."
apktool d "$APK" -o "$OUTPUT_DIR/decoded" -f
echo "✓ Decompilation complete"
echo

# Step 2: Apply modifications
echo "[2/6] Applying modifications..."
if [ -d "$MODS_DIR" ]; then
    cp -rv "$MODS_DIR/"* "$OUTPUT_DIR/decoded/" 2>/dev/null || echo "No modifications to apply"
else
    echo "No modifications directory found, skipping..."
fi
echo "✓ Modifications applied"
echo

# Step 3: Analyze for issues
echo "[3/6] Analyzing for issues..."
grep -r "android:debuggable=\"true\"" "$OUTPUT_DIR/decoded/" && echo "WARNING: Debuggable enabled"
grep -r "android:usesCleartextTraffic=\"true\"" "$OUTPUT_DIR/decoded/" && echo "WARNING: Cleartext traffic allowed"
echo "✓ Analysis complete"
echo

# Step 4: Rebuild
echo "[4/6] Rebuilding APK..."
apktool b "$OUTPUT_DIR/decoded" -o "$OUTPUT_DIR/modified.apk"
echo "✓ Rebuild complete"
echo

# Step 5: Sign
echo "[5/6] Signing APK..."
if [ -f ~/.android/debug.keystore ]; then
    jarsigner -keystore ~/.android/debug.keystore \
        -storepass android \
        -keypass android \
        "$OUTPUT_DIR/modified.apk" \
        androiddebugkey
    echo "✓ Signed with debug keystore"
else
    echo "Generating debug keystore..."
    keytool -genkey -v -keystore ~/.android/debug.keystore \
        -alias androiddebugkey \
        -storepass android \
        -keypass android \
        -keyalg RSA \
        -keysize 2048 \
        -validity 10000 \
        -dname "CN=Android Debug,O=Android,C=US"

    jarsigner -keystore ~/.android/debug.keystore \
        -storepass android \
        -keypass android \
        "$OUTPUT_DIR/modified.apk" \
        androiddebugkey
    echo "✓ Keystore created and APK signed"
fi
echo

# Step 6: Align
echo "[6/6] Aligning APK..."
zipalign -v 4 "$OUTPUT_DIR/modified.apk" "$OUTPUT_DIR/final.apk"
echo "✓ Alignment complete"
echo

echo "================================"
echo "Repackage workflow complete!"
echo "Final APK: $OUTPUT_DIR/final.apk"
echo
echo "Install with: adb install $OUTPUT_DIR/final.apk"
```

---

## 4. Integration Examples

### 4.1 Jenkins Pipeline

```groovy
// Jenkinsfile for Android Security Testing
pipeline {
    agent {
        docker {
            image 'kalilinux/kali-rolling'
            args '--privileged'
        }
    }

    stages {
        stage('Setup') {
            steps {
                sh '''
                    apt-get update
                    apt-get install -y apktool jadx apkid python3-pip adb
                    pip3 install androguard frida-tools
                '''
            }
        }

        stage('Static Analysis') {
            steps {
                sh '''
                    mkdir -p reports/static
                    apktool d app.apk -o reports/static/decoded -f
                    jadx -d reports/static/jadx --deobf app.apk
                    apkid app.apk > reports/static/framework.txt
                    python3 scripts/generate-report.py app.apk -o reports/static/analysis.json
                '''
            }

            post {
                always {
                    archiveArtifacts artifacts: 'reports/static/**', fingerprint: true
                }
            }
        }

        stage('Dynamic Analysis') {
            steps {
                withCredentials([string(credentialsId: 'package-name', variable: 'PACKAGE')]) {
                    sh '''
                        # Start emulator
                        emulator -avd test -no-window -no-audio &
                        adb wait-for-device

                        # Install and test
                        adb install app.apk
                        frida -U -f $PACKAGE -l assets/frida-scripts/ssl-pinning-bypass.js
                    '''
                }
            }

            post {
                always {
                    archiveArtifacts artifacts: 'reports/dynamic/**', fingerprint: true
                }
            }
        }

        stage('Report') {
            steps {
                sh 'python3 scripts/generate-report.py --static reports/static --dynamic reports/dynamic --output reports/final-report.pdf'
            }

            post {
                success {
                    archiveArtifacts artifacts: 'reports/final-report.pdf', fingerprint: true
                    publishHTML target: [
                        allowMissing: false,
                        alwaysLinkToLastBuild: true,
                        keepAll: true,
                        reportDir: 'reports',
                        reportFiles: 'summary.md',
                        reportName: 'Security Report'
                    ]
                }
            }
        }
    }

    post {
        always {
            cleanWs()
        }
    }
}
```

---

## Summary

This automation framework provides:

1. **Bash Scripts**: Batch analysis, dependency checking, logging utilities, output structure setup
2. **Python Tools**: Androguard integration, Burp Suite MCP client, automated report generation
3. **CI/CD Integration**: GitLab CI, GitHub Actions, Jenkins pipeline examples
4. **Workflow Scripts**: Full assessment pipeline, quick recon, repackage workflow

All scripts are production-ready with:
- Error handling
- Logging
- Dependency checking
- Configurable parameters
- Output standardization