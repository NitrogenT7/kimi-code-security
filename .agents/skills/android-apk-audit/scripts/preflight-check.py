#!/usr/bin/env python3
"""
Universal Android APK Audit - Preflight Check Script

A cross-platform tool availability checker that works on Windows, macOS, and Linux.
Detects required tools for Android APK security analysis and provides installation
instructions based on the detected operating system.

Usage:
    python3 preflight-check.py           # Full report
    python3 preflight-check.py --json    # JSON output for scripts
    python3 preflight-check.py --quiet   # Only show missing tools
    python3 preflight-check.py --install # Show install commands only

Exit codes:
    0 - All critical tools found
    1 - Critical tools missing
    2 - Error during check
"""

import subprocess
import sys
import os
import platform
import json
from typing import Dict, List, Tuple, Optional


class ToolInfo:
    """Tool definition with metadata."""

    def __init__(
        self,
        name: str,
        description: str,
        critical: bool = False,
        version_flag: str = "--version",
        version_pattern: str = None,
    ):
        self.name = name
        self.description = description
        self.critical = critical
        self.version_flag = version_flag
        self.version_pattern = version_pattern
        self.found = False
        self.version = None


class SystemInfo:
    """System detection results."""

    def __init__(self):
        self.os = self._detect_os()
        self.arch = self._detect_arch()
        self.distro = self._detect_distro()
        self.wsl = self._detect_wsl()

    def _detect_os(self) -> str:
        """Detect operating system."""
        system = platform.system().lower()
        if system == "darwin":
            return "macos"
        return system

    def _detect_arch(self) -> str:
        """Detect system architecture."""
        machine = platform.machine().lower()
        if machine in ("amd64", "x86_64"):
            return "x86_64"
        elif machine in ("arm64", "aarch64"):
            return "arm64"
        elif machine in ("i386", "i686"):
            return "x86"
        return machine

    def _detect_wsl(self) -> bool:
        """Detect if running in Windows Subsystem for Linux."""
        try:
            with open("/proc/version", "r") as f:
                return "microsoft" in f.read().lower()
        except (IOError, OSError):
            return False

    def _detect_distro(self) -> Optional[str]:
        """Detect Linux distribution."""
        if self.os != "linux":
            return None

        # Check /etc/os-release first
        try:
            with open("/etc/os-release", "r") as f:
                for line in f:
                    if line.startswith("ID="):
                        distro_id = (
                            line.strip().split("=", 1)[1].strip().strip('"').strip("'")
                        )
                        # Map to package manager
                        if distro_id in ("ubuntu", "debian", "linuxmint"):
                            return "debian"
                        elif distro_id in ("arch", "manjaro"):
                            return "arch"
                        elif distro_id in ("fedora", "rhel", "centos"):
                            return "fedora"
        except (IOError, OSError):
            pass

        # Fallback: check for package manager
        for cmd, distro in [
            ("apt-get", "debian"),
            ("pacman", "arch"),
            ("dnf", "fedora"),
            ("yum", "fedora"),
        ]:
            if self._command_exists(cmd):
                return distro

        return "unknown"


class PreflightChecker:
    """Main preflight check engine."""

    def __init__(self):
        self.system = SystemInfo()
        self.results: List[Dict] = []
        self.android_sdk_info: Dict = {}

        # Define all tools to check
        self.tools = [
            # Critical tools
            ToolInfo(
                "jadx",
                "Decompile APK to Java",
                critical=True,
                version_flag="--version",
                version_pattern="jadx",
            ),
            ToolInfo(
                "apktool",
                "Decode APK resources",
                critical=True,
                version_flag="--version",
                version_pattern="apktool",
            ),
            ToolInfo(
                "java",
                "Java runtime",
                critical=True,
                version_flag="-version",
                version_pattern="version",
            ),
            ToolInfo(
                "adb",
                "Android Debug Bridge",
                critical=True,
                version_flag="version",
                version_pattern="Android Debug Bridge",
            ),
            # Important tools
            ToolInfo(
                "frida",
                "Dynamic instrumentation",
                critical=False,
                version_flag="--version",
                version_pattern="Frida",
            ),
            ToolInfo(
                "grep",
                "Text search",
                critical=True,  # FIX: Marked critical in Bash/PowerShell, consistent across platforms
                version_flag="--version",
                version_pattern="grep",
            ),
            ToolInfo(
                "rg",
                "Ripgrep (faster)",
                critical=True,  # FIX: Marked critical in Bash/PowerShell, consistent across platforms
                version_flag="--version",
                version_pattern="ripgrep",
            ),
            ToolInfo(
                "sqlite3",
                "SQLite CLI",
                critical=False,
                version_flag="--version",
                version_pattern="SQLite",
            ),
            # Optional tools
            ToolInfo(
                "objection",
                "Runtime exploration",
                critical=False,
                version_flag="--version",
                version_pattern="objection",
            ),
            ToolInfo(
                "apkid",
                "Framework detection",
                critical=False,
                version_flag="--version",
                version_pattern="apkid",
            ),
            ToolInfo(
                "zipalign",
                "Optimize APK",
                critical=False,
                version_flag="-v",
                version_pattern="Zipalign",
            ),
            ToolInfo(
                "apksigner",
                "Sign APKs",
                critical=False,
                version_flag="--version",
                version_pattern="apksigner",
            ),
            ToolInfo(
                "jarsigner",
                "Sign JARs",
                critical=False,
                version_flag="-help",
                version_pattern="jarsigner",
            ),
            ToolInfo(
                "keytool",
                "Key management",
                critical=False,
                version_flag="-help",
                version_pattern="keytool",
            ),
            ToolInfo(
                "strings",
                "Extract strings",
                critical=False,
                version_flag="",
                version_pattern=None,
            ),
            ToolInfo(
                "python3",
                "Python 3",
                critical=False,
                version_flag="--version",
                version_pattern="Python",
            ),
        ]

    def _command_exists(self, cmd: str) -> bool:
        """Check if a command exists in PATH."""
        try:
            with open(os.devnull, "w") as devnull:
                result = subprocess.call(
                    ["which", cmd] if self.system.os != "windows" else ["where", cmd],
                    stdout=devnull,
                    stderr=devnull,
                )
            return result == 0
        except OSError:
            return False

    def _get_version(self, tool: ToolInfo) -> Optional[str]:
        """Extract version from tool output."""
        try:
            result = subprocess.run(
                [tool.name, tool.version_flag],
                capture_output=True,
                text=True,
                timeout=5,
            )

            if result.returncode != 0:
                return None

            # Extract version from output
            if tool.name == "java":
                for line in result.stdout.splitlines() + result.stderr.splitlines():
                    if "version" in line.lower():
                        # Extract version number
                        parts = line.split('"')
                        if len(parts) > 1:
                            return parts[1].strip('"')

            elif tool.name == "adb":
                for line in result.stdout.splitlines():
                    if "version" in line.lower():
                        # Parse version number from line like "Android Debug Bridge version 1.0.41"
                        import re

                        version_match = re.search(r"(\d+\.\d+[\.\d]*)", line)
                        if version_match:
                            return version_match.group(1)
                        return line.strip()

            elif tool.name == "grep":
                for line in result.stdout.splitlines():
                    if "grep" in line.lower() or "bsd" in line.lower():
                        # Parse version number if present
                        import re

                        version_match = re.search(r"(\d+\.\d+[\.\d]*)", line)
                        if version_match:
                            return version_match.group(1)
                        return line.strip()

            elif tool.name == "ripgrep":
                for line in result.stdout.splitlines():
                    if "ripgrep" in line.lower():
                        return line.strip()

            else:
                # Generic extraction - first line containing version
                for line in result.stdout.splitlines() + result.stderr.splitlines():
                    line_lower = line.lower()
                    if (
                        tool.version_pattern
                        and tool.version_pattern.lower() in line_lower
                    ):
                        return line.strip()
                    if "version" in line_lower or "v" in line:
                        return line.strip()

        except (OSError, subprocess.TimeoutExpired, subprocess.CalledProcessError):
            pass

        return None

    def check_tool(self, tool: ToolInfo) -> Dict:
        """Check if a tool is available and get its version."""
        if not self._command_exists(tool.name):
            tool.found = False
            tool.version = "MISSING"
        else:
            tool.found = True
            version = self._get_version(tool)
            tool.version = version if version else "FOUND (no version)"

        result = {
            "name": tool.name,
            "description": tool.description,
            "critical": tool.critical,
            "found": tool.found,
            "version": tool.version,
        }

        self.results.append(result)
        return result

    def check_all_tools(self) -> None:
        """Check all defined tools."""
        for tool in self.tools:
            self.check_tool(tool)

    def check_android_sdk(self) -> Dict:
        """Check Android SDK installation."""
        sdk_info = {
            "android_home": None,
            "android_sdk_root": None,
            "sdk_path": None,
            "build_tools": None,
            "platform_tools": False,
            "aapt2": False,
            "d8": False,
            "apksigner_found": False,
        }

        # Check environment variables
        sdk_info["android_home"] = os.environ.get("ANDROID_HOME")
        sdk_info["android_sdk_root"] = os.environ.get("ANDROID_SDK_ROOT")

        # Determine SDK path
        sdk_path = sdk_info["android_sdk_root"] or sdk_info["android_home"]

        # Check common SDK paths per OS
        if not sdk_path:
            common_paths = []

            if self.system.os == "macos":
                common_paths = [
                    os.path.expanduser("~/Library/Android/sdk"),
                    "/usr/local/share/android-sdk",
                ]
            elif self.system.os == "linux":
                common_paths = [os.path.expanduser("~/Android/Sdk"), "/opt/android-sdk"]
            elif self.system.os == "windows":
                common_paths = [
                    os.path.expanduser("~/AppData/Local/Android/Sdk"),
                    "C:\\Android\\Sdk",
                ]

            for path in common_paths:
                if os.path.exists(path):
                    sdk_path = path
                    break

        sdk_info["sdk_path"] = sdk_path

        if sdk_path and os.path.exists(sdk_path):
            # Check build-tools
            build_tools_dir = os.path.join(sdk_path, "build-tools")
            if os.path.exists(build_tools_dir):
                versions = [
                    d
                    for d in os.listdir(build_tools_dir)
                    if os.path.isdir(os.path.join(build_tools_dir, d))
                ]
                if versions:
                    latest = sorted(versions, reverse=True)[0]
                    sdk_info["build_tools"] = os.path.join(build_tools_dir, latest)

            # Check platform-tools
            platform_tools_dir = os.path.join(sdk_path, "platform-tools")
            sdk_info["platform_tools"] = os.path.exists(platform_tools_dir)

            # Check specific tools in build-tools
            if sdk_info["build_tools"]:
                for tool in ["aapt2", "d8", "apksigner"]:
                    tool_path = os.path.join(sdk_info["build_tools"], tool)
                    if self.system.os == "windows":
                        tool_path += ".bat"
                    sdk_info[f"{tool}_found"] = os.path.exists(tool_path) and os.access(
                        tool_path, os.X_OK
                    )

        self.android_sdk_info = sdk_info
        return sdk_info

    def get_install_commands(self) -> Dict[str, List[str]]:
        """Get install commands for missing tools by OS."""
        commands = {}

        # Find missing tools
        missing_tools = [r["name"] for r in self.results if not r["found"]]
        missing_critical = [
            r["name"] for r in self.results if not r["found"] and r["critical"]
        ]

        # Map tools to package names per OS
        package_map = {
            "macos": {
                "apktool": "apktool",
                "adb": "android-platform-tools",
                "jadx": "jadx",
                "java": "openjdk",
                "grep": "grep",
                "sqlite3": "sqlite3",
                "strings": "binutils",
                "zipalign": "android-platform-tools",  # Comes with SDK
                "apksigner": "android-platform-tools",  # Comes with SDK
            },
            "debian": {
                "apktool": "apktool",
                "adb": "android-tools-adb",
                "jadx": "jadx",
                "java": "default-jdk",
                "grep": "grep",
                "sqlite3": "sqlite3",
                "strings": "binutils",
                "keytool": "default-jdk",
                "jarsigner": "default-jdk",
            },
            "arch": {
                "apktool": "apktool",
                "adb": "android-tools",
                "jadx": "jadx",
                "java": "jdk-openjdk",
                "grep": "grep",
                "sqlite3": "sqlite",
                "strings": "binutils",
                "keytool": "jdk-openjdk",
                "jarsigner": "jdk-openjdk",
            },
            "fedora": {
                "apktool": "apktool",
                "adb": "android-tools",
                "jadx": "jadx",
                "java": "java-devel",
                "grep": "grep",
                "sqlite3": "sqlite",
                "strings": "binutils",
            },
            "windows": {
                "apktool": "apktool",
                "adb": "adb",
                "jadx": "jadx",
                "java": "openjdk",
                "grep": "grep",  # WSL or Git Bash
                "sqlite3": "sqlite",
            },
        }

        # Python tools
        python_tools = ["objection", "apkid"]

        # Build commands
        if self.system.os == "macos":
            commands["brew"] = []
            for tool in missing_tools:
                if tool in package_map["macos"]:
                    pkg = package_map["macos"][tool]
                    if pkg not in commands["brew"]:
                        commands["brew"].append(pkg)

            commands["pip"] = [tool for tool in python_tools if tool in missing_tools]

        elif self.system.os == "linux":
            distro = self.system.distro or "debian"

            if distro == "debian":
                commands["apt"] = []
                for tool in missing_tools:
                    if tool in package_map["debian"]:
                        pkg = package_map["debian"][tool]
                        if pkg not in commands["apt"]:
                            commands["apt"].append(pkg)
                commands["pip"] = [
                    tool for tool in python_tools if tool in missing_tools
                ]

            elif distro == "arch":
                commands["pacman"] = []
                for tool in missing_tools:
                    if tool in package_map["arch"]:
                        pkg = package_map["arch"][tool]
                        if pkg not in commands["pacman"]:
                            commands["pacman"].append(pkg)
                commands["pip"] = [
                    tool for tool in python_tools if tool in missing_tools
                ]

            elif distro == "fedora":
                commands["dnf"] = []
                for tool in missing_tools:
                    if tool in package_map["fedora"]:
                        pkg = package_map["fedora"][tool]
                        if pkg not in commands["dnf"]:
                            commands["dnf"].append(pkg)
                commands["pip"] = [
                    tool for tool in python_tools if tool in missing_tools
                ]

        elif self.system.os == "windows":
            commands["choco"] = []
            commands["scoop"] = []
            for tool in missing_tools:
                if tool in package_map["windows"]:
                    pkg = package_map["windows"][tool]
                    commands["choco"].append(pkg)
                    commands["scoop"].append(pkg)
            commands["pip"] = [tool for tool in python_tools if tool in missing_tools]

        return commands

    def get_android_sdk_install_cmd(self) -> Optional[str]:
        """Get Android SDK build-tools install command."""
        if self.android_sdk_info["sdk_path"]:
            return f'sdkmanager "build-tools;36.0.0" "platform-tools"'
        return None

    def print_output(
        self, json_mode: bool = False, quiet: bool = False, install_only: bool = False
    ) -> None:
        """Print formatted output."""
        if json_mode:
            self._print_json()
        elif install_only:
            self._print_install_only()
        elif quiet:
            self._print_quiet()
        else:
            self._print_full()

    def _print_full(self) -> None:
        """Print full report."""
        os_label = f"{self.system.os}"
        if self.system.os == "linux" and self.system.distro:
            os_label += f" ({self.system.distro})"
        if self.system.wsl:
            os_label += " [WSL]"
        os_label += f" {self.system.arch}"

        print("\n" + "=" * 40)
        print(f"  Android APK Audit - Preflight Check")
        print(f"  OS: {os_label}")
        print("=" * 40 + "\n")

        # Print tool results
        for result in self.results:
            status = "✅" if result["found"] else "❌"
            version = result["version"] if result["found"] else "MISSING"
            critical_marker = " [CRITICAL]" if result["critical"] else ""

            print(
                f"[{status}] {result['name']:<12} {version:<15} - {result['description']}{critical_marker}"
            )

        # Summary
        total = len(self.results)
        found = sum(1 for r in self.results if r["found"])
        missing = total - found
        missing_critical = [
            r["name"] for r in self.results if not r["found"] and r["critical"]
        ]

        print("\n" + "-" * 40)
        print(f"  SUMMARY: {found}/{total} tools found")
        if missing > 0:
            missing_names = ", ".join(
                [r["name"] for r in self.results if not r["found"]]
            )
            print(f"  Missing: {missing_names}")
        print("-" * 40 + "\n")

        # Android SDK info
        print("Android SDK:")
        if self.android_sdk_info["sdk_path"]:
            print(f"  ✅ SDK found at: {self.android_sdk_info['sdk_path']}")
            if self.android_sdk_info["build_tools"]:
                print(f"  ✅ Build-tools: {self.android_sdk_info['build_tools']}")
            else:
                print("  ❌ Build-tools: MISSING")
            if self.android_sdk_info["platform_tools"]:
                print("  ✅ Platform-tools: found")
            else:
                print("  ❌ Platform-tools: MISSING")
        else:
            print("  ❌ SDK not found (set ANDROID_HOME or ANDROID_SDK_ROOT)")
        print()

        # Install commands
        if missing > 0 or not self.android_sdk_info["build_tools"]:
            self._print_install_section()

    def _print_quiet(self) -> None:
        """Print only missing tools."""
        for result in self.results:
            if not result["found"]:
                critical_marker = " [CRITICAL]" if result["critical"] else ""
                print(
                    f"❌ {result['name']:<12} - {result['description']}{critical_marker}"
                )

        if not self.android_sdk_info["build_tools"]:
            print("❌ Android SDK build-tools")

    def _print_install_only(self) -> None:
        """Print only install commands."""
        self._print_install_section()

    def _print_install_section(self) -> None:
        """Print installation commands."""
        commands = self.get_install_commands()
        sdk_cmd = self.get_android_sdk_install_cmd()

        # Install tools
        for manager, packages in commands.items():
            if packages:
                if manager == "brew":
                    print(f"\nInstall tools (macOS):")
                    print(f"  brew install {' '.join(packages)}")
                elif manager == "apt":
                    print(f"\nInstall tools (Debian/Ubuntu):")
                    print(f"  sudo apt update && sudo apt install {' '.join(packages)}")
                elif manager == "pacman":
                    print(f"\nInstall tools (Arch/Manjaro):")
                    print(f"  sudo pacman -S {' '.join(packages)}")
                elif manager == "dnf":
                    print(f"\nInstall tools (Fedora/RHEL):")
                    print(f"  sudo dnf install {' '.join(packages)}")
                elif manager == "choco":
                    print(f"\nInstall tools (Windows - Chocolatey):")
                    print(f"  choco install {' '.join(packages)}")
                elif manager == "scoop":
                    print(f"\nInstall tools (Windows - Scoop):")
                    print(f"  scoop install {' '.join(packages)}")
                elif manager == "pip":
                    print(f"\nInstall Python tools:")
                    for pkg in packages:
                        print(f"  pip install {pkg}")

        # Install Android SDK build-tools
        if sdk_cmd:
            print(f"\nInstall Android SDK build-tools:")
            print(f"  {sdk_cmd}")
        elif not self.android_sdk_info["build_tools"]:
            print(f"\nInstall Android SDK:")
            if self.system.os == "macos":
                print("  brew install --cask android-commandlinetools")
            elif self.system.os == "linux":
                print("  Download: https://developer.android.com/studio#command-tools")
            elif self.system.os == "windows":
                print("  Download: https://developer.android.com/studio#command-tools")

        print()

    def _print_json(self) -> None:
        """Print JSON output."""
        output = {
            "system": {
                "os": self.system.os,
                "arch": self.system.arch,
                "distro": self.system.distro,
                "wsl": self.system.wsl,
            },
            "tools": self.results,
            "android_sdk": self.android_sdk_info,
            "summary": {
                "total": len(self.results),
                "found": sum(1 for r in self.results if r["found"]),
                "missing": sum(1 for r in self.results if not r["found"]),
                "missing_critical": [
                    r["name"] for r in self.results if not r["found"] and r["critical"]
                ],
            },
        }
        print(json.dumps(output, indent=2))

    def get_exit_code(self) -> int:
        """Calculate exit code based on results."""
        missing_critical = [
            r["name"] for r in self.results if not r["found"] and r["critical"]
        ]
        if missing_critical:
            return 1
        return 0


def main():
    """Main entry point."""
    try:
        # Parse arguments
        args = sys.argv[1:]
        json_mode = "--json" in args
        quiet_mode = "--quiet" in args
        install_only = "--install" in args

        # Validate flags
        if len(args) > 3:
            print(
                "Usage: preflight-check.py [--json|--quiet|--install]", file=sys.stderr
            )
            return 2

        # Run checks
        checker = PreflightChecker()
        checker.check_all_tools()
        checker.check_android_sdk()

        # Print output
        checker.print_output(
            json_mode=json_mode, quiet=quiet_mode, install_only=install_only
        )

        # Exit
        return checker.get_exit_code()

    except KeyboardInterrupt:
        print("\nInterrupted by user", file=sys.stderr)
        return 130
    except Exception as e:
        print(f"Error during preflight check: {e}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    sys.exit(main())
