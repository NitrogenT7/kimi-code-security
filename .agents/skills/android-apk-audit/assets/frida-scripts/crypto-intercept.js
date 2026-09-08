/**
 * Cryptographic Operations Intercept
 *
 * Hooks and logs all cryptographic operations:
 * - javax.crypto.Cipher: getInstance, init, doFinal, update
 * - java.security.MessageDigest: getInstance, update, digest
 * - javax.crypto.Mac: getInstance, init, doFinal
 * - javax.crypto.spec.SecretKeySpec: constructor
 * - java.security.Signature: getInstance, initSign, initVerify, sign, verify
 * - java.security.KeyFactory: getInstance
 * - javax.crypto.KeyGenerator: getInstance, generateKey
 * - java.security.KeyPairGenerator: getInstance, generateKeyPair
 *
 * Compatible with: Frida 16.x+ and Android 7-16
 * Usage: frida -U -f <package_name> -l crypto-intercept.js
 */

Java.perform(function() {
    console.log("[*] Crypto Intercept Script Started");

    // Helper function to convert byte array to hex string
    function bytesToHex(bytes) {
        if (!bytes) return "null";
        var hex = "";
        for (var i = 0; i < bytes.length; i++) {
            var b = bytes[i] & 0xff;
            hex += ("0" + b.toString(16)).slice(-2);
        }
        return hex;
    }

    // Helper function to convert byte array to string if readable
    function bytesToString(bytes) {
        if (!bytes) return "null";
        try {
            var String = Java.use("java.lang.String");
            var str = String.$new(bytes);
            // Check if it's printable ASCII
            var isPrintable = true;
            for (var i = 0; i < str.length(); i++) {
                var code = str.charCodeAt(i);
                if (code < 32 || code > 126) {
                    isPrintable = false;
                    break;
                }
            }
            if (isPrintable) {
                return str;
            }
        } catch (e) {
            // Not a valid string
        }
        return bytesToHex(bytes);
    }

    // ========================================
    // 1. Hook javax.crypto.Cipher
    // ========================================
    try {
        var Cipher = Java.use("javax.crypto.Cipher");

        // FIX: Save original before replacing — use .call(this, ...) to invoke original
        var originalGetInstance1 = Cipher.getInstance.overload("java.lang.String");
        originalGetInstance1.implementation = function(transformation) {
            console.log("[+] Cipher.getInstance() - Transformation: " + transformation);
            return originalGetInstance1.call(this, transformation);
        };

        var originalGetInstance2 = Cipher.getInstance.overload("java.lang.String", "java.lang.String");
        originalGetInstance2.implementation = function(transformation, provider) {
            console.log("[+] Cipher.getInstance() - Transformation: " + transformation + ", Provider: " + provider);
            return originalGetInstance2.call(this, transformation, provider);
        };

        var originalInit1 = Cipher.init.overload("int", "java.security.Key");
        originalInit1.implementation = function(opmode, key) {
            var modeStr = "";
            if (opmode === 1) modeStr = "ENCRYPT";
            else if (opmode === 2) modeStr = "DECRYPT";
            else if (opmode === 3) modeStr = "WRAP";
            else if (opmode === 4) modeStr = "UNWRAP";

            console.log("[+] Cipher.init() - Mode: " + modeStr + ", Key algorithm: " + key.getAlgorithm());
            originalInit1.call(this, opmode, key);
        };

        var originalInit2 = Cipher.init.overload("int", "java.security.cert.Certificate");
        originalInit2.implementation = function(opmode, cert) {
            var modeStr = "";
            if (opmode === 1) modeStr = "ENCRYPT";
            else if (opmode === 2) modeStr = "DECRYPT";

            console.log("[+] Cipher.init() - Mode: " + modeStr + ", Certificate");
            originalInit2.call(this, opmode, cert);
        };

        var originalInit3 = Cipher.init.overload("int", "java.security.Key", "java.security.spec.AlgorithmParameterSpec");
        originalInit3.implementation = function(opmode, key, params) {
            var modeStr = "";
            if (opmode === 1) modeStr = "ENCRYPT";
            else if (opmode === 2) modeStr = "DECRYPT";

            console.log("[+] Cipher.init() - Mode: " + modeStr + ", Key algorithm: " + key.getAlgorithm() + ", Params: " + params.getClass().getName());
            originalInit3.call(this, opmode, key, params);
        };

        var originalInit4 = Cipher.init.overload("int", "java.security.Key", "java.security.spec.AlgorithmParameterSpec", "java.security.SecureRandom");
        originalInit4.implementation = function(opmode, key, params, random) {
            var modeStr = "";
            if (opmode === 1) modeStr = "ENCRYPT";
            else if (opmode === 2) modeStr = "DECRYPT";

            console.log("[+] Cipher.init() - Mode: " + modeStr + ", Key algorithm: " + key.getAlgorithm() + ", Params: " + params.getClass().getName() + ", SecureRandom");
            originalInit4.call(this, opmode, key, params, random);
        };

        var originalDoFinal1 = Cipher.doFinal.overload();
        originalDoFinal1.implementation = function() {
            var result = originalDoFinal1.call(this);
            console.log("[+] Cipher.doFinal() - Output: " + bytesToString(result));
            return result;
        };

        var originalDoFinal2 = Cipher.doFinal.overload("[B");
        originalDoFinal2.implementation = function(input) {
            console.log("[+] Cipher.doFinal() - Input: " + bytesToString(input));
            var result = originalDoFinal2.call(this, input);
            console.log("[+] Cipher.doFinal() - Output: " + bytesToString(result));
            return result;
        };

        console.log("[+] Cipher hooked successfully");
    } catch (e) {
        console.log("[!] Cipher hook failed: " + e.message);
    }

    // ========================================
    // 2. Hook java.security.MessageDigest
    // ========================================
    try {
        var MessageDigest = Java.use("java.security.MessageDigest");

        var originalMDGetInstance = MessageDigest.getInstance.overload("java.lang.String");
        originalMDGetInstance.implementation = function(algorithm) {
            console.log("[+] MessageDigest.getInstance() - Algorithm: " + algorithm);
            return originalMDGetInstance.call(this, algorithm);
        };

        var originalMDUpdate = MessageDigest.update.overload("[B");
        originalMDUpdate.implementation = function(input) {
            console.log("[+] MessageDigest.update() - Input: " + bytesToString(input));
            originalMDUpdate.call(this, input);
        };

        var originalMDDigest1 = MessageDigest.digest.overload();
        originalMDDigest1.implementation = function() {
            var result = originalMDDigest1.call(this);
            console.log("[+] MessageDigest.digest() - Hash: " + bytesToHex(result));
            return result;
        };

        var originalMDDigest2 = MessageDigest.digest.overload("[B");
        originalMDDigest2.implementation = function(input) {
            console.log("[+] MessageDigest.digest() - Input: " + bytesToString(input));
            var result = originalMDDigest2.call(this, input);
            console.log("[+] MessageDigest.digest() - Hash: " + bytesToHex(result));
            return result;
        };

        console.log("[+] MessageDigest hooked successfully");
    } catch (e) {
        console.log("[!] MessageDigest hook failed: " + e.message);
    }

    // ========================================
    // 3. Hook javax.crypto.Mac
    // ========================================
    try {
        var Mac = Java.use("javax.crypto.Mac");

        var originalMacGetInstance = Mac.getInstance.overload("java.lang.String");
        originalMacGetInstance.implementation = function(algorithm) {
            console.log("[+] Mac.getInstance() - Algorithm: " + algorithm);
            return originalMacGetInstance.call(this, algorithm);
        };

        var originalMacInit = Mac.init.overload("java.security.Key");
        originalMacInit.implementation = function(key) {
            console.log("[+] Mac.init() - Key algorithm: " + key.getAlgorithm());
            originalMacInit.call(this, key);
        };

        var originalMacDoFinal1 = Mac.doFinal.overload();
        originalMacDoFinal1.implementation = function() {
            var result = originalMacDoFinal1.call(this);
            console.log("[+] Mac.doFinal() - Output: " + bytesToHex(result));
            return result;
        };

        var originalMacDoFinal2 = Mac.doFinal.overload("[B");
        originalMacDoFinal2.implementation = function(input) {
            console.log("[+] Mac.doFinal() - Input: " + bytesToString(input));
            var result = originalMacDoFinal2.call(this, input);
            console.log("[+] Mac.doFinal() - Output: " + bytesToHex(result));
            return result;
        };

        console.log("[+] Mac hooked successfully");
    } catch (e) {
        console.log("[!] Mac hook failed: " + e.message);
    }

    // ========================================
    // 4. Hook javax.crypto.spec.SecretKeySpec
    // ========================================
    try {
        var SecretKeySpec = Java.use("javax.crypto.spec.SecretKeySpec");

        var originalSKSInit1 = SecretKeySpec.$init.overload("[B", "java.lang.String");
        originalSKSInit1.implementation = function(key, algorithm) {
            console.log("[!] SecretKeySpec() - Key: " + bytesToHex(key) + ", Algorithm: " + algorithm);
            originalSKSInit1.call(this, key, algorithm);
        };

        var originalSKSInit2 = SecretKeySpec.$init.overload("[B", "java.lang.String", "int", "int");
        originalSKSInit2.implementation = function(key, algorithm, offset, len) {
            var keyBytes = [];
            for (var i = 0; i < len; i++) {
                keyBytes.push(key[offset + i]);
            }
            var keyArray = Java.array('byte', keyBytes);
            console.log("[!] SecretKeySpec() - Key: " + bytesToHex(keyArray) + ", Algorithm: " + algorithm + ", Offset: " + offset + ", Len: " + len);
            originalSKSInit2.call(this, key, algorithm, offset, len);
        };

        console.log("[+] SecretKeySpec hooked successfully");
    } catch (e) {
        console.log("[!] SecretKeySpec hook failed: " + e.message);
    }

    // ========================================
    // 5. Hook java.security.Signature
    // ========================================
    try {
        var Signature = Java.use("java.security.Signature");

        var originalSigGetInstance = Signature.getInstance.overload("java.lang.String");
        originalSigGetInstance.implementation = function(algorithm) {
            console.log("[+] Signature.getInstance() - Algorithm: " + algorithm);
            return originalSigGetInstance.call(this, algorithm);
        };

        var originalSigInitSign = Signature.initSign.overload("java.security.PrivateKey");
        originalSigInitSign.implementation = function(privateKey) {
            console.log("[+] Signature.initSign() - Key algorithm: " + privateKey.getAlgorithm());
            originalSigInitSign.call(this, privateKey);
        };

        var originalSigInitVerify = Signature.initVerify.overload("java.security.PublicKey");
        originalSigInitVerify.implementation = function(publicKey) {
            console.log("[+] Signature.initVerify() - Key algorithm: " + publicKey.getAlgorithm());
            originalSigInitVerify.call(this, publicKey);
        };

        var originalSigSign = Signature.sign.overload();
        originalSigSign.implementation = function() {
            var result = originalSigSign.call(this);
            console.log("[+] Signature.sign() - Signature: " + bytesToHex(result));
            return result;
        };

        var originalSigVerify = Signature.verify.overload("[B");
        originalSigVerify.implementation = function(signature) {
            console.log("[+] Signature.verify() - Signature: " + bytesToHex(signature));
            return originalSigVerify.call(this, signature);
        };

        console.log("[+] Signature hooked successfully");
    } catch (e) {
        console.log("[!] Signature hook failed: " + e.message);
    }

    // ========================================
    // 6. Hook KeyFactory and KeyGenerator
    // ========================================
    try {
        var KeyFactory = Java.use("java.security.KeyFactory");
        var originalKFGetInstance = KeyFactory.getInstance.overload("java.lang.String");
        originalKFGetInstance.implementation = function(algorithm) {
            console.log("[+] KeyFactory.getInstance() - Algorithm: " + algorithm);
            return originalKFGetInstance.call(this, algorithm);
        };
        console.log("[+] KeyFactory hooked successfully");
    } catch (e) {
        console.log("[!] KeyFactory hook failed: " + e.message);
    }

    try {
        var KeyGenerator = Java.use("javax.crypto.KeyGenerator");
        var originalKGGetInstance = KeyGenerator.getInstance.overload("java.lang.String");
        originalKGGetInstance.implementation = function(algorithm) {
            console.log("[+] KeyGenerator.getInstance() - Algorithm: " + algorithm);
            return originalKGGetInstance.call(this, algorithm);
        };
        var originalKGGenerateKey = KeyGenerator.generateKey;
        originalKGGenerateKey.implementation = function() {
            var key = originalKGGenerateKey.call(this);
            console.log("[+] KeyGenerator.generateKey() - Key algorithm: " + key.getAlgorithm() + ", Format: " + key.getFormat());
            return key;
        };
        console.log("[+] KeyGenerator hooked successfully");
    } catch (e) {
        console.log("[!] KeyGenerator hook failed: " + e.message);
    }

    // ========================================
    // 7. Hook KeyPairGenerator
    // ========================================
    try {
        var KeyPairGenerator = Java.use("java.security.KeyPairGenerator");
        var originalKPGGetInstance = KeyPairGenerator.getInstance.overload("java.lang.String");
        originalKPGGetInstance.implementation = function(algorithm) {
            console.log("[+] KeyPairGenerator.getInstance() - Algorithm: " + algorithm);
            return originalKPGGetInstance.call(this, algorithm);
        };
        var originalKPGGenerateKeyPair = KeyPairGenerator.generateKeyPair;
        originalKPGGenerateKeyPair.implementation = function() {
            var keyPair = originalKPGGenerateKeyPair.call(this);
            console.log("[+] KeyPairGenerator.generateKeyPair() - Public: " + keyPair.getPublic().getAlgorithm() + ", Private: " + keyPair.getPrivate().getAlgorithm());
            return keyPair;
        };
        console.log("[+] KeyPairGenerator hooked successfully");
    } catch (e) {
        console.log("[!] KeyPairGenerator hook failed: " + e.message);
    }

    console.log("[*] Crypto Intercept Script Completed");
});
