/**
 * End-to-end coverage for the v2 engine bridge: `createKimiHarnessV2` serves
 * the full SDK Session/KimiHarness contract from an in-process agent-core-v2
 * engine. The model is a local mock speaking OpenAI chat-completions SSE, so
 * no network or credentials are involved.
 */

import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { createKimiHarnessV2, type Event, type Session } from '#/index';

import { TEST_IDENTITY } from './test-identity';

// ---------------------------------------------------------------------------
// Mock OpenAI-compatible endpoint (pattern ported from agent-core-v2's
// poolingModel.http.test.ts)
// ---------------------------------------------------------------------------

interface ScriptedReply {
  readonly text?: string;
  readonly toolCall?: { name: string; arguments: string };
}
let scriptedReply: ScriptedReply = { text: 'ok' };
let scriptQueue: ScriptedReply[] = [];

function nextReply(): ScriptedReply {
  return scriptQueue.length > 0 ? scriptQueue.shift()! : scriptedReply;
}

function sseBody(): string {
  const chunk = (delta: Record<string, unknown>, finishReason: string | null): string =>
    `data: ${JSON.stringify({
      id: 'chatcmpl-mock',
      object: 'chat.completion.chunk',
      created: 1_700_000_000,
      model: 'mock',
      choices: [{ index: 0, delta, finish_reason: finishReason }],
    })}\n\n`;
  const usage = `data: ${JSON.stringify({
    id: 'chatcmpl-mock',
    object: 'chat.completion.chunk',
    created: 1_700_000_000,
    model: 'mock',
    choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
    usage: { prompt_tokens: 3, completion_tokens: 1, total_tokens: 4 },
  })}\n\n`;

  const reply = nextReply();
  let body = '';
  if (reply.text !== undefined) {
    body += chunk({ role: 'assistant', content: reply.text }, null);
  }
  if (reply.toolCall !== undefined) {
    body += chunk(
      {
        role: 'assistant',
        tool_calls: [
          {
            index: 0,
            id: 'call_mock_1',
            type: 'function',
            function: {
              name: reply.toolCall.name,
              arguments: reply.toolCall.arguments,
            },
          },
        ],
      },
      null,
    );
  }
  return `${body}${usage}data: [DONE]\n\n`;
}

let server: Server;
let baseUrl: string;
const capturedRequests: { messages?: unknown }[] = [];

beforeAll(async () => {
  server = createServer((req, res: ServerResponse) => {
    if (req.method !== 'POST' || req.url !== '/v1/chat/completions') {
      res.writeHead(404);
      res.end();
      return;
    }
    let body = '';
    req.on('data', (chunk: Buffer) => {
      body += chunk.toString('utf-8');
    });
    req.on('end', () => {
      try {
        capturedRequests.push(JSON.parse(body) as { messages?: unknown });
      } catch {
        // ignore non-JSON bodies
      }
      res.writeHead(200, { 'content-type': 'text/event-stream' });
      res.end(sseBody());
    });
  });
  await new Promise<void>((resolve) => {
    server!.listen(0, '127.0.0.1', resolve);
  });
  const { port } = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${String(port)}/v1`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error === undefined) resolve();
      else reject(error);
    });
  });
});

// ---------------------------------------------------------------------------

const tempDirs: string[] = [];

afterEach(async () => {
  for (const dir of tempDirs.splice(0)) {
    await rm(dir, { recursive: true, force: true });
  }
});

async function makeHarness(homeDir?: string) {
  const home = homeDir ?? (await mkdtemp(join(tmpdir(), 'kimi-v2-bridge-home-')));
  const workDir = await mkdtemp(join(tmpdir(), 'kimi-v2-bridge-work-'));
  tempDirs.push(home, workDir);
  await writeFile(
    join(home, 'config.toml'),
    `default_model = "default-mock"

[providers.test]
type = "openai"
api_key = "test-key"
base_url = "${baseUrl}"

[models."default-mock"]
provider = "test"
model = "mock"
max_context_size = 128000
`,
    'utf-8',
  );
  const harness = createKimiHarnessV2({ homeDir: home, identity: TEST_IDENTITY });
  return { harness, workDir, homeDir: home };
}

function waitForEvent(
  session: Session,
  predicate: (event: Event) => boolean,
  timeoutMs = 60_000,
): Promise<Event> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      unsub();
      reject(new Error('timed out waiting for event'));
    }, timeoutMs);
    const unsub = session.onEvent((event) => {
      if (predicate(event)) {
        clearTimeout(timer);
        unsub();
        resolve(event);
      }
    });
  });
}

describe('v2 harness bridge', () => {
  it('covers the session lifecycle and state services without a turn', async () => {
    const { harness, workDir } = await makeHarness();
    try {
      const session = await harness.createSession({ id: 'ses_v2_smoke', workDir });
      expect(session.id).toBe('ses_v2_smoke');

      const status = await session.getStatus();
      expect(status.model).toBe('default-mock');
      expect(typeof status.permission).toBe('string');

      expect(await session.getNotepad()).toBe('');
      await session.setNotepad('bridge works');
      expect(await session.getNotepad()).toBe('bridge works');

      await session.createGoal({ objective: 'verify the bridge' });
      const { goal } = await session.getGoal();
      expect(goal?.status).toBe('active');
      await session.cancelGoal();

      const cron = await session.getCronTasks();
      expect(cron.tasks).toEqual([]);

      const context = await session.getContext();
      expect(Array.isArray(context.history)).toBe(true);

      const listed = await harness.listSessions();
      const smokeSummary = listed.find((item) => item.id === 'ses_v2_smoke');
      expect(smokeSummary).toBeDefined();
      expect(smokeSummary?.workDir).toBe(workDir);

      const skills = await session.listSkills();
      expect(skills.length).toBeGreaterThan(0);
      for (const skill of skills) {
        expect(typeof skill.path).toBe('string');
        expect(skill.path.length).toBeGreaterThan(0);
        expect(['builtin', 'user', 'extra', 'project']).toContain(skill.source);
      }

      await session.close();
    } finally {
      await harness.close();
    }
  });

  it('maps index entries to the SDK summary shape and scopes by workDir', async () => {
    const { harness, workDir } = await makeHarness();
    const otherWorkDir = await mkdtemp(join(tmpdir(), 'kimi-v2-bridge-other-'));
    tempDirs.push(otherWorkDir);
    try {
      const first = await harness.createSession({ id: 'ses_v2_list_a', workDir });
      const second = await harness.createSession({ id: 'ses_v2_list_b', workDir: otherWorkDir });

      const all = await harness.listSessions();
      const summaryA = all.find((item) => item.id === 'ses_v2_list_a');
      expect(summaryA).toMatchObject({
        id: 'ses_v2_list_a',
        workDir,
        archived: false,
      });
      expect(typeof summaryA?.sessionDir).toBe('string');
      expect(summaryA?.createdAt).toBeGreaterThan(0);

      const scoped = await harness.listSessions({ workDir });
      expect(scoped.map((item) => item.id)).toEqual(['ses_v2_list_a']);

      const scopedOther = await harness.listSessions({ workDir: otherWorkDir });
      expect(scopedOther.map((item) => item.id)).toEqual(['ses_v2_list_b']);

      const byId = await harness.listSessions({ sessionId: 'ses_v2_list_b' });
      expect(byId.map((item) => item.id)).toEqual(['ses_v2_list_b']);

      await expect(harness.listSessions({ workDir: '   ' })).rejects.toMatchObject({
        code: 'request.work_dir_required',
      });

      await first.close();
      await second.close();
    } finally {
      await harness.close();
    }
  });

  it('stops a single background task without stopping the others', async () => {
    const { harness, workDir } = await makeHarness();
    try {
      const session = await harness.createSession({ id: 'ses_v2_stop_bg', workDir });
      session.setApprovalHandler(async () => ({ decision: 'approved' }));

      for (let i = 0; i < 2; i++) {
        scriptQueue = [
          {
            toolCall: {
              name: 'Bash',
              arguments: JSON.stringify({
                command: 'node -e "setTimeout(() => {}, 30000)"',
                run_in_background: true,
                description: `bg-task-${String(i)}`,
              }),
            },
          },
          { text: 'spawned' },
        ];
        const turnEnded = waitForEvent(session, (event) => event.type === 'turn.ended', 90_000);
        await session.prompt('spawn a background task');
        await turnEnded;
      }

      const tasks = await session.listBackgroundTasks();
      expect(tasks).toHaveLength(2);
      expect(tasks.every((task) => task.status === 'running')).toBe(true);

      const [victim, survivor] = tasks;
      await session.stopBackgroundTask(victim!.taskId, { reason: 'test stop' });

      let stopped;
      for (let attempt = 0; attempt < 20; attempt++) {
        stopped = (await session.listBackgroundTasks()).find(
          (task) => task.taskId === victim!.taskId,
        );
        if (stopped === undefined || stopped.status !== 'running') break;
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
      expect(stopped === undefined || stopped.status === 'killed').toBe(true);

      const remaining = (await session.listBackgroundTasks()).find(
        (task) => task.taskId === survivor!.taskId,
      );
      expect(remaining?.status).toBe('running');

      await session.stopBackgroundTask(survivor!.taskId, { reason: 'cleanup' });
      // Wait for the cleanup stop to reach a terminal state — on Windows a
      // still-running child holds the temp dir and the rm in afterEach fails.
      for (let attempt = 0; attempt < 20; attempt++) {
        const survivorNow = (await session.listBackgroundTasks()).find(
          (task) => task.taskId === survivor!.taskId,
        );
        if (survivorNow === undefined || survivorNow.status !== 'running') break;
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
      await session.close();
    } finally {
      await harness.close();
    }
  });

  it('runs a prompt turn and streams events through session.onEvent', async () => {
    scriptedReply = { text: 'v2-bridge-reply' };
    const { harness, workDir } = await makeHarness();
    try {
      const session = await harness.createSession({ id: 'ses_v2_turn', workDir });

      const deltas: string[] = [];
      session.onEvent((event) => {
        if (event.type === 'assistant.delta') {
          deltas.push((event as { delta: string }).delta);
        }
      });
      const turnEnded = waitForEvent(session, (event) => event.type === 'turn.ended');

      await session.prompt('say something');
      await turnEnded;

      expect(deltas.join('')).toContain('v2-bridge-reply');

      await session.close();
    } finally {
      await harness.close();
    }
  });

  it('bridges approval requests to the SDK approval handler', async () => {
    scriptedReply = {
      toolCall: { name: 'Bash', arguments: JSON.stringify({ command: 'echo approved' }) },
    };
    const { harness, workDir } = await makeHarness();
    try {
      const session = await harness.createSession({
        id: 'ses_v2_approval',
        workDir,
        permission: 'manual',
      });

      const approvals: string[] = [];
      session.setApprovalHandler(async (request) => {
        approvals.push(request.toolName);
        return { decision: 'approved' };
      });

      const turnEnded = waitForEvent(session, (event) => event.type === 'turn.ended', 90_000);
      await session.prompt('run the command');
      await turnEnded;

      expect(approvals).toContain('Bash');

      await session.close();
    } finally {
      await harness.close();
    }
  });

  it('resumes a session with replay state', async () => {
    scriptedReply = { text: 'resume-me' };
    const { harness, workDir } = await makeHarness();
    try {
      const session = await harness.createSession({ id: 'ses_v2_resume', workDir });
      const turnEnded = waitForEvent(session, (event) => event.type === 'turn.ended');
      await session.prompt('remember this');
      await turnEnded;
      await session.close();

      const resumed = await harness.resumeSession({ id: 'ses_v2_resume' });
      expect(resumed.id).toBe('ses_v2_resume');
      const state = resumed.getResumeState();
      expect(state?.agents['main']).toBeDefined();
      const replay = state?.agents['main']?.replay ?? [];
      expect(replay.length).toBeGreaterThan(0);

      await resumed.close();
    } finally {
      await harness.close();
    }
  });

  it('keeps conversation context when resuming after a full engine restart', async () => {
    // Regression guard for `kimi -r` losing prior context: the first harness
    // is fully closed (engine disposed) before a fresh harness on the same
    // home resumes the session, and the next turn's LLM request must still
    // carry the pre-restart history.
    const marker = 'blue-elephant-42';
    scriptedReply = { text: 'ok' };
    const first = await makeHarness();
    const { workDir, homeDir } = first;
    try {
      const session = await first.harness.createSession({ id: 'ses_v2_restart', workDir });
      const turnEnded = waitForEvent(session, (event) => event.type === 'turn.ended');
      await session.prompt(`Remember the codeword ${marker}.`);
      await turnEnded;
      await session.close();
    } finally {
      await first.harness.close();
    }
    const requestsBeforeRestart = capturedRequests.length;
    expect(requestsBeforeRestart).toBeGreaterThan(0);

    const second = await makeHarness(homeDir);
    try {
      const resumed = await second.harness.resumeSession({ id: 'ses_v2_restart' });
      const context = await resumed.getContext();
      expect(JSON.stringify(context.history)).toContain(marker);
      // The footer reads this counter after resume; a hardcoded 0 reads as
      // "context lost" even though the history is intact.
      expect(context.tokenCount).toBeGreaterThan(0);
      expect(
        resumed.getResumeState()?.agents['main']?.context.tokenCount,
      ).toBeGreaterThan(0);

      const turnEnded = waitForEvent(resumed, (event) => event.type === 'turn.ended');
      await resumed.prompt('What was the codeword?');
      await turnEnded;

      const postResumeRequests = capturedRequests.slice(requestsBeforeRestart);
      expect(postResumeRequests.length).toBeGreaterThan(0);
      expect(JSON.stringify(postResumeRequests[0]?.messages)).toContain(marker);

      await resumed.close();
    } finally {
      await second.harness.close();
    }
  });

  it('spawns a security-profile subagent through the Agent tool', async () => {
    scriptQueue = [
      {
        toolCall: {
          name: 'Agent',
          arguments: JSON.stringify({
            description: 'recon the codebase',
            prompt: 'Look around and report back.',
            subagent_type: 'explore',
          }),
        },
      },
      { text: 'child summary: ' + 'the recon completed successfully. '.repeat(10) },
      { text: 'parent-final-answer' },
    ];
    const { harness, workDir } = await makeHarness();
    try {
      const session = await harness.createSession({ id: 'ses_v2_subagent', workDir });

      const subagentEvents: string[] = [];
      session.onEvent((event) => {
        if (event.type.startsWith('subagent.')) {
          subagentEvents.push(event.type);
        }
      });
      const turnEnded = waitForEvent(
        session,
        (event) => event.type === 'turn.ended' && (event as { agentId?: string }).agentId === 'main',
        90_000,
      );
      await session.prompt('delegate the recon');
      await turnEnded;

      expect(subagentEvents).toContain('subagent.spawned');
      expect(subagentEvents).toContain('subagent.completed');

      await session.close();
    } finally {
      await harness.close();
    }
  });

  it('lists MCP groups and reaches the group loader', async () => {
    const { harness, workDir } = await makeHarness();
    try {
      const session = await harness.createSession({ id: 'ses_v2_mcp', workDir });
      const groups = await session.listMcpGroups();
      expect(Array.isArray(groups)).toBe(true);
      const servers = await session.listMcpServers();
      expect(Array.isArray(servers)).toBe(true);
      // Unknown group must surface a coded error, not a crash.
      await expect(session.loadMcpGroup('no-such-group')).rejects.toThrow();
      await session.close();
    } finally {
      await harness.close();
    }
  });

  it('toggles swarm and plan mode through the bridge', async () => {
    const { harness, workDir } = await makeHarness();
    try {
      const session = await harness.createSession({ id: 'ses_v2_modes', workDir });

      await session.setSwarmMode(true, 'task');
      expect((await session.getStatus()).swarmMode).toBe(true);
      await session.setSwarmMode(false, 'task');
      expect((await session.getStatus()).swarmMode).toBe(false);

      await session.setPlanMode(true);
      expect((await session.getStatus()).planMode).toBe(true);
      await session.setPlanMode(false);
      expect((await session.getStatus()).planMode).toBe(false);

      await session.close();
    } finally {
      await harness.close();
    }
  });

  it('bridges AskUserQuestion to the SDK question handler', async () => {
    scriptQueue = [
      {
        toolCall: {
          name: 'AskUserQuestion',
          arguments: JSON.stringify({
            questions: [
              {
                question: 'Which option?',
                header: 'Pick',
                options: [{ label: 'A' }, { label: 'B' }],
              },
            ],
          }),
        },
      },
      { text: 'answer received' },
    ];
    const { harness, workDir } = await makeHarness();
    try {
      const session = await harness.createSession({
        id: 'ses_v2_question',
        workDir,
        permission: 'manual',
      });

      const seen: string[] = [];
      session.setQuestionHandler(async (request) => {
        for (const q of request.questions) seen.push(q.question);
        return { answers: { 'Which option?': 'A' } };
      });

      const turnEnded = waitForEvent(
        session,
        (event) => event.type === 'turn.ended' && (event as { agentId?: string }).agentId === 'main',
        90_000,
      );
      await session.prompt('ask me something');
      await turnEnded;

      expect(seen).toContain('Which option?');

      await session.close();
    } finally {
      await harness.close();
    }
  });

  it('shares the session notepad with subagents end to end', async () => {
    const childNote = 'subagent found the admin endpoint at /internal/console';
    scriptQueue = [
      {
        toolCall: {
          name: 'Agent',
          arguments: JSON.stringify({
            description: 'audit the admin surface',
            prompt: 'Audit and record your finding in the notepad.',
            subagent_type: 'code-auditor',
          }),
        },
      },
      { toolCall: { name: 'Notepad', arguments: JSON.stringify({ append: childNote }) } },
      { text: 'audit summary: ' + 'the finding has been recorded in the shared notepad. '.repeat(8) },
      { text: 'parent done' },
    ];
    const { harness, workDir } = await makeHarness();
    try {
      const session = await harness.createSession({ id: 'ses_v2_notepad_share', workDir });
      const turnEnded = waitForEvent(
        session,
        (event) => event.type === 'turn.ended' && (event as { agentId?: string }).agentId === 'main',
        90_000,
      );
      await session.prompt('start the audit');
      await turnEnded;

      // The code-auditor subagent's Notepad write is visible to the main
      // agent and to the user — one shared session buffer.
      expect(await session.getNotepad()).toContain(childNote);

      await session.close();
    } finally {
      await harness.close();
    }
  });
});
