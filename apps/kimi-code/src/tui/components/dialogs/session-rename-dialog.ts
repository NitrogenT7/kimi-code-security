/**
 * SessionRenameDialog — rounded-box input that renames a session from the
 * session picker (`Ctrl+R`).
 *
 * Geometry mirrors `FeedbackInputDialog` (the OAuth / feedback chrome) so all
 * single-line input dialogs stay visually identical. The input is prefilled
 * with the session's current title; an empty submission is rejected in place
 * (the dialog stays open) instead of closing. Enter submits, Esc / Ctrl+C /
 * Ctrl+D cancel back to the picker.
 */

import {
  Container,
  Input,
  Key,
  matchesKey,
  truncateToWidth,
  visibleWidth,
  type Focusable,
} from '@moonshot-ai/pi-tui';
import { currentTheme } from '#/tui/theme';

export type SessionRenameDialogResult =
  | { readonly kind: 'ok'; readonly value: string }
  | { readonly kind: 'cancel' };

const TITLE = 'Rename session';
const SUBTITLE_DEFAULT = 'Enter a new title (empty cancels nothing — Esc to cancel).';
const SUBTITLE_EMPTY = 'Title cannot be empty.';
const MAX_TITLE_LENGTH = 200;

export class SessionRenameDialogComponent extends Container implements Focusable {
  focused = false;

  private readonly input = new Input();
  private readonly onDone: (result: SessionRenameDialogResult) => void;
  private done = false;
  private emptyHinted = false;

  constructor(currentTitle: string, onDone: (result: SessionRenameDialogResult) => void) {
    super();
    this.onDone = onDone;
    this.input.setValue(currentTitle);
    this.input.onSubmit = (value: string) => {
      this.submit(value);
    };
  }

  handleInput(data: string): void {
    if (this.done) return;
    if (
      matchesKey(data, Key.escape) ||
      matchesKey(data, Key.ctrl('c')) ||
      matchesKey(data, Key.ctrl('d'))
    ) {
      this.cancel();
      return;
    }
    if (this.emptyHinted) {
      this.emptyHinted = false;
    }
    this.input.handleInput(data);
  }

  override invalidate(): void {
    super.invalidate();
    this.input.invalidate();
  }

  override render(width: number): string[] {
    this.input.focused = this.focused && !this.done;

    const safeWidth = Math.max(0, width);
    if (safeWidth <= 0) return [''];
    const innerWidth = Math.max(1, safeWidth - 4);
    const pad = '  ';

    const border = (s: string): string => currentTheme.fg('primary', s);
    const titleStyled = currentTheme.boldFg('textStrong', TITLE);
    const subtitleText = this.emptyHinted ? SUBTITLE_EMPTY : SUBTITLE_DEFAULT;
    const subtitleStyled = currentTheme.fg('textDim', subtitleText);
    const footerStyled = currentTheme.fg('textDim', 'Enter to rename  ·  Esc to cancel');

    const titleLine = truncateToWidth(titleStyled, innerWidth, '…');
    const subtitleLine = truncateToWidth(subtitleStyled, innerWidth, '…');
    const footerLine = truncateToWidth(footerStyled, innerWidth, '…');
    const inputLine = this.input.render(innerWidth)[0] ?? '> ';

    const contentLines: string[] = [titleLine, '', subtitleLine, '', inputLine, '', footerLine];

    if (safeWidth < 4) {
      return ['', ...contentLines.map((line) => truncateToWidth(line, safeWidth, '…'))];
    }

    const lines: string[] = [
      '',
      border('╭' + '─'.repeat(safeWidth - 2) + '╮'),
      border('│') + ' '.repeat(safeWidth - 2) + border('│'),
    ];

    for (const content of contentLines) {
      const vis = visibleWidth(content);
      const rightPad = Math.max(0, innerWidth - vis);
      lines.push(border('│') + pad + content + ' '.repeat(rightPad) + border('│'));
    }

    lines.push(border('│') + ' '.repeat(safeWidth - 2) + border('│'));
    lines.push(border('╰' + '─'.repeat(safeWidth - 2) + '╯'));
    lines.push('');

    return lines.map((line) => truncateToWidth(line, safeWidth, '…'));
  }

  private submit(value: string): void {
    if (this.done) return;
    const trimmed = value.trim();
    if (trimmed.length === 0) {
      this.emptyHinted = true;
      return;
    }
    this.done = true;
    this.onDone({ kind: 'ok', value: trimmed.slice(0, MAX_TITLE_LENGTH) });
  }

  private cancel(): void {
    if (this.done) return;
    this.done = true;
    this.onDone({ kind: 'cancel' });
  }
}
