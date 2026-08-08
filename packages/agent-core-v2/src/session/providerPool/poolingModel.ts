/**
 * `providerPool` domain (L6) — `PoolingModel`, the pool-backed `Model`.
 *
 * Wraps one endpoint `Model` per pool provider and fails over inside
 * `request()`: a rate-limited (429) endpoint is cooled down in the
 * session-shared `PoolHealthRegistry` and the request is retried on the next
 * healthy endpoint, without consuming the outer `stepRetry` attempt budget.
 * Only when every endpoint is limited/down does the request throw — an
 * aggregate 429 carrying the earliest cooldown expiry as `retryAfterMs`, so
 * the outer retry loop sleeps until the soonest possible recovery (half-open
 * probe).
 *
 * Failover is deliberately scoped to transient provider conditions:
 *   - 429 / quota errors      → mark limited, try next endpoint
 *   - 401 / 403               → mark down (session), try next endpoint
 *   - connection/timeout/5xx  → try next endpoint without poisoning health
 * Everything else (context overflow, structural 4xx, image-format, aborts)
 * is deterministic and rethrown immediately — another endpoint would fail
 * the same way. Errors cross the `Model.request` boundary as coded `Error2`s
 * (see `translateProviderError`), so classification runs on the unwrapped
 * cause. An attempt that already streamed content to the caller is never
 * silently restarted — replaying the stream would duplicate it.
 *
 * The `with*` forks map over every endpoint so per-request overrides
 * (thinking, generation kwargs, completion-token cap) apply identically to
 * whichever endpoint serves the request. Surface metadata comes from the
 * primary (first-declared) endpoint.
 *
 * Port of v1 `agent-core/agent/turn/pooling-llm.ts` onto the v2 god-object
 * `Model` boundary.
 */

import { isAbortError } from '#/_base/utils/abort';
import { unwrapErrorCause } from '#/_base/errors/errors';
import { ErrorCodes, isError2 } from '#/errors';
import type { ModelCapability } from '#/app/llmProtocol/capability';
import {
  APIConnectionError,
  APIEmptyResponseError,
  APIProviderRateLimitError,
  APIStatusError,
  APITimeoutError,
  isProviderRateLimitError,
} from '#/app/llmProtocol/errors';
import type { GenerationKwargs } from '#/app/llmProtocol/kimiOptions';
import type { VideoURLPart } from '#/app/llmProtocol/message';
import type { MaxCompletionTokensOptions, VideoUploadInput } from '#/app/llmProtocol/request';
import type { ThinkingEffort } from '#/app/llmProtocol/thinkingEffort';
import type { Protocol, ProtocolProviderOptions } from '#/app/protocol/protocol';
import type {
  AuthProvider,
  LLMEvent,
  LLMRequestInput,
  Model,
  ModelRequestOptions,
} from '#/app/model/modelInstance';

import type { PoolHealthRegistry, PoolOptions } from './poolHealth';
import type { ProviderFailoverInfo } from './providerPool';

export interface PoolingModelConfig {
  readonly alias: string;
  readonly endpoints: readonly Model[];
  readonly registry: PoolHealthRegistry;
  /** Live pool options (strategy etc.) so config reloads apply per request. */
  readonly options: () => PoolOptions;
  readonly onFailover?: ((info: ProviderFailoverInfo) => void) | undefined;
  readonly onRecovered?: ((endpointName: string) => void) | undefined;
}

const TRANSIENT_STATUS_CODES = new Set([408, 409, 500, 502, 503, 504, 529]);

export class PoolingModel implements Model {
  private readonly config: PoolingModelConfig;

  constructor(config: PoolingModelConfig) {
    this.config = config;
  }

  private get primary(): Model {
    const primary = this.config.endpoints[0];
    if (primary === undefined) {
      throw new Error(`Provider pool "${this.config.alias}" has no endpoints.`);
    }
    return primary;
  }

  get id(): string {
    return this.primary.id;
  }
  get name(): string {
    return this.primary.name;
  }
  get aliases(): readonly string[] {
    return this.primary.aliases;
  }
  get protocol(): Protocol {
    return this.primary.protocol;
  }
  get baseUrl(): string | undefined {
    return this.primary.baseUrl;
  }
  get headers(): Readonly<Record<string, string>> {
    return this.primary.headers;
  }
  get capabilities(): ModelCapability {
    return this.primary.capabilities;
  }
  get maxContextSize(): number {
    return this.primary.maxContextSize;
  }
  get maxOutputSize(): number | undefined {
    return this.primary.maxOutputSize;
  }
  get displayName(): string | undefined {
    return this.primary.displayName;
  }
  get reasoningKey(): string | undefined {
    return this.primary.reasoningKey;
  }
  get supportEfforts(): readonly string[] | undefined {
    return this.primary.supportEfforts;
  }
  get defaultEffort(): string | undefined {
    return this.primary.defaultEffort;
  }
  get thinkingEffort(): ThinkingEffort | null {
    return this.primary.thinkingEffort;
  }
  get maxCompletionTokens(): number | undefined {
    return this.primary.maxCompletionTokens;
  }
  get alwaysThinking(): boolean {
    return this.primary.alwaysThinking;
  }
  get providerType(): string | undefined {
    return this.primary.providerType;
  }
  get providerName(): string {
    return this.primary.providerName;
  }
  get authProvider(): AuthProvider {
    return this.primary.authProvider;
  }

  private mapEndpoints(map: (endpoint: Model) => Model): Model {
    return new PoolingModel({
      ...this.config,
      endpoints: this.config.endpoints.map(map),
    });
  }

  withThinking(effort: ThinkingEffort): Model {
    return this.mapEndpoints((endpoint) => endpoint.withThinking(effort));
  }

  withMaxCompletionTokens(n: number, options?: MaxCompletionTokensOptions): Model {
    return this.mapEndpoints((endpoint) => endpoint.withMaxCompletionTokens(n, options));
  }

  withGenerationKwargs(kwargs: GenerationKwargs): Model {
    return this.mapEndpoints((endpoint) => endpoint.withGenerationKwargs(kwargs));
  }

  withProviderOptions(options: ProtocolProviderOptions): Model {
    return this.mapEndpoints((endpoint) => endpoint.withProviderOptions(options));
  }

  withThinkingKeep(keep: string): Model {
    return this.mapEndpoints((endpoint) => endpoint.withThinkingKeep(keep));
  }

  request(
    input: LLMRequestInput,
    signal?: AbortSignal,
    options?: ModelRequestOptions,
  ): AsyncIterable<LLMEvent> {
    return this.runPooled(input, signal, options);
  }

  async uploadVideo(
    input: string | VideoUploadInput,
    options?: { readonly signal?: AbortSignal },
  ): Promise<VideoURLPart> {
    const upload = this.primary.uploadVideo;
    if (upload === undefined) {
      throw new Error(
        `Model "${this.id}" (protocol=${this.protocol}) does not support video upload`,
      );
    }
    return upload.call(this.primary, input, options);
  }

  private async *runPooled(
    input: LLMRequestInput,
    signal: AbortSignal | undefined,
    options: ModelRequestOptions | undefined,
  ): AsyncGenerator<LLMEvent, void, void> {
    const { endpoints, registry } = this.config;
    const names = endpoints.map((endpoint) => endpoint.providerName);
    const candidates = registry.orderedCandidates(this.config.alias, names, this.config.options().strategy);

    let lastRateLimitError: unknown;
    let lastTransientError: unknown;

    for (let index = 0; index < candidates.length; index += 1) {
      const name = candidates[index]!;
      const endpoint = endpoints.find((entry) => entry.providerName === name);
      if (endpoint === undefined) continue;
      const recovering = registry.isRecovering(name);
      let streamed = false;
      try {
        for await (const event of endpoint.request(input, signal, options)) {
          if (event.type === 'part' || event.type === 'usage') streamed = true;
          yield event;
        }
        registry.markHealthy(name);
        if (recovering) this.config.onRecovered?.(name);
        return;
      } catch (error) {
        if (isAbortError(error) || signal?.aborted === true) throw error;
        // Once content reached the caller the attempt cannot be silently
        // restarted — replaying the stream would duplicate it.
        if (streamed) throw error;

        const raw = unwrapErrorCause(error);
        const next = candidates[index + 1];
        if (isProviderRateLimitError(raw)) {
          lastRateLimitError = raw;
          registry.markLimited(name, readRetryAfterMs(raw));
          this.config.onFailover?.({ from: name, to: next, reason: 'rate_limit', error });
          continue;
        }
        if (isAuthRejection(raw)) {
          registry.markDown(name);
          this.config.onFailover?.({ from: name, to: next, reason: 'auth', error });
          continue;
        }
        if (isTransientProviderError(raw)) {
          lastTransientError ??= raw;
          this.config.onFailover?.({ from: name, to: next, reason: 'transient', error });
          continue;
        }
        throw error;
      }
    }

    // No endpoint produced a response. Prefer the rate-limit aggregate so the
    // outer retry sleeps until the earliest cooldown expiry; otherwise surface
    // the transient error for the standard retryable path.
    const remainingMs = registry.minCooldownRemainingMs(names);
    if (lastRateLimitError !== undefined || remainingMs !== undefined) {
      throw poolExhaustedError(lastRateLimitError, remainingMs, endpoints.length);
    }
    if (lastTransientError !== undefined) throw lastTransientError;
    throw poolExhaustedError(undefined, undefined, endpoints.length);
  }
}

function isTransientProviderError(error: unknown): boolean {
  if (error instanceof APIConnectionError || error instanceof APITimeoutError) return true;
  if (error instanceof APIEmptyResponseError) return true;
  return error instanceof APIStatusError && TRANSIENT_STATUS_CODES.has(error.statusCode);
}

/**
 * Auth rejections that justify failing over to the next pool endpoint:
 * raw 401/403 status errors, plus the coded errors produced by the OAuth
 * request-auth layer once its internal refresh-and-retry is exhausted
 * (`provider.auth_error`) or when the provider was never logged in
 * (`auth.login_required`).
 */
function isAuthRejection(error: unknown): boolean {
  if (error instanceof APIStatusError && (error.statusCode === 401 || error.statusCode === 403)) {
    return true;
  }
  return (
    isError2(error) &&
    (error.code === ErrorCodes.PROVIDER_AUTH_ERROR ||
      error.code === ErrorCodes.AUTH_LOGIN_REQUIRED)
  );
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
