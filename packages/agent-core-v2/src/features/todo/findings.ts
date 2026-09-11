import type { Confidence, Depth, EvidenceItem, TodoItem } from './todoItem';

export const FINDINGS_STORE_KEY = 'findings' as const;

export interface FindingItem {
  readonly id: string;
  readonly question: string;
  readonly conclusion: string;
  readonly evidence: readonly EvidenceItem[];
  readonly confidence: Confidence;
  readonly depth: Depth;
  readonly status: 'resolved' | 'inconclusive';
  readonly resolvedAt: number;
  readonly parentId?: string;
  readonly subFindings: readonly string[];
}

function isFindingItem(value: unknown): value is FindingItem {
  if (typeof value !== 'object' || value === null) return false;
  const r = value as Record<string, unknown>;
  if (typeof r['id'] !== 'string' || r['id'].trim().length === 0) return false;
  if (typeof r['question'] !== 'string' || r['question'].trim().length === 0) return false;
  if (typeof r['conclusion'] !== 'string') return false;
  return r['status'] === 'resolved' || r['status'] === 'inconclusive';
}

export function readFindingItems(raw: unknown): readonly FindingItem[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(isFindingItem).map((f) => ({
    id: f.id,
    question: f.question,
    conclusion: f.conclusion,
    evidence: Array.isArray(f.evidence) ? f.evidence : [],
    confidence: f.confidence,
    depth: f.depth,
    status: f.status,
    resolvedAt: typeof f.resolvedAt === 'number' ? f.resolvedAt : 0,
    parentId: typeof f.parentId === 'string' ? f.parentId : undefined,
    subFindings: Array.isArray(f.subFindings) ? f.subFindings : [],
  }));
}

export function mergeArchivedFindings(
  current: readonly TodoItem[],
  incoming: readonly TodoItem[],
  existing: readonly FindingItem[],
): readonly FindingItem[] | undefined {
  const incomingIds = new Set(incoming.map((i) => i.id));

  const completed = current.filter((item) => {
    if (incomingIds.has(item.id)) return false;
    if (item.status !== 'resolved' && item.status !== 'inconclusive') return false;
    if (item.status === 'resolved' && (!item.conclusion || item.conclusion.trim().length === 0)) {
      return false;
    }
    return true;
  });
  if (completed.length === 0) return undefined;

  const existingIds = new Set(existing.map((f) => f.id));
  const newFindings: FindingItem[] = completed
    .filter((item) => !existingIds.has(item.id))
    .map((item) => ({
      id: item.id,
      question: item.question,
      conclusion: item.conclusion ?? (item.status === 'inconclusive' ? '无法得出结论' : ''),
      evidence: item.evidence,
      confidence: item.confidence,
      depth: item.depth,
      status: item.status as 'resolved' | 'inconclusive',
      resolvedAt: Date.now(),
      parentId: item.parentId,
      subFindings: item.subQuestions,
    }));
  if (newFindings.length === 0) return undefined;

  return [...newFindings, ...existing];
}

export function renderFindingsDigest(
  findings: readonly FindingItem[],
  title = '## Findings',
): string | undefined {
  if (findings.length === 0) return undefined;
  const lines: string[] = [title];
  let index = 1;
  for (const finding of findings) {
    lines.push(
      `${index}. [${finding.status}] ${finding.question} (confidence: ${finding.confidence}, depth: ${finding.depth})`,
    );
    lines.push(`   Conclusion: ${finding.conclusion}`);
    if (finding.evidence.length > 0) {
      const evidence = finding.evidence
        .map((ev) => `[${ev.status}] ${ev.description}`)
        .join('; ');
      lines.push(`   Evidence: ${evidence}`);
    }
    index += 1;
  }
  return lines.join('\n');
}
