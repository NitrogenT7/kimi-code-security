/**
 * `fullCompaction` domain (L4) — registers the `retention-plan-compaction`
 * experimental flag into `flag`.
 *
 * Gates an extra planning pass before automatic compaction: the model first
 * produces a retention plan (what must survive compaction), which is then
 * embedded into the compaction instruction. Off by default; enable via
 * `KIMI_CODE_EXPERIMENTAL_RETENTION_PLAN_COMPACTION`, the master
 * `KIMI_CODE_EXPERIMENTAL_FLAG`, or the `[experimental]` config section.
 * Imported for its side effect (registers the definition) from the package
 * barrel.
 */

import { type FlagDefinitionInput, registerFlagDefinition } from '#/app/flag/flagRegistry';

export const RETENTION_PLAN_COMPACTION_FLAG_ID = 'retention-plan-compaction';
export const RETENTION_PLAN_COMPACTION_FLAG_ENV =
  'KIMI_CODE_EXPERIMENTAL_RETENTION_PLAN_COMPACTION';

export const retentionPlanCompactionFlag: FlagDefinitionInput = {
  id: RETENTION_PLAN_COMPACTION_FLAG_ID,
  title: 'Retention-plan compaction',
  description:
    'Before automatic compaction, run an extra planning pass that decides what must be retained and embeds that retention plan into the compaction instruction.',
  env: RETENTION_PLAN_COMPACTION_FLAG_ENV,
  default: false,
  surface: 'core',
};

registerFlagDefinition(retentionPlanCompactionFlag);
