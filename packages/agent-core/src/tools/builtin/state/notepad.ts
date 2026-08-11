/**
 * NotepadTool — agent-owned free-form persistent memo buffer.
 *
 * A single tool serves reads and all three mutations:
 *
 *   - `resolveExecution({ content })` — replace the full content (`''` clears)
 *   - `resolveExecution({ append })`  — append text to the current content
 *   - `resolveExecution({})`          — read the current content
 *
 * Unlike TodoList (structured investigation state) or the plan file (a single
 * implementation plan under approval), the notepad carries whatever free-form
 * notes the model wants to keep across context compaction. The full
 * compaction service appends the content to the compacted summary so it
 * survives the trimmed context. The user can inspect and edit the same buffer
 * through the `/notepad` slash command.
 *
 * Storage: the content lives in the agent-level tool store under
 * `NOTEPAD_STORE_KEY`. Writes go through `tools.update_store`, so the store
 * update is visible on wire replay (same vocabulary as the todo store).
 */

import { z } from 'zod';

import type { BuiltinTool } from '../../../agent/tool';
import type { ToolExecution } from '../../../loop/types';
import type { ToolStore } from '../../store';
import { toInputJsonSchema } from '../../support/input-schema';
import DESCRIPTION from './notepad.md?raw';

export const NOTEPAD_TOOL_NAME = 'Notepad' as const;
export const NOTEPAD_STORE_KEY = 'notepad';

declare module '../../store' {
  interface ToolStoreData {
    notepad: string;
  }
}

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

export function readNotepadContent(raw: unknown): string {
  return typeof raw === 'string' ? raw : '';
}

export function renderNotepad(content: string, title = '## Notepad'): string | undefined {
  const trimmed = content.trim();
  if (trimmed.length === 0) return undefined;
  return `${title}\n${trimmed}`;
}

export class NotepadTool implements BuiltinTool<NotepadInput> {
  readonly name = NOTEPAD_TOOL_NAME;
  readonly description: string = DESCRIPTION;
  readonly parameters: Record<string, unknown> = toInputJsonSchema(NotepadInputSchema);

  constructor(private readonly store: ToolStore) {}

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
            this.setContent(args.content);
            const stored = this.getContent();
            return {
              isError: false,
              output: stored.trim().length === 0 ? 'Notepad cleared.' : `Notepad updated.\n${stored}`,
            };
          }
          if (args.append !== undefined) {
            this.setContent(joinNotepad(this.getContent(), args.append));
            return { isError: false, output: `Notepad updated.\n${this.getContent()}` };
          }
          const content = this.getContent();
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

  private getContent(): string {
    return readNotepadContent(this.store.get(NOTEPAD_STORE_KEY));
  }

  private setContent(content: string): void {
    this.store.set(NOTEPAD_STORE_KEY, content);
  }
}

export function joinNotepad(current: string, text: string): string {
  if (current.length === 0) return text;
  return current.endsWith('\n') ? current + text : `${current}\n${text}`;
}
