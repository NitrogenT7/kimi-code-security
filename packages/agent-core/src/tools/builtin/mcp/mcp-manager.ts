/**
 * MCPManager — runtime control surface for MCP servers and groups.
 *
 * When `mcpGroups` are configured in `mcp.json`, servers start as
 * `registered` (lazy) instead of being connected at session startup. This tool
 * lets the agent:
 *
 *   - list_groups: see available groups and which servers they contain
 *   - load_group:   connect every server in a group on demand
 *   - list_servers: inspect current status of all known MCP servers
 *   - load_server:  connect a single known MCP server on demand
 *   - get_server:   inspect the current status of a single MCP server
 *   - add_or_update_server: register or replace a server config and connect it
 *   - remove_server: remove a server from the runtime manager
 *
 * Without groups the manager still works, but all servers will already be
 * connected (or failed) at startup.
 */

import { z } from 'zod';

import { McpServerConfigSchema } from '#/config/schema';

import type { Agent } from '../../../agent';
import type { BuiltinTool } from '../../../agent/tool';
import type { ToolExecution } from '../../../loop/types';
import type { McpServerEntry } from '../../../mcp/connection-manager';
import { toInputJsonSchema } from '../../support/input-schema';

export const MCPManagerInputSchema = z.object({
  action: z
    .enum([
      'list_groups',
      'load_group',
      'list_servers',
      'load_server',
      'get_server',
      'add_or_update_server',
      'remove_server',
    ])
    .describe('Management action to perform.'),
  group_name: z.string().optional().describe('Required when action is load_group.'),
  server_name: z
    .string()
    .optional()
    .describe('Required when action is load_server, get_server, or remove_server.'),
  config: z
    .object({})
    .passthrough()
    .optional()
    .describe(
      'Required when action is add_or_update_server. Must be a valid McpServerConfig object.',
    ),
});

export type MCPManagerInput = z.infer<typeof MCPManagerInputSchema>;

const DESCRIPTION = `Runtime manager for MCP servers and groups.

Actions:
- list_groups: enumerate configured MCP groups (from mcp.json mcpGroups).
- load_group: connect every server in the named group; requires group_name.
- list_servers: show the current status of all known MCP servers.
- load_server: connect a single known MCP server by name; requires server_name.
- get_server: show the current status of a single MCP server; requires server_name.
- add_or_update_server: register a new server or replace an existing server's config and connect it; requires server_name and config.
- remove_server: disconnect and remove a server from the runtime manager; requires server_name.

Use load_group or load_server before asking tools from a lazy-loaded server to do work.`;

export class MCPManagerTool implements BuiltinTool<MCPManagerInput> {
  readonly name = 'MCPManager';
  readonly description = DESCRIPTION;
  readonly parameters: Record<string, unknown> = toInputJsonSchema(MCPManagerInputSchema);

  constructor(private readonly agent: Agent) {}

  resolveExecution(args: MCPManagerInput): ToolExecution {
    return {
      description: this.describeAction(args),
      approvalRule: this.name,
      execute: async () => this.execute(args),
    };
  }

  private describeAction(args: MCPManagerInput): string {
    switch (args.action) {
      case 'list_groups':
      case 'list_servers':
        return `MCPManager: ${args.action}`;
      case 'load_group':
        return `Loading MCP group: ${args.group_name ?? '<missing>'}`;
      case 'load_server':
        return `Loading MCP server: ${args.server_name ?? '<missing>'}`;
      case 'get_server':
        return `Getting MCP server: ${args.server_name ?? '<missing>'}`;
      case 'add_or_update_server':
        return `Adding/updating MCP server: ${args.server_name ?? '<missing>'}`;
      case 'remove_server':
        return `Removing MCP server: ${args.server_name ?? '<missing>'}`;
    }
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
          const prefixes =
            group.skillPrefixes.length > 0 ? ` [${group.skillPrefixes.join(', ')}]` : '';
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
          // Loading a group also activates its skill-filtering mode, matching the
          // behavior of the interactive `/mcp:<group>` slash command.
          const group = registry.get(groupName);
          if (group !== undefined) {
            this.agent.mcpGroupMode = groupName;
            this.agent.allowedSkillPrefixes =
              group.skillPrefixes.length > 0 ? [...group.skillPrefixes] : null;
          }
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
        return { output: formatServerList(servers) };
      }

      case 'load_server': {
        const serverName = args.server_name;
        if (serverName === undefined || serverName.length === 0) {
          return { output: 'server_name is required for load_server.', isError: true };
        }
        if (manager === undefined) {
          return { output: 'MCP connection manager is not available.', isError: true };
        }
        if (manager.get(serverName) === undefined) {
          return { output: `Unknown MCP server: ${serverName}`, isError: true };
        }
        try {
          await manager.reconnect(serverName);
          return { output: `MCP server "${serverName}" loaded successfully.` };
        } catch (error: unknown) {
          const message = error instanceof Error ? error.message : String(error);
          return { output: `Failed to load MCP server "${serverName}": ${message}`, isError: true };
        }
      }

      case 'get_server': {
        const serverName = args.server_name;
        if (serverName === undefined || serverName.length === 0) {
          return { output: 'server_name is required for get_server.', isError: true };
        }
        if (manager === undefined) {
          return { output: 'MCP connection manager is not available.', isError: true };
        }
        const server = manager.get(serverName);
        if (server === undefined) {
          return { output: `Unknown MCP server: ${serverName}`, isError: true };
        }
        return { output: formatServerEntry(server) };
      }

      case 'add_or_update_server': {
        const serverName = args.server_name;
        if (serverName === undefined || serverName.length === 0) {
          return { output: 'server_name is required for add_or_update_server.', isError: true };
        }
        if (manager === undefined) {
          return { output: 'MCP connection manager is not available.', isError: true };
        }
        const rawConfig = args.config;
        if (rawConfig === undefined || Object.keys(rawConfig).length === 0) {
          return { output: 'config is required for add_or_update_server.', isError: true };
        }
        let config;
        try {
          config = McpServerConfigSchema.parse(rawConfig);
        } catch (error: unknown) {
          const message = error instanceof Error ? error.message : String(error);
          return { output: `Invalid MCP server config: ${message}`, isError: true };
        }
        try {
          await manager.connect(serverName, config);
          return { output: `MCP server "${serverName}" added/updated and connected successfully.` };
        } catch (error: unknown) {
          const message = error instanceof Error ? error.message : String(error);
          return {
            output: `Failed to connect MCP server "${serverName}": ${message}`,
            isError: true,
          };
        }
      }

      case 'remove_server': {
        const serverName = args.server_name;
        if (serverName === undefined || serverName.length === 0) {
          return { output: 'server_name is required for remove_server.', isError: true };
        }
        if (manager === undefined) {
          return { output: 'MCP connection manager is not available.', isError: true };
        }
        const removed = await manager.remove(serverName);
        if (!removed) {
          return { output: `Unknown MCP server: ${serverName}`, isError: true };
        }
        return { output: `MCP server "${serverName}" removed successfully.` };
      }

      default: {
        const _exhaustive: never = args.action;
        return { output: `Unknown action: ${String(_exhaustive)}`, isError: true };
      }
    }
  }
}

function formatServerList(servers: readonly McpServerEntry[]): string {
  const lines = servers.map((server) => {
    const errorHint = server.error !== undefined ? `\n    error: ${server.error}` : '';
    return `- ${server.name}: ${server.status} (${server.transport}, ${server.toolCount} tools)${errorHint}`;
  });
  return `MCP servers:\n${lines.join('\n')}`;
}

function formatServerEntry(server: McpServerEntry): string {
  const errorHint = server.error !== undefined ? `\nerror: ${server.error}` : '';
  return `${server.name}:\n  status: ${server.status}\n  transport: ${server.transport}\n  tools: ${server.toolCount}${errorHint}`;
}
