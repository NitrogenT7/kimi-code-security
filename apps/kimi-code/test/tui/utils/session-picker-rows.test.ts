import type { SessionSummary } from '@moonshot-ai/kimi-code-sdk';
import { describe, expect, it } from 'vitest';

import {
  isSessionPinned,
  sessionRowsForPicker,
} from '#/tui/utils/session-picker-rows';

function summary(input: {
  readonly id: string;
  readonly title?: string;
  readonly lastPrompt?: string;
  readonly metadata?: Record<string, unknown>;
  readonly updatedAt?: number;
}): SessionSummary {
  return {
    id: input.id,
    title: input.title,
    lastPrompt: input.lastPrompt,
    workDir: '/tmp/project',
    sessionDir: `/tmp/home/sessions/${input.id}`,
    createdAt: 1,
    updatedAt: input.updatedAt ?? 2,
    metadata: input.metadata,
  };
}

describe('sessionRowsForPicker', () => {
  it('omits the current session when the TUI session has no content', () => {
    const rows = sessionRowsForPicker(
      [
        summary({ id: 'ses_current', title: 'New Session' }),
        summary({ id: 'ses_previous', title: 'New Session' }),
      ],
      'ses_current',
      false,
    );

    expect(rows.map((row) => row.id)).toEqual(['ses_previous']);
  });

  it('keeps the current session when the TUI session has content', () => {
    const rows = sessionRowsForPicker(
      [
        summary({
          id: 'ses_current',
          title: 'Implement feature',
          lastPrompt: 'Implement feature',
        }),
      ],
      'ses_current',
      true,
    );

    expect(rows.map((row) => row.id)).toEqual(['ses_current']);
  });

  it('does not filter empty historical sessions', () => {
    const rows = sessionRowsForPicker(
      [
        summary({ id: 'ses_current', title: 'New Session' }),
        summary({ id: 'ses_previous_empty', title: 'New Session' }),
      ],
      'ses_current',
      false,
    );

    expect(rows.map((row) => row.id)).toEqual(['ses_previous_empty']);
  });

  it('places pinned sessions first, ordered by most recently pinned', () => {
    const rows = sessionRowsForPicker(
      [
        summary({ id: 'ses_recent', updatedAt: 30 }),
        summary({
          id: 'ses_pinned_old',
          updatedAt: 10,
          metadata: { pinned: true, pinnedAt: 100 },
        }),
        summary({ id: 'ses_plain', updatedAt: 20 }),
        summary({
          id: 'ses_pinned_new',
          updatedAt: 5,
          metadata: { pinned: true, pinnedAt: 200 },
        }),
      ],
      'ses_other',
      false,
    );

    expect(rows.map((row) => row.id)).toEqual([
      'ses_pinned_new',
      'ses_pinned_old',
      'ses_recent',
      'ses_plain',
    ]);
  });

  it('only honors pinned === true; false or missing flags are unpinned', () => {
    expect(isSessionPinned({ metadata: { pinned: true } })).toBe(true);
    expect(isSessionPinned({ metadata: { pinned: false } })).toBe(false);
    expect(isSessionPinned({ metadata: {} })).toBe(false);
    expect(isSessionPinned({})).toBe(false);

    const rows = sessionRowsForPicker(
      [
        summary({ id: 'ses_unpinned', updatedAt: 1, metadata: { pinned: false, pinnedAt: 5 } }),
        summary({ id: 'ses_plain', updatedAt: 2 }),
      ],
      'ses_other',
      false,
    );
    expect(rows.map((row) => row.id)).toEqual(['ses_unpinned', 'ses_plain']);
  });

  it('keeps server order among unpinned sessions', () => {
    const rows = sessionRowsForPicker(
      [
        summary({ id: 'ses_a', updatedAt: 3 }),
        summary({ id: 'ses_b', updatedAt: 9, metadata: { pinned: true, pinnedAt: 1 } }),
        summary({ id: 'ses_c', updatedAt: 7 }),
        summary({ id: 'ses_d', updatedAt: 5 }),
      ],
      'ses_other',
      false,
    );

    expect(rows.map((row) => row.id)).toEqual(['ses_b', 'ses_a', 'ses_c', 'ses_d']);
  });
});
