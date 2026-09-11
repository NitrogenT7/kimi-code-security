import { randomUUID } from 'node:crypto';

import type { ToolExecution } from '#/tool/toolContract';
import { toInputJsonSchema } from '#/tool/input-schema';

import { IAgentTodoService } from '#/features/todo/todoService';
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
} from '#/features/todo/todoItem';

import {
  ITodoListTool,
  TodoListInputSchema,
  type TodoListInput,
} from './todo-list';
import DESCRIPTION from './todo-list.md?raw';
import TODO_LIST_WRITE_REMINDER from './todo-list-write-reminder.md?raw';

export class TodoListTool implements ITodoListTool {
  declare readonly _serviceBrand: undefined;
  readonly name = TODO_LIST_TOOL_NAME;
  readonly description: string = DESCRIPTION;
  readonly parameters: Record<string, unknown> = toInputJsonSchema(TodoListInputSchema);

  constructor(
    @IAgentTodoService private readonly todo: IAgentTodoService,
  ) {}

  resolveExecution(args: TodoListInput): ToolExecution {
    const description =
      args.todos === undefined
        ? 'Reading question list'
        : args.todos.length === 0
          ? 'Clearing question list'
          : 'Updating question list';
    return {
      description,
      display: {
        kind: 'todo_list',
        items: (args.todos ?? this.todo.get()).map((todo) => {
          const record = todo as Record<string, unknown>;
          return {
            title:
              typeof record['question'] === 'string'
                ? record['question']
                : typeof record['title'] === 'string'
                  ? record['title']
                  : '',
            status: typeof record['status'] === 'string' ? record['status'] : 'pending',
          };
        }),
      },
      approvalRule: this.name,
      execute: async () => {
        try {
          if (args.todos === undefined) {
            return { isError: false, output: renderTodoList(this.todo.get()) };
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

          await this.todo.replace(normalized);
          const stored = this.todo.get();
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
