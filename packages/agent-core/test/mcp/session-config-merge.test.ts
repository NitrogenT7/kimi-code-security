import { describe, expect, it } from 'vitest';

import { mergeCallerMcpServers, type SessionMcpConfig } from '../../src/mcp/session-config';
import { McpGroupRegistry } from '../../src/mcp/group-registry';
import type { McpServerConfig } from '../../src/config/schema';

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
    const base: SessionMcpConfig = {
      servers: { fs: stdio('fs') },
      groups: {},
      groupRegistry: new McpGroupRegistry({}, { fs: stdio('fs') }),
    };
    expect(mergeCallerMcpServers(base, undefined)).toBe(base);
  });

  it('returns base unchanged when callerServers is empty', () => {
    const base: SessionMcpConfig = {
      servers: { fs: stdio('fs') },
      groups: {},
      groupRegistry: new McpGroupRegistry({}, { fs: stdio('fs') }),
    };
    expect(mergeCallerMcpServers(base, {})).toBe(base);
  });

  it('returns undefined when both base and callerServers are absent', () => {
    expect(mergeCallerMcpServers(undefined, undefined)).toBeUndefined();
    expect(mergeCallerMcpServers(undefined, {})).toBeUndefined();
  });

  it('promotes a caller-only payload into a fresh SessionMcpConfig when base is undefined', () => {
    const callerServers = { docs: http('https://mcp.example.com') };
    const result = mergeCallerMcpServers(undefined, callerServers);
    expect(result?.servers).toEqual({ docs: http('https://mcp.example.com') });
    expect(result?.groups).toEqual({});
    expect(result?.groupRegistry.list()).toEqual([]);
  });

  it('layers caller on top of base with caller winning on key collision', () => {
    const base: SessionMcpConfig = {
      servers: {
        shared: stdio('disk-version'),
        diskOnly: stdio('disk-only'),
      },
      groups: {},
      groupRegistry: new McpGroupRegistry({}, {
        shared: stdio('disk-version'),
        diskOnly: stdio('disk-only'),
      }),
    };
    const callerServers = {
      shared: stdio('caller-version'),
      callerOnly: http('https://caller.example.com'),
    };
    const result = mergeCallerMcpServers(base, callerServers);
    expect(result?.servers).toEqual({
      shared: stdio('caller-version'),
      diskOnly: stdio('disk-only'),
      callerOnly: http('https://caller.example.com'),
    });
    expect(result?.groupRegistry.list()).toEqual([]);
  });

  it('keeps base groups and exposes caller servers through the updated registry', () => {
    const base: SessionMcpConfig = {
      servers: { fs: stdio('fs') },
      groups: { reverse: { servers: ['fs'], skillPrefixes: ['fs-'] } },
      groupRegistry: new McpGroupRegistry(
        { reverse: { servers: ['fs'], skillPrefixes: ['fs-'] } },
        { fs: stdio('fs') },
      ),
    };
    const callerServers = { docs: http('https://mcp.example.com') };
    const result = mergeCallerMcpServers(base, callerServers);
    expect(result?.groups).toEqual({ reverse: { servers: ['fs'], skillPrefixes: ['fs-'] } });
    expect(result?.groupRegistry.get('reverse')?.servers).toEqual(['fs']);
    expect(result?.groupRegistry.resolveServers('reverse')).toEqual({
      fs: stdio('fs'),
    });
    expect(result?.servers).toEqual({
      fs: stdio('fs'),
      docs: http('https://mcp.example.com'),
    });
  });
});
