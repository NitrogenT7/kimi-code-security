# Tool Installation Guide for Android APK Audit

**Last Updated:** 2026-04-02
**Skill:** `android-apk-audit`
**Purpose:** Complete installation guide for all required and optional tools across Windows, macOS, and Linux.

---

## 1. Required Tools Table

| Tool | Purpose | Minimum Version | Required/Optional |
|------|---------|-----------------|-------------------|
| **Java JDK** | Runtime for jadx, apktool, and other Java-based tools | 17 (recommended) | **Required** |
| **jadx** | APK decompilation to Java source | 1.5.5+ | **Required** |
| **apktool** | Resource extraction, smali editing, APK repackaging | 3.0.1+ | **Required** |
| **adb** | Android Debug Bridge - device communication | Platform Tools 36+ | **Required** |
| **aapt2** | Android Asset Packaging Tool 2 - manifest parsing | Build Tools 36.0.0+ | **Required** |
| **zipalign** | APK alignment optimization | Build Tools 36.0.0+ | Required for repackaging |
| **apksigner** | APK signing and verification | Build Tools 36.0.0+ | Required for repackaging |
| **frida-tools** | Dynamic instrumentation framework (Python) | 17.9.1+ | Required for dynamic analysis |
| **frida-server** | Frida server for Android device | Match frida-tools version exactly | Required for dynamic analysis |
| **objection** | Frida-based mobile exploration framework | 1.11+ | Optional (dynamic analysis, see note below) |
| **unzip** | Archive extraction | Any | Required |
| **keytool** | Key generation (Java) | Part of JDK | Required for APK signing |

> **⚠️ Note:** Objection is in maintenance mode with no active development. Consider it legacy for new projects.

---

## 2. macOS Installation

### 2.1 Install Homebrew (if not already installed)

```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

### 2.2 Install Java JDK (Temurin/Adoptium - Recommended)

```bash
brew install --cask temurin
```

Verify installation:
```bash
java -version
```

### 2.3 Install Required Tools

```bash
# Install jadx
brew install jadx

# Install apktool
brew install apktool

# Install Android platform tools (includes adb)
brew install --cask android-platform-tools

# Install unzip (usually pre-installed)
# If missing: brew install unzip
```

### 2.4 Install Frida and Objection

```bash
# Install pip3 if not present
brew install python@3.12

# Install frida-tools (v17.9.1+)
pip3 install frida-tools

# Install objection
pip3 install objection

# Verify versions
frida --version  # Should be 17.9.x or latest
objection --version
```

### 2.5 Android SDK Build Tools (aapt, zipalign, apksigner)

**Option A: Install via Android Studio (Recommended for development)**
1. Download and install Android Studio: https://developer.android.com/studio
2. Open Android Studio → Preferences → Appearance & Behavior → System Settings → Android SDK
3. Go to "SDK Tools" tab
4. Check "Android SDK Build-Tools"
5. Click Apply

**Option B: Command-line only (lighter)**
```bash
# Download command line tools
cd ~
mkdir -p android-sdk
cd android-sdk
curl -O https://dl.google.com/android/repository/commandlinetools-mac-11076708_latest.zip
unzip commandlinetools-mac-*.zip
mkdir -p cmdline-tools/latest
mv cmdline-tools/* cmdline-tools/latest/ || true

# Add to PATH (add to ~/.zshrc or ~/.bash_profile)
export ANDROID_HOME="$HOME/android-sdk"
export ANDROID_SDK_ROOT="$ANDROID_HOME"
export PATH="$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools:$PATH"

# Install build-tools
sdkmanager "build-tools;35.0.0"

# Verify tools are in PATH
ls $ANDROID_HOME/build-tools/35.0.0/
```

### 2.6 PATH Configuration

Add these lines to your shell configuration (`~/.zshrc` for Zsh, `~/.bash_profile` for Bash):

```bash
# Android SDK
export ANDROID_HOME="$HOME/android-sdk"
export ANDROID_SDK_ROOT="$ANDROID_HOME"
export PATH="$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools:$ANDROID_HOME/build-tools/35.0.0:$PATH"

# Java
export JAVA_HOME=$(/usr/libexec/java_home)

# Add to PATH
export PATH="$JAVA_HOME/bin:$PATH"
```

Reload shell:
```bash
source ~/.zshrc  # or source ~/.bash_profile
```

### 2.7 Manual Download Fallbacks

If Homebrew fails, download manually:

**jadx**: https://github.com/skylot/jadx/releases
```bash
# Download jadx-1.5.5.zip, extract, and add to PATH
unzip jadx-*.zip
export PATH="$PATH:$(pwd)/jadx/bin"
```

**apktool**: https://apktool.org/docs/install/

> **⚠️ APKTool 3.0 Breaking Changes:**
> - **aapt1 removed**: Only aapt2 is supported. Apps using aapt1 features will need migration.
> - **32-bit platforms deprecated**: Only 64-bit platforms are supported.
> - **New resource modes**: Introduced in v2.9.0+, controls how unresolved resources are handled during disassembly.
> - **API flag**: New `-api` / `--api` flag to specify Android API level during decode.
>
> Source: https://apktool.org/blog/apktool-3.0.0/

```bash
# Download apktool.jar and wrapper script
curl -o apktool.jar https://github.com/iBotPeaches/Apktool/releases/download/v3.0.1/apktool_3.0.1.jar
curl -o apktool https://raw.githubusercontent.com/iBotPeaches/Apktool/master/scripts/linux/apktool
chmod +x apktool
```

---

## 3. Linux Installation

### 3.1 Ubuntu/Debian

#### Install Java JDK

```bash
sudo apt update
sudo apt install -y openjdk-17-jdk

# Verify
java -version
```

#### Install Required Tools

```bash
sudo apt update
sudo apt install -y unzip adb

# Install apktool
sudo apt install -y apktool

# Install jadx (from GitHub releases - v1.5.5)
cd /tmp
wget https://github.com/skylot/jadx/releases/download/v1.5.5/jadx-1.5.5.zip
unzip jadx-*.zip
sudo mv jadx /opt/
export PATH="/opt/jadx/bin:$PATH"

# Or add to .bashrc permanently
echo 'export PATH="/opt/jadx/bin:$PATH"' >> ~/.bashrc
```

#### Install Frida and Objection

```bash
sudo apt install -y python3 python3-pip python3-venv

# Install frida-tools
pip3 install frida-tools --user

# Install objection
pip3 install objection --user

# Add pip user binaries to PATH
echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.bashrc
source ~/.bashrc
```

#### Android SDK Build Tools

```bash
# Create SDK directory
mkdir -p ~/android-sdk
cd ~/android-sdk

# Download command line tools
wget https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip
unzip commandlinetools-linux-*.zip
mkdir -p cmdline-tools/latest
mv cmdline-tools/* cmdline-tools/latest/ || true

# Add to PATH
export ANDROID_HOME="$HOME/android-sdk"
export ANDROID_SDK_ROOT="$ANDROID_HOME"
export PATH="$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools:$PATH"

# Accept licenses
yes | sdkmanager --licenses

# Install build-tools
sdkmanager "build-tools;35.0.0"

# Add to .bashrc
cat >> ~/.bashrc << 'EOF'
export ANDROID_HOME="$HOME/android-sdk"
export ANDROID_SDK_ROOT="$ANDROID_HOME"
export PATH="$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools:$ANDROID_HOME/build-tools/35.0.0:$PATH"
EOF
```

#### PPA for jadx (Alternative)

**Note:** The `ppa:webupd8team/java` PPA is deprecated and no longer exists. Use the official installation methods above instead.

If you need alternative Java installation options:

**Option A: OpenJDK (Ubuntu default)**
```bash
sudo apt update
sudo apt install -y openjdk-17-jdk
```

**Option B: Temurin (Adoptium) - Recommended for consistency**
```bash
# Add Temurin repository
wget -qO - https://packages.adoptium.net/artifactory/api/gpg/key/public | sudo tee /etc/apt/keyrings/adoptium.asc
echo "deb [signed-by=/etc/apt/keyrings/adoptium.asc] https://packages.adoptium.net/artifactory/deb $(source /etc/os-release && echo $UBUNTU_CODENAME) main" | sudo tee /etc/apt/sources.list.d/adoptium.list

# Install Java
sudo apt update
sudo apt install -y temurin-17-jdk
```

# For jadx specifically (v1.5.5):
```bash
# Download from GitHub releases (recommended)
cd /tmp
wget https://github.com/skylot/jadx/releases/download/v1.5.5/jadx-1.5.5.zip
unzip jadx-*.zip
sudo mv jadx /opt/
export PATH="/opt/jadx/bin:$PATH"
```

### 3.2 Arch Linux/Manjaro

```bash
sudo pacman -Syu

# Install Java JDK
sudo pacman -S jdk-openjdk

# Install required tools
sudo pacman -S unzip android-tools

# Install apktool
sudo pacman -S apktool

# Install jadx (from AUR)
yay -S jadx

# Or manually from AUR without yay:
git clone https://aur.archlinux.org/jadx.git
cd jadx
makepkg -si

# Install Frida and Objection
sudo pacman -S python python-pip
pip install frida-tools objection --user

# Android SDK Build Tools (same as Ubuntu section above)
```

### 3.3 Fedora/RHEL/CentOS

```bash
sudo dnf update

# Install Java JDK
sudo dnf install -y java-17-openjdk-devel

# Install required tools
sudo dnf install -y unzip android-tools

# Install apktool
sudo dnf install -y apktool

# Install jadx (download from GitHub - note: no native dnf package exists)
cd /tmp
wget https://github.com/skylot/jadx/releases/download/v1.5.5/jadx-1.5.5.zip
unzip jadx-*.zip
sudo mv jadx /opt/
echo 'export PATH="/opt/jadx/bin:$PATH"' >> ~/.bashrc
source ~/.bashrc

# Install Frida and Objection
sudo dnf install -y python3 python3-pip
pip3 install frida-tools objection --user

# Android SDK Build Tools (same as Ubuntu section above)
```

---

## 4. Windows Installation

### 4.1 Option A: WSL2 (Recommended)

#### 4.1.1 Install WSL2

**Prerequisites:**
- Windows 10 version 2004 and higher (Build 19041 and higher) or Windows 11

**Installation Steps:**

1. Open PowerShell as Administrator and run:
```powershell
wsl --install
```

2. Restart your computer

3. After restart, WSL will install Ubuntu. Set up your username and password when prompted.

4. Update WSL to version 2 (if not already):
```powershell
wsl --set-default-version 2
```

#### 4.1.2 Install Tools Inside WSL2

Once WSL2 Ubuntu is running, follow the **Ubuntu/Debian** instructions from Section 3.1 above.

#### 4.1.3 Access Windows Files from WSL2

Windows drives are accessible at `/mnt/`:
- `C:` → `/mnt/c/`
- `D:` → `/mnt/d/`

Example:
```bash
cd ~/Downloads/target.apk
jadx app.apk
```

#### 4.1.4 Install ADB Device Support in WSL2

To use `adb` from WSL2 with physical Android devices:

```bash
# Install usbipd-win on Windows (run in PowerShell as Admin)
winget install usbipd

# List USB devices
usbipd list

# Bind your Android device (find its BUSID)
usbipd bind --busid <BUSID>

# Attach to WSL
usbipd attach --wsl --busid <BUSID>

# Verify in WSL
lsusb
adb devices
```

### 4.2 Option B: Git Bash + Native Tools

#### 4.2.1 Install Git for Windows

Download and install: https://git-scm.com/download/win

#### 4.2.2 Install Java JDK

**Recommended:** Temurin (Adoptium)

Download: https://adoptium.net/temurin/releases/?version=17

Install with default settings. Verify in Git Bash:
```bash
java -version
```

#### 4.2.3 Package Manager Options

**Option A: Chocolatey**

Run PowerShell as Administrator:
```powershell
Set-ExecutionPolicy Bypass -Scope Process -Force
[System.Net.ServicePointManager]::SecurityProtocol = [System.Net.ServicePointManager]::SecurityProtocol -bor 3072
iex ((New-Object System.Net.WebClient).DownloadString('https://community.chocolatey.org/install.ps1'))
```

Install tools:
```powershell
choco install jadx apktool unzip android-sdk adb python -y
```

**Option B: Scoop**

Install Scoop in PowerShell:
```powershell
Set-ExecutionPolicy RemoteSigned -Scope CurrentUser
irm get.scoop.sh | iex
```

Install tools:
```powershell
scoop install jadx apktool adb python unzip
```

#### 4.2.4 Manual Downloads (Fallback)

**jadx**: https://github.com/skylot/jadx/releases
1. Download `jadx-1.5.5.zip`
2. Extract to `C:\jadx\`
3. Add `C:\jadx\bin\` to PATH

**apktool**: https://apktool.org/docs/install/
1. Download `apktool_3.0.1.jar` to `C:\apktool\`
2. Download Windows wrapper script: https://raw.githubusercontent.com/iBotPeaches/Apktool/master/scripts/windows/apktool.bat
3. Place `apktool.bat` in same directory
4. Add `C:\apktool\` to PATH

**Android Platform Tools (adb)**:
1. Download: https://developer.android.com/tools/releases/platform-tools
2. Extract to `C:\platform-tools\`
3. Add `C:\platform-tools\` to PATH

#### 4.2.5 Android SDK Build Tools

**Option A: Install via Android Studio**
1. Download and install Android Studio: https://developer.android.com/studio
2. Open SDK Manager (Tools → SDK Manager)
3. Check "Android SDK Build-Tools 35.0.0"
4. Apply

**Option B: Command-line only**
1. Download command-line tools: https://developer.android.com/tools
2. Extract to `C:\android-sdk\cmdline-tools\latest\`
3. Open Android Studio SDK Manager or use command line:
```bash
cd C:\android-sdk\cmdline-tools\latest\bin
sdkmanager.bat "build-tools;35.0.0"
```

#### 4.2.6 PATH Configuration in Windows

1. Open "Edit the system environment variables"
2. Click "Environment Variables"
3. Under "System variables", select "Path" and click "Edit"
 4. Add these paths (adjust as needed):
    - `C:\jadx\bin`
    - `C:\apktool\`
    - `C:\platform-tools\`
    - `C:\android-sdk\cmdline-tools\latest\bin`
    - `C:\android-sdk\build-tools\35.0.0`
    - `C:\Program Files\Eclipse Adoptium\jdk-17.0.9.101-hotspot\bin` (or your JDK path)

5. Click OK and restart Git Bash

#### 4.2.7 Install Frida and Objection

In Git Bash or Command Prompt:
```bash
# Ensure Python is in PATH
python --version

# Install frida-tools
pip install frida-tools

# Install objection
pip install objection
```

### 4.3 Option C: Docker-based (Any OS)

See **Section 8: Docker Quick Start** for complete Docker setup.

---

## 5. Frida-Specific Setup

### 5.1 Install frida-tools on Host

```bash
# macOS/Linux
pip3 install frida-tools

# Windows
pip install frida-tools
```

Verify installation:
```bash
frida --version
```

### 5.2 Install frida-server on Android Device

#### 5.2.1 Detect Device Architecture

Connect your device via USB and run:
```bash
adb shell getprop ro.product.cpu.abi
```

Common outputs:
- `arm64-v8a` → Use `arm64` build
- `armeabi-v7a` → Use `arm` build
- `x86_64` → Use `x86_64` build
- `x86` → Use `x86` build

#### 5.2.2 Download Matching frida-server

Find the latest release: https://github.com/frida/frida/releases

Example for arm64-v8a (Linux, Android 12+):
```bash
cd /tmp
# Download matching Frida server version (must match frida-tools)
FRIDA_VERSION=$(frida --version | cut -d'.' -f1-2)
wget https://github.com/frida/frida/releases/download/${FRIDA_VERSION}.0/frida-server-${FRIDA_VERSION}.0-android-arm64.xz

# Example for Frida 17.9.x:
# wget https://github.com/frida/frida/releases/download/17.9.0/frida-server-17.9.0-android-arm64.xz
unxz frida-server-*.xz
```

#### 5.2.3 Push and Run frida-server

```bash
# Enable root on device (if needed)
adb root
adb remount

# Push frida-server to device
# Push to device (use the version you downloaded)
adb push frida-server-*-android-arm64 /data/local/tmp/frida-server

# Set executable permissions
adb shell "chmod 755 /data/local/tmp/frida-server"

# Run frida-server (in background)
adb shell "/data/local/tmp/frida-server &"

# Keep the session alive (optional)
adb shell "su -c '/data/local/tmp/frida-server &'"
```

#### 5.2.4 Verify Frida Connection

```bash
# List running processes
frida-ps -U

# If successful, you'll see process list from device
```

### 5.3 Frida Persistence (Run on Boot)

**Option A: Using init.d**
```bash
adb shell "su -c 'echo \"/data/local/tmp/frida-server &\" > /etc/init.d/99frida'"
adb shell "su -c 'chmod 755 /etc/init.d/99frida'"
```

**Option B: Using Magisk (Rooted Device)**
1. Install Magisk module: https://github.com/ViRb3/magisk-frida
2. Flash via Magisk Manager

---

## 6. Android SDK/Platform Tools

### 6.1 SDK Manager Installation

**macOS/Linux:**
```bash
# Download command-line tools (see OS-specific sections above)
sdkmanager --list
```

**Windows:**
```powershell
sdkmanager.bat --list
```

### 6.2 Install Required Packages

```bash
# Platform tools (adb, fastboot)
sdkmanager "platform-tools"

# Build tools (aapt, zipalign, apksigner)
sdkmanager "build-tools;35.0.0"

# Platform (latest Android API)
sdkmanager "platforms;android-34"

# Accept licenses automatically
yes | sdkmanager --licenses
```

### 6.3 PATH Setup per OS

**macOS (Zsh):**
```bash
# Add to ~/.zshrc
export ANDROID_HOME="$HOME/Library/Android/sdk"
export ANDROID_SDK_ROOT="$ANDROID_HOME"
export PATH="$ANDROID_HOME/platform-tools:$ANDROID_HOME/build-tools/35.0.0:$PATH"
```

**Linux (Bash):**
```bash
# Add to ~/.bashrc
export ANDROID_HOME="$HOME/Android/Sdk"
export ANDROID_SDK_ROOT="$ANDROID_HOME"
export PATH="$ANDROID_HOME/platform-tools:$ANDROID_HOME/build-tools/35.0.0:$PATH"
```

**Windows:**
- Add via Environment Variables GUI (see Section 4.2.6)
- Or via PowerShell:
```powershell
[Environment]::SetEnvironmentVariable("ANDROID_HOME", "C:\Users\$env:USERNAME\AppData\Local\Android\Sdk", "User")
[Environment]::SetEnvironmentVariable("ANDROID_SDK_ROOT", $env:ANDROID_HOME, "User")
```

### 6.4 Build Tools Locations

After installation, find tools at:

**macOS:**
- aapt: `~/Library/Android/sdk/build-tools/35.0.0/aapt`
- zipalign: `~/Library/Android/sdk/build-tools/35.0.0/zipalign`
- apksigner: `~/Library/Android/sdk/build-tools/35.0.0/apksigner` (no .bat extension on macOS/Linux)

**Linux:**
- aapt: `~/Android/Sdk/build-tools/35.0.0/aapt`
- zipalign: `~/Android/Sdk/build-tools/35.0.0/zipalign`
- apksigner: `~/Android/Sdk/build-tools/35.0.0/apksigner` (no .bat extension on macOS/Linux)

**Windows:**
- aapt: `%LOCALAPPDATA%\Android\Sdk\build-tools\35.0.0\aapt.exe`
- zipalign: `%LOCALAPPDATA%\Android\Sdk\build-tools\35.0.0\zipalign.exe`
- apksigner: `%LOCALAPPDATA%\Android\Sdk\build-tools\35.0.0\apksigner.bat`

---

## 7. Verification

### 7.1 Quick Verification Commands

Run this one-liner to verify all tools are installed:

```bash
echo "=== Java ===" && java -version && \
echo -e "\n=== jadx ===" && jadx --version && \
echo -e "\n=== apktool ===" && apktool --version && \
echo -e "\n=== adb ===" && adb version && \
echo -e "\n=== aapt ===" && aapt version && \
echo -e "\n=== zipalign ===" && zipalign -v 2>&1 | head -1 && \
echo -e "\n=== frida ===" && frida --version && \
echo -e "\n=== unzip ===" && unzip -v | head -1 && \
echo -e "\n=== Tools in PATH ===" && which jadx apktool adb aapt zipalign frida unzip
```

Expected output:
```
=== Java ===
openjdk version "17.0.9" 2023-10-17
...

=== jadx ===
jadx version 1.5.5

=== apktool ===
Apktool v3.0.1

=== adb ===
Android Debug Bridge version 34.0.5

=== aapt ===
Android Asset Packaging Tool, v0.2-35.0.0

=== zipalign ===
Zipalign 1.5

=== frida ===
frida 17.9.x or latest

=== unzip ===
UnZip 6.00

=== Tools in PATH ===
/usr/local/bin/jadx
/usr/local/bin/apktool
/usr/local/bin/adb
/usr/local/bin/aapt
/usr/local/bin/zipalign
/usr/local/bin/frida
/usr/bin/unzip
```

### 7.2 Common Troubleshooting

#### macOS

**Issue:** `command not found: jadx`
```bash
# Solution: Check Homebrew installation
brew list jadx

# If not installed:
brew install jadx

# If installed but not in PATH, add Homebrew to PATH
echo 'eval "$(/opt/homebrew/bin/brew shellenv)"' >> ~/.zshrc
source ~/.zshrc
```

**Issue:** `java.lang.UnsupportedClassVersionError`
```bash
# Solution: Ensure JDK 17+ is installed
java -version

# Set JAVA_HOME explicitly
export JAVA_HOME=$(/usr/libexec/java_home -v 17)
```

#### Linux

**Issue:** `adb: command not found`
```bash
# Solution: Install platform-tools
sudo apt install android-platform-tools  # Ubuntu/Debian
sudo pacman -S android-tools               # Arch
sudo dnf install android-tools             # Fedora

# Or create symlink from SDK
sudo ln -s $ANDROID_HOME/platform-tools/adb /usr/local/bin/adb
```

**Issue:** Permission denied running frida-server
```bash
# Solution: Ensure device is rooted and permissions are set
adb root
adb remount
adb shell "chmod 755 /data/local/tmp/frida-server"
```

#### Windows

**Issue:** `'adb' is not recognized`
```bash
# Solution: Add platform-tools to PATH
# Follow Section 4.2.6 steps

# Quick test: Run from full path
C:\platform-tools\adb.exe version
```

**Issue:** Python not in PATH
```powershell
# Solution: Add Python installation directory to PATH
# Typically: C:\Users\YourName\AppData\Local\Programs\Python\Python312\

# Or use Python Launcher
py -m pip install frida-tools
```

**Issue:** WSL2 cannot see USB devices
```powershell
# Solution: Use usbipd-win (see Section 4.1.4)
usbipd list
usbipd bind --busid <BUSID>
usbipd attach --wsl --busid <BUSID>
```

#### Cross-Platform

**Issue:** Frida cannot connect to device
```bash
# Verify frida-server is running
adb shell "ps | grep frida"

# Restart frida-server if not running
adb shell "/data/local/tmp/frida-server &"

# Check Frida connection
frida-ps -U
```

**Issue:** APK signing errors
```bash
# Solution: Generate a debug keystore
keytool -genkey -v -keystore debug.keystore -alias androiddebugkey -keyalg RSA -keysize 2048 -validity 10000

# Sign APK
jarsigner -verbose -sigalg SHA256withRSA -digestalg SHA-256 -keystore debug.keystore app.apk androiddebugkey

# Or use apksigner
apksigner sign --ks debug.keystore app.apk
```

---

## 8. Docker Quick Start

### 8.1 Complete Dockerfile

Save as `Dockerfile`:

```dockerfile
FROM ubuntu:22.04

# Avoid interactive prompts
ENV DEBIAN_FRONTEND=noninteractive

# Update and install dependencies
RUN apt-get update && apt-get install -y \
    wget \
    curl \
    unzip \
    git \
    openjdk-17-jdk \
    android-tools-adb \
    python3 \
    python3-pip \
    && rm -rf /var/lib/apt/lists/*

# Set JAVA_HOME
ENV JAVA_HOME=/usr/lib/jvm/java-17-openjdk-amd64

# Install apktool
RUN wget https://github.com/iBotPeaches/Apktool/releases/download/v3.0.1/apktool_3.0.1.jar -O /usr/local/bin/apktool.jar && \
    wget https://raw.githubusercontent.com/iBotPeaches/Apktool/master/scripts/linux/apktool -O /usr/local/bin/apktool && \
    chmod +x /usr/local/bin/apktool

# Install jadx
RUN wget https://github.com/skylot/jadx/releases/download/v1.5.5/jadx-1.5.5.zip -O /tmp/jadx.zip && \
    unzip /tmp/jadx.zip -d /opt && \
    rm /tmp/jadx.zip && \
    ln -s /opt/jadx/bin/jadx /usr/local/bin/jadx && \
    ln -s /opt/jadx/bin/jadx-gui /usr/local/bin/jadx-gui

# Install Android SDK Build Tools
RUN mkdir -p /opt/android-sdk/cmdline-tools/latest && \
    cd /opt/android-sdk/cmdline-tools/latest && \
    wget https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip -O /tmp/cmdline-tools.zip && \
    unzip /tmp/cmdline-tools.zip && \
    rm /tmp/cmdline-tools.zip

ENV ANDROID_HOME=/opt/android-sdk
ENV ANDROID_SDK_ROOT=$ANDROID_HOME
ENV PATH=$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools:$ANDROID_HOME/build-tools/35.0.0:$PATH

# Install build-tools
RUN yes | sdkmanager --licenses && \
    sdkmanager "platform-tools" "build-tools;35.0.0" "platforms;android-34"

# Install frida-tools and objection
RUN pip3 install --no-cache-dir frida-tools objection

# Create working directory
WORKDIR /workspace

# Verify installations
RUN echo "=== Tool Verification ===" && \
    java -version && \
    jadx --version && \
    apktool --version && \
    adb version && \
    aapt version && \
    frida --version

# Default command
CMD ["/bin/bash"]
```

### 8.2 Build Docker Image

```bash
docker build -t android-apk-audit .
```

### 8.3 Run Container

**Basic usage (interactive):**
```bash
docker run -it --rm \
    --name apk-audit \
    -v $(pwd):/workspace \
    android-apk-audit
```

**With USB device access (Linux only):**
```bash
docker run -it --rm \
    --name apk-audit \
    -v $(pwd):/workspace \
    --device /dev/bus/usb \
    --privileged \
    android-apk-audit
```

**With ADB over network (any OS):**
```bash
# First, enable ADB over network on device
adb tcpip 5555

# Then connect from host
adb connect <device-ip>:5555

# Run container
docker run -it --rm \
    --name apk-audit \
    -v $(pwd):/workspace \
    --network host \
    android-apk-audit
```

### 8.4 One-Liner Audit Commands

**Decompile APK:**
```bash
docker run --rm -v $(pwd):/workspace android-apk-audit jadx /workspace/app.apk -d /workspace/output
```

**Extract resources:**
```bash
docker run --rm -v $(pwd):/workspace android-apk-audit apktool d /workspace/app.apk -o /workspace/output
```

**Frida list processes (requires device connection):**
```bash
docker run --rm -v $(pwd):/workspace --network host android-apk-audit frida-ps -U
```

### 8.5 Docker Compose Setup

Save as `docker-compose.yml`:

```yaml
services:
  apk-audit:
    build: .
    image: android-apk-audit
    container_name: apk-audit
    volumes:
      - .:/workspace
    # Uncomment one of the following based on your setup:
    # network_mode: host  # For ADB over network
    # devices:
    #   - /dev/bus/usb  # For direct USB access (Linux only)
    # privileged: true  # For full device access
    stdin_open: true
    tty: true
```

Run with:
```bash
docker-compose up -d
docker-compose exec apk-audit bash
```

### 8.6 Persistent Workspace

To keep tools installed across sessions, create a volume:

```bash
# Create volume
docker volume create apk-audit-workspace

# Run with persistent volume
docker run -it --rm \
    -v apk-audit-workspace:/workspace \
    -v $(pwd)/apk-files:/apk-files \
    android-apk-audit
```

---

## Appendix A: Tool URLs (Latest Versions as of April 2026)

| Tool | Download URL | Latest Version |
|------|--------------|----------------|
| **Java JDK (Temurin)** | https://adoptium.net/temurin/releases/?version=17 | 17+ |
| **jadx** | https://github.com/skylot/jadx/releases | 1.5.5 |
| **apktool** | https://apktool.org/docs/install/ | 3.0.1 |
| **Android Platform Tools** | https://developer.android.com/tools/releases/platform-tools | 36.0.2 |
| **Android SDK CLI Tools** | https://developer.android.com/tools | 11076708 |
| **frida** | https://github.com/frida/frida/releases | 17.9.x or latest |
| **objection** | https://github.com/sensepost/objection/releases | 4.0.0 |

---

## Appendix B: Quick Reference Cheat Sheet

### macOS
```bash
brew install --cask temurin jadx android-platform-tools
brew install apktool
pip3 install frida-tools objection
```

### Ubuntu/Debian
```bash
sudo apt install openjdk-17-jdk apktool adb unzip python3-pip
wget https://github.com/skylot/jadx/releases/download/v1.5.5/jadx-1.5.5.zip
unzip jadx-*.zip && sudo mv jadx /opt/
pip3 install frida-tools objection
```

### Arch Linux
```bash
sudo pacman -S jdk-openjdk apktool android-tools unzip python
yay -S jadx
pip install frida-tools objection
```

### Windows (Chocolatey)
```powershell
choco install temurin jadx apktool android-sdk adb python -y
pip install frida-tools objection
```

### Docker (Any OS)
```bash
# Build
docker build -t android-apk-audit .

# Run
docker run -it --rm -v $(pwd):/workspace android-apk-audit
```

---

## Appendix C: Frida Server Quick Setup Script

Save as `install-frida-server.sh`:

```bash
#!/bin/bash

# Detect device architecture
ARCH=$(adb shell getprop ro.product.cpu.abi)

case $ARCH in
  "arm64-v8a")
    FRIDA_ARCH="arm64"
    ;;
  "armeabi-v7a")
    FRIDA_ARCH="arm"
    ;;
  "x86_64")
    FRIDA_ARCH="x86_64"
    ;;
  "x86")
    FRIDA_ARCH="x86"
    ;;
  *)
    echo "Unknown architecture: $ARCH"
    exit 1
    ;;
esac

FRIDA_VERSION="17.9.1"
FRIDA_URL="https://github.com/frida/frida/releases/download/${FRIDA_VERSION}/frida-server-${FRIDA_VERSION}-android-${FRIDA_ARCH}"

echo "Detected architecture: $ARCH ($FRIDA_ARCH)"
echo "Downloading frida-server..."

wget $FRIDA_URL -O frida-server

echo "Pushing to device..."
adb root
adb remount
adb push frida-server /data/local/tmp/frida-server

echo "Setting permissions..."
adb shell "chmod 755 /data/local/tmp/frida-server"

echo "Starting frida-server..."
adb shell "/data/local/tmp/frida-server &"

echo "Verifying..."
sleep 2
frida-ps -U

echo "Done!"
```

Make executable and run:
```bash
chmod +x install-frida-server.sh
./install-frida-server.sh
```

---

**Need Help?**
If you encounter issues not covered in this guide, please check the official documentation for each tool or refer to the `android-apk-audit` skill troubleshooting section.
