---
name: apk-business-architecture-profiler
description: Understand an Android APK's business logic, user workflows, and overall software architecture before security auditing. Use when entering an Android audit project directory that contains an APK, decompiled source, or JADX output, and the application's core purpose and internal structure are not yet clear. Triggers on phrases like "分析这个应用是做什么的", "理解业务", "搞明白架构", "看看这个APP的业务流程", "audit this app", "reconnaissance", "baseline". Especially critical for AI assistants, cloud services, browsers, financial apps, social apps, or any APK where vulnerability patterns depend on business context.
---

# APK 业务架构理解器

## 核心定位

在寻找漏洞之前，先理解这个应用**解决什么问题**、**用户怎么用它**、**内部怎么运转**。

把你自己当成一个第一次打开这个 App 的安全研究员，不是 QA 测试员，也不是开发文档编写者。你的目标是让另一个从未见过这个应用的 Agent，读了你的分析后能回答：**"如果我要攻击它，我最该关注哪条链路？"**

## 分析原则

- **context-first, not checklist-first**. 不要先打开 Manifest 数 exported 组件。先问自己：用户为什么下载这个 App？
- **没有标准模板**. 不同类型的应用，值得关注的维度完全不同。浏览器和云盘没有共同的分析框架。
- **大胆放权**. 如果某个维度对当前应用不重要（例如一个工具类 App 没有云端同步），直接跳过，不必为了凑章节而写。
- **只记录事实和推断**. 不写"下一步建议"、不写"优先级"、不写"你应该审计什么"。

## 理解业务的三个切入视角

选择最适合当前应用的视角，不必全部使用。

### 视角一：用户旅程

回答：用户打开这个应用后，经历什么流程？

- 从 `AndroidManifest.xml` 的 MAIN/LAUNCHER Activity 找到入口
- 追踪用户最可能的前 3-5 个操作步骤（Activity 跳转链）
- 哪些操作涉及**敏感动作**？（拍照、录音、支付、上传、分享）
- 哪些操作涉及**跨应用交互**？（分享到微信、用浏览器打开、调起相机）

### 视角二：数据对象

回答：这个应用的核心"东西"是什么？它们从哪来？到哪去？

- 浏览器 → 网页/URL（来自网络，到屏幕，可能缓存到本地）
- 云相册 → 图片文件（来自相机/存储，到云端，可能分享出去）
- AI写作 → 提示词/生成文本（来自用户输入，到 AI 模型，回到屏幕）
- 语音摘要 → 音频数据（来自麦克风，到 ASR 服务，变成文本）
- 支付应用 → 交易订单/资金（来自用户操作，到支付网关，到商户）

找到数据对象后，追踪它的生命周期：采集 → 处理 → 存储 → 传输 → 销毁。每个环节都可能暴露攻击面。

### 视角三：能力依赖

回答：这个应用依赖哪些外部能力和服务？

- 硬件传感器：GPS、相机、麦克风、加速度计、指纹识别
- 系统服务：通知、剪贴板、联系人、短信、电话
- 云端服务：账号体系、文件存储、AI 推理、推送、统计
- 第三方：支付 SDK、地图 SDK、社交分享、广告

依赖越多，攻击面越复杂。特别关注**跨边界**的交互点。

## 工具链

分析时按以下优先级选择工具：

- **首选 JADX-MCP**：交互式按需查询，xref 追踪调用链高效，适合理解组件关系和数据流
- **原生库分析用 IDA-MCP**：分析 `.so` 文件、JNI 调用、底层加密/编解码逻辑
- **备用 Jadx CLI**：`jadx --deobf -s -d ./jadx_out <target.apk>`，MCP 不可用时全量反编译到本地再分析

工具只是手段，不要为了反编译而反编译。如果当前目录已有 `jadx_out/`，直接基于现有产物分析。

## 理解软件架构的方法

### 分层推断

不要试图画出完整的 UML。用简单的分层描述这个应用的骨架：

- **UI 层**：Activity/Fragment 的组织方式。是一个单 Activity + 多 Fragment 的现代架构？还是传统的多 Activity 跳转？有没有 WebView 混合页面？
- **业务层**：核心功能代码在哪？是按功能模块分包（`com.xxx.ai`, `com.xxx.cloud`）还是按层分包（`ui`, `data`, `network`）？
- **数据层**：本地数据库（Room/SQLite/Realm）、SharedPreferences、文件缓存、ContentProvider。
- **网络层**：Retrofit/OkHttp/Volley/自研？有没有统一的请求封装、签名拦截器、加密层？
- **原生层**：有没有 JNI/.so 文件？哪些功能下沉到了 C++（加密、编解码、AI 推理）？

### 关键链路追踪

找到 2-4 条**从用户操作到远端服务**的完整链路。例如：

- 用户点击"AI 摘要" → 录音 Activity → 音频文件 → 上传 Service → HTTP POST → ASR 云端 → 返回文本 → 展示
- 用户打开链接 → Intent 解析 → WebView → loadUrl → JSBridge 交互 → 本地方法调用

追踪时关注：**数据在哪个环节变了形态？**（音频→base64→JSON→HTTP body→Protobuf）形态转换处常出漏洞。

### 权限与组件的关联

不要把权限列表和组件列表当成两个独立的东西。把它们联系起来：

- `RECORD_AUDIO` + `AISummaryActivity` + `uploadToCloud()` → 音频采集和上传链路
- `CAMERA` + `ScanActivity` + `oppo://scan` Deeplink → 扫码入口
- `READ_CONTACTS` + `FriendSyncService` → 社交关系同步

## 对比案例：同样的技术线索，不同的业务含义

用对比来训练变通思维。遇到具体线索时，参考这些对比判断当前应用的业务含义。

### WebView

| 应用类型 | WebView 的角色 | 关注方向 |
|----------|---------------|---------|
| 浏览器 | 核心渲染引擎 | JSBridge、URL Scheme 劫持、file:// 协议 |
| 云存储 | 用户协议/帮助页面 | 低优先级，可能只有 XSS |
| AI写作 | 富文本编辑器 | DOM 操作、本地存储、剪贴板 |
| 支付应用 | 收银台/H5 支付 | 支付回调劫持、页面伪造 |

### exported Activity 接收 file:// URI

| 应用类型 | 业务含义 | 关注方向 |
|----------|---------|---------|
| 文件管理器 | 打开文件的核心功能 | 正常业务，关注路径校验 |
| 云相册 | 上传入口 | 路径遍历、文件类型绕过 |
| AI 应用 | 导入音频/图片给模型 | 文件解析漏洞、模型输入污染 |
| 浏览器 | 下载文件后打开 | 下载路径控制、Intent 劫持 |

### 网络请求携带签名参数 sign=

| 应用类型 | 业务含义 | 关注方向 |
|----------|---------|---------|
| 电商/支付 | 防交易篡改 | 签名算法逆向、重放攻击 |
| AI 推理 | 防 API Key 盗刷 | Key 生成逻辑、客户端签名的 salt |
| 日志上报 | 防数据篡改 | 通常低价值 |
| 游戏 | 防作弊 | 客户端校验可被绕过 |

### ContentProvider 暴露

| 应用类型 | 业务含义 | 关注方向 |
|----------|---------|---------|
| 相册/云盘 | 核心功能，必须暴露 | URI 权限粒度、越权读取他人数据 |
| 文件管理器 | 核心功能 | 路径遍历、跨应用文件访问 |
| 工具类 App | 可能意外暴露内部文件 | 内部数据库/配置文件泄露 |
| 社交应用 | 分享功能需要 | 消息内容、联系人信息泄露 |

## 不要做的事

- 不要输出"功能模块表格"然后强行填满每一格
- 不要给每个组件标注"风险等级"或"优先级"
- 不要假设所有应用都有云端服务、AI 能力或支付功能
- 不要用同样的章节顺序分析浏览器和语音助手
- 不要在 AGENTS.md 里写"下一步应该审计 XX"
- 不要基于包名做武断猜测（`com.xxx.browser` 不一定是浏览器，可能是内置浏览器组件）

## 输出要求

将分析结果追加到当前目录的 `AGENTS.md` 文件中，放在 `## Android Audit Profile` 区块内（如不存在则创建）。

输出内容必须是**纯背景信息**，格式自由。参考以下结构但不强制遵循：

```markdown
## Android Audit Profile

### 业务本质
用 2-4 句话描述这个应用的核心价值。例如：
"这是一个 AI 语音摘要应用。用户录音或上传音频，应用调用云端 ASR 服务转文字，再用 LLM 生成摘要。核心数据对象是音频文件和生成的文本。"

### 用户核心旅程
描述最常见的 1-2 条用户操作流程，从打开应用到完成目标。

### 数据对象与生命周期
列出应用处理的 1-3 种核心数据对象，以及它们的流转路径。

### 软件架构分层
简要描述 UI 层、业务层、数据层、网络层的组织方式。不需要完整类图。

### 关键链路
描述 2-4 条从用户操作到远端服务的完整链路，标注数据形态转换点。

### 能力依赖
列出应用依赖的关键硬件、系统服务、云端服务、第三方 SDK。

### 值得关注的业务线索
基于以上分析，指出从业务角度看哪些技术线索可能蕴含攻击面。只陈述事实和推断，不写行动建议。
```

如果某个子标题对当前应用没有价值，直接删除。不要保留空章节。
