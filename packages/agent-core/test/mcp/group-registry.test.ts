import { describe, expect, it } from 'vitest';

import type { McpServerConfig } from '../../src/config/schema';
import { McpGroupRegistry } from '../../src/mcp/group-registry';

const stdio = (command: string): McpServerConfig => ({
  transport: 'stdio',
  command,
});

const http = (url: string): McpServerConfig => ({
  transport: 'http',
  url,
});

describe('McpGroupRegistry', () => {
  const servers: Record<string, McpServerConfig> = {
    ida: stdio('ida'),
    jadx: stdio('jadx'),
    semgrep: http('https://semgrep.example.com'),
  };

  it('lists all defined groups', () => {
    const registry = new McpGroupRegistry(
      {
        android: { servers: ['ida', 'jadx'] },
        audit: { servers: ['semgrep'], skillPrefixes: ['audit-'] },
      },
      servers,
    );
    const names = registry
      .list()
      .map((g) => g.name)
      .toSorted();
    expect(names).toEqual(['android', 'audit']);
  });

  it('returns undefined for unknown groups', () => {
    const registry = new McpGroupRegistry({}, servers);
    expect(registry.get('missing')).toBeUndefined();
    expect(registry.resolveServers('missing')).toBeUndefined();
  });

  it('resolves concrete server references', () => {
    const registry = new McpGroupRegistry({ android: { servers: ['ida', 'jadx'] } }, servers);
    expect(registry.resolveServers('android')).toEqual({
      ida: servers['ida']!,
      jadx: servers['jadx']!,
    });
  });

  it('expands the wildcard server reference', () => {
    const registry = new McpGroupRegistry(
      { full: { servers: ['*'], skillPrefixes: ['*'] } },
      servers,
    );
    expect(registry.resolveServers('full')).toEqual(servers);
  });

  it('silently drops unknown server references', () => {
    const registry = new McpGroupRegistry({ mixed: { servers: ['ida', 'missing'] } }, servers);
    expect(registry.resolveServers('mixed')).toEqual({ ida: servers['ida']! });
  });

  it('returns skill prefixes for a group', () => {
    const registry = new McpGroupRegistry(
      { audit: { servers: ['semgrep'], skillPrefixes: ['audit-', 'security-'] } },
      servers,
    );
    expect(registry.skillPrefixes('audit')).toEqual(['audit-', 'security-']);
  });

  it('returns empty skill prefixes when none are defined', () => {
    const registry = new McpGroupRegistry({ android: { servers: ['ida'] } }, servers);
    expect(registry.skillPrefixes('android')).toEqual([]);
  });
});
