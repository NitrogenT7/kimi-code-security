/**
 * `sessionNotepadService` — the session-shared notepad. Mirrors
 * `agent-core-v2/session/notepad/sessionNotepad.ts`. The `onDidChange` event
 * is excluded (not a wire method).
 */

import { z } from 'zod';

import { noResult } from '../helpers.js';
import type { ServiceContract } from '../types.js';

export const sessionNotepadContract = {
  getContent: { input: z.tuple([]), output: z.string() },
  setContent: { input: z.tuple([z.string()]), output: noResult },
  append: { input: z.tuple([z.string()]), output: noResult },
  clear: { input: z.tuple([]), output: noResult },
} satisfies ServiceContract;
