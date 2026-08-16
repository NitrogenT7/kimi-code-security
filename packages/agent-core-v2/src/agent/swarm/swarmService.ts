/**
 * `swarm` domain (L4) — `IAgentSwarmService` implementation.
 *
 * Tracks swarm-mode enter/exit in the `wire` `SwarmModel` (mutated only through
 * the `swarm_mode.enter` / `swarm_mode.exit` Ops, read through `wire.getModel`),
 * mirrors it into `systemReminder` as live-only side effects, derives
 * `agent.status.updated` from the Ops' `toEvent`, and auto-exits on turn end via
 * `turn`. The enter-reminder removal on exit is a cross-model fold on
 * `ContextModel` (see `contextOps.ts`): dispatching `swarm_mode.exit` pops the
 * reminder when it is the last message, both live and on replay — exactly like
 * v1's restore-time `popMatchedMessage`. The service only publishes the
 * live-only `context.spliced` event for that pop (so injector bookkeeping
 * stays in step) and appends the exit reminder when nothing was
 * popped. Bound at Agent scope. The `AgentSwarm` tool self-registers via
 * `registerTool(...)` in `tools/agent-swarm.ts`.
 */

import { Disposable } from '#/_base/di/lifecycle';
import { InstantiationType } from '#/_base/di/extensions';
import { LifecycleScope, registerScopedService } from '#/_base/di/scope';
import { IAgentContextMemoryService } from '#/agent/contextMemory/contextMemory';
import { IAgentSystemReminderService } from '#/agent/systemReminder/systemReminder';
import { IEventBus } from '#/app/event/eventBus';
import { IWireService } from '#/wire/wire';
import SWARM_AUDIT_MODE_ENTER_REMINDER from './audit-reminder.md?raw';
import SWARM_MODE_ENTER_REMINDER from './enter-reminder.md?raw';
import SWARM_MODE_EXIT_REMINDER from './exit-reminder.md?raw';
import { IAgentSwarmService, type SwarmModeTrigger, type SwarmModeVariant } from './swarm';
import { swarmEnter, swarmExit, SwarmModel } from './swarmOps';

export class AgentSwarmService extends Disposable implements IAgentSwarmService {
  declare readonly _serviceBrand: undefined;

  constructor(
    @IWireService private readonly wire: IWireService,
    @IAgentSystemReminderService private readonly reminders: IAgentSystemReminderService,
    @IAgentContextMemoryService private readonly context: IAgentContextMemoryService,
    @IEventBus private readonly eventBus: IEventBus,
  ) {
    super();
    this._register(
      this.eventBus.subscribe('turn.ended', () => {
        if (this.shouldAutoExit) {
          this.exit();
        }
      }),
    );
  }

  enter(trigger: SwarmModeTrigger, variant?: SwarmModeVariant): void {
    if (this.wire.getModel(SwarmModel) !== null) return;
    this.wire.dispatch(swarmEnter({ trigger, variant }));
    if (trigger !== 'tool') {
      this.reminders.appendSystemReminder(
        variant === 'audit' ? SWARM_AUDIT_MODE_ENTER_REMINDER : SWARM_MODE_ENTER_REMINDER,
        {
          kind: 'injection',
          variant: 'swarm_mode',
        },
      );
    }
  }

  exit(): void {
    const state = this.wire.getModel(SwarmModel);
    if (state === null) return;
    const history = this.context.get();
    const last = history[history.length - 1];
    const willPop =
      last?.origin?.kind === 'injection' && last.origin.variant === 'swarm_mode';
    this.wire.dispatch(swarmExit({}));
    if (state.trigger === 'tool') return;
    if (willPop) {
      this.eventBus.publish({
        type: 'context.spliced',
        start: history.length - 1,
        deleteCount: 1,
        messages: [],
      });
      return;
    }
    this.reminders.appendSystemReminder(SWARM_MODE_EXIT_REMINDER, {
      kind: 'injection',
      variant: 'swarm_mode_exit',
    });
  }

  get isActive(): boolean {
    return this.wire.getModel(SwarmModel) !== null;
  }

  get activeVariant(): SwarmModeVariant | undefined {
    return this.wire.getModel(SwarmModel)?.variant;
  }

  private get shouldAutoExit(): boolean {
    const trigger = this.wire.getModel(SwarmModel)?.trigger;
    return trigger === 'task' || trigger === 'tool';
  }
}

registerScopedService(
  LifecycleScope.Agent,
  IAgentSwarmService,
  AgentSwarmService,
  InstantiationType.Eager,
  'swarm',
);
