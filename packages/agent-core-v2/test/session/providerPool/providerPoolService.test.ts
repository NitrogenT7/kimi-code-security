/**
 * `providerPool` domain — `ISessionProviderPoolService` scoped tests.
 *
 * Resolves the service by interface from a real Session scope (registry
 * cleared and re-registered per test) with App boundaries stubbed. Covers
 * pool resolution (single-provider aliases stay on the classic path), the
 * session-shared health registry, and the recovery-probe lifecycle: the
 * prober probes limited endpoints on the configured interval, publishes
 * `provider-pool-health` warnings through the main agent's event bus, and
 * stops when the scope is disposed.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { InstantiationType } from '#/_base/di/extensions';
import {
  LifecycleScope,
  _clearScopedRegistryForTests,
  registerScopedService,
} from '#/_base/di/scope';
import { createScopedTestHost, stubPair, type ScopedTestHost } from '#/_base/di/test';
import { IConfigService } from '#/app/config/config';
import { IEventBus } from '#/app/event/eventBus';
import type { LLMEvent, Model } from '#/app/model/modelInstance';
import { IModelService, type ModelConfig } from '#/app/model/model';
import { IModelResolver } from '#/app/model/modelResolver';
import { IAgentLifecycleService, MAIN_AGENT_ID } from '#/session/agentLifecycle/agentLifecycle';
import { POOL_SECTION, type PoolConfig } from '#/session/providerPool/configSection';
import { PoolingModel } from '#/session/providerPool/poolingModel';
import { ISessionProviderPoolService } from '#/session/providerPool/providerPool';
import { SessionProviderPoolService } from '#/session/providerPool/providerPoolService';

interface WarningLike {
  readonly type: string;
  readonly code?: string;
  readonly message: string;
}

describe('SessionProviderPoolService (scoped)', () => {
  let host: ScopedTestHost;
  let configValues: Record<string, unknown>;
  let models: Record<string, ModelConfig>;
  let resolveWithProvider: ReturnType<typeof vi.fn>;
  let warnings: WarningLike[];

  beforeEach(() => {
    vi.useFakeTimers();
    _clearScopedRegistryForTests();
    registerScopedService(
      LifecycleScope.Session,
      ISessionProviderPoolService,
      SessionProviderPoolService,
      InstantiationType.Eager,
      'providerPool',
    );
    configValues = { [POOL_SECTION]: { probeIntervalMs: 1000 } satisfies PoolConfig };
    models = {};
    warnings = [];
    resolveWithProvider = vi.fn((alias: string, name: string) => probeModel(alias, name));

    const eventBus = {
      publish: (event: WarningLike) => {
        warnings.push(event);
      },
      subscribe: () => ({ dispose: () => {} }),
    };
    const mainHandle = {
      accessor: {
        get: (id: unknown) => {
          if (id === IEventBus) return eventBus;
          throw new Error('unexpected service lookup');
        },
      },
    };

    host = createScopedTestHost([
      stubPair(IConfigService, {
        get: ((domain: string) => configValues[domain]) as unknown as IConfigService['get'],
      } as unknown as IConfigService),
      stubPair(IModelService, {
        get: ((id: string) => models[id]) as IModelService['get'],
      } as unknown as IModelService),
      stubPair(IModelResolver, {
        resolveWithProvider,
      } as unknown as IModelResolver),
      stubPair(IAgentLifecycleService, {
        get: (agentId: string) => (agentId === MAIN_AGENT_ID ? mainHandle : undefined),
      } as unknown as IAgentLifecycleService),
    ]);
  });

  afterEach(() => {
    host.dispose();
    vi.useRealTimers();
  });

  function session() {
    return host.child(LifecycleScope.Session, 's1');
  }

  it('returns undefined for single-provider and unknown aliases', () => {
    models['single'] = { provider: 'a', model: 'wire', maxContextSize: 1000 };
    models['flat'] = { baseUrl: 'https://example.test/v1', model: 'wire', maxContextSize: 1000 };
    const svc = session().accessor.get(ISessionProviderPoolService);

    expect(svc.resolvePooledModel('single')).toBeUndefined();
    expect(svc.resolvePooledModel('flat')).toBeUndefined();
    expect(svc.resolvePooledModel('missing')).toBeUndefined();
    expect(resolveWithProvider).not.toHaveBeenCalled();
  });

  it('resolves a pooled alias into a PoolingModel over every endpoint', () => {
    models['m'] = { provider: ['a', 'b'], model: 'wire', maxContextSize: 1000 };
    const svc = session().accessor.get(ISessionProviderPoolService);

    const pooled = svc.resolvePooledModel('m');

    expect(pooled).toBeInstanceOf(PoolingModel);
    expect(pooled?.providerName).toBe('a');
    expect(resolveWithProvider.mock.calls).toEqual([
      ['m', 'a'],
      ['m', 'b'],
    ]);
  });

  it('shares the health registry across pooled model instances', () => {
    models['m'] = { provider: ['a', 'b'], model: 'wire', maxContextSize: 1000 };
    const svc = session().accessor.get(ISessionProviderPoolService);
    svc.health.markLimited('a');

    const first = svc.resolvePooledModel('m');
    const second = svc.resolvePooledModel('m');

    expect(first).toBeInstanceOf(PoolingModel);
    expect(second).toBeInstanceOf(PoolingModel);
    expect(svc.health.status('a')).toBe('limited');
  });

  it('probes a limited endpoint on the interval and publishes a recovery warning', async () => {
    models['m'] = { provider: ['a', 'b'], model: 'wire', maxContextSize: 1000 };
    const svc = session().accessor.get(ISessionProviderPoolService);
    svc.resolvePooledModel('m');
    svc.health.markLimited('b');

    await vi.advanceTimersByTimeAsync(1200);

    expect(resolveWithProvider).toHaveBeenCalledWith('m', 'b');
    expect(svc.health.status('b')).toBe('healthy');
    expect(warnings).toEqual([
      {
        type: 'warning',
        code: 'provider-pool-health',
        message: 'Provider "b" recovered from rate limiting; it is back in rotation.',
      },
    ]);
  });

  it('stops probing once the session scope is disposed', async () => {
    models['m'] = { provider: ['a', 'b'], model: 'wire', maxContextSize: 1000 };
    const handle = session();
    const svc = handle.accessor.get(ISessionProviderPoolService);
    svc.resolvePooledModel('m');
    svc.health.markLimited('b');
    resolveWithProvider.mockClear();

    handle.dispose();
    await vi.advanceTimersByTimeAsync(5000);

    expect(resolveWithProvider).not.toHaveBeenCalled();
  });
});

/** Minimal endpoint Model: 1-token-capped probe requests drain immediately. */
function probeModel(alias: string, name: string): Model {
  const model: Model = {
    id: alias,
    name: 'wire',
    aliases: [],
    protocol: 'openai',
    baseUrl: undefined,
    headers: {},
    capabilities: {
      image_in: false,
      video_in: false,
      audio_in: false,
      thinking: false,
      tool_use: false,
      max_context_tokens: 1000,
    },
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
    request: async function* (): AsyncGenerator<LLMEvent, void, void> {
      yield { type: 'part', part: { type: 'text', text: 'ok' } };
    },
  };
  return model;
}
