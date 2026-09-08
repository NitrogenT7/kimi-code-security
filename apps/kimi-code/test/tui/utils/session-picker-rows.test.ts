import type { SessionSummary } from '@moonshot-ai/kimi-code-sdk';
import { describe, expect, it } from 'vitest';

import {
  isSessionPinned,
  sessionRowsForPicker,
  PINNED_AT_KEY,
  PINNED_KEY,
} from '#/tui/utils/session-picker-rows';

function summary(input: {
  readonly id: string;
  readonly title?: string;
  readonly lastPrompt?: string;
  readonly metadata?: SessionSummary['metadata'];
}): SessionSummary {
  return {
    id: input.id,
    title: input.title,
    lastPrompt: input.lastPrompt,
    workDir: '/tmp/project',
    sessionDir: `/tmp/home/sessions/${input.id}`,
    createdAt: 1,
    updatedAt: 2,
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

  it('orders the pinned block first by most recently pinned, before recency', () => {
    const rows = sessionRowsForPicker(
      [
        summary({ id: 'ses_newest', title: 'Newest' }),
        summary({
          id: 'ses_pinned_old',
          title: 'Pinned old',
          metadata: { [PINNED_KEY]: true, [PINNED_AT_KEY]: 100 },
        }),
        summary({ id: 'ses_middle', title: 'Middle' }),
        summary({
          id: 'ses_pinned_new',
          title: 'Pinned new',
          metadata: { [PINNED_KEY]: true, [PINNED_AT_KEY]: 200 },
        }),
      ],
      'ses_current',
      true,
    );

    expect(rows.map((row) => row.id)).toEqual([
      'ses_pinned_new',
      'ses_pinned_old',
      'ses_newest',
      'ses_middle',
    ]);
  });

  it('treats a missing or invalid pinnedAt as zero within the pinned block', () => {
    const rows = sessionRowsForPicker(
      [
        summary({
          id: 'ses_pinned_ts',
          title: 'Pinned with timestamp',
          metadata: { [PINNED_KEY]: true, [PINNED_AT_KEY]: 100 },
        }),
        summary({
          id: 'ses_pinned_bad_string',
          title: 'Pinned bad string',
          metadata: { [PINNED_KEY]: true, [PINNED_AT_KEY]: 'not-a-number' },
        }),
        summary({
          id: 'ses_pinned_nan',
          title: 'Pinned NaN',
          metadata: { [PINNED_KEY]: true, [PINNED_AT_KEY]: Number.NaN },
        }),
        summary({
          id: 'ses_pinned_missing',
          title: 'Pinned missing ts',
          metadata: { [PINNED_KEY]: true },
        }),
      ],
      'ses_current',
      true,
    );

    expect(rows.map((row) => row.id)).toEqual([
      'ses_pinned_ts',
      'ses_pinned_bad_string',
      'ses_pinned_nan',
      'ses_pinned_missing',
    ]);
  });

  it('returns an unpinned session to the recency block after unpinning', () => {
    const rows = sessionRowsForPicker(
      [
        summary({ id: 'ses_regular', title: 'Regular' }),
        summary({
          id: 'ses_unpinned',
          title: 'Unpinned',
          metadata: { [PINNED_KEY]: false, [PINNED_AT_KEY]: 999 },
        }),
        summary({
          id: 'ses_pinned',
          title: 'Still pinned',
          metadata: { [PINNED_KEY]: true, [PINNED_AT_KEY]: 100 },
        }),
      ],
      'ses_current',
      true,
    );

    expect(rows.map((row) => row.id)).toEqual(['ses_pinned', 'ses_regular', 'ses_unpinned']);
    expect(isSessionPinned(rows[2]!)).toBe(false);
  });

  it('isSessionPinned is only true for a strict boolean true', () => {
    expect(isSessionPinned({ metadata: { [PINNED_KEY]: true } })).toBe(true);
    expect(isSessionPinned({ metadata: { [PINNED_KEY]: 'yes' } })).toBe(false);
    expect(isSessionPinned({ metadata: { [PINNED_KEY]: 1 } })).toBe(false);
    expect(isSessionPinned({ metadata: {} })).toBe(false);
    expect(isSessionPinned({ metadata: undefined })).toBe(false);
  });
});
