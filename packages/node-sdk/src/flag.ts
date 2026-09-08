import type {
  FlagDefinitionInput,
  FlagId,
} from '@moonshot-ai/agent-core-v2/app/flag/flagRegistry';

export type {
  ExperimentalFeatureState,
  ExperimentalFlagMap,
  ExperimentalFlagSource,
} from '@moonshot-ai/agent-core-v2/app/flag/flag';
export type {
  FlagDefinitionInput,
  FlagId,
  FlagSurface,
} from '@moonshot-ai/agent-core-v2/app/flag/flagRegistry';
export {
  MID_TURN_MODEL_SWITCH_FLAG_ENV,
  MID_TURN_MODEL_SWITCH_FLAG_ID,
} from '@moonshot-ai/agent-core-v2/agent/profile/flag';

export type FlagDefinition = FlagDefinitionInput & { readonly id: FlagId };
