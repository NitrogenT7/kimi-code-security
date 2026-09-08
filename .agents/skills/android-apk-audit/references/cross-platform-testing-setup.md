# Cross-Platform APK Testing Setup Guide (Linux, macOS, Windows, WSL2)

**Last Updated**: April 2026
**Platforms Covered**: Ubuntu/Debian, macOS (Intel & Apple Silicon), Windows 10/11, WSL2
**Audience**: Android security researchers, app developers, CI/CD engineers

---

## Quick Reference Matrix

| Tool | Linux | macOS Intel | macOS M1/M2 | Windows | WSL2 |
|------|-------|-------------|------------|---------|------|
| adb | ✅ apt | ✅ brew | ✅ brew (native) | ✅ choco | ✅ apt |
| JADX | ✅ manual | ✅ brew | ✅ brew (native) | ✅ manual | ✅ manual |
| APKTool | ✅ apt | ✅ brew | ✅ brew | ✅ manual | ✅ apt |
| Frida | ✅ pip | ✅ pip | ✅ pip | ✅ pip | ✅ pip |
| apksigner | ✅ SDK | ✅ SDK | ✅ SDK | ✅ SDK | ✅ SDK |

---

## Table of Contents

1. [Platform-Specific Gotchas](#platform-specific-gotchas)
2. [Linux Setup](#linux-setup)
3. [macOS Setup](#macos-setup)
4. [Windows Setup](#windows-setup)
5. [WSL2 Setup](#wsl2-setup)
6. [Cross-Platform Compatibility Issues](#cross-platform-compatibility-issues)
7. [CI/CD Integration](#cicd-integration)

---

## Platform-Specific Gotchas

### Linux

**✅ Straightforward**, most tools native.

**Gotchas**:
- `grep` is GNU grep (different syntax than BSD macOS)
- `sed` is GNU sed
- Library paths: `/opt/android-sdk/`, `/usr/local/bin/`
- SELinux may block some operations

---

### macOS (Intel)

**✅ Works**, but different shell (zsh default now).

**Gotchas**:
- Homebrew installs to `/usr/local/bin/` (Intel) vs `/opt/homebrew/bin/` (M1/M2)
- `grep` is BSD grep (different `-E` behavior than GNU)
- `sed` is BSD sed (different `-i` flag)
- Gatekeeper may block downloaded tools
- Java JDK from Oracle vs OpenJDK via Homebrew

---

### macOS (M1/M2 Apple Silicon)

**⚠️ Mixed native + Rosetta translation.**

**Gotchas**:
- Homebrew installs to `/opt/homebrew/bin/` NOT `/usr/local/bin/`
- Java: Use `temurin` (native ARM) NOT Oracle JDK (Rosetta)
- Some old APKTool versions fail on ARM
- Frida Python bindings may require architecture-specific binary
- Terminal app: Check "Open using Rosetta" setting

**Architecture detection**:
```bash
uname -m
# arm64 = Apple Silicon (M1/M2)
# x86_64 = Intel (Rosetta if running ARM binary)

arch
# arm64 = native
# i386 = Rosetta mode
```

---

### Windows Native (CMD/PowerShell)

**⚠️ Most problematic**, many tools Unix-first.

**Gotchas**:
- Path separator: `\` not `/` (breaks bash scripts)
- No native `find`, `grep`, `sed` → need Git Bash or WSL2
- Case-insensitive filesystem (can cause APK issues)
- Python venv activation: `venv\Scripts\activate.bat` not `source venv/bin/activate`
- ADB over TCP required (no USB passthrough in native Windows easily)
- Java PATH issues

**Recommended**: Use **WSL2** instead (see section below).

---

### WSL2 (Windows Subsystem for Linux 2)

**✅ Best compromise** for Windows users.

**Gotchas**:
- USB device passthrough: Requires `usbipd-win` (v2.4+)
- File I/O slower than native Linux
- Interop PATH binaries (Windows tools in WSL):
  ```bash
  /mnt/c/Program\ Files/...
  ```
- Docker integration can cause conflicts

---

## Linux Setup

### Tested on: Ubuntu 22.04 LTS, Debian 12

```bash
# 1. Update package manager
sudo apt update && sudo apt upgrade -y

# 2. Install Java JDK 17
sudo apt install -y openjdk-17-jdk-headless
java -version
# Output: openjdk version "17.0.x"

# 3. Install Android SDK
sudo apt install -y android-sdk
# or download manually from https://developer.android.com/studio/command-line/sdkmanager

# 4. Install APKTool (system package)
sudo apt install -y apktool
apktool --version
# Output: Apktool v3.x.x

# 5. Install JADX
sudo apt install -y jadx
jadx --version
# Output: JADX v1.5.x

# 6. Install Frida
pip3 install frida-tools
frida --version
# Output: 17.x.x

# 7. Install ADB (if not with Android SDK)
sudo apt install -y android-tools-adb
adb version

# 8. Verify all tools
which apktool jadx frida adb

# 9. Setup environment variables (add to ~/.bashrc)
export ANDROID_HOME=/usr/lib/android-sdk
export PATH=$PATH:$ANDROID_HOME/tools:$ANDROID_HOME/platform-tools
source ~/.bashrc
```

**Test installation**:
```bash
# Decompile test APK
apktool d test.apk -o decoded/ -api 35
jadx -d jadx_out test.apk
frida-ps -U
adb devices
```

---

## macOS Setup

### Intel Macs

```bash
# 1. Install Homebrew (if not present)
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# 2. Install Java (Temurin - LTS, widely compatible)
brew install temurin17
java -version

# 3. Install tools
brew install apktool jadx android-sdk

# 4. Install Frida
pip3 install frida-tools
frida --version

# 5. Setup Android SDK
# After brew install android-sdk, set env vars:
export ANDROID_HOME=/opt/homebrew/opt/android-sdk
export PATH=$PATH:$ANDROID_HOME/platform-tools

# Add to ~/.zshrc (macOS default shell)
echo 'export ANDROID_HOME=/opt/homebrew/opt/android-sdk' >> ~/.zshrc
echo 'export PATH=$PATH:$ANDROID_HOME/platform-tools' >> ~/.zshrc
source ~/.zshrc
```

### Apple Silicon (M1/M2) Macs

**Critical differences**:

```bash
# 1. Install Homebrew (native ARM version)
# If you see "arch -arm64e", you're in Rosetta mode
arch
# Should output: arm64 (not i386)

# 2. Use temurin17 (native ARM binary)
brew install temurin17
java -version
# Confirm: OpenJDK Runtime Environment (Temurin) ARM 64-Bit

# 3. Install ARM-native tools
brew install apktool jadx android-sdk

# 4. IMPORTANT: Paths are /opt/homebrew NOT /usr/local
# Verify:
which apktool
# Output: /opt/homebrew/bin/apktool (NOT /usr/local/bin/apktool)

# 5. Android SDK path for Apple Silicon
export ANDROID_HOME=/opt/homebrew/opt/android-sdk
export PATH=$PATH:$ANDROID_HOME/platform-tools

# Add to ~/.zshrc
echo 'export ANDROID_HOME=/opt/homebrew/opt/android-sdk' >> ~/.zshrc
echo 'export PATH=$PATH:$ANDROID_HOME/platform-tools' >> ~/.zshrc
source ~/.zshrc

# 6. Verify no Rosetta translation happening
# This should show 0 (not using Rosetta):
sysctl -n sysctl.proc_translated
```

**Common M1/M2 Issue**:
```bash
# If you see this error:
# "Bad CPU type in executable"

# Likely cause: Using Intel binary with ARM processor
# Solution: Use brew (which installs native binaries) instead of manual download

# Check installed binary arch:
file /opt/homebrew/bin/apktool
# Should show: Mach-O 64-bit executable arm64 (native)
# NOT: Mach-O 64-bit executable x86_64 (Rosetta)
```

---

## Windows Setup

### Option A: WSL2 (Recommended for pentesting)

See **WSL2 Setup** section below.

### Option B: Native Windows

**⚠️ Much more difficult. Not recommended.**

```batch
REM 1. Install Java
REM Download from: https://www.oracle.com/java/technologies/downloads/
REM Select: Windows x64 Installer
REM Verify:
java -version

REM 2. Install Android SDK
REM Download from: https://developer.android.com/studio/command-line/sdkmanager
REM Extract to: C:\Android\sdk
REM Set:
set ANDROID_HOME=C:\Android\sdk
setx ANDROID_HOME "C:\Android\sdk"
setx PATH "%PATH%;%ANDROID_HOME%\platform-tools"

REM 3. Install Chocolatey (package manager)
REM Run PowerShell as Admin:
Set-ExecutionPolicy Bypass -Scope Process -Force; [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.ServicePointManager]::SecurityProtocol -bor 3072; iex ((New-Object System.Net.WebClient).DownloadString('https://community.chocolatey.org/install.ps1'))

REM 4. Install tools via Chocolatey
choco install apktool jadx

REM 5. Install Frida (via Python)
python -m pip install frida-tools

REM 6. Add tools to PATH
REM Usually automatic with choco, but verify:
where apktool
where jadx
frida --version
```

**Gotchas for Windows native**:
- `grep`, `sed`, `find` don't exist → use Git Bash or ripgrep
- Path separators cause issues → use forward slashes or WSL2
- USB device access → ADB over TCP only (difficult)

---

## WSL2 Setup

### Installation (One-time)

**Windows 10/11 with WSL2**:

```powershell
# Run in PowerShell as Admin

# 1. Enable WSL2
wsl --install
# Restart required

# 2. Download Ubuntu 22.04 image
# Or: Microsoft Store → Ubuntu

# 3. Launch WSL2 terminal
wsl

# Now you're in Linux environment!
```

### Inside WSL2 (Linux)

```bash
# Follow Linux setup above
sudo apt update
sudo apt install -y openjdk-17-jdk-headless apktool jadx android-sdk

pip3 install frida-tools

# Set env vars in ~/.bashrc
export ANDROID_HOME=/opt/android-sdk
export PATH=$PATH:$ANDROID_HOME/tools:$ANDROID_HOME/platform-tools
```

### USB Device Passthrough (Critical for Frida)

By default, WSL2 cannot access USB devices. Need `usbipd-win` to share USB from Windows → WSL2:

```powershell
# Windows PowerShell (Admin)

# 1. Install usbipd-win
winget install usbipd

# 2. List USB devices
usbipd wsl list
# Output:
# BUSID  VID:PID  DEVICE
# 2-1    18d1:4ee0  Pixel 6 (Android)

# 3. Attach to WSL2 (busid 2-1)
usbipd wsl attach --busid 2-1

# 4. In WSL2 terminal, verify
adb devices
# Output: emulator-5554 device
```

**Permanent attachment** (runs on every WSL2 start):
```bash
# Create: /etc/wsl.conf
sudo tee /etc/wsl.conf > /dev/null << 'EOF'
[interop]
appendWindowsPath = true

[automount]
root = /mnt
options = "metadata,umask=22"
EOF

# Restart WSL2:
wsl --shutdown
wsl  # Relaunch
```

---

## Cross-Platform Compatibility Issues

### Issue 1: `grep` Syntax

**Linux/WSL2 (GNU grep)**:
```bash
grep -E "pattern" file.txt
grep -P "\d+" file.txt  # Perl regex
```

**macOS (BSD grep)**:
```bash
# -E works, but -P doesn't
grep -E "pattern" file.txt
grep "[0-9]\+" file.txt  # Alternative to \d
```

**Solution**: Use `ripgrep` (rg) instead:
```bash
rg "pattern" file.txt      # Cross-platform
rg "\d+" file.txt          # Perl regex works
```

---

### Issue 2: `sed` In-place Editing

**Linux/WSL2 (GNU sed)**:
```bash
sed -i "s/old/new/g" file.txt
```

**macOS (BSD sed)**:
```bash
sed -i '' "s/old/new/g" file.txt  # Extra '' needed
```

**Solution**: Use Python for portability:
```bash
python3 << 'EOF'
with open('file.txt', 'r') as f:
    content = f.read()
with open('file.txt', 'w') as f:
    f.write(content.replace('old', 'new'))
EOF
```

---

### Issue 3: Path Separators in Scripts

**Linux/macOS/WSL2**:
```bash
output_dir="decoded/subfolder"
apktool d app.apk -o "$output_dir"
```

**Windows CMD**:
```batch
set output_dir=decoded\subfolder
apktool d app.apk -o %output_dir%
```

**Solution**: Use Python wrapper:
```python
import subprocess
import os

output_dir = os.path.join("decoded", "subfolder")
subprocess.run(["apktool", "d", "app.apk", "-o", output_dir])
```

---

### Issue 4: Line Endings (CRLF vs LF)

Scripts copied from Windows to Linux can have CRLF line endings:
```bash
./script.sh
# Error: line 3: $'\r': command not found
```

**Fix**:
```bash
# Convert to Unix line endings
dos2unix script.sh
# or:
sed -i 's/\r$//' script.sh
```

---

## CI/CD Integration

### GitHub Actions

```yaml
name: APK Security Test

on: [push]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Setup Java
        uses: actions/setup-java@v3
        with:
          java-version: '17'

      - name: Install Android SDK
        run: |
          sudo apt-get update
          sudo apt-get install -y android-sdk apktool jadx

      - name: Install Frida
        run: pip3 install frida-tools

      - name: Test APK Decompilation
        run: |
          apktool d test.apk -o decoded/ -api 35
          jadx -d jadx_out test.apk
```

### Local Docker

```dockerfile
FROM ubuntu:22.04

RUN apt-get update && apt-get install -y \
    openjdk-17-jdk-headless \
    android-sdk \
    apktool \
    jadx \
    python3-pip

RUN pip3 install frida-tools

WORKDIR /work
ENTRYPOINT ["bash"]
```

Usage:
```bash
docker build -t android-pentesting .
docker run -it -v $(pwd):/work android-pentesting
# Inside: apktool, jadx, frida all available
```

---

## References

- **Homebrew**: https://brew.sh/
- **WSL2**: https://learn.microsoft.com/en-us/windows/wsl/
- **usbipd-win**: https://github.com/dorssel/usbipd-win
- **Android SDK**: https://developer.android.com/studio/command-line
- **Ripgrep**: https://github.com/BurntSushi/ripgrep

---

**Last Verified**: April 2, 2026 on Ubuntu 22.04, macOS M1 (Monterey), Windows 11 + WSL2

**Maintenance Note**: WSL2 USB passthrough requires `usbipd` v2.4+. Verify with `usbipd --version` before use.
