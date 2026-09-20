import { describe, expect, it, vi } from 'vitest';

import type { IConfigService } from '#/app/config/config';
import type { ILogService } from '#/_base/log/log';
import type { IJevDecider } from '#/features/jev/jev-decider';
import type { IBashParserService } from '#/app/bashParser/bashParser';
import type { IAgentPermissionModeService } from '#/agent/permissionMode/permissionMode';
import type { PermissionMode } from '#/agent/permissionPolicy/types';
import type { ResolvedToolExecutionHookContext } from '#/agent/toolExecutor/toolHooks';
import { ToolAccesses } from '#/tool/toolContract';
import { YoloModeDangerousReviewPermissionPolicyService } from '#/agent/permissionPolicy/policies/yolo-mode-dangerous-review';

const signal = new AbortController().signal;

function modeService(mode: PermissionMode): IAgentPermissionModeService {
  return {
    _serviceBrand: undefined,
    mode,
    setMode: () => {},
    setModeAndBroadcast: () => {},
    onDidChangeMode: () => ({ dispose: () => {} }),
  } as unknown as IAgentPermissionModeService;
}

const log = {
  _serviceBrand: undefined,
  level: 'warn' as never,
  setLevel: () => {},
  flush: async () => {},
  child: () => ({}) as never,
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
} as unknown as ILogService;

const config = {
  _serviceBrand: undefined,
  get: vi.fn(() => undefined),
  ready: Promise.resolve(),
} as unknown as IConfigService;

const bashParser: IBashParserService = {
  _serviceBrand: undefined,
  parse: () => ({ ok: false, hasError: true, root: { type: 'program', children: [] } }),
} as unknown as IBashParserService;

function jevDecider(
  answers: Record<string, { type: 'noul'; probability: number }> | undefined,
  available = true,
): IJevDecider {
  return {
    _serviceBrand: undefined,
    available: () => available,
    decide: vi.fn(async () => answers),
  } as unknown as IJevDecider;
}

function bashContext(command: string): ResolvedToolExecutionHookContext {
  return {
    turnId: '0',
    stepNumber: 1,
    signal,
    llm: {},
    args: { command },
    toolCall: {
      type: 'function',
      id: 'call_bash',
      name: 'Bash',
      arguments: JSON.stringify({ command }),
    },
    toolCalls: [],
    execution: {
      accesses: ToolAccesses.none(),
      approvalRule: 'Bash',
      execute: async () => ({ output: '' }),
    },
  } as unknown as ResolvedToolExecutionHookContext;
}

function policy(
  mode: PermissionMode,
  jev: IJevDecider,
): YoloModeDangerousReviewPermissionPolicyService {
  return new YoloModeDangerousReviewPermissionPolicyService(
    modeService(mode),
    jev,
    bashParser,
    config,
    log,
  );
}

describe('YoloModeDangerousReviewPermissionPolicyService', () => {
  it('stays silent outside yolo mode', async () => {
    const p = policy('auto', jevDecider({ destructive: { type: 'noul', probability: 0.9 } }));
    await expect(p.evaluate(bashContext('some command'))).resolves.toBeUndefined();
  });

  it('stays silent for non-Bash tools', async () => {
    const p = policy('yolo', jevDecider({ destructive: { type: 'noul', probability: 0.9 } }));
    const ctx = bashContext('anything');
    const nonBash = { ...ctx, toolCall: { ...ctx.toolCall, name: 'Write' } };
    await expect(p.evaluate(nonBash as never)).resolves.toBeUndefined();
  });

  it('falls through to yolo approve when Jev is unavailable', async () => {
    const p = policy('yolo', jevDecider(undefined, false));
    await expect(p.evaluate(bashContext('make install'))).resolves.toBeUndefined();
  });

  it('falls through when Jev returns no answers', async () => {
    const p = policy('yolo', jevDecider(undefined, true));
    await expect(p.evaluate(bashContext('make install'))).resolves.toBeUndefined();
  });

  it('asks when Jev flags a destructive command', async () => {
    const p = policy(
      'yolo',
      jevDecider({
        destructive: { type: 'noul', probability: 0.87 },
        irreversible: { type: 'noul', probability: 0.1 },
        exfil: { type: 'noul', probability: 0.02 },
      }),
    );
    const result = await p.evaluate(bashContext('some-script --wipe-data'));
    expect(result?.kind).toBe('ask');
    expect(JSON.stringify(result)).toContain('destructive');
  });

  it('lets benign commands fall through to yolo approve', async () => {
    const p = policy(
      'yolo',
      jevDecider({
        destructive: { type: 'noul', probability: 0.05 },
        irreversible: { type: 'noul', probability: 0.01 },
        exfil: { type: 'noul', probability: 0.0 },
      }),
    );
    await expect(p.evaluate(bashContext('ls -la'))).resolves.toBeUndefined();
  });

  it('handles commands without a command field', async () => {
    const p = policy('yolo', jevDecider({ destructive: { type: 'noul', probability: 1 } }));
    const ctx = bashContext('');
    const noArgs = { ...ctx, args: {} };
    await expect(p.evaluate(noArgs as never)).resolves.toBeUndefined();
  });
});
