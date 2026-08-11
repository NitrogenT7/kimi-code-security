import { describe, expect, it } from 'vitest';

import type { ServiceIdentifier, ServicesAccessor } from '#/_base/di/instantiation';
import { DisposableStore, toDisposable } from '#/_base/di/lifecycle';
import { type IAgentScopeHandle, LifecycleScope } from '#/_base/di/scope';
import { createServices } from '#/_base/di/test';
import { Emitter } from '#/_base/event';
import { IAgentLifecycleService } from '#/session/agentLifecycle/agentLifecycle';
import { readNotepadContent } from '#/session/notepad/notepadContent';
import { ISessionNotepadService } from '#/session/notepad/sessionNotepad';
import { SessionNotepadService } from '#/session/notepad/sessionNotepadService';
import { NotepadModel } from '#/session/notepad/notepadOps';
import { NotepadTool, type NotepadInput } from '#/session/notepad/tools/notepad';
import type { ExecutableToolResult } from '#/tool/toolContract';
import { IWireService } from '#/wire/wire';
import type { WireRecord } from '#/wire/record';

interface RecordedOp {
  readonly type: string;
  readonly key?: string;
  readonly value?: unknown;
}

interface FakeAgent {
  readonly handle: IAgentScopeHandle;
  readonly appended: RecordedOp[];
  readonly restore: (records: readonly WireRecord[]) => Promise<void>;
}

function makeFakeAgent(agentId: string): FakeAgent {
  const appended: RecordedOp[] = [];
  let notepadState = '';

  const applyStoreRecord = (key: unknown, value: unknown): void => {
    if (key === 'notepad') {
      notepadState = readNotepadContent(value);
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
    getModel: (model: unknown) => (model === NotepadModel ? notepadState : undefined),
  } as unknown as IWireService;

  const accessor: ServicesAccessor = {
    get: <T>(id: ServiceIdentifier<T>): T => {
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

  return { handle, appended, restore };
}

function makeLifecycleStub(handles: readonly IAgentScopeHandle[] = []): IAgentLifecycleService {
  const onDidCreate = new Emitter<IAgentScopeHandle>();
  const onDidDispose = new Emitter<string>();
  const byId = new Map(handles.map((h) => [h.id, h]));

  return {
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
}

describe('SessionNotepadService', () => {
  it('starts empty and reflects setContent', () => {
    const main = makeFakeAgent('main');
    const service = new SessionNotepadService(makeLifecycleStub([main.handle]));

    expect(service.getContent()).toBe('');

    service.setContent('remember this');
    expect(service.getContent()).toBe('remember this');

    service.clear();
    expect(service.getContent()).toBe('');
  });

  it('fires onDidChange after each setContent', () => {
    const main = makeFakeAgent('main');
    const service = new SessionNotepadService(makeLifecycleStub([main.handle]));

    const seen: string[] = [];
    const d = service.onDidChange((content) => seen.push(content));
    service.setContent('first');
    service.setContent('second');
    d.dispose();

    expect(seen).toEqual(['first', 'second']);
  });

  it('appends with a newline separator', () => {
    const main = makeFakeAgent('main');
    const service = new SessionNotepadService(makeLifecycleStub([main.handle]));

    service.append('line one');
    expect(service.getContent()).toBe('line one');

    service.append('line two');
    expect(service.getContent()).toBe('line one\nline two');

    service.setContent('trailing newline\n');
    service.append('after newline');
    expect(service.getContent()).toBe('trailing newline\nafter newline');
  });

  it('appends a tools.update_store record to the main agent wire on setContent', () => {
    const main = makeFakeAgent('main');
    const service = new SessionNotepadService(makeLifecycleStub([main.handle]));

    service.setContent('persist me');

    expect(main.appended).toEqual([
      {
        type: 'tools.update_store',
        key: 'notepad',
        value: 'persist me',
      },
    ]);
  });

  it('does not append to the wire when the main agent is absent', () => {
    const service = new SessionNotepadService(makeLifecycleStub());
    expect(() => {
      service.setContent('x');
    }).not.toThrow();
    expect(service.getContent()).toBe('');
  });

  it('rebuilds the content when a notepad tools.update_store record is replayed', async () => {
    const main = makeFakeAgent('main');
    const service = new SessionNotepadService(makeLifecycleStub([main.handle]));

    await main.restore([{ type: 'tools.update_store', key: 'notepad', value: 'restored' }]);

    expect(service.getContent()).toBe('restored');
  });

  it('treats a non-string notepad tools.update_store value as empty on replay', async () => {
    const main = makeFakeAgent('main');
    const service = new SessionNotepadService(makeLifecycleStub([main.handle]));

    await main.restore([
      { type: 'tools.update_store', key: 'notepad', value: ['not', 'a', 'string'] } as unknown as WireRecord,
    ]);

    expect(service.getContent()).toBe('');
  });

  it('satisfies the ISessionNotepadService contract', () => {
    const service: ISessionNotepadService = new SessionNotepadService(makeLifecycleStub());
    expect(typeof service.getContent).toBe('function');
    expect(typeof service.setContent).toBe('function');
    expect(typeof service.append).toBe('function');
    expect(typeof service.clear).toBe('function');
    expect(typeof service.onDidChange).toBe('function');
  });
});

describe('NotepadTool', () => {
  async function runTool(
    tool: NotepadTool,
    input: NotepadInput,
  ): Promise<ExecutableToolResult> {
    const execution = tool.resolveExecution(input);
    if (!('execute' in execution)) return execution;
    return execution.execute({
      turnId: 0,
      toolCallId: 'test-call',
      signal: new AbortController().signal,
    });
  }

  function makeTool(notepad: Partial<ISessionNotepadService>): {
    tool: NotepadTool;
    disposables: DisposableStore;
  } {
    const disposables = new DisposableStore();
    const ix = createServices(disposables, {
      additionalServices: (reg) => {
        reg.definePartialInstance(ISessionNotepadService, {
          getContent: () => '',
          setContent: () => {},
          append: () => {},
          clear: () => {},
          ...notepad,
        });
      },
    });
    return { tool: ix.createInstance(NotepadTool), disposables };
  }

  it('reports an empty notepad on read', async () => {
    const { tool, disposables } = makeTool({});
    const result = await runTool(tool, {});
    disposables.dispose();

    expect(result.isError).toBe(false);
    expect(result.output).toBe('Notepad is empty.');
  });

  it('reads the current content', async () => {
    const { tool, disposables } = makeTool({ getContent: () => 'stored note' });
    const result = await runTool(tool, {});
    disposables.dispose();

    expect(result.isError).toBe(false);
    expect(result.output).toBe('stored note');
  });

  it('replaces the full content via content', async () => {
    let stored = 'old';
    const { tool, disposables } = makeTool({
      getContent: () => stored,
      setContent: (content: string) => {
        stored = content;
      },
    });
    const result = await runTool(tool, { content: 'new content' });
    disposables.dispose();

    expect(result.isError).toBe(false);
    expect(stored).toBe('new content');
    expect(result.output).toContain('Notepad updated.');
    expect(result.output).toContain('new content');
  });

  it('clears the notepad via an empty content string', async () => {
    let stored = 'something';
    const { tool, disposables } = makeTool({
      getContent: () => stored,
      setContent: (content: string) => {
        stored = content;
      },
    });
    const result = await runTool(tool, { content: '' });
    disposables.dispose();

    expect(result.isError).toBe(false);
    expect(stored).toBe('');
    expect(result.output).toBe('Notepad cleared.');
  });

  it('appends via append', async () => {
    const appended: string[] = [];
    const { tool, disposables } = makeTool({
      getContent: () => 'existing\nplus more',
      append: (text: string) => {
        appended.push(text);
      },
    });
    const result = await runTool(tool, { append: 'plus more' });
    disposables.dispose();

    expect(result.isError).toBe(false);
    expect(appended).toEqual(['plus more']);
    expect(result.output).toContain('Notepad updated.');
  });

  it('rejects passing content and append together', async () => {
    const { tool, disposables } = makeTool({});
    const result = await runTool(tool, { content: 'a', append: 'b' });
    disposables.dispose();

    expect(result.isError).toBe(true);
    expect(result.output).toContain('not both');
  });
});
