/**
 * `providerPool` domain — `PoolingModel` unit tests.
 *
 * Port of v1 `agent-core/test/agent/turn/pooling-llm.test.ts` onto the v2
 * god-object `Model` boundary: endpoint Models are stubs whose `request`
 * stream either completes or throws, and failover is observed through the
 * streamed parts and the session-shared `PoolHealthRegistry`. `PoolingModel`
 * is a plain class (no `@IService` deps), so it is constructed directly.
 */

import { describe, expect, it } from 'vitest';

import { Error2 } from '#/_base/errors/errors';
import { UNKNOWN_CAPABILITY } from '#/app/llmProtocol/capability';
import {
  APIConnectionError,
  APIContextOverflowError,
  APIProviderRateLimitError,
  APIStatusError,
} from '#/app/llmProtocol/errors';
import { createAssistantMessage, type Message } from '#/app/llmProtocol/message';
import type { LLMEvent, LLMRequestInput, Model } from '#/app/model/modelInstance';
import { ProtocolErrors, translateProviderError } from '#/app/protocol/errors';
import {
  DEFAULT_POOL_OPTIONS,
  PoolHealthRegistry,
  type PoolOptions,
} from '#/session/providerPool/poolHealth';
import { PoolingModel } from '#/session/providerPool/poolingModel';

const INPUT: LLMRequestInput = { systemPrompt: 'sys', tools: [], messages: [] };

type Behavior = () => Promise<void>;

function endpointModel(name: string, behaviors: Map<string, Behavior>, calls: Map<string, number>): Model {
  const model: Model = {
    id: 'k2',
    name: 'mock-model',
    aliases: [],
    protocol: 'openai',
    baseUrl: undefined,
    headers: {},
    capabilities: UNKNOWN_CAPABILITY,
    maxContextSize: 1000,
    maxOutputSize: undefined,
    displayName: undefined,
    reasoningKey: undefined,
    supportEfforts: undefined,
    defaultEffort: undefined,
    thinkingEffort: null,
    maxCompletionTokens: undefined,
    alwaysThinking: false,
    providerType: 'openai',
    providerName: name,
    authProvider: { getAuth: async () => undefined },
    withThinking: () => model,
    withMaxCompletionTokens: () => model,
    withGenerationKwargs: () => model,
    withProviderOptions: () => model,
    withThinkingKeep: () => model,
    request: () => stream(name, behaviors, calls),
  };
  return model;
}

async function* stream(
  name: string,
  behaviors: Map<string, Behavior>,
  calls: Map<string, number>,
): AsyncGenerator<LLMEvent, void, void> {
  calls.set(name, (calls.get(name) ?? 0) + 1);
  const behavior = behaviors.get(name);
  if (behavior !== undefined) await behavior();
  yield { type: 'part', part: { type: 'text', text: name } };
  const message: Message = createAssistantMessage([{ type: 'text', text: name }]);
  yield { type: 'finish', message };
}

interface Harness {
  model: PoolingModel;
  registry: PoolHealthRegistry;
  calls: Map<string, number>;
  failovers: Array<{ from: string; to: string | undefined; reason: string }>;
  recoveries: string[];
  setBehavior(name: string, behavior: Behavior): void;
}

function harness(
  names: readonly string[],
  overrides: Partial<PoolOptions> = {},
  nowRef?: { value: number },
): Harness {
  const now = nowRef ?? { value: 1_000_000 };
  const fullOptions = (): PoolOptions => ({
    ...DEFAULT_POOL_OPTIONS,
    cooldownBaseMs: 10_000,
    ...overrides,
  });
  const registry = new PoolHealthRegistry(fullOptions, () => now.value);
  const calls = new Map<string, number>();
  const behaviors = new Map<string, Behavior>();
  const failovers: Harness['failovers'] = [];
  const recoveries: string[] = [];

  const model = new PoolingModel({
    alias: 'k2',
    endpoints: names.map((name) => endpointModel(name, behaviors, calls)),
    registry,
    options: fullOptions,
    onFailover: (info) => {
      failovers.push({ from: info.from, to: info.to, reason: info.reason });
    },
    onRecovered: (name) => {
      recoveries.push(name);
    },
  });

  return {
    model,
    registry,
    calls,
    failovers,
    recoveries,
    setBehavior: (name, behavior) => {
      behaviors.set(name, behavior);
    },
  };
}

/** Drive one pooled request to completion; resolves to the serving endpoint's tag. */
async function chat(model: Model): Promise<string> {
  let served = '';
  for await (const event of model.request(INPUT, new AbortController().signal)) {
    if (event.type === 'part' && event.part.type === 'text') served += event.part.text;
  }
  return served;
}

describe('PoolingModel', () => {
  it('serves from the primary endpoint when healthy', async () => {
    const h = harness(['a', 'b']);
    expect(await chat(h.model)).toBe('a');
    expect(h.calls.get('a')).toBe(1);
    expect(h.calls.get('b')).toBeUndefined();
  });

  it('fails over to the next endpoint on 429 and skips the limited one afterwards', async () => {
    const h = harness(['a', 'b']);
    h.setBehavior('a', async () => {
      throw new APIProviderRateLimitError('slow down');
    });
    expect(await chat(h.model)).toBe('b');
    expect(h.registry.status('a')).toBe('limited');
    expect(h.failovers).toEqual([{ from: 'a', to: 'b', reason: 'rate_limit' }]);

    // Second request: 'a' is cooling, so it goes straight to 'b'.
    expect(await chat(h.model)).toBe('b');
    expect(h.calls.get('a')).toBe(1);
    expect(h.calls.get('b')).toBe(2);
  });

  it('classifies coded Error2 wrappers through their provider-error cause', async () => {
    const h = harness(['a', 'b']);
    h.setBehavior('a', async () => {
      throw translateProviderError(new APIProviderRateLimitError('slow down'));
    });
    expect(await chat(h.model)).toBe('b');
    expect(h.registry.status('a')).toBe('limited');
    expect(h.failovers).toEqual([{ from: 'a', to: 'b', reason: 'rate_limit' }]);
  });

  it('half-opens the limited endpoint after cooldown and recovers on success', async () => {
    const nowRef = { value: 1_000_000 };
    const h = harness(['a', 'b'], {}, nowRef);
    h.setBehavior('a', async () => {
      throw new APIProviderRateLimitError('slow down');
    });
    await chat(h.model);
    expect(h.registry.status('a')).toBe('limited');

    // Cooldown expires; the next request probes 'a' again (half-open).
    nowRef.value += 10_000;
    h.setBehavior('a', async () => {});
    expect(await chat(h.model)).toBe('b');
    // 'b' is healthy and sorts before the half-open 'a', so 'a' is only tried
    // when it is the preferred healthy endpoint again. Force it: limit 'b' too.
    h.setBehavior('b', async () => {
      throw new APIProviderRateLimitError('b limited');
    });
    expect(await chat(h.model)).toBe('a');
    expect(h.registry.status('a')).toBe('healthy');
    expect(h.recoveries).toEqual(['a']);
  });

  it('marks 401 endpoints down and never tries them again', async () => {
    const h = harness(['a', 'b']);
    h.setBehavior('a', async () => {
      throw new APIStatusError(401, 'invalid api key');
    });
    expect(await chat(h.model)).toBe('b');
    expect(h.registry.status('a')).toBe('down');
    expect(h.failovers[0]?.reason).toBe('auth');

    await chat(h.model);
    expect(h.calls.get('a')).toBe(1);
  });

  it('tries the next endpoint on connection errors without poisoning health', async () => {
    const h = harness(['a', 'b']);
    h.setBehavior('a', async () => {
      throw new APIConnectionError('refused');
    });
    expect(await chat(h.model)).toBe('b');
    expect(h.registry.status('a')).toBe('healthy');
    expect(h.failovers[0]?.reason).toBe('transient');
  });

  it('rethrows deterministic errors immediately without failover', async () => {
    const h = harness(['a', 'b']);
    const overflow = new APIContextOverflowError(400, 'context length exceeded');
    h.setBehavior('a', async () => {
      throw overflow;
    });
    await expect(chat(h.model)).rejects.toBe(overflow);
    expect(h.calls.get('b')).toBeUndefined();
    expect(h.registry.status('a')).toBe('healthy');
  });

  it('rethrows mid-stream failures without restarting the attempt', async () => {
    const h = harness(['a', 'b']);
    const rateLimited = new APIProviderRateLimitError('late 429');
    const flaky: Model = {
      ...endpointModel('a', new Map(), h.calls),
      request: async function* () {
        h.calls.set('a', (h.calls.get('a') ?? 0) + 1);
        yield { type: 'part', part: { type: 'text', text: 'partial' } } as LLMEvent;
        throw rateLimited;
      },
    };
    const model = new PoolingModel({
      alias: 'k2',
      endpoints: [flaky, endpointModel('b', new Map(), h.calls)],
      registry: h.registry,
      options: () => DEFAULT_POOL_OPTIONS,
    });
    await expect(chat(model)).rejects.toBe(rateLimited);
    // Content already reached the caller: no failover, no health poisoning.
    expect(h.calls.get('b')).toBeUndefined();
    expect(h.registry.status('a')).toBe('healthy');
  });

  it('throws an aggregate 429 with the earliest cooldown as Retry-After when exhausted', async () => {
    const h = harness(['a', 'b']);
    h.setBehavior('a', async () => {
      throw new APIProviderRateLimitError('a limited', undefined, 30_000, undefined);
    });
    h.setBehavior('b', async () => {
      throw new APIProviderRateLimitError('b limited');
    });
    const error = await chat(h.model).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(APIProviderRateLimitError);
    expect((error as APIProviderRateLimitError).retryAfterMs).toBe(10_000);
    expect(h.failovers.at(-1)).toEqual({ from: 'b', to: undefined, reason: 'rate_limit' });
  });

  it('spreads requests across healthy endpoints in round_robin mode', async () => {
    const h = harness(['a', 'b'], { strategy: 'round_robin' });
    await chat(h.model);
    await chat(h.model);
    await chat(h.model);
    expect(h.calls.get('a')).toBe(2);
    expect(h.calls.get('b')).toBe(1);
  });

  it('maps with* forks over every endpoint without mutating the original', () => {
    const h = harness(['a', 'b']);
    const efforts: string[] = [];
    const recording = (name: string): Model => {
      const base = endpointModel(name, new Map(), h.calls);
      return {
        ...base,
        withThinking: (effort) => {
          efforts.push(`${name}:${effort}`);
          return { ...base, thinkingEffort: effort };
        },
      };
    };
    const model = new PoolingModel({
      alias: 'k2',
      endpoints: [recording('a'), recording('b')],
      registry: h.registry,
      options: () => DEFAULT_POOL_OPTIONS,
    });

    const forked = model.withThinking('high');

    expect(efforts).toEqual(['a:high', 'b:high']);
    expect(forked.thinkingEffort).toBe('high');
    expect(model.thinkingEffort).toBeNull();
  });

  it('exposes the primary endpoint metadata', () => {
    const h = harness(['a', 'b']);
    expect(h.model.name).toBe('mock-model');
    expect(h.model.id).toBe('k2');
    expect(h.model.providerName).toBe('a');
    expect(h.model.capabilities).toBe(UNKNOWN_CAPABILITY);
  });

  it('treats a coded rate_limit Error2 without a status cause as limited', async () => {
    const h = harness(['a', 'b']);
    h.setBehavior('a', async () => {
      throw new Error2(ProtocolErrors.codes.PROVIDER_RATE_LIMIT, 'provider.rate_limit');
    });
    expect(await chat(h.model)).toBe('b');
    expect(h.registry.status('a')).toBe('limited');
  });
});
