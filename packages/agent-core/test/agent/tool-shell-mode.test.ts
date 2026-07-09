import { LocalKaos } from '@moonshot-ai/kaos';
import { beforeAll, describe, expect, it } from 'vitest';

import { testAgent } from './harness/agent';

describe('ToolManager shell mode', () => {
  let kaos: LocalKaos;

  beforeAll(async () => {
    kaos = await LocalKaos.create();
  });

  it('runs a simple foreground shell command and records output', async () => {
    const ctx = testAgent({ kaos });
    ctx.configure({ tools: ['Bash', 'TaskList', 'TaskOutput', 'TaskStop'] });
    const { agent } = ctx;
    const result = await agent.tools.runShellCommand('echo hello');
    expect(result.stdout.trim()).toBe('hello');
    expect(result.stderr).toBe('');
    expect(result.isError).toBeFalsy();

    const data = agent.context.data();
    const last = data.history.at(-1);
    expect(last?.role).toBe('user');
    expect(last?.origin?.kind).toBe('shell_command');
    expect((last?.origin as { phase?: string }).phase).toBe('output');
  });

  it('cancels a running shell command', async () => {
    const ctx = testAgent({ kaos });
    ctx.configure({ tools: ['Bash', 'TaskList', 'TaskOutput', 'TaskStop'] });
    const { agent } = ctx;
    const run = agent.tools.runShellCommand('sleep 10', 'cmd-1');
    // Give the command a moment to start.
    await new Promise((resolve) => setTimeout(resolve, 100));
    agent.tools.cancelShellCommand('cmd-1');
    const result = await run;
    expect(result.isError).toBe(true);
  });

  it('detaches a running shell command to the background', async () => {
    const ctx = testAgent({ kaos });
    ctx.configure({ tools: ['Bash', 'TaskList', 'TaskOutput', 'TaskStop'] });
    const { agent } = ctx;
    const run = agent.tools.runShellCommand('sleep 5', 'cmd-2');
    await new Promise((resolve) => setTimeout(resolve, 100));
    const detach = await agent.tools.detachShellCommand('cmd-2');
    // Detach either returns a background task info or undefined if the
    // command already finished before detach could restart it.
    expect(typeof detach.info === 'object' || detach.info === undefined).toBe(true);
    await expect(run).resolves.toBeDefined();
  });
});
