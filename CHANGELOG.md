# Changelog

All notable changes to this security-research fork of Kimi Code are documented in this file.

## [Unreleased]

### Added
- **MCP transport expansion**: `mcp.json` now accepts `sse` and `streamable-http` transports in addition to `stdio` and `http`. `streamable-http` is normalised to `http` internally for SDK compatibility.
- **MCP group lazy loading**: old `mcpGroups` format from the Python `kimi-cli` is now supported. When groups are present, servers start as `registered` and are only connected on demand via the new `MCPManager` tool or the `/mcp` status panel.
- **Default security-research MCP groups**: if servers exist but no groups are declared, default groups are auto-generated (`android`, `web`, `audit`, `binary`, `full`) matching the legacy Python CLI.
- **`MCPManager` runtime tool**: agents can list MCP groups, load a group, and inspect server statuses at runtime.
- **Security subagent roles**: added `security-analyst`, `android-reverser`, `web-pentester`, `binary-reverser`, and `code-auditor` subagent profiles, bound to the corresponding MCP groups.
- **`/changelog` slash command**: displays the local `CHANGELOG.md` preview or opens the upstream changelog URL when a local file is unavailable.

### Changed
- `McpServerStatus`/`McpServerInfo` now include a `registered` state for lazy-loaded servers.
- Session MCP config now carries `groups` and a `groupRegistry` alongside `servers`.

### Fixed
- Updated config-loader test to use `ws` as the unknown-transport example instead of `sse`, which is now valid.
