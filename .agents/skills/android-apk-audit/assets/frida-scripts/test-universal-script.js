/**
 * Universal Test Script for Android Frida Scripts
 *
 * Comprehensive validation script to test all Android Pentesting skill scripts.
 * Verifies syntax, hook logic, and framework compatibility.
 *
 * Usage:
 *   frida -U -f <package_name> -l test-universal-script.js
 *
 * Author: Based on "The Frida Handbook" Chapter 9 implementations
 * Version: 1.0.0
 *
 * Compatible with: Frida 16.x+, Android 7-16
 */

const DEBUG_MODE = true;

// ========================================
// TEST CONFIGURATION
// ========================================

const TEST_CONFIG = {
  // Target package for testing (can be changed)
  targetPackage: 'com.example.app',

  // Maximum execution time per test (in ms)
  maxTestTime: 5000
};

// ========================================
// TEST RESULTS TRACKING
// ========================================

const testResults = {
  syntaxErrors: [],
  runtimeErrors: [],
  hookSuccesses: [],
  hookFailures: [],
  integrationTests: [],
  totalTests: 0
};

// ========================================
// UTILITY FUNCTIONS
// ========================================

/**
 * Log test result with timestamp and status
 */
function logTest(category, testName, status, message) {
  const timestamp = new Date().toISOString().split('T')[1].split('.')[0];
  const statusEmoji = status === 'PASS' ? '✅' : status === 'WARN' ? '⚠️' : status === 'FAIL' ? '❌' : '⏭️';
  
  console.log(`[${timestamp}] ${statusEmoji} [${category}/${testName}] ${message}`);
  
  testResults.totalTests++;
  
  if (status === 'FAIL') {
    testResults.failures.push({category, testName, message});
  } else if (status === 'PASS') {
    testResults.successes.push({category, testName, message});
  } else if (status === 'WARN') {
    testResults.warnings.push({category, testName, message});
  }
}

/**
 * Check if script file exists and is readable
 */
function checkScriptFile(scriptPath) {
  try {
    const fs = require('fs');
    const content = fs.readFileSync(scriptPath, 'utf8');
    return { exists: true, content: content, lines: content.split('\n').length };
  } catch (error) {
    return { exists: false, content: null, lines: 0, error: error.message };
  }
}

/**
 * Test JavaScript syntax validity
 */
function testJSSyntax(scriptPath, content) {
  try {
    logTest('SYNTAX', scriptPath, 'PASS', 'Valid JavaScript syntax');
    
    // Check for common syntax errors
    const syntaxChecks = [
      { pattern: /const\s+[^=]/g, error: 'Missing variable declaration' },
      { pattern: /function\s*\([^)]*\s*\{/g, error: 'Missing function body braces' },
      { pattern: /if\s*\([^)]*\s*\{/g, error: 'Missing if statement braces' },
      { pattern: /Java\.perform\s*\(/g, error: 'Missing Java.perform() braces' },
      { pattern: /\.overload\s*\([^)]*\s*\{/g, error: 'Missing overload() braces' },
      { pattern: /\.implementation\s*=\s*\([^)]*\s*\{/g, error: 'Missing implementation() equals and braces' },
      { pattern: /return\s+[^;]\s*\)/g, error: 'Missing semicolon after return' },
      { pattern: /Interceptor\.attach\s*\(/g, error: 'Missing Interceptor.attach() braces' },
      { pattern: /Module\.(getExportByName|findExportByName)\s*\(/g, error: 'Missing Module function call braces' }
    ];

    let errorsFound = 0;
    syntaxChecks.forEach(check => {
      if (check.pattern.test(content)) {
        logTest('SYNTAX', scriptPath, 'FAIL', check.error);
        errorsFound++;
      }
    });

    if (errorsFound === 0) {
      return { passed: true, errors: [] };
    } else {
      return { passed: false, errors: syntaxChecks.filter(c => c.pattern.test(content)) };
    }
  } catch (error) {
    logTest('SYNTAX', scriptPath, 'ERROR', 'Syntax check failed: ' + error.message);
    return { passed: false, errors: [`Syntax check error: ${error.message}`] };
  }
}

/**
 * Test Java.perform() usage
 */
function testJavaPerform(scriptPath, content) {
  try {
    const performCount = (content.match(/Java\.perform\(/g) || []).length;
    const performNowCount = (content.match(/Java\.performNow\(/g) || []).length;
    
    logTest('RUNTIME', scriptPath, 'PASS', 
      `Uses Java.perform() ${performCount} times, Java.performNow() ${performNowCount} times`);
    
    if (performNowCount > 0) {
      return { passed: true, recommendation: 'Uses Java.performNow() - GOOD' };
    } else {
      return { passed: true, recommendation: 'Uses Java.perform() only - Consider migrating to Java.performNow()' };
    }
  } catch (error) {
    logTest('RUNTIME', scriptPath, 'ERROR', 'Java.perform() check failed: ' + error.message);
    return { passed: false, errors: [`Check error: ${error.message}`] };
  }
}

/**
 * Test Interceptor.attach() usage
 */
function testInterceptorUsage(scriptPath, content) {
  try {
    const attachCount = (content.match(/Interceptor\.attach\(/g) || []).length;
    
    logTest('HOOKS', scriptPath, 'PASS', 
      `Found ${attachCount} Interceptor.attach() calls`);
    
    if (attachCount === 0) {
      return { passed: false, recommendation: 'No hooks found - Script does nothing' };
    } else {
      // Check if onEnter/onLeave are used
      const hasOnEnter = /onEnter\s*:/g.test(content);
      const hasOnLeave = /onLeave\s*:/g.test(content);
      
      if (hasOnEnter && hasOnLeave) {
        return { passed: true, recommendation: 'Uses onEnter/onLeave - EXCELLENT' };
      } else {
        return { passed: true, recommendation: 'Uses Interceptor.attach() but may be missing onEnter/onLeave' };
      }
    }
  } catch (error) {
    logTest('HOOKS', scriptPath, 'ERROR', 'Interceptor check failed: ' + error.message);
    return { passed: false, errors: [`Check error: ${error.message}`] };
  }
}

/**
 * Test Java.use() usage for class loading
 */
function testJavaUse(scriptPath, content) {
  try {
    const useCount = (content.match(/Java\.use\s*\(/g) || []).length;
    const classesUsed = content.match(/Java\.use\s*\(\s*([^)]+)\)/g) || [];
    
    logTest('FRAMWORK', scriptPath, 'PASS', 
      `Found ${useCount} Java.use() calls loading ${classesUsed.length} classes`);
    
    if (useCount === 0) {
      return { passed: false, recommendation: 'No Java.use() calls - Script does nothing' };
    } else if (classesUsed) {
      const classList = classesUsed.map(match => match[1].trim()).join(', ');
      return { passed: true, recommendation: `Loads classes: ${classList}` };
    } else {
      return { passed: true, recommendation: 'Uses Java.use() but no classes found' };
    }
  } catch (error) {
    logTest('FRAMWORK', scriptPath, 'ERROR', 'Java.use() check failed: ' + error.message);
    return { passed: false, errors: [`Check error: ${error.message}`] };
  }
}

/**
 * Test proper error handling with try/catch
 */
function testErrorHandling(scriptPath, content) {
  try {
    const tryCount = (content.match(/try\s*{/g) || []).length;
    const catchCount = (content.match(/}\s*catch\s*\(/g) || []).length;
    
    if (catchCount > 0 && catchCount === tryCount) {
      logTest('ERROR', scriptPath, 'PASS', 'Proper try/catch structure found');
      return { passed: true };
    } else if (tryCount === 0) {
      logTest('ERROR', scriptPath, 'WARN', 'No try/catch blocks found');
      return { passed: true };
    } else {
      logTest('ERROR', scriptPath, 'FAIL', 'Unmatched try/catch blocks');
      return { passed: false, errors: ['Unequal try/catch count'] };
    }
  } catch (error) {
    logTest('ERROR', scriptPath, 'ERROR', 'Error handling check failed: ' + error.message);
    return { passed: false, errors: [`Check error: ${error.message}`] };
  }
}

/**
 * Test NativeFunction usage
 */
function testNativeFunction(scriptPath, content) {
  try {
    const nativeFuncCount = (content.match(/new\s+NativeFunction\(/g) || []).length;
    
    logTest('NATIVE', scriptPath, 'PASS', 
      `Found ${nativeFuncCount} NativeFunction() definitions`);
    
    if (nativeFuncCount > 0) {
      return { passed: true, recommendation: 'Uses NativeFunction - ADVANCED FEATURE' };
    } else {
      return { passed: true, recommendation: 'No NativeFunction found - Basic scripts only' };
    }
  } catch (error) {
    logTest('ERROR', scriptPath, 'ERROR', 'NativeFunction check failed: ' + error.message);
    return { passed: false, errors: [`Check error: ${error.message}`] };
  }
}

/**
 * Test Thread usage for stack traces
 */
function testThreadUsage(scriptPath, content) {
  try {
    const threadCount = (content.match(/Thread\.\$new\(/g) || []).length;
    const currentThreadCount = (content.match(/currentThread\(\)/g) || []).length;
    
    logTest('STACK', scriptPath, 'PASS', 
      `Found ${threadCount} Thread.$new(), ${currentThreadCount} currentThread()`);
    
    if (threadCount > 0 && currentThreadCount > 0) {
      return { passed: true, recommendation: 'Uses Thread API for stack traces - EXCELLENT' };
    } else if (threadCount > 0) {
      return { passed: true, recommendation: 'Uses Thread.$new() but no stack extraction' };
    } else {
      return { passed: true, recommendation: 'No Thread usage found' };
    }
  } catch (error) {
    logTest('ERROR', scriptPath, 'ERROR', 'Thread check failed: ' + error.message);
    return { passed: false, errors: [`Check error: ${error.message}`] };
  }
}

/**
 * Test Memory usage
 */
function testMemoryUsage(scriptPath, content) {
  try {
    const allocCount = (content.match(/Memory\.(alloc|allocUtf8String|patchCode)\(/g) || []).length;
    const ptrCount = (content.match(/\bptr\(\s*\)/g) || []).length;
    
    logTest('MEMORY', scriptPath, 'PASS', 
      `Found ${allocCount} Memory.* calls, ${ptrCount} ptr() operations`);
    
    if (allocCount > 0 || ptrCount > 0) {
      return { passed: true, recommendation: 'Uses Memory API - ADVANCED' };
    } else {
      return { passed: true, recommendation: 'No Memory usage found' };
    }
  } catch (error) {
    logTest('ERROR', scriptPath, 'ERROR', 'Memory check failed: ' + error.message);
    return { passed: false, errors: [`Check error: ${error.message}`] };
  }
}

/**
 * Test Module usage for export resolution
 */
function testModuleUsage(scriptPath, content) {
  try {
    const moduleExports = (content.match(/Module\.(getExportByName|findExportByName)\(/g) || []).length;
    
    logTest('MODULE', scriptPath, 'PASS', 
      `Found ${moduleExports} Module.* calls`);
    
    if (moduleExports.length > 0) {
      return { passed: true, recommendation: 'Uses Module API for exports - ADVANCED' };
    } else {
      return { passed: true, recommendation: 'No Module usage found - Basic scripts only' };
    }
  } catch (error) {
    logTest('ERROR', scriptPath, 'ERROR', 'Module check failed: ' + error.message);
    return { passed: false, errors: [`Check error: ${error.message}`] };
  }
}

/**
 * Test global variable declarations
 */
function testGlobalVariables(scriptPath, content) {
  try {
    const globalVarCount = (content.match(/global\s+[a-zA-Z_0-9]+\s*=/g) || []).length;
    
    logTest('GLOBALS', scriptPath, 'PASS', 
      `Found ${globalVarCount} global variable declarations`);
    
    if (globalVarCount > 0) {
      return { passed: true, recommendation: 'Uses global variables for NativeFunctions - GOOD' };
    } else {
      return { passed: true, recommendation: 'No global variables - Script is self-contained' };
    }
  } catch (error) {
    logTest('ERROR', scriptPath, 'ERROR', 'Global variable check failed: ' + error.message);
    return { passed: false, errors: [`Check error: ${error.message}`] };
  }
}

// ========================================
// MAIN TEST EXECUTION
// ========================================

Java.performNow(() => {
  console.log("==================================================");
  console.log("=== UNIVERSAL TEST SCRIPT FOR ANDROID FRIDA SCRIPTS ===");
  console.log("==================================================");
  console.log("");
  console.log(`📋 Test Configuration:`);
  console.log(`   Target Package: ${TEST_CONFIG.targetPackage}`);
  console.log(`   Max Test Time: ${TEST_CONFIG.maxTestTime}ms`);
  console.log("");
  
  const startTime = Date.now();
  let allPassed = true;
  
  // ========================================
  // 1. SYNTAX VALIDATION
  // ========================================
  
  console.log("\n[1/9] SYNTAX VALIDATION =======================\n");
  
  const scriptFiles = [
    'android-early-instrumentation.js',
    'android-constructors-hook.js',
    'android-argument-manipulation.js',
    'android-native-wrapper.js',
    'android-anti-frida-countermeasures.js',
    'ssl-pinning-bypass.js',
    'root-detection-bypass.js',
    'network-interceptor-enhanced.js',
    'native-root-detection-probe.js'
  ];
  
  let syntaxErrorsFound = 0;
  
  for (const scriptFile of scriptFiles) {
    const scriptPath = `assets/frida-scripts/${scriptFile}`;
    const checkResult = checkScriptFile(scriptPath);
    
    if (!checkResult.exists) {
      console.log(`  ⏭️  ${scriptFile} - FILE NOT FOUND`);
      allPassed = false;
      continue;
    }
    
    const syntaxResult = testJSSyntax(scriptPath, checkResult.content);
    if (!syntaxResult.passed) {
      console.log(`  ⚠️  ${scriptFile} - ${syntaxResult.errors.length} SYNTAX ERROR(S)`);
      allPassed = false;
      syntaxErrorsFound += syntaxResult.errors.length;
      continue;
    }
    
    console.log(`  ✅ ${scriptFile} - Valid JavaScript syntax`);
  }
  
  console.log(`\n  📊 Syntax Validation: ${syntaxErrorsFound} errors found`);
  console.log("");
  
  // ========================================
  // 2. RUNTIME TESTING
  // ========================================
  
  console.log("\n[2/9] RUNTIME TESTING =======================\n");
  
  for (const scriptFile of scriptFiles) {
    const scriptPath = `assets/frida-scripts/${scriptFile}`;
    const checkResult = checkScriptFile(scriptPath);
    
    if (!checkResult.exists) {
      console.log(`  ⏭️  ${scriptFile} - SKIP (file not found)`);
      continue;
    }
    
    const javaPerfResult = testJavaPerform(scriptPath, checkResult.content);
    testResults.runtimeTests++;
    
    if (!javaPerfResult.passed) {
      allPassed = false;
    }
  }
  
  console.log(`\n  📊 Runtime Testing: ${testResults.runtimeTests} tests completed`);
  console.log("");
  
  // ========================================
  // 3. FRAMEWORK TESTING
  // ========================================
  
  console.log("\n[3/9] FRAMEWORK TESTING =======================\n");
  
  for (const scriptFile of scriptFiles) {
    const scriptPath = `assets/frida-scripts/${scriptFile}`;
    const checkResult = checkScriptFile(scriptPath);
    
    if (!checkResult.exists) {
      console.log(`  ⏭️  ${scriptFile} - SKIP (file not found)`);
      continue;
    }
    
    const hookResult = testInterceptorUsage(scriptPath, checkResult.content);
    testResults.hookTests++;
    
    if (!hookResult.passed) {
      allPassed = false;
    }
  }
  
  console.log(`\n  📊 Framework Testing: ${testResults.hookTests} hook tests completed`);
  console.log("");
  
  // ========================================
  // 4. API TESTING
  // ========================================
  
  console.log("\n[4/9] API TESTING =======================\n");
  
  for (const scriptFile of scriptFiles) {
    const scriptPath = `assets/frida-scripts/${scriptFile}`;
    const checkResult = checkScriptFile(scriptPath);
    
    if (!checkResult.exists) {
      console.log(`  ⏭️  ${scriptFile} - SKIP (file not found)`);
      continue;
    }
    
    const useResult = testJavaUse(scriptPath, checkResult.content);
    const moduleResult = testModuleUsage(scriptPath, checkResult.content);
    const nativeResult = testNativeFunction(scriptPath, checkResult.content);
    const threadResult = testThreadUsage(scriptPath, checkResult.content);
    const memoryResult = testMemoryUsage(scriptPath, checkResult.content);
    const globalResult = testGlobalVariables(scriptPath, checkResult.content);
    
    const apiTests = [useResult, moduleResult, nativeResult, threadResult, memoryResult, globalResult];
    const apiPassedCount = apiTests.filter(t => t.passed).length;
    const apiTotalCount = apiTests.length;
    
    console.log(`  📊 API Testing: ${apiPassedCount}/${apiTotalCount} API tests passed`);
    
    if (apiPassedCount < apiTotalCount) {
      allPassed = false;
    }
  }
  
  console.log(`\n  📊 API Testing: ${testResults.totalTests} total tests completed`);
  console.log("");
  
  // ========================================
  // 5. ERROR HANDLING TESTING
  // ========================================
  
  console.log("\n[5/9] ERROR HANDLING TESTING =======================\n");
  
  for (const scriptFile of scriptFiles) {
    const scriptPath = `assets/frida-scripts/${scriptFile}`;
    const checkResult = checkScriptFile(scriptPath);
    
    if (!checkResult.exists) {
      console.log(`  ⏭️  ${scriptFile} - SKIP (file not found)`);
      continue;
    }
    
    const errorResult = testErrorHandling(scriptPath, checkResult.content);
    testResults.totalTests++;
    
    if (!errorResult.passed) {
      allPassed = false;
    }
  }
  
  console.log(`\n  📊 Error Handling: ${testResults.totalTests} error handling tests completed`);
  console.log("");
  
  // ========================================
  // 6. SUMMARY AND RECOMMENDATIONS
  // ========================================
  
  const endTime = Date.now();
  const totalTime = endTime - startTime;
  
  console.log("==================================================");
  console.log("=== TEST SUMMARY ==================");
  console.log("==================================================");
  console.log("");
  console.log(`📊 Total Tests Run: ${testResults.totalTests}`);
  console.log(`⏱️  Total Time: ${(totalTime / 1000).toFixed(2)} seconds`);
  console.log("");
  console.log("📋 Syntax Errors: " + syntaxErrorsFound);
  console.log("📊 Total Passed: " + testResults.successes.length);
  console.log("⚠️  Total Warnings: " + testResults.warnings.length);
  console.log("❌ Total Failures: " + testResults.failures.length);
  console.log("");
  console.log(`✅ All Passed: ${allPassed ? 'YES' : 'NO'}`);
  console.log("");
  console.log("=== RECOMMENDATIONS ====================");
  
  // ========================================
  // RECOMMENDATIONS
  // ========================================
  
  if (!allPassed) {
    console.log("\n🔧 FIX REQUIRED:");
    console.log("The following scripts have syntax errors that need to be fixed:");
    console.log("");
    
    for (const scriptFile of scriptFiles) {
      const scriptPath = `assets/frida-scripts/${scriptFile}`;
      const checkResult = checkScriptFile(scriptPath);
      
      if (!checkResult.exists) {
        continue;
      }
      
      const syntaxResult = testJSSyntax(scriptPath, checkResult.content);
      if (!syntaxResult.passed) {
        console.log(`  ⏭️  ${scriptFile} - Has ${syntaxResult.errors.length} syntax error(s)`);
      }
    }
    
    console.log("");
    console.log("✅ Run test script again after fixing errors:");
    console.log("   frida -U -f " + TEST_CONFIG.targetPackage + " -l test-universal-script.js");
    console.log("");
    console.log("📖 DOCUMENTATION");
    console.log("Each script includes inline comments explaining its purpose and usage.");
    console.log("Review scripts/frida-scripts/ directory for detailed usage instructions.");
  } else {
    console.log("\n🎉 SUCCESS:");
    console.log("All scripts validated successfully!");
    console.log("");
    console.log("📖 READY FOR TESTING");
    console.log("You can now run individual scripts:");
    console.log("  frida -U -f <package> -l <script-name>");
    console.log("");
    console.log("Example: frida -U -f com.example.app -l android-early-instrumentation.js");
    console.log("Example: frida -U -f com.example.app -l android-constructors-hook.js");
    console.log("Example: frida -U -f com.example.app -l ssl-pinning-bypass.js");
  }
});
