import { accessSync, constants, statSync } from 'node:fs';
import { isAbsolute, join, relative, resolve } from 'pathe';

const WIN32_PATHEXT_DEFAULTS = ['.COM', '.EXE', '.BAT', '.CMD'];
const WIN32_SCRIPT_EXTENSIONS = ['.bat', '.cmd'];

export interface ResolvedStdioCommand {
  readonly command: string;
  readonly shell: boolean;
}

export interface ResolveStdioCommandOptions {
  readonly win32: boolean;
  readonly cwd: string;
  readonly env: Readonly<Record<string, string | undefined>>;
}

export function resolveStdioCommand(
  command: string,
  options: ResolveStdioCommandOptions,
): ResolvedStdioCommand {
  if (isAbsolute(command)) return { command, shell: needsShell(command, options.win32) };
  const found = searchPath(command, options);
  if (found === undefined) return { command, shell: needsShell(command, options.win32) };
  return { command: found, shell: needsShell(found, options.win32) };
}

function needsShell(command: string, win32: boolean): boolean {
  if (!win32) return false;
  const lower = command.toLowerCase();
  return WIN32_SCRIPT_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

function pathExtensions(rawPathext: string | undefined): readonly string[] {
  if (rawPathext === undefined || rawPathext.trim().length === 0) return WIN32_PATHEXT_DEFAULTS;
  const parsed = rawPathext
    .split(';')
    .map((ext) => ext.trim())
    .filter((ext) => ext.length > 0);
  return parsed.length > 0 ? parsed : WIN32_PATHEXT_DEFAULTS;
}

function candidateNames(command: string, extensions: readonly string[]): readonly string[] {
  if (extensions.length === 1 && extensions[0] === '') return [command];
  const lower = command.toLowerCase();
  if (extensions.some((ext) => lower.endsWith(ext.toLowerCase()))) return [command];
  return extensions.map((ext) => command + ext);
}

function isExecutableFile(candidate: string, win32: boolean): boolean {
  try {
    if (!statSync(candidate).isFile()) return false;
    if (!win32) accessSync(candidate, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function isInsideCwd(candidate: string, cwd: string, win32: boolean): boolean {
  let resolvedCandidate = resolve(candidate);
  let resolvedCwd = resolve(cwd);
  if (win32) {
    resolvedCandidate = resolvedCandidate.toLowerCase();
    resolvedCwd = resolvedCwd.toLowerCase();
  }
  const rel = relative(resolvedCwd, resolvedCandidate);
  return rel !== '' && !rel.startsWith('..') && !isAbsolute(rel);
}

function searchPath(command: string, options: ResolveStdioCommandOptions): string | undefined {
  const pathValue = options.env['PATH'] ?? '';
  const separator = options.win32 ? ';' : ':';
  const extensions = options.win32 ? pathExtensions(options.env['PATHEXT']) : [''];
  for (const dir of pathValue.split(separator)) {
    if (dir === '') continue;
    for (const name of candidateNames(command, extensions)) {
      const candidate = join(dir, name);
      if (!isExecutableFile(candidate, options.win32)) continue;
      if (isInsideCwd(candidate, options.cwd, options.win32)) return undefined;
      return resolve(candidate);
    }
  }
  return undefined;
}
