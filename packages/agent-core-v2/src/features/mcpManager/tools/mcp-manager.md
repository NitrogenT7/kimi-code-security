MCP server-group management for on-demand MCP loading.

When `mcpGroups` are declared in mcp.json, servers claimed by a group start
`registered` (lazy — not connected) instead of connecting at startup. This tool
lets you connect them on demand:

- list_groups: show available groups, their servers, and load state
- load_group: connect every server in a group
- list_servers: show every known MCP server and its current status
- load_server: connect a single known MCP server
- get_server: inspect the current status of one MCP server

Security subagents cannot call this tool; only the main agent can. When a group
reports failures, read the per-server error before retrying.
