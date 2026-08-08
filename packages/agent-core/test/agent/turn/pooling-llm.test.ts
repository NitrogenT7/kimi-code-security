import { describe, expect, it, vi } from 'vitest';

import {
  APIConnectionError,
  APIContextOverflowError,
  APIProviderRateLimitError,
  APIStatusError,
  emptyUsage,
  UNKNOWN_CAPABILITY,
} from '@moonshot-ai/kosong';

import type { AgentOptions } from '../../../src/agent';
import { PoolingLLM } from '../../../src/agent/turn/pooling-llm';
import type { KosongLLM } from '../../../src/agent/turn/kosong-llm';
import type { KimiConfig } from '../../../src/config';
import { ErrorCodes, KimiError } from '../../../src/errors';
import type { LLMChatParams, LLMChatResponse } from '../../../src/loop';
import type {
  ResolvedProviderPool,
  ResolvedRuntimeProvider,
} from '../../../src/session/provider-manager';
import { ProviderManager } from '../../../src/session/provider-manager';
import {
  DEFAULT_POOL_OPTIONS,
  PoolHealthRegistry,
  type PoolOptions,
} from '../../../src/session/provider-pool';
import { testAgent } from '../harness/agent';

const PARAMS: LLMChatParams = {
  messages: [],
  tools: [],
  signal: new AbortController().signal,
};

function endpoint(name: string): ResolvedRuntimeProvider {
  return {
    providerName: name,
    provider: { type: 'openai', model: 'mock-model', apiKey: `key-${name}` },
    modelCapabilities: UNKNOWN_CAPABILITY,
    type: 'openai',
    protocol: undefined,
  };
}

function response(tag: string): LLMChatResponse {
  return {
    toolCalls: [],
    usage: emptyUsage(),
    providerFinishReason: undefined,
    messageId: tag,
  };
}

interface Harness {
  llm: PoolingLLM;
  registry: PoolHealthRegistry;
  calls: Map<string, number>;
  failovers: Array<{ from: string; to: string | undefined; reason: string }>;
  recoveries: string[];
  builds: string[];
  setBehavior(name: string, behavior: () => Promise<LLMChatResponse>): void;
}

function harness(
  names: readonly string[],
  overrides: Partial<PoolOptions> = {},
  nowRef: { value: number } = { value: 1_000_000 },
): Harness {
  const registry = new PoolHealthRegistry(
    () => ({ ...DEFAULT_POOL_OPTIONS, cooldownBaseMs: 10_000, ...overrides }),
    () => nowRef.value,
  );
  const calls = new Map<string, number>();
  const behaviors = new Map<string, () => Promise<LLMChatResponse>>();
  const builds: string[] = [];
  const failovers: Harness['failovers'] = [];
  const recoveries: string[] = [];

  const pool: ResolvedProviderPool = {
    alias: 'k2',
    endpoints: names.map(endpoint),
  };

  const llm = new PoolingLLM({
    pool,
    registry,
    options: () => ({ ...DEFAULT_POOL_OPTIONS, cooldownBaseMs: 10_000, ...overrides }),
    systemPrompt: 'sys',
    buildEndpointLLM: (ep) => {
      builds.push(ep.providerName);
      return {
        chat: async () => {
          calls.set(ep.providerName, (calls.get(ep.providerName) ?? 0) + 1);
          const behavior = behaviors.get(ep.providerName);
          if (behavior !== undefined) return behavior();
          return response(ep.providerName);
        },
      } as unknown as KosongLLM;
    },
    onFailover: (info) => {
      failovers.push({ from: info.from, to: info.to, reason: info.reason });
    },
    onRecovered: (name) => {
      recoveries.push(name);
    },
  });

  return {
    llm,
    registry,
    calls,
    failovers,
    recoveries,
    builds,
    setBehavior: (name, behavior) => {
      behaviors.set(name, behavior);
    },
  };
}

describe('PoolingLLM', () => {
  it('serves from the primary endpoint when healthy', async () => {
    const h = harness(['a', 'b']);
    const res = await h.llm.chat(PARAMS);
    expect(res.messageId).toBe('a');
    expect(h.calls.get('a')).toBe(1);
    expect(h.calls.get('b')).toBeUndefined();
  });

  it('fails over to the next endpoint on 429 and skips the limited one afterwards', async () => {
    const h = harness(['a', 'b']);
    h.setBehavior('a', async () => {
      throw new APIProviderRateLimitError('slow down');
    });
    const res = await h.llm.chat(PARAMS);
    expect(res.messageId).toBe('b');
    expect(h.registry.status('a')).toBe('limited');
    expect(h.failovers).toEqual([{ from: 'a', to: 'b', reason: 'rate_limit' }]);

    // Second request: 'a' is cooling, so it goes straight to 'b'.
    const res2 = await h.llm.chat(PARAMS);
    expect(res2.messageId).toBe('b');
    expect(h.calls.get('a')).toBe(1);
    expect(h.calls.get('b')).toBe(2);
  });

  it('half-opens the limited endpoint after cooldown and recovers on success', async () => {
    const nowRef = { value: 1_000_000 };
    const h = harness(['a', 'b'], {}, nowRef);
    h.setBehavior('a', async () => {
      throw new APIProviderRateLimitError('slow down');
    });
    await h.llm.chat(PARAMS);
    expect(h.registry.status('a')).toBe('limited');

    // Cooldown expires; the next request probes 'a' again (half-open).
    nowRef.value += 10_000;
    h.setBehavior('a', async () => response('a'));
    const res = await h.llm.chat(PARAMS);
    expect(res.messageId).toBe('b');
    // 'b' is healthy and sorts before the half-open 'a', so 'a' is only tried
    // when it is the preferred healthy endpoint again. Force it: limit 'b' too.
    h.setBehavior('b', async () => {
      throw new APIProviderRateLimitError('b limited');
    });
    const res2 = await h.llm.chat(PARAMS);
    expect(res2.messageId).toBe('a');
    expect(h.registry.status('a')).toBe('healthy');
    expect(h.recoveries).toEqual(['a']);
  });

  it('marks 401 endpoints down and never tries them again', async () => {
    const h = harness(['a', 'b']);
    h.setBehavior('a', async () => {
      throw new APIStatusError(401, 'invalid api key');
    });
    const res = await h.llm.chat(PARAMS);
    expect(res.messageId).toBe('b');
    expect(h.registry.status('a')).toBe('down');
    expect(h.failovers[0]?.reason).toBe('auth');

    await h.llm.chat(PARAMS);
    expect(h.calls.get('a')).toBe(1);
  });

  it('fails over on OAuth-wrapped auth errors (provider.auth_error)', async () => {
    const h = harness(['a', 'b']);
    h.setBehavior('a', async () => {
      throw new KimiError(
        ErrorCodes.PROVIDER_AUTH_ERROR,
        'OAuth provider credentials were rejected.',
      );
    });
    const res = await h.llm.chat(PARAMS);
    expect(res.messageId).toBe('b');
    expect(h.registry.status('a')).toBe('down');
    expect(h.failovers[0]?.reason).toBe('auth');
  });

  it('fails over when the OAuth provider requires login', async () => {
    const h = harness(['a', 'b']);
    h.setBehavior('a', async () => {
      throw new KimiError(
        ErrorCodes.AUTH_LOGIN_REQUIRED,
        'OAuth provider "a" requires login before it can be used.',
      );
    });
    const res = await h.llm.chat(PARAMS);
    expect(res.messageId).toBe('b');
    expect(h.registry.status('a')).toBe('down');
    expect(h.failovers[0]?.reason).toBe('auth');
  });

  it('tries the next endpoint on connection errors without poisoning health', async () => {
    const h = harness(['a', 'b']);
    h.setBehavior('a', async () => {
      throw new APIConnectionError('refused');
    });
    const res = await h.llm.chat(PARAMS);
    expect(res.messageId).toBe('b');
    expect(h.registry.status('a')).toBe('healthy');
    expect(h.failovers[0]?.reason).toBe('transient');
  });

  it('rethrows deterministic errors immediately without failover', async () => {
    const h = harness(['a', 'b']);
    const overflow = new APIContextOverflowError(400, 'context length exceeded');
    h.setBehavior('a', async () => {
      throw overflow;
    });
    await expect(h.llm.chat(PARAMS)).rejects.toBe(overflow);
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
    const error = await h.llm.chat(PARAMS).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(APIProviderRateLimitError);
    expect((error as APIProviderRateLimitError).retryAfterMs).toBe(10_000);
    expect(h.llm.isRetryableError(error)).toBe(true);
  });

  it('spreads requests across healthy endpoints in round_robin mode', async () => {
    const h = harness(['a', 'b'], { strategy: 'round_robin' });
    await h.llm.chat(PARAMS);
    await h.llm.chat(PARAMS);
    await h.llm.chat(PARAMS);
    expect(h.calls.get('a')).toBe(2);
    expect(h.calls.get('b')).toBe(1);
  });

  it('builds each endpoint LLM lazily and reuses it across retries', async () => {
    const h = harness(['a', 'b']);
    h.setBehavior('a', async () => {
      throw new APIProviderRateLimitError('limited');
    });
    await h.llm.chat(PARAMS);
    await h.llm.chat(PARAMS);
    expect(h.builds.filter((name) => name === 'a')).toHaveLength(1);
    expect(h.builds.filter((name) => name === 'b')).toHaveLength(1);
  });

  it('exposes the primary endpoint metadata', () => {
    const h = harness(['a', 'b']);
    expect(h.llm.modelName).toBe('mock-model');
    expect(h.llm.systemPrompt).toBe('sys');
    expect(h.llm.capability).toBe(UNKNOWN_CAPABILITY);
  });
});

describe('Agent pool wiring (per-endpoint auth)', () => {
  it('does not leak the OAuth primary token into the static-key fallback endpoint', async () => {
    const cfg: KimiConfig = {
      providers: {
        primary: { type: 'kimi', oauth: { storage: 'file', key: 'test-oauth' } },
        secondary: { type: 'openai', apiKey: 'secondary-key', baseUrl: 'http://127.0.0.1:9/v1' },
      },
      models: {
        pooled: { provider: ['primary', 'secondary'], model: 'm', maxContextSize: 1_000_000 },
      },
    };
    const calls: Array<{ providerName: string; authApiKey?: string }> = [];
    const customGenerate: NonNullable<AgentOptions['generate']> = async (
      provider,
      _systemPrompt,
      _tools,
      _history,
      callbacks,
      options,
    ) => {
      calls.push({ providerName: provider.name, authApiKey: options?.auth?.apiKey });
      if (provider.name === 'kimi') {
        throw new APIStatusError(401, 'managed token rejected');
      }
      await callbacks?.onMessagePart?.({ type: 'text', text: 'ok from secondary' });
      return {
        id: 'mock-secondary',
        message: {
          role: 'assistant' as const,
          content: [{ type: 'text' as const, text: 'ok from secondary' }],
          toolCalls: [],
        },
        usage: { inputOther: 1, output: 1, inputCacheRead: 0, inputCacheCreation: 0 },
        finishReason: 'completed' as const,
        rawFinishReason: 'stop',
        traceId: null,
      };
    };
    const manager = new ProviderManager({
      config: cfg,
      resolveOAuthTokenProvider: () =>
        ({ getAccessToken: async () => 'primary-token' }) as never,
    });
    const ctx = testAgent({
      initialConfig: cfg,
      providerManager: manager,
      generate: customGenerate,
    });
    ctx.agent.config.update({ modelAlias: 'pooled', thinkingEffort: 'off' });

    await ctx.agent.llm.chat({
      messages: [],
      tools: [],
      signal: new AbortController().signal,
    });

    // The OAuth endpoint carries its own token (one forced-refresh retry → 2 calls).
    const primaryCalls = calls.filter((call) => call.providerName === 'kimi');
    expect(primaryCalls.length).toBeGreaterThan(0);
    expect(primaryCalls.every((call) => call.authApiKey === 'primary-token')).toBe(true);

    // The static-key fallback must never receive the primary's OAuth token:
    // no auth override means its own `api_key` from config is used.
    const secondaryCalls = calls.filter((call) => call.providerName === 'openai');
    expect(secondaryCalls).toHaveLength(1);
    expect(secondaryCalls[0]?.authApiKey).toBeUndefined();
  });
});
