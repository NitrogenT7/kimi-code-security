# Environment Setup & Toolchain

**Cross-platform setup guide for Android APK security auditing. Works with Claude, GPT-4, Llama, or any AI agent.**

## Minimal Local Toolchain

Install these binaries on your system:

| Tool | Purpose | Required |
|------|---------|----------|
| jadx | APK decompilation | Yes |
| apktool | Resource decoding | Yes |
| grep OR ripgrep | Pattern searching | Yes |
| strings | Binary string extraction | Recommended |
| adb | Device communication | Dynamic analysis |
| frida-tools | Runtime instrumentation | Dynamic analysis |
| python3 | Helper scripts | Recommended |
| java | apktool dependency | Yes |

## MCP Server Integration (Optional)

For AI assistants that support MCP (Model Context Protocol) servers:

### Filesystem MCP
Use when audit artifacts are stored outside the repo root or need structured file access.

### ADB MCP
Wrap common commands:
- Install APK
- Start activity with extras
- Send broadcast intents
- Inspect package info
- Stream logcat

### Frida MCP
Wrap common commands:
- Attach to package
- Spawn app
- Load script
- Capture method arguments and return values

## Practical Recommendation

**Lightest setup:** Enable built-in `bash`, `edit`, `write`, `grep`, `list`, and `glob` tools, then install `jadx`, `apktool`, `adb`, and `frida-tools` on your system.

**Full setup:** Add MCP servers for structured runtime orchestration instead of raw shell commands.

## Platform-Specific Notes

| Platform | Package Manager | Notes |
|----------|-----------------|-------|
| macOS | Homebrew (`brew install`) | Easiest setup |
| Linux | apt/dnf/pacman | Use `sudo` for system installs |
| Windows | Chocolatey/Scoop | WSL2 recommended for full support |

See `tool-installation.md` for detailed platform-specific installation instructions.
