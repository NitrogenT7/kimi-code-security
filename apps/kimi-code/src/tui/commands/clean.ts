import { ChoicePickerComponent } from '../components/dialogs/choice-picker';
import type { SessionSummary } from '@moonshot-ai/kimi-code-sdk';
import type { SlashCommandHost } from './dispatch';

/** Default staleness threshold: 7 days without activity. */
const DEFAULT_DAYS = 7;

/** How many target entries to preview inside the confirmation dialog. */
const PREVIEW_LIMIT = 6;

/** How many failed ids to spell out in the result message. */
const FAILED_SAMPLE_LIMIT = 5;

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

/** Short preview (first entries + a "and K more" tail) for the confirm dialog. */
function formatPreview(sessions: readonly SessionSummary[]): string {
  const lines = sessions
    .slice(0, PREVIEW_LIMIT)
    .map(
      (s) =>
        `${s.id.slice(0, 8)}  ${formatAge(s.updatedAt)}  ${(s.title ?? '(untitled)').slice(0, 44)}`,
    );
  if (sessions.length > PREVIEW_LIMIT) {
    lines.push(`… and ${String(sessions.length - PREVIEW_LIMIT)} more`);
  }
  return lines.join('\n');
}

/**
 * `/clean [dry|go] [days] [all]` — delete auto-named sessions that have been
 * idle past the threshold (default 7 days). Dry-run by default: `/clean go`
 * is required to actually delete, and even that asks for confirmation first.
 * Custom-named sessions and the active session are never touched.
 *
 * UX: a spinner covers the scan and the delete loop (which can take a while
 * over hundreds of sessions), the confirm dialog previews what will go, and
 * the outcome lands as a persistent ✓/✗ line in the transcript.
 */
export async function handleCleanCommand(host: SlashCommandHost, args: string): Promise<void> {
  const opts = parseArgs(args);
  const cutoffMs = opts.days * 86_400_000;
  const scopeLabel = opts.all ? 'all workspaces' : host.state.appState.workDir;

  const scan = host.showProgressSpinner(`Scanning sessions (${scopeLabel})…`);
  let sessions: readonly SessionSummary[];
  try {
    sessions = opts.all
      ? await host.harness.listSessions({})
      : await host.harness.listSessions({ workDir: host.state.appState.workDir });
  } catch (error) {
    scan.stop({ ok: false, label: 'Failed to list sessions' });
    host.showError(`Failed to list sessions: ${error instanceof Error ? error.message : String(error)}`);
    return;
  }

  const activeId = host.session?.id;
  const targets = sessions.filter((s) => s.id !== activeId && isCleanable(s, cutoffMs));
  scan.stop({
    ok: true,
    label: `Found ${String(targets.length)} cleanable of ${String(sessions.length)} session(s) ` +
      `(auto-named, idle ≥ ${String(opts.days)}d, ${scopeLabel})`,
  });

  if (targets.length === 0) {
    host.showStatus(
      `No cleanable sessions (auto-named and idle ≥ ${String(opts.days)} day(s)${opts.all ? '' : ` under ${host.state.appState.workDir}`}).`,
    );
    return;
  }

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
      title: `Delete ${String(targets.length)} auto-named session(s)?`,
      hint: `scope: ${scopeLabel} · idle ≥ ${String(opts.days)}d · ↑↓ navigate · Enter confirm · Esc cancel`,
      notice: formatPreview(targets),
      noticeTone: 'warning',
      options: [
        {
          value: 'delete',
          label: `Yes, delete ${String(targets.length)} session(s)`,
          tone: 'danger',
        },
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

  const total = targets.length;
  const progress = host.showProgressSpinner(`Deleting 0/${String(total)}…`);
  let deleted = 0;
  const failedIds: string[] = [];
  for (const summary of targets) {
    try {
      await host.harness.deleteSession(summary.id);
      deleted += 1;
    } catch {
      failedIds.push(summary.id);
    }
    progress.setLabel(`Deleting ${String(deleted + failedIds.length)}/${String(total)}…`);
  }

  progress.stop({
    ok: failedIds.length === 0,
    label:
      `Deleted ${String(deleted)} session(s).` +
      (failedIds.length > 0 ? ` Failed: ${String(failedIds.length)}.` : ''),
  });

  if (failedIds.length > 0) {
    const sample = failedIds.slice(0, FAILED_SAMPLE_LIMIT).map((id) => `  ${id.slice(0, 8)}`);
    const more = failedIds.length > FAILED_SAMPLE_LIMIT
      ? `\n  … and ${String(failedIds.length - FAILED_SAMPLE_LIMIT)} more`
      : '';
    host.showStatus(`Failed to delete:\n${sample.join('\n')}${more}`, 'warning');
  }
  host.showStatus('Run /sessions to refresh the list.', failedIds.length > 0 ? 'warning' : 'success');
}
