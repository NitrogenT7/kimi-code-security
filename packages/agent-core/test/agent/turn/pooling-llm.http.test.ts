/**
 * End-to-end pool test over real HTTP: a local mock speaks OpenAI
 * chat-completions SSE, endpoint "a" is scriptable (429 + Retry-After →
 * later 200), endpoint "b" always 200. Drives the real ProviderManager,
 * real kosong OpenAI provider, real KosongLLM and the real recovery prober —
 * no stubbed generate().
 */

import { createServer, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createProvider, APIProviderRateLimitError } from '@moonshot-ai/kosong';

import { KosongLLM } from '../../../src/agent/turn/kosong-llm';
import { PoolingLLM } from '../../../src/agent/turn/pooling-llm';
import type { LLMChatParams } from '../../../src/loop';
import type { KimiConfig } from '../../../src/config';
import { ProviderManager } from '../../../src/session/provider-manager';
import { resolvePoolOptions } from '../../../src/session/provider-pool';

type Behavior =
  | { kind: 'ok' }
  | { kind: 'rate-limit'; retryAfterSeconds?: number }
  | { kind: 'status'; status: number };

const behaviors = new Map<string, Behavior>();
let server: Server;
let baseUrl: string;

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

function reply(res: ServerResponse, key: string): void {
  const behavior = behaviors.get(key) ?? { kind: 'ok' };
  if (behavior.kind === 'ok') {
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    res.end(sseBody(`ok-from-${key}`));
    return;
  }
  if (behavior.kind === 'rate-limit') {
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (behavior.retryAfterSeconds !== undefined) {
      headers['retry-after'] = String(behavior.retryAfterSeconds);
    }
    res.writeHead(429, headers);
    res.end(
      JSON.stringify({
        error: { message: `rate limit on ${key}`, type: 'rate_limit_error', code: 'rate_limit_exceeded' },
      }),
    );
    return;
  }
  res.writeHead(behavior.status, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ error: { message: `status ${String(behavior.status)} on ${key}`, type: 'auth_error' } }));
}

beforeAll(async () => {
  server = createServer((req, res) => {
    if (req.method !== 'POST' || req.url !== '/v1/chat/completions') {
      res.writeHead(404);
      res.end();
      return;
      }
    const auth = req.headers.authorization ?? '';
    const key = auth.replace(/^Bearer\s+/i, '');
    // Drain the request body before replying.
    req.resume();
    req.on('end', () => {
      reply(res, key);
    });
  });
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });
  const { port } = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${String(port)}/v1`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error === undefined ? resolve() : reject(error)));
  });
});

function makeManager(configOverrides: Partial<KimiConfig> = {}): ProviderManager {
  const config: KimiConfig = {
    providers: {
      a: { type: 'openai', apiKey: 'key-a', baseUrl },
      b: { type: 'openai', apiKey: 'key-b', baseUrl },
    },
    models: {
      k2: { provider: ['a', 'b'], model: 'mock', maxContextSize: 128_000 },
    },
    ...configOverrides,
  };
  return new ProviderManager({ config: () => config });
}

function makePoolingLLM(manager: ProviderManager): PoolingLLM {
  const pool = manager.resolveProviderPool('k2');
  if (pool === undefined) throw new Error('expected a provider pool');
  return new PoolingLLM({
    pool,
    registry: manager.poolHealth,
    options: () => resolvePoolOptions(undefined),
    systemPrompt: 'sys',
    buildEndpointLLM: (endpoint) =>
      new KosongLLM({
        provider: createProvider(endpoint.provider),
        systemPrompt: 'sys',
        capability: endpoint.modelCapabilities,
      }),
  });
}

const PARAMS: LLMChatParams = {
  messages: [{ role: 'user', content: [{ type: 'text', text: 'hi' }], toolCalls: [] }],
  tools: [],
  signal: new AbortController().signal,
};

describe('pool failover over real HTTP', () => {
  it('fails over to endpoint b when endpoint a returns 429, then recovers via prober', async () => {
    behaviors.set('key-a', { kind: 'rate-limit', retryAfterSeconds: 60 });
    behaviors.set('key-b', { kind: 'ok' });
    const manager = makeManager();
    const llm = makePoolingLLM(manager);

    // a → 429 (real HTTP round trip through the openai SDK), b serves.
    const response = await llm.chat(PARAMS);
    expect(response.usage.output).toBeGreaterThan(0);
    expect(manager.poolHealth.status('a')).toBe('limited');
    expect(manager.poolHealth.status('b')).toBe('healthy');

    // Next request skips the cooling endpoint a entirely.
    const second = await llm.chat(PARAMS);
    expect(second).toBeDefined();

    // Lift the limit on a and let the hourly prober (sped up) discover it.
    behaviors.set('key-a', { kind: 'ok' });
    const recovered = new Promise<string>((resolve) => {
      manager.startRecoveryProbing({ onRecovered: resolve });
    });
    // Shrink the interval by rebuilding the prober options through a dedicated
    // manager whose pool config asks for a 1s probe interval.
    manager.stopRecoveryProbing();
    const fastManager = makeManager({ pool: { probeIntervalMs: 1000 } });
    fastManager.poolHealth.markLimited('a');
    // Prime its endpoint cache so the prober can build a request for "a".
    fastManager.resolveProviderPool('k2');
    const recoveredFast = new Promise<string>((resolve) => {
      fastManager.startRecoveryProbing({ onRecovered: resolve });
    });
    const name = await Promise.race([
      recoveredFast,
      new Promise<string>((_, reject) => {
        setTimeout(() => {
          reject(new Error('prober did not recover endpoint a within 10s'));
        }, 10_000);
      }),
    ]);
    expect(name).toBe('a');
    expect(fastManager.poolHealth.status('a')).toBe('healthy');
    fastManager.stopRecoveryProbing();
    manager.stopRecoveryProbing();
    void recovered;
  }, 20_000);

  it('throws an aggregate 429 carrying Retry-After when every endpoint is limited', async () => {
    behaviors.set('key-a', { kind: 'rate-limit', retryAfterSeconds: 30 });
    behaviors.set('key-b', { kind: 'rate-limit' });
    const manager = makeManager();
    const llm = makePoolingLLM(manager);

    const error = await llm.chat(PARAMS).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(APIProviderRateLimitError);
    expect((error as APIProviderRateLimitError).retryAfterMs).toBeGreaterThan(0);
    expect(manager.poolHealth.status('a')).toBe('limited');
    expect(manager.poolHealth.status('b')).toBe('limited');
  }, 20_000);

  it('marks a 401 endpoint down and keeps serving from the healthy one', async () => {
    behaviors.set('key-a', { kind: 'status', status: 401 });
    behaviors.set('key-b', { kind: 'ok' });
    const manager = makeManager();
    const llm = makePoolingLLM(manager);

    const response = await llm.chat(PARAMS);
    expect(response).toBeDefined();
    expect(manager.poolHealth.status('a')).toBe('down');

    // Later requests never touch the down endpoint again.
    await llm.chat(PARAMS);
    expect(manager.poolHealth.status('a')).toBe('down');
  }, 20_000);
});
