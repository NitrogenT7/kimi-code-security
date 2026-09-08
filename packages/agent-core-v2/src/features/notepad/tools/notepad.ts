import { z } from 'zod';

import { createDecorator } from '#/_base/di/instantiation';
import type { AgentTool } from '#/tool/toolContract';

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

export interface INotepadTool extends AgentTool<NotepadInput> {
  readonly _serviceBrand: undefined;
}
export const INotepadTool = createDecorator<INotepadTool>('notepadTool');
