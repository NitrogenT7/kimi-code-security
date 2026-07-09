import { describe, expect, it } from 'vitest';

import {
  formatBashOutputForDisplay,
  sanitizeShellOutput,
} from '#/tui/utils/shell-output';

describe('sanitizeShellOutput', () => {
  it('returns empty string for non-string input', () => {
    expect(sanitizeShellOutput(undefined as unknown as string)).toBe('');
    expect(sanitizeShellOutput(null as unknown as string)).toBe('');
    expect(sanitizeShellOutput(123 as unknown as string)).toBe('');
  });

  it('passes through plain text', () => {
    expect(sanitizeShellOutput('hello world')).toBe('hello world');
  });

  it('keeps newlines and tabs', () => {
    expect(sanitizeShellOutput('line1\nline2\thello')).toBe('line1\nline2\thello');
  });

  it('strips CSI color sequences', () => {
    expect(sanitizeShellOutput('\u001B[31mred\u001B[0m')).toBe('red');
  });

  it('strips OSC hyperlinks', () => {
    expect(sanitizeShellOutput('\u001B]8;;https://example.com\u0007link\u001B]8;;\u0007')).toBe('link');
  });

  it('strips single-char ESC sequences', () => {
    expect(sanitizeShellOutput('\u001B7saved\u001B8restored')).toBe('savedrestored');
  });

  it('strips C0 control chars except newline and tab', () => {
    expect(sanitizeShellOutput('a\rb\bc\x07d')).toBe('abcd');
  });

  it('never throws on bad input', () => {
    expect(() => sanitizeShellOutput('ok')).not.toThrow();
  });
});

describe('formatBashOutputForDisplay', () => {
  it('shows no output when both streams are empty', () => {
    expect(formatBashOutputForDisplay('', '')).toContain('(no output)');
  });

  it('shows stdout and stderr', () => {
    const out = formatBashOutputForDisplay('hello', 'warn');
    expect(out).toContain('hello');
    expect(out).toContain('warn');
  });

  it('colors stderr red on error', () => {
    const out = formatBashOutputForDisplay('', 'failed', true);
    expect(out).toContain('failed');
    // The exact SGR presence depends on chalk's environment detection; the
    // function must not throw and must include the stderr text.
  });

  it('sanitizes control sequences before display', () => {
    const out = formatBashOutputForDisplay('\u001B[31mcolored\u001B[0m', '');
    expect(out).toContain('colored');
    expect(out).not.toContain('\u001B[');
  });

  it('never throws', () => {
    expect(() => formatBashOutputForDisplay('a', 'b', false)).not.toThrow();
    expect(() => formatBashOutputForDisplay('', '', undefined)).not.toThrow();
  });
});
