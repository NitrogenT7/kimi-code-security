# Supply Chain Security for Android Applications

**Last Updated:** 2025

This guide covers supply chain security analysis for Android applications, including third-party SDK risk assessment, dependency vulnerability scanning, and mitigation strategies.

---

## Table of Contents
1. [Understanding Supply Chain Risks](#1-understanding-supply-chain-risks)
2. [Real-World Supply Chain Attacks](#2-real-world-supply-chain-attacks)
3. [Third-Party SDK Risk Assessment](#3-third-party-sdk-risk-assessment)
4. [Dependency Scanning Tools](#4-dependency-scanning-tools)
5. [Vulnerability Detection](#5-vulnerability-detection)
6. [SBOM Generation](#6-sbom-generation)
7. [OWASP M2 Checklist](#7-owasp-m2-checklist)
8. [Mitigation Strategies](#8-mitigation-strategies)

---

## 1. Understanding Supply Chain Risks

### The Android Supply Chain

```
Developer → Build System → Dependencies → SDKs → Final APK
                                      ↓
                            Vulnerable Libraries
                                      ↓
                                Supply Chain Attacks
```

### Key Risk Vectors

| Risk Vector | Description | Impact |
|--------------|-------------|--------|
| Vulnerable dependencies | Known CVEs in third-party libraries | Remote code execution, data theft |
| Malicious SDKs | Compromised SDK with backdoors | Data exfiltration, account takeover |
| Dependency confusion | Attacker publishes malicious package | Code injection |
| Typosquatting | Fake packages with similar names | Malicious code execution |
| Compromised build tools | Infected build environment | Malware injection |
| Stale dependencies | Unpatched vulnerabilities | Known exploit exposure |

### OWASP Mobile Top 10 M2

**M2: Inadequate Supply Chain Security**

**Description**: The app relies on vulnerable or malicious third-party SDKs/libraries without proper verification or monitoring.

**Examples**:
- Outdated networking libraries with known CVEs
- Analytics SDKs with excessive data collection
- Ad SDKs with JavaScript bridge vulnerabilities
- Payment SDKs with weak cryptography

---

## 2. Real-World Supply Chain Attacks

### SolarWinds (2020)

**Attack Vector**: Compromised build system injected malicious code into updates.

**Impact**: 18,000+ customers affected, including US government agencies.

**Android Relevance**: Similar attacks possible via compromised build tools or SDKs.

```bash
# Detection: Verify library signatures
keytool -printcert -jarfile suspicious-sdk.jar
keytool -printcert -jarfile verified-sdk.jar
# Compare: Different signatures = tampered
```

### Codecov (2021)

**Attack Vector**: Attacker gained access to Codecov upload script, added malicious code to Bash Uploader.

**Impact**: Code injection into CI/CD pipelines, credential theft.

**Android Relevance**: If using Codecov for coverage reporting, verify script integrity.

```bash
# Verify script integrity
sha256sum codecov.sh
# Compare with expected hash from Codecov
```

### Event-Stream (2018)

**Attack Vector**: Attacker published malicious version 2.0.0 with `flatmap-stream` dependency containing backdoor.

**Impact**: Coinhive cryptocurrency miner injected into applications.

**Android Relevance**: React Native apps using `event-stream` vulnerable.

```bash
# Check for vulnerable version
grep -rn "event-stream" package.json
cat package.json | grep -A2 "event-stream"
# If version 2.0.0-3.3.6 → VULNERABLE
```

### ua-parser-js (2021)

**Attack Vector**: Attacker published malicious version 0.7.29 and 0.8.0 with XSS payload.

**Impact**: XSS vulnerabilities in web apps using the library.

**Android Relevance**: React Native apps using WebView with `ua-parser-js`.

```bash
# Check for vulnerable versions
grep -rn "ua-parser-js" package.json
cat package.json | grep -A2 "ua-parser-js"
# If version 0.7.29 or 0.8.0 → VULNERABLE
```

### Maven Dependency Confusion (Ongoing)

**Attack Vector**: Attacker publishes package with same group:artifact but higher version to public Maven repository.

**Impact**: Build system downloads malicious package instead of internal one.

**Android Relevance**: Gradle dependencies without repository restrictions.

```bash
# Detection: Check for dependency confusion
grep -E "(mavenCentral|jcenter|google\(\))" build.gradle
# If using public repositories without restrictions → VULNERABLE
```

---

## 3. Third-Party SDK Risk Assessment

### SDK Discovery

#### From Decompiled APK

```bash
# Find all third-party packages
find decompiled/ -name "*.smali" | xargs grep -h "^package" | sort -u

# Common tech company SDKs
grep -rn "com/google\|com/facebook\|com/amazon\|com/microsoft" decompiled/ --include="*.smali" | head -20

# Mobile ad networks
grep -rnE "io/fabric/|com/crashlytics/|com/chartboost/" decompiled/ --include="*.smali" | head -20

# Payment gateways
grep -rnE "com/stripe/|com/paypal/|com/braintreepayments/" decompiled/ --include="*.smali" | head -20
```

#### From Build Files

```bash
# Gradle dependencies
grep -E "implementation|api|compile" build.gradle | grep -v "//"

# Maven dependencies
find decompiled/ -name "pom.xml" -exec cat {} \; | grep -E "<groupId>|<artifactId>|<version>"

# Third-party JARs
find decompiled/ -name "*.jar" -exec basename {} \; | sort -u
```

### Risk Assessment Matrix

| SDK Category | High Risk Indicators | Medium Risk Indicators |
|--------------|---------------------|----------------------|
| Analytics | Excessive data collection, PII harvesting | Device fingerprinting, cross-app tracking |
| Advertising | JavaScript bridge exposure, click fraud | Location tracking, ad injection |
| Payment | Hardcoded API keys, weak crypto | Token storage in SharedPreferences |
| Authentication | Hardcoded OAuth secrets, weak session management | Token in URL parameters |
| Networking | Cleartext HTTP, missing SSL pinning | Custom TrustManager |
| Storage | Plaintext storage, insecure backup | World-readable files |
| Social | Access token leaks, insecure JS bridge | Token storage in SharedPreferences |

### High-Risk SDK Patterns

```bash
# Check for hardcoded credentials
strings app.apk | grep -iE "api.*key|secret|token|password|private.*key"

# Find Firebase URLs (often misconfigured)
strings app.apk | grep -E "firebaseio\.com|firebase\.app"

# Check for excessive permissions in SDKs
grep -rn "uses-permission" AndroidManifest.xml | grep -v "android.permission."

# Find JavaScript bridges (XSS risk)
grep -rn "addJavascriptInterface" decompiled/ --include="*.java" | head -20
```

---

## 4. Dependency Scanning Tools

### OWASP Dependency-Check

#### Installation

```bash
# macOS
brew install dependency-check

# Linux
apt-get install dependency-check

# Or download from https://dependency-check.github.io/Dependency-Check/
```

#### Basic Usage

```bash
# Scan decompiled directory
dependency-check --scan decompiled/ --format JSON --out dependency-check-report.json

# Scan APK directly
dependency-check --scan app.apk --format JSON --out dependency-check-report.json

# Scan with suppression file
dependency-check --scan decompiled/ --suppression suppressions.xml --out report.json
```

#### Output Analysis

```bash
# View report
jq '.dependencies[] | select(.vulnerabilities | length > 0)' dependency-check-report.json

# Count critical vulnerabilities
jq '[.dependencies[] | .vulnerabilities[] | select(.severity | ascii_downcase == "high" or ascii_downcase == "critical")] | length' dependency-check-report.json
```

### Snyk

#### Installation

```bash
# Install CLI
npm install -g snyk

# Authenticate
snyk auth $SNYK_TOKEN
```

#### Usage

```bash
# Scan dependencies (requires source code)
snyk test

# Generate JSON report
snyk test --json > snyk-report.json

# Monitor dependencies
snyk monitor

# Scan Gradle dependencies
snyk test --file=build.gradle
```

### Grype

```bash
# Install
brew install grype

# Scan APK
grype app.apk

# Scan directory
grype dir:./decompiled/

# Output JSON
grype app.apk -o json > grype-report.json
```

### OSV Scanner

```bash
# Install
go install github.com/google/osv-scanner/cmd/osv-scanner@latest

# Scan SBOM
osv-scanner --sbom sbom.json

# Scan directory
osv-scanner --recursive ./decompiled/
```

---

## 5. Vulnerability Detection

### Known CVE Detection

#### Checking OkHttp Version

```bash
# Extract OkHttp version
grep -rn "okhttp3" decompiled/ | grep -oE "[0-9]+\.[0-9]+\.[0-9]+" | head -1

# Check against known CVEs
# CVE-2021-0341: < 2.7.5
# CVE-2021-0365: < 4.9.1
# CVE-2023-3635: < 4.11.0

# Compare version
python3 << 'EOF'
import sys
from packaging import version

installed = "3.14.9"
vulnerable_threshold = "4.10.1"

if version.parse(installed) < version.parse(vulnerable_threshold):
    print("VULNERABLE")
else:
    print("SECURE")
EOF
```

#### Checking Firebase Versions

```bash
# Find Firebase version
grep -rn "com.google.firebase" decompiled/ | grep -oE "firebase:[0-9.]+" | head -1

# Check for known vulnerable versions
# Firebase SDKs frequently patch security issues
```

#### Checking React Native Version

```bash
# Find React Native version
cat package.json | grep -oE '"react-native": "[0-9.]+"'

# Check against known vulnerable versions
# React Native < 0.63.0: Multiple CVEs
# React Native < 0.64.0: Security patches missing
```

### Dependency Confusion Detection

#### Maven Repository Check

```bash
# List all dependencies
grep -E "implementation|api|compile" build.gradle | grep -v "//"

# Check if dependencies resolve to public Maven
# For each dependency:
mvn dependency:tree -Dincludes=com.example:library

# If downloads from public repository instead of internal → VULNERABLE
```

#### NPM/React Native Check

```bash
# Check for typosquatting
npm ls

# Compare with known good packages
# If package name is slightly different from expected → POSSIBLE ATTACK
```

### Typosquatting Detection

#### Common Typosquatting Patterns

```bash
# Common prefixes/suffixes
# - original: example-package
# - typos: examp1e-package, example-pacakge, example_package_

# Search for suspicious package names
grep -E "examp1e|pacakge|_package" package.json

# Check for transitive dependencies
npm ls --all
```

---

## 6. SBOM Generation

### Generating SBOM for Android Apps

#### Using Syft

```bash
# Install
brew install syft

# Generate SBOM from APK
syft app.apk -o cyclonedx-json -o sbom.json

# Generate SBOM from source
syft . -o cyclonedx-json -o sbom.json

# Generate SPDX format
syft app.apk -o spdx-json -o sbom-spdx.json
```

#### Using Trivy

```bash
# Install
brew install trivy

# Generate SBOM (filesystem scan of decompiled APK)
trivy fs ./decompiled_apk/ --format cyclonedx-json --output sbom.json

# Scan SBOM for vulnerabilities
trivy sbom --severity HIGH,CRITICAL sbom.json
```

#### Using OWASP Dependency-Track

```bash
# Start Dependency-Track server
docker run -d -p 8080:8080 owasp/dependency-track

# Upload SBOM
curl -X POST http://localhost:8080/api/v1/upload \
  -F "file=@sbom.json" \
  -F "projectName=MyAndroidApp" \
  -F "projectVersion=1.0.0"
```

### SBOM Analysis

#### Parsing SBOM

```bash
# View components
jq '.components[] | {name: .name, version: .version, purl: .purl}' sbom.json

# Check for suspicious packages
jq '.components[] | select(.name | test("^[0-9]"))' sbom.json

# Find packages without suppliers
jq '.components[] | select(.supplier == null)' sbom.json
```

---

## 7. OWASP M2 Checklist

Use this checklist to systematically evaluate supply chain security:

### Discovery

- [ ] List all third-party SDKs by package name
- [ ] Identify SDK versions where possible
- [ ] Document which SDKs are critical (payment, auth, networking)
- [ ] Map SDKs to their functionalities (analytics, ads, auth, etc.)

### Vulnerability Assessment

- [ ] Check each SDK for known CVEs (use NVD, CVE Details)
- [ ] Verify OkHttp version >= 4.10.1 (if used)
- [ ] Check for Firebase misconfigurations (database, storage)
- [ ] Verify Facebook SDK version and configuration
- [ ] Check for outdated Google Play Services

### Credential Security

- [ ] Check for hardcoded SDK credentials (API keys, tokens)
- [ ] Find Google API keys in manifest or code
- [ ] Find Firebase config files (google-services.json)
- [ ] Find Facebook App ID and Client Token
- [ ] Find payment SDK API keys/credentials

### Dependency Confusion

- [ ] Verify all dependencies resolve to internal repositories first
- [ ] Check for typosquatting in dependency names
- [ ] Validate dependency signatures if possible
- [ ] Lock dependency versions in build files

### Permission Analysis

- [ ] Compare SDK permissions vs app permissions
- [ ] Identify excessive permissions requested by SDKs
- [ ] Check for permission combinations that create risk
- [ ] Verify if permissions are actually used by SDKs

### SBOM Generation

- [ ] Generate SBOM for the application
- [ ] Upload SBOM to Dependency-Track or similar tool
- [ ] Monitor for new vulnerabilities in dependencies
- [ ] Set up automated dependency scanning in CI/CD

### Documentation

- [ ] Document all third-party packages with versions
- [ ] Add security notes for each vulnerable SDK
- [ ] Create dependency tree (including transitive dependencies)
- [ ] Document recommended updates/remediations

---

## 8. Mitigation Strategies

### Dependency Management

#### Lock Dependency Versions

```gradle
// build.gradle
dependencies {
    // Use exact versions, not dynamic
    implementation 'com.squareup.okhttp3:okhttp:4.12.0'  // ✅ Good
    implementation 'com.squareup.okhttp3:okhttp:4.+'      // ❌ Bad (dynamic)

    // Use dependency locks
    implementation platform('com.squareup.okhttp3:okhttp-bom:4.12.0')
    implementation 'com.squareup.okhttp3:okhttp'
    implementation 'com.squareup.okhttp3:logging-interceptor'
}
```

#### Repository Configuration

```gradle
// build.gradle (project level)
repositories {
    // Add internal repositories first
    maven { url 'https://internal.company.com/maven2' }

    // Then public repositories
    google()
    mavenCentral()
}
```

### Dependency Scanning in CI/CD

#### GitHub Actions Example

```yaml
name: Dependency Scan

on: [push, pull_request]

jobs:
  dependency-check:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4

      - name: Run OWASP Dependency-Check
        run: |
          docker run --rm -v $(pwd):/src \
            owasp/dependency-check:latest \
            --scan /src --format JSON --out /src/dependency-check.json

      - name: Check for Critical Vulnerabilities
        run: |
          CRITICAL=$(jq '[.dependencies[] | .vulnerabilities[] | select(.severity | ascii_downcase == "high" or ascii_downcase == "critical")] | length' dependency-check.json)
          if [ $CRITICAL -gt 0 ]; then
            echo "❌ Found $CRITICAL critical/high vulnerabilities"
            exit 1
          fi
```

### SDK Security Hardening

#### Firebase Security

```javascript
// Secure Firebase configuration
const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY,  // Environment variable
  authDomain: "app.firebaseapp.com",
  projectId: "app",
  storageBucket: "app.appspot.com",
  messagingSenderId: "123456789"
};

// Enable App Check
import { initializeAppCheck } from "firebase/app-check";

initializeAppCheck(app, {
  provider: new ReCaptchaV3Provider('reCAPTCHA_SITE_KEY'),
  isTokenAutoRefreshEnabled: true
});
```

#### Network SDK Hardening

```java
// Secure OkHttp configuration
OkHttpClient client = new OkHttpClient.Builder()
    .certificatePinner(new CertificatePinner.Builder()
        .add("example.com", "sha256/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=")
        .build())
    .build();

// Disable cleartext traffic
<application
    android:usesCleartextTraffic="false">
```

### Automated Updates

#### Dependabot for Gradle

```yaml
# .github/dependabot.yml
version: 2
updates:
  - package-ecosystem: "gradle"
    directory: "/"
    schedule:
      interval: "weekly"
    open-pull-requests-limit: 10
```

#### Renovate for Gradle

```json
{
  "$schema": "https://docs.renovatebot.com/renovate-schema.json",
  "extends": ["config:base"],
  "gradle": {
    "enabled": true
  },
  "schedule": ["weekly"]
}
```

---

## Quick Reference

### Essential Commands

```bash
# Scan APK with OWASP Dependency-Check
dependency-check --scan app.apk --format JSON --out report.json

# Scan with Snyk
snyk test

# Generate SBOM
syft app.apk -o cyclonedx-json -o sbom.json

# Find all dependencies
grep -E "implementation|api|compile" build.gradle

# Check OkHttp version
grep -rn "okhttp3" decompiled/ | grep -oE "[0-9]+\.[0-9]+\.[0-9]+"

# Check for hardcoded credentials
strings app.apk | grep -iE "api.*key|secret|token|password"
```

### Tool Matrix

| Task | Tool | Format |
|------|------|--------|
| Dependency scanning | OWASP Dependency-Check | JSON, HTML, XML |
| Vulnerability database | Snyk | JSON |
| SBOM generation | Syft, Trivy | CycloneDX, SPDX |
| Dependency monitoring | Dependabot, Renovate | PRs |
| CI/CD integration | GitHub Actions, GitLab CI | YAML |

---

## References

- OWASP Dependency-Check: https://dependency-check.github.io/Dependency-Check/
- Snyk: https://snyk.io/
- OWASP Mobile Top 10: https://owasp.org/www-project-mobile-top-10/
- NVD National Vulnerability Database: https://nvd.nist.gov/vuln/search
- CVE Details: https://www.cvedetails.com/
- Dependency-Track: https://dependencytrack.org/
- Syft: https://github.com/anchore/syft
- Trivy: https://github.com/aquasecurity/trivy

---

**Maintainer:** android-apk-audit skill
**Related Files:** dependency-analysis.md, android-manifest-checklist.md, ci-cd-integration.md
**Category:** Reference Document
**Last Updated:** 2025
