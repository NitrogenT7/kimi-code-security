/**
 * Android Keystore Inspector (Enhanced)
 * Lists and inspects Android Keystore entries to analyze key storage security
 *
 * Enhancements inspired by: akabe1 - https://gist.github.com/akabe1/c9d285ad3d07e7f47fc6d1599d01c8cf
 * Credits: Maurizio Siddu (akabe1) for keystore-spy patterns and crypto binding analysis
 *
 * Usage: frida -U -f com.target.app -l keystore-inspector.js
 *
 * OWASP MASTG Reference: MASTG-TEST-0060, MASTG-TEST-0061
 * MASVS: L2 - Storage (Key Management)
 *
 * Compatible with: Frida 16.x+ and Android 7-16
 */

console.log("\n[*] Android Keystore Inspector (Enhanced) loaded\n");

Java.perform(function() {
    // =========================================
    // Keystore Tracking State
    // =========================================
    var trackedKeystoreAliases = [];
    var biometricAuthDetected = false;

    // =========================================
    // Core Classes
    // =========================================
    var KeyStore = Java.use('java.security.KeyStore');
    var KeyStoreException = Java.use('java.security.KeyStoreException');
    var KeyInfo = null;
    try {
        KeyInfo = Java.use('android.security.keystore.KeyInfo');
    } catch(e) {
        console.log("[-] KeyInfo not available (Android < 6), key analysis will be limited");
    }
    var KeyFactory = Java.use('java.security.KeyFactory');
    var SecretKeyFactory = Java.use('javax.crypto.SecretKeyFactory');

    // =========================================
    // Android Keystore Key Types
    // =========================================
    var androidKeystoreKeyTypes = [
        'android.security.keystore.AndroidKeyStoreSecretKey',
        'android.security.keystore2.AndroidKeyStoreSecretKey',
        'android.security.keystore2.AndroidKeyStorePrivateKey',
        'android.security.keystore2.AndroidKeyStoreRSAPrivateKey',
        'android.security.keystore2.AndroidKeyStoreECPrivateKey',
        'android.security.keystore2.AndroidKeyStoreEdECPrivateKey',
        'android.security.keystore2.AndroidKeyStoreXDHPrivateKey'
    ];

    // =========================================
    // Inspect All Keystore Types
    // =========================================
    var keystoreTypes = [
        'AndroidKeyStore',
        'AndroidKeyStoreBCWorkaround',
        'BKS',
        'BouncyCastle',
        'PKCS12'
    ];

    function inspectKeystore(type, alias) {
        try {
            var ks = KeyStore.getInstance(type);
            ks.load(null, null);

            console.log("[+] Keystore type: " + type);

            if (alias) {
                // Inspect specific alias
                inspectAlias(ks, alias);
            } else {
                // List all aliases
                var aliases = ks.aliases();
                console.log("[+] Aliases found:");

                while (aliases.hasMoreElements()) {
                    var currentAlias = aliases.nextElement();
                    console.log("    - " + currentAlias);
                    inspectAlias(ks, currentAlias);
                }
            }
        } catch (e) {
            // Keystore type might not exist or be accessible
            console.log("[-] Could not access keystore type: " + type + " - " + e);
        }
    }

    // =========================================
    // Inspect Specific Alias
    // =========================================
    function inspectAlias(ks, alias) {
        console.log("\n[*] Inspecting alias: " + alias);

        try {
            // Check if entry exists
            if (!ks.containsAlias(alias)) {
                console.log("[-] Alias not found");
                return;
            }

            // Get creation date
            var creationDate = ks.getCreationDate(alias);
            console.log("    Creation Date: " + creationDate);

            // Check entry type
            var isKeyEntry = ks.isKeyEntry(alias);
            var isCertificateEntry = ks.isCertificateEntry(alias);

            console.log("    Key Entry: " + isKeyEntry);
            console.log("    Certificate Entry: " + isCertificateEntry);

            // Try to get key info
            if (isKeyEntry) {
                inspectKeyEntry(ks, alias);
            }

            // Get certificate chain
            try {
                var certChain = ks.getCertificateChain(alias);
                if (certChain && certChain.length > 0) {
                    console.log("    Certificate Chain Length: " + certChain.length);
                    inspectCertificateChain(certChain);
                }
            } catch (e) {
                console.log("    [!] Could not get certificate chain: " + e);
            }

        } catch (e) {
            console.log("[-] Error inspecting alias: " + e);
        }
    }

    // =========================================
    // Enhanced Certificate Chain Inspection
    // =========================================
    function inspectCertificateChain(certChain) {
        for (var i = 0; i < certChain.length; i++) {
            var cert = certChain[i];
            console.log("\n    === Certificate [" + i + "] ===");
            console.log("    Subject: " + cert.getSubjectDN());
            console.log("    Issuer: " + cert.getIssuerDN());
            console.log("    Not Before: " + cert.getNotBefore());
            console.log("    Not After: " + cert.getNotAfter());
            console.log("    Serial Number: " + cert.getSerialNumber());

            // Check certificate validity period
            var now = Java.use('java.util.Date').$new();
            var notAfter = cert.getNotAfter();
            var notBefore = cert.getNotBefore();

            if (now.after(notAfter)) {
                console.log("    \u26A0\uFE0F WARNING: Certificate has EXPIRED!");
            } else if (now.before(notBefore)) {
                console.log("    \u26A0\uFE0F WARNING: Certificate not yet valid!");
            }
        }
    }

    // =========================================
    // Enhanced Key Entry Inspection
    // =========================================
    function inspectKeyEntry(ks, alias) {
        try {
            var key = ks.getKey(alias, null);
            if (key == null) {
                // Try with password (for PKCS12 keystores)
                key = ks.getKey(alias, new Java.array('char', []));
            }

            if (key != null) {
                var algorithm = key.getAlgorithm();
                console.log("\n    Key Algorithm: " + algorithm);
                console.log("    Key Format: " + key.getFormat());

                // Check if it's an Android Keystore key
                var keyClassName = key.getClass().getName();
                var isAndroidKeystoreKey = androidKeystoreKeyTypes.indexOf(keyClassName) !== -1;

                console.log("    Key Type: " + (isAndroidKeystoreKey ? "\u2705 Android Keystore" : "\u26A0\uFE0F Software Keystore"));

                if (isAndroidKeystoreKey) {
                    performAdvancedKeyAnalysis(key, alias);
                } else {
                    console.log("\n    \u26A0\uFE0F WARNING: Key not stored in Android Keystore!");
                    console.log("    \u26A0\uFE0F Key material may be extractable from memory.");
                }
            }
        } catch (e) {
            console.log("[-] Error accessing key entry: " + e);
        }
    }

    // =========================================
    // Advanced Key Analysis (akabe1 patterns)
    // =========================================
    function performAdvancedKeyAnalysis(key, alias) {
        try {
            var keyFactoryObj = null;
            var algorithm = key.getAlgorithm();

            try {
                keyFactoryObj = KeyFactory.getInstance(algorithm, 'AndroidKeyStore');
            } catch (err) {
                keyFactoryObj = SecretKeyFactory.getInstance(algorithm, 'AndroidKeyStore');
            }

            var keyInfo = keyFactoryObj.getKeySpec(key, KeyInfo.class);
            var keyInfoObj;
            try {
                keyInfoObj = Java.cast(keyInfo, KeyInfo);
            } catch (e) {
                console.log("    [!] Could not cast to KeyInfo: " + e);
                return;
            }

            // Track this alias to avoid duplicate output
            var alreadyTracked = trackedKeystoreAliases.indexOf(alias) !== -1;
            if (!alreadyTracked) {
                trackedKeystoreAliases.push(alias);
            }

            console.log("\n" + "=".repeat(50));
            console.log("ENHANCED KEY ANALYSIS: " + alias);
            console.log("=".repeat(50));

            // Basic key properties
            var keySize = keyInfoObj.getKeySize();
            console.log("\n=== Key Properties ===");
            console.log("    Key Size: " + keySize + " bits");
            console.log("    Alias: " + keyInfoObj.getKeystoreAlias());

            // Security Level (Android 9+)
            try {
                var securityLevel = keyInfoObj.getSecurityLevel();
                console.log("    Security Level: " + getSecurityLevelString(securityLevel));
            } catch (e) {}

            // Key Origin
            var origin = keyInfoObj.getOrigin();
            console.log("\n=== Key Origin ===");
            console.log("    Origin: " + getKeyOriginString(origin));

            // Key Purposes (comprehensive)
            console.log("\n=== Key Purposes ===");
            var purposes = keyInfoObj.getPurposes();
            console.log("    Purposes: " + getKeyPurposesString(purposes));

            // Cryptographic Configuration
            console.log("\n=== Cryptographic Configuration ===");

            var blockModes = keyInfoObj.getBlockModes();
            if (blockModes && blockModes.length > 0) {
                var blockModesArray = blockModes;
                if (blockModes.join) {
                    console.log("    Block Modes: " + blockModes.join(", "));
                } else {
                    console.log("    Block Modes: " + Java.array('java.lang.String', blockModes).join(", "));
                }
            }

            var encryptionPaddings = keyInfoObj.getEncryptionPaddings();
            if (encryptionPaddings && encryptionPaddings.length > 0) {
                console.log("    Encryption Paddings: " + Java.array('java.lang.String', encryptionPaddings).join(", "));
            }

            var signaturePaddings = keyInfoObj.getSignaturePaddings();
            if (signaturePaddings && signaturePaddings.length > 0) {
                console.log("    Signature Paddings: " + Java.array('java.lang.String', signaturePaddings).join(", "));
            }

            var digests = keyInfoObj.getDigests();
            if (digests && digests.length > 0) {
                console.log("    Digests: " + Java.array('java.lang.String', digests).join(", "));
            }

            // Key Validity Period
            console.log("\n=== Key Validity Period ===");

            try {
                var keyValidityStart = keyInfoObj.getKeyValidityStart();
                console.log("    Valid From: " + (keyValidityStart != null ? keyValidityStart : "unrestricted"));
            } catch (e) {}

            try {
                var keyValidityForOriginationEnd = keyInfoObj.getKeyValidityForOriginationEnd();
                console.log("    Valid for Encryption Until: " + (keyValidityForOriginationEnd != null ? keyValidityForOriginationEnd : "unrestricted"));
            } catch (e) {}

            try {
                var keyValidityForConsumptionEnd = keyInfoObj.getKeyValidityForConsumptionEnd();
                console.log("    Valid for Decryption Until: " + (keyValidityForConsumptionEnd != null ? keyValidityForConsumptionEnd : "unrestricted"));
            } catch (e) {}

            try {
                var keyValidityEnd = keyInfoObj.getKeyValidityEnd();
                console.log("    Key Expiration: " + (keyValidityEnd != null && keyValidityEnd.getTime() > 0 ? keyValidityEnd : "none"));
            } catch (e) {}

            // Crypto Binding Verification
            console.log("\n=== Crypto Binding Verification ===");

            var userAuthRequired = keyInfoObj.isUserAuthenticationRequired();
            console.log("    User Authentication Required: " + userAuthRequired);

            if (userAuthRequired) {
                // Detailed authentication settings
                try {
                    var userAuthValidityDuration = keyInfoObj.getUserAuthenticationValidityDurationSeconds();
                    if (userAuthValidityDuration > 0) {
                        console.log("    \u26A0\uFE0F Auth Validity Duration: " + userAuthValidityDuration + "s (time-bound, NOT per-operation)");
                    } else {
                        console.log("    \u2705 Per-Operation Auth (0s = authenticates every use)");
                    }
                } catch (e) {}

                try {
                    var userAuthValidWhileOnBody = keyInfoObj.isUserAuthenticationValidWhileOnBody();
                    console.log("    Valid While On Body: " + userAuthValidWhileOnBody);
                } catch (e) {}

                try {
                    var userAuthValidWhileDeviceTrusted = keyInfoObj.isUserAuthenticationValidWhileDeviceTrusted();
                    console.log("    Valid While Device Trusted: " + userAuthValidWhileDeviceTrusted);
                } catch (e) {}

                try {
                    var userAuthType = keyInfoObj.getUserAuthenticationType();
                    console.log("    Authentication Type: " + getUserAuthTypeString(userAuthType));
                } catch (e) {}

                try {
                    var userAuthEnforcedBySecureHardware = keyInfoObj.isUserAuthenticationRequirementEnforcedBySecureHardware();
                    console.log("    Auth Enforced by Secure Hardware: " + userAuthEnforcedBySecureHardware);
                } catch (e) {}
            } else {
                console.log("    \u26A0\uFE0F SECURITY CONCERN: No user authentication required!");
            }

            // Biometric-Specific Bindings
            try {
                var invalidatedByBiometricEnrollment = keyInfoObj.isInvalidatedByBiometricEnrollment();
                console.log("    Invalidated by New Biometric Enrollment: " + invalidatedByBiometricEnrollment);
                if (!invalidatedByBiometricEnrollment && userAuthRequired) {
                    console.log("    \u26A0\uFE0F WARNING: Key remains valid even if new biometric is enrolled!");
                }
            } catch (e) {}

            // Presence Confirmation Bindings
            try {
                var trustedUserPresenceRequired = keyInfoObj.isTrustedUserPresenceRequired();
                console.log("    Trusted User Presence Required: " + trustedUserPresenceRequired);
            } catch (e) {}

            try {
                var userPresenceRequired = keyInfoObj.isUserPresenceRequired();
                console.log("    User Presence Required: " + userPresenceRequired);
            } catch (e) {}

            try {
                var userConfirmationRequired = keyInfoObj.isUserConfirmationRequired();
                console.log("    User Confirmation Required: " + userConfirmationRequired);
            } catch (e) {}

            // Secure Screen Binding
            try {
                var secureScreenRequired = keyInfoObj.isSecureScreenRequired();
                console.log("    Secure Screen Required: " + secureScreenRequired);
            } catch (e) {}

            // Key Usage Flags
            console.log("\n=== Key Usage Permissions ===");
            console.log("    Allowed for Encryption: " + keyInfoObj.isAllowedForEncryption());
            console.log("    Allowed for Decryption: " + keyInfoObj.isAllowedForDecryption());
            console.log("    Allowed for Signing: " + keyInfoObj.isAllowedForSigning());
            console.log("    Allowed for Verification: " + keyInfoObj.isAllowedForSignatureVerification());
            console.log("    Allowed for Key Agreement: " + keyInfoObj.isAllowedForKeyAgreement());

            // Usage Limits
            try {
                var remainingUsageCount = keyInfoObj.getRemainingUsageCount();
                if (remainingUsageCount >= 0) {
                    console.log("    Remaining Usage Count: " + remainingUsageCount);
                } else {
                    console.log("    Usage Count: UNRESTRICTED");
                }
            } catch (e) {}

            // Attestation
            try {
                var attestationChallenge = keyInfoObj.getAttestationChallenge();
                if (attestationChallenge != null) {
                    console.log("\n=== Key Attestation ===");
                    console.log("    Attestation Challenge present: \u2705 YES");
                    console.log("    Challenge: " + attestationChallenge);
                }
            } catch (e) {}

            // Storage Security
            console.log("\n=== Storage Security ===");
            var insideSecureHardware = keyInfoObj.isInsideSecureHardware();
            console.log("    Inside Secure Hardware (TEE/SE): " + insideSecureHardware);
            console.log("    Critical: " + keyInfoObj.isCritical());

            console.log("=".repeat(50) + "\n");

            // Perform Security Assessment
            performSecurityAssessment(keyInfoObj, keySize, userAuthRequired, insideSecureHardware);

        } catch (e) {
            console.log("    [!] Could not get KeyInfo: " + e);
        }
    }

    // =========================================
    // Security Assessment Engine
    // =========================================
    function performSecurityAssessment(keyInfoObj, keySize, userAuthRequired, insideSecureHardware) {
        console.log("\n\u26A0\uFE0F SECURITY ASSESSMENT \u26A0\uFE0F");
        console.log("=".repeat(50));

        var findings = [];

        // Check 1: User Authentication
        if (!userAuthRequired) {
            findings.push({
                severity: "HIGH",
                finding: "Key does NOT require user authentication",
                impact: "Key can be used without any user interaction or credential verification"
            });
        }

        // Check 2: Secure Hardware
        if (!insideSecureHardware) {
            findings.push({
                severity: "MEDIUM",
                finding: "Key NOT stored in secure hardware",
                impact: "Key material may be extractable from root compromise"
            });
        }

        // Check 3: Key Size
        if (keySize < 2048) {
            findings.push({
                severity: "HIGH",
                finding: "Key size too small: " + keySize + " bits",
                impact: "Weak key, vulnerable to brute force attacks"
            });
        } else if (keySize < 3072) {
            findings.push({
                severity: "LOW",
                finding: "Key size suboptimal: " + keySize + " bits",
                impact: "Consider 3072+ bits for RSA or 256+ bits for EC"
            });
        }

        // Check 4: Biometric Invalidation
        try {
            var invalidatedByBiometric = keyInfoObj.isInvalidatedByBiometricEnrollment();
            if (!invalidatedByBiometric && userAuthRequired) {
                findings.push({
                    severity: "MEDIUM",
                    finding: "Key not invalidated by new biometric enrollment",
                    impact: "Attackers can enroll new fingerprint to bypass authentication"
                });
            }
        } catch (e) {}

        // Check 5: Per-Operation Auth
        try {
            var authDuration = keyInfoObj.getUserAuthenticationValidityDurationSeconds();
            if (authDuration > 0 && userAuthRequired) {
                findings.push({
                    severity: "MEDIUM",
                    finding: "Auth time-bound: " + authDuration + "s",
                    impact: "Key reusable within time window without re-authentication"
                });
            }
        } catch (e) {}

        // Check 6: Key Origin
        var origin = keyInfoObj.getOrigin();
        if (origin === 2) { // IMPORTED-PLAINTEXT
            findings.push({
                severity: "HIGH",
                finding: "Key imported as plaintext",
                impact: "Key material may have been exposed during import"
            });
        } else if (origin === 4) { // UNKNOWN
            findings.push({
                severity: "LOW",
                finding: "Key origin unknown",
                impact: "Cannot verify how key was created"
            });
        }

        // Check 7: Key Validity Period
        try {
            var keyValidityEnd = keyInfoObj.getKeyValidityEnd();
            if (keyValidityEnd != null && keyValidityEnd.getTime() > 0) {
                var now = Java.use('java.util.Date').$new();
                var yearsUntilExpiry = (keyValidityEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24 * 365);
                if (yearsUntilExpiry > 5) {
                    findings.push({
                        severity: "LOW",
                        finding: "Key validity period too long",
                        impact: "Consider rotating keys more frequently"
                    });
                }
            }
        } catch (e) {}

        // Print findings
        if (findings.length === 0) {
            console.log("\u2705 No security issues found - key configuration looks good!");
        } else {
            console.log("\nFound " + findings.length + " issue(s):\n");

            var highCount = 0;
            var mediumCount = 0;
            var lowCount = 0;

            for (var i = 0; i < findings.length; i++) {
                var f = findings[i];
                var severityMarker = "";

                if (f.severity === "HIGH") {
                    severityMarker = "\uD83D\uDD34 HIGH";
                    highCount++;
                } else if (f.severity === "MEDIUM") {
                    severityMarker = "\uD83D\uDFE1 MEDIUM";
                    mediumCount++;
                } else {
                    severityMarker = "\uD83D\uDFE2 LOW";
                    lowCount++;
                }

                console.log(severityMarker + " - " + f.finding);
                console.log("         Impact: " + f.impact);
            }

            console.log("\nSummary: " + highCount + " HIGH, " + mediumCount + " MEDIUM, " + lowCount + " LOW");
        }

        console.log("=".repeat(50) + "\n");
    }

    // =========================================
    // Helper Functions (akabe1 patterns)
    // =========================================
    function getSecurityLevelString(level) {
        switch (level) {
            case 2: return "SECURITY_LEVEL_STRONGBOX (Strongest)";
            case 1: return "SECURITY_LEVEL_TRUSTED_ENVIRONMENT (TEE)";
            case 0: return "SECURITY_LEVEL_SOFTWARE (Weak!)";
            case -1: return "SECURITY_LEVEL_UNKNOWN_SECURE";
            case -2: return "SECURITY_LEVEL_UNKNOWN";
            default: return "Unknown (" + level + ")";
        }
    }

    function getKeyOriginString(origin) {
        switch (origin) {
            case 1: return "GENERATED-IN-KEYSTORE \u2705";
            case 2: return "IMPORTED-PLAINTEXT \u26A0\uFE0F";
            case 4: return "UNKNOWN";
            case 8: return "SECURELY-IMPORTED \u2705";
            default: return "Unknown (" + origin + ")";
        }
    }

    function getKeyPurposesString(purposes) {
        var purposeList = [];
        if ((purposes & 1) !== 0) purposeList.push("ENCRYPT");
        if ((purposes & 2) !== 0) purposeList.push("DECRYPT");
        if ((purposes & 4) !== 0) purposeList.push("SIGN/MAC");
        if ((purposes & 8) !== 0) purposeList.push("VERIFY-MAC");

        if (purposeList.length === 0) return "NONE \u26A0\uFE0F";
        return purposeList.join(" | ");
    }

    function getUserAuthTypeString(type) {
        switch (type) {
            case 0: return "UNDEFINED";
            case 1: return "AUTH_DEVICE_CREDENTIAL (PIN/Pattern/Password)";
            case 2: return "AUTH_BIOMETRIC_STRONG";
            case 3: return "AUTH_BIOMETRIC_WEAK";
            default: return "Unknown (" + type + ")";
        }
    }

    // =========================================
    // Hook KeyStore Operations
    // =========================================
    console.log("[*] Hooking KeyStore operations...\n");

    // KeyStore.getInstance
    var getInstance1 = KeyStore.getInstance.overload('java.lang.String');
    getInstance1.implementation = function(type) {
        console.log("[+] KeyStore.getInstance('" + type + "')");
        return getInstance1.call(this, type);
    };

    var getInstance2 = KeyStore.getInstance.overload('java.security.Provider', 'java.lang.String');
    getInstance2.implementation = function(provider, type) {
        console.log("[+] KeyStore.getInstance('" + type + "', provider: " + provider.getName() + ")");
        return getInstance2.call(this, provider, type);
    };

    // KeyStore.load
    try {
        var loadStream = KeyStore.load.overload('java.io.InputStream', '[C');
        loadStream.implementation = function(stream, password) {
            console.log("[+] KeyStore.load() with stream");
            if (password != null) {
                console.log("    Password provided: YES (length: " + password.length + ")");
            } else {
                console.log("    Password: null");
            }
            return loadStream.call(this, stream, password);
        };
    } catch (e) {}

    var loadNull = KeyStore.load.overload('java.security.KeyStore$LoadStoreParameter');
    loadNull.implementation = function(param) {
        console.log("[+] KeyStore.load() with parameter");
        return loadNull.call(this, param);
    };

    // KeyStore.setEntry
    try {
        var setEntry = KeyStore.setEntry.overload('java.lang.String', 'java.security.KeyStore$Entry', 'java.security.KeyStore$ProtectionParameter');
        setEntry.implementation = function(alias, entry, protParam) {
            console.log("[+] KeyStore.setEntry('" + alias + "')");

            // Check if it's a KeyStore.SecretKeyEntry
            try {
                var SecretKeyEntry = Java.use('java.security.KeyStore$SecretKeyEntry');
                var secretKeyEntry;
                try {
                    secretKeyEntry = Java.cast(entry, SecretKeyEntry.class);
                    if (secretKeyEntry) {
                        console.log("    Entry Type: SecretKeyEntry");
                    }
                } catch (castError) {}
            } catch (e) {}

            // Check if it's a KeyStore.PrivateKeyEntry
            try {
                var PrivateKeyEntry = Java.use('java.security.KeyStore$PrivateKeyEntry');
                var privateKeyEntry;
                try {
                    privateKeyEntry = Java.cast(entry, PrivateKeyEntry.class);
                    if (privateKeyEntry) {
                        console.log("    Entry Type: PrivateKeyEntry");
                    }
                } catch (castError) {}
            } catch (e) {}

            // Check protection parameter
            if (protParam != null) {
                console.log("    Protection Parameter: " + protParam.getClass().getName());
            }

            return setEntry.call(this, alias, entry, protParam);
        };
    } catch (e) {}

    // KeyStore.getKey
    var getKey = KeyStore.getKey.overload('java.lang.String', '[C');
    getKey.implementation = function(alias, password) {
        console.log("\n[+] \u27B4 KeyStore.getKey('" + alias + "')");
        if (password != null) {
            console.log("    Password provided: YES (length: " + password.length + ")");
        } else {
            console.log("    Password: null");
        }

        var result = getKey.call(this, alias, password);
        if (result != null) {
            console.log("    Key Algorithm: " + result.getAlgorithm());
            console.log("    Key Format: " + result.getFormat());

            // Track if this is after biometric auth
            if (biometricAuthDetected) {
                console.log("    \uD83D\uDC64 Note: Key access after biometric authentication");
                biometricAuthDetected = false;
            }
        }
        return result;
    };

    // KeyStore.deleteEntry
    var deleteEntry = KeyStore.deleteEntry;
    deleteEntry.implementation = function(alias) {
        console.log("[+] KeyStore.deleteEntry('" + alias + "')");
        return deleteEntry.call(this, alias);
    };

    // =========================================
    // Hook Key Generation Operations
    // =========================================
    console.log("[*] Hooking key generation operations...\n");

    // Hook KeyGenerator.init() (for symmetric keys)
    try {
        var KeyGenerator = Java.use('javax.crypto.KeyGenerator');
        var keyGeneratorInits = KeyGenerator.init.overloads;

        for (var i = 0; i < keyGeneratorInits.length; i++) {
            keyGeneratorInits[i].implementation = function() {
                var algorithm = this.getAlgorithm();
                console.log("\n[+] KeyGenerator.init() for algorithm: " + algorithm);

                // Log parameters if provided
                if (arguments.length > 0) {
                    if (arguments[0].getClass) {
                        console.log("    Parameter type: " + arguments[0].getClass().getName());
                    }
                }

                return this.init.apply(this, arguments);
            };
        }
    } catch (e) {
        console.log("[-] Could not hook KeyGenerator.init: " + e);
    }

    // Hook KeyPairGenerator.initialize() (for asymmetric keys)
    try {
        var KeyPairGenerator = Java.use('java.security.KeyPairGenerator');
        var keyPairGeneratorInits = KeyPairGenerator.initialize.overloads;

        for (var i = 0; i < keyPairGeneratorInits.length; i++) {
            keyPairGeneratorInits[i].implementation = function() {
                var algorithm = this.getAlgorithm();
                console.log("\n[+] KeyPairGenerator.initialize() for algorithm: " + algorithm);

                // Log parameters
                if (arguments.length > 0) {
                    for (var j = 0; j < arguments.length; j++) {
                        if (arguments[j] && arguments[j].getClass) {
                            console.log("    Parameter " + j + ": " + arguments[j].getClass().getName());
                        }
                    }
                }

                return this.initialize.apply(this, arguments);
            };
        }
    } catch (e) {
        console.log("[-] Could not hook KeyPairGenerator.initialize: " + e);
    }

    // =========================================
    // Hook Biometric Authentication (akabe1 patterns)
    // =========================================
    console.log("[*] Hooking biometric authentication...\n");

    // BiometricPrompt authenticate methods (Android P+)
    try {
        var BiometricPrompt = Java.use('android.hardware.biometrics.BiometricPrompt');

        // BiometricPrompt.authenticate(cancel, executor, callback)
        try {
            var biometricPromptAuth1 = BiometricPrompt.authenticate.overload('android.os.CancellationSignal', 'java.util.concurrent.Executor', 'android.hardware.biometrics.BiometricPrompt$AuthenticationCallback');
            biometricPromptAuth1.implementation = function(cancel, executor, callback) {
                console.log("\n\u27B4 [\uD83D\uDC64] BiometricPrompt.authenticate() detected");
                console.log("    Method: authenticate(cancel, executor, callback)");
                biometricAuthDetected = true;

                return biometricPromptAuth1.call(this, cancel, executor, callback);
            };
        } catch (e) {}

        // BiometricPrompt.authenticate(crypto, cancel, executor, callback)
        try {
            var biometricPromptAuth2 = BiometricPrompt.authenticate.overload('android.hardware.biometrics.BiometricPrompt$CryptoObject', 'android.os.CancellationSignal', 'java.util.concurrent.Executor', 'android.hardware.biometrics.BiometricPrompt$AuthenticationCallback');
            biometricPromptAuth2.implementation = function(crypto, cancel, executor, callback) {
                console.log("\n\u27B4 [\uD83D\uDC64] BiometricPrompt.authenticate() with CryptoObject detected");
                console.log("    Method: authenticate(crypto, cancel, executor, callback)");

                if (crypto != null) {
                    console.log("    \u2705 CryptoObject present: YES");
                    console.log("    Cipher: " + (crypto.getCipher() != null ? "YES" : "NO"));
                    console.log("    Signature: " + (crypto.getSignature() != null ? "YES" : "NO"));
                    console.log("    Mac: " + (crypto.getMac() != null ? "YES" : "NO"));
                }

                biometricAuthDetected = true;

                return biometricPromptAuth2.call(this, crypto, cancel, executor, callback);
            };
        } catch (e) {}

    } catch (e) {
        console.log("[-] BiometricPrompt not available (requires Android P+)");
    }

    // FingerprintManager authenticate (deprecated, Android M-P)
    try {
        var FingerprintManagerCompat = Java.use('androidx.core.hardware.fingerprint.FingerprintManagerCompat');
        var androidxAuth = FingerprintManagerCompat.authenticate.overload('android.hardware.fingerprint.FingerprintManager$CryptoObject', 'android.os.CancellationSignal', 'int', 'android.hardware.fingerprint.FingerprintManager$AuthenticationCallback', 'android.os.Handler');

        androidxAuth.implementation = function(crypto, cancel, flags, callback, handler) {
            console.log("\n\u27B4 [\uD83D\uDC64] androidx FingerprintManagerCompat.authenticate() detected");
            console.log("    Flags: " + flags);

            if (crypto != null) {
                console.log("    \u2705 CryptoObject present: YES");
            }

            biometricAuthDetected = true;

            return androidxAuth.call(this, crypto, cancel, flags, callback, handler);
        };
    } catch (e) {
        try {
            var FingerprintManager = Java.use('android.hardware.fingerprint.FingerprintManager');
            var fingerprintManagerAuth = FingerprintManager.authenticate.overload('android.hardware.fingerprint.FingerprintManager$CryptoObject', 'android.os.CancellationSignal', 'int', 'android.hardware.fingerprint.FingerprintManager$AuthenticationCallback', 'android.os.Handler');

            fingerprintManagerAuth.implementation = function(crypto, cancel, flags, callback, handler) {
                console.log("\n\u27B4 [\uD83D\uDC64] FingerprintManager.authenticate() detected (deprecated API)");
                console.log("    Flags: " + flags);

                if (crypto != null) {
                    console.log("    \u2705 CryptoObject present: YES");
                }

                biometricAuthDetected = true;

                return fingerprintManagerAuth.call(this, crypto, cancel, flags, callback, handler);
            };
        } catch (e) {
            console.log("[-] FingerprintManager not available");
        }
    }

    // =========================================
    // Hook Cipher Operations (akabe1 patterns)
    // =========================================
    console.log("[*] Hooking Cipher operations...\n");

    try {
        var Cipher = Java.use('javax.crypto.Cipher');
        var cipherInits = Cipher.init.overloads;

        for (var i = 0; i < cipherInits.length; i++) {
            cipherInits[i].implementation = function() {
                var opmode = arguments[0];
                var algorithm = this.getAlgorithm();

                try {
                    // Get operation mode string
                    var opmodeStr = "";
                    var modeField = null;
                    try {
                        modeField = Cipher.class.getDeclaredField("DECRYPT_MODE");
                        modeField.setAccessible(true);
                        if (opmode === modeField.getInt(null)) opmodeStr = "DECRYPT";
                    } catch (e) {}

                    if (opmodeStr === "") {
                        try {
                            modeField = Cipher.class.getDeclaredField("ENCRYPT_MODE");
                            modeField.setAccessible(true);
                            if (opmode === modeField.getInt(null)) opmodeStr = "ENCRYPT";
                        } catch (e) {}
                    }

                    if (opmodeStr === "") opmodeStr = opmode.toString();

                    console.log("\n[+] Cipher.init(" + opmodeStr + ") for algorithm: " + algorithm);

                    // Check if key is from Android Keystore
                    if (arguments.length > 1 && arguments[1] != null) {
                        var keyClassName = arguments[1].getClass().getName();
                        var isAndroidKeystoreKey = androidKeystoreKeyTypes.indexOf(keyClassName) !== -1;

                        if (isAndroidKeystoreKey) {
                            console.log("    \u2705 Key from Android Keystore: " + keyClassName);

                            // Perform detailed key analysis
                            try {
                                var keyFactoryObj = null;
                                try {
                                    keyFactoryObj = KeyFactory.getInstance(arguments[1].getAlgorithm(), 'AndroidKeyStore');
                                } catch (err) {
                                    keyFactoryObj = SecretKeyFactory.getInstance(arguments[1].getAlgorithm(), 'AndroidKeyStore');
                                }

                                var keyInfo = keyFactoryObj.getKeySpec(arguments[1], KeyInfo.class);
                                var keyInfoObj;
                                try {
                                    keyInfoObj = Java.cast(keyInfo, KeyInfo);
                                } catch (castError) {
                                    console.log("    [!] Could not cast to KeyInfo: " + castError);
                                }

                                if (!keyInfoObj) {
                                    return this.init.apply(this, arguments);
                                }
                                var alias = keyInfoObj.getKeystoreAlias();

                                console.log("    Alias: " + alias);
                                console.log("    User Auth Required: " + keyInfoObj.isUserAuthenticationRequired());

                                // Track to avoid duplicate detailed output
                                if (trackedKeystoreAliases.indexOf(alias) === -1) {
                                    console.log("    [First use - performing detailed analysis...]");
                                    trackedKeystoreAliases.push(alias);
                                } else {
                                    console.log("    [Already analyzed - use keystore inspection for full details]");
                                }

                                // Check if this is after biometric auth
                                if (biometricAuthDetected) {
                                    console.log("    \uD83D\uDC64 Used after biometric authentication");
                                    biometricAuthDetected = false;
                                }

                            } catch (e) {
                                console.log("    [!] Could not analyze key: " + e);
                            }
                        } else {
                            console.log("    Key type: " + keyClassName);
                        }
                    }

                } catch (e) {
                    console.log("[-] Error in Cipher hook: " + e);
                }

                return this.init.apply(this, arguments);
            };
        }
    } catch (e) {
        console.log("[-] Could not hook Cipher.init: " + e);
    }

    // =========================================
    // Android Keystore Security Checker
    // =========================================
    function runKeystoreSecurityCheck() {
        console.log("\n" + "=".repeat(60));
        console.log("ANDROID KEYSTORE SECURITY CHECK (ENHANCED)");
        console.log("=".repeat(60));
        console.log("\nEnhancements inspired by akabe1's keystore-spy");
        console.log("https://gist.github.com/akabe1/c9d285ad3d07e7f47fc6d1599d01c8cf\n");

        console.log("[*] Checking AndroidKeyStore...\n");
        inspectKeystore('AndroidKeyStore', null);

        console.log("\n" + "=".repeat(60));
        console.log("[*] Keystore inspection complete");
        console.log("=".repeat(60) + "\n");
    }

    // Run security check
    setTimeout(function() {
        runKeystoreSecurityCheck();
    }, 2000);

});
