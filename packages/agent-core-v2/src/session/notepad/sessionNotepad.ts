/**
 * `notepad` domain (L4) — `ISessionNotepadService` contract.
 *
 * The session-shared notepad: a free-form text buffer materialized from the
 * main agent's `tools.update_store` (`key: 'notepad'`) wire records, mutated
 * through `setContent` / `append` / `clear` (each appending a fresh
 * `tools.update_store` record to the main agent's wire), and readable by
 * every agent in the session. Unlike `TodoList` (structured investigation
 * state) or the plan file (a single implementation plan under approval),
 * the notepad carries whatever free-form notes the model wants to keep
 * across context compaction. Bound at Session scope.
 */

import { createDecorator } from '#/_base/di/instantiation';
import type { Event } from '#/_base/event';

export interface ISessionNotepadService {
  readonly _serviceBrand: undefined;

  getContent(): string;
  setContent(content: string): void;
  append(text: string): void;
  clear(): void;
  readonly onDidChange: Event<string>;
}

export const ISessionNotepadService = createDecorator<ISessionNotepadService>(
  'sessionNotepadService',
);
