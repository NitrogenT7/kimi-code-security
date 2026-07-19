/**
 * `todo` domain (L4) — pure stale-todo reminder logic.
 *
 * Computes the `todo_list_reminder` context injection from the agent's
 * context history (turns since the last `TodoList` write / last reminder)
 * and the current session question list. Beyond the plain staleness nudge it
 * detects investigation-specific stalls: questions stuck in `investigating`
 * without recorded evidence, and parent questions still `investigating`
 * after all their sub-questions reached a terminal status. No scoped state —
 * `SessionTodoService` supplies the inputs and registers the provider into
 * each agent's context injector.
 */

import type { ContextMessage } from '#/agent/contextMemory/types';

import {
  TODO_LIST_TOOL_NAME,
  type QuestionStatus,
  type TodoItem,
} from './todoItem';

export const TODO_LIST_REMINDER_VARIANT = 'todo_list_reminder';

const TODO_LIST_REMINDER_TURNS_SINCE_WRITE = 10;
const TODO_LIST_REMINDER_TURNS_BETWEEN_REMINDERS = 10;

interface TodoListReminderInput {
  readonly active: boolean;
  readonly history: readonly ContextMessage[];
  readonly todos: readonly TodoItem[];
}

interface TodoListReminderTurnCounts {
  readonly turnsSinceLastWrite: number;
  readonly turnsSinceLastReminder: number;
}

export function todoListStaleReminder(input: TodoListReminderInput): string | undefined {
  if (!input.active) return undefined;

  const counts = getTodoListReminderTurnCounts(input.history);
  if (
    counts.turnsSinceLastWrite < TODO_LIST_REMINDER_TURNS_SINCE_WRITE ||
    counts.turnsSinceLastReminder < TODO_LIST_REMINDER_TURNS_BETWEEN_REMINDERS
  ) {
    return undefined;
  }

  return renderTodoListReminder(input.todos);
}

function getTodoListReminderTurnCounts(
  history: readonly ContextMessage[],
): TodoListReminderTurnCounts {
  let foundWrite = false;
  let foundReminder = false;
  let turnsSinceLastWrite = 0;
  let turnsSinceLastReminder = 0;

  for (let i = history.length - 1; i >= 0; i -= 1) {
    const message = history[i];
    if (message === undefined) continue;

    if (message.role === 'assistant') {
      if (!foundWrite && hasTodoListWrite(message)) {
        foundWrite = true;
      }
      if (!foundWrite) turnsSinceLastWrite += 1;
      if (!foundReminder) turnsSinceLastReminder += 1;
      continue;
    }

    if (!foundReminder && isTodoListReminder(message)) {
      foundReminder = true;
    }

    if (foundWrite && foundReminder) break;
  }

  return {
    turnsSinceLastWrite,
    turnsSinceLastReminder,
  };
}

function hasTodoListWrite(message: ContextMessage): boolean {
  return message.toolCalls.some((toolCall) => {
    if (toolCall.name !== TODO_LIST_TOOL_NAME) return false;
    if (typeof toolCall.arguments !== 'string') return false;

    try {
      const args = JSON.parse(toolCall.arguments) as { todos?: unknown };
      return Array.isArray(args.todos);
    } catch {
      return false;
    }
  });
}

function isTodoListReminder(message: ContextMessage): boolean {
  return (
    message.origin?.kind === 'injection' &&
    message.origin.variant === TODO_LIST_REMINDER_VARIANT
  );
}

function hasStalledInvestigating(todos: readonly TodoItem[]): boolean {
  return todos.some(
    (item) =>
      item.status === 'investigating' &&
      (item.evidence === undefined || item.evidence.length === 0),
  );
}

function hasUnresolvedParentWithResolvedChildren(todos: readonly TodoItem[]): boolean {
  const childStatuses = new Map<string, QuestionStatus[]>();
  for (const item of todos) {
    if (item.parentId && item.status) {
      const statuses = childStatuses.get(item.parentId) ?? [];
      statuses.push(item.status);
      childStatuses.set(item.parentId, statuses);
    }
  }
  for (const [parentId, statuses] of childStatuses) {
    const parent = todos.find((t) => t.id === parentId);
    if (!parent || parent.status !== 'investigating') continue;
    const allTerminal = statuses.every((s) => s === 'resolved' || s === 'inconclusive');
    if (allTerminal) return true;
  }
  return false;
}

function renderTodoListReminder(todos: readonly TodoItem[]): string {
  const lines: string[] = [];

  const hasStalled = hasStalledInvestigating(todos);
  const hasUnresolvedParent = hasUnresolvedParentWithResolvedChildren(todos);

  if (!hasStalled && !hasUnresolvedParent) {
    lines.push(
      'The TodoList tool has not been updated recently. If you are working on questions that benefit from tracking, ' +
        'consider using TodoList to update question status. Also consider clearing or rewriting the list if it has become ' +
        'stale. This is a gentle reminder; ignore it if not applicable. Make sure that you NEVER mention this reminder to the user.',
    );
  } else {
    if (hasStalled) {
      lines.push(
        'Some questions remain in "investigating" status without recorded evidence. ' +
          'Review each: if you have collected evidence, update the evidence list. ' +
          'If you are stuck, consider breaking the question into sub-questions, or mark it as "inconclusive". ' +
          'If you can answer it, set a conclusion and mark it "resolved".',
      );
    }
    if (hasUnresolvedParent) {
      lines.push(
        'All sub-questions of a parent question have been resolved, but the parent question is still "investigating". ' +
          'Review the sub-question conclusions and update the parent question accordingly ' +
          '(add evidence, set conclusion, and mark resolved if appropriate).',
      );
    }
    lines.push('Make sure that you NEVER mention this reminder to the user.');
  }

  const items = renderTodoItems(todos);
  if (items.length > 0) {
    lines.push(`\nCurrent question list:\n${items}`);
  }

  return lines.join('\n');
}

function renderTodoItems(todos: readonly TodoItem[]): string {
  if (todos.length === 0) return '';

  const rootItems = todos.filter((t) => !t.parentId);
  const childMap = new Map<string, TodoItem[]>();
  for (const t of todos) {
    if (t.parentId) {
      const siblings = childMap.get(t.parentId) ?? [];
      siblings.push(t);
      childMap.set(t.parentId, siblings);
    }
  }

  const lines: string[] = [];
  let index = 1;
  for (const parent of rootItems) {
    lines.push(formatIndexedItem(index, parent));
    const children = childMap.get(parent.id) ?? [];
    let childIndex = 1;
    for (const child of children) {
      const prefix = `  ${index}.${childIndex}`;
      const evidenceHint =
        Array.isArray(child.evidence) && child.evidence.length > 0
          ? ` (${child.evidence.length} evidence items)`
          : '';
      lines.push(`  ${prefix}. [${child.status}] ${child.question}${evidenceHint}`);
      childIndex += 1;
    }
    index += 1;
  }
  return lines.join('\n');
}

function formatIndexedItem(index: number, item: TodoItem): string {
  const evidenceHint =
    Array.isArray(item.evidence) && item.evidence.length > 0
      ? ` (${item.evidence.length} evidence items)`
      : '';
  const subHint =
    Array.isArray(item.subQuestions) && item.subQuestions.length > 0
      ? ` (${item.subQuestions.length} sub-questions)`
      : '';
  return `${index}. [${item.status}] ${item.question}${subHint}${evidenceHint}`;
}
