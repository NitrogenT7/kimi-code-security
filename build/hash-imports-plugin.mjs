import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

/**
 * Rolldown/tsdown plugin: resolve `#/` subpath imports the way Node's
 * package.json `imports` field does — scoped to the IMPORTER's owning package,
 * honoring array fallbacks such as `"#/*": ["./src/*.ts", "./src/<x>/index.ts"]`.
 *
 * Why this is needed: when the CLI bundles `@moonshot-ai/kap-server`, rolldown
 * inlines `@moonshot-ai/agent-core-v2` source, whose internal `#/foo` imports
 * must resolve against each package's own `src/`. Rolldown (like tsx) only
 * honors the first array element of an `imports` target and therefore breaks
 * on directory-style `#/` imports (e.g. `#/_base/errors` → `_base/errors/index.ts`),
 * leaving them as bare `require("#/...")` in the bundle. This plugin resolves
 * them first. Mirrors `build/hash-imports-loader.mjs` (the Node/tsx loader) and
 * the vite `hashImportsPlugin` used by the v2 test configs.
 */

const pkgCache = new Map();

function findPackageJson(importer) {
  if (!importer) return undefined;
  let dir = dirname(importer.split('?')[0] ?? importer);
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
  return existsSync(full) ? full : undefined;
}

function resolveHashImport(specifier, importer) {
  const pkgPath = findPackageJson(importer);
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
        const full = resolveTarget(pkgDir, target, rest);
        if (full !== undefined) return full;
      }
    } else if (specifier === key) {
      for (const target of targets) {
        const full = resolveTarget(pkgDir, target, undefined);
        if (full !== undefined) return full;
      }
    }
  }
  return undefined;
}

export function hashImportsPlugin() {
  return {
    name: 'resolve-hash-imports',
    resolveId(id, importer) {
      if (!id.startsWith('#/')) return null;
      return resolveHashImport(id, importer) ?? null;
    },
  };
}
