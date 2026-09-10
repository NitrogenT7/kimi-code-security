import { describe, expect, it } from 'vitest';

import type { McpServerConfig } from '#/mcpCore/config-schema';
import { McpGroupRegistry } from '#/mcpCore/group-registry';

const servers: Record<string, McpServerConfig> = {
  jadx: { transport: 'stdio', command: 'npx' },
  ida: { transport: 'stdio', command: 'npx' },
  playwright: { transport: 'stdio', command: 'npx' },
};

function makeRegistry(): McpGroupRegistry {
  return new McpGroupRegistry(
    {
      android: { description: 'Android reversing', servers: ['jadx', 'ida'] },
      web: { servers: ['playwright', 'missing-server'] },
      full: { servers: ['*'] },
    },
    servers,
  );
}

describe('McpGroupRegistry', () => {
  it('lists every group with normalized fields', () => {
    const registry = makeRegistry();
    const entries = registry.list();
    expect(entries.map((entry) => entry.name).toSorted()).toEqual(['android', 'full', 'web']);
    const android = registry.get('android');
    expect(android?.description).toBe('Android reversing');
    expect(android?.skillPrefixes).toEqual([]);
    expect(registry.has('web')).toBe(true);
    expect(registry.has('nope')).toBe(false);
  });

  it('resolves explicit server lists verbatim, keeping unconfigured names visible', () => {
    const registry = makeRegistry();
    expect(registry.serversOfGroup('android')).toEqual(['jadx', 'ida']);
    expect(registry.serversOfGroup('web')).toEqual(['playwright', 'missing-server']);
    expect(registry.serversOfGroup('nope')).toBeUndefined();
  });

  it('expands "*" to every configured server', () => {
    const registry = makeRegistry();
    expect(registry.serversOfGroup('full')?.toSorted()).toEqual(['ida', 'jadx', 'playwright']);
  });

  it('maps a server back to its group, with "*" matching everything', () => {
    const registry = makeRegistry();
    expect(registry.groupOfServer('jadx')?.name).toBe('android');
    expect(registry.groupOfServer('playwright')?.name).toBe('web');
    const starOnly = new McpGroupRegistry({ full: { servers: ['*'] } }, { ...servers });
    expect(starOnly.groupOfServer('ida')?.name).toBe('full');
    expect(registry.groupOfServer('semgrep')?.name).toBe('full');
    const noStar = new McpGroupRegistry({ android: { servers: ['jadx'] } }, { ...servers });
    expect(noStar.groupOfServer('semgrep')).toBeUndefined();
  });
});
