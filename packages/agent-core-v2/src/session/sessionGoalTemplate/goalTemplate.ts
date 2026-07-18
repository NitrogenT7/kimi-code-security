/**
 * `sessionGoalTemplate` domain (L3) — Session-scoped goal template catalog contract.
 *
 * Lists and resolves goal templates discovered from the session workspace's
 * `.goal/` directory and the user goal directories (`~/.goal/`,
 * `~/.agents/goals/`). Bound at Session scope so each session reads its own
 * workspace root.
 */

import { createDecorator, type ServiceIdentifier } from '#/_base/di/instantiation';

import type { GoalTemplateDetail, GoalTemplateSummary } from '#/app/goalTemplate/types';

export interface ISessionGoalTemplateService {
  readonly _serviceBrand: undefined;

  listTemplates(): Promise<readonly GoalTemplateSummary[]>;
  getTemplate(name: string): Promise<GoalTemplateDetail>;
  reload(): Promise<void>;
}

export const ISessionGoalTemplateService: ServiceIdentifier<ISessionGoalTemplateService> =
  createDecorator<ISessionGoalTemplateService>('sessionGoalTemplate');
