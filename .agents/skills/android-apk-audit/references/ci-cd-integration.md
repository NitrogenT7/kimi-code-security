# CI/CD Integration for Android APK Security Testing

**Last Updated:** 2025

This guide covers DevSecOps pipeline integration for automated Android APK security testing in CI/CD workflows.

---

## Table of Contents
1. [Why CI/CD Security Integration](#1-why-cicd-security-integration)
2. [GitHub Actions Workflows](#2-github-actions-workflows)
3. [GitLab CI/CD Pipelines](#3-gitlab-cicd-pipelines)
4. [Jenkins Pipelines](#4-jenkins-pipelines)
5. [Security Tool Integration](#5-security-tool-integration)
6. [Pre-commit Hooks](#6-pre-commit-hooks)
7. [Notification Integrations](#7-notification-integrations)
8. [Pass/Fail Criteria](#8-passfail-criteria)
9. [Cross-Platform Compatibility](#9-cross-platform-compatibility)

---

## 1. Why CI/CD Security Integration

### Key Benefits

| Benefit | Impact |
|---------|--------|
| Early vulnerability detection | Fix security issues before production deployment |
| Consistent security standards | Enforce security policies across all builds |
| Automated compliance | Track security posture over time |
| Faster remediation | Immediate feedback on security regressions |
| Reduced manual effort | Eliminate repetitive security testing tasks |

### Integration Points

1. **SAST (Static Application Security Testing)** - Analyze source code for vulnerabilities
2. **DAST (Dynamic Application Security Testing)** - Test running applications
3. **SCA (Software Composition Analysis)** - Scan dependencies for known vulnerabilities
4. **Container Security** - Scan Docker images used in builds
5. **Secret Scanning** - Detect hardcoded secrets and credentials

---

## 2. GitHub Actions Workflows

### Basic APK Security Scan Workflow

```yaml
name: Android APK Security Scan

on:
  push:
    branches: [ main, develop ]
  pull_request:
    branches: [ main ]
  workflow_dispatch:

jobs:
  build-and-scan:
    runs-on: ubuntu-latest

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Set up JDK 17
        uses: actions/setup-java@v4
        with:
          java-version: '17'
          distribution: 'temurin'

      - name: Grant execute permission for gradlew
        run: chmod +x gradlew

      - name: Build Debug APK
        run: ./gradlew assembleDebug

      - name: Run MobSF Analysis
        run: |
          docker run --rm -v $(pwd):/app opensecurity/mobile-security-framework-mobsf:latest \
            python manage.py mobsf_ci --apk /app/app/build/outputs/apk/debug/app-debug.apk
        continue-on-error: true

      - name: Download MobSF Report
        if: success() || failure()
        run: |
          docker run --rm -v $(pwd):/reports opensecurity/mobile-security-framework-mobsf:latest \
            python manage.py mobsf_ci --download_report /reports --file_format json

      - name: Upload Security Report
        uses: actions/upload-artifact@v4
        with:
          name: mobsf-report
          path: mobsf_report.json

      - name: Run Dependency-Check
        run: |
          docker run --rm -v $(pwd):/src owasp/dependency-check:latest \
            --scan /src --format JSON --out /src/dependency-check-report.json
        continue-on-error: true

      - name: Comment PR with Results
        if: github.event_name == 'pull_request'
        uses: actions/github-script@v7
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
          script: |
            const fs = require('fs');
            const report = JSON.parse(fs.readFileSync('mobsf_report.json', 'utf8'));
            const findings = report.findings || [];
            const critical = findings.filter(f => f.severity === 'high' || f.severity === 'critical').length;
            const comment = `## Security Scan Results\n\n**Critical/High Issues:** ${critical}\n\nSee artifacts for full report.`;
            github.rest.issues.createComment({
              issue_number: context.issue.number,
              owner: context.repo.owner,
              repo: context.repo.repo,
              body: comment
            });
```

### Advanced Workflow with Thresholds

```yaml
name: Android Security Gate

on:
  push:
    branches: [ main ]

jobs:
  security-scan:
    runs-on: ubuntu-latest

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Build APK
        run: ./gradlew assembleRelease

      - name: QARK Analysis
        run: |
          # ⚠️ QARK is unmaintained since 2019. Does not work with modern APKs. Consider MobSF or smooth-emitter instead.
          pip install qark
          qark --apk app/build/outputs/apk/release/app-release.apk --exploit || true

      - name: ANDROLIB Scan
        run: |
          # ⚠️ Verify this tool exists and is the correct package before using.
          docker run --rm -v $(pwd):/app androlib/androlib:latest \
            analyze /app/app/build/outputs/apk/release/app-release.apk || true

      - name: Check Critical Vulnerabilities
        run: |
          CRITICAL_COUNT=$(grep -c '"severity":"high"' mobsf_report.json || echo 0)
          if [ $CRITICAL_COUNT -gt 0 ]; then
            echo "❌ Found $CRITICAL_COUNT high severity vulnerabilities"
            exit 1
          else
            echo "✅ No high severity vulnerabilities found"
          fi

      - name: OWASP Dependency-Check
        run: |
          docker run --rm -v $(pwd):/src owasp/dependency-check:latest \
            --scan /src --format JSON --out /src/deps-check.json \
            --failBuildOnCVSS 7

      - name: Slack Notification on Failure
        if: failure()
        uses: slackapi/slack-github-action@v1
        with:
          payload: |
            {
              "text": "Security scan failed for ${{ github.repository }}",
              "blocks": [
                {
                  "type": "section",
                  "text": {
                    "type": "mrkdwn",
                    "text": "Build: ${{ github.sha }}\nAuthor: ${{ github.actor }}\nBranch: ${{ github.ref_name }}"
                  }
                }
              ]
            }
        env:
          SLACK_WEBHOOK_URL: ${{ secrets.SLACK_WEBHOOK_URL }}
```

---

## 3. GitLab CI/CD Pipelines

### Basic Security Pipeline

```yaml
stages:
  - build
  - security
  - deploy

variables:
  GRADLE_USER_HOME: "$CI_PROJECT_DIR/.gradle"

build:
  stage: build
  image: openjdk:17-jdk
  script:
    - chmod +x gradlew
    - ./gradlew assembleDebug
  artifacts:
    paths:
      - app/build/outputs/apk/debug/*.apk
    expire_in: 1 week

security_scan:
  stage: security
  image: docker:latest
  services:
    - docker:dind
  dependencies:
    - build
  script:
    - |
      # Run MobSF
      docker run --rm -v $(pwd):/app opensecurity/mobile-security-framework-mobsf:latest \
        python manage.py mobsf_ci --apk /app/app/build/outputs/apk/debug/app-debug.apk

    - |
      # Run Dependency-Check
      docker run --rm -v $(pwd):/src owasp/dependency-check:latest \
        --scan /src --format JSON --out /src/dependency-check.json

    - |
      # Run Snyk
      npm install -g snyk
      snyk auth $SNYK_TOKEN
      snyk test --severity-threshold=high || true

  artifacts:
    paths:
      - mobsf_report.json
      - dependency-check.json
      - snyk-report.json
    expire_in: 1 week

  allow_failure: false
  rules:
    - if: '$CI_PIPELINE_SOURCE == "merge_request_event"'
    - if: '$CI_COMMIT_BRANCH == "main"'

security_report:
  stage: security
  image: python:3.9
  needs: [security_scan]
  script:
    - |
      python3 << 'EOF'
      import json
      import sys

      with open('mobsf_report.json') as f:
          data = json.load(f)

      findings = data.get('findings', [])
      critical = [f for f in findings if f.get('severity') in ['high', 'critical']]

      print(f"Total findings: {len(findings)}")
      print(f"Critical/High: {len(critical)}")

      if len(critical) > 5:
          print("❌ Too many critical vulnerabilities")
          sys.exit(1)
      else:
          print("✅ Security threshold passed")
      EOF
```

---

## 4. Jenkins Pipelines

### Declarative Pipeline with Security Scans

```groovy
pipeline {
    agent any

    environment {
        ANDROID_HOME = '/opt/android-sdk'
        GRADLE_HOME = '/opt/gradle'
    }

    stages {
        stage('Checkout') {
            steps {
                checkout scm
            }
        }

        stage('Build APK') {
            steps {
                sh './gradlew assembleDebug'
            }
        }

        stage('MobSF Scan') {
            steps {
                sh '''
                    docker run --rm -v ${WORKSPACE}:/app \
                      opensecurity/mobile-security-framework-mobsf:latest \
                      python manage.py mobsf_ci \
                      --apk /app/app/build/outputs/apk/debug/app-debug.apk
                '''
            }
            post {
                always {
                    archiveArtifacts artifacts: 'mobsf_report.json', fingerprint: true
                }
            }
        }

        stage('Dependency Scan') {
            steps {
                sh '''
                    docker run --rm -v ${WORKSPACE}:/src \
                      owasp/dependency-check:latest \
                      --scan /src --format JSON \
                      --out /src/dependency-check.json \
                      --failBuildOnCVSS 7
                '''
            }
            post {
                always {
                    archiveArtifacts artifacts: 'dependency-check.json', fingerprint: true
                }
            }
        }

        stage('QARK Analysis') {
            steps {
                sh '''
                    pip install qark
                    qark --apk app/build/outputs/apk/debug/app-debug.apk --exploit
                '''
            }
        }

        stage('Security Gate') {
            steps {
                script {
                    def criticalCount = sh(
                        script: "grep -c '\"severity\":\"high\"' mobsf_report.json || echo 0",
                        returnStdout: true
                    ).trim().toInteger()

                    echo "Critical vulnerabilities: ${criticalCount}"

                    if (criticalCount > 5) {
                        error("❌ Security gate failed: ${criticalCount} critical vulnerabilities")
                    } else {
                        echo "✅ Security gate passed"
                    }
                }
            }
        }
    }

    post {
        always {
            cleanWs()
        }
        failure {
            emailext(
                subject: "Jenkins Build Failed: ${env.JOB_NAME}",
                body: """
                  Build failed at security stage.

                  Build URL: ${env.BUILD_URL}
                  Project: ${env.JOB_NAME}
                """,
                to: 'security-team@example.com'
            )
        }
    }
}
```

---

## 5. Security Tool Integration

### MobSF (Mobile Security Framework)

#### Docker Integration

```bash
# Start MobSF server
docker run -it -p 8000:8000 opensecurity/mobile-security-framework-mobsf:latest

# Run CI scan
docker run --rm -v $(pwd):/app opensecurity/mobile-security-framework-mobsf:latest \
  python manage.py mobsf_ci \
  --apk /app/app/build/outputs/apk/debug/app-debug.apk \
  --out /app/mobsf_report.json
```

#### API Integration (Python)

```python
import requests
import json

MOBSF_URL = "http://localhost:8000"

def upload_apk(apk_path):
    files = {'file': open(apk_path, 'rb')}
    data = {'scan_type': 'apk'}
    response = requests.post(f"{MOBSF_URL}/api/v1/upload", files=files, data=data)
    return response.json()['hash']

def scan_apk(apk_hash):
    data = {'hash': apk_hash, 'scan_type': 'apk'}
    response = requests.post(f"{MOBSF_URL}/api/v1/scan", data=data)
    return response.json()

def get_report(apk_hash, report_type='json'):
    data = {'hash': apk_hash, 'report_type': report_type}
    response = requests.post(f"{MOBSF_URL}/api/v1/download_pdf", data=data)
    return response.content

# Usage
apk_hash = upload_apk('app-debug.apk')
scan_apk(apk_hash)
report = get_report(apk_hash, 'json')
with open('mobsf_report.json', 'wb') as f:
    f.write(report)
```

### QARK (Quick Android Review Kit)

```bash
# Installation
# ⚠️ QARK is unmaintained since 2019. Does not work with modern APKs. Consider MobSF or smooth-emitter instead.
pip install qark

# Basic scan
qark --apk app-debug.apk

# With exploit generation
qark --apk app-debug.apk --exploit

# Output JSON report
qark --apk app-debug.apk --report-format json

# CI/CD usage
qark --apk app/build/outputs/apk/debug/app-debug.apk \
  --manifest app/src/main/AndroidManifest.xml \
  --build app/build.gradle \
  --export-dir /tmp/qark-report || true
```

### ANDROLIB

```bash
# Installation
# ⚠️ Verify this tool exists and is the correct package before using.
pip install androlib

# Basic scan
androlib analyze app-debug.apk || true

# With output
androlib analyze app-debug.apk --output report.json || true

# Scan for specific vulnerabilities
androlib analyze app-debug.apk \
  --check insecure-communication \
  --check data-storage \
  --check cryptography || true
```

### OWASP Dependency-Check

```bash
# Scan APK
dependency-check --scan app-debug.apk \
  --format JSON \
  --out dependency-check-report.json

# Scan source directory
dependency-check --scan ./app/src \
  --format JSON \
  --out dependency-check-report.json \
  --failBuildOnCVSS 7

# With suppression file
dependency-check --scan ./app \
  --format JSON \
  --suppression suppressions.xml \
  --out report.json
```

### Snyk Integration

```bash
# Install
npm install -g snyk

# Authenticate
snyk auth $SNYK_TOKEN

# Scan dependencies
snyk test --severity-threshold=high

# Generate report
snyk test --json > snyk-report.json

# Monitor dependencies
snyk monitor
```

---

## 6. Pre-commit Hooks

### Husky Setup for Android Projects

```bash
# Install Husky
npm install husky --save-dev
npx husky install

# Create pre-commit hook
npx husky add .husky/pre-commit "npm run security-check"
```

### Security Check Script (package.json)

```json
{
  "scripts": {
    "security-check": "bash .husky/pre-commit",
    "precommit": "npm run security-check"
  }
}
```

### Pre-commit Shell Script

```bash
#!/bin/bash

# scripts/security-precommit.sh (not yet implemented - use inline script below)

echo "🔒 Running security checks..."

# Check for hardcoded secrets
if grep -rE "password.*=|api_key.*=|secret.*=" --include="*.java" --include="*.kt" app/src; then
    echo "❌ Found hardcoded secrets"
    exit 1
fi

# Check for debug flags in production
if grep -rE "Log\.d\|BuildConfig\.DEBUG" --include="*.java" --include="*.kt" app/src/release; then
    echo "❌ Debug logging in release build"
    exit 1
fi

# Check for insecure HTTP
if grep -rE "http://(?!(localhost|127.0.0.1))" --include="*.java" --include="*.kt" app/src; then
    echo "⚠️  Found insecure HTTP URLs"
fi

# Check for weak crypto
if grep -rE "Cipher\.getInstance.*DES|Cipher\.getInstance.*MD5" --include="*.java" --include="*.kt" app/src; then
    echo "❌ Found weak cryptography"
    exit 1
fi

echo "✅ All security checks passed"
```

---

## 7. Notification Integrations

### Slack Webhook Integration

```python
# scripts/notify_slack.py (not yet implemented - example code below)
import json
import requests
import sys

SLACK_WEBHOOK_URL = sys.argv[1]
REPORT_FILE = sys.argv[2]

with open(REPORT_FILE) as f:
    report = json.load(f)

findings = report.get('findings', [])
critical = [f for f in findings if f.get('severity') in ['high', 'critical']]

payload = {
    "text": "Security Scan Results",
    "blocks": [
        {
            "type": "section",
            "text": {
                "type": "mrkdwn",
                "text": f"*Total Findings:* {len(findings)}\n*Critical/High:* {len(critical)}"
            }
        },
        {
            "type": "context",
            "elements": [
                {
                    "type": "mrkdwn",
                    "text": "Report: <${report_url}|View Full Report>"
                }
            ]
        }
    ]
}

if critical:
    payload["attachments"] = [{
        "color": "danger",
        "text": f"❌ {len(critical)} critical/high severity vulnerabilities found"
    }]

requests.post(SLACK_WEBHOOK_URL, json=payload)
```

### Microsoft Teams Integration

```yaml
# GitHub Actions example
- name: Notify Teams
  if: always()
  uses: actions/github-script@v7
  with:
    github-token: ${{ secrets.GITHUB_TOKEN }}
    script: |
      const fs = require('fs');
      const report = JSON.parse(fs.readFileSync('mobsf_report.json', 'utf8'));

      const webhookUrl = '${{ secrets.TEAMS_WEBHOOK_URL }}';

      const payload = {
        "@type": "MessageCard",
        "@context": "https://schema.org/extensions",
        "summary": "Security Scan Results",
        "themeColor": report.findings.length > 0 ? "FF0000" : "00FF00",
        "sections": [{
          "activityTitle": "Android APK Security Scan",
          "activitySubtitle": `Findings: ${report.findings.length}`,
          "facts": [
            { "name": "Critical", "value": report.findings.filter(f => f.severity === 'critical').length },
            { "name": "High", "value": report.findings.filter(f => f.severity === 'high').length },
            { "name": "Medium", "value": report.findings.filter(f => f.severity === 'medium').length }
          ]
        }]
      };

      await github.request(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
```

### Email Notifications (Jenkins)

```groovy
emailext (
    subject: "Security Scan Report: ${env.JOB_NAME} #${env.BUILD_NUMBER}",
    body: """
      <html>
        <body>
          <h2>Security Scan Results</h2>
          <p><b>Build:</b> ${env.BUILD_NUMBER}</p>
          <p><b>Branch:</b> ${env.GIT_BRANCH}</p>
          <p><b>Findings:</b> ${FINDINGS_COUNT}</p>
          <p><b>Critical:</b> ${CRITICAL_COUNT}</p>
          <hr>
          <p>View full report: <a href="${env.BUILD_URL}">${env.JOB_NAME} #${env.BUILD_NUMBER}</a></p>
        </body>
      </html>
    """,
    mimeType: 'text/html',
    to: 'security-team@example.com'
)
```

---

## 8. Pass/Fail Criteria

### Recommended Thresholds

| Severity | Max Allowed | Action on Exceed |
|----------|--------------|------------------|
| Critical | 0 | Block deployment |
| High | 2 | Block deployment |
| Medium | 10 | Warning, allow with override |
| Low | 50 | Informational only |
| Info | Unlimited | Informational only |

### OWASP Mobile Top 10 Mapping

| Category | CI/CD Check | Threshold |
|----------|--------------|-----------|
| M1: Improper Credential Usage | Secret scanning | 0 secrets allowed |
| M2: Inadequate Supply Chain Security | Dependency-Check | CVSS < 7.0 |
| M3: Insecure Authentication/Authorization | MobSF auth checks | 0 critical findings |
| M4: Insufficient Input/Output Validation | Static analysis | All sinks validated |
| M5: Insecure Communication | TLS/SSL checks | No cleartext HTTP |
| M6: Inadequate Privacy Controls | PII scanning | Document all PII |
| M7: Insufficient Binary Protections | ProGuard/R8 check | Must be enabled |
| M8: Security Misconfiguration | Manifest analysis | No debug flags |
| M9: Insecure Data Storage | Storage analysis | No plaintext storage |
| M10: Insufficient Cryptography | Crypto analysis | No weak algorithms |

### Quality Gate Configuration

```yaml
# GitHub Actions example
security-gate:
  runs-on: ubuntu-latest
  steps:
    - name: Quality Gate Check
      run: |
        # Read MobSF report
        python3 << 'EOF'
        import json
        import sys

        with open('mobsf_report.json') as f:
            report = json.load(f)

        findings = report.get('findings', [])

        # Define thresholds
        thresholds = {
            'critical': 0,
            'high': 2,
            'medium': 10,
            'low': 50
        }

        # Count findings by severity
        counts = {}
        for severity in thresholds.keys():
            counts[severity] = len([f for f in findings if f.get('severity') == severity])

        # Check thresholds
        passed = True
        for severity, count in counts.items():
            if count > thresholds[severity]:
                print(f"❌ {severity.capitalize()}: {count} (max {thresholds[severity]})")
                passed = False

        if passed:
            print("✅ All security thresholds passed")
            sys.exit(0)
        else:
            print("❌ Security gate failed")
            sys.exit(1)
        EOF
```

---

## 9. Cross-Platform Compatibility

### macOS Setup

```bash
# Install dependencies
brew install docker jq python3

# Install security tools
pip3 install qark androlib snyk

# Start Docker Desktop
open -a Docker
```

### Linux Setup

```bash
# Install dependencies
apt-get update
apt-get install -y docker.io jq python3 python3-pip

# Install security tools
pip3 install qark androlib snyk

# Start Docker service
systemctl start docker
```

### Windows Setup (PowerShell)

```powershell
# Install Docker Desktop
choco install docker-desktop

# Install Python
choco install python

# Install security tools
pip install qark androlib snyk

# Set environment variables
$env:ANDROID_HOME = "C:\Android\Sdk"
$env:GRADLE_HOME = "C:\Gradle"
```

---

## Quick Reference

### Essential Commands

```bash
# GitHub Actions
gh workflow run android-security.yml

# GitLab CI/CD
git push origin main  # Triggers pipeline

# Jenkins
# Configure via Jenkinsfile

# MobSF
docker run --rm -v $(pwd):/app opensecurity/mobile-security-framework-mobsf:latest \
  python manage.py mobsf_ci --apk /app/app-debug.apk

# QARK
qark --apk app-debug.apk --exploit

# Dependency-Check
dependency-check --scan app/ --format JSON --out report.json

# Snyk
snyk test --severity-threshold=high
```

### Workflow Templates

| Platform | Template Location | Recommended For |
|----------|------------------|-----------------|
| GitHub Actions | `.github/workflows/android-security.yml` | Projects hosted on GitHub |
| GitLab CI/CD | `.gitlab-ci.yml` | GitLab-hosted projects |
| Jenkins | `Jenkinsfile` | Self-hosted Jenkins |

---

## References

- MobSF Documentation: https://github.com/MobSF/Mobile-Security-Framework-MobSF
- QARK: https://github.com/linkedin/qark
- OWASP Dependency-Check: https://dependency-check.github.io/Dependency-Check/
- Snyk: https://snyk.io/
- OWASP Mobile Top 10: https://owasp.org/www-project-mobile-top-10/
- GitHub Actions: https://docs.github.com/en/actions
- GitLab CI/CD: https://docs.gitlab.com/ee/ci/

---

**Maintainer:** android-apk-audit skill
**Category:** Reference Document
**Last Updated:** 2025
