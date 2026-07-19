# Kimi Code CLI

[![License](https://img.shields.io/badge/license-MIT-blue)](LICENSE) · [中文](README.zh-CN.md) · [Issues](https://github.com/NitrogenT7/kimi-code-security/issues)

> **Note:** This is an unofficial security-research fork of [MoonshotAI/kimi-code](https://github.com/MoonshotAI/kimi-code). It is not affiliated with or endorsed by Moonshot AI. The security skills under `.agents/skills/` are provided strictly for authorized testing and educational purposes only — do not use them against systems you do not own or have explicit permission to test. For the official project, see the upstream repository.

A terminal AI coding agent, extended for security research. This fork tracks upstream (currently rebased onto **0.27.0**, including the agent-core-v2 engine) and adds an investigation-driven workflow for code auditing, Android / web pentesting, and long-running agent sessions. The fork's features are ported to **both engines**: the default v1 engine (interactive CLI) and the v2 engine (`kimi server` / `KIMI_CODE_EXPERIMENTAL_FLAG`).

## Highlights

- **ToAskList instead of a flat todo list.** The agent works from a question-driven board: each item is a *question to answer*, with evidence chains, confidence/depth badges and parent/child nesting — not a flat "done / doing" checklist. Resolved findings are archived separately from open questions, and the TUI shows them on an InvestigationBoard.

- **Goal mode with the four-element commander's intent.** `/goal set [template]` frames an objective as **Purpose / Key Tasks / End State / Constraints** — templates live in `.goal/` and `~/.agents/goals/` — and the agent iterates toward a verifiable end state with budgets, wall-clock deadlines, and self-audit, instead of following a free-form prompt.

- **MCP groups with lazy loading.** Servers in a group stay disconnected until needed: the main agent loads them with the `MCPManager` tool (`list_groups` / `load_group` / …), or you load one with `/mcp:<group>`. Security subagents — `code-auditor`, `android-reverser`, `binary-reverser`, `web-pentester`, `security-analyst` — are bound to their group's servers with skill-prefix sandboxing.

- **Session robustness.** Impostor image payloads (e.g. a tool returning an error message labelled `image/png`) are downgraded to text instead of poisoning the session; retention-plan compaction (flag-gated) preserves what matters across auto-compaction.

- **Upstream 0.27.0 underneath.** Shell mode (`!`), session search, image compression and media-degraded recovery, progressive tool disclosure, hardened goal budgets and crash recovery, the server-hosted web UI, and everything else from upstream 0.15→0.27.

- **Security-research skills.** Bundled skills for Android APK auditing, IPC analysis, business threat modeling, entry-driven and sink-backtracking code audits, exploit validation, and web pentesting.

- **Release tooling.** Changeset workflow, `/changelog`, and a merge gate.

## Develop

Requirements: Node.js ≥ 24.15.0, pnpm 10.33.0.

```sh
git clone https://github.com/NitrogenT7/kimi-code-security.git
cd kimi-code-security
pnpm install
```

```sh
pnpm dev:cli    # run the CLI in dev mode
pnpm test       # run tests
pnpm typecheck  # TypeScript check
pnpm lint       # oxlint
pnpm build      # build all packages
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for the contribution guide.
