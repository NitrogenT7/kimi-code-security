# ksec 安全研究版

本仓库是 Kimi Code CLI 的安全研究分支（fork），以 `ksec` 命令发布，与官方 `kimi` 命令并存、互不影响。本页说明分支的定位、相对上游的改进，以及从源码试用 / 安装的方法。

## 定位

ksec 面向安全研究工作流：Web/移动/二进制/云的渗透与审计、代码安全审计、漏洞验证。分支在上游能力之上做了两类增强：

1. **引擎与基础设施改进**（见下文）；
2. **安全研究能力**：内置安全审计 Skills、安全角色子代理（android-reverser / web-pentester / binary-reverser / code-auditor 等，按 MCP 分组绑定工具与技能沙箱）、以及配套的 MCP 安全工具组。

安全测试红线：**验证，不破坏**。写、删、状态变更类操作必须先获批准；点到为止，不真用获取到的凭证。

## 相对上游的改进

### v2 引擎为默认

所有入口（TUI、`kimi -p`、ACP、export、login/provider/upgrade、VS Code 扩展）默认运行在 v2 引擎（agent-core-v2）上。设置环境变量 `KIMI_CODE_ENGINE=v1` 可回退到 v1 引擎。

v2 引擎相对 v1 的关键补齐（均在本分支完成）：

- 会话删除（`deleteSession`，含 v1 索引墓碑、cron 清理）；
- 上下文导入（`importContext`）、免会话的 workspace 技能列表（`listWorkspaceSkills`）;
- 全局 MCP 服务器管理 RPC 家族（mcp.json 增删改查、OAuth 授权流、连通性测试）；
- `fork` 按轮截断（`turnIndex`）显式报错（v2 尚未实现，不再静默整卷复制）；
- 错误码跨引擎保真（v2 `Error2` 在 RPC 边界转换为 v1 `KimiError`，不再折叠为 internal）;
- Bash 后台任务超时配置 `bash_task_timeout_s`（`0` = 不限时）；
- `[experimental]` 配置节兼容 v1 的 snake_case 标识。

### 会话管理

`/sessions` 选择器内直接管理会话（详见[会话与上下文](./sessions.md)）：

- `Ctrl+P` 置顶（`★`，存会话元数据，跨终端重启生效）；
- `Ctrl+R` 重命名（含已关闭会话）；
- 搜索匹配标题与上轮提问内容。

### ACP 沙箱文件通道

v2 引擎支持 per-session kaos 注入：宿主（如 Zed）的文件操作经反向 RPC 路由到宿主环境，而非本地文件系统（v1 的 `createSessionWithKaos` 通道在 v2 上的等价实现）。

## 环境要求

- Node.js `>=24.15.0`（仓库 `engines` 强制；版本不满足时 `pnpm install` 会失败）
- pnpm `10.33.0`

## 从源码试用

```sh
pnpm install

# TUI（交互界面）
node apps/kimi-code/scripts/dev.mjs

# print 模式（单次执行）
node apps/kimi-code/scripts/dev.mjs -p "你的提示"

# 回退 v1 引擎对照
KIMI_CODE_ENGINE=v1 node apps/kimi-code/scripts/dev.mjs
```

::: tip 提示
`scripts/dev.mjs` 直接运行源码，改动即时生效，适合开发验证。系统 PATH 中的 Node 版本低于要求时，先把 24.15+ 加入 PATH 前部。
:::

## 安装为 ksec 命令

```sh
bash scripts/install-to-global.sh          # macOS / Linux / Git Bash
.\scripts\install-to-global.ps1            # Windows PowerShell
```

构建并安装为独立全局包 `ksec`（不覆盖官方 `kimi`）。之后：

```sh
ksec          # 安全研究版 TUI
ksec -p "…"   # print 模式
```

回滚：`bash scripts/install-to-global.sh --restore`（Windows：`.\scripts\install-to-global.ps1 -Restore`）。

## 安装开发版 ksec-dev（Windows）

想把当前源码树的构建装成**独立的开发命令**、与稳定版 `ksec` 并存对比时：

```powershell
.\scripts\install-ksec-dev.ps1
```

- 安装为独立包 `kimi-code-security-dev`，命令为 `ksec-dev`，版本带 `-dev.<时间戳>` 后缀
- shim 自动设置 `KSEC_DEV=1` 环境变量，运行时可区分开发版
- 稳定版 `ksec` 与官方 `kimi` 不受影响
- `-SkipBuild` 跳过构建用现有 dist；`-Restore` 回滚到上一个开发版构建

三个命令可以同时使用：`kimi`（官方）↔ `ksec`（稳定 fork）↔ `ksec-dev`（本源码树最新构建）。

## 已知差异（v1 → v2）

- 会话恢复（resume）暂不恢复 per-session kaos 通道（ACP 长会话恢复后文件操作回落本地文件系统）；
- Edit 工具不受 kaos 覆盖（Read/Write/Grep/Glob 均受覆盖）；
- `/init` 取消后子代理流可能带出迟到内容（v1 会切断）；
- `fork` 的 `turnIndex` 截断未实现（显式报错）。

详细清单见仓库内 `plan/v2-parity-gap.md`。
