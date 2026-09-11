import { describe, expect, it } from 'vitest';

import type { ContextMessage } from '#/agent/contextMemory/types';
import type { QuestionItem, TodoItem } from '#/features/todo/todoItem';
import { todoListStaleReminder } from '#/features/todo/todoListReminder';

function makeQuestion(overrides: Partial<QuestionItem> & { question: string }): QuestionItem {
  return {
    type: 'question',
    id: `test-${Math.random().toString(36).slice(2, 8)}`,
    status: 'pending',
    evidence: [],
    blockers: [],
    confidence: 'medium',
    depth: 'deep',
    subQuestions: [],
    ...overrides,
  };
}

function assistantMessage(): ContextMessage {
  return {
    role: 'assistant',
    content: [{ type: 'text', text: 'working' }],
    toolCalls: [],
  };
}

function todoListWrite(todos: readonly TodoItem[]): ContextMessage {
  return {
    role: 'assistant',
    content: [],
    toolCalls: [
      {
        type: 'function',
        id: 'call_todo_write',
        name: 'TodoList',
        arguments: JSON.stringify({ todos }),
      },
    ],
  };
}

function todoListQuery(): ContextMessage {
  return {
    role: 'assistant',
    content: [],
    toolCalls: [
      {
        type: 'function',
        id: 'call_todo_query',
        name: 'TodoList',
        arguments: JSON.stringify({}),
      },
    ],
  };
}

function priorTodoReminder(): ContextMessage {
  return {
    role: 'user',
    content: [{ type: 'text', text: '<system-reminder>\nPrior todo reminder\n</system-reminder>' }],
    toolCalls: [],
    origin: { kind: 'injection', variant: 'todo_list_reminder' },
  };
}

describe('todoListStaleReminder', () => {
  it('skips reminder injection when TodoList is not active', async () => {
    const history = Array.from({ length: 10 }, () => assistantMessage());
    const result = todoListStaleReminder({
      history,
      todos: [makeQuestion({ question: 'Investigate todo reminder', status: 'investigating' })],
      active: false,
    });

    expect(result).toBeUndefined();
  });

  it('injects a reminder after enough assistant turns since the last TodoList write', async () => {
    const todos: TodoItem[] = [
      makeQuestion({ question: 'Read current TodoList implementation', status: 'investigating' }),
      makeQuestion({ question: 'Add reminder injector tests' }),
    ];
    const history = [todoListWrite(todos), ...Array.from({ length: 10 }, () => assistantMessage())];
    const result = todoListStaleReminder({ history, todos, active: true });

    expect(result).toContain('Current question list:');
    expect(result).toContain('1. [investigating] Read current TodoList implementation');
    expect(result).toContain('2. [pending] Add reminder injector tests');
  });

  it('does not inject before the assistant-turn threshold', async () => {
    const todos: TodoItem[] = [makeQuestion({ question: 'Read code', status: 'investigating' })];
    const history = [todoListWrite(todos), ...Array.from({ length: 9 }, () => assistantMessage())];
    const result = todoListStaleReminder({ history, todos, active: true });

    expect(result).toBeUndefined();
  });

  it('does not inject another reminder before the reminder spacing threshold', async () => {
    const todos: TodoItem[] = [makeQuestion({ question: 'Read code', status: 'investigating' })];
    const history = [
      todoListWrite(todos),
      ...Array.from({ length: 10 }, () => assistantMessage()),
      priorTodoReminder(),
      ...Array.from({ length: 9 }, () => assistantMessage()),
    ];
    const result = todoListStaleReminder({ history, todos, active: true });

    expect(result).toBeUndefined();
  });

  it('does not treat TodoList query mode as a write', async () => {
    const todos: TodoItem[] = [makeQuestion({ question: 'Read code', status: 'investigating' })];
    const history = [
      todoListWrite(todos),
      ...Array.from({ length: 5 }, () => assistantMessage()),
      todoListQuery(),
      ...Array.from({ length: 4 }, () => assistantMessage()),
    ];
    const result = todoListStaleReminder({ history, todos, active: true });

    expect(result).toBeDefined();
  });

  it('warns about questions stuck investigating without evidence', async () => {
    const todos: TodoItem[] = [
      makeQuestion({
        question: 'stalled question',
        status: 'investigating',
        evidence: [{ status: 'confirmed', description: 'some proof' }],
      }),
      makeQuestion({ question: 'no evidence yet', status: 'investigating' }),
    ];
    const history = [todoListWrite(todos), ...Array.from({ length: 10 }, () => assistantMessage())];
    const result = todoListStaleReminder({ history, todos, active: true });

    expect(result).toContain('investigating');
    expect(result).toContain('without recorded evidence');
  });

  it('warns when a parent question is still investigating after all sub-questions terminated', async () => {
    const parent = makeQuestion({ id: 'parent-1', question: 'parent', status: 'investigating' });
    const child = makeQuestion({
      id: 'child-1',
      question: 'child',
      status: 'resolved',
      parentId: 'parent-1',
      conclusion: 'answered',
      evidence: [{ status: 'confirmed', description: 'proof' }],
    });
    const todos: TodoItem[] = [parent, child];
    const history = [todoListWrite(todos), ...Array.from({ length: 10 }, () => assistantMessage())];
    const result = todoListStaleReminder({ history, todos, active: true });

    expect(result).toContain('sub-questions of a parent question have been resolved');
  });
});
