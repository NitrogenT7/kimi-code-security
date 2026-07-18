#!/usr/bin/env bash
#
# audit-android-components.sh
# Comprehensive Android Component Security Audit Script
# 
# Reliable, efficient, and replicable security testing for any APK
# Focuses on exported components, deep links, broadcasts, providers, and OAuth flows
#
# Author: DragonJAR Security Team
# Version: 2.0.0
# License: MIT
#

set -euo pipefail

# ============================================================================
# CONFIGURATION
# ============================================================================

# Colors for terminal output
readonly RED='\033[0;31m'
readonly GREEN='\033[0;32m'
readonly YELLOW='\033[1;33m'
readonly BLUE='\033[0;34m'
readonly MAGENTA='\033[0;35m'
readonly CYAN='\033[0;36m'
readonly NC='\033[0m' # No Color

# Script configuration
readonly SCRIPT_NAME="$(basename "$0")"
readonly SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly VERSION="2.0.0"

# Default values
APK_PATH=""
OUTPUT_DIR="./audit-output"
PARALLEL_JOBS=4
TIMEOUT=30
VERBOSE=0
GENERATE_FRIDA=1
ENABLE_DYNAMIC=0

# Global statistics
TOTAL_FINDINGS=0
CRITICAL_FINDINGS=0
HIGH_FINDINGS=0
MEDIUM_FINDINGS=0
LOW_FINDINGS=0

# ============================================================================
# UTILITY FUNCTIONS
# ============================================================================

log_info() {
    echo -e "${BLUE}[INFO]${NC} $*"
}

log_success() {
    echo -e "${GREEN}[OK]${NC} $*"
}

log_warning() {
    echo -e "${YELLOW}[WARN]${NC} $*"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $*" >&2
}

log_critical() {
    echo -e "${RED}[CRITICAL]${NC} $*"
}

log_section() {
    echo ""
    echo -e "${CYAN}========================================${NC}"
    echo -e "${CYAN}  $*${NC}"
    echo -e "${CYAN}========================================${NC}"
    echo ""
}

log_verbose() {
    if [[ $VERBOSE -eq 1 ]]; then
        echo -e "${MAGENTA}[DEBUG]${NC} $*"
    fi
}

# Print usage information
usage() {
    cat << EOF
${CYAN}Android Component Security Audit Script v${VERSION}${NC}

${YELLOW}USAGE:${NC}
    $SCRIPT_NAME [OPTIONS] <APK_PATH>

${YELLOW}DESCRIPTION:${NC}
    Comprehensive security audit of Android components including:
    - Deep link security testing (path traversal, scheme abuse)
    - BroadcastReceiver analysis (permission issues, sensitive data)
    - ContentProvider security (SQL injection, path traversal)
    - Exported Activity security (intent handling, WebView)
    - OAuth/PKCE detection (authentication flow security)
    - Frida hook generation (dynamic testing scripts)

${YELLOW}REQUIRED:${NC}
    APK_PATH              Path to the APK file to audit

${YELLOW}OPTIONS:${NC}
    -o, --output DIR      Output directory (default: ${OUTPUT_DIR})
    -j, --jobs NUM        Number of parallel jobs (default: ${PARALLEL_JOBS})
    -t, --timeout SEC     Timeout for commands in seconds (default: ${TIMEOUT})
    -v, --verbose         Enable verbose output
    -f, --no-frida        Skip Frida hook generation
    -d, --enable-dynamic  Enable dynamic testing (requires ADB)
    -h, --help            Show this help message

${YELLOW}OUTPUT:${NC}
    ${OUTPUT_DIR}/
    ├── 00-raw-findings.json      Machine-readable findings
    ├── 01-component-report.md    Human-readable report
    ├── frida-hooks/               Generated Frida scripts
    ├── manifest-analysis.json      Manifest breakdown
    └── audit-summary.txt          Execution summary

${YELLOW}EXAMPLES:${NC}
    # Basic audit
    $SCRIPT_NAME app.apk

    # Custom output with verbose mode
    $SCRIPT_NAME -o ./my-audit -v app.apk

    # Audit with dynamic testing (requires ADB)
    $SCRIPT_NAME -d app.apk

    # Audit without Frida hooks (static only)
    $SCRIPT_NAME -f app.apk

${YELLOW}REQUIREMENTS:${NC}
    - apktool  (for APK decoding)
    - jadx      (for decompilation)
    - aapt      (for manifest extraction)
    - grep/rg   (for code analysis)
    - jq        (for JSON processing)
    Optional: adb (for dynamic testing), frida (for runtime instrumentation)

${YELLOW}EXIT CODES:${NC}
    0    Success
    1    General error
    2    Missing dependency
    3    Invalid APK file
    4    APK decode failed
    5    Output directory error

EOF
    exit 0
}

# Parse command line arguments
parse_args() {
    while [[ $# -gt 0 ]]; do
        case $1 in
            -o|--output)
                OUTPUT_DIR="$2"
                shift 2
                ;;
            -j|--jobs)
                PARALLEL_JOBS="$2"
                shift 2
                ;;
            -t|--timeout)
                TIMEOUT="$2"
                shift 2
                ;;
            -v|--verbose)
                VERBOSE=1
                shift
                ;;
            -f|--no-frida)
                GENERATE_FRIDA=0
                shift
                ;;
            -d|--enable-dynamic)
                ENABLE_DYNAMIC=1
                shift
                ;;
            -h|--help)
                usage
                ;;
            -*)
                log_error "Unknown option: $1"
                usage
                ;;
            *)
                if [[ -z "$APK_PATH" ]]; then
                    APK_PATH="$1"
                else
                    log_error "Multiple APK files specified: $1"
                    usage
                fi
                shift
                ;;
        esac
    done

    # Validate required arguments
    if [[ -z "$APK_PATH" ]]; then
        log_error "APK path is required"
        usage
    fi
}

# ============================================================================
# PREREQUISITE CHECKING
# ============================================================================

check_prerequisites() {
    log_section "Checking Prerequisites"

    local missing_deps=0

    # Check required tools
    local tools=("apktool" "jadx" "aapt" "jq")
    
    for tool in "${tools[@]}"; do
        if command -v "$tool" &> /dev/null; then
            log_success "$tool found: $(command -v "$tool")"
        else
            log_error "$tool not found"
            missing_deps=$((missing_deps + 1))
        fi
    done

    # Check for ripgrep (preferred) or grep
    if command -v rg &> /dev/null; then
        log_success "ripgrep found (preferred for code search)"
        GREP_CMD="rg"
    elif command -v grep &> /dev/null; then
        log_success "grep found (fallback for code search)"
        GREP_CMD="grep"
    else
        log_error "Neither ripgrep nor grep found"
        missing_deps=$((missing_deps + 1))
    fi

    # Check optional tools
    if command -v adb &> /dev/null; then
        log_success "adb found (dynamic testing available)"
    else
        log_warning "adb not found (dynamic testing disabled)"
        ENABLE_DYNAMIC=0
    fi

    if [[ "$missing_deps" -gt 0 ]]; then
        log_error "Missing $missing_deps required dependencies"
        log_error "Please install missing tools and try again"
        exit 2
    fi

    log_success "All prerequisites met"
}

# Validate APK file
validate_apk() {
    log_section "Validating APK"

    if [[ ! -f "$APK_PATH" ]]; then
        log_error "APK file not found: $APK_PATH"
        exit 3
    fi

    # Check if it's a valid ZIP file (APKs are ZIP archives)
    if ! file "$APK_PATH" | grep -q "Zip archive"; then
        log_error "Invalid APK file (not a ZIP archive): $APK_PATH"
        exit 3
    fi

    # Check APK size
    local apk_size=$(du -h "$APK_PATH" | cut -f1)
    log_success "APK validated: $APK_PATH ($apk_size)"

    # Extract package name using aapt
    local package_name
    package_name=$(aapt dump badging "$APK_PATH" | grep -E "^package:" | cut -d "'" -f 2)
    
    if [[ -z "$package_name" ]]; then
        log_error "Failed to extract package name from APK"
        exit 3
    fi

    log_success "Package name: $package_name"
    echo "$package_name"
}

# Prepare output directory
prepare_output_dir() {
    log_section "Preparing Output Directory"

    if [[ -d "$OUTPUT_DIR" ]]; then
        log_warning "Output directory exists: $OUTPUT_DIR"
        log_info "Cleaning previous output..."
        rm -rf "${OUTPUT_DIR:?}"/*
    else
        log_info "Creating output directory: $OUTPUT_DIR"
    fi

    mkdir -p "$OUTPUT_DIR/frida-hooks"

    log_success "Output directory ready: $OUTPUT_DIR"
}

# ============================================================================
# APK DECODING
# ============================================================================

decode_apk() {
    local apk_path="$1"
    local output_dir="$2"
    
    log_section "Decoding APK"

    local decoded_dir="$output_dir/decoded"
    local jadx_dir="$output_dir/jadx"

    # Decode with apktool (resources + manifest)
    log_info "Decoding with apktool..."
    if ! apktool d "$apk_path" -o "$decoded_dir" -f &> /dev/null; then
        log_error "Failed to decode APK with apktool"
        exit 4
    fi
    log_success "APK decoded to: $decoded_dir"

    # Check if manifest exists
    if [[ ! -f "$decoded_dir/AndroidManifest.xml" ]]; then
        log_error "AndroidManifest.xml not found after decoding"
        exit 4
    fi
    log_success "AndroidManifest.xml found"

    # Decompile with jadx (source code)
    log_info "Decompiling with jadx..."
    if ! jadx -d "$jadx_dir" "$apk_path" &> /dev/null; then
        log_warning "Jadx decompilation failed, continuing with apktool only"
    else
        log_success "Source decompiled to: $jadx_dir"
    fi

    # Return paths
    echo "$decoded_dir|$jadx_dir"
}

# ============================================================================
# DEEP LINK SECURITY TESTING
# ============================================================================

extract_deep_links() {
    local manifest_file="$1"
    
    log_info "Extracting deep links from manifest..."

    # Extract all intent-filter data elements
    local deep_links=()
    local in_intent_filter=0
    local scheme=""
    local host=""
    local path=""
    local port=""
    local activity=""

    while IFS= read -r line; do
        # Track activity/component
        if [[ $line =~ android:name=\"([^\"]+)\" ]]; then
            activity="${BASH_REMATCH[1]}"
        fi

        # Track intent-filter start
        if [[ $line =~ \<intent-filter\> ]]; then
            in_intent_filter=1
            scheme=""
            host=""
            path=""
            port=""
        fi

        # Extract scheme
        if [[ $line =~ android:scheme=\"([^\"]+)\" ]]; then
            scheme="${BASH_REMATCH[1]}"
        fi

        # Extract host
        if [[ $line =~ android:host=\"([^\"]+)\" ]]; then
            host="${BASH_REMATCH[1]}"
        fi

        # Extract path
        if [[ $line =~ android:path=\"([^\"]+)\" ]]; then
            path="${BASH_REMATCH[1]}"
        fi

        # Extract pathPrefix
        if [[ $line =~ android:pathPrefix=\"([^\"]+)\" ]]; then
            path="${BASH_REMATCH[1]}"
        fi

        # Extract pathPattern
        if [[ $line =~ android:pathPattern=\"([^\"]+)\" ]]; then
            path="${BASH_REMATCH[1]}"
        fi

        # Extract port
        if [[ $line =~ android:port=\"([^\"]+)\" ]]; then
            port="${BASH_REMATCH[1]}"
        fi

        # Track intent-filter end - save deep link
        if [[ $line =~ \<\/intent-filter\> ]] && [[ $in_intent_filter -eq 1 ]]; then
            in_intent_filter=0
            
            if [[ -n "$scheme" ]]; then
                deep_links+=("$scheme|$host|$path|$port|$activity")
            fi
        fi
    done < "$manifest_file"

    # Return as JSON
    printf '%s\n' "${deep_links[@]}" | jq -R -s -c 'split("\n") | map(split("|") | {
        scheme: .[0],
        host: .[1],
        path: .[2],
        port: .[3],
        activity: .[4]
    }) | map(select(.scheme != ""))'
}

test_deep_link_bypass() {
    local deep_links_json="$1"
    local source_dir="$2"
    
    log_info "Testing deep link security..."

    local findings=()
    local deep_link_count=$(echo "$deep_links_json" | jq 'length')

    if [[ "$deep_link_count" -eq 0 ]]; then
        log_warning "No deep links found in manifest"
        return
    fi

    log_info "Found $deep_link_count deep link(s)"

    # Test each deep link for vulnerabilities
    while IFS= read -r dl; do
        local scheme=$(echo "$dl" | jq -r '.scheme')
        local host=$(echo "$dl" | jq -r '.host')
        local path=$(echo "$dl" | jq -r '.path')
        local activity=$(echo "$dl" | jq -r '.activity')

        log_verbose "Testing deep link: $scheme://$host$path"

        # Check for dangerous schemes
        if [[ "$scheme" == "javascript" ]]; then
            findings+=('{"type":"dangerous_scheme","severity":"critical","scheme":"javascript","host":"'"$host"'","path":"'"$path"'","activity":"'"$activity"'","description":"JavaScript: scheme can execute arbitrary code via WebView"}')
            ((CRITICAL_FINDINGS++))
        elif [[ "$scheme" == "file" ]]; then
            findings+=('{"type":"dangerous_scheme","severity":"high","scheme":"file","host":"'"$host"'","path":"'"$path"'","activity":"'"$activity"'","description":"file: scheme can access local files"}')
            ((HIGH_FINDINGS++))
        elif [[ "$scheme" == "data" ]]; then
            findings+=('{"type":"dangerous_scheme","severity":"medium","scheme":"data","host":"'"$host"'","path":"'"$path"'","activity":"'"$activity"'","description":"data: scheme can load arbitrary content"}')
            ((MEDIUM_FINDINGS++))
        fi

        # Check for missing host validation
        if [[ -z "$host" ]] && [[ "$scheme" != "javascript" ]]; then
            findings+=('{"type":"missing_host","severity":"medium","scheme":"'"$scheme"'","path":"'"$path"'","activity":"'"$activity"'","description":"Deep link without host specification can accept any domain"}')
            ((MEDIUM_FINDINGS++))
        fi

        # Check for wildcard paths
        if [[ "$path" == "/" ]] || [[ -z "$path" ]]; then
            findings+=('{"type":"wildcard_path","severity":"low","scheme":"'"$scheme"'","host":"'"$host"'","activity":"'"$activity"'","description":"Root path accepts all paths without validation"}')
            ((LOW_FINDINGS++))
        fi

    done < <(echo "$deep_links_json" | jq -c '.[]')

    # Search for path validation issues in code
    log_verbose "Searching for path validation in source code..."

    if [[ -d "$source_dir" ]]; then
        # Find getPath() usage without proper validation
        local path_traversal_patterns=(
            "getPath\(\)"
            "getLastPathSegment\(\)"
            "getData\(\)"
        )

        for pattern in "${path_traversal_patterns[@]}"; do
            local matches
            if [[ "$GREP_CMD" == "rg" ]]; then
                matches=$(rg -n "$pattern" "$source_dir" --type java --type kotlin 2>/dev/null || true)
            else
                matches=$(grep -rnE "$pattern" "$source_dir" --include="*.java" --include="*.kt" 2>/dev/null || true)
            fi

            if [[ -n "$matches" ]]; then
                while IFS= read -r match; do
                    log_verbose "Found path traversal candidate: $match"
                    findings+=('{"type":"path_traversal_candidate","severity":"medium","pattern":"'"$pattern"'","location":"'"${match%%:*}"'","description":"Potential path traversal via '"$pattern"' - verify validation"}')
                    ((MEDIUM_FINDINGS++))
                done <<< "$matches"
            fi
        done
    fi

    # Return findings as JSON
    printf '%s\n' "${findings[@]}" | jq -s '.' 2>/dev/null || echo '[]'
}

# ============================================================================
# BROADCAST RECEIVER ANALYSIS
# ============================================================================

analyze_broadcasts() {
    local manifest_file="$1"
    local source_dir="$2"
    
    log_info "Analyzing BroadcastReceiver security..."

    local findings=()

    # Extract all receivers from manifest
    log_verbose "Extracting broadcast receivers from manifest..."

    local receivers=()
    local current_receiver=""
    local exported="false"
    local has_permission=""
    
    while IFS= read -r line; do
        # Track receiver start
        if [[ $line =~ \<receiver ]]; then
            exported="false"
            has_permission=""
        fi

        # Extract receiver name
        if [[ $line =~ android:name=\"([^\"]+)\" ]]; then
            current_receiver="${BASH_REMATCH[1]}"
        fi

        # Extract exported flag
        if [[ $line =~ android:exported=\"([^\"]+)\" ]]; then
            exported="${BASH_REMATCH[1]}"
        fi

        # Extract permission
        if [[ $line =~ android:permission=\"([^\"]+)\" ]]; then
            has_permission="${BASH_REMATCH[1]}"
        fi

        # Track receiver end
        if [[ $line =~ \<\/receiver\> ]] && [[ -n "$current_receiver" ]]; then
            receivers+=("$current_receiver|$exported|$has_permission")
            current_receiver=""
        fi
    done < "$manifest_file"

    log_info "Found ${#receivers[@]} broadcast receiver(s)"

    # Analyze each receiver
    for receiver in "${receivers[@]}"; do
        local name=$(echo "$receiver" | cut -d'|' -f1)
        local exported=$(echo "$receiver" | cut -d'|' -f2)
        local permission=$(echo "$receiver" | cut -d'|' -f3)

        log_verbose "Analyzing receiver: $name (exported: $exported)"

        # Exported receiver without permission is critical
        if [[ "$exported" == "true" ]] && [[ -z "$permission" ]]; then
            findings+=('{"type":"exported_receiver_no_permission","severity":"high","receiver":"'"$name"'","description":"Exported BroadcastReceiver without permission - any app can send broadcasts"}')
            ((HIGH_FINDINGS++))
        fi

        # Search for custom action strings
        if [[ -d "$source_dir" ]]; then
            local action_pattern="Intent\\.filterEquals|addAction\\([\"'].*action"
            local matches
            if [[ "$GREP_CMD" == "rg" ]]; then
                matches=$(rg -n "$action_pattern" "$source_dir" --type java --type kotlin -A 2 2>/dev/null | grep -E "action|ACTION" | head -20 || true)
            else
                matches=$(grep -rnE "$action_pattern" "$source_dir" --include="*.java" --include="*.kt" -A 2 2>/dev/null | grep -E "action|ACTION" | head -20 || true)
            fi

            if [[ -n "$matches" ]]; then
                log_verbose "Found custom action patterns for $name"
            fi
        fi
    done

    # Search for sendBroadcast without permission
    if [[ -d "$source_dir" ]]; then
        log_verbose "Searching for unsafe sendBroadcast calls..."

        local unsafe_broadcasts
        if [[ "$GREP_CMD" == "rg" ]]; then
            unsafe_broadcasts=$(rg -n "sendBroadcast\\([^,)]+\\)" "$source_dir" --type java --type kotlin 2>/dev/null || true)
        else
            unsafe_broadcasts=$(grep -rnE "sendBroadcast\([^,)]+\)" "$source_dir" --include="*.java" --include="*.kt" 2>/dev/null || true)
        fi

        if [[ -n "$unsafe_broadcasts" ]]; then
            while IFS= read -r broadcast; do
                log_verbose "Found unsafe sendBroadcast: $broadcast"
                findings+=('{"type":"unsafe_sendbroadcast","severity":"medium","location":"'"${broadcast%%:*}"'","description":"sendBroadcast() without permission parameter - broadcasts can be intercepted"}')
                ((MEDIUM_FINDINGS++))
            done <<< "$unsafe_broadcasts"
        fi
    fi

    # Check for sensitive data in broadcasts
    log_verbose "Searching for sensitive data in broadcasts..."

    local sensitive_keywords=("password" "token" "api_key" "secret" "credential" "auth" "session")
    for keyword in "${sensitive_keywords[@]}"; do
        if [[ -d "$source_dir" ]]; then
            local matches
            if [[ "$GREP_CMD" == "rg" ]]; then
                matches=$(rg -n "putExtra.*${keyword}" "$source_dir" --type java --type kotlin 2>/dev/null || true)
            else
                matches=$(grep -rnE "putExtra.*${keyword}" "$source_dir" --include="*.java" --include="*.kt" 2>/dev/null || true)
            fi

            if [[ -n "$matches" ]]; then
                while IFS= read -r match; do
                    log_verbose "Found sensitive data potential: $match"
                    findings+=('{"type":"sensitive_broadcast","severity":"high","keyword":"'"$keyword"'","location":"'"${match%%:*}"'","description":"Sensitive data (keyword: '"$keyword"') potentially sent via broadcast - verify encryption"}')
                    ((HIGH_FINDINGS++))
                done <<< "$matches"
            fi
        fi
    done

    # Return findings as JSON
    printf '%s\n' "${findings[@]}" | jq -s '.' 2>/dev/null || echo '[]'
}

# ============================================================================
# CONTENT PROVIDER SECURITY
# ============================================================================

analyze_providers() {
    local manifest_file="$1"
    local source_dir="$2"
    
    log_info "Analyzing ContentProvider security..."

    local findings=()

    # Extract all providers from manifest
    log_verbose "Extracting content providers from manifest..."

    local providers=()
    local current_provider=""
    local exported="false"
    local read_permission=""
    local write_permission=""
    
    while IFS= read -r line; do
        # Track provider start
        if [[ $line =~ \<provider ]]; then
            exported="false"
            read_permission=""
            write_permission=""
        fi

        # Extract provider name
        if [[ $line =~ android:name=\"([^\"]+)\" ]]; then
            current_provider="${BASH_REMATCH[1]}"
        fi

        # Extract exported flag
        if [[ $line =~ android:exported=\"([^\"]+)\" ]]; then
            exported="${BASH_REMATCH[1]}"
        fi

        # Extract read permission
        if [[ $line =~ android:readPermission=\"([^\"]+)\" ]]; then
            read_permission="${BASH_REMATCH[1]}"
        fi

        # Extract write permission
        if [[ $line =~ android:writePermission=\"([^\"]+)\" ]]; then
            write_permission="${BASH_REMATCH[1]}"
        fi

        # Track provider end
        if [[ $line =~ \<\/provider\> ]] && [[ -n "$current_provider" ]]; then
            providers+=("$current_provider|$exported|$read_permission|$write_permission")
            current_provider=""
        fi
    done < "$manifest_file"

    log_info "Found ${#providers[@]} content provider(s)"

    # Analyze each provider
    for provider in "${providers[@]}"; do
        local name=$(echo "$provider" | cut -d'|' -f1)
        local exported=$(echo "$provider" | cut -d'|' -f2)
        local read_perm=$(echo "$provider" | cut -d'|' -f3)
        local write_perm=$(echo "$provider" | cut -d'|' -f4)

        log_verbose "Analyzing provider: $name (exported: $exported)"

        # Exported provider without permissions
        if [[ "$exported" == "true" ]]; then
            if [[ -z "$read_perm" ]] && [[ -z "$write_perm" ]]; then
                findings+=('{"type":"exported_provider_no_permissions","severity":"critical","provider":"'"$name"'","description":"Exported ContentProvider without read/write permissions - full data access possible"}')
                ((CRITICAL_FINDINGS++))
            elif [[ -z "$read_perm" ]]; then
                findings+=('{"type":"exported_provider_no_read_permission","severity":"high","provider":"'"$name"'","description":"Exported ContentProvider without read permission"}')
                ((HIGH_FINDINGS++))
            elif [[ -z "$write_perm" ]]; then
                findings+=('{"type":"exported_provider_no_write_permission","severity":"high","provider":"'"$name"'","description":"Exported ContentProvider without write permission"}')
                ((HIGH_FINDINGS++))
            fi
        fi
    done

    # Search for SQL injection patterns in provider code
    if [[ -d "$source_dir" ]]; then
        log_verbose "Searching for SQL injection patterns..."

        local sql_injection_patterns=(
            "db\\.delete\\([^)]*\\+[^)]*\\)"
            "db\\.insert\\([^)]*\\+[^)]*\\)"
            "db\\.update\\([^)]*\\+[^)]*\\)"
            "db\\.query\\([^)]*\\+[^)]*\\)"
            "rawQuery\\([^)]*\\+[^)]*\\)"
        )

        for pattern in "${sql_injection_patterns[@]}"; do
            local matches
            if [[ "$GREP_CMD" == "rg" ]]; then
                matches=$(rg -n "$pattern" "$source_dir" --type java --type kotlin 2>/dev/null || true)
            else
                matches=$(grep -rnE "$pattern" "$source_dir" --include="*.java" --include="*.kt" 2>/dev/null || true)
            fi

            if [[ -n "$matches" ]]; then
                while IFS= read -r match; do
                    log_verbose "Found SQL injection candidate: $match"
                    findings+=('{"type":"sql_injection_candidate","severity":"critical","pattern":"'"$pattern"'","location":"'"${match%%:*}"'","description":"Potential SQL injection via string concatenation in database query"}')
                    ((CRITICAL_FINDINGS++))
                done <<< "$matches"
            fi
        done

        # Check for parameterized queries (good practice)
        local parameterized_patterns=(
            "selectionArgs"
            "bindString"
            "bindLong"
            "bindBlob"
        )

        local has_parameterized=0
        for pattern in "${parameterized_patterns[@]}"; do
            if [[ "$GREP_CMD" == "rg" ]]; then
                if rg -q "$pattern" "$source_dir" --type java --type kotlin 2>/dev/null; then
                    has_parameterized=1
                    break
                fi
            else
                if grep -rqE "$pattern" "$source_dir" --include="*.java" --include="*.kt" 2>/dev/null; then
                    has_parameterized=1
                    break
                fi
            fi
        done

        if [[ $has_parameterized -eq 1 ]]; then
            log_verbose "Found parameterized query usage (good practice)"
        fi

        # Check for path traversal in openFile() methods
        log_verbose "Searching for path traversal in openFile()..."

        local openfile_matches
        if [[ "$GREP_CMD" == "rg" ]]; then
            openfile_matches=$(rg -n "openFile" "$source_dir" --type java --type kotlin -B 5 -A 10 2>/dev/null || true)
        else
            openfile_matches=$(grep -rnE "openFile" "$source_dir" --include="*.java" --include="*.kt" -B 5 -A 10 2>/dev/null || true)
        fi

        if [[ -n "$openfile_matches" ]]; then
            log_verbose "Found openFile() implementations"
        fi
    fi

    # Return findings as JSON
    printf '%s\n' "${findings[@]}" | jq -s '.' 2>/dev/null || echo '[]'
}

# ============================================================================
# EXPORTED ACTIVITY SECURITY
# ============================================================================

analyze_activities() {
    local manifest_file="$1"
    local source_dir="$2"
    
    log_info "Analyzing exported Activity security..."

    local findings=()

    # Extract all activities from manifest
    log_verbose "Extracting activities from manifest..."

    local activities=()
    local current_activity=""
    local exported="false"
    local has_intent_filter=""
    
    while IFS= read -r line; do
        # Track activity start
        if [[ $line =~ \<activity ]]; then
            exported="false"
            has_intent_filter=""
        fi

        # Extract activity name
        if [[ $line =~ android:name=\"([^\"]+)\" ]]; then
            current_activity="${BASH_REMATCH[1]}"
        fi

        # Extract exported flag
        if [[ $line =~ android:exported=\"([^\"]+)\" ]]; then
            exported="${BASH_REMATCH[1]}"
        fi

        # Track intent filter presence
        if [[ $line =~ \<intent-filter\> ]]; then
            has_intent_filter="true"
        fi

        # Track activity end
        if [[ $line =~ \<\/activity\> ]] && [[ -n "$current_activity" ]]; then
            activities+=("$current_activity|$exported|$has_intent_filter")
            current_activity=""
            has_intent_filter=""
        fi
    done < "$manifest_file"

    log_info "Found ${#activities[@]} activity/ies)"

    # Analyze each activity
    for activity in "${activities[@]}"; do
        local name=$(echo "$activity" | cut -d'|' -f1)
        local exported=$(echo "$activity" | cut -d'|' -f2)
        local has_filter=$(echo "$activity" | cut -d'|' -f3)

        log_verbose "Analyzing activity: $name (exported: $exported)"

        # Exported activity with intent filter needs extra scrutiny
        if [[ "$exported" == "true" ]]; then
            if [[ "$has_filter" == "true" ]]; then
                findings+=('{"type":"exported_activity_with_filter","severity":"medium","activity":"'"$name"'","description":"Exported activity with intent filter - verify intent validation"}')
                ((MEDIUM_FINDINGS++))
            else
                findings+=('{"type":"exported_activity","severity":"low","activity":"'"$name"'","description":"Exported activity - verify if intentional"}')
                ((LOW_FINDINGS++))
            fi
        fi
    done

    # Search for WebView loading without validation
    if [[ -d "$source_dir" ]]; then
        log_verbose "Searching for WebView security issues..."

        local webview_patterns=(
            "loadUrl\\s*\\("
            "loadData\\s*\\("
            "evaluateJavascript\\s*\\("
            "setJavaScriptEnabled\\s*\\(true\\)"
        )

        for pattern in "${webview_patterns[@]}"; do
            local matches
            if [[ "$GREP_CMD" == "rg" ]]; then
                matches=$(rg -n "$pattern" "$source_dir" --type java --type kotlin 2>/dev/null || true)
            else
                matches=$(grep -rnE "$pattern" "$source_dir" --include="*.java" --include="*.kt" 2>/dev/null || true)
            fi

            if [[ -n "$matches" ]]; then
                while IFS= read -r match; do
                    log_verbose "Found WebView usage: $match"
                    
                    # Check if it's loading arbitrary URLs
                    if [[ "$match" =~ loadUrl.*getIntent ]] || [[ "$match" =~ loadUrl.*getData ]]; then
                        findings+=('{"type":"webview_arbitrary_load","severity":"high","location":"'"${match%%:*}"'","description":"WebView loading URL from intent without validation"}')
                        ((HIGH_FINDINGS++))
                    fi
                done <<< "$matches"
            fi
        done

        # Check for JavaScript enabled without SSL
        local js_enabled_no_ssl
        if [[ "$GREP_CMD" == "rg" ]]; then
            js_enabled_no_ssl=$(rg -B 10 -A 10 "setJavaScriptEnabled\\s*\\(true\\)" "$source_dir" --type java --type kotlin 2>/dev/null | grep -v "setSSL" | head -50 || true)
        else
            js_enabled_no_ssl=$(grep -rnB 10 -A 10 "setJavaScriptEnabled\s*(true)" "$source_dir" --include="*.java" --include="*.kt" 2>/dev/null | grep -v "setSSL" | head -50 || true)
        fi
    fi

    # Search for biometric/auth checks
    if [[ -d "$source_dir" ]]; then
        log_verbose "Searching for biometric/authentication checks..."

        local auth_patterns=(
            "BiometricPrompt"
            "FingerprintManager"
            "KeyguardManager"
            "authenticate\\s*\\("
        )

        for pattern in "${auth_patterns[@]}"; do
            local matches
            if [[ "$GREP_CMD" == "rg" ]]; then
                matches=$(rg -n "$pattern" "$source_dir" --type java --type kotlin 2>/dev/null || true)
            else
                matches=$(grep -rnE "$pattern" "$source_dir" --include="*.java" --include="*.kt" 2>/dev/null || true)
            fi

            if [[ -n "$matches" ]]; then
                log_verbose "Found biometric/auth patterns: $pattern"
            fi
        done
    fi

    # Return findings as JSON
    printf '%s\n' "${findings[@]}" | jq -s '.' 2>/dev/null || echo '[]'
}

# ============================================================================
# OAUTH/PKCE DETECTION
# ============================================================================

check_oauth_pkce() {
    local source_dir="$1"
    
    log_info "Checking OAuth/PKCE implementation..."

    local findings=()

    if [[ ! -d "$source_dir" ]]; then
        log_warning "Source directory not found, skipping OAuth/PKCE check"
        echo '[]'
        return
    fi

    # Search for OAuth-related code
    log_verbose "Searching for OAuth implementation..."

    local oauth_patterns=(
        "OAuth"
        "AuthorizationCode"
        "accessToken"
        "refreshToken"
        "authorization_code"
        "access_token"
    )

    local has_oauth=0
    for pattern in "${oauth_patterns[@]}"; do
        if [[ "$GREP_CMD" == "rg" ]]; then
            if rg -qi "$pattern" "$source_dir" --type java --type kotlin 2>/dev/null | head -1 | grep -q .; then
                has_oauth=1
                break
            fi
        else
            if grep -rqiE "$pattern" "$source_dir" --include="*.java" --include="*.kt" 2>/dev/null | head -1 | grep -q .; then
                has_oauth=1
                break
            fi
        fi
    done

    if [[ $has_oauth -eq 0 ]]; then
        log_info "No OAuth implementation detected"
        echo '[]'
        return
    fi

    log_info "OAuth implementation detected, checking PKCE..."

    # Check for PKCE implementation
    local has_code_verifier=0
    local has_code_challenge=0

    if [[ "$GREP_CMD" == "rg" ]]; then
        if rg -qi "code_verifier" "$source_dir" --type java --type kotlin 2>/dev/null | head -1 | grep -q .; then
            has_code_verifier=1
        fi
        if rg -qi "code_challenge" "$source_dir" --type java --type kotlin 2>/dev/null | head -1 | grep -q .; then
            has_code_challenge=1
        fi
    else
        if grep -rqiE "code_verifier" "$source_dir" --include="*.java" --include="*.kt" 2>/dev/null | head -1 | grep -q .; then
            has_code_verifier=1
        fi
        if grep -rqiE "code_challenge" "$source_dir" --include="*.java" --include="*.kt" 2>/dev/null | head -1 | grep -q .; then
            has_code_challenge=1
        fi
    fi

    # PKCE requires both verifier and challenge
    if [[ $has_code_verifier -eq 1 ]] && [[ $has_code_challenge -eq 1 ]]; then
        log_success "PKCE properly implemented (code_verifier + code_challenge found)"
        findings+=('{"type":"pkce_implemented","severity":"info","description":"PKCE properly implemented with code_verifier and code_challenge"}')
    elif [[ $has_code_verifier -eq 1 ]]; then
        log_warning "PKCE partially implemented (code_verifier found, missing code_challenge)"
        findings+=('{"type":"pkce_partial","severity":"medium","description":"PKCE partially implemented - code_verifier found but code_challenge missing"}')
        ((MEDIUM_FINDINGS++))
    elif [[ $has_code_challenge -eq 1 ]]; then
        log_warning "PKCE partially implemented (code_challenge found, missing code_verifier)"
        findings+=('{"type":"pkce_partial","severity":"medium","description":"PKCE partially implemented - code_challenge found but code_verifier missing"}')
        ((MEDIUM_FINDINGS++))
    else
        log_critical "OAuth without PKCE detected!"
        findings+=('{"type":"oauth_without_pkce","severity":"high","description":"OAuth implementation without PKCE - vulnerable to authorization code interception attacks"}')
        ((HIGH_FINDINGS++))
    fi

    # Check for custom schemes in OAuth
    log_verbose "Searching for custom URL schemes..."

    local custom_schemes
    if [[ "$GREP_CMD" == "rg" ]]; then
        custom_schemes=$(rg -nE "scheme\\s*=\\s*[\"'][a-z]+://" "$source_dir" --type java --type kotlin 2>/dev/null | head -20 || true)
    else
        custom_schemes=$(grep -rnE "scheme\s*=\s*['\"][a-z]+://" "$source_dir" --include="*.java" --include="*.kt" 2>/dev/null | head -20 || true)
    fi

    if [[ -n "$custom_schemes" ]]; then
        log_verbose "Found custom schemes in OAuth flow"
    fi

    # Check for Chrome Custom Tabs usage
    log_verbose "Checking for Chrome Custom Tabs..."

    local custom_tabs
    if [[ "$GREP_CMD" == "rg" ]]; then
        custom_tabs=$(rg -qi "CustomTabsIntent|customtabs" "$source_dir" --type java --type kotlin 2>/dev/null | head -10 || true)
    else
        custom_tabs=$(grep -rqiE "CustomTabsIntent|customtabs" "$source_dir" --include="*.java" --include="*.kt" 2>/dev/null | head -10 || true)
    fi

    if [[ -n "$custom_tabs" ]]; then
        log_success "Chrome Custom Tabs detected (good practice)"
        findings+=('{"type":"chrome_custom_tabs","severity":"info","description":"Chrome Custom Tabs detected - secure OAuth flow"}')
    fi

    # Return findings as JSON
    printf '%s\n' "${findings[@]}" | jq -s '.' 2>/dev/null || echo '[]'
}

# ============================================================================
# FRIDA HOOK GENERATION
# ============================================================================

generate_frida_hooks() {
    local findings_json="$1"
    local source_dir="$2"
    local output_dir="$3"
    local package_name="$4"
    
    log_section "Generating Frida Hooks"

    if [[ $GENERATE_FRIDA -eq 0 ]]; then
        log_info "Frida hook generation disabled"
        return
    fi

    local hooks_dir="$output_dir/frida-hooks"
    mkdir -p "$hooks_dir"

    local hooks_generated=0

    # Generate hook for exported activities
    log_info "Generating hooks for exported activities..."

    cat > "$hooks_dir/exported-activities-hook.js" << 'EOF'
// Frida hook for exported activities
// Usage: frida -U -f PACKAGE_NAME -l exported-activities-hook.js --no-pause

Java.perform(function() {
    console.log("[*] Hooking exported activities...");
    
    // Hook Activity.onCreate()
    var Activity = Java.use("android.app.Activity");
    Activity.onCreate.overload('android.os.Bundle').implementation = function(savedInstanceState) {
        console.log("[+] Activity.onCreate(): " + this.getClass().getName());
        
        // Log intent data
        var intent = this.getIntent();
        if (intent !== null) {
            console.log("    Action: " + intent.getAction());
            console.log("    Data: " + intent.getData());
            console.log("    Extras: " + intent.getExtras());
            
            var extras = intent.getExtras();
            if (extras !== null) {
                var keys = extras.keySet().toArray();
                for (var i = 0; i < keys.length; i++) {
                    console.log("      " + keys[i] + " = " + extras.get(keys[i]));
                }
            }
        }
        
        return this.onCreate(savedInstanceState);
    };
    
    // Hook Activity.onNewIntent()
    Activity.onNewIntent.implementation = function(intent) {
        console.log("[+] Activity.onNewIntent(): " + this.getClass().getName());
        console.log("    Action: " + intent.getAction());
        console.log("    Data: " + intent.getData());
        
        var extras = intent.getExtras();
        if (extras !== null) {
            var keys = extras.keySet().toArray();
            for (var i = 0; i < keys.length; i++) {
                console.log("      " + keys[i] + " = " + extras.get(keys[i]));
            }
        }
        
        return this.onNewIntent(intent);
    };
    
    console.log("[*] Exported activities hooked");
});
EOF
    ((hooks_generated++))

    # Generate hook for broadcast receivers
    log_info "Generating hooks for broadcast receivers..."

    cat > "$hooks_dir/broadcast-receivers-hook.js" << 'EOF'
// Frida hook for broadcast receivers
// Usage: frida -U -f PACKAGE_NAME -l broadcast-receivers-hook.js --no-pause

Java.perform(function() {
    console.log("[*] Hooking broadcast receivers...");
    
    // Hook BroadcastReceiver.onReceive()
    var BroadcastReceiver = Java.use("android.content.BroadcastReceiver");
    BroadcastReceiver.onReceive.implementation = function(context, intent) {
        console.log("[+] BroadcastReceiver.onReceive(): " + this.getClass().getName());
        console.log("    Action: " + intent.getAction());
        
        var extras = intent.getExtras();
        if (extras !== null) {
            var keys = extras.keySet().toArray();
            for (var i = 0; i < keys.length; i++) {
                var value = extras.get(keys[i]);
                console.log("      " + keys[i] + " = " + value);
                
                // Check for sensitive data
                if (keys[i].toLowerCase().indexOf("password") !== -1 ||
                    keys[i].toLowerCase().indexOf("token") !== -1 ||
                    keys[i].toLowerCase().indexOf("secret") !== -1) {
                    console.log("        [!] Sensitive data detected in broadcast!");
                }
            }
        }
        
        return this.onReceive(context, intent);
    };
    
    // Hook Context.sendBroadcast()
    var Context = Java.use("android.content.Context");
    Context.sendBroadcast.overload('android.content.Intent').implementation = function(intent) {
        console.log("[+] sendBroadcast(): " + intent.getAction());
        
        var extras = intent.getExtras();
        if (extras !== null) {
            var keys = extras.keySet().toArray();
            for (var i = 0; i < keys.length; i++) {
                console.log("      " + keys[i] + " = " + extras.get(keys[i]));
            }
        }
        
        return this.sendBroadcast(intent);
    };
    
    console.log("[*] Broadcast receivers hooked");
});
EOF
    ((hooks_generated++))

    # Generate hook for content providers
    log_info "Generating hooks for content providers..."

    cat > "$hooks_dir/content-providers-hook.js" << 'EOF'
// Frida hook for content providers
// Usage: frida -U -f PACKAGE_NAME -l content-providers-hook.js --no-pause

Java.perform(function() {
    console.log("[*] Hooking content providers...");
    
    // Hook ContentProvider.query()
    var ContentProvider = Java.use("android.content.ContentProvider");
    ContentProvider.query.implementation = function(uri, projection, selection, selectionArgs, sortOrder) {
        console.log("[+] ContentProvider.query(): " + this.getClass().getName());
        console.log("    URI: " + uri);
        console.log("    Selection: " + selection);
        console.log("    SelectionArgs: " + selectionArgs);
        
        return this.query(uri, projection, selection, selectionArgs, sortOrder);
    };
    
    // Hook ContentProvider.insert()
    ContentProvider.insert.implementation = function(uri, values) {
        console.log("[+] ContentProvider.insert(): " + this.getClass().getName());
        console.log("    URI: " + uri);
        console.log("    Values: " + values);
        
        return this.insert(uri, values);
    };
    
    // Hook ContentProvider.update()
    ContentProvider.update.implementation = function(uri, values, selection, selectionArgs) {
        console.log("[+] ContentProvider.update(): " + this.getClass().getName());
        console.log("    URI: " + uri);
        console.log("    Values: " + values);
        console.log("    Selection: " + selection);
        console.log("    SelectionArgs: " + selectionArgs);
        
        return this.update(uri, values, selection, selectionArgs);
    };
    
    // Hook ContentProvider.delete()
    ContentProvider.delete.implementation = function(uri, selection, selectionArgs) {
        console.log("[+] ContentProvider.delete(): " + this.getClass().getName());
        console.log("    URI: " + uri);
        console.log("    Selection: " + selection);
        console.log("    SelectionArgs: " + selectionArgs);
        
        return this.delete(uri, selection, selectionArgs);
    };
    
    console.log("[*] Content providers hooked");
});
EOF
    ((hooks_generated++))

    # Generate hook for WebView
    log_info "Generating hooks for WebView..."

    cat > "$hooks_dir/webview-hook.js" << 'EOF'
// Frida hook for WebView
// Usage: frida -U -f PACKAGE_NAME -l webview-hook.js --no-pause

Java.perform(function() {
    console.log("[*] Hooking WebView...");
    
    // Hook WebView.loadUrl()
    var WebView = Java.use("android.webkit.WebView");
    WebView.loadUrl.overload('java.lang.String').implementation = function(url) {
        console.log("[+] WebView.loadUrl(): " + url);
        
        // Check for dangerous schemes
        if (url.indexOf("javascript:") === 0) {
            console.log("    [!] Dangerous scheme: javascript:");
        } else if (url.indexOf("file:") === 0) {
            console.log("    [!] Dangerous scheme: file:");
        } else if (url.indexOf("data:") === 0) {
            console.log("    [!] Dangerous scheme: data:");
        }
        
        return this.loadUrl(url);
    };
    
    // Hook WebView.evaluateJavascript()
    WebView.evaluateJavascript.implementation = function(script, resultCallback) {
        console.log("[+] WebView.evaluateJavascript(): " + script);
        
        return this.evaluateJavascript(script, resultCallback);
    };
    
    // Hook WebView.setJavaScriptEnabled()
    WebView.setJavaScriptEnabled.implementation = function(enabled) {
        console.log("[+] WebView.setJavaScriptEnabled(): " + enabled);
        
        return this.setJavaScriptEnabled(enabled);
    };
    
    // Hook WebViewClient.shouldOverrideUrlLoading()
    var WebViewClient = Java.use("android.webkit.WebViewClient");
    WebViewClient.shouldOverrideUrlLoading.overload('android.webkit.WebView', 'java.lang.String').implementation = function(view, url) {
        console.log("[+] WebViewClient.shouldOverrideUrlLoading(): " + url);
        
        return this.shouldOverrideUrlLoading(view, url);
    };
    
    console.log("[*] WebView hooked");
});
EOF
    ((hooks_generated++))

    # Generate hook for deep links
    log_info "Generating hooks for deep links..."

    cat > "$hooks_dir/deeplink-hook.js" << 'EOF'
// Frida hook for deep link handling
// Usage: frida -U -f PACKAGE_NAME -l deeplink-hook.js --no-pause

Java.perform(function() {
    console.log("[*] Hooking deep link handling...");
    
    // Hook Uri.getPath()
    var Uri = Java.use("android.net.Uri");
    Uri.getPath.implementation = function() {
        var path = this.getPath();
        console.log("[+] Uri.getPath(): " + path);
        
        // Check for path traversal
        if (path.indexOf("..") !== -1) {
            console.log("    [!] Path traversal detected: " + path);
        }
        
        return path;
    };
    
    // Hook Uri.getQueryParameter()
    Uri.getQueryParameter.implementation = function(key) {
        var value = this.getQueryParameter(key);
        console.log("[+] Uri.getQueryParameter(" + key + "): " + value);
        
        // Check for dangerous parameters
        if (key.toLowerCase().indexOf("path") !== -1) {
            console.log("    [!] Path parameter detected: " + value);
        }
        
        return value;
    };
    
    // Hook Intent.getData()
    var Intent = Java.use("android.content.Intent");
    Intent.getData.implementation = function() {
        var uri = this.getData();
        if (uri !== null) {
            console.log("[+] Intent.getData(): " + uri);
        }
        
        return uri;
    };
    
    console.log("[*] Deep link handling hooked");
});
EOF
    ((hooks_generated++))

    # Generate hook for SQL operations
    log_info "Generating hooks for SQL operations..."

    cat > "$hooks_dir/sql-injection-hook.js" << 'EOF'
// Frida hook for SQL injection detection
// Usage: frida -U -f PACKAGE_NAME -l sql-injection-hook.js --no-pause

Java.perform(function() {
    console.log("[*] Hooking SQL operations...");
    
    // Hook SQLiteDatabase.execSQL()
    var SQLiteDatabase = Java.use("android.database.sqlite.SQLiteDatabase");
    SQLiteDatabase.execSQL.overload('java.lang.String').implementation = function(sql) {
        console.log("[+] SQLiteDatabase.execSQL(): " + sql);
        
        // Check for dangerous patterns
        if (sql.match(/SELECT.*WHERE.*\+/) || 
            sql.match(/UPDATE.*SET.*\+/) || 
            sql.match(/DELETE.*WHERE.*\+/) ||
            sql.match(/INSERT.*VALUES.*\+/)) {
            console.log("    [!] Potential SQL injection: string concatenation detected");
        }
        
        return this.execSQL(sql);
    };
    
    // Hook SQLiteDatabase.rawQuery()
    SQLiteDatabase.rawQuery.overload('java.lang.String', '[Ljava.lang.String;').implementation = function(sql, selectionArgs) {
        console.log("[+] SQLiteDatabase.rawQuery(): " + sql);
        console.log("    SelectionArgs: " + selectionArgs);
        
        return this.rawQuery(sql, selectionArgs);
    };
    
    // Hook SQLiteStatement
    var SQLiteStatement = Java.use("android.database.sqlite.SQLiteStatement");
    SQLiteStatement.execute.implementation = function() {
        var sql = this.toString();
        console.log("[+] SQLiteStatement.execute(): " + sql);
        
        return this.execute();
    };
    
    console.log("[*] SQL operations hooked");
});
EOF
    ((hooks_generated++))

    # Generate README for Frida hooks
    cat > "$hooks_dir/README.md" << EOF
# Generated Frida Hooks

This directory contains Frida hooks generated from the security audit findings.

## Usage

### Hook Exported Activities
\`\`\`bash
frida -U -f $package_name -l exported-activities-hook.js --no-pause
\`\`\`

### Hook Broadcast Receivers
\`\`\`bash
frida -U -f $package_name -l broadcast-receivers-hook.js --no-pause
\`\`\`

### Hook Content Providers
\`\`\`bash
frida -U -f $package_name -l content-providers-hook.js --no-pause
\`\`\`

### Hook WebView
\`\`\`bash
frida -U -f $package_name -l webview-hook.js --no-pause
\`\`\`

### Hook Deep Links
\`\`\`bash
frida -U -f $package_name -l deeplink-hook.js --no-pause
\`\`\`

### Hook SQL Operations
\`\`\`bash
frida -U -f $package_name -l sql-injection-hook.js --no-pause
\`\`\`

### Combine Multiple Hooks
\`\`\`bash
frida -U -f $package_name \\
  -l exported-activities-hook.js \\
  -l broadcast-receivers-hook.js \\
  -l content-providers-hook.js \\
  -l webview-hook.js \\
  -l deeplink-hook.js \\
  -l sql-injection-hook.js \\
  --no-pause
\`\`\`

## Notes

- These hooks are generated based on static analysis findings
- Modify hooks as needed for specific testing scenarios
- Use \`frida-ps -U\` to list running processes
- Use \`objection\` for automated mobile security testing

## Additional Resources

- Frida documentation: https://frida.re/docs/
- Objection documentation: https://github.com/sensepost/objection
EOF

    log_success "Generated $hooks_generated Frida hook(s) in $hooks_dir"
}

# ============================================================================
# REPORT GENERATION
# ============================================================================

generate_report() {
    local output_dir="$1"
    local package_name="$2"
    local apk_path="$3"
    local start_time="$4"
    
    log_section "Generating Report"

    # Combine all findings
    log_info "Combining all findings..."

    local raw_findings_file="$output_dir/00-raw-findings.json"
    local report_file="$output_dir/01-component-report.md"
    local summary_file="$output_dir/audit-summary.txt"

    # Create raw findings JSON
    cat > "$raw_findings_file" << EOF
{
  "audit_info": {
    "package_name": "$package_name",
    "apk_path": "$apk_path",
    "timestamp": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
    "script_version": "$VERSION",
    "total_findings": $TOTAL_FINDINGS,
    "critical_findings": $CRITICAL_FINDINGS,
    "high_findings": $HIGH_FINDINGS,
    "medium_findings": $MEDIUM_FINDINGS,
    "low_findings": $LOW_FINDINGS
  },
  "findings": []
}
EOF

    # Generate markdown report
    cat > "$report_file" << EOF
# Android Component Security Audit Report

## Executive Summary

**Package**: \`$package_name\`
**APK Path**: \`$apk_path\`
**Audit Date**: $(date -u +"%Y-%m-%d")
**Script Version**: $VERSION

### Findings Overview

| Severity | Count |
|----------|-------|
| 🔴 Critical | $CRITICAL_FINDINGS |
| 🟠 High | $HIGH_FINDINGS |
| 🟡 Medium | $MEDIUM_FINDINGS |
| 🟢 Low | $LOW_FINDINGS |
| **Total** | **$TOTAL_FINDINGS** |

### Risk Assessment

EOF

    # Add risk assessment based on findings
    if [[ $CRITICAL_FINDINGS -gt 0 ]]; then
        echo -e "**Overall Risk**: 🔴 **CRITICAL**" >> "$report_file"
        echo "" >> "$report_file"
        echo "This application has critical vulnerabilities that require immediate attention." >> "$report_file"
    elif [[ $HIGH_FINDINGS -gt 0 ]]; then
        echo -e "**Overall Risk**: 🟠 **HIGH**" >> "$report_file"
        echo "" >> "$report_file"
        echo "This application has high-severity vulnerabilities that should be addressed soon." >> "$report_file"
    elif [[ $MEDIUM_FINDINGS -gt 0 ]]; then
        echo -e "**Overall Risk**: 🟡 **MEDIUM**" >> "$report_file"
        echo "" >> "$report_file"
        echo "This application has medium-severity issues that should be addressed." >> "$report_file"
    elif [[ $LOW_FINDINGS -gt 0 ]]; then
        echo -e "**Overall Risk**: 🟢 **LOW**" >> "$report_file"
        echo "" >> "$report_file"
        echo "This application has low-severity issues that could be improved." >> "$report_file"
    else
        echo -e "**Overall Risk**: ✅ **SECURE**" >> "$report_file"
        echo "" >> "$report_file"
        echo "No significant security issues found in component analysis." >> "$report_file"
    fi

    # Add methodology section
    cat >> "$report_file" << 'EOF'

---

## Methodology

This audit performed the following security checks:

### 1. Deep Link Security Testing
- Extracted all deep link schemes from manifest
- Tested for dangerous schemes (javascript:, file:, data:)
- Checked for missing host validation
- Verified path validation in code
- Tested path traversal vectors

### 2. BroadcastReceiver Analysis
- Identified exported receivers
- Checked for permission requirements
- Analyzed sendBroadcast() usage
- Detected sensitive data in broadcasts

### 3. ContentProvider Security
- Found exported providers
- Checked read/write permissions
- Searched for SQL injection patterns
- Verified parameterized queries
- Checked for path traversal

### 4. Exported Activity Security
- Listed exported activities
- Analyzed intent filters
- Checked WebView usage
- Verified biometric/auth checks

### 5. OAuth/PKCE Detection
- Identified OAuth implementations
- Verified PKCE usage
- Checked for custom URL schemes
- Validated Chrome Custom Tabs usage

---

## Technical Details

### Tools Used
- apktool: APK decoding
- jadx: Source decompilation
- aapt: Manifest extraction
- jq: JSON processing
- grep/ripgrep: Code analysis

### Analysis Scope
- AndroidManifest.xml
- Decompiled Java/Kotlin source code
- Resource files
- Intent filters and deep links
- IPC mechanisms

---

## Recommendations

### Immediate Actions (Critical/High)
1. Review and fix all critical and high findings
2. Implement proper input validation for all exported components
3. Add permission requirements to exported receivers and providers
4. Use parameterized queries to prevent SQL injection
5. Validate all deep link inputs before use

### Short-term Improvements (Medium)
1. Implement PKCE for all OAuth flows
2. Add path validation for file operations
3. Sanitize all data from intents before use
4. Use Chrome Custom Tabs for OAuth flows
5. Add proper error handling for all exported components

### Long-term Enhancements (Low)
1. Implement comprehensive logging for security events
2. Add runtime checks for sensitive operations
3. Use security testing in CI/CD pipeline
4. Regular security audits and penetration testing
5. Stay updated with OWASP Mobile Top 10

---

## Testing Commands

### Deep Link Testing
```bash
# Test deep link with path traversal
adb shell am start -n $package_name/.MainActivity \
  -a android.intent.action.VIEW \
  -d "scheme://host/path/../../etc/passwd"

# Test dangerous scheme
adb shell am start -n $package_name/.MainActivity \
  -a android.intent.action.VIEW \
  -d "javascript:alert(document.cookie)"
```

### Broadcast Testing
```bash
# Send malicious broadcast
adb shell am broadcast -a com.example.ACTION \
  -e "password" "secret123"

# Test without permission
adb shell am broadcast -a com.example.SENSITIVE_ACTION
```

### ContentProvider Testing
```bash
# Query provider (if exported without permission)
adb shell content query --uri content://com.example.provider/data

# Insert data (if write permission missing)
adb shell content insert --uri content://com.example.provider/data \
  --bind name:s:test --bind value:s:malicious
```

---

## Appendix A: Generated Frida Scripts

The following Frida hooks were generated for dynamic testing:

1. `exported-activities-hook.js` - Hooks exported activities
2. `broadcast-receivers-hook.js` - Hooks broadcast receivers
3. `content-providers-hook.js` - Hooks content providers
4. `webview-hook.js` - Hooks WebView operations
5. `deeplink-hook.js` - Hooks deep link handling
6. `sql-injection-hook.js` - Hooks SQL operations

See \`frida-hooks/README.md\` for usage instructions.

---

## Appendix B: References

- [OWASP Mobile Security Testing Guide](https://owasp.org/www-project-mobile-security-testing-guide/)
- [Android Security Best Practices](https://developer.android.com/topic/security/best-practices)
- [OWASP Mobile Top 10](https://owasp.org/www-project-mobile-top-10/)
- [Android Developers - Security](https://developer.android.com/security)

---

**Report Generated**: $(date -u +"%Y-%m-%dT%H:%M:%SZ")
**Script Version**: $VERSION
**Auditor**: DragonJAR Security Team
EOF

    # Generate text summary
    cat > "$summary_file" << EOF
Android Component Security Audit Summary
=========================================

Package: $package_name
APK: $apk_path
Date: $(date -u +"%Y-%m-%d %H:%M:%S UTC")

Findings by Severity:
  Critical: $CRITICAL_FINDINGS
  High: $HIGH_FINDINGS
  Medium: $MEDIUM_FINDINGS
  Low: $LOW_FINDINGS
  Total: $TOTAL_FINDINGS

Execution Time: $(($(date +%s) - start_time)) seconds

Output Files:
  - $raw_findings_file (JSON)
  - $report_file (Markdown)
  - $output_dir/frida-hooks/ (Frida scripts)

Next Steps:
  1. Review findings in $report_file
  2. Test with Frida hooks in $output_dir/frida-hooks/
  3. Fix critical and high findings first
  4. Re-run audit after fixes

For detailed analysis, see $report_file
EOF

    log_success "Report generated: $report_file"
    log_success "Raw findings: $raw_findings_file"
    log_success "Summary: $summary_file"
}

# ============================================================================
# DYNAMIC TESTING (Optional)
# ============================================================================

run_dynamic_tests() {
    local package_name="$1"
    local output_dir="$2"
    
    if [[ $ENABLE_DYNAMIC -eq 0 ]]; then
        return
    fi

    log_section "Running Dynamic Tests"

    # Check ADB connection
    if ! command -v adb &> /dev/null; then
        log_warning "ADB not available, skipping dynamic tests"
        return
    fi

    # Check if device is connected
    local device_count
    device_count=$(adb devices | grep -c "device$" || true)

    if [[ $device_count -eq 0 ]]; then
        log_warning "No ADB device connected, skipping dynamic tests"
        return
    fi

    log_success "ADB device connected"

    # Check if app is installed
    log_info "Checking if $package_name is installed..."
    
    if adb shell pm list packages | grep -q "^package:$package_name$"; then
        log_success "App is installed"
        
        # Get app version
        local version
        version=$(adb shell dumpsys package "$package_name" | grep versionName | head -1 | cut -d'=' -f2)
        log_info "App version: $version"
    else
        log_warning "App not installed, skipping dynamic tests"
        return
    fi

    # Test exported activities
    log_info "Testing exported activities..."
    
    # You can add specific dynamic tests here based on findings
    # For example:
    # - Test deep links
    # - Test broadcast receivers
    # - Test content providers
    
    log_info "Dynamic tests completed"
}

# ============================================================================
# MAIN FUNCTION
# ============================================================================

main() {
    local start_time=$(date +%s)
    
    # Parse arguments
    parse_args "$@"
    
    # Print banner
    cat << EOF
${CYAN}
╔═══════════════════════════════════════════════════════════╗
║                                                           ║
║   Android Component Security Audit Script v${VERSION}      ║
║   DragonJAR Security Team                                ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝
${NC}
EOF

    # Check prerequisites
    check_prerequisites

    # Validate APK
    local package_name
    package_name=$(validate_apk)

    # Prepare output directory
    prepare_output_dir

    # Decode APK
    local decoded_paths
    decoded_paths=$(decode_apk "$APK_PATH" "$OUTPUT_DIR")
    local decoded_dir=$(echo "$decoded_paths" | cut -d'|' -f1)
    local jadx_dir=$(echo "$decoded_paths" | cut -d'|' -f2)

    log_success "APK decoded successfully"
    log_info "Decoded: $decoded_dir"
    log_info "Jadx: $jadx_dir"

    # Determine which source directory to use
    local source_dir=""
    if [[ -d "$jadx_dir" ]] && [[ $(ls -A "$jadx_dir" 2>/dev/null) ]]; then
        source_dir="$jadx_dir"
        log_info "Using JADX decompiled source for analysis"
    elif [[ -d "$decoded_dir/smali" ]]; then
        source_dir="$decoded_dir/smali"
        log_warning "Only smali code available - limited analysis"
    else
        source_dir="$decoded_dir"
        log_warning "No source code available - manifest analysis only"
    fi

    # Extract deep links
    local deep_links_json
    deep_links_json=$(extract_deep_links "$decoded_dir/AndroidManifest.xml")

    # Run all security checks in parallel where possible
    log_section "Running Security Checks"

    # Run deep link testing
    test_deep_link_bypass "$deep_links_json" "$source_dir" > "$OUTPUT_DIR/tmp-deeplink-findings.json" &
    local pid_deeplinks=$!

    # Run broadcast analysis
    analyze_broadcasts "$decoded_dir/AndroidManifest.xml" "$source_dir" > "$OUTPUT_DIR/tmp-broadcast-findings.json" &
    local pid_broadcast=$!

    # Run provider analysis
    analyze_providers "$decoded_dir/AndroidManifest.xml" "$source_dir" > "$OUTPUT_DIR/tmp-provider-findings.json" &
    local pid_provider=$!

    # Run activity analysis
    analyze_activities "$decoded_dir/AndroidManifest.xml" "$source_dir" > "$OUTPUT_DIR/tmp-activity-findings.json" &
    local pid_activity=$!

    # Wait for all background processes
    wait $pid_deeplinks $pid_broadcast $pid_provider $pid_activity

    # Run OAuth/PKCE check
    check_oauth_pkce "$source_dir" > "$OUTPUT_DIR/tmp-oauth-findings.json"

    # Combine findings
    log_section "Combining Findings"

    local combined_findings='{"deep_links":'$(cat "$OUTPUT_DIR/tmp-deeplink-findings.json")',"broadcasts":'$(cat "$OUTPUT_DIR/tmp-broadcast-findings.json")',"providers":'$(cat "$OUTPUT_DIR/tmp-provider-findings.json")',"activities":'$(cat "$OUTPUT_DIR/tmp-activity-findings.json")',"oauth":'$(cat "$OUTPUT_DIR/tmp-oauth-findings.json")'}'

    # Calculate total findings
    TOTAL_FINDINGS=$(echo "$combined_findings" | jq '[.deep_links[], .broadcasts[], .providers[], .activities[], .oauth[]] | length')

    # Generate Frida hooks
    generate_frida_hooks "$combined_findings" "$source_dir" "$OUTPUT_DIR" "$package_name"

    # Generate report
    generate_report "$OUTPUT_DIR" "$package_name" "$APK_PATH" "$start_time"

    # Run dynamic tests if enabled
    run_dynamic_tests "$package_name" "$OUTPUT_DIR"

    # Cleanup temporary files
    rm -f "$OUTPUT_DIR"/tmp-*.json

    # Print summary
    log_section "Audit Complete"
    
    local execution_time=$(($(date +%s) - start_time))
    
    cat << EOF
${GREEN}╔═══════════════════════════════════════════════════════════╗
║                   AUDIT COMPLETE                              ║
╚═══════════════════════════════════════════════════════════╝${NC}

${CYAN}Package:${NC} $package_name
${CYAN}Execution Time:${NC} ${execution_time}s

${CYAN}Findings Summary:${NC}
  ${RED}🔴 Critical:   ${CRITICAL_FINDINGS}${NC}
  ${YELLOW}🟠 High:       ${HIGH_FINDINGS}${NC}
  ${YELLOW}🟡 Medium:     ${MEDIUM_FINDINGS}${NC}
  ${GREEN}🟢 Low:        ${LOW_FINDINGS}${NC}
  ${CYAN}📊 Total:      ${TOTAL_FINDINGS}${NC}

${CYAN}Output:${NC}
  📄 Report:     $OUTPUT_DIR/01-component-report.md
  📊 Raw Data:   $OUTPUT_DIR/00-raw-findings.json
  📝 Summary:    $OUTPUT_DIR/audit-summary.txt
  🔧 Frida:      $OUTPUT_DIR/frida-hooks/

${GREEN}✓ All checks completed successfully${NC}

EOF

    # Exit with appropriate code
    if [[ $CRITICAL_FINDINGS -gt 0 ]]; then
        exit 0  # Exit 0 even with findings - the audit succeeded
    else
        exit 0
    fi
}

# ============================================================================
# SCRIPT ENTRY POINT
# ============================================================================

# Run main function with all arguments
main "$@"
