/**
 * `notepad` domain (L4) — the notepad's persisted shape and pure helpers.
 *
 * The notepad is a single free-form text buffer the model owns end to end:
 * it reads, rewrites, appends to, and clears it through the `Notepad` tool.
 * The content is persisted as a `tools.update_store` (`key: 'notepad'`) wire
 * record on the main agent (the same v1-compatible vocabulary the todo /
 * findings stores use), so it survives replay and context compaction —
 * unlike the compaction summary, which is generated once and cannot be
 * revised afterwards. Pure and scope-less — no scoped state lives here.
 */

export const NOTEPAD_STORE_KEY = 'notepad' as const;

export const NOTEPAD_TOOL_NAME = 'Notepad';

export function readNotepadContent(raw: unknown): string {
  return typeof raw === 'string' ? raw : '';
}

export function renderNotepad(content: string, title = '## Notepad'): string | undefined {
  const trimmed = content.trim();
  if (trimmed.length === 0) return undefined;
  return `${title}\n${trimmed}`;
}
