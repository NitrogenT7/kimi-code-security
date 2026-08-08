import { describe, expect, it, vi } from 'vitest';

import {
  drainPendingModelSwitch,
  performModelSwitch,
} from '#/tui/commands/config';
import type { SlashCommandHost } from '#/tui/commands/dispatch';
import type { PendingModelSwitch } from '#/tui/tui-state';

function makeHost(options: { streamingPhase?: string; statusModel?: string } = {}) {
  const session = {
    setModel: vi.fn(async () => ({})),
    setThinking: vi.fn(async () => ({})),
    getStatus: vi.fn(async () => ({
      model: options.statusModel ?? 'new-model',
      thinkingEffort: 'high',
    })),
  };
  const host = {
    state: {
      appState: {
        streamingPhase: options.streamingPhase ?? 'idle',
        model: 'old-model',
        thinkingEffort: 'low',
        availableModels: {},
      },
      pendingModelSwitch: undefined as PendingModelSwitch | undefined,
    },
    session,
    setAppState: vi.fn(),
    showError: vi.fn(),
    showStatus: vi.fn(),
    track: vi.fn(),
  } as unknown as SlashCommandHost & {
    state: { pendingModelSwitch: PendingModelSwitch | undefined };
    session: typeof session;
  };
  return { host, session };
}

describe('performModelSwitch', () => {
  it('queues the switch while streaming instead of erroring', async () => {
    const { host, session } = makeHost({ streamingPhase: 'composing' });

    await performModelSwitch(host, 'new-model', 'high', false);

    expect(host.state.pendingModelSwitch).toEqual({
      alias: 'new-model',
      effort: 'high',
      persist: false,
    });
    expect(session.setModel).not.toHaveBeenCalled();
    expect(session.setThinking).not.toHaveBeenCalled();
    expect(host.showError).not.toHaveBeenCalled();
    expect(host.showStatus).toHaveBeenCalledWith(
      expect.stringContaining('when the turn finishes'),
    );
  });

  it('keeps only the latest selection while streaming', async () => {
    const { host } = makeHost({ streamingPhase: 'waiting' });

    await performModelSwitch(host, 'model-a', 'low', false);
    await performModelSwitch(host, 'model-b', 'max', true);

    expect(host.state.pendingModelSwitch).toEqual({
      alias: 'model-b',
      effort: 'max',
      persist: true,
    });
  });

  it('applies immediately when idle', async () => {
    const { host, session } = makeHost({ streamingPhase: 'idle' });

    await performModelSwitch(host, 'new-model', 'high', false);

    expect(session.setModel).toHaveBeenCalledWith('new-model');
    expect(session.setThinking).toHaveBeenCalledWith('high');
    expect(host.state.pendingModelSwitch).toBeUndefined();
  });
});

describe('drainPendingModelSwitch', () => {
  it('applies the queued switch before running proceed', async () => {
    const { host, session } = makeHost();
    let resolveSetModel!: () => void;
    session.setModel.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveSetModel = () => resolve({});
        }) as never,
    );
    host.state.pendingModelSwitch = { alias: 'queued-model', effort: 'high', persist: false };
    const proceed = vi.fn();

    drainPendingModelSwitch(host, proceed);

    // The queued switch is claimed synchronously and proceed waits for it.
    expect(host.state.pendingModelSwitch).toBeUndefined();
    expect(proceed).not.toHaveBeenCalled();

    resolveSetModel();
    await vi.waitFor(() => {
      expect(proceed).toHaveBeenCalledTimes(1);
    });
    expect(session.setModel).toHaveBeenCalledWith('queued-model');
    expect(proceed).toHaveBeenCalledTimes(1);
  });

  it('only runs proceed when nothing is queued', () => {
    const { host, session } = makeHost();
    const proceed = vi.fn();

    drainPendingModelSwitch(host, proceed);

    expect(proceed).toHaveBeenCalledTimes(1);
    expect(session.setModel).not.toHaveBeenCalled();
  });
});
