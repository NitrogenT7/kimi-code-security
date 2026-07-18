/**
 * `goal` domain (L4) — public goal lifecycle and budget models.
 */

export type GoalStatus = 'active' | 'paused' | 'blocked' | 'complete';

export type GoalActor = 'user' | 'model' | 'runtime' | 'system';

export interface GoalBudgetLimits {
  readonly tokenBudget?: number;
  readonly turnBudget?: number;
  readonly wallClockBudgetMs?: number;
}

export interface GoalBudgetReport {
  readonly tokenBudget: number | null;
  readonly turnBudget: number | null;
  readonly wallClockBudgetMs: number | null;
  readonly remainingTokens: number | null;
  readonly remainingTurns: number | null;
  readonly remainingWallClockMs: number | null;
  readonly tokenBudgetReached: boolean;
  readonly turnBudgetReached: boolean;
  readonly wallClockBudgetReached: boolean;
  readonly overBudget: boolean;
}

export interface GoalSnapshot {
  readonly goalId: string;
  readonly objective: string;
  readonly purpose?: string;
  readonly completionCriterion?: string;
  readonly status: GoalStatus;
  readonly turnsUsed: number;
  readonly tokensUsed: number;
  readonly wallClockMs: number;
  readonly budget: GoalBudgetReport;
  readonly terminalReason?: string;
}

export interface GoalToolResult {
  readonly goal: GoalSnapshot | null;
}

export interface GoalChangeStats {
  readonly turnsUsed: number;
  readonly tokensUsed: number;
  readonly wallClockMs: number;
}

export type GoalChangeKind = 'lifecycle' | 'completion';

export interface GoalChange {
  readonly kind: GoalChangeKind;
  readonly status?: GoalStatus;
  readonly reason?: string;
  readonly stats?: GoalChangeStats;
  readonly actor?: GoalActor;
}

export interface CreateGoalInput {
  readonly objective: string;
  readonly purpose?: string;
  readonly completionCriterion?: string;
  readonly replace?: boolean;
}

/**
 * First-turn rewrite of a lightweight goal into the four-element
 * commander's-intent format: the objective is restructured as
 * `[Purpose]` / `[Key Tasks]` / `[End State]` / `[Constraints]` and the
 * `purpose` / `completionCriterion` fields carry the extracted Purpose and
 * End State. Empty strings normalize to `undefined` (no change).
 */
export interface RewriteGoalContentInput {
  readonly objective?: string;
  readonly purpose?: string;
  readonly completionCriterion?: string;
}
