import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { IAgentTodoService } from '#/features/todo/todoService';
import {
  TODO_LIST_TOOL_NAME,
  type QuestionItem,
  type TodoItem,
} from '#/features/todo/todoItem';
import {
  ITodoListTool,
  TodoListInputSchema,
} from '#/features/todo/tools/todo-list/todo-list';
import { executeTool } from '../../../tools/fixtures/execute-tool';

import { createTestAgent, type TestAgentContext } from '../../../harness';

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

describe('TodoListTool', () => {
  let ctx: TestAgentContext;

  beforeEach(async () => {
    ctx = createTestAgent();
    await ctx.restorePersisted();
  });

  afterEach(async () => {
    await ctx.dispose();
  });

  async function seed(todos: readonly TodoItem[]): Promise<void> {
    await ctx.get(IAgentTodoService).replace(todos);
  }

  function todos(): readonly TodoItem[] {
    return ctx.get(IAgentTodoService).get();
  }

  it('has name, description, and parameters from the current schema', () => {
    const tool = ctx.get(ITodoListTool);

    expect(TODO_LIST_TOOL_NAME).toBe('TodoList');
    expect(tool.name).toBe(TODO_LIST_TOOL_NAME);
    expect(tool.description.length).toBeGreaterThan(0);
    expect(TodoListInputSchema.safeParse({}).success).toBe(true);
    expect(
      TodoListInputSchema.safeParse({ todos: [{ title: 'x', status: 'wip' }] }).success,
    ).toBe(false);
    expect(tool.parameters).toMatchObject({
      type: 'object',
      additionalProperties: false,
      properties: {
        todos: { type: 'array' },
      },
    });
  });

  it('query mode renders the current list without mutating it', async () => {
    const existing = makeQuestion({ question: 'existing', status: 'investigating' });
    await seed([existing]);
    const tool = ctx.get(ITodoListTool);

    const result = await executeTool(tool, {
      turnId: 1,
      toolCallId: 'call_1',
      args: {},
      signal,
    });

    expect(result).toMatchObject({ isError: false });
    expect(result.output).toContain('Current question list');
    expect(result.output).toContain('[investigating] existing');
    expect(todos()).toEqual([existing]);
  });

  it('write mode replaces the list and defensively copies todos', async () => {
    const tool = ctx.get(ITodoListTool);
    const first = makeQuestion({ question: 'first' });
    const second = makeQuestion({ question: 'second', status: 'investigating' });
    const input: TodoItem[] = [first, second];

    const result = await executeTool(tool, {
      turnId: 1,
      toolCallId: 'call_1',
      args: { todos: input },
      signal,
    });
    input[0] = makeQuestion({ question: 'leaked', status: 'resolved' });

    expect(result).toMatchObject({ isError: false });
    expect(result.output).toContain('Question list updated');
    expect(result.output).toContain('[pending] first');
    expect(result.output).toContain('[investigating] second');
    expect(result.output).toContain(
      'Ensure that you continue to use the todo list to track progress.',
    );
    expect(todos()).toEqual([first, second]);
  });

  it('migrates legacy { title, status } items on write', async () => {
    const tool = ctx.get(ITodoListTool);

    const result = await executeTool(tool, {
      turnId: 1,
      toolCallId: 'call_1',
      args: { todos: [{ title: 'legacy task', status: 'in_progress' }] },
      signal,
    });

    expect(result).toMatchObject({ isError: false });
    expect(todos()).toHaveLength(1);
    expect(todos()[0]).toMatchObject({
      type: 'question',
      question: 'legacy task',
      status: 'investigating',
    });
  });

  it('rejects a resolved item without conclusion or evidence', async () => {
    const tool = ctx.get(ITodoListTool);

    const result = await executeTool(tool, {
      turnId: 1,
      toolCallId: 'call_1',
      args: {
        todos: [
          {
            type: 'question',
            id: 'q1',
            question: 'answered?',
            status: 'resolved',
            confidence: 'high',
            depth: 'deep',
          },
        ],
      },
      signal,
    });

    expect(result).toMatchObject({ isError: true });
    expect(result.output).toContain('conclusion is required');
    expect(result.output).toContain('evidence is required');
    expect(todos()).toEqual([]);
  });

  it('rejects an item whose parentId is missing or nested too deep', async () => {
    const tool = ctx.get(ITodoListTool);

    const orphan = await executeTool(tool, {
      turnId: 1,
      toolCallId: 'call_1',
      args: {
        todos: [
          {
            type: 'question',
            id: 'q1',
            question: 'child',
            status: 'pending',
            confidence: 'medium',
            depth: 'deep',
            parentId: 'ghost',
          },
        ],
      },
      signal,
    });
    expect(orphan).toMatchObject({ isError: true });
    expect(orphan.output).toContain('parentId "ghost" which does not exist');

    const tooDeep = await executeTool(tool, {
      turnId: 1,
      toolCallId: 'call_2',
      args: {
        todos: [
          {
            type: 'question',
            id: 'q1',
            question: 'grandparent',
            status: 'pending',
            confidence: 'medium',
            depth: 'deep',
          },
          {
            type: 'question',
            id: 'q2',
            question: 'parent',
            status: 'pending',
            confidence: 'medium',
            depth: 'deep',
            parentId: 'q1',
          },
          {
            type: 'question',
            id: 'q3',
            question: 'child',
            status: 'pending',
            confidence: 'medium',
            depth: 'deep',
            parentId: 'q2',
          },
        ],
      },
      signal,
    });
    expect(tooDeep).toMatchObject({ isError: true });
    expect(tooDeep.output).toContain('nested too deep');
  });

  it('archives a resolved question removed by a later write into the findings store', async () => {
    const tool = ctx.get(ITodoListTool);
    const answered = makeQuestion({
      question: 'answered',
      status: 'resolved',
      conclusion: 'yes',
      evidence: [{ status: 'confirmed', description: 'proof' }],
    });
    const open = makeQuestion({ question: 'open' });
    await seed([answered, open]);

    const result = await executeTool(tool, {
      turnId: 1,
      toolCallId: 'call_1',
      args: { todos: [open] },
      signal,
    });

    expect(result).toMatchObject({ isError: false });
    expect(ctx.get(IAgentTodoService).getFindings()).toEqual([
      expect.objectContaining({ id: answered.id, conclusion: 'yes', status: 'resolved' }),
    ]);
  });

  it('clear mode empties the list without adding the progress-tracking reminder', async () => {
    await seed([makeQuestion({ question: 'x' })]);
    const tool = ctx.get(ITodoListTool);

    const result = await executeTool(tool, {
      turnId: 1,
      toolCallId: 'call_1',
      args: { todos: [] },
      signal,
    });

    expect(result).toMatchObject({ isError: false, output: 'Question list cleared.' });
    expect(todos()).toEqual([]);
  });

  it('resolveExecution description reflects the mode', async () => {
    const tool = ctx.get(ITodoListTool);
    const readExecution = await tool.resolveExecution({});
    const clearExecution = await tool.resolveExecution({ todos: [] });
    const updateExecution = await tool.resolveExecution({
      todos: [makeQuestion({ question: 'x' })],
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
});
