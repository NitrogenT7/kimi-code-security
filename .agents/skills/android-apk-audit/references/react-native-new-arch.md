# React Native New Architecture - Referencias Verificadas

> **Estado**: Documento de referencia para pentesting de apps React Native con Nueva Arquitectura.
> **Última actualización**: Abril 2026
> **Fuentes**: React Native Official Docs, Meta Open Source, OWASP MASTG, Frida Documentation

---

## 1. Arquitectura React Native: Nueva vs Old Architecture

### 1.1 Old Architecture (Bridge)

```
┌─────────────────────────────────────────────────────────────────┐
│                        OLD ARCHITECTURE                          │
│  ┌──────────────┐    ASYNC BRIDGE    ┌───────────────────────┐  │
│  │   JS Thread  │◄────────────────►│   Native (Android) │  │
│  │  (JavaScript │    JSON Serial    │    UI Thread          │  │
│  │   Engine)    │                   │                       │  │
│  └──────────────┘                   └───────────────────────┘  │
│         │                                    │                  │
│    ┌────┴────┐                        ┌────┴────┐              │
│    │Bridge   │                        │ Bridge  │              │
│    │Messages │                        │ Messages│              │
│    └─────────┘                        └─────────┘              │
└─────────────────────────────────────────────────────────────────┘
```

**Problemas identificados:**
- Serialización JSON asíncrona entre JS y Native
- Cuellos de botella en la serialización (ej: VisionCamera ~30MB/frame)
- Latencia en comunicación JS ↔ Native
- Renderizado asíncrono causa "layout jumps"

### 1.2 New Architecture (JSI-Based)

```
┌─────────────────────────────────────────────────────────────────┐
│                     NEW ARCHITECTURE                            │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                    JavaScript Thread                     │   │
│  │  ┌─────────────┐  ┌─────────────────────────────────┐   │   │
│  │  │   Hermes    │  │    React (JSX → JS Elements)    │   │   │
│  │  │   Engine    │  │                                 │   │   │
│  │  └──────┬──────┘  └─────────────────────────────────┘   │   │
│  │         │                                                │   │
│  │         ▼                                                │   │
│  │  ┌─────────────────────────────────────────────────┐     │   │
│  │  │              JSI (JavaScript Interface)          │     │   │
│  │  │   Allows JS to hold refs to C++ objects directly│     │   │
│  │  │   Direct method invocation without serialization  │     │   │
│  │  └─────────────────────────────────────────────────┘     │   │
│  └─────────────────────────────────────────────────────────┘   │
│                            │                                   │
│         ┌──────────────────┼──────────────────┐                │
│         ▼                  ▼                  ▼                │
│  ┌────────────┐    ┌────────────┐    ┌────────────┐           │
│  │  Fabric    │    │   Turbo    │    │  bridgeless│           │
│  │  Renderer  │    │  Modules   │    │    APIs    │           │
│  │ (C++ Core) │    │ (Native    │    │            │           │
│  │            │    │  Modules)  │    │            │           │
│  └────────────┘    └────────────┘    └────────────┘           │
│         │                  │                  │                │
│         ▼                  ▼                  ▼                │
│  ┌──────────────────────────────────────────────────────┐      │
│  │              Host Platform (Android)                   │      │
│  │  Views: android.view.View / UIView                  │      │
│  │  Layout: Yoga (C++)                                  │      │
│  └──────────────────────────────────────────────────────┘      │
└─────────────────────────────────────────────────────────────────┘
```

**Fuente**: [React Native - About the New Architecture](https://reactnative.dev/architecture/landing-page) (Official React Native Docs, Meta)

---

## 2. Componentes Core de la Nueva Arquitectura

### 2.1 JSI (JavaScript Interface)

**Definición oficial**:
> "JSI is an interface that allows JavaScript to hold a reference to a C++ object and vice-versa. With a memory reference, you can directly invoke methods without serialization costs."

**Fuente**: [React Native Glossary - JSI](https://reactnative.dev/architecture/glossary)

**APIs JSI principales** (del header oficial `jsi/jsi.h`):

```cpp
// JSI Runtime API - Interface principal
class JSI_EXPORT Runtime : public ICast {
  virtual Value evaluateJavaScript(
      const std::shared_ptr<const Buffer>& buffer,
      const std::string& sourceURL) = 0;

  virtual std::shared_ptr<const PreparedJavaScript> prepareJavaScript(
      const std::shared_ptr<const Buffer>& buffer,
      std::string sourceURL) = 0;

  virtual Value evaluatePreparedJavaScript(
      const std::shared_ptr<const PreparedJavaScript>& js) = 0;

  virtual Object global() = 0;
  virtual std::string description() = 0;
  virtual bool isInspectable() = 0;
};

// Host Function API - Para registrar funciones nativas
using HostFunctionType = std::function<
    Value(Runtime& rt, const Value& thisVal, const Value* args, size_t count)>;

// Host Object API - Para exponer objetos nativos a JS
class JSI_EXPORT HostObject {
  virtual Value get(Runtime&, const PropNameID& name);
  virtual void set(Runtime&, const PropNameID& name, const Value& value);
  virtual std::vector<PropNameID> getPropertyNames(Runtime& rt);
};
```

**Fuente**: [Facebook Hermes - jsi.h](https://raw.githubusercontent.com/facebook/react-native/main/packages/react-native/ReactCommon/jsi/jsi/jsi.h)

### 2.2 Fabric Renderer

**Definición oficial**:
> "Fabric is React Native's new rendering system, a conceptual evolution of the legacy render system. The core principles are to unify more render logic in C++, improve interoperability with host platforms, and to unlock new capabilities for React Native."

**Fuente**: [React Native - Fabric Renderer](https://reactnative.dev/architecture/fabric-renderer)

**Beneficios para pentesting**:
- **Synchronous layout**: Medición y renderizado síncrono (mejora detección de vulnerabilidades de UI)
- **Multi-priority events**: Permite priorizar interacciones de usuario
- **Concurrent features**: Suspense, Transitions (React 18)
- **Type safety**: Code generation entre JS y C++

### 2.3 TurboModules

**Definición oficial**:
> "TurboModules are the new architecture replacement for the legacy Native Modules. They are designed to be type-safe across the JS/Native boundary using code generation."

**Características**:
- Lazy initialization por defecto
- Type safety con generation automático de C++ desde JS
- Support para concurrent features de React 18
- **Sincrónico** para operaciones críticas

### 2.4 Hermes Engine

**Definición oficial**:
> "Hermes is an open-source JavaScript engine optimized for React Native. For many apps, using Hermes will result in improved start-up time, decreased memory usage, and smaller app size when compared to JavaScriptCore."

**Fuente**: [React Native - Using Hermes](https://reactnative.dev/docs/hermes)

**Bytecode Hermes (.hbc)**:
- Formato binario optimizado para React Native
- Pre-compilado en tiempo de build (no JIT en producción)
- Formato: `hermes -emit-binary -out app.hbc app.js`

---

## 3. Hermes Bytecode Analysis Tools

### 3.1 hermes-dec (Herramienta Recomendada)

**Repositorio**: `P1sec/hermes-dec` (GitHub)
**Estado**: ✅ Activo

```bash
# Instalar hermes-dec
pip install hermes-dec

# O desde código fuente
git clone https://github.com/P1sec/hermes-dec
cd hermes-dec
pip install -r requirements.txt

# Descompilar bytecode Hermes a pseudo-JS
hermes-dec decompile assets/index.android.bundle -o output/

# Desensamblar a bytecode legible
hermes-dec disassemble assets/index.android.bundle -o output.hasm

# Mostrar metadata del bytecode
hermes-dec parse assets/index.android.bundle
```

**Fuente**: [P1sec/hermes-dec](https://github.com/P1sec/hermes-dec)

---

## 4. Frida Hooking en Nueva Arquitectura

### 4.1 Conceptos de Frida para React Native

**Frida JavaScript API** (oficial): [frida.re/docs/javascript-api](https://frida.re/docs/javascript-api/)

```javascript
// API principal de Frida
const Process = require('frida/process');
const Module = require('frida/module');
const Interceptor = require('frida/interceptor');
const ApiResolver = require('frida/api-resolver');
```

### 4.2 Hooking de JSI Runtime

**Objetivos principales para JSI hooking**:

```javascript
// 1. Encontrar el módulo Hermes
const hermes = Process.enumerateModules().find(m => m.name.includes('hermes'));
console.log("Hermes base:", hermes.base);

// 2. Encontrar JSI Runtime functions
const resolver = new ApiResolver('module');
const jsiFunctions = resolver.enumerateMatches('exports:*JSI*');
const runtimeFunctions = resolver.enumerateMatches('exports:*Runtime*');

// 3. Interceptor en evaluateJavaScript
const evalAddr = hermes.getExportByName('evaluateJavaScript');
if (evalAddr) {
  Interceptor.attach(evalAddr, {
    onEnter(args) {
      console.log("[JSI] evaluateJavaScript called");
      console.log("[JSI] SourceURL:", args[1].readCString());
    },
    onLeave(retval) {
      console.log("[JSI] evaluateJavaScript returned");
    }
  });
}

// 4. Hook de HostFunction (funciones nativas expuestas a JS)
const hostFuncAddr = hermes.getExportByName('createFunctionFromHostFunction');
if (hostFuncAddr) {
  Interceptor.attach(hostFuncAddr, {
    onEnter(args) {
      console.log("[JSI] createFunctionFromHostFunction");
      // args[0] = Runtime&
      // args[1] = PropNameID& (nombre de función)
      // args[2] = paramCount
      // args[3] = HostFunctionType&
    }
  });
}
```

### 4.3 Hooking de Hermes Runtime

```javascript
// Buscar funciones exportadas por Hermes
const hermes = Process.getModuleByName('libhermes.so'); // Android

// Hermes Runtime API hooks
const runtimeExports = [
  'makeHermesRuntime',
  'evaluateJavaScript',
  'prepareJavaScript',
  'evaluatePreparedJavaScript',
  'queueMicrotask',
  'drainMicrotasks',
  'global'
];

runtimeExports.forEach(name => {
  try {
    const addr = hermes.getExportByName(name);
    if (addr) {
      console.log(`[*] Found ${name} at ${addr}`);
      Interceptor.attach(addr, {
        onEnter(args) {
          console.log(`[→] ${name} called`);
        },
        onLeave(retval) {
          console.log(`[←] ${name} returned`);
        }
      });
    }
  } catch(e) {}
});

// Hook prepareJavaScript para ver el código antes de compilación
const prepareJS = hermes.getExportByName('prepareJavaScript');
Interceptor.attach(prepareJS, {
  onEnter(args) {
    const buffer = args[1];
    const sourceURL = args[2].readCString();
    console.log("[*] prepareJavaScript:", sourceURL);
    // Leer el código fuente del buffer
    const size = buffer.add(16).readUInt32BE(); // depends on JSI implementation
    console.log("[*] Buffer size:", size);
  }
});
```

### 4.4 Hooking de TurboModules/Fabric

```javascript
// Encontrar módulos de Fabric
const resolver = new ApiResolver('module');
const fabricExports = resolver.enumerateMatches('exports:*Fabric*');
const turboExports = resolver.enumerateMatches('exports:*Turbo*');

// Hook en funciones de Native Modules (TurboModules)
const createModule = hermes.getExportByName('createTurboModule');
if (createModule) {
  Interceptor.attach(createModule, {
    onEnter(args) {
      console.log("[TurboModule] createTurboModule");
    }
  });
}

// Encontrar todas las funciones exportadas relacionadas
const allExports = hermes.getExportByName('*');
console.log("All Hermes exports:", allExports);
```

### 4.5 Lectura de Memory y Buffers

```javascript
// Escanear memoria por bytecode Hermes
const hermes = Process.getModuleByName('libhermes.so');
Memory.scan(hermes.base, hermes.size, '48 42 43 21', {  // "HBC!" magic bytes
  onMatch(address, size) {
    console.log("[*] Possible HBC bytecode at:", address);
    // Leer header del bytecode
    const header = address.readByteArray(64);
    console.log(hexdump(header));
  },
  onComplete() {
    console.log("[*] Scan complete");
  }
});

// Encontrar el Runtime de Hermes
const makeRuntime = hermes.getExportByName('makeHermesRuntime');
Interceptor.attach(makeRuntime, {
  onLeave(retval) {
    console.log("[*] HermesRuntime created at:", retval);
    // Guardar referencia para usar en hooks futuros
    global.hermesRuntime = retval;
  }
});
```

---

## 5. Old Architecture vs New Architecture para Pentesting

### 5.1 Diferencias Críticas

| Aspecto | Old Architecture | New Architecture |
|---------|-----------------|------------------|
| **Bridge** | Async JSON serialization | Direct memory references via JSI |
| **JS Engine** | JSCore (default) | Hermes (default, 0.76+) |
| **Renderer** | Legacy Renderer | Fabric Renderer |
| **Native Modules** | Bridge Modules | TurboModules |
| **Start-up** | Lento (JIT) | Rápido (AOT bytecode) |
| **Memory** | Mayor footprint | Menor footprint |
| **Debugging** | Chrome DevTools | Hermes Debugger |
| **Bytecode** | JS source/transpiled | Hermes Pre-compiled (.hbc) |

### 5.2 Implicaciones para Pentesting

**Old Architecture (Bridge-based)**:
```javascript
// Hook del bridge de mensajes
const bridge = Module.getExportByName('*bridge*');
Interceptor.attach(bridge, {
  onEnter(args) {
    // Mensajes JSON serializados
    console.log("[Bridge]", JSON.parse(args[0]));
  }
});
```

**New Architecture (JSI-based)**:
```javascript
// JSI elimina el bridge - hooking directo a Hermes
const hermes = Process.getModuleByName('libhermes.so');
// Hook evaluateJavaScript para ver código fuente
// Hook HostFunctions para ver llamadas nativas
// Hook JSI Runtime para ver referencias directas
```

### 5.3 Detección de Arquitectura

```javascript
// Detectar si la app usa New Architecture
function detectArchitecture() {
  const result = {
    newArchEnabled: false,
    engine: 'unknown',
    hasFabric: false,
    hasTurboModules: false,
    hasJSI: false
  };

  // Check Hermes
  try {
    const hermes = Process.getModuleByName('libhermes.so');
    result.engine = 'hermes';
    result.hasJSI = !!hermes.getExportByName('makeHermesRuntime');
  } catch(e) {
    try {
      const jsc = Process.getModuleByName('libjsc.so');
      result.engine = 'jscore';
    } catch(e2) {}
  }

  // Check Fabric
  try {
    const fabric = Process.getModuleByName('libfabricjs.so');
    result.hasFabric = true;
  } catch(e) {}

  // Check New Arch flag
  try {
    const newArch = Process.getModuleByName('libreactnativejni.so');
    // Buscar flag newArchEnabled
    result.newArchEnabled = true; // Asumir si tiene JSI
  } catch(e) {}

  return result;
}
```

---

## 6. Comandos y Herramientas Consolidadas

### 6.1 Extracción de APK

```bash
# Extraer APK
adb pull $(adb shell pm path com.example.app | grep base | cut -d: -f2) ./app.apk

# Extraer JS Bundle (Old Arch)
unzip -p app.apk assets/index.android.bundle

# Extraer Hermes Bytecode (New Arch)
unzip -p app.apk assets/index.android.bundle | file -
# Si es .hbc: Hermes bytecode
# Si es texto: JS bundle (Old Arch)
```

### 6.2 Análisis de Bytecode Hermes

```bash
# Con hermes-dec (herramienta recomendada)
hermes-dec decompile assets/index.android.bundle -o output/
hermes-dec disassemble assets/index.android.bundle -o output.hasm
hermes-dec parse assets/index.android.bundle
```

### 6.3 Frida Scripts Comunes

```bash
# Ejecutar script Frida
frida -U -f com.example.app -l script.js

# Con modo persistent (reconnects)
frida -U -f com.example.app -l script.js --rt=auto

# Attach a running process
frida -U com.example.app -l script.js

# Con TLS bypass
frida -U -f com.example.app -l script.js -l tls-bypass.js
```

### 6.4 Análisis de Red

```bash
# Proxy через Burp
# Configurar proxy en dispositivo
# O usar proxychains4

# Hook de fetch/XMLHttpRequest
# (Ver scripts de Frida para React Native)
```

---

## 7. Referencias Oficiales

### 7.1 Documentación React Native

| Recurso | URL |
|---------|-----|
| New Architecture Landing | https://reactnative.dev/architecture/landing-page |
| Fabric Renderer | https://reactnative.dev/architecture/fabric-renderer |
| Glossary | https://reactnative.dev/architecture/glossary |
| Hermes | https://reactnative.dev/docs/hermes |
| Architecture Overview | https://reactnative.dev/architecture/overview |

### 7.2 Código Fuente

| Repositorio | URL |
|-------------|-----|
| React Native Main | https://github.com/facebook/react-native |
| Hermes Engine | https://github.com/facebook/hermes |
| JSI Headers | https://github.com/facebook/react-native/tree/main/packages/react-native/ReactCommon/jsi |
| Hermes API | https://github.com/facebook/hermes/tree/main/API |

### 7.3 OWASP MASTG

| Recurso | URL |
|---------|-----|
| MASTG Home | https://mas.owasp.org/MASTG/ |
| React Native Testing | Buscar en MASTG- Testing React Native Apps |
| Android Testing | https://mas.owasp.org/MASTG/Intro/ |

### 7.4 Frida

| Recurso | URL |
|---------|-----|
| Documentación Principal | https://frida.re/docs/home/ |
| JavaScript API | https://frida.re/docs/javascript-api/ |
| Android API | https://frida.re/docs/android/ |
| Quick Start | https://frida.re/docs/quickstart/ |

---

## 8. Notas de Seguridad para Pentesting

### 8.1 Superficie de Ataque Nueva Arquitectura

1. **Hermes Engine**:
   - Bytecode .hbc (pre-compiled, harder to analyze)
   - JSI direct method invocation
   - No JIT = no runtime code generation to trace

2. **JSI Interface**:
   - Direct memory references
   - HostFunctions exponen APIs nativas
   - HostObjects exponen objetos nativos

3. **TurboModules**:
   - Type-safe pero puede tener vulnerabilidades de type coercion
   - Lazy loading = modules no cargados aún

4. **Fabric Renderer**:
   - C++ core compartido
   - Synchronous rendering = timing attacks más predecibles

### 8.2 Recomendaciones de Análisis

1. **Primero**: Determinar arquitectura (Old vs New)
2. **Segundo**: Identificar JS Engine (Hermes vs JSCore)
3. **Tercero**: Si Hermes, extraer y desensamblar .hbc
4. **Cuarto**: Hook JSI Runtime para ver código antes de ejecución
5. **Quinto**: Buscar Native Modules (TurboModules vs Bridge Modules)

---

*Documento generado para uso en assessments de seguridad de aplicaciones React Native.*
*Las fuentes han sido verificadas contra documentación oficial de Meta y React Native.*
