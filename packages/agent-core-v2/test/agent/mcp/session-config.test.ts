import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  mergeCallerMcpServers,
  partitionServersByGroup,
  resolveSessionMcpConfig,
  type SessionMcpConfig,
} from '#/agent/mcp/session-config';
import { McpGroupRegistry } from '#/agent/mcp/group-registry';
import type { McpServerConfig } from '#/agent/mcp/config-schema';

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

const http = (url: string): McpServerConfig => ({
  transport: 'http',
  url,
});

describe('mergeCallerMcpServers', () => {
  it('returns base unchanged when callerServers is undefined', () => {
    const base: SessionMcpConfig = { servers: { fs: stdio('fs') } };
    expect(mergeCallerMcpServers(base, undefined)).toBe(base);
  });

  it('returns base unchanged when callerServers is empty', () => {
    const base: SessionMcpConfig = { servers: { fs: stdio('fs') } };
    expect(mergeCallerMcpServers(base, {})).toBe(base);
  });

  it('returns undefined when both base and callerServers are absent', () => {
    expect(mergeCallerMcpServers(undefined, undefined)).toBeUndefined();
    expect(mergeCallerMcpServers(undefined, {})).toBeUndefined();
  });

  it('promotes a caller-only payload into a fresh SessionMcpConfig when base is undefined', () => {
    const callerServers = { docs: http('https://mcp.example.com') };
    expect(mergeCallerMcpServers(undefined, callerServers)).toEqual({
      servers: { docs: http('https://mcp.example.com') },
    });
  });

  it('layers caller on top of base with caller winning on key collision', () => {
    const base: SessionMcpConfig = {
      servers: {
        shared: stdio('disk-version'),
        diskOnly: stdio('disk-only'),
      },
    };
    const callerServers = {
      shared: stdio('caller-version'),
      callerOnly: http('https://caller.example.com'),
    };
    expect(mergeCallerMcpServers(base, callerServers)).toEqual({
      servers: {
        shared: stdio('caller-version'),
        diskOnly: stdio('disk-only'),
        callerOnly: http('https://caller.example.com'),
      },
    });
  });
});

describe('partitionServersByGroup', () => {
  const servers: Record<string, McpServerConfig> = {
    ida: stdio('ida'),
    jadx: stdio('jadx'),
    standalone: http('https://standalone.example.com'),
  };

  it('marks everything eager when no registry is provided', () => {
    expect(partitionServersByGroup(servers, undefined)).toEqual({ eager: servers, lazy: {} });
  });

  it('marks everything eager when the registry has no groups', () => {
    const registry = new McpGroupRegistry({}, servers);
    expect(partitionServersByGroup(servers, registry)).toEqual({ eager: servers, lazy: {} });
  });

  it('defers only servers claimed by a group', () => {
    const registry = new McpGroupRegistry({ android: { servers: ['ida', 'jadx'] } }, servers);
    expect(partitionServersByGroup(servers, registry)).toEqual({
      eager: { standalone: servers['standalone'] },
      lazy: { ida: servers['ida'], jadx: servers['jadx'] },
    });
  });

  it('defers every server when a group references the wildcard', () => {
    const registry = new McpGroupRegistry({ full: { servers: ['*'] } }, servers);
    expect(partitionServersByGroup(servers, registry)).toEqual({ eager: {}, lazy: servers });
  });

  it('ignores group references to unknown servers', () => {
    const registry = new McpGroupRegistry({ android: { servers: ['ida', 'missing'] } }, servers);
    expect(partitionServersByGroup(servers, registry)).toEqual({
      eager: { jadx: servers['jadx'], standalone: servers['standalone'] },
      lazy: { ida: servers['ida'] },
    });
  });
});

describe('resolveSessionMcpConfig', () => {
  it('degrades to no groups when mcpGroups is invalid, keeping servers loadable', async () => {
    const homeDir = await mkdtemp(join(tmpdir(), 'kimi-mcp-cfg-home-'));
    const cwd = await mkdtemp(join(tmpdir(), 'kimi-mcp-cfg-work-'));
    tempDirs.push(homeDir, cwd);
    await writeFile(
      join(homeDir, 'mcp.json'),
      JSON.stringify({
        mcpServers: { fs: { transport: 'stdio', command: 'fs' } },
        // Invalid: a group must reference at least one server.
        mcpGroups: { broken: { servers: [] } },
      }),
      'utf-8',
    );

    const config = await resolveSessionMcpConfig({ cwd, homeDir });

    expect(config?.groupConfigError).toBeDefined();
    expect(config?.servers['fs']).toBeDefined();
    expect(config?.groups).toEqual({});
    // With no groups every server falls back to eager loading.
    const { eager, lazy } = partitionServersByGroup(config!.servers, config!.groupRegistry);
    expect(Object.keys(eager)).toEqual(['fs']);
    expect(lazy).toEqual({});
  });

  it('loads groups normally when the config is valid', async () => {
    const homeDir = await mkdtemp(join(tmpdir(), 'kimi-mcp-cfg-home-'));
    const cwd = await mkdtemp(join(tmpdir(), 'kimi-mcp-cfg-work-'));
    tempDirs.push(homeDir, cwd);
    await writeFile(
      join(homeDir, 'mcp.json'),
      JSON.stringify({
        mcpServers: { fs: { transport: 'stdio', command: 'fs' } },
        mcpGroups: { audit: { servers: ['fs'] } },
      }),
      'utf-8',
    );

    const config = await resolveSessionMcpConfig({ cwd, homeDir });

    expect(config?.groupConfigError).toBeUndefined();
    expect(Object.keys(config?.groups ?? {})).toEqual(['audit']);
  });
});
