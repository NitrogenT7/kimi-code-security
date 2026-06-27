/**
 * Covers the current TodoListTool contract.
 *
 * The todo state now uses question-driven items instead of task-oriented ones.
 */

import { describe, expect, it } from 'vitest';

import {
  TODO_LIST_TOOL_NAME,
  TODO_STORE_KEY,
  TodoListInputSchema,
  TodoListTool,
  type QuestionItem,
  type TodoItem,
} from '../../src/tools/builtin/state/todo-list';
import type { ToolStore } from '../../src/tools/store';
import { executeTool } from './fixtures/execute-tool';

const signal = new AbortController().signal;

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

function makeStore(initial: readonly TodoItem[] = []): {
  store: ToolStore;
  getTodos(): readonly TodoItem[];
} {
  let todos = [...initial];
  return {
    store: {
      get: (key) => (key === TODO_STORE_KEY ? todos : undefined),
      set: (key, value) => {
        if (key === TODO_STORE_KEY) {
          todos = [...(value as readonly TodoItem[])];
        }
      },
    },
    getTodos: () => todos,
  };
}

function makeTool(initial: readonly TodoItem[] = []): {
  tool: TodoListTool;
  getTodos(): readonly TodoItem[];
} {
  const { store, getTodos } = makeStore(initial);
  return { tool: new TodoListTool(store), getTodos };
}

describe('TodoListTool', () => {
  it('has name, description, and parameters from the current schema', () => {
    const { tool } = makeTool();

    expect(TODO_LIST_TOOL_NAME).toBe('TodoList');
    expect(TODO_STORE_KEY).toBe('todo');
    expect(tool.name).toBe(TODO_LIST_TOOL_NAME);
    expect(tool.description.length).toBeGreaterThan(0);
    expect(TodoListInputSchema.safeParse({}).success).toBe(true);
    expect(
      TodoListInputSchema.safeParse({ todos: [{ title: 'x', status: 'wip' }] }).success,
    ).toBe(true); // old format is accepted but validated
    expect(tool.parameters).toMatchObject({
      type: 'object',
      properties: {
        todos: { type: 'array' },
      },
    });
  });

  it('description includes an Avoid churn section with the anti-spin guardrails', () => {
    const { tool } = makeTool();
    const { description } = tool;

    expect(description).toContain('**Avoid churn:**');
    expect(description).toMatch(/nothing meaningful has changed/i);
    expect(description).toMatch(/real progress/i);
    expect(description).toMatch(/query mode/i);
    expect(description).toMatch(/tell the user/i);
  });

  it('description encourages proactive progress tracking', () => {
    const { tool } = makeTool();
    const { description } = tool;

    expect(description).toMatch(/progress/i);
    expect(description).toContain('**Avoid churn:**');
  });

  it('query mode renders the current list without mutating it', async () => {
    const todo = makeQuestion({ question: 'Can primitive A be reached?', status: 'investigating' });
    const { tool, getTodos } = makeTool([todo]);

    const result = await executeTool(tool, {
      turnId: 't1',
      toolCallId: 'call_1',
      args: {},
      signal,
    });

    expect(result).toMatchObject({ isError: false });
    expect(result.output).toContain('Current question list');
    expect(result.output).toContain('[investigating] Can primitive A be reached?');
    expect(getTodos()).toEqual([todo]);
  });

  it('write mode replaces the list and validates question items', async () => {
    const { tool, getTodos } = makeTool();
    const todos = [
      makeQuestion({ question: 'Is entry B exported?', status: 'investigating' }),
      makeQuestion({ question: 'Can extra be controlled?', status: 'pending' }),
    ];

    const result = await executeTool(tool, {
      turnId: 't1',
      toolCallId: 'call_1',
      args: { todos },
      signal,
    });

    expect(result).toMatchObject({ isError: false });
    expect(result.output).toContain('Question list updated');
    expect(result.output).toContain('[investigating] Is entry B exported?');
    expect(result.output).toContain('[pending] Can extra be controlled?');
    expect(getTodos()).toHaveLength(2);
  });

  it('rejects resolved items without conclusion', async () => {
    const { tool } = makeTool();
    const todos = [
      makeQuestion({
        question: 'Is the sink reachable?',
        status: 'resolved',
        conclusion: undefined,
        evidence: [],
      }),
    ];

    const result = await executeTool(tool, {
      turnId: 't1',
      toolCallId: 'call_1',
      args: { todos },
      signal,
    });

    expect(result).toMatchObject({ isError: true });
    expect(result.output).toContain('conclusion is required');
  });

  it('rejects resolved items without evidence', async () => {
    const { tool } = makeTool();
    const todos = [
      makeQuestion({
        question: 'Is the sink reachable?',
        status: 'resolved',
        conclusion: 'Yes, through path X',
        evidence: [],
      }),
    ];

    const result = await executeTool(tool, {
      turnId: 't1',
      toolCallId: 'call_1',
      args: { todos },
      signal,
    });

    expect(result).toMatchObject({ isError: true });
    expect(result.output).toContain('evidence is required');
  });

  it('accepts resolved items with conclusion + evidence', async () => {
    const { tool, getTodos } = makeTool();
    const todos = [
      makeQuestion({
        question: 'Is the sink reachable?',
        status: 'resolved',
        conclusion: 'Yes, through path X',
        evidence: [{ status: 'confirmed', description: 'Path X confirmed in C.java:142' }],
      }),
    ];

    const result = await executeTool(tool, {
      turnId: 't1',
      toolCallId: 'call_1',
      args: { todos },
      signal,
    });

    expect(result).toMatchObject({ isError: false });
    expect(result.output).toContain('Question list updated');
    expect(getTodos()).toHaveLength(1);
  });

  it('migrates old-format { title, status: in_progress } items to question format', async () => {
    const { tool, getTodos } = makeTool();
    const oldTodos = [
      { title: 'Read the code', status: 'in_progress' },
      { title: 'Write tests', status: 'pending' },
    ];

    const result = await executeTool(tool, {
      turnId: 't1',
      toolCallId: 'call_1',
      args: { todos: oldTodos },
      signal,
    });

    expect(result).toMatchObject({ isError: false });
    const stored = getTodos();
    expect(stored).toHaveLength(2);
    expect(stored[0]).toMatchObject({
      type: 'question',
      question: 'Read the code',
      status: 'investigating',
    });
    expect(stored[1]).toMatchObject({
      type: 'question',
      question: 'Write tests',
      status: 'pending',
    });
    // Must have auto-generated IDs
    expect((stored[0] as QuestionItem).id).toBeTruthy();
  });

  it('renders parent-child tree structure', async () => {
    const parentId = 'parent-1';
    const { tool } = makeTool([
      makeQuestion({
        id: parentId,
        question: 'Can primitive A be reached?',
        status: 'investigating',
        confidence: 'medium',
        depth: 'deep',
        hypothesis: 'Maybe through entry B',
        blockers: ['Need to check Android 12+'],
      }),
      makeQuestion({
        id: 'child-1',
        parentId,
        question: 'Is entry B exported?',
        status: 'resolved',
        conclusion: 'Yes, exported=true',
        evidence: [{ status: 'confirmed', description: 'AndroidManifest.xml line 42' }],
        confidence: 'high',
        depth: 'quick',
      }),
      makeQuestion({
        question: 'Is JNI call present?',
        status: 'resolved',
        conclusion: 'No .so files found',
        evidence: [{ status: 'confirmed', description: 'lib/ directory empty' }],
        confidence: 'high',
        depth: 'quick',
      }),
    ]);

    const result = await executeTool(tool, {
      turnId: 't1',
      toolCallId: 'call_1',
      args: {},
      signal,
    });

    expect(result).toMatchObject({ isError: false });
    expect(result.output).toContain('1. [investigating] Can primitive A be reached?');
    expect(result.output).toContain('假设：Maybe through entry B');
    expect(result.output).toContain('阻碍：Need to check Android 12+');
    expect(result.output).toContain('  1.1. [resolved] Is entry B exported?');
    expect(result.output).toContain('结论：Yes, exported=true');
    expect(result.output).toContain('2. [resolved] Is JNI call present?');
  });

  it('rejects items with invalid parentId references', async () => {
    const { tool } = makeTool();
    const todos = [
      makeQuestion({ id: 'child-orphan', parentId: 'nonexistent', question: 'Orphan question?' }),
    ];

    const result = await executeTool(tool, {
      turnId: 't1',
      toolCallId: 'call_1',
      args: { todos },
      signal,
    });

    expect(result).toMatchObject({ isError: true });
    expect(result.output).toContain('does not exist');
  });

  it('rejects items nested deeper than 2 levels', async () => {
    const { tool } = makeTool();
    const todos = [
      makeQuestion({ id: 'grandparent', question: 'Level 1' }),
      makeQuestion({ id: 'parent', parentId: 'grandparent', question: 'Level 2' }),
      makeQuestion({ id: 'child', parentId: 'parent', question: 'Level 3' }),
    ];

    const result = await executeTool(tool, {
      turnId: 't1',
      toolCallId: 'call_1',
      args: { todos },
      signal,
    });

    expect(result).toMatchObject({ isError: true });
    expect(result.output).toContain('nested too deep');
  });

  it('renders evidence items with status markers', async () => {
    const { tool } = makeTool([
      makeQuestion({
        question: 'Test evidence rendering',
        status: 'investigating',
        evidence: [
          { status: 'confirmed', description: 'Path confirmed' },
          { status: 'refuted', description: 'Permission denied' },
          { status: 'checking', description: 'Still verifying' },
        ],
      }),
    ]);

    const result = await executeTool(tool, {
      turnId: 't1',
      toolCallId: 'call_1',
      args: {},
      signal,
    });

    expect(result).toMatchObject({ isError: false });
    expect(result.output).toContain('✅ [confirmed] Path confirmed');
    expect(result.output).toContain('❌ [refuted] Permission denied');
    expect(result.output).toContain('❓ [checking] Still verifying');
  });

  it('clear mode empties the list', async () => {
    const { tool, getTodos } = makeTool([
      makeQuestion({ question: 'Something?', status: 'pending' }),
    ]);

    const result = await executeTool(tool, {
      turnId: 't1',
      toolCallId: 'call_1',
      args: { todos: [] },
      signal,
    });

    expect(result).toMatchObject({ isError: false, output: 'Question list cleared.' });
    expect(getTodos()).toEqual([]);
  });

  it('resolveExecution description reflects the mode', () => {
    const { tool } = makeTool();
    const readExecution = tool.resolveExecution({});
    const clearExecution = tool.resolveExecution({ todos: [] });
    const updateExecution = tool.resolveExecution({
      todos: [makeQuestion({ question: 'something?' })],
    });

    expect(readExecution.isError).toBeFalsy();
    expect(clearExecution.isError).toBeFalsy();
    expect(updateExecution.isError).toBeFalsy();
    if (
      readExecution.isError === true ||
      clearExecution.isError === true ||
      updateExecution.isError === true
    ) {
      throw new TypeError('expected runnable executions');
    }
    expect(readExecution.description).toBe('Reading question list');
    expect(clearExecution.description).toBe('Clearing question list');
    expect(updateExecution.description).toBe('Updating question list');
  });
});
