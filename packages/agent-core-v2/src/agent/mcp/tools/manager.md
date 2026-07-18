Runtime manager for MCP servers and groups.

When `mcpGroups` are configured in `mcp.json`, group member servers start as `registered` (lazy) instead of being connected at session startup. Use this tool to load them on demand.

Actions:

- `list_groups`: enumerate configured MCP groups (from mcp.json `mcpGroups`), their servers, and whether they are loaded.
- `load_group`: connect every server in the named group; requires `group_name`.
- `list_servers`: show the current status of all known MCP servers.
- `load_server`: connect a single known MCP server by name; requires `server_name`.
- `get_server`: show the current status of a single MCP server; requires `server_name`.
- `add_or_update_server`: register a new server or replace an existing server's config and connect it; requires `server_name` and `config`.
- `remove_server`: disconnect and remove a server from the runtime manager; requires `server_name`.

Call `list_groups` then `load_group` before using `mcp__*` tools from a server that is still `registered` (not yet connected). Only after the group reports success should you call its tools.
