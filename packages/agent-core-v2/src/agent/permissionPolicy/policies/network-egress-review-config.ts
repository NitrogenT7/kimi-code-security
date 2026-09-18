import { z } from 'zod';

import { type IConfigService } from '#/app/config/config';
import { registerConfigSection } from '#/app/config/configSectionContributions';

export const NETWORK_EGRESS_REVIEW_SECTION = 'networkEgressReview';

export const NetworkEgressReviewConfigSchema = z.object({
  model: z.string().optional(),
});

export type NetworkEgressReviewConfig = z.infer<typeof NetworkEgressReviewConfigSchema>;

export function networkEgressReviewerModel(config: IConfigService): string {
  return (
    config.get<NetworkEgressReviewConfig | undefined>(NETWORK_EGRESS_REVIEW_SECTION)?.model ??
    'glm5.3-flash'
  );
}

registerConfigSection(NETWORK_EGRESS_REVIEW_SECTION, NetworkEgressReviewConfigSchema);
