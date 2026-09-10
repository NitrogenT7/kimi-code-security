import { z } from 'zod';

import { createDecorator } from '#/_base/di/instantiation';
import { type AgentTool } from '#/tool/toolContract';

export const MCP_MANAGER_TOOL_NAME = 'MCPManager' as const;

export const McpManagerInputSchema = z.object({
  action: z
    .enum(['list_groups', 'load_group', 'list_servers', 'load_server', 'get_server'])
    .describe('Management action to perform.'),
  group_name: z.string().optional().describe('Required when action is load_group.'),
  server_name: z
    .string()
    .optional()
    .describe('Required when action is load_server or get_server.'),
});

export type McpManagerInput = z.infer<typeof McpManagerInputSchema>;

export interface IMcpManagerTool extends AgentTool<McpManagerInput> {
  readonly _serviceBrand: undefined;
}

export const IMcpManagerTool = createDecorator<IMcpManagerTool>('mcpManagerTool');
