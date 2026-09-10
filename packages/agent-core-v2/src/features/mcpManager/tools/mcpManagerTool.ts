import { toInputJsonSchema } from '#/tool/input-schema';
import { ToolAccesses, type ToolExecution } from '#/tool/toolContract';
import { ISessionMcpHandle } from '#/session/mcp/sessionMcpHandle';

import {
  IMcpManagerTool,
  MCP_MANAGER_TOOL_NAME,
  McpManagerInputSchema,
  type McpManagerInput,
} from './mcp-manager';
import DESCRIPTION from './mcp-manager.md?raw';

export class McpManagerTool implements IMcpManagerTool {
  declare readonly _serviceBrand: undefined;
  readonly name = MCP_MANAGER_TOOL_NAME;
  readonly description: string = DESCRIPTION;
  readonly parameters: Record<string, unknown> = toInputJsonSchema(McpManagerInputSchema);

  constructor(@ISessionMcpHandle private readonly mcp: ISessionMcpHandle) {}

  resolveExecution(args: McpManagerInput): ToolExecution {
    return {
      description: `MCPManager ${args.action}`,
      accesses: ToolAccesses.none(),
      approvalRule: this.name,
      execute: async () => this.run(args),
    };
  }

  private async run(args: McpManagerInput): Promise<{ isError: boolean; output: string }> {
    const handle = this.mcp;
    if (args.action === 'list_groups') {
      const groups = handle.listMcpGroups?.() ?? [];
      if (groups.length === 0) {
        return { isError: false, output: 'No MCP groups are declared in mcp.json.' };
      }
      const entries = handle.connectionManager.list();
      const lines = groups.map((group) => {
        const states = group.servers.map((server) => {
          const entry = entries.find((e) => e.name === server);
          return `${server}=${entry?.status ?? 'unknown'}`;
        });
        const description = group.description === undefined ? '' : ` — ${group.description}`;
        return `${group.name}${description}\n  ${states.join(', ')}`;
      });
      return { isError: false, output: lines.join('\n') };
    }

    if (args.action === 'load_group') {
      const groupName = args.group_name?.trim();
      if (groupName === undefined || groupName.length === 0) {
        return { isError: true, output: 'group_name is required for load_group.' };
      }
      if (handle.loadMcpGroup === undefined) {
        return { isError: true, output: 'MCP groups are not available in this session.' };
      }
      try {
        const outcomes = await handle.loadMcpGroup(groupName);
        const failed = outcomes.filter((o) => !o.ok);
        const summary = outcomes
          .map((o) => `${o.server}: ${o.ok ? 'connected' : `failed (${o.error ?? 'unknown'})`}`)
          .join('\n');
        return { isError: failed.length > 0, output: summary };
      } catch (error) {
        return {
          isError: true,
          output: error instanceof Error ? error.message : String(error),
        };
      }
    }

    if (args.action === 'list_servers') {
      const entries = handle.connectionManager.list();
      if (entries.length === 0) {
        return { isError: false, output: 'No MCP servers are configured.' };
      }
      const lines = entries.map(
        (entry) => `${entry.name} [${entry.transport}]: ${entry.status}${entry.error ? ` — ${entry.error}` : ''}`,
      );
      return { isError: false, output: lines.join('\n') };
    }

    if (args.action === 'get_server') {
      const serverName = args.server_name?.trim();
      if (serverName === undefined || serverName.length === 0) {
        return { isError: true, output: 'server_name is required for get_server.' };
      }
      const entry = handle.connectionManager.get(serverName);
      if (entry === undefined) {
        return { isError: true, output: `Unknown MCP server "${serverName}".` };
      }
      return {
        isError: false,
        output: `${entry.name} [${entry.transport}]: ${entry.status} (${entry.toolCount} tools)${entry.error ? ` — ${entry.error}` : ''}`,
      };
    }

    const serverName = args.server_name?.trim();
    if (serverName === undefined || serverName.length === 0) {
      return { isError: true, output: 'server_name is required for load_server.' };
    }
    const entry = handle.connectionManager.get(serverName);
    if (entry === undefined) {
      return { isError: true, output: `Unknown MCP server "${serverName}".` };
    }
    if (entry.status === 'connected') {
      return { isError: false, output: `${serverName} is already connected.` };
    }
    try {
      await handle.connectionManager.reconnectAndJoin(serverName);
      return { isError: false, output: `${serverName} connected.` };
    } catch (error) {
      return {
        isError: true,
        output: `Failed to connect ${serverName}: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }
}
