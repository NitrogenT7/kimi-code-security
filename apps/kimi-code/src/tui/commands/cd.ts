import { isAbsolute } from 'node:path';

import { NO_ACTIVE_SESSION_MESSAGE } from '../constant/kimi-tui';
import type { SlashCommandHost } from './dispatch';

/**
 * `/cd <absolute path> [--session-only]` — change the session's working
 * directory.
 *
 * The engine resolves all relative tool paths and spawns bash under the
 * session workDir, so switching it redirects every subsequent operation.
 * Absolute paths only: relative targets are ambiguous between the old and
 * new directory once the switch has happened.
 *
 * The new binding is persisted by default (rewrites the session's stored
 * directory, so closing and resuming the session — from any directory —
 * reopens it there). `--session-only` keeps the change in memory for this
 * session only.
 */
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

  const session = host.session;
  if (session === undefined) {
    host.showError(NO_ACTIVE_SESSION_MESSAGE);
    return;
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
