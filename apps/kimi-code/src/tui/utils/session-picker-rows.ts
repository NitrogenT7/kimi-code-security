import type { SessionSummary } from '@moonshot-ai/kimi-code-sdk';

import type { SessionRow } from '#/tui/components/dialogs/session-picker';

/** Session-pinned marker keys in the session's custom metadata. */
export const PINNED_KEY = 'pinned';
export const PINNED_AT_KEY = 'pinnedAt';

export function isSessionPinned(session: Pick<SessionRow, 'metadata'>): boolean {
  return session.metadata?.[PINNED_KEY] === true;
}

function pinnedAt(session: Pick<SessionRow, 'metadata'>): number {
  const raw = session.metadata?.[PINNED_AT_KEY];
  return typeof raw === 'number' && Number.isFinite(raw) ? raw : 0;
}

/**
 * Session rows for the picker, ordered: pinned block first (most recently
 * pinned on top), then the remaining sessions in the server's recency order.
 * Rows are reshaped (not reordered beyond that) so existing fields survive.
 */
export function sessionRowsForPicker(
  sessions: readonly SessionSummary[],
  currentSessionId: string,
  currentSessionHasContent: boolean,
): SessionRow[] {
  const rows: SessionRow[] = sessions
    .filter((session) => currentSessionHasContent || session.id !== currentSessionId)
    .map((session) => ({
      id: session.id,
      title: session.title ?? null,
      last_prompt: session.lastPrompt ?? null,
      work_dir: session.workDir,
      updated_at: session.updatedAt ?? session.createdAt ?? 0,
      metadata: session.metadata,
    }));
  const pinned = rows.filter((row) => isSessionPinned(row)).toSorted((a, b) => pinnedAt(b) - pinnedAt(a));
  const rest = rows.filter((row) => !isSessionPinned(row));
  return [...pinned, ...rest];
}
