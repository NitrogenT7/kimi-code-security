#!/bin/bash
#
# Cordova/Ionic Security Analysis Script
# Extracts and analyzes Cordova and Ionic applications
#
# Usage: ./cordova-analysis.sh <apk_path> <output_dir> [options]
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
Cordova/Ionic Security Analysis Script
=====================================

Usage: $0 <apk_path> <output_dir> [options]

Arguments:
    apk_path         Path to the Cordova/Ionic APK
    output_dir       Directory for extracted output

Options:
    --www-only         Extract and analyze www directory only
    --plugins-only     Analyze Cordova plugins only
    --full             Full analysis (default)
    --frida            Generate Frida hooks

Examples:
    $0 app-release.apk /tmp/cordova_analysis
    $0 app.apk /tmp/output --plugins-only --frida

EOF
    exit 1
}

check_dependencies() {
    local deps=("apktool" "unzip" "strings" "grep" "egrep" "file")
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

identify_cordova() {
    local apk_path="$1"
    local decoded_dir="$2"
    
    log_info "Identifying Cordova/Ionic application..."
    
    local indicators=0
    local findings=""
    local framework=""
    
    if unzip -l "$apk_path" 2>/dev/null | grep -qE "assets/www/|assets/public/www/"; then
        log_success "Found: www directory structure"
        indicators=$((indicators + 1))
        findings="$findings\n  - Web assets: www directory present"
        framework="cordova"
    fi
    
    if unzip -l "$apk_path" 2>/dev/null | grep -q "cordova.js\|cordova"; then
        log_success "Found: cordova.js bridge"
        indicators=$((indicators + 1))
        findings="$findings\n  - Bridge: cordova.js"
    fi
    
    if unzip -l "$apk_path" 2>/dev/null | grep -q "config.xml"; then
        log_success "Found: config.xml"
        indicators=$((indicators + 1))
        findings="$findings\n  - Config: config.xml present"
    fi
    
    if unzip -l "$apk_path" 2>/dev/null | grep -q "plugins/"; then
        log_info "Found: Cordova plugins directory"
        findings="$findings\n  - Plugins: plugins directory present"
    fi
    
    if unzip -p "$apk_path" "AndroidManifest.xml" 2>/dev/null | strings | grep -q "com.ionicframework\|io.cordova\|com.cordova"; then
        log_success "Found: Ionic/Cordova package indicators"
        indicators=$((indicators + 1))
        if unzip -p "$apk_path" "AndroidManifest.xml" 2>/dev/null | strings | grep -q "ionic"; then
            framework="ionic"
            findings="$findings\n  - Framework: Ionic"
        else
            findings="$findings\n  - Framework: Cordova"
        fi
    fi
    
    if unzip -l "$apk_path" 2>/dev/null | grep -q "capacitor"; then
        log_success "Found: Capacitor framework"
        indicators=$((indicators + 1))
        framework="ionic-capacitor"
        findings="$findings\n  - Framework: Ionic with Capacitor"
    fi
    
    if unzip -l "$apk_path" 2>/dev/null | grep -q "index.android.bundle"; then
        log_info "Found: index.android.bundle (Ionic React Native bridge)"
        findings="$findings\n  - Bridge: Ionic React Native bundle"
    fi
    
    if [ -d "$decoded_dir/assets" ]; then
        local www_dirs=$(find "$decoded_dir/assets" -type d \( -name "www" -o -name "public" \) 2>/dev/null)
        if [ -n "$www_dirs" ]; then
            log_success "Found www directory at: $www_dirs"
            findings="$findings\n  - www location: $www_dirs"
        fi
    fi
    
    echo -e "$findings"
    echo "FRAMEWORK=$framework"
    
    if [ $indicators -ge 2 ]; then
        return 0
    else
        log_warning "Low confidence Cordova/Ionic indicators ($indicators/5)"
        return 1
    fi
}

extract_www_directory() {
    local apk_path="$1"
    local output_dir="$2"
    
    log_info "Extracting www directory..."
    
    mkdir -p "$output_dir/www"
    
    local extracted=false
    
    unzip -o "$apk_path" "assets/www/*" -d "$output_dir" 2>/dev/null && extracted=true
    
    if [ -d "$output_dir/assets/www" ]; then
        mv "$output_dir/assets/www"/* "$output_dir/www/" 2>/dev/null || true
        rmdir "$output_dir/assets/www" 2>/dev/null || true
    fi
    
    unzip -o "$apk_path" "assets/public/www/*" -d "$output_dir" 2>/dev/null && extracted=true
    
    if [ -d "$output_dir/assets/public/www" ]; then
        mv "$output_dir/assets/public/www"/* "$output_dir/www/" 2>/dev/null || true
    fi
    
    unzip -o "$apk_path" "public/www/*" -d "$output_dir" 2>/dev/null && extracted=true
    
    if [ "$extracted" = false ]; then
        log_error "Failed to extract www directory"
        return 1
    fi
    
    local file_count=$(find "$output_dir/www" -type f 2>/dev/null | wc -l)
    log_success "Extracted $file_count files to www directory"
    
    return 0
}

analyze_config_xml() {
    local decoded_dir="$1"
    local output_dir="$2"
    
    log_info "Analyzing config.xml..."
    
    mkdir -p "$output_dir/config"
    
    local config_locations=(
        "$decoded_dir/assets/www/config.xml"
        "$decoded_dir/config.xml"
        "$decoded_dir/res/xml/config.xml"
        "$decoded_dir/www/config.xml"
    )
    
    local config_found=false
    for config in "${config_locations[@]}"; do
        if [ -f "$config" ]; then
            log_success "Found config.xml at: $config"
            cp "$config" "$output_dir/config/config.xml"
            config_found=true
            break
        fi
    done
    
    if [ "$config_found" = false ]; then
        log_warning "config.xml not found"
        return 1
    fi
    
    log_info "Analyzing Cordova configuration..."
    
    echo "=== ACCESS ORIGINS ===" > "$output_dir/config/analysis.txt"
    grep -E "<access.*origin|allow-intent|allow-navigation" "$output_dir/config/config.xml" 2>/dev/null >> "$output_dir/config/analysis.txt" || echo "No access controls found" >> "$output_dir/config/analysis.txt"
    
    echo "" >> "$output_dir/config/analysis.txt"
    echo "=== PLUGINS ===" >> "$output_dir/config/analysis.txt"
    grep -E "<plugin|feature" "$output_dir/config/config.xml" 2>/dev/null >> "$output_dir/config/analysis.txt" || echo "No plugins declared" >> "$output_dir/config/analysis.txt"
    
    echo "" >> "$output_dir/config/analysis.txt"
    echo "=== CONTENT SECURITY ===" >> "$output_dir/config/analysis.txt"
    grep -E "meta.* Content-Security|content-security-policy" "$output_dir/config/config.xml" 2>/dev/null >> "$output_dir/config/analysis.txt" || echo "No CSP found" >> "$output_dir/config/analysis.txt"
    
    if grep -qE "origin=\"\*\"|allow-navigation.*\*" "$output_dir/config/config.xml" 2>/dev/null; then
        log_warning "Wildcard access origins detected - insecure"
        echo "WARNING: Wildcard access origins detected" >> "$output_dir/config/vulnerabilities.txt"
    fi
    
    if ! grep -q "content-security-policy\|Content-Security-Policy" "$output_dir/config/config.xml" 2>/dev/null; then
        log_warning "No Content Security Policy found"
        echo "WARNING: No CSP defined" >> "$output_dir/config/vulnerabilities.txt"
    fi
    
    cat "$output_dir/config/analysis.txt"
}

analyze_javascript_code() {
    local www_dir="$1"
    local output_dir="$2"
    
    log_info "Analyzing JavaScript code..."
    
    mkdir -p "$output_dir/js_analysis"
    
    local js_files=$(find "$www_dir" -name "*.js" -type f 2>/dev/null)
    local file_count=$(echo "$js_files" | wc -l)
    
    if [ "$file_count" -eq 0 ]; then
        log_warning "No JavaScript files found in www directory"
        return
    fi
    
    log_info "Found $file_count JavaScript files"
    
    for js_file in $js_files; do
        local filename=$(basename "$js_file")
        log_info "Analyzing: $filename"
    done
    
    log_info "Searching for sensitive patterns..."
    
    egrep -rhiE "(api[_-]?key|secret[_-]?key|access[_-]?token|bearer|auth[_-]?token|password|passwd|pwd)" "$www_dir" --include="*.js" 2>/dev/null | sort -u > "$output_dir/js_analysis/secrets.txt" || true
    local secret_count=$(wc -l < "$output_dir/js_analysis/secrets.txt" 2>/dev/null || echo "0")
    if [ "$secret_count" -gt 0 ]; then
        log_warning "Found $secret_count potential secrets in JS code"
    fi
    
    egrep -rhoE "https?://[a-zA-Z0-9._/~:&=?%-]+" "$www_dir" --include="*.js" 2>/dev/null | sort -u > "$output_dir/js_analysis/urls.txt" || true
    local url_count=$(wc -l < "$output_dir/js_analysis/urls.txt" 2>/dev/null || echo "0")
    log_info "Found $url_count URLs in JavaScript"
    
    egrep -rhiE "(localStorage|sessionStorage|setItem|getItem|cookie)" "$www_dir" --include="*.js" 2>/dev/null > "$output_dir/js_analysis/storage.txt" || true
    
    egrep -rhiE "(eval\(|Function\(|setTimeout.*eval|setInterval.*eval)" "$www_dir" --include="*.js" 2>/dev/null > "$output_dir/js_analysis/dangerous_patterns.txt" || true
    if [ -s "$output_dir/js_analysis/dangerous_patterns.txt" ]; then
        log_warning "Dangerous JavaScript patterns found (eval, Function)"
        echo "WARNING: Dynamic code execution detected" >> "$output_dir/js_analysis/vulnerabilities.txt"
    fi
    
    egrep -rhiE "(XMLHttpRequest|fetch|axios|http\.request|https\.request)" "$www_dir" --include="*.js" 2>/dev/null > "$output_dir/js_analysis/network.txt" || true
    
    egrep -rhiE "(cordova\.plugins|channel\.invoke|exec\(|native\.call)" "$www_dir" --include="*.js" 2>/dev/null > "$output_dir/js_analysis/cordova_bridge.txt" || true
    
    log_success "JavaScript analysis complete"
}

analyze_cordova_plugins() {
    local decoded_dir="$1"
    local output_dir="$2"
    
    log_info "Analyzing Cordova plugins..."
    
    mkdir -p "$output_dir/plugins"
    
    local plugin_dirs=$(find "$decoded_dir" -type d -name "plugins" 2>/dev/null)
    
    if [ -z "$plugin_dirs" ]; then
        log_info "No plugins directory found in standard locations"
        return
    fi
    
    for plugin_dir in $plugin_dirs; do
        log_info "Found plugins directory: $plugin_dir"
        
        local plugins=$(find "$plugin_dir" -maxdepth 1 -type d 2>/dev/null | tail -n +2)
        
        for plugin in $plugins; do
            local plugin_name=$(basename "$plugin")
            log_info "Plugin: $plugin_name"
            
            mkdir -p "$output_dir/plugins/$plugin_name"
            
            if [ -f "$plugin/plugin.xml" ]; then
                cp "$plugin/plugin.xml" "$output_dir/plugins/$plugin_name/"
            fi
            
            find "$plugin" -name "*.js" -type f 2>/dev/null | head -5 | while read js_file; do
                strings "$js_file" 2>/dev/null | grep -iE "(api|key|token|secret|password)" >> "$output_dir/plugins/$plugin_name/secrets.txt" || true
            done
        done
    done
    
    log_info "Known vulnerable Cordova plugins to check:"
    local known_vulnerable=(
        "cordova-sqlite-storage:Data exposure"
        "cordova-plugin-geolocation:Location leakage"
        "cordova-plugin-camera:Photo access"
        "cordova-plugin-media-capture:Media capture"
        "cordova-plugin-contacts:Contact access"
    )
    
    cat > "$output_dir/plugins/vulnerable_plugins_checklist.txt" << EOF
# Cordova Plugin Vulnerability Checklist
# Review these common vulnerable plugins:

$(
for pv in "${known_vulnerable[@]}"; do
    echo "- $pv"
done
)

# Recommendations:
1. Update all plugins to latest versions
2. Remove unused plugins
3. Implement least-privilege permissions
4. Use plugin-cordova-plugin-secure-storage for sensitive data
EOF

    log_success "Plugin analysis complete"
}

analyze_storage_mechanisms() {
    local www_dir="$1"
    local decoded_dir="$2"
    local output_dir="$3"
    
    log_info "Analyzing storage mechanisms..."
    
    mkdir -p "$output_dir/storage"
    
    grep -rhiE "(localStorage|sessionStorage|window\.localStorage|window\.sessionStorage|IndexedDB)" "$www_dir" --include="*.js" 2>/dev/null > "$output_dir/storage/storage_usage.txt" || true
    
    grep -rhiE "(SQLite|cordova\.plugins\.sqlite|opendatabase|transaction)" "$www_dir" --include="*.js" 2>/dev/null >> "$output_dir/storage/storage_usage.txt" 2>/dev/null || true
    
    grep -rhiE "(SecureStorage|cordova\.plugins\.securestorage|crypto)" "$www_dir" --include="*.js" 2>/dev/null >> "$output_dir/storage/secure_storage.txt" || true
    
    log_info "Storage mechanisms detected:"
    cat "$output_dir/storage/storage_usage.txt" 2>/dev/null | head -20 || echo "None detected"
    
    if grep -qi "localStorage" "$output_dir/storage/storage_usage.txt" 2>/dev/null; then
        log_warning "localStorage usage detected - verify no sensitive data"
        echo "localStorage: DETECTED" >> "$output_dir/storage/vulnerabilities.txt"
    fi
    
    if grep -qi "sqlite\|opendatabase" "$output_dir/storage/storage_usage.txt" 2>/dev/null; then
        log_info "SQLite usage detected"
        echo "SQLite: DETECTED" >> "$output_dir/storage/vulnerabilities.txt"
        
        find "$decoded_dir" -name "*.db" -o -name "*.sqlite" -o -name "*.db-journal" 2>/dev/null >> "$output_dir/storage/database_files.txt" || true
        
        if [ -f "$output_dir/storage/database_files.txt" ]; then
            log_warning "SQLite database files found on device"
        fi
    fi
    
    if ! grep -qi "SecureStorage\|securestorage" "$output_dir/storage/secure_storage.txt" 2>/dev/null; then
        log_warning "No secure storage mechanism detected"
        echo "No secure storage: VULNERABLE" >> "$output_dir/storage/vulnerabilities.txt"
    fi
}

analyze_network_security() {
    local www_dir="$1"
    local output_dir="$2"
    
    log_info "Analyzing network security..."
    
    mkdir -p "$output_dir/network"
    
    if [ -f "$output_dir/js_analysis/urls.txt" ]; then
        cp "$output_dir/js_analysis/urls.txt" "$output_dir/network/endpoints.txt"
    fi
    
    grep -rhiE "(XMLHttpRequest|fetch|axios|https?://)" "$www_dir" --include="*.js" 2>/dev/null | grep -oE 'https?://[^"'"'"' ]+' | sort -u > "$output_dir/network/all_urls.txt"
    
    if grep -q "http://" "$output_dir/network/all_urls.txt" 2>/dev/null; then
        log_warning "Cleartext HTTP URLs detected"
        grep "http://" "$output_dir/network/all_urls.txt" >> "$output_dir/network/vulnerabilities.txt"
    fi
    
    grep -rhiE "(pinning|ssl|certificate|Certificate|sslPinning|TLS)" "$www_dir" --include="*.js" 2>/dev/null > "$output_dir/network/pinning_detection.txt" || true
    
    if [ ! -s "$output_dir/network/pinning_detection.txt" ]; then
        log_warning "No certificate pinning implementation detected"
        echo "No certificate pinning" >> "$output_dir/network/vulnerabilities.txt"
    fi
    
    log_success "Network analysis complete"
}

analyze_cordova_bridge() {
    local www_dir="$1"
    local output_dir="$2"
    
    log_info "Analyzing Cordova bridge usage..."
    
    mkdir -p "$output_dir/bridge"
    
    grep -rhiE "(cordova\.exec|cordova\.call|cordova\.plugin|native\.call|window\.cordova)" "$www_dir" --include="*.js" 2>/dev/null > "$output_dir/bridge/cordova_calls.txt" || true
    
    if [ -s "$output_dir/bridge/cordova_calls.txt" ]; then
        local call_count=$(wc -l < "$output_dir/bridge/cordova_calls.txt")
        log_info "Found $call_count Cordova bridge calls"
    fi
    
    grep -rhoE '"[a-zA-Z0-9_./]+"' "$www_dir" --include="*.js" 2>/dev/null | grep -Eo '"[a-zA-Z]+(/[a-zA-Z0-9_./]*)?"' | sort -u > "$output_dir/bridge/service_names.txt"
    
    log_success "Bridge analysis complete"
}

generate_frida_hooks() {
    local output_dir="$1"
    
    log_info "Generating Frida hooks for Cordova..."
    
    mkdir -p "$output_dir/frida"
    
    cat > "$output_dir/frida/cordova_exec_hook.js" << 'EOF'
/*
 * Frida hook for Cordova exec bridge
 * intercepts all native calls
 */
Java.perform(function() {
    var CordovaPlugin = null;
    
    try {
        CordovaPlugin = Java.use('org.apache.cordova.CordovaPlugin');
    } catch (e) {
        console.log('[-] CordovaPlugin not found');
        return;
    }
    
    console.log('[+] Cordova bridge hook loaded');
    
    CordovaPlugin.execute.implementation = function(action, args, callbackContext) {
        console.log('[Cordova] Plugin execute:', action);
        console.log('[Cordova] Args:', JSON.stringify(args));
        return this.execute(action, args, callbackContext);
    };
});
EOF

    cat > "$output_dir/frida/cordova_storage_hook.js" << 'EOF'
/*
 * Frida hook for Cordova localStorage
 * monitors all localStorage operations
 */
Java.perform(function() {
    var WebStorage = null;
    
    try {
        WebStorage = Java.use('android.webkit.WebStorage');
    } catch (e) {
        console.log('[-] WebStorage not found');
        return;
    }
    
    console.log('[+] Cordova WebStorage hook loaded');
    
    WebStorage.updateDatabaseQuota.implementation = function(origin, quota) {
        console.log('[WebStorage] Quota update for:', origin, 'quota:', quota);
        return this.updateDatabaseQuota(origin, quota);
    };
});
EOF

    cat > "$output_dir/frida/cordova_camera_hook.js" << 'EOF'
/*
 * Frida hook for Cordova camera plugin
 * monitors camera access
 */
Java.perform(function() {
    var CameraLauncher = null;
    
    try {
        CameraLauncher = Java.use('org.apache.cordova.camera.CameraLauncher');
    } catch (e) {
        console.log('[-] CameraLauncher not found');
        return;
    }
    
    console.log('[+] Cordova camera hook loaded');
    
    CameraLauncher.takePicture.implementation = function() {
        console.log('[Cordova Camera] takePicture called');
        return this.takePicture();
    };
    
    CameraLauncher.processResult.implementation = function(resultType, resultData) {
        console.log('[Cordova Camera] Result received, type:', resultType);
        if (resultData) {
            console.log('[Cordova Camera] Data length:', resultData.length);
        }
        return this.processResult(resultType, resultData);
    };
});
EOF

    cat > "$output_dir/frida/cordova_geolocation_hook.js" << 'EOF'
/*
 * Frida hook for Cordova geolocation plugin
 * monitors location access
 */
Java.perform(function() {
    var Geolocation = null;
    
    try {
        Geolocation = Java.use('org.apache.cordova.geolocation.Geolocation');
    } catch (e) {
        console.log('[-] Geolocation not found');
        return;
    }
    
    console.log('[+] Cordova geolocation hook loaded');
    
    Geolocation.getCurrentPosition.implementation = function(gpsListener) {
        console.log('[Cordova Geolocation] getCurrentPosition called');
        return this.getCurrentPosition(gpsListener);
    };
});
EOF

    cat > "$output_dir/frida/cordova_contacts_hook.js" << 'EOF'
/*
 * Frida hook for Cordova contacts plugin
 * monitors contact access
 */
Java.perform(function() {
    var ContactManager = null;
    
    try {
        ContactManager = Java.use('org.apache.cordova.contacts.ContactManager');
    } catch (e) {
        console.log('[-] ContactManager not found');
        return;
    }
    
    console.log('[+] Cordova contacts hook loaded');
    
    ContactManager.search.implementation = function(fields, options, success, fail) {
        console.log('[Cordova Contacts] Search called with fields:', JSON.stringify(fields));
        return this.search(fields, options, success, fail);
    };
});
EOF

    cat > "$output_dir/frida/cordova_sqlite_hook.js" << 'EOF'
/*
 * Frida hook for Cordova SQLite plugin
 * monitors database operations
 */
Java.perform(function() {
    var SQLitePlugin = null;
    
    try {
        SQLitePlugin = Java.use('io.liteglue.SQLitePlugin');
    } catch (e) {
        try {
            SQLitePlugin = Java.use('com.cordova.plugins.sqlite.SQLitePlugin');
        } catch (e2) {
            console.log('[-] SQLitePlugin not found');
            return;
        }
    }
    
    console.log('[+] Cordova SQLite hook loaded');
    
    SQLitePlugin.open.implementation = function(options) {
        console.log('[Cordova SQLite] Opening database:', options);
        return this.open(options);
    };
    
    SQLitePlugin.executeSql.implementation = function(dbName, query, params, success, error) {
        console.log('[Cordova SQLite] Executing:', query);
        if (params && params.length > 0) {
            console.log('[Cordova SQLite] Params:', JSON.stringify(params));
        }
        return this.executeSql(dbName, query, params, success, error);
    };
});
EOF

    log_success "Frida hooks generated in $output_dir/frida/"
}

generate_report() {
    local apk_path="$1"
    local output_dir="$2"
    local framework="$3"
    
    log_info "Generating Cordova/Ionic analysis report..."
    
    local report="$output_dir/REPORT.md"
    
    cat > "$report" << EOF
# Cordova/Ionic Security Analysis Report

## Application Information
- **APK**: $(basename "$apk_path")
- **Framework**: $framework
- **Analysis Date**: $(date)
- **Output Directory**: $output_dir

## Framework Detection

### Indicators
$(identify_cordova "$apk_path" "$output_dir" 2>/dev/null || echo "See extracted artifacts")

## Findings Summary

### Configuration Analysis
$(cat "$output_dir/config/analysis.txt" 2>/dev/null || echo "No config.xml found")

### Vulnerabilities Detected
$(cat "$output_dir/config/vulnerabilities.txt" 2>/dev/null || echo "None")
$(cat "$output_dir/storage/vulnerabilities.txt" 2>/dev/null || echo "")
$(cat "$output_dir/network/vulnerabilities.txt" 2>/dev/null || echo "")

### Secrets Found
- **Potential secrets**: $(wc -l < "$output_dir/js_analysis/secrets.txt" 2>/dev/null || echo "0")
- **URLs exposed**: $(wc -l < "$output_dir/js_analysis/urls.txt" 2>/dev/null || echo "0")

### Storage Security
$(cat "$output_dir/storage/storage_usage.txt" 2>/dev/null | head -10 || echo "Analysis not available")

### Network Security
- **Endpoints**: $(wc -l < "$output_dir/network/all_urls.txt" 2>/dev/null || echo "0")
- **Cleartext HTTP**: $(grep -c "http://" "$output_dir/network/all_urls.txt" 2>/dev/null || echo "0")

## OWASP Mobile Top 10 Mapping

| Category | Finding | Severity |
|----------|---------|----------|
| M1: Improper Platform Usage | Cordova plugins | Review |
| M2: Insecure Data Storage | localStorage/SQLite | HIGH |
| M3: Insecure Communication | $(if grep -q "http://" "$output_dir/network/all_urls.txt" 2>/dev/null; then echo "Cleartext HTTP"; else echo "HTTPS detected"; fi) | MEDIUM |
| M4: Insecure Authentication | Client-side auth review | Review |
| M5: Insufficient Cryptography | No secure storage | HIGH |
| M6: Insecure Authorization | Plugin permissions | MEDIUM |
| M7: Client Code Quality | JS source readable | HIGH |
| M8: Security Misconfiguration | $(if grep -q "http://" "$output_dir/network/all_urls.txt" 2>/dev/null; then echo "CSP missing"; else echo "CSP present"; fi) | MEDIUM |
| M9: Reverse Engineering | JS code fully readable | HIGH |
| M10: Extraneous Functionality | Debug endpoints | MEDIUM |

## Frida Hooks Available

### Generated Scripts
1. **cordova_exec_hook.js** - Monitor Cordova bridge calls
2. **cordova_storage_hook.js** - Monitor WebStorage operations
3. **cordova_camera_hook.js** - Monitor camera access
4. **cordova_geolocation_hook.js** - Monitor location access
5. **cordova_contacts_hook.js** - Monitor contact access
6. **cordova_sqlite_hook.js** - Monitor SQLite operations

### Usage
\`\`\`bash
frida -U -f com.package.name -l $output_dir/frida/cordova_exec_hook.js
\`\`\`

## Recommendations

1. **Implement CSP**: Add Content-Security-Policy header
2. **Use HTTPS only**: Remove all http:// endpoints
3. **Secure storage**: Use cordova-plugin-secure-storage
4. **Update plugins**: Keep all plugins updated
5. **Minimize permissions**: Review and reduce plugin permissions
6. **Remove debug code**: Disable console logging in production
7. **Obffuscate JS**: Use JavaScript obfuscation for sensitive code

## Extracted Artifacts

| Artifact | Location |
|----------|----------|
| www directory | $output_dir/www |
| config.xml | $output_dir/config/config.xml |
| JavaScript analysis | $output_dir/js_analysis |
| Plugins | $output_dir/plugins |
| Frida hooks | $output_dir/frida |

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
    
    local www_only=false
    local plugins_only=false
    local frida_mode=false
    local analysis_mode="full"
    
    while [ $# -gt 0 ]; do
        case "$1" in
            --www-only) www_only=true; analysis_mode="www"; shift ;;
            --plugins-only) plugins_only=true; analysis_mode="plugins"; shift ;;
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
    
    log_info "Starting Cordova/Ionic analysis..."
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
    
    local framework_info=$(identify_cordova "$apk_path" "$output_dir")
    local framework=$(echo "$framework_info" | grep "FRAMEWORK=" | cut -d= -f2)
    
    if [ -z "$framework" ]; then
        log_error "This does not appear to be a Cordova/Ionic application"
        exit 1
    fi
    
    case "$analysis_mode" in
        full)
            extract_www_directory "$apk_path" "$output_dir"
            analyze_config_xml "$output_dir/decoded" "$output_dir"
            analyze_javascript_code "$output_dir/www" "$output_dir"
            analyze_cordova_plugins "$output_dir/decoded" "$output_dir"
            analyze_storage_mechanisms "$output_dir/www" "$output_dir/decoded" "$output_dir"
            analyze_network_security "$output_dir/www" "$output_dir"
            analyze_cordova_bridge "$output_dir/www" "$output_dir"
            ;;
        www)
            extract_www_directory "$apk_path" "$output_dir"
            analyze_javascript_code "$output_dir/www" "$output_dir"
            analyze_storage_mechanisms "$output_dir/www" "$output_dir/decoded" "$output_dir"
            analyze_network_security "$output_dir/www" "$output_dir"
            ;;
        plugins)
            analyze_cordova_plugins "$output_dir/decoded" "$output_dir"
            ;;
    esac
    
    if [ "$frida_mode" = true ]; then
        generate_frida_hooks "$output_dir"
    fi
    
    generate_report "$apk_path" "$output_dir" "$framework"
    
    log_success "Cordova/Ionic analysis complete!"
    log_info "Results saved to: $output_dir"
}

main "$@"
