# ksec Security Research Build

This repository is a security-research fork of Kimi Code CLI, distributed as the `ksec` command alongside the official `kimi` command — the two never overwrite each other. This page covers the fork's positioning, improvements over upstream, and how to try it from source or install it.

## Positioning

ksec targets security-research workflows: web/mobile/binary/cloud penetration testing and auditing, source-code security audits, and vulnerability validation. The fork adds two kinds of enhancements on top of upstream:

1. Engine and infrastructure improvements (below);
2. Security-research capabilities: built-in security-audit skills, security-role subagents (android-reverser / web-pentester / binary-reverser / code-auditor, bound to MCP groups with tool and skill sandboxes), and companion MCP security tool groups.

Security-testing red line: **verify, don't destroy**. Mutating operations (write/delete/state change) require explicit approval first; stop at proof — never actually use obtained credentials.

## Improvements over upstream

### v2 engine by default

Every entry point (TUI, `kimi -p`, ACP, export, login/provider/upgrade, the VS Code extension) runs on the v2 engine (agent-core-v2) by default. Set `KIMI_CODE_ENGINE=v1` to fall back to the v1 engine.

Key v2 parity work completed in this fork:

- Session deletion (`deleteSession`, including the v1 index tombstone and cron cleanup);
- Context import (`importContext`) and session-less workspace skill listing (`listWorkspaceSkills`);
- The global MCP server management RPC family (mcp.json CRUD, OAuth flows, connectivity tests);
- `fork` with `turnIndex` now fails explicitly (not yet implemented on v2; no more silent full-history copies);
- Cross-engine error-code fidelity (v2 `Error2` converts to v1 `KimiError` at the RPC boundary instead of collapsing to internal);
- The `bash_task_timeout_s` background-task timeout config (`0` = no timeout);
- `[experimental]` config section accepts v1 snake_case flag ids.

### Session management

Manage sessions directly inside the `/sessions` picker (see [Sessions and Context](./sessions.md)):

- `Ctrl+P` to pin (`★`, stored in session metadata, survives restarts);
- `Ctrl+R` to rename (works on closed sessions too);
- Search matches titles and last prompts.

### ACP sandboxed file channel

The v2 engine supports per-session kaos injection: a host's (e.g. Zed's) file operations route over reverse RPC into the host environment instead of the local filesystem — the v2 equivalent of v1's `createSessionWithKaos` channel.

## Requirements

- Node.js `>=24.15.0` (enforced by the repo's `engines` field; `pnpm install` fails otherwise)
- pnpm `10.33.0`

## Trying from source

```sh
pnpm install

# TUI (interactive)
node apps/kimi-code/scripts/dev.mjs

# print mode (one-shot)
node apps/kimi-code/scripts/dev.mjs -p "your prompt"

# Compare against the v1 engine
KIMI_CODE_ENGINE=v1 node apps/kimi-code/scripts/dev.mjs
```

::: tip
`scripts/dev.mjs` runs the source tree directly — changes take effect immediately, ideal for development. If the Node on your PATH is older than required, put 24.15+ first on PATH.
:::

## Installing as the ksec command

```sh
bash scripts/install-to-global.sh          # macOS / Linux / Git Bash
.\scripts\install-to-global.ps1            # Windows PowerShell
```

Builds and installs a separate global package `ksec` (the official `kimi` is left untouched). Then:

```sh
ksec          # security-research TUI
ksec -p "…"   # print mode
```

Rollback: `bash scripts/install-to-global.sh --restore` (Windows: `.\scripts\install-to-global.ps1 -Restore`).

## Installing the ksec-dev development build (Windows)

To install the current source tree's build as a *separate development command* alongside the stable `ksec`:

```powershell
.\scripts\install-ksec-dev.ps1
```

- Installs as the standalone package `kimi-code-security-dev`, command `ksec-dev`, version suffixed with `-dev.<timestamp>`
- The shims export `KSEC_DEV=1` so the runtime can tell a dev install apart
- The stable `ksec` and the official `kimi` are untouched
- `-SkipBuild` reuses the existing dist; `-Restore` rolls back to the previous dev build

All three commands can coexist: `kimi` (official) ↔ `ksec` (stable fork) ↔ `ksec-dev` (latest build of this checkout).

## Known differences (v1 → v2)

- Session resume does not yet restore the per-session kaos channel (after an ACP session resumes, file operations fall back to the local filesystem);
- The Edit tool is not covered by the kaos override (Read/Write/Grep/Glob are);
- Cancelling `/init` may let late subagent stream content through (v1 cuts it off);
- `fork`'s `turnIndex` truncation is unimplemented (fails explicitly).

See `plan/v2-parity-gap.md` in the repository for the full list.
