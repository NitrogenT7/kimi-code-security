import { describe, expect, it } from 'vitest';

import {
  mergeCallerMcpServers,
  partitionServersByGroup,
  type SessionMcpConfig,
} from '#/agent/mcp/session-config';
import { McpGroupRegistry } from '#/agent/mcp/group-registry';
import type { McpServerConfig } from '#/agent/mcp/config-schema';

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
