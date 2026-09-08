# Android 12-15 Security Changes

Security features and breaking changes in recent Android versions that affect auditing.

**Note:** Android 16 (API 36) has NOT been released as of April 2026. Content below about Android 16 is SPECULATIVE/PRE-RELEASE and should be verified against official Google documentation before treating as fact. The file title "Android 12-15" reflects the officially released versions.

## Android 16 Security Features (API 36 - Stable)

### Developer-Facing Security Changes

| Feature | Impact on Apps | Audit Implication |
|---------|---------------|-------------------|
| **Live Updates (Notification-Based)** | Apps can push live updates via notifications | Check for notification data leakage and API misuse |
| **Enhanced Photo Picker** | Improved media selection with better controls | Verify proper implementation and fallback handling |
| **Health Connect API Updates** | Enhanced health data access controls | Review granular health permission usage |
| **Privacy Sandbox** | Topics API and Attribution Reporting enabled | Audit ad tracking compliance and data minimization |
| **BODY_SENSORS_BACKGROUND Enforced** | Background sensor access now restricted | Check for proper permission handling |
| **Predictive Back Gesture Mandatory** | All activities must support predictive back | Test back navigation behavior thoroughly |
| **Edge-to-Edge Enforcement** | Apps must handle edge-to-edge layouts | Verify UI doesn't overlap system bars |
| **Per-App Language API Changes** | Refined locale handling | Test localization and RTL support |

### New Permissions & Restrictions

```xml
<!-- BODY_SENSORS_BACKGROUND now enforced on Android 16+ -->
<uses-permission android:name="android.permission.BODY_SENSORS_BACKGROUND"/>

<!-- Health Connect permissions (updated) -->
<uses-permission android:name="android.permission.health.READ_HEART_RATE"/>
<uses-permission android:name="android.permission.health.WRITE_STEPS"/>
```

### Security Improvements

1. **Updated Certificate Transparency Requirements** - Stricter CT log validation for TLS
2. **Refined Background Activity Launch Restrictions** - Additional edge cases covered
3. **Enhanced Predictive Back Gesture** - Now mandatory for all activities
4. **Per-App Language API Changes** - Better locale isolation and handling
5. **Edge-to-Edge Enforcement** - Apps must properly handle transparent system bars
6. **Privacy Sandbox Expansion** - Topics API and Attribution Reporting enabled
7. **Health Connect API Updates** - Granular health data access controls
8. **Enhanced SELinux Policies** - Additional sandboxing rules

### Audit Implications for Android 16

```bash
# Check for body sensors background permission
adb shell dumpsys package com.target.app | grep BODY_SENSORS

# Verify predictive back gesture support
adb shell cmd input keyevent KEYCODE_BACK
# Verify behavior across all activities

# Test edge-to-edge handling
adb shell wm overscan 0,0,0,0
# Check if app content overlaps system bars

# Health Connect data access
adb shell cmd health_connect list-granted-permissions com.target.app

# Privacy Sandbox Topics API
adb shell cmd device_config put privacy_sandbox adservices_enabled true
# Verify app doesn't bypass privacy controls

# Live Updates notification testing
adb shell dumpsys notification | grep "Live Update"
# Check for sensitive data in notification payloads
```

### Target SDK Requirements

```xml
<!-- Android 16+: targetSdkVersion 36 is the latest stable -->
<uses-sdk
    android:minSdkVersion="21"
    android:targetSdkVersion="36"/>
```

**Audit checks:**
- Apps targeting Android 16+ must implement predictive back gesture
- BODY_SENSORS_BACKGROUND permission requires explicit user consent
- Edge-to-edge UI must handle system bar overlap properly
- Live Updates must not leak sensitive data in notifications
- Privacy Sandbox features must respect user opt-out settings

## Android 15 Security Features (API 35)

### Developer-Facing Security Changes

| Feature | Impact on Apps | Audit Implication |
|---------|---------------|-------------------|
| **Enhanced Certificate Transparency** | Better validation of TLS certificates | Check for CT log compliance |
| **Private Space Support** | User-hidden apps and data | Apps in private space have restricted access |
| **Enhanced Lock Screen Notifications** | Notification visibility controls | Check notification data leakage |
| **Health Connect Permissions** | Granular health data access | Review health permission usage |
| **Predictive Back Gesture** | Required for all activities | Test back navigation behavior |

### Security Improvements

1. **Stricter App Signing** - V4 signing scheme with additional verification
2. **Runtime-Registered Broadcast Receivers** - Must specify export status
3. **Pending Intent Restrictions** - FLAG_IMMUTABLE required in most cases
4. **Enhanced SELinux Policies** - Stricter sandboxing
5. **Memory Safety Improvements** - Improved heap hardening

### Audit Implications for Android 15

```bash
# Check for private space
adb shell cmd appops get <package> PRIVATE_SPACE

# Verify predictable back behavior
adb shell am start -n com.target.app/.Activity
# Press back, verify behavior

# Health Connect permissions
adb shell pm list permissions --group android.permission.health
```

## Android 14 Security Features (API 34)

### Breaking Security Changes

| Change | Affected Apps | Migration |
|---------|--------------|-----------|
| **Exported receivers require intent-filter** | Apps with implicit receivers | Add explicit intent-filter or remove exported |
| **Implicit intent restrictions** | Apps using implicit intents to non-exported components | Use explicit intents |
| **Background activity launch restrictions** | Apps starting activities from background | Use full-screen intent for notifications |
| **Photo picker required** | Apps requesting READ_EXTERNAL_STORAGE | Use PhotoPicker for media |
| **Granular media permissions** | Apps accessing media files | Request READ_MEDIA_IMAGES, READ_MEDIA_VIDEO, or READ_MEDIA_AUDIO |

### Key Android 14 Changes

```xml
<!-- Android 14+: Exported receivers MUST have intent-filter -->
<receiver android:name=".MyReceiver"
           android:exported="true">
    <intent-filter>
        <action android:name="android.intent.action.BOOT_COMPLETED"/>
    </intent-filter>
</receiver>

<!-- WRONG: Will crash on Android 14+ -->
<receiver android:name=".MyReceiver"
           android:exported="true">
    <!-- Missing intent-filter! -->
</receiver>
```

### Photo Picker Requirement

```java
// Instead of:
// <uses-permission android:name="android.permission.READ_EXTERNAL_STORAGE"/>

// Use Photo Picker:
ActivityResultLauncher<PickVisualMediaRequest> picker =
    registerForActivityResult(new PickVisualMedia(), uri -> {
        // Handle selected media
    });

picker.launch(new PickVisualMediaRequest.Builder()
    .setMediaType(PickVisualMedia.ImageAndVideo.INSTANCE)
    .build());
```

## Android 13 Security Features (API 33)

### Runtime Notification Permission

```xml
<!-- New permission required -->
<uses-permission android:name="android.permission.POST_NOTIFICATIONS"/>
```

**Audit checks:**
- Apps targeting API 33+ must request POST_NOTIFICATIONS at runtime
- Check if app handles notification permission denial gracefully
- Verify notification content doesn't leak sensitive data

### Granular Media Permissions

```xml
<!-- Available on Android 13+ -->
<uses-permission android:name="android.permission.READ_MEDIA_IMAGES"/>
<uses-permission android:name="android.permission.READ_MEDIA_VIDEO"/>
<uses-permission android:name="android.permission.READ_MEDIA_AUDIO"/>
```

### Nearby Device Permissions

```xml
<!-- For Bluetooth/WiFi scanning -->
<uses-permission android:name="android.permission.NEARBY_WIFI_DEVICES"/>
<uses-permission android:name="android.permission.BLUETOOTH_SCAN"/>
```

## Android 12 Security Features (API 31)

### Exported Components Must Be Explicit

```xml
<!-- Android 12+: Must explicitly set exported -->
<activity android:name=".ExportedActivity"
           android:exported="true">  <!-- REQUIRED! -->
    <intent-filter>
        <action android:name="android.intent.action.VIEW"/>
    </intent-filter>
</activity>

<!-- Before API 31: exported defaulted to true with intent-filter -->
<!-- API 31+: compiled error if not explicit -->
```

### PendingIntent Mutability

```java
// Android 12+: Must specify mutability
PendingIntent pendingIntent = PendingIntent.getActivity(
    context,
    requestCode,
    intent,
    PendingIntent.FLAG_IMMUTABLE  // REQUIRED
);

// Or explicitly mutable (rare cases)
PendingIntent pendingIntent = PendingIntent.getActivity(
    context,
    requestCode,
    intent,
    PendingIntent.FLAG_MUTABLE
);
```

### Exact Alarm Restrictions

```xml
<!-- Need permission for exact alarms -->
<uses-permission android:name="android.permission.SCHEDULE_EXACT_ALARM"/>
```

## Biometric Authentication Best Practices

### KeyStore-Bound Biometric Authentication

```java
// SECURE: KeyStore-bound key protected by biometric
KeyGenParameterSpec keySpec = new KeyGenParameterSpec.Builder(
    "biometric_key",
    KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
    .setUserAuthenticationRequired(true)
    .setUserAuthenticationValidityDurationSeconds(-1)  // Require auth per use
    .setInvalidatedByBiometricEnrollment(true)  // Invalidate on biometric change
    .setUserAuthenticationType(KeyProperties.USER_AUTHENTICATION_TYPE_BIOMETRIC_STRONG)
    .build();

KeyGenerator keyGenerator = KeyGenerator.getInstance(
    KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
keyGenerator.init(keySpec);
SecretKey key = keyGenerator.generateKey();

// Usage with BiometricPrompt
BiometricPrompt.CryptoObject cryptoObject =
    new BiometricPrompt.CryptoObject(cipher);

biometricPrompt.authenticate(promptInfo, cryptoObject);
```

### What NOT To Do

```java
// INSECURE: UI-only biometric check
BiometricPrompt prompt = new BiometricPrompt(this, executor,
    new BiometricPrompt.AuthenticationCallback() {
        @Override
        public void onAuthenticationSucceeded(AuthenticationResult result) {
            // PROBLEM: Just UI callback, can be hooked/bypassed
            openSensitiveFeature();
        }
    });

// INSECURE: Fallback to non-biometric for sensitive operations
// Should require strong auth for sensitive operations
```

### Biometric Authentication Audit Checklist

| Check | What to Look For |
|-------|-------------------|
| CryptoObject usage | BiometricPrompt should use CryptoObject |
| KeyStore binding | Key should have setUserAuthenticationRequired(true) |
| Invalidated by biometric change | setInvalidatedByBiometricEnrollment(true) |
| Auth type | USER_AUTHENTICATION_TYPE_BIOMETRIC_STRONG for high-security |
| Fallback handling | No fallback to weak auth for sensitive operations |
| Session duration | setUserAuthenticationValidityDurationSeconds(-1) for single-use |
| Error handling | Proper handling of authentication failures |

## Security Feature Comparison by Android Version

| Feature | Android 12 | Android 13 | Android 14 | Android 15 | Android 16 |
|---------|-----------|-------------|-------------|-------------|-------------|
| Exported explicit | ✅ Required | ✅ Required | ✅ Required | ✅ Required | ✅ Required |
| PendingIntent mutability | ✅ Required | ✅ Required | ✅ Required | ✅ Required | ✅ Required |
| Notification permission | ❌ | ✅ Required | ✅ Required | ✅ Required | ✅ Required |
| Photo picker | ⚠️ Optional | ⚠️ Recommended | ✅ Required (media) | ✅ Required | ✅ Required (enhanced) |
| Granular media | ❌ | ✅ Available | ✅ Required | ✅ Required | ✅ Required |
| Exported receiver intent-filter | ❌ | ❌ | ✅ Required | ✅ Required | ✅ Required |
| Implicit intent restriction | ⚠️ | ⚠️ | ✅ Enforced | ✅ Enforced | ✅ Enforced |
| Background activity restriction | ⚠️ | ⚠️ | ✅ Stricter | ✅ Stricter | ✅ Refined |
| Certificate transparency | ⚠️ | ⚠️ | ⚠️ | ✅ Enhanced | ✅ Updated |
| Private space | ❌ | ❌ | ❌ | ✅ Available | ✅ Available |
| Predictive back gesture | ⚠️ | ⚠️ | ⚠️ | ✅ Required | ✅ Mandatory |
| Edge-to-edge | ❌ | ❌ | ⚠️ | ⚠️ | ✅ Enforced |
| Privacy Sandbox | ❌ | ❌ | ⚠️ | ⚠️ | ✅ Enabled |
| BODY_SENSORS_BACKGROUND | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ✅ Enforced |
| Live Updates | ❌ | ❌ | ❌ | ❌ | ✅ Available |
| Per-app language API | ❌ | ⚠️ | ⚠️ | ⚠️ | ✅ Updated |
| Health Connect updates | ❌ | ❌ | ⚠️ | ✅ Available | ✅ Enhanced |

## Testing Checklist by Android Version

### Android 16+ Testing

```bash
# Test BODY_SENSORS_BACKGROUND permission enforcement
adb shell pm grant com.target.app android.permission.BODY_SENSORS_BACKGROUND
adb shell cmd appops get com.target.app BODY_SENSORS_BACKGROUND

# Test predictive back gesture (now mandatory)
adb shell am start -n com.target.app/.MainActivity
adb shell cmd input keyevent KEYCODE_BACK
# Verify predictive back animation and behavior

# Test edge-to-edge handling
adb shell wm overscan 0,0,0,0
adb shell screenshot /sdcard/edge_test.png
adb pull /sdcard/edge_test.png

# Test Live Updates notifications
adb shell dumpsys notification --noredact | grep "com.target.app"

# Test Privacy Sandbox Topics API
adb shell cmd device_config get privacy_sandbox adservices_enabled

# Test Health Connect API
adb shell cmd health_connect get-health-data
```

### Android 15+ Testing

```bash
# Test exported receivers crash
adb shell am broadcast -n com.target.app/.ReceiverWithoutIntentFilter

# Test private space isolation
adb shell cmd appops set com.target.app PRIVATE_SPACE allow
adb shell cmd appops get com.target.app PRIVATE_SPACE

# Verify certificate transparency
adb shell dumpsys package com.target.app | grep -i certificate

# Test predictive back behavior
adb shell am start -n com.target.app/.Activity
# Verify back gesture works correctly
```

### Android 14+ Testing

```bash
# Test exported receivers crash
adb shell am broadcast -n com.target.app/.ReceiverWithoutIntentFilter

# Test implicit intent restrictions
adb shell am start -a android.intent.action.VIEW -d "test://test"

# Test back stack behavior
adb shell am start -n com.target.app/.Activity
# Verify back gesture works correctly
```

### Android 13+ Testing

```bash
# Test notification permission request
adb shell pm grant com.target.app android.permission.POST_NOTIFICATIONS

# Test granular media permissions
adb shell pm grant com.target.app android.permission.READ_MEDIA_IMAGES
adb shell pm grant com.target.app android.permission.READ_MEDIA_VIDEO

# Test photo picker
# Trigger photo selection and verify behavior
```

### Android 12+ Testing

```bash
# Test PendingIntent mutability
# Check for crashes with intent flags

# Test exact alarm permission
adb shell pm grant com.target.app android.permission.SCHEDULE_EXACT_ALARM
```

## Cross-OS Testing Commands

### ADB Commands

| Task | macOS/Linux | Windows (PowerShell) | Windows (Git Bash) |
|------|-------------|---------------------|---------------------|
| List devices | `adb devices` | `adb devices` | `adb devices` |
| Install APK | `adb install app.apk` | `adb install app.apk` | `adb install app.apk` |
| Uninstall app | `adb uninstall com.package` | `adb uninstall com.package` | `adb uninstall com.package` |
| Pull file from device | `adb pull /sdcard/file.txt` | `adb pull /sdcard/file.txt` | `adb pull /sdcard/file.txt` |
| Push file to device | `adb push file.txt /sdcard/` | `adb push file.txt /sdcard/` | `adb push file.txt /sdcard/` |
| Start activity | `adb shell am start -n com.pkg/.Act` | `adb shell am start -n com.pkg/.Act` | `adb shell am start -n com.pkg/.Act` |
| Check app permissions | `adb shell dumpsys package com.pkg` | `adb shell dumpsys package com.pkg` | `adb shell dumpsys package com.pkg` |
| Grant permission | `adb shell pm grant com.pkg perm` | `adb shell pm grant com.pkg perm` | `adb shell pm grant com.pkg perm` |
| Revoke permission | `adb shell pm revoke com.pkg perm` | `adb shell pm revoke com.pkg perm` | `adb shell pm revoke com.pkg perm` |
| Take screenshot | `adb shell screencap -p > screen.png` | `adb shell screencap -p > screen.png` | `adb shell screencap -p > screen.png` |
| Screen recording | `adb shell screenrecord video.mp4` | `adb shell screenrecord video.mp4` | `adb shell screenrecord video.mp4` |
| Logcat | `adb logcat` | `adb logcat` | `adb logcat` |
| Clear logcat | `adb logcat -c` | `adb logcat -c` | `adb logcat -c` |
| Filter logcat | `adb logcat -s TAG` | `adb logcat -s TAG` | `adb logcat -s TAG` |
| Shell access | `adb shell` | `adb shell` | `adb shell` |
| Reboot device | `adb reboot` | `adb reboot` | `adb reboot` |
| Check device info | `adb shell getprop ro.build.version.release` | `adb shell getprop ro.build.version.release` | `adb shell getprop ro.build.version.release` |
| Check SDK version | `adb shell getprop ro.build.version.sdk` | `adb shell getprop ro.build.version.sdk` | `adb shell getprop ro.build.version.sdk` |

### APK Extraction & Analysis

#### macOS/Linux

```bash
# Extract APK using apktool
apktool d app.apk -o app_decompiled

# Build APK using apktool
apktool b app_decompiled -o app_rebuilt.apk

# Get APK info using aapt
> **Note**: `aapt` commands are valid for read operations. For build operations, use `aapt2`. See `references/quick-commands.md#tool-version-notes`.
aapt dump badging app.apk

# Get APK permissions
aapt dump permissions app.apk

# Get APK manifest
aapt dump xmltree app.apk AndroidManifest.xml

# Decompile using jadx (CLI)
jadx -d jadx_output app.apk

# Convert APK to DEX
unzip -q app.apk classes*.dex

# Sign APK (debug)
jarsigner -keystore ~/.android/debug.keystore app.apk androiddebugkey
zipalign -v 4 app.apk app_aligned.apk

# Check APK signature
jarsigner -verify -verbose -certs app.apk
```

#### Windows (PowerShell)

```powershell
# Extract APK using apktool
.\apktool.bat d app.apk -o app_decompiled

# Build APK using apktool
.\apktool.bat b app_decompiled -o app_rebuilt.apk

# Get APK info using aapt
& "$env:ANDROID_HOME\build-tools\35.0.0\aapt.exe" dump badging app.apk

# Get APK permissions
& "$env:ANDROID_HOME\build-tools\35.0.0\aapt.exe" dump permissions app.apk

# Get APK manifest
& "$env:ANDROID_HOME\build-tools\35.0.0\aapt.exe" dump xmltree app.apk AndroidManifest.xml

# Decompile using jadx (CLI)
.\jadx\bin\jadx.bat -d jadx_output app.apk

# Convert APK to DEX
Expand-Archive -Path app.apk -DestinationPath apk_extracted -Force

# Sign APK (debug)
$keystorePath = "$env:USERPROFILE\.android\debug.keystore"
& "$env:JAVA_HOME\bin\jarsigner.exe" -keystore $keystorePath app.apk androiddebugkey
& "$env:ANDROID_HOME\build-tools\35.0.0\zipalign.exe" -v 4 app.apk app_aligned.apk

# Check APK signature
& "$env:JAVA_HOME\bin\jarsigner.exe" -verify -verbose -certs app.apk
```

#### Windows (Git Bash)

```bash
# Extract APK using apktool
./apktool.bat d app.apk -o app_decompiled

# Build APK using apktool
./apktool.bat b app_decompiled -o app_rebuilt.apk

# Get APK info using aapt
$ANDROID_HOME/build-tools/35.0.0/aapt.exe dump badging app.apk

# Get APK permissions
$ANDROID_HOME/build-tools/35.0.0/aapt.exe dump permissions app.apk

# Get APK manifest
$ANDROID_HOME/build-tools/35.0.0/aapt.exe dump xmltree app.apk AndroidManifest.xml

# Decompile using jadx (CLI)
./jadx/bin/jadx.bat -d jadx_output app.apk

# Convert APK to DEX
unzip -q app.apk classes*.dex

# Sign APK (debug)
jarsigner -keystore ~/.android/debug.keystore app.apk androiddebugkey
$ANDROID_HOME/build-tools/35.0.0/zipalign.exe -v 4 app.apk app_aligned.apk

# Check APK signature
jarsigner -verify -verbose -certs app.apk
```

### Frida Setup & Commands

#### macOS/Linux

```bash
# Check Frida version
frida --version

# List Frida devices
frida-ps -D

# List processes on device
frida-ps -U

# Attach to running process
frida -U -f com.package.name

# Spawn process and attach
frida -U -f com.package.name

# Run Frida script
frida -U -f com.package.name -l script.js

# List loaded modules
frida -U com.package.name -e "Java.enumerateLoadedClasses()"

# List exports
frida -U com.package.name -e "Module.enumerateExports('libc.so')"

# Dump memory
frida -U com.package.name -e "Memory.scan()"

# Trace functions
frida-trace -U -f com.package.name -i "*!*"

# Push frida-server to device
adb push frida-server /data/local/tmp/
adb shell chmod 755 /data/local/tmp/frida-server

# Start frida-server
adb shell /data/local/tmp/frida-server

# Disable SELinux temporarily (for testing only)
adb shell setenforce 0

# Port forwarding
adb forward tcp:27042 tcp:27042

# Kill frida-server
adb shell killall frida-server
```

#### Windows (PowerShell)

```powershell
# Check Frida version
frida --version

# List Frida devices
frida-ps -D

# List processes on device
frida-ps -U

# Attach to running process
frida -U -f com.package.name

# Spawn process and attach
frida -U -f com.package.name

# Run Frida script
frida -U -f com.package.name -l script.js

# List loaded modules
frida -U com.package.name -e "Java.enumerateLoadedClasses()"

# List exports
frida -U com.package.name -e "Module.enumerateExports('libc.so')"

# Dump memory
frida -U com.package.name -e "Memory.scan()"

# Trace functions
frida-trace -U -f com.package.name -i "*!*"

# Push frida-server to device
adb push frida-server-android-arm64 /data/local/tmp/frida-server
adb shell "chmod 755 /data/local/tmp/frida-server"

# Start frida-server
adb shell "/data/local/tmp/frida-server &"

# Disable SELinux temporarily (for testing only)
adb shell setenforce 0

# Port forwarding
adb forward tcp:27042 tcp:27042

# Kill frida-server
adb shell "killall frida-server"
```

#### Windows (Git Bash)

```bash
# Check Frida version
frida --version

# List Frida devices
frida-ps -D

# List processes on device
frida-ps -U

# Attach to running process
frida -U -f com.package.name

# Spawn process and attach
frida -U -f com.package.name

# Run Frida script
frida -U -f com.package.name -l script.js

# List loaded modules
frida -U com.package.name -e "Java.enumerateLoadedClasses()"

# List exports
frida -U com.package.name -e "Module.enumerateExports('libc.so')"

# Dump memory
frida -U com.package.name -e "Memory.scan()"

# Trace functions
frida-trace -U -f com.package.name -i "*!*"

# Push frida-server to device
adb push frida-server-android-arm64 /data/local/tmp/frida-server
adb shell chmod 755 /data/local/tmp/frida-server

# Start frida-server
adb shell /data/local/tmp/frida-server &

# Disable SELinux temporarily (for testing only)
adb shell setenforce 0

# Port forwarding
adb forward tcp:27042 tcp:27042

# Kill frida-server
adb shell killall frida-server
```

### Tool Path Differences

#### macOS

```bash
# Android SDK location
export ANDROID_HOME=$HOME/Library/Android/sdk
export PATH=$PATH:$ANDROID_HOME/platform-tools:$ANDROID_HOME/tools:$ANDROID_HOME/build-tools/35.0.0

# Java home
export JAVA_HOME=$(/usr/libexec/java_home)

# ADB
adb devices

# AAPT (build-tools)
$ANDROID_HOME/build-tools/35.0.0/aapt

# Apktool
apktool

# Jadx
jadx

# Frida
frida
```

#### Linux

```bash
# Android SDK location (common paths)
export ANDROID_HOME=$HOME/Android/Sdk
# or
export ANDROID_HOME=/opt/android-sdk

export PATH=$PATH:$ANDROID_HOME/platform-tools:$ANDROID_HOME/tools:$ANDROID_HOME/build-tools/35.0.0

# Java home
export JAVA_HOME=/usr/lib/jvm/java-17-openjdk-amd64
# or
export JAVA_HOME=/usr/lib/jvm/default-java

# ADB
adb devices

# AAPT (build-tools)
$ANDROID_HOME/build-tools/35.0.0/aapt

# Apktool
apktool

# Jadx
jadx

# Frida
frida
```

#### Windows (PowerShell)

```powershell
# Android SDK location
$env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
# or
$env:ANDROID_HOME = "C:\Users\$env:USERNAME\AppData\Local\Android\Sdk"

$env:PATH += ";$env:ANDROID_HOME\platform-tools"
$env:PATH += ";$env:ANDROID_HOME\tools"
$env:PATH += ";$env:ANDROID_HOME\build-tools\35.0.0"

# Java home
$env:JAVA_HOME = "C:\Program Files\Java\jdk-17"
# or
$env:JAVA_HOME = "C:\Program Files\Eclipse Adoptium\jdk-17.0.8.101-hotspot"

# ADB
adb devices

# AAPT (build-tools) - full path needed or add to PATH
& "$env:ANDROID_HOME\build-tools\35.0.0\aapt.exe"

# Apktool
.\apktool.bat

# Jadx
.\jadx\bin\jadx.bat

# Frida
frida

# Persistent environment variables (run as Administrator)
[System.Environment]::SetEnvironmentVariable('ANDROID_HOME', "$env:LOCALAPPDATA\Android\Sdk", 'User')
[System.Environment]::SetEnvironmentVariable('JAVA_HOME', "C:\Program Files\Java\jdk-17", 'User')
```

#### Windows (Git Bash)

```bash
# Android SDK location
export ANDROID_HOME="$LOCALAPPDATA/Android/Sdk"
# or
export ANDROID_HOME="/c/Users/$USER/AppData/Local/Android/Sdk"

export PATH="$PATH:$ANDROID_HOME/platform-tools:$ANDROID_HOME/tools:$ANDROID_HOME/build-tools/35.0.0"

# Java home
export JAVA_HOME="/c/Program Files/Java/jdk-17"
# or
export JAVA_HOME="/c/Program Files/Eclipse Adoptium/jdk-17.0.8.101-hotspot"

# ADB
adb devices

# AAPT (build-tools)
$ANDROID_HOME/build-tools/35.0.0/aapt.exe

# Apktool
./apktool.bat

# Jadx
./jadx/bin/jadx.bat

# Frida
frida

# Add to ~/.bashrc for persistence
cat >> ~/.bashrc << 'EOF'
export ANDROID_HOME="$LOCALAPPDATA/Android/Sdk"
export JAVA_HOME="/c/Program Files/Java/jdk-17"
export PATH="$PATH:$ANDROID_HOME/platform-tools:$ANDROID_HOME/tools:$ANDROID_HOME/build-tools/35.0.0"
EOF
```

### Path Separator Differences

| Platform | Path Separator | Example |
|----------|---------------|---------|
| macOS/Linux | `:` (colon) | `$PATH:$ANDROID_HOME/tools` |
| Windows (PowerShell) | `;` (semicolon) | `$env:PATH + ";$ANDROID_HOME\tools"` |
| Windows (Git Bash) | `:` (colon) | `$PATH:$ANDROID_HOME/tools` |

### File Path Differences

| Platform | Path Separator | Example |
|----------|---------------|---------|
| macOS/Linux | `/` (forward slash) | `$HOME/Downloads/app.apk` |
| Windows (PowerShell) | `\` (backslash) | `%USERPROFILE%\Downloads\app.apk` |
| Windows (Git Bash) | `/` (forward slash, or `/c/` for drive) | `$HOME/Downloads/app.apk` |

### Environment Variable Differences

| Variable | macOS/Linux | Windows (PowerShell) | Windows (Git Bash) |
|----------|-------------|---------------------|---------------------|
| User home | `$HOME` | `$env:USERPROFILE` or `$HOME` | `$HOME` |
| Local app data | `~/Library/Application Support` | `$env:LOCALAPPDATA` | `$LOCALAPPDATA` |
| Temp dir | `/tmp` | `$env:TEMP` | `/tmp` or `$TEMP` |
| Path separator | `:` | `;` | `:` |
| Export var | `export VAR=value` | `$env:VAR = "value"` | `export VAR=value` |

### Common Cross-OS Gotchas

1. **Line endings:** macOS/Linux uses LF (`\n`), Windows uses CRLF (`\r\n`). Git Bash handles this automatically.
2. **Executable permissions:** macOS/Linux requires `chmod +x`, Windows doesn't.
3. **Case sensitivity:** macOS/Linux filesystems are case-sensitive, Windows is not.
4. **Symlinks:** macOS/Linux supports symlinks natively, Windows requires administrator privileges or development mode.
5. **Process management:** macOS/Linux uses `kill`, Windows uses `Stop-Process` or `taskkill`.
6. **Background processes:** macOS/Linux uses `&`, PowerShell uses `Start-Job` or `&`.

### Quick Reference: OS Detection in Scripts

```bash
# Detect OS in shell script
if [[ "$OSTYPE" == "darwin"* ]]; then
    # macOS
    export ANDROID_HOME=$HOME/Library/Android/sdk
elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
    # Linux
    export ANDROID_HOME=$HOME/Android/Sdk
elif [[ "$OSTYPE" == "msys" ]] || [[ "$OSTYPE" == "win32" ]]; then
    # Git Bash / Windows
    export ANDROID_HOME="$LOCALAPPDATA/Android/Sdk"
fi
```

```powershell
# Detect OS in PowerShell
if ($IsWindows) {
    $env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
    $env:JAVA_HOME = "C:\Program Files\Java\jdk-17"
} elseif ($IsMacOS) {
    $env:ANDROID_HOME = "$env:HOME/Library/Android/sdk"
    $env:JAVA_HOME = "/usr/libexec/java_home"
} elseif ($IsLinux) {
    $env:ANDROID_HOME = "$env:HOME/Android/Sdk"
    $env:JAVA_HOME = "/usr/lib/jvm/default-java"
}
```

---

**Note:** Always verify tool paths and versions before running security audits. Android build-tools versions may vary (e.g., 33.0.0, 34.0.0, 35.0.0, etc.). Adjust paths accordingly.
