/**
 * Findings store — minimal stub to satisfy existing imports.
 *
 * NOTE: This module was referenced by todo-list.ts and findings-injector but
 * was missing from the working tree. A full implementation should be restored
 * from the original feature branch.
 */

export const FINDINGS_STORE_KEY = 'findings' as const;

declare module '../../store' {
  interface ToolStoreData {
    [FINDINGS_STORE_KEY]: FindingItem[];
  }
}

export interface FindingItem {
  readonly id: string;
  readonly question: string;
  readonly conclusion: string;
  readonly status: 'resolved' | 'inconclusive';
}
