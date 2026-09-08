import { isAbsolute } from 'node:path';

import { NO_ACTIVE_SESSION_MESSAGE } from '../constant/kimi-tui';
import type { SlashCommandHost } from './dispatch';

/**
 * `/cd <absolute path>` — change the session's working directory.
 *
 * The engine resolves all relative tool paths and spawns bash under the
 * session workDir, so switching it redirects every subsequent operation.
 * Absolute paths only: relative targets are ambiguous between the old and
 * new directory once the switch has happened.
 */
export async function handleCdCommand(host: SlashCommandHost, args: string): Promise<void> {
  const input = args.trim();

  if (input.length === 0) {
    host.showStatus(
      `Current working directory: ${host.state.appState.workDir}\nUsage: /cd <absolute path>`,
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
    const result = await session.changeWorkDir(input);
    host.setAppState({ workDir: result.workDir });
    host.refreshSlashCommandAutocomplete();
    host.showStatus(
      `Working directory changed:\n  ${result.previousWorkDir}\n  →\n  ${result.workDir}`,
      'success',
    );
  } catch (error) {
    host.showError(error instanceof Error ? error.message : String(error));
  }
}
