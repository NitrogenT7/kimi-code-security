import { z } from 'zod';

import type { IConfigService } from '#/app/config/config';
import { registerConfigSection } from '#/app/config/configSectionContributions';

export const JEV_SECTION = 'jev';

export const JevConfigSchema = z.object({
  provider: z.enum(['openrouter', 'typesafe']).optional(),
  model: z.string().min(1).optional(),
  apiKey: z.string().min(1).optional(),
  baseUrl: z.string().min(1).optional(),
  timeoutMs: z.number().int().min(1_000).max(120_000).optional(),
});

export type JevConfig = z.infer<typeof JevConfigSchema>;

export type JevProviderKind = 'openrouter' | 'typesafe';

export const DEFAULT_JEV_MODEL_BY_PROVIDER: Readonly<Record<JevProviderKind, string>> = {
  openrouter: 'typesafe/jev-1.13',
  typesafe: 'jev-1.13.0',
};

export interface JevEndpoint {
  readonly url: string;
  readonly model: string;
  readonly apiKey: string;
}

const OPENROUTER_DECISIONS_URL = 'https://openrouter.ai/api/alpha/decisions';
const TYPESAFE_DECISIONS_URL = 'https://api.typesafe.ai/v1/systemone';

export const JEV_API_KEY_ENV: Readonly<Record<JevProviderKind, string>> = {
  openrouter: 'OPENROUTER_API_KEY',
  typesafe: 'TYPESAFE_API_KEY',
};

export function resolveJevEndpoint(config: IConfigService): JevEndpoint | undefined {
  const cfg = config.get<JevConfig | undefined>(JEV_SECTION);
  if (cfg === undefined) return undefined;
  const provider = cfg.provider ?? 'openrouter';
  const model = cfg.model ?? DEFAULT_JEV_MODEL_BY_PROVIDER[provider];
  const apiKey = cfg.apiKey ?? process.env[JEV_API_KEY_ENV[provider]];
  if (apiKey === undefined || apiKey.length === 0) return undefined;
  const url =
    cfg.baseUrl ??
    (provider === 'openrouter' ? OPENROUTER_DECISIONS_URL : TYPESAFE_DECISIONS_URL);
  return { url, model, apiKey };
}

registerConfigSection(JEV_SECTION, JevConfigSchema);
