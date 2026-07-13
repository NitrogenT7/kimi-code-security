/**
 * GoalSetDialog — structured editor for creating a goal in the four-element
 * commander's-intent format.
 *
 * Layout mirrors QuestionDialog's tabbed design:
 *   - 4 content tabs (Purpose / Key Tasks / End State / Constraints)
 *   - 1 review/submit tab
 * Each content tab contains a multi-line pi-tui Editor.
 */

import {
  Container,
  Editor,
  Key,
  matchesKey,
  truncateToWidth,
  visibleWidth,
  wrapTextWithAnsi,
  type Focusable,
  type TUI,
} from '@earendil-works/pi-tui';
import { currentTheme } from '#/tui/theme';
import { createEditorTheme } from '#/tui/theme/pi-tui-theme';

const TAB_HEADERS = ['Purpose', 'Key Tasks', 'End State', 'Constraints'] as const;
const SUBMIT_TAB = 'Submit';
const SUBMIT_ACTIONS = ['Create goal', 'Cancel'] as const;

const TITLE = 'Set goal — four elements';
const EDITOR_PROMPTS: Record<(typeof TAB_HEADERS)[number], string> = {
  Purpose: 'Why does this goal matter? Give direction.',
  'Key Tasks': 'What must be accomplished? Avoid prescribing every step.',
  'End State': 'What observable, verifiable conditions mean success?',
  Constraints: 'What must not be done or sacrificed? Red lines and hard limits.',
};

function fieldForHeader(
  header: (typeof TAB_HEADERS)[number],
): keyof Pick<GoalSetDialogResult, 'purpose' | 'keyTasks' | 'endState' | 'constraints'> {
  switch (header) {
    case 'Purpose':
      return 'purpose';
    case 'Key Tasks':
      return 'keyTasks';
    case 'End State':
      return 'endState';
    case 'Constraints':
      return 'constraints';
  }
}

export interface GoalSetDialogResult {
  readonly kind: 'ok' | 'cancel';
  readonly purpose?: string;
  readonly keyTasks?: string;
  readonly endState?: string;
  readonly constraints?: string;
}

interface EditorTab {
  readonly editor: Editor;
  readonly header: (typeof TAB_HEADERS)[number];
  /** Cached value for this tab so text survives Editor.submitValue(). */
  value: string;
}

export class GoalSetDialogComponent extends Container implements Focusable {
  focused = false;

  private readonly tabs: EditorTab[];
  private readonly onDone: (result: GoalSetDialogResult) => void;
  private currentTab = 0;
  private submitActionIdx = 0;
  private done = false;

  constructor(
    tui: TUI,
    onDone: (result: GoalSetDialogResult) => void,
    initialValues?: Pick<
      GoalSetDialogResult,
      'purpose' | 'keyTasks' | 'endState' | 'constraints'
    >,
  ) {
    super();
    this.onDone = onDone;
    const theme = createEditorTheme();
    this.tabs = TAB_HEADERS.map((header) => {
      const editor = new Editor(tui, theme, { paddingX: 2 });
      // Enter should insert a newline in these multi-line editors, not submit
      // and clear the buffer.
      editor.disableSubmit = true;
      const value = initialValues?.[fieldForHeader(header)] ?? '';
      editor.setText(value);
      return { header, editor, value };
    });
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

    if (matchesKey(data, Key.tab)) {
      this.nextTab();
      return;
    }
    if (matchesKey(data, Key.shift('tab'))) {
      this.prevTab();
      return;
    }

    if (this.isSubmitTab()) {
      this.handleSubmitInput(data);
      return;
    }

    const tab = this.currentTabInfo();
    if (tab !== undefined) {
      // Treat Enter/Return as a newline inside the multi-line editors.
      if (matchesKey(data, Key.enter) || matchesKey(data, Key.return)) {
        tab.editor.handleInput('\n');
      } else {
        tab.editor.handleInput(data);
      }
    }
  }

  private handleSubmitInput(data: string): void {
    if (matchesKey(data, Key.up)) {
      this.submitActionIdx =
        (this.submitActionIdx - 1 + SUBMIT_ACTIONS.length) % SUBMIT_ACTIONS.length;
      return;
    }
    if (matchesKey(data, Key.down)) {
      this.submitActionIdx = (this.submitActionIdx + 1) % SUBMIT_ACTIONS.length;
      return;
    }
    if (matchesKey(data, Key.enter)) {
      this.executeSubmitAction(this.submitActionIdx);
      return;
    }
    const printable = typeof data === 'string' && data.length === 1 ? data : undefined;
    if (printable === '1') {
      this.executeSubmitAction(0);
      return;
    }
    if (printable === '2') {
      this.executeSubmitAction(1);
    }
  }

  override render(width: number): string[] {
    const tab = this.currentTabInfo();
    for (const t of this.tabs) {
      t.editor.focused = this.focused && t === tab && !this.isSubmitTab();
    }

    const safeWidth = Math.max(40, width);
    const innerWidth = Math.max(36, safeWidth - 4);
    const accent = (s: string) => currentTheme.fg('primary', s);
    const dim = (s: string) => currentTheme.fg('textDim', s);
    const text = (s: string) => currentTheme.fg('text', s);
    const bold = (s: string) => currentTheme.boldFg('text', s);

    const lines: string[] = [
      '',
      accent('╭' + '─'.repeat(safeWidth - 2) + '╮'),
      accent('│') + ' '.repeat(safeWidth - 2) + accent('│'),
    ];

    const titleLine = truncateToWidth(bold(` ${TITLE}`), innerWidth, '…');
    lines.push(accent('│') + '  ' + titleLine + ' '.repeat(Math.max(0, innerWidth - visibleWidth(titleLine))) + accent('│'));
    lines.push(accent('│') + ' '.repeat(safeWidth - 2) + accent('│'));

    // Tab bar
    const tabLine = this.renderTabBar(innerWidth);
    lines.push(accent('│') + '  ' + tabLine + ' '.repeat(Math.max(0, innerWidth - visibleWidth(tabLine))) + accent('│'));
    lines.push(accent('│') + ' '.repeat(safeWidth - 2) + accent('│'));

    if (this.isSubmitTab()) {
      this.renderSubmitTab(lines, innerWidth, dim, text, accent);
    } else if (tab !== undefined) {
      this.renderEditorTab(lines, tab, innerWidth, dim, text);
    }

    // Hint line
    const hint = this.isSubmitTab()
      ? '↑↓ select  ·  1/2 choose  ·  ↵ confirm  ·  esc cancel'
      : 'tab next  ·  shift+tab prev  ·  ↵ newline  ·  esc cancel';
    const hintLine = truncateToWidth(dim(` ${hint}`), innerWidth, '…');
    lines.push(accent('│') + '  ' + hintLine + ' '.repeat(Math.max(0, innerWidth - visibleWidth(hintLine))) + accent('│'));

    lines.push(accent('│') + ' '.repeat(safeWidth - 2) + accent('│'));
    lines.push(accent('╰' + '─'.repeat(safeWidth - 2) + '╯'));
    lines.push('');

    return lines.map((line) => truncateToWidth(line, width));
  }

  private renderTabBar(innerWidth: number): string {
    const parts: string[] = [];
    const totalTabs = TAB_HEADERS.length + 1;
    for (let i = 0; i < totalTabs; i++) {
      const label = i < TAB_HEADERS.length ? TAB_HEADERS[i] : SUBMIT_TAB;
      const isActive = i === this.currentTab;
      if (isActive) {
        parts.push(currentTheme.bg('primary', currentTheme.boldFg('text', ` ${label} `)));
      } else {
        parts.push(currentTheme.fg('textDim', ` ${label} `));
      }
    }
    return parts.join('');
  }

  private renderEditorTab(
    lines: string[],
    tab: EditorTab,
    innerWidth: number,
    dim: (s: string) => string,
    text: (s: string) => string,
  ): void {
    const prompt = EDITOR_PROMPTS[tab.header];
    const promptLine = truncateToWidth(dim(` ${prompt}`), innerWidth, '…');
    lines.push(currentTheme.fg('primary', '│') + '  ' + promptLine + ' '.repeat(Math.max(0, innerWidth - visibleWidth(promptLine))) + currentTheme.fg('primary', '│'));
    lines.push(currentTheme.fg('primary', '│') + ' '.repeat(innerWidth + 2) + currentTheme.fg('primary', '│'));

    const editorLines = tab.editor.render(innerWidth + 4);
    for (const editorLine of editorLines) {
      lines.push(currentTheme.fg('primary', '│') + editorLine.slice(0, innerWidth + 2) + currentTheme.fg('primary', '│'));
    }
  }

  private renderSubmitTab(
    lines: string[],
    innerWidth: number,
    dim: (s: string) => string,
    text: (s: string) => string,
    accent: (s: string) => string,
  ): void {
    const title = truncateToWidth(currentTheme.boldFg('text', ' Review your goal'), innerWidth, '…');
    lines.push(currentTheme.fg('primary', '│') + '  ' + title + ' '.repeat(Math.max(0, innerWidth - visibleWidth(title))) + currentTheme.fg('primary', '│'));
    lines.push(currentTheme.fg('primary', '│') + ' '.repeat(innerWidth + 2) + currentTheme.fg('primary', '│'));

    for (let i = 0; i < TAB_HEADERS.length; i++) {
      const header = TAB_HEADERS[i];
      const value = this.tabs[i]?.value.trim() ?? '';
      const headerLine = truncateToWidth(accent(` ${header}:`), innerWidth, '…');
      lines.push(currentTheme.fg('primary', '│') + '  ' + headerLine + ' '.repeat(Math.max(0, innerWidth - visibleWidth(headerLine))) + currentTheme.fg('primary', '│'));
      const displayValue = value.length > 0 ? value : dim('(empty)');
      const wrapped = wrapTextWithAnsi(displayValue, innerWidth - 2);
      for (const wrappedLine of wrapped) {
        lines.push(currentTheme.fg('primary', '│') + '    ' + text(wrappedLine) + ' '.repeat(Math.max(0, innerWidth - 2 - visibleWidth(wrappedLine))) + currentTheme.fg('primary', '│'));
      }
      lines.push(currentTheme.fg('primary', '│') + ' '.repeat(innerWidth + 2) + currentTheme.fg('primary', '│'));
    }

    lines.push(currentTheme.fg('primary', '│') + '  ' + currentTheme.boldFg('text', ' Ready to create?') + ' '.repeat(Math.max(0, innerWidth - visibleWidth(' Ready to create?'))) + currentTheme.fg('primary', '│'));
    for (let i = 0; i < SUBMIT_ACTIONS.length; i++) {
      const label = SUBMIT_ACTIONS[i];
      const num = i + 1;
      const line = i === this.submitActionIdx
        ? accent(`  → [${num}] ${label}`)
        : dim(`    [${num}] ${label}`);
      lines.push(currentTheme.fg('primary', '│') + '  ' + line + ' '.repeat(Math.max(0, innerWidth - visibleWidth(line))) + currentTheme.fg('primary', '│'));
    }
  }

  override invalidate(): void {
    super.invalidate();
    for (const tab of this.tabs) {
      tab.editor.invalidate();
    }
  }

  private nextTab(): void {
    this.captureCurrentTab();
    this.currentTab = (this.currentTab + 1) % (TAB_HEADERS.length + 1);
    this.restoreCurrentTab();
    if (this.isSubmitTab()) {
      this.submitActionIdx = 0;
    }
  }

  private prevTab(): void {
    this.captureCurrentTab();
    const total = TAB_HEADERS.length + 1;
    this.currentTab = (this.currentTab - 1 + total) % total;
    this.restoreCurrentTab();
    if (this.isSubmitTab()) {
      this.submitActionIdx = 0;
    }
  }

  private captureCurrentTab(): void {
    const tab = this.currentTabInfo();
    if (tab !== undefined) {
      tab.value = tab.editor.getText();
    }
  }

  private restoreCurrentTab(): void {
    const tab = this.currentTabInfo();
    if (tab !== undefined) {
      tab.editor.setText(tab.value);
    }
  }

  private isSubmitTab(): boolean {
    return this.currentTab === TAB_HEADERS.length;
  }

  private currentTabInfo(): EditorTab | undefined {
    if (this.isSubmitTab()) return undefined;
    return this.tabs[this.currentTab];
  }

  private executeSubmitAction(index: number): void {
    if (this.done) return;
    this.done = true;
    if (index === 1) {
      this.onDone({ kind: 'cancel' });
      return;
    }
    // Ensure the currently visible editor's text is captured before reading
    // the cached tab values.
    this.captureCurrentTab();
    this.onDone({
      kind: 'ok',
      purpose: this.tabs[0]?.value.trim(),
      keyTasks: this.tabs[1]?.value.trim(),
      endState: this.tabs[2]?.value.trim(),
      constraints: this.tabs[3]?.value.trim(),
    });
  }

  private cancel(): void {
    if (this.done) return;
    this.done = true;
    this.onDone({ kind: 'cancel' });
  }
}
