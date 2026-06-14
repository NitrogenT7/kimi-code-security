# React Native + Hermes APK Analysis & Modification

**Context:** Technical documentation for offensive security audits on React Native Android apps. Applies to any app using Hermes as JS engine and OkHttp for HTTP communications.

---

## 1. Typical React Native APK Structure

```
assets/
  index.android.bundle      ← Hermes bytecode (NOT plain JS)
smali/                       ← Main native code (Dalvik bytecode)
smali_classes2/ ... smali_classesN/  ← Additional classes (can be 12+)
com/<package>/               ← App's own code (usually <50 files)
com/facebook/react/          ← React Native bridge
```

**Third-party libraries vary by app functionality. Common examples:**
- **Billing & Payments:** `com/android/billingclient/`, `com/dooboolab/rniap/`, `com/stripe/`
- **Storage:** `com/google/firebase/`, `com/amazonaws/`, `com/reactnativecommunity/asyncstorage/`
- **Analytics:** `com/google/analytics/`, `com/adjust/`, `com/mixpanel/`
- **Authentication:** `com/google/firebase/auth/`, `com/auth0/`, `com/facebook/accountkit/`
- **Navigation:** `com/reactnativecommunity/navigation/`, `com/swmansion/`
- **UI Components:** `com/swmansion/reanimated/`, `com/horcrux/svg/`, `com/airbnb/`

**Field Note:** Most smali files are third-party libraries. The app's own code is under `com/<package>/` and is surprisingly small.

### Finding Your App's Package Name

Before using smali examples, identify your app's package:

```bash
# From AndroidManifest.xml (decompiled APK)
grep 'package=' AndroidManifest.xml
# Output: package="com.example.app"

# From installed device
adb shell pm list packages | grep your.app.name

# From APK using aapt
aapt dump badging app.apk | grep package
```

### Understanding Smali Paths

Smali paths use directory structure based on package name:
- Package: `com.example.app` → Smali path: `com/example/app/`
- Package: `com.company.product.feature` → Smali path: `com/company/product/feature/`

**Always replace `TARGET_PACKAGE` in code examples with your app's package path.**

---

## 2. Hermes Bytecode: Capabilities and Limitations

Hermes compiles JS to bytecode at build time. This means:

### Decompilation Tools (Updated 2026)

**Hermes bytecode CAN be decompiled** with modern tools:

| Tool | Status | Capability | Link |
|------|--------|------------|------|
| **hermes-dec** | ✅ Active | Disassembler + Decompiler to pseudo-JS | [GitHub P1sec/hermes-dec](https://github.com/P1sec/hermes-dec) |
| **Hermes Studio** | ✅ Active (2026) | Web-based full disassembler/decompiler | [bytecodestudio.com](https://bytecodestudio.com) |

**Installation:**
```bash
# Recommended: hermes-dec
pip install hermes-dec

# Or use Hermes Studio (web-based, no installation)
# https://bytecodestudio.com
```

**Usage:**
```bash
# Install hermes-dec (P1sec's Hermes Decompiler)
pip install hermes-dec

# Decompile Hermes bytecode to pseudo-JS
hermes-dec decompile assets/index.android.bundle -o output_dir/

# Disassemble to human-readable assembly
hermes-dec disassemble assets/index.android.bundle -o output.hasm

# Parse bytecode and show metadata
hermes-dec parse assets/index.android.bundle
```

**Decompilation Output Quality:**
- ✅ Function names preserved
- ✅ String constants visible
- ✅ Control flow partially recoverable
- ❌ Variable names lost (minified to single letters)
- ❌ Comments not recoverable
- ⚠️ Loop structures need manual reconstruction

### When String Extraction is Still Useful

Even with hermes-dec, **string extraction** remains valuable for:

```bash
strings assets/index.android.bundle > hermes_strings.txt

# Quick search without full decompilation
grep -iE "api|endpoint|token|key|secret|url" hermes_strings.txt
```

### How to Identify App-Specific Keywords

1. **Extract API endpoints from strings:**
   ```bash
   strings assets/index.android.bundle | grep -E 'http[s]?://.*api' | head -20
   ```

2. **Analyze decompiled code for business logic:**
   ```bash
   # Using hermes-dec output
   grep -rn "fetch\|axios\|XMLHttpRequest" decompiled.js | head -20

   # Look for JSON response handling (use rg for cross-platform compatibility)
   rg '".+":.*' decompiled.js --type js | grep -v function | head -30
   ```

3. **Common keywords by domain:**
   - **Games:** reward, gem, coin, unlock, level, score
   - **Fintech:** amount, balance, transaction, transfer, limit
   - **E-commerce:** product, cart, purchase, order, discount
   - **Health:** steps, calories, distance, duration, workout
   - **Auth:** token, session, authenticated, verified, loggedIn

4. **Analyze network traffic:**
   ```bash
   # Set up proxy interception first
   # Then look for response fields in:
   # - Burp Suite HTTP history
   # - mitmproxy flows
   # - Frida webview monitor
   ```

---

## 3. OkHttp Interceptor Pattern

This is the **primary modification vector** in React Native apps. React Native uses OkHttp for **all** HTTP requests, allowing interception and modification of server responses before the app processes them.

### 3.1 Create the Interceptor

Create file `ResponseInterceptor.smali` (or `DataInterceptor.smali`) inside the app's package:

```smali
.class public Lcom/example/app/ResponseInterceptor;
.super Ljava/lang/Object;
.implements Lokhttp3/Interceptor;

.method public intercept(Lokhttp3/Interceptor$Chain;)Lokhttp3/Response;
    .locals 6

    # Get original request and proceed with call
    invoke-interface {p1}, Lokhttp3/Interceptor$Chain;->request()Lokhttp3/Request;
    move-result-object v0
    invoke-interface {p1, v0}, Lokhttp3/Interceptor$Chain;->proceed(Lokhttp3/Request;)Lokhttp3/Response;
    move-result-object v0

    # CRITICAL: Verify Content-Type before processing
    # Without this check, binary responses (images, etc.) break
    invoke-virtual {v0}, Lokhttp3/Response;->body()Lokhttp3/ResponseBody;
    move-result-object v1
    invoke-virtual {v1}, Lokhttp3/ResponseBody;->contentType()Lokhttp3/MediaType;
    move-result-object v2
    invoke-virtual {v2}, Lokhttp3/MediaType;->toString()Ljava/lang/String;
    move-result-object v3
    const-string v4, "json"
    invoke-virtual {v3, v4}, Ljava/lang/String;->contains(Ljava/lang/CharSequence;)Z
    move-result v3
    if-eqz v3, :return_original

    # Read body as string
    invoke-virtual {v1}, Lokhttp3/ResponseBody;->string()Ljava/lang/String;
    move-result-object v3

    # Filter by keywords based on your app's business logic
    # Identify relevant fields from strings or decompiled code
    const-string v4, "amount"
    invoke-virtual {v3, v4}, Ljava/lang/String;->contains(Ljava/lang/CharSequence;)Z
    move-result v4
    if-nez v4, :do_modify
    # Add more keywords based on target app analysis...

    :do_modify
    invoke-static {v3}, Lcom/example/app/ResponseInterceptor;->modifyResponse(Ljava/lang/String;)Ljava/lang/String;
    move-result-object v3

    # Rebuild response with modified body
    invoke-static {v2, v3}, Lokhttp3/ResponseBody;->create(Lokhttp3/MediaType;Ljava/lang/String;)Lokhttp3/ResponseBody;
    move-result-object v4
    invoke-virtual {v0}, Lokhttp3/Response;->newBuilder()Lokhttp3/Response$Builder;
    move-result-object v5
    invoke-virtual {v5, v4}, Lokhttp3/Response$Builder;->body(Lokhttp3/ResponseBody;)Lokhttp3/Response$Builder;
    move-result-object v5
    invoke-virtual {v5}, Lokhttp3/Response$Builder;->build()Lokhttp3/Response;
    move-result-object v0

    :return_original
    return-object v0
.end method
```

**Method naming guide:**
- `modifyResponse()` - Generic response modification
- `multiplyValues()` - Multiply numeric values
- `forceSuccess()` - Force boolean fields to true
- `bypassValidation()` - Remove validation checks

Choose based on your modification goal, not specific domain terms.

### 3.2 Register the Interceptor

Locate method `createClientBuilder` in `OkHttpClientProvider.smali` (path: `com/facebook/react/modules/network/`) and add:

```smali
new-instance v1, Lcom/example/app/ResponseInterceptor;
invoke-direct {v1}, Lcom/example/app/ResponseInterceptor;-><init>()V
invoke-virtual {v0, v1}, Lokhttp3/OkHttpClient$Builder;->addInterceptor(Lokhttp3/Interceptor;)Lokhttp3/OkHttpClient$Builder;
move-result-object v0
```

---

## 4. VerifyError: Cause and Solution

### Symptom

```
java.lang.VerifyError: Verifier rejected class
[0x164] RejectingInvocation, expected N argument registers, method signature has M
```

### Root Cause

In Dalvik/ART, the verifier validates that the number of registers declared in `.locals` is consistent with actual usage in the method. A method with too many instructions or incorrect `.locals` count triggers this error. Also occurs when a method exceeds the practical complexity limit the verifier can handle correctly.

### Solution: Split into Sub-Methods

```smali
# BAD: One method with 50+ replace operations
.method public static processAll(Ljava/lang/String;)Ljava/lang/String;
    # 50+ operations... causes VerifyError
.end method

# GOOD: Generic dispatcher pattern - divide by modification category
.method private static modifyNumericFields(Ljava/lang/String;)Ljava/lang/String;
    .locals 4
    # 10-12 replacements for: amount, value, balance, cost, price
    return-object v0
.end method

.method private static modifyBooleanFields(Ljava/lang/String;)Ljava/lang/String;
    .locals 4
    # 10-12 replacements for: success, purchased, unlocked, verified, enabled
    return-object v0
.end method

.method private static modifyStatusFields(Ljava/lang/String;)Ljava/lang/String;
    .locals 4
    # 10-12 replacements for: status, state, result, message
    return-object v0
.end method

# Main dispatcher
.method public static processAll(Ljava/lang/String;)Ljava/lang/String;
    .locals 1
    invoke-static {p0}, Lcom/example/app/ResponseInterceptor;->modifyNumericFields(Ljava/lang/String;)Ljava/lang/String;
    move-result-object v0
    invoke-static {v0}, Lcom/example/app/ResponseInterceptor;->modifyBooleanFields(Ljava/lang/String;)Ljava/lang/String;
    move-result-object v0
    invoke-static {v0}, Lcom/example/app/ResponseInterceptor;->modifyStatusFields(Ljava/lang/String;)Ljava/lang/String;
    move-result-object v0
    return-object v0
.end method
```

**Choose method names based on modification category, not domain-specific terms:**
- **Numeric fields:** amount, balance, value, cost, price
- **Boolean fields:** success, purchased, unlocked, verified, enabled
- **String fields:** status, state, result, message

Adapt to your app's JSON structure after analyzing decompiled code.

**Rule:** Maximum ~15 `String.replace` operations per method. Declare `.locals` with at least 4 registers for replace operations (v0 accumulator + v1/v2 strings + v3 spare).

---

## 5. String.replace: Order Consistency

When making multiple chained replacements, order matters. A destination value can match the pattern of a subsequent replace if not planned correctly.

### Common Error

```smali
# BAD: "amount":50 → 1000, then "amount":1000 → 20000
# Second replace overwrites the first: result 50 → 20000 (double modification)
const-string v1, "\"amount\":50"
const-string v2, "\"amount\":1000"
invoke-virtual {v0, v1, v2}, Ljava/lang/String;->replace(Ljava/lang/CharSequence;Ljava/lang/CharSequence;)Ljava/lang/String;
move-result-object v0

const-string v1, "\"amount\":1000"    # OVERWRITES previous result
const-string v2, "\"amount\":20000"
invoke-virtual {v0, v1, v2}, Ljava/lang/String;->replace(Ljava/lang/CharSequence;Ljava/lang/CharSequence;)Ljava/lang/String;
move-result-object v0
```

### Solution

```smali
# GOOD: Destination values cannot be source of another replace in chain
# Sort from smallest ORIGINAL to largest, with destinations that don't overlap

# Example 1: "amount" field
const-string v1, "\"amount\":1"
const-string v2, "\"amount\":1000"      # 1 → 1000 (unique destination)

const-string v1, "\"amount\":50"
const-string v2, "\"amount\":50000"     # 50 → 50000 (cannot match 1000)

const-string v1, "\"amount\":100"
const-string v2, "\"amount\":100000"    # 100 → 100000 (cannot match 50000)

# Example 2: "balance" field (different context)
const-string v1, "\"balance\":100"
const-string v2, "\"balance\":10000"

const-string v1, "\"balance\":500"
const-string v2, "\"balance\":50000"
```

### Identifying Numeric Fields to Modify

1. **Extract strings from Hermes bundle:**
   ```bash
   strings assets/index.android.bundle | grep -E '"[a-z]+":[0-9]+' | head -30
   ```

2. **Look for numeric JSON patterns in decompiled code:**
   ```bash
   rg '".+":[0-9]+' decompiled.js --type js | head -30
   ```

3. **Common numeric fields by domain:**
   - **Games:** amount, balance, score, level, coins, gems
   - **Fintech:** amount, balance, transferAmount, limit
   - **E-commerce:** price, quantity, total, discount
   - **Health:** steps, calories, distance, duration

**Always sort original values from smallest to largest before replacing.**

---

## 6. Logging in Smali: Safe Approach

Always use `Log.d` with two parameters. The three-parameter version (`tag`, `msg`, `Throwable`) requires additional register handling and can cause issues.

```smali
# CORRECT: Log.d(String tag, String msg)
# Use log tags that match your interceptor's purpose:
# - ResponseInterceptor - Generic response modification
# - DataInterceptor - Generic data modification
# - PaymentInterceptor - Payment/transaction modification
# - AuditInterceptor - Security audit/logging

const-string v3, "ResponseInterceptor"
const-string v4, "Response intercepted"
invoke-static {v3, v4}, Landroid/util/Log;->d(Ljava/lang/String;Ljava/lang/String;)I

# INCORRECT: Don't concatenate strings inside log
# Don't use 3-parameter Log.d in interceptors
# Don't use complex logging in hot paths (every request passes through here)
```

**Keep tags descriptive but generic, not domain-specific.**

---

## 7. ForceSuccess Pattern (Generic Status Modification)

Converts negative status responses to positive so the app assumes an operation succeeded.

```smali
.method private static forceSuccess(Ljava/lang/String;)Ljava/lang/String;
    .locals 4

    move-object v0, p0

    # Generic: force success status
    const-string v1, "\"success\":false"
    const-string v2, "\"success\":true"
    invoke-virtual {v0, v1, v2}, Ljava/lang/String;->replace(Ljava/lang/CharSequence;Ljava/lang/CharSequence;)Ljava/lang/String;
    move-result-object v0

    # Generic: force authentication/completion status
    const-string v1, "\"completed\":false"
    const-string v2, "\"completed\":true"
    invoke-virtual {v0, v1, v2}, Ljava/lang/String;->replace(Ljava/lang/CharSequence;Ljava/lang/CharSequence;)Ljava/lang/String;
    move-result-object v0

    const-string v1, "\"verified\":false"
    const-string v2, "\"verified\":true"
    invoke-virtual {v0, v1, v2}, Ljava/lang/String;->replace(Ljava/lang/CharSequence;Ljava/lang/CharSequence;)Ljava/lang/String;
    move-result-object v0

    # Domain-specific examples (adapt to your app):
    # Games: purchased, isUnlocked
    # E-commerce: paid, delivered, confirmed
    # Auth: authenticated, authorized, loggedIn

    return-object v0
.end method
```

### Identifying Boolean Status Fields

1. **Search for boolean patterns in decompiled code:**
   ```bash
   rg '":(true|false)' decompiled.js --type js | head -50
   ```

2. **Common boolean fields by domain:**
   - **Purchases:** success, purchased, unlocked, paid
   - **Authentication:** authenticated, verified, loggedIn, authorized
   - **Workflows:** completed, approved, submitted, processed
   - **Features:** enabled, active, visible, available

3. **Search in strings:**
   ```bash
   strings assets/index.android.bundle | grep -iE ':true|:false' | head -50
   ```

**Focus on business-critical status fields that affect app flow.**

**Important Limitation:** This pattern operates only client-side. The server doesn't record the transaction, so on next sync or session restart the state may revert. For complete vulnerability assessment, verify if the app has server-side validation mechanisms.

---

## 8. Build Process

Order is strict. Signing before zipalign or skipping zipalign causes installation failure or unexpected runtime behavior.

```bash
# 1. Recompile with apktool
apktool b /path/decompiled-apk/ -o build.apk

# 2. Zipalign BEFORE signing (required for Play Store and ART)
zipalign -f 4 build.apk build_aligned.apk

# 3. Sign with apksigner (NOT jarsigner, deprecated for modern APKs)
apksigner sign \
  --ks debug.keystore \
  --ks-pass pass:android \
  --out final.apk \
  build_aligned.apk

# 4. Install on device/emulator
# First, find your device ID:
adb devices
# Output: List of devices (emulator-5554, R4Z2T1K7XYZ, 192.168.1.100:5555)

# Use device ID or omit for single device:
adb -s <DEVICE_ID> install -r final.apk
# OR (if single device)
adb install -r final.apk
```

**Note:** For emulator testing, a debug keystore is sufficient. For distribution or testing on physical devices with restrictions, use your own keystore.

---

## 9. SDK Paths on macOS (Homebrew)

```bash
ADB:        /opt/homebrew/share/android-commandlinetools/platform-tools/adb
Apktool:    /opt/homebrew/bin/apktool
Build tools: /opt/homebrew/share/android-commandlinetools/build-tools/34.0.0/
Zipalign:   /opt/homebrew/share/android-commandlinetools/build-tools/34.0.0/zipalign
Apksigner:  /opt/homebrew/share/android-commandlinetools/build-tools/34.0.0/apksigner
```

Verify available build-tools version with:
```bash
ls /opt/homebrew/share/android-commandlinetools/build-tools/
```

---

## 10. Emulator Testing Workflow

```bash
# Step 1: Find your device ID
adb devices
# Output: List of devices with IDs
# Example:
# List of devices attached
# emulator-5554   device
# 192.168.1.100:5555   device
# R4Z2T1K7XYZ   device

# Step 2: Use device-specific flags or omit for single device
# With specific device:
adb -s <DEVICE_ID> shell am force-stop com.example.app
# OR (if single device)
adb shell am force-stop com.example.app

# Step 3: Get package name
# From manifest (decompiled APK):
grep 'package=' AndroidManifest.xml

# From installed device:
adb shell pm list packages | grep your.app.name

# Testing workflow:
adb shell am force-stop com.example.app
adb shell am start -n com.example.app/.MainActivity
sleep 15
adb logcat -d -s AndroidRuntime:E | tail -30
adb logcat -d | grep "ResponseInterceptor"
adb logcat | grep -E "ResponseInterceptor|AndroidRuntime"
```

---

## 11. Initial Analysis Checklist

When receiving a React Native APK for analysis:

1. Decompile with apktool: `apktool d app.apk -o app-decompiled`
2. Extract strings from Hermes bundle: `strings assets/index.android.bundle > strings.txt`
3. Decompile with hermes-dec: `hermes-dec decompile assets/index.android.bundle -o decompiled/`
4. Identify endpoints and business logic in strings and decompiled output
5. Locate `OkHttpClientProvider.smali` for injection point
6. Count files in `com/<package>/` to scope own code
7. Review `smali/com/<package>/` to understand business flows
8. Design interceptor based on identified JSON fields

---

## 12. Common JSON Fields by Domain

### Generic (all apps):
| Field | Type | Description |
|-------|------|-------------|
| `id` / `userId` | string/number | Resource identifier |
| `success` / `status` | boolean/string | Operation result |
| `error` / `message` | string | Error/info message |
| `timestamp` / `createdAt` | number/iso-date | Time fields |
| `amount` / `value` / `balance` | number | Numeric quantity |

### Purchases/E-commerce:
| Field | Type | Description |
|-------|------|-------------|
| `price` / `cost` | number | Item price |
| `quantity` | number | Item quantity |
| `total` | number | Order total |
| `purchased` / `paid` | boolean | Payment status |
| `orderId` | string | Transaction ID |

### Games:
| Field | Type | Description |
|-------|------|-------------|
| `reward` / `coins` / `gems` | number | In-game currency |
| `level` / `score` | number | Progress tracking |
| `unlocked` | boolean | Feature unlock status |
| `gemPrice` / `coinPrice` | number | Currency conversion |

### Fintech:
| Field | Type | Description |
|-------|------|-------------|
| `balance` / `amount` | number | Account balance |
| `transactionId` | string | Transaction reference |
| `transferAmount` | number | Transfer value |
| `confirmed` / `verified` | boolean | Transaction status |

### Authentication:
| Field | Type | Description |
|-------|------|-------------|
| `authenticated` / `loggedIn` | boolean | Auth status |
| `verified` / `confirmed` | boolean | Email/phone verification |
| `sessionToken` | string | Session identifier |
| `expiresAt` | number | Token expiration |

---

## 13. Common React Native Libraries to Identify

**How to Identify React Native Libraries in Your App:**

1. **From smali structure:**
   ```bash
   ls -la smali/com/
   # Look for library package names
   ```

2. **From strings in Hermes bundle:**
   ```bash
   strings assets/index.android.bundle | grep -E 'react-native-|@react-native'
   ```

3. **Common libraries (beyond the table above):**
   - `com/google/firebase/` - Firebase services
   - `com/amazonaws/` - AWS SDK
   - `com/adjust/` - Adjust analytics
   - `com/branch/` - Branch.io deep links
   - `com/onesignal/` - OneSignal push notifications
   - `com/auth0/` - Auth0 authentication
   - `com/airbnb/` - Airbnb Lottie, maps
   - `com/wix/` - Wix navigation, HTTP client

4. **Check package.json (if source available):**
   ```bash
   cat package.json | grep -A 2 '"dependencies"'
   ```

**Identify libraries relevant to your modification target (e.g., IAP for payment flows).**

---

*Last Updated: 2026*
*Reference: React Native Hermes Bytecode Analysis, OkHttp Interception Patterns*