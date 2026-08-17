import { describe, expect, it } from 'vitest';
import { PassThrough } from 'node:stream';

import type { Kaos, KaosProcess } from '@moonshot-ai/kaos';

import { KaosHostFileSystem } from '#/os/backends/kaos/hostFsService';

/** Minimal in-memory Kaos double exercising the adapter's mapping surface. */
function fakeKaos(files: Map<string, string>): Kaos {
  const shell = new PassThrough();
  const shellOut = new PassThrough();
  const proc: KaosProcess = {
    stdin: shell,
    stdout: shellOut,
    stderr: new PassThrough(),
    pid: 1,
    exitCode: 0,
    wait: () => Promise.resolve(0),
    kill: () => Promise.resolve(),
    dispose: () => undefined,
  };
  return {
    name: 'fake',
    osEnv: {
      osKind: 'linux',
      osArch: 'x64',
      osVersion: 'test',
      shellName: 'bash',
      shellPath: '/bin/bash',
    },
    pathClass: () => 'posix',
    normpath: (p: string) => p,
    gethome: () => '/home/fake',
    getcwd: () => '/home/fake',
    chdir: () => Promise.resolve(),
    withCwd: () => fakeKaos(files),
    withEnv: () => fakeKaos(files),
    stat: (path: string) => {
      const mode =
        path === '/dir'
          ? 0o040000
          : path === '/link'
            ? 0o120000
            : 0o100644;
      return Promise.resolve({
        stMode: mode,
        stIno: 7,
        stDev: 1,
        stNlink: 1,
        stUid: 0,
        stGid: 0,
        stSize: (files.get(path) ?? '').length,
        stAtime: 1,
        stMtime: 2,
        stCtime: 3,
      });
    },
    iterdir: async function* (path: string) {
      for (const key of files.keys()) {
        if (key.startsWith(`${path}/`)) yield key;
      }
    },
    glob: async function* () {},
    readBytes: (path: string) => Promise.resolve(Buffer.from(files.get(path) ?? '')),
    readText: (path: string) => Promise.resolve(files.get(path) ?? ''),
    readLines: async function* (path: string) {
      yield* (files.get(path) ?? '').split('\n');
    },
    writeBytes: (path: string, data: Buffer) => {
      files.set(path, data.toString('utf8'));
      return Promise.resolve(data.byteLength);
    },
    writeText: (path: string, data: string, options?: { mode?: 'w' | 'a' }) => {
      const prev = options?.mode === 'a' ? (files.get(path) ?? '') : '';
      files.set(path, prev + data);
      return Promise.resolve(data.length);
    },
    mkdir: (path: string) => {
      files.set(`${path}/.keep`, '');
      return Promise.resolve();
    },
    exec: () => Promise.resolve(proc),
    execWithEnv: () => Promise.resolve(proc),
  } as unknown as Kaos;
}

describe('KaosHostFileSystem', () => {
  it('maps text and byte reads/writes through the Kaos', async () => {
    const files = new Map([['/a.txt', 'hello']]);
    const fs = new KaosHostFileSystem(fakeKaos(files));

    expect(await fs.readText('/a.txt')).toBe('hello');
    expect(Buffer.from(await fs.readBytes('/a.txt')).toString('utf8')).toBe('hello');

    await fs.writeText('/b.txt', 'world');
    expect(files.get('/b.txt')).toBe('world');
    await fs.appendText('/b.txt', '!');
    expect(files.get('/b.txt')).toBe('world!');

    await fs.writeBytes('/c.bin', new Uint8Array([1, 2, 3]));
    expect(files.get('/c.bin')).toBe('\x01\x02\x03');
  });

  it('maps stat mode bits onto HostFileStat kinds', async () => {
    const fs = new KaosHostFileSystem(fakeKaos(new Map()));
    expect(await fs.stat('/a.txt')).toMatchObject({ isFile: true, isDirectory: false });
    expect(await fs.stat('/dir')).toMatchObject({ isFile: false, isDirectory: true });
    expect(await fs.stat('/link')).toMatchObject({ isSymbolicLink: true });
  });

  it('maps iterdir full paths onto name entries', async () => {
    const fs = new KaosHostFileSystem(fakeKaos(new Map([['/dir/x.txt', '']])));
    expect(await fs.readdir('/dir')).toEqual([
      { name: 'x.txt', isFile: true, isDirectory: false, isSymbolicLink: false },
    ]);
  });

  it('streams readLines through the Kaos generator', async () => {
    const fs = new KaosHostFileSystem(fakeKaos(new Map([['/l.txt', 'one\ntwo']])));
    const lines: string[] = [];
    for await (const line of fs.readLines('/l.txt')) lines.push(line);
    expect(lines).toEqual(['one', 'two']);
  });
});
