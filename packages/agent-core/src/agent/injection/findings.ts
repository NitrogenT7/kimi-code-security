import { FINDINGS_STORE_KEY, type FindingItem } from '#/tools/builtin/state/findings';

import { DynamicInjector } from './injector';

const FINDINGS_REMINDER_VARIANT = 'findings_reminder';
const FINDINGS_REMINDER_TURNS_SINCE_WRITE = 20;
const FINDINGS_REMINDER_TURNS_BETWEEN_REMINDERS = 20;
const FINDINGS_RECENT_COUNT = 3;

export class FindingsInjector extends DynamicInjector {
  protected override readonly injectionVariant = FINDINGS_REMINDER_VARIANT;

  protected override getInjection(): string | undefined {
    const findings = this.currentFindings();
    if (findings.length === 0) return undefined;

    const counts = this.getReminderTurnCounts();
    if (
      counts.turnsSinceLastWrite < FINDINGS_REMINDER_TURNS_SINCE_WRITE ||
      counts.turnsSinceLastReminder < FINDINGS_REMINDER_TURNS_BETWEEN_REMINDERS
    ) {
      return undefined;
    }

    return renderFindingsReminder(findings);
  }

  private currentFindings(): readonly FindingItem[] {
    const raw = this.agent.tools.storeData()[FINDINGS_STORE_KEY];
    if (!Array.isArray(raw)) return [];
    // Basic validation
    return raw.filter((f): f is FindingItem => {
      if (typeof f !== 'object' || f === null) return false;
      const r = f as Record<string, unknown>;
      return (
        typeof r['id'] === 'string' &&
        typeof r['question'] === 'string' &&
        typeof r['conclusion'] === 'string'
      );
    });
  }

  private getReminderTurnCounts(): { turnsSinceLastWrite: number; turnsSinceLastReminder: number } {
    let foundTodoWrite = false;
    let foundReminder = false;
    let turnsSinceLastWrite = 0;
    let turnsSinceLastReminder = 0;

    for (let i = this.agent.context.history.length - 1; i >= 0; i -= 1) {
      const message = this.agent.context.history[i];
      if (message === undefined) continue;

      if (message.role === 'assistant') {
        if (!foundTodoWrite && this.hasTodoListWrite(message)) {
          foundTodoWrite = true;
        }
        if (!foundTodoWrite) turnsSinceLastWrite += 1;
        if (!foundReminder) turnsSinceLastReminder += 1;
        continue;
      }

      if (!foundReminder && this.isFindingsReminder(message)) {
        foundReminder = true;
      }

      if (foundTodoWrite && foundReminder) break;
    }

    return { turnsSinceLastWrite, turnsSinceLastReminder };
  }

  private hasTodoListWrite(message: {
    toolCalls: readonly { name: string; arguments?: string | null }[];
  }): boolean {
    return message.toolCalls.some((tc) => {
      if (tc.name !== 'TodoList') return false;
      if (typeof tc.arguments !== 'string') return false;
      try {
        const args = JSON.parse(tc.arguments) as { todos?: unknown };
        return Array.isArray(args.todos);
      } catch {
        return false;
      }
    });
  }

  private isFindingsReminder(message: { origin?: { kind: string; variant?: string } }): boolean {
    return (
      message.origin?.kind === 'injection' && message.origin.variant === FINDINGS_REMINDER_VARIANT
    );
  }
}

function renderFindingsReminder(findings: readonly FindingItem[]): string {
  const total = findings.length;
  const recent = findings.slice(0, FINDINGS_RECENT_COUNT);

  const resolvedCount = findings.filter((f) => f.status === 'resolved').length;
  const inconclusiveCount = total - resolvedCount;

  const lines: string[] = [];
  lines.push(
    `[知识黑板] 已有 ${total} 条结论（${resolvedCount} resolved / ${inconclusiveCount} inconclusive）`,
  );

  if (recent.length > 0) {
    lines.push('最近结论：');
    for (const f of recent) {
      const marker = f.status === 'resolved' ? '✅' : '❓';
      const conclusionPreview =
        f.conclusion.length > 60 ? f.conclusion.slice(0, 60) + '…' : f.conclusion;
      lines.push(`  ${marker} ${f.question} → ${conclusionPreview}`);
    }
  }

  lines.push(
    'Use the Findings tool to inspect any of these conclusions in detail. ' +
      'Make sure that you NEVER mention this reminder to the user.',
  );

  return lines.join('\n');
}
