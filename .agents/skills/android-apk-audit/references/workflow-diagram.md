# Android Pentesting Workflow Diagrams

Mermaid-format workflow diagrams for methodology visualization and client presentations.

---

## 6-Phase Pentesting Workflow

```mermaid
flowchart TB
    subgraph PHASE0["PHASE 0: Decode & Detect"]
        A[Obtain APK] --> B[APKTool Decode]
        B --> C[JADX Decompile]
        C --> D[APKiD Framework Detection]
        D --> E{Framework?}
        E -->|React Native| F[Analyze Hermes Engine]
        E -->|Flutter| G[Analyze libflutter.so]
        E -->|Cordova| H[Analyze www/cordova.js]
        E -->|Xamarin| I[Analyze libmonodroid.so]
        E -->|Native| J[Analyze .so libraries]
    end

    subgraph PHASE1["PHASE 1: Attack Surface Mapping"]
        K[Analyze AndroidManifest] --> L{Exported Components?}
        L -->|Activities| M[Review intent filters<br/>permission requirements]
        L -->|Services| N[Review IPC patterns]
        L -->|Receivers| O[Review broadcast security]
        L -->|Providers| P[Review URI permissions<br/>path permissions]
        M --> Q[Extract deep link schemes]
        N --> Q
        O --> Q
        P --> Q
        Q --> R[Document attack surface]
    end

    subgraph PHASE2["PHASE 2: Targeted Triage"]
        S[Scoped Grep Patterns] --> T{Results?}
        T -->|WebView sinks| U[loadUrl/evaluateJavascript]
        T -->|IPC sources| V[getIntent/onNewIntent]
        T -->|Hardcoded secrets| W[API keys/tokens]
        T -->|Weak crypto| X[DES/MD5/SHA1]
        T -->|Insecure storage| Y[SharedPreferences]
        T -->|Native bridges| Z[System.loadLibrary]
        U --> AA[Flag for review]
        V --> AA
        W --> AA
        X --> AA
        Y --> AA
        Z --> AA
    end

    subgraph PHASE3["PHASE 3: Data Flow Tracing"]
        AB[Source-to-Sink Analysis] --> AC{Hook Found?}
        AC -->|Direct flow| AD[Report as CONFIRMED]
        AC -->|Indirect flow| AE[Report as LIKELY]
        AC -->|Dynamic/Reflective| AF[Mark for Dynamic]
        AC -->|Native boundary| AF
        AD --> AG[Assign CVSS 4.0]
        AE --> AG
        AF --> AH[Queue for Frida]
    end

    subgraph PHASE4["PHASE 4: Dynamic Analysis"]
        AI[Frida Spawn] --> AJ[Load Bypass Scripts]
        AJ --> AK[Load Monitor Scripts]
        AK --> AL[Verify Findings]
        AL --> AM{Runtime Confirmation?}
        AM -->|Confirmed| AN[Update to CONFIRMED]
        AM -->|Not Confirmed| AO[Keep as LIKELY/Needs Dynamic]
    end

    subgraph PHASE5["PHASE 5: Classification & Reporting"]
        AP[Assign AUDIT IDs] --> AQ[Calculate CVSS 4.0]
        AQ --> AR[Map to OWASP M10]
        AR --> AS[Generate Finding Cards]
        AS --> AT[Executive Summary]
        AT --> AU[Remediation Roadmap]
    end

    PHASE0 --> PHASE1
    PHASE1 --> PHASE2
    PHASE2 --> PHASE3
    PHASE3 --> PHASE4
    PHASE4 -->|If dynamic needed| PHASE4
    PHASE4 -->|Findings complete| PHASE5
    PHASE3 -->|Static sufficient| PHASE5
```

---

## Triage Decision Tree

```mermaid
flowchart TD
    START{Component Type} --> ACTIVITY[Activity]
    START --> SERVICE[Service]
    START --> RECEIVER[Receiver]
    START --> PROVIDER[Provider]
    START --> WEBVIEW[WebView]
    START --> DEEPLINK[Deep Link]
    START --> CRYPTO[Crypto/Keys]
    START --> STORAGE[Data Storage]
    START --> NETWORK[Network]

    ACTIVITY -->|exported=true| ACT1{android:permission?}
    ACT1 -->|None| V1[VULNERABLE<br/>Exported without protection]
    ACT1 -->|Defined| ACT2{Check permission level}
    ACT2 -->|signature| V2[Potential issue<br/>Verify signature level]
    ACT2 -->|dangerous| ACT3[Review dangerous flags]
    ACT3 -->|No prompt| V3[VULNERABLE<br/>Prompt bypass possible]
    ACT3 -->|With prompt| OK1[OK - User prompt required]

    SERVICE -->|exported=true| SERV1{android:permission?}
    SERV1 -->|None| V4[VULNERABLE<br/>Unprotected service]
    SERV1 -->|Defined| SERV2[Verify permission]

    RECEIVER -->|exported=true| REC1{android:permission?}
    REC1 -->|None| V5[VULNERABLE<br/>Any app can send broadcast]
    REC1 -->|Defined| REC2[Check protection level]

    PROVIDER -->|exported=true| PROV1{readPermission?}
    PROV1 -->|None| V6[VULNERABLE<br/>No read protection]
    PROV1 -->|Defined| PROV2[Check writePermission]
    PROV2 -->|None| V7[VULNERABLE<br/>No write protection]
    PROV2 -->|Defined| PROV3[Check path permissions]
    PROV3 -->|Wildcard| V8[VULNERABLE<br/>Path traversal possible]

    WEBVIEW -->|JavaScript enabled| WV1{addJavascriptInterface?}
    WV1 -->|Yes - Android 4.2-| V9[CRITICAL<br/>Universal XSS possible]
    WV1 -->|Yes - 4.2+| WV2[verifyJavascriptBridge?]
    WV2 -->|Not verified| V9
    WV2 -->|Verified| WV3[Check URL loading]
    WV3 -->|loadUrl with user input| V10[XSS via URL injection]
    WV3 -->|No user input| OK2[OK]

    DEEPLINK -->|scheme defined| DL1{Validate input?}
    DL1 -->|No validation| V11[VULNERABLE<br/>Deep link injection]
    DL1 -->|Validated| DL2[Check for intent:// redirect]
    DL2 -->|No check| V12[Open redirect possible]
    DL2 -->|Checked| OK3[OK]

    CRYPTO -->|Algorithm| CRYP1{DES/MD5/SHA1?}
    CRYP1 -->|Yes| V13[MEDIUM<br/>Weak crypto algorithm]
    CRYP1 -->|No| CRYP2{Key management?}
    CRYP2 -->|Hardcoded key| V14[HIGH<br/>Hardcoded key found]
    CRYP2 -->|AndroidKeyStore| CRYP3{Certificate pinning?}
    CRYP3 -->|No| V15[MEDIUM<br/>No certificate pinning]

    STORAGE -->|MODE_WORLD_READABLE| V16[VULNERABLE<br/>Other apps can read]
    STORAGE -->|MODE_WORLD_WRITABLE| V17[VULNERABLE<br/>Other apps can write]
    STORAGE -->|No encryption| V18[MEDIUM<br/>Sensitive data unencrypted]
    STORAGE -->|Encrypted| OK4[Review encryption quality]

    NETWORK -->|HTTP URL| V19[MEDIUM<br/>Cleartext traffic]
    NETWORK -->|HTTPS no pinning| V15[MEDIUM<br/>No certificate pinning]
    NETWORK -->|Self-signed cert| V20[LOW<br/>Trusting user certs]

    V1 --> REPORT[Add to Report]
    V2 --> REPORT
    V3 --> REPORT
    V4 --> REPORT
    V5 --> REPORT
    V6 --> REPORT
    V7 --> REPORT
    V8 --> REPORT
    V9 --> REPORT
    V10 --> REPORT
    V11 --> REPORT
    V12 --> REPORT
    V13 --> REPORT
    V14 --> REPORT
    V15 --> REPORT
    V16 --> REPORT
    V17 --> REPORT
    V18 --> REPORT
    V19 --> REPORT
    V20 --> REPORT
    OK1 --> DONE[Continue]
    OK2 --> DONE
    OK3 --> DONE
    OK4 --> DONE
    DONE --> END

    REPORT --> END
```

---

## SSL Pinning Bypass Decision Chart

```mermaid
flowchart TD
    START{SSL Pinning Bypass?} --> NEED[Need to intercept traffic]

    NEED --> IS_BYPASSED{Pinning bypass works?}
    IS_BYPASSED -->|Yes| SUCCESS[Continue testing]
    IS_BYPASSED -->|No| IDENTIFY[Identify TLS library]

    IDENTIFY --> LIBRARY{Which library?}
    LIBRARY -->|OkHttp| OKHTTP[Try ssl-pinning-bypass.js]
    LIBRARY -->|HttpURLConnection| HTTPURL[Try TrustManager hook]
    LIBRARY -->|WebView| WEBVIEW[Try WebView SSL hook]
    LIBRARY -->|Custom TrustManager| CUSTOM[Write custom hook]
    LIBRARY -->|React Native| RN[Try RN-specific bypass]
    LIBRARY -->|Flutter| FLUTTER[Try Flutter channel hook]

    OKHTTP --> WORKED1{Worked?}
    HTTPURL --> WORKED2{Worked?}
    WEBVIEW --> WORKED3{Worked?}
    CUSTOM --> WORKED4{Worked?}
    RN --> WORKED5{Worked?}
    FLUTTER --> WORKED6{Worked?}

    WORKED1 -->|Yes| SUCCESS
    WORKED1 -->|No| NATIVE[Try native hooking]
    WORKED2 -->|No| NATIVE
    WORKED3 -->|No| NATIVE
    WORKED4 -->|No| NATIVE
    WORKED5 -->|No| NATIVE
    WORKED6 -->|No| NATIVE

    NATIVE --> NI[Find TLS library .so]
    NI --> OFFSET[Locate SSL functions]
    OFFSET --> BORING{Is BoringSSL?}
    BORING -->|Yes| BORING_HOOK[Use rasp-bypass.md]
    BORING -->|No| GENERIC_HOOK[Use generic native-hook.js]

    BORING_HOOK --> FINAL_SUCCESS
    GENERIC_HOOK --> FINAL_SUCCESS

    FINAL_SUCCESS --> DOCUMENT[Document bypass method]

    DOCUMENT --> END
```

---

## Frida Script Selection Flowchart

```mermaid
flowchart TD
    START[Start Dynamic Analysis] --> GOAL{What's your goal?}

    GOAL -->|Bypass protections| BP[Bypass protections]
    GOAL -->|Monitor behavior| MON[Monitor app behavior]
    GOAL -->|Investigate specific| INV[Investigate specific area]
    GOAL -->|Trace execution| TRC[Trace execution flow]

    BP --> THREAT{What to bypass?}

    THREAT -->|SSL Pinning| SSL1[ssl-pinning-bypass.js]
    THREAT -->|Root Detection| ROOT1[root-detection-bypass.js]
    THREAT -->|Biometric Auth| BIO1[biometric-bypass.js]
    THREAT -->|Frida Detection| ANTI1[anti-frida-bypass.js]
    THREAT -->|RASP| RASP1[rasp-bypass.js]
    THREAT -->|Multiple| MULTI[Load all bypass scripts]

    MON --> AREA{What to monitor?}

    AREA -->|Intents/Broadcasts| INT1[intent-logger.js]
    AREA -->|IPC/Deep links| IPC1[ipc-abuse-helper.js]
    AREA -->|Network traffic| NET1[network-interceptor.js]
    AREA -->|File operations| FILE1[android-file-access-monitor.js]
    AREA -->|WebView| WV1[webview-monitor.js]
    AREA -->|All IPC| ALL_IPC[intent-logger.js + ipc-abuse-helper.js]

    INV --> AREA_INV{What to investigate?}

    AREA_INV -->|SharedPreferences| SP1[shared-prefs-dumper.js]
    AREA_INV -->|JWT/Tokens| JWT1[jwt-token-monitor.js]
    AREA_INV -->|Keystore| KS1[keystore-inspector.js]
    AREA_INV -->|Crypto operations| CRYPTO1[crypto-intercept.js]
    AREA_INV -->|Specific class| METHOD1[method-tracer.js]

    TRC --> TRACE_TYPE{What to trace?}

    TRACE_TYPE -->|JNI boundary| JNI1[jni-tracer.js]
    TRACE_TYPE -->|Native functions| NAT1[native-hook.js]
    TRACE_TYPE -->|Method calls| MTRACE1[method-tracer.js]
    TRACE_TYPE -->|Dex loading| DEX1[dexdump.js]

    SSL1 --> LOAD[Load script with frida]
    ROOT1 --> LOAD
    BIO1 --> LOAD
    ANTI1 --> LOAD
    RASP1 --> LOAD
    MULTI --> LOAD
    INT1 --> LOAD
    IPC1 --> LOAD
    NET1 --> LOAD
    FILE1 --> LOAD
    WV1 --> LOAD
    ALL_IPC --> LOAD
    SP1 --> LOAD
    JWT1 --> LOAD
    KS1 --> LOAD
    CRYPTO1 --> LOAD
    METHOD1 --> LOAD
    JNI1 --> LOAD
    NAT1 --> LOAD
    MTRACE1 --> LOAD
    DEX1 --> LOAD

    LOAD --> COMMAND[frida -U -f pkg -l script.js]
    COMMAND --> RESULT{Results?}

    RESULT -->|Not working| ADJUST[Tune script or escalate]
    RESULT -->|Working| DOCUMENT[Document findings]
    ADJUST --> THREAT
    DOCUMENT --> DONE[Continue pentest]
```

---

## CVSS Severity Calculation Flow

```mermaid
flowchart TD
    START[Start CVSS Scoring] --> METRICS[Identify Base Metrics]

    METRICS --> AV{Attack Vector}
    AV -->|Network N| AV_SCORE[Highest]
    AV -->|Adjacent A| AV_SCORE
    AV -->|Local L| AV_SCORE[Medium]
    AV -->|Physical P| AV_SCORE[Lowest]

    METRICS --> AC{Attack Complexity}
    AC -->|Low L| AC_SCORE[Higher severity]
    AC -->|High H| AC_SCORE[Lower severity]

    METRICS --> AT{Attack Requirements}
    AT -->|None N| AT_SCORE[Higher severity]
    AT -->|Present P| AT_SCORE[Lower severity]

    METRICS --> PR{Privileges Required}
    PR -->|None N| PR_SCORE[Highest]
    PR -->|Low L| PR_SCORE[Medium]
    PR -->|High H| PR_SCORE[Lowest]

    METRICS --> UI{User Interaction}
    UI -->|None N| UI_SCORE[Highest]
    UI -->|Passive P| UI_SCORE[Medium]
    UI -->|Active A| UI_SCORE[Lowest]

    METRICS --> VC{VC - Confidentiality}
    VC -->|High H| VC_SCORE[+High impact]
    VC -->|Low L| VC_SCORE[+Low impact]
    VC -->|None N| VC_SCORE[+No impact]

    METRICS --> VI{VI - Integrity}
    VI -->|High H| VI_SCORE[+High impact]
    VI -->|Low L| VI_SCORE[+Low impact]
    VI -->|None N| VI_SCORE[+No impact]

    METRICS --> VA{VA - Availability}
    VA -->|High H| VA_SCORE[+High impact]
    VA -->|Low L| VA_SCORE[+Low impact]
    VA -->|None N| VA_SCORE[+No impact]

    AV_SCORE --> CALC[Calculate Base Score]
    AC_SCORE --> CALC
    AT_SCORE --> CALC
    PR_SCORE --> CALC
    UI_SCORE --> CALC
    VC_SCORE --> CALC
    VI_SCORE --> CALC
    VA_SCORE --> CALC

    CALC --> SCORE[Base Score 0.0-10.0]

    SCORE --> RATING{Rating?}
    RATING -->|9.0-10.0| CRIT[CRITICAL]
    RATING -->|7.0-8.9| HIGH[HIGH]
    RATING -->|4.0-6.9| MED[MEDIUM]
    RATING -->|0.1-3.9| LOW[LOW]
    RATING -->|0.0| NONE[NONE]
```

---

## Finding Documentation Flow

```mermaid
flowchart LR
    subgraph DISCOVERY
        A[Static Analysis] --> B[Finding identified]
        C[Dynamic Analysis] --> B
    end

    subgraph CLASSIFICATION
        B --> D{Verify exploitability}
        D -->|Confirmed| E[CONFIRMED]
        D -->|Likely| F[LIKELY]
        D -->|Uncertain| G[NEEDS DYNAMIC]
        E --> H[Assign AUDIT-NNN]
        F --> H
        G --> H
    end

    subgraph SCORING
        H --> I[Calculate CVSS 4.0]
        I --> J[Map to OWASP M10]
        J --> K[Map to CWE]
        K --> L[Map to MASVS]
    end

    subgraph DOCUMENTATION
        L --> M[Fill finding template]
        M --> N[Write PoC]
        N --> O[Describe impact]
        O --> P[Provide remediation]
    end

    subgraph REVIEW
        P --> Q{Quality check}
        Q -->|Complete| R[Add to report]
        Q -->|Incomplete| S[Revise finding]
        S --> M
    end
```

---

## Environment Setup Verification

```mermaid
flowchart TD
    START[Environment Setup] --> CHECK[Run preflight check]

    CHECK --> TOOLS{All tools available?}

    TOOLS -->|Yes| PERMS[Check ADB permissions]
    TOOLS -->|No| INSTALL[Install missing tools]

    INSTALL --> VERIFY[Verify installation]
    VERIFY --> PERMS

    PERMS -->|Authorized| DEVICE[Device connected]
    PERMS -->|Not authorized| AUTH[Authorize device]

    AUTH --> DEVICE

    DEVICE --> MODE{Check device mode}

    MODE -->|Emulator| EMUL[Note emulator limitations]
    MODE -->|Physical| PHYS[Physical device ready]

    EMUL --> NEXT[Continue to Phase 0]
    PHYS --> NEXT

    NEXT --> END[Ready for testing]
```
