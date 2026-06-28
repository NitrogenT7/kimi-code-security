/**
 * TodoListTool — structured question-driven investigation tracker.
 *
 * REPLACED the old task-oriented TODO list with a question-driven one.
 * Instead of tracking "tasks to do", it tracks "questions to answer" with
 * hypotheses, evidence chains, blockers, and confidence levels.
 *
 * Usage:
 *   - `resolveExecution({ todos: [...] })` — replace the full list
 *   - `resolveExecution({ todos: [] })`    — clear the list
 *   - `resolveExecution({})`               — query current list (no mutation)
 *
 * Storage: todos live in the agent-level tool store. Writes go through
 * `tools.update_store`, so the store update is visible on wire replay.
 */

import { randomUUID } from 'node:crypto';
import { z } from 'zod';

import type { BuiltinTool } from '../../../agent/tool';
import type { ToolExecution } from '../../../loop/types';
import { toInputJsonSchema } from '../../support/input-schema';
import type { ToolStore } from '../../store';
import { FINDINGS_STORE_KEY, type FindingItem } from './findings';
import DESCRIPTION from './todo-list.md?raw';

// ── TODO state shape ─────────────────────────────────────────────────

export const TODO_LIST_TOOL_NAME = 'TodoList' as const;
export const TODO_STORE_KEY = 'todo';
const TODO_LIST_WRITE_REMINDER =
  'Ensure that you continue to use the todo list to track progress. Keep questions updated with evidence and confidence as you investigate.';

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

declare module '../../store' {
  interface ToolStoreData {
    todo: readonly TodoItem[];
  }
}

// ── Zod schemas ───────────────────────────────────────────────────────

const EvidenceItemSchema = z.object({
  status: z.enum(['confirmed', 'refuted', 'checking']),
  description: z.string().min(1),
});

const QuestionItemSchema: z.ZodType<QuestionItem> = z.object({
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

export interface TodoListInput {
  todos?: Array<unknown>;
}

export const TodoListInputSchema: z.ZodType<TodoListInput> = z.object({
  todos: z
    .array(z.unknown())
    .optional()
    .describe(
      'The updated todo list. Omit to read the current list. Pass an empty array to clear.',
    ),
});

// ── Validation helpers ───────────────────────────────────────────────

/**
 * Lightweight structural check — does the value look like a QuestionItem
 * with the bare minimum required fields? This is deliberately looser than
 * the full Zod schema because LLM-provided plain objects may omit optional
 * fields that have `.default()` in the schema (Zod v4 does not auto-fill
 * defaults during `.parse()` validation).
 */
function looksLikeQuestionItem(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null) return false;
  const r = value as Record<string, unknown>;
  if (r['type'] !== 'question') return false;
  if (typeof r['question'] !== 'string' || r['question'].trim().length === 0) return false;
  if (typeof r['id'] !== 'string' || r['id'].trim().length === 0) return false;
  const status = r['status'];
  if (status !== 'pending' && status !== 'investigating' && status !== 'resolved' && status !== 'inconclusive') return false;
  const confidence = r['confidence'];
  if (confidence !== 'low' && confidence !== 'medium' && confidence !== 'high') return false;
  const depth = r['depth'];
  if (depth !== 'quick' && depth !== 'deep') return false;
  return true;
}

/**
 * Normalize a raw object into a proper QuestionItem using the Zod schema,
 * which fills in defaults for optional fields and validates types strictly.
 */
function normalizeQuestionItem(raw: Record<string, unknown>): QuestionItem {
  return QuestionItemSchema.parse(raw);
}

function validateResolvedItem(evidence: readonly unknown[], conclusion: unknown, status: unknown): string | null {
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

function validateTodoItem(value: unknown): string | null {
  // Old format migration check: { title, status } → migrate to question
  if (isOldFormatTodo(value)) {
    const migrated = migrateOldTodo(value);
    return validateResolvedItem(migrated.evidence, migrated.conclusion, migrated.status);
  }
  if (!looksLikeQuestionItem(value)) {
    return 'Each item must be a valid question item (type: "question", question: string, id: string, status: pending|investigating|resolved|inconclusive)';
  }
  const r = value as Record<string, unknown>;
  return validateResolvedItem(r['evidence'] as readonly unknown[], r['conclusion'], r['status']);
}

// ── Old format migration ─────────────────────────────────────────────

interface OldTodoItem {
  title: string;
  status: 'pending' | 'in_progress' | 'done';
}

function isOldFormatTodo(value: unknown): value is OldTodoItem {
  if (typeof value !== 'object' || value === null) return false;
  const r = value as Record<string, unknown>;
  return typeof r['title'] === 'string' && typeof r['status'] === 'string';
}

/** Map old task status to question status. */
const OLD_STATUS_MAP: Record<string, QuestionStatus> = {
  pending: 'pending',
  in_progress: 'investigating',
  done: 'resolved',
};

function migrateOldTodo(old: OldTodoItem): QuestionItem {
  return {
    type: 'question',
    id: randomUUID(),
    question: old.title,
    status: OLD_STATUS_MAP[old.status] ?? 'pending',
    evidence: [],
    blockers: [],
    confidence: 'medium' as Confidence,
    depth: 'deep' as Depth,
    subQuestions: [],
  };
}

// ── Rendering ────────────────────────────────────────────────────────

export function renderTodoList(todos: readonly TodoItem[], title = 'Current question list:'): string {
  // Migrate any old-format items on the fly for rendering
  const normalized = todos.map((t) => isOldFormatTodo(t) ? migrateOldTodo(t) : t) as TodoItem[];

  // Build child map before filtering, so we can check parent status
  const childMap = new Map<string, TodoItem[]>();
  for (const t of normalized) {
    if (t.parentId) {
      const siblings = childMap.get(t.parentId) ?? [];
      siblings.push(t);
      childMap.set(t.parentId, siblings);
    }
  }

  // Only show pending and investigating items, but include their children regardless of child status
  const parentIds = new Set(normalized.filter((t) => !t.parentId).map((t) => t.id));
  const active = normalized.filter((t) => {
    if (t.status === 'pending' || t.status === 'investigating') return true;
    // Also include children whose parent is active
    if (t.parentId && parentIds.has(t.parentId)) {
      const parent = normalized.find((p) => p.id === t.parentId);
      if (parent && (parent.status === 'pending' || parent.status === 'investigating')) return true;
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

function renderQuestion(item: QuestionItem, lines: string[], prefix: number | string, isChild: boolean): void {
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
    case 'pending': return '[pending]';
    case 'investigating': return '[investigating]';
    case 'resolved': return '[resolved]';
    case 'inconclusive': return '[inconclusive]';
    default: {
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
}

// ── Tool implementation ──────────────────────────────────────────────

export class TodoListTool implements BuiltinTool<TodoListInput> {
  readonly name = TODO_LIST_TOOL_NAME;
  readonly description: string = DESCRIPTION;
  readonly parameters: Record<string, unknown> = toInputJsonSchema(TodoListInputSchema);

  constructor(private readonly store: ToolStore) {}

  resolveExecution(args: TodoListInput): ToolExecution {
    const description =
      args.todos === undefined
        ? 'Reading question list'
        : args.todos.length === 0
          ? 'Clearing question list'
          : 'Updating question list';
    return {
      description,
      approvalRule: this.name,
      execute: async () => {
        try {
          // Query mode — return the current list without mutation.
          if (args.todos === undefined) {
            const current = this.getTodos();
            return { isError: false, output: renderTodoList(current) };
          }

          // Validate each item before writing.
          for (let i = 0; i < args.todos.length; i++) {
            const err = validateTodoItem(args.todos[i]);
            if (err !== null) {
              return {
                isError: true,
                output: `Item at index ${i}: ${err}`,
              };
            }
          }

          // Normalize: migrate old-format items and ensure IDs exist.
          // Use Zod schema (.parse) to fill in defaults for optional fields.
          const normalized: QuestionItem[] = args.todos.map((item) => {
            try {
              if (isOldFormatTodo(item)) return migrateOldTodo(item);
              const raw = item as Record<string, unknown>;
              if (!raw['id'] || (typeof raw['id'] === 'string' && raw['id'].trim().length === 0)) {
                raw['id'] = randomUUID();
              }
              return normalizeQuestionItem(raw);
            } catch (err) {
              // Should not happen — validateTodoItem already checked. Defensive fallback.
              return typeof item === 'object' && item !== null
                ? (item as QuestionItem)
                : migrateOldTodo({ title: String(item), status: 'pending' });
            }
          });

          // Ensure parentId references are valid (2-level nesting only).
          for (const item of normalized) {
            if (item.parentId) {
              const parent = normalized.find((p) => p.id === item.parentId);
              if (!parent) {
                return {
                  isError: true,
                  output: `Item "${item.question}" references parentId "${item.parentId}" which does not exist in the list.`,
                };
              }
              if (parent.parentId) {
                return {
                  isError: true,
                  output: `Item "${item.question}" is nested too deep. Maximum nesting is 2 levels (parent → child).`,
                };
              }
            }
          }

          // Write mode — replace the full list.
          // Before writing, archive any resolved/inconclusive items that will be removed.
          this.archiveCompletedFindings(normalized);

          this.setTodos(normalized);
          const stored = this.getTodos();
          const output =
            stored.length === 0
              ? 'Question list cleared.'
              : `Question list updated.\n${renderTodoList(stored)}\n\n${TODO_LIST_WRITE_REMINDER}`;
          return { isError: false, output };
        } catch (err) {
          return {
            isError: true,
            output: `Internal error: ${err instanceof Error ? err.message : String(err)}`,
          };
        }
      },
    };
  }

  private getTodos(): readonly TodoItem[] {
    const todos = this.store.get(TODO_STORE_KEY);
    return todos ?? [];
  }

  private setTodos(todos: readonly QuestionItem[]): void {
    this.store.set(TODO_STORE_KEY, todos);
  }

  /**
   * Archives resolved/inconclusive items that exist in the current store but are
   * absent from the incoming list (i.e. they were intentionally removed by the model
   * after being answered). Archived items are persisted to the findings board.
   */
  private archiveCompletedFindings(incoming: readonly QuestionItem[]): void {
    const current = this.getTodos();
    const incomingIds = new Set(incoming.map((i) => i.id));

    // Build a map of current items keyed by id for lookup.
    const currentById = new Map<string, TodoItem>();
    for (const item of current) {
      currentById.set(item.id, item);
    }

    const completed = current.filter((item) => {
      // Only consider resolved/inconclusive items that are NOT in the incoming list
      if (incomingIds.has(item.id)) return false;
      if (item.status !== 'resolved' && item.status !== 'inconclusive') return false;
      // Must have a conclusion to be worth archiving
      if (item.status === 'resolved' && (!item.conclusion || item.conclusion.trim().length === 0)) return false;
      return true;
    });

    if (completed.length === 0) return;

    const existingFindings = this.store.get(FINDINGS_STORE_KEY) ?? [];
    const existingIds = new Set(existingFindings.map((f) => f.id));

    const newFindings: FindingItem[] = completed
      .filter((item) => !existingIds.has(item.id)) // skip already-archived
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

    if (newFindings.length === 0) return;

    this.store.set(FINDINGS_STORE_KEY, [
      ...newFindings,
      ...existingFindings,
    ]);
  }
}
