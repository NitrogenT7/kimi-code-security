/**
 * UpdateGoalTool — the model's single lever over the goal lifecycle. It updates
 * the goal's status directly; the turn driver reads the status at each turn
 * boundary and stops (`complete` / `blocked`) or keeps going (`active`).
 *
 * Two modes:
 * - Status (`active` / `complete` / `blocked`): the status is the
 *   machine-readable signal; the model explains itself in its own reply.
 * - First-turn content rewrite (`objective` / `purpose` /
 *   `completionCriterion`): restructures a lightweight goal into the
 *   four-element commander's-intent format. Only allowed during the first
 *   turn (`turnsUsed <= 1`); afterwards changes are rejected.
 * Registered for the main agent only, mirroring v1's
 * `agent.type === 'main'` gate.
 */

import { z } from 'zod';

import { toInputJsonSchema } from '#/tool/input-schema';
import { IAgentScopeContext } from '#/agent/scopeContext/scopeContext';
import type { BuiltinTool, ToolExecution } from '#/tool/toolContract';
import { registerTool } from '#/agent/toolRegistry/toolContribution';

import { IAgentGoalService } from '#/agent/goal/goal';
import {
  buildGoalBlockedReasonPrompt,
  buildGoalCompletionSummaryPrompt,
} from './outcome-prompts';
import { goalForModel } from './serialize';
import DESCRIPTION from './update-goal.md?raw';

export const UpdateGoalToolInputSchema = z
  .object({
    status: z
      .enum(['active', 'complete', 'blocked'])
      .optional()
      .describe(
        'The lifecycle status to set for the current goal. Use `blocked` for impossible, unsafe, or contradictory objectives, or after the same non-terminal blocking condition repeats for at least 3 consecutive goal turns.',
      ),
    objective: z
      .string()
      .optional()
      .describe(
        'Rewrite the goal objective into a structured four-element format: [Purpose] / [Key Tasks] / [End State] / [Constraints]. ' +
          'Only allowed during the first turn (turnsUsed <= 1) of a lightweight goal; afterwards changes are rejected. ' +
          "Do not change the user's original intent, only structure it.",
      ),
    purpose: z
      .string()
      .optional()
      .describe(
        'Extract the purpose from the objective. Only allowed during the first turn (turnsUsed <= 1).',
      ),
    completionCriterion: z
      .string()
      .optional()
      .describe(
        'Extract the end-state / completion criterion from the objective. Only allowed during the first turn (turnsUsed <= 1).',
      ),
  })
  .strict()
  .refine(
    (data) =>
      data.status !== undefined ||
      data.objective !== undefined ||
      data.purpose !== undefined ||
      data.completionCriterion !== undefined,
    {
      message: 'At least one of status, objective, purpose, or completionCriterion must be provided.',
    },
  );

export type UpdateGoalToolInput = z.infer<typeof UpdateGoalToolInputSchema>;

export class UpdateGoalTool implements BuiltinTool<UpdateGoalToolInput> {
  readonly name = 'UpdateGoal' as const;
  readonly description: string = DESCRIPTION;
  readonly parameters: Record<string, unknown> = toInputJsonSchema(UpdateGoalToolInputSchema);

  constructor(@IAgentGoalService private readonly goal: IAgentGoalService) {}

  resolveExecution(args: UpdateGoalToolInput): ToolExecution {
    const hasContentUpdate =
      args.objective !== undefined ||
      args.purpose !== undefined ||
      args.completionCriterion !== undefined;
    if (!hasContentUpdate && !isUpdateGoalStatus(args.status)) {
      return {
        isError: true,
        output: 'Invalid goal status. Use `active`, `complete`, or `blocked`.',
      };
    }

    const status = args.status;
    const currentGoal = this.goal.getGoal().goal;
    const goalIsActive = currentGoal?.status === 'active';

    if (hasContentUpdate) {
      return {
        description: 'Rewriting goal into four-element format',
        stopBatchAfterThis: false,
        approvalRule: this.name,
        execute: async ({ turnId }) => {
          const goalAtExecution = this.goal.getGoal().goal;
          if (goalAtExecution === null) {
            return { output: 'Goal not rewritten: no current goal.' };
          }
          if (
            goalAtExecution.goalId !== currentGoal?.goalId &&
            !this.goal.isGoalToolTarget(turnId, goalAtExecution.goalId)
          ) {
            return { output: 'Goal not rewritten: the current goal changed.' };
          }
          const rewritten = await this.goal.rewriteGoalContent(
            {
              objective: args.objective,
              purpose: args.purpose,
              completionCriterion: args.completionCriterion,
            },
            'model',
          );
          return { output: JSON.stringify({ goal: goalForModel(rewritten) }, null, 2) };
        },
      };
    }

    return {
      description: `Setting goal status: ${status}`,
      stopBatchAfterThis: status !== 'active' && goalIsActive,
      approvalRule: this.name,
      execute: async ({ turnId }) => {
        const goalAtExecution = this.goal.getGoal().goal;
        if (goalAtExecution === null || (currentGoal === null && status === 'active')) {
          return { output: missingGoalOutput(status) };
        }
        if (
          goalAtExecution.goalId !== currentGoal?.goalId &&
          !this.goal.isGoalToolTarget(turnId, goalAtExecution.goalId)
        ) {
          return { output: changedGoalOutput(status) };
        }
        if (status === 'active') {
          await this.goal.resumeGoal({}, 'model');
          return { output: 'Goal resumed.' };
        }
        if (status === 'complete') {
          const completed = await this.goal.markComplete({}, 'model');
          if (completed === null) {
            return { output: 'Goal not completed: no active goal.' };
          }
          return { output: buildGoalCompletionSummaryPrompt(completed), stopTurn: true };
        }
        if (status === 'blocked') {
          const blocked = await this.goal.markBlocked({}, 'model');
          if (blocked === null) {
            return { output: 'Goal not blocked: no active goal.' };
          }
          return { output: buildGoalBlockedReasonPrompt(blocked), stopTurn: true };
        }
        return {
          isError: true,
          output: 'Invalid goal status. Use `active`, `complete`, or `blocked`.',
        };
      },
    };
  }
}

function isUpdateGoalStatus(status: unknown): status is 'active' | 'complete' | 'blocked' {
  return status === 'active' || status === 'complete' || status === 'blocked';
}

function missingGoalOutput(status: UpdateGoalToolInput['status']): string {
  if (status === 'active') return 'Goal not resumed: no current goal.';
  if (status === 'complete') return 'Goal not completed: no active goal.';
  return 'Goal not blocked: no active goal.';
}

function changedGoalOutput(status: UpdateGoalToolInput['status']): string {
  if (status === 'active') return 'Goal not resumed: the current goal changed.';
  if (status === 'complete') return 'Goal not completed: the current goal changed.';
  return 'Goal not blocked: the current goal changed.';
}

registerTool(UpdateGoalTool, {
  when: (accessor) => accessor.get(IAgentScopeContext).agentId === 'main',
});
