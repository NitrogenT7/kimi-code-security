/**
 * InvestigationBoard — live-updating panel showing active investigation
 * questions and resolved findings, rendered between the activity pane and
 * the input area.
 *
 * Replaces the old TodoPanelComponent to support the question-driven
 * TodoList format: evidence chains, confidence/depth badges, blockers, and a
 * resolved-findings section. Mounted as a dedicated `Container` slot; the
 * streaming UI controller calls {@link setQuestions} / {@link setFindings}
 * whenever the LLM writes the TodoList (or replay hydrates the tool store).
 * State survives across turns so the board stays visible until explicitly
 * cleared (`todos: []`), a new session starts, or `/clear` is issued.
 */

import type { Component } from '@moonshot-ai/pi-tui';
import { truncateToWidth } from '@moonshot-ai/pi-tui';
import chalk from 'chalk';

import { currentTheme } from '#/tui/theme';
import type { ColorPalette } from '#/tui/theme/colors';

export type QuestionStatus = 'pending' | 'investigating' | 'resolved' | 'inconclusive';
export type EvidenceStatus = 'confirmed' | 'refuted' | 'checking';

export interface UiEvidenceItem {
  readonly status: EvidenceStatus;
  readonly description: string;
}

export interface UiQuestionItem {
  readonly id: string;
  readonly question: string;
  readonly status: QuestionStatus;
  readonly evidence: readonly UiEvidenceItem[];
  readonly blockers: readonly string[];
  readonly confidence: string;
  readonly depth: string;
  readonly conclusion?: string;
  readonly parentId?: string;
}

export interface UiFindingItem {
  readonly id: string;
  readonly question: string;
  readonly conclusion: string;
  readonly confidence: string;
  readonly depth: string;
  readonly status: 'resolved' | 'inconclusive';
}

const MAX_ACTIVE_QUESTIONS = 5;
const MAX_EVIDENCE_PER_QUESTION = 3;
const MAX_RESOLVED = 3;

export class InvestigationBoardComponent implements Component {
  private questions: readonly UiQuestionItem[] = [];
  private findings: readonly UiFindingItem[] = [];
  private expanded = false;

  setQuestions(questions: readonly UiQuestionItem[]): void {
    this.questions = questions.map((q) => ({ ...q }));
  }

  getQuestions(): readonly UiQuestionItem[] {
    return this.questions;
  }

  setFindings(findings: readonly UiFindingItem[]): void {
    this.findings = findings.map((f) => ({ ...f }));
  }

  getFindings(): readonly UiFindingItem[] {
    return this.findings;
  }

  clear(): void {
    this.questions = [];
    this.findings = [];
    this.expanded = false;
  }

  isEmpty(): boolean {
    return this.questions.length === 0 && this.findings.length === 0;
  }

  /** True when the collapsed caps hide content, i.e. there is something to expand. */
  hasOverflow(): boolean {
    return this.questions.length > MAX_ACTIVE_QUESTIONS || this.findings.length > MAX_RESOLVED;
  }

  setExpanded(expanded: boolean): void {
    this.expanded = expanded;
  }

  toggleExpanded(): void {
    this.expanded = !this.expanded;
  }

  invalidate(): void {}

  render(width: number): string[] {
    if (this.isEmpty()) return [];

    const c = currentTheme.palette;
    const lines: string[] = [];
    const innerW = Math.max(20, width - 4);

    lines.push(chalk.hex(c.border)('─'.repeat(width)));
    lines.push(chalk.hex(c.primary).bold(' Investigation'));

    if (this.questions.length > 0) {
      const visible = this.expanded
        ? this.questions
        : this.questions.slice(0, MAX_ACTIVE_QUESTIONS);
      for (const q of visible) {
        lines.push(...renderQuestion(q, c, innerW));
      }
      if (!this.expanded && this.questions.length > MAX_ACTIVE_QUESTIONS) {
        const hidden = this.questions.length - MAX_ACTIVE_QUESTIONS;
        lines.push(chalk.hex(c.textDim)(`  … +${hidden} more questions`));
      }
    }

    if (this.findings.length > 0) {
      const resolvedCount = this.findings.filter((f) => f.status === 'resolved').length;
      const inconclusiveCount = this.findings.length - resolvedCount;
      const parts: string[] = [];
      if (resolvedCount > 0) parts.push(`${resolvedCount} resolved`);
      if (inconclusiveCount > 0) parts.push(`${inconclusiveCount} inconclusive`);
      const label = parts.join(' / ');
      lines.push(
        chalk.hex(c.border)(
          `  ── ${label} ──${'─'.repeat(Math.max(0, innerW - 7 - label.length))}`,
        ),
      );

      const visible = this.expanded ? this.findings : this.findings.slice(0, MAX_RESOLVED);
      for (const f of visible) {
        lines.push(...renderFinding(f, c, innerW));
      }
      if (!this.expanded && this.findings.length > MAX_RESOLVED) {
        const hidden = this.findings.length - MAX_RESOLVED;
        lines.push(chalk.hex(c.textDim)(`  … +${hidden} more`));
      }
    }

    if (this.hasOverflow()) {
      lines.push(
        chalk.hex(c.textDim)(
          this.expanded ? '  ctrl+t to collapse' : '  ctrl+t to expand',
        ),
      );
    }

    return lines.map((line) => truncateToWidth(line, width));
  }
}

function confidenceBadge(confidence: string, depth: string, colors: ColorPalette): string {
  const confMap: Record<string, string> = { low: '低', medium: '中', high: '高' };
  const depthMap: Record<string, string> = { quick: 'quick', deep: 'deep' };
  const label = `${confMap[confidence] ?? confidence} ${depthMap[depth] ?? depth}`;
  const color =
    confidence === 'high' ? colors.primary : confidence === 'low' ? colors.textDim : colors.text;
  return chalk.hex(color)(`[${label}]`);
}

function statusMarker(status: QuestionStatus, colors: ColorPalette): string {
  if (status === 'investigating') return chalk.hex(colors.primary).bold('●');
  if (status === 'pending') return chalk.hex(colors.textDim)('○');
  return '';
}

function evidenceMarker(status: EvidenceStatus, colors: ColorPalette): string {
  if (status === 'confirmed') return chalk.hex(colors.success)('✅');
  if (status === 'refuted') return chalk.hex(colors.error)('❌');
  return chalk.hex(colors.warning)('❓');
}

function findingMarker(status: 'resolved' | 'inconclusive', colors: ColorPalette): string {
  if (status === 'resolved') return chalk.hex(colors.success)('✅');
  return chalk.hex(colors.warning)('❓');
}

function questionTitle(status: QuestionStatus, title: string, colors: ColorPalette): string {
  if (status === 'investigating') return chalk.hex(colors.text).bold(title);
  return chalk.hex(colors.text)(title);
}

function renderQuestion(q: UiQuestionItem, colors: ColorPalette, width: number): string[] {
  const lines: string[] = [];
  const marker = statusMarker(q.status, colors);
  const badge = confidenceBadge(q.confidence, q.depth, colors);
  const title = questionTitle(q.status, q.question, colors);

  const firstLine = `  ${marker} ${truncateToWidth(title, width - 20)} ${badge}`;
  lines.push(firstLine);

  const evidence = q.evidence ?? [];
  if (evidence.length > 0) {
    const showEvidence = evidence.slice(0, MAX_EVIDENCE_PER_QUESTION);
    for (const ev of showEvidence) {
      const em = evidenceMarker(ev.status, colors);
      lines.push(
        `    ${em} ${chalk.hex(colors.textDim)(truncateToWidth(ev.description, width - 10))}`,
      );
    }
    if (evidence.length > MAX_EVIDENCE_PER_QUESTION) {
      lines.push(`    ${chalk.hex(colors.textDim)('…')}`);
    }
  }

  const blockers = q.blockers ?? [];
  if (blockers.length > 0) {
    const blockerText = blockers.slice(0, 2).join('; ');
    const more = blockers.length > 2 ? ` …+${blockers.length - 2}` : '';
    lines.push(
      `    ${chalk.hex(colors.warning)(`⚡ ${truncateToWidth(blockerText + more, width - 10)}`)}`,
    );
  }

  return lines;
}

function renderFinding(f: UiFindingItem, colors: ColorPalette, width: number): string[] {
  const marker = findingMarker(f.status, colors);
  const badge = confidenceBadge(f.confidence, f.depth, colors);
  const conclusion = chalk.hex(colors.success).dim(truncateToWidth(f.conclusion, width - 25));

  const shortQuestion = truncateToWidth(f.question, Math.max(10, width - 35));
  return [`  ${marker} ${chalk.hex(colors.text)(shortQuestion)} → ${conclusion} ${badge}`];
}
