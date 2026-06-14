# Frida Advanced Patterns - Capítulo 9 de "The Frida Handbook"

Autor del libro: Fernando Diaz (@entdark_)
Capítulo: 9 - Android instrumentation (páginas 146-167)

Este documento documenta técnicas avanzadas de instrumentación Android con Frida que NO están actualmente implementadas en la skill de Android Pentesting.

## 📋 Tabla de Contenidos

### 1. Java.performNow() - Instrumentación Instantánea

**Problema actual**: La skill usa solo `Java.perform()` que introduce un delay entre attachment y ejecución. Esto significa que hooks en `onCreate()`, `onStart()`, `onDestroy()` pueden perder eventos críticos.

**Solución del libro**: `Java.performNow()` ejecuta inmediatamente sin esperar a que el thread se adjunte al ART VM.

**Ejemplo del libro**:
```javascript
// Hook de onCreate() con Java.performNow() - NO pierde eventos
Java.performNow(() => {
  const Activity = Java.use('android.app.Activity');
  Activity.onCreate.implementation = function(savedInstanceState) {
    console.log("[+] onCreate capturado inmediatamente");
    // Tu código de análisis aquí
    return this.onCreate(savedInstanceState);
  };
});
```

**Cuándo usar**:
- Hooks críticos del lifecycle: onCreate(), onStart(), onResume(), onPause(), onStop(), onDestroy()
- Detección temprana de activity launches
- Setup de inicialización antes de que la app inicie lógica de negocio

**Limitaciones**:
- Solo disponible en Frida 16.0+
- Puede causar timing issues si se usa incorrectamente
- NO reemplaza a `Java.perform()` en todos los casos

---

### 2. Stack Traces Completo con java.lang.Thread

**Problema actual**: Los scripts de root detection y SSL pinning NO incluyen stack traces para análisis de call paths.

**Solución del libro**: Usar `java.lang.Thread.currentThread().getStackTrace()` para capturar el stack completo.

**Ejemplo del libro**:
```javascript
Java.performNow(() => {
  const thread = Java.use('java.lang.Thread').$new();
  const stacktrace = thread.currentThread().getStackTrace();

  stacktrace.forEach((element) => {
    console.log(`[STACK] ${element.toString()}`);
  });
});
```

**Cuándo usar**:
- Análisis dinámico de call paths
- Debugging de complejos call chains
- Identificación de qué función llamó a qué método
- Forensics de ejecución

**Tip del libro**: Combínar con logging de argumentos para trazar completamente el flujo:
```javascript
Java.performNow(() => {
  const NetworkSecurityConfig = Java.use('android.security.NetworkSecurityConfig');
  const Builder = Java.use('android.security.NetworkSecurityConfig$Builder');

  Builder.$init.overload('android.app.Application').implementation = function(app) {
    console.log("[+] Builder.$init() llamado con app:", app);
    console.log("[+] Stack trace:");
    const thread = Java.use('java.lang.Thread').$new();
    const stack = thread.currentThread().getStackTrace();
    stack.forEach((e) => console.log("  " + e.toString()));
    return this.$init(app);
  };
});
```

---

### 3. Constructor Hooking ($init keyword)

**Problema actual**: Los scripts actuales NO cubren hooks de constructores que son críticos para framework libraries como OkHttp, Retrofit, Gson, etc.

**Solución del libro**: Hooks de constructores usando `$init` keyword.

**Ejemplos del libro**:

#### Hook de java.net.URL:
```javascript
Java.perform(() => {
  const URL = Java.use("java.net.URL");
  URL.$init.overload('java.lang.String').implementation = function(val) {
    console.log("[+] URL creada: " + val);
    console.log("[+] Stack trace:");
    const thread = Java.use('java.lang.Thread').$new();
    const stack = thread.currentThread().getStackTrace();
    stack.forEach((e) => console.log("  " + e.toString()));
    return this.$init(val);
  };
});
```

#### Hook de java.io.File:
```javascript
Java.perform(() => {
  const File = Java.use("java.io.File");
  File.$init.overload('java.lang.String').implementation = function(path) {
    console.log("[+] File creado: " + path);
    // Análisis de path injection aquí
    return this.$init(path);
  };
});
```

#### Hook de android.content.Intent:
```javascript
Java.perform(() => {
  const Intent = Java.use("android.content.Intent");
  Intent.$init.overload('java.lang.String', 'java.lang.String').implementation = function(action, uri) {
    console.log("[+] Intent creado - Action: " + action + ", URI: " + uri);
    // Detectar deep link abuse
    if (action === "android.intent.action.VIEW" && uri) {
      console.log("[!] Posible deep link attack");
    }
    return this.$init(action, uri);
  };
});
```

#### Hook de OkHttp Request/Response:
```javascript
Java.perform(() => {
  const Request = Java.use('okhttp3.Request');
  const Response = Java.use('okhttp3.Response');

  Request.$init.implementation = function(builder) {
    console.log("[+] OkHttpRequest creado");
    return this.$init(builder);
  };

  Response.$init.implementation = function(request) {
    console.log("[+] OkHttpResponse creado - Request: " + request.url().toString());
    return this.$init(request);
  };
});
```

**Constructores críticos para Android**:
| Framework/Clase | Constructor | Propósito de Hook |
|----------------|-----------|-------------------|
| java.net.URL | $init(String) | URL manipulation, SSRF |
| java.io.File | $init(String) | Path injection, file access |
| android.content.Intent | $init(String, String) | Deep link abuse, data exfiltration |
| android.os.Bundle | $init() | Data leakage in intent extras |
| OkHttp3 Request | $init(Builder) | Request manipulation, header injection |
| OkHttp3 Response | $init(Request) | Response interception |
| Retrofit | retrofit2.Retrofit.<init>() | HTTP client setup interception |
| Gson | gson.Gson() | JSON manipulation, deserialization |

---

### 4. Argument Manipulation (NO solo return values)

**Problema actual**: La skill se enfoca principalmente en reemplazar return values (`this.putString`), pero el libro muestra técnicas para manipular **argumentos ANTES** de la ejecución.

**Ejemplo del libro**: Modificar SharedPreferences.putString() antes de que escriba el valor:

```javascript
Java.perform(() => {
  const Editor = Java.use('android.app.SharedPreferencesImpl$EditorImpl');
  const stringCls = Java.use('java.lang.String');
  const newString = stringCls.$new("HACKED_VALUE");

  Editor.putString.overload('java.lang.String', 'java.lang.String').implementation = function(key, value) {
    console.log("[+] putString llamado - Key: " + key);
    console.log("[+] Valor ORIGINAL: " + value);
    console.log("[+] Valor REEMPLAZADO: " + newString);

    // Importante: REEMPLAZAR el argumento 'value'
    return this.putString(key, newString);
  };
});
```

**Casos de uso**:
- Path hijacking: Modificar rutas de archivos en tiempo real
- API key injection: Cambiar claves de API en runtime
- Header manipulation: Alterar HTTP headers antes de enviar petición
- Intent data tampering: Modificar datos en intentos antes de dispatch

**Diferencia clave**:
```javascript
// ❌ Enfoque actual - SOLO return values:
.putString.overload(...).implementation = function(key, value) {
  return this.putString(key, "MODIFICADO");
};

// ✅ Enfoque del libro - Argument manipulation:
.putString.overload(...).implementation = function(key, value) {
  console.log("Valor antes de modificación:", value);
  // Lógica de análisis/modificación aquí
  return this.putString(key, valor_modificado);
};
```

---

### 5. NativeFunction - System Calls desde JavaScript

**Problema actual**: Los scripts NO pueden llamar funciones del sistema (mkdir, stat, fopen) directamente desde JavaScript.

**Solución del libro**: Crear wrappers `new NativeFunction()` para llamadas al sistema.

**Ejemplo del libro**:
```javascript
Java.perform(() => {
  // Obtener export de mkdir del libc
  const mkdirPtr = Module.getExportByName(null, 'mkdir');

  // Crear wrapper NativeFunction
  const mkdir = new NativeFunction(
    mkdirPtr,
    'int',
    ['pointer']
  );

  // Asignar string UTF8
  const folderName = Memory.allocUtf8String("/data/local/tmp/frida_test");

  // Llamar mkdir directamente
  const result = mkdir(folderName);
  console.log("[+] mkdir(" + folderName + ") = " + result + " (0=éxito)");

  return result;
});
```

**Wrappers útiles para Android**:
| Función Sistema | Header | Tipo Retorno | Tipo Argumentos | Wrapper Completo |
|----------------|--------|--------------|---------------|----------------|
| mkdir | <sys/stat.h> | int | const char* | Ver implementación abajo |
| stat | <sys/stat.h> | int | const char* | Ver implementación abajo |
| fopen | <stdio.h> | FILE* | const char*, const char* | Ver implementación abajo |
| chmod | <sys/stat.h> | int | const char*, mode_t | Ver implementación abajo |
| getprop | <system_properties.h> | int | const char* | Ver implementación abajo |

**Implementación completa de wrappers** (ver android-native-wrapper.js):
```javascript
Java.perform(() => {
  // Wrapper completo para mkdir
  const mkdir = createNativeFunctionWrapper('mkdir', 'int', ['pointer']);

  // Wrapper completo para stat
  const stat = createNativeFunctionWrapper('stat', 'int', ['pointer', 'pointer']);

  // Wrapper completo para fopen
  const fopen = createNativeFunctionWrapper('fopen', 'pointer', ['pointer', 'pointer']);

  // Wrapper completo para fclose
  const fclose = createNativeFunctionWrapper('fclose', 'int', ['pointer']);

  // Uso de wrappers
  const result = mkdir(folderName);
  const filePtr = fopen("/data/local/tmp/test.txt", "r");
  fclose(filePtr);
});
```

---

### 6. Memory Patching con Memory.patchCode()

**Problema actual**: La skill usa `.replace()` para NOP functions, lo que genera overhead y puede causar crashes.

**Solución del libro**: `Memory.patchCode()` patchea directamente en memoria (más eficiente).

**Ejemplo del libro**:
```javascript
// ❌ Enfoque actual - Alto overhead:
Interceptor.replace(targetPtr, () => {
  // NOP completo
  return ptr(0);
});

// ✅ Enfoque del libro - Baja overhead:
Memory.patchCode(targetPtr, [0x90, 0x90, 0x90, 0x90]);
```

**Cuándo usar memory patching**:
- Bypass de checks de seguridad (root detection, debugger)
- NOP de validaciones de integridad
- Patch de retorno de errores (cambiar -1 a 0)
- Más eficiente que `.replace()` para cambios simples

**Advertencia del libro**: Memory.patchCode() requiere que la región de memoria sea writable. Algunos sistemas (como iOS) mapean el código en una ubicación temporal.

---

### 7. Anti-Frida Detection Bypass - Nivel JNI Avanzado

**Problema actual**: Los scripts actuales usan comprobaciones básicas (/data/local/tmp/frida-server), pero las apps modernas usan técnicas más sofisticadas.

**Solución del libro**: Implementar checks anti-Frida en código JNI nativo y hookearlos.

**Ejemplo del libro - Check JNI**:
```c
// Código JNI que detecta Frida
#include <jni.h>
#include <sys/stat.h>

JNIEXPORT jboolean JNICALL
Java_com_example_MainActivity_isFridaRunning(JNIEnv *env, jobject thiz) {
    // Check 1: /data/local/tmp/frida-server
    struct stat sb;
    if (stat("/data/local/tmp/frida-server", &sb) == 0) {
        return true;
    }

    // Check 2: /proc/self/maps para "frida"
    FILE *fp = fopen("/proc/self/maps", "r");
    if (fp) {
        char line[512];
        while (fgets(line, sizeof(line), fp)) {
            if (strstr(line, "frida")) {
                fclose(fp);
                return true;
            }
        }
    }

    return false;
}
```

**Ejemplo del libro - Bypass en JavaScript**:
```javascript
Java.perform(() => {
  const isFridaRunning = Java.use('com.example.MainActivity');
  isFridaRunning.isFridaRunning.implementation = function() {
    console.log("[+] isFridaRunning() llamado");

    // Bypass 1: Hookear stat
    const statPtr = Module.getExportByName(null, 'stat');
    const statHook = Interceptor.attach(statPtr, {
        onEnter: function(args) {
            const path = args[0].readCString();
            if (path.includes('/data/local/tmp/frida-server')) {
                console.log("[!] Bypassing stat check");
                args[1].writeU32(0);  // st_mode = 0 (not a directory)
            }
        },
        onLeave: function(retval) {
            // Restaurar valor original si no era la ruta de Frida
        }
    });

    // Bypass 2: Hookear fopen
    const fopenPtr = Module.getExportByName(null, 'fopen');
    const fopenHook = Interceptor.attach(fopenPtr, {
        onEnter: function(args) {
            const path = args[0].readCString();
            if (path.includes('frida')) {
                console.log("[!] Bypassing fopen check");
                args[1] = ptr(0);  // return NULL
            }
        }
    });

    // Bypass 3: Hookear strstr
    const strstrPtr = Module.getExportByName(null, 'strstr');
    Interceptor.attach(strstrPtr, {
        onEnter: function(args) {
            const haystack = args[0].readCString();
            const needle = args[1].readCString();
            if (needle.includes('frida') && haystack.includes(needle)) {
                console.log("[!] Bypassing strstr check");
                args[2] = ptr(0);  // return NULL (no match found)
            }
        }
    });

    return false;  // Retornar false a la app
  };
});
```

**Técnicas anti-Frida comunes** (ver referencias/android-anti-frida-countermeasures.md):
- Check /data/local/tmp/frida-server
- Check /proc/self/maps para "frida" string
- Check port forwarding (frida-server-XXXX)
- Check for thread name anomalies
- Check for timing anomalies
- Check for debugger presence via ptrace
- Check for memory layout anomalies

---

### 8. Técnicas Únicas del Libro

Estas técnicas están en el Capítulo 7 del libro y NO existen en la skill actual.

#### 8.1 CModule + NativeCallback Integration

**Descripción**: Compilar código C en memoria y comunicarse bidireccionalmente con JavaScript.

**Ejemplo del libro**:
```javascript
// CCode compilado en memoria
const cm = new CModule(`
  #include <stdio.h>

  void notify_js(double value) {
    printf("[C MODULE] Valor calculado: %f\\n", value);
  }

  extern double sharedValue;

  void onEnter(GumInvocationContext *ic) {
    double result = (double)gum_invocation_context_get_return_value(ic);
    sharedValue = result;  // Compartir con JS
  }

  void onLeave(GumInvocationContext *ic) {
    printf("[C MODULE] onLeave ejecutado\\n");
  }
`, {
  sharedValue: Memory.alloc(Process.pointerSize)  // Variable compartida
});

// Notificar desde C cuando algo cambie
const notifyCallback = new NativeCallback(function(ptr) {
  const value = ptr.readDouble();
  console.log("[JS MODULE] Notificación desde C: " + value);
}, 'void', ['pointer']);

// Hook de alguna función
const targetFunction = Module.getExportByName(null, 'sqrt');
Interceptor.attach(targetFunction, {
  onEnter: cm.onEnter,
  onLeave: cm.onLeave
});

// Notificar desde JS cuando queramos
setTimeout(() => {
  notifyCallback(cm.sharedValue);
}, 1000);
```

**Beneficio del libro**: Rendimiento 4.5x mejor que JavaScript puro para hot paths (ejemplo: 5.8s vs 1.3s del libro).

#### 8.2 Stalker Engine

**Descripción**: Motor de tracing de instrucciones que permite capturar cada instrucción ejecutada.

**Uso básico del libro**:
```javascript
Stalker.follow(Thread.currentThreadId, {
  events: {
    call: true,      // Capturar todas las llamadas a funciones
    block: true,     // Capturar bloques de código
    execute: true    // Capturar cada instrucción
  }
});
```

**Aplicaciones avanzadas**:
- Tracing de call graphs completos
- Code coverage analysis
- Detección de obfuscación en tiempo real
- Forensics de ejecución

#### 8.3 Advanced Data Types (structs, ArrayBuffers)

**Descripción**: Manejo de estructuras de datos complejas (JNI structs, binary structures).

**Ejemplo del libro - leer struct timeval**:
```javascript
// Declaración de struct en C
struct timeval {
  long tv_sec;
  long tv_usec;
};

// Uso en Frida
const timePtr = args[0];
const tv_sec = timePtr.add(0).readLong();     // Offset 0
const tv_usec = timePtr.add(8).readLong();   // Offset 8

console.log("[+] timeval: sec=" + tv_sec + ", usec=" + tv_usec);
```

**Aplicaciones para Android**:
- JNI method arguments (JNIEnv*, jobject, jclass, jmethodID)
- Android-specific structs (ANativeWindowBuffer, AInputEvent)
- ByteBuffer manipulations

---

## 📚 Referencias

1. **The Frida Handbook** por Fernando Diaz (@entdark_)
   - GitHub: https://github.com/entdark/fridahandbook
   - Leanpub: http://leanpub.com/fridahandbook
   - 220 páginas de instrumentación binaria con Frida

2. **Documentación oficial de Frida**:
   - https://frida.re/docs/javascript-api/
   - https://codeshare.frida.re/

3. **Técnicas avanzadas de Frida**:
   - r2frida para reverse engineering
   - Stalker para code tracing
   - CModule para performance optimization

4. **Anti-Frida Detection**:
   - https://github.com/iddoeldinho/frida-detection

---

## 🎯 Conclusión

Este documento captura **14 técnicas críticas** del Capítulo 9 de "The Frida Handbook" que transformarán la skill de Android Pentesting de "bueno" a "avanzado":

1. ✅ Java.performNow() - Hooks instantáneos de lifecycle
2. ✅ Stack traces completos - Análisis de call paths
3. ✅ Constructor hooking - Intercepción de frameworks (OkHttp, Retrofit)
4. ✅ Argument manipulation - Control de flujo de datos
5. ✅ NativeFunction wrappers - Llamadas al sistema
6. ✅ Memory patching - Bypass eficiente de checks
7. ✅ Anti-Frida JNI bypass - Contra-medidas avanzadas
8. ✅ CModule integration - Optimización de hot paths
9. ✅ Stalker engine - Code tracing avanzado
10. ✅ Advanced data types - Manejo de structs complejas

Implementar estas técnicas permitirá análisis más profundos, bypasses más efectivos, y una cobertura de Frida al nivel de experto.
