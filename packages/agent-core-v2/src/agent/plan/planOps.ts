/**
 * `plan` domain (L4) — wire Model (`PlanModel`) and the `plan_mode.enter`
 * (`planModeEnter`) / `plan_mode.cancel` (`planModeCancel`) / `plan_mode.exit`
 * (`planModeExit`) Ops that mirror the plan-mode lifecycle into a persisted,
 * replayable `{ active, id }` state.
 *
 * The Model holds the persistent, replayable fields — whether plan mode is
 * active and the plan id. The persisted records carry exactly v1's field set
 * (`{ id }`); the plan file path is NOT persisted — it is derived from the id
 * at read time (`planService.planFilePathFor`), matching v1's `restoreEnter`.
 * Each `apply` returns the same reference on a no-op (re-entering the same
 * plan, or cancelling/exiting while already inactive) so the wire's
 * reference-equality gate stays quiet. The side effects — `telemetryContext`
 * mode, plan-directory/file fs I/O, and the `agent.status.updated` planMode
 * slice — are NOT part of `apply`: they run after `wire.dispatch` on the live
 * path, and `wire.replay` rebuilds the Model silently from the persisted
 * `plan_mode.*` records (seeded by `sessionLifecycle`). The legacy
 * `toReplay: plan_updated` projection is dropped (inert — nothing reads it).
 * Consumed by the Agent-scope `planService`.
 */

import { defineModel } from '#/wire/model';
import { defineOp } from '#/wire/op';

export interface PlanState {
  readonly active: boolean;
  readonly id?: string;
}

export const PlanModel = defineModel<PlanState>('plan', () => ({ active: false }));

export interface PlanModeEnterPayload {
  readonly id: string;
}

export const planModeEnter = defineOp(PlanModel, 'plan_mode.enter', {
  apply: (s, p: PlanModeEnterPayload): PlanState =>
    s.active && s.id === p.id ? s : { active: true, id: p.id },
  toEvent: () => ({ type: 'agent.status.updated' as const, planMode: true }),
});

export interface PlanModeIdPayload {
  readonly id?: string;
}

export const planModeCancel = defineOp(PlanModel, 'plan_mode.cancel', {
  apply: (s, _p: PlanModeIdPayload): PlanState => (s.active === false ? s : { active: false }),
  toEvent: () => ({ type: 'agent.status.updated' as const, planMode: false }),
});

export const planModeExit = defineOp(PlanModel, 'plan_mode.exit', {
  apply: (s, _p: PlanModeIdPayload): PlanState => (s.active === false ? s : { active: false }),
  toEvent: () => ({ type: 'agent.status.updated' as const, planMode: false }),
});
