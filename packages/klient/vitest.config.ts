import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { defineConfig, type Plugin } from 'vitest/config';

function findPackageRoot(importer: string | undefined): string | undefined {
  if (!importer) return undefined;
  let dir = dirname(importer.split('?')[0] ?? importer);
  for (;;) {
    if (existsSync(join(dir, 'package.json'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return undefined;
    dir = parent;
  }
}

/**
 * Resolve `#/` subpath imports the way Node's package.json `imports` field does,
 * scoped to the importer's owning package. The client stays type-only against
 * `agent-core-v2`, but tests import service tokens as values (e.g.
 * `ISessionIndex`), whose internal `#/foo` imports must resolve against
 * `agent-core-v2`'s own `src/`. Mirrors `packages/kap-server/vitest.config.ts`.
 */
function hashImportsPlugin(): Plugin {
  return {
    name: 'resolve-hash-imports',
    enforce: 'pre',
    resolveId(id, importer) {
      if (!id.startsWith('#/')) return null;
      const pkgRoot = findPackageRoot(importer);
      if (!pkgRoot) return null;
      const sub = id.slice(2);
      for (const candidate of [`src/${sub}.ts`, `src/${sub}/index.ts`]) {
        const full = join(pkgRoot, candidate);
        if (existsSync(full)) return full;
      }
      return null;
    },
  };
}

export default defineConfig({
  plugins: [hashImportsPlugin()],
  test: {
    name: 'klient',
    include: ['test/**/*.test.ts'],
  },
});
