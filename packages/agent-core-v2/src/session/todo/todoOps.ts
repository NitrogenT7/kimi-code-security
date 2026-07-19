/**
 * `todo` domain (L4) — wire Models (`TodoModel`, `FindingsModel`) and the
 * `tools.update_store` Op (`todoSet`) for the session's shared question list
 * and its findings archive.
 *
 * Declares the question list as `readonly TodoItem[]` (initial `[]`) and the
 * findings archive as `readonly FindingItem[]` (initial `[]`). The persisted
 * record is v1's `tools.update_store` (`{ key, value }`, keys `'todo'` /
 * `'findings'`), so the on-disk vocabulary stays exactly v1's and
 * `wire.replay` — of both v2 and v1 sessions — rebuilds the Models from the
 * shared append log. `apply` is the single log→model boundary for the
 * question list: it ignores non-`todo` keys and sanitizes the value through
 * `readTodoItems` (migrating legacy `{ title, status }` items on the fly);
 * `FindingsModel` rides the same Op through a cross-model reducer keyed on
 * the `'findings'` store key. Consumed cross-scope by the Session-scope
 * `SessionTodoService`: it dispatches to the MAIN agent's wire (the single
 * source of truth and replayable timeline), and reads the rebuilt Models
 * back from that same wire after restore. The Ops register into the global
 * `OP_REGISTRY` at import time, so they are in place before the main agent
 * restores.
 */

import { z } from 'zod';

import { defineModel } from '#/wire/model';

import { FINDINGS_STORE_KEY, readFindingItems, type FindingItem } from './findings';
import { readTodoItems, TODO_STORE_KEY, type TodoItem } from './todoItem';

export type TodoModelState = readonly TodoItem[];

export const TodoModel = defineModel<TodoModelState>('todo', () => []);

export type FindingsModelState = readonly FindingItem[];

export const FindingsModel = defineModel<FindingsModelState>('findings', () => [], {
  reducers: {
    'tools.update_store': (state, payload: { key: string; value: unknown }) =>
      payload.key === FINDINGS_STORE_KEY ? readFindingItems(payload.value) : state,
  },
});

declare module '#/wire/types' {
  interface PersistedOpMap {
    'tools.update_store': typeof todoSet;
  }
}

export const todoSet = TodoModel.defineOp('tools.update_store', {
  schema: z.object({ key: z.string(), value: z.unknown() }),
  apply: (s, p) => (p.key === TODO_STORE_KEY ? readTodoItems(p.value) : s),
});
