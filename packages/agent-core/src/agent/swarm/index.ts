import type { Agent } from '..';

import SWARM_AUDIT_MODE_ENTER_REMINDER from './audit-reminder.md?raw';
import SWARM_MODE_ENTER_REMINDER from './enter-reminder.md?raw';
import SWARM_MODE_EXIT_REMINDER from './exit-reminder.md?raw';

/**
 * manual = persistent toggle (/swarm on);
 * task = one-shot /swarm prompt;
 * tool = AgentSwarm entry.
 */
export type SwarmModeTrigger = 'manual' | 'task' | 'tool';

/**
 * Optional flavor of swarm mode, selected by the host when entering.
 * 'audit' = security-audit pipeline (/swarm audit): phased swarms with
 * structured subagent verdicts and caller-side verification gates.
 * `undefined` is the general-purpose swarm workflow.
 */
export type SwarmModeVariant = 'audit';

export class SwarmMode {
  protected active: SwarmModeTrigger | null = null;
  protected variant: SwarmModeVariant | undefined;

  constructor(protected readonly agent: Agent) {}

  enter(trigger: SwarmModeTrigger, variant?: SwarmModeVariant): void {
    if (this.active !== null) return;
    this.agent.records.logRecord({ type: 'swarm_mode.enter', trigger, variant });
    this.active = trigger;
    this.variant = variant;
    if (trigger !== 'tool') {
      this.agent.context.appendSystemReminder(enterReminder(variant), {
        kind: 'injection',
        variant: 'swarm_mode',
      });
    }
    this.agent.emitStatusUpdated();
  }

  restoreEnter(trigger: SwarmModeTrigger, variant?: SwarmModeVariant): void {
    this.active = trigger;
    this.variant = variant;
  }

  exit(): void {
    if (this.active === null) return;
    this.agent.records.logRecord({ type: 'swarm_mode.exit' });
    const trigger = this.active;
    this.active = null;
    this.variant = undefined;
    this.agent.emitStatusUpdated();
    if (trigger === 'tool') return;
    if (this.agent.context.popMatchedMessage((origin) => origin?.kind === 'injection' && origin.variant === 'swarm_mode')) {
      return;
    }
    if (!this.agent.records.restoring) {
      this.agent.context.appendSystemReminder(SWARM_MODE_EXIT_REMINDER, {
        kind: 'injection',
        variant: 'swarm_mode_exit',
      });
    }
  }

  get isActive(): boolean {
    return this.active !== null;
  }

  get activeVariant(): SwarmModeVariant | undefined {
    return this.active === null ? undefined : this.variant;
  }

  get shouldAutoExit(): boolean {
    return this.active === 'task' || this.active === 'tool';
  }
}

function enterReminder(variant: SwarmModeVariant | undefined): string {
  return variant === 'audit' ? SWARM_AUDIT_MODE_ENTER_REMINDER : SWARM_MODE_ENTER_REMINDER;
}
