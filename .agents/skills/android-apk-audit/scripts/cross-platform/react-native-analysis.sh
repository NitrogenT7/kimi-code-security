#!/bin/bash
#
# React Native Security Analysis Script
# Extracts and analyzes React Native applications
#
# Usage: ./react-native-analysis.sh <apk_path> <output_dir> [--frida]
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
TOOLS_DIR="$PROJECT_ROOT/scripts"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
log_warning() { echo -e "${YELLOW}[WARNING]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

usage() {
    cat <<EOF
React Native Security Analysis Script
=====================================

Usage: $0 <apk_path> <output_dir> [options]

Arguments:
    apk_path         Path to the React Native APK
    output_dir       Directory for extracted output

Options:
    --frida          Generate Frida hooks recommendations
    --full           Full analysis (default)
    --quick          Quick analysis (skip decompilation)
    --bundle-only    Only extract and analyze the JS bundle

Examples:
    $0 app-release.apk /tmp/rn_analysis
    $0 app.apk /tmp/output --frida --full

EOF
    exit 1
}

check_dependencies() {
    local deps=("apktool" "jadx" "unzip" "strings" "grep" "egrep")
    for dep in "${deps[@]}"; do
        if ! command -v "$dep" &> /dev/null; then
            log_warning "$dep not found. Some features may not work."
        fi
    done

    if ! command -v jq &> /dev/null; then
        log_error "jq not found. Install with: brew install jq"
        exit 2
    fi
}

identify_react_native() {
    local apk_path="$1"
    local decoded_dir="$2"
    
    log_info "Identifying React Native application..."
    
    local indicators=0
    local findings=""
    
    if unzip -l "$apk_path" 2>/dev/null | grep -q "assets/index.android.bundle"; then
        log_success "Found: index.android.bundle (JS bundle)"
        indicators=$((indicators + 1))
        findings="$findings\n  - JS Bundle: assets/index.android.bundle"
    fi
    
    if unzip -l "$apk_path" 2>/dev/null | grep -q "lib/libjsi.so\|libjsi.so"; then
        log_success "Found: libjsi.so (JavaScript Interface)"
        indicators=$((indicators + 1))
        findings="$findings\n  - JSI: libjsi.so present"
    fi
    
    if unzip -l "$apk_path" 2>/dev/null | grep -q "libhermes.so\|libhermesjni.so"; then
        log_success "Found: libhermes.so (Hermes Engine)"
        indicators=$((indicators + 1))
        findings="$findings\n  - Engine: Hermes (JavaScript)"
    elif unzip -l "$apk_path" 2>/dev/null | grep -q "libv8runtime.so\|libv8.so"; then
        log_success "Found: V8 Runtime (JavaScript)"
        indicators=$((indicators + 1))
        findings="$findings\n  - Engine: V8 (JavaScript)"
    fi
    
    if unzip -l "$apk_path" 2>/dev/null | grep -q "libreactnativejni.so"; then
        log_success "Found: libreactnativejni.so (React Native JNI)"
        indicators=$((indicators + 1))
        findings="$findings\n  - JNI: React Native JNI bridge"
    fi
    
    if unzip -l "$apk_path" 2>/dev/null | grep -q "libfbjni.so"; then
        log_success "Found: libfbjni.so (Facebook JNI)"
        indicators=$((indicators + 1))
        findings="$findings\n  - JNI: Facebook utilities"
    fi
    
    if unzip -l "$apk_path" 2>/dev/null | grep -q "libc++_shared.so"; then
        log_info "Found: libc++_shared.so (C++ STL)"
        findings="$findings\n  - C++ runtime: libc++_shared"
    fi
    
    if unzip -p "$apk_path" "AndroidManifest.xml" 2>/dev/null | strings | grep -q "com.facebook.react\|org.reactjs.native\|com.reactnative"; then
        log_success "Found: React Native package indicators in manifest"
        indicators=$((indicators + 1))
        findings="$findings\n  - Package: Facebook React Native"
    fi
    
    if [ "$indicators" -ge 2 ]; then
        echo -e "$findings"
        return 0
    else
        log_warning "Low confidence React Native indicators ($indicators/5)"
        echo -e "$findings"
        return 1
    fi
}

extract_js_bundle() {
    local apk_path="$1"
    local output_dir="$2"
    local bundle_path="$3"
    
    log_info "Extracting JavaScript bundle..."
    
    mkdir -p "$output_dir/bundle"
    
    if unzip -o "$apk_path" "$bundle_path" -d "$output_dir" 2>/dev/null; then
        local bundle_size=$(stat -f%z "$output_dir/$bundle_path" 2>/dev/null || stat -c%s "$output_dir/$bundle_path" 2>/dev/null)
        log_success "Bundle extracted: $bundle_size bytes"
        echo "$bundle_path"
        return 0
    else
        log_error "Failed to extract bundle"
        return 1
    fi
}

analyze_hermes_bytecode() {
    local bundle_path="$1"
    local output_dir="$2"
    
    log_info "Analyzing Hermes bytecode..."
    
    mkdir -p "$output_dir/analysis"
    
    if grep -q "hermes" "$bundle_path" 2>/dev/null; then
        log_success "Hermes bytecode signature detected"
        echo "hermes_detected=true" >> "$output_dir/analysis/hermes.txt"
    fi
    
    if grep -q "__d\(" "$bundle_path" 2>/dev/null; then
        log_info "Found Hermes module definition pattern: __d("
        echo "hermes_module_def=true" >> "$output_dir/analysis/hermes.txt"
    fi
    
    if grep -q "__r\(" "$bundle_path" 2>/dev/null; then
        log_info "Found Hermes require pattern: __r("
        echo "hermes_require=true" >> "$output_dir/analysis/hermes.txt"
    fi
    
    strings "$bundle_path" | head -100 > "$output_dir/analysis/strings_head.txt"
    log_success "Extracted first 100 strings to analysis/strings_head.txt"
}

analyze_js_bundle() {
    local bundle_path="$1"
    local output_dir="$2"
    
    log_info "Analyzing JavaScript bundle content..."
    
    mkdir -p "$output_dir/analysis"
    mkdir -p "$output_dir/secrets"
    
    log_info "Searching for sensitive patterns in bundle..."
    
    egrep -oiE "(api[_-]?key|apikey|secret[_-]?key|access[_-]?token|auth[_-]?token|bearer|password|passwd|pwd|private[_-]?key)" "$bundle_path" 2>/dev/null | sort -u > "$output_dir/secrets/potential_secrets.txt" || true
    
    local secret_count=$(wc -l < "$output_dir/secrets/potential_secrets.txt" 2>/dev/null || echo "0")
    if [ "$secret_count" -gt 0 ]; then
        log_warning "Found $secret_count potential secrets in bundle"
    fi
    
    egrep -oE "https?://[a-zA-Z0-9._/~:&=?%-]+" "$bundle_path" 2>/dev/null | sort -u > "$output_dir/analysis/urls.txt" || true
    local url_count=$(wc -l < "$output_dir/analysis/urls.txt" 2>/dev/null || echo "0")
    log_info "Found $url_count URLs in bundle"
    
    grep -nE "(AsyncStorage|setItem|getItem|removeItem)" "$bundle_path" 2>/dev/null > "$output_dir/analysis/asyncstorage_usage.txt" || true
    
    grep -nE "(fetch|axios|XMLHttpRequest|http\.request)" "$bundle_path" 2>/dev/null > "$output_dir/analysis/network_usage.txt" || true
    
    grep -nE "(console\.log|console\.debug|console\.warn|__DEV__)" "$bundle_path" 2>/dev/null > "$output_dir/analysis/debug_code.txt" || true
    
    log_success "Bundle analysis complete"
}

analyze_storage_usage() {
    local decoded_dir="$1"
    local output_dir="$2"
    
    log_info "Analyzing storage mechanisms..."
    
    mkdir -p "$output_dir/storage"
    
    grep -rn "AsyncStorage\|MMKV\|react-native-keychain\|SecureStore" "$decoded_dir/assets/" 2>/dev/null > "$output_dir/storage/storage_usage.txt" || true
    
    if grep -q "AsyncStorage" "$output_dir/storage/storage_usage.txt" 2>/dev/null; then
        log_warning "AsyncStorage usage detected - verify if sensitive data is stored"
        echo "vulnerability=AsyncStorageUsed" >> "$output_dir/storage/vulnerabilities.txt"
    fi
    
    if grep -q "react-native-keychain" "$output_dir/storage/storage_usage.txt" 2>/dev/null; then
        log_info "react-native-keychain usage detected"
        echo "secure_storage=keychain_detected" >> "$output_dir/storage/vulnerabilities.txt"
    fi
}

analyze_network_security() {
    local bundle_path="$1"
    local output_dir="$2"
    
    log_info "Analyzing network security patterns..."
    
    mkdir -p "$output_dir/network"
    
    if grep -qE "validateHttps\|checkCert\|pinCert\|ssl pinning\|certificate.*pin" "$bundle_path" 2>/dev/null; then
        log_success "Certificate pinning implementation detected"
        echo "pinning=detected" >> "$output_dir/network/ssl_analysis.txt"
    else
        log_warning "No certificate pinning detected"
        echo "pinning=none" >> "$output_dir/network/ssl_analysis.txt"
        echo "vulnerability=NoCertificatePinning" >> "$output_dir/network/vulnerabilities.txt"
    fi
    
    if grep -qE "https?://[a-zA-Z0-9.-]+\.amazonaws\.com" "$bundle_path" 2>/dev/null; then
        log_info "AWS endpoints detected"
        grep -oE "https?://[a-zA-Z0-9.-]+\.amazonaws\.com[^'\"]*" "$bundle_path" 2>/dev/null >> "$output_dir/network/endpoints.txt"
    fi
    
    if grep -qE "(staging|dev|test|qa|beta)\." "$bundle_path" 2>/dev/null; then
        log_warning "Development/Staging endpoints exposed in bundle"
        grep -oE "https?://[^'\"']*(staging|dev|test|qa|beta)[^'\"]*" "$bundle_path" 2>/dev/null > "$output_dir/network/dev_endpoints.txt"
    fi
}

generate_frida_hooks() {
    local output_dir="$1"
    
    log_info "Generating Frida hook recommendations..."
    
    mkdir -p "$output_dir/frida"
    
    cat > "$output_dir/frida/asyncstorage_hook.js" << 'EOF'
/*
 * Frida hook for React Native AsyncStorage
 * monitors all AsyncStorage operations
 */
Java.perform(function() {
    var AsyncStorageClass = null;
    
    try {
        AsyncStorageClass = Java.use('com.facebook.react.storage.ReactAsyncStorage');
    } catch (e) {
        try {
            AsyncStorageClass = Java.use('com.reactnativecommunity.asyncstorage.AsyncStorage');
        } catch (e2) {
            console.log('[-] AsyncStorage class not found');
            return;
        }
    }
    
    console.log('[+] AsyncStorage hook loaded');
    
    AsyncStorageClass.setItem.implementation = function(key, value, callback) {
        console.log('[AsyncStorage] SET key:', key);
        console.log('[AsyncStorage] SET value:', value);
        this.setItem(key, value, callback);
    };
    
    AsyncStorageClass.getItem.implementation = function(key, callback) {
        console.log('[AsyncStorage] GET key:', key);
        return this.getItem(key, callback);
    };
    
    AsyncStorageClass.removeItem.implementation = function(key, callback) {
        console.log('[AsyncStorage] REMOVE key:', key);
        this.removeItem(key, callback);
    };
    
    AsyncStorageClass.multiGet.implementation = function(keys, callback) {
        console.log('[AsyncStorage] MULTI_GET keys:', JSON.stringify(keys));
        return this.multiGet(keys, callback);
    };
    
    AsyncStorageClass.multiSet.implementation = function(keyValuePairs, callback) {
        console.log('[AsyncStorage] MULTI_SET:', JSON.stringify(keyValuePairs));
        return this.multiSet(keyValuePairs, callback);
    };
});
EOF

    cat > "$output_dir/frida/hermes_hook.js" << 'EOF'
/*
 * Frida hook for Hermes JavaScript Engine
 * intercepts script evaluation
 */
Java.perform(function() {
    var HermesEngine = null;
    
    try {
        HermesEngine = Java.use('com.facebook.hermes.unicode.HermesEngine');
    } catch (e) {
        console.log('[-] HermesEngine not found, trying fallback');
        try {
            HermesEngine = Java.use('com.facebook.hermes.engine.HermesEngine');
        } catch (e2) {
            console.log('[-] Hermes engine hooks not available');
            return;
        }
    }
    
    console.log('[+] Hermes engine hook loaded');
    
    HermesEngine.evaluateJavaScript.implementation = function(script, sourceUrl) {
        console.log('[Hermes] Evaluating script from:', sourceUrl);
        console.log('[Hermes] Script preview:', script.substring(0, 200));
        return this.evaluateJavaScript(script, sourceUrl);
    };
});
EOF

    cat > "$output_dir/frida/fetch_hook.js" << 'EOF'
/*
 * Frida hook for React Native fetch API
 * monitors network requests
 */
Java.perform(function() {
    var OkHttpClientClass = null;
    
    try {
        OkHttpClientClass = Java.use('okhttp3.OkHttpClient');
    } catch (e) {
        console.log('[-] OkHttpClient not found');
        return;
    }
    
    console.log('[+] OkHttpClient hook loaded');
    
    var RequestBuilder = Java.use('okhttp3.Request$Builder'];
    
    RequestBuilder.url.overload('java.lang.String').implementation = function(url) {
        console.log('[Network] Request URL:', url);
        return this.url(url);
    };
    
    RequestBuilder.addHeader.implementation = function(name, value) {
        if (name.toLowerCase() === 'authorization') {
            console.log('[Network] Auth header detected:', name);
        }
        return this.addHeader(name, value);
    };
});
EOF

    cat > "$output_dir/frida/keychain_hook.js" << 'EOF'
/*
 * Frida hook for react-native-keychain
 * monitors secure storage operations
 */
Java.perform(function() {
    var KeychainHelper = null;
    
    try {
        KeychainHelper = Java.use('com.oblador.keychain.KeychainHelper');
    } catch (e) {
        try {
            KeychainHelper = Java.use('io.xrealm.keychain.KeychainModule');
        } catch (e2) {
            console.log('[-] Keychain module not found');
            return;
        }
    }
    
    console.log('[+] Keychain hook loaded');
    
    KeychainHelper.set.implementation = function(service, username, password) {
        console.log('[Keychain] SET service:', service, 'user:', username);
        return this.set(service, username, password);
    };
    
    KeychainHelper.get.implementation = function(service, username) {
        console.log('[Keychain] GET service:', service, 'user:', username);
        return this.get(service, username);
    };
});
EOF

    log_success "Frida hooks generated in $output_dir/frida/"
}

analyze_native_bridging() {
    local decoded_dir="$1"
    local output_dir="$2"
    
    log_info "Analyzing native bridging mechanisms..."
    
    mkdir -p "$output_dir/native"
    
    if [ -f "$decoded_dir/lib/libjsi.so" ]; then
        strings "$decoded_dir/lib/libjsi.so" 2>/dev/null | grep -iE "(jsi|javascript)" | head -20 >> "$output_dir/native/jsi_strings.txt"
    fi
    
    find "$decoded_dir" -name "*.so" -exec sh -c 'strings "$1" 2>/dev/null | grep -l "React\|JSI\|bridge" || true' _ {} \; > "$output_dir/native/react_so_files.txt" 2>/dev/null || true
    
    if [ -d "$decoded_dir/smali" ]; then
        grep -rn "NativeModules\|NativeModule" "$decoded_dir/smali" 2>/dev/null | head -20 > "$output_dir/native/native_modules.txt" || true
    fi
}

generate_report() {
    local apk_path="$1"
    local output_dir="$2"
    local framework="$3"
    
    log_info "Generating analysis report..."
    
    local report="$output_dir/REPORT.md"
    
    cat > "$report" << EOF
# React Native Security Analysis Report

## Application Information
- **APK**: $(basename "$apk_path")
- **Framework**: React Native
- **Analysis Date**: $(date)
- **Output Directory**: $output_dir

## Framework Detection

### Indicators
$(identify_react_native "$apk_path" "$output_dir" 2>/dev/null || echo "See extracted artifacts")

### JavaScript Engine
$(if grep -q "hermes" "$output_dir"/analysis/hermes.txt 2>/dev/null; then echo "- **Engine**: Hermes"; else echo "- **Engine**: V8 or other"; fi)

## Findings Summary

### Secrets Found
- **Potential secrets**: $(wc -l < "$output_dir/secrets/potential_secrets.txt" 2>/dev/null || echo "0")
- **URLs exposed**: $(wc -l < "$output_dir/analysis/urls.txt" 2>/dev/null || echo "0")
- **Dev endpoints**: $(wc -l < "$output_dir/analysis/dev_endpoints.txt" 2>/dev/null || echo "0")

### Storage Analysis
$(cat "$output_dir/storage/storage_usage.txt" 2>/dev/null || echo "No storage analysis available")

### Network Security
$(cat "$output_dir/network/ssl_analysis.txt" 2>/dev/null || echo "No SSL analysis available")

## OWASP Mobile Top 10 Mapping

| Category | Finding | Severity |
|----------|---------|----------|
| M1: Improper Platform Usage | $(grep -c "AsyncStorage" "$output_dir/storage/storage_usage.txt" 2>/dev/null || echo "0") AsyncStorage usages | Review |
| M2: Insecure Data Storage | $(if [ -f "$output_dir/storage/vulnerabilities.txt" ]; then grep AsyncStorage "$output_dir/storage/vulnerabilities.txt" && echo "HIGH"; else echo "None detected"; fi) | - |
| M3: Insecure Communication | $(if grep -q "pinning=none" "$output_dir/network/ssl_analysis.txt" 2>/dev/null; then echo "No cert pinning"; else echo "Pinning detected"; fi) | MEDIUM |
| M7: Client Code Quality | JS bundle readable | HIGH |
| M9: Reverse Engineering | Hermes bytecode easily reversed | HIGH |

## Frida Hooks Available

### Generated Scripts
1. **asyncstorage_hook.js** - Monitor AsyncStorage operations
2. **hermes_hook.js** - Intercept Hermes script evaluation
3. **fetch_hook.js** - Monitor network requests via OkHttp
4. **keychain_hook.js** - Monitor secure storage operations

### Usage
\`\`\`bash
frida -U -f com.package.name -l $output_dir/frida/asyncstorage_hook.js
\`\`\`

## Recommendations

1. **Use react-native-keychain** for sensitive data instead of AsyncStorage
2. **Implement certificate pinning** using react-native-ssl-pinning or similar
3. **Obfuscate JS bundle** using ProGuard or Hermes bytecode compression
4. **Remove debug code** from production builds
5. **Rotate exposed API keys** if found in bundle
6. **Use secure random** for crypto operations

## Extracted Artifacts

| Artifact | Location | Size |
|----------|----------|------|
| JS Bundle | $output_dir/assets/index.android.bundle | $(stat -f%z "$output_dir/assets/index.android.bundle" 2>/dev/null || stat -c%s "$output_dir/assets/index.android.bundle" 2>/dev/null || echo "N/A") bytes |
| Strings | $output_dir/analysis/strings_head.txt | $(wc -l < "$output_dir/analysis/strings_head.txt" 2>/dev/null || echo "0") lines |
| Secrets | $output_dir/secrets/potential_secrets.txt | $(wc -l < "$output_dir/secrets/potential_secrets.txt" 2>/dev/null || echo "0") entries |
| URLs | $output_dir/analysis/urls.txt | $(wc -l < "$output_dir/analysis/urls.txt" 2>/dev/null || echo "0") URLs |

---
Report generated by DragonJAR Cross-Platform Mobile Security Tool
EOF

    log_success "Report generated: $report"
    echo "$report"
}

main() {
    if [ $# -lt 2 ]; then
        usage
    fi
    
    local apk_path="$1"
    local output_dir="$2"
    shift 2
    
    local frida_mode=false
    local analysis_mode="full"
    
    while [ $# -gt 0 ]; do
        case "$1" in
            --frida) frida_mode=true; shift ;;
            --full) analysis_mode="full"; shift ;;
            --quick) analysis_mode="quick"; shift ;;
            --bundle-only) analysis_mode="bundle-only"; shift ;;
            *) shift ;;
        esac
    done
    
    if [ ! -f "$apk_path" ]; then
        log_error "APK not found: $apk_path"
        exit 1
    fi
    
    check_dependencies
    
    log_info "Starting React Native analysis..."
    log_info "APK: $apk_path"
    log_info "Output: $output_dir"
    
    mkdir -p "$output_dir"
    
    local detected_framework=""
    if identify_react_native "$apk_path" "$output_dir" 2>&1 | grep -q "index.android.bundle"; then
        detected_framework="react-native"
    else
        log_error "This does not appear to be a React Native application"
        exit 1
    fi
    
    log_info "Decoding APK..."
    if ! apktool d "$apk_path" -o "$output_dir/decoded" -f 2>/dev/null; then
        log_warning "apktool failed, using unzip for basic extraction"
        mkdir -p "$output_dir/decoded"
        unzip -o "$apk_path" -d "$output_dir/decoded" 2>/dev/null || true
    fi
    
    local bundle_path="assets/index.android.bundle"
    if [ -f "$output_dir/decoded/$bundle_path" ]; then
        extract_js_bundle "$apk_path" "$output_dir/decoded" "$bundle_path"
        
        case "$analysis_mode" in
            full)
                analyze_hermes_bytecode "$output_dir/decoded/$bundle_path" "$output_dir"
                analyze_js_bundle "$output_dir/decoded/$bundle_path" "$output_dir"
                analyze_storage_usage "$output_dir/decoded" "$output_dir"
                analyze_network_security "$output_dir/decoded/$bundle_path" "$output_dir"
                analyze_native_bridging "$output_dir/decoded" "$output_dir"
                ;;
            quick)
                strings "$output_dir/decoded/$bundle_path" | head -50 > "$output_dir/analysis/strings_head.txt"
                ;;
            bundle-only)
                log_info "Bundle extraction complete"
                ;;
        esac
    else
        log_warning "JS bundle not found at expected location"
        bundle_path=$(find "$output_dir/decoded" -name "*.bundle" -o -name "index.android.bundle" 2>/dev/null | head -1)
        if [ -n "$bundle_path" ]; then
            log_info "Found bundle at: $bundle_path"
            analyze_js_bundle "$bundle_path" "$output_dir"
        fi
    fi
    
    if [ "$frida_mode" = "true" ]; then
        generate_frida_hooks "$output_dir"
    fi
    
    generate_report "$apk_path" "$output_dir" "$detected_framework"
    
    log_success "Analysis complete!"
    log_info "Results saved to: $output_dir"
}

main "$@"
