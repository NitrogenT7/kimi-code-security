import { createDecorator } from "#/_base/di/instantiation";

export type SwarmModeTrigger = 'manual' | 'task' | 'tool';

export type SwarmModeVariant = 'audit';

export interface IAgentSwarmService {
  readonly _serviceBrand: undefined;

  readonly isActive: boolean;
  readonly activeVariant: SwarmModeVariant | undefined;
  enter(trigger: SwarmModeTrigger, variant?: SwarmModeVariant): void;
  exit(): void;
}

export const IAgentSwarmService = createDecorator<IAgentSwarmService>('agentSwarmService');
