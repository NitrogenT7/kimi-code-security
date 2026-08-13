---
"@moonshot-ai/kimi-code": patch
---

Fix the /mcp panel crashing when lazy-loaded MCP group servers are in the registered state, report per-server failures honestly when loading an MCP group instead of always claiming success, and keep ungrouped MCP servers connecting when the mcpGroups section of mcp.json is invalid.
