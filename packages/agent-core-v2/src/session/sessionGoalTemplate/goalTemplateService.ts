/**
 * `sessionGoalTemplate` domain (L3) — `ISessionGoalTemplateService` implementation.
 *
 * Lazily scans the session workspace's `.goal/` directory (through
 * `workspaceContext`) and the user goal directories under the OS home
 * (through `bootstrap`) into a `GoalTemplateRegistry`, caching the result
 * until `reload()`. Bound at Session scope so each session reads its own
 * workspace root.
 */

import { Disposable } from '#/_base/di/lifecycle';
import { InstantiationType } from '#/_base/di/extensions';
import { LifecycleScope, registerScopedService } from '#/_base/di/scope';
import { IBootstrapService } from '#/app/bootstrap/bootstrap';
import { GoalTemplateRegistry } from '#/app/goalTemplate/registry';
import type { GoalTemplateDetail, GoalTemplateSummary } from '#/app/goalTemplate/types';
import { ErrorCodes, Error2 } from '#/errors';
import { ISessionWorkspaceContext } from '#/session/workspaceContext/workspaceContext';

import { ISessionGoalTemplateService } from './goalTemplate';

export class SessionGoalTemplateService
  extends Disposable
  implements ISessionGoalTemplateService
{
  declare readonly _serviceBrand: undefined;

  private registry?: GoalTemplateRegistry;

  constructor(
    @ISessionWorkspaceContext private readonly workspace: ISessionWorkspaceContext,
    @IBootstrapService private readonly bootstrap: IBootstrapService,
  ) {
    super();
  }

  async listTemplates(): Promise<readonly GoalTemplateSummary[]> {
    return (await this.load()).listSummaries();
  }

  async getTemplate(name: string): Promise<GoalTemplateDetail> {
    const template = (await this.load()).getTemplate(name);
    if (template === undefined) {
      throw new Error2(
        ErrorCodes.GOAL_TEMPLATE_NOT_FOUND,
        `Goal template "${name}" not found`,
      );
    }
    return template;
  }

  async reload(): Promise<void> {
    this.registry = undefined;
    await this.load();
  }

  private async load(): Promise<GoalTemplateRegistry> {
    if (this.registry !== undefined) return this.registry;
    const registry = new GoalTemplateRegistry();
    await registry.loadRoots({
      workDir: this.workspace.workDir,
      userHomeDir: this.bootstrap.osHomeDir,
    });
    this.registry = registry;
    return registry;
  }
}

registerScopedService(
  LifecycleScope.Session,
  ISessionGoalTemplateService,
  SessionGoalTemplateService,
  InstantiationType.Eager,
  'goalTemplate',
);
