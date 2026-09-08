import { type FlagDefinitionInput, registerFlagDefinition } from '#/app/flag/flagRegistry';

export const MID_TURN_MODEL_SWITCH_FLAG_ID = 'mid-turn-model-switch';
export const MID_TURN_MODEL_SWITCH_FLAG_ENV = 'KIMI_CODE_EXPERIMENTAL_MID_TURN_MODEL_SWITCH';

export const midTurnModelSwitchFlag: FlagDefinitionInput = {
  id: MID_TURN_MODEL_SWITCH_FLAG_ID,
  title: 'Mid-turn model switch',
  description:
    'Apply a /model selection immediately while a turn is streaming: the next LLM request uses the new model instead of deferring the switch to the turn boundary. Note: mid-turn switches invalidate the context cache.',
  env: MID_TURN_MODEL_SWITCH_FLAG_ENV,
  default: false,
  surface: 'both',
};

registerFlagDefinition(midTurnModelSwitchFlag);
