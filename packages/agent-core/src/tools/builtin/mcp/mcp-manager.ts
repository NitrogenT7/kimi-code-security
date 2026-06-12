/**
 * MCPManager — runtime control surface for MCP server groups.
 *
 * When `mcpGroups` are configured in `mcp.json`, servers start as
 * `registered` (lazy) instead of being connected at session startup. This tool
 * lets the agent:
 *
 *   - list_groups: see available groups and which servers they contain
 *   - load_group:   connect every server in a group on demand
 *   - list_servers: inspect current status of all known MCP servers
 *
 * Without groups the manager still works, but all servers will already be
 * connected (or failed) at startup.
 */

import { z } from 'zod';

import type { BuiltinTool } from '../../../agent/tool';
import type { Agent } from '../../../agent';
import type { ToolExecution } from '../../../loop/types';
import { toInputJsonSchema } from '../../support/input-schema';

export const MCPManagerInputSchema = z.object({
  action: z
    .enum(['list_groups', 'load_group', 'list_servers'])
    .describe('Management action to perform.'),
  group_name: z
    .string()
    .optional()
    .describe('Required when action is load_group.'),
});

export type MCPManagerInput = z.infer<typeof MCPManagerInputSchema>;

const DESCRIPTION = `Runtime manager for MCP servers and groups.

Actions:
- list_groups: enumerate configured MCP groups (from mcp.json mcpGroups).
- load_group: connect every server in the named group; requires group_name.
- list_servers: show the current status of all known MCP servers.

Use load_group before asking tools from a lazy-loaded group to do work.`;

export class MCPManagerTool implements BuiltinTool<MCPManagerInput> {
  readonly name = 'MCPManager';
  readonly description = DESCRIPTION;
  readonly parameters: Record<string, unknown> = toInputJsonSchema(MCPManagerInputSchema);

  constructor(private readonly agent: Agent) {}

  resolveExecution(args: MCPManagerInput): ToolExecution {
    return {
      description:
        args.action === 'load_group'
          ? `Loading MCP group: ${args.group_name ?? '<missing>'}`
          : `MCPManager: ${args.action}`,
      approvalRule: this.name,
      execute: async () => this.execute(args),
    };
  }

  private async execute(args: MCPManagerInput): Promise<{ output: string; isError?: boolean }> {
    const registry = this.agent.mcpGroupRegistry;
    const manager = this.agent.mcp;

    switch (args.action) {
      case 'list_groups': {
        if (registry === undefined) {
          return { output: 'No MCP groups are configured (mcpGroups missing from mcp.json).' };
        }
        const groups = registry.list();
        if (groups.length === 0) {
          return { output: 'No MCP groups are configured.' };
        }
        const lines = groups.map((group) => {
          const serverNames = group.servers.join(', ');
          const prefixes = group.skillPrefixes.length > 0 ? ` [${group.skillPrefixes.join(', ')}]` : '';
          return `- ${group.name}: ${group.description ?? 'no description'}\n  servers: ${serverNames}${prefixes}`;
        });
        return { output: `Available MCP groups:\n${lines.join('\n')}` };
      }

      case 'load_group': {
        const groupName = args.group_name;
        if (groupName === undefined || groupName.length === 0) {
          return { output: 'group_name is required for load_group.', isError: true };
        }
        if (registry === undefined) {
          return { output: 'No MCP groups are configured.', isError: true };
        }
        if (manager === undefined) {
          return { output: 'MCP connection manager is not available.', isError: true };
        }
        try {
          await manager.loadGroup(groupName, registry);
          return { output: `MCP group "${groupName}" loaded successfully.` };
        } catch (error: unknown) {
          const message = error instanceof Error ? error.message : String(error);
          return { output: `Failed to load MCP group "${groupName}": ${message}`, isError: true };
        }
      }

      case 'list_servers': {
        if (manager === undefined) {
          return { output: 'No MCP servers are configured.' };
        }
        const servers = manager.list();
        if (servers.length === 0) {
          return { output: 'No MCP servers are configured.' };
        }
        const lines = servers.map((server) => {
          const errorHint = server.error !== undefined ? `\n    error: ${server.error}` : '';
          return `- ${server.name}: ${server.status} (${server.transport}, ${server.toolCount} tools)${errorHint}`;
        });
        return { output: `MCP servers:\n${lines.join('\n')}` };
      }

      default: {
        const _exhaustive: never = args.action;
        return { output: `Unknown action: ${String(_exhaustive)}`, isError: true };
      }
    }
  }
}
