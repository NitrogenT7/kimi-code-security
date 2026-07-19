import { randomUUID } from 'node:crypto';

import type { ContentPart } from '@moonshot-ai/kosong';

import { ErrorCodes, KimiError } from '#/errors';
import type { ActivateSkillPayload } from '#/rpc';

import type { Agent } from '..';
import { isUserActivatableSkillType, type SkillDefinition } from '../../skill';
import type { SkillActivationOrigin } from '../context';
import { renderUserSlashSkillPrompt } from './prompt';
import type { SkillRegistry } from './types';

export type { SkillRegistry } from './types';

export class SkillManager {
  constructor(
    protected readonly agent: Agent,
    public readonly registry: SkillRegistry,
  ) {}

  activate(input: ActivateSkillPayload): void {
    const skill = this.registry.getSkill(input.name);
    if (skill === undefined) {
      throw new KimiError(ErrorCodes.SKILL_NOT_FOUND, `Skill "${input.name}" was not found`);
    }
    if (!isUserActivatableSkillType(skill.metadata.type)) {
      throw new KimiError(
        ErrorCodes.SKILL_TYPE_UNSUPPORTED,
        `Skill "${skill.name}" cannot be activated by the user`,
      );
    }

    this.assertSkillAllowed(skill);

    const skillArgs = input.args ?? '';
    const skillContent = this.registry.renderSkillPrompt(skill, skillArgs);
    const wrapped = [
      {
        type: 'text' as const,
        text: renderUserSlashSkillPrompt({
          skillName: skill.name,
          skillArgs,
          skillContent,
          skillSource: skill.source,
          skillDir: skill.dir,
        }),
      },
    ];

    this.recordActivation(
      {
        kind: 'skill_activation',
        activationId: randomUUID(),
        skillName: skill.name,
        trigger: 'user-slash',
        skillType: skill.metadata.type,
        skillPath: skill.path,
        skillSource: skill.source,
        skillArgs: input.args,
      },
      wrapped,
    );
  }

  isSkillAllowedInCurrentGroup(skill: SkillDefinition): boolean {
    const groupMode = this.agent.mcpGroupMode;
    const allowedPrefixes = this.agent.allowedSkillPrefixes;

    // No group mode active -> all skills allowed.
    if (groupMode === null && (allowedPrefixes === null || allowedPrefixes.length === 0)) {
      return true;
    }

    const mcpGroups = skill.metadata.mcpGroups;
    const groups = Array.isArray(mcpGroups) ? mcpGroups : [];

    // A skill declaring mcpGroups: ['*'] is allowed everywhere.
    if (groups.includes('*')) {
      return true;
    }

    // If a specific group mode is active, allow by explicit group membership.
    if (groupMode !== null && groups.includes(groupMode)) {
      return true;
    }

    // Full group allows everything.
    if (allowedPrefixes !== null && allowedPrefixes.includes('*')) {
      return true;
    }

    // Fall back to prefix matching.
    if (allowedPrefixes !== null && allowedPrefixes.length > 0) {
      return allowedPrefixes.some((prefix) => skill.name.startsWith(prefix));
    }

    return true;
  }

  assertSkillAllowed(skill: SkillDefinition): void {
    if (!this.isSkillAllowedInCurrentGroup(skill)) {
      const allowedPrefixes = this.agent.allowedSkillPrefixes ?? [];
      throw new KimiError(
        ErrorCodes.SKILL_NOT_FOUND,
        `Skill "${skill.name}" is not allowed in the current MCP group mode (group: ${this.agent.mcpGroupMode ?? 'none'}). Allowed prefixes: ${allowedPrefixes.join(', ')}`,
      );
    }
  }

  recordActivation(
    origin: SkillActivationOrigin,
    input?: readonly ContentPart[] | undefined,
  ): void {
    this.agent.emitEvent({
      type: 'skill.activated',
      activationId: origin.activationId,
      skillName: origin.skillName,
      trigger: origin.trigger,
      skillArgs: origin.skillArgs,
      skillPath: origin.skillPath,
      skillSource: origin.skillSource,
    });
    this.agent.telemetry.track('skill_invoked', {
      skill_name: origin.skillName,
      trigger: origin.trigger,
    });
    if (origin.skillType === 'flow') {
      this.agent.telemetry.track('flow_invoked', {
        flow_name: origin.skillName,
      });
    }
    if (input !== undefined) {
      this.agent.turn.prompt(input, origin);
    }
  }
}
