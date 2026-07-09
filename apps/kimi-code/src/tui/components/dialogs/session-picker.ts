/**
 * SessionPicker — pi-tui version of the session selection dialog.
 */

import {
  Container,
  matchesKey,
  Key,
  truncateToWidth,
  visibleWidth,
  type Focusable,
} from '@earendil-works/pi-tui';
import { formatSessionLabel } from '#/migration/index';
import { CURRENT_MARK, SELECT_POINTER } from '#/tui/constant/symbols';
import { currentTheme } from '#/tui/theme';
import { SearchableList } from '#/tui/utils/searchable-list';

export interface SessionRow {
  readonly id: string;
  readonly title: string | null;
  readonly last_prompt?: string | null;
  readonly work_dir: string;
  readonly updated_at: number;
  readonly metadata?: Readonly<Record<string, unknown>> | undefined;
}

const ELLIPSIS = '…';

function formatRelativeTime(ts: number): string {
  // SessionSummary timestamps come from filesystem stat `*timeMs`,
  // so they use the same millisecond unit as `Date.now()`.
  if (!Number.isFinite(ts) || ts <= 0) return '';
  const diffSec = Math.floor(Math.max(0, Date.now() - ts) / 1000);
  if (diffSec < 60) return 'just now';
  const minutes = Math.floor(diffSec / 60);
  if (minutes < 60) return `${String(minutes)}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${String(hours)}h ago`;
  const days = Math.floor(hours / 24);
  return `${String(days)}d ago`;
}

function homeAlias(path: string): string {
  const home = process.env['HOME'] ?? '';
  if (home && path.startsWith(home)) return '~' + path.slice(home.length);
  return path;
}

// Truncates from the LEFT (keeps the tail), prefixing an ellipsis when clipped.
// Paths typically carry the relevant info near the end, so we drop the prefix.
function truncatePathLeft(path: string, maxWidth: number): string {
  if (maxWidth <= 0) return '';
  if (visibleWidth(path) <= maxWidth) return path;
  if (maxWidth === 1) return ELLIPSIS;
  // Walk graphemes from the end accumulating width, keep the longest tail
  // whose width + ellipsis fits.
  const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
  const segments = [...segmenter.segment(path)].map((s) => s.segment);
  let used = 0;
  const budget = maxWidth - 1; // reserve 1 column for ellipsis
  let i = segments.length - 1;
  while (i >= 0) {
    const seg = segments[i];
    if (seg === undefined) break;
    const w = visibleWidth(seg);
    if (used + w > budget) break;
    used += w;
    i--;
  }
  return ELLIPSIS + segments.slice(i + 1).join('');
}

function singleLine(text: string): string {
  return text.replaceAll(/\s+/g, ' ').trim();
}

function sessionSearchText(session: SessionRow): string {
  return [session.title, session.last_prompt].filter((s) => s !== undefined && s !== null && s.length > 0).join(' ');
}

export class SessionPickerComponent extends Container implements Focusable {
  private sessions: SessionRow[];
  private currentSessionId: string;
  private onSelect: (sessionId: string) => void;
  private onCancel: () => void;
  private maxVisibleSessions: number;
  private loading: boolean;
  private searchableList: SearchableList<SessionRow>;

  focused = false;

  constructor(opts: {
    sessions: SessionRow[];
    loading: boolean;
    currentSessionId: string;
    onSelect: (sessionId: string) => void;
    onCancel: () => void;
    onCtrlC?: () => void;
    onCtrlD?: () => void;
    maxVisibleSessions?: number;
  }) {
    super();
    this.sessions = opts.sessions;
    this.loading = opts.loading;
    this.currentSessionId = opts.currentSessionId;
    this.onSelect = opts.onSelect;
    this.onCancel = opts.onCancel;
    this.maxVisibleSessions = opts.maxVisibleSessions ?? 4;
    this.onCtrlC = opts.onCtrlC;
    this.onCtrlD = opts.onCtrlD;
    this.searchableList = new SearchableList({
      items: opts.sessions,
      toSearchText: sessionSearchText,
      searchable: true,
      pageSize: this.maxVisibleSessions,
      initialIndex: 0,
    });
  }

  private readonly onCtrlC?: () => void;
  private readonly onCtrlD?: () => void;

  handleInput(data: string): void {
    if (matchesKey(data, Key.ctrl('c'))) {
      this.onCtrlC?.();
      return;
    }
    if (matchesKey(data, Key.ctrl('d'))) {
      this.onCtrlD?.();
      return;
    }
    if (matchesKey(data, Key.escape)) {
      // If a search query is active, clear it first; otherwise cancel the picker.
      if (this.searchableList.clearQuery()) return;
      this.onCancel();
      return;
    }
    // Let the shared searchable list handle navigation, paging, and search editing.
    if (this.searchableList.handleKey(data)) return;
    if (matchesKey(data, Key.enter)) {
      const selected = this.searchableList.selected();
      if (selected !== undefined) {
        this.onSelect(selected.id);
      }
      return;
    }
  }

  override render(width: number): string[] {
    return this.renderLines(width).map((line) => truncateToWidth(line, width, ELLIPSIS));
  }

  // Builds the raw lines; `render()` applies a final width clamp so no line
  // can ever exceed the terminal width. The per-line budgets below keep the
  // layout tidy at normal widths, but on a very narrow terminal those budgets
  // floor at a minimum and the trailing time/badge are appended in full, so
  // the clamp in `render()` is what guarantees the renderer's invariant and
  // prevents the "Rendered line exceeds terminal width" crash (issue #240).
  private renderLines(width: number): string[] {
    const lines: string[] = [currentTheme.fg('primary', '─'.repeat(width))];

    if (this.loading) {
      lines.push(currentTheme.boldFg('primary', truncateToWidth('Sessions', width, ELLIPSIS)));
      lines.push(
        currentTheme.fg('textMuted', truncateToWidth('Loading sessions...', width, ELLIPSIS)),
      );
      lines.push(currentTheme.fg('primary', '─'.repeat(width)));
      return lines;
    }

    if (this.sessions.length === 0) {
      lines.push(currentTheme.boldFg('primary', truncateToWidth('Sessions', width, ELLIPSIS)));
      lines.push(
        currentTheme.fg(
          'textMuted',
          truncateToWidth('No sessions found. Press Escape to close.', width, ELLIPSIS),
        ),
      );
      lines.push(currentTheme.fg('primary', '─'.repeat(width)));
      return lines;
    }

    const view = this.searchableList.view();
    const filteredSessions = view.items;

    const headerLabel = 'Sessions ';
    const headerHint = '↑↓ navigate · Enter select · Esc cancel · type to search';
    const labelWidth = visibleWidth(headerLabel);
    const hintBudget = Math.max(0, width - labelWidth);
    const shownHint = truncateToWidth(headerHint, hintBudget, ELLIPSIS);
    lines.push(
      currentTheme.boldFg('primary', headerLabel) + currentTheme.fg('textMuted', shownHint),
    );

    // Show the active search query (if any) and the filtered count.
    const query = view.query;
    if (query.length > 0) {
      const searchLine = `search: ${query}`;
      lines.push(currentTheme.fg('textDim', truncateToWidth(searchLine, width, ELLIPSIS)));
    }
    lines.push('');

    if (filteredSessions.length === 0) {
      lines.push(
        currentTheme.fg(
          'textMuted',
          truncateToWidth('No matching sessions.', width, ELLIPSIS),
        ),
      );
      lines.push(currentTheme.fg('primary', '─'.repeat(width)));
      return lines;
    }

    const { page, selectedIndex } = view;
    const visibleSessions = filteredSessions.slice(page.start, page.end);

    for (const [vi, session] of visibleSessions.entries()) {
      const index = page.start + vi;
      const isSelected = index === selectedIndex;
      const isCurrent = session.id === this.currentSessionId;
      const card = this.renderSessionCard(width, session, isSelected, isCurrent);
      lines.push(...card);
      if (vi < visibleSessions.length - 1) lines.push('');
    }

    if (filteredSessions.length > visibleSessions.length) {
      lines.push('');
      const footer = `Showing ${String(page.start + 1)}-${String(page.end)} of ${String(filteredSessions.length)} sessions`;
      lines.push(currentTheme.fg('textMuted', truncateToWidth(footer, width, ELLIPSIS)));
    }

    lines.push(currentTheme.fg('primary', '─'.repeat(width)));
    return lines;
  }

  private renderSessionCard(
    width: number,
    session: SessionRow,
    isSelected: boolean,
    isCurrent: boolean,
  ): string[] {
    const pointer = isSelected ? SELECT_POINTER : ' ';
    const indent = '  ';
    const indentWidth = visibleWidth(indent);
    const titleColor: 'primary' | 'text' = isSelected ? 'primary' : 'text';
    const titleStyle = (text: string) =>
      isSelected ? currentTheme.boldFg(titleColor, text) : currentTheme.fg(titleColor, text);

    const time = formatRelativeTime(session.updated_at);
    const badge = isCurrent ? CURRENT_MARK : '';
    const rawTitle = (session.title ?? session.id).trim() || session.id;
    const titleSource = formatSessionLabel({ title: rawTitle, metadata: session.metadata });

    // Inline trailing parts after the title: "<title>  <time>  ← current".
    const trailingParts = [time, badge].filter((p) => p.length > 0);
    const trailingText = trailingParts.length > 0 ? '  ' + trailingParts.join('  ') : '';
    const trailingWidth = visibleWidth(trailingText);
    const headerPrefixWidth = visibleWidth(pointer) + 1; // pointer + space
    const titleBudget = Math.max(8, width - headerPrefixWidth - trailingWidth);
    const shownTitle = truncateToWidth(singleLine(titleSource), titleBudget, ELLIPSIS);

    let header = currentTheme.fg(isSelected ? 'primary' : 'textDim', pointer + ' ');
    header += titleStyle(shownTitle);
    if (time.length > 0) header += '  ' + currentTheme.fg('textDim', time);
    if (badge.length > 0) header += '  ' + currentTheme.fg('success', badge);
    const card: string[] = [header];

    // Session id is rendered in full at normal widths (the final clamp in
    // `render()` truncates it only when the terminal is narrower than the id).
    // The directory wraps to its own line if it would push past the edge.
    const fullId = session.id;
    const idWidth = visibleWidth(fullId);
    const metaGap = '   ';
    const metaGapWidth = visibleWidth(metaGap);
    const idLineWidth = indentWidth + idWidth;
    const aliasedDir = homeAlias(session.work_dir);
    const dirWidth = visibleWidth(aliasedDir);

    if (idLineWidth + metaGapWidth + dirWidth <= width) {
      card.push(
        indent +
          currentTheme.fg('textMuted', fullId) +
          currentTheme.fg('textDim', metaGap) +
          currentTheme.fg('textMuted', aliasedDir),
      );
    } else {
      // Not enough room for both on one line — keep the id intact and put the
      // directory on the next line (left-truncated only if it still doesn't fit).
      card.push(
        indent +
          currentTheme.fg(
            'textMuted',
            truncateToWidth(fullId, Math.max(idWidth, width - indentWidth), ELLIPSIS),
          ),
      );
      const dirBudget = Math.max(8, width - indentWidth);
      const dir = truncatePathLeft(aliasedDir, dirBudget);
      card.push(indent + currentTheme.fg('textMuted', dir));
    }

    const rawPrompt = session.last_prompt?.trim();
    if (rawPrompt && rawPrompt.length > 0) {
      const promptMarker = '› ';
      const promptMarkerWidth = visibleWidth(promptMarker);
      const promptBudget = Math.max(8, width - indentWidth - promptMarkerWidth);
      const promptText = truncateToWidth(singleLine(rawPrompt), promptBudget, ELLIPSIS);
      const promptLine = indent + currentTheme.fg('textDim', promptMarker + promptText);
      card.push(promptLine);
    }

    return card;
  }
}
