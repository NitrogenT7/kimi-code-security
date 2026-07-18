import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';

import { join } from 'pathe';
import { beforeEach, describe, expect, it } from 'vitest';

import { generateDefaultMcpGroups, loadMcpGroups } from '#/agent/mcp/group-config';

describe('generateDefaultMcpGroups', () => {
  it('creates no groups when there are no servers', () => {
    expect(generateDefaultMcpGroups([])).toEqual({});
  });

  it('always creates the full wildcard group when servers exist', () => {
    const groups = generateDefaultMcpGroups(['semgrep']);
    expect(groups['full']).toEqual({
      description: '全量模式（所有服务器）',
      servers: ['*'],
      skillPrefixes: ['*'],
    });
  });

  it('creates the android group when android servers are present', () => {
    const groups = generateDefaultMcpGroups(['ida', 'jadx', 'semgrep']);
    expect(groups['android']).toEqual({
      description: '移动安全组：APK反编译 + 二进制逆向 + WebView调试 + ADB设备控制 + Frida动态插桩',
      servers: ['ida', 'jadx'],
      skillPrefixes: ['android-', 'apk-', 'audit-'],
    });
    expect(groups['web']).toBeUndefined();
    expect(groups['binary']).toEqual({
      description: '桌面二进制逆向：IDA静态分析 + GDB动态调试 + Frida插桩',
      servers: ['ida'],
      skillPrefixes: ['binary-', 'audit-', 'code-'],
    });
  });

  it('creates the web group when web servers are present', () => {
    const groups = generateDefaultMcpGroups(['playwright', 'semgrep']);
    expect(groups['web']).toEqual({
      description: 'Web挖洞组：浏览器自动化 + 深度调试 + JS逆向 + 云端渗透',
      servers: ['playwright'],
      skillPrefixes: ['web-', 'cloud-', 'audit-'],
    });
  });
});

describe('loadMcpGroups', () => {
  let cwd: string;
  let homeDir: string;

  beforeEach(async () => {
    cwd = await mkdtemp(join(tmpdir(), 'mcp-groups-cwd-'));
    homeDir = await mkdtemp(join(tmpdir(), 'mcp-groups-home-'));
    await mkdir(join(cwd, '.git'));
    await mkdir(join(cwd, '.kimi-code'));
  });

  it('returns default groups when only servers are configured', async () => {
    await writeFile(
      join(cwd, '.kimi-code', 'mcp.json'),
      JSON.stringify({ mcpServers: { ida: { transport: 'stdio', command: 'ida' } } }),
    );
    const groups = await loadMcpGroups({ cwd, homeDir });
    expect(groups['full']).toBeDefined();
    expect(groups['android']).toBeDefined();
  });

  it('merges explicit groups from all three locations with later files winning', async () => {
    await writeFile(
      join(homeDir, 'mcp.json'),
      JSON.stringify({ mcpGroups: { shared: { servers: ['a'] } } }),
    );
    await writeFile(
      join(cwd, '.mcp.json'),
      JSON.stringify({ mcpGroups: { shared: { servers: ['b'] }, root: { servers: ['c'] } } }),
    );
    await writeFile(
      join(cwd, '.kimi-code', 'mcp.json'),
      JSON.stringify({ mcpGroups: { local: { servers: ['d'] } } }),
    );

    const groups = await loadMcpGroups({ cwd, homeDir });
    expect(groups['shared']?.servers).toEqual(['b']);
    expect(groups['root']?.servers).toEqual(['c']);
    expect(groups['local']?.servers).toEqual(['d']);
  });

  it('does not generate defaults when explicit groups exist', async () => {
    await writeFile(
      join(cwd, '.kimi-code', 'mcp.json'),
      JSON.stringify({
        mcpServers: { ida: { transport: 'stdio', command: 'ida' } },
        mcpGroups: { custom: { servers: ['ida'] } },
      }),
    );
    const groups = await loadMcpGroups({ cwd, homeDir });
    expect(groups['custom']).toBeDefined();
    expect(groups['full']).toBeUndefined();
  });
});
