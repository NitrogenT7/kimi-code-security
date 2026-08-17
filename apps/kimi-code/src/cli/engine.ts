/**
 * Shared engine selection for every CLI entry point.
 *
 * The v2 engine (in-process agent-core-v2 via `V2SDKRpcClient`) is the
 * default for all hosts; `KIMI_CODE_ENGINE=v1` falls back to the legacy v1
 * engine while the migration completes. Centralized here so entry points
 * cannot drift apart on the escape hatch.
 */

import {
  createKimiHarness,
  createKimiHarnessV2,
  type KimiHarness,
  type KimiHarnessOptions,
} from '@moonshot-ai/kimi-code-sdk';

export const ENGINE_ENV = 'KIMI_CODE_ENGINE';

export function isV1EngineOverride(env: Readonly<Record<string, string | undefined>> = process.env): boolean {
  return env[ENGINE_ENV] === 'v1';
}

export function createDefaultHarness(options: KimiHarnessOptions): KimiHarness {
  return isV1EngineOverride() ? createKimiHarness(options) : createKimiHarnessV2(options);
}
