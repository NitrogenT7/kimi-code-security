import { describe, expect, it, vi } from 'vitest';

import type { SessionSummary } from '@moonshot-ai/kimi-code-sdk';

import { handleCleanCommand } from '#/tui/commands/clean';
import type { SlashCommandHost } from '#/tui/commands/dispatch';

const NOW = Date.now();
const DAY = 86_400_000;

function summary(overrides: Partial<SessionSummary> = {}): SessionSummary {
  return {
    id: 'session-aaaa-1',
    title: 'auto title from first prompt',
    isCustomTitle: false,
    workDir: '/repo/work',
    sessionDir: '/tmp/sessions/session-aaaa-1',
    createdAt: NOW - 30 * DAY,
    updatedAt: NOW - 30 * DAY,
    ...overrides,
  };
}

function makeHost(sessions: readonly SessionSummary[], activeId?: string) {
  const state = {
    appState: {
      workDir: '/repo/work',
      streamingPhase: 'idle',
      isCompacting: false,
    },
  };
  let picker: { handleInput: (data: string) => void } | null = null;
  const deleteSession = vi.fn(async () => {});
  const host = {
    state,
    session: activeId === undefined ? undefined : { id: activeId },
    harness: { listSessions: vi.fn(async () => sessions), deleteSession },
    skillCommandMap: new Map<string, string>(),
    setAppState: vi.fn(),
    refreshSlashCommandAutocomplete: vi.fn(),
    showError: vi.fn(),
    showStatus: vi.fn(),
    track: vi.fn(),
    mountEditorReplacement: vi.fn((panel: unknown) => {
      picker = panel as { handleInput: (data: string) => void };
    }),
    restoreEditor: vi.fn(),
  } as unknown as SlashCommandHost & {
    harness: { deleteSession: ReturnType<typeof vi.fn> };
    showStatus: ReturnType<typeof vi.fn>;
    showError: ReturnType<typeof vi.fn>;
    mountEditorReplacement: ReturnType<typeof vi.fn>;
    restoreEditor: ReturnType<typeof vi.fn>;
  };
  return {
    host,
    deleteSession,
    // Enter selects the highlighted option ("Yes, delete them" is first).
    confirm: () => picker?.handleInput('\r'),
    // Esc cancels the picker.
    cancel: () => picker?.handleInput('\u001B'),
  };
}

describe('handleCleanCommand', () => {
  it('dry-run lists stale auto-named sessions without deleting anything', async () => {
    const stale = summary();
    const fresh = summary({ id: 'session-bbbb-2', updatedAt: NOW - 1 * DAY });
    const named = summary({ id: 'session-cccc-3', isCustomTitle: true, updatedAt: NOW - 90 * DAY });
    const { host, deleteSession } = makeHost([stale, fresh, named]);

    await handleCleanCommand(host, '');

    expect(deleteSession).not.toHaveBeenCalled();
    expect(host.showStatus).toHaveBeenCalledWith(expect.stringContaining('[dry-run] 1 cleanable'));
    expect(host.showStatus).toHaveBeenCalledWith(expect.stringContaining('/clean go'));
  });

  it('skips the active session and custom-named sessions even on go', async () => {
    const active = summary({ id: 'session-active' });
    const stale = summary({ id: 'session-stale' });
    const named = summary({ id: 'session-named', isCustomTitle: true });
    const { host, deleteSession, confirm } = makeHost([active, stale, named], 'session-active');

    await handleCleanCommand(host, 'go');
    confirm();
    await vi.waitFor(() => expect(deleteSession).toHaveBeenCalledTimes(1));

    expect(deleteSession).toHaveBeenCalledWith('session-stale');
    expect(host.showStatus).toHaveBeenCalledWith(
      expect.stringContaining('Deleted 1 session(s).'),
      'success',
    );
  });

  it('honours a custom day threshold', async () => {
    const dayAgo = summary({ id: 'session-1day', updatedAt: NOW - 1 * DAY });
    const tenDayAgo = summary({ id: 'session-10day', updatedAt: NOW - 10 * DAY });
    const { host, deleteSession } = makeHost([dayAgo, tenDayAgo]);

    await handleCleanCommand(host, '10');

    expect(deleteSession).not.toHaveBeenCalled();
    expect(host.showStatus).toHaveBeenCalledWith(expect.stringContaining('idle ≥ 10 day(s)'));
    expect(host.showStatus).toHaveBeenCalledWith(expect.stringContaining('1 cleanable'));
  });

  it('cancel path deletes nothing', async () => {
    const stale = summary();
    const { host, deleteSession, cancel } = makeHost([stale]);

    await handleCleanCommand(host, 'go');
    cancel();

    expect(deleteSession).not.toHaveBeenCalled();
    expect(host.showStatus).toHaveBeenCalledWith('Clean cancelled.');
  });

  it('reports a count of zero when nothing qualifies', async () => {
    const fresh = summary({ updatedAt: NOW - 1 * DAY });
    const { host, deleteSession } = makeHost([fresh]);

    await handleCleanCommand(host, '');

    expect(deleteSession).not.toHaveBeenCalled();
    expect(host.showStatus).toHaveBeenCalledWith(expect.stringContaining('No cleanable sessions'));
  });

  it('keeps counting deletions that fail and reports them as warnings', async () => {
    const staleA = summary({ id: 'session-fail-a' });
    const staleB = summary({ id: 'session-ok-b' });
    const { host, deleteSession, confirm } = makeHost([staleA, staleB]);
    deleteSession.mockImplementation(async (...callArgs: unknown[]) => {
      if (callArgs[0] === 'session-fail-a') throw new Error('boom');
    });

    await handleCleanCommand(host, 'go');
    confirm();
    await vi.waitFor(() => expect(deleteSession).toHaveBeenCalledTimes(2));

    expect(host.showStatus).toHaveBeenCalledWith(
      expect.stringContaining('Deleted 1 session(s).'),
      'warning',
    );
    expect(host.showStatus).toHaveBeenCalledWith(
      expect.stringContaining('Failed to delete 1 session(s).'),
      'warning',
    );
  });
});
