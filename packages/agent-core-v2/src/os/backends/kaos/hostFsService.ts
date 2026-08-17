/**
 * `hostFs` domain (L1) — Kaos-backed `IHostFileSystem` adapter.
 *
 * Bridges a host-supplied `Kaos` (the v1 SDK's per-session execution-
 * environment abstraction — e.g. the ACP adapter's reverse-RPC `AcpKaos`) onto
 * v2's `IHostFileSystem`. Seeded per session through `createScopedChildHandle`
 * `extra` seeds (see `sessionLifecycleService.materializeSession`), where the
 * instance shadows the App-scoped node-local `HostFileSystem` for that session
 * only: Read/Write/Grep/Glob file tools and session-scoped consumers route
 * through the Kaos, while App-scoped persistence (state.json, wire journals,
 * session index) keeps using the local registry instance — the same split as
 * v1's `toolKaos` / `persistenceKaos` channels.
 *
 * Kaos stat yields Python-style raw mode bits (`stMode`), so file-kind tests
 * use the `S_IFMT` mask. `remove` / `realpath` / `createExclusive` have no
 * Kaos primitive and are bridged through `exec` (`rm -rf` / `realpath` /
 * atomic `ln` from a temp file) on POSIX hosts; on Windows hosts `realpath`
 * falls back to lexical `normpath` and the others reject. Not registered in
 * any scope — instantiated by `materializeSession` only.
 */

import { Buffer } from 'node:buffer';
import { basename, dirname, join } from 'pathe';
import { randomUUID } from 'node:crypto';

import type { Kaos } from '@moonshot-ai/kaos';

import { toHostFsError } from '#/os/interface/hostFsErrors';
import type { HostDirEntry, HostFileStat, IHostFileSystem } from '#/os/interface/hostFileSystem';

const S_IFMT = 0o170000;
const S_IFREG = 0o100000;
const S_IFDIR = 0o040000;
const S_IFLNK = 0o120000;

const TEXT_DECODE_TO_KAOS_ERRORS = {
  strict: 'strict',
  replace: 'replace',
  ignore: 'ignore',
} as const;

async function readAllStdout(proc: {
  readonly stdout: import('node:stream').Readable;
}): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of proc.stdout) {
    chunks.push(Buffer.from(chunk as Buffer));
  }
  return Buffer.concat(chunks).toString('utf8');
}

export class KaosHostFileSystem implements IHostFileSystem {
  declare readonly _serviceBrand: undefined;

  constructor(private readonly kaos: Kaos) {}

  async readText(
    path: string,
    options?: { encoding?: BufferEncoding; errors?: 'strict' | 'replace' | 'ignore' },
  ): Promise<string> {
    try {
      return await this.kaos.readText(path, {
        encoding: options?.encoding,
        errors:
          options === undefined
            ? undefined
            : TEXT_DECODE_TO_KAOS_ERRORS[options.errors ?? 'strict'],
      });
    } catch (error) {
      throw toHostFsError(error, { path, op: 'read' });
    }
  }

  async writeText(path: string, data: string): Promise<void> {
    try {
      await this.kaos.writeText(path, data, { mode: 'w' });
    } catch (error) {
      throw toHostFsError(error, { path, op: 'write' });
    }
  }

  async appendText(path: string, data: string): Promise<void> {
    try {
      await this.kaos.writeText(path, data, { mode: 'a' });
    } catch (error) {
      throw toHostFsError(error, { path, op: 'append' });
    }
  }

  async readBytes(path: string, n?: number): Promise<Uint8Array> {
    try {
      const buf = await this.kaos.readBytes(path, n);
      return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
    } catch (error) {
      throw toHostFsError(error, { path, op: 'read' });
    }
  }

  async writeBytes(path: string, data: Uint8Array): Promise<void> {
    try {
      await this.kaos.writeBytes(
        path,
        Buffer.from(data.buffer, data.byteOffset, data.byteLength),
      );
    } catch (error) {
      throw toHostFsError(error, { path, op: 'write' });
    }
  }

  async *readLines(
    path: string,
    options?: { encoding?: BufferEncoding; errors?: 'strict' | 'replace' | 'ignore' },
  ): AsyncGenerator<string> {
    const lines = this.kaos.readLines(path, {
      encoding: options?.encoding,
      errors:
        options === undefined
          ? undefined
          : TEXT_DECODE_TO_KAOS_ERRORS[options.errors ?? 'strict'],
    });
    try {
      for await (const line of lines) yield line;
    } catch (error) {
      throw toHostFsError(error, { path, op: 'read' });
    }
  }

  async createExclusive(path: string, data: Uint8Array): Promise<boolean> {
    const shell = this.shellCommand();
    if (shell === undefined) {
      throw toHostFsError(
        new Error('createExclusive requires a POSIX shell bridge on the Kaos host'),
        { path, op: 'create' },
      );
    }
    // Kaos has no O_EXCL primitive. `ln` provides the atomic no-clobber
    // semantic: write a sibling temp file, hard-link it into place, drop the
    // temp. A failed `ln` means the target existed.
    const temp = join(dirname(path), `.${basename(path)}.${randomUUID()}.tmp`);
    try {
      await this.kaos.writeBytes(
        temp,
        Buffer.from(data.buffer, data.byteOffset, data.byteLength),
      );
      const proc = await this.kaos.exec(
        shell,
        '-c',
        `ln "${temp}" "${path}" && rm -f "${temp}"`,
      );
      const code = await proc.wait();
      if (code !== 0) {
        await this.kaos
          .exec(shell, '-c', `rm -f "${temp}"`)
          .then((p) => p.wait())
          .catch(() => undefined);
        return false;
      }
      return true;
    } catch (error) {
      throw toHostFsError(error, { path, op: 'create' });
    }
  }

  async stat(path: string, options?: { followSymlinks?: boolean }): Promise<HostFileStat> {
    try {
      const s = await this.kaos.stat(path, { followSymlinks: options?.followSymlinks });
      const kind = s.stMode & S_IFMT;
      return {
        isFile: kind === S_IFREG || (kind === 0 && s.stSize >= 0),
        isDirectory: kind === S_IFDIR,
        isSymbolicLink: kind === S_IFLNK,
        size: s.stSize,
        mtimeMs: s.stMtime * 1000,
        ino: s.stIno,
      };
    } catch (error) {
      throw toHostFsError(error, { path, op: 'stat' });
    }
  }

  async readdir(path: string): Promise<readonly HostDirEntry[]> {
    try {
      const entries: HostDirEntry[] = [];
      for await (const entryPath of this.kaos.iterdir(path)) {
        const name = basename(entryPath);
        let isFile = false;
        let isDirectory = false;
        let isSymbolicLink = false;
        try {
          const s = await this.kaos.stat(join(path, name));
          const kind = s.stMode & S_IFMT;
          isFile = kind === S_IFREG;
          isDirectory = kind === S_IFDIR;
        } catch {
          // Unstattable entries (broken links, permission races) surface as
          // plain entries with all flags false, mirroring readdir tolerance.
          void isSymbolicLink;
        }
        entries.push({ name, isFile, isDirectory, isSymbolicLink });
      }
      return entries;
    } catch (error) {
      throw toHostFsError(error, { path, op: 'readdir' });
    }
  }

  async mkdir(path: string, options?: { readonly recursive?: boolean }): Promise<void> {
    try {
      await this.kaos.mkdir(path, {
        parents: options?.recursive ?? false,
        existOk: options?.recursive,
      });
    } catch (error) {
      throw toHostFsError(error, { path, op: 'mkdir' });
    }
  }

  async remove(path: string): Promise<void> {
    const shell = this.shellCommand();
    if (shell === undefined) {
      throw toHostFsError(
        new Error('remove requires a POSIX shell bridge on the Kaos host'),
        { path, op: 'remove' },
      );
    }
    try {
      const proc = await this.kaos.exec(shell, '-c', `rm -rf -- "${path}"`);
      const code = await proc.wait();
      if (code !== 0) {
        throw new Error(`rm exited with ${String(code)}`);
      }
    } catch (error) {
      throw toHostFsError(error, { path, op: 'remove' });
    }
  }

  async realpath(path: string): Promise<string> {
    const shell = this.shellCommand();
    if (shell === undefined) {
      // Lexical normalization is the best available without a shell.
      return this.kaos.normpath(path);
    }
    try {
      const proc = await this.kaos.exec(shell, '-c', `realpath -- "${path}"`);
      const [code, text] = await Promise.all([proc.wait(), readAllStdout(proc)]);
      if (code !== 0) {
        throw new Error(`realpath exited with ${String(code)}`);
      }
      const value = text.trim();
      if (value.length === 0) throw new Error('realpath produced no output');
      return value;
    } catch (error) {
      throw toHostFsError(error, { path, op: 'realpath' });
    }
  }

  private shellCommand(): string | undefined {
    const shell = this.kaos.osEnv.shellPath ?? '';
    if (shell.length === 0) return undefined;
    // Only POSIX shells run the `-c` bridges above.
    return this.kaos.osEnv.osKind === 'Windows' ? undefined : shell;
  }
}
