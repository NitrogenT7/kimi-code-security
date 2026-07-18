# AndroidX Security Migration: EncryptedSharedPreferences to Modern Alternatives

## Overview

This reference document covers the deprecation of `EncryptedSharedPreferences` from `androidx.security:security-crypto` (JetSec) and provides guidance for pentesters and developers on migration paths, security implications, and testing techniques.

**Status:** ACTIVE — NOT Deprecated. As of April 2026, `EncryptedSharedPreferences` and `security-crypto` remain actively maintained. The library is NOT deprecated despite earlier speculation. DataStore + Tink is the **recommended modern alternative** for new projects, but ESP remains valid for existing code.
**Migration Note:** While Google promotes DataStore + Tink as the modern path, there is **no official deprecation announcement** for EncryptedSharedPreferences. Do NOT migrate existing code solely based on this guide — evaluate based on project needs.
**Affected Component:** `EncryptedSharedPreferences`, `EncryptedFile`, and the JetSec crypto library

---

## Deprecation Timeline

| Date | Milestone |
|------|-----------|
| April 2025 | Initial speculation about deprecation began circulating (unconfirmed) |
| 2026 | DataStore + Tink promoted as recommended modern alternative |
| Current | EncryptedSharedPreferences remains ACTIVE and supported — no official deprecation |

**Note:** Despite earlier community speculation, Google has NOT officially deprecated EncryptedSharedPreferences as of April 2026. The library remains actively maintained. DataStore + Tink is Google's preferred choice for *new* projects due to better performance and architecture, but existing EncryptedSharedPreferences code is safe to keep.

---

## What Was EncryptedSharedPreferences

### How It Worked

`EncryptedSharedPreferences` was a wrapper around standard `SharedPreferences` that provided transparent encryption using the Android Keystore system. It was part of the Jetpack Security (JetSec) library.

**Key Characteristics:**
- Drop-in replacement for `SharedPreferences`
- Automatic encryption/decryption of values
- Used AES-GCM for encryption (128-bit or 256-bit keys)
- Key material stored in Android Keystore (hardware-backed when available)
- Supported key rotation through `MasterKey` API

**Basic Usage (Deprecated):**

```kotlin
// OLD CODE - DEPRECATED
val masterKey = MasterKey.Builder(context)
    .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
    .build()

val sharedPreferences = EncryptedSharedPreferences.create(
    context,
    "secret_shared_prefs",
    masterKey,
    EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
    EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
)

val editor = sharedPreferences.edit()
editor.putString("api_token", "EXAMPLE_TOKEN_REDACTED")
editor.apply()

val token = sharedPreferences.getString("api_token", null)
```

### Known Weaknesses

1. **Synchronous Operations:** All crypto operations were blocking on the main thread
2. **Key Rotation Complexity:** Manual rotation required careful migration logic
3. **Limited Key Management:** No support for key versioning or automatic key upgrades
4. **No Data Migration Path:** Moving to DataStore required complete rewrite
5. **Maintenance Burden:** JetSec was under-maintained with limited updates
6. **Thread Safety Issues:** Race conditions possible during concurrent access
7. **No Corruption Recovery:** Damaged files could not be recovered automatically

---

## Migration Path Options

### Option 1: DataStore + Tink (Recommended)

**Pros:**
- Asynchronous, coroutine-based API (non-blocking)
- Built-in data migration from SharedPreferences
- Type-safe (Kotlin Flow, RxJava)
- Stronger security guarantees via Tink
- Better error handling and corruption recovery
- Active maintenance by Google

**Cons:**
- Learning curve for new API
- Requires Kotlin coroutines or RxJava
- Larger dependency footprint

**Dependencies:**

```gradle
implementation "androidx.datastore:datastore-preferences:1.1.1"
implementation "com.google.crypto.tink:tink-android:1.14.1"
```

**Note:** `androidx.datastore:datastore-tink` does not exist. Use manual Tink integration for encryption (see Step 1 below).

### Option 2: Direct Android Keystore

**Pros:**
- Full control over cryptographic operations
- No additional dependencies
- Optimized for specific use cases
- Direct access to hardware-backed security

**Cons:**
- Requires deep crypto expertise
- No automatic data migration
- Higher risk of implementation errors
- More boilerplate code

**When to Use:**
- Performance-critical operations
- Custom key management requirements
- Legacy codebase already using Keystore
- When you need fine-grained control over crypto

---

## Migration Steps with Code Examples

### Step 1: Setup Tink for DataStore

**Create Tink KeysetManager:**

```kotlin
// Initialize Tink with Android Keystore
object TinkKeyManager {
    private const val KEYSET_PREF_NAME = "tink_keyset"
    private const val MASTER_KEY_URI = "android-keystore://tink_master_key"

    suspend fun initializeOrGetKeyset(context: Context): Aead {
        // Create or load master key from Android Keystore
        val masterKey = MasterKey.Builder(context)
            .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
            .build()

        // Initialize Tink with the master key
        AndroidKeysetManager.Builder()
            .withSharedPref(context, KEYSET_PREF_NAME, "tink_keyset")
            .withMasterKeyUri(MASTER_KEY_URI)
            .withKeyTemplate(KeyTemplates.getAes256Gcm())
            .build()
            .keysetHandle

        // Get AEAD primitive for encryption/decryption
        return CleartextKeysetHandle.read(
            AndroidKeysetManager.Builder()
                .withSharedPref(context, KEYSET_PREF_NAME, "tink_keyset")
                .withMasterKeyUri(MASTER_KEY_URI)
                .build()
                .keysetHandle
        ).getPrimitive(Aead::class.java)
    }
}
```

### Step 2: Create Encrypted DataStore

```kotlin
import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.core.handlers.ReplaceFileCorruptionHandler
import androidx.datastore.preferences.core.PreferenceDataStoreFactory
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStoreFile
import com.google.crypto.tink.Aead
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map

class SecureDataStore(private val context: Context) {

    private object PreferencesKeys {
        val API_TOKEN = stringPreferencesKey("api_token")
        val SESSION_KEY = stringPreferencesKey("session_key")
        val USER_CREDENTIALS = stringPreferencesKey("user_credentials")
    }

    // Create DataStore with encryption wrapper
    private val dataStore: DataStore<Preferences> = PreferenceDataStoreFactory.create(
        corruptionHandler = ReplaceFileCorruptionHandler(
            produceNewData = { produceInitialPreferences() }
        ),
        migrations = listOf(SharedPreferencesMigration(context, "secret_shared_prefs")),
        scope = CoroutineScope(Dispatchers.IO + SupervisorJob()),
        produceFile = { context.preferencesDataStoreFile("secure_prefs") }
    )

    private suspend fun encrypt(data: String, aead: Aead): String {
        val encrypted = aead.encrypt(data.toByteArray(), null)
        return Base64.encodeToString(encrypted, Base64.NO_WRAP)
    }

    private suspend fun decrypt(data: String, aead: Aead): String {
        val encrypted = Base64.decode(data, Base64.NO_WRAP)
        return String(aead.decrypt(encrypted, null))
    }

    // Read encrypted value
    fun getApiToken(aead: Aead): Flow<String?> {
        return dataStore.data.map { preferences ->
            val encrypted = preferences[PreferencesKeys.API_TOKEN]
            encrypted?.let { decrypt(it, aead) }
        }
    }

    // Write encrypted value
    suspend fun saveApiToken(token: String, aead: Aead) {
        val encrypted = encrypt(token, aead)
        dataStore.edit { preferences ->
            preferences[PreferencesKeys.API_TOKEN] = encrypted
        }
    }

    // Clear sensitive data
    suspend fun clearApiToken() {
        dataStore.edit { preferences ->
            preferences.remove(PreferencesKeys.API_TOKEN)
        }
    }

    private fun produceInitialPreferences(): Preferences {
        return preferencesOf()
    }
}
```

### Step 3: Migrate Existing Data

```kotlin
import android.content.Context
import android.content.SharedPreferences
import androidx.datastore.core.DataMigration
import androidx.datastore.preferences.core.PreferenceDataStoreFactory
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStoreFile
import kotlinx.coroutines.flow.first

class SharedPreferencesToDataStoreMigration(
    private val context: Context,
    private val oldPrefsName: String,
    private val aead: Aead
) : DataMigration<Preferences> {

    override suspend fun shouldMigrate(currentData: Preferences): Boolean {
        // Check if old SharedPreferences exist
        val oldPrefs = context.getSharedPreferences(oldPrefsName, Context.MODE_PRIVATE)
        return oldPrefs.contains("api_token") && !currentData.contains(stringPreferencesKey("api_token"))
    }

    override suspend fun migrate(currentData: Preferences): Preferences {
        val oldPrefs = context.getSharedPreferences(oldPrefsName, Context.MODE_PRIVATE)
        val mutablePreferences = currentData.toMutablePreferences()

        // Migrate specific keys
        oldPrefs.all.forEach { (key, value) ->
            if (value is String) {
                // Re-encrypt with new Tink key
                val encrypted = encrypt(value, aead)
                mutablePreferences[stringPreferencesKey(key)] = encrypted
            }
        }

        return mutablePreferences.toPreferences()
    }

    override suspend fun cleanUp() {
        // Optionally remove old SharedPreferences after successful migration
        val oldPrefsFile = context.getSharedPreferences(oldPrefsName, Context.MODE_PRIVATE)
        oldPrefsFile.edit().clear().apply()

        // Delete old SharedPreferences file
        val oldPrefsDir = File(context.applicationInfo.dataDir, "shared_prefs")
        val oldPrefsDataFile = File(oldPrefsDir, "$oldPrefsName.xml")
        oldPrefsDataFile.delete()
    }

    private suspend fun encrypt(data: String, aead: Aead): String {
        val encrypted = aead.encrypt(data.toByteArray(), null)
        return Base64.encodeToString(encrypted, Base64.NO_WRAP)
    }
}

// Usage during DataStore creation
val dataStore = PreferenceDataStoreFactory.create(
    migrations = listOf(
        SharedPreferencesToDataStoreMigration(
            context = context,
            oldPrefsName = "secret_shared_prefs",
            aead = TinkKeyManager.initializeOrGetKeyset(context)
        )
    ),
    produceFile = { context.preferencesDataStoreFile("secure_prefs") }
)
```

### Step 4: Direct Keystore Alternative

```kotlin
import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import java.io.File
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

class KeystoreSecureStorage(private val context: Context) {

    companion object {
        private const val ANDROID_KEYSTORE = "AndroidKeyStore"
        private const val KEY_ALIAS = "secure_storage_key"
        private const val TRANSFORMATION = "AES/GCM/NoPadding"
        private const val GCM_TAG_LENGTH = 128
    }

    private val keyStore = KeyStore.getInstance(ANDROID_KEYSTORE).apply { load(null) }

    init {
        createKeyIfNotExists()
    }

    private fun createKeyIfNotExists() {
        if (!keyStore.containsAlias(KEY_ALIAS)) {
            val keyGenerator = KeyGenerator.getInstance(
                KeyProperties.KEY_ALGORITHM_AES,
                ANDROID_KEYSTORE
            )

            val keyGenSpec = KeyGenParameterSpec.Builder(
                KEY_ALIAS,
                KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT
            )
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .setUserAuthenticationRequired(false)
                .build()

            keyGenerator.init(keyGenSpec)
            keyGenerator.generateKey()
        }
    }

    private fun getSecretKey(): SecretKey {
        return keyStore.getKey(KEY_ALIAS, null) as SecretKey
    }

    fun encrypt(data: String): Pair<String, String> {
        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(Cipher.ENCRYPT_MODE, getSecretKey())

        val iv = cipher.iv
        val encryptedBytes = cipher.doFinal(data.toByteArray())

        val ivHex = iv.joinToString("") { "%02x".format(it) }
        val encryptedHex = encryptedBytes.joinToString("") { "%02x".format(it) }

        return Pair(encryptedHex, ivHex)
    }

    fun decrypt(encryptedHex: String, ivHex: String): String {
        val encryptedBytes = encryptedHex.chunked(2).map { it.toInt(16).toByte() }.toByteArray()
        val iv = ivHex.chunked(2).map { it.toInt(16).toByte() }.toByteArray()

        val cipher = Cipher.getInstance(TRANSFORMATION)
        val spec = GCMParameterSpec(GCM_TAG_LENGTH, iv)
        cipher.init(Cipher.DECRYPT_MODE, getSecretKey(), spec)

        val decryptedBytes = cipher.doFinal(encryptedBytes)
        return String(decryptedBytes)
    }

    fun saveToFile(key: String, value: String) {
        val (encrypted, iv) = encrypt(value)
        val file = File(context.filesDir, "secure_storage_$key.dat")
        file.writeText("$encrypted:$iv")
    }

    fun readFromFile(key: String): String? {
        val file = File(context.filesDir, "secure_storage_$key.dat")
        if (!file.exists()) return null

        val content = file.readText()
        val parts = content.split(":")
        if (parts.size != 2) return null

        return try {
            decrypt(parts[0], parts[1])
        } catch (e: Exception) {
            null
        }
    }

    fun deleteFile(key: String) {
        val file = File(context.filesDir, "secure_storage_$key.dat")
        file.delete()
    }
}

// Usage example
val secureStorage = KeystoreSecureStorage(context)
secureStorage.saveToFile("api_token", "EXAMPLE_TOKEN_REDACTED")
val token = secureStorage.readFromFile("api_token")
secureStorage.deleteFile("api_token")
```

---

## Pentesting Implications

### What to Look For During Audits

#### 1. Legacy Code Detection

Search for deprecated imports:
```bash
# Check for EncryptedSharedPreferences usage
grep -r "EncryptedSharedPreferences" app/src/
grep -r "androidx.security:security-crypto" app/build.gradle
grep -r "MasterKey.Builder" app/src/
```

**Risk Level:** HIGH if still in production without migration plan

#### 2. Incomplete Migrations

Look for mixed usage of old and new storage:
```bash
# Check for both SharedPreferences and DataStore
grep -r "getSharedPreferences" app/src/
grep -r "DataStore" app/src/
grep -r "preferencesDataStore" app/src/
```

**Common Issues:**
- Data still in old SharedPreferences after "migration"
- Keys not properly re-encrypted during migration
- Old files not deleted after migration

#### 3. Weak Key Management

Check for hardcoded keys or weak key schemes:
```bash
# Look for hardcoded keys
grep -r "setKeyScheme" app/src/
grep -r "AES128_GCM" app/src/  # Weak key size
grep -r "\"KEY_.*\"" app/src/   # Hardcoded constants
```

**Vulnerabilities:**
- Using AES128 instead of AES256
- Missing key rotation logic
- Keys backed up to cloud (check `allowBackup` flag)

#### 4. Data Leak Vectors

Analyze storage locations:
```bash
# Check for insecure storage paths
grep -r "getExternalFilesDir" app/src/
grep -r "getCacheDir" app/src/  # Temporary files
grep -r "File(" app/src/ | grep -i "write"  # Custom file storage
```

**Attack Paths:**
- Data written to external storage
- Temporary files not deleted
- Backup files containing sensitive data

#### 5. Migration Code Quality

Review migration logic:
```kotlin
// BAD: No error handling, silent failures
fun migrate(oldPrefs: SharedPreferences) {
    oldPrefs.all.forEach { (key, value) ->
        dataStore.edit { it[stringPreferencesKey(key)] = value.toString() }
    }
}

// GOOD: Proper error handling and rollback
suspend fun migrate(oldPrefs: SharedPreferences): Result<Unit> {
    return try {
        val encryptedData = oldPrefs.all.mapValues { (_, value) ->
            encrypt(value.toString(), aead)
        }
        dataStore.edit { preferences ->
            encryptedData.forEach { (key, value) ->
                preferences[stringPreferencesKey(key)] = value
            }
        }
        Result.success(Unit)
    } catch (e: Exception) {
        Log.e(TAG, "Migration failed: ${e.message}")
        Result.failure(e)
    }
}
```

---

## Storage Analysis Commands

### DataStore Storage Paths

```bash
# Default DataStore location
/data/data/com.example.app/files/datastore/secure_prefs.preferences_pb

# Backup DataStore location (if enabled)
/data/data/com.example.app/files/datastore/secure_prefs.preferences_pb.backup

# Corrupted data location
/data/data/com.example.app/files/datastore/secure_prefs.preferences_pb.corrupt
```

### SharedPreferences Storage Paths

```bash
# Legacy SharedPreferences (EncryptedSharedPreferences used same structure)
/data/data/com.example.app/shared_prefs/secret_shared_prefs.xml

# Standard SharedPreferences
/data/data/com.example.app/shared_prefs/MainActivity.xml
/data/data/com.example.app/shared_prefs/Settings.xml
```

### Keystore Storage

```bash
# Android Keystore is not directly accessible via filesystem
# Keys are stored in hardware-backed keystore (TEE/StrongBox)
# Use keytool to inspect: keytool -list -v -keystore /data/misc/keystore/

# Check for backup-enabled keystore keys
adb shell dumpsys keystore
```

### Analysis Commands

```bash
# Check DataStore files
adb shell "ls -la /data/data/com.example.app/files/datastore/"

# Pull DataStore for offline analysis
adb pull /data/data/com.example.app/files/datastore/secure_prefs.preferences_pb .

# Pull SharedPreferences
adb pull /data/data/com.example.app/shared_prefs/secret_shared_prefs.xml .

# Check file permissions
adb shell "stat /data/data/com.example.app/files/datastore/secure_prefs.preferences_pb"

# Monitor DataStore access in real-time
adb shell "su -c 'strace -e open,openat,write -p \$(pidof com.example.app)'"

# Check for encrypted data patterns (should look like base64)
adb shell "cat /data/data/com.example.app/files/datastore/secure_prefs.preferences_pb | strings | head -20"
```

### Automated Analysis Script

```bash
#!/bin/bash
# analyze_android_storage.sh

PACKAGE_NAME=$1
if [ -z "$PACKAGE_NAME" ]; then
    echo "Usage: $0 <package_name>"
    exit 1
fi

echo "=== Analyzing Android Storage for $PACKAGE_NAME ==="
echo ""

echo "[1] Checking DataStore files..."
adb shell "ls -la /data/data/$PACKAGE_NAME/files/datastore/" 2>/dev/null || echo "No DataStore found"

echo ""
echo "[2] Checking SharedPreferences files..."
adb shell "ls -la /data/data/$PACKAGE_NAME/shared_prefs/" 2>/dev/null || echo "No SharedPreferences found"

echo ""
echo "[3] Checking for encrypted data patterns..."
adb shell "find /data/data/$PACKAGE_NAME -name '*.pb' -o -name '*.xml' | while read file; do echo '=== \$file ==='; cat \"\$file\" | strings | head -5; done"

echo ""
echo "[4] Checking file permissions..."
adb shell "find /data/data/$PACKAGE_NAME/files -type f -exec stat -c '%a %n' {} \;" 2>/dev/null

echo ""
echo "[5] Checking for backup files..."
adb shell "find /data/data/$PACKAGE_NAME -name '*.backup' -o -name '*.corrupt'"

echo ""
echo "[6] Checking for external storage usage..."
adb shell "ls -la /sdcard/Android/data/$PACKAGE_NAME/" 2>/dev/null || echo "No external storage usage"

echo ""
echo "=== Analysis Complete ==="
```

---

## Common Vulnerabilities During Migration

### 1. Plaintext During Migration

**Vulnerability:** Data written in plaintext during migration process.

**Example:**
```kotlin
// BAD: Data written in plaintext before encryption
suspend fun migrate(oldPrefs: SharedPreferences) {
    dataStore.edit { preferences ->
        // This writes plaintext to disk
        preferences[API_TOKEN] = oldPrefs.getString("api_token", "")!!
    }
    // Then encrypts - vulnerable to crash between these steps
}
```

**Detection:**
```bash
# Check for intermediate files
adb shell "find /data/data/com.example.app/files -name '*.tmp' -o -name '*.temp'"

# Monitor file creation during migration
adb shell "inotifywait -m -e create,modify /data/data/com.example.app/files/"
```

**Fix:**
```kotlin
// GOOD: Encrypt in memory before writing
suspend fun migrate(oldPrefs: SharedPreferences) {
    val encrypted = encrypt(oldPrefs.getString("api_token", "")!!, aead)
    dataStore.edit { preferences ->
        preferences[API_TOKEN] = encrypted
    }
}
```

### 2. Key Rotation Without Data Re-encryption

**Vulnerability:** New keys generated but old data not re-encrypted.

**Example:**
```kotlin
// BAD: Key rotated but data not re-encrypted
fun rotateKey() {
    createNewKey()  // New key created
    // Old data still encrypted with old key - decryption fails!
}
```

**Detection:**
```bash
# Check for multiple key versions in Keystore
adb shell "dumpsys keystore | grep KEY_ALIAS"

# Monitor decryption failures
adb logcat | grep -i "decryption\|crypto\|keystore"
```

**Fix:**
```kotlin
// GOOD: Re-encrypt all data with new key
suspend fun rotateKey(context: Context) {
    val oldAead = TinkKeyManager.initializeOrGetKeyset(context)
    val oldData = readAllData(dataStore, oldAead)

    TinkKeyManager.rotateKey(context)  // Generate new key
    val newAead = TinkKeyManager.initializeOrGetKeyset(context)

    writeAllData(dataStore, oldData, newAead)  // Re-encrypt with new key
}
```

### 3. Hardcoded IV/Nonce

**Vulnerability:** Reusing initialization vectors (IV) or nonces.

**Example:**
```kotlin
// BAD: Static IV used for all encryptions
private val FIXED_IV = byteArrayOf(0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0A, 0x0B, 0x0C)

fun encrypt(data: String): String {
    cipher.init(Cipher.ENCRYPT_MODE, key, GCMParameterSpec(128, FIXED_IV))
    // ...
}
```

**Detection:**
```bash
# Search for hardcoded IV patterns
grep -r "byteArrayOf.*0x01.*0x02.*0x03" app/src/
grep -r "GCMParameterSpec" app/src/ | grep "FIXED\|STATIC\|CONST"
```

**Fix:**
```kotlin
// GOOD: Generate random IV for each encryption
fun encrypt(data: String): Pair<String, ByteArray> {
    cipher.init(Cipher.ENCRYPT_MODE, key)
    val iv = cipher.iv
    val encrypted = cipher.doFinal(data.toByteArray())
    return Pair(Base64.encodeToString(encrypted, Base64.NO_WRAP), iv)
}
```

### 4. Missing Backup Exclusion

**Vulnerability:** Encrypted data included in Android backups.

**Detection:**
```bash
# Check AndroidManifest.xml for allowBackup
grep -i "allowBackup" app/src/main/AndroidManifest.xml

# Check for fullBackupContent rules
grep -i "fullBackupContent\|backupRules" app/src/main/AndroidManifest.xml
```

**Fix:**
```xml
<!-- In AndroidManifest.xml -->
<application
    android:allowBackup="false"
    android:fullBackupContent="@xml/backup_rules">

    <!-- OR in backup_rules.xml -->
    <exclude domain="file" path="datastore/"/>
    <exclude domain="sharedpref" path="secret_shared_prefs.xml"/>
</application>
```

### 5. Error Information Disclosure

**Vulnerability:** Sensitive data in error messages or logs.

**Example:**
```kotlin
// BAD: Logging encrypted data
try {
    val decrypted = decrypt(encryptedData)
    Log.e(TAG, "Decrypted data: $decrypted")  // Data leaked to logs
} catch (e: Exception) {
    Log.e(TAG, "Failed to decrypt: $encryptedData")  // Data leaked in error
}
```

**Detection:**
```bash
# Check for logging sensitive data
grep -r "Log\." app/src/ | grep -E "(token|key|password|credential)"
grep -r "printStackTrace" app/src/

# Monitor logs during runtime
adb logcat | grep -E "(token|password|key)"
```

**Fix:**
```kotlin
// GOOD: Sanitized error messages
try {
    val decrypted = decrypt(encryptedData)
    return decrypted
} catch (e: Exception) {
    Log.e(TAG, "Decryption failed for key: $keyName")
    throw SecureStorageException("Unable to access encrypted data", e)
}
```

---

## Frida Hooks for Testing Encrypted Storage

### Hook DataStore Read Operations

```javascript
// frida_hook_datastore.js
// Usage: frida -U -f com.example.app -l frida_hook_datastore.js

console.log("[*] Hooking DataStore read operations...");

Java.perform(function() {
    // Hook PreferenceDataStoreFactory.create()
    var PreferenceDataStoreFactory = Java.use("androidx.datastore.preferences.core.PreferenceDataStoreFactory");

    PreferenceDataStoreFactory.create.overload(
        'androidx.datastore.core.CorruptionHandler',
        'kotlin.collections.List',
        'kotlinx.coroutines.CoroutineScope',
        'kotlin.jvm.functions.Function0'
    ).implementation = function(corruptionHandler, migrations, scope, produceFile) {
        console.log("[+] DataStore.create() called");
        console.log("    produceFile: " + produceFile());
        return this.create(corruptionHandler, migrations, scope, produceFile);
    };

    // Hook DataStore.data Flow
    var DataStore = Java.use("androidx.datastore.core.DataStore");

    DataStore.data.implementation = function() {
        console.log("[+] DataStore.data accessed");
        return this.data();
    };

    // Hook Edit operations
    var PreferencesKt = Java.use("androidx.datastore.preferences.core.PreferencesKt");

    console.log("[*] Hooks installed successfully");
});
```

### Hook Keystore Operations

```javascript
// frida_hook_keystore.js
// Usage: frida -U -f com.example.app -l frida_hook_keystore.js

console.log("[*] Hooking Android Keystore operations...");

Java.perform(function() {
    // Hook Cipher.init()
    var Cipher = Java.use("javax.crypto.Cipher");

    Cipher.init.overload('int', 'java.security.Key').implementation = function(opmode, key) {
        console.log("[+] Cipher.init() called");
        console.log("    Opmode: " + (opmode == 1 ? "ENCRYPT" : opmode == 2 ? "DECRYPT" : "UNKNOWN"));
        console.log("    Key Algorithm: " + key.getAlgorithm());
        return this.init(opmode, key);
    };

    // Hook SecretKeyFactory
    var SecretKeyFactory = Java.use("javax.crypto.SecretKeyFactory");

    SecretKeyFactory.getInstance.overload('java.lang.String').implementation = function(algorithm) {
        console.log("[+] SecretKeyFactory.getInstance() called with: " + algorithm);
        return this.getInstance(algorithm);
    };

    // Hook KeyStore.getInstance()
    var KeyStore = Java.use("java.security.KeyStore");

    KeyStore.getInstance.overload('java.lang.String').implementation = function(type) {
        console.log("[+] KeyStore.getInstance() called with type: " + type);
        var ks = this.getInstance(type);

        // Hook KeyStore.load()
        ks.load.overload('java.security.KeyStore$LoadStoreParameter').implementation = function(param) {
            console.log("[+] KeyStore.load() called");
            return this.load(param);
        };

        return ks;
    };

    // Hook KeyGenerator.init()
    var KeyGenerator = Java.use("javax.crypto.KeyGenerator");

    KeyGenerator.init.overload('java.security.spec.AlgorithmParameterSpec').implementation = function(param) {
        console.log("[+] KeyGenerator.init() called");
        console.log("    KeySize: " + param.keySize);
        console.log("    BlockModes: " + Java.array('java.lang.String', param.blockModes).join(', '));
        console.log("    EncryptionPaddings: " + Java.array('java.lang.String', param.encryptionPaddings).join(', '));
        return this.init(param);
    };

    // Hook Cipher.doFinal()
    Cipher.doFinal.overload('[B').implementation = function(input) {
        var output = this.doFinal(input);
        console.log("[+] Cipher.doFinal() called");
        console.log("    Input length: " + input.length);
        console.log("    Output length: " + output.length);

        // Try to decode as UTF-8 for analysis
        try {
            var decoded = Java.use("java.lang.String").$new(output);
            console.log("    Decoded output (first 50 chars): " + decoded.substring(0, Math.min(50, decoded.length())));
        } catch(e) {
            // Likely encrypted, print hex
            var hex = "";
            for(var i = 0; i < Math.min(32, output.length); i++) {
                hex += ("0" + (output[i] & 0xFF).toString(16)).slice(-2) + " ";
            }
            console.log("    Hex output (first 16 bytes): " + hex);
        }

        return output;
    };

    console.log("[*] Keystore hooks installed successfully");
});
```

### Hook Migration Operations

```javascript
// frida_hook_migration.js
// Usage: frida -U -f com.example.app -l frida_hook_migration.js

console.log("[*] Hooking migration operations...");

Java.perform(function() {
    // Hook SharedPreferences.getAll()
    var SharedPreferences = Java.use("android.content.SharedPreferences");

    SharedPreferences.getAll.implementation = function() {
        console.log("[+] SharedPreferences.getAll() called during migration");
        var data = this.getAll();
        console.log("    Key count: " + data.size());

        // Log keys (but not values)
        var keys = data.keySet().toArray();
        console.log("    Keys: " + Java.array('java.lang.Object', keys).join(', '));

        return data;
    };

    // Hook SharedPreferences.getString()
    SharedPreferences.getString.implementation = function(key, defValue) {
        var value = this.getString(key, defValue);
        console.log("[+] SharedPreferences.getString() called");
        console.log("    Key: " + key);
        console.log("    Value length: " + (value !== null ? value.length() : 0));
        return value;
    };

    // Hook DataStore.edit()
    var PreferencesEditor = Java.use("androidx.datastore.preferences.core.MutablePreferences");

    PreferencesEditor.set.implementation = function(key, value) {
        console.log("[+] DataStore.set() called during migration");
        console.log("    Key: " + key.name());
        console.log("    Value type: " + (value !== null ? value.getClass().getName() : "null"));
        if (value !== null && typeof value == 'object' && value.toString) {
            console.log("    Value: " + value.toString());
        }
        return this.set(key, value);
    };

    console.log("[*] Migration hooks installed successfully");
});
```

### Comprehensive Data Extraction Script

```javascript
// frida_extract_storage.js
// Usage: frida -U -f com.example.app -l frida_extract_storage.js

console.log("[*] Android Storage Data Extractor");

Java.perform(function() {
    // Intercept and log all SharedPreferences reads
    var SharedPreferencesImpl = Java.use("android.app.SharedPreferencesImpl");

    SharedPreferencesImpl.getString.implementation = function(key, defValue) {
        var result = this.getString(key, defValue);
        console.log("\n[SharedPreferences] Read:");
        console.log("  Key: " + key);
        console.log("  Value: " + result);
        return result;
    };

    // Intercept DataStore Flow reads
    setTimeout(function() {
        try {
            var PreferencesKt = Java.use("androidx.datastore.preferences.core.PreferencesKt");
            console.log("[*] DataStore class found - attempting to hook Flow operations");
        } catch(e) {
            console.log("[!] DataStore class not found - app may not use DataStore");
        }
    }, 2000);

    // Hook file read/write operations
    var FileOutputStream = Java.use("java.io.FileOutputStream");
    var FileInputStream = Java.use("java.io.FileInputStream");

    FileOutputStream.$init.overload('java.io.File').implementation = function(file) {
        console.log("\n[File] Writing to: " + file.getAbsolutePath());
        return this.$init(file);
    };

    FileInputStream.$init.overload('java.io.File').implementation = function(file) {
        console.log("\n[File] Reading from: " + file.getAbsolutePath());
        var fis = this.$init(file);

        // Read and log small files
        if (file.length() < 4096) {
            try {
                var content = Java.use("java.nio.file").Files.readAllLines(file.toPath());
                console.log("  Content: " + content.join('\\n'));
            } catch(e) {
                // Binary file
            }
        }

        return fis;
    };

    // Hook Keystore key access
    var KeyStore = Java.use("java.security.KeyStore");

    KeyStore.getKey.implementation = function(alias) {
        console.log("\n[Keystore] Accessing key: " + alias);
        var key = this.getKey(alias, null);
        if (key !== null) {
            console.log("  Key Algorithm: " + key.getAlgorithm());
            console.log("  Key Format: " + key.getFormat());
        }
        return key;
    };

    console.log("[*] Storage extraction hooks installed");
    console.log("[*] Monitor logcat for captured data");
});
```

---

## References and URLs

### Official Documentation

- **Android DataStore**: https://developer.android.com/topic/libraries/architecture/datastore
- **Android Keystore System**: https://developer.android.com/privacy-and-security/keystore
- **Jetpack Security (Deprecated)**: https://developer.android.com/topic/security/data
- **Tink Cryptography Library**: https://github.com/tink-crypto/tink
- **Tink Android Integration**: https://github.com/tink-crypto/tink/tree/master/java/android
- **KeyGenParameterSpec**: https://developer.android.com/reference/android/security/keystore/KeyGenParameterSpec

### Deprecation Announcements

- **AndroidX Release Notes**: https://developer.android.com/jetpack/androidx/releases/security-crypto
- **JetSec Deprecation Discussion**: https://issuetracker.google.com/issues/322065596

### Security Resources

- **OWASP Mobile Security Testing Guide**: https://owasp.org/www-project-mobile-security-testing-guide/
- **Android Security Best Practices**: https://developer.android.com/privacy-and-security/best-practices
- **NIST Cryptographic Standards**: https://csrc.nist.gov/projects/cryptographic-standards-and-guidelines

### Pentesting Tools

- **Frida**: https://frida.re/
- **ADB Documentation**: https://developer.android.com/studio/command-line/adb
- **MobSF (Mobile Security Framework)**: https://github.com/MobSF/Mobile-Security-Framework-MobSF
- **Apktool**: https://ibotpeaches.github.io/Apktool/

### Example Projects

- **DataStore Samples**: https://github.com/android/architecture-samples
- **Tink Android Examples**: https://github.com/tink-crypto/tink-java
- **SecureStorage Patterns**: https://github.com/googlecodelabs/android-security-secure-storage

### Migration Guides

- **Migrating from SharedPreferences to DataStore**: https://developer.android.com/topic/libraries/architecture/datastore#migrate-from-sharedpreferences
- **Tink Migration Guide**: https://github.com/tink-crypto/tink/blob/master/docs/MIGRATION.md
- **Keystore Migration**: https://developer.android.com/privacy-and-security/keystore#migration

---

## Quick Reference Card

| Aspect | EncryptedSharedPreferences (Deprecated) | DataStore + Tink (Recommended) | Direct Keystore |
|--------|----------------------------------------|--------------------------------|-----------------|
| **API Type** | Synchronous | Asynchronous (Coroutines) | Synchronous |
| **Thread Safety** | Manual | Built-in | Manual |
| **Data Migration** | None | Built-in | Manual |
| **Key Rotation** | Manual | Supported | Manual |
| **Corruption Recovery** | None | Automatic | Manual |
| **Dependencies** | `androidx.security:security-crypto` | `androidx.datastore:datastore-tink` + Tink | None (built-in) |
| **Learning Curve** | Low | Medium | High |
| **Maintenance** | Deprecated (EOL 2026) | Active | Active |
| **Security** | Good | Excellent | Excellent (if implemented correctly) |

---

## Checklist for Pentesters

- [ ] Check for `EncryptedSharedPreferences` usage (grep)
- [ ] Verify migration to DataStore or Keystore
- [ ] Analyze key storage and rotation logic
- [ ] Review migration code for vulnerabilities
- [ ] Check `allowBackup` flag in manifest
- [ ] Extract and analyze storage files (adb pull)
- [ ] Test with Frida hooks for data leakage
- [ ] Verify encrypted data is not stored in plaintext
- [ ] Check for hardcoded keys or IVs
- [ ] Analyze error handling for information disclosure
- [ ] Test backup/restore functionality
- [ ] Verify cleanup of old storage after migration
- [ ] Check for temporary files with sensitive data
- [ ] Validate key sizes (AES256 vs AES128)
- [ ] Test key deletion on app uninstall

---

**Document Version:** 1.0
**Last Updated:** April 2026
**Maintainer:** Android Pentesting Skill Team
**License:** MIT License - See repository for details
