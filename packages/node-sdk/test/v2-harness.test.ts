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

beforeAll(async () => {
  server = createServer((req, res: ServerResponse) => {
    if (req.method !== 'POST' || req.url !== '/v1/chat/completions') {
      res.writeHead(404);
      res.end();
      return;
    }
    req.resume();
    req.on('end', () => {
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

async function makeHarness() {
  const homeDir = await mkdtemp(join(tmpdir(), 'kimi-v2-bridge-home-'));
  const workDir = await mkdtemp(join(tmpdir(), 'kimi-v2-bridge-work-'));
  tempDirs.push(homeDir, workDir);
  await writeFile(
    join(homeDir, 'config.toml'),
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
  const harness = createKimiHarnessV2({ homeDir, identity: TEST_IDENTITY });
  return { harness, workDir };
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

      const listed = await harness.listSessions({} as never);
      expect(listed.some((item) => item.id === 'ses_v2_smoke')).toBe(true);

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
});
