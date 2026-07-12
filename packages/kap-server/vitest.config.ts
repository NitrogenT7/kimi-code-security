import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { defineConfig, type Plugin } from 'vitest/config';

import { rawTextPlugin } from '../../build/raw-text-plugin.mjs';

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
 * scoped to the importer's owning package. server-v2 inlines
 * `@moonshot-ai/agent-core-v2` source (and transitively kosong/kaos), whose
 * internal `#/foo` imports must resolve against each package's own `src/`.
 *
 * Mirrors `packages/agent-core-v2/vitest.config.ts`.
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
  // `rawTextPlugin` is required because server-v2 pulls in agent-core-v2's full
  // barrel, which imports `*.md?raw` prompt templates.
  plugins: [rawTextPlugin(), hashImportsPlugin()],
  test: {
    name: 'kap-server',
    include: ['test/**/*.{test,e2e}.ts'],
    fileParallelism: false,
  },
});
