/**
 * Host package identity helpers.
 *
 * The official CLI ships as `@moonshot-ai/kimi-code`; forked distributions
 * (for example the security-research fork installed as `ksec`) rewrite the
 * host package.json name, which is how runtime code tells them apart.
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
 * True when this build runs as a forked distribution (the host package.json
 * name is not the official package). Forks get their own branding and stay
 * out of the official update channel.
 */
export function isForkBuild(hostPackageName: string | undefined = getHostPackageName()): boolean {
  return hostPackageName !== undefined && hostPackageName !== NPM_PACKAGE_NAME;
}
