import { describe, expect, it, vi } from 'vitest';

import { AuthFlowController, type AuthFlowHost } from '#/tui/controllers/auth-flow';
import type { Session } from '@moonshot-ai/kimi-code-sdk';

type MockedHost = AuthFlowHost & {
  setAppState: ReturnType<typeof vi.fn>;
  setSession: ReturnType<typeof vi.fn>;
  syncRuntimeState: ReturnType<typeof vi.fn>;
  closeSession: ReturnType<typeof vi.fn>;
  appendStartupNotice: ReturnType<typeof vi.fn>;
};

function makeHost(overrides: Record<string, unknown> = {}): MockedHost {
  const session = { id: 'session-live-1' } as unknown as Session;
  const base = {
    state: {
      appState: {
        workDir: '/repo',
        additionalDirs: [],
        sessionTitle: 'my session',
        resumedAfterLoginId: undefined,
        resumedAfterLoginTitle: undefined,
      },
    },
    session,
    harness: {
      resumeSession: vi.fn(async () => {
        throw new Error('nope');
      }),
      createSession: vi.fn(async () => ({ id: 'session-fresh-1', summary: { title: 'fresh' } })),
    },
    options: { startup: { auto: false, yolo: false, plan: false } },
    setAppState: vi.fn(),
    setStartupReady: vi.fn(),
    resetSessionRuntime: vi.fn(),
    setSession: vi.fn(),
    syncRuntimeState: vi.fn(),
    closeSession: vi.fn(),
    appendStartupNotice: vi.fn(),
    sessionEventHandler: { startSubscription: vi.fn() },
    fetchSessions: vi.fn(),
    updateTerminalTitle: vi.fn(),
    refreshSkillCommands: vi.fn(),
    refreshPluginCommands: vi.fn(),
  };
  return Object.assign(base as unknown as MockedHost, overrides);
}

describe('AuthFlowController logout/login session continuity', () => {
  it('activateModelAfterLogin resumes the remembered session and mirrors fresh-session setup', async () => {
    const resumed = {
      id: 'session-remembered-1',
      summary: { title: 'my session' },
      setModel: vi.fn(),
      setThinking: vi.fn(),
    } as unknown as Session;
    const host = makeHost({
      session: undefined,
      harness: {
        resumeSession: vi.fn(async () => resumed),
        createSession: vi.fn(),
      },
    });
    host.state.appState.resumedAfterLoginId = 'session-remembered-1';
    const controller = new AuthFlowController(host);

    await controller.activateModelAfterLogin('k3', 'max');

    expect(host.harness.resumeSession).toHaveBeenCalledWith({ id: 'session-remembered-1' });
    expect(host.setSession).toHaveBeenCalledWith(resumed);
    expect(resumed.setModel).toHaveBeenCalledWith('k3');
    expect(resumed.setThinking).toHaveBeenCalledWith('max');
    // Fresh-session tail: state sync, subscription, title, skill/plugin refresh.
    expect(host.syncRuntimeState).toHaveBeenCalledWith(resumed);
    expect(host.sessionEventHandler.startSubscription).toHaveBeenCalled();
    expect(host.updateTerminalTitle).toHaveBeenCalled();
    expect(host.refreshSkillCommands).toHaveBeenCalledWith(host.session);
    expect(host.refreshPluginCommands).toHaveBeenCalledWith(host.session);
    expect(host.setAppState).toHaveBeenCalledWith(
      expect.objectContaining({ resumedAfterLoginId: undefined }),
    );
    expect(host.appendStartupNotice).toHaveBeenCalledWith(
      expect.stringContaining('Previous session restored'),
    );
    // No fresh session was created.
    expect(host.harness.createSession).not.toHaveBeenCalled();
  });

  it('falls back to a fresh session when the remembered one is gone', async () => {
    const host = makeHost({ session: undefined });
    host.state.appState.resumedAfterLoginId = 'session-deleted';
    const controller = new AuthFlowController(host);

    await controller.activateModelAfterLogin('k3');

    expect(host.appendStartupNotice).toHaveBeenCalledWith(
      expect.stringContaining('Could not restore the previous session'),
    );
    expect(host.harness.createSession).toHaveBeenCalledWith(
      expect.objectContaining({ workDir: '/repo', model: 'k3' }),
    );
    expect(host.setSession).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'session-fresh-1' }),
    );
    expect(host.sessionEventHandler.startSubscription).toHaveBeenCalled();
  });

  it('clearActiveSessionAfterLogout remembers the closed session for the next login', async () => {
    const host = makeHost();
    const controller = new AuthFlowController(host);

    await controller.clearActiveSessionAfterLogout();

    expect(host.closeSession).toHaveBeenCalledWith('logged out');
    expect(host.setAppState).toHaveBeenCalledWith(
      expect.objectContaining({
        resumedAfterLoginId: 'session-live-1',
        resumedAfterLoginTitle: 'my session',
        sessionId: '',
      }),
    );
  });
});
