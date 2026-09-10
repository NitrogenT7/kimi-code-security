import { describe, expect, it } from 'vitest';

import type { McpServerEntry } from '#/mcpCore/connection-manager';
import { McpManagerTool } from '#/features/mcpManager/tools/mcpManagerTool';
import type { ISessionMcpHandle } from '#/session/mcp/sessionMcpHandle';

function serverEntry(name: string, status: McpServerEntry['status']): McpServerEntry {
  return {
    name,
    transport: 'stdio',
    status,
    toolCount: status === 'connected' ? 3 : 0,
    tools: [],
    rawTools: [],
    enabledNames: new Set<string>(),
  } as McpServerEntry;
}

interface HandleSpec {
  readonly groups?: ISessionMcpHandle['listMcpGroups'];
  readonly load?: ISessionMcpHandle['loadMcpGroup'];
  readonly entries?: readonly McpServerEntry[];
  readonly reconnectAndJoin?: (name: string) => Promise<void>;
}

function makeTool(spec: HandleSpec): McpManagerTool {
  const entries = spec.entries ?? [];
  const handle: ISessionMcpHandle = {
    _serviceBrand: undefined,
    ready: Promise.resolve(),
    connectionManager: {
      oauthService: undefined,
      list: () => entries,
      get: (name: string) => entries.find((entry) => entry.name === name),
      resolved: () => undefined,
      getRemoteServerUrl: () => undefined,
      reconnect: () => Promise.resolve(),
      reconnectAndJoin: spec.reconnectAndJoin ?? (() => Promise.resolve()),
      waitForInitialLoad: () => Promise.resolve(),
      initialLoadDurationMs: () => 0,
      onStatusChange: () => () => undefined,
    },
    isBaselineServer: () => true,
    listMcpGroups: spec.groups,
    loadMcpGroup: spec.load,
  };
  return new McpManagerTool(handle);
}

async function run(
  tool: McpManagerTool,
  args: Parameters<McpManagerTool['resolveExecution']>[0],
): Promise<{ isError: boolean; output: string }> {
  const execution = tool.resolveExecution(args);
  if (!('execute' in execution)) {
    return { isError: true, output: JSON.stringify(execution.output) };
  }
  const result = await execution.execute({
    turnId: 0,
    toolCallId: 'test-call',
    signal: new AbortController().signal,
  });
  return {
    isError: result.isError === true,
    output: typeof result.output === 'string' ? result.output : JSON.stringify(result.output),
  };
}

describe('McpManagerTool', () => {
  it('reports when no groups are declared', async () => {
    const tool = makeTool({ groups: () => [] });
    const result = await run(tool, { action: 'list_groups' });
    expect(result.isError).toBe(false);
    expect(result.output).toContain('No MCP groups');
  });

  it('lists groups with per-server connection states', async () => {
    const tool = makeTool({
      groups: () => [
        {
          name: 'android',
          description: 'Android reversing',
          servers: ['jadx', 'ida'],
          skillPrefixes: [],
          loaded: false,
        },
      ],
      entries: [serverEntry('jadx', 'registered'), serverEntry('ida', 'connected')],
    });
    const result = await run(tool, { action: 'list_groups' });
    expect(result.isError).toBe(false);
    expect(result.output).toContain('android — Android reversing');
    expect(result.output).toContain('jadx=registered');
    expect(result.output).toContain('ida=connected');
  });

  it('requires group_name for load_group', async () => {
    const tool = makeTool({ load: () => Promise.resolve([]) });
    const result = await run(tool, { action: 'load_group' });
    expect(result.isError).toBe(true);
    expect(result.output).toContain('group_name is required');
  });

  it('rejects load_group when the session has no group support', async () => {
    const tool = makeTool({});
    const result = await run(tool, { action: 'load_group', group_name: 'web' });
    expect(result.isError).toBe(true);
    expect(result.output).toContain('not available');
  });

  it('summarizes per-server load outcomes', async () => {
    const tool = makeTool({
      load: (name: string) => {
        expect(name).toBe('web');
        return Promise.resolve([
          { server: 'playwright', ok: true },
          { server: 'chrome-devtools', ok: false, error: 'spawn failed' },
        ]);
      },
    });
    const result = await run(tool, { action: 'load_group', group_name: 'web' });
    expect(result.isError).toBe(true);
    expect(result.output).toContain('playwright: connected');
    expect(result.output).toContain('chrome-devtools: failed (spawn failed)');
  });

  it('lists servers and reads a single server', async () => {
    const tool = makeTool({ entries: [serverEntry('jadx', 'connected')] });
    const list = await run(tool, { action: 'list_servers' });
    expect(list.output).toContain('jadx [stdio]: connected');
    const get = await run(tool, { action: 'get_server', server_name: 'jadx' });
    expect(get.output).toContain('jadx [stdio]: connected (3 tools)');
    const missing = await run(tool, { action: 'get_server', server_name: 'nope' });
    expect(missing.isError).toBe(true);
  });

  it('short-circuits load_server on an already connected server', async () => {
    let reconnects = 0;
    const tool = makeTool({
      entries: [serverEntry('jadx', 'connected')],
      reconnectAndJoin: () => {
        reconnects++;
        return Promise.resolve();
      },
    });
    const result = await run(tool, { action: 'load_server', server_name: 'jadx' });
    expect(result.isError).toBe(false);
    expect(result.output).toContain('already connected');
    expect(reconnects).toBe(0);
  });

  it('connects a registered server via reconnectAndJoin', async () => {
    const reconnected: string[] = [];
    const tool = makeTool({
      entries: [serverEntry('jadx', 'registered')],
      reconnectAndJoin: (name) => {
        reconnected.push(name);
        return Promise.resolve();
      },
    });
    const result = await run(tool, { action: 'load_server', server_name: 'jadx' });
    expect(result.isError).toBe(false);
    expect(result.output).toContain('jadx connected');
    expect(reconnected).toEqual(['jadx']);
  });
});
