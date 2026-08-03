/**
 * `providerPool` domain — `PoolHealthRegistry` / `PoolRecoveryProber` unit tests.
 *
 * Port of v1 `agent-core/test/session/provider-pool.test.ts` onto the v2
 * `llmProtocol` error classes. Both classes are pure (no `@IService` deps), so
 * they are constructed directly.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  APIConnectionError,
  APIProviderRateLimitError,
  APIStatusError,
} from '#/app/llmProtocol/errors';
import {
  DEFAULT_POOL_OPTIONS,
  PoolHealthRegistry,
  PoolRecoveryProber,
  resolvePoolOptions,
  type PoolOptions,
} from '#/session/providerPool/poolHealth';

function options(overrides: Partial<PoolOptions> = {}): PoolOptions {
  return { ...DEFAULT_POOL_OPTIONS, ...overrides };
}

describe('resolvePoolOptions', () => {
  it('applies defaults when nothing is configured', () => {
    expect(resolvePoolOptions(undefined)).toEqual(DEFAULT_POOL_OPTIONS);
  });

  it('lets explicit config win over defaults', () => {
    expect(
      resolvePoolOptions({ strategy: 'round_robin', cooldownBaseMs: 1000, probeEnabled: false }),
    ).toEqual({
      ...DEFAULT_POOL_OPTIONS,
      strategy: 'round_robin',
      cooldownBaseMs: 1000,
      probeEnabled: false,
    });
  });
});

describe('PoolHealthRegistry', () => {
  let now = 1_000_000;
  const registry = (): PoolHealthRegistry =>
    new PoolHealthRegistry(() => options({ cooldownBaseMs: 10_000, cooldownMaxMs: 100_000 }), () => now);

  beforeEach(() => {
    now = 1_000_000;
  });

  it('starts every endpoint healthy', () => {
    const r = registry();
    expect(r.status('a')).toBe('healthy');
    expect(r.isAvailable('a')).toBe(true);
  });

  it('cools a limited endpoint and half-opens it after cooldown expiry', () => {
    const r = registry();
    r.markLimited('a');
    expect(r.status('a')).toBe('limited');
    expect(r.isAvailable('a')).toBe(false);

    now += 10_000;
    expect(r.status('a')).toBe('healthy');
    expect(r.isAvailable('a')).toBe(true);
    expect(r.isRecovering('a')).toBe(true);
  });

  it('honors a server Retry-After longer than the computed backoff', () => {
    const r = registry();
    r.markLimited('a', 50_000);
    now += 10_000;
    expect(r.status('a')).toBe('limited');
    now += 40_000;
    expect(r.status('a')).toBe('healthy');
  });

  it('doubles the cooldown per consecutive failure and caps it', () => {
    const r = registry();
    r.markLimited('a');
    now += 10_000;
    r.markLimited('a');
    const afterSecond = r.snapshot('a').cooldownUntilMs;
    expect(afterSecond).toBe(now + 20_000);

    now += 20_000;
    r.markLimited('a');
    now += 40_000;
    r.markLimited('a');
    // Fourth consecutive failure: 10s * 2^3 = 80s (< 100s cap)
    expect(r.snapshot('a').cooldownUntilMs).toBe(now + 80_000);

    now += 80_000;
    r.markLimited('a');
    // Fifth: 160s clamped to the 100s cap
    expect(r.snapshot('a').cooldownUntilMs).toBe(now + 100_000);
  });

  it('markDown removes the endpoint from rotation until recovered externally', () => {
    const r = registry();
    r.markDown('a');
    expect(r.status('a')).toBe('down');
    expect(r.isAvailable('a')).toBe(false);
    now += 10_000_000;
    expect(r.status('a')).toBe('down');
    r.markHealthy('a');
    expect(r.status('a')).toBe('healthy');
  });

  it('markHealthy resets consecutive failures', () => {
    const r = registry();
    r.markLimited('a');
    now += 10_000;
    r.markHealthy('a');
    r.markLimited('a');
    expect(r.snapshot('a').cooldownUntilMs).toBe(now + 10_000);
  });

  it('reports the shortest remaining cooldown for the aggregate Retry-After', () => {
    const r = registry();
    r.markLimited('a');
    r.markLimited('b', 60_000);
    expect(r.minCooldownRemainingMs(['a', 'b'])).toBe(10_000);
    now += 10_000;
    expect(r.minCooldownRemainingMs(['a', 'b'])).toBe(50_000);
    now += 50_000;
    expect(r.minCooldownRemainingMs(['a', 'b'])).toBeUndefined();
  });

  it('orders candidates healthy-first, recovering-last in declaration order', () => {
    const r = registry();
    r.markLimited('b');
    r.markDown('d');
    expect(r.orderedCandidates('pool', ['a', 'b', 'c', 'd'], 'priority')).toEqual(['a', 'c']);
    now += 10_000;
    expect(r.orderedCandidates('pool', ['a', 'b', 'c', 'd'], 'priority')).toEqual(['a', 'c', 'b']);
  });

  it('round-robin rotates the starting point across calls', () => {
    const r = registry();
    const names = ['a', 'b', 'c'];
    expect(r.orderedCandidates('pool', names, 'round_robin')).toEqual(['a', 'b', 'c']);
    expect(r.orderedCandidates('pool', names, 'round_robin')).toEqual(['b', 'c', 'a']);
    expect(r.orderedCandidates('pool', names, 'round_robin')).toEqual(['c', 'a', 'b']);
    expect(r.orderedCandidates('pool', names, 'round_robin')).toEqual(['a', 'b', 'c']);
  });
});

describe('PoolRecoveryProber', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function setup(probe: (name: string) => Promise<void>, overrides: Partial<PoolOptions> = {}) {
    const registry = new PoolHealthRegistry(() => options({ probeIntervalMs: 1000, ...overrides }));
    const hooks = {
      onRecovered: vi.fn(),
      onDown: vi.fn(),
      onProbeError: vi.fn(),
    };
    const prober = new PoolRecoveryProber({
      registry,
      options: () => options({ probeIntervalMs: 1000, ...overrides }),
      probe,
      random: () => 0.5,
      ...hooks,
    });
    prober.start();
    return { registry, prober, hooks };
  }

  it('marks a successfully probed endpoint healthy and notifies', async () => {
    const { registry, prober, hooks } = setup(async () => {});
    registry.markLimited('a');
    await vi.advanceTimersByTimeAsync(1100);
    expect(registry.status('a')).toBe('healthy');
    expect(hooks.onRecovered).toHaveBeenCalledWith('a');
    prober.stop();
  });

  it('keeps a still-429 endpoint limited and refreshes its Retry-After', async () => {
    let now = 0;
    const registry = new PoolHealthRegistry(
      () => options({ probeIntervalMs: 1000, cooldownBaseMs: 10_000 }),
      () => now,
    );
    const prober = new PoolRecoveryProber({
      registry,
      options: () => options({ probeIntervalMs: 1000 }),
      probe: async () => {
        now += 1000;
        throw new APIProviderRateLimitError('limited', undefined, 60_000, undefined);
      },
      random: () => 0.5,
    });
    prober.start();
    registry.markLimited('a');
    await vi.advanceTimersByTimeAsync(1100);
    expect(registry.status('a')).toBe('limited');
    // Retry-After from the probe (60s) beats the computed backoff.
    expect(registry.snapshot('a').cooldownUntilMs).toBe(1000 + 60_000);
    prober.stop();
  });

  it('marks a 401 endpoint down and notifies', async () => {
    const { registry, prober, hooks } = setup(async () => {
      throw new APIStatusError(401, 'invalid key');
    });
    registry.markLimited('a');
    await vi.advanceTimersByTimeAsync(1100);
    expect(registry.status('a')).toBe('down');
    expect(hooks.onDown).toHaveBeenCalledWith('a');
    prober.stop();
  });

  it('keeps the endpoint limited on connection errors and reports them', async () => {
    const { registry, prober, hooks } = setup(async () => {
      throw new APIConnectionError('connection refused');
    });
    registry.markLimited('a');
    await vi.advanceTimersByTimeAsync(1100);
    expect(registry.status('a')).toBe('limited');
    expect(hooks.onProbeError).toHaveBeenCalledWith('a', expect.any(APIConnectionError));
    prober.stop();
  });

  it('does not probe when probeEnabled is false', async () => {
    const probe = vi.fn(async () => {});
    const { registry, prober } = setup(probe, { probeEnabled: false });
    registry.markLimited('a');
    await vi.advanceTimersByTimeAsync(3200);
    expect(probe).not.toHaveBeenCalled();
    expect(registry.status('a')).toBe('limited');
    prober.stop();
  });

  it('does not probe healthy endpoints and stops cleanly', async () => {
    const probe = vi.fn(async () => {});
    const { prober } = setup(probe);
    await vi.advanceTimersByTimeAsync(3200);
    expect(probe).not.toHaveBeenCalled();
    prober.stop();
  });
});
