import { describe, expect, it, vi } from 'vitest';

import { handleCdCommand } from '#/tui/commands/cd';
import type { SlashCommandHost } from '#/tui/commands/dispatch';

function makeHost(workDir = '/repo/work') {
  const state = {
    appState: {
      workDir,
      streamingPhase: 'idle',
      isCompacting: false,
    },
  };
  const session = {
    id: 'session-1',
    changeWorkDir: vi.fn(async (path: string, options?: { persist?: boolean }) => ({
      workDir: path,
      previousWorkDir: workDir,
      persisted: options?.persist === true,
    })),
  };
  const host = {
    state,
    session,
    skillCommandMap: new Map<string, string>(),
    setAppState: vi.fn((patch: Record<string, unknown>) => Object.assign(state.appState, patch)),
    refreshSlashCommandAutocomplete: vi.fn(),
    showError: vi.fn(),
    showStatus: vi.fn(),
    track: vi.fn(),
  } as unknown as SlashCommandHost & {
    session: typeof session;
    state: typeof state;
    setAppState: ReturnType<typeof vi.fn>;
    refreshSlashCommandAutocomplete: ReturnType<typeof vi.fn>;
    showError: ReturnType<typeof vi.fn>;
    showStatus: ReturnType<typeof vi.fn>;
  };
  return { host, session };
}

describe('handleCdCommand', () => {
  it('shows the current directory and usage when args are empty', async () => {
    const { host } = makeHost();

    await handleCdCommand(host, '');

    expect(host.showStatus).toHaveBeenCalledWith(
      'Current working directory: /repo/work\nUsage: /cd <absolute path> [--session-only]',
    );
    expect(host.session?.changeWorkDir).not.toHaveBeenCalled();
  });

  it('rejects a relative path without touching the session', async () => {
    const { host, session } = makeHost();

    await handleCdCommand(host, 'relative/path');

    expect(host.showError).toHaveBeenCalledWith(
      '/cd requires an absolute path, got: relative/path',
    );
    expect(session.changeWorkDir).not.toHaveBeenCalled();
  });

  it('persists by default and updates appState.workDir on success', async () => {
    const { host } = makeHost();

    await handleCdCommand(host, '/repo/other');

    expect(host.session?.changeWorkDir).toHaveBeenCalledWith('/repo/other', { persist: true });
    expect(host.setAppState).toHaveBeenCalledWith({ workDir: '/repo/other' });
    expect(host.state.appState.workDir).toBe('/repo/other');
    expect(host.refreshSlashCommandAutocomplete).toHaveBeenCalled();
    expect(host.showStatus).toHaveBeenCalledWith(
      'Working directory changed:\n  /repo/work\n  →\n  /repo/other\nBinding persisted across restart/resume.',
      'success',
    );
  });

  it('keeps the switch session-only with --session-only', async () => {
    const { host } = makeHost();

    await handleCdCommand(host, '/repo/other --session-only');

    expect(host.session?.changeWorkDir).toHaveBeenCalledWith('/repo/other', { persist: false });
    expect(host.state.appState.workDir).toBe('/repo/other');
    expect(host.showStatus).toHaveBeenCalledWith(
      'Working directory changed:\n  /repo/work\n  →\n  /repo/other\nSession-only: restart/resume returns to the previous directory.',
      'success',
    );
  });

  it('surfaces the engine error without changing appState', async () => {
    const { host, session } = makeHost();
    session.changeWorkDir.mockRejectedValueOnce(new Error('Directory does not exist: /nope'));

    await handleCdCommand(host, '/nope');

    expect(host.showError).toHaveBeenCalledWith('Directory does not exist: /nope');
    expect(host.setAppState).not.toHaveBeenCalled();
    expect(host.state.appState.workDir).toBe('/repo/work');
  });
});
