/**
 * `providerPool` domain (L6) — `ISessionProviderPoolService` implementation.
 *
 * Owns the session-shared `PoolHealthRegistry` and the recovery prober
 * lifecycle (started on the first pooled resolution — no pool configured
 * means no timer at all — and stopped on scope disposal; the Session owns
 * start/stop, like v1 `Session.close`). `resolvePooledModel` materializes
 * one endpoint `Model` per pool provider through `IModelResolver` and wraps
 * them in a `PoolingModel`; the prober re-resolves endpoints from the
 * recorded alias so config edits are picked up on the next probe. Prober
 * health notices ride the main agent's `IEventBus` as `warning` events
 * (code `provider-pool-health`), mirroring v1's session-level RPC notices.
 * Bound at Session scope; Eager so the shared `health` registry is available
 * from session start, like v1's always-present `ProviderManager.poolHealth`.
 */

import { InstantiationType } from '#/_base/di/extensions';
import { Disposable } from '#/_base/di/lifecycle';
import { LifecycleScope, registerScopedService } from '#/_base/di/scope';
import { unwrapErrorCause } from '#/_base/errors/errors';
import { IConfigService } from '#/app/config/config';
import { IEventBus } from '#/app/event/eventBus';
import { APIEmptyResponseError } from '#/app/llmProtocol/errors';
import { createUserMessage } from '#/app/llmProtocol/message';
import { IModelService, providerNamesOf } from '#/app/model/model';
import type { Model } from '#/app/model/modelInstance';
import { IModelResolver } from '#/app/model/modelResolver';
import { IAgentLifecycleService, MAIN_AGENT_ID } from '#/session/agentLifecycle/agentLifecycle';

import { POOL_SECTION, type PoolConfig } from './configSection';
import {
  PoolHealthRegistry,
  PoolRecoveryProber,
  resolvePoolOptions,
  type PoolOptions,
} from './poolHealth';
import { PoolingModel } from './poolingModel';
import { ISessionProviderPoolService, type ProviderPoolRequestHooks } from './providerPool';

const PROBE_SYSTEM_PROMPT = 'You are a connectivity check. Reply with a single word: ok.';
const PROBE_TIMEOUT_MS = 30_000;

export class SessionProviderPoolService extends Disposable implements ISessionProviderPoolService {
  declare readonly _serviceBrand: undefined;

  readonly health: PoolHealthRegistry;
  private readonly prober: PoolRecoveryProber;
  /** Latest model alias that resolved each pool endpoint, for recovery probes. */
  private readonly poolEndpoints = new Map<string, string>();

  constructor(
    @IConfigService private readonly config: IConfigService,
    @IModelService private readonly models: IModelService,
    @IModelResolver private readonly modelResolver: IModelResolver,
    @IAgentLifecycleService private readonly agentLifecycle: IAgentLifecycleService,
  ) {
    super();
    this.health = new PoolHealthRegistry(() => this.poolOptions());
    this.prober = new PoolRecoveryProber({
      registry: this.health,
      options: () => this.poolOptions(),
      probe: (name) => this.probeEndpoint(name),
      onRecovered: (name) => {
        this.emitPoolHealthNotice(
          `Provider "${name}" recovered from rate limiting; it is back in rotation.`,
        );
      },
      onDown: (name) => {
        this.emitPoolHealthNotice(
          `Provider "${name}" was removed from the pool rotation after repeated auth failures.`,
        );
      },
    });
    // The prober starts on the first pooled resolution, not at construction:
    // with no pool configured there is nothing to probe, and an idle hourly
    // timer must not exist (it also keeps fake-timer test harnesses from
    // spinning). `start()` is idempotent.
  }

  override dispose(): void {
    this.prober.stop();
    super.dispose();
  }

  resolvePooledModel(alias: string, hooks?: ProviderPoolRequestHooks): Model | undefined {
    const configured = this.models.get(alias);
    if (configured === undefined) return undefined;
    const defaultProvider = this.config.get<string>('defaultProvider');
    const names =
      providerNamesOf(configured) ??
      (defaultProvider === undefined ? undefined : [defaultProvider]);
    if (names === undefined || names.length <= 1) return undefined;
    const endpoints = names.map((name) => this.modelResolver.resolveWithProvider(alias, name));
    for (const name of names) {
      this.poolEndpoints.set(name, alias);
    }
    this.prober.start();
    return new PoolingModel({
      alias,
      endpoints,
      registry: this.health,
      options: () => this.poolOptions(),
      onFailover: hooks?.onFailover,
      onRecovered: hooks?.onRecovered,
    });
  }

  private poolOptions(): PoolOptions {
    return resolvePoolOptions(this.config.get<PoolConfig>(POOL_SECTION));
  }

  /**
   * One minimal request against a pool endpoint to test whether its rate
   * limit has lifted. A 200 with an empty/one-token body still proves quota,
   * so `APIEmptyResponseError` counts as recovered. Endpoints whose config
   * disappeared since resolution are treated as healthy (no longer probed).
   * Errors are rethrown unwrapped so the prober classifies the raw provider
   * error (the `Model.request` boundary wraps them in coded `Error2`s).
   */
  private async probeEndpoint(name: string): Promise<void> {
    const alias = this.poolEndpoints.get(name);
    if (alias === undefined) return;
    const model = this.modelResolver.resolveWithProvider(alias, name).withMaxCompletionTokens(1);
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      controller.abort();
    }, PROBE_TIMEOUT_MS);
    try {
      const request = model.request(
        {
          systemPrompt: PROBE_SYSTEM_PROMPT,
          tools: [],
          messages: [createUserMessage('ping')],
        },
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

  private emitPoolHealthNotice(message: string): void {
    try {
      const main = this.agentLifecycle.get(MAIN_AGENT_ID);
      main?.accessor
        .get(IEventBus)
        .publish({ type: 'warning', code: 'provider-pool-health', message });
    } catch {
      // Pool health notices must never block session startup or shutdown.
    }
  }
}

registerScopedService(
  LifecycleScope.Session,
  ISessionProviderPoolService,
  SessionProviderPoolService,
  InstantiationType.Eager,
  'providerPool',
);
