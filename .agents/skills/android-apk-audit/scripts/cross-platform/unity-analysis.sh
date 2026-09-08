#!/bin/bash
#
# Unity Security Analysis Script
# Extracts and analyzes Unity IL2CPP applications
#
# Usage: ./unity-analysis.sh <apk_path> <output_dir> [options]
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
Unity Security Analysis Script
==============================

Usage: $0 <apk_path> <output_dir> [options]

Arguments:
    apk_path         Path to the Unity APK
    output_dir       Directory for extracted output

Options:
    --il2cpp-only      Analyze only IL2CPP components
    --assets-only      Analyze only Unity assets
    --full             Full analysis (default)
    --frida            Generate Frida hooks

Examples:
    $0 game-release.apk /tmp/unity_analysis
    $0 app.apk /tmp/output --il2cpp-only --frida

EOF
    exit 1
}

check_dependencies() {
    local deps=("apktool" "unzip" "strings" "grep" "egrep" "file" "xxd")
    for dep in "${deps[@]}"; do
        if ! command -v "$dep" &> /dev/null; then
            log_warning "$dep not found. Some features may not work."
        fi
    done

    if ! command -v jq &> /dev/null; then
        log_error "jq not found. Install with: brew install jq"
        exit 2
    fi

    if ! command -v dotnet &> /dev/null; then
        log_warning "dotnet not found - Xamarin assembly analysis disabled"
    fi
}

identify_unity() {
    local apk_path="$1"
    local decoded_dir="$2"
    
    log_info "Identifying Unity application..."
    
    local indicators=0
    local findings=""
    local unity_version="unknown"
    
    if unzip -l "$apk_path" 2>/dev/null | grep -q "lib/libil2cpp.so\|libil2cpp.so"; then
        log_success "Found: libil2cpp.so (IL2CPP runtime)"
        indicators=$((indicators + 1))
        findings="$findings\n  - Runtime: IL2CPP"
    elif unzip -l "$apk_path" 2>/dev/null | grep -q "lib/libmono.so\|libmono.so"; then
        log_success "Found: libmono.so (Mono runtime - legacy)"
        indicators=$((indicators + 1))
        findings="$findings\n  - Runtime: Mono (legacy)"
    fi
    
    if unzip -l "$apk_path" 2>/dev/null | grep -q "lib/libunity.so\|libunity.so"; then
        log_success "Found: libunity.so (Unity engine)"
        indicators=$((indicators + 1))
        findings="$findings\n  - Engine: libunity.so"
    fi
    
    if unzip -l "$apk_path" 2>/dev/null | grep -q "global-metadata.dat"; then
        log_success "Found: global-metadata.dat (IL2CPP metadata)"
        indicators=$((indicators + 1))
        findings="$findings\n  - Metadata: global-metadata.dat present"
    fi
    
    if unzip -l "$apk_path" 2>/dev/null | grep -q "Assembly-CSharp.dll"; then
        log_success "Found: Assembly-CSharp.dll"
        indicators=$((indicators + 1))
        findings="$findings\n  - Assembly: Assembly-CSharp.dll"
    fi
    
    if unzip -l "$apk_path" 2>/dev/null | grep -q "assets/bin/Data"; then
        log_info "Found: Unity data directory structure"
        findings="$findings\n  - Data: assets/bin/Data/"
    fi
    
    if unzip -l "$apk_path" 2>/dev/null | grep -q "\.assets$|\.asset$"; then
        log_info "Found: Unity asset files"
        findings="$findings\n  - Assets: .asset files present"
    fi
    
    if unzip -l "$apk_path" 2>/dev/null | grep -q "\.unity3d$"; then
        log_info "Found: Unity3D bundle files"
        findings="$findings\n  - Bundles: .unity3d files present"
    fi
    
    if unzip -p "$apk_path" "AndroidManifest.xml" 2>/dev/null | strings | grep -q "com.unity3d\|com.unityengine"; then
        log_success "Found: Unity package indicators"
        indicators=$((indicators + 1))
        findings="$findings\n  - Package: Unity Technologies"
    fi
    
    echo -e "$findings"
    
    if [ "$indicators" -ge 3 ]; then
        return 0
    else
        log_warning "Low confidence Unity indicators ($indicators/8)"
        return 1
    fi
}

extract_unity_components() {
    local apk_path="$1"
    local output_dir="$2"
    
    log_info "Extracting Unity components..."
    
    mkdir -p "$output_dir/unity"
    
    unzip -o "$apk_path" "lib/libil2cpp.so" -d "$output_dir/unity" 2>/dev/null || \
    unzip -o "$apk_path" "libil2cpp.so" -d "$output_dir/unity" 2>/dev/null || \
        log_warning "libil2cpp.so not found"
    
    unzip -o "$apk_path" "lib/libunity.so" -d "$output_dir/unity" 2>/dev/null || \
    unzip -o "$apk_path" "libunity.so" -d "$output_dir/unity" 2>/dev/null || \
        log_warning "libunity.so not found"
    
    unzip -o "$apk_path" "lib/libmono.so" -d "$output_dir/unity" 2>/dev/null || \
        log_info "libmono.so not present (IL2CPP build)"
    
    unzip -o "$apk_path" "global-metadata.dat" -d "$output_dir/unity" 2>/dev/null || \
    unzip -o "$apk_path" "assets/bin/Data/global-metadata.dat" -d "$output_dir/unity" 2>/dev/null || \
        log_warning "global-metadata.dat not found"
    
    unzip -o "$apk_path" "Assembly-CSharp.dll" -d "$output_dir/unity" 2>/dev/null || \
    unzip -o "$apk_path" "assets/bin/Data/Managed/Assembly-CSharp.dll" -d "$output_dir/unity" 2>/dev/null || \
        log_warning "Assembly-CSharp.dll not found"
    
    mkdir -p "$output_dir/unity/managed"
    unzip -o "$apk_path" "assets/bin/Data/Managed/*.dll" -d "$output_dir/unity/managed" 2>/dev/null || \
        log_info "No additional managed assemblies found"
    
    mkdir -p "$output_dir/unity/assets"
    unzip -o "$apk_path" "assets/bin/Data/*.assets" -d "$output_dir/unity/assets" 2>/dev/null || \
        log_info "No .assets files in standard location"
    
    find "$output_dir/unity" -type f -size +1M 2>/dev/null | while read f; do
        local size=$(stat -f%z "$f" 2>/dev/null || stat -c%s "$f" 2>/dev/null)
        log_info "Large file: $(basename $f) - $size bytes"
    done
    
    log_success "Unity components extracted"
}

analyze_il2cpp_binary() {
    local output_dir="$1"
    
    log_info "Analyzing IL2CPP binary..."
    
    mkdir -p "$output_dir/il2cpp_analysis"
    
    local libil2cpp_path="$output_dir/unity/libil2cpp.so"
    
    if [ ! -f "$libil2cpp_path" ]; then
        log_error "libil2cpp.so not found"
        return 1
    fi
    
    log_info "Extracting strings from libil2cpp.so..."
    strings "$libil2cpp_path" > "$output_dir/il2cpp_analysis/libil2cpp_strings.txt" 2>/dev/null
    local string_count=$(wc -l < "$output_dir/il2cpp_analysis/libil2cpp_strings.txt")
    log_success "Extracted $string_count strings"
    
    log_info "Searching for sensitive patterns..."
    grep -iE "(api[_-]?key|secret[_-]?key|token|auth|bearer|password|passwd|credential)" "$output_dir/il2cpp_analysis/libil2cpp_strings.txt" 2>/dev/null | sort -u > "$output_dir/il2cpp_analysis/secrets.txt" || true
    local secret_count=$(wc -l < "$output_dir/il2cpp_analysis/secrets.txt" 2>/dev/null || echo "0")
    if [ "$secret_count" -gt 0 ]; then
        log_warning "Found $secret_count potential secrets in IL2CPP binary"
    fi
    
    log_info "Searching for network-related strings..."
    grep -iE "(http|https|socket|tcp|udp|ip|connect|send|recv)" "$output_dir/il2cpp_analysis/libil2cpp_strings.txt" 2>/dev/null | sort -u > "$output_dir/il2cpp_analysis/network_strings.txt" || true
    
    log_info "Searching for crypto-related strings..."
    grep -iE "(encrypt|decrypt|crypto|aes|rsa|md5|sha|hash|cipher|key)" "$output_dir/il2cpp_analysis/libil2cpp_strings.txt" 2>/dev/null | sort -u > "$output_dir/il2cpp_analysis/crypto_strings.txt" || true
    
    log_success "IL2CPP binary analysis complete"
}

analyze_metadata() {
    local output_dir="$1"
    
    log_info "Analyzing IL2CPP global-metadata.dat..."
    
    mkdir -p "$output_dir/metadata_analysis"
    
    local metadata_path="$output_dir/unity/global-metadata.dat"
    
    if [ ! -f "$metadata_path" ]; then
        metadata_path=$(find "$output_dir/unity" -name "global-metadata.dat" 2>/dev/null | head -1)
        if [ -z "$metadata_path" ]; then
            log_warning "global-metadata.dat not found"
            return 1
        fi
    fi
    
    local metadata_size=$(stat -f%z "$metadata_path" 2>/dev/null || stat -c%s "$metadata_path" 2>/dev/null || echo "0")
    log_info "global-metadata.dat size: $metadata_size bytes"
    
    log_info "Extracting strings from metadata..."
    strings "$metadata_path" > "$output_dir/metadata_analysis/metadata_strings.txt" 2>/dev/null
    local meta_string_count=$(wc -l < "$output_dir/metadata_analysis/metadata_strings.txt")
    log_success "Extracted $meta_string_count strings from metadata"
    
    log_info "Extracting class and method names..."
    grep -E "^[A-Z][a-zA-Z0-9_]+$|^[a-z][a-zA-Z0-9_]+$" "$output_dir/metadata_analysis/metadata_strings.txt" 2>/dev/null | sort -u > "$output_dir/metadata_analysis/class_names.txt" || true
    local class_count=$(wc -l < "$output_dir/metadata_analysis/class_names.txt" 2>/dev/null || echo "0")
    log_info "Found approximately $class_count unique type names"
    
    log_info "Searching for sensitive data in metadata..."
    grep -iE "(api[_-]?key|secret|password|token|auth|credential|private|key)" "$output_dir/metadata_analysis/metadata_strings.txt" 2>/dev/null | sort -u > "$output_dir/metadata_analysis/sensitive_metadata.txt" || true
    local sensitive_count=$(wc -l < "$output_dir/metadata_analysis/sensitive_metadata.txt" 2>/dev/null || echo "0")
    if [ "$sensitive_count" -gt 0 ]; then
        log_warning "Found $sensitive_count potentially sensitive strings in metadata"
    fi
    
    log_info "Searching for URL endpoints..."
    grep -oE "https?://[a-zA-Z0-9._/~:&=?%-]+" "$output_dir/metadata_analysis/metadata_strings.txt" 2>/dev/null | sort -u > "$output_dir/metadata_analysis/urls.txt" || true
    local url_count=$(wc -l < "$output_dir/metadata_analysis/urls.txt" 2>/dev/null || echo "0")
    log_info "Found $url_count URLs in metadata"
    
    log_info "Searching for Unity-specific strings..."
    grep -iE "(PlayerPrefs|GameObject|MonoBehaviour|ScriptableObject|Resources|SerializeField)" "$output_dir/metadata_analysis/metadata_strings.txt" 2>/dev/null | sort -u > "$output_dir/metadata_analysis/unity_types.txt" || true
    
    log_success "Metadata analysis complete"
}

analyze_assemblies() {
    local output_dir="$1"
    
    log_info "Analyzing .NET assemblies..."
    
    mkdir -p "$output_dir/assembly_analysis"
    
    local assembly_path="$output_dir/unity/Assembly-CSharp.dll"
    
    if [ ! -f "$assembly_path" ]; then
        assembly_path=$(find "$output_dir/unity" -name "Assembly-CSharp.dll" 2>/dev/null | head -1)
        if [ -z "$assembly_path" ]; then
            log_warning "Assembly-CSharp.dll not found - may be stripped"
            return 1
        fi
    fi
    
    log_info "Assembly found: $assembly_path"
    local assembly_size=$(stat -f%z "$assembly_path" 2>/dev/null || stat -c%s "$assembly_path" 2>/dev/null || echo "0")
    log_info "Assembly size: $assembly_size bytes"
    
    log_info "Extracting strings from assembly..."
    strings "$assembly_path" > "$output_dir/assembly_analysis/assembly_strings.txt" 2>/dev/null
    local asm_string_count=$(wc -l < "$output_dir/assembly_analysis/assembly_strings.txt")
    log_success "Extracted $asm_string_count strings from assembly"
    
    log_info "Searching for sensitive data..."
    grep -iE "(api[_-]?key|secret|password|token|auth|credential|connection|string)" "$output_dir/assembly_analysis/assembly_strings.txt" 2>/dev/null | sort -u > "$output_dir/assembly_analysis/secrets.txt" || true
    local secret_count=$(wc -l < "$output_dir/assembly_analysis/secrets.txt" 2>/dev/null || echo "0")
    if [ "$secret_count" -gt 0 ]; then
        log_warning "Found $secret_count potential secrets in assembly"
    fi
    
    log_info "Searching for URL endpoints..."
    grep -oE "https?://[a-zA-Z0-9._/~:&=?%-]+" "$output_dir/assembly_analysis/assembly_strings.txt" 2>/dev/null | sort -u > "$output_dir/assembly_analysis/urls.txt" || true
    local url_count=$(wc -l < "$output_dir/assembly_analysis/urls.txt" 2>/dev/null || echo "0")
    log_info "Found $url_count URLs in assembly"
    
    log_info "Searching for Unity API usage..."
    grep -iE "(PlayerPrefs|HttpClient|WebRequest|Debug|Log|SerializeField|RequireComponent)" "$output_dir/assembly_analysis/assembly_strings.txt" 2>/dev/null | sort -u > "$output_dir/assembly_analysis/unity_api.txt" || true
    
    log_info "Searching for crypto usage..."
    grep -iE "(Rijndael|AES|DES|Crypto|Encrypt|Decrypt|Symmetric|Asymmetric)" "$output_dir/assembly_analysis/assembly_strings.txt" 2>/dev/null | sort -u > "$output_dir/assembly_analysis/crypto_usage.txt" || true
    
    if command -v dotnet &> /dev/null && dotnet tool list -g 2>/dev/null | grep -q "ilspy"; then
        log_info "ilspycmd available for deep assembly analysis"
        mkdir -p "$output_dir/assembly_analysis/decompiled"
        timeout 60 dotnet ilspycmd "$assembly_path" -o "$output_dir/assembly_analysis/decompiled" 2>/dev/null || \
            log_warning "Assembly decompilation timed out or failed"
    else
        log_info "For deeper analysis, install ilspycmd: dotnet tool install -g ilspycmd"
    fi
    
    log_success "Assembly analysis complete"
}

analyze_playerprefs() {
    local decoded_dir="$1"
    local output_dir="$2"
    
    log_info "Analyzing Unity PlayerPrefs patterns..."
    
    mkdir -p "$output_dir/playerprefs_analysis"
    
    log_info "Searching for PlayerPrefs usage in assemblies..."
    
    if [ -f "$output_dir/assembly_analysis/unity_api.txt" ]; then
        grep -i "PlayerPrefs" "$output_dir/assembly_analysis/unity_api.txt" > "$output_dir/playerprefs_analysis/playerprefs_usage.txt" || true
        
        if [ -s "$output_dir/playerprefs_analysis/playerprefs_usage.txt" ]; then
            log_warning "PlayerPrefs usage detected"
            cat >> "$output_dir/playerprefs_analysis/vulnerabilities.txt" << 'EOF'
PlayerPrefs Usage Detected
Severity: MEDIUM
Risk: PlayerPrefs stores data in plaintext files on device
Recommendation: Use encrypted storage for sensitive data
EOF
        fi
    fi
    
    log_info "Searching for SetString, GetString calls..."
    grep -E "SetString|GetString|SetInt|GetInt|SetFloat|GetFloat" "$output_dir/assembly_analysis/assembly_strings.txt" 2>/dev/null | head -20 >> "$output_dir/playerprefs_analysis/playerprefs_calls.txt" || true
    
    log_success "PlayerPrefs analysis complete"
}

analyze_unity_assets() {
    local output_dir="$1"
    
    log_info "Analyzing Unity assets..."
    
    mkdir -p "$output_dir/assets_analysis"
    
    local asset_files=$(find "$output_dir/unity/assets" -name "*.assets" -o -name "*.asset" 2>/dev/null)
    
    if [ -z "$asset_files" ]; then
        log_info "No .assets files found in standard locations"
        
        log_info "Searching for Unity asset bundles..."
        find "$output_dir/unity" -name "*.unity3d" -o -name "*.bytes" 2>/dev/null | head -10 >> "$output_dir/assets_analysis/bundle_files.txt" || true
        find "$output_dir/unity" -name "*.dat" 2>/dev/null | head -10 >> "$output_dir/assets_analysis/bundle_files.txt" || true
    else
        for asset_file in $asset_files; do
            log_info "Asset file: $(basename $asset_file)"
            strings "$asset_file" 2>/dev/null | head -50 >> "$output_dir/assets_analysis/asset_strings.txt" || true
        done
    fi
    
    log_info "Extracting strings from libunity.so..."
    if [ -f "$output_dir/unity/libunity.so" ]; then
        strings "$output_dir/unity/libunity.so" 2>/dev/null | head -100 > "$output_dir/assets_analysis/unity_engine_strings.txt"
    fi
    
    log_success "Unity assets analysis complete"
}

analyze_network_security() {
    local output_dir="$1"
    
    log_info "Analyzing network security patterns..."
    
    mkdir -p "$output_dir/network_analysis"
    
    if [ -f "$output_dir/il2cpp_analysis/network_strings.txt" ]; then
        cp "$output_dir/il2cpp_analysis/network_strings.txt" "$output_dir/network_analysis/il2cpp_network.txt"
    fi
    
    if [ -f "$output_dir/metadata_analysis/urls.txt" ]; then
        cp "$output_dir/metadata_analysis/urls.txt" "$output_dir/network_analysis/all_urls.txt"
    fi
    
    if [ -f "$output_dir/assembly_analysis/urls.txt" ]; then
        cat "$output_dir/assembly_analysis/urls.txt" >> "$output_dir/network_analysis/all_urls.txt" 2>/dev/null || true
    fi
    
    local total_urls=$(wc -l < "$output_dir/network_analysis/all_urls.txt" 2>/dev/null || echo "0")
    log_info "Found $total_urls total URLs"
    
    if [ -f "$output_dir/assembly_analysis/unity_api.txt" ]; then
        grep -iE "(UnityWebRequest|HttpClient|WebRequest|www\.|url)" "$output_dir/assembly_analysis/unity_api.txt" > "$output_dir/network_analysis/unity_network.txt" || true
    fi
    
    log_info "Searching for SSL/TLS patterns..."
    grep -iE "(ssl|tls|certificate|pinning|https)" "$output_dir/il2cpp_analysis/libil2cpp_strings.txt" "$output_dir/metadata_analysis/metadata_strings.txt" 2>/dev/null | sort -u > "$output_dir/network_analysis/ssl_patterns.txt" || true
    
    log_success "Network security analysis complete"
}

generate_frida_hooks() {
    local output_dir="$1"
    
    log_info "Generating Frida hooks for Unity..."
    
    mkdir -p "$output_dir/frida"
    
    cat > "$output_dir/frida/unity_playerprefs_hook.js" << 'EOF'
/*
 * Frida hook for Unity PlayerPrefs
 * monitors all PlayerPrefs operations
 */
Java.perform(function() {
    var PlayerPrefs = null;
    
    try {
        PlayerPrefs = Java.use('com.unity3d.player.PlayerPrefs']);
    } catch (e) {
        console.log('[-] PlayerPrefs not found');
        return;
    }
    
    console.log('[+] Unity PlayerPrefs hook loaded');
    
    PlayerPrefs.SetString.implementation = function(name, value) {
        console.log('[PlayerPrefs] SET_STRING:', name, '=', value);
        if (name.toLowerCase().includes('token') || 
            name.toLowerCase().includes('password') ||
            name.toLowerCase().includes('key') ||
            name.toLowerCase().includes('secret')) {
            console.log('[WARNING] Sensitive data in PlayerPrefs!');
        }
        return this.SetString(name, value);
    };
    
    PlayerPrefs.GetString.implementation = function(name) {
        console.log('[PlayerPrefs] GET_STRING:', name);
        var result = this.GetString(name);
        return result;
    };
    
    PlayerPrefs.SetInt.implementation = function(name, value) {
        console.log('[PlayerPrefs] SET_INT:', name, '=', value);
        return this.SetInt(name, value);
    };
    
    PlayerPrefs.GetInt.implementation = function(name) {
        console.log('[PlayerPrefs] GET_INT:', name);
        return this.GetInt(name);
    };
    
    PlayerPrefs.SetFloat.implementation = function(name, value) {
        console.log('[PlayerPrefs] SET_FLOAT:', name, '=', value);
        return this.SetFloat(name, value);
    };
    
    PlayerPrefs.GetFloat.implementation = function(name) {
        console.log('[PlayerPrefs] GET_FLOAT:', name);
        return this.GetFloat(name);
    };
    
    PlayerPrefs.Save.implementation = function() {
        console.log('[PlayerPrefs] SAVE called');
        return this.Save();
    };
});
EOF

    cat > "$output_dir/frida/unity_network_hook.js" << 'EOF'
/*
 * Frida hook for Unity networking
 * monitors UnityWebRequest and HttpClient
 */
Java.perform(function() {
    var UnityWebRequest = null;
    
    try {
        UnityWebRequest = Java.use('com.unity3d.player.UnityWebRequest');
    } catch (e) {
        console.log('[-] UnityWebRequest not found');
    }
    
    var HttpClient = null;
    try {
        HttpClient = Java.use('java.net.HttpURLConnection');
    } catch (e) {
        console.log('[-] HttpURLConnection not found');
    }
    
    console.log('[+] Unity network hook loaded');
    
    if (UnityWebRequest) {
        UnityWebRequest.SendWebRequest.implementation = function() {
            console.log('[UnityWebRequest] SendWebRequest called');
            return this.SendWebRequest();
        };
    }
    
    if (HttpClient) {
        HttpClient.connect.implementation = function() {
            console.log('[HttpURLConnection] connect called');
            return this.connect();
        };
        
        HttpClient.getInputStream.implementation = function() {
            console.log('[HttpURLConnection] getInputStream called');
            return this.getInputStream();
        };
    }
});
EOF

    cat > "$output_dir/frida/unity_il2cpp_hook.js" << 'EOF'
/*
 * Frida hook for IL2CPP method resolution
 * helps trace C# method calls
 */
Java.perform(function() {
    var Il2CppThread = null;
    
    try {
        Il2CppThread = Java.use('libil2cpp.Il2CppThread']);
    } catch (e) {
        console.log('[-] Il2CppThread not found');
    }
    
    console.log('[+] IL2CPP hook loaded');
    console.log('[+] Note: IL2CPP method hooking requires address-based hooking');
    console.log('[+] Use Frida with --runtime=v8 and trace function addresses');
});
EOF

    cat > "$output_dir/frida/unity_crypto_hook.js" << 'EOF'
/*
 * Frida hook for crypto operations in Unity
 */
Java.perform(function() {
    var Cipher = null;
    var SecretKeyFactory = null;
    
    try {
        Cipher = Java.use('javax.crypto.Cipher']);
    } catch (e) {
        console.log('[-] Cipher not found');
    }
    
    try {
        SecretKeyFactory = Java.use('javax.crypto.SecretKeyFactory']);
    } catch (e) {
        console.log('[-] SecretKeyFactory not found');
    }
    
    console.log('[+] Unity crypto hook loaded');
    
    if (Cipher) {
        Cipher.getInstance.implementation = function(algorithm) {
            console.log('[Crypto] Cipher requested:', algorithm);
            return this.getInstance(algorithm);
        };
        
        Cipher.doFinal.implementation = function(data) {
            console.log('[Crypto] doFinal - input length:', data ? data.length : 0);
            return this.doFinal(data);
        };
    }
    
    if (SecretKeyFactory) {
        SecretKeyFactory.getInstance.implementation = function(algorithm) {
            console.log('[Crypto] SecretKeyFactory:', algorithm);
            return this.getInstance(algorithm);
        };
    }
});
EOF

    log_success "Frida hooks generated in $output_dir/frida/"
}

generate_report() {
    local apk_path="$1"
    local output_dir="$2"
    
    log_info "Generating Unity analysis report..."
    
    local report="$output_dir/REPORT.md"
    
    local il2cpp_enabled="No"
    if [ -f "$output_dir/unity/libil2cpp.so" ]; then
        il2cpp_enabled="Yes"
    fi
    
    local mono_enabled="No"
    if [ -f "$output_dir/unity/libmono.so" ]; then
        mono_enabled="Yes"
    fi
    
    local metadata_size=$(stat -f%z "$output_dir/unity/global-metadata.dat" 2>/dev/null || stat -c%s "$output_dir/unity/global-metadata.dat" 2>/dev/null || echo "N/A")
    local class_count=$(wc -l < "$output_dir/metadata_analysis/class_names.txt" 2>/dev/null || echo "0")
    local secrets_meta=$(wc -l < "$output_dir/metadata_analysis/sensitive_metadata.txt" 2>/dev/null || echo "0")
    local secrets_asm=$(wc -l < "$output_dir/assembly_analysis/secrets.txt" 2>/dev/null || echo "0")
    
    cat > "$report" << EOF
# Unity Security Analysis Report

## Application Information
- **APK**: $(basename "$apk_path")
- **Framework**: Unity (IL2CPP/Mono)
- **Analysis Date**: $(date)
- **Output Directory**: $output_dir

## Framework Detection

### Indicators
$(identify_unity "$apk_path" "$output_dir" 2>/dev/null || echo "See extracted artifacts")

### Unity Build Configuration
| Component | Status |
|-----------|--------|
| IL2CPP Runtime | $il2cpp_enabled |
| Mono Runtime | $mono_enabled |
| global-metadata.dat | $(if [ -f "$output_dir/unity/global-metadata.dat" ]; then echo "Present ($metadata_size bytes)"; else echo "Not found"; fi) |
| Assembly-CSharp.dll | $(if [ -f "$output_dir/unity/Assembly-CSharp.dll" ]; then echo "Present"; else echo "Stripped"; fi) |

### IL2CPP Analysis Summary
- **Metadata strings**: $(wc -l < "$output_dir/metadata_analysis/metadata_strings.txt" 2>/dev/null || echo "N/A")
- **Class/type names**: $class_count
- **Sensitive strings in metadata**: $secrets_meta
- **Sensitive strings in assembly**: $secrets_meta
- **URLs in metadata**: $(wc -l < "$output_dir/metadata_analysis/urls.txt" 2>/dev/null || echo "0")

## Findings Summary

### Secrets Found
**In IL2CPP binary**: $(wc -l < "$output_dir/il2cpp_analysis/secrets.txt" 2>/dev/null || echo "0") potential secrets
**In metadata**: $secrets_meta potential secrets
**In assembly**: $secrets_asm potential secrets

### Network Endpoints
**Total URLs found**: $(wc -l < "$output_dir/network_analysis/all_urls.txt" 2>/dev/null || echo "0")

### Unity-Specific Findings
$(if [ -f "$output_dir/playerprefs_analysis/vulnerabilities.txt" ]; then
    cat "$output_dir/playerprefs_analysis/vulnerabilities.txt"
else
    echo "No PlayerPrefs usage detected or no vulnerabilities"
fi)

## OWASP Mobile Top 10 Mapping

| Category | Finding | Severity |
|----------|---------|----------|
| M1: Improper Platform Usage | IL2CPP reflection | Review |
| M2: Insecure Data Storage | PlayerPrefs plaintext | MEDIUM |
| M3: Insecure Communication | Network analysis | Review |
| M4: Insecure Authentication | Auth in C# code | Review |
| M5: Insufficient Cryptography | Hardcoded crypto keys | HIGH |
| M7: Client Code Quality | C# code in DLLs | HIGH |
| M9: Reverse Engineering | IL2CPP + metadata | HIGH |
| M10: Extraneous Functionality | Debug console | MEDIUM |

## Frida Hooks Available

### Generated Scripts
1. **unity_playerprefs_hook.js** - Monitor PlayerPrefs operations
2. **unity_network_hook.js** - Monitor UnityWebRequest
3. **unity_il2cpp_hook.js** - IL2CPP method tracing
4. **unity_crypto_hook.js** - Monitor crypto operations

### Usage
\`\`\`bash
frida -U -f com.package.name -l $output_dir/frida/unity_playerprefs_hook.js
\`\`\`

## Recommendations

1. **Enable IL2CPP stripping**: Reduces metadata exposure
2. **Obfuscate C# code**: Use Unity obfuscation tools
3. **Never store sensitive data in PlayerPrefs**: Use encrypted storage
4. **Remove debug builds**: Disable logging in release
5. **Network security**: Implement certificate pinning
6. **Asset protection**: Don't embed sensitive data in assets

## Extracted Artifacts

| Artifact | Location | Size |
|----------|----------|------|
| libil2cpp.so | $output_dir/unity/libil2cpp.so | $(stat -f%z "$output_dir/unity/libil2cpp.so" 2>/dev/null || stat -c%s "$output_dir/unity/libil2cpp.so" 2>/dev/null || echo "N/A") |
| global-metadata.dat | $output_dir/unity/global-metadata.dat | $metadata_size |
| Assembly-CSharp.dll | $output_dir/unity/Assembly-CSharp.dll | $(stat -f%z "$output_dir/unity/Assembly-CSharp.dll" 2>/dev/null || stat -c%s "$output_dir/unity/Assembly-CSharp.dll" 2>/dev/null || echo "N/A") |
| IL2CPP strings | $output_dir/il2cpp_analysis/ | Various |
| Metadata strings | $output_dir/metadata_analysis/ | Various |
| Assembly strings | $output_dir/assembly_analysis/ | Various |

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
    
    local il2cpp_only=false
    local assets_only=false
    local frida_mode=false
    local analysis_mode="full"
    
    while [ $# -gt 0 ]; do
        case "$1" in
            --il2cpp-only) il2cpp_only=true; analysis_mode="il2cpp"; shift ;;
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
    
    log_info "Starting Unity analysis..."
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
    
    if ! identify_unity "$apk_path" "$output_dir" 2>&1 | grep -q "libil2cpp.so\|libmono.so"; then
        log_error "This does not appear to be a Unity application"
        exit 1
    fi
    
    case "$analysis_mode" in
        full)
            extract_unity_components "$apk_path" "$output_dir"
            analyze_il2cpp_binary "$output_dir"
            analyze_metadata "$output_dir"
            analyze_assemblies "$output_dir"
            analyze_playerprefs "$output_dir/decoded" "$output_dir"
            analyze_unity_assets "$output_dir"
            analyze_network_security "$output_dir"
            ;;
        il2cpp)
            extract_unity_components "$apk_path" "$output_dir"
            analyze_il2cpp_binary "$output_dir"
            analyze_metadata "$output_dir"
            ;;
        assets)
            extract_unity_components "$apk_path" "$output_dir"
            analyze_unity_assets "$output_dir"
            ;;
    esac
    
    if [ "$frida_mode" = "true" ]; then
        generate_frida_hooks "$output_dir"
    fi
    
    generate_report "$apk_path" "$output_dir"
    
    log_success "Unity analysis complete!"
    log_info "Results saved to: $output_dir"
}

main "$@"
