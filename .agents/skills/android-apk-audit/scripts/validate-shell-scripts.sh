#!/usr/bin/env bash

################################################################################
# Shell Script Validator for CI/CD Pipeline
#
# Validates all shell scripts using bash -n syntax checking.
# Outputs results in TAP format for CI integration.
#
# Usage:
#     ./validate-shell-scripts.sh [directory]
#
# Exit codes:
#     0 - All scripts passed validation
#     1 - One or more scripts failed validation
################################################################################

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
TARGET_DIR="${1:-$PROJECT_ROOT/scripts}"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

print_header() {
    echo -e "${BLUE}========================================${NC}"
    echo -e "${BLUE}  Shell Script Validation${NC}"
    echo -e "${BLUE}========================================${NC}"
    echo ""
}

print_usage() {
    cat << EOF
Usage: $0 [directory]

Arguments:
    directory    Directory containing shell scripts (default: scripts/)

Examples:
    $0                                    # Validate scripts/
    $0 /path/to/scripts                   # Validate specific directory
    $0                                    # Validate default scripts/ directory

EOF
}

find_shell_scripts() {
    local dir="$1"
    if [ ! -d "$dir" ]; then
        echo "Error: Directory not found: $dir" >&2
        return 1
    fi

    find "$dir" -name "*.sh" -type f 2>/dev/null | sort
}

validate_script() {
    local script="$1"
    local result=0

    if ! bash -n "$script" 2>&1; then
        result=1
    fi

    return $result
}

run_validation() {
    local dir="$1"
    local total=0
    local passed=0
    local failed=0
    local failed_scripts=()

    echo "Scanning directory: $dir"
    echo ""

    while IFS= read -r script; do
        [ -z "$script" ] && continue
        ((total++))

        script_name="${script#$PROJECT_ROOT/}"
        echo -n "  Validating: $script_name ... "

        if validate_script "$script"; then
            echo -e "${GREEN}✅ PASS${NC}"
            ((passed++))
        else
            echo -e "${RED}❌ FAIL${NC}"
            ((failed++))
            failed_scripts+=("$script")
        fi
    done < <(find_shell_scripts "$dir")

    echo ""
    echo "========================================"
    echo "  Summary"
    echo "========================================"
    echo "  Total scripts:  $total"
    echo -e "  Passed:          ${GREEN}$passed${NC}"
    echo -e "  Failed:          ${RED}$failed${NC}"
    echo "========================================"

    if [ "${#failed_scripts[@]}" -gt 0 ]; then
        echo ""
        echo -e "${RED}Failed scripts:${NC}"
        for script in "${failed_scripts[@]}"; do
            echo "  - $script"
        done
        return 1
    fi

    return 0
}

main() {
    if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
        print_usage
        exit 0
    fi

    print_header

    if [ ! -d "$TARGET_DIR" ]; then
        echo -e "${RED}Error: Directory not found: $TARGET_DIR${NC}" >&2
        exit 1
    fi

    if ! run_validation "$TARGET_DIR"; then
        exit 1
    fi

    exit 0
}

main "$@"
