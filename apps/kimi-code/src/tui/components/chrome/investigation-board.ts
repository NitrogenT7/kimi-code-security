/**
 * InvestigationBoard — live-updating panel showing active questions and
 * resolved findings, rendered between the activity pane and the input area.
 *
 * Replaces the old TodoPanelComponent to support the new QuestionItem format
 * with evidence chains, confidence/depth badges, parent-child tree layout,
 * and a collapsible resolved findings section.
 *
 * Mounted via `InvestigationBoardContainer` in the TUI layout. The
 * streaming UI controller calls {@link setQuestions} and {@link setFindings}
 * whenever the LLM writes the TodoList.
 */

import type { Component } from '@earendil-works/pi-tui';
import { truncateToWidth } from '@earendil-works/pi-tui';
import chalk from 'chalk';

import { currentTheme } from '#/tui/theme';
import type { ColorPalette } from '#/tui/theme/colors';

// ── Types ─────────────────────────────────────────────────────────────

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

// ── Constants ─────────────────────────────────────────────────────────

const MAX_ACTIVE_QUESTIONS = 5;
const MAX_EVIDENCE_PER_QUESTION = 3;
const MAX_RESOLVED = 3;

// ── Component ─────────────────────────────────────────────────────────

export class InvestigationBoardComponent implements Component {
  private questions: readonly UiQuestionItem[] = [];
  private findings: readonly UiFindingItem[] = [];
  private hasContent = false;

  setQuestions(questions: readonly UiQuestionItem[]): void {
    this.questions = questions;
    this.hasContent = questions.length > 0 || this.findings.length > 0;
    if (questions.length === 0 && this.findings.length === 0) {
      this.hasContent = false;
    }
  }

  setFindings(findings: readonly UiFindingItem[]): void {
    this.findings = findings;
    this.hasContent = this.questions.length > 0 || findings.length > 0;
  }

  clear(): void {
    this.questions = [];
    this.findings = [];
    this.hasContent = false;
  }

  isEmpty(): boolean {
    return !this.hasContent;
  }

  invalidate(): void {}

  render(width: number): string[] {
    if (!this.hasContent) return [];

    const c = currentTheme.palette;
    const lines: string[] = [];
    const innerW = Math.max(20, width - 4);

    // ── Top border + title ──────────────────────────────────────────
    lines.push(chalk.hex(c.border)('─'.repeat(width)));
    lines.push(chalk.hex(c.primary).bold(' Investigation'));

    // ── Active questions ────────────────────────────────────────────
    if (this.questions.length > 0) {
      const visible = this.questions.slice(0, MAX_ACTIVE_QUESTIONS);
      for (const q of visible) {
        lines.push(...renderQuestion(q, c, innerW));
      }
      if (this.questions.length > MAX_ACTIVE_QUESTIONS) {
        const hidden = this.questions.length - MAX_ACTIVE_QUESTIONS;
        lines.push(chalk.hex(c.textDim)(`  … +${hidden} more questions`));
      }
    }

    // ── Resolved findings ───────────────────────────────────────────
    if (this.findings.length > 0) {
      const resolvedCount = this.findings.filter((f) => f.status === 'resolved').length;
      const inconclusiveCount = this.findings.length - resolvedCount;
      const parts: string[] = [];
      if (resolvedCount > 0) parts.push(`${resolvedCount} resolved`);
      if (inconclusiveCount > 0) parts.push(`${inconclusiveCount} inconclusive`);
      lines.push(
        chalk.hex(c.border)(`  ── ${parts.join(' / ')} ──${'─'.repeat(Math.max(0, innerW - 7 - parts.join(' / ').length))}`),
      );

      const visible = this.findings.slice(0, MAX_RESOLVED);
      for (const f of visible) {
        lines.push(...renderFinding(f, c, innerW));
      }
      if (this.findings.length > MAX_RESOLVED) {
        const hidden = this.findings.length - MAX_RESOLVED;
        lines.push(chalk.hex(c.textDim)(`  … +${hidden} more`));
      }
    }

    return lines.map((line) => truncateToWidth(line, width));
  }
}

// ── Helpers ───────────────────────────────────────────────────────────

function confidenceBadge(confidence: string, depth: string, colors: ColorPalette): string {
  const confMap: Record<string, string> = { low: '低', medium: '中', high: '高' };
  const depthMap: Record<string, string> = { quick: 'quick', deep: 'deep' };
  const label = `${confMap[confidence] ?? confidence} ${depthMap[depth] ?? depth}`;
  const color = confidence === 'high'
    ? colors.primary
    : confidence === 'low'
      ? colors.textDim
      : colors.text;
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

  // First line: marker + question + badge
  const firstLine = `  ${marker} ${truncateToWidth(title, width - 20)} ${badge}`;
  lines.push(firstLine);

  // Evidence lines (tree-style)
  if (q.evidence.length > 0) {
    const showEvidence = q.evidence.slice(0, MAX_EVIDENCE_PER_QUESTION);
    for (const ev of showEvidence) {
      const em = evidenceMarker(ev.status, colors);
      lines.push(`    ${em} ${chalk.hex(colors.textDim)(truncateToWidth(ev.description, width - 10))}`);
    }
    if (q.evidence.length > MAX_EVIDENCE_PER_QUESTION) {
      lines.push(`    ${chalk.hex(colors.textDim)('…')}`);
    }
  }

  // Blockers
  if (q.blockers.length > 0) {
    const blockerText = q.blockers.slice(0, 2).join('; ');
    const more = q.blockers.length > 2 ? ` …+${q.blockers.length - 2}` : '';
    lines.push(`    ${chalk.hex(colors.warning)(`⚡ ${truncateToWidth(blockerText + more, width - 10)}`)}`);
  }

  return lines;
}

function renderFinding(f: UiFindingItem, colors: ColorPalette, width: number): string[] {
  const marker = findingMarker(f.status, colors);
  const badge = confidenceBadge(f.confidence, f.depth, colors);
  const conclusion = chalk.hex(colors.success).dim(truncateToWidth(f.conclusion, width - 25));

  // Collapse: question → conclusion on one concise line
  const shortQuestion = truncateToWidth(f.question, Math.max(10, width - 35));
  return [`  ${marker} ${chalk.hex(colors.text)(shortQuestion)} → ${conclusion} ${badge}`];
}
