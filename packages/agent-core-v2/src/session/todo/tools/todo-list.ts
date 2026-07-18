/**
 * `todo` domain (L4) — `TodoListTool`, the structured question-driven
 * investigation tracker.
 *
 * A single tool serves both reads and writes:
 *
 *   - `resolveExecution({ todos: [...] })` — replace the full list
 *   - `resolveExecution({ todos: [] })`    — clear the list
 *   - `resolveExecution({})`               — query the current list
 *
 * Each item is a question to answer (with hypothesis, evidence chain,
 * blockers, confidence, and depth), not a task. Legacy `{ title, status }`
 * items are migrated on the fly. Resolved/inconclusive items dropped from the
 * replacement list are archived into the findings store by
 * `ISessionTodoService`. The list is session-shared: the tool reads/writes
 * `ISessionTodoService`, which persists every change as a
 * `tools.update_store` wire record on the main agent. Self-registers via
 * `registerTool(TodoListTool)` at module load; the Eager
 * `AgentBuiltinToolsRegistrar` instantiates one per agent (resolving the
 * Session-scope `ISessionTodoService` from the parent scope) and registers it
 * into that agent's tool registry — never from a service constructor, which
 * would re-enter `ISessionTodoService` while it is still being constructed.
 */

import { randomUUID } from 'node:crypto';

import { z } from 'zod';

import { registerTool } from '#/agent/toolRegistry/toolContribution';
import type { BuiltinTool, ToolExecution } from '#/tool/toolContract';
import { toInputJsonSchema } from '#/tool/input-schema';

import { ISessionTodoService } from '#/session/todo/sessionTodo';
import {
  TODO_LIST_TOOL_NAME,
  isOldFormatTodo,
  migrateOldTodo,
  normalizeQuestionItem,
  renderTodoList,
  validateTodoItem,
  type Confidence,
  type Depth,
  type EvidenceItem,
  type QuestionItem,
  type QuestionStatus,
  QuestionItemSchema,
} from '#/session/todo/todoItem';

import DESCRIPTION from './todo-list.md?raw';
import TODO_LIST_WRITE_REMINDER from './todo-list-write-reminder.md?raw';

export interface TodoListInput {
  todos?: Array<unknown>;
}

// The array items MUST advertise the real question-item shape. With
// `z.unknown()` items the advertised JSON schema degenerates to `items: {}`
// ("anything"), which providers may further mangle (e.g. into
// `items: {type: 'string'}`) — the model then submits plain strings and the
// runtime validation rejects them. In the input view the `.default([])`
// fields become optional, so the advertised required set is exactly what
// `looksLikeQuestionItem` enforces.
export const TodoListInputSchema: z.ZodType<TodoListInput> = z.object({
  todos: z
    .array(QuestionItemSchema)
    .optional()
    .describe(
      'The updated todo list. Omit to read the current list. Pass an empty array to clear.',
    ),
});

export class TodoListTool implements BuiltinTool<TodoListInput> {
  readonly name = TODO_LIST_TOOL_NAME;
  readonly description: string = DESCRIPTION;
  readonly parameters: Record<string, unknown> = toInputJsonSchema(TodoListInputSchema);

  constructor(@ISessionTodoService private readonly todo: ISessionTodoService) {}

  resolveExecution(args: TodoListInput): ToolExecution {
    const description =
      args.todos === undefined
        ? 'Reading question list'
        : args.todos.length === 0
          ? 'Clearing question list'
          : 'Updating question list';
    return {
      description,
      approvalRule: this.name,
      execute: async () => {
        try {
          if (args.todos === undefined) {
            return { isError: false, output: renderTodoList(this.todo.getTodos()) };
          }

          for (let i = 0; i < args.todos.length; i++) {
            const err = validateTodoItem(args.todos[i]);
            if (err !== null) {
              return { isError: true, output: `Item at index ${i}: ${err}` };
            }
          }

          const normalized: QuestionItem[] = args.todos.map((item) => {
            if (isOldFormatTodo(item)) return migrateOldTodo(item);
            try {
              const raw = item as Record<string, unknown>;
              if (
                !raw['id'] ||
                (typeof raw['id'] === 'string' && raw['id'].trim().length === 0)
              ) {
                raw['id'] = randomUUID();
              }
              return normalizeQuestionItem(raw);
            } catch {
              const r = item as Record<string, unknown>;
              return {
                type: 'question',
                id:
                  typeof r['id'] === 'string' && r['id'].trim().length > 0
                    ? r['id']
                    : randomUUID(),
                question: typeof r['question'] === 'string' ? r['question'] : 'Unknown question',
                status: (
                  ['pending', 'investigating', 'resolved', 'inconclusive'] as const
                ).includes(r['status'] as never)
                  ? (r['status'] as QuestionStatus)
                  : 'pending',
                evidence: Array.isArray(r['evidence']) ? (r['evidence'] as EvidenceItem[]) : [],
                blockers: Array.isArray(r['blockers']) ? (r['blockers'] as string[]) : [],
                confidence: (['low', 'medium', 'high'] as const).includes(
                  r['confidence'] as never,
                )
                  ? (r['confidence'] as Confidence)
                  : 'medium',
                depth: (['quick', 'deep'] as const).includes(r['depth'] as never)
                  ? (r['depth'] as Depth)
                  : 'deep',
                subQuestions: Array.isArray(r['subQuestions'])
                  ? (r['subQuestions'] as string[])
                  : [],
                hypothesis: typeof r['hypothesis'] === 'string' ? r['hypothesis'] : undefined,
                conclusion: typeof r['conclusion'] === 'string' ? r['conclusion'] : undefined,
                parentId: typeof r['parentId'] === 'string' ? r['parentId'] : undefined,
              };
            }
          });

          for (const item of normalized) {
            if (item.parentId) {
              const parent = normalized.find((p) => p.id === item.parentId);
              if (!parent) {
                return {
                  isError: true,
                  output: `Item "${item.question}" references parentId "${item.parentId}" which does not exist in the list.`,
                };
              }
              if (parent.parentId) {
                return {
                  isError: true,
                  output: `Item "${item.question}" is nested too deep. Maximum nesting is 2 levels (parent → child).`,
                };
              }
            }
          }

          this.todo.setTodos(normalized);
          const stored = this.todo.getTodos();
          const output =
            stored.length === 0
              ? 'Question list cleared.'
              : `Question list updated.\n${renderTodoList(stored)}\n\n${TODO_LIST_WRITE_REMINDER.trim()}`;
          return { isError: false, output };
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

registerTool(TodoListTool);
