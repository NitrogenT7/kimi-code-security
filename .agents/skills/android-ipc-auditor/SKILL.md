---
name: android-ipc-auditor
description: Android IPC 安全审计与漏洞挖掘专家。当用户需要对 Android APK 进行IPC 组件安全审计、Intent 数据流追踪、漏洞挖掘与验证时使用此 Skill。特别适用于通过 JADX-MCP 分析 exported Activity/Service/Receiver/Provider、 Deeplink、自定义权限、白名单校验、Intent 数据传递链等场景。触发关键词包括：审计 APK、分析 Android 应用安全、IPC 漏洞、exported 组件、Deeplink 安全、Intent 注入、攻击面分析、JADX 逆向。
---

# Android IPC 自动审计员

## 概述

本 Skill 定义了一套完整的 Android IPC 安全审计工作流，支持 **JADX-MCP（首选）** 和 **Jadx CLI（备用）** 两种分析模式。核心目标是：**系统化地发现可被外部触达的 IPC 攻击面，深度追踪数据流，识别防御绕过点，并通过回溯验证消除幻觉**。

### 工具模式说明

| 模式 | 使用场景 | 特点 |
|------|----------|------|
| **JADX-MCP** | 首选模式，MCP Server 可用时 | 按需查询，无需本地反编译，xref 追踪高效 |
| **Jadx CLI** | 备用模式，MCP 被占用或不可用时 | 先全量反编译到本地，再通过文件系统分析 |

**CLI 前置步骤**：若使用 Jadx CLI，必须先执行反编译：
```bash
jadx --deobf -s -d ./jadx_out <target.apk>
```
反编译完成后，所有分析基于 `./jadx_out/` 目录下的文件进行。

审计原则：
- **先测绘，后挖掘**：必须先完整识别攻击面，再深入审计
- **防御优先观察**：任何 IPC 入口都必须先分析其防御机制
- **数据流闭环**：漏洞必须能被完整追溯从入口到sink点
- **零幻觉**：所有漏洞结论必须经过反向验证确认可达

---

## 前置依赖

本 Skill 假设 `AGENTS.md` 中已存在 `## Android Audit Profile` 区块，包含业务架构、攻击面速览等信息。若该区块缺失或不完整，提示用户先使用 `apk-business-architecture-profiler` 完成侦察，或在当前 Skill 执行前补充最小化侦察。

## 审计工作流

### Phase 1: 读取已有攻击面信息

**目标**：从 `AGENTS.md` 获取已识别的 IPC 攻击面，避免重复侦察。

**操作步骤**：

1. **读取 `AGENTS.md`**，提取 `## Android Audit Profile` 中的攻击面信息：
   - exported Activity / Service / Receiver / Provider 数量及列表
   - DeepLink schemes
   - 已标记的 P0/P1 组件

2. **验证与补充**：
   - 如果 `AGENTS.md` 中攻击面信息足够（组件清单完整、优先级已标注），直接采用
   - 如果信息不足（如只有数量没有具体组件名），用最小化查询补充：
     - **MCP**：`get_manifest_component` + `component_type=activity|service|provider|receiver` + `only_exported=true`
     - **CLI**：`grep -E '<(activity|service|receiver|provider)' ./jadx_out/resources/AndroidManifest.xml | grep 'exported="true"'`
   - 将补充信息追加到 `AGENTS.md`，不另存独立文件

3. **确认审计目标**：
   - 基于已有信息，确认要深入审计的组件列表
   - 如果业务画像提示某些组件与核心链路无关，可直接跳过

---

### Phase 2: 防御机制识别（Defense Analysis）

**目标**：分析每个 P0/P1 入口的安全防御机制，判断是否存在绕过可能。

**操作步骤**：

1. 对每个高优先级组件，获取其源码：
   - **MCP**：`get_class_source` 获取组件类完整代码；`get_methods_of_class` 列出所有方法
   - **CLI**：`cat ./jadx_out/sources/{package_path}/{ComponentName}.java`；`grep -n 'void \|public \|private ' ./jadx_out/sources/{package_path}/{ComponentName}.java`

2. 重点分析方法：
   - **MCP**：`get_method_by_name` 定向分析生命周期方法
   - **CLI**：在类文件中搜索方法签名，如 `grep -n -A 50 'void onCreate' ./jadx_out/sources/{path}.java`
   - 自定义防御方法搜索：
     - **MCP**：`search_classes_by_keyword` 搜索 `checkPermission|checkCaller|verifyToken|getCallingPackage`
     - **CLI**：`grep -rn 'checkPermission\|checkCaller\|verifyToken\|getCallingPackage' ./jadx_out/sources/`

3. 识别以下防御机制并记录：
   - **白名单校验**：包名白名单、签名白名单、UID 校验
   - **权限检查**：`checkCallingPermission()`、`enforceCallingPermission()`
   - **Token/签名验证**：自定义 token、HMAC、签名验证逻辑
   - **Intent 参数校验**：对 extras 数据的类型检查、范围校验、黑名单过滤
   - **调用方身份校验**：`getCallingPackage()` 与预期包名比对

4. **保存日志**：将防御分析保存到 `{audit_root}/02_defense/{component_name}_defense.md`

**防御分析模板**：
```markdown
## {ComponentName} 防御分析
### 防御机制清单
| 机制类型 | 位置 | 强度 | 绕过可能性 |
|----------|------|------|------------|
| 包名白名单 | {methodName} | 强/中/弱 | {分析} |
| 权限检查 | {methodName} | 强/中/弱 | {分析} |

### 关键代码片段
```java
{关键防御代码}
```

### 防御绕过分析
{详细分析是否存在绕过点}
```

---

### Phase 2.5: 防御实现深度审计（Defense Implementation Audit）

**目标**：全面阅读并分析防御机制的具体实现代码，识别其失效条件与绕过可能性。

**为什么需要这个阶段**：
- Phase 2 仅识别了"有哪些防御"，但**防御的实现方式本身可能存在缺陷**
- 开发者自行实现的校验逻辑（包名比对、签名验证、Token 校验等）往往是最薄弱的环节
- 在投入大量精力进行数据流追踪前，必须先判断：这些防御是否真的能拦住攻击者？

**操作步骤**：

1. **筛选需要深入分析的防御机制**：
   - 优先分析**开发者自定义实现**的防御（非系统 API 直接调用）
   - 其次分析对系统 API 的封装调用（如 wrapper 中的 `checkPermission`）
   - 记录每个防御机制所在的类、方法、以及完整的实现代码

2. **逐行阅读防御实现代码**：
   - **MCP**：使用 `get_method_by_name` 获取防御方法的完整源码
   - **CLI**：`grep -n -A 100 '{defenseMethod}' ./jadx_out/sources/{path}.java` 阅读完整实现
   - 重点关注：条件分支、字符串比对、正则表达式、异常处理、返回值处理

3. **分析防御失效场景**：
   对每种防御机制，逐一检查以下可能的失效模式：
   - **字符串比对缺陷**：`equals()` vs `==`、大小写敏感问题、空字符串/Null 绕过
   - **包名校验绕过**：`getCallingPackage()` 可被中间人组件篡改、多用户场景下包名冲突
   - **签名校验绕过**：自实现签名逻辑是否校验完整证书、是否可被降级攻击
   - **UID/PID 校验绕过**：`Binder.getCallingUid()` 与 `getCallingPackage()` 不一致场景
   - **逻辑短路/条件竞争**：某些分支路径上防御被跳过（如 `if (debug) return true`）
   - **异常吞没**：`try-catch` 捕获校验异常后默认放行（`catch (Exception e) { return true; }`）
   - **参数污染**：Intent 多值参数（如 `getStringExtra` 与 `getExtras()` 获取的值不一致）

4. **评估绕过可行性**：
   - 对每种失效场景，给出**具体的构造方法**（如输入什么字符串、构造什么 Intent）
   - 如果无法绕过，明确说明"该防御在当前实现下难以绕过"的依据
   - 如果绕过需要特殊条件（如系统签名应用、同 UID），标注前提

5. **保存日志**：将防御实现审计保存到 `{audit_root}/02.5_defense_impl/{component_name}_defense_impl.md`

**防御实现审计模板**：
```markdown
## {ComponentName} - {DefenseMethod} 防御实现审计

### 防御源码
```java
{完整防御方法源码，注明来源类和方法}
```

### 防御逻辑拆解
| 步骤 | 逻辑 | 潜在问题 |
|------|------|----------|
| 1 | 获取调用方包名 | `getCallingPackage()` 在多任务场景下可能不准确 |
| 2 | 与白名单比对 | 使用 `==` 而非 `.equals()` |
| 3 | 返回校验结果 | 无 |

### 失效场景分析
- [ ] 字符串比对缺陷
- [ ] 空/Null 绕过
- [ ] 异常吞没导致默认放行
- [ ] 条件分支跳过防御
- [ ] 参数污染
- [ ] 其他：{描述}

### 绕过可行性结论
- **结论**：可绕过 / 难以绕过 / 需特殊条件
- **绕过条件**：{具体条件}
- **PoC 构造思路**：{如果可绕过}
```

---

### Phase 3: 深度审计与数据流追踪（Deep Audit）

**目标**：从 IPC 入口出发，深度追踪数据流，识别潜在 sink 点。

**操作步骤**：

1. 选择目标组件（优先无强防御或防御可绕过的 P0 组件）

2. **入口数据分析**（主 Agent 执行）：
   - **MCP**：`get_method_by_name` 分析 `onCreate`/`onStartCommand`/`onReceive`
   - **CLI**：在组件类文件中搜索生命周期方法：`grep -n -A 30 'void onCreate\|onStartCommand\|onReceive' ./jadx_out/sources/{path}.java`
   - 识别所有从 Intent 提取的数据：
     - **MCP**：在方法源码中搜索 `getIntent()`、`getExtras()`、`getStringExtra()`、`getSerializableExtra()`
     - **CLI**：`grep -rn 'getIntent\|getExtras\|getStringExtra\|getSerializableExtra\|getParcelableExtra\|getData()' ./jadx_out/sources/{package_dir}/`
   - 记录所有可控参数及其数据类型
   - **这一步必须由主 Agent 亲自完成**，确保入口点分析准确无误，为子 Agent 分发任务提供基础上下文

3. **子 Agent 并行数据流追踪**（推荐当组件/Sink 类型较多时使用）：
   当攻击面包含多个组件或单个组件数据流复杂时，启动多个子 Agent 并行追踪：

   ```
   主 Agent（协调者）
     ├─ 子 Agent A: 组件 X 的 Intent → 文件操作 Sink 追踪
     ├─ 子 Agent B: 组件 Y 的 Intent → WebView/网络 Sink 追踪
     └─ 子 Agent C: 组件 Z 的 Intent → 组件启动 Sink 追踪
   ```

   **子 Agent 任务规范**：
   - 每个子 Agent 只负责**一个组件**的**一类 Sink 追踪**
   - 子 Agent 必须使用 `Agent` 工具启动，`subagent_type="android-reverser"`
   - 子 Agent 的 prompt 必须包含：组件完整类名、入口方法、已识别的可控参数列表、目标 Sink 类型、分析模式（MCP/CLI）

   **子 Agent 必须回显的完整信息**（缺一不可）：
   | 回显项 | 说明 |
   |--------|------|
   | **完整调用链** | 从入口方法到 Sink 的逐层方法调用列表，含类名.方法名 |
   | **关键代码片段** | 每个方法调用的实际源码，标注来源文件和行号 |
   | **工具原始输出** | `get_xrefs_to_method` 的完整返回 / `grep` 的完整匹配结果 |
   | **数据类型传递** | 数据在各层方法间的类型变化（String → Uri → File 等） |
   | **条件分支分析** | 调用链上是否存在可能阻断数据流的条件判断 |
   | **Sink 点详情** | Sink 所在类、方法、参数是否来自外部 Intent |

   **主 Agent 对子 Agent 结果的验证**（必须执行）：
   1. **抽样复核**：对每个子 Agent 返回的调用链，随机抽取 1-2 个中间方法，用 `get_method_by_name`（MCP）或 `grep -n`（CLI）独立验证该方法确实存在且确实调用了下一层方法
   2. **Sink 点确认**：对子 Agent 标识的每个 Sink，主 Agent 必须独立读取 Sink 方法源码，确认参数确实来自上游调用链
   3. **入口一致性检查**：确认子 Agent 追踪的入口与主 Agent 在步骤 2 中识别的入口一致
   4. **拒绝不完整结果**：如果子 Agent 未提供代码片段或工具原始输出，视为结果不可信，要求补充或重新分析

4. 识别关键 Sink 点（子 Agent 结果汇总后，主 Agent 统一梳理）：
   - **代码执行**：`Runtime.exec()`、`ProcessBuilder`、JNI 调用、动态加载 dex
   - **文件操作**：`FileInputStream` / `FileOutputStream`（关注路径遍历）、`openFileOutput`
   - **数据库**：`SQLiteDatabase` .rawQuery / .execSQL（关注 SQL 注入）
   - **网络**：`HttpURLConnection`、OkHttp、WebView.loadUrl（关注 SSRF）
   - **组件启动**：`startActivity`、`startService`、`sendBroadcast`（关注 Intent 注入/转发）
   - **越权**：绕过权限检查访问 ContentProvider、读取其他应用数据

5. **保存日志**：将数据流分析保存到 `{audit_root}/03_deepaudit/{component_name}_dataflow.md`

**子 Agent 协作模板**（主 Agent 启动子 Agent 时可参考）：
```markdown
子 Agent 任务：追踪 {ComponentName} 的 {参数名} 到 {Sink类型} 的数据流

已知上下文：
- 组件类: {完整类名}
- 入口方法: {onCreate/onStartCommand/onReceive}
- 可控参数: {参数名} 从 Intent.{getXxxExtra} 获取，类型 {type}
- 防御状态: {无防御/防御可绕过/防御强}
- 分析模式: {MCP/CLI}

要求：
1. 追踪该参数从入口到所有 {Sink类型} Sink 的完整调用链
2. 每个方法节点提供实际源码片段和文件位置
3. 使用 xref/grep 的原始输出作为证据
4. 标注是否存在条件分支阻断数据流
5. 返回格式：调用链表格 + 关键代码 + 工具输出
```

**数据流追踪模板**：
```markdown
## {ComponentName} 数据流分析
### 入口参数
| 参数名 | 来源 | 类型 | 可控性 |
|--------|------|------|--------|
| {name} | Intent.getStringExtra | String | 完全可控 |

### 数据流图
```
{methodA} -> {methodB} -> {sink}
```

### Sink 点分析
| Sink 类型 | 位置 | 风险 | 利用条件 |
|-----------|------|------|----------|
| {类型} | {class.method} | {风险描述} | {条件} |
```

---

### Phase 4: 漏洞挖掘与可行性评估（Vulnerability Discovery）

**目标**：基于 Phase 3 的数据流分析，识别具体漏洞并评估利用可行性。

**操作步骤**：

1. **漏洞类型初筛**（主 Agent 执行）：
   对每个已确认的 Sink 点，初步判定可能涉及的漏洞类型：
   - **Intent 注入/转发**：可控 Intent 参数被用于启动新组件，可能导致权限提升
   - **路径遍历**：文件路径参数未做规范化（`../` 绕过）
   - **SQL 注入**：可控参数拼接到 SQL 语句
   - **任意代码执行**：可控参数进入 `Runtime.exec()`、JNI、反射、动态加载
   - **信息泄露**：exported Provider 未做权限控制，可读取敏感数据
   - **WebView 漏洞**：`loadUrl`/`addJavascriptInterface` 可控参数
   - **DeepLink 劫持**：Scheme/Host 配置不当，可被第三方应用拦截

2. **子 Agent 并行漏洞评估**（推荐当 Sink 点较多时使用）：
   当存在多个 Sink 点或多种漏洞类型时，启动子 Agent 并行评估：

   ```
   主 Agent（协调者）
     ├─ 子 Agent A: Sink-1 的 Intent 注入漏洞可行性评估
     ├─ 子 Agent B: Sink-2 的路径遍历漏洞可行性评估
     └─ 子 Agent C: Sink-3 的 SQL 注入漏洞可行性评估
   ```

   **子 Agent 任务规范**：
   - 每个子 Agent 只负责**一个 Sink 点**的**一种漏洞类型**深度评估
   - 子 Agent 必须基于 Phase 3 已验证的调用链进行分析，不得自行推断新的数据流
   - 子 Agent 的 prompt 必须包含：完整调用链、关键代码片段、Sink 点详情、防御分析结论

   **子 Agent 必须回显的完整信息**（缺一不可）：
   | 回显项 | 说明 |
   |--------|------|
   | **漏洞类型判定** | 该 Sink 点属于哪种漏洞，判定依据 |
   | **完整数据流证据** | 从入口到 Sink 的调用链，复用 Phase 3 已验证的结果 |
   | **漏洞触发条件** | 攻击者需要构造什么样的输入才能触发 |
   | **防御绕过分析** | 如果存在防御，给出具体绕过路径和代码证据 |
   | **可行性评估矩阵** | 可达性/绕过难度/利用稳定性/影响范围 四项评分 |
   | **风险等级建议** | Critical/High/Medium/Low，附评级依据 |
   | **PoC 构造思路** | 伪代码或 Intent 构造示例 |

3. **主 Agent 对子 Agent 漏洞评估的验证**（必须执行）：

   子 Agent 的漏洞评估结果**不能直接采纳**，主 Agent 必须进行独立复核：

   1. **数据流复核**：确认子 Agent 使用的调用链与 Phase 3 主 Agent 验证过的调用链完全一致。如有新增方法调用，主 Agent 必须独立验证
   2. **触发条件验证**：对子 Agent 提出的攻击输入，主 Agent 必须回到源码中确认该输入确实能沿着调用链到达 Sink 点。例如：
      - 子 Agent 声称 `"../etc/passwd"` 可触发路径遍历 → 主 Agent 必须确认 Sink 点的 `new File(base, userInput)` 确实使用了该参数且未做 `getCanonicalPath()` 校验
   3. **防御绕过复核**：如果子 Agent 声称可绕过防御，主 Agent 必须独立阅读防御代码，确认绕过路径确实存在
   4. **风险等级复核**：主 Agent 根据独立判断确认或调整子 Agent 给出的风险等级
   5. **拒绝条件**：
      - 子 Agent 未提供具体代码片段 → 打回补充
      - 子 Agent 的触发条件基于假设而非代码确认 → 主 Agent 独立验证前标记为"待确认"
      - 子 Agent 与主 Agent 对同一 Sink 的漏洞类型判定不一致 → 以主 Agent 独立分析为准，但需记录分歧

4. 可行性评估维度（主 Agent 复核时统一标准）：
   - **可达性**：攻击者是否能将恶意数据传递到这个入口
   - **绕过难度**：是否需要绕过防御机制，绕过成本如何
   - **利用稳定性**：PoC 是否 100% 触发，是否有竞态条件
   - **影响范围**：是否需要特殊权限、是否全机型可用

5. **保存日志**：将漏洞分析保存到 `{audit_root}/04_vulns/{vuln_id}_analysis.md`

**子 Agent 协作模板**（主 Agent 启动子 Agent 时可参考）：
```markdown
子 Agent 任务：评估 {ComponentName} → {Sink方法} 的 {漏洞类型} 可行性

已知上下文（已验证，直接采纳）：
- 完整调用链: {主 Agent 验证过的调用链}
- 关键代码片段: {Phase 3 已确认的关键代码}
- Sink 点: {类名.方法名}, 参数 {param} 来自 {上游方法}
- 防御状态: {Phase 2/2.5 的防御结论}

要求：
1. 基于以上已验证数据，评估该漏洞是否真实可利用
2. 给出具体的攻击输入构造方法
3. 如有防御，给出绕过路径和代码证据
4. 四项可行性评分 + 风险等级建议
5. PoC 构造思路（伪代码）
6. 返回必须包含：数据流证据 + 代码片段 + 触发条件 + 防御绕过分析
```

**漏洞分析模板**：
```markdown
## {VULN-ID}: {漏洞标题}

### 基本信息
| 属性 | 值 |
|------|-----|
| 漏洞类型 | {类型} |
| 风险等级 | Critical/High/Medium/Low |
| 影响组件 | {ComponentName} |
| 利用前提 | {前提条件} |

### 攻击面
{描述入口点}

### 数据流
```
{完整数据流描述}
```

### 漏洞细节
{详细技术细节}

### 可行性评估
| 维度 | 评估 |
|------|------|
| 可达性 | {评估} |
| 绕过难度 | {评估} |
| 利用稳定性 | {评估} |
| 影响范围 | {评估} |

### PoC 思路
{伪代码或 Intent 构造}
```

---

### Phase 5: 回溯验证（Anti-Hallucination）

**目标**：消除分析幻觉，确保每个漏洞结论都有代码层面的 100% 确认。

**这是最关键的阶段，必须严格执行。**

**验证清单**（对每个漏洞必须全部确认）：

> **子 Agent 协作补充**：如果 Phase 3/4 使用了子 Agent，Phase 5 还需验证"主 Agent 对子 Agent 结果的复核是否到位"。

1. **入口可达验证**：
   - [ ] 该组件确实是 exported=true，或存在明确的隐式调用路径
   - [ ] Manifest 中的 Intent Filter 确实匹配攻击者构造的 Intent
   - [ ] 如果是 DeepLink，scheme/host/path 模式已确认

2. **数据流验证**：
   - [ ] **MCP**：使用 `get_xrefs_to_method` 从 Sink 点反向追踪，确认能回到入口方法
   - [ ] **CLI**：从 Sink 方法出发，`grep -rn 'sinkMethod(' ./jadx_out/sources/` 找到调用方，逐层向上回溯；或在入口方法文件中 `grep -n 'sinkMethod'` 确认直接调用
   - [ ] 中间每个方法调用都已在源码中确认存在
   - [ ] 不存在条件分支导致数据流不可达（如 `if (false)` 硬编码阻断）

3. **防御绕过验证**：
   - [ ] 如果声称可绕过白名单，必须在源码中找到具体的绕过路径
   - [ ] 如果声称无权限检查，必须确认 `checkCallingPermission` / `enforcePermission` 确实不存在
   - [ ] 如果声称校验逻辑有缺陷，必须给出具体的反例输入

4. **代码确认**：
   - [ ] **MCP**：所有关键代码片段必须来自 `get_class_source` 或 `get_method_by_name` 的实际输出
   - [ ] **CLI**：所有关键代码片段必须来自 `./jadx_out/sources/` 下的实际文件内容（使用 `cat` 或 `grep` 提取）
   - [ ] 不允许基于"推测"或"常理判断"得出结论

5. **子 Agent 结果复核验证**（如使用了子 Agent）：
   - [ ] 主 Agent 已对子 Agent 返回的调用链进行抽样复核（至少 1-2 个中间方法）
   - [ ] 主 Agent 已独立读取每个 Sink 点源码，确认参数来源与子 Agent 描述一致
   - [ ] 子 Agent 提出的攻击输入已被主 Agent 在源码中独立验证可达
   - [ ] 子 Agent 与主 Agent 的漏洞类型判定如有分歧，已记录并以主 Agent 独立分析为准
   - [ ] 子 Agent 未提供代码片段或工具原始输出的发现项，未进入漏洞结论

6. **保存日志**：将验证结果保存到 `{audit_root}/05_verify/{vuln_id}_verification.md`

**验证结果模板**：
```markdown
## {VULN-ID} 回溯验证报告

### 验证状态
- [x] 入口可达：已确认
- [x] 数据流完整：已确认
- [x] 防御绕过：已确认
- [x] 代码确认：已确认
- [x] 子 Agent 复核：{已确认 / 不适用（未使用子 Agent）}

**结论：该漏洞 100% 可触发 / 不可触发（说明原因）**

### 验证证据
{引用具体代码片段和工具输出}

### 子 Agent 协作记录（如适用）
| 子 Agent | 任务 | 结果 | 主 Agent 复核方式 | 复核结论 |
|----------|------|------|-------------------|----------|
| Agent-A | 组件X数据流追踪 | 发现Sink-1 | 抽样复核方法M1、M2 | 一致 |
| Agent-B | Sink-2漏洞评估 | 判定路径遍历 | 独立验证攻击输入可达 | 一致 |
```

---

### Phase 6: PoC 验证与报告生成（PoC & Reporting）

**目标**：为确认存在的漏洞构造 PoC，生成结构化报告。

**操作步骤**：

1. **PoC 构造**：
   - 对每个已验证漏洞，构造最小可复现的 PoC（Android 应用或 adb 命令）
   - PoC 应放在 `{audit_root}/06_poc/` 目录
   - PoC 必须包含：攻击 Intent 构造、预期结果、实际结果

2. **漏洞验证**：
   - 如果环境允许，实际运行 PoC 验证漏洞
   - 记录验证结果（成功/失败）及截图/日志

3. **报告生成**：
   - 生成 `{audit_root}/FINAL_REPORT.md` 汇总所有发现
   - 按风险等级排序（Critical > High > Medium > Low > Informational）
   - 包含：执行摘要、攻击面总览、漏洞详情、修复建议

**最终报告结构**：
```markdown
# {AppName} IPC 安全审计报告

## 执行摘要
- 审计时间：{datetime}
- 审计范围：{范围}
- 漏洞统计：Critical {n} / High {n} / Medium {n} / Low {n}

## 攻击面总览
{Phase 1 的汇总}

## 漏洞详情
{每个漏洞的完整分析}

## 修复建议
{按优先级排序的修复建议}
```

---

## JADX-MCP 工具链速查

### Manifest 与组件分析
- `get_android_manifest` - 获取完整 Manifest XML
- `get_manifest_component` + `component_type=activity|service|provider|receiver` + `only_exported=true|false` - 获取组件列表
- `get_strings` - 获取 strings.xml 中的敏感字符串
- `get_main_activity_class` - 获取主 Activity
- `get_main_application_classes_names` - 获取主应用类

### 代码分析
- `get_class_source` + `class_name` - 获取类完整源码
- `get_methods_of_class` + `class_name` - 列出类所有方法
- `get_method_by_name` + `class_name` + `method_name` - 获取方法源码
- `get_fields_of_class` + `class_name` - 列出类字段

### 交叉引用追踪
- `get_xrefs_to_class` - 查找引用某类的地方
- `get_xrefs_to_method` - 查找引用某方法的地方（**数据流追踪核心**）
- `get_xrefs_to_field` - 查找引用某字段的地方

### 搜索
- `search_classes_by_keyword` + `search_term` + `search_in=code|method|class` - 按关键词搜索类
- `search_method_by_name` + `method_name` - 按方法名搜索
- `get_all_classes` - 列出所有类（可用于全局搜索）

### Smali 与资源
- `get_smali_of_class` - 获取 Smali 代码
- `get_all_resource_file_names` / `get_resource_file` - 获取资源文件

---

## 审计日志规范

所有日志统一存放在 `{audit_root}/` 目录下：

```
{audit_root}/
├── 01_recon/
│   ├── attack_surface.md          # 攻击面清单
│   └── manifest_analysis.md       # Manifest 详细分析
├── 02_defense/
│   └── {component}_defense.md     # 各组件防御分析
├── 02.5_defense_impl/
│   └── {component}_defense_impl.md # 防御实现深度审计
├── 03_deepaudit/
│   └── {component}_dataflow.md    # 数据流追踪
├── 04_vulns/
│   └── {vuln_id}_analysis.md      # 漏洞分析
├── 05_verify/
│   └── {vuln_id}_verification.md  # 回溯验证
├── 06_poc/
│   └── {vuln_id}_poc.{java/md}    # PoC 代码
└── FINAL_REPORT.md                # 最终报告
```

**日志要求**：
- 每个阶段完成后立即保存
- 所有代码引用必须标明来源类和方法名
- 使用 Markdown 表格保持结构化
- **MCP**：保留 JADX-MCP 的原始输出作为证据
- **CLI**：保留 `grep` 或文件读取的原始输出作为证据，标注文件路径（如 `./jadx_out/sources/com/example/MainActivity.java:42`）

---

## 常见 IPC 漏洞模式速查

| 漏洞类型 | 特征模式 | 检查方法 |
|----------|----------|----------|
| exported + 无权限 | `exported="true"` 且无 `android:permission` | Manifest 检查 |
| Intent 转发 | `startActivity(intent)` 中 intent 来自外部 | 数据流追踪 |
| 路径遍历 | `new File(base, userInput)` 未做 `getCanonicalPath()` | 代码审查 |
| SQL 注入 | `rawQuery("SELECT * FROM " + input)` | 代码审查 |
| 反序列化漏洞 | `getSerializableExtra()` / `ObjectInputStream` | 数据流追踪 |
| WebView RCE | `addJavascriptInterface` + `loadUrl` 可控 | 代码审查 |
| Provider 越权 | exported Provider 的 query/insert 未校验 | 代码审查 |
| DeepLink 劫持 | scheme 过于通用（如 `http`、`file`）| Manifest 检查 |
| 自定义权限降级 | `protectionLevel="normal"` 但用于关键接口 | Manifest 检查 |

---

## 防幻觉检查清单

在开始 Phase 4 之前，必须确认：
- [ ] Phase 1 的攻击面清单已与 Manifest 原文逐项核对
- [ ] Phase 2 的防御机制分析基于实际源码，非推测
- [ ] Phase 3 的每个 Sink 点都通过 xref（MCP）或 grep 回溯（CLI）确认可达

在 Phase 2.5 完成后，必须确认：
- [ ] 每个自定义防御机制的实现代码已被完整阅读
- [ ] 失效场景清单已逐项检查，不存在明显遗漏
- [ ] 绕过结论有具体代码支撑，而非基于假设

在 Phase 3/4 使用子 Agent 后，必须确认：
- [ ] 每个子 Agent 的返回结果包含完整调用链 + 关键代码片段 + 工具原始输出
- [ ] 主 Agent 已对子 Agent 的调用链进行抽样复核（至少 1-2 个中间方法）
- [ ] 主 Agent 已独立验证每个 Sink 点的参数来源
- [ ] 子 Agent 提出的攻击输入已被主 Agent 在源码中独立确认可达
- [ ] 子 Agent 未提供代码证据的发现项，未纳入漏洞结论

在生成最终报告前，必须确认：
- [ ] 每个漏洞都有完整的从入口到 Sink 的数据流证据
- [ ] 每个漏洞的防御绕过都有具体代码支撑
- [ ] 没有基于"看起来像是"、"通常会有"的推测性结论
- [ ] 所有风险等级都有明确的评级依据


---

## Jadx CLI 反编译指南

当 JADX-MCP 不可用时，使用 Jadx 命令行作为完整替代方案。

### 1. 反编译命令

```bash
# 基础反编译
jadx -d ./jadx_out target.apk

# 推荐：反编译 + 反混淆 + 包含资源
jadx --deobf -s -d ./jadx_out target.apk

# Windows PowerShell
jadx --deobf -s -d .\jadx_out .\target.apk
```

参数说明：
- `-d <dir>`：输出目录
- `--deobf`：启用反混淆（恢复类/方法名）
- `-s`：保存资源文件（strings.xml、AndroidManifest.xml 等）
- `--show-bad-code`：显示反编译失败的代码（可能包含有用信息）

### 2. 反编译输出目录结构

```
jadx_out/
├── sources/                    # Java 源码目录
│   └── com/
│       └── example/
│           ├── MainActivity.java
│           └── MyService.java
├── resources/                  # 资源文件
│   ├── AndroidManifest.xml     # 清单文件
│   └── res/
│       └── values/
│           └── strings.xml
└── classes.dex                 # 原始 dex（可选）
```

### 3. CLI 分析命令速查

| 分析目标 | 命令 |
|----------|------|
| 查看 Manifest | `cat ./jadx_out/resources/AndroidManifest.xml` |
| 查找 exported Activity | `grep -rn 'android:name=.*activity' ./jadx_out/resources/AndroidManifest.xml \| grep 'exported="true"'` |
| 查看类源码 | `cat ./jadx_out/sources/com/example/MainActivity.java` |
| 搜索方法定义 | `grep -rn 'void onCreate\|onStartCommand' ./jadx_out/sources/` |
| 搜索关键词全局 | `grep -rn 'getSerializableExtra\|getParcelableExtra' ./jadx_out/sources/` |
| 搜索 Sink 点 | `grep -rn 'Runtime.getRuntime().exec\|loadUrl\|rawQuery' ./jadx_out/sources/` |
| 查找调用链 | `grep -rn '\.targetMethod(' ./jadx_out/sources/` |
| 查看 strings | `cat ./jadx_out/resources/res/values/strings.xml` |
| 查找 DeepLink | `grep -rn 'android:scheme\|android:host' ./jadx_out/resources/AndroidManifest.xml` |

### 4. MCP vs CLI 工具对照表

| 分析任务 | JADX-MCP | Jadx CLI |
|----------|----------|----------|
| 获取 Manifest | `get_android_manifest` | `cat ./jadx_out/resources/AndroidManifest.xml` |
| 枚举 exported 组件 | `get_manifest_component` | `grep` AndroidManifest.xml |
| 获取类源码 | `get_class_source` | `cat ./jadx_out/sources/{path}.java` |
| 获取方法源码 | `get_method_by_name` | `grep -n -A {lines} '{method}' ./jadx_out/sources/{path}.java` |
| 列出方法 | `get_methods_of_class` | `grep -n 'void \|public \|private ' ./jadx_out/sources/{path}.java` |
| 交叉引用追踪 | `get_xrefs_to_method` | `grep -rn '\.{method}(' ./jadx_out/sources/` |
| 全局关键词搜索 | `search_classes_by_keyword` | `grep -rn '{keyword}' ./jadx_out/sources/` |
| 获取 strings | `get_strings` | `cat ./jadx_out/resources/res/values/strings.xml` |
| 获取资源文件 | `get_resource_file` | `cat ./jadx_out/resources/{path}` |

### 5. 注意事项

- CLI 模式下 xref 追踪依赖全局 `grep`，可能遗漏接口回调、反射调用、Handler/Message 等间接调用
- 对于复杂的数据流，建议先用 `grep -rn '变量名' ./jadx_out/sources/` 追踪变量传递
- 反混淆（`--deobf`）可能恢复有意义的类名/方法名，强烈建议启用
- 如果类在 `sources/` 中找不到，可能反编译失败，尝试查看 `resources/` 中的 smali 文件
