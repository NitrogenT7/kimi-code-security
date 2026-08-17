/**
 * Host package identity helpers.
 *
 * The official CLI ships as `@moonshot-ai/kimi-code`; forked distributions
 * (for example the security-research fork installed as `ksec`) rewrite the
 * host package.json name, which is how runtime code tells them apart.
 * When running from this repository's source tree (dev / `tsx`), the
 * package.json keeps the official name — the fork identity there comes from
 * the tree itself (see {@link isForkSourceTree}).
 */

import { readFileSync } from 'node:fs';

import { NPM_PACKAGE_NAME } from '#/cli/update/types';
import { getHostPackageJsonPath } from '#/cli/version';

let override: string | undefined;

/** Test seam: pin the host package name instead of reading package.json. */
export function setHostPackageNameOverride(name: string | undefined): void {
  override = name;
}

export function getHostPackageName(): string | undefined {
  if (override !== undefined) return override;
  try {
    const pkg = JSON.parse(readFileSync(getHostPackageJsonPath(), 'utf-8')) as {
      name?: string;
    };
    return pkg.name;
  } catch {
    return undefined;
  }
}

/**
 * True when running from the security fork's own source tree. Dev runs
 * (`tsx src/main.ts` / `scripts/dev.mjs`) keep the official package.json name,
 * so the install-time rewrite cannot distinguish them; the tree path is the
 * reliable signal there.
 */
function isForkSourceTree(): boolean {
  const pkgPath = getHostPackageJsonPath();
  return /kimi-code-security/i.test(pkgPath);
}

/**
 * True when this build runs as a forked distribution — either the host
 * package.json name was rewritten (installed fork), or the process runs from
 * the security fork's source tree (dev). Forks get their own branding and
 * stay out of the official update channel. An explicit override (the test
 * seam) always wins over the tree-path signal.
 */
export function isForkBuild(hostPackageName?: string): boolean {
  // An explicit caller-supplied name is authoritative (the test seam uses it
  // to pin identity regardless of where the tree lives).
  if (hostPackageName !== undefined) return hostPackageName !== NPM_PACKAGE_NAME;
  // No name supplied: read the tree. The source tree of this fork keeps the
  // official package.json name in dev, so consult the path signal first —
  // `getHostPackageName()` alone cannot distinguish "official install" from
  // "dev run inside the security fork's checkout".
  if (override === undefined && isForkSourceTree()) return true;
  const name = override ?? getHostPackageName();
  return name !== undefined && name !== NPM_PACKAGE_NAME;
}
