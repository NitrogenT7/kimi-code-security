# Frida Scripts Index

Canonical catalog for bundled Frida assets used by this skill.

## Available Scripts

| Script | Purpose | Usage |
|--------|---------|-------|
| `ssl-pinning-bypass.js` | Universal SSL/TLS bypass for common Java stacks (OkHttp, `TrustManager`, WebView, React Native, Flutter, Xamarin, TrustKit, NSC). | `frida -U -f pkg -l ssl-pinning-bypass.js` |
| `root-detection-bypass.js` | Universal root/emulator/debug bypass with Java + native hooks (`fopen`, `access`, `stat`, system properties, RootBeer, KernelSU, Magisk). | `frida -U -f pkg -l root-detection-bypass.js` |
| `native-root-detection-probe.js` | Observe-first native root/RASP probe for `access`, `stat`, `fopen`, `strstr`, plus optional `linker64` load gating and selective argument replacement. | `frida -U -f pkg -l native-root-detection-probe.js` |
| `anti-frida-bypass.js` | Hide common Frida indicators such as procfs entries, thread names, ports, and string checks. | `frida -U -f pkg -l anti-frida-bypass.js` |
| `biometric-bypass.js` | Bypass `BiometricPrompt`, `FingerprintManager`, Face auth, and crypto-object enforcement. | `frida -U -f pkg -l biometric-bypass.js` |
| `rasp-bypass.js` | Template-style RASP bypass for integrity, debug, emulator, Frida, and vendor-specific detections. | `frida -U -f pkg -l rasp-bypass.js` |
| `intent-logger.js` | Log IPC data for Activities, Services, Receivers, Providers, and outbound intent launches. | `frida -U -f pkg -l intent-logger.js` |
| `ipc-abuse-helper.js` | Passive IPC/deep-link/provider logger with optional helper functions for provider queries, crafted intents, broadcasts, and service starts. | `frida -U -f pkg -l ipc-abuse-helper.js` |
| `android-file-access-monitor.js` | Observe file, database, and provider-backed I/O across Java streams plus libc `open`/`read`/`write`, with optional byte previews. | `frida -U -f pkg -l android-file-access-monitor.js` |
| `webview-monitor.js` | Monitor WebView URL loads, JavaScript interfaces, settings, and SSL errors. | `frida -U -f pkg -l webview-monitor.js` |
| `webview-debug.js` | Enable WebView debugging and assist hybrid-app investigation. | `frida -U -f pkg -l webview-debug.js` |
| `network-interceptor.js` | Intercept HTTP/HTTPS traffic for OkHttp, `HttpURLConnection`, Retrofit, and WebSockets. | `frida -U -f pkg -l network-interceptor.js` |
| `crypto-intercept.js` | Trace `Cipher`, `MessageDigest`, `Mac`, `SecretKeySpec`, and related crypto operations. | `frida -U -f pkg -l crypto-intercept.js` |
| `shared-prefs-dumper.js` | Dump SharedPreferences values and highlight sensitive material. | `frida -U -f pkg -l shared-prefs-dumper.js` |
| `jwt-token-monitor.js` | Monitor JWTs and token movement through storage, headers, cookies, and URLs. | `frida -U -f pkg -l jwt-token-monitor.js` |
| `keystore-inspector.js` | Enumerate Android Keystore aliases, flags, attestation data, and auth requirements. | `frida -U -f pkg -l keystore-inspector.js` |
| `method-tracer.js` | Trace configured Java methods with arguments and return values. | `frida -U -f pkg -l method-tracer.js` |
| `jni-tracer.js` | Low-noise JNI tracer for `FindClass`, method/field lookups, `RegisterNatives`, and optional string/call-family tracing. | `frida -U -f pkg -l jni-tracer.js` |
| `native-hook.js` | Generic native/JNI helper for exports, offsets, module enumeration, and anti-debug bypass. | `frida -U -f pkg -l native-hook.js` |
| `dexdump.js` | Dump in-memory or dynamically loaded DEX files. | `frida -U -f pkg -l dexdump.js` |
| `flutter-channel-hook.js` | Inspect Flutter method channels, event channels, and platform bridge behavior. | `frida -U -f pkg -l flutter-channel-hook.js` |
| `network-security-bypass.js` | Bypass Network Security Config and certificate pinning (TrustManager, OkHttp3). | `frida -U -f pkg -l network-security-bypass.js` |
| `flag-secure-bypass.js` | Bypass FLAG_SECURE screen capture protection. | `frida -U -f pkg -l flag-secure-bypass.js` |
| `mediaprojection-bypass.js` | Bypass MediaProjection callback protection. | `frida -U -f pkg -l mediaprojection-bypass.js` |
| `comprehensive-tracer.js` | Combined Java method + native function tracer with class enumeration. | `frida -U -f pkg -l comprehensive-tracer.js` |
| `packer-unpacker.js` | Detect and help unpack common commercial packers and stub loaders. | `frida -U -f pkg -l packer-unpacker.js` |
| `mem-layout-viewer.js` | Visualize process memory layout — regions, permissions, file mappings with hex preview. | `frida -U -f pkg -l mem-layout-viewer.js` |
| `rop-gadget-finder.js` | Find ROP gadgets in loaded native libraries for exploit development. | `frida -U -f pkg -l rop-gadget-finder.js` |
| `uaf-detector.js` | Detect use-after-free conditions in native heap allocations and dangling pointers. | `frida -U -f pkg -l uaf-detector.js` |
| `native-heap-tracer.js` | Trace native heap allocations (malloc, calloc, realloc, free) with call stacks. | `frida -U -f pkg -l native-heap-tracer.js` |
| `android-anti-frida-countermeasures.js` | Comprehensive anti-Frida detection bypass — procfs, frida-server ports (27042/27043), thread names, TLS callbacks, strstr/memmem string checks, Dobby pattern for function replacement. | `frida -U -f pkg -l android-anti-frida-countermeasures.js` |
| `android-argument-manipulation.js` | Hook and manipulate method arguments at runtime — inspect and modify input parameters before method execution. | `frida -U -f pkg -l android-argument-manipulation.js` |
| `android-constructors-hook.js` | Hook constructors and initializer methods (`<init>`, `<clinit>`) for early instrumentation of app startup. | `frida -U -f pkg -l android-constructors-hook.js` |
| `android-early-instrumentation.js` | Instrument app before framework loads — hook Application.attach(), library loading, preload classes. | `frida -U -f pkg -l android-early-instrumentation.js` |
| `android-native-wrapper.js` | Helper for wrapping native function calls with argument type conversion and memory management. | `frida -U -f pkg -l android-native-wrapper.js` |
| `network-interceptor-enhanced.js` | Enhanced HTTP/HTTPS interceptor with response body capture, header logging, and timing metrics. | `frida -U -f pkg -l network-interceptor-enhanced.js` |

## External Framework

| Tool | GitHub | Purpose | Notes |
|------|--------|---------|-------|
| **FridaBypassKit** | [okankurtuluss/FridaBypassKit](https://github.com/okankurtuluss/FridaBypassKit) | Optional multi-bypass bundle | Review carefully before use; overlaps with bundled SSL/root/RASP helpers |

## Recommended Load Order

1. **Bypass first**: `ssl-pinning-bypass.js`, `root-detection-bypass.js`, `anti-frida-bypass.js`
2. **Then monitor**: `intent-logger.js`, `ipc-abuse-helper.js`, `network-interceptor.js`, `android-file-access-monitor.js`
3. **Then deep-dive**: `native-root-detection-probe.js`, `jni-tracer.js`, `native-hook.js`, `method-tracer.js`

Example:

```bash
frida -U -f com.target.app \
  -l ssl-pinning-bypass.js \
  -l anti-frida-bypass.js \
  -l ipc-abuse-helper.js \
  -l android-file-access-monitor.js \
 
```

## Quick Selection Guide

| Goal | Start with | Escalate to |
|---|---|---|
| Bypass common SSL pinning | `ssl-pinning-bypass.js` | `native-hook.js`, `rasp-bypass.md` |
| Bypass common root checks | `root-detection-bypass.js` | `native-root-detection-probe.js` |
| Inspect IPC abuse | `intent-logger.js` | `ipc-abuse-helper.js`, `method-tracer.js`, `intent-injection.md` |
| Validate provider / deep-link abuse actively | `ipc-abuse-helper.js` | `intent-logger.js` |
| Trace filesystem / storage I/O | `android-file-access-monitor.js` | `shared-prefs-dumper.js` |
| Investigate Keystore / auth | `keystore-inspector.js` | `biometric-bypass.js`, `crypto-intercept.js` |
| Trace JNI / native boundary | `jni-tracer.js` | `native-hook.js`, by-offset hooks, Ghidra |
| Analyze native libraries | `native-hook.js` | `jni-tracer.js`, by-offset hooks, Ghidra, `native-root-detection-probe.js` |

## Usage Patterns

**Spawn** (recommended for bypasses):

```bash
frida -U -f pkg -l script.js
```

**Attach** (when the interesting behavior happens later):

```bash
frida -U pkg -l script.js
```

## Notes

- Start with passive defaults in `ipc-abuse-helper.js` and enable active helper functions only when you intentionally want to query providers or dispatch crafted IPC.
- Keep `android-file-access-monitor.js` in observe-first mode unless you really need byte previews; enabling dumps increases noise and the chance of exposing sensitive material in logs.
- Use `jni-tracer.js` first for JNI boundary discovery, then switch to `native-hook.js` or by-offset hooks only after you identify the relevant library and method family.

## Related References

- `dynamic-analysis-setup.md`
- `rasp-bypass.md`
- `frida-advanced-patterns.md`
- `android-anti-frida-countermeasures.md`
- `attack-patterns.md`
- `intent-injection.md`
- `flutter-security.md`
