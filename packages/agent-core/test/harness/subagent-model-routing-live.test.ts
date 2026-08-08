/**
 * Live end-to-end test for per-subagent model routing over real HTTP: two
 * local OpenAI-compatible endpoints (one per provider) answer chat-completion
 * requests; a real Session spawns subagents through SessionSubagentHost with
 * the stock kosong generate() — nothing is stubbed. Each endpoint echoes its
 * own identity in the reply text, so the subagent summary itself proves which
 * provider/model served it.
 */

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { createServer, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';

import { join } from 'pathe';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import type { KimiConfig } from '../../src/config';
import type { ResolvedAgentProfile } from '../../src/profile';
import type { SDKSessionRPC } from '../../src/rpc';
import { Session } from '../../src/session';
import { ProviderManager } from '../../src/session/provider-manager';
import { testKaos } from '../fixtures/test-kaos';

interface CapturedRequest {
  readonly apiKey: string;
  readonly model: string;
}

const captured: CapturedRequest[] = [];
let server: Server;
let baseUrl: string;
let sessionDir: string;

const LONG_REPLY_MAIN =
  'Served by the MAIN endpoint. This subagent completed the delegated investigation end to end: the relevant module was located, its behavior traced through every call site, and the requested work verified against the existing test suite.';
const LONG_REPLY_ROUTED =
  'Served by the ROUTED endpoint. This subagent completed the delegated investigation end to end: the relevant module was located, its behavior traced through every call site, and the requested work verified against the existing test suite.';
const LONG_REPLY_POOLED =
  'Served by the POOLED OK endpoint. This subagent completed the delegated investigation end to end: the relevant module was located, its behavior traced through every call site, and the requested work verified against the existing test suite.';

function sseBody(text: string): string {
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
  return `${chunk({ role: 'assistant', content: text }, null)}${usage}data: [DONE]\n\n`;
}

function replyWith(res: ServerResponse, apiKey: string, text: string): void {
  res.writeHead(200, { 'content-type': 'text/event-stream' });
  res.end(sseBody(text));
}

beforeAll(async () => {
  server = createServer((req, res) => {
    if (req.method !== 'POST' || req.url !== '/v1/chat/completions') {
      res.writeHead(404);
      res.end();
      return;
    }
    const apiKey = (req.headers.authorization ?? '').replace(/^Bearer\s+/i, '');
    let body = '';
    req.on('data', (chunk: Buffer) => {
      body += chunk.toString('utf-8');
    });
    req.on('end', () => {
      const model = (JSON.parse(body) as { model?: string }).model ?? '<none>';
      captured.push({ apiKey, model });
      if (apiKey === 'key-main') {
        replyWith(res, apiKey, LONG_REPLY_MAIN);
      } else if (apiKey === 'key-routed') {
        replyWith(res, apiKey, LONG_REPLY_ROUTED);
      } else if (apiKey === 'key-limited') {
        // The limited endpoint of the pooled alias always rate-limits, so the
        // subagent's PoolingLLM must fail over to `key-ok`.
        res.writeHead(429, {
          'content-type': 'application/json',
          'retry-after': '1',
        });
        res.end(
          JSON.stringify({
            error: {
              message: 'rate limit on key-limited',
              type: 'rate_limit_error',
              code: 'rate_limit_exceeded',
            },
          }),
        );
      } else if (apiKey === 'key-ok') {
        replyWith(res, apiKey, LONG_REPLY_POOLED);
      } else {
        res.writeHead(401, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: { message: `unexpected key ${apiKey}` } }));
      }
    });
  });
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });
  const { port } = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${String(port)}/v1`;
  sessionDir = await mkdtemp(join(tmpdir(), 'kimi-subagent-model-routing-live-'));
});

afterAll(async () => {
  await rm(sessionDir, { recursive: true, force: true });
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error === undefined ? resolve() : reject(error)));
  });
});

const liveConfig: KimiConfig = {
  providers: {
    main: { type: 'openai', apiKey: 'key-main', baseUrl: '<set-at-runtime>' },
    routed: { type: 'openai', apiKey: 'key-routed', baseUrl: '<set-at-runtime>' },
    limited: { type: 'openai', apiKey: 'key-limited', baseUrl: '<set-at-runtime>' },
    ok: { type: 'openai', apiKey: 'key-ok', baseUrl: '<set-at-runtime>' },
  },
  models: {
    'main-model': { provider: 'main', model: 'model-main', maxContextSize: 128_000 },
    'routed-model': { provider: 'routed', model: 'model-routed', maxContextSize: 128_000 },
    'pooled-model': {
      provider: ['limited', 'ok'],
      model: 'model-pooled',
      maxContextSize: 128_000,
    },
  },
  subagent: {
    routing: { coder: 'routed-model' },
  },
};

function config(): KimiConfig {
  const provider = (apiKey: string): KimiConfig['providers'][string] => ({
    type: 'openai',
    apiKey,
    baseUrl,
  });
  return {
    ...liveConfig,
    providers: {
      main: provider('key-main'),
      routed: provider('key-routed'),
      limited: provider('key-limited'),
      ok: provider('key-ok'),
    },
  };
}

async function createLiveSession(): Promise<Session> {
  const rpc: SDKSessionRPC = {
    emitEvent: vi.fn(async () => {}),
    requestApproval: vi.fn(async () => ({ decision: 'approved', selectedLabel: 'approve' })),
    requestQuestion: vi.fn(async () => null),
    toolCall: vi.fn(async () => ({ output: '', isError: true })),
  } as unknown as SDKSessionRPC;
  const cfg = config();
  return new Session({
    id: 'subagent-model-routing-live',
    kaos: testKaos.withCwd(sessionDir),
    homedir: sessionDir,
    rpc,
    config: cfg,
    skills: { explicitDirs: [join(sessionDir, 'no-such-skills-dir')] },
    providerManager: new ProviderManager({ config: cfg }),
  });
}

const mainProfile: ResolvedAgentProfile = {
  name: 'agent',
  systemPrompt: () => '<system-prompt>',
  tools: [],
};

function spawnArgs(profileName: string, modelAlias?: string) {
  return {
    profileName,
    modelAlias,
    parentToolCallId: 'call_agent',
    prompt: 'Investigate the module and report.',
    description: 'Investigate',
    runInBackground: false,
    signal: new AbortController().signal,
  };
}

describe('per-subagent model routing over real HTTP', () => {
  it('routes subagents to distinct providers per profile and per argument', async () => {
    const session = await createLiveSession();
    try {
      const { agent: mainAgent } = await session.createAgent(
        { type: 'main' },
        { profile: mainProfile },
      );
      mainAgent.config.update({ modelAlias: 'main-model', thinkingEffort: 'off' });
      mainAgent.permission.setMode('yolo');
      const host = mainAgent.subagentHost!;

      // 1. Routing table: `coder` is routed to `routed-model`.
      const routed = await host.spawn(spawnArgs('coder'));
      expect(routed.modelAlias).toBe('routed-model');
      await expect(routed.completion).resolves.toMatchObject({
        result: LONG_REPLY_ROUTED,
      });

      // 2. No routing entry for `plan`: falls back to the caller model.
      const fallback = await host.spawn(spawnArgs('plan'));
      expect(fallback.modelAlias).toBe('main-model');
      await expect(fallback.completion).resolves.toMatchObject({
        result: LONG_REPLY_MAIN,
      });

      // 3. Explicit argument beats the routing table.
      const explicit = await host.spawn(spawnArgs('coder', 'main-model'));
      expect(explicit.modelAlias).toBe('main-model');
      await expect(explicit.completion).resolves.toMatchObject({
        result: LONG_REPLY_MAIN,
      });

      // 4. Unknown alias fails before any HTTP request is made.
      const before = captured.length;
      await expect(host.spawn(spawnArgs('coder', 'no-such-model'))).rejects.toThrow(
        'Unknown model alias "no-such-model" for subagent',
      );
      expect(captured.length).toBe(before);

      // The request log itself is the proof: routed spawns went to the routed
      // endpoint with its model id, fallback/explicit to the main endpoint.
      expect(captured).toEqual([
        { apiKey: 'key-routed', model: 'model-routed' },
        { apiKey: 'key-main', model: 'model-main' },
        { apiKey: 'key-main', model: 'model-main' },
      ]);
    } finally {
      await session.close?.();
    }
  }, 60_000);

  it('fails over inside a pooled alias routed to a subagent', async () => {
    const session = await createLiveSession();
    try {
      const { agent: mainAgent } = await session.createAgent(
        { type: 'main' },
        { profile: mainProfile },
      );
      mainAgent.config.update({ modelAlias: 'main-model', thinkingEffort: 'off' });
      mainAgent.permission.setMode('yolo');
      const host = mainAgent.subagentHost!;

      // The subagent binds the pooled alias; the first endpoint (`key-limited`)
      // always answers 429, so the subagent's own PoolingLLM must fail over to
      // `key-ok` within the same run — proving routing and failover compose.
      const pooled = await host.spawn(spawnArgs('coder', 'pooled-model'));
      expect(pooled.modelAlias).toBe('pooled-model');
      await expect(pooled.completion).resolves.toMatchObject({
        result: LONG_REPLY_POOLED,
      });

      expect(captured.slice(-2)).toEqual([
        { apiKey: 'key-limited', model: 'model-pooled' },
        { apiKey: 'key-ok', model: 'model-pooled' },
      ]);
    } finally {
      await session.close?.();
    }
  }, 60_000);
});
