#!/usr/bin/env bash

# Check bash version for associative arrays
if [ -z "${BASH_VERSINFO:-}" ] || [ "${BASH_VERSINFO[0]}" -lt 4 ]; then
    newer_bash=""
    if [ -x /opt/homebrew/bin/bash ]; then
        newer_bash="/opt/homebrew/bin/bash"
    elif [ -x /usr/local/bin/bash ]; then
        newer_bash="/usr/local/bin/bash"
    fi

    echo "ERROR: This script must be run with bash 4+ (macOS default is bash 3.2)."
    echo "zsh is not supported."
    echo "Fix: brew install bash"
    if [ -n "$newer_bash" ]; then
        echo "Then run: $newer_bash \"$0\""
    else
        echo "Then run it with your Homebrew bash path, e.g. /opt/homebrew/bin/bash \"$0\""
    fi
    exit 1
fi

set -euo pipefail

# Color codes using tput for terminal compatibility
RESET=$(tput sgr0 2>/dev/null || echo "")
GREEN=$(tput setaf 2 2>/dev/null || echo "")
RED=$(tput setaf 1 2>/dev/null || echo "")
YELLOW=$(tput setaf 3 2>/dev/null || echo "")
BLUE=$(tput setaf 4 2>/dev/null || echo "")

# Track results
declare -A tool_status
declare -A tool_version
critical_missing=0
optional_missing=0

# OS Detection
detect_os() {
    case "$(uname -s)" in
        Darwin)
            echo "macOS"
            return
            ;;
        Linux)
            if [ -f /etc/os-release ]; then
                . /etc/os-release
                if echo "$ID" | grep -qE "ubuntu|debian"; then
                    echo "linux-debian"
                elif echo "$ID" | grep -q "arch"; then
                    echo "linux-arch"
                elif echo "$ID" | grep -qE "fedora|rhel|centos"; then
                    echo "linux-fedora"
                else
                    echo "linux-other"
                fi
            else
                echo "linux-other"
            fi
            return
            ;;
        MINGW*|MSYS*|CYGWIN*)
            echo "windows"
            return
            ;;
        *)
            echo "unknown"
            return
            ;;
    esac
}

OS=$(detect_os)

# Get install command for current OS
get_install_cmd() {
    local tool=$1
    local os=$2
    case "$os" in
        macOS)
            case "$tool" in
                jadx) echo "brew install jadx" ;;
                apktool) echo "brew install apktool" ;;
                adb) echo "brew install --cask android-platform-tools" ;;
                frida) echo "pip3 install frida-tools" ;;
                objection) echo "pip3 install objection" ;;
                apkid) echo "pip3 install apkid" ;;
                java) echo "brew install openjdk" ;;
                zipalign) echo "brew install --cask android-commandlinetools" ;;
                python3) echo "brew install python@3" ;;
                sqlite3) echo "brew install sqlite" ;;
                *) echo "manual installation required" ;;
            esac
            ;;
        linux-debian)
            case "$tool" in
                jadx) echo "sudo apt install jadx" ;;
                apktool) echo "sudo apt install apktool" ;;
                adb) echo "sudo apt install android-tools-adb" ;;
                frida) echo "sudo apt install frida-tools" ;;
                objection) echo "pip3 install objection" ;;
                apkid) echo "pip3 install apkid" ;;
                java) echo "sudo apt install default-jdk" ;;
                zipalign) echo "Install via Android SDK build-tools (android-sdk-build-tools)" ;;
                python3) echo "sudo apt install python3" ;;
                sqlite3) echo "sudo apt install sqlite3" ;;
                *) echo "sudo apt install $tool" ;;
            esac
            ;;
        linux-arch)
            case "$tool" in
                jadx) echo "yay -S jadx" ;;
                apktool) echo "sudo pacman -S apktool" ;;
                adb) echo "sudo pacman -S android-tools" ;;
                frida) echo "pip3 install frida-tools" ;;
                objection) echo "pip3 install objection" ;;
                apkid) echo "pip3 install apkid" ;;
                java) echo "sudo pacman -S jdk-openjdk" ;;
                zipalign) echo "sudo pacman -S android-tools" ;;
                python3) echo "sudo pacman -S python" ;;
                sqlite3) echo "sudo pacman -S sqlite" ;;
                *) echo "sudo pacman -S $tool" ;;
            esac
            ;;
        linux-fedora)
            case "$tool" in
                jadx) echo "sudo dnf install jadx" ;;
                apktool) echo "sudo dnf install apktool" ;;
                adb) echo "sudo dnf install android-tools" ;;
                frida) echo "pip3 install frida-tools" ;;
                objection) echo "pip3 install objection" ;;
                apkid) echo "pip3 install apkid" ;;
                java) echo "sudo dnf install java-latest-openjdk-devel" ;;
                zipalign) echo "sudo dnf install android-tools" ;;
                python3) echo "sudo dnf install python3" ;;
                sqlite3) echo "sudo dnf install sqlite" ;;
                *) echo "sudo dnf install $tool" ;;
            esac
            ;;
        windows)
            case "$tool" in
                jadx) echo "choco install jadx or scoop install jadx" ;;
                apktool) echo "choco install apktool or scoop install apktool" ;;
                adb) echo "choco install adb or scoop install adb" ;;
                frida) echo "pip3 install frida-tools" ;;
                objection) echo "pip3 install objection" ;;
                apkid) echo "pip3 install apkid" ;;
                java) echo "choco install openjdk or scoop install openjdk" ;;
                zipalign) echo "choco install android-sdk or scoop install android-sdk" ;;
                python3) echo "choco install python or scoop install python" ;;
                sqlite3) echo "choco install sqlite or scoop install sqlite" ;;
                *) echo "manual installation required" ;;
            esac
            ;;
        *)
            echo "manual installation required"
            ;;
    esac
}

# Check if a tool is installed
check_tool() {
    local tool=$1
    local critical=$2
    local cmd=$3
    local version_cmd=$4

    if command -v "$cmd" &>/dev/null; then
        local version=""
        if [ -n "$version_cmd" ]; then
            # Special handling for java -version (writes to stderr)
            if [ "$tool" = "java" ]; then
                version=$("$version_cmd" 2>&1 | head -1 || echo "unknown")
            else
                version=$("$version_cmd" 2>/dev/null | head -1 || echo "unknown")
            fi
        fi
        tool_status[$tool]="found"
        tool_version[$tool]="$version"
        echo "${GREEN}✅${RESET} $tool found ${BLUE}($version)${RESET}"
    else
        local install_cmd=$(get_install_cmd "$tool" "$OS")
        tool_status[$tool]="missing"
        tool_version[$tool]=""
        echo "${RED}❌${RESET} $tool missing - ${YELLOW}$install_cmd${RESET}"
        if [ "$critical" = "true" ]; then
            : $((critical_missing++))
        else
            : $((optional_missing++))
        fi
    fi
}

# Print header
echo ""
echo "${BLUE}========================================${RESET}"
echo "${BLUE}  Android APK Audit - Preflight Check  ${RESET}"
echo "${BLUE}========================================${RESET}"
echo "${BLUE}OS: ${RESET}$OS"
echo "${BLUE}========================================${RESET}"
echo ""

# Critical tools
echo "${BLUE}Critical Tools:${RESET}"
check_tool "jadx" "true" "jadx" "jadx --version"
check_tool "apktool" "true" "apktool" "apktool --version"
check_tool "java" "true" "java" "java -version"
echo ""

# grep or ripgrep (at least one required)
echo "${BLUE}Search Tools (grep or rg required):${RESET}"
grep_found=false
rg_found=false

if command -v grep &>/dev/null; then
    grep --version &>/dev/null
    tool_status["grep"]="found"
    tool_version["grep"]="$(grep --version 2>/dev/null | head -1)"
    echo "${GREEN}✅${RESET} grep found ${BLUE}($(grep --version 2>/dev/null | head -1))${RESET}"
    grep_found=true
else
    echo "${RED}❌${RESET} grep missing - ${YELLOW}$(get_install_cmd "grep" "$OS")${RESET}"
fi

if command -v rg &>/dev/null; then
    rg --version &>/dev/null
    tool_status["rg"]="found"
    tool_version["rg"]="$(rg --version 2>/dev/null | head -1)"
    echo "${GREEN}✅${RESET} ripgrep (rg) found ${BLUE}($(rg --version 2>/dev/null | head -1))${RESET}"
    rg_found=true
else
    echo "${YELLOW}⚠️${RESET} ripgrep (rg) missing - ${YELLOW}$(get_install_cmd "ripgrep" "$OS")${RESET}"
fi

# Check for GNU grep on macOS (installed as ggrep via brew)
if [ "$OS" = "macOS" ]; then
    if command -v ggrep &>/dev/null; then
        tool_status["ggrep"]="found"
        tool_version["ggrep"]="$(ggrep --version 2>/dev/null | head -1)"
        echo "${GREEN}✅${RESET} GNU grep (ggrep) found ${BLUE}($(ggrep --version 2>/dev/null | head -1))${RESET}"
        echo "${BLUE}ℹ️${RESET}  Use 'ggrep -P' for PCRE patterns on macOS"
    else
        echo "${YELLOW}ℹ️${RESET}  GNU grep not installed — PCRE patterns require: ${YELLOW}brew install grep${RESET}"
    fi
fi

if [ "$grep_found" = false ] && [ "$rg_found" = false ]; then
    : $((critical_missing++))
fi
echo ""

# Check adb (critical for dynamic analysis)
check_tool "adb" "true" "adb" "adb version"
echo ""

# Optional tools
echo "${BLUE}Optional Tools:${RESET}"
check_tool "frida" "false" "frida" "frida --version"
check_tool "objection" "false" "objection" "objection --version"
check_tool "apkid" "false" "apkid" "apkid --version"
check_tool "zipalign" "false" "zipalign" "zipalign -v"
check_tool "keytool" "false" "keytool" "keytool -help"
check_tool "jarsigner" "false" "jarsigner" "jarsigner -help"
check_tool "apksigner" "false" "apksigner" "apksigner --version"
check_tool "python3" "false" "python3" "python3 --version"
check_tool "strings" "false" "strings" ""
check_tool "sqlite3" "false" "sqlite3" "sqlite3 --version"
echo ""

# Summary
total_critical=5
total_found_critical=$((total_critical - critical_missing))
total_optional=11
total_found_optional=$((total_optional - optional_missing))
total_tools=$((total_critical + total_optional))
total_found=$((total_found_critical + total_found_optional))

echo "${BLUE}========================================${RESET}"
echo "${BLUE}Summary:${RESET}"
echo "${GREEN}✅${RESET} $total_found/$total_tools tools found"
echo "${RED}❌${RESET} $critical_missing critical tools missing"
echo "${YELLOW}⚠️${RESET}  $optional_missing optional tools missing"

if [ "$critical_missing" -gt 0 ]; then
    echo ""
    echo "${RED}Missing critical tools:${RESET}"
    for tool in "${!tool_status[@]}"; do
        if [ "${tool_status[$tool]}" = "missing" ]; then
            case "$tool" in
                jadx|apktool|java|adb|grep) echo "  - $tool" ;;
            esac
        fi
    done
    echo ""
    echo "${RED}CRITICAL: Install missing tools to proceed with APK audit${RESET}"
    exit 1
else
    echo ""
    echo "${GREEN}✅ All critical tools installed! Ready for APK audit.${RESET}"
    exit 0
fi
