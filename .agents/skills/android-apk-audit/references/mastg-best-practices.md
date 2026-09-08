# OWASP MASTG Best Practices for Android

Essential security best practices from OWASP MASTG. These complement the test checklist with implementation guidance.

---

## 1. Secure Storage

### 1.1 EncryptedSharedPreferences - DEPRECATED

> ⚠️ **DEPRECATION WARNING (April 2025)**: The `androidx.security:security-crypto` library, including `EncryptedSharedPreferences` and `MasterKey`, has been **officially deprecated**.
>
> **Reason**: Performance issues, reliability concerns, and architectural limitations.
>
> **Recommended Alternatives**:
> - **Option 1**: Android KeyStore + EncryptedFile (direct encryption)
> - **Option 2**: Google Tink library for cryptographic operations
> - **Option 3**: Jetpack DataStore with custom encryption layer
>
> See the "Modern Secure Storage Alternatives" section below for migration guidance.

#### Legacy Implementation (DEPRECATED)

```java
// ⚠️ DEPRECATED: Do NOT use in new code
// This approach uses the deprecated androidx.security:security-crypto library
// BAD: Plaintext SharedPreferences
SharedPreferences prefs = context.getSharedPreferences("secrets", Context.MODE_PRIVATE);
prefs.edit().putString("password", password).apply();

// ⚠️ DEPRECATED: EncryptedSharedPreferences
MasterKey masterKey = new MasterKey.Builder(context)
    .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
    .build();

SharedPreferences encryptedPrefs = EncryptedSharedPreferences.create(
    context,
    "secret_prefs",
    masterKey,
    EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
    EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
);
encryptedPrefs.edit().putString("password", password).apply();
```

#### Modern Secure Storage Alternatives

**Option 1: Android KeyStore + EncryptedFile**

```java
// GOOD: Modern approach using EncryptedFile
private void saveSecret(Context context, String secret) throws Exception {
    // Generate or retrieve key from KeyStore
    KeyGenerator keyGenerator = KeyGenerator.getInstance(
        KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
    keyGenerator.init(
        new KeyGenParameterSpec.Builder("secret_file_key",
            KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
            .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
            .build());
    SecretKey key = keyGenerator.generateKey();

    // Create EncryptedFile
    File file = new File(context.getFilesDir(), "secret.dat");
    EncryptedFile encryptedFile = EncryptedFile.Builder(
        file,
        context,
        "secret_file_key",
        EncryptedFile.FileEncryptionScheme.AES256_GCM_HKDF_4KB
    ).build();

    // Write encrypted data
    FileOutputStream fos = encryptedFile.openFileOutput();
    fos.write(secret.getBytes());
    fos.close();
}

private String readSecret(Context context) throws Exception {
    File file = new File(context.getFilesDir(), "secret.dat");
    EncryptedFile encryptedFile = EncryptedFile.Builder(
        file,
        context,
        "secret_file_key",
        EncryptedFile.FileEncryptionScheme.AES256_GCM_HKDF_4KB
    ).build();

    FileInputStream fis = encryptedFile.openFileInput();
    ByteArrayOutputStream baos = new ByteArrayOutputStream();
    byte[] buffer = new byte[1024];
    int bytesRead;
    while ((bytesRead = fis.read(buffer)) != -1) {
        baos.write(buffer, 0, bytesRead);
    }
    fis.close();
    return baos.toString();
}
```

**Option 2: Google Tink**

```java
// Add dependency: implementation 'com.google.crypto.tink:tink-android:1.13.0'

// GOOD: Use Tink for modern cryptographic operations
import com.google.crypto.tink.Aead;
import com.google.crypto.tink.KeyTemplates;
import com.google.crypto.tink.aead.AeadConfig;

public class SecureStorage {
    private Aead aead;

    public SecureStorage(Context context) throws Exception {
        // Initialize Tink
        AeadConfig.register();
        aead = new AeadFactory().getPrimitive(KeyTemplates.getAes256Gcm());
    }

    public String encrypt(String plaintext) throws Exception {
        byte[] ciphertext = aead.encrypt(plaintext.getBytes(), null);
        return Base64.encodeToString(ciphertext, Base64.DEFAULT);
    }

    public String decrypt(String ciphertext) throws Exception {
        byte[] decoded = Base64.decode(ciphertext, Base64.DEFAULT);
        byte[] plaintext = aead.decrypt(decoded, null);
        return new String(plaintext);
    }
}
```

**Option 3: Jetpack DataStore with Custom Encryption**

```java
// Add dependencies:
// implementation 'androidx.datastore:datastore-preferences:1.0.0'
// implementation 'com.google.crypto.tink:tink-android:1.13.0'

// GOOD: DataStore with Tink encryption layer
public class EncryptedDataStore {
    private DataStore<Preferences> dataStore;
    private Aead aead;

    public EncryptedDataStore(Context context) throws Exception {
        dataStore = new PreferenceDataStoreFactory.Builder(context)
            .setName("encrypted_prefs")
            .build()
            .create(PreferencesSerializer.getInstance());

        AeadConfig.register();
        aead = new AeadFactory().getPrimitive(KeyTemplates.getAes256Gcm());
    }

    public void saveString(String key, String value) throws Exception {
        String encrypted = Base64.encodeToString(
            aead.encrypt(value.getBytes(), null),
            Base64.DEFAULT
        );

        dataStore.updateDataAsync(prefs -> {
            prefs[stringKey(key)] = encrypted;
            return prefs;
        });
    }

    public String getString(String key, String defaultValue) throws Exception {
        Preferences prefs = dataStore.getData().blockingFirst();
        String encrypted = prefs.get(stringKey(key));

        if (encrypted != null) {
            byte[] decrypted = aead.decrypt(
                Base64.decode(encrypted, Base64.DEFAULT),
                null
            );
            return new String(decrypted);
        }
        return defaultValue;
    }
}
```

```java
// BAD: Plaintext SharedPreferences
SharedPreferences prefs = context.getSharedPreferences("secrets", Context.MODE_PRIVATE);
prefs.edit().putString("password", password).apply();

// GOOD: EncryptedSharedPreferences
MasterKey masterKey = new MasterKey.Builder(context)
    .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
    .build();

SharedPreferences encryptedPrefs = EncryptedSharedPreferences.create(
    context,
    "secret_prefs",
    masterKey,
    EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
    EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
);
encryptedPrefs.edit().putString("password", password).apply();
```

### 1.2 Use SQLCipher for Databases

```java
// BAD: Plaintext SQLite
SQLiteDatabase db = openOrCreateDatabase("secrets.db", MODE_PRIVATE, null);

// GOOD: SQLCipher
SQLiteDatabase.loadLibs(context);
SQLiteDatabase db = SQLiteDatabase.openOrCreateDatabase(
    databaseFile,
    encryptionKey,
    null
);
```

### 1.3 Exclude Sensitive Data from Backups

```xml
<!-- AndroidManifest.xml -->
<application android:allowBackup="true"
             android:fullBackupContent="@xml/backup_rules">
```

```xml
<!-- res/xml/backup_rules.xml -->
<full-backup-content>
    <exclude domain="sharedpref" path="secrets.xml"/>
    <exclude domain="database" path="secrets.db"/>
    <exclude domain="file" path="tokens/"/>
</full-backup-content>
```

---

## 2. Cryptography

### 2.1 Use AndroidKeyStore for Key Storage

```java
// BAD: Hardcoded key
byte[] key = "1234567890123456".getBytes();

// GOOD: AndroidKeyStore
KeyGenerator keyGenerator = KeyGenerator.getInstance(
    KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
keyGenerator.init(
    new KeyGenParameterSpec.Builder("my_key_alias",
        KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
        .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
        .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
        .setRandomizedEncryptionRequired(true)
        .build());
SecretKey key = keyGenerator.generateKey();
```

### 2.2 Use SecureRandom for Cryptography

```java
// BAD: Insecure random for crypto
Random random = new Random();
byte[] iv = new byte[16];
random.nextBytes(iv);  // Predictable!

// GOOD: SecureRandom
SecureRandom random = new SecureRandom();
byte[] iv = new byte[16];
random.nextBytes(iv);  // Cryptographically secure
```

### 2.3 Never Use ECB Mode

```java
// BAD: ECB mode (same plaintext = same ciphertext)
Cipher cipher = Cipher.getInstance("AES/ECB/PKCS5Padding");

// GOOD: GCM mode (authenticated encryption, randomized)
Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
```

### 2.4 Never Reuse IV/Nonce

```java
// BAD: Static IV
byte[] iv = "123456789012".getBytes();
GCMParameterSpec spec = new GCMParameterSpec(128, iv);

// GOOD: Random IV per encryption
byte[] iv = new byte[12];
new SecureRandom().nextBytes(iv);
GCMParameterSpec spec = new GCMParameterSpec(128, iv);
```

---

## 3. Authentication

### 3.1 Use BiometricPrompt (API 28+)

```java
// BAD: Deprecated FingerprintManager
FingerprintManager fingerprintManager =
    (FingerprintManager) getSystemService(FINGERPRINT_SERVICE);

// GOOD: BiometricPrompt
Executor executor = ContextCompat.getMainExecutor(this);
BiometricPrompt biometricPrompt = new BiometricPrompt(this, executor,
    new BiometricPrompt.AuthenticationCallback() {
        @Override
        public void onAuthenticationSucceeded(BiometricPrompt.AuthenticationResult result) {
            // Authentication succeeded
            // Use result.getCryptoObject() for cryptographic operations
        }
    });

BiometricPrompt.PromptInfo promptInfo = new BiometricPrompt.PromptInfo.Builder()
    .setTitle("Authentication Required")
    .setSubtitle("Use biometric to continue")
    .setNegativeButtonText("Cancel")
    .build();

biometricPrompt.authenticate(promptInfo);
```

### 3.2 Bind Biometric to Crypto Operation

```java
// BAD: UI-only biometric check (can be bypassed with Frida)
if (biometricAuthenticated) {
    showSensitiveData();  // Bypassable!
}

// GOOD: Bind to KeyStore crypto operation
KeyStore keyStore = KeyStore.getInstance("AndroidKeyStore");
keyStore.load(null);
SecretKey key = (SecretKey) keyStore.getKey("auth_key", null);

Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
cipher.init(Cipher.DECRYPT_MODE, key);

BiometricPrompt.CryptoObject cryptoObject = new BiometricPrompt.CryptoObject(cipher);
biometricPrompt.authenticate(promptInfo, cryptoObject);

// In onAuthenticationSucceeded:
Cipher decryptedCipher = result.getCryptoObject().getCipher();
// Now perform the protected operation
```

### 3.3 Enforce Strong Authentication Level

```java
// Require Class 3 (Strong) biometric, not Class 1 (Weak) or Class 2
BiometricPrompt.PromptInfo promptInfo = new BiometricPrompt.PromptInfo.Builder()
    .setTitle("Authentication Required")
    .setAllowedAuthenticators(BiometricManager.Authenticators.BIOMETRIC_STRONG)
    .setNegativeButtonText("Use PIN")
    .build();
```

---

## 4. Network Security

### 4.1 Use NetworkSecurityConfig (API 24+)

```xml
<!-- res/xml/network_security_config.xml -->
<network-security-config>
    <!-- Default: HTTPS only -->
    <base-config cleartextTrafficPermitted="false">
        <trust-anchors>
            <certificates src="system"/>
        </trust-anchors>
    </base-config>

    <!-- Specific domain with certificate pinning -->
    <domain-config>
        <domain includeSubdomains="true">api.example.com</domain>
        <pin-set expiration="2025-12-31">
            <pin digest="SHA-256">7HIpactkIAq2Y49orFOOQKurWxmmSFZhBCoQYcRhJ3Y=</pin>
            <pin digest="SHA-256">fwza0LRMXouZHUG8fSd1dce45LB745Y025L7frp+KxE=</pin> <!-- Backup -->
        </pin-set>
    </domain-config>
</network-security-config>
```

### 4.2 Implement Certificate Pinning

```java
// OkHttp Certificate Pinning
CertificatePinner certificatePinner = new CertificatePinner.Builder()
    .add("api.example.com", "sha256/7HIpactkIAq2Y49orFOOQKurWxmmSFZhBCoQYcRhJ3Y=")
    .add("api.example.com", "sha256/fwza0LRMXouZHUG8fSd1dce45LB745Y025L7frp+KxE=")
    .build();

OkHttpClient client = new OkHttpClient.Builder()
    .certificatePinner(certificatePinner)
    .build();
```

### 4.3 Verify Hostname

```java
// BAD: Accept all hostnames
OkHttpClient client = new OkHttpClient.Builder()
    .hostnameVerifier((hostname, session) -> true)  // NEVER DO THIS
    .build();

// GOOD: Verify hostname
OkHttpClient client = new OkHttpClient.Builder()
    .hostnameVerifier((hostname, session) -> {
        // Strict hostname verification
        return HttpsURLConnection.getDefaultHostnameVerifier()
            .verify(hostname, session);
    })
    .build();
```

---

## 5. WebView Security

### 5.1 Disable JavaScript Unless Required

```java
// BAD: JavaScript enabled by default
webView.getSettings().setJavaScriptEnabled(true);

// GOOD: Enable only when needed, with validation
if (shouldLoadTrustedContent()) {
    webView.getSettings().setJavaScriptEnabled(true);
}
```

### 5.2 Restrict File Access

```java
// BAD: File access enabled
webView.getSettings().setAllowFileAccess(true);
webView.getSettings().setAllowUniversalAccessFromFileURLs(true);

// GOOD: Disable file access for untrusted content
webView.getSettings().setAllowFileAccess(false);
webView.getSettings().setAllowFileAccessFromFileURLs(false);
webView.getSettings().setAllowUniversalAccessFromFileURLs(false);
webView.getSettings().setAllowContentAccess(false);
```

### 5.3 Use JavaScript Interface Safely (API 17+)

```java
// API < 17: RCE vulnerability! Do NOT use addJavascriptInterface
// API 17+: Only methods with @JavascriptInterface annotation are exposed

public class SafeJsInterface {
    @JavascriptInterface  // Only this can be called from JS
    public String getSafeData() {
        return "Sanitized data";
    }

    // This method is NOT exposed to JavaScript
    public String getSensitiveData() {
        return "Secret";
    }
}

webView.addJavascriptInterface(new SafeJsInterface(), "AndroidInterface");
```

### 5.4 Validate WebView URLs

```java
// BAD: Load any URL from intent
String url = getIntent().getStringExtra("url");
webView.loadUrl(url);

// GOOD: Validate URL whitelist
String url = getIntent().getStringExtra("url");
if (isValidUrl(url)) {
    webView.loadUrl(url);
} else {
    Log.w(TAG, "Blocked invalid URL: " + url);
}

private boolean isValidUrl(String url) {
    if (url == null) return false;
    Uri uri = Uri.parse(url);
    return "https".equals(uri.getScheme()) &&
           uri.getHost() != null &&
           uri.getHost().endsWith(".example.com");
}
```

---

## 6. Platform Security

### 6.1 Secure Intent Handling

```java
// BAD: Forward untrusted intent
@Override
protected void onNewIntent(Intent intent) {
    startActivity(new Intent(intent));  // Intent redirection!
}

// GOOD: Create new trusted intent
@Override
protected void onNewIntent(Intent intent) {
    Intent safeIntent = new Intent(this, TargetActivity.class);
    safeIntent.putExtra("validated_data", validateData(intent.getStringExtra("data")));
    startActivity(safeIntent);
}
```

### 6.2 Validate Deep Link Parameters

```java
// BAD: Use deep link parameters directly
String url = getIntent().getData().getQueryParameter("url");
webView.loadUrl(url);

// GOOD: Validate parameters
Uri uri = getIntent().getData();
if (uri != null) {
    String url = uri.getQueryParameter("url");
    if (url != null && isUrlInWhitelist(url)) {
        webView.loadUrl(url);
    }
}
```

### 6.3 Secure Content Provider

```java
@Override
public ParcelFileDescriptor openFile(Uri uri, String mode) {
    String path = uri.getLastPathSegment();

    // BAD: No validation
    File file = new File(getContext().getFilesDir(), path);

    // GOOD: Validate path
    File file = new File(getContext().getFilesDir(), path);
    try {
        String canonicalPath = file.getCanonicalPath();
        if (!canonicalPath.startsWith(getContext().getFilesDir().getCanonicalPath())) {
            throw new SecurityException("Path traversal attempt");
        }
    } catch (IOException e) {
        throw new SecurityException("Invalid path");
    }

    return ParcelFileDescriptor.open(file, ParcelFileDescriptor.MODE_READ_ONLY);
}
```

### 6.4 Use PendingIntent Correctly (API 31+)

```java
// BAD: Mutable PendingIntent (security risk)
PendingIntent pendingIntent = PendingIntent.getActivity(
    context, 0, new Intent("ACTION"), 0);

// BAD: Mutable with fillIn
PendingIntent pendingIntent = PendingIntent.getActivity(
    context, 0, new Intent("ACTION"), PendingIntent.FLAG_UPDATE_CURRENT);

// GOOD: Immutable PendingIntent (API 31+)
PendingIntent pendingIntent = PendingIntent.getActivity(
    context, 0, new Intent("ACTION"), PendingIntent.FLAG_IMMUTABLE);
```

---

## 7. Logging

### 7.1 Strip Debug Logging in Release

```gradle
// build.gradle
buildTypes {
    release {
        minifyEnabled true
        shrinkResources true
        proguardFiles getDefaultProguardFile('proguard-android-optimize.txt'), 'proguard-rules.pro'
    }
}
```

```proguard
# proguard-rules.pro
-assumenosideeffects class android.util.Log {
    public static int v(...);
    public static int d(...);
    public static int i(...);
    public static int w(...);
    public static int e(...);
}
```

### 7.2 Remove Sensitive Data from Logs

```java
// BAD: Log sensitive data
Log.d("Auth", "User login: " + username + ":" + password);

// GOOD: Log only non-sensitive info
Log.d("Auth", "User login attempt for user: [REDACTED]");

// Or use BuildConfig
if (BuildConfig.DEBUG) {
    Log.d("Auth", "Debug info only");
}
```

---

## 8. Input Validation

### 8.1 Validate Intent Extras

```java
// BAD: Trust all extras
String data = getIntent().getStringExtra("data");

// GOOD: Validate bounds and content
String data = getIntent().getStringExtra("data");
if (data != null) {
    if (data.length() > MAX_LENGTH) {
        throw new SecurityException("Data too long");
    }
    if (!data.matches("[a-zA-Z0-9]+")) {
        throw new SecurityException("Invalid characters");
    }
    // Use validated data
}
```

### 8.2 Sanitize SQL Queries

```java
// BAD: String concatenation
String query = "SELECT * FROM users WHERE name = '" + input + "'";

// GOOD: Parameterized query
String query = "SELECT * FROM users WHERE name = ?";
Cursor cursor = db.rawQuery(query, new String[]{input});

// Even better: Use query() method
Cursor cursor = db.query("users", null, "name = ?", new String[]{input}, null, null, null);
```

---

## 9. Anti-Tampering

### 9.1 Verify App Signature

```java
public static boolean verifySignature(Context context) {
    try {
        PackageInfo packageInfo = context.getPackageManager()
            .getPackageInfo(context.getPackageName(), PackageManager.GET_SIGNATURES);

        for (Signature signature : packageInfo.signatures) {
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            byte[] signatureBytes = md.digest(signature.toByteArray());
            String signatureHex = bytesToHex(signatureBytes);

            // Compare with known good signature
            if (signatureHex.equals(KNOWN_GOOD_SIGNATURE)) {
                return true;
            }
        }
    } catch (Exception e) {
        return false;
    }
    return false;
}
```

### 9.2 Detect Root (Best Effort)

```java
public static boolean isRooted() {
    // Check common root binaries
    String[] paths = {
        "/system/app/Superuser.apk",
        "/sbin/su",
        "/system/bin/su",
        "/system/xbin/su",
        "/data/local/xbin/su",
        "/data/local/bin/su",
        "/system/sd/xbin/su",
        "/system/bin/failsafe/su",
        "/data/local/su",
        "/su/bin/su"
    };

    for (String path : paths) {
        if (new File(path).exists()) return true;
    }

    // Check for su executable in PATH
    try {
        Process process = Runtime.getRuntime().exec("which su");
        BufferedReader reader = new BufferedReader(new InputStreamReader(process.getInputStream()));
        if (reader.readLine() != null) return true;
    } catch (Exception e) {
        // Ignore
    }

    return false;
}
```

---

## 10. SSL/TLS Best Practices

### 10.1 Use TLS 1.2+ Minimum

```java
// Enforce TLS 1.2+ for legacy devices
SSLContext sslContext = SSLContext.getInstance("TLSv1.2");
sslContext.init(null, null, null);

OkHttpClient client = new OkHttpClient.Builder()
    .sslSocketFactory(sslContext.getSocketFactory(), trustManager)
    .build();
```

### 10.2 Never Implement Custom TrustManager

```java
// NEVER DO THIS - Accepts all certificates
TrustManager[] trustAllCerts = new TrustManager[] {
    new X509TrustManager() {
        public void checkClientTrusted(X509Certificate[] chain, String authType) {}
        public void checkServerTrusted(X509Certificate[] chain, String authType) {}
        public X509Certificate[] getAcceptedIssuers() { return new X509Certificate[0]; }
    }
};

// GOOD: Use system trust store
SSLContext sslContext = SSLContext.getInstance("TLSv1.2");
sslContext.init(null, null, null);
```

---

*Last Updated: 2024*
*Reference: OWASP MASTG Best Practices Collection*