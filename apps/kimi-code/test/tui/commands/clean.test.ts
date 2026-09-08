import { describe, expect, it, vi } from 'vitest';

import type { SessionSummary } from '@moonshot-ai/kimi-code-sdk';

import { handleCleanCommand } from '#/tui/commands/clean';
import type { SlashCommandHost } from '#/tui/commands/dispatch';

const NOW = Date.now();
const DAY = 86_400_000;

interface RecordedSpinner {
  labels: string[];
  stops: { ok: boolean; label: string }[];
}

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
  let picker: { handleInput: (data: string) => void; render: (width: number) => string[] } | null =
    null;
  const spinners: RecordedSpinner[] = [];
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
    showProgressSpinner: vi.fn(() => {
      const record: RecordedSpinner = { labels: [], stops: [] };
      spinners.push(record);
      return {
        setLabel: (label: string) => {
          record.labels.push(label);
        },
        stop: (opts: { ok: boolean; label: string }) => {
          record.stops.push(opts);
        },
      };
    }),
    track: vi.fn(),
    mountEditorReplacement: vi.fn((panel: unknown) => {
      picker = panel as { handleInput: (data: string) => void; render: (width: number) => string[] };
    }),
    restoreEditor: vi.fn(),
  } as unknown as SlashCommandHost & {
    harness: { deleteSession: ReturnType<typeof vi.fn> };
    showStatus: ReturnType<typeof vi.fn>;
    showError: ReturnType<typeof vi.fn>;
    showProgressSpinner: ReturnType<typeof vi.fn>;
    mountEditorReplacement: ReturnType<typeof vi.fn>;
    restoreEditor: ReturnType<typeof vi.fn>;
  };
  return {
    host,
    deleteSession,
    spinners,
    // Enter selects the highlighted option ("Yes, delete them" is first).
    confirm: () => picker?.handleInput('\r'),
    // Esc cancels the picker.
    cancel: () => picker?.handleInput('\u001B'),
    renderPicker: () => picker?.render(120).join('\n') ?? '',
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

  it('reports scan results on the spinner before the dry-run list', async () => {
    const stale = summary();
    const fresh = summary({ id: 'session-bbbb-2', updatedAt: NOW - 1 * DAY });
    const { host, spinners } = makeHost([stale, fresh]);

    await handleCleanCommand(host, '');

    expect(host.showProgressSpinner).toHaveBeenCalledWith(expect.stringContaining('Scanning'));
    expect(spinners[0]?.stops[0]?.ok).toBe(true);
    expect(spinners[0]?.stops[0]?.label).toContain('Found 1 cleanable of 2 session(s)');
  });

  it('skips sessions with an unknown (zero) updatedAt even on go', async () => {
    const corrupt = summary({ id: 'session-zero', updatedAt: 0 });
    const stale = summary({ id: 'session-stale' });
    const { host, deleteSession, confirm, spinners } = makeHost([corrupt, stale]);

    await handleCleanCommand(host, 'go');
    confirm();
    await vi.waitFor(() => expect(deleteSession).toHaveBeenCalledTimes(1));

    expect(deleteSession).not.toHaveBeenCalledWith('session-zero');
    expect(deleteSession).toHaveBeenCalledWith('session-stale');
    expect(spinners[0]?.stops[0]?.label).toContain('1 skipped (unknown age)');
  });

  it('skips the active session and custom-named sessions even on go', async () => {
    const active = summary({ id: 'session-active' });
    const stale = summary({ id: 'session-stale' });
    const named = summary({ id: 'session-named', isCustomTitle: true });
    const { host, deleteSession, confirm, spinners } = makeHost(
      [active, stale, named],
      'session-active',
    );

    await handleCleanCommand(host, 'go');
    confirm();
    await vi.waitFor(() => expect(deleteSession).toHaveBeenCalledTimes(1));

    expect(deleteSession).toHaveBeenCalledWith('session-stale');
    const result = spinners.at(-1);
    expect(result?.stops.at(-1)?.label).toContain('Deleted 1 session(s).');
    expect(result?.stops.at(-1)?.ok).toBe(true);
    expect(host.showStatus).toHaveBeenCalledWith('Run /sessions to refresh the list.', 'success');
  });

  it('shows a live progress counter while deleting', async () => {
    const staleA = summary({ id: 'session-fail-a' });
    const staleB = summary({ id: 'session-ok-b' });
    const { host, deleteSession, confirm, spinners } = makeHost([staleA, staleB]);
    deleteSession.mockImplementation(async (...callArgs: unknown[]) => {
      if (callArgs[0] === 'session-fail-a') throw new Error('boom');
    });

    await handleCleanCommand(host, 'go');
    confirm();
    await vi.waitFor(() => expect(deleteSession).toHaveBeenCalledTimes(2));

    const progress = spinners.at(-1);
    expect(progress?.labels).toContain('Deleting 1/2…');
    expect(progress?.labels).toContain('Deleting 2/2…');
  });

  it('previews the targets inside the confirm dialog', async () => {
    // Realistic engine ids (`session_<uuid>` v1, `ses_<uuid>` v2) — the short
    // id column must strip the prefix instead of showing near-identical values.
    const many = Array.from({ length: 8 }, (_, i) =>
      summary({ id: `ses_aaaaaaa0-0000-4000-8000-00000000000${String(i)}`, title: `auto title ${String(i)}` }),
    );
    const { host, deleteSession, renderPicker } = makeHost(many);

    await handleCleanCommand(host, 'go');

    const rendered = renderPicker();
    expect(rendered).toContain('Delete 8 auto-named session(s)?');
    expect(rendered).toContain('Yes, delete 8 session(s)');
    expect(rendered).toContain('… and 2 more');
    expect(rendered).toContain('aaaaaaa0');
    expect(rendered).not.toContain('ses_');
    expect(deleteSession).not.toHaveBeenCalled();
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
    const { host, deleteSession, spinners } = makeHost([fresh]);

    await handleCleanCommand(host, '');

    expect(deleteSession).not.toHaveBeenCalled();
    expect(host.showStatus).toHaveBeenCalledWith(expect.stringContaining('No cleanable sessions'));
    expect(spinners[0]?.stops[0]?.label).toContain('Found 0 cleanable of 1 session(s)');
  });

  it('keeps counting deletions that fail and reports them as warnings', async () => {
    const staleA = summary({ id: 'session-fail-a' });
    const staleB = summary({ id: 'session-ok-b' });
    const { host, deleteSession, confirm, spinners } = makeHost([staleA, staleB]);
    deleteSession.mockImplementation(async (...callArgs: unknown[]) => {
      if (callArgs[0] === 'session-fail-a') throw new Error('boom');
    });

    await handleCleanCommand(host, 'go');
    confirm();
    await vi.waitFor(() => expect(deleteSession).toHaveBeenCalledTimes(2));

    const result = spinners.at(-1);
    expect(result?.stops.at(-1)?.ok).toBe(false);
    expect(result?.stops.at(-1)?.label).toContain('Deleted 1 session(s). Failed: 1.');
    expect(host.showStatus).toHaveBeenCalledWith(
      expect.stringContaining('Failed to delete:'),
      'warning',
    );
    expect(host.showStatus).toHaveBeenCalledWith('Run /sessions to refresh the list.', 'warning');
  });
});
