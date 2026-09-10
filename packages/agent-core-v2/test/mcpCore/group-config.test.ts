import { mkdtempSync } from 'node:fs';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'pathe';
import { afterEach, describe, expect, it } from 'vitest';

import { ErrorCodes, Error2 } from '#/errors';
import { loadMcpGroups } from '#/mcpCore/group-config';
import { HostFileSystem } from '#/os/backends/node-local/hostFsService';

const fs = new HostFileSystem();

const tempDirs: string[] = [];

afterEach(async () => {
  for (const dir of tempDirs.splice(0)) {
    await rm(dir, { recursive: true, force: true });
  }
});

function makeTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'kimi-mcp-groups-'));
  tempDirs.push(dir);
  return dir;
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await mkdir(join(path, '..'), { recursive: true });
  await writeFile(path, JSON.stringify(value), 'utf-8');
}

describe('loadMcpGroups', () => {
  it('returns an empty map when no files exist', async () => {
    const home = makeTempDir();
    const cwd = makeTempDir();
    const groups = await loadMcpGroups({ fs, cwd, homeDir: home });
    expect(groups).toEqual({});
  });

  it('parses mcpGroups from the user file', async () => {
    const home = makeTempDir();
    const cwd = makeTempDir();
    await writeJson(join(home, 'mcp.json'), {
      mcpServers: { jadx: { command: 'npx', args: ['jadx-mcp'] } },
      mcpGroups: {
        android: { description: 'Android reversing', servers: ['jadx'], skillPrefixes: ['apk-'] },
      },
    });
    const groups = await loadMcpGroups({ fs, cwd, homeDir: home });
    expect(groups).toEqual({
      android: { description: 'Android reversing', servers: ['jadx'], skillPrefixes: ['apk-'] },
    });
  });

  it('ignores files without an mcpGroups section', async () => {
    const home = makeTempDir();
    const cwd = makeTempDir();
    await writeJson(join(home, 'mcp.json'), {
      mcpServers: { jadx: { command: 'npx' } },
    });
    const groups = await loadMcpGroups({ fs, cwd, homeDir: home });
    expect(groups).toEqual({});
  });

  it('lets the project layer override the user layer per group name', async () => {
    const home = makeTempDir();
    const repoRoot = makeTempDir();
    await mkdir(join(repoRoot, '.git'), { recursive: true });
    await writeJson(join(home, 'mcp.json'), {
      mcpGroups: {
        web: { servers: ['playwright'] },
        audit: { servers: ['semgrep'] },
      },
    });
    await writeJson(join(repoRoot, '.mcp.json'), {
      mcpGroups: {
        web: { servers: ['chrome-devtools'] },
      },
    });
    const groups = await loadMcpGroups({ fs, cwd: repoRoot, homeDir: home });
    expect(groups).toEqual({
      web: { servers: ['chrome-devtools'] },
      audit: { servers: ['semgrep'] },
    });
  });

  it('reads only the user file when includeProject is false', async () => {
    const home = makeTempDir();
    const cwd = makeTempDir();
    await writeJson(join(home, 'mcp.json'), { mcpGroups: { web: { servers: ['playwright'] } } });
    await writeJson(join(cwd, '.mcp.json'), { mcpGroups: { audit: { servers: ['semgrep'] } } });
    const groups = await loadMcpGroups({ fs, cwd, homeDir: home, includeProject: false });
    expect(groups).toEqual({ web: { servers: ['playwright'] } });
  });

  it('rejects a group with no servers', async () => {
    const home = makeTempDir();
    const cwd = makeTempDir();
    await writeJson(join(home, 'mcp.json'), { mcpGroups: { bad: { servers: [] } } });
    const error = await loadMcpGroups({ fs, cwd, homeDir: home }).catch((error: unknown) => error);
    expect(error).toBeInstanceOf(Error2);
    expect((error as Error2).code).toBe(ErrorCodes.CONFIG_INVALID);
    expect((error as Error2).message).toContain('"bad"');
  });

  it('rejects a non-object mcpGroups section', async () => {
    const home = makeTempDir();
    const cwd = makeTempDir();
    await writeJson(join(home, 'mcp.json'), { mcpGroups: ['not-an-object'] });
    const error = await loadMcpGroups({ fs, cwd, homeDir: home }).catch((error: unknown) => error);
    expect(error).toBeInstanceOf(Error2);
    expect((error as Error2).code).toBe(ErrorCodes.CONFIG_INVALID);
  });

  it('rejects invalid JSON', async () => {
    const home = makeTempDir();
    const cwd = makeTempDir();
    await writeFile(join(home, 'mcp.json'), '{ not json', 'utf-8');
    const error = await loadMcpGroups({ fs, cwd, homeDir: home }).catch((error: unknown) => error);
    expect(error).toBeInstanceOf(Error2);
    expect((error as Error2).code).toBe(ErrorCodes.CONFIG_INVALID);
  });
});
