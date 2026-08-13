import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import type { McpConnectionManager } from '#/agent/mcp/connection-manager';
import { McpGroupRegistry } from '#/agent/mcp/group-registry';
import type { McpServerConfig } from '#/agent/mcp/config-schema';
import { SessionMcpService } from '#/session/mcp/sessionMcpService';

const tempDirs: string[] = [];

afterEach(async () => {
  for (const dir of tempDirs.splice(0)) {
    await rm(dir, { recursive: true, force: true });
  }
});

const stdio = (command: string): McpServerConfig => ({
  transport: 'stdio',
  command,
});

interface FakeEntry {
  readonly status: 'connected' | 'failed' | 'needs-auth' | 'registered';
  readonly error?: string;
}

function makeService(entries: Record<string, FakeEntry>): SessionMcpService {
  const manager = {
    loadGroup: () => Promise.resolve(),
    get: (name: string) =>
      entries[name] === undefined ? undefined : { name, ...entries[name] },
    list: () => Object.entries(entries).map(([name, entry]) => ({ name, ...entry })),
  };
  const service = new SessionMcpService(
    { homeDir: tmpdir() } as never,
    { workDir: tmpdir() } as never,
    { enabledMcpServers: () => Promise.resolve({}) } as never,
    {} as never,
    { warn: () => {}, error: () => {} } as never,
    { track2: () => {} } as never,
  );
  (service as unknown as { mcpManager: unknown }).mcpManager =
    manager as unknown as McpConnectionManager;
  (service as unknown as { mcpGroupRegistry: unknown }).mcpGroupRegistry =
    new McpGroupRegistry({ web: { servers: Object.keys(entries) } }, mapEntriesToConfigs(entries));
  // Skip the initial file-config load so the injected registry/manager survive.
  (service as unknown as { mcpInitialLoad: unknown }).mcpInitialLoad = Promise.resolve();
  return service;
}

function mapEntriesToConfigs(entries: Record<string, FakeEntry>): Record<string, McpServerConfig> {
  const configs: Record<string, McpServerConfig> = {};
  for (const name of Object.keys(entries)) {
    configs[name] = stdio(name);
  }
  return configs;
}

describe('SessionMcpService.loadGroup', () => {
  it('reports per-server outcomes and marks the group active on partial success', async () => {
    const service = makeService({
      playwright: { status: 'connected' },
      jshook: { status: 'failed', error: 'spawn npx ENOENT' },
    });

    const result = await service.loadGroup('web');

    expect(result.connected).toEqual(['playwright']);
    expect(result.failed).toEqual([{ name: 'jshook', error: 'spawn npx ENOENT' }]);
    expect(result.needsAuth).toEqual([]);
    expect(service.activeGroup()).toBe('web');
    // Not every server is connected, so the group is not fully loaded.
    expect(service.listGroups().find((group) => group.name === 'web')?.loaded).toBe(false);
  });

  it('does not mark the group active when every server fails', async () => {
    const service = makeService({
      playwright: { status: 'failed', error: 'spawn npx ENOENT' },
      jshook: { status: 'failed', error: 'connection closed' },
    });

    const result = await service.loadGroup('web');

    expect(result.connected).toEqual([]);
    expect(result.failed).toHaveLength(2);
    expect(service.activeGroup()).toBeNull();
  });

  it('reports needs-auth servers separately from failures', async () => {
    const service = makeService({
      playwright: { status: 'connected' },
      jshook: { status: 'needs-auth' },
    });

    const result = await service.loadGroup('web');

    expect(result.connected).toEqual(['playwright']);
    expect(result.needsAuth).toEqual(['jshook']);
    expect(result.failed).toEqual([]);
  });

  it('throws for unknown groups', async () => {
    const service = makeService({ playwright: { status: 'connected' } });
    await expect(service.loadGroup('nope')).rejects.toThrow('Unknown MCP group: nope');
  });

  it('marks the group loaded only when every server is connected', async () => {
    const service = makeService({
      playwright: { status: 'connected' },
      jshook: { status: 'connected' },
    });

    const result = await service.loadGroup('web');

    expect(result.failed).toEqual([]);
    expect(service.activeGroup()).toBe('web');
    expect(service.listGroups().find((group) => group.name === 'web')?.loaded).toBe(true);
  });
});
