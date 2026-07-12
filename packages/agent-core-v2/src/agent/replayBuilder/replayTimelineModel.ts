/**
 * `replayBuilder` domain — `ReplayTimelineModel`, a derived wire model that
 * folds heterogeneous Ops from multiple domains into a single ordered timeline.
 *
 * This is the v2 replacement for v1's imperative `ReplayBuilder` class: instead
 * of each domain service pushing records into a mutable accumulator, the model
 * declares which Op types it reduces and the wire engine folds them
 * automatically — during both `replay` (silent) and `dispatch` (live).
 *
 * The timeline entries are op-native: they carry the raw op payloads, not the
 * v1 `AgentReplayRecordPayload` DTO shape. The projection to the SDK/edge DTO
 * (e.g. computing `GoalSnapshot` from `GoalState`) is a read-time concern, not
 * a reduce-time concern.
 */

import {
  contextAppendMessage,
  contextApplyCompaction,
  type ContextCompactionPayload,
  type ContextMessagePayload,
} from '#/agent/contextMemory/contextOps';
import {
  fullCompactionBegin,
  fullCompactionCancel,
  fullCompactionComplete,
  type FullCompactionBeginPayload,
  type FullCompactionCompletePayload,
} from '#/agent/fullCompaction/compactionOps';
import {
  clearGoal,
  createGoal,
  updateGoal,
  type GoalCreatePayload,
  type GoalUpdatePayload,
} from '#/agent/goal/goalOps';
import {
  planModeCancel,
  planModeEnter,
  planModeExit,
  type PlanModeEnterPayload,
  type PlanModeIdPayload,
} from '#/agent/plan/planOps';
import { configUpdate, type ConfigUpdatePayload } from '#/agent/profile/profileOps';
import type { PermissionMode } from '#/agent/permissionPolicy/types';
import { setMode } from '#/agent/permissionMode/permissionModeOps';
import type { PermissionApprovalResultRecord } from '#/agent/permissionRules/permissionRules';
import { recordApprovalResult } from '#/agent/permissionRules/permissionRulesOps';
import { type DerivedModelDef, defineDerivedModel } from '#/wire/model';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function defineDerivedTimeline<M extends Record<string, (payload: any) => any>>(
  name: string,
  mappers: M,
): DerivedModelDef<readonly ReturnType<M[keyof M]>[]> {
  type E = ReturnType<M[keyof M]>;
  const reducers: Record<string, (s: readonly E[], p: unknown) => readonly E[]> = {};
  for (const opType of Object.keys(mappers)) {
    reducers[opType] = (s, p) => [...s, mappers[opType]!(p)];
  }
  return defineDerivedModel(name, () => [], reducers);
}

export const ReplayTimelineModel = defineDerivedTimeline('agent.replayTimeline', {
  [contextAppendMessage.type]: (p: ContextMessagePayload) =>
    ({ type: contextAppendMessage.type, payload: p }) as const,

  [contextApplyCompaction.type]: (p: ContextCompactionPayload) =>
    ({ type: contextApplyCompaction.type, payload: p }) as const,

  [fullCompactionBegin.type]: (p: FullCompactionBeginPayload) =>
    ({ type: fullCompactionBegin.type, payload: p }) as const,

  [fullCompactionCancel.type]: () =>
    ({ type: fullCompactionCancel.type }) as const,

  [fullCompactionComplete.type]: (p: FullCompactionCompletePayload) =>
    ({ type: fullCompactionComplete.type, payload: p }) as const,

  [createGoal.type]: (p: GoalCreatePayload) =>
    ({ type: createGoal.type, payload: p }) as const,

  [updateGoal.type]: (p: GoalUpdatePayload) =>
    ({ type: updateGoal.type, payload: p }) as const,

  [clearGoal.type]: () =>
    ({ type: clearGoal.type }) as const,

  [planModeEnter.type]: (p: PlanModeEnterPayload) =>
    ({ type: planModeEnter.type, payload: p }) as const,

  [planModeCancel.type]: (p: PlanModeIdPayload) =>
    ({ type: planModeCancel.type, payload: p }) as const,

  [planModeExit.type]: (p: PlanModeIdPayload) =>
    ({ type: planModeExit.type, payload: p }) as const,

  [configUpdate.type]: (p: ConfigUpdatePayload) =>
    ({ type: configUpdate.type, payload: p }) as const,

  [setMode.type]: (p: { mode: PermissionMode }) =>
    ({ type: setMode.type, payload: p }) as const,

  [recordApprovalResult.type]: (p: PermissionApprovalResultRecord) =>
    ({ type: recordApprovalResult.type, payload: p }) as const,
});

type InferTimelineEntry<D> = D extends DerivedModelDef<readonly (infer E)[]> ? E : never;

export type ReplayTimelineEntry = InferTimelineEntry<typeof ReplayTimelineModel>;
export type ReplayTimeline = readonly ReplayTimelineEntry[];
