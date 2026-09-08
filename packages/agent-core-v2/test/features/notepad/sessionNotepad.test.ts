import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { IAgentLifecycleService } from '#/session/agentLifecycle/agentLifecycle';
import { NotepadAgentModelDefinition } from '#/features/notepad/notepadAgentModel';
import {
  NOTEPAD_STORE_KEY,
  NOTEPAD_TOOL_NAME,
  renderNotepad,
} from '#/features/notepad/notepadContent';
import { ISessionNotepadService } from '#/features/notepad/sessionNotepad';
import { INotepadTool, NotepadInputSchema } from '#/features/notepad/tools/notepad';
import { NotepadTool } from '#/features/notepad/tools/notepadTool';
import { agentSpaceOf } from '#/agent/agentContext/agentSpace';
import type { WireRecord } from '#/wire/record';

import {
  createTestAgent,
  InMemoryWireRecordPersistence,
  type TestAgentContext,
} from '../../harness';

const signal = new AbortController().signal;

describe('NotepadAgentModel', () => {
  let ctx: TestAgentContext;

  beforeEach(async () => {
    ctx = createTestAgent();
    await ctx.restorePersisted();
  });

  afterEach(async () => {
    await ctx.dispose();
  });

  it('stores content as a durable tools.update_store record on the main agent', async () => {
    const notepad = ctx.get(ISessionNotepadService);

    expect(notepad.getContent()).toBe('');

    notepad.setContent('first note');
    await vi.waitFor(() => {
      expect(notepad.getContent()).toBe('first note');
    });

    const records = await ctx.persistedWireRecords();
    expect(records.filter((record) => record.type === 'tools.update_store')).toEqual([{
      type: 'tools.update_store',
      agentId: 'main',
      key: NOTEPAD_STORE_KEY,
      value: 'first note',
      time: expect.any(Number),
    }]);
  });

  it('appends with newline semantics and clears to empty', async () => {
    const notepad = ctx.get(ISessionNotepadService);

    notepad.append('line one');
    notepad.append('line two');
    await vi.waitFor(() => {
      expect(notepad.getContent()).toBe('line one\nline two');
    });

    notepad.setContent('has trailing newline\n');
    await vi.waitFor(() => {
      expect(notepad.getContent()).toBe('has trailing newline\n');
    });
    notepad.append('appended');
    await vi.waitFor(() => {
      expect(notepad.getContent()).toBe('has trailing newline\nappended');
    });

    notepad.clear();
    await vi.waitFor(() => {
      expect(notepad.getContent()).toBe('');
    });
  });

  it('fires onDidChange with the new content after each persisted mutation', async () => {
    const notepad = ctx.get(ISessionNotepadService);
    const seen: string[] = [];
    const subscription = notepad.onDidChange((content) => { seen.push(content); });

    notepad.setContent('noted');
    await vi.waitFor(() => {
      expect(seen).toEqual(['noted']);
    });

    notepad.clear();
    await vi.waitFor(() => {
      expect(seen).toEqual(['noted', '']);
    });
    subscription.dispose();
  });

  it('filters malformed persisted values during replay', async () => {
    const persistence = new InMemoryWireRecordPersistence();
    persistence.records.push({
      type: 'tools.update_store',
      key: NOTEPAD_STORE_KEY,
      value: 42,
    } as unknown as WireRecord);
    const seeded = createTestAgent({ persistence, autoConfigure: false });
    try {
      await seeded.restorePersisted();
      expect(seeded.get(ISessionNotepadService).getContent()).toBe('');
    } finally {
      await seeded.dispose();
    }
  });

  it('restores the notepad from persisted wire records after restart', async () => {
    const persistence = new InMemoryWireRecordPersistence();
    const first = createTestAgent({ persistence, autoConfigure: false });
    await first.restorePersisted();
    first.get(ISessionNotepadService).setContent('survives compaction');
    await vi.waitFor(() => {
      expect(first.get(ISessionNotepadService).getContent()).toBe('survives compaction');
    });
    await first.dispose();

    const restarted = createTestAgent({ persistence, autoConfigure: false });
    try {
      await restarted.restorePersisted();
      expect(restarted.get(ISessionNotepadService).getContent()).toBe('survives compaction');
    } finally {
      await restarted.dispose();
    }
  });

  it('is shared between the main agent and subagents through the session service', async () => {
    const lifecycle = ctx.get(IAgentLifecycleService);
    const sub = await lifecycle.create({ agentId: 'agent-1' });
    try {
      const shared = lifecycle.handleOf(sub.agentId)!.accessor.get(ISessionNotepadService);
      expect(shared).toBe(ctx.get(ISessionNotepadService));

      shared.setContent('written from subagent');
      await vi.waitFor(() => {
        expect(ctx.get(ISessionNotepadService).getContent()).toBe('written from subagent');
      });
    } finally {
      await lifecycle.remove(sub);
    }
  });

  it('instantiates the Notepad tool in a subagent scope with the session service', async () => {
    const lifecycle = ctx.get(IAgentLifecycleService);
    const sub = await lifecycle.create({ agentId: 'agent-1' });
    try {
      const tool = lifecycle.handleOf(sub.agentId)!.accessor.get(INotepadTool);
      expect(tool).toBeInstanceOf(NotepadTool);

      const execution = tool.resolveExecution({ content: 'from the sub agent tool' });
      const result = await execution.execute({
        signal: new AbortController().signal,
        turnId: 1,
        toolCallId: 'call_sub',
      });
      expect(result).toMatchObject({
        isError: false,
        output: 'Notepad updated.\nfrom the sub agent tool',
      });
    } finally {
      await lifecycle.remove(sub);
    }
  });

  it('round-trips content through the agent model of the main agent', async () => {
    const lifecycle = ctx.get(IAgentLifecycleService);
    const main = lifecycle.get('main')!;
    ctx.get(ISessionNotepadService).setContent('via model');
    await vi.waitFor(() => {
      expect(notepadContentViaModel(main)).toBe('via model');
    });
  });
});

function notepadContentViaModel(agent: ReturnType<IAgentLifecycleService['get']>): string {
  if (agent === undefined) return '';
  return agentSpaceOf(agent).use(NotepadAgentModelDefinition, (model) => model.get());
}

describe('NotepadTool', () => {
  let ctx: TestAgentContext;

  beforeEach(async () => {
    ctx = createTestAgent();
    await ctx.restorePersisted();
  });

  afterEach(async () => {
    await ctx.dispose();
  });

  function tool(): NotepadTool {
    return ctx.get(INotepadTool) as NotepadTool;
  }

  async function run(args: Parameters<NotepadTool['resolveExecution']>[0]) {
    const execution = tool().resolveExecution(args);
    if ('execute' in execution) return execution.execute({ signal, turnId: 1, toolCallId: 'call_1' });
    return execution;
  }

  it('has name, description, and parameters from the current schema', () => {
    const instance = tool();
    expect(NOTEPAD_TOOL_NAME).toBe('Notepad');
    expect(instance.name).toBe(NOTEPAD_TOOL_NAME);
    expect(instance.description.length).toBeGreaterThan(0);
    expect(NotepadInputSchema.safeParse({}).success).toBe(true);
    expect(instance.parameters).toMatchObject({
      type: 'object',
      additionalProperties: false,
      properties: {
        content: { type: 'string' },
        append: { type: 'string' },
      },
    });
  });

  it('reads, rewrites, appends, and clears through one tool', async () => {
    expect(await run({})).toMatchObject({ isError: false, output: 'Notepad is empty.' });

    expect(await run({ content: 'scratch note' })).toMatchObject({
      isError: false,
      output: 'Notepad updated.\nscratch note',
    });
    expect(await run({ append: 'more' })).toMatchObject({
      isError: false,
      output: 'Notepad updated.\nscratch note\nmore',
    });
    expect(await run({})).toMatchObject({ isError: false, output: 'scratch note\nmore' });

    expect(await run({ content: '' })).toMatchObject({ isError: false, output: 'Notepad cleared.' });
    expect(ctx.get(ISessionNotepadService).getContent()).toBe('');
  });

  it('rejects passing both content and append', async () => {
    const result = await run({ content: 'a', append: 'b' });
    expect(result).toMatchObject({
      isError: true,
      output: 'Pass either "content" (full replacement) or "append" (additive), not both.',
    });
  });
});

describe('renderNotepad', () => {
  it('renders a titled section and skips empty content', () => {
    expect(renderNotepad('  ')).toBeUndefined();
    expect(renderNotepad('')).toBeUndefined();
    expect(renderNotepad('hello')).toBe('## Notepad\nhello');
    expect(renderNotepad('hello', '## Notes')).toBe('## Notes\nhello');
  });
});
