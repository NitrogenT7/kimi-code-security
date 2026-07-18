# Secure Storage Migration Guide Templates

This document contains ready-to-use migration templates for converting insecure storage patterns to secure alternatives.

---

## Template 1: SharedPreferences to EncryptedSharedPreferences

### Scenario
The app stores sensitive data (auth tokens, user info, API keys) in plain text SharedPreferences.

### Before (Vulnerable)
```java
SharedPreferences prefs = getSharedPreferences("user_data", Context.MODE_PRIVATE);
prefs.edit()
    .putString("auth_token", authToken)
    .putString("refresh_token", refreshToken)
    .putString("user_email", email)
    .putString("api_key", apiKey)
    .putString("session_id", sessionId)
    .apply();
```

### After (Secure)

**Step 1: Add dependency**
```groovy
// build.gradle (app)
dependencies {
    implementation 'androidx.security:security-crypto:1.1.0-alpha06'
}
```

**Step 2: Migration Template**

```java
import android.content.Context;
import android.content.SharedPreferences;
import androidx.security.crypto.EncryptedSharedPreferences;
import androidx.security.crypto.MasterKey;
import androidx.security.crypto.MasterKey.KeyScheme;
import java.io.IOException;
import java.security.GeneralSecurityException;

public class SecurePreferencesManager {
    
    private static final String PREF_FILE_NAME = "secure_user_data";
    private static final String KEY_AUTH_TOKEN = "auth_token";
    private static final String KEY_REFRESH_TOKEN = "refresh_token";
    private static final String KEY_USER_EMAIL = "user_email";
    private static final String KEY_API_KEY = "api_key";
    private static final String KEY_SESSION_ID = "session_id";
    
    private final EncryptedSharedPreferences encryptedPrefs;
    
    public SecurePreferencesManager(Context context) 
            throws GeneralSecurityException, IOException {
        
        MasterKey masterKey = new MasterKey.Builder(context)
            .setKeyScheme(KeyScheme.AES256_GCM)
            .build();
        
        encryptedPrefs = (EncryptedSharedPreferences) 
            EncryptedSharedPreferences.create(
                context,
                PREF_FILE_NAME,
                masterKey,
                EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
                EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
            );
    }
    
    // Auth Token
    public void setAuthToken(String token) {
        encryptedPrefs.edit().putString(KEY_AUTH_TOKEN, token).apply();
    }
    
    public String getAuthToken() {
        return encryptedPrefs.getString(KEY_AUTH_TOKEN, null);
    }
    
    // Refresh Token
    public void setRefreshToken(String token) {
        encryptedPrefs.edit().putString(KEY_REFRESH_TOKEN, token).apply();
    }
    
    public String getRefreshToken() {
        return encryptedPrefs.getString(KEY_REFRESH_TOKEN, null);
    }
    
    // User Email
    public void setUserEmail(String email) {
        encryptedPrefs.edit().putString(KEY_USER_EMAIL, email).apply();
    }
    
    public String getUserEmail() {
        return encryptedPrefs.getString(KEY_USER_EMAIL, null);
    }
    
    // API Key
    public void setApiKey(String apiKey) {
        encryptedPrefs.edit().putString(KEY_API_KEY, apiKey).apply();
    }
    
    public String getApiKey() {
        return encryptedPrefs.getString(KEY_API_KEY, null);
    }
    
    // Session ID
    public void setSessionId(String sessionId) {
        encryptedPrefs.edit().putString(KEY_SESSION_ID, sessionId).apply();
    }
    
    public String getSessionId() {
        return encryptedPrefs.getString(KEY_SESSION_ID, null);
    }
    
    // Clear all
    public void clearAll() {
        encryptedPrefs.edit().clear().apply();
    }
    
    // Migration helper (one-time use)
    public void migrateFromLegacyPreferences(
            SharedPreferences legacyPrefs) {
        
        String authToken = legacyPrefs.getString(KEY_AUTH_TOKEN, null);
        if (authToken != null) {
            setAuthToken(authToken);
        }
        
        String refreshToken = legacyPrefs.getString(KEY_REFRESH_TOKEN, null);
        if (refreshToken != null) {
            setRefreshToken(refreshToken);
        }
        
        String userEmail = legacyPrefs.getString(KEY_USER_EMAIL, null);
        if (userEmail != null) {
            setUserEmail(userEmail);
        }
        
        String apiKey = legacyPrefs.getString(KEY_API_KEY, null);
        if (apiKey != null) {
            setApiKey(apiKey);
        }
        
        String sessionId = legacyPrefs.getString(KEY_SESSION_ID, null);
        if (sessionId != null) {
            setSessionId(sessionId);
        }
        
        // Clear legacy after migration
        legacyPrefs.edit().clear().apply();
    }
}
```

**Step 3: Usage**

```java
// Initialize
SecurePreferencesManager securePrefs;
try {
    securePrefs = new SecurePreferencesManager(context);
} catch (GeneralSecurityException | IOException e) {
    // Handle error - consider forcing re-login
    Log.e(TAG, "Failed to initialize secure storage", e);
    return;
}

// Store data
securePrefs.setAuthToken("Bearer eyJhbGciOiJIUzI1NiIs...");
securePrefs.setUserEmail("user@example.com");

// Retrieve data
String token = securePrefs.getAuthToken();
String email = securePrefs.getUserEmail();

// Migrate from legacy (one-time)
SharedPreferences legacy = 
    context.getSharedPreferences("user_data", Context.MODE_PRIVATE);
securePrefs.migrateFromLegacyPreferences(legacy);
```

---

## Template 2: Database Encryption with SQLCipher

### Scenario
App uses SQLite database for storing sensitive data.

### Before (Vulnerable)
```java
SQLiteDatabase db = openOrCreateDatabase("app_data.db", MODE_PRIVATE, null);
db.execSQL("CREATE TABLE IF NOT EXISTS users " +
    "(id INTEGER PRIMARY KEY, name TEXT, email TEXT, password TEXT)");
db.execSQL("INSERT INTO users VALUES (1, 'John', 'john@example.com', 'secret123')");
```

### After (Secure)

**Step 1: Add dependency**
```groovy
dependencies {
    implementation 'net.zetetic:android-database-sqlcipher:4.5.4'
    implementation 'androidx.sqlite:sqlite:2.2.0'
}
```

**Step 2: Secure Database Helper**

```java
import android.content.Context;
import android.database.sqlite.SQLiteDatabase;
import android.database.sqlite.SQLiteOpenHelper;
import net.sqlcipher.database.SQLiteDatabase;
import net.sqlcipher.database.SQLiteOpenHelper;
import net.sqlcipher.database.SQLiteStatement;
import java.security.SecureRandom;

public class SecureDatabaseHelper extends SQLiteOpenHelper {
    
    private static final String DATABASE_NAME = "secure_app.db";
    private static final int DATABASE_VERSION = 1;
    
    private static final String TABLE_USERS = "users";
    private static final String COL_ID = "id";
    private static final String COL_NAME = "name";
    private static final String COL_EMAIL = "email";
    private static final String COL_PASSWORD_HASH = "password_hash";
    
    private static volatile char[] databasePassword;
    
    public SecureDatabaseHelper(Context context) {
        super(context, DATABASE_NAME, null, DATABASE_VERSION);
        initDatabasePassword(context);
    }
    
    private void initDatabasePassword(Context context) {
        if (databasePassword == null) {
            synchronized (this) {
                if (databasePassword == null) {
                    // Try to get password from Keystore first
                    databasePassword = getOrCreateDatabasePassword(context);
                }
            }
        }
        SQLiteDatabase.loadLibs(context);
    }
    
    private char[] getOrCreateDatabasePassword(Context context) {
        // Implementation would retrieve from Android Keystore
        // This is a simplified version
        SharedPreferences prefs = 
            context.getSharedPreferences("db_key_store", Context.MODE_PRIVATE);
        String storedPassword = prefs.getString("db_password", null);
        
        if (storedPassword == null) {
            // Generate new password
            storedPassword = generateSecurePassword();
            prefs.edit().putString("db_password", storedPassword).apply();
        }
        
        return storedPassword.toCharArray();
    }
    
    private String generateSecurePassword() {
        SecureRandom random = new SecureRandom();
        byte[] bytes = new byte[32];
        random.nextBytes(bytes);
        return Base64.encodeToString(bytes, Base64.NO_WRAP);
    }
    
    @Override
    public void onCreate(SQLiteDatabase db) {
        db.execSQL("CREATE TABLE IF NOT EXISTS " + TABLE_USERS + " (" +
            COL_ID + " INTEGER PRIMARY KEY AUTOINCREMENT, " +
            COL_NAME + " TEXT, " +
            COL_EMAIL + " TEXT, " +
            COL_PASSWORD_HASH + " TEXT)" +
        ");");
    }
    
    @Override
    public void onUpgrade(SQLiteDatabase db, int oldVersion, int newVersion) {
        // Handle migrations securely
    }
    
    // Secure insert
    public long insertUser(String name, String email, String passwordHash) {
        SQLiteDatabase db = getWritableDatabase(databasePassword);
        
        String sql = "INSERT INTO " + TABLE_USERS + 
            " (" + COL_NAME + ", " + COL_EMAIL + ", " + COL_PASSWORD_HASH + 
            ") VALUES (?, ?, ?)";
        
        SQLiteStatement statement = db.compileStatement(sql);
        statement.bindString(1, name);
        statement.bindString(2, email);
        statement.bindString(3, passwordHash);
        
        long id = statement.executeInsert();
        statement.close();
        return id;
    }
    
    // Secure query
    public Cursor getUserByEmail(String email) {
        SQLiteDatabase db = getReadableDatabase(databasePassword);
        return db.query(
            TABLE_USERS,
            null,
            COL_EMAIL + " = ?",
            new String[]{email},
            null, null, null
        );
    }
}
```

---

## Template 3: File Encryption with Android Keystore

### Scenario
App stores sensitive files (documents, images, cached data) without encryption.

### Before (Vulnerable)
```java
File file = new File(context.getFilesDir(), "sensitive_data.txt");
FileOutputStream fos = new FileOutputStream(file);
fos.write("Secret data".getBytes());
fos.close();
```

### After (Secure)

```java
import android.content.Context;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.security.KeyStore;
import java.nio.ByteBuffer;

public class SecureFileManager {
    
    private static final String KEYSTORE_ALIAS = "SecureFileKey";
    private static final String ANDROID_KEYSTORE = "AndroidKeyStore";
    private static final String TRANSFORMATION = "AES/GCM/NoPadding";
    private static final int GCM_TAG_LENGTH = 128;
    
    private final Context context;
    
    public SecureFileManager(Context context) {
        this.context = context;
        createKeyIfNeeded();
    }
    
    private void createKeyIfNeeded() {
        try {
            KeyStore keyStore = KeyStore.getInstance(ANDROID_KEYSTORE);
            keyStore.load(null);
            
            if (!keyStore.containsAlias(KEYSTORE_ALIAS)) {
                KeyGenerator keyGenerator = KeyGenerator.getInstance(
                    KeyProperties.KEY_ALGORITHM_AES, ANDROID_KEYSTORE);
                
                keyGenerator.init(new KeyGenParameterSpec.Builder(
                    KEYSTORE_ALIAS,
                    KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                    .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                    .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                    .setKeySize(256)
                    .build());
                
                keyGenerator.generateKey();
            }
        } catch (Exception e) {
            throw new SecurityException("Failed to create encryption key", e);
        }
    }
    
    private SecretKey getSecretKey() throws Exception {
        KeyStore keyStore = KeyStore.getInstance(ANDROID_KEYSTORE);
        keyStore.load(null);
        return (SecretKey) keyStore.getKey(KEYSTORE_ALIAS, null);
    }
    
    public void encryptAndSaveFile(String filename, byte[] plaintext) 
            throws Exception {
        
        SecretKey key = getSecretKey();
        Cipher cipher = Cipher.getInstance(TRANSFORMATION);
        cipher.init(Cipher.ENCRYPT_MODE, key);
        
        byte[] iv = cipher.getIV();
        byte[] ciphertext = cipher.doFinal(plaintext);
        
        // Store as: [4 bytes IV length][IV][ciphertext]
        ByteBuffer buffer = ByteBuffer.allocate(
            4 + iv.length + ciphertext.length);
        buffer.putInt(iv.length);
        buffer.put(iv);
        buffer.put(ciphertext);
        
        File file = new File(context.getFilesDir(), filename);
        try (FileOutputStream fos = new FileOutputStream(file)) {
            fos.write(buffer.array());
        }
    }
    
    public byte[] loadAndDecryptFile(String filename) throws Exception {
        File file = new File(context.getFilesDir(), filename);
        if (!file.exists()) {
            return null;
        }
        
        byte[] fileContent;
        try (FileInputStream fis = new FileInputStream(file);
             ByteArrayOutputStream baos = new ByteArrayOutputStream()) {
            
            byte[] buffer = new byte[4096];
            int bytesRead;
            while ((bytesRead = fis.read(buffer)) != -1) {
                baos.write(buffer, 0, bytesRead);
            }
            fileContent = baos.toByteArray();
        }
        
        ByteBuffer buffer = ByteBuffer.wrap(fileContent);
        
        int ivLength = buffer.getInt();
        byte[] iv = new byte[ivLength];
        buffer.get(iv);
        byte[] ciphertext = new byte[buffer.remaining()];
        buffer.get(ciphertext);
        
        SecretKey key = getSecretKey();
        Cipher cipher = Cipher.getInstance(TRANSFORMATION);
        cipher.init(Cipher.DECRYPT_MODE, key, new GCMParameterSpec(GCM_TAG_LENGTH, iv));
        
        return cipher.doFinal(ciphertext);
    }
    
    public void encryptAndSaveFile(String filename, String plaintext) 
            throws Exception {
        encryptAndSaveFile(filename, plaintext.getBytes("UTF-8"));
    }
    
    public String loadAndDecryptFileAsString(String filename) throws Exception {
        byte[] decrypted = loadAndDecryptFile(filename);
        return decrypted != null ? new String(decrypted, "UTF-8") : null;
    }
    
    public void deleteSecureFile(String filename) {
        File file = new File(context.getFilesDir(), filename);
        if (file.exists()) {
            file.delete();
        }
    }
}
```

**Usage:**

```java
SecureFileManager fileManager = new SecureFileManager(context);

// Save sensitive data
try {
    fileManager.encryptAndSaveFile("secret.txt", "This is confidential");
    
    String data = fileManager.loadAndDecryptFileAsString("secret.txt");
    Log.d(TAG, "Loaded: " + data);
    
} catch (Exception e) {
    Log.e(TAG, "File operation failed", e);
}
```

---

## Template 4: Migration Utility (One-Time)

Use this utility to migrate existing data from insecure to secure storage:

```java
public class StorageMigrationUtility {
    
    private final Context context;
    private final SharedPreferences legacyPrefs;
    private final SecurePreferencesManager securePrefs;
    
    public StorageMigrationUtility(Context context) 
            throws GeneralSecurityException, IOException {
        this.context = context;
        this.legacyPrefs = context.getSharedPreferences(
            "legacy_app_data", Context.MODE_PRIVATE);
        this.securePrefs = new SecurePreferencesManager(context);
    }
    
    public MigrationResult migrateAll() {
        MigrationResult result = new MigrationResult();
        
        // Track what we've migrated
        Set<String> migratedKeys = new HashSet<>();
        
        // Auth token
        String authToken = legacyPrefs.getString("auth_token", null);
        if (authToken != null && !authToken.isEmpty()) {
            securePrefs.setAuthToken(authToken);
            migratedKeys.add("auth_token");
            result.authTokenMigrated = true;
        }
        
        // Refresh token
        String refreshToken = legacyPrefs.getString("refresh_token", null);
        if (refreshToken != null && !refreshToken.isEmpty()) {
            securePrefs.setRefreshToken(refreshToken);
            migratedKeys.add("refresh_token");
            result.refreshTokenMigrated = true;
        }
        
        // User email
        String email = legacyPrefs.getString("user_email", null);
        if (email != null && !email.isEmpty()) {
            securePrefs.setUserEmail(email);
            migratedKeys.add("user_email");
            result.emailMigrated = true;
        }
        
        // API key
        String apiKey = legacyPrefs.getString("api_key", null);
        if (apiKey != null && !apiKey.isEmpty()) {
            securePrefs.setApiKey(apiKey);
            migratedKeys.add("api_key");
            result.apiKeyMigrated = true;
        }
        
        // Session ID
        String sessionId = legacyPrefs.getString("session_id", null);
        if (sessionId != null && !sessionId.isEmpty()) {
            securePrefs.setSessionId(sessionId);
            migratedKeys.add("session_id");
            result.sessionIdMigrated = true;
        }
        
        // Clear legacy only after successful migration
        if (result.hasAnyMigration()) {
            // Clear legacy preferences
            legacyPrefs.edit().clear().apply();
            result.legacyCleared = true;
        }
        
        return result;
    }
    
    public static class MigrationResult {
        public boolean authTokenMigrated = false;
        public boolean refreshTokenMigrated = false;
        public boolean emailMigrated = false;
        public boolean apiKeyMigrated = false;
        public boolean sessionIdMigrated = false;
        public boolean legacyCleared = false;
        
        public boolean hasAnyMigration() {
            return authTokenMigrated || refreshTokenMigrated || 
                   emailMigrated || apiKeyMigrated || sessionIdMigrated;
        }
        
        public int getMigratedCount() {
            int count = 0;
            if (authTokenMigrated) count++;
            if (refreshTokenMigrated) count++;
            if (emailMigrated) count++;
            if (apiKeyMigrated) count++;
            if (sessionIdMigrated) count++;
            return count;
        }
    }
}
```

---

## Checklist for Storage Migration

- [ ] Identify all SharedPreferences usage
- [ ] Identify all file storage locations
- [ ] Identify all database usage
- [ ] Add security-crypto dependency
- [ ] Add SQLCipher dependency (if using database)
- [ ] Create SecurePreferencesManager class
- [ ] Create SecureDatabaseHelper class (if using database)
- [ ] Create SecureFileManager class
- [ ] Implement one-time migration utility
- [ ] Test migration on development build
- [ ] Verify legacy data is cleared after migration
- [ ] Verify encrypted data can be read on fresh install
- [ ] Test on rooted device to verify encryption
- [ ] Monitor crash reporting for encryption errors
- [ ] Update backup/restore logic for new storage
- [ ] Document new storage patterns for team

---

## References

- [EncryptedSharedPreferences Documentation](https://developer.android.com/reference/androidx/security/crypto/EncryptedSharedPreferences)
- [Android Keystore System](https://developer.android.com/training/articles/keystore)
- [SQLCipher for Android](https://github.com/sqlcipher/android-database-sqlcipher)
- [Security Best Practices](https://developer.android.com/training/articles/security-tips)
- [OWASP Mobile Security Guide](https://github.com/OWASP/owasp-mstg)
