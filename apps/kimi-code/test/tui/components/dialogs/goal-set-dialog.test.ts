/**
 * Headless tests for GoalSetDialogComponent.
 */

import { describe, expect, it, vi } from 'vitest';
import { Editor, Key, TUI } from '@earendil-works/pi-tui';
import {
  GoalSetDialogComponent,
  type GoalSetDialogResult,
} from '#/tui/components/dialogs/goal-set-dialog';

function makeTUI(): TUI {
  return new TUI({} as unknown as import('@earendil-works/pi-tui').ProcessTerminal);
}

function submitEditor(editor: Editor): void {
  editor.onSubmit?.(editor.getText());
}

describe('GoalSetDialogComponent', () => {
  it('renders four editor tabs and a submit tab', () => {
    const component = new GoalSetDialogComponent(makeTUI(), vi.fn());
    const lines = component.render(80);
    const text = lines.join('\n');
    expect(text).toContain('Purpose');
    expect(text).toContain('Key Tasks');
    expect(text).toContain('End State');
    expect(text).toContain('Constraints');
    expect(text).toContain('Submit');
  });

  it('collects four elements and submits', () => {
    let result: GoalSetDialogResult | undefined;
    const component = new GoalSetDialogComponent(makeTUI(), (res) => {
      result = res;
    });

    // Type into each editor and advance to the next tab.
    const editors: Editor[] = [];
    for (let i = 0; i < 4; i += 1) {
      const editor = (component as unknown as { tabs: Array<{ editor: Editor }> }).tabs[i]?.editor;
      expect(editor).toBeDefined();
      editors.push(editor!);
    }

    editors[0]!.setText('Improve onboarding');
    submitEditor(editors[0]!);

    editors[1]!.setText('Analyze drop-off; rewrite copy; add checklist');
    submitEditor(editors[1]!);

    editors[2]!.setText('First-task completion rate > 50%');
    submitEditor(editors[2]!);

    editors[3]!.setText('No dark patterns; no breaking API changes');
    submitEditor(editors[3]!);

    // Now on the Submit tab, choose "Create goal".
    component.handleInput('1');
    component.handleInput('\r');

    expect(result).toEqual({
      kind: 'ok',
      purpose: 'Improve onboarding',
      keyTasks: 'Analyze drop-off; rewrite copy; add checklist',
      endState: 'First-task completion rate > 50%',
      constraints: 'No dark patterns; no breaking API changes',
    });
  });

  it('cancels with Escape', () => {
    let result: GoalSetDialogResult | undefined;
    const component = new GoalSetDialogComponent(makeTUI(), (res) => {
      result = res;
    });
    component.handleInput('\u001b'); // ESC
    expect(result).toEqual({ kind: 'cancel' });
  });

  it('cancels with Ctrl+C', () => {
    let result: GoalSetDialogResult | undefined;
    const component = new GoalSetDialogComponent(makeTUI(), (res) => {
      result = res;
    });
    component.handleInput('\u0003'); // Ctrl+C
    expect(result).toEqual({ kind: 'cancel' });
  });
});
