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
 * scoped to the importer's owning package. agent-core-v2 sources and tests
 * import each other through the `#/*` alias (e.g. `#/agent/loop`); resolving
 * against the importer's package root keeps those aliases pointing at
 * agent-core-v2 even when a test inlines a dependency's src.
 *
 * Tries `src/<sub>.ts` then `src/<sub>/index.ts`, mirroring the
 * `"#/*"` → `["./src/*.ts", "./src/<x>/index.ts"]` fallback used by the package.
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
    name: 'agent-core-v2',
    include: ['test/**/*.{test,e2e,integration}.ts'],
  },
});
