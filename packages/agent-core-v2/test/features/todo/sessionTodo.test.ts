import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { KeyedResourceLeasePool } from '#/_base/lifecycle/keyedResource';
import { IAgentContextMemoryService } from '#/agent/contextMemory/contextMemory';
import { IFeatureManager } from '#/app/feature/featureManager';
import { IAgentReminderService } from '#/features/reminder/reminderService';
import { TodoFeature } from '#/features/todo/todoFeature';
import { IAgentTodoService } from '#/features/todo/todoService';
import type { QuestionItem, TodoItem } from '#/features/todo/todoItem';
import { TODO_LIST_REMINDER_VARIANT } from '#/features/todo/todoListReminder';
import { IAgentLifecycleService } from '#/session/agentLifecycle/agentLifecycle';
import type { WireRecord } from '#/wire/record';

import {
  createTestAgent,
  InMemoryWireRecordPersistence,
  type TestAgentContext,
} from '../../harness';

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

function reminderInjected(ctx: TestAgentContext): boolean {
  return ctx.context.get().some(
    (message) =>
      message.origin?.kind === 'injection' && message.origin.variant === TODO_LIST_REMINDER_VARIANT,
  );
}

function appendAssistantTurns(memory: IAgentContextMemoryService, count: number): void {
  for (let i = 0; i < count; i += 1) {
    memory.append({
      role: 'assistant',
      content: [{ type: 'text', text: `turn ${i}` }],
      toolCalls: [],
    });
  }
}

describe('AgentTodoService', () => {
  let ctx: TestAgentContext;

  beforeEach(async () => {
    ctx = createTestAgent();
    await ctx.restorePersisted();
  });

  afterEach(async () => {
    await ctx.dispose();
  });

  it('replaces, reads, and clears todos through the domain API', async () => {
    const todo = ctx.get(IAgentTodoService);

    expect(todo.get()).toEqual([]);

    const first = makeQuestion({ question: 'first' });
    const second = makeQuestion({ question: 'second', status: 'investigating' });
    await todo.replace([first, second]);
    expect(todo.get()).toEqual([first, second]);

    await todo.clear();
    expect(todo.get()).toEqual([]);
  });

  it('emits each actual change once', async () => {
    const todo = ctx.get(IAgentTodoService);
    const seen: TodoItem[][] = [];
    const subscription = todo.onDidChange((todos) => { seen.push([...todos]); });

    const a = makeQuestion({ question: 'a' });
    const b = makeQuestion({ question: 'b', status: 'resolved', conclusion: 'done', evidence: [{ status: 'confirmed', description: 'proof' }] });
    await todo.replace([a]);
    await todo.replace([a, b]);
    await todo.clear();

    expect(seen).toEqual([[a], [a, b], []]);
    subscription.dispose();
  });

  it('appends todos through the existing tools.update_store wire record', async () => {
    const todo = ctx.get(IAgentTodoService);
    const item = makeQuestion({ question: 'persist me', status: 'investigating' });
    await todo.replace([item]);

    const records = await ctx.persistedWireRecords();
    expect(records.filter((record) => record.type === 'tools.update_store')).toEqual([{
      type: 'tools.update_store',
      agentId: 'main',
      key: 'todo',
      value: [item],
      time: expect.any(Number),
    }]);
  });

  it('isolates todos between agents', async () => {
    const lifecycle = ctx.get(IAgentLifecycleService);
    const sub = await lifecycle.create({ agentId: 'agent-1' });
    const mainTodo = ctx.get(IAgentTodoService);
    const subTodo = lifecycle.handleOf(sub.agentId)!.accessor.get(IAgentTodoService);

    const mainItem = makeQuestion({ question: 'main todo' });
    const subItem = makeQuestion({
      question: 'sub todo',
      status: 'resolved',
      conclusion: 'answered',
      evidence: [{ status: 'confirmed', description: 'proof' }],
    });
    await mainTodo.replace([mainItem]);
    await subTodo.replace([subItem]);

    expect(mainTodo.get()).toEqual([mainItem]);
    expect(subTodo.get()).toEqual([subItem]);
    await lifecycle.remove(sub);
  });

  it('restores todos from persisted wire records after restart', async () => {
    const persistence = new InMemoryWireRecordPersistence();
    const first = createTestAgent({ persistence, autoConfigure: false });
    await first.restorePersisted();
    const kept = makeQuestion({ question: 'kept', status: 'investigating' });
    await first.get(IAgentTodoService).replace([kept]);
    await first.dispose();

    const restarted = createTestAgent({ persistence, autoConfigure: false });
    try {
      await restarted.restorePersisted();
      expect(restarted.get(IAgentTodoService).get()).toEqual([kept]);
    } finally {
      await restarted.dispose();
    }
  });

  it('restores todos and resumes operations when the feature is re-provided after restore', async () => {
    const kept = makeQuestion({ question: 'kept', status: 'investigating' });
    await ctx.get(IAgentTodoService).replace([kept]);

    await ctx.get(IFeatureManager).unprovideUnit('todo');
    expect(() => ctx.get(IAgentTodoService)).toThrow("unknown service 'agentTodoService'");

    ctx.get(IFeatureManager).provideUnit(TodoFeature);

    const revived = await vi.waitFor(() => {
      const service = ctx.get(IAgentTodoService);
      expect(service.get()).toEqual([kept]);
      return service;
    });
    const resolved = makeQuestion({
      question: 'kept',
      status: 'resolved',
      conclusion: 'answered',
      evidence: [{ status: 'confirmed', description: 'proof' }],
    });
    const added = makeQuestion({ question: 'added' });
    await revived.replace([resolved, added]);
    expect(revived.get()).toEqual([resolved, added]);
  });

  it('migrates legacy persisted items and filters malformed values during replay', async () => {
    const persistence = new InMemoryWireRecordPersistence();
    const seeded = createTestAgent({ persistence, autoConfigure: false });
    try {
      persistence.records.push({
        type: 'tools.update_store',
        key: 'todo',
        value: [
          { title: 'legacy done', status: 'done' },
          { title: 'legacy active', status: 'in_progress' },
          { title: 'missing status' },
          { title: 123, status: 'pending' },
          'garbage',
        ],
      } as unknown as WireRecord);
      await seeded.restorePersisted();

      const todos = seeded.get(IAgentTodoService).get();
      expect(todos).toHaveLength(2);
      expect(todos[0]).toMatchObject({
        type: 'question',
        question: 'legacy done',
        status: 'resolved',
      });
      expect(todos[1]).toMatchObject({
        type: 'question',
        question: 'legacy active',
        status: 'investigating',
      });
    } finally {
      await seeded.dispose();
    }
  });

  it('archives resolved questions dropped from the replacement list into the findings store', async () => {
    const todo = ctx.get(IAgentTodoService);
    const answered = makeQuestion({
      question: 'answered question',
      status: 'resolved',
      conclusion: 'yes it works',
      evidence: [{ status: 'confirmed', description: 'proof' }],
    });
    const open = makeQuestion({ question: 'still open' });
    await todo.replace([answered, open]);
    expect(todo.getFindings()).toEqual([]);

    await todo.replace([open]);

    expect(todo.get()).toEqual([open]);
    expect(todo.getFindings()).toEqual([
      expect.objectContaining({
        id: answered.id,
        question: 'answered question',
        conclusion: 'yes it works',
        status: 'resolved',
      }),
    ]);

    const records = await ctx.persistedWireRecords();
    const keys = records
      .filter((record) => record.type === 'tools.update_store')
      .map((record) => (record as { key?: string }).key);
    expect(keys).toContain('findings');
  });

  it('restores findings from persisted wire records after restart', async () => {
    const persistence = new InMemoryWireRecordPersistence();
    const first = createTestAgent({ persistence, autoConfigure: false });
    await first.restorePersisted();
    const answered = makeQuestion({
      question: 'answered question',
      status: 'resolved',
      conclusion: 'concluded',
      evidence: [{ status: 'confirmed', description: 'proof' }],
    });
    const todo = first.get(IAgentTodoService);
    await todo.replace([answered]);
    await todo.clear();
    expect(todo.getFindings()).toHaveLength(1);
    await first.dispose();

    const restarted = createTestAgent({ persistence, autoConfigure: false });
    try {
      await restarted.restorePersisted();
      expect(restarted.get(IAgentTodoService).get()).toEqual([]);
      expect(restarted.get(IAgentTodoService).getFindings()).toEqual([
        expect.objectContaining({ question: 'answered question', conclusion: 'concluded' }),
      ]);
    } finally {
      await restarted.dispose();
    }
  });

  it('arms the stale-todo reminder on first use for the main agent only', async () => {
    const lifecycle = ctx.get(IAgentLifecycleService);
    const todo = ctx.get(IAgentTodoService);
    const reminder = ctx.get(IAgentReminderService);

    appendAssistantTurns(ctx.context, 10);
    await reminder.reconcileWhenIdle(TODO_LIST_REMINDER_VARIANT);
    expect(reminderInjected(ctx)).toBe(false);

    await todo.replace([makeQuestion({ question: 'track me' })]);
    appendAssistantTurns(ctx.context, 10);
    await reminder.reconcileWhenIdle(TODO_LIST_REMINDER_VARIANT);
    expect(reminderInjected(ctx)).toBe(true);

    const sub = await lifecycle.create({ agentId: 'agent-1' });
    const subTodo = lifecycle.handleOf(sub.agentId)!.accessor.get(IAgentTodoService);
    const subReminder = lifecycle.handleOf(sub.agentId)!.accessor.get(IAgentReminderService);
    const subMemory = lifecycle.handleOf(sub.agentId)!.accessor.get(IAgentContextMemoryService);
    await subTodo.replace([makeQuestion({ question: 'sub task' })]);
    appendAssistantTurns(subMemory, 10);
    await subReminder.reconcileWhenIdle(TODO_LIST_REMINDER_VARIANT);
    expect(
      subMemory.get().some(
        (message) =>
          message.origin?.kind === 'injection' &&
          message.origin.variant === TODO_LIST_REMINDER_VARIANT,
      ),
    ).toBe(false);
    await lifecycle.remove(sub);
  });
});

describe('KeyedResourceLeasePool', () => {
  function nextTick(): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, 0));
  }

  it('deduplicates concurrent materialization by key', async () => {
    let creates = 0;
    const pool = new KeyedResourceLeasePool(
      { owner: 'todo.test', generation: 1 },
      async () => {
        creates += 1;
        await nextTick();
        return { dispose: () => {} };
      },
    );

    const [first, second] = await Promise.all([pool.acquire('main'), pool.acquire('main')]);
    expect(creates).toBe(1);
    expect(first.resource).toBe(second.resource);
    first.release();
    second.release();
    await pool.withdraw();
  });

  it('rejects stale generation acquires while an existing lease drains', async () => {
    let disposed = false;
    const pool = new KeyedResourceLeasePool(
      { owner: 'todo.test', generation: 2 },
      () => ({
        dispose: async () => {
          await nextTick();
          disposed = true;
        },
      }),
    );
    const lease = await pool.acquire('main');
    const withdrawal = pool.withdraw();

    await expect(pool.acquire('main')).rejects.toThrow('todo.test:2 is withdrawn');
    await nextTick();
    expect(disposed).toBe(false);
    lease.release();
    await withdrawal;
    expect(disposed).toBe(true);
  });
});
