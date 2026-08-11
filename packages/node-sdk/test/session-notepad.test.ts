import type * as KosongModule from '@moonshot-ai/kosong';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createKimiHarness } from '#/index';

import { makeTempDir, removeTempDirs, waitForAgentWireEvent } from './session-runtime-helpers';
import { TEST_IDENTITY } from './test-identity';

vi.mock('@moonshot-ai/kosong', async (importOriginal) => {
  const actual = await importOriginal<typeof KosongModule>();
  return {
    ...actual,
    createProvider: () => ({
      name: 'fake',
      modelName: 'fake-model',
      thinkingEffort: null,
      async generate() {
        return {
          id: 'fake-response',
          usage: {
            inputOther: 0,
            output: 1,
            inputCacheRead: 0,
            inputCacheCreation: 0,
          },
          finishReason: 'completed',
          rawFinishReason: 'stop',
          async *[Symbol.asyncIterator]() {
            yield { type: 'text', text: 'fake response' };
          },
        };
      },
      withThinking() {
        return this;
      },
    }),
  };
});

const tempDirs: string[] = [];

afterEach(async () => {
  await removeTempDirs(tempDirs);
});

describe('Session notepad', () => {
  it('round-trips notepad content through the RPC chain and logs a wire record', async () => {
    const homeDir = await makeTempDir(tempDirs, 'kimi-sdk-notepad-home-');
    const workDir = await makeTempDir(tempDirs, 'kimi-sdk-notepad-work-');
    const harness = createKimiHarness({ homeDir, identity: TEST_IDENTITY });

    try {
      const session = await harness.createSession({ id: 'ses_notepad', workDir });

      await expect(session.getNotepad()).resolves.toBe('');

      await session.setNotepad('auth endpoint uses cursor pagination');
      await expect(session.getNotepad()).resolves.toBe('auth endpoint uses cursor pagination');

      await session.setNotepad('');
      await expect(session.getNotepad()).resolves.toBe('');

      await expect(
        waitForAgentWireEvent(
          homeDir,
          session.id,
          'tools.update_store',
          (event) => event['key'] === 'notepad',
        ),
      ).resolves.toMatchObject({
        type: 'tools.update_store',
        key: 'notepad',
        value: 'auth endpoint uses cursor pagination',
      });
    } finally {
      await harness.close();
    }
  });
});
