import { Feature } from '#/features/feature';
import { registerFeature } from '#/features/featureRegistry';
import { LifecycleScope } from '#/app/scopes';

import { NotepadAgentModelDefinition } from './notepadAgentModel';
import { NOTEPAD_TOOL_NAME } from './notepadContent';
import { ISessionNotepadService } from './sessionNotepad';
import { SessionNotepadService } from './sessionNotepadService';
import { INotepadTool } from './tools/notepad';
import { NotepadTool } from './tools/notepadTool';

export class NotepadFeature extends Feature {
  static override readonly name = 'notepad';

  constructor() {
    super();
    this.contributeAgentModel(NotepadAgentModelDefinition);
    this.contributeService(LifecycleScope.Session, ISessionNotepadService, SessionNotepadService);
    this.contributeTool(INotepadTool, NotepadTool, { name: NOTEPAD_TOOL_NAME, domain: 'notepad' });
  }
}

registerFeature(NotepadFeature);
