import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { IConfigService } from '#/app/config/config';
import {
  JEV_SECTION,
  resolveJevEndpoint,
  type JevConfig,
} from '#/features/jev/jev-config';
import { JevDeciderService } from '#/features/jev/jev-decider';

function configWith(cfg: JevConfig | undefined): IConfigService {
  return {
    _serviceBrand: undefined,
    get: vi.fn((section: string) => (section === JEV_SECTION ? cfg : undefined)),
    ready: Promise.resolve(),
  } as unknown as IConfigService;
}

const logStub = {
  child: () => ({
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
  }),
} as never;

describe('resolveJevEndpoint', () => {
  const originalEnv = process.env['OPENROUTER_API_KEY'];

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env['OPENROUTER_API_KEY'];
    } else {
      process.env['OPENROUTER_API_KEY'] = originalEnv;
    }
  });

  it('returns undefined when no jev config section exists', () => {
    expect(resolveJevEndpoint(configWith(undefined))).toBeUndefined();
  });

  it('returns undefined when apiKey is missing and env is unset', () => {
    delete process.env['OPENROUTER_API_KEY'];
    expect(resolveJevEndpoint(configWith({ provider: 'openrouter' }))).toBeUndefined();
  });

  it('resolves the openrouter endpoint with explicit apiKey', () => {
    const endpoint = resolveJevEndpoint(
      configWith({ provider: 'openrouter', apiKey: 'sk-test' }),
    );
    expect(endpoint?.url).toBe('https://openrouter.ai/api/alpha/decisions');
    expect(endpoint?.model).toBe('typesafe/jev-1.13');
    expect(endpoint?.apiKey).toBe('sk-test');
  });

  it('falls back to OPENROUTER_API_KEY env when apiKey is not configured', () => {
    process.env['OPENROUTER_API_KEY'] = 'sk-env';
    const endpoint = resolveJevEndpoint(configWith({ provider: 'openrouter' }));
    expect(endpoint?.apiKey).toBe('sk-env');
  });

  it('resolves the typesafe provider with its own defaults', () => {
    const endpoint = resolveJevEndpoint(
      configWith({ provider: 'typesafe', apiKey: 'sk-ts' }),
    );
    expect(endpoint?.url).toBe('https://api.typesafe.ai/v1/systemone');
    expect(endpoint?.model).toBe('jev-1.13.0');
  });
});

describe('JevDeciderService', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function serviceWith(cfg: JevConfig | undefined): JevDeciderService {
    return new JevDeciderService(configWith(cfg), logStub);
  }

  it('available() is false without configuration', () => {
    expect(serviceWith(undefined).available()).toBe(false);
    expect(serviceWith({ provider: 'openrouter' }).available()).toBe(false);
  });

  it('available() is true with an apiKey', () => {
    expect(serviceWith({ provider: 'openrouter', apiKey: 'sk' }).available()).toBe(true);
  });

  it('decide returns undefined when not configured', async () => {
    const result = await serviceWith(undefined).decide({}, { q: { type: 'noul', instructions: 'x' } });
    expect(result).toBeUndefined();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('decide posts state and questions then parses answers', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          answers: {
            urgent: { type: 'noul', noul: 0.93 },
            queue: { type: 'choice', choice: 'billing', probabilities: { billing: 0.8 }, confidence: 0.8 },
            sev: { type: 'score', score: 2.4, confidence: 0.7 },
          },
        }),
        { status: 200 },
      ),
    );

    const service = serviceWith({ provider: 'openrouter', apiKey: 'sk' });
    const answers = await service.decide(
      { message: 'refund please' },
      {
        urgent: { type: 'noul', instructions: 'is it urgent' },
        queue: { type: 'choice', instructions: 'which queue', options: ['billing', 'other'] },
        sev: { type: 'score', instructions: 'severity', levels: ['low', 'high'] },
      },
    );

    expect(answers?.['urgent']).toEqual({ type: 'noul', probability: 0.93 });
    expect(answers?.['queue']).toMatchObject({ type: 'choice', answer: 'billing', confidence: 0.8 });
    expect(answers?.['sev']).toMatchObject({ type: 'score', score: 2.4 });
    expect(fetchMock).toHaveBeenCalledOnce();
    const rawBody = fetchMock.mock.calls[0]?.[1]?.body;
    const body = JSON.parse(typeof rawBody === "string" ? rawBody : JSON.stringify(rawBody));
    expect(body.model).toBe('typesafe/jev-1.13');
    expect(body.state).toEqual({ message: 'refund please' });
    expect(body.questions.urgent.type).toBe('noul');
    expect(body.questions.queue.criteria.billing).toBe('billing');
  });

  it('decide returns undefined on non-ok responses', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response('rate limited', { status: 429 }));
    const service = serviceWith({ provider: 'openrouter', apiKey: 'sk' });
    const result = await service.decide({}, { q: { type: 'noul', instructions: 'x' } });
    expect(result).toBeUndefined();
  });

  it('decide returns undefined when answers are missing from the response', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({}), { status: 200 }));
    const service = serviceWith({ provider: 'openrouter', apiKey: 'sk' });
    const result = await service.decide({}, { q: { type: 'noul', instructions: 'x' } });
    expect(result).toBeUndefined();
  });

  it('decide returns undefined when a requested answer is absent', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ answers: { other: { type: 'noul', noul: 0.5 } } }), {
        status: 200,
      }),
    );
    const service = serviceWith({ provider: 'openrouter', apiKey: 'sk' });
    const result = await service.decide({}, { q: { type: 'noul', instructions: 'x' } });
    expect(result).toBeUndefined();
  });

  it('decide returns undefined when fetch throws', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('network down'));
    const service = serviceWith({ provider: 'openrouter', apiKey: 'sk' });
    const result = await service.decide({}, { q: { type: 'noul', instructions: 'x' } });
    expect(result).toBeUndefined();
  });
});
