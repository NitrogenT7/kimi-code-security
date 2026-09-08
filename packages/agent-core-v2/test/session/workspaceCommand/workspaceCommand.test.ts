import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Emitter, type Event } from '#/_base/event';
import { DisposableStore } from '#/_base/di/lifecycle';
import { type ServiceIdentifier } from '#/_base/di/instantiation';
import type { IAgentScopeHandle } from '#/_base/di/scope';
import { LifecycleScope } from '#/app/scopes';
import { createServices, type TestInstantiationService } from '#/_base/di/test';
import { IAgentContextMemoryService } from '#/agent/contextMemory/contextMemory';
import type { AgentContext } from '#/agent/agentContext/agentContext';
import { stubContextMemory, type StubContextMemory } from '../../agent/contextMemory/stubs';
import { stubAgentContext } from '../../agent/agentContext/stubs';
import { HostFileSystem } from '#/os/backends/node-local/hostFsService';
import { IHostFileSystem } from '#/os/interface/hostFileSystem';
import {
  IAgentLifecycleService,
  MAIN_AGENT_ID,
  type AgentScopeCreatedEvent,
} from '#/session/agentLifecycle/agentLifecycle';
import {
  ISessionContext,
  makeSessionContext,
} from '#/session/sessionContext/sessionContext';
import {
  ISessionMetadata,
  type SessionMeta,
  type SessionMetadataChangedEvent,
} from '#/session/sessionMetadata/sessionMetadata';
import { ISessionStateService } from '#/session/state/sessionState';
import { SessionStateService } from '#/session/state/sessionStateService';
import { ISessionWorkspaceCommandService } from '#/session/workspaceCommand/workspaceCommand';
import { SessionWorkspaceCommandService } from '#/session/workspaceCommand/workspaceCommandService';
import { ISessionWorkspaceContext } from '#/session/workspaceContext/workspaceContext';
import { SessionWorkspaceContextService } from '#/session/workspaceContext/workspaceContextService';
import { ISessionWorkspaceInfo } from '#/session/workspaceInfo/workspaceInfo';

interface AgentsStub extends IAgentLifecycleService {
  readonly mainContext: StubContextMemory;
  setMain(present: boolean): void;
}

function agentsStub(): AgentsStub {
  const mainContext = stubContextMemory();
  let mainPresent = false;
  const createdScope = new Emitter<AgentScopeCreatedEvent>();

  const mainHandle: IAgentScopeHandle = {
    id: MAIN_AGENT_ID,
    kind: LifecycleScope.Agent,
    accessor: {
      get: <T>(id: ServiceIdentifier<T>): T => {
        if (id === IAgentContextMemoryService) return mainContext as unknown as T;
        throw new Error(`unexpected service on main handle: ${String(id)}`);
      },
    },
    dispose: () => {},
  };

  return {
    _serviceBrand: undefined,
    mainContext,
    onDidCreate: () => ({ dispose: () => {} }),
    onDidCreateScope: createdScope.event,
    onWillClose: () => ({ dispose: () => {} }),
    onDidClose: () => ({ dispose: () => {} }),
    create: () => Promise.reject(new Error('not implemented')),
    fork: () => Promise.reject(new Error('not implemented')),
    get: (id: string): AgentContext | undefined =>
      id === MAIN_AGENT_ID && mainPresent ? stubAgentContext(id) : undefined,
    list: () => [],
    broadcastPermissionMode: () => {},
    remove: () => Promise.resolve(),
    handleOf: (id: string): IAgentScopeHandle | undefined =>
      id === MAIN_AGENT_ID && mainPresent ? mainHandle : undefined,
    adopt: () => {
      throw new Error('not implemented');
    },
    setMain: (present: boolean) => {
      mainPresent = present;
      if (present) {
        createdScope.fire({ context: stubAgentContext(MAIN_AGENT_ID), handle: mainHandle });
      }
    },
  };
}

function metadataStub(cwd: string): ISessionMetadata {
  let data: SessionMeta = {
    id: 'session-under-test',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    archived: false,
    cwd,
  };
  return {
    _serviceBrand: undefined,
    get ready(): Promise<void> {
      return Promise.resolve();
    },
    get onDidChangeMetadata(): Event<SessionMetadataChangedEvent> {
      return () => ({ dispose: () => {} });
    },
    async read() {
      return data;
    },
    async update(patch) {
      data = { ...data, ...patch, updatedAt: Date.now() };
    },
    async setTitle(title) {
      data = { ...data, title, titleKind: 'custom' };
    },
    async setGeneratedTitleIfUncustomized(title) {
      if (data.titleKind === 'custom') return false;
      data = { ...data, title, titleKind: 'generated' };
      return true;
    },
    async setArchived(archived) {
      data = { ...data, archived };
    },
    async registerAgent() {},
  };
}

function workspaceInfoStub(): ISessionWorkspaceInfo {
  return {
    _serviceBrand: undefined,
    ready: Promise.resolve(),
    additionalDirs: [],
    onDidChange: () => ({ dispose: () => {} }),
  };
}

interface Harness {
  readonly svc: ISessionWorkspaceCommandService;
  readonly agents: AgentsStub;
  readonly workspace: ISessionWorkspaceContext;
  readonly meta: ISessionMetadata;
  readonly workDir: string;
  readonly otherDir: string;
}

describe('SessionWorkspaceCommandService', () => {
  let disposables: DisposableStore;
  let ix: TestInstantiationService;
  let root: string;

  beforeEach(() => {
    disposables = new DisposableStore();
  });

  afterEach(async () => {
    disposables.dispose();
    if (root !== undefined) {
      await rm(root, { recursive: true, force: true });
    }
  });

  async function build(mainPresent: boolean): Promise<Harness> {
    root = await mkdtemp(join(tmpdir(), 'kimi-wscmd-'));
    const workDir = join(root, 'work');
    const otherDir = join(root, 'other');
    await mkdir(workDir);
    await mkdir(otherDir);

    const agents = agentsStub();
    const ctx = makeSessionContext({
      sessionId: 'ses',
      workspaceId: 'ws',
      sessionDir: join(root, 'sessions', 'ws', 'ses'),
      sessionScope: 'sessions/ws/ses',
      cwd: workDir,
    });

    ix = createServices(disposables, {
      additionalServices: (reg) => {
        reg.defineInstance(ISessionContext, ctx);
        reg.define(ISessionStateService, SessionStateService);
        reg.defineInstance(ISessionWorkspaceInfo, workspaceInfoStub());
        reg.define(ISessionWorkspaceContext, SessionWorkspaceContextService);
        reg.defineInstance(IHostFileSystem, new HostFileSystem());
        reg.defineInstance(IAgentLifecycleService, agents);
        reg.defineInstance(ISessionMetadata, metadataStub(workDir));
        reg.define(ISessionWorkspaceCommandService, SessionWorkspaceCommandService);
      },
    });

    const workspace = ix.get(ISessionWorkspaceContext);
    const svc = ix.get(ISessionWorkspaceCommandService);
    const meta = ix.get(ISessionMetadata);
    agents.setMain(mainPresent);
    return { svc, agents, workspace, meta, workDir, otherDir };
  }

  describe('changeWorkDir', () => {
    it('switches the workspace workDir to an absolute existing directory', async () => {
      const { svc, workspace, agents, workDir, otherDir } = await build(true);

      const result = await svc.changeWorkDir({ path: otherDir });

      expect(result.previousWorkDir).toBe(workDir);
      expect(result.workDir).toBe(otherDir);
      expect(workspace.workDir).toBe(otherDir);
      expect(workspace.isWithin(join(otherDir, 'file.txt'))).toBe(true);
      expect(workspace.isWithin(join(workDir, 'file.txt'))).toBe(false);

      expect(agents.mainContext.messages).toHaveLength(1);
      expect(agents.mainContext.messages[0]?.content).toEqual([
        {
          type: 'text',
          text: `<local-command-stdout>\nChanged working directory:\n  ${workDir}\n  →\n  ${otherDir}\n</local-command-stdout>`,
        },
      ]);
      expect(agents.mainContext.messages[0]?.origin).toEqual({
        kind: 'injection',
        variant: 'local-command-stdout',
      });
    });

    it('rejects a relative path without touching the workspace', async () => {
      const { svc, workspace, agents } = await build(true);

      await expect(svc.changeWorkDir({ path: 'other' })).rejects.toThrow(
        '/cd requires an absolute path',
      );
      expect(workspace.workDir).not.toContain('other');
      expect(agents.mainContext.messages).toHaveLength(0);
    });

    it('rejects a path that does not exist', async () => {
      const { svc, workspace, workDir } = await build(true);
      const missing = join(root, 'missing');

      await expect(svc.changeWorkDir({ path: missing })).rejects.toThrow(
        `Directory does not exist: ${missing}`,
      );
      expect(workspace.workDir).toBe(workDir);
    });

    it('rejects a path that is a file, not a directory', async () => {
      const { svc, workspace, workDir } = await build(true);
      const afile = join(root, 'afile');
      await writeFile(afile, 'x');

      await expect(svc.changeWorkDir({ path: afile })).rejects.toThrow(
        `Not a directory: ${afile}`,
      );
      expect(workspace.workDir).toBe(workDir);
    });

    it('persists the new binding into session metadata when persist is set', async () => {
      const { svc, workspace, agents, meta, otherDir } = await build(true);

      const result = await svc.changeWorkDir({ path: otherDir, persist: true });

      expect(result.persisted).toBe(true);
      expect(workspace.workDir).toBe(otherDir);
      expect((await meta.read()).cwd).toBe(otherDir);
      expect(agents.mainContext.messages[0]?.content).toEqual([
        {
          type: 'text',
          text: expect.stringContaining('Binding persisted'),
        },
      ]);
    });

    it('leaves the persisted binding untouched without persist', async () => {
      const { svc, meta, workDir, otherDir } = await build(true);

      const result = await svc.changeWorkDir({ path: otherDir });

      expect(result.persisted).toBe(false);
      expect((await meta.read()).cwd).toBe(workDir);
    });

    it('queues the injection until the main agent is created', async () => {
      const { svc, agents, otherDir } = await build(false);

      await svc.changeWorkDir({ path: otherDir });
      expect(agents.mainContext.messages).toHaveLength(0);

      agents.setMain(true);

      expect(agents.mainContext.messages).toHaveLength(1);
      expect(agents.mainContext.messages[0]?.content[0]).toMatchObject({
        type: 'text',
        text: expect.stringContaining('Changed working directory:'),
      });
    });
  });
});
