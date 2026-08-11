import {
  editInExternalEditor,
  resolveEditorCommand,
} from '../../utils/process/external-editor';
import { NotepadMessageComponent } from '../components/messages/notepad-panel';
import { formatErrorMessage } from '../utils/event-payload';
import type { SlashCommandHost } from './dispatch';

export type ParsedNotepadCommand =
  | { readonly kind: 'status' }
  | { readonly kind: 'edit' }
  | { readonly kind: 'error'; readonly message: string };

/**
 * Parses the `/notepad` command grammar: bare `/notepad` and `/notepad
 * status` show the content; `/notepad edit` opens it in the external editor
 * (the same $VISUAL / $EDITOR / `/editor` resolution as Ctrl-G). Anything
 * else is a usage hint.
 */
export function parseNotepadCommand(rawArgs: string): ParsedNotepadCommand {
  const args = rawArgs.trim();
  if (args.length === 0 || args === 'status') return { kind: 'status' };
  if (args === 'edit') return { kind: 'edit' };
  return { kind: 'error', message: 'Usage: /notepad [status|edit]' };
}

export async function handleNotepadCommand(host: SlashCommandHost, args: string): Promise<void> {
  const parsed = parseNotepadCommand(args);
  switch (parsed.kind) {
    case 'error':
      host.showStatus(parsed.message);
      return;
    case 'status':
      await showNotepadStatus(host);
      return;
    case 'edit':
      await editNotepad(host);
      return;
  }
}

async function showNotepadStatus(host: SlashCommandHost): Promise<void> {
  let content: string;
  try {
    content = await host.requireSession().getNotepad();
  } catch (error) {
    host.showError(`Failed to read the notepad: ${formatErrorMessage(error)}`);
    return;
  }
  host.track('notepad_status');
  if (content.trim().length === 0) {
    host.showStatus('Notepad is empty. The agent (or you, via `/notepad edit`) can fill it in.');
    return;
  }
  host.state.transcriptContainer.addChild(new NotepadMessageComponent(content));
  host.state.ui.requestRender();
}

async function editNotepad(host: SlashCommandHost): Promise<void> {
  const session = host.requireSession();
  const { state } = host;
  if (state.externalEditorRunning) return;
  const cmd = resolveEditorCommand(state.appState.editorCommand);
  if (cmd === undefined) {
    host.showError('No editor configured. Set $VISUAL / $EDITOR, or run /editor <command>.');
    return;
  }

  let current: string;
  try {
    current = await session.getNotepad();
  } catch (error) {
    host.showError(`Failed to read the notepad: ${formatErrorMessage(error)}`);
    return;
  }

  state.externalEditorRunning = true;
  state.ui.stop();
  await new Promise<void>((resolve) => {
    setImmediate(resolve);
  });
  try {
    const result = await editInExternalEditor(current, cmd);
    if (result === undefined) {
      host.showStatus('Notepad unchanged.');
      return;
    }
    const next = result.replaceAll('\r\n', '\n').replace(/\n$/, '');
    await session.setNotepad(next);
    host.track('notepad_edit');
    host.showStatus(next.trim().length === 0 ? 'Notepad cleared.' : 'Notepad updated.');
  } catch (error) {
    host.showError(`External editor failed: ${formatErrorMessage(error)}`);
  } finally {
    if (typeof process.stdin.pause === 'function') {
      process.stdin.pause();
    }
    state.ui.start();
    state.ui.setFocus(state.editor);
    state.ui.requestRender(true);
    state.externalEditorRunning = false;
  }
}
