/**
 * `notepad` domain (L4) — the `NotepadModel` wire Model for the session's
 * shared notepad.
 *
 * Declares the notepad as a single `string` (initial `''`). The persisted
 * record is v1's `tools.update_store` (`{ key, value }`, key `'notepad'`),
 * so the on-disk vocabulary stays exactly v1's and `wire.replay` rebuilds
 * the Model from the shared append log. The Model rides the existing
 * `tools.update_store` Op (declared by the todo domain) through a
 * cross-model reducer keyed on the `'notepad'` store key — the same pattern
 * the findings archive uses — so no new persisted Op type is introduced.
 * Consumed cross-scope by the Session-scope `SessionNotepadService`: it
 * dispatches to the MAIN agent's wire (the single source of truth and
 * replayable timeline) and reads the rebuilt Model back from that same wire
 * after restore.
 */

import { defineModel } from '#/wire/model';

import { NOTEPAD_STORE_KEY, readNotepadContent } from './notepadContent';

export type NotepadModelState = string;

export const NotepadModel = defineModel<NotepadModelState>('notepad', () => '', {
  reducers: {
    'tools.update_store': (state, payload: { key: string; value: unknown }) =>
      payload.key === NOTEPAD_STORE_KEY ? readNotepadContent(payload.value) : state,
  },
});
