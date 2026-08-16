import { createDecorator } from "#/_base/di/instantiation";

export type SwarmModeTrigger = 'manual' | 'task' | 'tool';

/**
 * Optional flavor of swarm mode, selected by the host when entering.
 * 'audit' = security-audit pipeline (/swarm audit): phased swarms with
 * structured subagent verdicts and caller-side verification gates.
 * `undefined` is the general-purpose swarm workflow.
 */
export type SwarmModeVariant = 'audit';

/** Persisted swarm-mode state: the trigger plus the optional variant. */
export interface SwarmModeState {
  readonly trigger: SwarmModeTrigger;
  readonly variant?: SwarmModeVariant;
}

export interface IAgentSwarmService {
  readonly _serviceBrand: undefined;

  readonly isActive: boolean;
  readonly activeVariant: SwarmModeVariant | undefined;
  enter(trigger: SwarmModeTrigger, variant?: SwarmModeVariant): void;
  exit(): void;
}

export const IAgentSwarmService = createDecorator<IAgentSwarmService>('agentSwarmService');
