import { Feature } from '#/features/feature';
import { registerFeature } from '#/features/featureRegistry';

import { IMcpManagerTool, MCP_MANAGER_TOOL_NAME } from './tools/mcp-manager';
import { McpManagerTool } from './tools/mcpManagerTool';

export class McpManagerFeature extends Feature {
  static override readonly name = 'mcpManager';

  constructor() {
    super();
    this.contributeTool(IMcpManagerTool, McpManagerTool, {
      name: MCP_MANAGER_TOOL_NAME,
      domain: 'mcpManager',
    });
  }
}

registerFeature(McpManagerFeature);
