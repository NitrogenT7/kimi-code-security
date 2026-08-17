import { createDecorator } from "#/_base/di/instantiation";
import type { SkillActivationOrigin } from '#/agent/contextMemory/types';
import type { Turn } from '#/agent/loop/loop';

export interface SkillActivationInput {
  readonly name: string;
  readonly args?: string;
}

export interface IAgentSkillService {
  readonly _serviceBrand: undefined;

  activate(input: SkillActivationInput): Promise<Turn>;
  recordModelToolActivation(origin: SkillActivationOrigin): void;
  /**
   * v1-parity skill-prefix sandbox. `undefined` (or an empty list) lifts the
   * sandbox; a non-empty list restricts skill activation to names starting
   * with one of the prefixes (`'*'` allows everything). Wired from MCP group
   * mode (see `ISessionMcpService.setGroupMode`).
   */
  setAllowedSkillPrefixes(prefixes: readonly string[] | undefined): void;
  /** Whether `name` passes the {@link setAllowedSkillPrefixes} sandbox. */
  isSkillAllowed(name: string): boolean;
}

export const IAgentSkillService =
  createDecorator<IAgentSkillService>('agentSkillService');
