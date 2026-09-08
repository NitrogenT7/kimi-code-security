import type { ToolExecution } from '#/tool/toolContract';
import { toInputJsonSchema } from '#/tool/input-schema';

import { ISessionNotepadService } from '#/features/notepad/sessionNotepad';
import { NOTEPAD_TOOL_NAME } from '#/features/notepad/notepadContent';

import {
  INotepadTool,
  NotepadInputSchema,
  type NotepadInput,
} from './notepad';
import DESCRIPTION from './notepad.md?raw';

export class NotepadTool implements INotepadTool {
  declare readonly _serviceBrand: undefined;
  readonly name = NOTEPAD_TOOL_NAME;
  readonly description: string = DESCRIPTION;
  readonly parameters: Record<string, unknown> = toInputJsonSchema(NotepadInputSchema);

  constructor(
    @ISessionNotepadService private readonly notepad: ISessionNotepadService,
  ) {}

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
