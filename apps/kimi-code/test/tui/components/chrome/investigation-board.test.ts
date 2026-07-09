import { describe, expect, it } from 'vitest';

import {
  InvestigationBoardComponent,
  type UiQuestionItem,
} from '#/tui/components/chrome/investigation-board';

describe('InvestigationBoardComponent', () => {
  it('does not crash when a question lacks blockers/evidence at runtime', () => {
    const component = new InvestigationBoardComponent();
    // Simulates a legacy session item that predates the array fields and
    // bypasses the normalize layer (e.g. a direct `as UiQuestionItem` cast).
    const legacyQuestions = [
      { id: 'q1', question: 'legacy item', status: 'investigating' },
    ] as unknown as UiQuestionItem[];

    component.setQuestions(legacyQuestions);

    expect(() => component.render(80)).not.toThrow();
  });
});
