/**
 * MCPManager — runtime control surface for MCP servers and groups.
 *
 * When `mcpGroups` are configured in `mcp.json`, servers claimed by a group
 * start as `registered` (lazy) instead of being connected at session startup.
 * This tool lets the main agent:
 *
 *   - list_groups: see available groups and which servers they contain
 *   - load_group:   connect every server in a group on demand
 *   - list_servers: inspect current status of all known MCP servers
 *   - load_server:  connect a single known MCP server on demand
 *   - get_server:   inspect the current status of a single MCP server
 *   - add_or_update_server: register or replace a server config and connect it
 *   - remove_server: remove a server from the runtime manager
 *
 * Registered for the main agent only, mirroring the goal tools' gate: group
 * loading is session-wide, so subagents must not drive it.
 */

import { z } from 'zod';

import { McpServerConfigSchema } from '#/agent/mcp/config-schema';
import type { McpServerEntry } from '#/agent/mcp/connection-manager';
import { IAgentScopeContext } from '#/agent/scopeContext/scopeContext';
import { registerTool } from '#/agent/toolRegistry/toolContribution';
import { ISessionMcpService } from '#/session/mcp/sessionMcp';
import { toInputJsonSchema } from '#/tool/input-schema';
import type { BuiltinTool, ToolExecution } from '#/tool/toolContract';

import DESCRIPTION from './manager.md?raw';

export const MCPManagerInputSchema = z
  .object({
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
      .describe(
        'Required when action is load_server, get_server, add_or_update_server, or remove_server.',
      ),
    config: z
      .looseObject({})
      .optional()
      .describe(
        'Required when action is add_or_update_server. Must be a valid McpServerConfig object.',
      ),
  })
  .strict();

export type MCPManagerInput = z.infer<typeof MCPManagerInputSchema>;

export class MCPManagerTool implements BuiltinTool<MCPManagerInput> {
  readonly name = 'MCPManager' as const;
  readonly description: string = DESCRIPTION;
  readonly parameters: Record<string, unknown> = toInputJsonSchema(MCPManagerInputSchema);

  constructor(@ISessionMcpService private readonly sessionMcp: ISessionMcpService) {}

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
    switch (args.action) {
      case 'list_groups':
        return this.listGroups();
      case 'load_group':
        return this.loadGroup(args.group_name);
      case 'list_servers':
        return this.listServers();
      case 'load_server':
        return this.loadServer(args.server_name);
      case 'get_server':
        return this.getServer(args.server_name);
      case 'add_or_update_server':
        return this.addOrUpdateServer(args.server_name, args.config);
      case 'remove_server':
        return this.removeServer(args.server_name);
    }
  }

  private listGroups(): { output: string } {
    const groups = this.sessionMcp.listGroups();
    if (groups.length === 0) {
      return { output: 'No MCP groups are configured (mcpGroups missing from mcp.json).' };
    }
    const active = this.sessionMcp.activeGroup();
    const lines = groups.map((group) => {
      const serverNames = group.servers.join(', ');
      const prefixes = group.skillPrefixes.length > 0 ? ` [${group.skillPrefixes.join(', ')}]` : '';
      const state = group.name === active ? 'active' : group.loaded ? 'loaded' : 'not loaded';
      return `- ${group.name} (${state}): ${group.description ?? 'no description'}\n  servers: ${serverNames}${prefixes}`;
    });
    return { output: `Available MCP groups:\n${lines.join('\n')}` };
  }

  private async loadGroup(
    groupName: string | undefined,
  ): Promise<{ output: string; isError?: boolean }> {
    if (groupName === undefined || groupName.length === 0) {
      return { output: 'group_name is required for load_group.', isError: true };
    }
    try {
      await this.sessionMcp.loadGroup(groupName);
      return { output: `MCP group "${groupName}" loaded successfully.` };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      return { output: `Failed to load MCP group "${groupName}": ${message}`, isError: true };
    }
  }

  private listServers(): { output: string } {
    const servers = this.sessionMcp.connectionManager().list();
    if (servers.length === 0) {
      return { output: 'No MCP servers are configured.' };
    }
    return { output: formatServerList(servers) };
  }

  private async loadServer(
    serverName: string | undefined,
  ): Promise<{ output: string; isError?: boolean }> {
    if (serverName === undefined || serverName.length === 0) {
      return { output: 'server_name is required for load_server.', isError: true };
    }
    try {
      await this.sessionMcp.loadServer(serverName);
      return { output: `MCP server "${serverName}" loaded successfully.` };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      return { output: `Failed to load MCP server "${serverName}": ${message}`, isError: true };
    }
  }

  private getServer(serverName: string | undefined): { output: string; isError?: boolean } {
    if (serverName === undefined || serverName.length === 0) {
      return { output: 'server_name is required for get_server.', isError: true };
    }
    const server = this.sessionMcp.connectionManager().get(serverName);
    if (server === undefined) {
      return { output: `Unknown MCP server: ${serverName}`, isError: true };
    }
    return { output: formatServerEntry(server) };
  }

  private async addOrUpdateServer(
    serverName: string | undefined,
    rawConfig: Record<string, unknown> | undefined,
  ): Promise<{ output: string; isError?: boolean }> {
    if (serverName === undefined || serverName.length === 0) {
      return { output: 'server_name is required for add_or_update_server.', isError: true };
    }
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
      await this.sessionMcp.addOrUpdateServer(serverName, config);
      return { output: `MCP server "${serverName}" added/updated and connected successfully.` };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      return { output: `Failed to connect MCP server "${serverName}": ${message}`, isError: true };
    }
  }

  private async removeServer(
    serverName: string | undefined,
  ): Promise<{ output: string; isError?: boolean }> {
    if (serverName === undefined || serverName.length === 0) {
      return { output: 'server_name is required for remove_server.', isError: true };
    }
    const removed = await this.sessionMcp.removeServer(serverName);
    if (!removed) {
      return { output: `Unknown MCP server: ${serverName}`, isError: true };
    }
    return { output: `MCP server "${serverName}" removed successfully.` };
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

registerTool(MCPManagerTool, {
  when: (accessor) => accessor.get(IAgentScopeContext).agentId === 'main',
});
