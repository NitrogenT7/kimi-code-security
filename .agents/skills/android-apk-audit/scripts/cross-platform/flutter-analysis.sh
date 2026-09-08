#!/bin/bash
#
# Flutter Security Analysis Script
# Extracts and analyzes Flutter applications
#
# Usage: ./flutter-analysis.sh <apk_path> <output_dir> [options]
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"

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
Flutter Security Analysis Script
================================

Usage: $0 <apk_path> <output_dir> [options]

Arguments:
    apk_path         Path to the Flutter APK
    output_dir       Directory for extracted output

Options:
    --channels-only    Analyze only method channels
    --assets-only      Analyze only Flutter assets
    --full             Full analysis (default)
    --frida            Generate Frida hooks

Examples:
    $0 app-release.apk /tmp/flutter_analysis
    $0 app.apk /tmp/output --channels-only --frida

EOF
    exit 1
}

check_dependencies() {
    local deps=("apktool" "unzip" "strings" "file")
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

identify_flutter() {
    local apk_path="$1"
    local decoded_dir="$2"
    
    log_info "Identifying Flutter application..."
    
    local indicators=0
    local findings=""
    
    if unzip -l "$apk_path" 2>/dev/null | grep -q "lib/libapp.so\|libapp.so"; then
        log_success "Found: libapp.so (Dart AOT compiled code)"
        indicators=$((indicators + 1))
        findings="$findings\n  - Dart AOT: libapp.so"
    fi
    
    if unzip -l "$apk_path" 2>/dev/null | grep -q "lib/libflutter.so\|libflutter.so"; then
        log_success "Found: libflutter.so (Flutter engine)"
        indicators=$((indicators + 1))
        findings="$findings\n  - Engine: libflutter.so"
    fi
    
    if unzip -l "$apk_path" 2>/dev/null | grep -q "flutter_assets\|assets/flutter"; then
        log_success "Found: flutter_assets directory"
        indicators=$((indicators + 1))
        findings="$findings\n  - Assets: flutter_assets present"
    fi
    
    if unzip -l "$apk_path" 2>/dev/null | grep -q "assets/.*\\.dart\|data/flutter_assets"; then
        log_info "Found: Dart-related assets"
        findings="$findings\n  - Dart assets present"
    fi
    
    if unzip -l "$apk_path" 2>/dev/null | grep -q "lib/libdart.so\|libdart.so"; then
        log_success "Found: libdart.so (Dart runtime)"
        indicators=$((indicators + 1))
        findings="$findings\n  - Runtime: libdart.so"
    fi
    
    if unzip -p "$apk_path" "AndroidManifest.xml" 2>/dev/null | strings | grep -q "io.flutter.app\|com.flutter\|dev.flutter"; then
        log_success "Found: Flutter package indicators"
        indicators=$((indicators + 1))
        findings="$findings\n  - Package: Flutter framework"
    fi
    
    if [ -f "$decoded_dir/lib/libapp.so" ]; then
        local libapp_size=$(stat -f%z "$decoded_dir/lib/libapp.so" 2>/dev/null || stat -c%s "$decoded_dir/lib/libapp.so" 2>/dev/null)
        log_info "libapp.so size: $libapp_size bytes (larger = more Dart code)"
        if [ "$libapp_size" -gt 1000000 ]; then
            indicators=$((indicators + 1))
            findings="$findings\n  - Code size: Large (${libapp_size} bytes)"
        fi
    fi
    
    echo -e "$findings"
    
    if [ "$indicators" -ge 3 ]; then
        return 0
    else
        log_warning "Low confidence Flutter indicators ($indicators/6)"
        return 1
    fi
}

extract_flutter_assets() {
    local apk_path="$1"
    local output_dir="$2"
    
    log_info "Extracting Flutter assets..."
    
    mkdir -p "$output_dir/flutter_assets"
    
    unzip -o "$apk_path" "flutter_assets/*" -d "$output_dir/flutter_assets" 2>/dev/null || \
    unzip -o "$apk_path" "assets/flutter_assets/*" -d "$output_dir/flutter_assets" 2>/dev/null || \
    unzip -o "$apk_path" "data/flutter_assets/*" -d "$output_dir/flutter_assets" 2>/dev/null || \
        log_warning "No Flutter assets found in standard locations"
    
    local asset_count=$(find "$output_dir/flutter_assets" -type f 2>/dev/null | wc -l)
    if [ "$asset_count" -gt 0 ]; then
        log_success "Extracted $asset_count Flutter assets"
    fi
}

analyze_dart_binary() {
    local libapp_path="$1"
    local output_dir="$2"
    
    log_info "Analyzing Dart AOT binary (libapp.so)..."
    
    mkdir -p "$output_dir/dart_analysis"
    
    if [ ! -f "$libapp_path" ]; then
        log_error "libapp.so not found at $libapp_path"
        return 1
    fi
    
    log_info "Extracting strings from libapp.so..."
    strings "$libapp_path" > "$output_dir/dart_analysis/libapp_strings.txt" 2>/dev/null
    local string_count=$(wc -l < "$output_dir/dart_analysis/libapp_strings.txt")
    log_success "Extracted $string_count strings"
    
    log_info "Searching for sensitive patterns..."
    grep -iE "(api[_-]?key|secret|password|token|auth|bearer|credential)" "$output_dir/dart_analysis/libapp_strings.txt" 2>/dev/null | sort -u > "$output_dir/dart_analysis/secrets.txt" || true
    local secret_count=$(wc -l < "$output_dir/dart_analysis/secrets.txt" 2>/dev/null || echo "0")
    if [ "$secret_count" -gt 0 ]; then
        log_warning "Found $secret_count potential secrets in Dart binary"
    fi
    
    grep -oE "https?://[a-zA-Z0-9._/~:&=?%-]+" "$output_dir/dart_analysis/libapp_strings.txt" 2>/dev/null | sort -u > "$output_dir/dart_analysis/urls.txt" || true
    local url_count=$(wc -l < "$output_dir/dart_analysis/urls.txt" 2>/dev/null || echo "0")
    log_info "Found $url_count URLs in Dart binary"
    
    grep -iE "(method.*channel|platform.*channel|channel.*invoke|EventChannel|MethodChannel)" "$output_dir/dart_analysis/libapp_strings.txt" 2>/dev/null > "$output_dir/dart_analysis/channels.txt" || true
    local channel_count=$(wc -l < "$output_dir/dart_analysis/channels.txt" 2>/dev/null || echo "0")
    log_info "Found $channel_count method channel references"
    
    grep -iE "(http\.request|fetch|dio|okhttp|ssl|pinning)" "$output_dir/dart_analysis/libapp_strings.txt" 2>/dev/null > "$output_dir/dart_analysis/network.txt" || true
    
    grep -iE "(shared_preferences|sharedpreferences|getString|setString|getInt|setInt)" "$output_dir/dart_analysis/libapp_strings.txt" 2>/dev/null > "$output_dir/dart_analysis/storage.txt" || true
    
    grep -iE "(flutter_secure_storage|keychain|keystore|encrypt|aes|rsa)" "$output_dir/dart_analysis/libapp_strings.txt" 2>/dev/null > "$output_dir/dart_analysis/crypto.txt" || true
    
    log_success "Dart binary analysis complete"
}

analyze_method_channels() {
    local decoded_dir="$1"
    local output_dir="$2"
    
    log_info "Analyzing Flutter Method Channels..."
    
    mkdir -p "$output_dir/channels"
    
    find "$decoded_dir" -name "libapp.so" -exec strings {} \; 2>/dev/null | grep -E "^[a-zA-Z][a-zA-Z0-9_]*(\.[a-zA-Z][a-zA-Z0-9_]*)+$" | sort -u > "$output_dir/channels/dart_classes.txt" || true
    
    if [ -f "$output_dir/dart_analysis/channels.txt" ]; then
        cp "$output_dir/dart_analysis/channels.txt" "$output_dir/channels/channel_references.txt"
    fi
    
    local channel_strings=$(strings "$decoded_dir/lib/libapp.so" 2>/dev/null | grep -iE "(channel|invoke|method)" | head -50)
    if [ -n "$channel_strings" ]; then
        echo "$channel_strings" > "$output_dir/channels/strings_reference.txt"
    fi
    
    log_info "Method channels detected:"
    if [ -f "$output_dir/channels/channel_references.txt" ]; then
        cat "$output_dir/channels/channel_references.txt" | head -20
    else
        log_warning "No explicit channel names found. Flutter may use obfuscation."
    fi
    
    cat > "$output_dir/channels/ASSESSMENT.md" << 'EOF'
# Method Channel Security Assessment

## Overview
Flutter Method Channels allow communication between Dart and native platform code.
Insecure channel implementations can expose sensitive functionality.

## Security Concerns

### Channel Naming
- Channels named with app package prefix: `com.appname/...` - ACCEPTABLE
- Channels named generically: `channel`, `data`, `api` - CONCERNING
- Public/Well-known channels without auth: `inapppurchase`, `deeplink` - REVIEW

### Common Insecure Patterns
1. **No authentication on channels**: Sensitive operations exposed
2. **Input not validated**: SQL injection, command injection possible
3. **Data returned without encryption**: Sensitive data in plaintext
4. **Logging enabled**: Debug output may expose channel data

### Recommendations
1. Implement channel authentication using platform credentials
2. Validate all inputs from channels
3. Use encrypted data transfer for sensitive channels
4. Disable debug logging in release builds
EOF

    log_success "Method channel analysis complete"
}

analyze_flutter_storage() {
    local decoded_dir="$1"
    local output_dir="$2"
    
    log_info "Analyzing Flutter storage mechanisms..."
    
    mkdir -p "$output_dir/storage"
    
    if [ -f "$output_dir/dart_analysis/storage.txt" ]; then
        cat "$output_dir/dart_analysis/storage.txt" | sort -u > "$output_dir/storage/sharedpreferences_usage.txt"
    fi
    
    if [ -f "$output_dir/dart_analysis/crypto.txt" ]; then
        cat "$output_dir/dart_analysis/crypto.txt" | sort -u > "$output_dir/storage/crypto_usage.txt"
    fi
    
    grep -rn "SharedPreferences\|flutter_secure_storage\|getApplicationDocumentsDirectory" "$decoded_dir" 2>/dev/null | head -20 > "$output_dir/storage/flutter_storage_code.txt" || true
    
    log_info "Storage mechanisms detected:"
    if [ -s "$output_dir/storage/sharedpreferences_usage.txt" ]; then
        log_warning "SharedPreferences usage detected (may store sensitive data)"
        echo "SharedPreferences: POTENTIALLY_INSECURE" >> "$output_dir/storage/vulnerabilities.txt"
    fi
    
    if grep -q "flutter_secure_storage" "$output_dir/storage/flutter_storage_code.txt" 2>/dev/null; then
        log_success "flutter_secure_storage usage detected"
        echo "flutter_secure_storage: DETECTED" >> "$output_dir/storage/vulnerabilities.txt"
    else
        log_warning "No flutter_secure_storage detected - sensitive data may be at risk"
    fi
    
    log_success "Storage analysis complete"
}

analyze_flutter_network() {
    local output_dir="$1"
    
    log_info "Analyzing network security..."
    
    mkdir -p "$output_dir/network"
    
    if [ -f "$output_dir/dart_analysis/network.txt" ]; then
        cat "$output_dir/dart_analysis/network.txt" | sort -u > "$output_dir/network/http_usage.txt"
    fi
    
    if [ -f "$output_dir/dart_analysis/urls.txt" ]; then
        cp "$output_dir/dart_analysis/urls.txt" "$output_dir/network/endpoints.txt"
    fi
    
    log_info "Network libraries detected:"
    cat "$output_dir/network/http_usage.txt" 2>/dev/null || echo "None explicitly detected"
    
    log_info "HTTP endpoints found:"
    cat "$output_dir/network/endpoints.txt" 2>/dev/null | head -20 || echo "None found"
    
    if grep -q "http://" "$output_dir/network/endpoints.txt" 2>/dev/null; then
        log_warning "Cleartext HTTP URLs detected"
        echo "Cleartext HTTP: DETECTED" >> "$output_dir/network/vulnerabilities.txt"
        echo "severity: HIGH" >> "$output_dir/network/vulnerabilities.txt"
    fi
    
    if ! grep -qE "(pinning|ssl|certificate)" "$output_dir/dart_analysis/libapp_strings.txt" 2>/dev/null; then
        log_warning "No certificate pinning implementation detected"
        echo "Certificate pinning: NOT_DETECTED" >> "$output_dir/network/vulnerabilities.txt"
    fi
    
    log_success "Network analysis complete"
}

analyze_flutter_assets() {
    local output_dir="$1"
    
    log_info "Analyzing Flutter assets..."
    
    mkdir -p "$output_dir/assets_analysis"
    
    local asset_dir="$output_dir/flutter_assets"
    
    if [ ! -d "$asset_dir" ] || [ -z "$(ls -A "$asset_dir" 2>/dev/null)" ]; then
        log_warning "No Flutter assets found to analyze"
        return
    fi
    
    log_info "Asset files found:"
    find "$asset_dir" -type f 2>/dev/null | head -30
    
    local total_size=$(du -sh "$asset_dir" 2>/dev/null | cut -f1 || echo "unknown")
    log_info "Total assets size: $total_size"
    
    for file in $(find "$asset_dir" -type f -name "*.json" 2>/dev/null | head -10); do
        log_info "JSON file: $file"
        strings "$file" 2>/dev/null | grep -iE "(api|key|token|secret|config)" >> "$output_dir/assets_analysis/sensitive_assets.txt" || true
    done
    
    for file in $(find "$asset_dir" -type f \( -name "*.png" -o -name "*.jpg" -o -name "*.webp" \) 2>/dev/null | head -10); do
        log_info "Image file: $file ($(stat -f%z "$file" 2>/dev/null || stat -c%s "$file" 2>/dev/null || echo 'N/A') bytes)"
    done
    
    if grep -rqi "font\|ttf\|otf" "$asset_dir" 2>/dev/null; then
        log_info "Custom fonts detected in assets"
    fi
    
    log_success "Flutter assets analysis complete"
}

generate_frida_hooks() {
    local output_dir="$1"
    
    log_info "Generating Frida hooks for Flutter..."
    
    mkdir -p "$output_dir/frida"
    
    cat > "$output_dir/frida/flutter_method_channel_hook.js" << 'EOF'
/*
 * Frida hook for Flutter Method Channels
 * Intercepts all method channel invocations
 */
Java.perform(function() {
    var FlutterEngine = null;
    var MethodChannel = null;
    
    try {
        FlutterEngine = Java.use('io.flutter.embedding.engine.FlutterEngine');
    } catch (e) {
        console.log('[-] FlutterEngine not found');
        return;
    }
    
    console.log('[+] Flutter Method Channel hook loaded');
    
    var channels = [];
    
    Java.perform(function() {
        try {
            var channelClass = Java.use('io.flutter.plugin.common.MethodChannel']);
            var allMethods = channelClass.class.getDeclaredMethods();
            console.log('[+] Found', allMethods.length, 'MethodChannel methods');
            
            channelClass.setMethodCallHandler.implementation = function(handler) {
                console.log('[Flutter Channel] Handler set');
                return this.setMethodCallHandler(handler);
            };
        } catch (e) {
            console.log('[-] MethodChannel hook failed:', e.message);
        }
    });
    
    try {
        var BinaryMessenger = Java.use('io.flutter.plugin.common.BinaryMessenger']);
        console.log('[+] BinaryMessenger available');
    } catch (e) {
        console.log('[-] BinaryMessenger not found');
    }
});
EOF

    cat > "$output_dir/frida/flutter_secure_storage_hook.js" << 'EOF'
/*
 * Frida hook for flutter_secure_storage
 * monitors secure storage operations
 */
Java.perform(function() {
    var SecureStorage = null;
    
    try {
        SecureStorage = Java.use('io.flutter.securesecret.SecureSecretStorage');
    } catch (e) {
        try {
            SecureStorage = Java.use('com.it_nomad.flutter_secure_storage.FlutterSecureStorage');
        } catch (e2) {
            console.log('[-] SecureStorage class not found');
            return;
        }
    }
    
    console.log('[+] flutter_secure_storage hook loaded');
    
    SecureStorage.write.implementation = function(key, value) {
        console.log('[SecureStorage] WRITE:', key);
        console.log('[SecureStorage] Value length:', value ? value.length : 0);
        return this.write(key, value);
    };
    
    SecureStorage.read.implementation = function(key) {
        console.log('[SecureStorage] READ:', key);
        var result = this.read(key);
        if (result) {
            console.log('[SecureStorage] Read value length:', result.length);
        }
        return result;
    };
    
    SecureStorage.delete.implementation = function(key) {
        console.log('[SecureStorage] DELETE:', key);
        return this.delete(key);
    };
});
EOF

    cat > "$output_dir/frida/flutter_shared_prefs_hook.js" << 'EOF'
/*
 * Frida hook for Flutter SharedPreferences
 * monitors insecure storage
 */
Java.perform(function() {
    var SharedPrefs = null;
    
    try {
        SharedPrefs = Java.use('android.content.SharedPreferences');
        var editorClass = Java.use('android.content.SharedPreferences$Editor');
    } catch (e) {
        console.log('[-] SharedPreferences not found');
        return;
    }
    
    console.log('[+] SharedPreferences hook loaded');
    
    editorClass.putString.implementation = function(key, value) {
        console.log('[SharedPrefs] PUT_STRING:', key);
        if (value && (key.toLowerCase().includes('token') || 
                      key.toLowerCase().includes('password') ||
                      key.toLowerCase().includes('key') ||
                      key.toLowerCase().includes('secret'))) {
            console.log('[WARNING] Sensitive data in SharedPreferences:', key);
        }
        return this.putString(key, value);
    };
    
    editorClass.putInt.implementation = function(key, value) {
        console.log('[SharedPrefs] PUT_INT:', key, '=', value);
        return this.putInt(key, value);
    };
    
    editorClass.putBoolean.implementation = function(key, value) {
        console.log('[SharedPrefs] PUT_BOOLEAN:', key, '=', value);
        return this.putBoolean(key, value);
    };
    
    SharedPrefs.getString.implementation = function(key, defValue) {
        var result = this.getString(key, defValue);
        if (result && (key.toLowerCase().includes('token') || 
                       key.toLowerCase().includes('password'))) {
            console.log('[WARNING] Reading sensitive from SharedPrefs:', key);
        }
        return result;
    };
});
EOF

    cat > "$output_dir/frida/flutter_network_hook.js" << 'EOF'
/*
 * Frida hook for Flutter network operations
 * intercepts HTTP requests
 */
Java.perform(function() {
    var OkHttpClient = null;
    
    try {
        OkHttpClient = Java.use('okhttp3.OkHttpClient']);
    } catch (e) {
        console.log('[-] OkHttpClient not found');
        return;
    }
    
    console.log('[+] OkHttpClient hook loaded for Flutter');
    
    var RequestBuilder = Java.use('okhttp3.Request$Builder']);
    
    RequestBuilder.url.overload('java.lang.String').implementation = function(url) {
        console.log('[Flutter HTTP] URL:', url);
        return this.url(url);
    };
    
    RequestBuilder.addHeader.implementation = function(name, value) {
        if (name.toLowerCase() === 'authorization' || 
            name.toLowerCase() === 'bearer') {
            console.log('[Flutter HTTP] Auth header detected for:', url);
        }
        return this.addHeader(name, value);
    };
    
    try {
        var realCall = OkHttpClient.newCall.implementation;
        OkHttpClient.newCall.implementation = function(request) {
            console.log('[Flutter HTTP] New request to:', request.url().toString());
            return realCall.call(this, request);
        };
    } catch (e) {
        console.log('[-] Could not hook newCall');
    }
});
EOF

    cat > "$output_dir/frida/flutter_crypto_hook.js" << 'EOF'
/*
 * Frida hook for Flutter cryptography operations
 * monitors crypto usage
 */
Java.perform(function() {
    var Cipher = null;
    var KeyGenerator = null;
    
    try {
        Cipher = Java.use('javax.crypto.Cipher');
    } catch (e) {
        console.log('[-] Cipher not found');
    }
    
    try {
        KeyGenerator = Java.use('javax.crypto.KeyGenerator');
    } catch (e) {
        console.log('[-] KeyGenerator not found');
    }
    
    console.log('[+] Flutter crypto hook loaded');
    
    if (Cipher) {
        Cipher.getInstance.implementation = function(algorithm) {
            console.log('[Crypto] Cipher requested:', algorithm);
            return this.getInstance(algorithm);
        };
        
        Cipher.doFinal.implementation = function(data) {
            console.log('[Crypto] doFinal, input length:', data ? data.length : 0);
            return this.doFinal(data);
        };
    }
    
    if (KeyGenerator) {
        KeyGenerator.generateKey.implementation = function() {
            console.log('[Crypto] Key generation requested');
            return this.generateKey();
        };
    }
});
EOF

    log_success "Frida hooks generated in $output_dir/frida/"
}

generate_report() {
    local apk_path="$1"
    local output_dir="$2"
    
    log_info "Generating Flutter analysis report..."
    
    local report="$output_dir/REPORT.md"
    
    cat > "$report" << EOF
# Flutter Security Analysis Report

## Application Information
- **APK**: $(basename "$apk_path")
- **Framework**: Flutter
- **Analysis Date**: $(date)
- **Output Directory**: $output_dir

## Framework Detection

### Indicators
$(identify_flutter "$apk_path" "$output_dir" 2>/dev/null || echo "See extracted artifacts")

### Dart AOT Binary
- **libapp.so size**: $(stat -f%z "$output_dir/decoded/lib/libapp.so" 2>/dev/null || stat -c%s "$output_dir/decoded/lib/libapp.so" 2>/dev/null || echo "N/A") bytes
- **Total strings**: $(wc -l < "$output_dir/dart_analysis/libapp_strings.txt" 2>/dev/null || echo "N/A")
- **Potential secrets**: $(wc -l < "$output_dir/dart_analysis/secrets.txt" 2>/dev/null || echo "0")
- **URLs found**: $(wc -l < "$output_dir/dart_analysis/urls.txt" 2>/dev/null || echo "0")
- **Method channel refs**: $(wc -l < "$output_dir/channels/channel_references.txt" 2>/dev/null || echo "0")

## Findings Summary

### Method Channels
$(if [ -f "$output_dir/channels/channel_references.txt" ]; then
    echo "Detected channels:"
    cat "$output_dir/channels/channel_references.txt" | head -10
else
    echo "No explicit channel names found (may be obfuscated)"
fi)

### Storage Security
$(if [ -f "$output_dir/storage/vulnerabilities.txt" ]; then
    echo "**Vulnerabilities detected:**"
    cat "$output_dir/storage/vulnerabilities.txt"
else
    echo "No obvious storage vulnerabilities detected"
fi)

### Network Security
$(if [ -f "$output_dir/network/vulnerabilities.txt" ]; then
    echo "**Vulnerabilities detected:**"
    cat "$output_dir/network/vulnerabilities.txt"
else
    echo "No obvious network vulnerabilities detected"
fi)

## OWASP Mobile Top 10 Mapping

| Category | Finding | Severity |
|----------|---------|----------|
| M1: Improper Platform Usage | $(cat "$output_dir/channels/channel_references.txt" 2>/dev/null | wc -l || echo "0") method channels | Review |
| M2: Insecure Data Storage | $(if grep -q "SharedPreferences" "$output_dir/storage/vulnerabilities.txt" 2>/dev/null; then echo "SharedPreferences used"; else echo "Secure storage detected"; fi) | MEDIUM/HIGH |
| M3: Insecure Communication | $(if grep -q "pinning" "$output_dir/dart_analysis/libapp_strings.txt" 2>/dev/null; then echo "Pinning implemented"; else echo "No pinning"; fi) | MEDIUM |
| M4: Insecure Authentication | Method channel auth review needed | Review |
| M5: Insufficient Cryptography | Review crypto implementations | Review |
| M7: Client Code Quality | Dart AOT readable | HIGH |
| M9: Reverse Engineering | libapp.so easily reversed | HIGH |

## Frida Hooks Available

### Generated Scripts
1. **flutter_method_channel_hook.js** - Monitor all method channel calls
2. **flutter_secure_storage_hook.js** - Monitor secure storage
3. **flutter_shared_prefs_hook.js** - Monitor SharedPreferences (insecure)
4. **flutter_network_hook.js** - Monitor HTTP requests
5. **flutter_crypto_hook.js** - Monitor crypto operations

### Usage
\`\`\`bash
frida -U -f com.package.name -l $output_dir/frida/flutter_method_channel_hook.js
\`\`\`

## Recommendations

1. **Method Channels**: Implement authentication on sensitive channels
2. **Storage**: Use flutter_secure_storage for sensitive data (not SharedPreferences)
3. **Network**: Implement certificate pinning with package:flutter_secure_http
4. **Crypto**: Don't hardcode keys in Dart code
5. **Obfuscation**: Enable Dart obfuscation in release builds (--obfuscate)
6. **Debug**: Ensure debug widget inspector is disabled in release

## Extracted Artifacts

| Artifact | Location |
|----------|----------|
| libapp.so | $output_dir/decoded/lib/libapp.so |
| Dart strings | $output_dir/dart_analysis/libapp_strings.txt |
| Secrets | $output_dir/dart_analysis/secrets.txt |
| URLs | $output_dir/dart_analysis/urls.txt |
| Method channels | $output_dir/channels/ |
| Flutter assets | $output_dir/flutter_assets/ |

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
    
    local channels_only=false
    local assets_only=false
    local frida_mode=false
    local analysis_mode="full"
    
    while [ $# -gt 0 ]; do
        case "$1" in
            --channels-only) channels_only=true; analysis_mode="channels"; shift ;;
            --assets-only) assets_only=true; analysis_mode="assets"; shift ;;
            --full) analysis_mode="full"; shift ;;
            --frida) frida_mode=true; shift ;;
            *) shift ;;
        esac
    done
    
    if [ ! -f "$apk_path" ]; then
        log_error "APK not found: $apk_path"
        exit 1
    fi
    
    check_dependencies
    
    log_info "Starting Flutter analysis..."
    log_info "APK: $apk_path"
    log_info "Output: $output_dir"
    log_info "Mode: $analysis_mode"
    
    mkdir -p "$output_dir"
    
    log_info "Decoding APK..."
    if ! apktool d "$apk_path" -o "$output_dir/decoded" -f 2>/dev/null; then
        log_warning "apktool failed, using unzip"
        mkdir -p "$output_dir/decoded"
        unzip -o "$apk_path" -d "$output_dir/decoded" 2>/dev/null || true
    fi
    
    if ! identify_flutter "$apk_path" "$output_dir" 2>&1 | grep -q "libapp.so"; then
        log_error "This does not appear to be a Flutter application"
        exit 1
    fi
    
    case "$analysis_mode" in
        full)
            extract_flutter_assets "$apk_path" "$output_dir"
            analyze_dart_binary "$output_dir/decoded/lib/libapp.so" "$output_dir"
            analyze_method_channels "$output_dir/decoded" "$output_dir"
            analyze_flutter_storage "$output_dir/decoded" "$output_dir"
            analyze_flutter_network "$output_dir"
            analyze_flutter_assets "$output_dir"
            ;;
        channels)
            analyze_dart_binary "$output_dir/decoded/lib/libapp.so" "$output_dir"
            analyze_method_channels "$output_dir/decoded" "$output_dir"
            ;;
        assets)
            extract_flutter_assets "$apk_path" "$output_dir"
            analyze_flutter_assets "$output_dir"
            ;;
    esac
    
    if [ "$frida_mode" = "true" ]; then
        generate_frida_hooks "$output_dir"
    fi
    
    generate_report "$apk_path" "$output_dir"
    
    log_success "Flutter analysis complete!"
    log_info "Results saved to: $output_dir"
}

main "$@"
