import { z } from 'zod';

import { createDecorator } from '#/_base/di/instantiation';
import { type AgentTool } from '#/tool/toolContract';
import { QuestionItemSchema } from '#/features/todo/todoItem';

export interface TodoListInput {
  todos?: Array<unknown>;
}

export const TodoListInputSchema: z.ZodType<TodoListInput> = z.object({
  todos: z
    .array(QuestionItemSchema)
    .optional()
    .describe(
      'The updated todo list. Omit to read the current list. Pass an empty array to clear.',
    ),
});

export interface ITodoListTool extends AgentTool<TodoListInput> {
  readonly _serviceBrand: undefined;
}
export const ITodoListTool = createDecorator<ITodoListTool>('todoListTool');
