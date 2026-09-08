# Jetpack Compose Security Deep Dive

## Overview

Jetpack Compose introduces a declarative UI paradigm that fundamentally changes how Android applications render and manage UI state. From a security perspective, this shift introduces new attack surfaces and data exposure vectors that traditional View-based systems do not exhibit. This document provides a comprehensive security analysis of Compose-specific vulnerabilities, testing methodologies, and remediation strategies for penetration testers and security auditors.

**Critical Insight**: In Compose, state IS the UI. Any data held in composable state is potentially visible to:
- Recomposition observers
- Debug tools and profilers
- Memory dumps
- Screen capture tools
- Accidental side effects during rebuild cycles

## Compose Security Model

### Recomposition Fundamentals

```kotlin
@Composable
fun UserProfile(user: User) {
    // Recomposition occurs when 'user' changes
    // During recomposition, all code here executes again
    Text(user.email)  // Re-executes on every recomposition
}
```

**Security Implications**:
1. **Code Re-execution**: Side effects placed in composable bodies execute repeatedly
2. **State Visibility**: State variables are held in memory and can be inspected
3. **Snapshot System**: Compose creates snapshots of state that persist between compositions

### State Hoisting Security

```kotlin
// ❌ BAD: Sensitive state in composable (exposed to recomposition)
@Composable
fun LoginScreen() {
    var password by remember { mutableStateOf("") }
    // 'password' held in memory, accessible to debug tools
}

// ✅ GOOD: State hoisted to ViewModel with lifecycle management
class LoginViewModel : ViewModel() {
    private val _password = mutableStateOf("")
    val password: State<String> = _password

    fun clearSensitiveData() {
        _password.value = ""
    }
}
```

## State Management Security

### `remember` vs `rememberSaveable` for Sensitive Data

```kotlin
@Composable
fun SecureForm() {
    // ❌ CRITICAL: remember persists in memory across screen rotations
    // but NOT across process death - AND is visible to memory analysis
    var creditCard by remember { mutableStateOf("") }

    // ⚠️ MODERATE RISK: rememberSaveable survives process death
    // and stores in Bundle, potentially logged or backed up
    var ssn by rememberSaveable { mutableStateOf("") }

    // ✅ SECURE: No state for sensitive fields, handle in ViewModel
    // with on-screen encryption and immediate cleanup
}
```

### StateFlow and SharedFlow Exposure

```kotlin
// ❌ VULNERABLE: StateFlow exposing sensitive data to all collectors
class TransactionViewModel : ViewModel() {
    private val _transactions = MutableStateFlow<List<Transaction>>(emptyList())
    val transactions: StateFlow<List<Transaction>> = _transactions  // Exposed

    // Any collector can access transaction history
}

// ✅ SECURE: Limited exposure with transformation
class TransactionViewModel : ViewModel() {
    private val _transactions = MutableStateFlow<List<Transaction>>(emptyList())

    // Only expose masked transaction info
    val transactionSummary: StateFlow<List<TransactionSummary>> = _transactions
        .map { it.map { tx -> tx.toSummary() } }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())
}
```

### Derived State Security

```kotlin
@Composable
fun Dashboard(viewModel: DashboardViewModel) {
    val accounts by viewModel.accounts.collectAsState()

    // ❌ SECURITY ISSUE: Derived state holds sensitive calculations
    // This computed value persists in memory and may be inspected
    val totalBalance by remember(accounts) {
        derivedStateOf {
            accounts.sumOf { it.balance }
        }
    }

    // ✅ SECURE: Compute on display only, don't cache sensitive data
    val totalBalance = accounts.sumOf { it.balance }
}
```

## Side Effects Security

### LaunchedEffect Side Channel Attacks

```kotlin
@Composable
fun PaymentFlow(paymentId: String) {
    var status by remember { mutableStateOf("processing") }

    // ❌ VULNERABLE: LaunchedEffect executes on EVERY recomposition
    // May cause duplicate network calls, data exfiltration attempts
    LaunchedEffect(paymentId) {
        // This runs whenever paymentId changes (or parent recomposes)
        val result = api.getPaymentDetails(paymentId)
        // Accidentally leaks sensitive data to logs or analytics
        Analytics.track("payment_view", mapOf("id" to paymentId))
        status = result.status
    }
}
```

**Frida Hook Pattern for LaunchedEffect**:
```javascript
// Hook LaunchedEffect to detect sensitive data exposure
Java.perform(function() {
    const LaunchedEffectClass = Java.use("androidx.compose.runtime.LaunchedEffect");

    LaunchedEffectClass.implementation.$init = function(key1, key2, block) {
        console.log("[+] LaunchedEffect created with keys:");
        console.log("  Key 1:", key1 ? key1.toString() : "null");

        // Hook the block execution to capture sensitive data
        const originalBlock = block;
        block = Java.registerClass({
            name: "ComposeBlockInterceptor",
            implements: [Java.use("kotlin.jvm.functions.Function2")],
            methods: {
                invoke: function(scope, coroutineContext) {
                    const result = originalBlock.invoke(scope, coroutineContext);
                    // Monitor for sensitive data in execution
                    return result;
                }
            }
        });

        return this.$init(key1, key2, block);
    };
});
```

### DisposableEffect Resource Leaks

```kotlin
@Composable
fun BiometricAuth(viewModel: AuthViewModel) {
    var authenticated by remember { mutableStateOf(false) }

    DisposableEffect(Unit) {
        val biometricCallback = object : BiometricPrompt.AuthenticationCallback() {
            override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) {
                // ❌ SECURITY ISSUE: CryptoObject may be held in memory
                // and not properly cleared
                authenticated = true
            }
        }

        val prompt = BiometricPrompt(
            LocalContext.current,
            ContextCompat.getMainExecutor(LocalContext.current),
            biometricCallback
        )

        // If composable is disposed before auth completes, callback leaked
        prompt.authenticate(promptInfo)

        onDispose {
            // ⚠️ Missing cleanup: biometricCallback and CryptoObject remain in memory
        }
    }
}
```

### SideEffect for Security Logging

```kotlin
@Composable
fun ScreenSecurityWrapper(content: @Composable () -> Unit) {
    var screenVisible by remember { mutableStateOf(false) }

    SideEffect {
        // ✅ GOOD: SideEffect runs after EVERY successful composition
        // Use this to log screen visibility for security auditing
        if (screenVisible) {
            SecurityLogger.logScreenShown(
                screen = "PaymentScreen",
                timestamp = System.currentTimeMillis()
            )
        }
    }

    DisposableEffect(Unit) {
        screenVisible = true
        onDispose {
            screenVisible = false
            SecurityLogger.logScreenHidden()
        }
    }

    content()
}
```

## Memory Leak Patterns and Detection

### Compose Memory Leak Vectors

```kotlin
// ❌ PATTERN 1: Long-lived composables holding references
@Composable
fun InfiniteList(data: List<Item>) {
    // This composable may never be disposed, holding all items
    LazyColumn {
        items(data) { item ->
            // If Item holds large objects, they leak
            ItemRow(item)
        }
    }
}

// ❌ PATTERN 2: State holding object references
@Composable
fun CacheScreen() {
    var cache by remember { mutableStateOf<MutableMap<String, Any>>(mutableMapOf()) }

    // cache grows indefinitely, never cleared
    cache["timestamp_${System.currentTimeMillis()}"] = sensitiveData
}

// ❌ PATTERN 3: Listener not removed
@Composable
fun RealtimeUpdates(viewModel: UpdatesViewModel) {
    DisposableEffect(viewModel) {
        val listener = object : UpdateListener {
            override fun onUpdate(data: Update) {
                // If this Update holds sensitive data, it leaks
            }
        }
        viewModel.addListener(listener)  // Added but never removed

        onDispose {
            // Missing: viewModel.removeListener(listener)
        }
    }
}
```

### Memory Leak Detection with Frida

```javascript
// Compose memory leak detection script
Java.perform(function() {
    const MutableStateClass = Java.use("androidx.compose.runtime.MutableState");
    const HashMapClass = Java.use("java.util.HashMap");

    let stateLeakCount = 0;

    // Track MutableState instances
    MutableStateClass.implementation.$init = function(value) {
        const instance = this.$init(value);
        const valueType = value != null ? value.getClass().getName() : "null";

        // Flag potentially sensitive state
        if (valueType.includes("String") && value.length() > 10) {
            console.log(`[!] Potential sensitive state created: ${valueType}`);
            console.log(`    Value: ${value}`);
        }

        return instance;
    };

    // Monitor HashMap growth in composables
    HashMapClass.implementation.put = function(key, value) {
        const sizeBefore = this.size();
        const result = this.put(key, value);
        const sizeAfter = this.size();

        if (sizeAfter > 100) {
            console.log(`[!] Large HashMap in memory: ${sizeAfter} entries`);
            // Check if key/value contain sensitive patterns
            const keyStr = key.toString();
            if (keyStr.match(/password|token|secret|key/i)) {
                console.log(`[!] Sensitive key in large map: ${keyStr}`);
            }
        }

        return result;
    };
});
```

## Screen Security

### Preventing Screenshots and Screen Recording

```kotlin
@Composable
fun SecureScreen() {
    val context = LocalContext.current

    // ✅ SECURE: Apply window flags to prevent screenshots
    DisposableEffect(Unit) {
        val window = (context as Activity).window
        val flags = WindowManager.LayoutParams.FLAG_SECURE

        window.addFlags(flags)

        onDispose {
            window.clearFlags(flags)
        }
    }

    SensitiveContent()
}
```

### Privacy Modifier for Sensitive Content

```kotlin
// Compose doesn't have built-in privacy modifier like XML
// You must implement custom protection

@Composable
fun PrivacySensitiveContent(
    modifier: Modifier = Modifier,
    content: @Composable () -> Unit
) {
    val context = LocalContext.current

    Box(
        modifier = modifier
            .onGloballyPositioned { coordinates ->
                // Option 1: Blur sensitive areas when app is backgrounded
                val isInBackground = !LocalLifecycleOwner.current.lifecycle.currentState
                    .isAtLeast(Lifecycle.State.RESUMED)

                if (isInBackground) {
                    // Apply blur or hide
                }
            }
    ) {
        content()
    }
}

// Alternative: Use FLAG_SECURE selectively per screen
@Composable
fun ConditionalSecureScreen(isSensitive: Boolean, content: @Composable () -> Unit) {
    val context = LocalContext.current

    DisposableEffect(isSensitive) {
        val window = (context as Activity).window

        if (isSensitive) {
            window.addFlags(WindowManager.LayoutParams.FLAG_SECURE)
        }

        onDispose {
            window.clearFlags(WindowManager.LayoutParams.FLAG_SECURE)
        }
    }

    content()
}
```

### Android 13+ Privacy Indicators

```kotlin
@Composable
fun CameraRecordingScreen() {
    val context = LocalContext.current

    // Android 13+ shows privacy indicator automatically
    // But you should manage explicit recording states

    var isRecording by remember { mutableStateOf(false) }

    DisposableEffect(isRecording) {
        if (isRecording) {
            // Ensure privacy indicator is shown via system
            context.startForegroundService(recordingServiceIntent)
        }

        onDispose {
            if (isRecording) {
                context.stopService(recordingServiceIntent)
            }
        }
    }
}
```

## Static Analysis Checklist for Compose Apps

### File Pattern Matching

```
**/*Compose*.kt
**/*Screen.kt
**/*View.kt
**/ui/**/*.kt
**/presentation/**/*.kt
```

### Automated Checks

#### 1. Sensitive State Detection

```kotlin
// PATTERN: Check for mutableStateOf with sensitive variable names
var (password|token|secret|key|credit|ssn|pin) by remember {
    mutableStateOf("")
}

// PATTERN: Check for rememberSaveable with sensitive data
rememberSaveable { mutableStateOf(creditCardNumber) }

// PATTERN: Check for StateFlow exposing sensitive types
val (passwords|tokens|secrets): StateFlow<*>
```

#### 2. Side Effect Misuse

```kotlin
// PATTERN: I/O operations in composable body (not in LaunchedEffect)
@Composable
fun BadPattern() {
    val data = api.fetchData()  // ❌ Network call in composition
}

// PATTERN: Database access without LaunchedEffect
@Composable
fun DatabasePattern() {
    val users = database.userDao().getAll()  // ❌ Database in composition
}

// PATTERN: Logging in composition
@Composable
fun LoggingPattern() {
    Log.d("TAG", "User logged in: $userId")  // ❌ Log in composition
}
```

#### 3. Memory Leak Indicators

```kotlin
// PATTERN: DisposableEffect without onDispose
DisposableEffect(Unit) {
    // Setup code...
    // ❌ Missing onDispose
}

// PATTERN: Listeners added but not removed
disposableEffect(viewModel) {
    val listener = MyListener()
    viewModel.addListener(listener)  // Added
    // ❌ Listener not removed in onDispose
    onDispose { }
}
```

### Ghidra/Decompilation Analysis

When analyzing APK decompiled code:

1. **Locate Composable Functions**:
   ```
   Search for: @Composable annotation
   Target: Methods with Function2 parameters (composable functions)
   ```

2. **Extract State Variables**:
   ```
   Pattern: remember calls with MutableState
   Look for: StateFlow, LiveData in composables
   ```

3. **Side Effect Identification**:
   ```
   Pattern: LaunchedEffect, DisposableEffect invocations
   Check: Callbacks registered without cleanup
   ```

## Dynamic Testing with Frida

### State Extraction Hook

```javascript
// Extract all state from composables
Java.perform(function() {
    const SnapshotClass = Java.use("androidx.compose.runtime.snapshots.Snapshot");
    const MutableStateClass = Java.use("androidx.compose.runtime.MutableState");

    // Hook into the snapshot system
    SnapshotClass.takeNestedSnapshot.implementation = function(readObserver) {
        const snapshot = this.takeNestedSnapshot(readObserver);

        console.log("[+] Compose snapshot taken");
        console.log("[+] Current state tree:");

        // Iterate through all registered states
        const states = snapshot.getCurrentState();
        const iterator = states.iterator();

        while (iterator.hasNext()) {
            const entry = iterator.next();
            const key = entry.getKey();
            const value = entry.getValue();

            console.log(`  ${key} = ${value}`);

            // Check for sensitive patterns
            const valueStr = String(value);
            if (valueStr.match(/password|token|secret|key/i)) {
                console.log(`[!] Sensitive state found: ${key}`);
                console.log(`    Value: ${value}`);
            }
        }

        return snapshot;
    };
});
```

### Recomposition Tracer

```javascript
// Trace recomposition events to detect data exposure
Java.perform(function() {
    const ComposableSingletonsClass = Java.use(
        "androidx.compose.runtime.ComposableSingletons$MyComposableFunction"
    );

    // Hook into recomposition
    const RecomposerClass = Java.use("androidx.compose.runtime.Recomposer");

    RecomposerClass.composing.implementation = function(block) {
        console.log("[+] Recomposition started");
        const result = this.composing(block);
        console.log("[+] Recomposition completed");
        return result;
    };

    // Capture state changes during recomposition
    const SnapshotStateKtClass = Java.use("androidx.compose.runtime.SnapshotStateKt");

    SnapshotStateKtClass.mutableStateOf.implementation = function(value, policy) {
        const state = this.mutableStateOf(value, policy);
        const valueStr = String(value);

        console.log(`[!] State created: ${valueStr.substring(0, 50)}...`);

        // Flag sensitive values
        if (valueStr.match(/password|token|secret|key|credit/i)) {
            console.log(`[!!!] CRITICAL: Sensitive state in mutableStateOf`);
            console.log(`     Value: ${value}`);
            send(JSON.stringify({
                type: "SENSITIVE_STATE",
                value: valueStr,
                stack: Java.use("android.util.Log").getStackTraceString(
                    Java.use("java.lang.Exception").$new()
                )
            }));
        }

        return state;
    };
});
```

### Side Effect Monitor

```javascript
// Monitor LaunchedEffect and DisposableEffect execution
Java.perform(function() {
    const LaunchedEffectClass = Java.use("androidx.compose.runtime.LaunchedEffect");
    const DisposableEffectClass = Java.use("androidx.compose.runtime.DisposableEffect");

    // Hook LaunchedEffect
    LaunchedEffectClass.$init.overload(
        'java.lang.Object',
        'java.lang.Object',
        'kotlin.jvm.functions.Function2'
    ).implementation = function(key1, key2, block) {
        console.log("[+] LaunchedEffect initialized");
        console.log(`    Key: ${key1 ? key1.toString() : "null"}`);

        const result = this.$init(key1, key2, block);
        return result;
    };

    // Hook DisposableEffect lifecycle
    DisposableEffectClass.rememberObserver.implementation = function(key1, key2, effect) {
        console.log("[+] DisposableEffect created");

        const observer = this.rememberObserver(key1, key2, effect);

        // Monitor onDispose
        const originalEffect = effect;
        effect = Java.registerClass({
            name: "DisposableEffectHook",
            implements: [Java.use("androidx.compose.runtime.DisposableEffectScope")],
            methods: {
                onDispose: function() {
                    console.log("[+] DisposableEffect onDispose called");
                    originalEffect.onDispose();
                }
            }
        });

        return observer;
    };
});
```

## Common Vulnerability Patterns with Code Examples

### VULN-001: Sensitive Data in remember()

**Severity**: HIGH
**Confidence**: HIGH

**Vulnerability**:
```kotlin
@Composable
fun CreditCardForm() {
    // ❌ VULNERABLE: Credit card number held in remember
    var cardNumber by remember { mutableStateOf("") }
    var cvv by remember { mutableStateOf("") }
    var expiry by remember { mutableStateOf("") }

    OutlinedTextField(
        value = cardNumber,
        onValueChange = { cardNumber = it },
        label = { Text("Card Number") }
    )

    OutlinedTextField(
        value = cvv,
        onValueChange = { cvv = it },
        label = { Text("CVV") }
    )
}
```

**Impact**: Card number, CVV, and expiry date remain in memory and can be extracted via:
- Memory dumps
- Recomposition tracing
- Frida hooking of MutableState

**Exploitation** (Frida):
```javascript
// Extract credit card state
Java.perform(function() {
    const MutableStateClass = Java.use("androidx.compose.runtime.MutableState");

    MutableStateClass.getValue.implementation = function() {
        const value = this.getValue();
        const valueStr = String(value);

        if (valueStr.match(/^\d{16}$/)) { // Credit card pattern
            console.log(`[!!!] Credit card number found: ${value}`);
            send({type: "CREDIT_CARD", number: valueStr});
        }

        return value;
    };
});
```

**Remediation**:
```kotlin
// ✅ SECURE: Use ViewModel with immediate cleanup
class CreditCardViewModel : ViewModel() {
    private val _cardNumber = mutableStateOf("")
    private val _cvv = mutableStateOf("")

    override fun onCleared() {
        // Clear sensitive data when ViewModel is destroyed
        _cardNumber.value = "0".repeat(_cardNumber.value.length)
        _cvv.value = "0".repeat(_cvv.value.length)
    }
}

@Composable
fun CreditCardForm(viewModel: CreditCardViewModel = viewModel()) {
    val cardNumber by viewModel.cardNumber
    val cvv by viewModel.cvv

    OutlinedTextField(
        value = cardNumber,
        onValueChange = { viewModel.updateCardNumber(it) },
        visualTransformation = CreditCardMask(), // Mask input
        label = { Text("Card Number") }
    )
}
```

---

### VULN-002: Side Effects Causing Data Exfiltration

**Severity**: MEDIUM
**Confidence**: MEDIUM

**Vulnerability**:
```kotlin
@Composable
fun UserProfileScreen(userId: String) {
    var user by remember { mutableStateOf<User?>(null) }

    // ❌ VULNERABLE: LaunchedEffect executes on every recomposition
    // May send sensitive data to analytics multiple times
    LaunchedEffect(userId) {
        user = api.getUser(userId)

        // Accidental data leak to analytics
        Analytics.trackEvent("user_viewed", mapOf(
            "user_id" to userId,
            "email" to user!!.email  // Sensitive PII
        ))
    }
}
```

**Impact**: PII exfiltration to third-party analytics services, privacy violations

**Remediation**:
```kotlin
// ✅ SECURE: Guard side effects with conditions
@Composable
fun UserProfileScreen(userId: String) {
    var user by remember { mutableStateOf<User?>(null) }
    var tracked by remember { mutableStateOf(false) }

    LaunchedEffect(userId) {
        if (user == null) {
            user = api.getUser(userId)
        }

        // Only track once per session
        if (!tracked && user != null) {
            Analytics.trackEvent("user_viewed", mapOf(
                "user_id" to userId,
                // ❌ Don't include email in analytics
                "user_type" to user!!.type
            ))
            tracked = true
        }
    }
}
```

---

### VULN-003: Missing FLAG_SECURE on Sensitive Screens

**Severity**: MEDIUM
**Confidence**: HIGH

**Vulnerability**:
```kotlin
@Composable
fun BankingStatementScreen(statementId: String) {
    // ❌ VULNERABLE: No screen protection
    // Users can take screenshots of sensitive financial data
    val statement by viewModel.getStatement(statementId).collectAsState()

    LazyColumn {
        items(statement.transactions) { transaction ->
            TransactionRow(transaction)
        }
    }
}
```

**Impact**: Screen captures can be taken, exposing:
- Transaction history
- Account balances
- Personal financial data

**Remediation**:
```kotlin
// ✅ SECURE: Apply FLAG_SECURE
@Composable
fun BankingStatementScreen(statementId: String) {
    val context = LocalContext.current

    DisposableEffect(Unit) {
        val window = (context as Activity).window
        window.addFlags(WindowManager.LayoutParams.FLAG_SECURE)

        onDispose {
            window.clearFlags(WindowManager.LayoutParams.FLAG_SECURE)
        }
    }

    val statement by viewModel.getStatement(statementId).collectAsState()

    LazyColumn {
        items(statement.transactions) { transaction ->
            TransactionRow(transaction)
        }
    }
}
```

---

### VULN-004: Memory Leak in DisposableEffect

**Severity**: MEDIUM
**Confidence**: MEDIUM

**Vulnerability**:
```kotlin
@Composable
fun BiometricAuthScreen() {
    val context = LocalContext.current
    var authResult by remember { mutableStateOf<Result?>(null) }

    DisposableEffect(Unit) {
        val prompt = BiometricPrompt(
            context,
            ContextCompat.getMainExecutor(context),
            object : BiometricPrompt.AuthenticationCallback() {
                override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) {
                    // ❌ VULNERABLE: CryptoObject may be held in memory
                    authResult = result.cryptoObject
                }
            }
        )

        prompt.authenticate(promptInfo)

        // ❌ CRITICAL: Missing onDispose - callback never released
        // CryptoObject with credentials remains in memory
    }
}
```

**Impact**: CryptoObjects and authentication credentials persist in memory after screen disposal

**Remediation**:
```kotlin
// ✅ SECURE: Proper cleanup in onDispose
@Composable
fun BiometricAuthScreen() {
    val context = LocalContext.current
    var authResult by remember { mutableStateOf<Result?>(null) }
    var authCallback by remember { mutableStateOf<BiometricPrompt.AuthenticationCallback?>(null) }

    DisposableEffect(Unit) {
        authCallback = object : BiometricPrompt.AuthenticationCallback() {
            override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) {
                authResult = result.cryptoObject

                // Immediately clear sensitive data after use
                viewModel.clearCryptoObject(result)
            }

            override fun onAuthenticationError(errorCode: Int, errString: CharSequence) {
                // Clear any pending sensitive data
                authResult = null
            }
        }

        val prompt = BiometricPrompt(
            context,
            ContextCompat.getMainExecutor(context),
            authCallback
        )

        prompt.authenticate(promptInfo)

        onDispose {
            // ✅ SECURE: Clear callback and any held references
            authCallback = null
            authResult = null
            viewModel.clearAllSensitiveData()
        }
    }
}
```

---

### VULN-005: State Exposure in Derived State

**Severity**: LOW
**Confidence**: LOW

**Vulnerability**:
```kotlin
@Composable
fun PortfolioScreen(viewModel: PortfolioViewModel) {
    val holdings by viewModel.holdings.collectAsState()

    // ❌ VULNERABLE: Derived state holds sensitive calculations
    val totalValue by remember(holdings) {
        derivedStateOf {
            holdings.sumOf { it.quantity * it.pricePerShare }
        }
    }

    Text("Portfolio Value: $${totalValue.format(2)}")
}
```

**Impact**: Derived calculations accessible via memory analysis, potentially revealing investment details

**Remediation**:
```kotlin
// ✅ SECURE: Compute on display, don't cache sensitive calculations
@Composable
fun PortfolioScreen(viewModel: PortfolioViewModel) {
    val holdings by viewModel.holdings.collectAsState()

    // Compute on every composition (fast enough for display)
    val totalValue = holdings.sumOf { it.quantity * it.pricePerShare }

    // Or use ViewModel for caching with security controls
    val totalValue by viewModel.totalValue.collectAsState()

    Text("Portfolio Value: $${totalValue.format(2)}")
}
```

## Remediation Guidance

### General Best Practices

1. **Never store sensitive data in `remember`** - Use ViewModel with lifecycle management
2. **Avoid `rememberSaveable` for credentials** - It persists to Bundle and can be logged
3. **Always include `onDispose` in `DisposableEffect`** - Prevent resource leaks
4. **Apply `FLAG_SECURE` to sensitive screens** - Prevent screenshots and recording
5. **Guard side effects with conditions** - Prevent accidental data exfiltration
6. **Use `LaunchedEffect` for async operations** - Never do I/O in composable body
7. **Clear sensitive data in `ViewModel.onCleared()`** - Zero-out strings, close objects

### Secure State Management Pattern

```kotlin
// Template for secure state handling
abstract class SecureViewModel : ViewModel() {
    protected abstract val sensitiveStates: List<MutableState<String>>

    override fun onCleared() {
        super.onCleared()
        clearAllSensitiveData()
    }

    fun clearAllSensitiveData() {
        sensitiveStates.forEach { state ->
            state.value = "0".repeat(state.value.length)
        }
    }

    fun clearSensitiveData(vararg states: MutableState<String>) {
        states.forEach { state ->
            state.value = "0".repeat(state.value.length)
        }
    }
}
```

### Secure Screen Pattern

```kotlin
@Composable
fun SecureScreenTemplate(
    isSensitive: Boolean = true,
    content: @Composable () -> Unit
) {
    val context = LocalContext.current
    val lifecycleOwner = LocalLifecycleOwner.current

    DisposableEffect(isSensitive) {
        if (isSensitive) {
            val window = (context as Activity).window
            window.addFlags(WindowManager.LayoutParams.FLAG_SECURE)
        }

        onDispose {
            if (isSensitive) {
                val window = (context as Activity).window
                window.clearFlags(WindowManager.LayoutParams.FLAG_SECURE)
            }
        }
    }

    // Additional privacy controls
    Box(
        modifier = Modifier.onSizeChanged { size ->
            // Obfuscate when app is backgrounded
            if (lifecycleOwner.lifecycle.currentState < Lifecycle.State.RESUMED) {
                // Apply blur or overlay
            }
        }
    ) {
        content()
    }
}
```

## References

### Official Documentation
- [Compose State Management](https://developer.android.com/develop/ui/compose/state)
- [State and Jetpack Compose](https://developer.android.com/develop/ui/compose/state-callbacks)
- [Compose Performance Debugging](https://developer.android.com/develop/ui/compose/performance/stability/diagnose)
- [Android Security Tips](https://developer.android.com/privacy-and-security/security-tips)

### Security Research
- [OWASP Mobile Security Testing Guide](https://owasp.org/www-project-mobile-security-testing-guide/)
- [Android Application Security](https://github.com/nowsecure/secure-mobile-development)

### Tools
- [Frida](https://frida.re/) - Dynamic instrumentation framework
- [Decompiler](https://github.com/skylot/jadx) - APK decompilation tool
- [Ghidra](https://ghidra-sre.org/) - Reverse engineering framework

---

**Document Version**: 1.0
**Last Updated**: 2026-04-01
**Maintainer**: DragonJAR Security Team
**Classification**: Internal Reference - Do Not Distribute
