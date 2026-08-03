/**
 * `providerPool` domain (L6) — `pool` config-section schema and TOML
 * transforms.
 *
 * Owns the `[pool]` configuration section: endpoint-selection strategy and
 * rate-limit cooldown / recovery-probe tuning for pooled model aliases
 * (`provider = ["a", "b", ...]`). Self-registered at module load via
 * `registerConfigSection`, so the `config` domain never imports this domain's
 * types.
 */

import { z } from 'zod';

import { registerConfigSection } from '#/app/config/configSectionContributions';
import { isPlainObject, plainObjectToToml, transformPlainObject } from '#/app/config/toml';

export const POOL_SECTION = 'pool';

export const PoolConfigSchema = z.object({
  // Endpoint selection: 'priority' always prefers the first healthy provider;
  // 'round_robin' spreads requests across healthy providers.
  strategy: z.enum(['priority', 'round_robin']).optional(),
  // Base cooldown after a rate-limit rejection; doubles per consecutive
  // failure (server Retry-After wins when longer) up to cooldownMaxMs.
  cooldownBaseMs: z.number().int().min(1).optional(),
  cooldownMaxMs: z.number().int().min(1).optional(),
  // Active recovery check: every probeIntervalMs, each rate-limited endpoint
  // receives one minimal request to detect quota recovery while idle.
  // Each probe is a single 1-token request. Set probeEnabled = false to only
  // recover passively (on the next request after cooldown expiry).
  probeIntervalMs: z.number().int().min(1000).optional(),
  probeEnabled: z.boolean().optional(),
});

export type PoolConfig = z.infer<typeof PoolConfigSchema>;

const poolFromToml = (rawSnake: unknown): unknown =>
  isPlainObject(rawSnake) ? transformPlainObject(rawSnake) : rawSnake;

const poolToToml = (value: unknown, rawSnake: unknown): unknown =>
  isPlainObject(value) ? plainObjectToToml(value, rawSnake) : value;

registerConfigSection(POOL_SECTION, PoolConfigSchema, {
  fromToml: poolFromToml,
  toToml: poolToToml,
});
