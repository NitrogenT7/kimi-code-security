/**
 * Covers the NotepadTool contract: query / full-replace / append / clear,
 * and the store persistence key the slash command and compaction read.
 */

import { describe, expect, it } from 'vitest';

import {
  joinNotepad,
  NOTEPAD_STORE_KEY,
  NOTEPAD_TOOL_NAME,
  NotepadTool,
  readNotepadContent,
  renderNotepad,
} from '../../src/tools/builtin/state/notepad';
import type { ToolStore } from '../../src/tools/store';
import { executeTool } from './fixtures/execute-tool';

const signal = new AbortController().signal;

function makeStore(initial = ''): {
  store: ToolStore;
  getContent(): string;
} {
  let content = initial;
  return {
    store: {
      get: (key) => (key === NOTEPAD_STORE_KEY ? (content as never) : undefined),
      set: (key, value) => {
        if (key === NOTEPAD_STORE_KEY) {
          content = value as string;
        }
      },
    },
    getContent: () => content,
  };
}

function run(tool: NotepadTool, args: { content?: string; append?: string }) {
  return executeTool(tool, { args, signal, turnId: 't1', toolCallId: 'call_1' });
}

describe('NotepadTool', () => {
  it('has the expected name', () => {
    const { store } = makeStore();
    expect(new NotepadTool(store).name).toBe(NOTEPAD_TOOL_NAME);
    expect(new NotepadTool(store).name).toBe('Notepad');
  });

  it('reports an empty notepad on read', async () => {
    const { store } = makeStore();
    const result = await run(new NotepadTool(store), {});
    expect(result.isError).toBe(false);
    expect(result.output).toBe('Notepad is empty.');
  });

  it('reads the current content', async () => {
    const { store } = makeStore('stored note');
    const result = await run(new NotepadTool(store), {});
    expect(result.isError).toBe(false);
    expect(result.output).toBe('stored note');
  });

  it('replaces the full content via content', async () => {
    const { store, getContent } = makeStore('old');
    const result = await run(new NotepadTool(store), { content: 'new content' });
    expect(result.isError).toBe(false);
    expect(getContent()).toBe('new content');
    expect(result.output).toContain('Notepad updated.');
    expect(result.output).toContain('new content');
  });

  it('clears the notepad via an empty content string', async () => {
    const { store, getContent } = makeStore('something');
    const result = await run(new NotepadTool(store), { content: '' });
    expect(result.isError).toBe(false);
    expect(getContent()).toBe('');
    expect(result.output).toBe('Notepad cleared.');
  });

  it('appends via append with a newline separator', async () => {
    const { store, getContent } = makeStore('line one');
    const result = await run(new NotepadTool(store), { append: 'line two' });
    expect(result.isError).toBe(false);
    expect(getContent()).toBe('line one\nline two');
    expect(result.output).toContain('line one\nline two');
  });

  it('appends to an empty notepad without a leading newline', async () => {
    const { store, getContent } = makeStore();
    await run(new NotepadTool(store), { append: 'first' });
    expect(getContent()).toBe('first');
  });

  it('rejects passing content and append together', async () => {
    const { store } = makeStore();
    const result = await run(new NotepadTool(store), { content: 'a', append: 'b' });
    expect(result.isError).toBe(true);
    expect(result.output).toContain('not both');
  });
});

describe('readNotepadContent', () => {
  it('returns strings verbatim and everything else as empty', () => {
    expect(readNotepadContent('x')).toBe('x');
    expect(readNotepadContent(undefined)).toBe('');
    expect(readNotepadContent(['not', 'a', 'string'])).toBe('');
    expect(readNotepadContent(42)).toBe('');
  });
});

describe('joinNotepad', () => {
  it('joins with a newline unless the current content ends with one', () => {
    expect(joinNotepad('', 'a')).toBe('a');
    expect(joinNotepad('a', 'b')).toBe('a\nb');
    expect(joinNotepad('a\n', 'b')).toBe('a\nb');
  });
});

describe('renderNotepad', () => {
  it('renders a titled section and skips empty content', () => {
    expect(renderNotepad('note')).toBe('## Notepad\nnote');
    expect(renderNotepad('  \n ')).toBeUndefined();
    expect(renderNotepad('')).toBeUndefined();
  });
});
