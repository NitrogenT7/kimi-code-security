import { describe, expect, it } from 'vitest';

import type { ServiceIdentifier, ServicesAccessor } from '#/_base/di/instantiation';
import { IInstantiationService } from '#/_base/di/instantiation';
import { toDisposable, type IDisposable } from '#/_base/di/lifecycle';
import { type IAgentScopeHandle, LifecycleScope } from '#/_base/di/scope';
import { Emitter } from '#/_base/event';
import { IAgentContextInjectorService } from '#/agent/contextInjector/contextInjector';
import { IAgentContextMemoryService } from '#/agent/contextMemory/contextMemory';
import { IAgentProfileService } from '#/agent/profile/profile';
import { IAgentToolRegistryService } from '#/agent/toolRegistry/toolRegistry';
import { createHooks } from '#/hooks';
import { IAgentLifecycleService } from '#/session/agentLifecycle/agentLifecycle';
import { readFindingItems, type FindingItem } from '#/session/todo/findings';
import { ISessionTodoService } from '#/session/todo/sessionTodo';
import { SessionTodoService } from '#/session/todo/sessionTodoService';
import {
  readTodoItems,
  type QuestionItem,
  type TodoItem,
} from '#/session/todo/todoItem';
import { FindingsModel } from '#/session/todo/todoOps';
import { TODO_LIST_REMINDER_VARIANT } from '#/session/todo/todoListReminder';
import { IWireService, type WireHooks } from '#/wire/wire';
import type { WireRecord } from '#/wire/record';

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

interface RecordedOp {
  readonly type: string;
  readonly key?: string;
  readonly value?: unknown;
}

interface FakeAgent {
  readonly handle: IAgentScopeHandle;
  readonly registeredTools: string[];
  readonly registeredVariants: string[];
  readonly appended: RecordedOp[];
  readonly restore: (records: readonly WireRecord[]) => Promise<void>;
}

function makeFakeAgent(agentId: string): FakeAgent {
  const registeredTools: string[] = [];
  const registeredVariants: string[] = [];
  const appended: RecordedOp[] = [];

  let todoState: readonly TodoItem[] = [];
  let findingsState: readonly FindingItem[] = [];

  const registryStub = {
    _serviceBrand: undefined,
    register: (tool: { name: string }) => {
      registeredTools.push(tool.name);
      return toDisposable(() => {});
    },
    list: () => [],
    resolve: () => undefined,
    hooks: {},
  };

  const injectorStub = {
    _serviceBrand: undefined,
    register: (variant: string) => {
      registeredVariants.push(variant);
      return toDisposable(() => {});
    },
  };

  const instantiationStub = {
    createInstance: (ctor: { name: string }) => ({ name: ctor.name }),
  };

  const memoryStub = {
    _serviceBrand: undefined,
    get: () => [],
  };

  const profileStub = {
    _serviceBrand: undefined,
    isToolActive: () => false,
  };

  const applyStoreRecord = (key: unknown, value: unknown): void => {
    if (key === 'todo') {
      todoState = readTodoItems(value);
    } else if (key === 'findings') {
      findingsState = readFindingItems(value);
    }
  };

  const restore = async (records: readonly WireRecord[]): Promise<void> => {
    for (const record of records) {
      if (record.type === 'tools.update_store') {
        applyStoreRecord(record['key'], record['value']);
      }
    }
  };

  const wireStub: IWireService = {
    _serviceBrand: undefined,
    hooks: createHooks<WireHooks, keyof WireHooks>(['onDidRestore']),
    dispatch: (...ops: unknown[]) => {
      for (const raw of ops) {
        const op = raw as { type: string; payload: unknown };
        const payload = op.payload;
        const record =
          payload !== null && typeof payload === 'object' && !Array.isArray(payload)
            ? (payload as Record<string, unknown>)
            : { payload };
        appended.push({ type: op.type, ...record } as unknown as RecordedOp);
        if (op.type === 'tools.update_store') {
          applyStoreRecord(record['key'], record['value']);
        }
      }
    },
    restore: async () => {},
    flush: async () => {},
    getModel: (model: unknown) => (model === FindingsModel ? findingsState : todoState),
    subscribe: () => toDisposable(() => {}),
  } as unknown as IWireService;

  const accessor: ServicesAccessor = {
    get: <T>(id: ServiceIdentifier<T>): T => {
      if (id === IAgentToolRegistryService) return registryStub as unknown as T;
      if (id === IAgentContextInjectorService) return injectorStub as unknown as T;
      if (id === IInstantiationService) return instantiationStub as unknown as T;
      if (id === IAgentContextMemoryService) return memoryStub as unknown as T;
      if (id === IAgentProfileService) return profileStub as unknown as T;
      if (id === IWireService) return wireStub as unknown as T;
      throw new Error(`unexpected service request in fake agent: ${String(id)}`);
    },
  };

  const handle: IAgentScopeHandle = {
    id: agentId,
    kind: LifecycleScope.Agent,
    accessor,
    dispose: () => {},
  };

  return {
    handle,
    registeredTools,
    registeredVariants,
    appended,
    restore,
  };
}

interface LifecycleStub {
  readonly service: IAgentLifecycleService;
  readonly fireCreate: (handle: IAgentScopeHandle) => void;
  readonly fireDispose: (agentId: string) => void;
}

function makeLifecycleStub(handles: readonly IAgentScopeHandle[] = []): LifecycleStub {
  const onDidCreate = new Emitter<IAgentScopeHandle>();
  const onDidDispose = new Emitter<string>();
  const byId = new Map(handles.map((h) => [h.id, h]));

  const service: IAgentLifecycleService = {
    _serviceBrand: undefined,
    onDidCreate: onDidCreate.event,
    onDidDispose: onDidDispose.event,
    get: (id: string) => byId.get(id),
    list: () => [...byId.values()],
    create: async () => {
      throw new Error('not implemented');
    },
    fork: async () => {
      throw new Error('not implemented');
    },
    remove: async () => {},
  };

  return {
    service,
    fireCreate: (h) => {
      byId.set(h.id, h);
      onDidCreate.fire(h);
    },
    fireDispose: (id) => {
      byId.delete(id);
      onDidDispose.fire(id);
    },
  };
}

describe('SessionTodoService', () => {
  it('starts empty and updates the list on setTodos', () => {
    const main = makeFakeAgent('main');
    const lifecycle = makeLifecycleStub([main.handle]);
    const service = new SessionTodoService(lifecycle.service);

    expect(service.getTodos()).toEqual([]);

    const next: TodoItem[] = [
      makeQuestion({ question: 'a', status: 'pending' }),
      makeQuestion({ question: 'b', status: 'investigating' }),
    ];
    service.setTodos(next);
    expect(service.getTodos()).toEqual(next);

    service.clear();
    expect(service.getTodos()).toEqual([]);
  });

  it('fires onDidChange after each setTodos', () => {
    const main = makeFakeAgent('main');
    const lifecycle = makeLifecycleStub([main.handle]);
    const service = new SessionTodoService(lifecycle.service);

    const seen: Array<readonly TodoItem[]> = [];
    const d = service.onDidChange((todos) => seen.push(todos));
    service.setTodos([makeQuestion({ question: 'x', status: 'pending' })]);
    service.setTodos([
      makeQuestion({
        question: 'y',
        status: 'resolved',
        conclusion: 'done',
        evidence: [{ status: 'confirmed', description: 'confirmed' }],
      }),
    ]);
    d.dispose();

    expect(seen).toHaveLength(2);
    expect(seen[0]?.[0]).toMatchObject({ question: 'x', status: 'pending' });
    expect(seen[1]?.[0]).toMatchObject({ question: 'y', status: 'resolved' });
  });

  it('appends a tools.update_store record to the main agent wire on setTodos', () => {
    const main = makeFakeAgent('main');
    const lifecycle = makeLifecycleStub([main.handle]);
    const service = new SessionTodoService(lifecycle.service);

    const question = makeQuestion({ question: 'persist me', status: 'investigating' });
    service.setTodos([question]);

    expect(main.appended).toEqual([
      {
        type: 'tools.update_store',
        key: 'todo',
        value: [question],
      },
    ]);
  });

  it('does not append to the wire when the main agent is absent', () => {
    const lifecycle = makeLifecycleStub();
    const service = new SessionTodoService(lifecycle.service);
    expect(() => service.setTodos([makeQuestion({ question: 'x' })])).not.toThrow();
    expect(service.getTodos()).toEqual([]);
  });

  it('binds the stale-todo reminder into every created agent', () => {
    const lifecycle = makeLifecycleStub();
    const service = new SessionTodoService(lifecycle.service);
    void service;

    const main = makeFakeAgent('main');
    const sub = makeFakeAgent('agent-1');
    lifecycle.fireCreate(main.handle);
    lifecycle.fireCreate(sub.handle);

    expect(main.registeredVariants).toContain(TODO_LIST_REMINDER_VARIANT);
    expect(sub.registeredVariants).toContain(TODO_LIST_REMINDER_VARIANT);
  });

  it('rebuilds the list when a todo tools.update_store record is replayed', async () => {
    const main = makeFakeAgent('main');
    const lifecycle = makeLifecycleStub([main.handle]);
    const service = new SessionTodoService(lifecycle.service);

    const restored = makeQuestion({
      question: 'restored',
      status: 'resolved',
      conclusion: 'yes',
      evidence: [{ status: 'confirmed', description: 'confirmed' }],
    });
    await main.restore([{ type: 'tools.update_store', key: 'todo', value: [restored] }]);

    expect(service.getTodos()).toEqual([restored]);
  });

  it('migrates legacy { title, status } items when a todo record is replayed', async () => {
    const main = makeFakeAgent('main');
    const lifecycle = makeLifecycleStub([main.handle]);
    const service = new SessionTodoService(lifecycle.service);

    await main.restore([
      {
        type: 'tools.update_store',
        key: 'todo',
        value: [
          { title: 'legacy active', status: 'in_progress' },
          { title: 'legacy queued', status: 'pending' },
        ],
      },
    ]);

    const todos = service.getTodos();
    expect(todos).toHaveLength(2);
    expect(todos[0]).toMatchObject({
      type: 'question',
      question: 'legacy active',
      status: 'investigating',
      confidence: 'medium',
      depth: 'deep',
    });
    expect(todos[1]).toMatchObject({
      type: 'question',
      question: 'legacy queued',
      status: 'pending',
    });
    expect(todos[0]?.id).toBeTruthy();
  });

  it('disposes per-agent bindings when the agent is disposed', () => {
    const lifecycle = makeLifecycleStub();
    const service = new SessionTodoService(lifecycle.service);
    const main = makeFakeAgent('main');
    lifecycle.fireCreate(main.handle);

    expect(main.registeredVariants).toContain(TODO_LIST_REMINDER_VARIANT);
    expect(() => lifecycle.fireDispose('main')).not.toThrow();
    expect(service.getTodos()).toEqual([]);
  });

  it('satisfies the ISessionTodoService contract', () => {
    const lifecycle = makeLifecycleStub();
    const service: ISessionTodoService = new SessionTodoService(lifecycle.service);
    expect(typeof service.getTodos).toBe('function');
    expect(typeof service.setTodos).toBe('function');
    expect(typeof service.clear).toBe('function');
    expect(typeof service.getFindings).toBe('function');
    expect(typeof service.onDidChange).toBe('function');
  });

  it('cleans malformed items from a replayed todo tools.update_store record', async () => {
    const main = makeFakeAgent('main');
    const lifecycle = makeLifecycleStub([main.handle]);
    const service = new SessionTodoService(lifecycle.service);

    const valid = makeQuestion({ question: 'valid', status: 'pending' });
    await main.restore([
      {
        type: 'tools.update_store',
        key: 'todo',
        value: [
          valid,
          { title: 'missing status' },
          { title: 123, status: 'pending' },
          'garbage',
          { type: 'question', id: 'x', question: 'bad status', status: 'wip' },
        ],
      } as unknown as WireRecord,
    ]);

    expect(service.getTodos()).toEqual([valid]);
  });

  it('treats a non-array todo tools.update_store value as an empty list on replay', async () => {
    const main = makeFakeAgent('main');
    const lifecycle = makeLifecycleStub([main.handle]);
    const service = new SessionTodoService(lifecycle.service);

    await main.restore([
      { type: 'tools.update_store', key: 'todo', value: 'not-an-array' } as unknown as WireRecord,
    ]);

    expect(service.getTodos()).toEqual([]);
  });

  it('archives removed resolved items into the findings store', () => {
    const main = makeFakeAgent('main');
    const lifecycle = makeLifecycleStub([main.handle]);
    const service = new SessionTodoService(lifecycle.service);

    const resolved = makeQuestion({
      id: 'resolved-1',
      question: 'Was this reachable?',
      status: 'resolved',
      conclusion: 'Yes, through path X',
      evidence: [{ status: 'confirmed', description: 'Confirmed in source' }],
      confidence: 'high',
    });
    service.setTodos([
      makeQuestion({ id: 'active-1', question: 'Active question?', status: 'investigating' }),
      resolved,
    ]);
    expect(service.getFindings()).toEqual([]);

    service.setTodos([
      makeQuestion({ id: 'active-1', question: 'Active question?', status: 'investigating' }),
    ]);

    const findings = service.getFindings();
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      id: 'resolved-1',
      question: 'Was this reachable?',
      conclusion: 'Yes, through path X',
      status: 'resolved',
      confidence: 'high',
    });
    expect(findings[0]?.resolvedAt).toBeGreaterThan(0);

    const findingsRecord = main.appended.find((op) => op.key === 'findings');
    expect(findingsRecord).toBeDefined();
    expect(findingsRecord?.type).toBe('tools.update_store');
  });

  it('archives removed inconclusive items with a fallback conclusion', () => {
    const main = makeFakeAgent('main');
    const lifecycle = makeLifecycleStub([main.handle]);
    const service = new SessionTodoService(lifecycle.service);

    service.setTodos([
      makeQuestion({ id: 'dead-end', question: 'Dead end?', status: 'inconclusive' }),
    ]);
    service.setTodos([]);

    const findings = service.getFindings();
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ id: 'dead-end', status: 'inconclusive' });
    expect(findings[0]?.conclusion).toBe('无法得出结论');
  });

  it('does not archive pending/investigating items removed from the list', () => {
    const main = makeFakeAgent('main');
    const lifecycle = makeLifecycleStub([main.handle]);
    const service = new SessionTodoService(lifecycle.service);

    service.setTodos([
      makeQuestion({ id: 'active-1', question: 'Active?', status: 'investigating' }),
    ]);
    service.setTodos([]);

    expect(service.getFindings()).toEqual([]);
    expect(main.appended.find((op) => op.key === 'findings')).toBeUndefined();
  });

  it('does not archive resolved items that are still in the replacement list', () => {
    const main = makeFakeAgent('main');
    const lifecycle = makeLifecycleStub([main.handle]);
    const service = new SessionTodoService(lifecycle.service);

    const resolved = makeQuestion({
      id: 'resolved-1',
      question: 'Kept?',
      status: 'resolved',
      conclusion: 'Yes',
      evidence: [{ status: 'confirmed', description: 'Confirmed' }],
    });
    service.setTodos([resolved]);
    service.setTodos([resolved]);

    expect(service.getFindings()).toEqual([]);
  });

  it('rebuilds the findings archive when a findings tools.update_store record is replayed', async () => {
    const main = makeFakeAgent('main');
    const lifecycle = makeLifecycleStub([main.handle]);
    const service = new SessionTodoService(lifecycle.service);

    const finding: FindingItem = {
      id: 'f1',
      question: 'Archived?',
      conclusion: 'Yes',
      evidence: [{ status: 'confirmed', description: 'Confirmed' }],
      confidence: 'medium',
      depth: 'deep',
      status: 'resolved',
      resolvedAt: 123,
      subFindings: [],
    };
    await main.restore([{ type: 'tools.update_store', key: 'findings', value: [finding] }]);

    expect(service.getFindings()).toEqual([finding]);
  });
});
