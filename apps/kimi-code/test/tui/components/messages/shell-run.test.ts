import { describe, expect, it, vi } from 'vitest';

import { ShellRunComponent } from '#/tui/components/messages/shell-run';

function stripAnsi(text: string): string {
  return text.replaceAll(/\u001B\[[0-9;]*m/g, '');
}

describe('ShellRunComponent', () => {
  it('shows a running placeholder before any output', () => {
    const component = new ShellRunComponent(vi.fn());
    const output = component.render(80).map(stripAnsi).join('\n');
    expect(output).toContain('Running…');
  });

  it('renders appended output and an overflow marker', () => {
    const component = new ShellRunComponent(vi.fn());
    component.append('line1\nline2\nline3\nline4\nline5\nline6');
    const output = component.render(80).map(stripAnsi).join('\n');
    expect(output).toContain('line2');
    expect(output).toContain('line6');
    expect(output).not.toContain('line1');
    expect(output).toContain('+1 lines');
  });

  it('renders the final formatted output after finish()', () => {
    const component = new ShellRunComponent(vi.fn());
    component.append('live output');
    component.finish('stdout content', 'stderr content', false);
    const output = component.render(80).map(stripAnsi).join('\n');
    expect(output).toContain('stdout content');
    expect(output).toContain('stderr content');
    expect(output).not.toContain('Running…');
  });

  it('renders a backgrounded message after finishBackgrounded()', () => {
    const component = new ShellRunComponent(vi.fn());
    component.finishBackgrounded();
    const output = component.render(80).map(stripAnsi).join('\n');
    expect(output).toContain('Moved to background.');
  });

  it('ignores further appends after finish()', () => {
    const component = new ShellRunComponent(vi.fn());
    component.finish('done', '');
    component.append('ignored');
    const output = component.render(80).map(stripAnsi).join('\n');
    expect(output).toContain('done');
    expect(output).not.toContain('ignored');
  });

  it('does not throw when append/finish are called after dispose()', () => {
    const component = new ShellRunComponent(vi.fn());
    component.dispose();
    expect(() => {
      component.append('x');
    }).not.toThrow();
    expect(() => {
      component.finish('x', '');
    }).not.toThrow();
  });
});
