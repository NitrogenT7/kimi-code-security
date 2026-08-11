/**
 * `notepad` domain (L4) — `ISessionNotepadService` implementation.
 *
 * Holds the session's shared notepad as a stateless facade over the main
 * agent's `NotepadModel`: `getContent` reads `wire.getModel(...)` live, and
 * every mutation only dispatches a `tools.update_store` Op (`key:
 * 'notepad'`) to the main agent's wire (the single source of truth and
 * replayable timeline), then emits `onDidChange` from the rebuilt Model.
 * The service keeps no content copy of its own, so the live view and the
 * post-replay view can never drift. Bound at Session scope.
 *
 * The session owns the notepad facade, while the main Agent wire owns the
 * replayable state. This is an explicit cross-scope orchestration boundary:
 * there is no second session-level wire aggregate or journal.
 */

import { Disposable } from '#/_base/di/lifecycle';
import { InstantiationType } from '#/_base/di/extensions';
import { LifecycleScope, registerScopedService } from '#/_base/di/scope';
import { Emitter } from '#/_base/event';

import { IAgentLifecycleService } from '#/session/agentLifecycle/agentLifecycle';
import { todoSet } from '#/session/todo/todoOps';
import { IWireService } from '#/wire/wire';

import { NOTEPAD_STORE_KEY } from './notepadContent';
import { NotepadModel } from './notepadOps';
import { ISessionNotepadService } from './sessionNotepad';

const MAIN_AGENT_ID = 'main';

export class SessionNotepadService extends Disposable implements ISessionNotepadService {
  declare readonly _serviceBrand: undefined;

  private readonly onDidChangeEmitter = this._register(new Emitter<string>());
  readonly onDidChange = this.onDidChangeEmitter.event;

  constructor(
    @IAgentLifecycleService private readonly agentLifecycle: IAgentLifecycleService,
  ) {
    super();
  }

  getContent(): string {
    const main = this.agentLifecycle.get(MAIN_AGENT_ID);
    if (main === undefined) return '';
    return main.accessor.get(IWireService).getModel(NotepadModel);
  }

  setContent(content: string): void {
    const main = this.agentLifecycle.get(MAIN_AGENT_ID);
    if (main === undefined) return;
    const wire = main.accessor.get(IWireService);
    wire.dispatch(todoSet({ key: NOTEPAD_STORE_KEY, value: content }));
    this.onDidChangeEmitter.fire(wire.getModel(NotepadModel));
  }

  append(text: string): void {
    const current = this.getContent();
    const next =
      current.length === 0 ? text : current.endsWith('\n') ? current + text : `${current}\n${text}`;
    this.setContent(next);
  }

  clear(): void {
    this.setContent('');
  }
}

registerScopedService(
  LifecycleScope.Session,
  ISessionNotepadService,
  SessionNotepadService,
  InstantiationType.Delayed,
  'notepad',
);
