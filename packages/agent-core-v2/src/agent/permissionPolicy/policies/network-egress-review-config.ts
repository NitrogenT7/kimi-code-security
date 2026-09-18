import { z } from 'zod';

import {
  type EnvBindings,
  envBindings,
  stripEnvBoundFields,
  type IConfigService,
} from '#/app/config/config';
import { registerConfigSection } from '#/app/config/configSectionContributions';

export const NETWORK_EGRESS_REVIEW_SECTION = 'networkEgressReview';

export const NetworkEgressReviewConfigSchema = z.object({
  enabled: z.boolean().optional(),
  model: z.string().optional(),
});

export type NetworkEgressReviewConfig = z.infer<typeof NetworkEgressReviewConfigSchema>;

export const NETWORK_EGRESS_REVIEW_ENABLED_ENV = 'KIMI_CODE_NETWORK_EGRESS_REVIEW';

function parseBooleanEnv(raw: string): boolean | undefined {
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  return undefined;
}

export const networkEgressReviewEnvBindings: EnvBindings<NetworkEgressReviewConfig> =
  envBindings(NetworkEgressReviewConfigSchema, {
    enabled: {
      env: NETWORK_EGRESS_REVIEW_ENABLED_ENV,
      parse: parseBooleanEnv,
    },
  });

export const stripNetworkEgressReviewEnv = stripEnvBoundFields(
  networkEgressReviewEnvBindings,
);

export function networkEgressReviewerModel(config: IConfigService): string {
  return (
    config.get<NetworkEgressReviewConfig | undefined>(NETWORK_EGRESS_REVIEW_SECTION)?.model ??
    'glm5.3-flash'
  );
}

export function isNetworkEgressReviewEnabled(config: IConfigService): boolean {
  return (
    config.get<NetworkEgressReviewConfig | undefined>(NETWORK_EGRESS_REVIEW_SECTION)?.enabled ===
    true
  );
}

registerConfigSection(NETWORK_EGRESS_REVIEW_SECTION, NetworkEgressReviewConfigSchema, {
  env: networkEgressReviewEnvBindings,
  stripEnv: stripNetworkEgressReviewEnv,
});
