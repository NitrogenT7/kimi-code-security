/**
 * `todo` domain (L4) — question item data shape, migration, validation, and
 * pure render helpers.
 *
 * `QuestionItem` / `TodoItem` are the persistent shape carried by the
 * `tools.update_store` (`key: 'todo'`) wire record and rendered by the
 * `TodoListTool` and the stale reminder. Each item is a *question* to answer
 * (not a task), tracked with hypotheses, evidence chains, blockers,
 * confidence, and depth. Legacy `{ title, status }` task items (written by
 * older sessions or submitted by models ignoring the advertised schema) are
 * migrated on the fly via `migrateOldTodo`. Pure and scope-less — no scoped
 * state lives here. The session todo list itself is owned by
 * `ISessionTodoService`.
 */

import { randomUUID } from 'node:crypto';

import { z } from 'zod';

export const TODO_LIST_TOOL_NAME = 'TodoList' as const;
export const TODO_STORE_KEY = 'todo';

export type QuestionStatus = 'pending' | 'investigating' | 'resolved' | 'inconclusive';

export type EvidenceStatus = 'confirmed' | 'refuted' | 'checking';

export type Confidence = 'low' | 'medium' | 'high';

export type Depth = 'quick' | 'deep';

export interface EvidenceItem {
  readonly status: EvidenceStatus;
  readonly description: string;
}

export interface QuestionItem {
  readonly type: 'question';
  readonly id: string;
  readonly question: string;
  readonly hypothesis?: string;
  readonly conclusion?: string;
  readonly evidence: readonly EvidenceItem[];
  readonly blockers: readonly string[];
  readonly confidence: Confidence;
  readonly depth: Depth;
  readonly status: QuestionStatus;
  readonly parentId?: string;
  readonly subQuestions: readonly string[];
}

export type TodoItem = QuestionItem;

export const EvidenceItemSchema = z.object({
  status: z.enum(['confirmed', 'refuted', 'checking']),
  description: z.string().min(1),
});

export const QuestionItemSchema: z.ZodType<QuestionItem> = z.object({
  type: z.literal('question'),
  id: z.string().min(1),
  question: z.string().min(1),
  hypothesis: z.string().optional(),
  conclusion: z.string().optional(),
  evidence: z.array(EvidenceItemSchema).default([]),
  blockers: z.array(z.string()).default([]),
  confidence: z.enum(['low', 'medium', 'high']),
  depth: z.enum(['quick', 'deep']),
  status: z.enum(['pending', 'investigating', 'resolved', 'inconclusive']),
  parentId: z.string().optional(),
  subQuestions: z.array(z.string()).default([]),
});

export interface OldTodoItem {
  readonly title: string;
  readonly status: 'pending' | 'in_progress' | 'done';
}

export function isOldFormatTodo(value: unknown): value is OldTodoItem {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  return typeof record['title'] === 'string' && typeof record['status'] === 'string';
}

const OLD_STATUS_MAP: Record<string, QuestionStatus> = {
  pending: 'pending',
  in_progress: 'investigating',
  done: 'resolved',
};

export function migrateOldTodo(old: OldTodoItem): QuestionItem {
  return {
    type: 'question',
    id: randomUUID(),
    question: old.title,
    status: OLD_STATUS_MAP[old.status] ?? 'pending',
    evidence: [],
    blockers: [],
    confidence: 'medium',
    depth: 'deep',
    subQuestions: [],
  };
}

/**
 * Lightweight structural check — deliberately looser than the full Zod
 * schema because LLM-provided plain objects may omit optional fields that
 * carry `.default()` in the schema. Matches the advertised required set:
 * type, id, question, status, confidence, depth.
 */
export function looksLikeQuestionItem(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null) return false;
  const r = value as Record<string, unknown>;
  if (r['type'] !== 'question') return false;
  if (typeof r['question'] !== 'string' || r['question'].trim().length === 0) return false;
  if (typeof r['id'] !== 'string' || r['id'].trim().length === 0) return false;
  const status = r['status'];
  if (
    status !== 'pending' &&
    status !== 'investigating' &&
    status !== 'resolved' &&
    status !== 'inconclusive'
  ) {
    return false;
  }
  const confidence = r['confidence'];
  if (confidence !== 'low' && confidence !== 'medium' && confidence !== 'high') return false;
  const depth = r['depth'];
  if (depth !== 'quick' && depth !== 'deep') return false;
  const evidence = r['evidence'];
  if (evidence !== undefined && !Array.isArray(evidence)) return false;
  const blockers = r['blockers'];
  if (blockers !== undefined && !Array.isArray(blockers)) return false;
  const subQuestions = r['subQuestions'];
  if (subQuestions !== undefined && !Array.isArray(subQuestions)) return false;
  return true;
}

export function normalizeQuestionItem(raw: Record<string, unknown>): QuestionItem {
  return QuestionItemSchema.parse(raw);
}

function validateResolvedItem(
  evidence: readonly unknown[],
  conclusion: unknown,
  status: unknown,
): string | null {
  if (status !== 'resolved') return null;
  const issues: string[] = [];
  if (!conclusion || (typeof conclusion === 'string' && conclusion.trim().length === 0)) {
    issues.push('conclusion is required when status is "resolved"');
  }
  if (!Array.isArray(evidence) || evidence.length === 0) {
    issues.push('evidence is required when status is "resolved"');
  }
  return issues.length > 0 ? issues.join('; ') : null;
}

function describeValidationIssue(value: unknown): string {
  if (typeof value !== 'object' || value === null) {
    return 'Item is not an object';
  }
  const r = value as Record<string, unknown>;
  if (r['type'] !== 'question') return 'Missing or invalid "type" field (must be "question")';
  if (typeof r['question'] !== 'string' || r['question'].trim().length === 0) {
    return 'Missing or empty "question" field';
  }
  if (typeof r['id'] !== 'string' || r['id'].trim().length === 0) {
    return 'Missing or empty "id" field (provide a UUID)';
  }
  const status = r['status'];
  if (
    status !== 'pending' &&
    status !== 'investigating' &&
    status !== 'resolved' &&
    status !== 'inconclusive'
  ) {
    return `Invalid "status": "${String(status)}" (must be pending|investigating|resolved|inconclusive)`;
  }
  const confidence = r['confidence'];
  if (confidence !== 'low' && confidence !== 'medium' && confidence !== 'high') {
    return `Invalid "confidence": "${String(confidence)}" (must be low|medium|high)`;
  }
  const depth = r['depth'];
  if (depth !== 'quick' && depth !== 'deep') {
    return `Invalid "depth": "${String(depth)}" (must be quick|deep)`;
  }
  if (r['evidence'] !== undefined && !Array.isArray(r['evidence'])) {
    return '"evidence" must be an array (use [] for empty)';
  }
  if (r['blockers'] !== undefined && !Array.isArray(r['blockers'])) {
    return '"blockers" must be an array (use [] for empty)';
  }
  if (r['subQuestions'] !== undefined && !Array.isArray(r['subQuestions'])) {
    return '"subQuestions" must be an array';
  }
  return 'Unknown validation error';
}

export function validateTodoItem(value: unknown): string | null {
  if (isOldFormatTodo(value)) {
    const migrated = migrateOldTodo(value);
    return validateResolvedItem(migrated.evidence, migrated.conclusion, migrated.status);
  }
  if (!looksLikeQuestionItem(value)) {
    return describeValidationIssue(value);
  }
  const r = value as Record<string, unknown>;
  return validateResolvedItem(r['evidence'] as readonly unknown[], r['conclusion'], r['status']);
}

/**
 * Log→model boundary sanitizer: accepts question items (normalized through
 * the Zod schema so missing optional fields get their defaults), migrates
 * legacy `{ title, status }` items on the fly, and drops anything else so
 * every consumer of the rebuilt Model can trust the items.
 */
export function readTodoItems(raw: unknown): readonly TodoItem[] {
  if (!Array.isArray(raw)) return [];
  const items: TodoItem[] = [];
  for (const value of raw) {
    if (isOldFormatTodo(value)) {
      items.push(migrateOldTodo(value));
      continue;
    }
    if (!looksLikeQuestionItem(value)) continue;
    try {
      items.push(normalizeQuestionItem(value));
    } catch {
      continue;
    }
  }
  return items;
}

export function renderTodoList(
  todos: readonly TodoItem[],
  title = 'Current question list:',
  options?: { includeResolved?: boolean },
): string {
  const normalized = todos.map((t) => (isOldFormatTodo(t) ? migrateOldTodo(t) : t)) as TodoItem[];

  const childMap = new Map<string, TodoItem[]>();
  for (const t of normalized) {
    if (t.parentId) {
      const siblings = childMap.get(t.parentId) ?? [];
      siblings.push(t);
      childMap.set(t.parentId, siblings);
    }
  }

  const parentIds = new Set(normalized.filter((t) => !t.parentId).map((t) => t.id));
  const active = normalized.filter((t) => {
    if (options?.includeResolved === true) return true;
    if (t.status === 'pending' || t.status === 'investigating') return true;
    if (t.parentId && parentIds.has(t.parentId)) {
      const parent = normalized.find((p) => p.id === t.parentId);
      if (parent && (parent.status === 'pending' || parent.status === 'investigating')) {
        return true;
      }
    }
    return false;
  });
  if (active.length === 0) {
    return 'Question list is empty.';
  }

  const topLevel = active.filter((t) => !t.parentId);

  const lines: string[] = [title];
  let index = 1;
  for (const parent of topLevel) {
    renderQuestion(parent, lines, index, false);
    const children = childMap.get(parent.id) ?? [];
    let childIndex = 1;
    for (const child of children) {
      renderQuestion(child, lines, `${index}.${childIndex}`, true);
      childIndex += 1;
    }
    index += 1;
  }

  return lines.join('\n');
}

function renderQuestion(
  item: QuestionItem,
  lines: string[],
  prefix: number | string,
  isChild: boolean,
): void {
  const marker = statusMarker(item.status);
  lines.push(`${isChild ? '  ' : ''}${prefix}. ${marker} ${item.question}`);

  if (item.hypothesis) {
    lines.push(`${isChild ? '  ' : ''}   假设：${item.hypothesis}`);
  }
  if (item.evidence.length > 0) {
    if (item.evidence.length === 1) {
      const first = item.evidence[0];
      if (first !== undefined) {
        lines.push(`${isChild ? '  ' : ''}   证据链：${formatEvidenceItem(first)}`);
      }
    } else {
      lines.push(`${isChild ? '  ' : ''}   证据链：`);
      for (const ev of item.evidence) {
        lines.push(`${isChild ? '  ' : ''}     ${formatEvidenceItem(ev)}`);
      }
    }
  }
  if (item.blockers.length > 0) {
    lines.push(`${isChild ? '  ' : ''}   阻碍：${item.blockers.join('; ')}`);
  }
  if (item.conclusion) {
    lines.push(`${isChild ? '  ' : ''}   结论：${item.conclusion}`);
  }
  lines.push(`${isChild ? '  ' : ''}   置信度：${item.confidence}｜深度：${item.depth}`);
}

function formatEvidenceItem(ev: EvidenceItem): string {
  const evMarker = ev.status === 'confirmed' ? '✅' : ev.status === 'refuted' ? '❌' : '❓';
  return `${evMarker} [${ev.status}] ${ev.description}`;
}

function statusMarker(status: QuestionStatus): string {
  switch (status) {
    case 'pending':
      return '[pending]';
    case 'investigating':
      return '[investigating]';
    case 'resolved':
      return '[resolved]';
    case 'inconclusive':
      return '[inconclusive]';
    default: {
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
}
