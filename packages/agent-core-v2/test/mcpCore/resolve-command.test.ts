import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'pathe';
import { describe, expect, it } from 'vitest';

import { resolveStdioCommand } from '#/mcpCore/resolve-command';

const win32 = process.platform === 'win32';

function makeBinDir(entries: readonly string[]): string {
  const dir = mkdtempSync(join(tmpdir(), 'mcp-cmd-resolve-'));
  for (const name of entries) {
    writeFileSync(join(dir, name), 'x');
  }
  return dir;
}

function options(overrides: {
  readonly win32?: boolean;
  readonly cwd?: string;
  readonly env?: Record<string, string>;
}): Parameters<typeof resolveStdioCommand>[1] {
  return {
    win32: overrides.win32 ?? win32,
    cwd: overrides.cwd ?? process.cwd(),
    env: overrides.env ?? {},
  };
}

describe('resolveStdioCommand', () => {
  it('passes absolute paths through verbatim', () => {
    const abs = win32 ? 'C:\\tools\\server.exe' : '/usr/local/bin/server';
    expect(resolveStdioCommand(abs, options({})).command).toBe(abs);
  });

  it('keeps the raw command and shell=false when nothing resolves', () => {
    const result = resolveStdioCommand('definitely-not-a-real-cmd-9f8d', options({ env: {} }));
    expect(result).toEqual({ command: 'definitely-not-a-real-cmd-9f8d', shell: false });
  });

  it('resolves a bare name through PATH on posix', () => {
    if (win32) return;
    const binDir = makeBinDir(['mock-server']);
    const result = resolveStdioCommand('mock-server', options({ win32: false, env: { PATH: binDir } }));
    expect(result.command).toBe(join(binDir, 'mock-server'));
    expect(result.shell).toBe(false);
  });

  it('resolves a bare name to its .cmd shim through PATHEXT on win32', () => {
    const binDir = makeBinDir(['mock-server.cmd']);
    const result = resolveStdioCommand('mock-server', options({ win32: true, env: { PATH: binDir } }));
    expect(result.command.toLowerCase().endsWith('mock-server.cmd')).toBe(true);
    expect(result.shell).toBe(true);
  });

  it('does not add a shell for executables resolved on win32', () => {
    const binDir = makeBinDir(['mock-server.exe']);
    const result = resolveStdioCommand('mock-server', options({ win32: true, env: { PATH: binDir } }));
    expect(result.command.toLowerCase().endsWith('mock-server.exe')).toBe(true);
    expect(result.shell).toBe(false);
  });

  it('honours a custom PATHEXT order on win32', () => {
    const binDir = makeBinDir(['mock-server.exe', 'mock-server.cmd']);
    const result = resolveStdioCommand('mock-server', options({ win32: true, env: { PATH: binDir, PATHEXT: '.CMD;.EXE' } }));
    expect(result.command.toLowerCase().endsWith('mock-server.cmd')).toBe(true);
  });

  it('tries an explicitly suffixed name as-is before appending extensions', () => {
    const binDir = makeBinDir(['mock-server.cmd']);
    const result = resolveStdioCommand('mock-server.cmd', options({ win32: true, env: { PATH: binDir } }));
    expect(result.command.toLowerCase().endsWith('mock-server.cmd')).toBe(true);
  });

  it('flags an absolute .cmd path as shell on win32', () => {
    const result = resolveStdioCommand('C:\\tools\\server.cmd', options({ win32: true }));
    expect(result).toEqual({ command: 'C:\\tools\\server.cmd', shell: true });
  });

  it('rejects a bare name whose only hit lives inside the working directory', () => {
    if (!win32) return;
    const cwd = mkdtempSync(join(tmpdir(), 'mcp-cmd-cwd-'));
    writeFileSync(join(cwd, 'planted.cmd'), 'x');
    const result = resolveStdioCommand('planted', options({ win32: true, cwd, env: { PATH: cwd } }));
    expect(result.command).toBe('planted');
    expect(result.shell).toBe(false);
  });
});
