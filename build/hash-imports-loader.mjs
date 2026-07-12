import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/**
 * Node ESM `resolve` hook: correctly resolve `#/` subpath imports against the
 * importing package's own `package.json` `imports` field — including array
 * fallbacks such as `"#/*": ["./src/*.ts", "./src/<name>/index.ts"]`.
 *
 * `tsx` (its resolver) only honors the first array element and therefore breaks
 * on directory-style `#/` imports (for example `#/_base/errors` →
 * `_base/errors/index.ts`). This loader short-circuits `#/` resolution before
 * tsx sees it, mirroring the Vite `hashImportsPlugin` used by the v2 tests.
 */

const pkgCache = new Map();

function findPackageJson(fromFileUrl) {
  let dir = dirname(fileURLToPath(fromFileUrl));
  for (;;) {
    const candidate = join(dir, 'package.json');
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) return undefined;
    dir = parent;
  }
}

function readPackage(pkgPath) {
  let pkg = pkgCache.get(pkgPath);
  if (pkg === undefined) {
    pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
    pkgCache.set(pkgPath, pkg);
  }
  return pkg;
}

function resolveTarget(pkgDir, target, rest) {
  const resolved = rest === undefined ? target : target.replace('*', rest);
  const full = join(pkgDir, resolved);
  return existsSync(full) ? pathToFileURL(full).href : undefined;
}

function resolveHashImport(specifier, parentURL) {
  if (parentURL === undefined) return undefined;
  const pkgPath = findPackageJson(parentURL);
  if (pkgPath === undefined) return undefined;
  const imports = readPackage(pkgPath).imports;
  if (imports === undefined) return undefined;
  const pkgDir = dirname(pkgPath);

  for (const [key, raw] of Object.entries(imports)) {
    if (!key.startsWith('#')) continue;
    const targets = Array.isArray(raw) ? raw : [raw];
    if (key.endsWith('*')) {
      const prefix = key.slice(0, -1);
      if (!specifier.startsWith(prefix)) continue;
      const rest = specifier.slice(prefix.length);
      for (const target of targets) {
        const url = resolveTarget(pkgDir, target, rest);
        if (url !== undefined) return url;
      }
    } else if (specifier === key) {
      for (const target of targets) {
        const url = resolveTarget(pkgDir, target, undefined);
        if (url !== undefined) return url;
      }
    }
  }
  return undefined;
}

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('#/')) {
    const url = resolveHashImport(specifier, context.parentURL);
    if (url !== undefined) return { url, shortCircuit: true };
  }
  return nextResolve(specifier, context);
}
