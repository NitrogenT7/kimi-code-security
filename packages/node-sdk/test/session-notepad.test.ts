import { describe, expect, it, vi } from 'vitest';

import { Session } from '#/session';
import type { SDKRpcClientBase } from '#/rpc';

function makeSession() {
  const rpc = {
    getNotepad: vi.fn(async () => 'scratch notes'),
    setNotepad: vi.fn(async () => undefined),
    clearSessionHandlers: vi.fn(),
  } as unknown as SDKRpcClientBase;
  const session = new Session({ id: 'ses_notepad', workDir: '/tmp/work', rpc });
  return { session, rpc };
}

describe('Session notepad methods', () => {
  it('getNotepad forwards sessionId and returns the content', async () => {
    const { session, rpc } = makeSession();
    const content = await session.getNotepad();
    expect(rpc.getNotepad).toHaveBeenCalledWith({ sessionId: 'ses_notepad' });
    expect(content).toBe('scratch notes');
  });

  it('setNotepad forwards sessionId and the new content', async () => {
    const { session, rpc } = makeSession();
    await session.setNotepad('next notes');
    expect(rpc.setNotepad).toHaveBeenCalledWith({
      sessionId: 'ses_notepad',
      content: 'next notes',
    });
  });
});
