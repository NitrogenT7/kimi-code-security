import { join } from 'pathe';
import { describe, expect, it } from 'vitest';

import type { Agent } from '../../src/agent';
import type { RunnableToolExecution } from '../../src/loop/types';
import { McpConnectionManager } from '../../src/mcp/connection-manager';
import type { McpServerEntry } from '../../src/mcp/connection-manager';
import { McpGroupRegistry } from '../../src/mcp/group-registry';
import { MCPManagerTool } from '../../src/tools/builtin/mcp/mcp-manager';
import { executeTool } from '../tools/fixtures/execute-tool';

const signal = new AbortController().signal;

function fakeAgent(manager?: Partial<McpConnectionManager>, registry?: McpGroupRegistry): Agent {
  return {
    type: 'main',
    mcp: manager as McpConnectionManager | undefined,
    mcpGroupRegistry: registry,
    mcpGroupMode: null,
    allowedSkillPrefixes: null,
  } as unknown as Agent;
}

function ctx<Input>(args: Input) {
  return { turnId: '0', toolCallId: 'call_1', args, signal };
}

function makeRegistry(): McpGroupRegistry {
  return new McpGroupRegistry(
    {
      web: { description: 'Web tools', servers: ['playwright'], skillPrefixes: ['web-'] },
      full: { description: 'All servers', servers: ['*'], skillPrefixes: ['*'] },
    },
    {
      playwright: { transport: 'stdio', command: 'echo' },
      semgrep: { transport: 'stdio', command: 'echo' },
    },
  );
}

describe('MCPManagerTool', () => {
  it('lists groups from the registry', async () => {
    const tool = new MCPManagerTool(fakeAgent(undefined, makeRegistry()));
    const result = await executeTool(tool, ctx({ action: 'list_groups' }));
    expect(result.isError).toBeFalsy();
    expect(result.output).toContain('web:');
    expect(result.output).toContain('playwright');
    expect(result.output).toContain('full:');
  });

  it('reports when no groups are configured', async () => {
    const tool = new MCPManagerTool(fakeAgent());
    const result = await executeTool(tool, ctx({ action: 'list_groups' }));
    expect(result.isError).toBeFalsy();
    expect(result.output).toContain('No MCP groups');
  });

  it('lists servers from the manager', async () => {
    const entries: McpServerEntry[] = [
      { name: 'playwright', transport: 'stdio', status: 'connected', toolCount: 3 },
      { name: 'remote', transport: 'http', status: 'failed', toolCount: 0, error: 'timeout' },
    ];
    const manager: Partial<McpConnectionManager> = { list: () => entries };
    const tool = new MCPManagerTool(fakeAgent(manager));
    const result = await executeTool(tool, ctx({ action: 'list_servers' }));
    expect(result.isError).toBeFalsy();
    expect(result.output).toContain('playwright: connected (stdio, 3 tools)');
    expect(result.output).toContain('remote: failed (http, 0 tools)');
    expect(result.output).toContain('error: timeout');
  });

  it('reports when no manager is available for list_servers', async () => {
    const tool = new MCPManagerTool(fakeAgent());
    const result = await executeTool(tool, ctx({ action: 'list_servers' }));
    expect(result.isError).toBeFalsy();
    expect(result.output).toContain('No MCP servers are configured');
  });

  it('loads a single known server', async () => {
    const manager: Partial<McpConnectionManager> = {
      get: (name: string) =>
        name === 'playwright'
          ? { name: 'playwright', transport: 'stdio', status: 'registered', toolCount: 0 }
          : undefined,
      reconnect: async (_name: string) => {},
    };
    const tool = new MCPManagerTool(fakeAgent(manager));
    const result = await executeTool(
      tool,
      ctx({ action: 'load_server', server_name: 'playwright' }),
    );
    expect(result.isError).toBeFalsy();
    expect(result.output).toBe('MCP server "playwright" loaded successfully.');
  });

  it('rejects load_server for an unknown server', async () => {
    const manager: Partial<McpConnectionManager> = {
      get: () => undefined,
    };
    const tool = new MCPManagerTool(fakeAgent(manager));
    const result = await executeTool(tool, ctx({ action: 'load_server', server_name: 'missing' }));
    expect(result.isError).toBeTruthy();
    expect(result.output).toContain('Unknown MCP server: missing');
  });

  it('rejects load_server without server_name', async () => {
    const tool = new MCPManagerTool(fakeAgent({}));
    const result = await executeTool(tool, ctx({ action: 'load_server' }));
    expect(result.isError).toBeTruthy();
    expect(result.output).toContain('server_name is required');
  });

  it('gets a single server status', async () => {
    const manager: Partial<McpConnectionManager> = {
      get: (name: string) =>
        name === 'remote'
          ? {
              name: 'remote',
              transport: 'http',
              status: 'needs-auth',
              toolCount: 0,
              error: 'please log in',
            }
          : undefined,
    };
    const tool = new MCPManagerTool(fakeAgent(manager));
    const result = await executeTool(tool, ctx({ action: 'get_server', server_name: 'remote' }));
    expect(result.isError).toBeFalsy();
    expect(result.output).toContain('remote:');
    expect(result.output).toContain('status: needs-auth');
    expect(result.output).toContain('transport: http');
    expect(result.output).toContain('error: please log in');
  });

  it('rejects get_server for an unknown server', async () => {
    const manager: Partial<McpConnectionManager> = {
      get: () => undefined,
    };
    const tool = new MCPManagerTool(fakeAgent(manager));
    const result = await executeTool(tool, ctx({ action: 'get_server', server_name: 'missing' }));
    expect(result.isError).toBeTruthy();
    expect(result.output).toContain('Unknown MCP server: missing');
  });

  it('adds or updates a server with a valid config', async () => {
    const connected: Array<{ name: string; config: unknown }> = [];
    const manager: Partial<McpConnectionManager> = {
      connect: async (name: string, config: unknown) => {
        connected.push({ name, config });
      },
    };
    const tool = new MCPManagerTool(fakeAgent(manager));
    const result = await executeTool(
      tool,
      ctx({
        action: 'add_or_update_server',
        server_name: 'new-server',
        config: { transport: 'stdio', command: 'node', args: ['server.js'] },
      }),
    );
    expect(result.isError).toBeFalsy();
    expect(result.output).toBe('MCP server "new-server" added/updated and connected successfully.');
    expect(connected).toHaveLength(1);
    expect(connected[0]!.name).toBe('new-server');
  });

  it('rejects add_or_update_server with an invalid config', async () => {
    const tool = new MCPManagerTool(fakeAgent({}));
    const result = await executeTool(
      tool,
      ctx({
        action: 'add_or_update_server',
        server_name: 'bad',
        config: { transport: 'unknown', url: 'not-a-url' },
      }),
    );
    expect(result.isError).toBeTruthy();
    expect(result.output).toContain('Invalid MCP server config');
  });

  it('rejects add_or_update_server without config', async () => {
    const tool = new MCPManagerTool(fakeAgent({}));
    const result = await executeTool(
      tool,
      ctx({ action: 'add_or_update_server', server_name: 'bad' }),
    );
    expect(result.isError).toBeTruthy();
    expect(result.output).toContain('config is required');
  });

  it('removes a known server', async () => {
    const removed: string[] = [];
    const manager: Partial<McpConnectionManager> = {
      remove: async (name: string) => {
        removed.push(name);
        return true;
      },
    };
    const tool = new MCPManagerTool(fakeAgent(manager));
    const result = await executeTool(tool, ctx({ action: 'remove_server', server_name: 'old' }));
    expect(result.isError).toBeFalsy();
    expect(result.output).toBe('MCP server "old" removed successfully.');
    expect(removed).toEqual(['old']);
  });

  it('rejects remove_server for an unknown server', async () => {
    const manager: Partial<McpConnectionManager> = {
      remove: async () => false,
    };
    const tool = new MCPManagerTool(fakeAgent(manager));
    const result = await executeTool(
      tool,
      ctx({ action: 'remove_server', server_name: 'missing' }),
    );
    expect(result.isError).toBeTruthy();
    expect(result.output).toContain('Unknown MCP server: missing');
  });

  it('describes actions in resolveExecution', () => {
    const tool = new MCPManagerTool(fakeAgent({}));
    const execution = tool.resolveExecution({
      action: 'add_or_update_server',
      server_name: 'x',
    }) as RunnableToolExecution;
    expect(execution.description).toBe('Adding/updating MCP server: x');
  });
});

describe('MCPManagerTool integration', () => {
  const stdioFixture = join(import.meta.dirname, 'fixtures', 'mock-stdio-server.mjs');

  function stdioConfig() {
    return { transport: 'stdio' as const, command: process.execPath, args: [stdioFixture] };
  }

  it('adds, queries, and removes a real stdio server', async () => {
    const manager = new McpConnectionManager();
    const tool = new MCPManagerTool(fakeAgent(manager));
    try {
      const addResult = await executeTool(
        tool,
        ctx({
          action: 'add_or_update_server',
          server_name: 'alpha',
          config: stdioConfig(),
        }),
      );
      expect(addResult.isError).toBeFalsy();
      expect(addResult.output).toContain('added/updated and connected');

      const getResult = await executeTool(
        tool,
        ctx({ action: 'get_server', server_name: 'alpha' }),
      );
      expect(getResult.isError).toBeFalsy();
      expect(getResult.output).toContain('status: connected');

      const listResult = await executeTool(tool, ctx({ action: 'list_servers' }));
      expect(listResult.isError).toBeFalsy();
      expect(listResult.output).toContain('alpha: connected');

      const removeResult = await executeTool(
        tool,
        ctx({ action: 'remove_server', server_name: 'alpha' }),
      );
      expect(removeResult.isError).toBeFalsy();
      expect(removeResult.output).toContain('removed');

      const getAfter = await executeTool(tool, ctx({ action: 'get_server', server_name: 'alpha' }));
      expect(getAfter.isError).toBeTruthy();
    } finally {
      await manager.shutdown();
    }
  }, 20_000);

  it('replaces a failed server config and reconnects', async () => {
    const manager = new McpConnectionManager();
    const tool = new MCPManagerTool(fakeAgent(manager));
    try {
      await executeTool(
        tool,
        ctx({
          action: 'add_or_update_server',
          server_name: 'flaky',
          config: { transport: 'stdio', command: '/no/such/binary' },
        }),
      );
      const failed = await executeTool(tool, ctx({ action: 'get_server', server_name: 'flaky' }));
      expect(failed.output).toContain('status: failed');

      await executeTool(
        tool,
        ctx({ action: 'add_or_update_server', server_name: 'flaky', config: stdioConfig() }),
      );
      const fixed = await executeTool(tool, ctx({ action: 'get_server', server_name: 'flaky' }));
      expect(fixed.output).toContain('status: connected');
    } finally {
      await manager.shutdown();
    }
  }, 20_000);
});
