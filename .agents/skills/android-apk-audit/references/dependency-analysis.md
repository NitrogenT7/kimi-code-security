# Dependency Analysis for Android APK Security Auditing

**Last Updated:** 2025

This guide covers analyzing third-party dependencies and SDKs in Android APKs for known vulnerabilities through Software Composition Analysis (SCA).

---

## Table of Contents
1. [Why Dependency Analysis Matters](#1-why-dependency-analysis-matters)
2. [Finding Dependencies in APKs](#2-finding-dependencies-in-apks)
3. [Common SDK Detection Patterns](#3-common-sdk-detection-patterns)
4. [Version Detection](#4-version-detection)
5. [Known Vulnerability Patterns](#5-known-vulnerability-patterns)
6. [OWASP M2 Checklist](#6-owasp-m2-checklist)
7. [Automated SCA Tools](#7-automated-sca-tools)
8. [Cross-OS Commands](#8-cross-os-commands)

---

## 1. Why Dependency Analysis Matters

### The Third-Party Reality
- **A significant portion of Android app code** comes from third-party libraries and SDKs (studies suggest 70%+ in modern applications)
- Modern apps integrate 10-50+ SDKs on average
- Each SDK introduces its own attack surface, permissions, and data handling

### Key Security Risks
| Risk | Impact |
|------|--------|
| Known CVEs in libraries | Exploitable vulnerabilities (RCE, data theft) |
| Excessive permissions | SDKs request more than needed, user has no control |
| Insecure defaults | Cleartext networking, weak crypto, bypassed validations |
| Data collection without consent | PII harvested by analytics/ad SDKs |
| Hardcoded credentials | API keys, tokens, consumer secrets embedded in code |
| WebView exposure | JS bridges allowing XSS from third-party content |

### OWASP Relevance
- **OWASP M2: Inadequate Supply Chain Security** - Directly addressed
- **OWASP M5: Insecure Communication** - SDKs often use cleartext
- **OWASP M9: Insecure Data Storage** - SDKs storing data inappropriately
- **OWASP M10: Insufficient Cryptography** - Weak crypto in older library versions

---

## 2. Finding Dependencies in APKs

### From Decompiled Source

#### Extract Package Declarations
```bash
# Cross-OS compatible package detection
grep -rnE "^package " "$APP/" | sort -u

# Output example:
# com/example/app/
# com/google/android/gms/analytics/
# com/facebook/login/
```

#### Extract Import Statements
```bash
# Get all unique imports
grep -rnE "^import " "$APP/" | cut -d' ' -f2 | sort -u

# Extract domain from imports for library identification
grep -rnE "^import " "$APP/" | cut -d' ' -f2 | cut -d'.' -f1-3 | sort -u
```

#### Search for Known Third-Party Patterns
```bash
# Major tech companies
grep -rnE "com/google/|com/facebook/|com/amazon/" "$APP/" | cut -d: -f1 | sort -u | head -20

# Mobile ad networks
grep -rnE "io/fabric/|com/crashlytics/|com/chartboost/" "$APP/" | head -20

# Payment gateways
grep -rnE "com/stripe/|com/paypal/|com/braintreepayments/" "$APP/" | head -20

# Social SDKs
grep -rnE "com/twitter/|com/instagram/|com/linkedin/" "$APP/" | head -20
```

### From Build Files (if present)

#### Locate Build Configuration Files
```bash
# Gradle files
find decoded/ -name "build.gradle" -o -name "build.gradle.kts"

# Maven POM files
find decoded/ -name "pom.xml"

# ProGuard/R8 mapping files (may reveal obfuscated libraries)
find decoded/ -name "mapping.txt" -o -name "proguard-rules.pro"
```

#### Extract Dependencies from Gradle Cache Paths
```bash
# Gradle cache pattern: com/group/artifact/version
grep -rnE "com/[a-z]+/[a-z]+/" "$APP/" | grep -oE "com/[a-z]+/[a-z]+/[a-z0-9_.-]+" | sort -u

# Example output:
# com/google/android/gms/play-services-base
# com/squareup/okhttp3/okhttp
# com/facebook/react/react-native
```

### From JAR/AAR Files

#### List Embedded Libraries
```bash
# All JAR files (includes transitive dependencies)
find decoded/ -name "*.jar"

# Android AAR files
find decoded/ -name "*.aar"

# DEX files (may contain code from multiple libraries)
find decoded/ -name "*.dex"
```

#### Analyze JAR Contents
```bash
# List all classes in JAR
jar tf lib.jar | head -50

# Find version information in JARs
jar tf lib.jar | grep -E "pom.properties|MANIFEST.MF"

# Extract and read pom.properties (contains Maven coordinates)
jar xf lib.jar META-INF/maven/com.squareup.okhttp3/okhttp/pom.properties
cat META-INF/maven/com.squareup.okhttp3/okhttp/pom.properties

# Check JAR manifest for implementation details
jar xf lib.jar META-INF/MANIFEST.MF
cat META-INF/MANIFEST.MF | grep -iE "version|implementation"
```

---

## 3. Common SDK Detection Patterns

### Analytics & Tracking SDKs

| SDK | Package | Grep Pattern | Common Security Issues |
|-----|---------|-------------|------------------------|
| Google Analytics | `com.google.android.gms.analytics` | `google.*analytics` | Data collection without consent, device fingerprinting |
| Firebase Analytics | `com.google.firebase.analytics` | `firebase.*analytics` | PII collection, cross-app tracking |
| Mixpanel | `com.mixpanel` | `mixpanel` | Excessive data harvesting, IP logging |
| Amplitude | `com.amplitude` | `amplitude` | Session tracking without disclosure |
| Segment | `com.segment.analytics` | `segment` | Data aggregation across multiple services |
| Flurry | `com.flurry` | `flurry` | Persistent identifiers, location tracking |
| AppsFlyer | `com.appsflyer` | `appsflyer` | Deep link tracking, attribution fraud risk |

**Detection Commands:**
```bash
# Find analytics SDKs
grep -rnE "google.*analytics|firebase.*analytics|mixpanel|amplitude" "$APP/" --include="*.java" --include="*.kt" | head -20

# Check for analytics initialization
grep -rnE "initialize\|getInstance\|startSession" "$APP/" | grep -iE "analytics|flurry|mixpanel" | head -10
```

### Advertising SDKs

| SDK | Package | Grep Pattern | Security Concerns |
|-----|---------|-------------|-------------------|
| AdMob | `com.google.android.gms.ads` | `admob\|gms.*ads` | WebView JS bridge exposure, click fraud |
| Facebook Ads | `com.facebook.ads` | `facebook.*ads` | Excessive data collection, tracking outside app |
| Unity Ads | `com.unity3d.ads` | `unity.*ads` | Device info harvesting, unsafe webview |
| AppLovin | `com.applovin` | `applovin` | Location tracking, ad injection |
| IronSource | `com.ironsource` | `ironsource` | Multiple ad SDKs = attack surface multiplication |
| Vungle | `com.vungle` | `vungle` | Unsafe resource loading |

**Detection Commands:**
```bash
# Find ad SDKs
grep -rnE "admob\|gms.*ads\|facebook.*ads\|unity.*ads" "$APP/" --include="*.java" | head -20

# Check for ad network URLs
grep -rnE "googleads\|doubleclick\|facebook.*ads|advertising" "$APP/" | head -10
```

### Social SDKs

| SDK | Package | Grep Pattern | Known Vulnerabilities |
|-----|---------|-------------|----------------------|
| Facebook SDK | `com.facebook` | `facebook.*sdk\|com.facebook.login` | Access token leaks, insecure JS bridge, hardcoded app ID |
| Google Sign-In | `com.google.android.gms.auth` | `google.*auth\|google.*signin` | Token handling, intent interception |
| Twitter SDK | `com.twitter` | `twitter.*sdk` | Hardcoded consumer secrets, weak crypto |
| LinkedIn SDK | `com.linkedin.android` | `linkedin.*sdk` | Token storage in SharedPreferences |
| WeChat SDK | `com.tencent.mm.opensdk` | `tencent.*opensdk` | Weak signature verification |

**Detection Commands:**
```bash
# Find social login SDKs
grep -rnE "facebook.*login\|google.*signin\|twitter.*oauth" "$APP/" --include="*.java" | head -20

# Check for hardcoded social SDK credentials
grep -rnE "facebook.*app.*id\|fb.*app.*id\|twitter.*consumer.*key" "$APP/" | head -10
```

### Networking Libraries

| SDK | Package | Grep Pattern | Security Issues |
|-----|---------|-------------|-----------------|
| OkHttp | `okhttp3` | `okhttp3\|okhttp` | TrustManager bypass, pinning misconfig, CVEs in older versions |
| Retrofit | `retrofit2` | `retrofit2\|retrofit` | Depends on OkHttp config, serialization issues |
| Volley | `com.android.volley` | `volley` | Cleartext traffic default, no cert pinning |
| Glide | `com.bumptech.glide` | `glide` | URL loading without validation, image loading vulnerabilities |
| Picasso | `com.squareup.picasso` | `picasso` | Image loading security, caching issues |
| Ion | `com.koushikdutta.ion` | `ion` | Unsafe HTTP client configuration |

**Detection Commands:**
```bash
# Find networking libraries
grep -rnE "okhttp3\|retrofit2\|volley\|glide\|picasso" "$APP/" --include="*.java" | head -20

# Check for unsafe SSL configurations
grep -rnE "TrustAll\|UnsafeTrustManager\|NoHostnameVerifier" "$APP/" --include="*.java" | head -10
```

### Payment SDKs

| SDK | Package | Grep Pattern | Security Concerns |
|-----|---------|-------------|------------------|
| Stripe | `com.stripe` | `stripe` | Hardcoded publishable keys, insecure token storage |
| PayPal | `com.paypal` | `paypal` | Deep link hijacking, intent interception |
| Braintree | `com.braintreepayments` | `braintree` | Token handling, client token exposure |
| Google Pay | `com.google.android.gms.wallet` | `wallet.*pay` | Intent interception, token leak |
| Square | `com.squareup` | `square.*pos\|square.*reader` | Hardware exposure, insecure BLE |
| Iyzico | `com.iyzipay` | `iyzipay` | Hardcoded API keys |

**Detection Commands:**
```bash
# Find payment SDKs
grep -rnE "stripe\|paypal\|braintree\|wallet.*pay" "$APP/" --include="*.java" | head -20

# Check for hardcoded payment credentials
grep -rnE "stripe.*public.*key\|paypal.*client.*id\|braintree.*token" "$APP/" -i | head -10
```

### Crash Reporting SDKs

| SDK | Package | Grep Pattern | Security Issues |
|-----|---------|-------------|-----------------|
| Crashlytics | `com.crashlytics` | `crashlytics\|firebase.*crash` | API key in manifest, stack trace leak |
| Sentry | `io.sentry` | `sentry` | DSN exposure, server URL disclosure |
| Bugsnag | `com.bugsnag` | `bugsnag` | API key exposure, excessive data collection |
| ACRA | `ch.acra` | `acra` | Stack trace may contain sensitive data |
| Firebase Crashlytics | `com.google.firebase.crashlytics` | `firebase.*crashlytics` | Requires Google services dependency |

**Detection Commands:**
```bash
# Find crash reporting SDKs
grep -rnE "crashlytics\|sentry\|bugsnag\|acra" "$APP/" --include="*.java" | head -20

# Check for exposed crash reporting URLs/DSNs
grep -rnE "sentry.*dsn\|crashlytics.*api.*key\|bugsnag.*api.*key" "$APP/" -i | head -10
```

### Chat & Messaging SDKs

| SDK | Package | Grep Pattern | Security Concerns |
|-----|---------|-------------|------------------|
| Twilio | `com.twilio` | `twilio` | Hardcoded account SID/tokens, weak crypto |
| Sendbird | `com.sendbird` | `sendbird` | App ID exposure, insecure transport |
| Firebase Realtime DB | `com.google.firebase.database` | `firebase.*database` | Unauthenticated access, misconfigurable rules |
| Socket.io | `io.socket` | `socket.*io` | Unencrypted connections by default |
| Pusher | `com.pusher` | `pusher` | API key exposure, lack of auth |
| PubNub | `com.pubnub` | `pubnub` | Hardcoded subscribe keys |

**Detection Commands:**
```bash
# Find messaging SDKs
grep -rnE "twilio\|sendbird\|firebase.*database\|socket.*io" "$APP/" --include="*.java" | head -20

# Check for insecure database URLs
grep -rnE "firebaseio\.com\|supabase\|mongodb.*connection" "$APP/" | head -10
```

### Other Common SDKs

| Category | SDK | Package | Grep Pattern | Issue |
|----------|-----|---------|-------------|-------|
| Maps | Google Maps | `com.google.android.gms.maps` | `google.*maps` | API key in manifest |
| Maps | Mapbox | `com.mapbox.mapboxsdk` | `mapbox` | API token exposure |
| Storage | Firebase Storage | `com.google.firebase.storage` | `firebase.*storage` | Unauthenticated upload |
| Auth | Firebase Auth | `com.google.firebase.auth` | `firebase.*auth` | Weak password policies |
| ML | Firebase ML Kit | `com.google.firebase.ml` | `firebase.*ml` | Large binary download |
| ML | TensorFlow Lite | `org.tensorflow.lite` | `tensorflow` | Model injection risk |

---

## 4. Version Detection

### From AndroidManifest.xml

```bash
# Check for Play Services version requirement
grep -rnE "com.google.android.gms.version" decoded/AndroidManifest.xml

# Check for Facebook SDK version
grep -rnE "com.facebook.sdk.ApplicationId|com.facebook.sdk.ApplicationName" decoded/AndroidManifest.xml

# Check for other SDK metadata
grep -rnE "versionName|versionCode|buildVersion" decoded/AndroidManifest.xml
```

### From BuildConfig Files

```bash
# Search all BuildConfig.java files
find "$APP/" -name "BuildConfig.java" -exec cat {} \; | grep -E "VERSION_NAME|VERSION_CODE|BUILD_TYPE|FLAVOR"

# Example output:
# public static final String VERSION_NAME = "1.2.3";
# public static final int VERSION_CODE = 123;
# public static final boolean DEBUG = false;
```

### From POM Properties in Embedded JARs

```bash
# Find all pom.properties files (Maven metadata)
find decoded/ -name "pom.properties"

# Extract version info from pom.properties
find decoded/ -name "pom.properties" -exec cat {} \; | grep -E "groupId|artifactId|version"

# Example pom.properties:
# groupId=com.squareup.okhttp3
# artifactId=okhttp
# version=3.14.9
```

### From JAR Manifests

```bash
# Find all MANIFEST.MF files
find decoded/ -name "MANIFEST.MF"

# Extract version information
find decoded/ -name "MANIFEST.MF" -exec cat {} \; | grep -iE "version|implementation|bundle"

# Example MANIFEST.MF:
# Manifest-Version: 1.0
# Implementation-Version: 2.9.0
# Bundle-Version: 2.9.0
```

### From DEX Strings

```bash
# Extract strings from DEX files and search for version patterns
strings "$APK" | grep -oE "[0-9]+\.[0-9]+\.[0-9]+" | sort -u | head -20

# Combine with library names for better accuracy
strings "$APK" | grep -E "okhttp3|retrofit2|glide" | grep -oE "[0-9]+\.[0-9]+\.[0-9]+"
```

---

## 5. Known Vulnerability Patterns

### OkHttp Vulnerabilities

#### Critical CVEs by Version

| CVE | Affected Versions | Severity | Description |
|-----|-------------------|----------|-------------|
| CVE-2021-0341 | < 2.7.5 | HIGH | Certificate pinning bypass |
| CVE-2021-0365 | < 4.9.1 | HIGH | Improper certificate validation |
| CVE-2023-3635 | < 4.11.0 | MEDIUM | Connection pool exhaustion |

**Note:** CVE-2022-24329 was previously attributed to OkHttp but is actually a Kotlin stdlib vulnerability. See Kotlin dependencies for remediation.

#### Detection & Analysis

```bash
# Check OkHttp version
grep -rn "okhttp3" "$APP/" | grep -oE "[0-9]+\.[0-9]+\.[0-9]+" | head -1

# Or from JAR manifest
find decoded/ -name "okhttp*.jar" -exec unzip -p {} META-INF/MANIFEST.MF \; | grep Version

# Check for certificate pinning implementation
grep -rnE "CertificatePinner\|add\(" "$APP/" --include="*.java" | head -10

# Check for TrustManager overrides
grep -rnE "X509TrustManager\|checkServerTrusted" "$APP/" --include="*.java" | head -10
```

#### Remediation Check
- Verify OkHttp version >= 4.10.1
- Check if CertificatePinner is properly implemented
- Look for custom TrustManager that bypasses validation

### Firebase Misconfigurations

#### Insecure Database Rules

```bash
# Find Firebase Realtime Database URLs
grep -rnE "firebaseio\.com|firebase\.app" "$APP/" | head -10

# Extract project IDs
grep -rnE "firebaseio\.com" "$APP/" | grep -oE "[a-z0-9-]+\.firebaseio\.com" | sort -u

# Test for open database access
# curl https://<project-id>.firebaseio.com/.json
# If returns data without auth → VULNERABLE
```

#### Firebase Storage Exposure

```bash
# Find Firebase Storage references
grep -rnE "firebase\.appspot\.com|firebase\.storage" "$APP/" | head -10

# Test for public bucket
# curl https://storage.googleapis.com/<bucket-name>/
# If lists files → VULNERABLE
```

#### API Key Exposure

```bash
# Find Google API keys in manifest
grep -rnE "api_key|google_api_key" decoded/AndroidManifest.xml

# Check for API keys in code
grep -rnE "AIza[A-Za-z0-9_-]{35}" "$APP/" --include="*.java" | head -10

# Check for Firebase config
grep -rnE "firebase.*config\|google-services\.json" "$APP/" | head -10
```

### Facebook SDK Issues

#### App ID & Client Token Exposure

```bash
# Find Facebook App ID
grep -rnE "facebook.*app.*id|fb.*app.*id|facebook_client_token" "$APP/" -i | head -10

# Check AndroidManifest.xml
grep -rnE "com.facebook.sdk.ApplicationId" decoded/AndroidManifest.xml

# Risk: App ID + Client Token can allow API abuse and impersonation
```

#### Login Token Leaks

```bash
# Check for token storage
grep -rnE "AccessToken\|LoginManager\|getCurrentAccessToken" "$APP/" --include="*.java" | head -10

# Check for token logging
grep -rnE "Log\.(d|i|v).*token\|System\.out\.println.*token" "$APP/" --include="*.java" -i
```

#### WebView Bridge Issues

```bash
# Find Facebook WebView usage
grep -rnE "com/facebook.*WebView\|FacebookWebView" "$APP/" --include="*.java" | head -10

# Check for JavaScript interface exposure
grep -rnE "addJavascriptInterface.*facebook" "$APP/" --include="*.java" | head -10
```

### WebView-Related SDK Issues

Many SDKs embed WebViews for ads, auth, or rich content. This creates XSS risks.

#### Detection

```bash
# Find all WebView instantiations
grep -rnE "new WebView\|extends WebView" "$APP/" --include="*.java" | head -20

# Find JavaScript interface usage
grep -rnE "addJavascriptInterface" "$APP/" --include="*.java" | head -20

# Cross-reference with SDK packages to identify third-party JS bridges
grep -rnE "addJavascriptInterface" "$APP/" --include="*.java" | grep -v "^Binary" | head -20

# Check for file:// URL loading
grep -rnE "loadUrl.*file://" "$APP/" --include="*.java" | head -10

# Check for setAllowFileAccess
grep -rnE "setAllowFileAccess.*true" "$APP/" --include="*.java" | head -10
```

#### Common WebView-Using SDKs
- Facebook SDK (ads, login)
- Google Sign-In
- AdMob/Ad networks
- Payment gateways (Braintree, PayPal)
- Chat SDKs (Intercom, Zendesk)

### Retrofit Configuration Issues

#### Unsafe Base URLs

```bash
# Find Retrofit base URLs
grep -rnE "baseUrl.*http://\|Retrofit.*Builder" "$APP/" --include="*.java" | head -20

# Check for cleartext URLs
# NOTE: grep -E does not support PCRE lookahead (?!). Use alternative methods:
# Method 1: grep then filter
grep -rn "http://" "$APP/" --include="*.java" | grep -v "localhost" | grep retrofit | head -10
# Method 2: Use ripgrep which supports PCRE
# rg "http://(?!localhost)" "$APP/" -t java | head -10
```

#### Converter Misconfigurations

```bash
# Check for unsafe JSON parsing
grep -rnE "GsonConverterFactory|MoshiConverterFactory" "$APP/" --include="*.java" | head -10

# Look for custom deserialization
grep -rnE "JsonDeserializer|fromJson|serialize" "$APP/" --include="*.java" | head -10
```

### Glide/Picasso Image Loading Issues

```bash
# Check for unsafe URL loading
grep -rnE "Glide\.with.*load\(|Picasso\.get\(\)\.load\(" "$APP/" --include="*.java" | head -20

# Check for file:// URL loading
grep -rnE "load.*file://" "$APP/" --include="*.java" | head -10

# Check for unrestricted domains
grep -rnE "glide.*registry.*add\(|picasso.*setIndicatorsEnabled" "$APP/" --include="*.java" | head -10
```

---

## 6. OWASP M2 Checklist

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

### Permission Analysis
- [ ] Compare SDK permissions vs app permissions
- [ ] Identify excessive permissions requested by SDKs
- [ ] Check for permission combinations that create risk (e.g., location + ads)
- [ ] Verify if permissions are actually used by SDKs

### Data Collection
- [ ] Identify data collection by analytics SDKs
- [ ] Check for consent mechanisms
- [ ] Identify PII collected without user awareness
- [ ] Check for location tracking by ad SDKs

### WebView Security
- [ ] List SDKs that use WebView internally
- [ ] Check for JavaScript interfaces exposed by SDKs
- [ ] Verify WebView security settings (file access, mixed content)
- [ ] Test for XSS vulnerabilities through SDK WebViews

### Network Security
- [ ] Check SDKs for cleartext traffic (http:// URLs)
- [ ] Verify certificate pinning in networking SDKs
- [ ] Check for custom TrustManager implementations
- [ ] Verify SSL/TLS versions used by SDKs

### Documentation
- [ ] Document all third-party packages with versions
- [ ] Add security notes for each vulnerable SDK
- [ ] Create dependency tree (including transitive dependencies)
- [ ] Document recommended updates/remediations

---

## 7. Automated SCA Tools

### OWASP Dependency-Check

#### Installation
```bash
# macOS
brew install dependency-check

# Linux
apt install dependency-check

# Or download from https://dependency-check.github.io/Dependency-Check/
```

#### Basic Usage

```bash
# Scan decompiled directory (if build files available)
dependency-check --scan "$APP/" --format HTML --out dependency-report/

# Scan APK directly (limited support)
dependency-check --scan app.apk --format HTML --out dependency-report/

# Specify suppression file for false positives
dependency-check --scan "$APP/" --suppression suppressions.xml --out report/
```

#### Output
- Generates HTML/JSON report with:
  - CVE listings by dependency
  - Severity scores (CVSS)
  - Remediation recommendations
  - False positive filtering

### Snyk (Commercial)

```bash
# Install Snyk CLI
npm install -g snyk

# Authenticate
snyk auth

# Scan project (requires build files)
snyk test

# Generate report
snyk test --json > snyk-report.json
```

### WhiteSource/Mend

Commercial tool with mobile app support. Requires API key.

### Gradle Plugins (For Original Project)

```gradle
plugins {
    id 'org.owasp.dependencycheck' version '8.4.0'
}

dependencyCheck {
    format = 'HTML'
    failBuildOnCVSS = 7.0
}
```

### Manual CVE Database Lookup

#### NVD (National Vulnerability Database)
- URL: https://nvd.nist.gov/vuln/search
- Search by: library name + version

#### CVE Details
- URL: https://www.cvedetails.com/
- Comprehensive CVE database with CVSS scores

#### Snyk Vulnerability Database
- URL: https://snyk.io/vuln/
- Free, searchable CVE database for open-source libs

#### GitHub Advisory Database
- URL: https://github.com/advisories
- Integrated with npm, Maven, pip, Go modules

#### OSV (Open Source Vulnerabilities)
- URL: https://osv.dev/
- Google's vulnerability database for OSS

---

## 8. Cross-OS Commands

### macOS / Linux Compatibility

All commands in this guide use `-rnE` (regular expressions) for compatibility across macOS and Linux.

**Note:** Avoid `-P` (Perl regex) which is not available on macOS grep by default.

### Windows PowerShell Equivalents

#### Find Files
```powershell
# Find all Java files
Get-ChildItem -Path . -Filter "*.java" -Recurse

# Find specific pattern
Select-String -Path . -Pattern "^package " -Recurse | Select-Object -Unique
```

#### Extract Imports
```powershell
Select-String -Path . -Pattern "^import " -Recurse | ForEach-Object { $_.Line.Split(' ')[1] } | Sort-Object -Unique
```

#### Search for SDKs
```powershell
Select-String -Path . -Pattern "okhttp3|retrofit2" -Recurse -Filter "*.java" | Select-Object -First 20
```

---

## Appendix: Quick Reference

### Essential Commands

```bash
# List all unique packages
grep -rnE "^package " "$APP/" | sort -u

# List all unique imports
grep -rnE "^import " "$APP/" | cut -d' ' -f2 | sort -u

# Find OkHttp version
grep -rn "okhttp3" "$APP/" | grep -oE "[0-9]+\.[0-9]+\.[0-9]+" | head -1

# Find Firebase URLs
grep -rnE "firebaseio\.com|firebase\.app" "$APP/" | head -10

# Find hardcoded API keys
grep -rnE "AIza[A-Za-z0-9_-]{35}" "$APP/" --include="*.java" | head -10

# Find WebView JS interfaces
grep -rnE "addJavascriptInterface" "$APP/" --include="*.java" | head -20

# Check for unsafe HTTP URLs
grep -rnP "http://(?!localhost)" "$APP/" --include="*.java" | head -10

# Extract JAR versions
find decoded/ -name "pom.properties" -exec cat {} \; | grep -E "groupId|artifactId|version"
```

### Critical CVE Quick Lookup

| Library | Critical Versions | Check Version With | Current Safe Version |
|---------|------------------|-------------------|----------------------|
| OkHttp | < 4.10.1 | grep okhttp3 | 4.12.0+ |
| Retrofit | Any (depends on OkHttp) | grep retrofit2 | 2.9.0+ |
| Glide | < 4.16.0 | grep glide | 4.16.0+ |
| Picasso | Any (check for updates) | grep picasso | 2.8+ |
| Volley | Any (in AndroidX) | grep volley | Use AndroidX |

---

## References

- OWASP Mobile Top 10 2024: https://owasp.org/www-project-mobile-top-10/
- NVD National Vulnerability Database: https://nvd.nist.gov/vuln/search
- Android Security Guidelines: https://developer.android.com/topic/security/best-practices
- Google Play Security Advisory Program: https://support.google.com/googleplay/android-developer/answer/7317366

---

**Maintainer:** android-apk-audit skill
**Category:** Reference Document
**Last Updated:** 2025
