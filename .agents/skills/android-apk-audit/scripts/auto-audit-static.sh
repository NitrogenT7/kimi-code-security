#!/usr/bin/env bash

################################################################################
# android-apk-audit: Automated Static Analysis Script
# Description: Automates Phase 0-3 of the APK security audit workflow
# Author: android-apk-audit skill
# Version: 1.0.0
# Usage: ./auto-audit-static.sh <apk-file> [output-dir] [--quick|--full]
################################################################################

set -euo pipefail  # Exit on error, undefined variables, pipe failures

################################################################################
# Cross-platform realpath
################################################################################

_realpath() {
    if command -v realpath &>/dev/null; then
        realpath "$1"
    elif command -v python3 &>/dev/null; then
        python3 -c "import os, sys; print(os.path.realpath(sys.argv[1]))" -- "$1"
    elif command -v greadlink &>/dev/null; then
        greadlink -f "$1"
    else
        echo "$1"  # best effort fallback
    fi
}

################################################################################
# Color codes for terminal output
################################################################################

if [ -t 1 ]; then
    RED='\033[0;31m'
    GREEN='\033[0;32m'
    YELLOW='\033[1;33m'
    BLUE='\033[0;34m'
    CYAN='\033[0;36m'
    MAGENTA='\033[0;35m'
    BOLD='\033[1m'
    NC='\033[0m' # No Color
else
    RED=''
    GREEN=''
    YELLOW=''
    BLUE=''
    CYAN=''
    MAGENTA=''
    BOLD=''
    NC=''
fi

################################################################################
# Utility functions
################################################################################

log_info() {
    echo -e "${BLUE}[INFO]${NC} $*"
}

log_success() {
    echo -e "${GREEN}[✓]${NC} $*"
}

log_warning() {
    echo -e "${YELLOW}[!]${NC} $*"
}

log_error() {
    echo -e "${RED}[✗]${NC} $*" >&2
}

log_section() {
    echo -e "\n${CYAN}${BOLD}=== $* ===${NC}\n"
}

show_help() {
    cat << EOF
${BOLD}android-apk-audit: Automated Static Analysis Script${NC}

${BOLD}USAGE:${NC}
    $0 <apk-file> [output-dir] [--quick|--full] [--help|-h]

${BOLD}ARGUMENTS:${NC}
    apk-file        Path to the APK file to analyze (required)
    output-dir      Directory for analysis results (optional)
                    Default: ./audit-<package-name>-<timestamp>/

${BOLD}OPTIONS:${NC}
    --quick         Quick mode: manifest + critical grep (~2 min)
    --full          Full mode: complete static analysis (~10 min) [default]
    --help, -h      Show this help message

${BOLD}EXAMPLES:${NC}
    $0 app.apk
    $0 app.apk ./my-audit
    $0 app.apk --quick
    $0 app.apk ./results --full

${BOLD}REQUIREMENTS:${NC}
    - apktool (https://ibotpeaches.github.io/Apktool/)
    - jadx (https://github.com/skylot/jadx)
    - apkid (optional, https://github.com/rednaga/APKiD)
    - ripgrep (optional but recommended, https://github.com/BurntSushi/ripgrep)

${BOLD}OUTPUT STRUCTURE:${NC}
    output-dir/
    ├── decoded/           # apktool output
    ├── jadx-output/       # jadx decompiled sources
    ├── 00-decode-info.txt # Phase 0 results
    ├── 01-attack-surface.txt  # Phase 1 results
    ├── 02-triage.txt      # Phase 2 grep results
    ├── 03-findings-raw.txt # All findings combined
    └── AUDIT-SUMMARY.md   # Summary report (ready for agent)

EOF
    exit 0
}

################################################################################
# OS Detection and Tool Availability
################################################################################

detect_os() {
    case "$(uname -s)" in
        Darwin)
            OS="macos"
            ;;
        Linux)
            OS="linux"
            ;;
        MINGW*|MSYS*|CYGWIN*)
            OS="windows"
            ;;
        *)
            OS="unknown"
            ;;
    esac
    log_info "Detected OS: ${OS}"
}

check_command() {
    local cmd=$1
    if command -v "$cmd" &>/dev/null; then
        return 0
    else
        return 1
    fi
}

check_grep_type() {
    if check_command "rg"; then
        GREP_CMD="rg"
        GREP_FLAGS="-n"
        log_info "Using ripgrep (fast)"
        return 0
    elif grep --version 2>/dev/null | grep -q "GNU"; then
        GREP_CMD="grep"
        GREP_FLAGS="-rnE"
        log_info "Using GNU grep"
        return 0
    else
        GREP_CMD="grep"
        GREP_FLAGS="-RnE"
        log_info "Using BSD grep (macOS)"
        return 0
    fi
}

check_requirements() {
    local missing=()
    local optional=()

    if ! check_command "apktool"; then
        missing+=("apktool")
    fi

    if ! check_command "jadx" && ! check_command "jadx-gui"; then
        missing+=("jadx")
    fi

    if ! check_command "apkid"; then
        optional+=("apkid")
    fi

    if [ ${#missing[@]} -gt 0 ]; then
        log_error "Missing required tools: ${missing[*]}"
        log_error "Please install them first"
        exit 1
    fi

    if [ ${#optional[@]} -gt 0 ]; then
        log_warning "Optional tools not installed: ${optional[*]}"
        log_warning "Continuing without them..."
    fi
}

################################################################################
# Argument Parsing
################################################################################

parse_arguments() {
    APK_FILE=""
    OUTPUT_DIR=""
    MODE="full"  # quick | full

    while [[ $# -gt 0 ]]; do
        case $1 in
            --help|-h)
                show_help
                ;;
            --quick)
                MODE="quick"
                shift
                ;;
            --full)
                MODE="full"
                shift
                ;;
            -*)
                log_error "Unknown option: $1"
                show_help
                ;;
            *)
                if [ -z "$APK_FILE" ]; then
                    APK_FILE="$1"
                elif [ -z "$OUTPUT_DIR" ]; then
                    OUTPUT_DIR="$1"
                else
                    log_error "Too many arguments"
                    show_help
                fi
                shift
                ;;
        esac
    done

    if [ -z "$APK_FILE" ]; then
        log_error "APK file is required"
        show_help
    fi

    if [ ! -f "$APK_FILE" ]; then
        log_error "APK file not found: $APK_FILE"
        exit 1
    fi

    APK_FILE=$(_realpath "$APK_FILE")
    APK_BASENAME=$(basename "$APK_FILE")
    APK_DIRNAME=$(dirname "$APK_FILE")

    log_info "APK File: $APK_FILE"
    log_info "Mode: $MODE"
}

################################################################################
# Setup Output Directory
################################################################################

setup_output_dir() {
    timestamp=$(date +"%Y%m%d-%H%M%S")

    if [ -z "$OUTPUT_DIR" ]; then
        # Extract package name for directory name (will update after decoding)
        OUTPUT_DIR="./audit-${timestamp}"
    fi

    # Create output directory
    mkdir -p "$OUTPUT_DIR"
    OUTPUT_DIR=$(_realpath "$OUTPUT_DIR")

    # Create subdirectories
    mkdir -p "$OUTPUT_DIR/decoded"
    mkdir -p "$OUTPUT_DIR/jadx-output"

    log_success "Output directory: $OUTPUT_DIR"
}

################################################################################
# Phase 0: Decode & Framework Detection
################################################################################

phase0_decode() {
    log_section "Phase 0: Decode APK & Framework Detection"

    local decode_file="$OUTPUT_DIR/00-decode-info.txt"

    {
        echo "=============================================="
        echo "PHASE 0: APK DECODE & FRAMEWORK DETECTION"
        echo "=============================================="
        echo ""
        echo "Timestamp: $(date)"
        echo "APK File: $APK_FILE"
        echo "APK Size: $(du -h "$APK_FILE" | awk '{print $1}')"
        echo ""
    } > "$decode_file"

    # Run apktool
    log_info "Decoding APK with apktool..."
    if apktool d "$APK_FILE" -o "$OUTPUT_DIR/decoded" -f > "$OUTPUT_DIR/apktool.log" 2>&1; then
        log_success "APK decoded successfully"
        echo "apktool: SUCCESS" >> "$decode_file"
    else
        log_error "apktool failed"
        echo "apktool: FAILED - see $OUTPUT_DIR/apktool.log" >> "$decode_file"
        return 1
    fi

    # Run jadx
    log_info "Decompiling with jadx..."
    local jadx_cmd="jadx"
    if ! check_command "jadx"; then
        log_error "jadx CLI not found. Install jadx from: https://github.com/skylot/jadx/releases"
        echo "jadx: FAILED - jadx not installed" >> "$decode_file"
        return 1
    fi

    if $jadx_cmd -d "$OUTPUT_DIR/jadx-output" "$APK_FILE" > "$OUTPUT_DIR/jadx.log" 2>&1; then
        log_success "JADX decompiled successfully"
        echo "jadx: SUCCESS" >> "$decode_file"
    else
        log_error "jadx failed"
        echo "jadx: FAILED - see $OUTPUT_DIR/jadx.log" >> "$decode_file"
        return 1
    fi

    # Run apkid if available
    if check_command "apkid"; then
        log_info "Running apkid for framework detection..."
        if apkid "$APK_FILE" > "$OUTPUT_DIR/apkid.txt" 2>&1; then
            log_success "APKiD completed"
            echo "" >> "$decode_file"
            echo "--- APKiD Output ---" >> "$decode_file"
            cat "$OUTPUT_DIR/apkid.txt" >> "$decode_file"
        else
            log_warning "APKiD failed, using manual detection"
        fi
    else
        log_warning "APKiD not installed, using manual detection"
    fi

    # Manual framework detection
    log_info "Manual framework detection..."
    local frameworks=()

    if [ -f "$OUTPUT_DIR/decoded/assets/index.android.bundle" ] || \
       [ -f "$OUTPUT_DIR/decoded/assets/index.android.bundle.js" ]; then
        frameworks+=("React Native")
    fi

    if find "$OUTPUT_DIR/decoded/lib" -name "libflutter.so" 2>/dev/null | grep -q .; then
        frameworks+=("Flutter")
    fi

    if find "$OUTPUT_DIR/decoded" -path "*/assemblies/*.dll" 2>/dev/null | grep -q .; then
        frameworks+=("Xamarin")
    fi

    if [ -d "$OUTPUT_DIR/decoded/assets/www" ]; then
        frameworks+=("Cordova/Capacitor")
    fi

    # Check for Kotlin
    if find "$OUTPUT_DIR/decoded" -name "*.kotlin" 2>/dev/null | grep -q .; then
        frameworks+=("Kotlin")
    fi

    if [ ${#frameworks[@]} -eq 0 ]; then
        frameworks+=("Unknown/Native")
    fi

    echo "" >> "$decode_file"
    echo "--- Detected Frameworks ---" >> "$decode_file"
    for fw in "${frameworks[@]}"; do
        echo "- $fw" >> "$decode_file"
    done

    log_success "Detected frameworks: ${frameworks[*]}"

    # Extract package name from AndroidManifest
    local package_name
    package_name=$(grep -o 'package="[^"]*"' "$OUTPUT_DIR/decoded/AndroidManifest.xml" 2>/dev/null | head -1 | cut -d'"' -f2 || echo "unknown")
    echo "" >> "$decode_file"
    echo "Package Name: $package_name" >> "$decode_file"

    # Rename output dir if still using default
    if [[ "$OUTPUT_DIR" == *"audit-"* ]]; then
        local new_dir="./audit-${package_name}-${timestamp}"
        if [ -d "$new_dir" ]; then
            new_dir="${new_dir}_${RANDOM}"
        fi
        mv "$OUTPUT_DIR" "$new_dir"
        OUTPUT_DIR="$new_dir"
        log_success "Updated output directory: $OUTPUT_DIR"
    fi

    echo "" >> "$decode_file"
    echo "Output Directory: $OUTPUT_DIR" >> "$decode_file"
}

################################################################################
# Phase 1: Attack Surface Mapping
################################################################################

phase1_attack_surface() {
    log_section "Phase 1: Attack Surface Mapping"

    local manifest="$OUTPUT_DIR/decoded/AndroidManifest.xml"
    local output="$OUTPUT_DIR/01-attack-surface.txt"

    {
        echo "=============================================="
        echo "PHASE 1: ATTACK SURFACE MAPPING"
        echo "=============================================="
        echo ""
        echo "Timestamp: $(date)"
        echo ""
    } > "$output"

    # Exported activities
    log_info "Analyzing exported components..."
    {
        echo "--- Exported Activities ---"
        grep -E 'android:exported="true"' "$manifest" 2>/dev/null | grep -o 'android:name="[^"]*"' | head -20 || echo "None found"
        echo ""
    } >> "$output"

    # Exported services
    {
        echo "--- Exported Services ---"
        grep -E 'android:exported="true"' "$manifest" 2>/dev/null | grep -o 'android:name="[^"]*"' | head -20 || echo "None found"
        echo ""
    } >> "$output"

    # Exported receivers
    {
        echo "--- Exported Receivers ---"
        grep -E 'android:exported="true"' "$manifest" 2>/dev/null | grep -o 'android:name="[^"]*"' | head -20 || echo "None found"
        echo ""
    } >> "$output"

    # Exported providers
    {
        echo "--- Exported Providers ---"
        grep -E 'android:exported="true"' "$manifest" 2>/dev/null | grep -o 'android:name="[^"]*"' | head -20 || echo "None found"
        echo ""
    } >> "$output"

    # Deep links
    log_info "Analyzing deep link schemes..."
    {
        echo "--- Deep Link Schemes ---"
        grep -oE 'android:scheme="[^"]*"' "$manifest" 2>/dev/null | cut -d'"' -f2 | sort -u
        echo ""
    } >> "$output"

    # Permissions
    log_info "Analyzing permissions..."
    {
        echo "--- Permissions ---"
        grep -oE 'uses-permission[^>]*android:name="[^"]*"' "$manifest" 2>/dev/null | \
            cut -d'"' -f2 | sort
        echo ""
    } >> "$output"

    # Security flags
    log_info "Analyzing security flags..."
    {
        echo "--- Security Flags ---"
        echo -n "android:debuggable: "
        grep -q 'android:debuggable="true"' "$manifest" && echo "YES [HIGH RISK]" || echo "no"

        echo -n "android:allowBackup: "
        grep -q 'android:allowBackup="true"' "$manifest" && echo "YES [POTENTIAL RISK]" || echo "no"

        echo -n "android:usesCleartextTraffic: "
        grep -q 'android:usesCleartextTraffic="true"' "$manifest" && echo "YES [HIGH RISK]" || echo "no"

        echo -n "android:networkSecurityConfig: "
        grep -oE 'android:networkSecurityConfig="[^"]*"' "$manifest" || echo "not set"

        echo ""
    } >> "$output"

    # Network Security Config
    local ns_config
    ns_config=$(grep -oE 'android:networkSecurityConfig="[^"]*"' "$manifest" 2>/dev/null | cut -d'"' -f2 | head -1)

    if [ -n "$ns_config" ] && [ -f "$OUTPUT_DIR/decoded/res/xml/$ns_config" ]; then
        log_info "Analyzing network security config..."
        {
            echo "--- Network Security Config ---"
            cat "$OUTPUT_DIR/decoded/res/xml/$ns_config"
            echo ""
        } >> "$output"
    fi

    log_success "Attack surface mapping completed"
}

################################################################################
# Phase 2: Targeted Triage (Grep Patterns)
################################################################################

phase2_triage() {
    log_section "Phase 2: Targeted Triage"

    local output="$OUTPUT_DIR/02-triage.txt"
    local scan_dir="$OUTPUT_DIR/jadx-output/sources"

    if [ ! -d "$scan_dir" ]; then
        log_warning "JADX output not found, skipping grep patterns"
        return 0
    fi

    {
        echo "=============================================="
        echo "PHASE 2: TARGETED TRIAGE (GREP PATTERNS)"
        echo "=============================================="
        echo ""
        echo "Timestamp: $(date)"
        echo "Scan Directory: $scan_dir"
        echo "Using: $GREP_CMD"
        echo ""
    } > "$output"

    # Library paths to exclude
    local exclude_patterns
    exclude_patterns=(
        "com/google/"
        "com/android/"
        "androidx/"
        "kotlin/"
        "okio/"
        "okhttp3/"
        "retrofit2/"
        "io/reactivex/"
        "dagger/"
    )

    # Build exclude pattern for rg (use array to avoid shell quote stripping)
    local rg_exclude=()
    for pattern in "${exclude_patterns[@]}"; do
        rg_exclude+=("-g" "!${pattern}**")
    done

    # Define grep patterns (POSIX-compatible approach without associative arrays)
    get_pattern() {
        case "$1" in
            "webview_sinks") echo "loadUrl|evaluateJavascript|addJavascriptInterface|setJavaScriptEnabled" ;;
            "ipc_sources") echo "getIntent|onNewIntent|getQueryParameter" ;;
            "secrets") echo "password=|api_key=|token=|firebaseio|AKIA|STRIPE_LIVE_KEY" ;;
            "crypto_issues") echo "DES/|MD5|AES/ECB|SecretKeySpec" ;;
            "insecure_storage") echo "SharedPreferences|MODE_WORLD_READABLE|getExternalStorage" ;;
            "network_tls") echo "TrustManager|X509TrustManager|ALLOW_ALL|cleartext" ;;
            "native_bridges") echo "System\.loadLibrary|native" ;;
            "anti_analysis") echo "isDebuggerConnected|frida|emulator|Debug\.isDebuggerConnected" ;;
        esac
    }

    get_description() {
        case "$1" in
            "webview_sinks") echo "WebView Sinks (potential XSS)" ;;
            "ipc_sources") echo "IPC Sources (intent handling)" ;;
            "secrets") echo "Hardcoded Secrets (API keys, tokens)" ;;
            "crypto_issues") echo "Cryptographic Issues (weak algorithms)" ;;
            "insecure_storage") echo "Insecure Storage Patterns" ;;
            "network_tls") echo "Network/TLS Issues (cert validation bypass)" ;;
            "native_bridges") echo "Native Bridges (JNI calls)" ;;
            "anti_analysis") echo "Anti-Analysis Checks" ;;
        esac
    }

    log_info "Scanning with grep patterns..."

    for category in webview_sinks ipc_sources secrets crypto_issues insecure_storage network_tls native_bridges anti_analysis; do
        local pattern=$(get_pattern "$category")
        local description=$(get_description "$category")

        echo "--- $description ---" >> "$output"

        local result
        if [ "$GREP_CMD" = "rg" ]; then
            result=$(cd "$scan_dir" && rg $GREP_FLAGS "${rg_exclude[@]}" "$pattern" 2>/dev/null || true)
        else
            # Fallback: use find + grep (avoid ripgrep-specific -g exclusions)
            result=$(cd "$scan_dir" && find . -type f \( -name "*.java" -o -name "*.kt" -o -name "*.xml" -o -name "*.smali" -o -name "*.js" \) -exec grep $GREP_FLAGS "$pattern" {} + 2>/dev/null || true)
        fi

        if [ -n "$result" ]; then
            echo "$result" >> "$output"
        else
            echo "No matches found" >> "$output"
        fi

        echo "" >> "$output"
        log_info "Completed: $category"
    done

    log_success "Grep patterns completed"
}

################################################################################
# Phase 3: Generate Summary
################################################################################

phase3_summary() {
    log_section "Phase 3: Generate Summary"

    local summary_file="$OUTPUT_DIR/AUDIT-SUMMARY.md"
    local findings_file="$OUTPUT_DIR/03-findings-raw.txt"

    # Combine all findings
    cat "$OUTPUT_DIR/01-attack-surface.txt" > "$findings_file"
    cat "$OUTPUT_DIR/02-triage.txt" >> "$findings_file"

    # Extract app info
    local package_name
    package_name=$(grep "Package Name:" "$OUTPUT_DIR/00-decode-info.txt" 2>/dev/null | cut -d: -f2- | xargs)

    local frameworks
    frameworks=$(grep -A 10 "Detected Frameworks:" "$OUTPUT_DIR/00-decode-info.txt" 2>/dev/null | \
                  grep "^- " | cut -d' ' -f2- | tr '\n' ', ' | sed 's/,$//')

    local apk_size
    apk_size=$(grep "APK Size:" "$OUTPUT_DIR/00-decode-info.txt" 2>/dev/null | cut -d: -f2- | xargs)

    # Count exported components
    local exported_count
    exported_count=$(grep -c "android:exported=\"true\"" "$OUTPUT_DIR/decoded/AndroidManifest.xml" 2>/dev/null || echo "0")

    # Count deep link schemes
    local deep_link_count
    deep_link_count=$(grep -c "android:scheme=" "$OUTPUT_DIR/decoded/AndroidManifest.xml" 2>/dev/null || echo "0")

    # Count grep findings by category (count lines that aren't headers or "No matches found")
    local count_webview_sinks=0
    local count_ipc_sources=0
    local count_secrets=0
    local count_crypto_issues=0
    local count_insecure_storage=0
    local count_network_tls=0
    local count_native_bridges=0
    local count_anti_analysis=0

    local triage_file="$OUTPUT_DIR/02-triage.txt"
    if [ -f "$triage_file" ]; then
        # Count lines that match grep patterns (exclude headers and "No matches found")
        count_webview_sinks=$(awk '/^--- WebView/,/^--- [^-]|^$/ {if (!/No matches found/) count++} END {print count+0}' "$triage_file")
        count_ipc_sources=$(awk '/^--- IPC/,/^--- [^-]|^$/ {if (!/No matches found/) count++} END {print count+0}' "$triage_file")
        count_secrets=$(awk '/^--- Hardcoded/,/^--- [^-]|^$/ {if (!/No matches found/) count++} END {print count+0}' "$triage_file")
        count_crypto_issues=$(awk '/^--- Cryptographic/,/^--- [^-]|^$/ {if (!/No matches found/) count++} END {print count+0}' "$triage_file")
        count_insecure_storage=$(awk '/^--- Insecure/,/^--- [^-]|^$/ {if (!/No matches found/) count++} END {print count+0}' "$triage_file")
        count_network_tls=$(awk '/^--- Network\/TLS/,/^--- [^-]|^$/ {if (!/No matches found/) count++} END {print count+0}' "$triage_file")
        count_native_bridges=$(awk '/^--- Native/,/^--- [^-]|^$/ {if (!/No matches found/) count++} END {print count+0}' "$triage_file")
        count_anti_analysis=$(awk '/^--- Anti-Analysis/,/^--- [^-]|^$/ {if (!/No matches found/) count++} END {print count+0}' "$triage_file")
    fi

    # Count total files scanned
    local total_files
    total_files=$(find "$OUTPUT_DIR/jadx-output/sources" -type f -name "*.java" 2>/dev/null | wc -l | xargs)

    # Generate Markdown summary
    cat > "$summary_file" << EOF
# Android APK Static Analysis Summary

**Generated:** $(date)
**Mode:** ${MODE^}
**APK:** $APK_BASENAME

---

## App Information

| Property | Value |
|----------|-------|
| **Package Name** | ${package_name:-Unknown} |
| **APK Size** | ${apk_size:-Unknown} |
| **Frameworks** | ${frameworks:-Unknown} |
| **Output Directory** | \`$OUTPUT_DIR\` |

---

## Attack Surface Summary

| Metric | Count |
|--------|-------|
| **Exported Components** | $exported_count |
| **Deep Link Schemes** | $deep_link_count |
| **Permissions** | $(grep -c "uses-permission" "$OUTPUT_DIR/decoded/AndroidManifest.xml" 2>/dev/null || echo "0") |
| **Total Files Scanned** | ${total_files:-0} |

---

## Security Flags

- **Debuggable:** $(grep -q 'android:debuggable="true"' "$OUTPUT_DIR/decoded/AndroidManifest.xml" 2>/dev/null && echo "⚠️ YES - **HIGH RISK**" || echo "✅ NO")
- **AllowBackup:** $(grep -q 'android:allowBackup="true"' "$OUTPUT_DIR/decoded/AndroidManifest.xml" 2>/dev/null && echo "⚠️ YES - **POTENTIAL RISK**" || echo "✅ NO")
- **Cleartext Traffic:** $(grep -q 'android:usesCleartextTraffic="true"' "$OUTPUT_DIR/decoded/AndroidManifest.xml" 2>/dev/null && echo "⚠️ YES - **HIGH RISK**" || echo "✅ NO")
- **Network Security Config:** $(grep -q 'android:networkSecurityConfig=' "$OUTPUT_DIR/decoded/AndroidManifest.xml" 2>/dev/null && echo "✅ Configured" || echo "⚠️ Not configured")

---

## Findings by Category

| Category | Matches | Priority |
|----------|---------|----------|
| WebView Sinks | ${count_webview_sinks} | Medium |
| IPC Sources | ${count_ipc_sources} | High |
| Hardcoded Secrets | ${count_secrets} | **CRITICAL** |
| Crypto Issues | ${count_crypto_issues} | High |
| Insecure Storage | ${count_insecure_storage} | Medium |
| Network/TLS Issues | ${count_network_tls} | High |
| Native Bridges | ${count_native_bridges} | Medium |
| Anti-Analysis Checks | ${count_anti_analysis} | Low |

---

## Top 10 Suspicious Files

$(grep -E "\.java:" "$OUTPUT_DIR/02-triage.txt" 2>/dev/null | \
  cut -d: -f1 | sort | uniq -c | sort -rn | head -10 | \
  awk '{print "- **" $2 "** (" $1 " findings)"}')

---

## Next Steps

This summary provides a foundation for deeper analysis. Recommended actions:

1. **Review Exported Components** - Check for sensitive data exposure
2. **Analyze Hardcoded Secrets** - Replace with secure storage
3. **Audit WebView Usage** - Validate input sanitization
4. **Review Crypto Implementation** - Upgrade weak algorithms
5. **Check TLS Configuration** - Ensure proper certificate validation

---

## Detailed Reports

For complete findings, review these files:

- \`00-decode-info.txt\` - APK decode and framework detection
- \`01-attack-surface.txt\` - Attack surface mapping
- \`02-triage.txt\` - Grep pattern results
- \`03-findings-raw.txt\` - Combined findings

---

**Analysis completed. Ready for agent consumption.**
EOF

    log_success "Summary generated: $summary_file"
}

################################################################################
# Main Execution
################################################################################

main() {
    echo -e "${CYAN}${BOLD}"
    cat << "EOF"
╔═══════════════════════════════════════════════════════════╗
║  android-apk-audit: Automated Static Analysis Script    ║
║  Phase 0-3 Security Audit Workflow                      ║
╚═══════════════════════════════════════════════════════════╝
EOF
    echo -e "${NC}"

    detect_os
    check_grep_type
    check_requirements
    parse_arguments "$@"
    setup_output_dir

    log_info "Starting analysis in $MODE mode..."
    local start_time
    start_time=$(date +%s)

    phase0_decode
    phase1_attack_surface

    if [ "$MODE" = "quick" ]; then
        log_warning "Quick mode: Skipping grep patterns"
    else
        phase2_triage
    fi

    phase3_summary

    local end_time
    end_time=$(date +%s)
    local duration=$((end_time - start_time))

    log_section "Analysis Complete"
    log_success "Total time: ${duration}s"
    log_success "Output directory: $OUTPUT_DIR"
    log_success "Summary report: $OUTPUT_DIR/AUDIT-SUMMARY.md"

    echo ""
    echo -e "${GREEN}${BOLD}✓ Static analysis completed successfully!${NC}"
    echo ""
}

# Run main function
main "$@"
