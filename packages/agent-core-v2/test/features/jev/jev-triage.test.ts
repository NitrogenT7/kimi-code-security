import { describe, expect, it, vi } from 'vitest';

import type { IJevDecider } from '#/features/jev/jev-decider';
import type { ExecutableToolContext } from '#/tool/toolContract';
import { JevTriageTool } from '#/features/jev/tools/jevTriageTool';

const ctx = {} as ExecutableToolContext;

const FINDING = {
  title: 'IDOR on /api/v1/orders/{id}',
  type: 'IDOR',
  endpoint: '/api/v1/orders/{id}',
  evidence: 'GET /api/v1/orders/1234 as user A returned user B order details including address',
  claimed_impact: 'Any authenticated user can read any other users order history',
};

function jev(answers: Record<string, unknown> | undefined, available = true): IJevDecider {
  return {
    _serviceBrand: undefined,
    available: () => available,
    decide: vi.fn(async () => answers as never),
  } as unknown as IJevDecider;
}

describe('JevTriageTool', () => {
  it('returns fallback note when Jev is not configured', async () => {
    const tool = new JevTriageTool(jev(undefined, false));
    const execution = tool.resolveExecution({ finding: FINDING }); if (execution.isError === true) throw new Error("unexpected error result");
    const result = await execution.execute(ctx);
    expect(result.isError).toBe(false);
    const output = typeof result.output === "string" ? result.output : JSON.stringify(result.output);
    const parsed = JSON.parse(output);
    expect(parsed.fallback).toBe(true);
  });

  it('triages a concrete finding as proceed', async () => {
    const tool = new JevTriageTool(
      jev({
        concrete: { type: 'noul', probability: 0.9 },
        evidence_supports: { type: 'noul', probability: 0.85 },
        guardrail_ok: { type: 'noul', probability: 0.95 },
        severity: { type: 'score', score: 3, confidence: 0.8 },
      }),
    );
    const execution = tool.resolveExecution({ finding: FINDING }); if (execution.isError === true) throw new Error("unexpected error result");
    const result = await execution.execute(ctx);
    const output = typeof result.output === "string" ? result.output : JSON.stringify(result.output);
    const parsed = JSON.parse(output);
    expect(parsed.fallback).toBe(false);
    expect(parsed.proceed).toBe(true);
    expect(parsed.severity).toBe('high');
    expect(parsed.scores.guardrail_ok).toBe(0.95);
  });

  it('blocks active verification when guardrail_ok is low', async () => {
    const tool = new JevTriageTool(
      jev({
        concrete: { type: 'noul', probability: 0.9 },
        evidence_supports: { type: 'noul', probability: 0.85 },
        guardrail_ok: { type: 'noul', probability: 0.2 },
        severity: { type: 'score', score: 2, confidence: 0.6 },
      }),
    );
    const execution = tool.resolveExecution({ finding: FINDING, verify_intent: true }); if (execution.isError === true) throw new Error("unexpected error result");
    const result = await execution.execute(ctx);
    const output = typeof result.output === "string" ? result.output : JSON.stringify(result.output);
    const parsed = JSON.parse(output);
    expect(parsed.proceed).toBe(false);
    expect(parsed.guidance).toContain('verify-dont-destroy');
  });

  it('returns fallback when Jev decide fails', async () => {
    const tool = new JevTriageTool(jev(undefined, true));
    const execution = tool.resolveExecution({ finding: FINDING }); if (execution.isError === true) throw new Error("unexpected error result");
    const result = await execution.execute(ctx);
    const output = typeof result.output === "string" ? result.output : JSON.stringify(result.output);
    const parsed = JSON.parse(output);
    expect(parsed.fallback).toBe(true);
  });
});
