/**
 * `todo` domain (L4) — `ISessionTodoService` contract.
 *
 * The session-shared question list: an in-memory list materialized from the
 * main agent's `tools.update_store` (`key: 'todo'`) wire records, mutated
 * through `setTodos` (which archives answered questions into the findings
 * store and appends fresh `tools.update_store` records to the main agent's
 * wire), and readable by every agent in the session. The findings archive
 * (`key: 'findings'`) holds the conclusions of resolved/inconclusive
 * questions that were removed from the active list, for compaction and
 * replay. Bound at Session scope.
 */

import { createDecorator } from '#/_base/di/instantiation';
import type { Event } from '#/_base/event';

import type { FindingItem } from './findings';
import type { TodoItem } from './todoItem';

export interface ISessionTodoService {
  readonly _serviceBrand: undefined;

  getTodos(): readonly TodoItem[];
  setTodos(todos: readonly TodoItem[]): void;
  clear(): void;
  getFindings(): readonly FindingItem[];
  readonly onDidChange: Event<readonly TodoItem[]>;
}

export const ISessionTodoService = createDecorator<ISessionTodoService>('sessionTodoService');
