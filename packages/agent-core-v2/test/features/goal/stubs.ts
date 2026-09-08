import type { IAgentSwarmService } from '#/features/swarm/agent/swarm';

export function stubAgentSwarm(): IAgentSwarmService {
  return {
    _serviceBrand: undefined,
    isActive: false,
    activeVariant: undefined,
    enter: () => undefined,
    exit: () => undefined,
  };
}
