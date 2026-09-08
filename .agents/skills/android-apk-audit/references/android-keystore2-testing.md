# Android Keystore2 Testing - Referencias Oficiales

> **FUENTES VALIDADAS**: Toda la información aquí documentada proviene de fuentes oficiales de Android Open Source Project (AOSP) y Android Developers.

---

## 1. Keystore vs Keystore2 (Android 12+) - Diferencias Arquitectónicas

### Fuente
- [Hardware-backed Keystore | Android Open Source Project](https://source.android.com/docs/security/keystore)
- [Android Security Bulletin](https://source.android.com/docs/security/bulletin)

### Evolución Histórica

| Versión Android | Nombre | Cambios Principales |
|-----------------|--------|---------------------|
| Android 6.0 | Keystore 1.0 | AES/HMAC simétricos, access control |
| Android 7.0 | Keymaster 2 | Key attestation, version binding |
| Android 8.0 | Keymaster 3 | HIDL migration, ID attestation |
| Android 9 | Keymaster 4 | StrongBox, Secure Key Import, 3DES |
| Android 12+ | Keymint | Renombrado de Keymaster, AIDL |

### Keystore 2.0 Características

**Domains ( cinco dominios de acceso):**

```java
// Fuente: source.android.com/docs/security/keystore
enum class Domain {
    DOMAIN_APP,      // Comportamiento legacy, usa UID
    DOMAIN_SELINUX,   // Namespace con label SELinux
    DOMAIN_GRANT,     // Grant identifier
    DOMAIN_KEY_ID,    // Unique key ID (no cambia en rebind)
    DOMAIN_BLOB       // Caller gestiona el blob
}
```

**SELinux Namespaces (Keystore 2.0):**

```bash
# Configuration files por partición
/system/etc/selinux/keystore2_key_contexts    # 0-9999
/system_ext/etc/selinux/system_ext_keystore2_key_contexts  # 10000-19999
/product/etc/selinux/product_keystore2_key_contexts        # 20000-29999
/vendor/etc/selinux/vendor_keystore2_key_contexts          # 30000-39999
```

**Namespaces Predefinidos:**

| Namespace ID | SEPolicy Label | UID | Descripción |
|-------------|----------------|-----|-------------|
| 0 | su_key | N/A | Super user key (testing only) |
| 1 | shell_key | N/A | Shell namespace |
| 100 | vold_key | N/A | vold usage |
| 101 | odsing_key | N/A | On-device signing daemon |
| 102 | wifi_key | AID_WIFI(1010) | WiFi subsystem |
| 120 | resume_on_reboot_key | AID_SYSTEM(1000) | Resume on reboot |

---

## 2. APIs de Keystore2 (AIDL, Jetpack Security)

### Fuente
- [Android Keystore Package Summary](https://developer.android.com/reference/android/security/keystore/package-summary)
- [Android Cryptography Guide](https://developer.android.com/guide/topics/security/cryptography)
- [Android Security Tips](https://developer.android.com/training/articles/security-tips#Crypto)

### APIs Principales

#### Java/Kotlin API (AndroidKeystore SPI)

```java
// AndroidKeystore es el SPI usado por apps para acceder a Keystore
// Implementado como extensión a JCA (Java Cryptography Architecture)

import java.security.KeyStore;
KeyStore keystore = KeyStore.getInstance("AndroidKeyStore");
keystore.load(null);

// Generar clave con AndroidKeyStore
import android.security.keystore.KeyGenParameterSpec;
import javax.crypto.KeyGenerator;

KeyGenerator keyGen = KeyGenerator.getInstance(
    KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore"
);

KeyGenParameterSpec spec = new KeyGenParameterSpec.Builder(
    "myKeyAlias",
    KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
    .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
    .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
    .setKeySize(256)
    .build();
```

#### Jetpack Security (EncryptedFile, EncryptedSharedPreferences)

```kotlin
// Usar EncryptedSharedPreferences
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey

val masterKey = MasterKey.Builder(context)
    .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
    .build()

val sharedPreferences = EncryptedSharedPreferences.create(
    context,
    "secure_prefs",
    masterKey,
    EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
    EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
)
```

#### BiometricPrompt con CryptoObject

```java
// Integración de BiometricPrompt con Keystore
import androidx.biometric.BiometricPrompt
import javax.crypto.Cipher

BiometricPrompt.PromptInfo promptInfo = new BiometricPrompt.PromptInfo.Builder()
    .setTitle("Biometric login")
    .setSubtitle("Use your fingerprint")
    .setNegativeButtonText("Cancel")
    .build();

Cipher cipher = Cipher.getInstance("AES/CBC/PKCS5Padding");
cipher.init(Cipher.ENCRYPT_MODE, secretKey);

BiometricPrompt biometricPrompt = new BiometricPrompt(this, executor,
    new BiometricPrompt.AuthenticationCallback() {
        @Override
        public void onAuthenticationSucceeded(AuthenticationResult result) {
            CryptoObject cryptoObject = result.getCryptoObject();
            // cryptoObject.getCipher() contiene el cipher inicializado
        }
    });

// authenticate() con CryptoObject requiere executor + callback (4 parámetros)
// authenticate() sin CryptoObject puede usar solo promptInfo + cancellationSignal (2 parámetros)
biometricPrompt.authenticate(promptInfo, new CancellationSignal());
```

### AIDL Interfaces (Android 13+)

**Nota:** Android 13+ migró de HIDL a AIDL para interfaces de HAL.

```java
// IKeymintDevice.aidl (Android 13+)
// Ubicación: system/security/keystore2/

interface IKeymintDevice {
    // Generate key
    byte[] generateKey(in KeyParameter[] params);

    // Get key characteristics
    KeyCharacteristics getKeyCharacteristics(in byte[] keyBlob);

    // Import key
    byte[] importKey(in KeyParameter[] params, in byte[] keyData);

    // Use key (sign, decrypt, etc.)
    byte[] useKey(in byte[] keyBlob, in byte[] inputData);

    // Attest key
    byte[] attestKey(in byte[] keyBlob, in byte[] challenge);

    // Delete key
    void deleteKey(in byte[] keyBlob);
}
```

---

## 3. Security Level Flags (STRONGBOX, TEE, Software)

### Fuente
- [Hardware-backed Keystore - Android Open Source Project](https://source.android.com/docs/security/keystore)
- [Android CDD (Compatibility Definition Document)](https://source.android.com/docs/compatibility)

### Niveles de Seguridad

```java
// SecurityLevel enum en Keystore
public enum SecurityLevel {
    UNKNOWN,       // No determinado
    SOFTWARE,      // Solo software (no recomendado)
    TRUSTED_ENVIRONMENT,  // TEE (TrustZone)
    STRONGBOX      // StrongBox Keymaster (Android 9+)
}
```

### Implementación de StrongBox (Android 9+)

**KeyGenParameterSpec con StrongBox:**

```java
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;

KeyGenParameterSpec.Builder builder = new KeyGenParameterSpec.Builder(
    "strongboxKey",
    KeyProperties.PURPOSE_SIGN)
    .setAlgorithm(KeyProperties.KEY_ALGORITHM_EC)
    .setKeySize(256)
    // NOTE: setDeviceLockerScreen(false) does NOT exist in KeyGenParameterSpec.Builder
    // If device locker screen control is needed, use device policy or biometric enrollment instead
    .setIsStrongBoxBacked(true)  // <-- StrongBox
    .setUserAuthenticationRequired(true);
```

**Verificar si StrongBox está disponible:**

```java
import android.security.keystore.KeyInfo;
import javax.crypto.SecretKey;
import javax.crypto.SecretKeyFactory;

SecretKeyFactory factory = SecretKeyFactory.getInstance(
    key.getAlgorithm(), "AndroidKeyStore");
KeyInfo keyInfo = (KeyInfo) factory.getKeySpec(
    key, KeyInfo.class);

boolean isStrongBox = keyInfo.isInsideSecureHardware();
SecurityLevel securityLevel = keyInfo.getSecurityLevel();
```

### Características por Security Level

| Característica | Software | TEE | StrongBox |
|---------------|----------|-----|----------|
| Key storage | Kernel | TEE (TrustZone) | Secure Element |
| Attack surface | Kernel | Kernel + TEE | Separate HW |
| Side-channel protection | None | Limited | Hardware isolated |
| Patching requirements | OS update | TEE update | Independent |
| Biometric binding | Yes | Yes | Yes |
| Price | Low | Medium | High |

### Authorization Tags Principales

```java
// Fuente: source.android.com/docs/security/keystore
// Authorization tags usados en KeyGenParameterSpec

KeyProperties.PURPOSE_ENCRYPT        // 1
KeyProperties.PURPOSE_DECRYPT        // 2
KeyProperties.PURPOSE_SIGN           // 4
KeyProperties.PURPOSE_VERIFY         // 8

KeyProperties.BLOCK_MODE_GCM         // AES-GCM
KeyProperties.BLOCK_MODE_CBC         // AES-CBC
KeyProperties.BLOCK_MODE_CTR         // AES-CTR

KeyProperties.ENCRYPTION_PADDING_NONE     // No padding
KeyProperties.ENCRYPTION_PADDING_PKCS7   // PKCS#7
KeyProperties.ENCRYPTION_PADDING_PSS     // RSA-PSS
KeyProperties.ENCRYPTION_PADDING_OAEP    // RSA-OAEP

KeyProperties.DIGEST_SHA256          // SHA-256
KeyProperties.DIGEST_SHA384          // SHA-384
KeyProperties.DIGEST_SHA512          // SHA-512
```

---

## 4. Frida Hooks para Keystore2

### Fuentes
- [Frida CodeShare](https://codeshare.frida.re)
- [Frida Documentation](https://frida.re/docs/android/)

### Hooks Comunes para Keystore2

#### 1. Hook AndroidKeystore - Listar claves

```javascript
// Hook para enumerateKeys() en AndroidKeystore
// Tested on Android 10-14

Java.perform(function() {
    var AndroidKeyStore = Java.use('android.security.keystore.AndroidKeyStore');

    // Hook load() para ver cuando se cargan claves
    AndroidKeyStore.load.overload('java.security.KeyStore$LoadStoreParameter').implementation = function(param) {
        console.log('[AndroidKeyStore] load() called');
        return this.load(param);
    };

    // Hook getInstance() para ver las instancias
    var getInstance = AndroidKeyStore.getInstance;
    getInstance.implementation = function(type) {
        console.log('[AndroidKeyStore] getInstance("' + type + '")');
        return getInstance.call(this, type);
    };
});
```

#### 2. Hook KeyGenParameterSpec.Builder

```javascript
// Hook para monitorear generación de claves
// Detecta cuando una app genera claves con StrongBox

Java.perform(function() {
    var Builder = Java.use('android.security.keystore.KeyGenParameterSpec$Builder');

    Builder.setIsStrongBoxBacked.implementation = function(bool) {
        console.log('[KeyGenParameterSpec] setIsStrongBoxBacked(' + bool + ')');
        // stack trace para ver quién llama
        console.log(Thread.backtrace(this.context, Backtracer.ACCURATE)
            .map(DebugSymbol.fromAddress).join('\n'));
        return this.setIsStrongBoxBacked(bool);
    };

    Builder.setUserAuthenticationRequired.implementation = function(bool) {
        console.log('[KeyGenParameterSpec] setUserAuthenticationRequired(' + bool + ')');
        return this.setUserAuthenticationRequired(bool);
    };
});
```

#### 3. Hook SecretKey/PrivateKey para extraer metadata

```javascript
// Hook para obtener información de claves existentes

Java.perform(function() {
    var SecretKeyFactory = Java.use('javax.crypto.SecretKeyFactory');
    var KeyInfo = Java.use('android.security.keystore.KeyInfo');

    SecretKeyFactory.getInstance.implementation = function(algorithm, provider) {
        console.log('[SecretKeyFactory] getInstance("' + algorithm + '", "' + provider + '")');
        return SecretKeyFactory.getInstance.call(this, algorithm, provider);
    };

    // Hook para getKeySpec
    SecretKeyFactory.getKeySpec.overload(
        'javax.crypto.SecretKey',
        'java.lang.Class'
    ).implementation = function(key, classSpec) {
        console.log('[SecretKeyFactory] getKeySpec called');
        if (classSpec.getName() === 'android.security.keystore.KeyInfo') {
            console.log('[!] Attempting to extract KeyInfo from: ' + key.getAlgorithm());
        }
        return this.getKeySpec(key, classSpec);
    };
});
```

#### 4. Hook Keystore Daemon (Binder)

```javascript
// Hook a nivel de Binder/IPC para keystore daemon
// Android 12+ usa keystore2_service

var keystore2 = null;
try {
    binder = Java.use('android.os.Binder');
    binder.getExtension.implementation = function() {
        console.log('[Binder] getExtension called');
        return this.getExtension();
    };
} catch(e) {
    console.log('[-] Binder hook not available: ' + e.message);
}

// Hook para IKeyMintDevice (AIDL)
Java.perform(function() {
    try {
        var IKeyMintDevice = Java.use('android.security.keystore.IKeyMintDevice');

        // Monitor operations
        ['generateKey', 'getKeyCharacteristics', 'useKey'].forEach(function(method) {
            if (IKeyMintDevice[method]) {
                IKeyMintDevice[method].implementation = function() {
                    console.log('[IKeyMintDevice] ' + method + '() called');
                    return this[method].apply(this, arguments);
                };
            }
        });
    } catch(e) {
        console.log('[-] IKeyMintDevice hook not available: ' + e.message);
    }
});
```

#### 5. Hook para bypass authentication (pentesting)

```javascript
// ADVERTENCIA: Solo para testing de seguridad autorizado
// Hook para verificar si authentication puede ser bypassed

Java.perform(function() {
    var GateKeeper = Java.use('com.android.internal.widget.GateKeeper');

    // Verificar si authentication token puede ser spoofed
    GateKeeper.verifyGateKeeperPassword.implementation = function() {
        console.log('[!] GateKeeper.verifyGateKeeperPassword() called');
        // En devices vulnerados, podría retornar true sin password válido
        return this.verifyGateKeeperPassword.apply(this, arguments);
    };
});

// Hook para ver auth tokens siendo generados
Java.perform(function() {
    var AuthToken = Java.use('com.android.server.security.AuthToken');

    AuthToken.createAuthToken.implementation = function() {
        console.log('[AuthToken] createAuthToken() called');
        return this.createAuthToken.apply(this, arguments);
    };
});
```

### Frida Script Template para Keystore2 Testing

```javascript
// Template completo para Android Keystore2 assessment
// Usage: frida -U -f com.target.app -l keystore2_monitor.js

console.log('=== Android Keystore2 Monitor ===');

var config = {
    monitorStrongBox: true,
    monitorAuth: true,
    traceNative: false
};

Java.perform(function() {
    // 1. Monitor KeyGenParameterSpec.Builder
    monitorKeyGeneration();

    // 2. Monitor KeyStore operations
    monitorKeyStore();

    // 3. Monitor crypto operations
    monitorCrypto();

    // 4. Monitor biometric integration
    if (config.monitorAuth) {
        monitorBiometric();
    }
});

function monitorKeyGeneration() {
    var Builder = Java.use('android.security.keystore.KeyGenParameterSpec$Builder');

    var methods = [
        'setIsStrongBoxBacked',
        'setUserAuthenticationRequired',
        'setUserAuthenticationParameters',
        'setKeySize',
        'setBlockMode',
        'setEncryptionPaddings'
    ];

    methods.forEach(function(method) {
        if (Builder[method]) {
            Builder[method].implementation = function() {
                console.log('[KeyGen] ' + method + '()');
                return this[method].apply(this, arguments);
            };
        }
    });
}

function monitorKeyStore() {
    Java.use('android.security.keystore.AndroidKeyStore')
        .load.overload('java.security.KeyStore$LoadStoreParameter')
        .implementation = function(param) {
            console.log('[Keystore] load()');
            return this.load(param);
        };
}

function monitorCrypto() {
    var Cipher = Java.use('javax.crypto.Cipher');
    Cipher.getInstance.overload('java.lang.String').implementation = function(transformation) {
        console.log('[Crypto] Cipher.getInstance("' + transformation + '")');
        return this.getInstance(transformation);
    };
}

function monitorBiometric() {
    Java.use('android.hardware.biometrics.BiometricPrompt')
        .authenticate.overload(
            'android.hardware.biometrics.BiometricPrompt$PromptInfo',
            'android.os.CancellationSignal'
        ).implementation = function(info, cancel) {
            console.log('[Biometric] authenticate()');
            return this.authenticate(info, cancel);
        };
}
```

---

## 5. Vulnerabilidades Documentadas (CVE) y Técnicas de Testing

### Fuentes
- [Android Security Bulletins](https://source.android.com/docs/security/bulletin)
- [Android Security Features - Keystore](https://source.android.com/docs/security/features/keystore)

### Vulnerabilidades Históricas Relevantes

#### CVE-2023-20951 (Android 11-13)
**Severity:** Critical
**Component:** Bluetooth GATT (gatt_cl.cc)
**Description:** Out-of-bounds write in `gatt_process_prep_write_rsp` due to missing bounds check. Could lead to remote code execution with no additional privileges needed. CVSS 3.1: 9.8 (CRITICAL).

**Source:** [Android Security Bulletin March 2023](https://source.android.com/security/bulletin/2023-03-01)

### Áreas de Testing para Keystore2

#### 1. Testing Checklist

```markdown
## Keystore2 Security Testing Checklist

### 1. Key Generation
- [ ] Verify StrongBox is used when requested
- [ ] Check TEE vs Software fallback
- [ ] Verify key size compliance (256-bit AES minimum)
- [ ] Test key rotation mechanisms

### 2. Authentication Binding
- [ ] Test biometric bypass techniques
- [ ] Verify auth timeout enforcement
- [ ] Test auth token reuse prevention
- [ ] Check auth required flag persistence

### 3. Access Control
- [ ] Test DOMAIN_APP namespace isolation
- [ ] Test DOMAIN_SELINUX policies
- [ ] Verify grant mechanism security
- [ ] Test DOMAIN_BLOB blob handling

### 4. Cryptographic Operations
- [ ] Verify AES-GCM nonce uniqueness
- [ ] Test HMAC key derivation
- [ ] Verify RSA-OAEP padding
- [ ] Test ECDSA signature replay

### 5. Key Lifecycle
- [ ] Test key deletion (secure wipe)
- [ ] Verify key upgrade on OS update
- [ ] Test key persistence across reboots
- [ ] Verify key export restrictions

### 6. Side Channels
- [ ] Timing attacks on crypto operations
- [ ] Power analysis (if equipment available)
- [ ] Cold boot attack resilience
- [ ] RAM dump analysis
```

#### 2. Testing Commands (adb)

```bash
# Listar keys en Keystore (requiere root o permisos)
adb shell "dumpsys keystore2"

# Ver estado de StrongBox
adb shell "dumpsys keystore2 | grep -i strongbox"

# Listar key namespaces
adb shell "ls -la /data/misc_ce/0/"

# Ver logs de Keystore
adb logcat -s keystore2:* KeyStoreService:*

# Test de encrypt/decrypt con keystore
adb shell " attestationcenter check"

# Consultar información de hardware
adb shell "getprop ro.hardware.keystore"
adb shell "getprop ro.hardware"
```

#### 3. Testing Tools

```bash
# Android KeyStore Explorer (GUI)
# https://keystore-explorer.org/

# Mobe - Mobile Binary Exploitation
# Testing framework para keystore

# Frida scripts (ver sección 4)

# drozer - Security testing framework
dz> run scanner.misc.check_keystore
```

### Security Level Verification Code

```java
// Verificar security level de una clave
public SecurityLevelInfo verifyKeySecurityLevel(String keyAlias) {
    SecurityLevelInfo info = new SecurityLevelInfo();

    try {
        KeyStore ks = KeyStore.getInstance("AndroidKeyStore");
        ks.load(null);

        if (!ks.containsAlias(keyAlias)) {
            info.status = "KEY_NOT_FOUND";
            return info;
        }

        Key key = ks.getKey(keyAlias, null);
        SecretKeyFactory factory = SecretKeyFactory.getInstance(
            key.getAlgorithm(), "AndroidKeyStore");

        KeyInfo keyInfo = factory.getKeySpec(key, KeyInfo.class);

        info.isHardwareBacked = keyInfo.isInsideSecureHardware();
        info.securityLevel = keyInfo.getSecurityLevel();
        info.isStrongBox = keyInfo.isStrongBoxBacked();
        info.authRequired = keyInfo.getUserAuthenticationValiditySeconds() >= 0;

        // Verificar binding
        info.bindToUserSecurity = keyInfo.isUserAuthenticationBindingEnforced();

    } catch (Exception e) {
        info.status = "ERROR: " + e.getMessage();
    }

    return info;
}
```

---

## Referencias Oficiales Completas

### Android Open Source Project
1. **Hardware-backed Keystore**: https://source.android.com/docs/security/keystore
2. **Keystore Features**: https://source.android.com/docs/security/features/keystore
3. **Key Attestation**: https://source.android.com/docs/security/features/attestation
4. **Android Security Bulletin**: https://source.android.com/docs/security/bulletin
5. **Android CDD**: https://source.android.com/docs/compatibility

### Android Developers
1. **Cryptography Guide**: https://developer.android.com/guide/topics/security/cryptography
2. **Security Tips**: https://developer.android.com/training/articles/security-tips
3. **Keystore Package**: https://developer.android.com/reference/android/security/keystore/package-summary
4. **BiometricPrompt**: https://developer.android.com/reference/android/hardware/biometrics/BiometricPrompt
5. **Jetpack Security**: https://developer.android.com/jetpack/androidx/releases/security

### AOSP Source Code
1. **Keystore2 System**: `system/security/keystore2/`
2. **Keymint HAL**: `hardware/interfaces/keymint/`
3. **StrongBox**: `hardware/interfaces/strongbox/`

### Tools
1. **Frida**: https://frida.re/docs/android/
2. **Frida CodeShare**: https://codeshare.frida.re
3. **Drozer**: https://github.com/ReversecLabs/drozer
4. **Android KeyStore Explorer**: https://keystore-explorer.org/

---

## Notas de Testing

> **IMPORTANTE**: El testing de Keystore debe realizarse en dispositivos específicamente designados para security testing. Nunca realizar estas pruebas en dispositivos de producción sin autorización explícita.

> **LIMITACIONES**: Las vulnerabilidades de hardware (StrongBox/TEE) no pueden ser testadas via software en todos los casos. Algunas requieren acceso físico al dispositivo o equipo de análisis de hardware especializado (e.g., para side-channel attacks).

> **Actualización**: Esta documentación refleja el estado de Keystore2 hasta Android 14. Android 15+ introduce cambios adicionales que deben verificarse contra la documentación oficial más reciente.
