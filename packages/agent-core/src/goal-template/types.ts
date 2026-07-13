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
