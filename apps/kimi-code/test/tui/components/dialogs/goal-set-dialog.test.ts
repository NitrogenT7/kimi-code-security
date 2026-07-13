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

const TAB = '\t';
const SHIFT_TAB = '\u001B[Z';

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
    component.focused = true;

    // Type into each editor and advance to the next tab with Tab.
    const editors: Editor[] = [];
    for (let i = 0; i < 4; i += 1) {
      const editor = (component as unknown as { tabs: Array<{ editor: Editor }> }).tabs[i]?.editor;
      expect(editor).toBeDefined();
      editors.push(editor!);
    }

    editors[0]!.setText('Improve onboarding');
    component.handleInput(TAB);

    editors[1]!.setText('Analyze drop-off; rewrite copy; add checklist');
    component.handleInput(TAB);

    editors[2]!.setText('First-task completion rate > 50%');
    component.handleInput(TAB);

    editors[3]!.setText('No dark patterns; no breaking API changes');
    component.handleInput(TAB);

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

  it('accepts typed characters via handleInput into the active editor', () => {
    let result: GoalSetDialogResult | undefined;
    const component = new GoalSetDialogComponent(makeTUI(), (res) => {
      result = res;
    });
    component.focused = true;

    component.handleInput('H');
    component.handleInput('i');
    component.handleInput(TAB); // next tab
    component.handleInput('T');
    component.handleInput('a');
    component.handleInput('s');
    component.handleInput('k');
    component.handleInput(TAB); // next tab
    component.handleInput('D');
    component.handleInput('o');
    component.handleInput('n');
    component.handleInput('e');
    component.handleInput(TAB); // next tab
    component.handleInput('N');
    component.handleInput('o');
    component.handleInput('n');
    component.handleInput('e');
    component.handleInput(TAB); // submit tab
    component.handleInput('1');
    component.handleInput('\r');

    expect(result).toEqual({
      kind: 'ok',
      purpose: 'Hi',
      keyTasks: 'Task',
      endState: 'Done',
      constraints: 'None',
    });
  });

  it('preserves text when switching tabs and Enter inserts newlines', () => {
    let result: GoalSetDialogResult | undefined;
    const component = new GoalSetDialogComponent(makeTUI(), (res) => {
      result = res;
    });
    component.focused = true;

    component.handleInput('Line 1');
    component.handleInput('\r'); // Enter should insert a newline, not submit
    component.handleInput('Line 2');
    component.handleInput(TAB); // next tab
    component.handleInput('Other');
    component.handleInput(TAB); // next tab
    component.handleInput(TAB); // next tab
    component.handleInput(TAB); // submit tab
    component.handleInput('\r'); // confirm

    expect(result).toEqual({
      kind: 'ok',
      purpose: 'Line 1\nLine 2',
      keyTasks: 'Other',
      endState: '',
      constraints: '',
    });
  });

  it('pre-fills tabs from initialValues', () => {
    let result: GoalSetDialogResult | undefined;
    const component = new GoalSetDialogComponent(
      makeTUI(),
      (res) => {
        result = res;
      },
      {
        purpose: 'Template purpose',
        keyTasks: 'Template tasks',
        endState: 'Template done',
        constraints: 'Template limits',
      },
    );
    component.focused = true;

    // Navigate to submit without typing anything.
    component.handleInput(TAB);
    component.handleInput(TAB);
    component.handleInput(TAB);
    component.handleInput(TAB);
    component.handleInput('\r');

    expect(result).toEqual({
      kind: 'ok',
      purpose: 'Template purpose',
      keyTasks: 'Template tasks',
      endState: 'Template done',
      constraints: 'Template limits',
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
