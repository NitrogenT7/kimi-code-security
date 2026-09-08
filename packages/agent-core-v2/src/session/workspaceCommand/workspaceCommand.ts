/**
 * `workspaceCommand` domain (L6) — workspace mutation command contract.
 *
 * Defines the `ISessionWorkspaceCommandService` that orchestrates session-level
 * workspace mutations (`addAdditionalDir`): persisting workspace-local config
 * when asked, updating `ISessionWorkspaceContext`, and mirroring the
 * action's stdout into the main agent's context as a `local-command-stdout`
 * injection so the agent observes the change. Session-scoped.
 */

import { createDecorator, type ServiceIdentifier } from '#/_base/di/instantiation';

export interface AddAdditionalDirInput {
  readonly path: string;
  readonly persist?: boolean;
}

export interface WorkspaceAdditionalDirsResult {
  readonly projectRoot: string;
  readonly configPath: string;
  readonly additionalDirs: readonly string[];
  readonly persisted: boolean;
}

export interface ChangeWorkDirInput {
  readonly path: string;
  /**
   * When true, the new directory is also written to the session's persisted
   * metadata (`state.json` `cwd`/`workDir`), so close/resume reopens the
   * session bound to the new directory instead of the original one.
   */
  readonly persist?: boolean;
}

export interface ChangeWorkDirResult {
  readonly workDir: string;
  readonly previousWorkDir: string;
  readonly persisted: boolean;
}

export interface ISessionWorkspaceCommandService {
  readonly _serviceBrand: undefined;

  addAdditionalDir(input: AddAdditionalDirInput): Promise<WorkspaceAdditionalDirsResult>;

  changeWorkDir(input: ChangeWorkDirInput): Promise<ChangeWorkDirResult>;
}

export const ISessionWorkspaceCommandService: ServiceIdentifier<ISessionWorkspaceCommandService> =
  createDecorator<ISessionWorkspaceCommandService>('sessionWorkspaceCommandService');
