import { ChoicePickerComponent } from '../components/dialogs/choice-picker';
import type { SessionSummary } from '@moonshot-ai/kimi-code-sdk';
import type { SlashCommandHost } from './dispatch';

/** Default staleness threshold: 7 days without activity. */
const DEFAULT_DAYS = 7;

interface CleanOptions {
  readonly go: boolean;
  readonly all: boolean;
  readonly days: number;
}

function parseArgs(args: string): CleanOptions {
  const tokens = args.trim().toLowerCase().split(/\s+/).filter((t) => t.length > 0);
  const opts: { go: boolean; all: boolean; days: number } = {
    go: false,
    all: false,
    days: DEFAULT_DAYS,
  };
  for (const token of tokens) {
    if (token === 'go') opts.go = true;
    else if (token === 'all') opts.all = true;
    else if (token === 'dry') opts.go = false;
    else {
      const days = Number.parseInt(token, 10);
      if (Number.isFinite(days) && days > 0) opts.days = days;
    }
  }
  return opts;
}

/**
 * A session is cleanable when it has no independent name (auto-derived title)
 * and has been idle past the cutoff. Sessions whose state predates the
 * isCustomTitle field count as auto-named — consistent with the semantics.
 */
function isCleanable(summary: SessionSummary, cutoffMs: number): boolean {
  return summary.isCustomTitle !== true && Date.now() - summary.updatedAt >= cutoffMs;
}

function formatAge(updatedAt: number): string {
  const days = Math.floor((Date.now() - updatedAt) / 86_400_000);
  if (days <= 0) return 'today';
  if (days === 1) return '1 day ago';
  return `${String(days)} days ago`;
}

function formatList(sessions: readonly SessionSummary[]): string {
  const lines = sessions.map(
    (s) =>
      `  ${s.id.slice(0, 8)}  ${formatAge(s.updatedAt).padEnd(12)} ${(s.title ?? '(untitled)').slice(0, 48)}`,
  );
  return lines.join('\n');
}

/**
 * `/clean [dry|go] [days] [all]` — delete auto-named sessions that have been
 * idle past the threshold (default 7 days). Dry-run by default: `/clean go`
 * is required to actually delete, and even that asks for confirmation first.
 * Custom-named sessions and the active session are never touched.
 */
export async function handleCleanCommand(host: SlashCommandHost, args: string): Promise<void> {
  const opts = parseArgs(args);
  const cutoffMs = opts.days * 86_400_000;

  let sessions: readonly SessionSummary[];
  try {
    sessions = opts.all
      ? await host.harness.listSessions({})
      : await host.harness.listSessions({ workDir: host.state.appState.workDir });
  } catch (error) {
    host.showError(`Failed to list sessions: ${error instanceof Error ? error.message : String(error)}`);
    return;
  }

  const activeId = host.session?.id;
  const targets = sessions.filter((s) => s.id !== activeId && isCleanable(s, cutoffMs));

  if (targets.length === 0) {
    host.showStatus(
      `No cleanable sessions (auto-named and idle ≥ ${String(opts.days)} day(s)${opts.all ? '' : ` under ${host.state.appState.workDir}`}).`,
    );
    return;
  }

  const scopeLabel = opts.all ? 'all workspaces' : host.state.appState.workDir;

  if (!opts.go) {
    host.showStatus(
      `[dry-run] ${String(targets.length)} cleanable session(s) under ${scopeLabel} ` +
        `(auto-named, idle ≥ ${String(opts.days)} day(s)):\n${formatList(targets)}\n` +
        'Run /clean go to delete them.',
    );
    return;
  }

  host.mountEditorReplacement(
    new ChoicePickerComponent({
      title: `Delete ${String(targets.length)} auto-named session(s) (idle ≥ ${String(opts.days)}d)?`,
      hint: '↑↓ navigate · Enter confirm · Esc cancel',
      options: [
        { value: 'delete', label: 'Yes, delete them' },
        { value: 'cancel', label: 'No' },
      ],
      onSelect: (value) => {
        void executeClean(host, targets, value === 'delete');
      },
      onCancel: () => {
        host.restoreEditor();
        host.showStatus('Clean cancelled.');
      },
    }),
  );
}

async function executeClean(
  host: SlashCommandHost,
  targets: readonly SessionSummary[],
  confirmed: boolean,
): Promise<void> {
  host.restoreEditor();
  if (!confirmed) {
    host.showStatus('Clean cancelled.');
    return;
  }

  let deleted = 0;
  let failed = 0;
  for (const summary of targets) {
    try {
      await host.harness.deleteSession(summary.id);
      deleted += 1;
    } catch {
      failed += 1;
    }
  }

  const lines = [`Deleted ${String(deleted)} session(s).`];
  if (failed > 0) lines.push(`Failed to delete ${String(failed)} session(s).`);
  lines.push('Run /sessions to refresh the list.');
  host.showStatus(lines.join('\n'), failed > 0 ? 'warning' : 'success');
}
