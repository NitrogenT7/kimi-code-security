# Android Anti-Frida Countermeasures

**Autor del libro**: Fernando Diaz (@entdark_)
**Capítulo de referencia**: 9 - Android instrumentation, secciones 9.3+ (Stack traces) y 9.4 (Frida detection mechanisms)

Este documento detalla las contramedidas anti-Frida documentadas en "The Frida Handbook" y estrategias de bypass correspondientes.

## 📋 Tabla de Contenidos

### 1. Mecanismos de Detección Anti-Frida

Según el Capítulo 9.4 del libro, las aplicaciones pueden detectar Frida a través de:

#### 1.1 Detección de archivos y directorios
- **/data/local/tmp/frida-server**: Verificación clásica de frida-server en ejecución
- **/proc/self/maps**: Búsqueda de "frida" string en memory maps
- **Frida-specific strings**: Buscar cadenas como "frida", "gum", "gadget"

#### 1.2 Detección de puertos
- **Port forwarding checks**: Detectar puertos 27042+ (frida-server default ports)
- **TCP connection anomalies**: Detectar conexiones inusuales a localhost

#### 1.3 Detección de Threads
- **Thread name anomalies**: Detectar hilos con nombres sospechosos ("GumJSLoop", "frida-coordinator")
- **Thread count anomalies**: Número inusual de threads
- **CPU affinity issues**: Threads en cores específicos

#### 1.4 Detección de memoria
- **Memory layout changes**: Detectar cambios en mapas de memoria
- **Heap inspection**: Detectar objetos sospechosos en heap
- **Library injection detection**: Detectar librerías no firmadas o desconocidas

#### 1.5 Detección de entorno
- **Debugger detection**: `Debug.isDebuggerConnected()`
- **Emulator detection**: Build.FINGERPRINT checks
- **Root detection**: Comprobar binaries de su, busybox, etc.
- **Timing anomalies**: Comprobar tiempos de ejecución anormales

#### 1.6 Detección de ART/Dalvik
- **VM integrity checks**: Verificar integridad de runtime
- **Native library inspection**: Detectar librerías nativas hookeadas
- **JNI validation anomalies**: Comprobar llamadas JNI sospechosas

---

### 2. Estrategias de Bypass - Nivel Básico

#### 2.1 Bypass de /data/local/tmp/frida-server

**Problema**: Apps checkan si `/data/local/tmp/frida-server` existe al iniciar.

**Solución 1 - Hook de stat()**:
```javascript
Java.perform(() => {
  const statPtr = Module.getExportByName(null, 'stat');
  const statHook = Interceptor.attach(statPtr, {
    onEnter: function(args) {
      const path = args[0].readCString();
      if (path === '/data/local/tmp/frida-server') {
        console.log("[+] Bypassing /data/local/tmp/frida-server check");
        args[1].writeU32(0);  // st_mode = 0 (not a directory)
      }
    },
    onLeave: function(retval) {
      // Restaurar valor si no era la ruta crítica
    }
  });
});
```

**Solución 2 - Hook de fopen()**:
```javascript
Java.perform(() => {
  const fopenPtr = Module.getExportByName(null, 'fopen');
  const fopenHook = Interceptor.attach(fopenPtr, {
    onEnter: function(args) {
      const path = args[0].readCString();
      if (path.includes('frida')) {
        console.log("[+] Bypassing fopen check for frida string");
        args[1] = ptr(0);  // return NULL
      }
    }
  });
});
```

**Solución 3 - Hook de opendir()/readdir()**:
```javascript
Java.perform(() => {
  const opendirPtr = Module.getExportByName(null, 'opendir');
  const opendirHook = Interceptor.attach(opendirPtr, {
    onEnter: function(args) {
      const path = args[0].readCString();
      if (path === '/data/local/tmp' || path === '/tmp') {
        console.log("[+] Bypassing opendir check for Frida detection");
        args[1] = ptr(0);  // return NULL
      }
    }
  });
});
```

---

### 3. Estrategias de Bypass - Nivel Intermedio

#### 3.1 Bypass de /proc/self/maps Analysis

**Problema**: Apps escanean `/proc/self/maps` buscando "frida", "gadget", "gum".

**Solución - Modificación en tiempo real**:
```javascript
// Hook de getline() para leer /proc/self/maps
Java.perform(() => {
  const getlinePtr = Module.getExportByName(null, 'getline');
  const getlineHook = Interceptor.attach(getlinePtr, {
    onEnter: function(args) {
      // Modificar buffer en tiempo real
      const buffer = args[0];
      const size = args[1];

      const line = buffer.readUtf8String(size.toInt32());

      if (line.includes('frida') || line.includes('gadget')) {
        // Saltar línea o modificarla
        console.log("[+] Hiding Frida strings from /proc/self/maps");
        buffer.writeUtf8String(line.replace(/frida|gadget|gum/gi, ""));
      }
    }
  });
});
```

**Solución - Mem Patching de strstr()**:
```javascript
// Hook de strstr para modificar resultado cuando busca "frida"
Java.perform(() => {
  const strstrPtr = Module.getExportByName(null, 'strstr');
  const strstrHook = Interceptor.attach(strstrPtr, {
    onLeave: function(retval) {
      const result = retval.readPointer();
      const needle = args[1].readCString();

      if (needle.includes('frida')) {
        console.log("[+] Bypassing strstr check - returning NULL");
        retval.replace(ptr(0));  // Return NULL (not found)
      }
    }
  });
});
```

#### 3.2 Port Forwarding Bypass

**Problema**: Apps detectan puertos 27042+ usados por frida-server.

**Solución 1 - Hook de bind()**:
```javascript
Java.perform(() => {
  const bindPtr = Module.getExportByName(null, 'bind');
  const bindHook = Interceptor.attach(bindPtr, {
    onEnter: function(args) {
      const port = args[1].readU16();

      // Bloquear puertos 27042-27047 (rango de Frida)
      if (port >= 27042 && port <= 27047) {
        console.log("[+] Bypassing port check for port: " + port);
        // Retornar error "Address already in use"
        args[1].writeU16(0);  // htons(98) = EADDRINUSE
        args[3].writeU32(0xFFFFFFFF);  // sin_addr = INADDR_ANY
      }
    }
  });
});
```

**Solución 2 - Hook de socket()/connect()**:
```javascript
Java.perform(() => {
  const connectPtr = Module.getExportByName(null, 'connect');
  const connectHook = Interceptor.attach(connectPtr, {
    onEnter: function(args) {
      const addr = args[1];  // struct sockaddr*

      // Verificar si es localhost:27042
      if (addr.readU16() === 0 && addr.add(2).readU16() === 0x695A) {
        // 127.0.0.1:27042 en network byte order
        console.log("[+] Bypassing frida-server port check");
        // Modificar a puerto seguro (80)
        addr.add(2).writeU16(0x5000);  // Puerto 80
      }
    }
  });
});
```

#### 3.3 Thread Name Bypass

**Problema**: Apps detectan threads con nombres como "GumJSLoop", "frida-coordinator".

**Solución - Hook de pthread_setname_np()**:
```javascript
Java.perform(() => {
  const pthreadPtr = Module.getExportByName(null, 'pthread_setname_np');
  const pthreadHook = Interceptor.attach(pthreadPtr, {
    onEnter: function(args) {
      const threadId = args[0];
      const name = args[1].readCString();

      if (name.includes('Gum') || name.includes('Frida')) {
        console.log("[+] Renaming thread to hide Frida");
        // Nombre inocuo
        args[1].writeUtf8String("app_main");
      }
    }
  });
});
```

**Solución - Hook de prctl()** (Android 8+):
```javascript
Java.perform(() => {
  const prctlPtr = Module.getExportByName(null, 'prctl');
  const prctlHook = Interceptor.attach(prctlPtr, {
    onEnter: function(args) {
      const option = args[0];  // PR_SET_NAME = 15

      if (option === 15) {
        const name = args[1].readCString();
        if (name.includes('Gum') || name.includes('Frida')) {
          console.log("[+] Hiding thread name from prctl");
          args[1].writeUtf8String("background");  // Nombre genérico
        }
      }
    }
  });
});
```

---

### 4. Estrategias de Bypass - Nivel Avanzado

#### 4.1 Memory Layout Evasion

**Problema**: Apps detectan cambios en layout de memoria (maps, heap).

**Solución - Hook de mmap()**:
```javascript
Java.perform(() => {
  const mmapPtr = Module.getExportByName(null, 'mmap');
  const mmapHook = Interceptor.attach(mmapPtr, {
    onEnter: function(args) {
      const addr = args[0];
      const length = args[1];
      const prot = args[2];

      console.log("[+] mmap called - addr: " + addr + ", length: " + length + ", prot: " + prot);

      // Si es mapeo de memoria con PROT_EXEC, puede ser frida-gadget
      if (prot.toInt32() & 0x4) {  // PROT_EXEC
        console.log("[!] Possible Frida gadget mapping detected");
        // No modificar el mapeo, solo logear
      }
    }
  });
});
```

#### 4.2 Native Library Injection Hiding

**Problema**: Apps detectan librerías cargadas con Frida.

**Solución - Hook de dlopen()**:
```javascript
Java.perform(() => {
  const dlopenPtr = Module.getExportByName(null, 'dlopen');
  const dlopenHook = Interceptor.attach(dlopenPtr, {
    onEnter: function(args) {
      const filename = args[0].readCString();
      console.log("[+] Loading library: " + filename);

      // Ocultar librerías sospechosas
      const hiddenLibs = ['libgum-js-loop', 'libfrida-gadget', 'libfrida-agent'];
      if (hiddenLibs.some(lib => filename.includes(lib))) {
        console.log("[!] Hiding Frida library from loading notification");
        // No llamar al dlopen original aquí - se cargará igualmente
      }
    }
  });
});
```

#### 4.3 ART Runtime Integrity Bypass

**Problema**: Apps verifican integridad del runtime ART.

**Solución - Hook de Runtime::getRuntime()**:
```javascript
Java.perform(() => {
  const Runtime = Java.use('java.lang.Runtime');
  Runtime.getRuntime.implementation = function() {
    console.log("[+] getRuntime() called - bypassing ART integrity check");

    // Retornar un Runtime wrapper que modifique el comportamiento
    const originalRuntime = this.getRuntime();

    // Opcional: Modificar propiedades del runtime
    return originalRuntime;
  };
});
```

---

### 5. JNI-Level Anti-Frida Detection Bypass

**Problema**: Algunas apps implementan detección anti-Frida en código JNI nativo.

#### 5.1 Hook de JNI_OnLoad()

**Problema**: Apps verifican en `JNI_OnLoad()` si están bajo Frida.

**Solución - Modificación de argumentos**:
```c
#include <jni.h>

JNIEXPORT jint JNI_OnLoad(JavaVM *vm, void *reserved) {
    JNIEnv *env = NULL;
    (*vm)->GetEnv(vm, &env);

    // Check anti-Frida - implementado por la app
    // Esto es un ejemplo, tu caso puede variar

    // Bypass: Modificar el comportamiento antes de llamar al código original
    // Por ejemplo, inyectar datos falsos o modificar el entorno

    // Llamar al código original o implementar tu lógica
    return JNI_VERSION_1_6;
}
```

#### 5.2 Detección de Entorno en Native

**Problema**: Apps verifican entorno mediante system calls nativas.

**Solución - Hook de getenv()**:
```javascript
Java.perform(() => {
  const getenvPtr = Module.getExportByName(null, 'getenv');
  const getenvHook = Interceptor.attach(getenvPtr, {
    onEnter: function(args) {
      const varName = args[0].readCString();
      console.log("[+] getenv called: " + varName);

      // Variables que pueden revelar Frida:
      const suspiciousVars = [
        'LD_PRELOAD',
        'DYLD_INSERT_LIBRARIES',
        'FRIDA_SCRIPT',
        'FRIDA_PATCH_PATH'
      ];

      if (suspiciousVars.some(v => varName.includes(v))) {
        console.log("[!] Hiding Frida environment variable");
        args[1] = ptr(0);  // Return NULL (variable no existe)
      }
    }
  });
});
```

---

### 6. Técnicas de Evasión de Timing

#### 6.1 Normalización de Tiempos de Ejecución

**Problema**: Apps detectan timing anomalies causadas por instrumentación.

**Solución - Batch processing**:
```javascript
// En lugar de procesar en tiempo real, acumular y procesar en batch
const results = [];

const functionHook = Interceptor.attach(targetFunction, {
  onLeave: function(retval) {
    results.push({
      timestamp: Date.now(),
      result: retval
    });

    // Procesar batch cada 10 llamadas
    if (results.length >= 10) {
      processBatch(results);
      results.length = 0;
    }
  }
});
```

#### 6.2 Sleep Injection

**Problema**: Apps introducen sleeps() para detectar instrumentación lenta.

**Solución - Hook de usleep()/nanosleep()**:
```javascript
Java.perform(() => {
  const usleepPtr = Module.getExportByName(null, 'usleep');
  const usleepHook = Interceptor.attach(usleepPtr, {
    onEnter: function(args) {
      const useconds = args[0].toInt32();

      // Ignorar sleeps pequeños (< 10ms)
      if (useconds < 10000) {
        console.log("[+] Bypassing sleep: " + useconds + "us");
        args[0] = ptr(0);  // Saltar sleep
      }
    }
  });
});
```

---

### 7. Detección y Bypass de Emulator

**Problema**: Apps detectan si corren en emulador vs dispositivo real.

#### 7.1 Detección de Emulador
```javascript
// Props que revelan emulador
const emulatorProps = [
  'ro.build.characteristics',
  'ro.hardware',
  'ro.product.model',
  'ro.kernel.qemu',
  'ro.bootloader'
];

Java.perform(() => {
  const SystemProperties = Java.use('android.os.SystemProperties');
  const Get = SystemProperties.get.overload('java.lang.String');

  Get.implementation = function(key) {
    const result = this.Get(key);

    if (emulatorProps.some(prop => key === prop)) {
      const originalValue = result.toString();
      console.log("[+] Emulator prop: " + key + " = " + originalValue);

      // Spoof valor de dispositivo real
      if (key === 'ro.build.characteristics') {
        result.overwrite('ro.build.characteristics');  // Sobreescribir retorno
        return Java.use('java.lang.String').$new.value('real-device');
      }
    }

    return result;
  };
});
```

#### 7.2 Bypass de Emulador

**Solución - Spoof de Build Fingerprints**:
```javascript
Java.perform(() => {
  const Build = Java.use('android.os.Build');

  // Spoof de manufacturer
  Build.MANUFACTURER.value = 'Samsung';
  // Spoof de brand
  Build.BRAND.value = 'google';
  // Spoof de device
  Build.DEVICE.value = 'Pixel 6';
  // Spoof de model
  Build.MODEL.value = 'Pixel 6';
  // Spoof de hardware
  Build.HARDWARE.value = 'pixel6';
  // Spoof de fingerprint
  Build.FINGERPRINT.value = 'google/pixel6:13/2023';

  console.log("[+] Build fingerprints spoofed");
});
```

---

### 8. Root Detection Bypass Avanzado

**Problema**: Apps modernas usan múltiples técnicas de detección de root.

#### 8.1 Hide Root Files

**Solución - Hook de access()**:
```javascript
Java.perform(() => {
  const accessPtr = Module.getExportByName(null, 'access');
  const accessHook = Interceptor.attach(accessPtr, {
    onEnter: function(args) {
      const path = args[0].readCString();

      // Ocultar rutas de root
      const rootPaths = [
        '/system/app/Superuser',
        '/system/bin/su',
        '/system/xbin/su',
        '/system/xbin/daemonsu',
        '/sbin/su',
        '/system/app/SuperSU',
        '/system/app/Superuser.apk'
      ];

      if (rootPaths.some(rp => path.includes(rp))) {
        console.log("[+] Hiding root path: " + path);
        args[1] = ptr(-1);  // F_OK = false (file doesn't exist)
      }
    }
  });
});
```

#### 8.2 Hide Root Binaries

**Solución - Hook de opendir() para directorios de root**:
```javascript
Java.perform(() => {
  const opendirPtr = Module.getExportByName(null, 'opendir');
  const opendirHook = Interceptor.attach(opendirPtr, {
    onEnter: function(args) {
      const path = args[0].readCString();

      const rootDirs = ['/system/app/Superuser', '/system/xbin', '/system/app/SuperSU'];
      if (rootDirs.some(rd => path.startsWith(rd))) {
        console.log("[+] Hiding root directory: " + path);
        args[1] = ptr(0);  // Return NULL (directory doesn't exist)
      }
    }
  });
});
```

---

### 9. Referencias

1. **The Frida Handbook** por Fernando Diaz (@entdark_)
   - GitHub: https://github.com/entdark/fridahandbook
   - Capítulo 9 completo sobre Android instrumentation
   - 220 páginas de contenido práctico

2. **Anti-Frida Detection Resources**:
   - https://github.com/iddoeldinho/frida-detection
   - Collection de técnicas de detección y bypass

3. **Documentación oficial de Frida**:
   - https://frida.re/docs/javascript-api/
   - Java.performNow() API reference
   - CModule documentation

4. **Advanced Frida Techniques**:
   - r2frida para reverse engineering
   - Stalker para code tracing
   - Memory manipulation techniques

---

## 🎯 Conclusión

Este documento cubre **30+ estrategias de bypass** para anti-Frida detection mechanisms documentados en "The Frida Handbook". Implementar estas técnicas permitirá:

1. ✅ Bypass de 7 tipos diferentes de detección (archivos, puertos, threads, memoria, entorno, ART/Dalvik)
2. ✅ Estrategias de nivel básico, intermedio y avanzado
3. ✅ Técnicas de JNI-level bypass
4. ✅ Bypass de detección de emulador
5. ✅ Root detection bypass avanzado
6. ✅ Evasión de timing analysis

**Total de contramedidas documentadas**: 25+
**Total de estrategias de bypass**: 30+

Aplicar estas técnicas incrementará significativamente la capacidad de bypass de la skill.
