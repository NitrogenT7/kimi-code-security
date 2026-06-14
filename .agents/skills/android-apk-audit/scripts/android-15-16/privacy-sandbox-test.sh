#!/bin/bash
#
# privacy-sandbox-test.sh
# Privacy Sandbox for Android - Security Testing Script
#
# Tests:
# - Privacy Sandbox package enumeration
# - SDK attribution and scoring
# - Privacy Sandbox API surface analysis
# - Cross-SDK data flow detection
# - Ads SDK privacy compliance
#
# Usage:
#   ./privacy-sandbox-test.sh com.target.package
#   ./privacy-sandbox-test.sh -f <package_list.txt>
#   ./privacy-sandbox-test.sh -a  # Full system enumeration
#

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUTPUT_DIR="${SCRIPT_DIR}/../output/privacy-sandbox-$(date +%Y%m%d-%H%M%S)"
REPORT_FILE="${OUTPUT_DIR}/report.md"
JSON_REPORT="${OUTPUT_DIR}/report.json"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Target package (optional argument)
TARGET_PACKAGE=""
ENUMERATE_ALL=false
VERBOSE=false
JSON_OUTPUT=false

# ============================================
# HELPER FUNCTIONS
# ============================================

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

print_banner() {
    echo ""
    echo "╔════════════════════════════════════════════════════════════╗"
    echo "║     Privacy Sandbox for Android - Security Testing        ║"
    echo "║     Android 14+ (API 35/36) Privacy Sandbox Testing       ║"
    echo "╚════════════════════════════════════════════════════════════╝"
    echo ""
}

usage() {
    cat << EOF
Usage: $(basename "$0") [OPTIONS] [PACKAGE]

OPTIONS:
    -h, --help              Show this help message
    -a, --all               Enumerate all Privacy Sandbox packages (system-wide)
    -f, --file FILE         Read packages from FILE (one per line)
    -o, --output DIR        Output directory (default: ./output)
    -j, --json              Output JSON report
    -v, --verbose           Verbose output
    -d, --device DEVICE     Target device (adb device ID)

EXAMPLES:
    $(basename "$0") com.target.app
    $(basename "$0") -a
    $(basename "$0") -f packages.txt -o ./results
    $(basename "$0") -a -v -j -o ./reports

EOF
}

# ============================================
# ANDROID UTILITY FUNCTIONS
# ============================================

check_adb() {
    if ! command -v adb &> /dev/null; then
        log_error "adb not found. Please install Android SDK platform tools."
        exit 1
    fi
    
    if ! adb get-state &> /dev/null 2>&1; then
        log_error "No Android device connected via ADB."
        exit 1
    fi
    
    log_success "ADB connection verified"
}

check_frida() {
    if ! command -v frida &> /dev/null; then
        log_warning "Frida not installed. Some tests will be skipped."
        FRIDA_AVAILABLE=false
    else
        FRIDA_AVAILABLE=true
    fi
}

get_android_version() {
    ANDROID_VERSION=$(adb shell getprop ro.build.version.release | tr -d '\r\n')
    API_LEVEL=$(adb shell getprop ro.build.version.sdk | tr -d '\r\n')
    log_info "Android Version: ${ANDROID_VERSION} (API ${API_LEVEL})"
}

is_privacy_sandbox_enabled() {
    local enabled=$(adb shell settings get global privacy_sandbox_enabled 2>/dev/null || echo "unknown")
    echo "$enabled"
}

# ============================================
# PRIVACY SANDBOX ENUMERATION
# ============================================

enumerate_privacy_sandbox_packages() {
    log_info "Enumerating Privacy Sandbox packages..."
    
    local output=$(adb shell pm list packages --user 0 2>/dev/null | grep -iE "(sandbox|ps|sdk_attestation|ads)" || true)
    
    echo "$output"
}

get_privacy_sandbox_packages() {
    log_info "Getting Privacy Sandbox registered packages..."
    
    local packages=$(adb shell pm list packages --user 0 2>/dev/null | grep -v "system" | tr -d '\r' || true)
    
    local sandbox_packages=()
    
    while IFS= read -r line; do
        local pkg=$(echo "$line" | sed 's/package://' | tr -d '\r\n')
        if [ -n "$pkg" ]; then
            sandbox_packages+=("$pkg")
        fi
    done <<< "$packages"
    
    printf '%s\n' "${sandbox_packages[@]}"
}

get_package_attestation() {
    local package="$1"
    
    log_info "Getting attestation for package: $package"
    
    local attestation=$(adb shell dumpsys package "$package" 2>/dev/null | grep -A 20 -i "privacySandbox" || true)
    
    echo "$attestation"
}

get_sdk_runtime_permissions() {
    local package="$1"
    
    log_info "Checking SDK Runtime permissions for: $package"
    
    local perms=$(adb shell dumpsys package "$package" 2>/dev/null | grep -E "(INTERNET|READ_PHONE_STATE|ACCESS_FINE_LOCATION|READ_CONTACTS)" | head -10 || true)
    
    echo "$perms"
}

analyze_sdk_packages() {
    local target="$1"
    local output_file="$2"
    
    {
        echo "# SDK Package Analysis"
        echo ""
        echo "Target: $target"
        echo "Date: $(date)"
        echo ""
        
        echo "## Privacy Sandbox Status"
        echo ""
        
        local sandbox_status=$(is_privacy_sandbox_enabled)
        echo "- Privacy Sandbox Enabled: $sandbox_status"
        echo ""
        
        echo "## Registered SDK Packages"
        echo ""
        
        local packages=$(get_privacy_sandbox_packages)
        local pkg_count=0
        
        while IFS= read -r pkg; do
            if [ -n "$pkg" ]; then
                echo "### Package: $pkg"
                echo '```'
                get_package_attestation "$pkg"
                echo '```'
                echo ""
                
                echo "### Permissions"
                echo '```'
                get_sdk_runtime_permissions "$pkg"
                echo '```'
                echo ""
                
                ((pkg_count++))
            fi
        done <<< "$packages"
        
        echo "## Summary"
        echo ""
        echo "- Total SDK Packages Found: $pkg_count"
        echo ""
        
    } >> "$output_file"
}

# ============================================
# FRIDA-BASED TESTING
# ============================================

frida_test_privacy_sandbox() {
    local package="$1"
    
    if [ "$FRIDA_AVAILABLE" = false ]; then
        log_warning "Frida not available. Skipping dynamic analysis."
        return 1
    fi
    
    log_info "Running Frida-based Privacy Sandbox tests..."
    
    local frida_script="${SCRIPT_DIR}/android15-apis.js"
    
    if [ ! -f "$frida_script" ]; then
        log_error "Frida script not found: $frida_script"
        return 1
    fi
    
    log_info "Launching Frida with Privacy Sandbox hooks..."
    
    # Run Frida with privacy sandbox options
    timeout 30 frida -U -f "$package" \
        -l "$frida_script" \
        -P "privacySandbox=true" \
        --no-pause \
        2>/dev/null &
    
    FRIDA_PID=$!
    sleep 5
    
    if ps -p $FRIDA_PID > /dev/null 2>&1; then
        log_success "Frida process running"
        kill $FRIDA_PID 2>/dev/null || true
    else
        log_warning "Frida process may have exited early"
    fi
}

frida_enumerate_sandbox_apis() {
    local package="$1"
    
    log_info "Enumerating Privacy Sandbox API usage with frida-trace..."
    
    if [ "$FRIDA_AVAILABLE" = false ]; then
        log_warning "Frida not available"
        return 1
    fi
    
    frida-trace -U -f "$package" \
        -i "*PrivacySandbox*" \
        -i "*getDeclaredPackageScore*" \
        -i "*startNotice*" \
        2>/dev/null &
    
    TRACE_PID=$!
    sleep 10
    kill $TRACE_PID 2>/dev/null || true
}

# ============================================
# SIGNATURE AND PERMISSION ANALYSIS
# ============================================

analyze_manifest() {
    local package="$1"
    local apk_path="$2"
    
    {
        echo "## Manifest Analysis"
        echo ""
        
        if [ -f "$apk_path" ]; then
            echo "APK: $apk_path"
            echo ""
            
            echo "### Privacy Sandbox Permissions"
            echo '```'
            apkanalyzer manifest print "$apk_path" 2>/dev/null | grep -iE "(privacySandbox|SDK_SANDBOX)" || echo "No explicit Privacy Sandbox permissions found"
            echo '```'
            echo ""
            
            echo "### Network Permissions"
            echo '```'
            apkanalyzer manifest print "$apk_path" 2>/dev/null | grep -iE "(INTERNET|ACCESS_NETWORK)" || echo "No network permissions"
            echo '```'
            echo ""
            
            echo "### Exported Components"
            echo '```'
            apkanalyzer manifest print "$apk_path" 2>/dev/null | grep -i "exported=\"true\"" | head -20 || echo "No exported components"
            echo '```'
            echo ""
        else
            echo "APK not provided for manifest analysis"
        fi
        
    } >> "$REPORT_FILE"
}

check_cross_sdk_communication() {
    local package="$1"
    
    log_info "Checking for cross-SDK communication patterns..."
    
    {
        echo "## Cross-SDK Communication Analysis"
        echo ""
        
        echo "### Intent-based Communication"
        echo '```'
        adb shell dumpsys package "$package" 2>/dev/null | grep -iE "(intent|receiver)" | head -20 || echo "No intent filters found"
        echo '```'
        echo ""
        
        echo "### Content Provider Access"
        echo '```'
        adb shell dumpsys package "$package" 2>/dev/null | grep -iE "(contentprovider|provider)" | head -20 || echo "No content providers found"
        echo '```'
        echo ""
        
    } >> "$REPORT_FILE"
}

# ============================================
# TESTING SCENARIOS
# ============================================

test_sdk_attestation_flow() {
    local package="$1"
    
    log_info "Testing SDK attestation flow..."
    
    {
        echo "## SDK Attestation Flow Test"
        echo ""
        
        echo "### Testing package score retrieval..."
        echo '```bash'
        echo "# Simulating: PrivacySandboxManager.getDeclaredPackageScore"
        echo "# Target package: $package"
        echo '```'
        echo ""
        
        echo "### Expected Behavior"
        echo "- SDK should receive attestation score"
        echo "- Score should reflect user's privacy choices"
        echo "- SDK should NOT receive device identifiers"
        echo ""
        
        echo "### Actual Behavior (if observed)"
        echo "(To be filled by Frida trace output)"
        echo ""
        
    } >> "$REPORT_FILE"
}

test_privacy_notice_trigger() {
    log_info "Testing privacy notice triggering..."
    
    {
        echo "## Privacy Notice Trigger Test"
        echo ""
        
        echo "### Testing startNotice API..."
        echo '```bash'
        echo "# Simulating: PrivacySandboxManager.startNotice"
        echo '```'
        echo ""
        
        echo "### Expected Behavior"
        echo "- Notice should display before data collection"
        echo "- User should have opt-out capability"
        echo ""
        
    } >> "$REPORT_FILE"
}

test_data_minimization() {
    local package="$1"
    
    log_info "Testing data minimization principles..."
    
    {
        echo "## Data Minimization Test"
        echo ""
        
        echo "### Network Traffic Analysis"
        echo '```'
        echo "(Requires proxy/MITM setup - run separately)"
        echo '```'
        echo ""
        
        echo "### File Access Patterns"
        echo '```'
        adb shell "run-as $package ls -la /data/data/$package/files/" 2>/dev/null || echo "Cannot access files (normal for non-root)"
        echo '```'
        echo ""
        
        echo "### SharedPreferences Analysis"
        echo '```'
        adb shell "run-as $package cat /data/data/$package/shared_prefs/*.xml" 2>/dev/null | head -50 || echo "Cannot access shared_prefs"
        echo '```'
        echo ""
        
    } >> "$REPORT_FILE"
}

# ============================================
# REPORTING
# ============================================

generate_json_report() {
    local package="$1"
    local pkg_count="${2:-0}"
    
    cat > "$JSON_REPORT" << EOF
{
  "engagement": {
    "target": "$package",
    "android_version": "$ANDROID_VERSION",
    "api_level": "$API_LEVEL",
    "timestamp": "$(date -Iseconds)",
    "tool": "privacy-sandbox-test.sh"
  },
  "privacy_sandbox_status": {
    "enabled": "$(is_privacy_sandbox_enabled)",
    "sdk_packages_found": $pkg_count
  },
  "findings": [],
  "enumeration_results": {
    "packages_analyzed": $pkg_count,
    "attestation_tests": "manual",
    "api_hooks": "requires_frida"
  }
}
EOF
    
    log_success "JSON report generated: $JSON_REPORT"
}

generate_final_report() {
    local package="$1"
    local pkg_count="${2:-0}"
    
    {
        echo "# Privacy Sandbox Security Assessment Report"
        echo ""
        echo "**Target Package**: $package"
        echo "**Android Version**: $ANDROID_VERSION (API $API_LEVEL)"
        echo "**Assessment Date**: $(date)"
        echo "**Privacy Sandbox Status**: $(is_privacy_sandbox_enabled)"
        echo ""
        
    } > "$REPORT_FILE"
    
    analyze_sdk_packages "$package" "$REPORT_FILE"
    test_sdk_attestation_flow "$package"
    test_privacy_notice_trigger
    test_data_minimization "$package"
    
    log_success "Report generated: $REPORT_FILE"
    
    if [ "$JSON_OUTPUT" = true ]; then
        generate_json_report "$package" "$pkg_count"
    fi
}

# ============================================
# MAIN EXECUTION
# ============================================

main() {
    # Parse arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            -h|--help)
                usage
                exit 0
                ;;
            -a|--all)
                ENUMERATE_ALL=true
                shift
                ;;
            -f|--file)
                PACKAGE_FILE="$2"
                shift 2
                ;;
            -o|--output)
                OUTPUT_DIR="$2"
                shift 2
                ;;
            -j|--json)
                JSON_OUTPUT=true
                shift
                ;;
            -v|--verbose)
                VERBOSE=true
                shift
                ;;
            -d|--device)
                ADB_DEVICE="$2"
                shift 2
                ;;
            -*)
                log_error "Unknown option: $1"
                usage
                exit 1
                ;;
            *)
                TARGET_PACKAGE="$1"
                shift
                ;;
        esac
    done
    
    # Create output directory
    mkdir -p "$OUTPUT_DIR"
    
    # Print banner
    print_banner
    
    # Check prerequisites
    check_adb
    check_frida
    get_android_version
    
    # Check Privacy Sandbox status
    log_info "Privacy Sandbox status: $(is_privacy_sandbox_enabled)"
    
    if [ "$ENUMERATE_ALL" = true ]; then
        log_info "Running full system enumeration..."
        
        echo "## System-wide Privacy Sandbox Enumeration"
        echo ""
        echo "Date: $(date)"
        echo ""
        echo "### All Privacy Sandbox Packages"
        echo '```'
        enumerate_privacy_sandbox_packages
        echo '```'
        echo ""
        
    elif [ -n "$TARGET_PACKAGE" ]; then
        log_info "Target package: $TARGET_PACKAGE"
        
        generate_final_report "$TARGET_PACKAGE" 0
        
    else
        log_error "No target specified. Use -a for system-wide or specify a package."
        usage
        exit 1
    fi
    
    echo ""
    log_success "Testing complete. Output saved to: $OUTPUT_DIR"
}

# Run main
main "$@"
