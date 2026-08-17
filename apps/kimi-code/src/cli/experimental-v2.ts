/**
 * Engine gate for `kimi -p` (print mode).
 *
 * The v2 engine (agent-core-v2 native print runner) is the default; the
 * legacy env switch `KIMI_CODE_EXPERIMENTAL_FLAG` still forces it on, and
 * `KIMI_CODE_ENGINE=v1` selects the v1 harness fallback while the migration
 * completes. Read directly from the env (matching `cli/update/rollout.ts`)
 * because the CLI must not depend on the core flag registry.
 *
 * Note: `kimi server run` always boots kap-server (the agent-core-v2 engine
 * server) — it never consulted any switch.
 */

import { isV1EngineOverride } from '#/cli/engine';

export const KIMI_V2_ENV = 'KIMI_CODE_EXPERIMENTAL_FLAG';

const TRUTHY_VALUES = new Set(['1', 'true', 'yes', 'on']);

function isTruthyEnv(
  key: string,
  env: Readonly<Record<string, string | undefined>>,
): boolean {
  return TRUTHY_VALUES.has((env[key] ?? '').trim().toLowerCase());
}

export function isKimiV2Enabled(
  env: Readonly<Record<string, string | undefined>> = process.env,
): boolean {
  if (isTruthyEnv(KIMI_V2_ENV, env)) return true;
  return !isV1EngineOverride(env);
}
