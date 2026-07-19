# Kimi Code CLI

[![License](https://img.shields.io/badge/license-MIT-blue)](LICENSE) · [English](README.md) · [Issues](https://github.com/NitrogenT7/kimi-code-security/issues)

> **说明：** 这是 [MoonshotAI/kimi-code](https://github.com/MoonshotAI/kimi-code) 的非官方安全研究 fork，与 Moonshot AI 无任何隶属或背书关系。`.agents/skills/` 下的安全研究类 skill 仅供授权测试与教育用途——请勿对未获授权的系统使用。官方项目请见上游仓库。

一个运行在终端里的 AI 编程 agent，扩展用于安全研究。本 fork 跟踪上游（当前已 rebase 到 **0.27.0**，包含 agent-core-v2 引擎），增加了代码审计、Android / Web 渗透测试以及问题驱动会话的工作流。fork 特性已移植到**双引擎**：默认的 v1 引擎（交互式 CLI）和 v2 引擎（`kimi server` / `KIMI_CODE_EXPERIMENTAL_FLAG`）。

## 项目亮点

- **ToAskList 替代扁平待办清单。** agent 从一个**问题驱动面板**出发：每个条目都是一个待回答的问题，附带证据链、置信度 / 深度徽章和父子嵌套结构；已解决的发现归档到 findings 单独跟踪，TUI 用 InvestigationBoard 双区展示问题与结论。

- **Goal 模式与四要素指挥官意图。** 通过 `/goal set [模板]` 把目标拆成**目的（Purpose） / 关键任务（Key Tasks） / 结束状态（End State） / 约束（Constraints）**四要素——模板放在 `.goal/` 或 `~/.agents/goals/` 目录——agent 在预算、wall-clock 截止和自审机制下迭代推进，而不是自由发挥。

- **MCP 分组懒加载。** 组内服务器默认不连接，需要时才加载：主 agent 用 `MCPManager` 工具（`list_groups` / `load_group` 等）管理，用户也可以用 `/mcp:<group>` 一键加载。安全子 Agent —— `code-auditor`、`android-reverser`、`binary-reverser`、`web-pentester`、`security-analyst` —— 各自绑定对应组的服务器，并在 skill 前缀沙箱中运行。

- **会话韧性。** 伪装图片载荷（例如工具把错误文本标记为 `image/png` 返回）会被降级为文本，不再让整个会话中毒；retention-plan 压缩（flag 控制）在自动压缩前保留关键信息。

- **底层是上游 0.27.0。** Shell 模式（`!`）、会话搜索、图片压缩与媒体降级恢复、渐进式工具披露、强化的 Goal 预算与崩溃恢复、server 托管的 Web UI，以及上游 0.15→0.27 的全部改进。

- **安全研究 skills。** 内置 Android APK 审计、IPC 分析、业务威胁建模、入口驱动与 sink 回溯代码审计、漏洞利用验证、Web 渗透测试等 skills。

- **发布工具链。** changeset 工作流、`/changelog` 与 merge gate。

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
