/**
 * `notepad` domain (L4) — `NotepadTool`, the agent-owned free-form
 * persistent memo buffer.
 *
 * A single tool serves reads and all three mutations:
 *
 *   - `resolveExecution({ content })` — replace the full content (`''` clears)
 *   - `resolveExecution({ append })`  — append text to the current content
 *   - `resolveExecution({})`          — read the current content
 *
 * Unlike `TodoList` (structured investigation state) or the plan file (a
 * single implementation plan under approval), the notepad carries whatever
 * free-form notes the model wants to keep across context compaction. The
 * notepad is session-shared: the tool reads/writes `ISessionNotepadService`,
 * which persists every change as a `tools.update_store` wire record
 * (`key: 'notepad'`) on the main agent. Self-registers via
 * `registerTool(NotepadTool)` at module load; the Eager
 * `AgentBuiltinToolsRegistrar` instantiates one per agent (resolving the
 * Session-scope `ISessionNotepadService` from the parent scope).
 */

import { z } from 'zod';

import { registerTool } from '#/agent/toolRegistry/toolContribution';
import type { BuiltinTool, ToolExecution } from '#/tool/toolContract';
import { toInputJsonSchema } from '#/tool/input-schema';

import { NOTEPAD_TOOL_NAME } from '#/session/notepad/notepadContent';
import { ISessionNotepadService } from '#/session/notepad/sessionNotepad';

import DESCRIPTION from './notepad.md?raw';

export interface NotepadInput {
  content?: string;
  append?: string;
}

export const NotepadInputSchema: z.ZodType<NotepadInput> = z.object({
  content: z
    .string()
    .optional()
    .describe(
      'Replace the entire notepad with this text. Pass an empty string to clear the notepad.',
    ),
  append: z
    .string()
    .optional()
    .describe('Append this text to the end of the current notepad content.'),
});

export class NotepadTool implements BuiltinTool<NotepadInput> {
  readonly name = NOTEPAD_TOOL_NAME;
  readonly description: string = DESCRIPTION;
  readonly parameters: Record<string, unknown> = toInputJsonSchema(NotepadInputSchema);

  constructor(@ISessionNotepadService private readonly notepad: ISessionNotepadService) {}

  resolveExecution(args: NotepadInput): ToolExecution {
    const description =
      args.content !== undefined
        ? args.content.length === 0
          ? 'Clearing notepad'
          : 'Rewriting notepad'
        : args.append !== undefined
          ? 'Appending to notepad'
          : 'Reading notepad';
    return {
      description,
      approvalRule: this.name,
      execute: async () => {
        try {
          if (args.content !== undefined && args.append !== undefined) {
            return {
              isError: true,
              output: 'Pass either "content" (full replacement) or "append" (additive), not both.',
            };
          }
          if (args.content !== undefined) {
            this.notepad.setContent(args.content);
            const stored = this.notepad.getContent();
            return {
              isError: false,
              output:
                stored.trim().length === 0
                  ? 'Notepad cleared.'
                  : `Notepad updated.\n${stored}`,
            };
          }
          if (args.append !== undefined) {
            this.notepad.append(args.append);
            return { isError: false, output: `Notepad updated.\n${this.notepad.getContent()}` };
          }
          const content = this.notepad.getContent();
          return {
            isError: false,
            output: content.trim().length === 0 ? 'Notepad is empty.' : content,
          };
        } catch (error) {
          return {
            isError: true,
            output: `Internal error: ${error instanceof Error ? error.message : String(error)}`,
          };
        }
      },
    };
  }
}

registerTool(NotepadTool);
