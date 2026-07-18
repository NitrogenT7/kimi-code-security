# Kotlin Jetpack Compose Security

**Purpose:** Comprehensive reference for Jetpack Compose security in Android apps. Covers state management risks, UI security patterns, and testing techniques for Compose-based applications.

**Parent:** See [kotlin-patterns.md](kotlin-patterns.md) for overview of Kotlin security patterns.

---

## Overview

Jetpack Compose is Android's modern UI toolkit. Its declarative nature introduces unique security considerations for state management, data persistence, and UI interactions.

### Key Compose Security Concerns

| Compose Feature | Security Risk |
|-----------------|---------------|
| `rememberSaveable` | Persists across process death, may expose sensitive data |
| `remember` | In-memory state, lost on rotation but accessible via recomposition |
| `mutableStateOf` | Mutable state can be modified unexpectedly |
| `LaunchedEffect` | Side effects may execute multiple times or at wrong lifecycle |
| `Navigation` | Arguments can be logged or exposed in URLs |
| `ViewModel` state | May be exposed via `viewModel()` calls |
| `SideEffect` | May execute outside lifecycle boundaries |

---

## State Management Risks

### Risk Table

| Compose Pattern | Security Risk | Grep Command |
|----------------|---------------|--------------|
| `rememberSaveable` | Persists across process death, may expose data | `grep -rnE "rememberSaveable\s*\(" "$APP/"` |
| `remember` | In-memory state, lost on rotation | `grep -rnE "remember\s*\(" "$APP/"` |
| `mutableStateOf` | Mutable state can be modified unexpectedly | `grep -rnE "mutableStateOf\s*\(" "$APP/"` |
| `LaunchedEffect` | Side effects on composition, may run multiple times | `grep -rnE "LaunchedEffect\s*\(" "$APP/"` |

### Grep Patterns for State Security

```bash
# Find rememberSaveable with sensitive data
grep -rnE "rememberSaveable\s*\([^)]*(password|token|secret|key|credential)" "$APP/"

# Find LaunchedEffect side effects (may execute multiple times)
grep -rnE "LaunchedEffect\s*\([^)]*\)\s*\{\s*[^}]*(network|api|auth|fetch)" "$APP/"

# Find Navigation arguments (may leak in logs)
grep -rnE "navController\.navigate\s*\(|NavHost\s*\(" "$APP/"

# Find ViewModel state exposure
grep -rnE "viewModel\s*\(\)\.state|by\s+viewModel\s*\(\)\." "$APP/"

# Find savedStateHandle usage (persists across process death)
grep -rnE "savedStateHandle\.(get|set|contains)" "$APP/"
```

### Decompilation Example - rememberSaveable with Secret

**Kotlin Source:**
```kotlin
// ❌ Vulnerable: Sensitive data in rememberSaveable
@Composable
fun LoginScreen(viewModel: LoginViewModel) {
    var password by rememberSaveable { mutableStateOf("") }  // Persisted

    Button(onClick = {
        viewModel.login(password)  // Password survives process death
    }) {
        Text("Login")
    }
}
```

**Decompiled:**
```java
@Composable
public final void LoginScreen(LoginViewModel viewModel, Composer composer, int $changed) {
    // rememberSaveable persists across process death
    MutableState password = (MutableState)composer.rememberedValue(
        rememberSaveable(
            new MutableState(""),
            composer,
            $changed & 14
        )
    );
    Button(
        /* onClick calls viewModel.login(password) */,
        composer,
        $changed & 112
    );
}
```

**Security Implication:** `rememberSaveable` saves state to `SavedStateRegistry`, which can be serialized and persisted. Sensitive data may be written to disk.

---

## Navigation Security

### Threat: Navigation Arguments Exposure

Navigation arguments in Compose are passed as key-value pairs and can be logged or exposed.

**Grep Patterns:**
```bash
# Find navigation routes with parameters (may expose data in logs)
grep -rnE "navController\.navigate\s*\([\"'][^\"']*\{[^}]*\}" "$APP/"

# Find NavHost route definitions
grep -rnE "NavHost\s*\([^)]*startDestination\s*=" "$APP/"

# Find composable destinations with parameters
grep -rnE "@Composable\s+fun\s+\w+Screen\s*\([^)]*NavBackStackEntry" "$APP/"
```

**Vulnerable Pattern:**
```kotlin
// ❌ Vulnerable: Sensitive data in navigation arguments
@Composable
fun UserProfileScreen(
    navController: NavController,
    userId: String? = null  // May contain sensitive ID
) {
    Column {
        Text("User: $userId")

        Button(onClick = {
            // Navigate with sensitive data
            navController.navigate("profile/$userId?token=$authToken")
        }) {
            Text("Edit Profile")
        }
    }
}
```

**Secure Pattern:**
```kotlin
// ✅ Secure: Use encrypted/encoded parameters
@Composable
fun UserProfileScreen(
    navController: NavController,
    encryptedUserId: String? = null
) {
    Column {
        // Decrypt userId internally
        val userId = decryptUserId(encryptedUserId)

        Text("User: ${userId.take(3)}***")

        Button(onClick = {
            // Don't pass sensitive tokens in navigation
            navController.navigate("profile/${encryptedUserId}")
        }) {
            Text("Edit Profile")
        }
    }
}
```

---

## LaunchedEffect Security

### Threat: Multiple Side Effect Executions

`LaunchedEffect` runs on composition, recomposition, and can execute side effects multiple times, potentially exposing sensitive data or causing unwanted operations.

**Vulnerable Pattern:**
```kotlin
// ❌ Vulnerable: Side effect runs on every recomposition
@Composable
fun DataFetcherScreen(viewModel: DataViewModel) {
    LaunchedEffect(Unit) {
        // May run multiple times
        val data = viewModel.fetchSensitiveData()
        // Process sensitive data repeatedly
    }
}
```

**Secure Pattern:**
```kotlin
// ✅ Secure: Use stable key for LaunchedEffect
@Composable
fun DataFetcherScreen(viewModel: DataViewModel) {
    val shouldFetch by remember { mutableStateOf(false) }

    LaunchedEffect(shouldFetch) {
        // Only runs when shouldFetch changes
        if (shouldFetch) {
            val data = viewModel.fetchSensitiveData()
            // Process data once
        }
    }
}
```

### Grep Patterns for LaunchedEffect

```bash
# Find LaunchedEffect with sensitive operations
grep -rnE "LaunchedEffect\s*\([^)]*\)\s*\{\s*.*(network|api|auth|fetch|upload|download)" "$APP/"

# Find LaunchedEffect without stable keys
grep -rnE "LaunchedEffect\s*\(Unit\)\s*\{" "$APP/"

# Find LaunchedEffect with sensitive data in key
grep -rnE "LaunchedEffect\s*\([^)]*(password|token|secret|key)" "$APP/"
```

---

## ViewModel State Security

### Threat: State Exposure via viewModel()

ViewModel state can be accessed via `viewModel()` calls and may be exposed if not properly protected.

**Vulnerable Pattern:**
```kotlin
// ❌ Vulnerable: Sensitive state in ViewModel
@Composable
fun SecureScreen(
    viewModel: SecureViewModel = viewModel()
) {
    val state by viewModel.state.collectAsState()

    Column {
        Text("Token: ${state.authToken}")  // Exposed in UI
        Text("User: ${state.userData}")
    }
}
```

**Secure Pattern:**
```kotlin
// ✅ Secure: Mask sensitive state
@Composable
fun SecureScreen(
    viewModel: SecureViewModel = viewModel()
) {
    val state by viewModel.state.collectAsState()

    Column {
        Text("Token: ${state.authToken?.take(10)}***")  // Masked
        Text("User: ${state.userData?.username}")
    }
}
```

### Grep Patterns for ViewModel State

```bash
# Find ViewModel state exposure
grep -rnE "viewModel\s*\(\)\.state|by\s+viewModel\s*\(\)\." "$APP/"

# Find savedStateHandle with sensitive data
grep -rnE "savedStateHandle\.(get|set|contains)" "$APP/" | grep -E "(password|token|secret|key)"

# Find collectAsState usage
grep -rnE "collectAsState\s*\(\)" "$APP/"
```

---

## SideEffect Security

### Threat: Side Effects Outside Lifecycle

`SideEffect` runs after composition and may execute outside the proper lifecycle, potentially exposing sensitive data.

**Vulnerable Pattern:**
```kotlin
// ❌ Vulnerable: SideEffect logs sensitive data
@Composable
fun LoginScreen(viewModel: LoginViewModel) {
    var password by remember { mutableStateOf("") }

    SideEffect {
        // Logs on every recomposition
        Log.d(TAG, "Password: $password")
    }
}
```

**Secure Pattern:**
```kotlin
// ✅ Secure: Don't log sensitive data
@Composable
fun LoginScreen(viewModel: LoginViewModel) {
    var password by remember { mutableStateOf("") }

    SideEffect {
        // Log non-sensitive info
        Log.d(TAG, "Login screen active")
    }
}
```

### Grep Patterns for SideEffect

```bash
# Find SideEffect with sensitive data
grep -rnE "SideEffect\s*\{\s*.*Log\.(d|i|v|e).*\(.*(password|token|secret|key|credential)" "$APP/"

# Find SideEffect with sensitive operations
grep -rnE "SideEffect\s*\{\s*.*(api|network|auth|upload|download)" "$APP/"
```

---

## Testing Techniques

### Static Analysis with Grep

```bash
# Find rememberSaveable with sensitive data
grep -rnE "rememberSaveable\s*\([^)]*(password|token|secret|key|credential)" "$APP/"

# Find LaunchedEffect side effects
grep -rnE "LaunchedEffect\s*\([^)]*\)\s*\{\s*.*(network|api|auth|fetch)" "$APP/"

# Find Navigation with sensitive arguments
grep -rnE "navController\.navigate\s*\([^)]*(password|token|secret|key)" "$APP/"

# Find ViewModel state exposure
grep -rnE "viewModel\s*\(\)\.state|by\s+viewModel\s*\(\)\." "$APP/"
```

### Dynamic Analysis with Frida

**Hook Compose state:**
```javascript
// hook_compose_state.js
Java.perform(function() {
    var MutableState = Java.use("androidx.compose.runtime.MutableState");

    MutableState.setValue.implementation = function(value) {
        console.log("[+] MutableState.setValue called:");
        console.log("    Value: " + value);
        return this.setValue(value);
    };
});
```

**Launch:**
```bash
frida -U -f com.example.app -l hook_compose_state.js
```

**Hook navigation:**
```javascript
// hook_navigation.js
Java.perform(function() {
    var NavController = Java.use("androidx.navigation.NavController");

    NavController.navigate.overload('java.lang.String').implementation = function(route) {
        console.log("[+] NavController.navigate called:");
        console.log("    Route: " + route);
        return this.navigate(route);
    };
});
```

---

## Mitigation Strategies

### 1. Secure State Persistence

**Secure Pattern:**
```kotlin
// ✅ Secure: Don't persist sensitive state
@Composable
fun LoginScreen(viewModel: LoginViewModel) {
    var password by remember { mutableStateOf("") }  // Not persisted

    Button(onClick = {
        viewModel.login(password)  // Password lost on process death (secure)
    }) {
        Text("Login")
    }
}
```

### 2. Mask Sensitive Data

**Secure Pattern:**
```kotlin
// ✅ Secure: Mask sensitive data in UI
@Composable
fun SecureScreen(viewModel: SecureViewModel) {
    val state by viewModel.state.collectAsState()

    Column {
        Text("Token: ${state.authToken?.take(10)}***")  // Masked
        Text("User: ${state.userData?.username}")
    }
}
```

### 3. Validate Navigation Arguments

**Secure Pattern:**
```kotlin
// ✅ Secure: Validate navigation parameters
@Composable
fun ProfileScreen(
    navController: NavController,
    userId: String?
) {
    // Validate userId
    val sanitizedUserId = userId?.takeIf { it.matches(Regex("^[a-zA-Z0-9_-]+$")) }

    if (sanitizedUserId == null) {
        // Invalid parameter
        LaunchedEffect(Unit) {
            navController.popBackStack()
        }
        return
    }

    // Safe to use sanitizedUserId
    Column {
        Text("User: $sanitizedUserId")
    }
}
```

### 4. Use Stable LaunchedEffect Keys

**Secure Pattern:**
```kotlin
// ✅ Secure: Use stable keys
@Composable
fun DataFetcherScreen(viewModel: DataViewModel) {
    val fetchTrigger by remember { mutableStateOf(false) }

    LaunchedEffect(fetchTrigger) {
        // Only runs when fetchTrigger changes
        if (fetchTrigger) {
            val data = viewModel.fetchSensitiveData()
            fetchTrigger = false  // Reset trigger
        }
    }
}
```

### 5. Encrypt State Persistence

**Secure Pattern:**
```kotlin
// ✅ Secure: Encrypt sensitive state
@Composable
fun SecureScreen() {
    val context = LocalContext.current
    var password by rememberSaveable(saver = Saver(
        save = { it: String ->
            // Encrypt before saving
            encrypt(it)
        },
        restore = { it: String ->
            // Decrypt when restoring
            decrypt(it)
        }
    )) {
        mutableStateOf("")
    }
}
```

---

## Security Checklist

### State Management
- [ ] `rememberSaveable` not used for sensitive data
- [ ] `remember` used for sensitive temporary state
- [ ] State is masked in UI when displayed
- [ ] Mutable state properly scoped

### Navigation
- [ ] Navigation arguments are validated
- [ ] Sensitive data not passed in URLs/routes
- [ ] Navigation parameters are sanitized
- [ ] Deep links are properly handled

### Side Effects
- [ ] `LaunchedEffect` uses stable keys
- [ ] Side effects don't execute multiple times
- [ ] Sensitive data not logged in side effects
- [ ] Side effects are properly scoped

### ViewModel
- [ ] Sensitive state is masked in UI
- [ ] ViewModel state is properly scoped
- [ ] State is validated before use
- [ ] No sensitive data in `collectAsState()` without masking

---

## Advanced Patterns

### 1. Custom Saver for Encrypted State

**Pattern:**
```kotlin
// Custom saver for encrypted state
val EncryptedStringSaver = Saver<String, String>(
    save = { it ->
        // Encrypt before saving
        val encryptionKey = getEncryptionKey()
        encrypt(it, encryptionKey)
    },
    restore = { it ->
        // Decrypt when restoring
        val encryptionKey = getEncryptionKey()
        decrypt(it, encryptionKey)
    }
)

@Composable
fun SecureScreen() {
    var sensitiveData by rememberSaveable(saver = EncryptedStringSaver) {
        mutableStateOf("")
    }
}
```

### 2. Secure State Holder

**Pattern:**
```kotlin
// Secure state holder that validates updates
class SecureStateHolder<T>(
    initialValue: T,
    private val validator: (T) -> Boolean
) {
    private val _state = mutableStateOf(initialValue)
    val state: State<T> = _state

    fun update(value: T) {
        if (validator(value)) {
            _state.value = value
        } else {
            Log.w(TAG, "Invalid state update rejected")
        }
    }
}

@Composable
fun <T> rememberSecureState(
    initialValue: T,
    validator: (T) -> Boolean
): SecureStateHolder<T> {
    return remember { SecureStateHolder(initialValue, validator) }
}
```

### 3. Biometric Authentication in Compose

**Pattern:**
```kotlin
// ✅ Secure: Require biometric for sensitive operations
@Composable
fun SecureButton(
    onClick: () -> Unit,
    enabled: Boolean = true
) {
    val context = LocalContext.current
    var showBiometricPrompt by remember { mutableStateOf(false) }

    if (showBiometricPrompt) {
        BiometricPrompt(
            onSuccess = { onClick() },
            onDismiss = { showBiometricPrompt = false }
        )
    } else {
        Button(
            onClick = { showBiometricPrompt = true },
            enabled = enabled
        ) {
            Text("Secure Action")
        }
    }
}
```

---

## Best Practices

1. **Don't persist sensitive state** - Use `remember` instead of `rememberSaveable`
2. **Mask sensitive data in UI** - Show partial or masked values
3. **Use stable LaunchedEffect keys** - Prevent multiple executions
4. **Validate navigation arguments** - Sanitize all route parameters
5. **Secure side effects** - Don't log sensitive data
6. **Encrypt state persistence** - Use custom savers for sensitive data
7. **Scope state properly** - Use appropriate composables and remember
8. **Test state flows** - Use Frida to trace state changes
9. **Validate state updates** - Use secure state holders
10. **Require biometric for sensitive ops** - Add authentication layer

---

## References

**Parent Document:**
- [kotlin-patterns.md](kotlin-patterns.md) — Overview of Kotlin security patterns
- [kotlin-async-security.md](kotlin-async-security.md) — Coroutines and async security

**Official Documentation:**
- Jetpack Compose Security: https://developer.android.com/jetpack/compose/security
- Compose State: https://developer.android.com/jetpack/compose/state
- Compose Navigation: https://developer.android.com/jetpack/compose/navigation

**Research:**
- Compose Security Analysis: [Link to research papers]
- Compose Best Practices: https://developer.android.com/jetpack/compose/best-practices

---

**Last Updated:** 2024
