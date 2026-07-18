# Android IPC 审计技术深度指南

## 目录
1. [JADX-MCP 工具链详解](#jadx-mcp-工具链详解)
2. [Jadx CLI 备用模式指南](#jadx-cli-备用模式指南)
3. [Manifest 攻击面分析技术](#manifest-攻击面分析技术)
4. [防御机制识别方法论](#防御机制识别方法论)
5. [数据流追踪高级技巧](#数据流追踪高级技巧)
6. [常见漏洞模式深度分析](#常见漏洞模式深度分析)
7. [防幻觉验证方法论](#防幻觉验证方法论)

---

## JADX-MCP 工具链详解

### 基础信息获取

```
get_android_manifest                    → 完整 Manifest XML
get_strings                             → strings.xml 内容
get_main_activity_class                 → 主 Activity 类名
get_main_application_classes_names      → Application 类列表
```

### 组件枚举

```
get_manifest_component
  component_type: activity|provider|service|receiver
  only_exported: true|false
```

**使用策略**：
1. 先取 `only_exported=true` 获取直接暴露的组件
2. 再取 `only_exported=false` 检查是否有 Intent Filter 的隐式导出组件
3. 对比两次结果，识别 `exported` 属性与 Intent Filter 的矛盾配置

### 代码分析

```
get_class_source        class_name          → 完整 Java 源码
get_method_by_name      class_name, method  → 方法源码
get_methods_of_class    class_name          → 方法列表
get_fields_of_class     class_name          → 字段列表
```

**使用策略**：
- 优先使用 `get_class_source` 获取组件全貌
- 对大数据类使用 `get_method_by_name` 定向分析
- 用 `get_methods_of_class` 快速识别生命周期方法

### 交叉引用（数据流追踪核心）

```
get_xrefs_to_method     class_name, method_name     → 谁调用了这个方法
get_xrefs_to_class      class_name                   → 谁引用了这个类
get_xrefs_to_field      class_name, field_name       → 谁访问了这个字段
```

**数据流追踪策略**：

正向追踪（入口→Sink）：
1. 从组件生命周期方法开始，识别 Intent 数据提取点
2. 追踪变量传递路径
3. 当变量传递到方法调用时，用 `get_xrefs_to_method` 确认调用关系

反向追踪（Sink→入口）：
1. 从可疑 Sink 方法（如 `Runtime.exec`、`loadUrl`）开始
2. 用 `get_xrefs_to_method` 查找谁调用了这个 Sink
3. 逐层向上回溯到 IPC 入口

**关键技巧**：
- xref 结果中关注 `code` 类型的引用（而非 `data` 类型）
- 如果 xref 链断裂，检查是否存在接口/抽象类多态调用
- 对反射调用（`Method.invoke`），需要追踪 `Method` 对象的来源

### 搜索

```
search_classes_by_keyword
  search_term: 关键词
  search_in: class|method|field|code|comment
  package: 限定包名（可选）
```

**常用搜索模式**：
- `"getSerializableExtra" search_in=code` → 查找反序列化点
- `"getCallingPackage" search_in=code` → 查找调用方校验
- `"whiteList" OR "whitelist" OR "allowList" search_in=code` → 查找白名单
- `"checkPermission" search_in=code` → 查找权限检查

---

## Jadx CLI 备用模式指南

当 JADX-MCP Server 被占用或不可用时，使用 Jadx 命令行进行全量反编译，基于文件系统完成所有分析。

### 反编译前置步骤

```bash
# 推荐参数：反混淆 + 包含资源
jadx --deobf -s -d ./jadx_out target.apk
```

### 输出目录结构

```
jadx_out/
├── sources/                    # Java 源码（按包名组织）
│   └── com/
│       └── example/
│           ├── MainActivity.java
│           └── MyService.java
├── resources/                  # 资源文件
│   ├── AndroidManifest.xml
│   ├── res/values/strings.xml
│   └── res/xml/
└── classes.dex
```

### CLI 分析核心命令

#### 1. Manifest 分析

```bash
# 读取完整 Manifest
cat ./jadx_out/resources/AndroidManifest.xml

# 查找所有 exported 组件（activity）
grep -A 10 '<activity' ./jadx_out/resources/AndroidManifest.xml | grep -E 'android:name|exported='

# 查找所有 exported 组件（简化版）
grep -E '<(activity|service|receiver|provider)' ./jadx_out/resources/AndroidManifest.xml | grep 'exported="true"'

# PowerShell 版本
Select-String -Path .\jadx_out\resources\AndroidManifest.xml -Pattern 'exported="true"' -Context 2,2
```

#### 2. 源码阅读

```bash
# 读取指定类
cat ./jadx_out/sources/com/example/app/MainActivity.java

# 读取并高亮关键方法
grep -n -A 30 'void onCreate' ./jadx_out/sources/com/example/app/MainActivity.java

# 搜索类中的所有方法
grep -n 'void \|public \|private \|protected ' ./jadx_out/sources/com/example/app/MainActivity.java
```

#### 3. 全局搜索（替代 MCP search/xref）

```bash
# 搜索关键词（类名、方法名、变量名）
grep -rn '关键词' ./jadx_out/sources/

# 搜索多个关键词（OR 关系）
grep -rn 'getSerializableExtra\|getParcelableExtra\|ObjectInputStream' ./jadx_out/sources/

# 搜索调用链：谁调用了 targetMethod
grep -rn '\.targetMethod(' ./jadx_out/sources/

# 搜索类实例化（追踪对象创建）
grep -rn 'new TargetClass' ./jadx_out/sources/

# 在特定包内搜索
grep -rn '关键词' ./jadx_out/sources/com/example/app/

# 搜索反编译失败的代码（可能包含有用信息）
grep -rn '/* Code decompiled incorrectly, please refer to instructions dump */' ./jadx_out/sources/
```

#### 4. 数据流追踪（CLI 版 xref）

CLI 没有 xref 功能，需要通过以下技巧模拟：

**正向追踪（入口 → Sink）**：
```bash
# 1. 在入口类中找到变量名
grep -n 'getStringExtra\|getIntent' ./jadx_out/sources/com/example/EntryActivity.java
# 假设变量名为 maliciousUrl

# 2. 追踪变量在类内的使用
grep -n 'maliciousUrl' ./jadx_out/sources/com/example/EntryActivity.java

# 3. 如果变量传递到方法参数，搜索该方法调用
grep -rn '\.processUrl(' ./jadx_out/sources/

# 4. 进入被调用类，继续追踪
cat ./jadx_out/sources/com/example/utils/Processor.java
```

**反向追踪（Sink → 入口）**：
```bash
# 1. 找到 Sink 方法定义
grep -rn 'void loadUrl\|Runtime.getRuntime().exec' ./jadx_out/sources/
# 假设 Sink 在 com.example.WebHelper.loadUrl()

# 2. 搜索谁调用了这个 Sink
grep -rn '\.loadUrl(' ./jadx_out/sources/
# 或搜索类实例化 + 方法调用
grep -rn 'new WebHelper' ./jadx_out/sources/

# 3. 逐层向上回溯，直到到达 IPC 入口组件
```

#### 5. 资源文件分析

```bash
# 读取 strings.xml
cat ./jadx_out/resources/res/values/strings.xml

# 查找特定字符串
grep -n 'api_key\|secret\|password\|token' ./jadx_out/resources/res/values/strings.xml

# 读取 XML 资源
cat ./jadx_out/resources/res/xml/network_security_config.xml
```

### CLI 模式下的局限性及应对

| 局限 | 说明 | 应对方案 |
|------|------|----------|
| 无 xref | 无法一键获取交叉引用 | 使用 `grep -rn` 全局搜索方法名/类名 |
| 无精确方法提取 | 无法只读取某个方法 | 使用 `grep -n -A {行数} '方法签名'` 提取 |
| 反编译质量 | 部分代码可能反编译失败 | 启用 `--show-bad-code`，或查看 smali |
| 性能 | 全量反编译耗时长 | 首次反编译后复用 `./jadx_out/` 目录 |
| 混淆代码 | 类名/方法名可能是 a/b/c | 启用 `--deobf`，结合字符串搜索定位 |

### MCP vs CLI 快速切换决策树

```
开始审计
  ↓
JADX-MCP 可用？
  ├─ 是 → 使用 MCP 模式（按需查询，xref 追踪）
  └─ 否 → 使用 CLI 模式
           ↓
           1. jadx --deobf -s -d ./jadx_out target.apk
           2. 基于文件系统分析
           3. grep / cat 替代 MCP 工具
```

---

## Manifest 攻击面分析技术

### exported 属性与 Intent Filter 的关系

| Manifest 配置 | 实际导出状态 | 风险 |
|---------------|-------------|------|
| `exported="true"` | 导出 | 高 |
| `exported="false"` | 不导出 | 低 |
| 无 `exported` + 有 `intent-filter` | 默认导出（targetSdk<31）或默认不导出（targetSdk>=31） | 中 |
| 无 `exported` + 无 `intent-filter` | 不导出 | 低 |

**注意**：Android 12+（targetSdk>=31）对无 `exported` 声明的组件默认不导出，但旧应用可能仍受影响。

### DeepLink 攻击面识别

检查以下 data 标签组合：
```xml
<intent-filter>
    <action android:name="android.intent.action.VIEW"/>
    <category android:name="android.intent.category.BROWSABLE"/>
    <data android:scheme="http" android:host="*"/>
</intent-filter>
```

**高危模式**：
- `scheme="http"` 或 `scheme="https"` + 通用 host → 可被任意网页触发
- `scheme="file"` → 可能存在文件读取风险
- `pathPattern=".*"` → 路径完全可控
- 多个 Activity 注册相同 scheme+host → 劫持竞争

### Provider 攻击面

重点关注：
- `exported="true"` 的 Provider
- `android:grantUriPermissions="true"`
- `android:readPermission` / `android:writePermission` 配置
- `path-permission` 子标签

---

## 防御机制识别方法论

### 白名单校验模式

**模式 1：硬编码包名列表**
```java
private static final String[] ALLOWED_PACKAGES = {"com.example.app1", "com.example.app2"};
boolean isAllowed(String pkg) {
    for (String allowed : ALLOWED_PACKAGES) {
        if (allowed.equals(pkg)) return true;
    }
    return false;
}
```
**绕过分析**：检查是否存在 `contains` 替代 `equals`（子串绕过）、大小写问题。

**模式 2：签名白名单**
```java
PackageInfo pi = getPackageManager().getPackageInfo(pkg, PackageManager.GET_SIGNATURES);
byte[] sig = pi.signatures[0].toByteArray();
// 与预期签名比对
```
**绕过分析**：检查是否只比对签名哈希（可能被碰撞）、是否只取 signatures[0]（多签名绕过）。

**模式 3：UID 校验**
```java
int uid = Binder.getCallingUid();
if (uid != expectedUid) throw new SecurityException();
```
**绕过分析**：检查 `expectedUid` 是否为常量、是否存在共享 UID 的情况。

### 权限检查模式

**模式 1：声明式权限（Manifest）**
```xml
<permission android:name="com.app.PERMISSION" android:protectionLevel="normal"/>
```
**风险**：`protectionLevel="normal"` 可被任意应用申请。

**模式 2：代码级权限检查**
```java
enforceCallingPermission("com.app.PERMISSION", "msg");
checkCallingPermission("com.app.PERMISSION");
```
**风险**：检查返回值是否被忽略（如只调用了 check 但未处理 false 情况）。

**模式 3：自定义 Token**
```java
String token = intent.getStringExtra("token");
if (!VALID_TOKEN.equals(token)) return;
```
**风险**：Token 是否硬编码、是否可预测、是否在 Log 中泄露。

### Intent 参数校验模式

**常见缺陷**：
- 只校验参数存在性，不校验内容（`if (extra != null)`）
- 类型转换异常未捕获（`(String) intent.getSerializableExtra("key")`）
- 黑名单过滤不完整（只过滤了 `<script>` 但未过滤 `<img onerror>`）
- URL 校验使用 `startsWith("http://")` 而非 URI 解析

---

## 数据流追踪高级技巧

### Intent 数据提取点清单

```java
// String
intent.getStringExtra("key")
intent.getCharSequenceExtra("key")

// 数值
intent.getIntExtra("key", default)
intent.getBooleanExtra("key", default)
intent.getLongExtra("key", default)

// 复杂对象
intent.getSerializableExtra("key")     // 反序列化漏洞高危点
intent.getParcelableExtra("key")       // Parcel 漏洞高危点
intent.getBundleExtra("key")
intent.getExtras()

// URI
intent.getData()
intent.getDataString()

// 组件信息
intent.getComponent()
intent.getPackage()
```

### 关键 Sink 点清单

```java
// 代码执行
Runtime.getRuntime().exec(cmd)
ProcessBuilder(cmd).start()
System.load(path)                        // Native 库加载
System.loadLibrary(name)
DexClassLoader / PathClassLoader         // 动态加载
Method.invoke(obj, args)                 // 反射

// 文件操作（路径遍历高危）
new File(basePath, userInput)
openFileOutput(name, mode)
FileInputStream(path)
FileOutputStream(path)

// 数据库（SQL 注入高危）
sqliteDatabase.rawQuery(sql, selectionArgs)
sqliteDatabase.execSQL(sql)

// 网络（SSRF 高危）
url.openConnection()
webView.loadUrl(url)
webView.loadData(html, mimeType, encoding)

// 组件启动（Intent 注入/转发高危）
startActivity(intent)
startService(intent)
sendBroadcast(intent)
startForegroundService(intent)

// ContentProvider 操作
getContentResolver().query(uri, ...)
getContentResolver().insert(uri, ...)
```

### 追踪断裂处理

当 xref 追踪断裂时，检查：
1. **接口/回调**：数据是否通过接口回调传递（如 `onClickListener`）
2. **Handler/Message**：数据是否封装在 Message 中通过 Handler 传递
3. **EventBus/RxJava**：是否使用事件总线框架
4. **SharedPreferences**：数据是否通过 SP 中转
5. **数据库**：数据是否先写入数据库再读取
6. **Native 层**：数据是否通过 JNI 传递到 Native 层处理

---

## 常见漏洞模式深度分析

### 1. Intent 转发（Intent Hijacking / Forwarding）

**特征**：exported Activity 接收 Intent，提取部分数据后构造新 Intent 启动内部组件。

```java
// 攻击面：exported Activity
String action = getIntent().getStringExtra("action");
Intent internal = new Intent(this, InternalActivity.class);
internal.setAction(action);  // 可控！
startActivity(internal);
```

**利用**：攻击者可通过 exported Activity 启动任意内部组件，绕过 exported=false 限制。

**审计要点**：
- 检查 `startActivity` / `startService` 的参数 Intent 是否包含外部可控数据
- 检查目标组件是否预期只被内部调用（如 InternalActivity）
- 检查是否存在 `FLAG_GRANT_READ_URI_PERMISSION` 等权限传递

### 2. DeepLink 命令注入

**特征**：DeepLink URL 参数被直接用于执行操作。

```java
Uri data = getIntent().getData();
String url = data.getQueryParameter("url");
webView.loadUrl(url);  // 可控 URL
```

**利用**：`myapp://open?url=javascript:alert(1)` 或 `file:///data/data/com.app/shared_prefs/config.xml`

**审计要点**：
- 检查 `getIntent().getData()` 的所有使用点
- 检查 URL scheme 是否被强制修改为 `http`/`https`
- 检查 WebView 配置（`setJavaScriptEnabled`、`addJavascriptInterface`）

### 3. Provider 路径遍历

**特征**：FileProvider 或自定义 Provider 暴露文件访问。

```java
@Override
public ParcelFileDescriptor openFile(Uri uri, String mode) {
    String path = uri.getPath();
    File file = new File(BASE_DIR, path);  // 路径遍历！
    return ParcelFileDescriptor.open(file, mode);
}
```

**利用**：`content://com.app.provider/../../../../data/data/com.app/databases/secrets.db`

**审计要点**：
- 检查 `openFile` / `query` / `insert` 中的路径拼接
- 检查是否使用 `getCanonicalPath()` 或 `getAbsolutePath()` 做规范化
- 检查 `path-permission` 是否限制过宽

### 4. 反序列化漏洞

**特征**：`getSerializableExtra` 或 `getParcelableExtra` 的对象被反序列化。

```java
MyObject obj = (MyObject) getIntent().getSerializableExtra("data");
obj.process();  // 触发反序列化链
```

**审计要点**：
- 搜索所有 `getSerializableExtra` / `getParcelableExtra` 调用点
- 检查反序列化后的对象类型是否有已知利用链（如 `HashMap`、`LazyValue`）
- 检查是否实现了自定义的 `readObject` / `readResolve`

### 5. Broadcast 注入

**特征**：可控参数被用于构造 Broadcast Intent。

```java
String action = intent.getStringExtra("action");
Intent broadcast = new Intent(action);
broadcast.putExtra("data", intent.getStringExtra("data"));
sendBroadcast(broadcast);
```

**利用**：发送任意 action 的广播，可能触发其他应用的 Receiver。

---

## 防幻觉验证方法论

### 证据链原则

每个漏洞结论必须构建完整的证据链：

**MCP 模式证据链**：
```
Manifest 证据（get_android_manifest） → 入口可达
    ↓
源码证据（class_source / method_by_name） → 数据提取点确认
    ↓
源码证据（xrefs_to_method） → 数据流路径确认
    ↓
源码证据 → Sink 点确认
    ↓
逻辑分析 → 漏洞触发条件确认
```

**CLI 模式证据链**：
```
Manifest 证据（cat AndroidManifest.xml） → 入口可达
    ↓
源码证据（cat ./jadx_out/sources/...） → 数据提取点确认
    ↓
源码证据（grep -rn 全局搜索） → 数据流路径确认
    ↓
源码证据 → Sink 点确认
    ↓
逻辑分析 → 漏洞触发条件确认
```

### 常见幻觉类型及预防措施

| 幻觉类型 | 表现 | 预防措施 |
|----------|------|----------|
| 组件可达幻觉 | 认为组件可导出但实际上 `exported="false"` | 必须引用 Manifest 原文确认 exported 属性 |
| 数据流幻觉 | 认为数据能传递到 Sink 但中间有条件阻断 | 必须检查所有条件分支（if/try-catch/early return） |
| 防御绕过幻觉 | 认为校验可绕过但无具体绕过路径 | 必须给出具体输入示例证明绕过 |
| Sink 影响幻觉 | 认为 Sink 可被利用但实际上参数已净化 | 必须确认参数在到达 Sink 前未被过滤/转义 |
| 权限降级幻觉 | 认为权限保护级别低但实际上已正确配置 | 必须引用 Manifest 中 protectionLevel 的准确值 |

### 验证话术模板

在报告中对每个漏洞使用以下话术：

> **可达性确认**：通过 `get_manifest_component` 确认 `{ComponentName}` 的 `exported="{value}"`，Intent Filter 包含 `{action}`，攻击者可构造 `Intent(ACTION_{action})` 触发。
>
> **数据流确认**：通过 `get_xrefs_to_method` 从 `{sink.class.sinkMethod}` 反向追踪，确认调用链为 `{chain}`，数据从 `{entry.method}` 的 `{param}` 参数传递而来。
>
> **绕过确认**：源码 `{file}:{line}` 处的校验逻辑为 `{code}`，当输入 `{payload}` 时，校验返回 `{result}`，因此可绕过。
>
> **结论**：该漏洞 100% 可触发 / 不可触发（若不可触发，说明阻断点）。
