import { describe, expect, it, vi } from 'vitest';

import { SessionRenameDialogComponent } from '#/tui/components/dialogs/session-rename-dialog';

function stripAnsi(text: string): string {
  return text.replaceAll(/\[[0-?]*[ -/]*[@-~]/g, '');
}

function renderPlain(component: SessionRenameDialogComponent, width = 80): string {
  return stripAnsi(component.render(width).join('\n'));
}

const ENTER = '\r';
const ESC = String.fromCodePoint(27);

describe('SessionRenameDialogComponent', () => {
  it('prefills the input with the current title', () => {
    const component = new SessionRenameDialogComponent('old title', vi.fn());
    const output = renderPlain(component);
    expect(output).toContain('old title');
  });

  it('submits the trimmed value on Enter and truncates to 200 chars', () => {
    const onDone = vi.fn();
    const component = new SessionRenameDialogComponent('old', onDone);

    // Clear the prefilled title before typing the long one.
    for (let i = 0; i < 3; i += 1) component.handleInput(String.fromCodePoint(127));
    const long = 'x'.repeat(250);
    component.handleInput(long);
    component.handleInput(ENTER);

    expect(onDone).toHaveBeenCalledOnce();
    expect(onDone).toHaveBeenCalledWith({ kind: 'ok', value: long.slice(0, 200) });
  });

  it('rejects an empty submission in place without closing', () => {
    const onDone = vi.fn();
    const component = new SessionRenameDialogComponent('keep', onDone);

    // Select-all is not universal; backspace the prefilled title away.
    for (let i = 0; i < 4; i += 1) component.handleInput(String.fromCodePoint(127));
    component.handleInput(ENTER);

    expect(onDone).not.toHaveBeenCalled();
    expect(renderPlain(component)).toContain('cannot be empty');
  });

  it('cancels on Esc', () => {
    const onDone = vi.fn();
    const component = new SessionRenameDialogComponent('t', onDone);

    component.handleInput(ESC);

    expect(onDone).toHaveBeenCalledWith({ kind: 'cancel' });
  });

  it('ignores input after settling', () => {
    const onDone = vi.fn();
    const component = new SessionRenameDialogComponent('t', onDone);
    component.handleInput(ESC);
    component.handleInput(ENTER);

    expect(onDone).toHaveBeenCalledOnce();
  });
});
