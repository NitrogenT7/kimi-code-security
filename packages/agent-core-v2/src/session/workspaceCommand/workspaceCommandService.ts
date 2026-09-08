import { isAbsolute } from 'node:path';

import { Service } from '#/_base/di/service';
import { LifecycleScope } from '#/app/scopes';
import { ScopeActivation, registerScopedService } from '#/_base/di/scope';
import { IAgentContextMemoryService } from '#/agent/contextMemory/contextMemory';
import type { ContextMessage } from '#/agent/contextMemory/types';
import { ErrorCodes, Error2 } from '#/errors';
import { IHostFileSystem } from '#/os/interface/hostFileSystem';
import { IAgentLifecycleService, MAIN_AGENT_ID } from '#/session/agentLifecycle/agentLifecycle';
import { ISessionMetadata } from '#/session/sessionMetadata/sessionMetadata';
import { ISessionWorkspaceContext } from '#/session/workspaceContext/workspaceContext';

import {
  type ChangeWorkDirInput,
  type ChangeWorkDirResult,
  ISessionWorkspaceCommandService,
} from './workspaceCommand';

export class SessionWorkspaceCommandService extends Service implements ISessionWorkspaceCommandService {
  declare readonly _serviceBrand: undefined;
  private readonly pendingMainInjections: ContextMessage[] = [];
  private mutationQueue: Promise<void> = Promise.resolve();

  constructor(
    @ISessionWorkspaceContext private readonly workspace: ISessionWorkspaceContext,
    @IAgentLifecycleService private readonly agents: IAgentLifecycleService,
    @IHostFileSystem private readonly hostFs: IHostFileSystem,
    @ISessionMetadata private readonly metadata: ISessionMetadata,
  ) {
    super();
    this._register(
      this.agents.onDidCreateScope((event) => {
        if (event.handle.id !== MAIN_AGENT_ID) return;
        if (this.pendingMainInjections.length === 0) return;
        const pending = this.pendingMainInjections.splice(0);
        event.handle.accessor.get(IAgentContextMemoryService).append(...pending);
      }),
    );
  }

  async changeWorkDir(input: ChangeWorkDirInput): Promise<ChangeWorkDirResult> {
    return this.enqueueMutation(() => this.applyChangeWorkDir(input));
  }

  private async applyChangeWorkDir(input: ChangeWorkDirInput): Promise<ChangeWorkDirResult> {
    if (!isAbsolute(input.path)) {
      throw new Error2(ErrorCodes.REQUEST_INVALID, `/cd requires an absolute path, got: ${input.path}`);
    }
    let stat: Awaited<ReturnType<IHostFileSystem['stat']>>;
    try {
      stat = await this.hostFs.stat(input.path);
    } catch {
      throw new Error2(ErrorCodes.REQUEST_INVALID, `Directory does not exist: ${input.path}`);
    }
    if (!stat.isDirectory) {
      throw new Error2(ErrorCodes.REQUEST_INVALID, `Not a directory: ${input.path}`);
    }
    const previousWorkDir = this.workspace.workDir;
    this.workspace.setWorkDir(input.path);
    let persisted = false;
    if (input.persist === true) {
      await this.metadata.update({ cwd: this.workspace.workDir });
      persisted = true;
    }
    this.injectWorkDirChanged(previousWorkDir, this.workspace.workDir, persisted);
    return { workDir: this.workspace.workDir, previousWorkDir, persisted };
  }

  private enqueueMutation<T>(work: () => Promise<T>): Promise<T> {
    const run = this.mutationQueue.then(work, work);
    this.mutationQueue = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
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

    const main = this.agents.handleOf(MAIN_AGENT_ID);
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
  ScopeActivation.OnScopeCreated,
  'workspaceCommand',
);
