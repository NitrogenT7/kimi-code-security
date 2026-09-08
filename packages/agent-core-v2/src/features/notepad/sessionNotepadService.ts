import { Service } from '#/_base/di/service';
import { Emitter, type Event } from '#/_base/event';
import { agentSpaceOf } from '#/agent/agentContext/agentSpace';
import { IAgentLifecycleService, MAIN_AGENT_ID } from '#/session/agentLifecycle/agentLifecycle';

import { NotepadAgentModelDefinition } from './notepadAgentModel';
import { ISessionNotepadService } from './sessionNotepad';

export class SessionNotepadService extends Service implements ISessionNotepadService {
  declare readonly _serviceBrand: undefined;

  private readonly onDidChangeEmitter = this._register(new Emitter<string>());
  readonly onDidChange: Event<string> = this.onDidChangeEmitter.event;

  constructor(
    @IAgentLifecycleService private readonly agentLifecycle: IAgentLifecycleService,
  ) {
    super();
  }

  private main() {
    return this.agentLifecycle.get(MAIN_AGENT_ID);
  }

  getContent(): string {
    const main = this.main();
    if (main === undefined) return '';
    return agentSpaceOf(main).use(NotepadAgentModelDefinition, (m) => m.get());
  }

  setContent(content: string): void {
    const main = this.main();
    if (main === undefined) return;
    const next = agentSpaceOf(main).use(NotepadAgentModelDefinition, (m) => m.set(content));
    void next.then(() => {
      this.onDidChangeEmitter.fire(this.getContent());
    });
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
