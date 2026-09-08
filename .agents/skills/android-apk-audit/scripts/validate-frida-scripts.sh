#!/usr/bin/env bash

################################################################################
# Frida Script Validator for CI/CD Pipeline
#
# Validates all Frida scripts using node --check for JavaScript syntax.
# Optionally uses frida-compile for strict validation if available.
#
# Usage:
#     ./validate-frida-scripts.sh [directory]
#
# Exit codes:
#     0 - All scripts passed validation
#     1 - One or more scripts failed validation
################################################################################

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
TARGET_DIR="${1:-$PROJECT_ROOT/assets/frida-scripts}"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

FRIDA_COMPILE_AVAILABLE=false

print_header() {
    echo -e "${BLUE}========================================${NC}"
    echo -e "${BLUE}  Frida Script Validation${NC}"
    echo -e "${BLUE}========================================${NC}"
    echo ""
}

print_usage() {
    cat << EOF
Usage: $0 [directory]

Arguments:
    directory    Directory containing Frida scripts (default: assets/frida-scripts/)

Options:
    --strict     Use frida-compile for strict validation (if available)
    -h, --help   Show this help message

Examples:
    $0                                    # Validate default directory
    $0 /path/to/frida-scripts             # Validate specific directory
    $0 --strict                           # Strict validation mode

EOF
}

check_frida_compile() {
    if command -v frida-compile &>/dev/null; then
        FRIDA_COMPILE_AVAILABLE=true
        echo -e "${GREEN}frida-compile available - strict mode enabled${NC}"
    else
        echo -e "${YELLOW}frida-compile not available - using basic node --check${NC}"
    fi
    echo ""
}

find_frida_scripts() {
    local dir="$1"
    if [ ! -d "$dir" ]; then
        echo "Error: Directory not found: $dir" >&2
        return 1
    fi

    find "$dir" -name "*.js" -type f 2>/dev/null | sort
}

validate_script_basic() {
    local script="$1"

    if node --check "$script" 2>&1; then
        return 0
    fi
    return 1
}

validate_script_strict() {
    local script="$1"

    if frida-compile "$script" -o /dev/null 2>&1; then
        return 0
    fi
    return 1
}

run_validation() {
    local dir="$1"
    local use_strict="${2:-false}"
    local total=0
    local passed=0
    local failed=0
    local failed_scripts=()
    local warned_scripts=()
    local warned_scripts_count=0

    echo "Scanning directory: $dir"
    echo ""

    if [ "$use_strict" = "true" ]; then
        check_frida_compile
    fi

    while IFS= read -r script; do
        [ -z "$script" ] && continue
        ((total++))

        script_name="${script#$PROJECT_ROOT/}"
        echo -n "  Validating: $script_name ... "

        if validate_script_basic "$script"; then
            if [ "$use_strict" = "true" ] && [ "$FRIDA_COMPILE_AVAILABLE" = "true" ]; then
                echo -n "(basic) "
                if validate_script_strict "$script"; then
                    echo -e "${GREEN}✅ PASS (strict)${NC}"
                    ((passed++))
                else
                    echo -e "${YELLOW}⚠️ WARN (strict failed, basic OK)${NC}"
                    ((warned_scripts_count++))
                    warned_scripts+=("$script")
                fi
            else
                echo -e "${GREEN}✅ PASS${NC}"
                ((passed++))
            fi
        else
            echo -e "${RED}❌ FAIL${NC}"
            ((failed++))
            failed_scripts+=("$script")
        fi
    done < <(find_frida_scripts "$dir")

    echo ""
    echo "========================================"
    echo "  Summary"
    echo "========================================"
    echo "  Total scripts:  $total"
    echo -e "  Passed:         ${GREEN}$passed${NC}"
    echo -e "  Warnings:       ${YELLOW}${#warned_scripts[@]}${NC}"
    echo -e "  Failed:         ${RED}$failed${NC}"
    echo "========================================"

    if [ "${#failed_scripts[@]}" -gt 0 ]; then
        echo ""
        echo -e "${RED}Failed scripts:${NC}"
        for script in "${failed_scripts[@]}"; do
            echo "  - $script"
        done
        return 1
    fi

    if [ "${#warned_scripts[@]}" -gt 0 ]; then
        echo ""
        echo -e "${YELLOW}Scripts with strict validation warnings:${NC}"
        for script in "${warned_scripts[@]}"; do
            echo "  - $script"
        done
    fi

    return 0
}

main() {
    local use_strict=false

    while [[ $# -gt 0 ]]; do
        case "$1" in
            --strict)
                use_strict=true
                shift
                ;;
            -h|--help)
                print_usage
                exit 0
                ;;
            *)
                TARGET_DIR="$1"
                shift
                ;;
        esac
    done

    print_header

    if [ ! -d "$TARGET_DIR" ]; then
        echo -e "${RED}Error: Directory not found: $TARGET_DIR${NC}" >&2
        exit 1
    fi

    if ! run_validation "$TARGET_DIR" "$use_strict"; then
        exit 1
    fi

    exit 0
}

main "$@"
