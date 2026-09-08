# Kotlin Async Security Patterns

**Purpose:** Comprehensive reference for Kotlin coroutines, suspend functions, and async security patterns in Android apps. Covers data flow analysis, common vulnerabilities, and testing techniques.

**Parent:** See [kotlin-patterns.md](kotlin-patterns.md) for overview of Kotlin security patterns.

---

## Overview

Kotlin's coroutines provide powerful async capabilities but introduce security challenges for static analysis. The continuation-passing style obscures data flow, making source-to-sink analysis difficult.

### How Coroutines Compile

Coroutines compile to continuation-passing style state machines:
- `suspend fun` → Methods with `Continuation` parameter
- `launch { }` → Builders.createCoroutine
- `async { }` → Deferred implementation
- `withContext(Dispatchers.IO)` → Thread switching

### Security Implications

| Feature | Security Risk |
|---------|---------------|
| **Coroutine context switching** | Data flows across thread boundaries, bypassing validation |
| **Suspend functions** | Obscure parameter flow, difficult to track sources/sinks |
| **Flows** | Reactive streams hide data transformations |
| **Structured concurrency** | Can bypass lifecycle checks |
| **CoroutineScope** | May expose sensitive state globally |

---

## Coroutines & Async Patterns

### Key Patterns to Recognize

| Kotlin Pattern | Decompiled Pattern | Grep Command |
|----------------|-------------------|--------------|
| `suspend fun` | Methods with `Continuation` parameter | `grep -rn "Continuation" "$APP/"` |
| `launch { }` | Builders.createCoroutine | `grep -rn "BuildersKt\.launch" "$APP/"` |
| `async { }` | Deferred implementation | `grep -rn "Deferred\|async\|await" "$APP/"` |
| `withContext(Dispatchers.IO)` | Thread switching | `grep -rn "Dispatchers\|withContext" "$APP/"` |
| `Flow`, `StateFlow`, `SharedFlow` | Reactive stream implementations | `grep -rn "Flow\|collect\|emit" "$APP/"` |
| `CoroutineScope` | Scope management | `grep -rn "CoroutineScope\|GlobalScope\|viewModelScope" "$APP/"` |

### Decompilation Example

**Kotlin Source:**
```kotlin
suspend fun login(username: String, password: String): AuthToken {
    return withContext(Dispatchers.IO) {
        apiService.authenticate(username, password)
    }
}
```

**Decompiled:**
```java
public final Object login(String username, String password, Continuation continuation) {
    // Continuation-passing style obscures synchronous execution
    return BuildersKt.withContext(
        Dispatchers.getIO(),
        (Function2)(new Function2() {
            public Object invoke(Object... args) {
                // Password flows across thread boundary
                return apiService.authenticate(username, password);
            }
        }),
        continuation
    );
}
```

**Security Implication:** The password flows from `suspend fun` through `withContext` to API call, making source-to-sink tracking non-trivial.

---

## Common Vulnerabilities

### 1. Sensitive Data in Suspend Functions

**Vulnerable Pattern:**
```kotlin
// ❌ Vulnerable: Sensitive parameters in suspend fun
suspend fun login(username: String, password: String): AuthToken {
    return withContext(Dispatchers.IO) {
        apiService.authenticate(username, password)
    }
}
```

**Grep Commands:**
```bash
# Find suspend functions handling sensitive data (cross-platform)
grep -rnE "suspend fun.*(auth|token|password|credential|secret|key|session)" "$APP/"

# Find coroutine builders that may execute sensitive operations
grep -rnE "launch\s*\{|async\s*\{|GlobalScope\.(launch|async)" "$APP/"

# Find thread switches that may bypass security checks
grep -rnE "withContext\s*\(.*Dispatchers\.(IO|Default|Main)" "$APP/"
```

### 2. Context Switching Bypassing Validation

**Vulnerable Pattern:**
```kotlin
// ❌ Vulnerable: Context switch bypasses validation
class UserRepository {
    suspend fun getUser(userId: String): User {
        // Validation skipped on main thread
        return withContext(Dispatchers.IO) {
            // User ID not validated before DB query
            database.query("SELECT * FROM users WHERE id = $userId")
        }
    }
}
```

**Grep Commands:**
```bash
# Find thread switches that may bypass security checks
grep -rnE "withContext\s*\(.*Dispatchers\.(IO|Default|Main)" "$APP/"

# Find Flow operators handling user input
grep -rnE "Flow.*map\s*\{|Flow.*filter\s*\{|collect\s*\{" "$APP/"
```

### 3. Global Scope Misuse

**Vulnerable Pattern:**
```kotlin
// ❌ Vulnerable: GlobalScope survives app lifecycle
class DataManager {
    fun uploadData(data: String) {
        GlobalScope.launch {
            // Upload continues even if app is destroyed
            apiService.upload(data)  // Sensitive data leaked
        }
    }
}
```

**Grep Commands:**
```bash
# Find ViewModel coroutines (may expose state)
grep -rnE "viewModelScope\.launch|liveData\s*\{\s*coroutineScope" "$APP/"

# GlobalScope usage (risk: application-wide lifecycle issues)
grep -rnE "GlobalScope\.(launch|async)" "$APP/"
```

### 4. Flow Operators Hiding Sensitive Operations

**Vulnerable Pattern:**
```kotlin
// ❌ Vulnerable: Flow transforms sensitive data without validation
val userInputFlow = MutableSharedFlow<String>()

fun processInput() {
    userInputFlow
        .map { input ->
            // Input not validated before processing
            sensitiveOperation(input)
        }
        .collect()
}
```

**Grep Commands:**
```bash
# Find Flow operators transforming attacker data
grep -rnE "\.map\s*\{|\.filter\s*\{|\.transform\s*\{" "$APP/" | grep -E "(user|input|data)"

# Find Channel communication (potential data leakage)
grep -rnE "Channel\s*\(|\.send\s*\(|\.receive\s*\(" "$APP/"
```

### 5. Actor Message Queue Vulnerabilities

**Vulnerable Pattern:**
```kotlin
// ❌ Vulnerable: Actor processes untrusted messages
class MessageProcessor {
    val actor = actor<String> {
        for (msg in channel) {
            // Message not validated before processing
            executeCommand(msg)
        }
    }
}
```

**Grep Commands:**
```bash
# Find Actor usage (shared state mutation)
grep -rnE "actor\s*<\s*\w+\s*>|CoroutineScope\s*\.actor" "$APP/"
```

---

## Source-to-Sink Analysis

### Coroutine Data Flow Patterns

| Source | Sink | Pattern |
|--------|------|---------|
| `suspend fun` input parameter | API call in `withContext(Dispatchers.IO)` | Data crosses thread boundary |
| Flow `collect` | Database query or file write | Reactive stream to storage |
| Channel `send` | Network request | Async communication |
| Actor message | State mutation | Shared state mutation |

### Grep Patterns for Source-to-Sink

```bash
# Find suspend functions that receive sensitive data
grep -rnE "suspend\s+fun\s+\w+\s*\([^)]*(password|token|secret|credential|user)" "$APP/"

# Find coroutine contexts switching threads (trust boundary)
grep -rnE "withContext\s*\([^)]*Dispatchers\.(IO|Default)" "$APP/"

# Find Flow operators transforming attacker data
grep -rnE "\.map\s*\{|\.filter\s*\{|\.transform\s*\{" "$APP/" | grep -E "(user|input|data)"

# Find Channel communication (potential data leakage)
grep -rnE "Channel\s*\(|\.send\s*\(|\.receive\s*\(" "$APP/"

# Find Actor usage (shared state mutation)
grep -rnE "actor\s*<\s*\w+\s*>|CoroutineScope\s*\.actor" "$APP/"
```

### Source-to-Sink Example

**Vulnerable Code:**
```kotlin
suspend fun processPayment(cardNumber: String, amount: Int): PaymentResult {
    return withContext(Dispatchers.IO) {
        // Card number flows through suspend fun → withContext → API call
        // Source-to-sink analysis must track across thread boundary
        paymentService.charge(cardNumber, amount)
    }
}
```

**Decompiled:**
```java
public final Object processPayment(String cardNumber, int amount, Continuation continuation) {
    return BuildersKt.withContext(
        Dispatchers.getIO(),
        (Function2)(new Function2() {
            public Object invoke(Object... args) {
                // Card number in lambda, difficult to trace
                return paymentService.charge(cardNumber, amount);
            }
        }),
        continuation
    );
}
```

---

## Testing Techniques

### Static Analysis with Grep

```bash
# Find all coroutine-related patterns
grep -rnE "(suspend|launch|async|withContext|Dispatchers|Flow|CoroutineScope)" "$APP/"

# Suspend functions with sensitive parameters
grep -rnE "suspend\s+fun\s+\w+\s*\([^)]*(auth|password|token|secret|key|credential)" "$APP/"

# GlobalScope usage (risk: application-wide lifecycle issues)
grep -rnE "GlobalScope\.(launch|async)" "$APP/"
```

### Dynamic Analysis with Frida

**Hook suspend functions:**
```javascript
// hook_suspend_functions.js
Java.perform(function() {
    // Find and hook suspend functions
    // Note: Suspend functions are compiled to state machines
    // Hooking requires understanding the generated class structure

    var LoginActivity = Java.use("com.example.app.LoginActivity");

    // Hook a method that uses coroutines
    LoginActivity.onLoginClick.implementation = function(view) {
        console.log("[+] Login button clicked");

        // Get sensitive data
        var username = this.usernameEditText.getText().toString();
        var password = this.passwordEditText.getText().toString();

        console.log("[+] Username: " + username);
        console.log("[+] Password: " + password);

        this.onLoginClick(view);
    };
});
```

**Launch:**
```bash
frida -U -f com.example.app -l hook_suspend_functions.js
```

**Hook coroutine execution:**
```javascript
// hook_coroutines.js
Java.perform(function() {
    var Dispatchers = Java.use("kotlinx.coroutines.Dispatchers");
    var BuildersKt = Java.use("kotlinx.coroutines.BuildersKt");

    // Monitor coroutine launches
    BuildersKt.launch.overload(
        'kotlinx.coroutines.CoroutineScope',
        'kotlinx.coroutines.CoroutineContext',
        'kotlin.jvm.functions.Function2'
    ).implementation = function(scope, context, block) {
        console.log("[+] Coroutine launched");
        console.log("    Scope: " + scope.getClass().getName());
        console.log("    Context: " + context);
        return this.launch(scope, context, block);
    };
});
```

---

## Mitigation Strategies

### 1. Validate Before Context Switch

**Secure Pattern:**
```kotlin
// ✅ Secure: Validate before context switch
class UserRepository {
    suspend fun getUser(userId: String): User {
        // Validate input on calling thread
        if (!isValidUserId(userId)) {
            throw SecurityException("Invalid user ID")
        }

        return withContext(Dispatchers.IO) {
            database.query("SELECT * FROM users WHERE id = $userId")
        }
    }

    private fun isValidUserId(userId: String): Boolean {
        return userId.matches(Regex("^[a-zA-Z0-9_-]+$"))
    }
}
```

### 2. Use Structured Concurrency

**Secure Pattern:**
```kotlin
// ✅ Secure: Use viewModelScope instead of GlobalScope
class DataViewModel : ViewModel() {
    fun uploadData(data: String) {
        viewModelScope.launch {
            // Cancels when ViewModel is cleared
            apiService.upload(data)
        }
    }
}
```

### 3. Validate Flow Data

**Secure Pattern:**
```kotlin
// ✅ Secure: Validate before Flow processing
val userInputFlow = MutableSharedFlow<String>()

fun processInput() {
    userInputFlow
        .filter { input ->
            // Validate before processing
            isValidInput(input)
        }
        .map { input ->
            // Safe to process validated input
            sensitiveOperation(input)
        }
        .collect()
}
```

### 4. Secure Actor Messages

**Secure Pattern:**
```kotlin
// ✅ Secure: Validate actor messages
class MessageProcessor {
    val actor = actor<String> {
        for (msg in channel) {
            // Validate message before processing
            if (isValidMessage(msg)) {
                executeCommand(msg)
            }
        }
    }

    private fun isValidMessage(msg: String): Boolean {
        // Implement validation logic
        return msg.length < 100 && msg.matches(Regex("^[a-zA-Z0-9_-]+$"))
    }
}
```

---

## Security Checklist

### Code Review
- [ ] Suspend functions validate sensitive parameters
- [ ] Context switches don't bypass security checks
- [ ] GlobalScope is not used (use structured concurrency)
- [ ] Flow operators validate data before processing
- [ ] Actor messages are validated
- [ ] CoroutineScope is properly scoped

### Static Analysis
- [ ] All suspend functions with sensitive data identified
- [ ] Data flow across thread boundaries tracked
- [ ] Coroutine builders reviewed for misuse
- [ ] Flow operators audited for validation gaps

### Dynamic Testing
- [ ] Frida hooks show coroutine execution
- [ ] Sensitive data flow is tracked
- [ ] Context switches don't skip validation
- [ ] Structured concurrency is verified

---

## Advanced Patterns

### 1. Exception Handling in Coroutines

**Vulnerable Pattern:**
```kotlin
// ❌ Vulnerable: Exceptions may expose sensitive data
suspend fun performOperation(): Result {
    return try {
        sensitiveOperation()
    } catch (e: Exception) {
        // May log sensitive data in exception
        Log.e(TAG, "Operation failed", e)
        Result.failure(e)
    }
}
```

**Secure Pattern:**
```kotlin
// ✅ Secure: Sanitize exceptions
suspend fun performOperation(): Result {
    return try {
        sensitiveOperation()
    } catch (e: Exception) {
        // Log generic error message
        Log.e(TAG, "Operation failed: ${e.javaClass.simpleName}")
        Result.failure(SecurityException("Operation failed"))
    }
}
```

### 2. Cancellation and Cleanup

**Vulnerable Pattern:**
```kotlin
// ❌ Vulnerable: Sensitive data not cleaned up on cancellation
suspend fun processSensitiveData(data: String) {
    withContext(Dispatchers.IO) {
        // Data may leak if cancelled
        writeToDisk(data)
    }
}
```

**Secure Pattern:**
```kotlin
// ✅ Secure: Clean up on cancellation
suspend fun processSensitiveData(data: String) {
    try {
        withContext(Dispatchers.IO) {
            writeToDisk(data)
        }
    } finally {
        // Clean up sensitive data
        clearSensitiveData()
    }
}
```

### 3. Coroutine Debugging and Logging

**Vulnerable Pattern:**
```kotlin
// ❌ Vulnerable: Debug logging exposes sensitive data
suspend fun login(username: String, password: String) {
    Log.d(TAG, "Logging in: username=$username, password=$password")
    apiService.authenticate(username, password)
}
```

**Secure Pattern:**
```kotlin
// ✅ Secure: Sanitize debug logging
suspend fun login(username: String, password: String) {
    Log.d(TAG, "Logging in: username=$username, password=${"*".repeat(password.length)}")
    apiService.authenticate(username, password)
}
```

---

## Best Practices

1. **Always validate before context switches** - Don't rely on thread changes for security
2. **Use structured concurrency** - `viewModelScope`, `lifecycleScope` instead of `GlobalScope`
3. **Sanitize exceptions** - Don't leak sensitive data in error messages
4. **Clean up on cancellation** - Use `try-finally` blocks
5. **Validate Flow data** - Filter and sanitize before processing
6. **Secure coroutine debugging** - Don't log sensitive data
7. **Use proper coroutine contexts** - `Dispatchers.Default` for CPU, `Dispatchers.IO` for I/O
8. **Handle coroutine failures** - Don't swallow exceptions silently
9. **Be aware of coroutine scope** - Understand lifecycle implications
10. **Test coroutine execution** - Use Frida to trace data flow

---

## References

**Parent Document:**
- [kotlin-patterns.md](kotlin-patterns.md) — Overview of Kotlin security patterns

**Official Documentation:**
- Kotlin Coroutines Guide: https://kotlinlang.org/docs/coroutines-overview.html
- Coroutines Best Practices: https://kotlinlang.org/docs/coroutines-best-practices.html
- Android Kotlin Coroutines: https://developer.android.com/kotlin/coroutines

**Research:**
- Coroutine Security Analysis: [Link to research papers]
- Async Code Static Analysis: [Link to technical blogs]

---

**Last Updated:** 2024
