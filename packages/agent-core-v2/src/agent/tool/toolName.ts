/**
 * `tool` domain (L3) — tool-name predicates.
 *
 * `isMcpToolName` recognizes namespaced MCP tool names (`mcp__…`). It lives in
 * the foundational tool contract so lower layers (e.g. `profile`) can classify
 * tool names without depending on the `mcp` domain; the qualifying/sanitizing
 * helpers that build such names stay in `mcp`. Pure function; no scoped
 * service.
 */

const MCP_NAME_PREFIX = 'mcp__';

export function isMcpToolName(name: string): boolean {
  return name.startsWith(MCP_NAME_PREFIX);
}
