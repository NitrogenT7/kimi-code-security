# OpenCode Tooling Reference for Android APK Audit

## 1. Minimal Toolchain per OS

### macOS
Core tools required for APK analysis:

- **jadx**: Java decompiler with excellent output quality
- **apktool**: Decode APK resources and manifest
- **adb**: Android Debug Bridge for runtime testing
- **grep**: Pattern matching for searching decompiled code
- **java**: Runtime required by apktool and some tools

**Installation (Homebrew):**
```bash
# Core tools
brew install jadx apktool android-platform-tools ripgrep

# Java (JDK 17 recommended)
brew install --cask temurin
```

**Verify installation:**
```bash
jadx --version
apktool --version
adb version
rg --version
java -version
```

---

### Linux
Same core tools, different installation methods:

**Ubuntu/Debian:**
```bash
# Note: jadx does NOT exist in apt repositories, must download from GitHub releases
sudo apt install -y wget gnupg
wget -q https://github.com/skylot/jadx/releases/download/v1.5.5/jadx-1.5.5.zip -O jadx.zip
sudo unzip jadx.zip -d /opt/jadx
sudo ln -s /opt/jadx/bin/jadx /usr/local/bin/jadx
sudo ln -s /opt/jadx/bin/jadx-gui /usr/local/bin/jadx-gui

# Other tools
sudo apt install -y apktool android-tools-adb ripgrep openjdk-17-jdk
```

**Arch Linux:**
```bash
sudo pacman -S jadx apktool android-tools ripgrep jdk17-openjdk
```

**Fedora:**
```bash
# Note: jadx does NOT exist in dnf repositories, must download from GitHub releases
sudo dnf install -y apktool android-tools ripgrep java-17-openjdk-devel wget unzip
wget -q https://github.com/skylot/jadx/releases/download/v1.5.5/jadx-1.5.5.zip -O /tmp/jadx.zip
sudo unzip /tmp/jadx.zip -d /opt/jadx
sudo ln -s /opt/jadx/bin/jadx /usr/local/bin/jadx
sudo ln -s /opt/jadx/bin/jadx-gui /usr/local/bin/jadx-gui
```

---

### Windows
Two approaches: WSL2 (recommended) or native.

**WSL2 (Ubuntu inside WSL):**
```bash
# Same as Linux Ubuntu instructions above
sudo apt install -y apktool android-tools-adb ripgrep openjdk-17-jdk

# Download jadx manually and add to PATH
wget -q https://github.com/skylot/jadx/releases/download/v1.5.5/jadx-1.5.5.zip -O jadx.zip
unzip jadx.zip -d ~/jadx
echo 'export PATH="$HOME/jadx/bin:$PATH"' >> ~/.bashrc
source ~/.bashrc
```

**Native Windows (PowerShell with Chocolatey):**
```powershell
# Install Chocolatey if not present
Set-ExecutionPolicy Bypass -Scope Process -Force; [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.ServicePointManager]::SecurityProtocol -bor 3072; iex ((New-Object System.Net.WebClient).DownloadString('https://community.chocolatey.org/install.ps1'))

# Install tools
choco install jadx apktool adb ripgrep temurin17
```

**Native Windows (PowerShell with Scoop):**
```powershell
# Install Scoop if not present
Set-ExecutionPolicy RemoteSigned -Scope CurrentUser
Invoke-RestMethod -Uri https://get.scoop.sh | Invoke-Expression

# Install tools
scoop install jadx apktool adb ripgrep temurin17-jdk
```

**Java Alternative (Adoptium):**
- Download from: https://adoptium.net/temurin/releases/
- Choose Windows x64 MSI installer for JDK 17
- Verify: `java -version` in Command Prompt or PowerShell

---

## 2. Cross-OS Compatibility Notes

### grep Differences

macOS uses BSD grep while Linux uses GNU grep. This affects pattern syntax:

| Feature | macOS BSD grep | Linux GNU grep | ripgrep (rg) |
|---------|----------------|----------------|--------------|
| PCRE (`-P`) | **NOT supported** | Supported | **Supported** |
| Extended Regex (`-E`) | Supported | Supported | Supported (default) |
| Perl features | No | Yes | Yes |
| Binary file detection | `-I` | `-I` | `-I` |
| Ignore case | `-i` | `-i` | `-i` |
| Line numbers | `-n` | `-n` | `-n` |

**Example: Searching for API keys**
```bash
# macOS (BSD grep) - NO -P flag
grep -rn "API.*key\s*=\s*['\"][^'\"]+['\"]" ./

# Linux (GNU grep) - -P works
grep -rnP "API.*key\s*=\s*['\"][^'\"]+['\"]" ./

# Cross-platform solution - use ripgrep
rg "API.*key\s*=\s*['\"][^'\"]+['\"]" ./
```

**Recommendation:** Use `ripgrep` (`rg`) for cross-platform consistency. It's faster and has unified behavior across all operating systems.

### Path Handling

Path separators and environment variables differ:

| Platform | Separator | Home | PATH | Example |
|----------|-----------|------|------|---------|
| macOS/Linux | `/` | `$HOME` | `$PATH` | `$HOME/audit/app.apk` |
| Windows PowerShell | `\` | `$env:USERPROFILE` | `$env:PATH` | `$env:USERPROFILE\audit\app.apk` |
| Windows Git Bash | `/` | `$HOME` | `$PATH` | `/c/Users/$USER/audit/app.apk` |

**Python Best Practice:**
```python
# Always use os.path.join or pathlib
import os
from pathlib import Path

# Cross-platform paths
apk_path = Path.home() / "audit" / "app.apk"
output_dir = Path(__file__).parent / "decompiled"
```

**Shell Script Best Practice:**
```bash
#!/usr/bin/env bash
# This works on macOS, Linux, and Git Bash
APK_PATH="$HOME/audit/app.apk"
OUTPUT_DIR="$(dirname "$0")/decompiled"
```

### Shell Differences

Default shells vary:

| Platform | Default Shell | Alternative |
|----------|---------------|-------------|
| macOS (Catalina+) | zsh | bash, fish |
| Linux | bash | zsh, fish |
| Windows | PowerShell | Git Bash, WSL, cmd |

**Script Shebang:**
```bash
#!/usr/bin/env bash    # Portable - finds bash in PATH
#!/usr/bin/env zsh     # For zsh-specific scripts
#!/usr/bin/env python3 # For Python scripts
```

**Zsh vs Bash Compatibility:**
```bash
# Arrays work differently
# Bash: array=(a b c)
# Zsh: array=(a b c)

# Both support:
for item in a b c; do
  echo "$item"
done
```

### Java Path Differences

| Platform | Default Location | Environment Variable |
|----------|------------------|---------------------|
| macOS | `/Library/Java/JavaVirtualMachines/temurin-17.jdk/Contents/Home` | `$JAVA_HOME` |
| Linux | `/usr/lib/jvm/java-17-openjdk-amd64/` | `$JAVA_HOME` |
| Windows | `C:\Program Files\Eclipse Adoptium\jdk-17.0.x.x-hotspot\` | `$env:JAVA_HOME` |

**Check Java installation:**
```bash
# All platforms
java -version
echo $JAVA_HOME         # macOS/Linux
echo $env:JAVA_HOME     # PowerShell
```

**Set JAVA_HOME if needed:**
```bash
# macOS/Linux (add to ~/.zshrc or ~/.bashrc)
export JAVA_HOME=$(/usr/libexec/java_home -v 17)

# Windows PowerShell
$env:JAVA_HOME = "C:\Program Files\Eclipse Adoptium\jdk-17.0.x.x-hotspot"
```

### Android SDK Path

ADB tools location varies:

| Platform | Default ADB Location | Platform-Tools Install |
|----------|---------------------|----------------------|
| macOS | `~/Library/Android/sdk/platform-tools/adb` | `brew install android-platform-tools` |
| Linux | `~/Android/Sdk/platform-tools/adb` | `sudo apt install android-tools-adb` |
| Windows (PowerShell) | `$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe` | `choco install adb` |
| Windows (Git Bash) | `~/AppData/Local/Android/Sdk/platform-tools/adb.exe` | `scoop install adb` |

---

## 3. MCP Server Configuration (Optional)

MCP (Model Context Protocol) servers provide structured access to tools beyond built-in capabilities.

### filesystem MCP

Use when workspace doesn't expose all directories needed for APK audit artifacts.

**Example config for Claude Desktop:**
```json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": [
        "-y",
        "@modelcontextprotocol/server-filesystem",
        "/path/to/audit/workspace"
      ]
    }
  }
}
```

**When to use:**
- Audit artifacts stored outside repo root
- Analyzing system APKs requiring elevated permissions
- Working with large decompiled output in external directory

### adb MCP

Wrap common ADB commands for structured, stateful access to device.

**Example operations to wrap:**
```json
{
  "tools": {
    "adb_install": {
      "description": "Install APK on connected device",
      "parameters": {
        "apk_path": "string",
        "options": "array"
      }
    },
    "adb_start_activity": {
      "description": "Launch an activity with optional extras",
      "parameters": {
        "package": "string",
        "activity": "string",
        "extras": "object"
      }
    },
    "adb_send_broadcast": {
      "description": "Send broadcast intent",
      "parameters": {
        "action": "string",
        "extras": "object"
      }
    },
    "adb_dump_package": {
      "description": "Get package information",
      "parameters": {
        "package": "string"
      }
    },
    "adb_logcat": {
      "description": "Stream or filter logcat output",
      "parameters": {
        "filter": "string",
        "tail": "number"
      }
    }
  }
}
```

**Benefits:**
- Structured JSON responses vs parsing shell output
- Maintain device connection state
- Error handling with descriptive messages
- Async logcat streaming

### frida MCP

Wrap Frida commands for runtime instrumentation and dynamic analysis.

**Example operations to wrap:**
```json
{
  "tools": {
    "frida_spawn": {
      "description": "Spawn app and attach instrumentation",
      "parameters": {
        "package": "string",
        "script": "string"
      }
    },
    "frida_attach": {
      "description": "Attach to running process",
      "parameters": {
        "package": "string",
        "script": "string"
      }
    },
    "frida_load_script": {
      "description": "Load and execute Frida script",
      "parameters": {
        "script_path": "string"
      }
    },
    "frida_trace_method": {
      "description": "Trace method calls and arguments",
      "parameters": {
        "package": "string",
        "class": "string",
        "method": "string"
      }
    },
    "frida_hook_exported": {
      "description": "Hook all exported components",
      "parameters": {
        "package": "string"
      }
    }
  }
}
```

**Common Frida scripts to include:**
- SSL pinning bypass
- Root detection bypass
- Method tracing
- Class enumeration
- Hooking native functions

---

## 4. Token Optimization Strategies

APK decompilation generates MASSIVE output (100k+ lines of decompiled code). Token budget must be managed carefully.

### Use Targeted Decompilation

**Jadx with resource exclusion:**
```bash
# Only decompile code, skip resources (saves 30-50% tokens)
jadx --no-res -d output_code_only app.apk

# Only decompile resources (for manifest analysis)
apktool d app.apk -o output_resources_only
```

### Search Before Reading Full Files

```bash
# First: Find files matching pattern (fast, low token cost)
rg -l "Hardcoded.*password" ./decompiled

# Then: Read only the matching files
rg "Hardcoded.*password" ./decompiled/com/app/utils/Crypto.java
```

### Use Chunked Reading for Large Files

```python
# Read large Java files in chunks
def read_file_chunks(file_path, chunk_size=2000):
    with open(file_path, 'r') as f:
        while True:
            chunk = [next(f) for _ in range(chunk_size)]
            if not chunk:
                break
            yield chunk
```

### Prioritize App Namespace

```bash
# Focus on app code, skip libraries
rg "password" ./decompiled/com/app/       # App namespace (PRIORITIZE)
rg "password" ./decompiled/com/google/    # Libraries (DEPRIORITIZE)
rg "password" ./decompiled/androidx/     # AndroidX (SKIP)
```

### Use Pre-filtering Scripts

The `auto-audit-static.sh` script included with this skill pre-filters findings to reduce token consumption:

```bash
# Run auto-audit to get prioritized findings first
./auto-audit-static.sh app.apk ./audit_output

# Review findings file (much smaller than full decompile)
cat ./audit_output/00_SUMMARY.md
cat ./audit_output/01_CRITICAL_FINDINGS.md
```

### Read Strategy Checklist

1. **Start with** `AndroidManifest.xml` - small file, high impact
2. **Search for** specific patterns using `rg` before reading files
3. **Focus on** app namespace code first
4. **Use** `--no-res` flag in jadx when resources not needed
5. **Consult** pre-generated findings before decompiling
6. **Read** only relevant sections of large files
7. **Avoid** dumping entire decompiled tree to context

### Estimate Token Impact

| Artifact | Lines | Tokens (approx) |
|----------|-------|-----------------|
| AndroidManifest.xml | 100-500 | 5K-25K |
| Small APK decompiled (code only) | 10K-50K | 500K-2.5M |
| Large APK decompiled (code only) | 100K+ | 5M+ |
| Auto-audit summary | 200-500 | 10K-25K |
| Single Java file | 200-500 | 10K-25K |

---

## 5. Performance Tips

### Jadx Parallel Decompilation

```bash
# Use all CPU cores (default = 4)
jadx --threads-count 8 app.apk

# Combine with resource exclusion for speed
jadx --threads-count 8 --no-res -d output app.apk
```

### Ripgrep for Fast Searches

```bash
# Ripgrep is 10-100x faster than grep for large codebases
rg "password" ./decompiled  # Faster
grep -r "password" ./decompiled  # Slower

# Use parallel jobs in ripgrep
rg -j 4 "password" ./decompiled

# Use file type filtering
rg -g "*.java" "password" ./decompiled
```

### Decompile Once, Analyze Multiple Times

```bash
# Decompile once to persistent location
jadx -d /persistent/audit/app app.apk

# Run multiple analyses on same decompile
cd /persistent/audit/app
rg "secret" .
rg "http://" .
rg "SharedPreferences" .
```

### Two-Pass Search Strategy

```bash
# Pass 1: Find files containing pattern (fast)
rg -l "API_KEY" ./decompiled > matching_files.txt

# Pass 2: Read matching files in detail
while read file; do
  echo "=== $file ==="
  rg "API_KEY" "$file"
done < matching_files.txt
```

### Memory Management

```bash
# Jadx memory limit for large APKs
jadx -Xmx4g app.apk  # Use 4GB heap

# Apktool memory
export JAVA_OPTS="-Xmx2g"
apktool d app.apk
```

### ADB Performance

```bash
# Disable connection timeout for long-running commands
adb shell settings put global adb_connection_timeout 0

# Pull specific file instead of entire directory
adb pull /data/data/com.app/databases/app.db .

# Use grep on device to reduce network transfer
adb shell "grep -r 'password' /data/data/com.app/"
```

---

## 6. Tool Version Compatibility

### Jadx

**Recommended Version:** 1.5.5 or later

| Version | Notes |
|---------|-------|
| < 1.4.0 | Poor decompilation of obfuscated code |
| 1.4.x | Good, but some Kotlin issues |
| 1.5.x | Best decompilation quality, Kotlin support improved |
| 1.5.5+ | Latest stable with bug fixes and improvements |

**Check version:**
```bash
jadx --version
```

### Apktool

**Recommended Version:** 3.0.0 or later

| Version | Notes |
|---------|-------|
| < 2.7.0 | No APK v3/v4 signing support |
| 2.7.x | Basic v3 support |
| 2.9.x | Improved v3/v4 signing, resource decoding |
| 3.0.0+ | Latest major version with full v3/v4 signing and remastered architecture |

**Check version:**
```bash
apktool --version
```

### Frida

**Critical:** Match frida-tools version to frida-server version on device.

| frida-server | frida-tools |
|--------------|-------------|
| 17.7.x | 17.7.x |
| 17.x.x | 17.x.x |
| 16.x.x | 16.x.x |
| 15.x.x | 15.x.x |
| 14.x.x | 14.x.x |

**Check versions:**
```bash
# Host
frida --version

# Device (ADB)
adb shell "su -c 'frida-server --version'"
```

**Mismatch symptoms:**
- Connection refused errors
- Protocol mismatch messages
- Commands hanging

### ADB

**Recommendation:** Always use latest platform-tools from official Android SDK.

| Platform | Installation |
|----------|-------------|
| macOS | `brew install android-platform-tools` |
| Linux | `sudo apt install android-tools-adb` |
| Windows | `choco install adb` |

### Java

**Minimum:** JDK 11
**Recommended:** JDK 17 (LTS)

| JDK Version | Support |
|-------------|---------|
| JDK 8 | Deprecated, may have issues with modern tools |
| JDK 11 | Minimum viable |
| JDK 17 | Recommended (current LTS) |
| JDK 21 | Future-proof, but may have compatibility issues |

**Check version:**
```bash
java -version
# Should output 17.x.x or similar
```

---

## Frida Script Resources

### Essential Collections

| Resource | URL | Description |
|----------|-----|-------------|
| **FriList** | https://github.com/rsenet/FriList | 184★ — 100+ scripts organized by category (Observer, Bypass, Static) |
| **Frida CodeShare** | https://codeshare.frida.re/ | Official community repository, searchable |
| **HTTP Toolkit** | https://github.com/httptoolkit/frida-interception-and-unpinning | Gold standard SSL unpinning |
| **FridaBypassKit** | https://github.com/okankurtuluss/FridaBypassKit | 114★ — All-in-one bypass kit |
| **WithSecureLABS** | https://github.com/WithSecureLABS/android-keystore-audit | Professional keystore audit |
| **akabe1 Scripts** | https://github.com/akabe1/my-FRIDA-scripts | Multiple SSL/network bypass scripts |
| **apkunpacker** | https://github.com/apkunpacker/Root_Bypass | Root detection bypass |

### Quick Usage with CodeShare

```bash
# SSL unpinning (akabe1)
frida --codeshare akabe1/frida-multiple-unpinning -U -f com.target.app

# Root bypass (apkunpacker)
frida --codeshare apkunpacker/hideroot -U -f com.target.app

# Biometric bypass (ax)
frida --codeshare ax/universal-android-biometric-bypass -U -f com.target.app

# Universal SSL bypass (pcipolloni)
frida --codeshare pcipolloni/universal-android-ssl-pinning-bypass-with-frida -U -f com.target.app
```

### Using Objection (Runtime Toolkit)

Objection provides a CLI for common Frida operations without writing scripts:

```bash
# Install
pip3 install objection

# Launch
objection -g com.target.app explore

# Common commands
android sslpinning disable     # SSL pinning bypass
android root disable           # Root detection bypass
android keystore list          # List keystore entries
android heap search instances <class>  # Search heap
sqlite connect <db_path>       # Browse SQLite databases
```

---

## 7. Common Issues & Fixes

| Issue | Cause | Fix |
|-------|-------|-----|
| **apktool decode fails with "framework not found"** | Android framework resources not installed | Install framework: `apktool if framework-res.apk` or use `--frame-path` |
| **jadx out of memory error** | Large APK exceeds default heap | Increase heap: `jadx -Xmx4g app.apk` or `jadx -Xmx8g app.apk` |
| **adb device not found / unauthorized** | USB debugging disabled or authorization revoked | Enable USB debugging in Developer Options, then accept prompt on device |
| **adb permission denied** | Device not rooted, insufficient permissions | Use `adb shell` for unprivileged access, or root device for full access |
| **frida-server killed immediately** | SELinux enforcing on Android | `adb shell su -c 'setenforce 0'` (root required) or use MagiskHide |
| **frida connection refused** | Version mismatch between frida-tools and frida-server | Ensure both versions match exactly (e.g., both 16.1.4) |
| **grep: -P not supported** | macOS uses BSD grep, no PCRE support | Use `grep -E` instead, or install ripgrep: `brew install ripgrep` |
| **python: command not found** | Windows Python installed as `python.exe`, not in PATH | Use `python3` instead, or add Python to PATH |
| **apktool: command not found** | Not in system PATH after installation | Create symlink or add installation directory to PATH |
| **jadx: command not found** | Similar to apktool | Add to PATH: `export PATH="$HOME/jadx/bin:$PATH"` |
| **Java not found despite installation** | JAVA_HOME not set | Set JAVA_HOME environment variable to JDK installation path |
| **Device offline in adb** | ADB server version mismatch or connection issue | Restart ADB server: `adb kill-server && adb start-server` |
| **Frida script not loading** | Script syntax error or API mismatch | Test script manually: `frida -U -f com.app -l script.js` |
| **Permissions denied when pulling files** | SELinux context on device | Use `run-as` for app data: `adb shell "run-as com.app cat /data/data/com.app/db"` |

### macOS-Specific Issues

**Issue: `brew install jadx` fails with "jadx not found"**
```bash
# Solution: Install from GitHub releases directly
wget https://github.com/skylot/jadx/releases/download/v1.5.5/jadx-1.5.5.zip
unzip jadx-1.5.5.zip -d ~/jadx
export PATH="$HOME/jadx/bin:$PATH"
```

**Issue: Zsh permission denied when running scripts**
```bash
# Solution: Ensure script has execute permission
chmod +x script.sh

# Or use bash explicitly
bash script.sh
```

### Linux-Specific Issues

**Issue: `sudo apktool` uses root's Java**
```bash
# Solution: Preserve JAVA_HOME
sudo JAVA_HOME=$JAVA_HOME apktool d app.apk
```

**Issue: Device requires Udev rules for ADB**
```bash
# Solution: Create udev rule
sudo nano /etc/udev/rules.d/51-android.rules
# Add: SUBSYSTEM=="usb", ATTR{idVendor}=="0bb4", MODE="0666"
sudo udevadm control --reload-rules
```

### Windows-Specific Issues

**Issue: ADB not found in Git Bash**
```bash
# Solution: Add to PATH in ~/.bashrc
echo 'export PATH="$PATH:/c/Program Files/Android/platform-tools"' >> ~/.bashrc
source ~/.bashrc
```

**Issue: PowerShell execution policy blocks scripts**
```powershell
# Solution: Set execution policy
Set-ExecutionPolicy RemoteSigned -Scope CurrentUser
```

---

## 8. Quick Setup Scripts

### macOS One-Liner
```bash
# Install everything with one command
brew install jadx apktool android-platform-tools ripgrep temurin && \
echo "✅ macOS toolchain installed successfully" && \
jadx --version && apktool --version && adb version && rg --version && java -version
```

### Ubuntu One-Liner
```bash
# Install everything with one command
sudo apt update && \
sudo apt install -y apktool android-tools-adb ripgrep openjdk-17-jdk wget unzip && \
wget -q https://github.com/skylot/jadx/releases/download/v1.5.5/jadx-1.5.5.zip -O /tmp/jadx.zip && \
sudo unzip /tmp/jadx.zip -d /opt/jadx && \
sudo ln -sf /opt/jadx/bin/jadx /usr/local/bin/jadx && \
echo "✅ Ubuntu toolchain installed successfully" && \
jadx --version && apktool --version && adb version && rg --version && java -version
```

### Windows (PowerShell with Chocolatey) One-Liner
```powershell
# Install everything with one command
Set-ExecutionPolicy Bypass -Scope Process -Force; [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.ServicePointManager]::SecurityProtocol -bor 3072; iex ((New-Object System.Net.WebClient).DownloadString('https://community.chocolatey.org/install.ps1')); choco install jadx apktool adb ripgrep temurin17 -y; echo "✅ Windows toolchain installed successfully"; jadx --version; apktool --version; adb version; rg --version; java -version
```

### Windows (PowerShell with Scoop) One-Liner
```powershell
# Install everything with one command
Set-ExecutionPolicy RemoteSigned -Scope CurrentUser; Invoke-RestMethod -Uri https://get.scoop.sh | Invoke-Expression; scoop install jadx apktool adb ripgrep temurin17-jdk; echo "✅ Windows toolchain installed successfully"; jadx --version; apktool --version; adb version; rg --version; java -version
```

---

## 9. Verification Checklist

After installation, verify all tools work:

```bash
# Create verification script
cat << 'EOF' > verify-tools.sh
#!/usr/bin/env bash
echo "🔍 Verifying APK audit toolchain..."

# Check each tool
tools=(
  "jadx:jadx --version"
  "apktool:apktool --version"
  "adb:adb version"
  "ripgrep:rg --version"
  "java:java -version"
)

for tool in "${tools[@]}"; do
  IFS=':' read -r name cmd <<< "$tool"
  echo -n "Checking $name... "
  if eval "$cmd" > /dev/null 2>&1; then
    echo "✅ OK"
  else
    echo "❌ FAILED"
  fi
done

echo "🎉 Verification complete!"
EOF

chmod +x verify-tools.sh
./verify-tools.sh
```

---

## 10. Resource Links

### Official Documentation
- **Jadx**: https://github.com/skylot/jadx
- **Apktool**: https://ibotpeaches.github.io/Apktool/
- **ADB**: https://developer.android.com/studio/command-line/adb
- **Frida**: https://frida.re/docs/
- **Ripgrep**: https://github.com/BurntSushi/ripgrep

### Android Development
- **Android Developers**: https://developer.android.com/
- **Manifest Documentation**: https://developer.android.com/guide/topics/manifest/manifest-intro
- **Permissions Guide**: https://developer.android.com/training/permissions

### Security Resources
- **OWASP MASVS**: https://owasp.org/www-project-mobile-app-security/
- **OWASP Mobile Security Testing Guide**: https://owasp.org/www-project-mobile-security-testing-guide/
- **Android Security Bulletins**: https://source.android.com/security/bulletin/

---

**Last Updated:** 2026-03-31
**Maintained by:** android-apk-audit skill
