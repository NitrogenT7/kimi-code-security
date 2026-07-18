# Kimi Code CLI

[![License](https://img.shields.io/badge/license-MIT-blue)](LICENSE) · [English](README.md) · [Issues](https://github.com/NitrogenT7/kimi-code-security/issues)

> **说明：** 这是 [MoonshotAI/kimi-code](https://github.com/MoonshotAI/kimi-code) 的非官方安全研究 fork，与 Moonshot AI 无任何隶属或背书关系。`.agents/skills/` 下的安全研究类 skill 仅供授权测试与教育用途——请勿对未获授权的系统使用。官方项目请见上游仓库。

一个运行在终端里的 AI 编程 agent，扩展用于安全研究。本 fork 在保留上游 agent 引擎的基础上，增加了代码审计、Android / Web 渗透测试以及问题驱动会话的工作流。

## 项目亮点

- **ToAskList 替代扁平待办清单。** agent 从一个**问题驱动面板**出发：每个条目都是一个待回答的问题，附带证据链、置信度 / 深度徽章和父子嵌套结构；已解决的发现单独跟踪，而不是混在一个简单的「已完成 / 进行中」列表里。

- **Goal 模式与四要素指挥官意图。** 通过 `/goal set` 把目标拆成**目的（Purpose） / 关键任务（Key Tasks） / 结束状态（End State） / 约束（Constraints）**四要素，agent 会在预算和自审机制下迭代推进，而不是自由发挥。

- **子 Agent 自带 MCP。** 通过 `/mcp:<group>` 按需加载工具组，每个组运行在独立的 skill-prefix 沙箱中。内置的安全子 Agent —— `code-auditor`、`android-reverser`、`binary-reverser`、`web-pentester`、`security-analyst` —— 各自只加载自己需要的 MCP 工具。

- **Shell 模式。** 在 TUI 中输入 `!` 即可执行本地 shell 命令，实时输出流、Esc / Ctrl+C 取消、Ctrl+B 转入后台任务。

- **会话搜索。** 会话选择器现在支持按**标题**和**最后一条 prompt** 进行模糊过滤，方便快速回到之前的调查现场。

- **安全研究 skill。** 内置 Android APK 审计、IPC 分析、业务威胁建模、正向入口驱动审计、反向污点回溯审计、漏洞利用验证、Web 渗透等技能。

- **发布工具链。** changeset 工作流、`/changelog` 命令和 merge gate。

## 本地开发

环境要求：Node.js ≥ 24.15.0，pnpm 10.33.0。

```sh
git clone https://github.com/NitrogenT7/kimi-code-security.git
cd kimi-code-security
pnpm install
```

```sh
pnpm dev:cli    # 以开发模式运行 CLI
pnpm test       # 运行测试
pnpm typecheck  # TypeScript 检查
pnpm lint       # 运行 oxlint
pnpm build      # 构建所有包
```

完整贡献流程见 [CONTRIBUTING.md](CONTRIBUTING.md)。

## 致谢

TUI 构建在 [`pi-tui`](https://github.com/earendil-works/pi-mono/tree/main/packages/tui) 之上，感谢原作者的工作。

## 许可证

基于 [MIT](LICENSE) 协议发布。
