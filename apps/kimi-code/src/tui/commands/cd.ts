import { isAbsolute } from 'node:path';

import type { SlashCommandHost } from './dispatch';
import { slashBusyMessage, slashCommandBusyReason } from './resolve';

export async function handleCdCommand(host: SlashCommandHost, args: string): Promise<void> {
  const tokens = args.trim().split(/\s+/).filter((t) => t.length > 0);
  const sessionOnly = tokens.includes('--session-only');
  const input = tokens.filter((t) => t !== '--session-only').join(' ');
  const persist = !sessionOnly;

  if (input.length === 0) {
    host.showStatus(
      `Current working directory: ${host.state.appState.workDir}\n` +
        'Usage: /cd <absolute path> [--session-only]',
    );
    return;
  }

  if (!isAbsolute(input)) {
    host.showError(`/cd requires an absolute path, got: ${input}`);
    return;
  }

  let session = host.session;
  if (session === undefined) {
    // The v2 engine starts session-less; lazy-create on first use so the
    // switch lands on a live session (and its persisted binding).
    session = await host.ensureSession();
    if (session === undefined) return;
    // A first prompt may have started a turn during the await; /cd is
    // idle-only, so re-check the busy gate resolved before it.
    const busyReason = slashCommandBusyReason({
      isStreaming: host.state.appState.streamingPhase !== 'idle',
      isCompacting: host.state.appState.isCompacting,
    });
    if (busyReason !== undefined) {
      host.showError(slashBusyMessage('cd', busyReason));
      return;
    }
  }

  try {
    const result = await session.changeWorkDir(input, { persist });
    host.setAppState({ workDir: result.workDir });
    host.refreshSlashCommandAutocomplete();
    host.showStatus(
      `Working directory changed:\n  ${result.previousWorkDir}\n  →\n  ${result.workDir}` +
        (result.persisted
          ? '\nBinding persisted across restart/resume.'
          : '\nSession-only: restart/resume returns to the previous directory.'),
      'success',
    );
  } catch (error) {
    host.showError(error instanceof Error ? error.message : String(error));
  }
}
