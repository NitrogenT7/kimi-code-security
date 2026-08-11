/**
 * Builds the `/notepad` transcript block. The notepad content is rendered
 * inside a {@link UsagePanelComponent} (the same bordered box as `/goal`
 * status and `/usage`), so this module only owns the notepad-specific
 * layout: the raw content lines, word-wrapped, capped with a "more lines"
 * note that points at `/notepad edit`.
 */

import { wrapTextWithAnsi, type Component } from '@moonshot-ai/pi-tui';

import { currentTheme } from '#/tui/theme';
import { UsagePanelComponent } from './usage-panel';

const MAX_CONTENT_LINES = 50;

export class NotepadMessageComponent implements Component {
  constructor(private readonly content: string) {}

  invalidate(): void {}

  render(width: number): string[] {
    const panelContentWidth = Math.max(1, width - 6);
    const panel = new UsagePanelComponent(
      () => buildNotepadLines(this.content, panelContentWidth),
      'primary',
      ' Notepad ',
    );
    return ['', ...panel.render(width)];
  }
}

export function buildNotepadLines(content: string, wrapWidth: number): string[] {
  const value = (s: string) => currentTheme.fg('text', s);
  const lines: string[] = [];
  for (const rawLine of content.trim().split(/\r?\n/)) {
    for (const line of wrapTextWithAnsi(rawLine, Math.max(1, wrapWidth))) {
      lines.push(value(line));
    }
  }
  if (lines.length <= MAX_CONTENT_LINES) return lines;
  return [
    ...lines.slice(0, MAX_CONTENT_LINES),
    currentTheme.fg(
      'textDim',
      `… ${lines.length - MAX_CONTENT_LINES} more lines — use /notepad edit to view all`,
    ),
  ];
}
