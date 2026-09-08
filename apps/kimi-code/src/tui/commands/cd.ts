import { isAbsolute } from 'node:path';

import { NO_ACTIVE_SESSION_MESSAGE } from '../constant/kimi-tui';
import type { SlashCommandHost } from './dispatch';

/**
 * `/cd <absolute path> [--persist]` — change the session's working directory.
 *
 * The engine resolves all relative tool paths and spawns bash under the
 * session workDir, so switching it redirects every subsequent operation.
 * Absolute paths only: relative targets are ambiguous between the old and
 * new directory once the switch has happened.
 *
 * `--persist` also rewrites the session's stored binding, so closing and
 * resuming the session (from any directory) reopens it in the new directory.
 */
export async function handleCdCommand(host: SlashCommandHost, args: string): Promise<void> {
  const tokens = args.trim().split(/\s+/).filter((t) => t.length > 0);
  const persist = tokens.includes('--persist');
  const input = tokens.filter((t) => t !== '--persist').join(' ');

  if (input.length === 0) {
    host.showStatus(
      `Current working directory: ${host.state.appState.workDir}\n` +
        'Usage: /cd <absolute path> [--persist]',
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
        (result.persisted ? '\nBinding persisted across restart/resume.' : ''),
      'success',
    );
  } catch (error) {
    host.showError(error instanceof Error ? error.message : String(error));
  }
}
