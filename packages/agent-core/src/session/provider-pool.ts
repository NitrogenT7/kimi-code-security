/**
 * Provider-pool runtime state: endpoint health tracking, cooldown backoff,
 * and the hourly recovery prober.
 *
 * A pool is declared on a model alias (`provider = ["a", "b", ...]`). This
 * module owns the runtime half: which endpoint is healthy, how long a
 * rate-limited endpoint stays out of rotation, and the active probe that
 * checks every `probeIntervalMs` whether a limited endpoint has recovered.
 * Request-time failover lives in `agent/turn/pooling-llm.ts`; resolution of
 * pool endpoints lives in `session/provider-manager.ts`.
 */

import { APIStatusError, isProviderRateLimitError } from '@moonshot-ai/kosong';

import type { PoolConfig } from '#/config/schema';

export interface PoolOptions {
  readonly strategy: 'priority' | 'round_robin';
  readonly cooldownBaseMs: number;
  readonly cooldownMaxMs: number;
  readonly probeIntervalMs: number;
  readonly probeEnabled: boolean;
}

export const DEFAULT_POOL_OPTIONS: PoolOptions = {
  strategy: 'priority',
  cooldownBaseMs: 60_000,
  cooldownMaxMs: 1_800_000,
  probeIntervalMs: 3_600_000,
  probeEnabled: true,
};

export function resolvePoolOptions(config: PoolConfig | undefined): PoolOptions {
  return {
    strategy: config?.strategy ?? DEFAULT_POOL_OPTIONS.strategy,
    cooldownBaseMs: config?.cooldownBaseMs ?? DEFAULT_POOL_OPTIONS.cooldownBaseMs,
    cooldownMaxMs: config?.cooldownMaxMs ?? DEFAULT_POOL_OPTIONS.cooldownMaxMs,
    probeIntervalMs: config?.probeIntervalMs ?? DEFAULT_POOL_OPTIONS.probeIntervalMs,
    probeEnabled: config?.probeEnabled ?? DEFAULT_POOL_OPTIONS.probeEnabled,
  };
}

export type EndpointHealthStatus = 'healthy' | 'limited' | 'down';

interface EndpointState {
  readonly status: 'limited' | 'down';
  consecutiveFailures: number;
  cooldownUntilMs?: number;
}

export interface EndpointHealthSnapshot {
  readonly name: string;
  readonly status: EndpointHealthStatus;
  readonly consecutiveFailures: number;
  readonly cooldownUntilMs?: number;
}

/**
 * Session-scoped health view of pool endpoints, shared by every agent so a
 * key rate-limited by the main agent is not retried by subagents. Options are
 * read live through the injected getter so config reloads apply without
 * rebuilding the registry.
 */
export class PoolHealthRegistry {
  private readonly states = new Map<string, EndpointState>();
  private readonly roundRobinCursors = new Map<string, number>();

  constructor(
    private readonly options: () => PoolOptions,
    private readonly now: () => number = Date.now,
  ) {}

  /** User-facing health: a limited endpoint whose cooldown expired counts as healthy. */
  status(name: string): EndpointHealthStatus {
    const state = this.states.get(name);
    if (state === undefined) return 'healthy';
    if (state.status === 'limited' && this.cooldownExpired(state)) return 'healthy';
    return state.status;
  }

  snapshot(name: string): EndpointHealthSnapshot {
    const state = this.states.get(name);
    return {
      name,
      status: this.status(name),
      consecutiveFailures: state?.consecutiveFailures ?? 0,
      cooldownUntilMs: state?.cooldownUntilMs,
    };
  }

  /** Eligible to receive a request right now (not down, not actively cooling). */
  isAvailable(name: string): boolean {
    return this.status(name) === 'healthy';
  }

  /** Limited but past its cooldown — the next request is the half-open trial. */
  isRecovering(name: string): boolean {
    const state = this.states.get(name);
    return state?.status === 'limited' && this.cooldownExpired(state);
  }

  /** Every endpoint currently marked limited, including those still cooling (prober input). */
  limitedNames(): readonly string[] {
    const names: string[] = [];
    for (const [name, state] of this.states) {
      if (state.status === 'limited') names.push(name);
    }
    return names;
  }

  markLimited(name: string, retryAfterMs?: number): void {
    const previous = this.states.get(name);
    const consecutiveFailures = (previous?.consecutiveFailures ?? 0) + 1;
    const options = this.options();
    const backoff = Math.min(
      options.cooldownBaseMs * Math.pow(2, consecutiveFailures - 1),
      options.cooldownMaxMs,
    );
    const cooldownMs = Math.max(retryAfterMs ?? 0, backoff);
    this.states.set(name, {
      status: 'limited',
      consecutiveFailures,
      cooldownUntilMs: this.now() + cooldownMs,
    });
  }

  markDown(name: string): void {
    const previous = this.states.get(name);
    this.states.set(name, {
      status: 'down',
      consecutiveFailures: previous?.consecutiveFailures ?? 0,
    });
  }

  markHealthy(name: string): void {
    this.states.delete(name);
  }

  /**
   * Shortest remaining cooldown across the given endpoints, or `undefined`
   * when none are cooling. Used as the aggregate Retry-After when the whole
   * pool is exhausted.
   */
  minCooldownRemainingMs(names: readonly string[]): number | undefined {
    const now = this.now();
    let min: number | undefined;
    for (const name of names) {
      const state = this.states.get(name);
      if (state?.status !== 'limited' || state.cooldownUntilMs === undefined) continue;
      const remaining = state.cooldownUntilMs - now;
      if (remaining <= 0) continue;
      min = min === undefined ? remaining : Math.min(min, remaining);
    }
    return min;
  }

  /**
   * Attempt order for one request: available endpoints, healthy first (in
   * declaration order), then half-open recovering ones. `round_robin` rotates
   * the starting point per pool key across calls to spread load.
   */
  orderedCandidates(
    poolKey: string,
    names: readonly string[],
    strategy: PoolOptions['strategy'],
  ): readonly string[] {
    const healthy = names.filter((name) => this.isAvailable(name) && !this.isRecovering(name));
    const recovering = names.filter((name) => this.isRecovering(name));
    const ordered = [...healthy, ...recovering];
    if (strategy !== 'round_robin' || ordered.length <= 1) return ordered;
    const cursor = (this.roundRobinCursors.get(poolKey) ?? 0) % ordered.length;
    this.roundRobinCursors.set(poolKey, cursor + 1);
    return [...ordered.slice(cursor), ...ordered.slice(0, cursor)];
  }

  private cooldownExpired(state: EndpointState): boolean {
    return state.cooldownUntilMs !== undefined && this.now() >= state.cooldownUntilMs;
  }
}

export interface PoolRecoveryProberHooks {
  readonly onRecovered?: ((name: string) => void) | undefined;
  readonly onDown?: ((name: string) => void) | undefined;
  readonly onProbeError?: ((name: string, error: unknown) => void) | undefined;
}

export interface PoolRecoveryProberOptions extends PoolRecoveryProberHooks {
  readonly registry: PoolHealthRegistry;
  /** Live reads so config reloads retune interval/enabled without a restart. */
  readonly options: () => PoolOptions;
  /**
   * One minimal request against the endpoint. Resolve = quota recovered;
   * reject with a 429 for still-limited, 401/403 for dead credentials,
   * anything else for "cannot tell — try again next interval".
   */
  readonly probe: (endpointName: string) => Promise<void>;
  readonly setIntervalFn?: typeof setInterval;
  readonly clearIntervalFn?: typeof clearInterval;
  readonly random?: () => number;
}

/**
 * Hourly (configurable) active recovery check for rate-limited endpoints.
 * Complements the passive half-open path: cooldown expiry alone only
 * recovers an endpoint when real traffic happens to arrive, while the prober
 * notices recovery even on an idle session. Probes are 1-token requests and
 * can be disabled with `pool.probeEnabled = false`.
 */
export class PoolRecoveryProber {
  private timer: ReturnType<typeof setInterval> | undefined;
  private readonly inFlight = new Set<string>();

  constructor(private readonly proberOptions: PoolRecoveryProberOptions) {}

  start(): void {
    if (this.timer !== undefined) return;
    this.scheduleNext();
  }

  stop(): void {
    if (this.timer === undefined) return;
    (this.proberOptions.clearIntervalFn ?? clearInterval)(this.timer);
    this.timer = undefined;
  }

  private scheduleNext(): void {
    const base = this.proberOptions.options().probeIntervalMs;
    const jitter = 0.9 + 0.2 * (this.proberOptions.random ?? Math.random)();
    this.timer = (this.proberOptions.setIntervalFn ?? setInterval)(() => {
      void this.tick();
    }, base * jitter);
    // Probe ticks must never keep the process alive on shutdown.
    this.timer.unref?.();
  }

  private async tick(): Promise<void> {
    const options = this.proberOptions.options();
    if (!options.probeEnabled) return;
    // Re-jitter the cadence every tick.
    (this.proberOptions.clearIntervalFn ?? clearInterval)(this.timer!);
    this.timer = undefined;
    this.scheduleNext();

    const registry = this.proberOptions.registry;
    for (const name of registry.limitedNames()) {
      if (this.inFlight.has(name)) continue;
      this.inFlight.add(name);
      void this.probeOne(name).finally(() => {
        this.inFlight.delete(name);
      });
    }
  }

  private async probeOne(name: string): Promise<void> {
    const registry = this.proberOptions.registry;
    try {
      await this.proberOptions.probe(name);
      registry.markHealthy(name);
      this.proberOptions.onRecovered?.(name);
    } catch (error) {
      if (isProviderRateLimitError(error)) {
        const retryAfterMs =
          error instanceof APIStatusError ? (error.retryAfterMs ?? undefined) : undefined;
        registry.markLimited(name, retryAfterMs);
        return;
      }
      if (error instanceof APIStatusError && (error.statusCode === 401 || error.statusCode === 403)) {
        registry.markDown(name);
        this.proberOptions.onDown?.(name);
        return;
      }
      // Connection errors, timeouts, 5xx: no information about quota — keep the
      // endpoint limited and let the next interval (or real traffic) retry.
      this.proberOptions.onProbeError?.(name, error);
    }
  }
}
