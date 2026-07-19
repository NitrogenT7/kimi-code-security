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
      get: (key) => (key === TODO_STORE_KEY ? (todos as never) : undefined),
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
  it('exposes the visible todo items in the tool-call display', () => {
    const { tool } = makeTool([makeQuestion({ question: 'existing', status: 'investigating' })]);

    const execution = tool.resolveExecution({});

    if (execution.isError === true) throw new TypeError('expected runnable execution');
    expect(execution.display).toEqual({
      kind: 'todo_list',
      items: [{ title: 'existing', status: 'investigating' }],
    });
  });

  it('has name, description, and parameters from the current schema', () => {
    const { tool } = makeTool();

    expect(TODO_LIST_TOOL_NAME).toBe('TodoList');
    expect(TODO_STORE_KEY).toBe('todo');
    expect(tool.name).toBe(TODO_LIST_TOOL_NAME);
    expect(tool.description.length).toBeGreaterThan(0);
    expect(TodoListInputSchema.safeParse({}).success).toBe(true);
    expect(
      TodoListInputSchema.safeParse({ todos: [makeQuestion({ question: 'q?' })] }).success,
    ).toBe(true);
    expect(tool.parameters).toMatchObject({
      type: 'object',
      properties: {
        todos: { type: 'array' },
      },
    });
  });

  it('advertises the question-item shape in the parameters JSON schema', () => {
    // Regression: `z.unknown()` items used to advertise `items: {}` ("anything"),
    // which providers could mangle into `items: {type: 'string'}` — the model
    // then submitted plain strings and the runtime rejected them ("Item is not
    // an object"). The advertised schema must match the documented contract.
    const { tool } = makeTool();

    const todos = (tool.parameters as { properties: { todos: Record<string, unknown> } }).properties
      .todos;
    const items = todos['items'] as {
      type: string;
      required: string[];
      properties: Record<string, unknown>;
      additionalProperties: boolean;
    };
    expect(items.type).toBe('object');
    expect(items.required).toEqual(
      expect.arrayContaining(['type', 'id', 'question', 'status', 'confidence', 'depth']),
    );
    expect(items.additionalProperties).toBe(false);
    expect(Object.keys(items.properties)).toEqual(
      expect.arrayContaining([
        'type',
        'id',
        'question',
        'status',
        'confidence',
        'depth',
        'hypothesis',
        'conclusion',
        'evidence',
        'blockers',
        'parentId',
        'subQuestions',
      ]),
    );
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
        status: 'investigating',
        hypothesis: 'Probably not, need to check lib/',
        confidence: 'low',
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
    expect(result.output).toContain('2. [investigating] Is JNI call present?');
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

  it('archives removed resolved items to findings board', async () => {
    const store: Record<string, unknown> = {};
    const toolStore: ToolStore = {
      get: (key) => store[key] as never,
      set: (key, value) => {
        store[key] = value;
      },
    };
    const tool = new TodoListTool(toolStore);

    // Step 1: Write a list with one investigating and one resolved item
    const resolvedId = 'resolved-1';
    const initialTodos = [
      makeQuestion({ id: 'active-1', question: 'Active question?', status: 'investigating' }),
      makeQuestion({
        id: resolvedId,
        question: 'Was this reachable?',
        status: 'resolved',
        conclusion: 'Yes, through path X',
        evidence: [{ status: 'confirmed', description: 'Confirmed in source' }],
        confidence: 'high',
        depth: 'deep',
      }),
    ];

    const r1 = await executeTool(tool, {
      turnId: 't1',
      toolCallId: 'call_1',
      args: { todos: initialTodos },
      signal,
    });
    expect(r1).toMatchObject({ isError: false });

    // Step 2: Write a new list that removes the resolved item
    const updatedTodos = [
      makeQuestion({ id: 'active-1', question: 'Active question?', status: 'investigating' }),
    ];

    const r2 = await executeTool(tool, {
      turnId: 't2',
      toolCallId: 'call_2',
      args: { todos: updatedTodos },
      signal,
    });
    expect(r2).toMatchObject({ isError: false });

    // Check findings board
    const findings = store['findings'] as readonly unknown[];
    expect(findings).toHaveLength(1);
    const finding = findings[0] as Record<string, unknown>;
    expect(finding['id']).toBe(resolvedId);
    expect(finding['question']).toBe('Was this reachable?');
    expect(finding['conclusion']).toBe('Yes, through path X');
    expect(finding['status']).toBe('resolved');
    expect(finding['resolvedAt']).toBeGreaterThan(0);
  });

  it('does not archive pending/investigating items removed from the list', async () => {
    const store: Record<string, unknown> = {};
    const toolStore: ToolStore = {
      get: (key) => store[key] as never,
      set: (key, value) => {
        store[key] = value;
      },
    };
    const tool = new TodoListTool(toolStore);

    // Write list with an investigating item, then remove it
    const initial = [
      makeQuestion({ id: 'active-1', question: 'Active?', status: 'investigating' }),
    ];
    await executeTool(tool, {
      turnId: 't1',
      toolCallId: 'call_1',
      args: { todos: initial },
      signal,
    });

    // Remove it
    await executeTool(tool, { turnId: 't2', toolCallId: 'call_2', args: { todos: [] }, signal });

    const findings = store['findings'] as readonly unknown[];
    expect(findings).toBeUndefined();
  });

  it('query mode hides resolved/inconclusive items from output', async () => {
    const { tool } = makeTool([
      makeQuestion({ id: 'active-1', question: 'Active?', status: 'investigating' }),
      makeQuestion({
        id: 'done-1',
        question: 'Done?',
        status: 'resolved',
        conclusion: 'Yes',
        evidence: [{ status: 'confirmed', description: 'Confirmed' }],
      }),
    ]);

    const result = await executeTool(tool, {
      turnId: 't1',
      toolCallId: 'call_1',
      args: {},
      signal,
    });

    console.log('OUTPUT:', result.output);

    expect(result).toMatchObject({ isError: false });
    expect(result.output).toContain('Active?');
    expect(result.output).not.toContain('Done?');
  });

  it('rejects items with malformed evidence (e.g. null instead of array)', async () => {
    const { tool } = makeTool();
    const result = await executeTool(tool, {
      turnId: 't1',
      toolCallId: 'call_1',
      args: {
        todos: [
          {
            type: 'question',
            id: 'bad-item',
            question: 'Test?',
            status: 'investigating',
            confidence: 'medium',
            depth: 'deep',
            evidence: null, // ← LLM might send null
            blockers: [],
            subQuestions: [],
          },
        ],
      },
      signal,
    });

    expect(result).toMatchObject({ isError: true });
    expect(result.output).toContain('evidence');
  });

  it('handles items with malformed evidence gracefully (fallback)', async () => {
    const { tool } = makeTool();
    // Simulate the old buggy path: an item that passes looksLikeQuestionItem
    // but fails Zod parse. The fallback should produce a valid QuestionItem.
    const result = await executeTool(tool, {
      turnId: 't1',
      toolCallId: 'call_1',
      args: {
        todos: [
          {
            type: 'question',
            id: 'fallback-test',
            question: 'Should not crash?',
            status: 'pending',
            confidence: 'medium',
            depth: 'deep',
            // evidence intentionally omitted — Zod default should fill it in
          },
        ],
      },
      signal,
    });

    expect(result).toMatchObject({ isError: false });
    expect(result.output).toContain('Question list updated');
  });
});
