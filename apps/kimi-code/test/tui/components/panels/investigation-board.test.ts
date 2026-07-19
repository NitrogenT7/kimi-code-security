import { describe, it, expect } from 'vitest';

import {
  InvestigationBoardComponent,
  type UiFindingItem,
  type UiQuestionItem,
} from '#/tui/components/chrome/investigation-board';

function strip(text: string): string {
  return text.replaceAll(/\[[0-9;]*m/g, '');
}

function makeQuestion(overrides: Partial<UiQuestionItem> & { question: string }): UiQuestionItem {
  return {
    id: `q-${Math.random().toString(36).slice(2, 8)}`,
    status: 'pending',
    evidence: [],
    blockers: [],
    confidence: 'medium',
    depth: 'deep',
    ...overrides,
  };
}

function makeFinding(overrides: Partial<UiFindingItem> & { question: string }): UiFindingItem {
  return {
    id: `f-${Math.random().toString(36).slice(2, 8)}`,
    conclusion: 'Answered',
    confidence: 'high',
    depth: 'deep',
    status: 'resolved',
    ...overrides,
  };
}

describe('InvestigationBoardComponent', () => {
  it('returns no lines when empty (so the layout slot collapses)', () => {
    const board = new InvestigationBoardComponent();
    expect(board.render(80)).toEqual([]);
    expect(board.isEmpty()).toBe(true);
  });

  it('renders the Investigation header and one row per question with status markers', () => {
    const board = new InvestigationBoardComponent();
    board.setQuestions([
      makeQuestion({ question: 'Can the sink be reached?', status: 'investigating' }),
      makeQuestion({ question: 'Is entry B exported?', status: 'pending' }),
    ]);
    const joined = strip(board.render(80).join('\n'));
    expect(joined).toMatch(/Investigation/);
    expect(joined).toMatch(/● Can the sink be reached\?/);
    expect(joined).toMatch(/○ Is entry B exported\?/);
  });

  it('renders evidence chains and blockers under the question', () => {
    const board = new InvestigationBoardComponent();
    board.setQuestions([
      makeQuestion({
        question: 'Reachable?',
        status: 'investigating',
        evidence: [
          { status: 'confirmed', description: 'Path confirmed in C.java:142' },
          { status: 'refuted', description: 'Permission denied' },
        ],
        blockers: ['Need Android 14 device'],
      }),
    ]);
    const joined = strip(board.render(100).join('\n'));
    expect(joined).toContain('✅ Path confirmed in C.java:142');
    expect(joined).toContain('❌ Permission denied');
    expect(joined).toContain('⚡ Need Android 14 device');
  });

  it('renders the findings area with resolved/inconclusive counts and conclusions', () => {
    const board = new InvestigationBoardComponent();
    board.setQuestions([makeQuestion({ question: 'Active?', status: 'investigating' })]);
    board.setFindings([
      makeFinding({ question: 'Was it exported?', conclusion: 'Yes, exported=true' }),
      makeFinding({ question: 'Dead end?', conclusion: 'Unable to determine', status: 'inconclusive' }),
    ]);
    const joined = strip(board.render(100).join('\n'));
    expect(joined).toMatch(/1 resolved \/ 1 inconclusive/);
    expect(joined).toContain('Was it exported?');
    expect(joined).toContain('Yes, exported=true');
  });

  it('setQuestions replaces the list (not appends)', () => {
    const board = new InvestigationBoardComponent();
    board.setQuestions([makeQuestion({ question: 'old' })]);
    board.setQuestions([makeQuestion({ question: 'new', status: 'investigating' })]);
    const out = strip(board.render(80).join('\n'));
    expect(out).toMatch(/● new/);
    expect(out).not.toMatch(/old/);
  });

  it('clear() wipes questions and findings and reverts to empty', () => {
    const board = new InvestigationBoardComponent();
    board.setQuestions([makeQuestion({ question: 'x' })]);
    board.setFindings([makeFinding({ question: 'y' })]);
    board.clear();
    expect(board.isEmpty()).toBe(true);
    expect(board.render(80)).toEqual([]);
  });

  it('collapses long question lists and reports overflow', () => {
    const board = new InvestigationBoardComponent();
    board.setQuestions(
      Array.from({ length: 7 }, (_, i) =>
        makeQuestion({ question: `Question ${i + 1}?`, status: 'pending' }),
      ),
    );
    expect(board.hasOverflow()).toBe(true);
    const collapsed = strip(board.render(80).join('\n'));
    expect(collapsed).toContain('… +2 more questions');
    expect(collapsed).toContain('ctrl+t to expand');
    expect(collapsed).not.toContain('Question 7?');

    board.toggleExpanded();
    const expanded = strip(board.render(80).join('\n'));
    expect(expanded).toContain('Question 7?');
    expect(expanded).toContain('ctrl+t to collapse');
  });

  it('collapses long findings lists', () => {
    const board = new InvestigationBoardComponent();
    board.setFindings(
      Array.from({ length: 5 }, (_, i) => makeFinding({ question: `Finding ${i + 1}?` })),
    );
    expect(board.hasOverflow()).toBe(true);
    const collapsed = strip(board.render(80).join('\n'));
    expect(collapsed).toContain('5 resolved');
    expect(collapsed).toContain('… +2 more');
    expect(collapsed).not.toContain('Finding 5?');
  });

  it('defensive copy: external mutation does not leak into the board', () => {
    const board = new InvestigationBoardComponent();
    const source: UiQuestionItem[] = [makeQuestion({ question: 'foo', status: 'pending' })];
    board.setQuestions(source);
    source[0] = makeQuestion({ question: 'hacked', status: 'investigating' });
    const out = strip(board.render(80).join('\n'));
    expect(out).toMatch(/○ foo/);
    expect(out).not.toMatch(/hacked/);
  });

  it('exposes questions and findings for hydration assertions', () => {
    const board = new InvestigationBoardComponent();
    const questions = [makeQuestion({ question: 'q?' })];
    const findings = [makeFinding({ question: 'f?' })];
    board.setQuestions(questions);
    board.setFindings(findings);
    expect(board.getQuestions()).toEqual(questions);
    expect(board.getFindings()).toEqual(findings);
  });
});
