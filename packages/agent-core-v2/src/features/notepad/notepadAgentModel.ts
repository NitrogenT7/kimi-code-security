import { z } from 'zod';

import { AgentModel, defineAgentModel, type AgentModelContext } from '#/state/agentModel';
import { ToolsUpdateStore } from '#/features/todo/todoOps';

import { NOTEPAD_STORE_KEY, readNotepadContent } from './notepadContent';

export type NotepadModelState = string;

export class NotepadAgentModel extends AgentModel<NotepadModelState> {
  constructor(context: AgentModelContext) {
    super(context);
    this.on(ToolsUpdateStore, (event) => {
      if (event.key === NOTEPAD_STORE_KEY) this.state = readNotepadContent(event.value);
    });
  }

  get(): string {
    return this.state;
  }

  set(content: string): Promise<void> {
    return this.emit(
      new ToolsUpdateStore({
        agentId: this.agent.agentId,
        key: NOTEPAD_STORE_KEY,
        value: content,
      }),
    );
  }
}

export const NotepadAgentModelDefinition = defineAgentModel({
  id: 'notepad',
  model: NotepadAgentModel,
  state: {
    initial: (): NotepadModelState => '',
    schema: z.string(),
  },
  events: [ToolsUpdateStore],
});
