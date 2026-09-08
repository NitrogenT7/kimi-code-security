# 报告与 PoC 模板集

## 目录
1. [攻击面测绘报告模板](#攻击面测绘报告模板)
2. [攻击链深度分析报告模板](#攻击链深度分析报告模板)
3. [漏洞报告模板](#漏洞报告模板)
4. [PoC 代码模板](#poc-代码模板)

---

## 攻击面测绘报告模板

```markdown
# {AppName} ({packageName} v{versionName}) 攻击面测绘报告

## 一、应用概览

| 属性 | 值 |
|------|-----|
| 包名 | {packageName} |
| versionCode | {versionCode} |
| versionName | {versionName} |
| targetSdkVersion | {targetSdk} |
| minSdkVersion | {minSdk} |
| 网络安全配置 | {networkSecurityConfig} |
| allowBackup | {true/false} |
| debuggable | {true/false} |

## 二、Exported 组件攻击面

### 2.1 Activity ({count} 个)

#### {ActivityName}
| 属性 | 值 |
|------|-----|
| exported | true/false |
| 权限 | {permission or "无"} |
| Intent Filters | {action/category/data} |
| 优先级 | P0/P1/P2/P3 |
| 初步判断 | {简要描述} |

### 2.2 Service ({count} 个)

#### {ServiceName}
[同上格式]

### 2.3 Receiver ({count} 个)

#### {ReceiverName}
[同上格式]

### 2.4 Provider ({count} 个)

#### {ProviderName}
| 属性 | 值 |
|------|-----|
| exported | true/false |
| 权限 | {permission} |
| grantUriPermissions | true/false |
| 路径权限 | {pathPermission} |
| 优先级 | P0/P1/P2/P3 |

## 三、DeepLink 攻击面

### 3.1 URL Scheme 清单

| Scheme | Host | Path | 对应 Activity | 风险 |
|--------|------|------|---------------|------|
| {scheme} | {host} | {path} | {Activity} | {风险描述} |

## 四、权限分析

### 4.1 自定义权限

| 权限名 | protectionLevel | 用途 | 风险 |
|--------|-----------------|------|------|
| {name} | {normal/dangerous/signature} | {usage} | {risk} |

### 4.2 申请的危险权限

| 权限名 | 用途分析 |
|--------|----------|
| {name} | {analysis} |

## 五、攻击面汇总

| 优先级 | 数量 | 组件列表 |
|--------|------|----------|
| P0 | {n} | {list} |
| P1 | {n} | {list} |
| P2 | {n} | {list} |
| P3 | {n} | {list} |
```

---

## 攻击链深度分析报告模板

```markdown
# {AppName} 攻击链深度分析报告

## 概述

本报告基于 JADX 逆向分析，深入研究 {n} 条攻击链路的**完整触发机制、数据流传递、代码级漏洞细节和可行性评估**。

---

## 攻击链 {N}: {攻击链标题}

### {N}.1 攻击面概览

| 属性 | 值 |
|------|-----|
| 入口组件 | {ComponentName} ({type}) |
| 自定义权限 | {permission or "无"} |
| 触发 Action | {action} |
| 数据类型 | {mimeType} |
| 攻击者能力要求 | {requirement} |

### {N}.2 完整数据流

```
攻击者应用
  ↓  startActivity(Intent(ACTION_{action})
  ↓    .putExtra("{key}", {payload})
  ↓    .setComponent({ComponentName}))
  ↓
  ↓ {ComponentName}.{entryMethod}()
  ↓  {关键操作 1}
  ↓  {关键操作 2}
  ↓  ...
  ↓
  ↓ {SinkClass}.{sinkMethod}()
  ↓  {漏洞触发}
```

### {N}.3 代码级分析

#### 入口点
```java
// {ClassName}.{methodName}()
{关键代码片段}
```
**分析**：{代码行为解释}

#### 数据传递
```java
// {ClassName}.{methodName}()
{关键代码片段}
```
**分析**：{数据如何传递，是否有过滤}

#### Sink 点
```java
// {ClassName}.{methodName}()
{关键代码片段}
```
**分析**：{Sink 行为及漏洞成因}

### {N}.4 漏洞细节

| 编号 | 风险项 | 风险等级 | 描述 |
|------|--------|----------|------|
| {VULN-ID} | {标题} | Critical/High/Medium/Low | {描述} |

### {N}.5 可行性评估

| 维度 | 评估 |
|------|------|
| 可达性 | {评估} |
| 绕过难度 | {评估} |
| 利用稳定性 | {评估} |
| 影响范围 | {评估} |

### {N}.6 PoC 构造

```java
Intent intent = new Intent();
intent.setComponent(new ComponentName("{package}", "{component}"));
intent.setAction("{action}");
intent.putExtra("{key}", {payload});
startActivity(intent);
```

**预期结果**：{描述}
```

---

## 漏洞报告模板

```markdown
# {VULN-ID}: {漏洞标题}

## 基本信息

| 属性 | 值 |
|------|-----|
| 漏洞类型 | {类型} |
| 风险等级 | Critical / High / Medium / Low / Informational |
| CWE 编号 | CWE-{编号} |
| 影响组件 | {ComponentName} |
| 利用前提 | {前提条件} |
| 修复优先级 | P0 / P1 / P2 |

## 漏洞摘要

{用 1-2 句话概括漏洞：什么组件的什么问题导致了什么风险}

## 技术细节

### 攻击面

{描述入口点：什么组件、如何被外部触达、需要什么权限}

### 完整攻击链

```
{详细的数据流图，从入口到 Sink}
```

### 关键代码

```java
// {ClassName}.{methodName}:{line}
{漏洞相关的完整代码片段}
```

### 根因分析

{详细解释漏洞的根本原因：为什么这段代码有问题}

## 影响分析

### 直接危害

- {危害 1}
- {危害 2}

### 间接危害（若存在）

- {危害 1}

## 复现步骤

1. {步骤 1}
2. {步骤 2}
3. {步骤 3}
4. {预期结果}

## PoC 代码

```java
{完整的 PoC 代码}
```

## 修复建议

### 短期修复（Hotfix）

- {建议 1}

### 长期修复（架构层面）

- {建议 1}

### 代码示例

```java
{修复后的代码示例}
```

## 参考信息

- JADX 证据：`{class_name}.{method_name}`
- Manifest 证据：`{component}` exported="{value}"
- 验证状态：已验证 / 待验证
```

---

## PoC 代码模板

### 通用 PoC Android 应用结构

```
poc/
├── app/
│   └── src/
│       └── main/
│           ├── AndroidManifest.xml
│           ├── java/com/poc/exploit/
│           │   └── MainActivity.java
│           └── res/layout/
│               └── activity_main.xml
├── build.gradle
└── settings.gradle
```

### PoC MainActivity.java 模板

```java
package com.poc.exploit;

import android.app.Activity;
import android.content.ComponentName;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.util.Log;
import android.widget.Button;

public class MainActivity extends Activity {
    private static final String TAG = "PoC";
    private static final String TARGET_PKG = "{target_package}";
    private static final String TARGET_COMPONENT = "{target_component}";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        Button btn = findViewById(R.id.exploit_btn);
        btn.setOnClickListener(v -> runExploit());
    }

    private void runExploit() {
        try {
            Intent intent = new Intent();
            intent.setComponent(new ComponentName(TARGET_PKG, TARGET_COMPONENT));
            
            // 根据漏洞类型构造 Intent
            // Type 1: 标准 Intent 注入
            intent.setAction("{action}");
            intent.putExtra("{key}", "{payload}");
            
            // Type 2: DeepLink
            // intent.setData(Uri.parse("{scheme}://{host}/{path}?{param}={value}"));
            
            // Type 3: Provider 路径遍历
            // Uri uri = Uri.parse("content://{authority}/{traversal_path}");
            // InputStream is = getContentResolver().openInputStream(uri);
            
            Log.i(TAG, "Sending intent: " + intent.toUri(0));
            startActivity(intent);
            // startService(intent);
            // sendBroadcast(intent);
            
        } catch (Exception e) {
            Log.e(TAG, "Exploit failed", e);
        }
    }
}
```

### ADB 命令行 PoC 模板

```bash
# Activity 启动
adb shell am start -n {package}/{component} \
    -a {action} \
    --es {key} "{value}" \
    --ei {int_key} {int_value} \
    --ez {bool_key} {true/false}

# Service 启动
adb shell am startservice -n {package}/{component} \
    -a {action} \
    --es {key} "{value}"

# Broadcast 发送
adb shell am broadcast -n {package}/{component} \
    -a {action} \
    --es {key} "{value}"

# Provider 查询
adb shell content query --uri content://{authority}/{path}
adb shell content read --uri content://{authority}/{path}

# DeepLink 触发
adb shell am start -a android.intent.action.VIEW \
    -d "{scheme}://{host}/{path}?{param}={value}"
```

### 通用 build.gradle 模板

```gradle
plugins {
    id 'com.android.application'
}

android {
    namespace 'com.poc.exploit'
    compileSdk 34

    defaultConfig {
        applicationId "com.poc.exploit"
        minSdk 24
        targetSdk 34
        versionCode 1
        versionName "1.0"
    }

    buildTypes {
        release {
            minifyEnabled false
        }
    }
    compileOptions {
        sourceCompatibility JavaVersion.VERSION_1_8
        targetCompatibility JavaVersion.VERSION_1_8
    }
}
```

---

## 风险等级定义

| 等级 | 定义 | 示例 |
|------|------|------|
| **Critical** | 无需特殊条件即可利用，可导致系统完全失控 | 任意代码执行、无防护的 exported Provider 读取敏感数据 |
| **High** | 需要一定条件，但影响严重 | Intent 转发绕过权限、路径遍历读取私有文件 |
| **Medium** | 需要特定场景或配合其他问题 | DeepLink 导致的 WebView XSS、本地拒绝服务 |
| **Low** | 影响有限或利用条件苛刻 | 信息泄露（非敏感）、Debug 日志泄露 |
| **Informational** | 不构成直接安全威胁，但值得注意 | 硬编码密钥（但未使用）、过时的组件版本 |
