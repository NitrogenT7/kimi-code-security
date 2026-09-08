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
