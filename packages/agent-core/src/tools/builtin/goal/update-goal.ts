/**
 * UpdateGoalTool — the model's single lever over the goal lifecycle. It updates
 * the goal's status directly; the turn driver reads the status at each turn
 * boundary and stops (`complete` / `blocked`) or keeps going (`active`).
 *
 * The argument is intentionally just a status enum — no reason or evidence. The
 * model explains itself in its own reply; the status is the machine-readable
 * signal. The tool stays visible to the main agent even when no goal is active;
 * goal-store operations decide whether a requested transition is valid.
 */

import { z } from 'zod';

import type { Agent } from '#/agent';

import type { BuiltinTool } from '../../../agent/tool';
import type { ToolExecution } from '../../../loop/types';
import { toInputJsonSchema } from '../../support/input-schema';
import { buildGoalBlockedReasonPrompt, buildGoalCompletionSummaryPrompt } from './outcome-prompts';
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
      message:
        'At least one of status, objective, purpose, or completionCriterion must be provided.',
    },
  );

export type UpdateGoalToolInput = z.infer<typeof UpdateGoalToolInputSchema>;

export class UpdateGoalTool implements BuiltinTool<UpdateGoalToolInput> {
  readonly name = 'UpdateGoal' as const;
  readonly description: string = DESCRIPTION;
  readonly parameters: Record<string, unknown> = toInputJsonSchema(UpdateGoalToolInputSchema);

  constructor(private readonly agent: Agent) {}

  resolveExecution(args: UpdateGoalToolInput): ToolExecution {
    const goal = this.agent.goal;
    const currentGoal = goal.getGoal().goal;
    const goalIsActive = currentGoal?.status === 'active';
    const hasContentUpdate =
      args.objective !== undefined ||
      args.purpose !== undefined ||
      args.completionCriterion !== undefined;

    if (hasContentUpdate) {
      return {
        description: 'Rewriting goal into four-element format',
        stopBatchAfterThis: args.status !== undefined && args.status !== 'active' && goalIsActive,
        approvalRule: this.name,
        execute: async () => {
          const rewritten = await goal.rewriteGoalContent(
            {
              objective: args.objective,
              purpose: args.purpose,
              completionCriterion: args.completionCriterion,
            },
            'model',
          );
          return { output: JSON.stringify({ goal: rewritten }, null, 2) };
        },
      };
    }

    if (!isUpdateGoalStatus(args.status)) {
      return {
        isError: true,
        output: 'Invalid goal status. Use `active`, `complete`, or `blocked`.',
      };
    }

    const status = args.status;

    return {
      description: `Setting goal status: ${status}`,
      stopBatchAfterThis: status !== 'active' && goalIsActive,
      approvalRule: this.name,
      execute: async () => {
        if (status === 'active') {
          if (currentGoal === null) {
            return { output: 'Goal not resumed: no current goal.' };
          }
          await goal.resumeGoal({}, 'model');
          return { output: 'Goal resumed.' };
        }
        if (status === 'complete') {
          const completed = await goal.markComplete({}, 'model');
          if (completed === null) {
            return { output: 'Goal not completed: no active goal.' };
          }
          const output = buildGoalCompletionSummaryPrompt(completed);
          return { output, stopTurn: true };
        }
        if (status === 'blocked') {
          const blocked = await goal.markBlocked({}, 'model');
          if (blocked === null) {
            return { output: 'Goal not blocked: no active goal.' };
          }
          const output = buildGoalBlockedReasonPrompt(blocked);
          return { output, stopTurn: true };
        }
        return {
          isError: true,
          output: 'Invalid goal status. Use `active`, `complete`, or `blocked`.',
        };
      },
    };
  }
}

function isUpdateGoalStatus(status: unknown): status is UpdateGoalToolInput['status'] {
  return status === 'active' || status === 'complete' || status === 'blocked';
}
