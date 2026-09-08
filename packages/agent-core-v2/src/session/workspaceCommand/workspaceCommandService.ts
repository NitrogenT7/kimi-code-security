/**
 * `workspaceCommand` domain (L6) — `ISessionWorkspaceCommandService` implementation.
 *
 * Coordinates session-level workspace mutations: resolves and persists
 * workspace-local config through `workspaceLocalConfig`, updates
 * `workspaceContext`, and mirrors command output into the main agent through
 * `agentLifecycle` and `contextMemory`. Bound at Session scope.
 */

import { isAbsolute } from 'node:path';

import { InstantiationType } from '#/_base/di/extensions';
import { IInstantiationService } from '#/_base/di/instantiation';
import { Disposable } from '#/_base/di/lifecycle';
import { LifecycleScope, registerScopedService } from '#/_base/di/scope';
import { IAgentContextMemoryService } from '#/agent/contextMemory/contextMemory';
import type { ContextMessage } from '#/agent/contextMemory/types';
import { IWorkspaceLocalConfigService } from '#/app/workspaceLocalConfig/workspaceLocalConfig';
import { IHostFileSystem } from '#/os/interface/hostFileSystem';
import { IAgentLifecycleService, MAIN_AGENT_ID } from '#/session/agentLifecycle/agentLifecycle';
import { ISessionMetadata } from '#/session/sessionMetadata/sessionMetadata';
import { ISessionWorkspaceContext } from '#/session/workspaceContext/workspaceContext';

import {
  type AddAdditionalDirInput,
  type ChangeWorkDirInput,
  type ChangeWorkDirResult,
  ISessionWorkspaceCommandService,
  type WorkspaceAdditionalDirsResult,
} from './workspaceCommand';

export class SessionWorkspaceCommandService
  extends Disposable
  implements ISessionWorkspaceCommandService
{
  declare readonly _serviceBrand: undefined;
  private readonly pendingMainInjections: ContextMessage[] = [];
  private mutationQueue: Promise<void> = Promise.resolve();

  constructor(
    @IWorkspaceLocalConfigService
    private readonly localConfig: IWorkspaceLocalConfigService,
    @ISessionWorkspaceContext private readonly workspace: ISessionWorkspaceContext,
    @IAgentLifecycleService private readonly agents: IAgentLifecycleService,
    @IHostFileSystem private readonly hostFs: IHostFileSystem,
    @ISessionMetadata private readonly metadata: ISessionMetadata,
    @IInstantiationService private readonly instantiation: IInstantiationService,
  ) {
    super();
    this._register(
      this.agents.onDidCreate((handle) => {
        if (handle.id !== MAIN_AGENT_ID) return;
        if (this.pendingMainInjections.length === 0) return;
        const pending = this.pendingMainInjections.splice(0);
        handle.accessor.get(IAgentContextMemoryService).append(...pending);
      }),
    );
  }

  async addAdditionalDir(input: AddAdditionalDirInput): Promise<WorkspaceAdditionalDirsResult> {
    return this.enqueueMutation(() => this.applyAddAdditionalDir(input));
  }

  async changeWorkDir(input: ChangeWorkDirInput): Promise<ChangeWorkDirResult> {
    return this.enqueueMutation(() => this.applyChangeWorkDir(input));
  }

  private async applyChangeWorkDir(input: ChangeWorkDirInput): Promise<ChangeWorkDirResult> {
    if (!isAbsolute(input.path)) {
      throw new Error(`/cd requires an absolute path, got: ${input.path}`);
    }
    let stat: Awaited<ReturnType<IHostFileSystem['stat']>>;
    try {
      stat = await this.hostFs.stat(input.path);
    } catch {
      throw new Error(`Directory does not exist: ${input.path}`);
    }
    if (!stat.isDirectory) {
      throw new Error(`Not a directory: ${input.path}`);
    }
    const previousWorkDir = this.workspace.workDir;
    this.workspace.setWorkDir(input.path);
    let persisted = false;
    if (input.persist === true) {
      // Rewrite the session's bound directory so close/resume reopens here
      // (resume reads the persisted `cwd` ahead of the workspace root).
      await this.metadata.update({ cwd: this.workspace.workDir });
      persisted = true;
    }
    this.injectWorkDirChanged(previousWorkDir, this.workspace.workDir, persisted);
    return { workDir: this.workspace.workDir, previousWorkDir, persisted };
  }

  private async applyAddAdditionalDir(
    input: AddAdditionalDirInput,
  ): Promise<WorkspaceAdditionalDirsResult> {
    const persist = input.persist ?? true;

    if (persist) {
      const persisted = await this.localConfig.appendAdditionalDir(
        this.workspace.workDir,
        input.path,
      );
      this.workspace.setAdditionalDirs([
        ...this.workspace.additionalDirs,
        ...persisted.additionalDirs,
      ]);
      this.injectAdditionalDirAdded(input.path, true, persisted.configPath);
      return {
        projectRoot: persisted.projectRoot,
        configPath: persisted.configPath,
        additionalDirs: this.workspace.additionalDirs,
        persisted: true,
      };
    }

    const workspace = await this.localConfig.readAdditionalDirs(this.workspace.workDir);
    const resolved = await this.localConfig.resolveAdditionalDirs(this.workspace.workDir, [
      input.path,
    ]);
    this.workspace.setAdditionalDirs([...this.workspace.additionalDirs, ...resolved]);
    // v1 parity: session-only dirs survive close/resume through the session's
    // persisted metadata (`state.json`), not the workspace-local config.
    const metadata = this.instantiation.invokeFunction((accessor) =>
      accessor.get(ISessionMetadata),
    );
    const previous = (await metadata.read()).additionalDirs ?? [];
    const nextSessionDirs = [...new Set([...previous, ...resolved])];
    await metadata.update({ additionalDirs: nextSessionDirs });
    this.injectAdditionalDirAdded(input.path, false, workspace.configPath);
    return {
      projectRoot: workspace.projectRoot,
      configPath: workspace.configPath,
      additionalDirs: this.workspace.additionalDirs,
      persisted: false,
    };
  }

  private enqueueMutation<T>(work: () => Promise<T>): Promise<T> {
    const run = this.mutationQueue.then(work, work);
    this.mutationQueue = run.then(() => undefined, () => undefined);
    return run;
  }

  private injectAdditionalDirAdded(path: string, persisted: boolean, configPath: string): void {
    const stdout = persisted
      ? `Added workspace directory:\n  ${path}\n  Saved to:\n  ${configPath}`
      : `Added workspace directory:\n  ${path}\n  For this session only`;
    const text = `<local-command-stdout>\n${stdout.trim()}\n</local-command-stdout>`;
    const message: ContextMessage = {
      role: 'user',
      content: [{ type: 'text', text }],
      toolCalls: [],
      origin: { kind: 'injection', variant: 'local-command-stdout' },
    };

    const main = this.agents.get(MAIN_AGENT_ID);
    if (main !== undefined) {
      main.accessor.get(IAgentContextMemoryService).append(message);
      return;
    }
    this.pendingMainInjections.push(message);
  }

  private injectWorkDirChanged(previousWorkDir: string, workDir: string, persisted: boolean): void {
    const suffix = persisted ? '\nBinding persisted: the session reopens in this directory.' : '';
    const stdout = `Changed working directory:\n  ${previousWorkDir}\n  →\n  ${workDir}${suffix}`;
    const text = `<local-command-stdout>\n${stdout}\n</local-command-stdout>`;
    const message: ContextMessage = {
      role: 'user',
      content: [{ type: 'text', text }],
      toolCalls: [],
      origin: { kind: 'injection', variant: 'local-command-stdout' },
    };

    const main = this.agents.get(MAIN_AGENT_ID);
    if (main !== undefined) {
      main.accessor.get(IAgentContextMemoryService).append(message);
      return;
    }
    this.pendingMainInjections.push(message);
  }
}

registerScopedService(
  LifecycleScope.Session,
  ISessionWorkspaceCommandService,
  SessionWorkspaceCommandService,
  InstantiationType.Eager,
  'workspaceCommand',
);
