/**
 * Pool-backed implementation of the loop `LLM` interface.
 *
 * Wraps one `KosongLLM` per pool endpoint and fails over inside `chat()`:
 * a rate-limited (429) endpoint is cooled down in the session-shared
 * `PoolHealthRegistry` and the request is retried on the next healthy
 * endpoint, without consuming the outer `chatWithRetry` attempt budget.
 * Only when every endpoint is limited/down does `chat` throw — an aggregate
 * 429 carrying the earliest cooldown expiry as `retryAfterMs`, so the outer
 * retry loop sleeps until the soonest possible recovery (half-open probe).
 *
 * Failover is deliberately scoped to transient provider conditions:
 *   - 429 / quota errors      → mark limited, try next endpoint
 *   - 401 / 403               → mark down (session), try next endpoint
 *   - connection/timeout/5xx  → try next endpoint without poisoning health
 * Everything else (context overflow, structural 4xx, image-format, aborts)
 * is deterministic and rethrown immediately — another endpoint would fail
 * the same way.
 */

import {
  APIConnectionError,
  APIEmptyResponseError,
  APIProviderRateLimitError,
  APIStatusError,
  APITimeoutError,
  isProviderRateLimitError,
  isRetryableGenerateError,
  type ModelCapability,
} from '@moonshot-ai/kosong';

import type { LLM, LLMChatParams, LLMChatResponse } from '../../loop';
import { isAbortError } from '../../loop/errors';
import type {
  ResolvedProviderPool,
  ResolvedRuntimeProvider,
} from '../../session/provider-manager';
import type { PoolHealthRegistry, PoolOptions } from '../../session/provider-pool';

import type { KosongLLM } from './kosong-llm';

export interface ProviderFailoverInfo {
  readonly from: string;
  readonly to: string | undefined;
  readonly reason: 'rate_limit' | 'auth' | 'transient';
  readonly error: unknown;
}

export interface PoolingLLMConfig {
  readonly pool: ResolvedProviderPool;
  readonly registry: PoolHealthRegistry;
  /** Live pool options (strategy etc.) so config reloads apply per request. */
  readonly options: () => PoolOptions;
  readonly systemPrompt: string;
  readonly buildEndpointLLM: (endpoint: ResolvedRuntimeProvider) => KosongLLM;
  readonly onFailover?: ((info: ProviderFailoverInfo) => void) | undefined;
  readonly onRecovered?: ((endpointName: string) => void) | undefined;
}

const TRANSIENT_STATUS_CODES = [408, 409, 500, 502, 503, 504, 529];

export class PoolingLLM implements LLM {
  readonly systemPrompt: string;
  readonly modelName: string;
  readonly capability?: ModelCapability | undefined;

  private readonly pool: ResolvedProviderPool;
  private readonly registry: PoolHealthRegistry;
  private readonly options: () => PoolOptions;
  private readonly buildEndpointLLM: (endpoint: ResolvedRuntimeProvider) => KosongLLM;
  private readonly onFailover: ((info: ProviderFailoverInfo) => void) | undefined;
  private readonly onRecovered: ((endpointName: string) => void) | undefined;
  private readonly endpointLLMs = new Map<string, KosongLLM>();

  constructor(config: PoolingLLMConfig) {
    this.pool = config.pool;
    this.registry = config.registry;
    this.options = config.options;
    this.systemPrompt = config.systemPrompt;
    this.buildEndpointLLM = config.buildEndpointLLM;
    this.onFailover = config.onFailover;
    this.onRecovered = config.onRecovered;
    // Surface metadata comes from the primary (first-declared) endpoint.
    const primary = config.pool.endpoints[0];
    this.modelName = primary?.provider.model ?? config.pool.alias;
    this.capability = primary?.modelCapabilities;
  }

  async chat(params: LLMChatParams): Promise<LLMChatResponse> {
    const endpoints = this.pool.endpoints;
    const names = endpoints.map((endpoint) => endpoint.providerName);
    const candidates = this.registry.orderedCandidates(this.pool.alias, names, this.options().strategy);

    let lastRateLimitError: unknown;
    let lastTransientError: unknown;

    for (let index = 0; index < candidates.length; index += 1) {
      const name = candidates[index]!;
      const endpoint = endpoints.find((entry) => entry.providerName === name);
      if (endpoint === undefined) continue;
      const recovering = this.registry.isRecovering(name);
      try {
        const response = await this.endpointLLM(endpoint).chat(params);
        this.registry.markHealthy(name);
        if (recovering) this.onRecovered?.(name);
        return response;
      } catch (error) {
        if (isAbortError(error) || params.signal.aborted) throw error;

        const next = candidates[index + 1];
        if (isProviderRateLimitError(error)) {
          lastRateLimitError = error;
          this.registry.markLimited(name, readRetryAfterMs(error));
          this.onFailover?.({ from: name, to: next, reason: 'rate_limit', error });
          continue;
        }
        if (error instanceof APIStatusError && (error.statusCode === 401 || error.statusCode === 403)) {
          this.registry.markDown(name);
          this.onFailover?.({ from: name, to: next, reason: 'auth', error });
          continue;
        }
        if (isTransientProviderError(error)) {
          lastTransientError ??= error;
          this.onFailover?.({ from: name, to: next, reason: 'transient', error });
          continue;
        }
        throw error;
      }
    }

    // No endpoint produced a response. Prefer the rate-limit aggregate so the
    // outer retry sleeps until the earliest cooldown expiry; otherwise surface
    // the transient error for the standard retryable path.
    const remainingMs = this.registry.minCooldownRemainingMs(names);
    if (lastRateLimitError !== undefined || remainingMs !== undefined) {
      throw poolExhaustedError(lastRateLimitError, remainingMs, endpoints.length);
    }
    if (lastTransientError !== undefined) throw lastTransientError;
    throw poolExhaustedError(undefined, undefined, endpoints.length);
  }

  isRetryableError(error: unknown): boolean {
    return isRetryableGenerateError(error);
  }

  private endpointLLM(endpoint: ResolvedRuntimeProvider): KosongLLM {
    let llm = this.endpointLLMs.get(endpoint.providerName);
    if (llm === undefined) {
      llm = this.buildEndpointLLM(endpoint);
      this.endpointLLMs.set(endpoint.providerName, llm);
    }
    return llm;
  }
}

function isTransientProviderError(error: unknown): boolean {
  if (error instanceof APIConnectionError || error instanceof APITimeoutError) return true;
  if (error instanceof APIEmptyResponseError) return true;
  return error instanceof APIStatusError && TRANSIENT_STATUS_CODES.includes(error.statusCode);
}

function readRetryAfterMs(error: unknown): number | undefined {
  if (!(error instanceof APIStatusError)) return undefined;
  return error.retryAfterMs === null || error.retryAfterMs <= 0 ? undefined : error.retryAfterMs;
}

function poolExhaustedError(
  cause: unknown,
  retryAfterMs: number | undefined,
  endpointCount: number,
): APIProviderRateLimitError {
  const detail = cause instanceof Error ? ` Last error: ${cause.message}` : '';
  return new APIProviderRateLimitError(
    `All ${String(endpointCount)} providers in the pool are rate limited or down.${detail}`,
    undefined,
    retryAfterMs ?? null,
    undefined,
  );
}
