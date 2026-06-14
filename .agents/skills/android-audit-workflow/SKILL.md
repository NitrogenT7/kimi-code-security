---
name: android-audit-workflow
description: Android APK 安全审计标准工作流。三阶段：侦察 → 并行挖洞 → 审核报告。触发词：审计 APK、安全审计、漏洞审计、audit APK、Android audit、安全测试流程。
---

# Android 安全审计工作流

## 概述

本 Skill 定义了 Android APK 安全审计的标准三阶段流程。主代理按阶段编排子代理，最终产出审核报告。

## 前置条件

- 主代理已通过 `kimi -g android` 启动（加载 android MCP + Skills）
- 目标 APK 文件路径已知
- JADX、ADB、Frida MCP 已连接（或由主代理在启动前通过 MCPManager 加载）

## 标准流程

### 阶段 0：环境准备（仅主代理执行）

在启动任何子代理之前，主代理必须先确保所需 MCP 组已可用：

1. **若 `MCPManager` 工具可用**：
   - `MCPManager(action="list_groups")` 查看已配置的 MCP 组。
   - 依次加载本工作流依赖的组：
     - `MCPManager(action="load_group", group_name="android")` —— APK 反编译、Frida、ADB、JADX
     - （可选）`MCPManager(action="load_group", group_name="web")` —— 若云端攻击面涉及 Web 后端交互
     - （可选）`MCPManager(action="load_group", group_name="audit")` —— 若需要静态扫描能力
   - 加载完成后用 `MCPManager(action="list_servers")` 确认状态。
2. **若 `MCPManager` 不可用**：
   - 假设当前会话已直接暴露对应的 `mcp__*` 工具，继续执行。
3. 记录已加载的组，后续所有子代理默认直接使用 `mcp__*` 工具，**不要再调用 MCPManager**。

---

### 阶段 1：侦察（Reconnaissance）

**目标**：快速理解 APK 的业务架构、组件结构和初步攻击面。

启动 **1 个子代理**：

```
Agent(
  subagent_type="android-reverser",
  prompt="""
  分析目标 APK 的架构和攻击面。

  目标 APK: {path_to_apk}

  环境说明：主代理已确保 android MCP 组可用，你直接使用 `mcp__*` 工具，不要调用 MCPManager。

  请执行以下步骤：
  1. 读取 apk-business-architecture-profiler SKILL.md 了解侦察方法论
  2. 使用 JADX 反编译 APK，识别：
     - 包结构和模块划分
     - 四大组件清单（Activity/Service/Receiver/Provider）
     - 导出组件（exported=true）及其 Intent Filter
     - 自定义权限声明
     - 关键 SDK/库依赖
  3. 输出一份结构化的侦察报告，包含：
     - 业务功能概述
     - 组件清单（标注导出情况）
     - 初步攻击面分析
     - 建议的下一步审计重点
  """
)
```

**预期输出**：侦察报告（组件清单、导出面、攻击面初步评估）

---

### 阶段 2：并行挖洞（Deep Dive）

**目标**：从三个维度同时深入审计，发现具体漏洞。

**同时启动 3 个子代理**（一次 LLM 调用发出三个 Agent 调用）：

```
// 子代理 A：IPC 审计
Agent(
  subagent_type="android-reverser",
  prompt="""
  对目标 APK 进行 IPC 安全审计。

  参考侦察报告: {recon_report_summary}

  环境说明：主代理已确保 android MCP 组可用，你直接使用 `mcp__*` 工具，不要调用 MCPManager。

  1. 读取 android-ipc-auditor SKILL.md 了解审计方法论
  2. 针对每个导出组件，追踪 Intent 数据流：
     - 入口：获取 Intent extras / URI
     - 处理：分析参数校验逻辑
     - Sink：敏感操作（loadUrl、startActivity、文件读写、SQL）
  3. 检查防御机制：白名单、权限校验、签名验证
  4. 输出发现的 IPC 漏洞（含调用链）
  """
)

// 子代理 B：硬编码凭证
Agent(
  subagent_type="android-reverser",
  prompt="""
  对目标 APK 进行硬编码凭证分析。

  参考侦察报告: {recon_report_summary}

  环境说明：主代理已确保 android MCP 组可用，你直接使用 `mcp__*` 工具，不要调用 MCPManager。

  1. 读取 apk-hardcode-analyzer SKILL.md 了解分析方法论
  2. 搜索硬编码敏感信息：
     - API Keys / Secret Keys / Access Tokens
     - 云服务凭证（AK/SK）
     - JWT 签名密钥 / OAuth Client Secret
     - 证书私钥 / 加密密钥
  3. 反向追溯每个凭证的业务用途
  4. 输出发现的硬编码凭证列表（含位置和用途）
  """
)

// 子代理 C：云端攻击面
Agent(
  subagent_type="android-reverser",
  prompt="""
  对目标 APK 进行云端攻击面测绘。

  参考侦察报告: {recon_report_summary}

  环境说明：主代理已确保 android MCP 组可用，你直接使用 `mcp__*` 工具，不要调用 MCPManager。

  1. 读取 apk-cloud-surface-mapper SKILL.md 了解方法论
  2. 从代码中提取：
     - 所有域名和 API 端点
     - 请求构造方式（参数、Headers）
     - 签名/Token 机制
  3. 评估传输层风险（HTTP vs HTTPS、证书校验）
  4. 输出云端攻击面报告（端点列表、认证机制、风险评级）
  """
)
```

**预期输出**：三类漏洞列表（IPC 漏洞、硬编码凭证、云端风险）

---

### 阶段 3：审核与报告（Review & Report）

**目标**：审核所有发现，输出最终安全测试报告。

启动 **1 个审核子代理**：

```
Agent(
  subagent_type="security-analyst",
  prompt="""
  对以下安全审计发现进行审核并生成报告。

  IPC 审计结果: {ipc_findings}
  硬编码分析结果: {hardcode_findings}
  云端攻击面结果: {cloud_findings}

  环境说明：主代理已确保所需 MCP 组可用，你直接使用 `mcp__*` 工具验证代码证据，不要调用 MCPManager。

  1. 读取 audit-vulnerability-reviewer SKILL.md 了解审核标准
  2. 对每个发现进行审核：
     - 可触达性：调用链是否完整可达？
     - 可利用性：是否有实际利用价值？
     - 复现成功率：是否能在当前环境复现？
  3. 按严重性分类（Critical/High/Medium/Low/Info）
  4. 生成 Word 报告：
     - 封面页 + 执行摘要
     - 发现汇总表
     - 每个漏洞的详细信息（描述、影响、复现步骤、修复建议）
     - 保存为 android-audit-report-{date}.docx
  """
)
```

**预期输出**：审核后的漏洞列表 + Word 格式安全测试报告

---

## 命令速查

```
阶段 1：
  Agent(subagent_type="android-reverser", prompt="分析 APK 架构和攻击面...")
  → 必须先读取 apk-business-architecture-profiler SKILL.md

阶段 2（三路并行，可用 AgentSwarm 替代）：
  Agent(subagent_type="android-reverser", prompt="IPC 审计...")    → android-ipc-auditor
  Agent(subagent_type="android-reverser", prompt="硬编码凭证...")    → apk-hardcode-analyzer
  Agent(subagent_type="android-reverser", prompt="云端攻击面...")    → apk-cloud-surface-mapper

阶段 3：
  Agent(subagent_type="security-analyst", prompt="审核+生成报告...")  → audit-vulnerability-reviewer
```

## 关键原则

- **先读 SKILL.md，再执行**：每个阶段开始前，子代理必须先读取对应 SKILL.md
- **侦察先行**：不要跳过阶段 1，否则挖洞没有方向
- **并行最大化**：阶段 2 的三个子代理必须同时启动（一次 LLM 调用）
- **主代理传递上下文**：阶段 2 的 prompt 中必须包含阶段 1 的关键输出
- **审核严格**：每个漏洞必须经过 audit-vulnerability-reviewer 的验证
