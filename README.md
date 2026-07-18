# Kimi Code CLI

[![License](https://img.shields.io/badge/license-MIT-blue)](LICENSE) · [中文](README.zh-CN.md) · [Issues](https://github.com/NitrogenT7/kimi-code-security/issues)

> **Note:** This is an unofficial security-research fork of [MoonshotAI/kimi-code](https://github.com/MoonshotAI/kimi-code). It is not affiliated with or endorsed by Moonshot AI. The security skills under `.agents/skills/` are provided strictly for authorized testing and educational purposes only — do not use them against systems you do not own or have explicit permission to test. For the official project, see the upstream repository.

A terminal AI coding agent, extended for security research. This fork keeps the upstream agent engine and adds an investigation-driven workflow for code auditing, Android / web pentesting, and long-running agent sessions.

## Highlights

- **ToAskList instead of a flat todo list.** The agent works from a question-driven board: each item is a *question to answer*, with evidence chains, confidence/depth badges and parent/child nesting — not a flat "done / doing" checklist. Resolved findings are tracked separately from open questions.

- **Goal mode with the four-element commander's intent.** `/goal set` frames an objective as **Purpose / Key Tasks / End State / Constraints**, and the agent iterates toward a verifiable end state with budgets and self-audit, instead of following a free-form prompt.

- **Subagents that bring their own MCP.** Load tool groups on demand with `/mcp:<group>`; each group runs in its own skill-prefix sandbox. The bundled security subagents — `code-auditor`, `android-reverser`, `binary-reverser`, `web-pentester`, `security-analyst` — each load exactly the MCP tools they need and nothing else.

- **Shell mode.** Type `!` in the TUI to run a local shell command, stream its output live, cancel with Esc/Ctrl-C, or detach it to a background task with Ctrl-B.

- **Session search.** The session picker now fuzzy-filters by title and last prompt, so you can jump back to an old investigation by what you asked, not just its title.

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
