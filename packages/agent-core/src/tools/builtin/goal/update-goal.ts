/**
 * UpdateGoalTool — the model's single lever over the goal lifecycle. It updates
 * the goal's status directly; the turn driver reads the status at each turn
 * boundary and stops (`complete` / `blocked` / `paused`) or keeps going
 * (`active`).
 *
 * The argument is intentionally just a status enum — no reason or evidence. The
 * model explains itself in its own reply; the status is the machine-readable
 * signal. The tool is only offered to the model while a goal exists (see the
 * `loopTools` filter in the tool manager).
 */

import type { Agent } from '#/agent';
import { z } from 'zod';

import {
  GOAL_BLOCKED_REMINDER_NAME,
  GOAL_COMPLETION_REMINDER_NAME,
} from '../../../agent/turn';
import {
  buildGoalBlockedReasonPrompt,
  buildGoalCompletionSummaryPrompt,
} from './outcome-prompts';
import type { BuiltinTool } from '../../../agent/tool';
import type { ToolExecution } from '../../../loop/types';
import { toInputJsonSchema } from '../../support/input-schema';
import DESCRIPTION from './update-goal.md?raw';

export const UpdateGoalToolInputSchema = z
  .object({
    status: z
      .enum(['active', 'complete', 'paused', 'blocked'])
      .optional()
      .describe('The lifecycle status to set for the current goal.'),
    objective: z
      .string()
      .optional()
      .describe(
        'Rewrite the goal objective into a structured four-element format: [Purpose] / [Key Tasks] / [End State] / [Constraints]. ' +
          'Only allowed during the first turn (turnsUsed <= 1) of a lightweight goal; afterwards changes are rejected. ' +
          'Do not change the user\'s original intent, only structure it.',
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
    (data) => data.status !== undefined || data.objective !== undefined || data.purpose !== undefined || data.completionCriterion !== undefined,
    { message: 'At least one of status, objective, purpose, or completionCriterion must be provided.' },
  );

export type UpdateGoalToolInput = z.infer<typeof UpdateGoalToolInputSchema>;

export class UpdateGoalTool implements BuiltinTool<UpdateGoalToolInput> {
  readonly name = 'UpdateGoal' as const;
  readonly description: string = DESCRIPTION;
  readonly parameters: Record<string, unknown> = toInputJsonSchema(UpdateGoalToolInputSchema);

  constructor(private readonly agent: Agent) {}

  resolveExecution(args: UpdateGoalToolInput): ToolExecution {
    const goal = this.agent.goal;
    const hasContentUpdate =
      args.objective !== undefined || args.purpose !== undefined || args.completionCriterion !== undefined;

    return {
      description: hasContentUpdate
        ? 'Rewriting goal into four-element format'
        : `Setting goal status: ${args.status ?? 'unchanged'}`,
      stopBatchAfterThis: args.status !== undefined && args.status !== 'active',
      approvalRule: this.name,
      execute: async () => {
        if (hasContentUpdate) {
          const rewritten = await goal.rewriteGoalContent(
            {
              objective: args.objective,
              purpose: args.purpose,
              completionCriterion: args.completionCriterion,
            },
            'model',
          );
          return { output: JSON.stringify({ goal: rewritten }, null, 2) };
        }

        const status = args.status;
        if (status === undefined) {
          return { output: 'No changes requested.' };
        }
        if (status === 'active') {
          await goal.resumeGoal({}, 'model');
          return { output: 'Goal resumed.' };
        }
        if (status === 'complete') {
          const completed = await goal.markComplete({}, 'model');
          // `complete` is transient: markComplete announces then clears the
          // record. Store the summary request as a system reminder, so the next
          // provider request ends with a user message after the UpdateGoal tool
          // result. Anthropic-compatible providers reject trailing assistant
          // messages as unsupported prefill.
          if (completed !== null) {
            this.agent.context.appendSystemReminder(buildGoalCompletionSummaryPrompt(completed), {
              kind: 'system_trigger',
              name: GOAL_COMPLETION_REMINDER_NAME,
            });
          }
          return { output: 'Goal marked complete.', stopTurn: true };
        }
        if (status === 'blocked') {
          const blocked = await goal.markBlocked({}, 'model');
          if (blocked !== null) {
            this.agent.context.appendSystemReminder(buildGoalBlockedReasonPrompt(blocked), {
              kind: 'system_trigger',
              name: GOAL_BLOCKED_REMINDER_NAME,
            });
          }
          return { output: 'Goal marked blocked.', stopTurn: true };
        }
        await goal.pauseGoal({}, 'model');
        return { output: 'Goal paused.', stopTurn: true };
      },
    };
  }
}
