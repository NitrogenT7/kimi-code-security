import { describe, expect, it } from 'vitest';

import type { FindingItem } from '#/session/todo/findings';
import { type ISessionTodoService } from '#/session/todo/sessionTodo';
import {
  TODO_LIST_TOOL_NAME,
  type QuestionItem,
  type TodoItem,
} from '#/session/todo/todoItem';
import { TodoListInputSchema, TodoListTool } from '#/session/todo/tools/todo-list';
import { executeTool } from '../../../tools/fixtures/execute-tool';

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

function makeTodoService(initial: readonly TodoItem[] = []): {
  readonly service: ISessionTodoService;
  readonly getTodos: () => readonly TodoItem[];
} {
  let todos = [...initial];
  return {
    service: {
      _serviceBrand: undefined,
      getTodos: () => todos,
      setTodos: (next: readonly TodoItem[]) => {
        todos = next.map((todo) => ({ ...todo }));
      },
      clear: () => {
        todos = [];
      },
      getFindings: (): readonly FindingItem[] => [],
      onDidChange: () => ({ dispose: () => {} }),
    },
    getTodos: () => todos,
  };
}

function makeTool(initial: readonly TodoItem[] = []): {
  readonly tool: TodoListTool;
  readonly getTodos: () => readonly TodoItem[];
} {
  const { service, getTodos } = makeTodoService(initial);
  return { tool: new TodoListTool(service), getTodos };
}

describe('TodoListTool', () => {
  it('has name, description, and parameters from the current schema', () => {
    const { tool } = makeTool();

    expect(TODO_LIST_TOOL_NAME).toBe('TodoList');
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

    const todos = (tool.parameters as { properties: { todos: Record<string, unknown> } })
      .properties.todos;
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

  it('description includes the anti-churn guardrails', () => {
    const { description } = makeTool().tool;

    expect(description).toContain('**Avoid churn:**');
    expect(description).toMatch(/nothing meaningful has changed/i);
    expect(description).toMatch(/real progress/i);
    expect(description).toMatch(/query mode/i);
    expect(description).toMatch(/tell the user/i);
  });

  it('description documents the question item schema and full replacement semantics', () => {
    const { description } = makeTool().tool;

    expect(description).toContain('"type": "question"');
    expect(description).toContain('**Item schema**');
    expect(description).toMatch(/full replacement semantics/i);
    expect(description).toMatch(/confidence/i);
    expect(description).toMatch(/evidence/i);
    expect(description).toMatch(/resolved\/inconclusive items are hidden/i);
  });

  it('query mode renders the current list without mutating it', async () => {
    const todo = makeQuestion({ question: 'Can primitive A be reached?', status: 'investigating' });
    const { tool, getTodos } = makeTool([todo]);

    const result = await executeTool(tool, {
      turnId: 1,
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
      turnId: 1,
      toolCallId: 'call_1',
      args: { todos },
      signal,
    });

    expect(result).toMatchObject({ isError: false });
    expect(result.output).toContain('Question list updated');
    expect(result.output).toContain('[investigating] Is entry B exported?');
    expect(result.output).toContain('[pending] Can extra be controlled?');
    expect(result.output).toContain(
      'Ensure that you continue to use the todo list to track progress.',
    );
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
      turnId: 1,
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
      turnId: 1,
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
      turnId: 1,
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
      turnId: 1,
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
      turnId: 1,
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
      turnId: 1,
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
      turnId: 1,
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
      turnId: 1,
      toolCallId: 'call_1',
      args: {},
      signal,
    });

    expect(result).toMatchObject({ isError: false });
    expect(result.output).toContain('✅ [confirmed] Path confirmed');
    expect(result.output).toContain('❌ [refuted] Permission denied');
    expect(result.output).toContain('❓ [checking] Still verifying');
  });

  it('clear mode empties the list without adding the progress-tracking reminder', async () => {
    const { tool, getTodos } = makeTool([
      makeQuestion({ question: 'Something?', status: 'pending' }),
    ]);

    const result = await executeTool(tool, {
      turnId: 1,
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
      turnId: 1,
      toolCallId: 'call_1',
      args: {},
      signal,
    });

    expect(result).toMatchObject({ isError: false });
    expect(result.output).toContain('Active?');
    expect(result.output).not.toContain('Done?');
  });

  it('rejects items with malformed evidence (e.g. null instead of array)', async () => {
    const { tool } = makeTool();
    const result = await executeTool(tool, {
      turnId: 1,
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
            evidence: null,
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

  it('handles items with missing optional fields gracefully (defaults applied)', async () => {
    const { tool } = makeTool();
    const result = await executeTool(tool, {
      turnId: 1,
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
          },
        ],
      },
      signal,
    });

    expect(result).toMatchObject({ isError: false });
    expect(result.output).toContain('Question list updated');
  });
});
