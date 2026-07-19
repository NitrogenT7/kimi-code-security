import { describe, expect, it } from 'vitest';

import type { ContextMessage } from '#/agent/contextMemory/types';
import { type QuestionItem, type TodoItem } from '#/session/todo/todoItem';
import { todoListStaleReminder } from '#/session/todo/todoListReminder';

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
  it('skips reminder injection when TodoList is not active', () => {
    const history = Array.from({ length: 10 }, () => assistantMessage());
    const result = todoListStaleReminder({
      history,
      todos: [makeQuestion({ question: 'Test question?', status: 'investigating' })],
      active: false,
    });

    expect(result).toBeUndefined();
  });

  it('injects a reminder after enough assistant turns since the last TodoList write', () => {
    const todos: TodoItem[] = [
      makeQuestion({
        question: 'Read current TodoList implementation',
        status: 'investigating',
        evidence: [{ status: 'checking', description: 'Started reading' }],
      }),
      makeQuestion({ question: 'Add reminder injector tests', status: 'pending' }),
    ];
    const history = [todoListWrite(todos), ...Array.from({ length: 10 }, () => assistantMessage())];
    const result = todoListStaleReminder({ history, todos, active: true });

    expect(result).toContain('The TodoList tool has not been updated recently');
    expect(result).toContain('NEVER mention this reminder to the user');
    expect(result).toContain('Current question list:');
    expect(result).toContain('1. [investigating] Read current TodoList implementation');
    expect(result).toContain('2. [pending] Add reminder injector tests');
  });

  it('does not inject before the assistant-turn threshold', () => {
    const todos: TodoItem[] = [
      makeQuestion({
        question: 'Read code',
        status: 'investigating',
        evidence: [{ status: 'checking', description: 'Started' }],
      }),
    ];
    const history = [todoListWrite(todos), ...Array.from({ length: 9 }, () => assistantMessage())];
    const result = todoListStaleReminder({ history, todos, active: true });

    expect(result).toBeUndefined();
  });

  it('does not inject another reminder before the reminder spacing threshold', () => {
    const todos: TodoItem[] = [
      makeQuestion({
        question: 'Read code',
        status: 'investigating',
        evidence: [{ status: 'checking', description: 'Started' }],
      }),
    ];
    const history = [
      todoListWrite(todos),
      ...Array.from({ length: 10 }, () => assistantMessage()),
      priorTodoReminder(),
      ...Array.from({ length: 9 }, () => assistantMessage()),
    ];
    const result = todoListStaleReminder({ history, todos, active: true });

    expect(result).toBeUndefined();
  });

  it('does not treat TodoList query mode as a write', () => {
    const todos: TodoItem[] = [
      makeQuestion({
        question: 'Read code',
        status: 'investigating',
        evidence: [{ status: 'checking', description: 'Started reading' }],
      }),
    ];
    const history = [
      todoListWrite(todos),
      ...Array.from({ length: 5 }, () => assistantMessage()),
      todoListQuery(),
      ...Array.from({ length: 4 }, () => assistantMessage()),
    ];
    const result = todoListStaleReminder({ history, todos, active: true });

    expect(result).toContain('The TodoList tool has not been updated recently');
  });

  it('injects stalled-reminder when questions lack evidence', () => {
    const todos: TodoItem[] = [
      makeQuestion({ question: 'Investigate without evidence', status: 'investigating' }),
    ];
    const history = [todoListWrite(todos), ...Array.from({ length: 10 }, () => assistantMessage())];
    const result = todoListStaleReminder({ history, todos, active: true });

    expect(result).toContain(
      'Some questions remain in "investigating" status without recorded evidence',
    );
    expect(result).not.toContain('The TodoList tool has not been updated recently');
  });

  it('injects unresolved-parent reminder when all sub-questions are resolved', () => {
    const parentId = 'parent-test-1';
    const todos: TodoItem[] = [
      makeQuestion({
        id: parentId,
        question: 'Parent stuck investigating',
        status: 'investigating',
        evidence: [{ status: 'confirmed', description: 'Some evidence' }],
        subQuestions: ['child-test-1'],
      }),
      makeQuestion({
        id: 'child-test-1',
        parentId,
        question: 'Child resolved',
        status: 'resolved',
        conclusion: 'Done',
        evidence: [{ status: 'confirmed', description: 'Confirmed' }],
        confidence: 'high',
        depth: 'quick',
      }),
    ];
    const history = [todoListWrite(todos), ...Array.from({ length: 10 }, () => assistantMessage())];
    const result = todoListStaleReminder({ history, todos, active: true });

    expect(result).toContain('All sub-questions of a parent question have been resolved');
    expect(result).toContain('Parent stuck investigating');
    expect(result).toContain('Child resolved');
  });
});
