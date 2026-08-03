/**
 * End-to-end pool test over real HTTP: a local mock speaks OpenAI
 * chat-completions SSE, endpoint "a" is scriptable (429 + Retry-After →
 * later 200), endpoint "b" always 200. Drives the real `ModelResolverService`,
 * the real protocol adapter registry (vendored OpenAI client), the real
 * `PoolingModel` and the real recovery prober — no stubbed generate().
 *
 * Port of v1 `agent-core/test/agent/turn/pooling-llm.http.test.ts`. The 30s
 * Retry-After case doubles as the `maxRetries: 0` parity check: with SDK
 * retries enabled the run would block inside the vendored client instead of
 * failing over immediately.
 */

import { createServer, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { DisposableStore } from '#/_base/di/lifecycle';
import { createServices, type TestInstantiationService } from '#/_base/di/test';
import { unwrapErrorCause } from '#/_base/errors/errors';
import { IOAuthService } from '#/app/auth/auth';
import { IConfigService } from '#/app/config/config';
import {
  APIEmptyResponseError,
  APIProviderRateLimitError,
} from '#/app/llmProtocol/errors';
import { createUserMessage } from '#/app/llmProtocol/message';
import { IModelService, type ModelConfig } from '#/app/model/model';
import { HostRequestHeaders, IHostRequestHeaders } from '#/app/model/hostRequestHeaders';
import type { Model } from '#/app/model/modelInstance';
import { IModelResolver } from '#/app/model/modelResolver';
import { ModelResolverService } from '#/app/model/modelResolverService';
import { IPlatformService, type PlatformConfig } from '#/app/platform/platform';
import { IProviderService, type ProviderConfig } from '#/app/provider/provider';
import { IProtocolAdapterRegistry } from '#/app/protocol/protocol';
import { ProtocolAdapterRegistry } from '#/app/protocol/protocolAdapterRegistry';
import {
  DEFAULT_POOL_OPTIONS,
  PoolHealthRegistry,
  PoolRecoveryProber,
} from '#/session/providerPool/poolHealth';
import { PoolingModel } from '#/session/providerPool/poolingModel';

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

let disposables: DisposableStore;
let ix: TestInstantiationService;
let resolver: IModelResolver;

beforeEach(() => {
  disposables = new DisposableStore();
  const providers: Record<string, ProviderConfig> = {
    a: { type: 'openai', apiKey: 'key-a', baseUrl },
    b: { type: 'openai', apiKey: 'key-b', baseUrl },
  };
  const models: Record<string, ModelConfig> = {
    k2: { provider: ['a', 'b'], model: 'mock', maxContextSize: 128_000 },
  };
  ix = createServices(disposables, {
    additionalServices: (reg) => {
      reg.definePartialInstance(IConfigService, {
        get: (() => undefined) as unknown as IConfigService['get'],
      });
      reg.definePartialInstance(IProviderService, {
        get: ((name: string) => providers[name]) as IProviderService['get'],
        list: (() => providers) as IProviderService['list'],
      });
      reg.definePartialInstance(IPlatformService, {
        get: (() => undefined) as IPlatformService['get'],
        list: (() => ({}) as Record<string, PlatformConfig>) as IPlatformService['list'],
      });
      reg.definePartialInstance(IModelService, {
        get: ((id: string) => models[id]) as IModelService['get'],
        list: (() => models) as IModelService['list'],
      });
      reg.definePartialInstance(IOAuthService, {
        resolveTokenProvider: (() => undefined) as unknown as IOAuthService['resolveTokenProvider'],
      });
      reg.define(IProtocolAdapterRegistry, ProtocolAdapterRegistry);
      reg.define(IModelResolver, ModelResolverService);
      reg.defineInstance(IHostRequestHeaders, new HostRequestHeaders());
    },
  });
  resolver = ix.get(IModelResolver);
});

afterEach(() => disposables.dispose());

function makePoolingModel(registry: PoolHealthRegistry): Model {
  return new PoolingModel({
    alias: 'k2',
    endpoints: [resolver.resolveWithProvider('k2', 'a'), resolver.resolveWithProvider('k2', 'b')],
    registry,
    options: () => DEFAULT_POOL_OPTIONS,
  });
}

/** Mirrors `SessionProviderPoolService.probeEndpoint` against the live resolver. */
async function probeEndpoint(name: string): Promise<void> {
  const model = resolver.resolveWithProvider('k2', name).withMaxCompletionTokens(1);
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort();
  }, 30_000);
  try {
    const request = model.request(
      { systemPrompt: 'ping', tools: [], messages: [createUserMessage('ping')] },
      controller.signal,
    );
    for await (const _event of request) {
      // Drain the stream; only completion or failure matters.
    }
  } catch (error) {
    const raw = unwrapErrorCause(error);
    if (raw instanceof APIEmptyResponseError) return;
    throw raw;
  } finally {
    clearTimeout(timeout);
  }
}

async function chat(model: Model): Promise<string> {
  let served = '';
  for await (const event of model.request(
    { systemPrompt: 'sys', tools: [], messages: [createUserMessage('hi')] },
    new AbortController().signal,
  )) {
    if (event.type === 'part' && event.part.type === 'text') served += event.part.text;
  }
  return served;
}

describe('pool failover over real HTTP', () => {
  it('fails over to endpoint b when endpoint a returns 429, then recovers via prober', async () => {
    behaviors.set('key-a', { kind: 'rate-limit', retryAfterSeconds: 60 });
    behaviors.set('key-b', { kind: 'ok' });
    const registry = new PoolHealthRegistry(() => ({
      ...DEFAULT_POOL_OPTIONS,
      probeIntervalMs: 1000,
    }));
    const model = makePoolingModel(registry);

    // a → 429 (real HTTP round trip through the vendored openai SDK), b serves.
    expect(await chat(model)).toBe('ok-from-key-b');
    expect(registry.status('a')).toBe('limited');
    expect(registry.status('b')).toBe('healthy');

    // Next request skips the cooling endpoint a entirely.
    expect(await chat(model)).toBe('ok-from-key-b');

    // Lift the limit on a and let the prober (1s interval) discover it.
    behaviors.set('key-a', { kind: 'ok' });
    const recovered = new Promise<string>((resolve) => {
      const prober = new PoolRecoveryProber({
        registry,
        options: () => ({ ...DEFAULT_POOL_OPTIONS, probeIntervalMs: 1000 }),
        probe: probeEndpoint,
        random: () => 0.5,
        onRecovered: resolve,
      });
      prober.start();
    });
    const name = await Promise.race([
      recovered,
      new Promise<string>((_, reject) => {
        setTimeout(() => {
          reject(new Error('prober did not recover endpoint a within 10s'));
        }, 10_000);
      }),
    ]);
    expect(name).toBe('a');
    expect(registry.status('a')).toBe('healthy');
  }, 20_000);

  it('throws an aggregate 429 carrying Retry-After when every endpoint is limited', async () => {
    behaviors.set('key-a', { kind: 'rate-limit', retryAfterSeconds: 30 });
    behaviors.set('key-b', { kind: 'rate-limit' });
    const registry = new PoolHealthRegistry(() => DEFAULT_POOL_OPTIONS);
    const model = makePoolingModel(registry);

    const error = await chat(model).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(APIProviderRateLimitError);
    expect((error as APIProviderRateLimitError).retryAfterMs).toBeGreaterThan(0);
    expect(registry.status('a')).toBe('limited');
    expect(registry.status('b')).toBe('limited');
  }, 20_000);

  it('marks a 401 endpoint down and keeps serving from the healthy one', async () => {
    behaviors.set('key-a', { kind: 'status', status: 401 });
    behaviors.set('key-b', { kind: 'ok' });
    const registry = new PoolHealthRegistry(() => DEFAULT_POOL_OPTIONS);
    const model = makePoolingModel(registry);

    expect(await chat(model)).toBe('ok-from-key-b');
    expect(registry.status('a')).toBe('down');

    // Later requests never touch the down endpoint again.
    await chat(model);
    expect(registry.status('a')).toBe('down');
  }, 20_000);
});
