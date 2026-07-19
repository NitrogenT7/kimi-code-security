/**
 * MCPManager tool — action coverage with a fake session MCP service.
 * Run: `pnpm --filter @moonshot-ai/agent-core-v2 exec vitest run test/agent/mcp/tools/manager.test.ts`.
 */

import { describe, expect, it } from 'vitest';

import type { ServicesAccessor } from '#/_base/di/instantiation';
import type { McpServerConfig } from '#/agent/mcp/config-schema';
import type { McpServerEntry } from '#/agent/mcp/connection-manager';
import { MCPManagerTool, type MCPManagerInput } from '#/agent/mcp/tools/manager';
import { getToolContributions } from '#/agent/toolRegistry/toolContribution';
import type { ISessionMcpService, McpGroupInfo } from '#/session/mcp/sessionMcp';
import type { ExecutableToolContext } from '#/tool/toolContract';

const EXEC_CTX = {
  turnId: 1,
  toolCallId: 'call-1',
  signal: new AbortController().signal,
} as unknown as ExecutableToolContext;

function serverEntry(
  name: string,
  status: McpServerEntry['status'],
  toolCount = 0,
): McpServerEntry {
  return { name, transport: 'stdio', status, toolCount };
}

interface FakeSessionMcpOptions {
  readonly groups?: readonly McpGroupInfo[];
  readonly servers?: readonly McpServerEntry[];
  readonly knownGroups?: readonly string[];
}

function fakeSessionMcp(options: FakeSessionMcpOptions = {}) {
  const servers = new Map((options.servers ?? []).map((entry) => [entry.name, entry]));
  const knownGroups = new Set(options.knownGroups ?? (options.groups ?? []).map((g) => g.name));
  const calls = {
    loadGroup: [] as string[],
    loadServer: [] as string[],
    addOrUpdateServer: [] as Array<{ name: string; config: McpServerConfig }>,
    removeServer: [] as string[],
  };
  const service: ISessionMcpService = {
    _serviceBrand: undefined,
    ensureMcpReady: () => Promise.resolve(),
    connectionManager: () =>
      ({
        list: () => [...servers.values()],
        get: (name: string) => servers.get(name),
      }) as unknown as ReturnType<ISessionMcpService['connectionManager']>,
    groupRegistry: () => undefined,
    listGroups: () => options.groups ?? [],
    loadGroup: (name: string) => {
      if (!knownGroups.has(name)) {
        return Promise.reject(new Error(`Unknown MCP group: ${name}`));
      }
      calls.loadGroup.push(name);
      return Promise.resolve();
    },
    loadServer: (name: string) => {
      if (!servers.has(name)) {
        return Promise.reject(new Error(`Unknown MCP server: ${name}`));
      }
      calls.loadServer.push(name);
      return Promise.resolve();
    },
    addOrUpdateServer: (name: string, config: McpServerConfig) => {
      calls.addOrUpdateServer.push({ name, config });
      servers.set(name, serverEntry(name, 'connected'));
      return Promise.resolve();
    },
    removeServer: (name: string) => {
      calls.removeServer.push(name);
      return Promise.resolve(servers.delete(name));
    },
    activeGroup: () => null,
    setGroupMode: () => {},
  };
  return { service, calls };
}

async function run(tool: MCPManagerTool, args: MCPManagerInput) {
  const execution = tool.resolveExecution(args);
  if (!('execute' in execution)) throw new Error('expected a runnable execution');
  return execution.execute(EXEC_CTX);
}

describe('MCPManagerTool', () => {
  it('list_groups reports when no groups are configured', async () => {
    const { service } = fakeSessionMcp();
    const tool = new MCPManagerTool(service);
    const result = await run(tool, { action: 'list_groups' });
    expect(result.isError).toBeUndefined();
    expect(result.output).toContain('No MCP groups are configured');
  });

  it('list_groups renders groups with servers and skill prefixes', async () => {
    const { service } = fakeSessionMcp({
      groups: [
        {
          name: 'android',
          description: 'Android reversing',
          servers: ['jadx', 'ida'],
          skillPrefixes: ['android-'],
          loaded: false,
        },
      ],
    });
    const tool = new MCPManagerTool(service);
    const result = await run(tool, { action: 'list_groups' });
    expect(result.output).toContain('android');
    expect(result.output).toContain('jadx, ida');
    expect(result.output).toContain('[android-]');
    expect(result.output).toContain('not loaded');
  });

  it('load_group requires group_name', async () => {
    const { service } = fakeSessionMcp();
    const tool = new MCPManagerTool(service);
    const result = await run(tool, { action: 'load_group' });
    expect(result.isError).toBe(true);
    expect(result.output).toContain('group_name is required');
  });

  it('load_group loads a known group', async () => {
    const { service, calls } = fakeSessionMcp({ knownGroups: ['web'] });
    const tool = new MCPManagerTool(service);
    const result = await run(tool, { action: 'load_group', group_name: 'web' });
    expect(result.isError).toBeUndefined();
    expect(calls.loadGroup).toEqual(['web']);
    expect(result.output).toContain('"web" loaded successfully');
  });

  it('load_group surfaces unknown group errors', async () => {
    const { service } = fakeSessionMcp();
    const tool = new MCPManagerTool(service);
    const result = await run(tool, { action: 'load_group', group_name: 'nope' });
    expect(result.isError).toBe(true);
    expect(result.output).toContain('Unknown MCP group: nope');
  });

  it('list_servers renders server status', async () => {
    const { service } = fakeSessionMcp({
      servers: [serverEntry('ida', 'connected', 12), serverEntry('gdb', 'registered')],
    });
    const tool = new MCPManagerTool(service);
    const result = await run(tool, { action: 'list_servers' });
    expect(result.output).toContain('ida: connected (stdio, 12 tools)');
    expect(result.output).toContain('gdb: registered');
  });

  it('list_servers reports when no servers are configured', async () => {
    const { service } = fakeSessionMcp();
    const tool = new MCPManagerTool(service);
    const result = await run(tool, { action: 'list_servers' });
    expect(result.output).toContain('No MCP servers are configured');
  });

  it('load_server loads a known server and rejects unknown ones', async () => {
    const { service, calls } = fakeSessionMcp({
      servers: [serverEntry('ida', 'registered')],
    });
    const tool = new MCPManagerTool(service);

    const ok = await run(tool, { action: 'load_server', server_name: 'ida' });
    expect(ok.isError).toBeUndefined();
    expect(calls.loadServer).toEqual(['ida']);

    const missing = await run(tool, { action: 'load_server', server_name: 'gdb' });
    expect(missing.isError).toBe(true);
    expect(missing.output).toContain('Unknown MCP server: gdb');
  });

  it('get_server shows one server and rejects unknown ones', async () => {
    const { service } = fakeSessionMcp({
      servers: [serverEntry('ida', 'connected', 4)],
    });
    const tool = new MCPManagerTool(service);

    const found = await run(tool, { action: 'get_server', server_name: 'ida' });
    expect(found.output).toContain('status: connected');
    expect(found.output).toContain('tools: 4');

    const missing = await run(tool, { action: 'get_server', server_name: 'gdb' });
    expect(missing.isError).toBe(true);
    expect(missing.output).toContain('Unknown MCP server: gdb');
  });

  it('add_or_update_server validates the config before connecting', async () => {
    const { service, calls } = fakeSessionMcp();
    const tool = new MCPManagerTool(service);

    const missing = await run(tool, { action: 'add_or_update_server', server_name: 'x' });
    expect(missing.isError).toBe(true);
    expect(missing.output).toContain('config is required');

    const invalid = await run(tool, {
      action: 'add_or_update_server',
      server_name: 'x',
      config: { transport: 'carrier-pigeon' },
    });
    expect(invalid.isError).toBe(true);
    expect(invalid.output).toContain('Invalid MCP server config');
    expect(calls.addOrUpdateServer).toHaveLength(0);

    const ok = await run(tool, {
      action: 'add_or_update_server',
      server_name: 'x',
      config: { transport: 'stdio', command: 'x-server' },
    });
    expect(ok.isError).toBeUndefined();
    expect(calls.addOrUpdateServer).toEqual([
      { name: 'x', config: { transport: 'stdio', command: 'x-server' } },
    ]);
  });

  it('remove_server removes known servers and rejects unknown ones', async () => {
    const { service, calls } = fakeSessionMcp({
      servers: [serverEntry('ida', 'registered')],
    });
    const tool = new MCPManagerTool(service);

    const removed = await run(tool, { action: 'remove_server', server_name: 'ida' });
    expect(removed.isError).toBeUndefined();
    expect(calls.removeServer).toEqual(['ida']);

    const missing = await run(tool, { action: 'remove_server', server_name: 'ida' });
    expect(missing.isError).toBe(true);
    expect(missing.output).toContain('Unknown MCP server: ida');
  });

  it('is registered for the main agent only', () => {
    const contribution = getToolContributions().find((entry) => entry.ctor === MCPManagerTool);
    expect(contribution).toBeDefined();
    const accessorFor = (agentId: string): ServicesAccessor =>
      ({ get: () => ({ agentId }) }) as unknown as ServicesAccessor;
    expect(contribution?.options.when?.(accessorFor('main'))).toBe(true);
    expect(contribution?.options.when?.(accessorFor('task-1'))).toBe(false);
  });
});
