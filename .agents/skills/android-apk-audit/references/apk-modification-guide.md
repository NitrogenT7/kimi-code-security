# APK Modification / Repackaging Workflow

Complete guide for modifying and repackaging Android APKs for testing.

## When to Use

When the user asks to modify an APK, patch security checks, or repackage for testing.

## Workflow

### 1. Decode

```bash
apktool d app.apk -o app-modified/
```

### 2. Modify

#### Smali Patching for Security Checks Bypass

Edit smali files in `app-modified/smali/`:

```smali
# Find the security check method
.method public checkSecurity()Z
    .locals 1

    # Original check (commented out for patch)
    # iget-boolean v0, p0, Lcom/example/App;->securityEnabled:Z
    # return v0

    # Patched version - always return true (bypass security)
    const/4 v0, 0x1
    return v0
.end method
```

**Common smali patches**:
- Return true/false to bypass checks
- Replace constants with new values
- Modify conditional branches
- Remove method calls entirely

#### Resource Modification

Edit XML or resource files in `app-modified/res/`:

```xml
<!-- Change debug flag -->
<bool name="debug_mode">true</bool>

<!-- Modify network security config -->
<network-security-config>
    <domain-config cleartextTrafficPermitted="true">
        <domain includeSubdomains="true">example.com</domain>
    </domain-config>
</network-security-config>
```

**Common resource modifications**:
- Enable/disable debug mode
- Modify API endpoints
- Change certificate pinning settings
- Alter feature flags

### 3. Rebuild

```bash
apktool b app-modified/ -o app-modified.apk
```

**If rebuild fails**:
- Check for missing resources or invalid XML
- Ensure AndroidManifest.xml is valid
- Verify all smali files compile correctly

### 4. Sign

#### Generate Debug Keystore (First Time Only)

```bash
keytool -genkey -v \
  -keystore debug.keystore \
  -alias androiddebugkey \
  -keyalg RSA \
  -keysize 2048 \
  -validity 10000 \
  -storepass android \
  -keypass android
```

#### Sign APK

**Recommended for modern Android (API 24+)**: Use `apksigner` which supports v2/v3/v3.1 APK signature schemes.

```bash
# Sign with apksigner (recommended)
apksigner sign \
  --ks debug.keystore \
  --ks-key-alias androiddebugkey \
  --ks-pass pass:android \
  --key-pass pass:android \
  --out app-signed.apk \
  app-aligned.apk

# Verify signature
apksigner verify --verbose app-signed.apk
```

**Legacy jarsigner** (only for environments without apksigner):
```bash
# Sign with jarsigner (legacy)
jarsigner -verbose \
  -sigalg SHA256withRSA \
  -digestalg SHA-256 \
  -keystore debug.keystore \
  -storepass android \
  -keypass android \
  app-modified.apk \
  androiddebugkey
```

#### Align APK

```bash
zipalign -v 4 app-modified.apk app-modified-aligned.apk
```

**Alignment verification**:
```bash
zipalign -c -v 4 app-modified-aligned.apk
```

### 5. Install

```bash
adb install -r app-modified-aligned.apk
```

**If installation fails with signature mismatch**:
```bash
adb uninstall com.example.app
adb install app-modified-aligned.apk
```

## Advanced Techniques

### Signature Verification Bypass

For apps that check signature at runtime:

1. Find signature verification code in smali
2. Patch to always return valid signature
3. Or replace with your own signature's hash

### Multiple Smali Modifications

When modifying multiple methods:
- Use version control (git) to track changes
- Test each modification individually
- Document the purpose of each change

### Preserving Native Libraries

The `apktool b` command preserves `.so` files in `lib/` automatically.

If you need to modify native code:
1. Extract `.so` files from original APK
2. Use Ghidra/IDA for analysis
3. Patch native binaries (advanced)
4. Place modified `.so` files back in `lib/`
5. Rebuild and sign

## Troubleshooting

| Issue | Cause | Solution |
|-------|-------|----------|
| `Cannot find app` | Wrong package name | Use `adb shell pm list packages` |
| `INSTALL_FAILED_UPDATE_INCOMPATIBLE` | Signature mismatch | Uninstall first: `adb uninstall pkg` |
| `Exception in thread main` | Invalid smali | Check smali syntax, method signatures |
| `res/xml/... is corrupt` | Invalid XML | Validate XML files before rebuild |
| `Failed to verify package` | Signing issue | Re-generate keystore and sign again |

## Reference

See `references/dynamic-analysis-setup.md` for:
- Advanced repackaging techniques
- Signature verification bypass methods
- ADB debugging commands
- Runtime instrumentation after modification
