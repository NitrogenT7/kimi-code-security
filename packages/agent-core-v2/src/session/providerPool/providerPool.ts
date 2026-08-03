/**
 * `providerPool` domain (L6) — `ISessionProviderPoolService` contract.
 *
 * Rate-limit failover across an ordered pool of providers declared on a model
 * alias (`provider = ["a", "b", ...]`). The Session-scope service owns the
 * shared endpoint-health registry and the hourly recovery prober; the
 * request-path failover wrapper (`PoolingModel`) is created per agent from
 * `resolvePooledModel` and shares that registry, so a key rate-limited by one
 * agent cools down for every agent in the session. Single-provider aliases
 * resolve to `undefined` here and keep the classic `IModelResolver.resolve`
 * path byte-identically.
 */

import { createDecorator, type ServiceIdentifier } from '#/_base/di/instantiation';
import type { Model } from '#/app/model/modelInstance';

import type { PoolHealthRegistry } from './poolHealth';

export interface ProviderFailoverInfo {
  readonly from: string;
  readonly to: string | undefined;
  readonly reason: 'rate_limit' | 'auth' | 'transient';
  readonly error: unknown;
}

/** Per-requester hooks; the pool service supplies none of its own. */
export interface ProviderPoolRequestHooks {
  readonly onFailover?: ((info: ProviderFailoverInfo) => void) | undefined;
  readonly onRecovered?: ((endpointName: string) => void) | undefined;
}

export interface ISessionProviderPoolService {
  readonly _serviceBrand: undefined;

  /** Session-shared endpoint health view (cheap even when no pool is configured). */
  readonly health: PoolHealthRegistry;

  /**
   * When the model alias declares an ordered provider pool
   * (`provider = ["a", "b", ...]`), returns a failover `Model` over every
   * endpoint in priority order. `undefined` for single-provider aliases —
   * callers keep the classic resolver path.
   */
  resolvePooledModel(alias: string, hooks?: ProviderPoolRequestHooks): Model | undefined;
}

export const ISessionProviderPoolService: ServiceIdentifier<ISessionProviderPoolService> =
  createDecorator<ISessionProviderPoolService>('sessionProviderPoolService');
