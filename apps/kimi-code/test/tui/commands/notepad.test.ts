import { beforeEach, describe, expect, it, vi } from 'vitest';

import { handleNotepadCommand, parseNotepadCommand } from '#/tui/commands/index';
import type { SlashCommandHost } from '#/tui/commands/dispatch';
import { NotepadMessageComponent } from '#/tui/components/messages/notepad-panel';
import { currentTheme } from '#/tui/theme';

const editInExternalEditor = vi.fn<(initialText: string, command: string) => Promise<string | undefined>>();

vi.mock('#/utils/process/external-editor', () => ({
  resolveEditorCommand: (configured?: string | null) =>
    typeof configured === 'string' && configured.length > 0 ? configured : undefined,
  editInExternalEditor: (initialText: string, command: string) =>
    editInExternalEditor(initialText, command),
}));

function stripAnsi(text: string): string {
  return text.replaceAll(/\u001B\[[0-9;]*m/g, '');
}

function makeHost(overrides: { notepad?: string; editorCommand?: string } = {}) {
  const session = {
    getNotepad: vi.fn(async () => overrides.notepad ?? ''),
    setNotepad: vi.fn(async (_content: string) => {}),
  };
  const host = {
    state: {
      appState: {
        model: 'kimi-model',
        editorCommand: overrides.editorCommand,
      },
      theme: currentTheme,
      externalEditorRunning: false,
      editor: { focus: vi.fn() },
      transcriptContainer: { addChild: vi.fn() },
      ui: {
        stop: vi.fn(),
        start: vi.fn(),
        setFocus: vi.fn(),
        requestRender: vi.fn(),
      },
    },
    session,
    requireSession: () => session,
    showError: vi.fn(),
    showStatus: vi.fn(),
    track: vi.fn(),
  } as unknown as SlashCommandHost;
  return { host, session };
}

describe('parseNotepadCommand', () => {
  it('parses bare and status as status', () => {
    expect(parseNotepadCommand('')).toEqual({ kind: 'status' });
    expect(parseNotepadCommand('  ')).toEqual({ kind: 'status' });
    expect(parseNotepadCommand('status')).toEqual({ kind: 'status' });
  });

  it('parses edit', () => {
    expect(parseNotepadCommand('edit')).toEqual({ kind: 'edit' });
  });

  it('rejects unknown arguments with a usage hint', () => {
    expect(parseNotepadCommand('clear')).toEqual({
      kind: 'error',
      message: 'Usage: /notepad [status|edit]',
    });
  });
});

describe('handleNotepadCommand', () => {
  beforeEach(() => {
    editInExternalEditor.mockReset();
  });

  it('shows a status hint when the notepad is empty', async () => {
    const { host } = makeHost({ notepad: '' });
    await handleNotepadCommand(host, 'status');
    expect(host.showStatus).toHaveBeenCalledWith(expect.stringContaining('Notepad is empty'));
    expect(host.state.transcriptContainer.addChild).not.toHaveBeenCalled();
  });

  it('renders the notepad content as a transcript panel', async () => {
    const { host } = makeHost({ notepad: 'auth endpoint uses cursor pagination' });
    await handleNotepadCommand(host, '');
    const addChild = host.state.transcriptContainer.addChild as ReturnType<typeof vi.fn>;
    expect(addChild).toHaveBeenCalledTimes(1);
    const component = addChild.mock.calls[0]?.[0] as NotepadMessageComponent;
    expect(component).toBeInstanceOf(NotepadMessageComponent);
    const rendered = stripAnsi(component.render(80).join('\n'));
    expect(rendered).toContain('Notepad');
    expect(rendered).toContain('auth endpoint uses cursor pagination');
  });

  it('shows a usage hint for unknown arguments', async () => {
    const { host } = makeHost();
    await handleNotepadCommand(host, 'clear');
    expect(host.showStatus).toHaveBeenCalledWith('Usage: /notepad [status|edit]');
  });

  it('reports an error when no editor is configured', async () => {
    const { host } = makeHost({ notepad: 'x' });
    await handleNotepadCommand(host, 'edit');
    expect(host.showError).toHaveBeenCalledWith(expect.stringContaining('No editor configured'));
  });

  it('saves the edited content back through the session', async () => {
    const { host, session } = makeHost({ notepad: 'old', editorCommand: 'fake-editor' });
    editInExternalEditor.mockResolvedValue('edited\n');
    await handleNotepadCommand(host, 'edit');

    expect(editInExternalEditor).toHaveBeenCalledWith('old', 'fake-editor');
    expect(session.setNotepad).toHaveBeenCalledWith('edited');
    expect(host.showStatus).toHaveBeenCalledWith('Notepad updated.');
    expect(host.state.ui.stop).toHaveBeenCalled();
    expect(host.state.ui.start).toHaveBeenCalled();
    expect(host.state.externalEditorRunning).toBe(false);
  });

  it('reports a cleared notepad when the editor empties the file', async () => {
    const { host, session } = makeHost({ notepad: 'old', editorCommand: 'fake-editor' });
    editInExternalEditor.mockResolvedValue('\n');
    await handleNotepadCommand(host, 'edit');

    expect(session.setNotepad).toHaveBeenCalledWith('');
    expect(host.showStatus).toHaveBeenCalledWith('Notepad cleared.');
  });

  it('leaves the notepad unchanged when the editor exits non-zero', async () => {
    const { host, session } = makeHost({ notepad: 'old', editorCommand: 'fake-editor' });
    editInExternalEditor.mockResolvedValue(undefined);
    await handleNotepadCommand(host, 'edit');

    expect(session.setNotepad).not.toHaveBeenCalled();
    expect(host.showStatus).toHaveBeenCalledWith('Notepad unchanged.');
    expect(host.state.ui.start).toHaveBeenCalled();
  });
});
