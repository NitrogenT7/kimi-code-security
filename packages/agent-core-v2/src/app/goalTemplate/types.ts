/**
 * `goalTemplate` domain (L3) — goal template models.
 *
 * A goal template is a markdown file with frontmatter (`name`, `description`,
 * `purpose`, `keyTasks`, `endState`, `constraints`) plus an optional free-form
 * body, discovered from the project `.goal/` directory and the user goal
 * directories (`~/.goal/`, `~/.agents/goals/`). Applying a template composes a
 * four-element commander's-intent objective (`[Purpose]` / `[Key Tasks]` /
 * `[End State]` / `[Constraints]`).
 */

export type GoalTemplateSource = 'project' | 'user';

export interface GoalTemplate {
  readonly name: string;
  readonly description: string;
  readonly path: string;
  readonly source: GoalTemplateSource;
  readonly purpose?: string;
  readonly keyTasks?: string;
  readonly endState?: string;
  readonly constraints?: string;
  /** Optional free-form body after the frontmatter. */
  readonly body?: string;
}

export interface GoalTemplateSummary {
  readonly name: string;
  readonly description: string;
  readonly path: string;
  readonly source: GoalTemplateSource;
}

export interface GoalTemplateDetail extends GoalTemplateSummary {
  readonly purpose?: string;
  readonly keyTasks?: string;
  readonly endState?: string;
  readonly constraints?: string;
  readonly body?: string;
}
