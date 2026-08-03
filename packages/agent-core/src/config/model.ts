import {
  BUDGET_THINKING_EFFORTS,
  inferAnthropicModelProfile,
  matchKnownAnthropicModelProfile,
} from '@moonshot-ai/kosong/providers/anthropic-profile';

import type { ModelAlias, ProviderType } from './schema';

/**
 * The alias's provider reference as an ordered list. `provider` may be a
 * single name or a failover pool (array, first = highest priority); returns
 * `undefined` when the alias relies on the top-level default provider.
 */
export function providerNamesOf(alias: ModelAlias): readonly string[] | undefined {
  const value = alias.provider;
  if (value === undefined) return undefined;
  return typeof value === 'string' ? [value] : value;
}

/**
 * The first (highest-priority) provider name of the alias, or `undefined`
 * when the alias relies on the top-level default provider. Consumers that
 * only understand a single provider (auth summary, model catalog) use this.
 */
export function primaryProviderName(alias: ModelAlias): string | undefined {
  return providerNamesOf(alias)?.[0];
}

export function effectiveModelAlias(
  alias: ModelAlias,
  providerType?: ProviderType,
): ModelAlias {
  const { overrides, ...base } = alias;
  const effective: ModelAlias = overrides === undefined ? alias : { ...base, ...overrides };

  if (
    overrides?.supportEfforts !== undefined &&
    overrides.defaultEffort === undefined &&
    effective.defaultEffort !== undefined &&
    !overrides.supportEfforts.includes(effective.defaultEffort)
  ) {
    delete effective.defaultEffort;
  }

  return withAnthropicProfile(effective, providerType);
}

function withAnthropicProfile(model: ModelAlias, providerType?: ProviderType): ModelAlias {
  const protocol = model.protocol ?? providerType;
  // The inferred fallback profile exists for third-party Anthropic-compatible
  // endpoints whose model name encodes no known Claude version. Kimi providers
  // — including managed models routed through protocol = "anthropic" — declare
  // thinking efforts via the catalog, so they never receive the fallback.
  // Callers without provider context fall back to name matching only.
  const profile =
    providerType !== undefined && providerType !== 'kimi' && protocol === 'anthropic'
      ? inferAnthropicModelProfile(model.model)
      : matchKnownAnthropicModelProfile(model.model);
  if (profile === undefined) return model;

  const capability = profile.canDisableThinking ? 'thinking' : 'always_thinking';
  const capabilities = model.capabilities ?? [];
  const hasCapability = capabilities.some(
    (candidate) => candidate.trim().toLowerCase() === capability,
  );
  // `adaptive_thinking = false` opts the endpoint out of the adaptive API, so
  // the catalog must not advertise adaptive-only efforts (xhigh/max) — this
  // mirrors the budget branch of kosong's resolveThinkingProfile.
  const supportEfforts =
    model.supportEfforts ??
    (model.adaptiveThinking === false ? [...BUDGET_THINKING_EFFORTS] : [...profile.efforts]);

  return {
    ...model,
    capabilities: hasCapability ? capabilities : [...capabilities, capability],
    supportEfforts,
    defaultEffort:
      model.defaultEffort ?? (supportEfforts.includes('high') ? 'high' : undefined),
  };
}

export function effectiveModelAliases(
  models: Record<string, ModelAlias>,
): Record<string, ModelAlias> {
  return Object.fromEntries(
    Object.entries(models).map(([alias, model]) => [alias, effectiveModelAlias(model)]),
  );
}
