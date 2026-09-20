import { Feature } from '#/features/feature';
import { registerFeature } from '#/features/featureRegistry';
import { LifecycleScope } from '#/app/scopes';

import { IJevDecider, JevDeciderService } from './jev-decider';
import { IJevTriageTool } from './tools/jev-triage';
import { JevTriageTool } from './tools/jevTriageTool';

export class JevFeature extends Feature {
  static override readonly name = 'jev';

  constructor() {
    super();
    this.contributeService(LifecycleScope.App, IJevDecider, JevDeciderService);
    this.contributeTool(IJevTriageTool, JevTriageTool, { name: 'JevTriage', domain: 'jev' });
  }
}

registerFeature(JevFeature);
