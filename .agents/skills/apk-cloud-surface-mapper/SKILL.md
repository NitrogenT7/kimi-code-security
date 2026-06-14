---
name: apk-cloud-surface-mapper
description: Android APK 云端攻击面测绘与后端渗透测试情报提取专家。当用户需要从 APK 中梳理云端域名和 API 路由端点、提取可直接用于后端安全测试的请求构造与认证机制信息时使用此 Skill。核心输出面向网络后端渗透测试，涵盖：端点收集、请求模板还原、签名/Token 机制识别、传输层风险判定、测试优先级排序。触发关键词包括：审计 APK 云端攻击面、梳理 API 端点、分析域名交互、测绘云端接口、网络攻击面分析、云端路由审计、提取后端测试情报、分析 APK 网络请求。
---

# APK 云端攻击面测绘员

## 概述

本 Skill 定义了一套从 Android APK 中系统化提取后端服务器安全测试情报的工作流。核心目标是：**将 APK 中的网络交互代码转化为可直接用于后端渗透测试的结构化情报**。

### 输出导向

所有分析步骤均面向后端渗透测试场景：
- **端点清单** → 供测试人员直接访问验证
- **请求模板** → 供 Burp Suite / curl / 脚本直接复现
- **认证机制** → 供构造合法请求或尝试绕过
- **风险初筛** → 供确定测试优先级

### 工具模式

| 模式 | 使用场景 | 特点 |
|------|----------|------|
| **JADX-MCP** | 首选模式，MCP Server 可用时 | 按需查询，无需本地反编译，xref 追踪高效 |
| **Jadx CLI** | 备用模式，MCP 被占用或不可用时 | 先全量反编译到本地，再通过文件系统分析 |

**CLI 前置步骤**：
```bash
jadx --deobf -s -d ./jadx_out <target.apk>
```

### 审计原则

- **测试导向**：每个收集的信息必须回答 "这对后端测试有什么用？"
- **先测绘全貌，再深入解构**：先收集所有域名/端点，再逐个深入分析核心端点
- **动态过滤**：SDK/第三方域名由用户根据上下文确认排除，不预设固定黑名单
- **请求可复现**：每个端点分析必须输出可直接构造测试请求的模板
- **零幻觉**：所有结论必须有代码层面的原始证据支撑

---

## 前置依赖

本 Skill 假设 `AGENTS.md` 中已存在 `## Android Audit Profile` 区块，包含业务画像、已识别域名等信息。若该区块缺失或不完整，提示用户先使用 `apk-business-architecture-profiler` 完成侦察。

## 测绘工作流

### Phase 1: 读取已有云端情报

**目标**：从 `AGENTS.md` 获取已识别的域名和网络框架信息，避免重复收集。

**操作步骤**：

1. **读取 `AGENTS.md`**，提取 `## Android Audit Profile` 中的域名信息：
   - 已识别的域名列表及来源
   - 网络框架类型（Retrofit/OkHttp/Volley）
   - 业务画像中提到的云端功能模块

2. **验证与补充**：
   - 如果域名列表完整，直接采用
   - 如果信息不足，用最小化查询补充：
     - **MCP**：`search_classes_by_keyword` + `search_term="https://"` + `search_in=code`
     - **CLI**：`grep -rn '"https://\|"http://' ./jadx_out/sources/`
   - 将补充信息追加到 `AGENTS.md`

---

### Phase 2: 动态过滤与分类（Dynamic Filtering）

**目标**：与用户确认排除非业务端点，将剩余端点分类为测试目标。

**操作步骤**：

1. 汇总 Phase 2 收集的所有唯一域名列表

2. **向用户展示候选列表，请用户确认**：
   - 哪些域名属于第三方 SDK（日志、统计、广告、推送）应排除
   - 哪些域名属于 CDN/静态资源（低测试价值）
   - 哪些域名是核心业务后端（保留）

3. **分类标记**（保留端点继续分析，排除端点仅记录）：
   - 🟢 **核心业务 API** → 进入 Phase 4 深入分析
   - 🟡 **CDN / 静态资源** → 记录但不深入
   - 🔴 **第三方 SDK** → 排除（日志、统计、广告、推送、地图等）
   - ⚪ **未知** → 标记待确认

4. **保存日志**：`{audit_root}/03_filtered/endpoint_classification.md`

**分类模板**：
```markdown
## 端点分类结果

### 🟢 核心业务 API（进入 Phase 4 分析）
| 域名 | 初步判断 | 分类依据 |
|------|----------|----------|
| `api.example.com` | 用户数据/登录/支付 | 用户确认 |

### 🔴 排除的第三方 SDK
| 域名 | SDK 类型 | 排除原因 |
|------|----------|----------|
| `log.umeng.com` | 日志上报 | 用户确认排除 |

### 🟡 CDN / 静态资源
| 域名 | 用途 | 处理方式 |
|------|------|----------|
| `cdn.example.com` | 图片/JS 静态资源 | 记录，低优先级 |
```

---

### Phase 4: 端点技术解构（Endpoint Deconstruction）

**目标**：对每个核心业务端点，提取后端渗透测试所需的全部技术细节，输出可直接复现请求的 **API 情报卡片**。

**操作步骤**：

1. **定位端点定义**：
   - 对 Retrofit 接口：获取接口类源码 (`get_class_source`)，提取所有 `@GET`/`@POST` 方法
   - 对 OkHttp/自定义：找到 URL 拼接和请求构造的代码位置
   - **MCP**：`get_xrefs_to_method` 追踪调用链，确认业务功能

2. **还原完整请求模板**：
   - HTTP 方法
   - 完整 URL（含 baseUrl + path）
   - Path 参数（`@Path` 或字符串拼接中的变量）
   - Query 参数（`@Query` 或 `?key=value` 拼接）
   - Header 字段（从 Interceptor 或 `setRequestProperty` 提取）
   - Body 结构（JSON/XML/表单，字段名和类型）

3. **分析认证机制**：
   - Token 如何获取（登录接口返回值 / 硬编码 / 本地生成）
   - Token 如何传递（Header / Cookie / URL 参数）
   - 签名算法（如果存在）：算法类型、参与签名的字段、密钥位置、时间戳/随机数处理
   - 是否有刷新机制 / 过期处理

4. **分析请求构造细节**：
   - 参数编码方式（URL 编码、Base64、AES、RSA）
   - 参数拼接顺序（对签名绕过很重要）
   - 固定参数与动态参数区分

5. **追踪调用链理解业务功能**：
   - 哪个 Activity/Service/方法调用了该 API
   - 触发场景（用户点击、定时任务、启动时）
   - 参数来源（用户输入 / 本地数据库 / 其他 API 返回）

6. **保存日志**：`{audit_root}/04_decon/{endpoint_id}_card.md`

> **阅读参考**：在分析网络框架和认证机制前，阅读 `references/endpoint-analysis-guide.md` 的「常见网络框架识别」和「请求签名与认证机制识别」章节。

**API 情报卡片模板**（每个端点一张）：
```markdown
## {Endpoint-ID}: {功能简述}

### 请求模板
| 属性 | 值 |
|------|-----|
| HTTP 方法 | {GET/POST/PUT/DELETE} |
| 完整 URL | `https://{host}/{path}` |
| Path 参数 | `{param1}` |
| Query 参数 | `key1=val1&key2=val2` |
| Header | `Authorization: Bearer {token}` |
| Body | `{ "field": "value" }` |

### 认证机制
- **类型**: {Bearer / HMAC / Cookie / None}
- **Token 获取**: {描述}
- **签名构造**: {算法、字段、密钥位置}

### 代码证据
- **定义位置**: `{Class}.{method}`
- **调用位置**: `{CallerClass}.{callerMethod}`
- **关键片段**:
  ```java
  {源码片段}
  ```

### 业务功能
{用途}

### 风险初筛
| 维度 | 评分 | 依据 |
|------|------|------|
| 鉴权绕过 | 0/1 | {依据} |
| 输入攻击面 | 0/1 | {依据} |
| 敏感操作 | 0/1 | {依据} |
| 传输层风险 | 0/1 | {依据} |
| 信息泄露 | 0/1 | {依据} |
| **总分** | **{n}/5** | |
| **风险等级** | {等级} | |
| **优先测试** | {是/否} | {原因} |

### 测试建议
- [ ] {方向1}
- [ ] {方向2}
```

---

### Phase 5: 测试导向风险初筛（Test-Oriented Triage）

**目标**：从后端渗透测试角度，对每个端点进行风险评分，标注优先测试目标。

**操作步骤**：

1. 对 Phase 4 产出的每个 API 情报卡片，按以下五维评分：

   | 维度 | 判定为风险(1)的条件 |
   |------|-------------------|
   | **鉴权绕过可能** | 端点可被未认证访问；Token 客户端硬编码/生成；签名密钥可提取 |
   | **输入攻击面** | 参数来自用户输入且未明显过滤；拼接进 SQL/命令/URL |
   | **敏感操作暴露** | 端点执行管理员/高权限操作；越权接口直接暴露 |
   | **传输层风险** | 使用 HTTP；证书校验被禁用/可绕过；明文传密码/Token |
   | **信息泄露** | 错误响应暴露栈轨迹、服务器路径、内部配置；调试接口未关闭 |

2. 计算总分（0-5），判定风险等级：
   - 4-5 = Critical | 3 = High | 2 = Medium | 1 = Low | 0 = Info

3. 标注 **🔴 建议优先测试**：
   - 条件：风险等级 >= High（总分 >= 3）+ 业务价值高 + 用户输入可控

4. **保存日志**：更新各 API 情报卡片的风险初筛部分

> **阅读参考**：评分标准详见 `references/endpoint-analysis-guide.md` 的「测试导向风险初筛标准」章节。

---

### Phase 6: 后端渗透测试情报包生成（Pentest Intel Package）

**目标**：汇总所有分析结果，生成一份可直接交付后端渗透测试人员的结构化情报包。

**操作步骤**：

1. 读取所有 Phase 4 的 API 情报卡片和 Phase 5 的风险评分

2. 按以下结构生成 `{audit_root}/PENTEST_INTEL.md`：

```markdown
# {AppName} 后端渗透测试情报包

## 执行摘要
- **应用名称**: {name}
- **包名**: {package}
- **厂商**: {developer}
- **审计时间**: {datetime}
- **后端域名数**: {n}
- **核心 API 端点数**: {n}
- **建议优先测试数**: {n}

## 后端域名总览
| 域名 | 用途分类 | 协议 | 备注 |
|------|----------|------|------|
| `api.example.com` | 核心业务 | HTTPS | 主 API 网关 |

## 🔴 高价值目标清单（按风险等级排序）

### Critical
| Endpoint-ID | 功能 | URL 路径 | 风险总分 | 测试建议摘要 |
|-------------|------|----------|----------|-------------|
| E001 | {功能} | `/api/login` | 5/5 | 尝试未授权访问，Fuzz 注入点 |

### High
| Endpoint-ID | 功能 | URL 路径 | 风险总分 | 测试建议摘要 |
|-------------|------|----------|----------|-------------|
| E002 | {功能} | `/api/user` | 3/5 | 测试越权访问 |

## 完整 API 情报表
| Endpoint-ID | 方法 | 路径 | 认证 | 风险等级 | 优先测试 |
|-------------|------|------|------|----------|----------|
| E001 | POST | /api/login | 无 | Critical | 🔴 是 |

## 认证机制速查
{汇总所有认证方式，便于测试时快速构造请求}

## 关键代码证据索引
- E001: `04_decon/E001_card.md`
- E002: `04_decon/E002_card.md`

## 测试建议汇总
- **E001** (`/api/login`): 尝试 SQL 注入、暴力破解、响应篡改
- **E002** (`/api/user`): 测试水平越权（修改 user_id 参数访问其他用户数据）
```

3. 确认情报包完整性：
   - [ ] 每个端点都有 API 情报卡片支撑
   - [ ] 每个风险评分都有代码依据
   - [ ] 请求模板足够详细，测试人员可直接复现
   - [ ] 标注了明确的测试方向建议

---

## JADX-MCP 网络分析工具链速查

### 基础信息获取
| 任务 | MCP 工具 | CLI 替代 |
|------|----------|----------|
| 获取 Manifest | `get_android_manifest` | `cat ./jadx_out/resources/AndroidManifest.xml` |
| 获取字符串资源 | `get_strings` | `cat ./jadx_out/resources/res/values/strings.xml` |
| 获取主应用类 | `get_main_application_classes_names` | 查看 `sources/` 下的 Application 子类 |
| 获取主 Activity | `get_main_activity_class` | 从 Manifest 中找 `MAIN`/`LAUNCHER` |

### 网络相关代码搜索
| 搜索目标 | MCP 工具 | CLI 替代 |
|----------|----------|----------|
| 搜索 `https://` | `search_classes_by_keyword` + `"https://"` + `code` | `grep -rn '"https://' ./jadx_out/sources/` |
| 搜索 `http://` | `search_classes_by_keyword` + `"http://"` + `code` | `grep -rn '"http://' ./jadx_out/sources/` |
| 搜索 Retrofit | `search_classes_by_keyword` + `"retrofit\|baseUrl\|@GET\|@POST"` + `code` | `grep -rni 'retrofit\|baseUrl\|@GET\|@POST' ./jadx_out/sources/` |
| 搜索 OkHttp | `search_classes_by_keyword` + `"OkHttp\|Interceptor"` + `code` | `grep -rni 'OkHttp\|Interceptor' ./jadx_out/sources/` |
| 搜索域名/Host | `search_classes_by_keyword` + `"host\|domain\|server\|endpoint"` + `code` | `grep -rni 'host\|domain\|server\|endpoint' ./jadx_out/sources/ \| grep -i 'http'` |
| 搜索 WebSocket | `search_classes_by_keyword` + `"WebSocket\|ws://\|wss://"` + `code` | `grep -rni 'WebSocket\|ws://\|wss://' ./jadx_out/sources/` |
| 搜索 Token/签名 | `search_classes_by_keyword` + `"token\|sign\|signature\|hmac\|md5"` + `code` | `grep -rni 'token\|sign\|signature\|hmac\|md5' ./jadx_out/sources/` |
| 搜索加密 | `search_classes_by_keyword` + `"AES\|RSA\|Cipher\|encrypt\|decrypt"` + `code` | `grep -rni 'AES\|RSA\|Cipher\|encrypt\|decrypt' ./jadx_out/sources/` |
| 搜索 Cookie | `search_classes_by_keyword` + `"Cookie\|Set-Cookie\|CookieManager"` + `code` | `grep -rni 'Cookie\|Set-Cookie\|CookieManager' ./jadx_out/sources/` |

### 代码与交叉引用
| 任务 | MCP 工具 | CLI 替代 |
|------|----------|----------|
| 获取类完整源码 | `get_class_source` + `class_name` | `cat ./jadx_out/sources/{path}.java` |
| 获取方法源码 | `get_method_by_name` + `class_name` + `method_name` | `grep -n -A 50 '{method}' ./jadx_out/sources/{path}.java` |
| 列出类所有方法 | `get_methods_of_class` + `class_name` | `grep -n 'void \|public \|private ' ./jadx_out/sources/{path}.java` |
| 追踪方法调用链 | `get_xrefs_to_method` + `class_name` + `method_name` | `grep -rn '\.{method}(' ./jadx_out/sources/` |
| 追踪字段引用 | `get_xrefs_to_field` + `class_name` + `field_name` | `grep -rn '{field}' ./jadx_out/sources/` |

---

## 审计日志目录规范

```
{audit_root}/
├── 01_recon/
│   └── target_brief.md              # 目标基础画像
├── 02_endpoints/
│   └── raw_endpoints.md             # 原始端点收集（未过滤）
├── 03_filtered/
│   └── endpoint_classification.md   # 动态过滤与分类结果
├── 04_decon/
│   ├── E001_card.md                 # API 情报卡片
│   ├── E002_card.md
│   └── ...
└── PENTEST_INTEL.md                 # 后端渗透测试情报包（最终交付物）
```

**日志要求**：
- 每个阶段完成后立即保存
- 所有代码引用必须标明来源类名、方法名（MCP 模式下精确到类）
- 使用 Markdown 表格保持结构化
- **MCP**：保留 JADX-MCP 的原始输出作为证据
- **CLI**：保留 `grep` 或文件读取的原始输出作为证据，标注文件路径

---

## 常见云端攻击面模式速查

| 模式 | 代码特征 | 测试意义 |
|------|----------|----------|
| **Retrofit 接口暴露** | `@GET`/`@POST` 注解接口类 | 直接获取完整 API 路由列表 |
| **硬编码 baseUrl** | `Retrofit.Builder().baseUrl("https://...")` | 确认后端主域名 |
| **OkHttp Interceptor 注入签名** | `addInterceptor()` 中修改请求 Header | 签名算法在此实现，重点分析 |
| **明文 HTTP 传输** | `http://` URL 或 `usesCleartextTraffic="true"` | 中间人攻击可行 |
| **证书校验绕过** | 空 `TrustManager`、`HostnameVerifier` 恒返回 true | 可轻易实施 SSL 中间人 |
| **硬编码 Token/AK** | `Authorization: Bearer {硬编码字符串}` | 尝试用该 Token 直接访问其他端点 |
| **URL 参数传 Token** | `?token=xxx` / `?access_key=xxx` | 参数易被日志/Referrer 泄露 |
| **客户端生成签名** | `MD5(param1+param2+salt)` 在本地计算 | 若 salt 硬编码，可伪造任意请求 |
| **调试接口残留** | `/test`、`/debug`、`/api/test` | 可能暴露内部功能或敏感信息 |
| **管理员接口暴露** | URL 含 `/admin/`、`/internal/` | 测试未授权访问管理员功能 |
| **用户 ID 参数可控** | `/api/user/{userId}` 且 userId 来自输入 | 水平越权测试点 |
| **文件上传接口** | `MultipartBody`、`@Part`、上传 URL | 测试文件类型绕过、路径遍历 |

---

## 防幻觉检查清单

在生成最终情报包前，必须确认：

- [ ] **每个域名都通过源码确认**：不是从包名推测的，而是实际在代码/字符串中搜索到的
- [ ] **每个端点都有代码片段支撑**：URL、路径、参数构造的代码来源已标注类名和方法名
- [ ] **请求模板可直接复现**：HTTP 方法、URL、Header、Body 的还原都有代码依据
- [ ] **认证机制分析准确**：Token 获取方式、签名算法已通过阅读相关源码确认
- [ ] **风险评分有依据**：每个维度的 0/1 评分都对应具体的代码证据
- [ ] **调用链已验证**：使用 `get_xrefs_to_method`（MCP）或 `grep`（CLI）确认调用方
- [ ] **不存在基于推测的结论**：没有使用"看起来像是"、"通常会有"等不确定表述
- [ ] **优先测试标注合理**：标注 🔴 的端点确实满足"高价值 + 低防御 + 输入可控"

---

## 与现有 Skill 的联动

- 如需深入分析硬编码凭证（AK/SK、Token、签名密钥），引导用户使用 **`apk-hardcode-analyzer`** Skill
- 如需审计 APK 的 IPC 组件安全面，引导用户使用 **`android-ipc-auditor`** Skill
