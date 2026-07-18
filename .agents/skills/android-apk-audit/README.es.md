# Skill de Auditoría de Seguridad APK para Android

[![Licencia](https://img.shields.io/badge/licencia-Apache%202.0-blue.svg)](LICENSE)
[![Versión](https://img.shields.io/badge/versión-1.5.0-green.svg)](https://github.com/DragonJAR/Android-Pentesting-Skill/blob/main/SKILL.md)
[![Autor](https://img.shields.io/badge/autor-DragonJAR%20SAS-orange.svg)](https://www.DragonJAR.org)
[![English](https://img.shields.io/badge/read%20in-English-blue.svg)](README.md)

> Skill integral de auditoría de seguridad APK para Android con análisis estático, instrumentación dinámica, trazado source-to-sink y reportes CVSS 4.0.

## 🎯 Qué Hace Este Skill

Este skill transforma un agente de IA en un **auditor de seguridad Android** capaz de:

- **Descompilar y analizar APKs** — Integración con JADX, APKTool, APKiD
- **Detectar vulnerabilidades** — 50+ patrones de seguridad, alineado con OWASP Mobile Top 10
- **Probar abuso de IPC/componentes** — Intent injection, deep links, PendingIntent, mal uso de FileProvider
- **Trazar flujos de datos** — Metodología source-to-sink con niveles de confianza
- **Bypass de protecciones** — SSL pinning, root detection, RASP, checks nativos, packers
- **Modificar APKs** — Smali patching, edición de recursos, reempaquetado
- **Generar reportes** — Scoring CVSS 4.0, mapeo MASTG, plantillas profesionales

## 📦 Instalación

### Opción 1: Clonar en Directorio de Skills del Agente

```bash
# Para agentes Claude Code / OpenCode
cd ~/.agents/skills/
git clone https://github.com/DragonJAR/Android-Pentesting-Skill android-apk-audit

# Para otros agentes, ubicar en su directorio de skills
```

### Opción 2: Instalación Global

```bash
# Clonar en cualquier ubicación
git clone https://github.com/DragonJAR/Android-Pentesting-Skill.git

# Agregar a la configuración de skills del agente
```

## ⚙️ Prerrequisitos

El skill espera estas herramientas instaladas:

| Herramienta | Versión | Propósito |
|-------------|---------|-----------|
| APKTool | 3.0.1+ | Decodificación/reconstrucción de APK (modo aapt2) |
| JADX | 1.5.5+ | Descompilación Java/Kotlin |
| Android SDK | Platform 36+, Build 36+ | adb, aapt2, zipalign, apksigner |
| Frida | 17.9+ | Instrumentación dinámica |
| Objection | 1.12.4+ | Exploración móvil (modo mantenimiento) |
| APKiD | 3.0.0+ | Detección de framework |

### Verificación

Ejecutar el chequeo de preflight para verificar dependencias:

```bash
./scripts/preflight-check.sh
```

O usar la versión Python para compatibilidad multiplataforma:

```bash
python3 scripts/preflight-check.py
```

Variante PowerShell para entornos Windows:

```powershell
./scripts/preflight-check.ps1
```

## 🚀 Ejemplos de Uso

### Ejemplo 1: Auditoría Básica de APK

**Prompt del usuario:**
```
Audita este APK: /ruta/a/app.apk
```

**Respuesta del agente:**
```
Analizaré el APK en busca de vulnerabilidades de seguridad.

[Fase 0] Decodificando APK con APKTool...
[Fase 1] Analizando AndroidManifest.xml...
[Fase 2] Ejecutando patrones de seguridad específicos...
[Fase 3] Trazando flujos de datos...
[Fase 5] Generando reporte de hallazgos...

Se encontraron 3 issues:
1. [ALTO] Activity Exportada Sin Permiso (M8: Configuración de Seguridad Incorrecta)
2. [MEDIO] API Key Hardcodeada (M1: Improper Credential Usage)
3. [BAJO] Debug Logging Habilitado (M8: Configuración de Seguridad Incorrecta)
```

### Ejemplo 2: Bypass de SSL Pinning

**Prompt del usuario:**
```
La app tiene SSL pinning. Bypassealo con Frida e intercepta el tráfico.
```

**Respuesta del agente:**
```
Usaré el script de bypass de SSL pinning para interceptar tráfico HTTPS.

[1] Identificando implementación de SSL pinning...
    Encontrado: OkHttp3 CertificatePinner
[2] Cargando script Frida: ssl-pinning-bypass.js
[3] Hookeando CertificatePinner.check()
[4] SSL pinning bypassed. Tráfico ahora desencriptado.

Petición interceptada:
POST /api/login
{"email": "usuario@ejemplo.com", "password": "secreto123"}
```

### Ejemplo 3: Análisis de React Native

**Prompt del usuario:**
```
Analiza este APK de React Native buscando secretos hardcodeados en el bundle de JavaScript.
```

**Respuesta del agente:**
```
[Fase 0] Detectado framework React Native (libhermes.so encontrado)
[Fase 0] Extrayendo JavaScript bundle de assets/index.android.bundle
[Fase 2] Escaneando por secretos en JavaScript bundle...

Encontrados 2 secretos hardcodeados:
- API_KEY = "sk_live_abc123..." en bundle.js:4521 (M1: Improper Credential Usage)
- AWS_SECRET = "wJalrXUtnFEMI/K7MDENG..." en bundle.js:8912 (M1: Improper Credential Usage)
```

### Ejemplo 4: Modificación de APK

**Prompt del usuario:**
```
Deshabilita la detección de root en este APK y reempaquétalo.
```

**Respuesta del agente:**
```
[1] Decodificando APK con APKTool...
[2] Localizando código de detección de root...
    Encontrado: com/app/security/RootDetector.checkRoot()
[3] Parcheando smali para retornar false...
    const/4 v0, 0x0  # Siempre retorna false
[4] Reconstruyendo con APKTool...
[5] Alineando con zipalign...
[6] Firmando con apksigner...
[7] Verificando firma...

APK modificado listo: app_patched.apk
SHA-256: abc123def456...
```

### Ejemplo 5: Análisis de Flutter

**Prompt del usuario:**
```
Analiza este APK de Flutter. Necesito interceptar tráfico HTTPS de la app.
```

**Respuesta del agente:**
```
[Fase 0] Detectado framework Flutter (libflutter.so encontrado)
[Fase 0] Flutter usa BoringSSL nativo - los hooks Java SSL no funcionarán
[Fase 0] Usando Blutter para extraer código Dart: python3 blutter.py lib/arm64-v8a/
[Fase 4] Cargando script Frida: native-hook.js (objetivos BoringSSL)
[Fase 4] Hookeando SSL_CTX_set_custom_verify() para bypass de certificado
[Fase 4] Hookeando SSL_read/SSL_write() para interceptación de tráfico

Tráfico Flutter ahora interceptado y desencriptado.
```

## 📖 Capacidades del Skill

### Análisis Estático (Fases 0-3)

| Capacidad | Descripción |
|-----------|-------------|
| Descompilación APK | JADX para Java/Kotlin, APKTool para smali/recursos |
| Detección de Framework | React Native, Flutter, Cordova, Xamarin, Nativo |
| Análisis de Ofuscación | ProGuard/R8, DexGuard, patrones personalizados |
| Análisis de Manifest | 50+ verificaciones de seguridad para componentes exportados, permisos, deep links |
| Abuso de IPC / Intents | Intent injection, relays de intents anidados, PendingIntent, FileProvider y pivotes vía deep link |
| Detección de Secretos | API keys, contraseñas, tokens en código y recursos |
| Trazado de Flujo de Datos | Metodología source-to-sink con niveles de confianza |

### Análisis Dinámico (Fase 4)

| Capacidad | Descripción |
|-----------|-------------|
| Scripts Frida | 30 scripts listos-para-producción para hooking, bypass, interceptación y triage nativo |
| Bypass SSL Pinning | 30+ implementaciones (OkHttp, TrustManager, WebView, React Native, Flutter) |
| Bypass Root Detection | 30+ paquetes de root, 80+ paths, hooks nativos (fopen, access, stat) y una sonda enfocada para root detection nativo |
| Bypass RASP | Integridad APK, detección debug/emulador, evasión Frida |
| Intercepción Crypto | Monitorear Cipher, MessageDigest, Mac, Signature |
| Bypass Biometric | BiometricPrompt, FingerprintManager, crypto-object binding |
| Inspección Keystore | Listar entradas, extraer metadata, verificar flags de seguridad |
| Intercepción de Red | Cadenas OkHttp, HttpURLConnection, monitoreo WebSocket |
| Hooking Nativo | JNI_OnLoad, RegisterNatives, hooks por offset y sondas nativas con carga selectiva |

### Helper de Explotación Frida
```bash
# Listar scripts disponibles
python3 scripts/frida-exploit-helper.py --list-scripts

# Hookear funciones de memoria
python3 scripts/frida-exploit-helper.py -p com.target.app --hook malloc,free

# Usar script bundled de bypass SSL pinning
python3 scripts/frida-exploit-helper.py -p com.target.app --script ssl-pinning-bypass

# Análisis de layout de memoria
python3 scripts/frida-exploit-helper.py -p com.target.app --layout
```

### Modificación de APK

| Capacidad | Descripción |
|-----------|-------------|
| Smali Patching | Modificar bytecode Dalvik directamente |
| Edición de Recursos | Cambiar XML, strings, configuraciones |
| Manipulación Estática de Pinning | Sobrescribir `network_security_config`, reemplazar pins, certificados embebidos o truststores `BKS/JKS` |
| Reempaquetado | Reconstruir, alinear, firmar con flujo correcto: zipalign → apksigner |

### Reportes (Fase 5)

| Capacidad | Descripción |
|-----------|-------------|
| Scoring CVSS 4.0 | Calificaciones de severidad compatibles con FIRST.org |
| Mapeo OWASP MASTG | IDs de tests y categorías MASVS |
| Plantillas Profesionales | Resumen ejecutivo, hallazgos, remediación |

## 🔧 Estructura del Skill

```
Android-Pentesting-Skill/
├── SKILL.md                              # Definición del skill (Fases 0-5)
├── references/                           # 69 documentos de referencia
│   ├── attack-patterns.md                # Patrones OWASP M1-M10
│   ├── intent-injection.md               # Guía de nested intents / confused deputy
│   ├── pendingintent-security.md         # Abuso y hardening de PendingIntent
│   ├── dynamic-analysis-setup.md         # Frida/Objection + playbook SSL pinning
│   ├── frida-scripts-index.md            # Catálogo canónico de scripts bundlados
│   ├── cvss-scoring-guide.md            # Metodología CVSS 4.0
│   ├── reporting-templates.md            # Plantillas de hallazgos
│   ├── flutter-security.md               # Guía de seguridad Flutter
│   ├── react-native-security.md          # Guía de seguridad React Native
│   ├── android-keystore2-testing.md     # Testing Keystore2 (Android 12+)
│   ├── biometric-testing-comprehensive.md # Testing Biométrico
│   ├── deep-link-exploitation.md         # Ataques de deep links
│   └── ... (55 más)
├── assets/frida-scripts/                 # 37 scripts Frida
│   ├── ssl-pinning-bypass.js             # Bypass SSL pinning
│   ├── root-detection-bypass.js           # Bypass detección root
│   ├── native-root-detection-probe.js     # Triage enfocado de root/RASP nativo
│   ├── native-hook.js                    # Helper genérico JNI / nativo
│   ├── biometric-bypass.js               # Bypass autenticación biométrica
│   ├── network-interceptor.js           # Intercepción HTTP/HTTPS
│   ├── crypto-intercept.js               # Hook de operaciones crypto
│   └── ... (23 más)
├── scripts/                              # Scripts de utilidad y validación
│   ├── preflight-check.sh                # Verificación de dependencias en Bash
│   ├── preflight-check.py                # Verificación multiplataforma
│   ├── preflight-check.ps1               # Verificación en PowerShell
│   ├── auto-audit-static.sh             # Automatización de auditoría estática (Fases 0-3)
│   ├── audit-android-components.sh       # Auditoría de componentes de seguridad
│   ├── generate-report.py                # Generación de reportes
│   ├── correlate-findings.py             # Correlacionar hallazgos de múltiples herramientas
│   ├── mobsf-api-scan.py                 # Integración con API de MobSF
│   ├── burp-findings-export.py           # Exportar hallazgos de Burp Suite
│   ├── frida-exploit-helper.py          # Helper para explotación
│   ├── rop-helper.py                    # Buscador de gadgets ROP
│   ├── validate-frida-scripts.sh        # Validación de scripts Frida
│   ├── validate-shell-scripts.sh         # Validación de scripts shell
│   └── test-findings.json               # Entrada de ejemplo para reportes
├── scripts/cross-platform/               # Análisis específico por framework
│   ├── cordova-analysis.sh
│   ├── flutter-analysis.sh
│   ├── react-native-analysis.sh
│   └── unity-analysis.sh
├── scripts/android-15-16/                 # Scripts específicos para Android 15/16
│   ├── android15-apis.js                 # Testing de APIs Android 15
│   ├── passkey-test.js                   # Testing Passkey/FIDO2
│   └── privacy-sandbox-test.sh           # Testing Privacy Sandbox
└── references/ai-prompts/                 # Prompts de análisis con IA
    ├── java-security-analyzer.md         # Prompts para análisis de código Java
    ├── native-binary-analyzer.md          # Prompts para análisis de binarios nativos
    ├── exploit-generator.md               # Prompts para generación de PoC
    └── report-enhancer.md                # Prompts para mejora de reportes
```

## 🎓 Frases de Activación

El skill se activa cuando el usuario dice:

- "audita este APK"
- "analiza app android"
- "pentest móvil"
- "seguridad APK"
- "descompilar APK"
- "evaluación de vulnerabilidades android"
- "ingeniería inversa android"
- "modificar APK"
- "bypass SSL pinning"
- "bypass detección root"
- "intent injection"
- "abuso de deep links"

## ⚠️ Limitaciones

1. **Análisis dinámico requiere dispositivo o emulador** — Frida necesita un sistema Android ejecutándose
2. **Algunos packers requieren unpacking manual** — DexGuard 9+, Arxan pueden necesitar debugging interactivo
3. **Restricciones Android 14+** — Ciertos comportamientos de Intent requieren flags `-n package/activity` explícitos
4. **Versiones de Frida deben coincidir** — frida-server en dispositivo debe coincidir exactamente con frida-tools en host
5. **Flutter usa BoringSSL nativamente** — Los hooks Java SSL no funcionan, se necesitan hooks nativos

## 📚 Alineación con Estándares

Este skill está alineado con:

- **OWASP MASTG** — Mobile Application Security Testing Guide
- **OWASP MASVS** — Mobile Application Security Verification Standard
- **OWASP Mobile Top 10 2024** — Top 10 riesgos móviles
- **CVSS 4.0** — Common Vulnerability Scoring System

## 🔐 OWASP Mobile Top 10 (2024)

| ID | Categoría |
|----|-----------|
| M1 | Uso Impropio de Credenciales |
| M2 | Seguridad de Cadena de Suministro Inadecuada |
| M3 | Autenticación/Autorización Insegura |
| M4 | Validación de Entrada/Salida Insuficiente |
| M5 | Comunicación Insegura |
| M6 | Controles de Privacidad Inadecuados |
| M7 | Protecciones Binarias Insuficientes |
| M8 | Configuración de Seguridad Incorrecta |
| M9 | Almacenamiento de Datos Inseguro |
| M10 | Criptografía Insuficiente |

## 🤝 Contribuir

¡Las contribuciones son bienvenidas! Revisa el directorio [references/](references/) para áreas que necesitan expansión.

## 📄 Licencia

Apache License 2.0 — Ver archivo [LICENSE](LICENSE) para detalles.

## 👨‍💻 Autor

**DragonJAR SAS** — [https://www.DragonJAR.org](https://www.DragonJAR.org)

[Expertos en servicios de seguridad informática, validación proactiva y seguridad ofensiva.](https://www.dragonjar.org/servicios-de-seguridad-informatica)

---

**⚠️ Descargo de Responsabilidad:** Este skill está destinado **solamente para pruebas de seguridad autorizadas**. Los usuarios deben obtener autorización apropiada antes de realizar cualquier evaluación de seguridad. Los autores no son responsables del mal uso de esta herramienta.
