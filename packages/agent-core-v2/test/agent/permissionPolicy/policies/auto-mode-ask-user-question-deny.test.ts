import { describe, expect, it, vi } from 'vitest';

import type { ILogService } from '#/_base/log/log';
import type { IConfigService } from '#/app/config/config';
import type { IJevDecider, JevAnswers } from '#/features/jev/jev-decider';
import type { IAgentPermissionModeService } from '#/agent/permissionMode/permissionMode';
import type { PermissionMode } from '#/agent/permissionPolicy/types';
import type { ResolvedToolExecutionHookContext } from '#/agent/toolExecutor/toolHooks';
import { ToolAccesses } from '#/tool/toolContract';
import { AutoModeAskUserQuestionDenyPermissionPolicyService } from '#/agent/permissionPolicy/policies/auto-mode-ask-user-question-deny';

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

function jevDecider(answers: JevAnswers | undefined, available = true): IJevDecider {
  return {
    _serviceBrand: undefined,
    available: () => available,
    decide: vi.fn(async () => answers),
  } as unknown as IJevDecider;
}

const QUESTIONS: Array<{
  question: string;
  header: string;
  options: Array<{ label: string; description: string }>;
  multi_select: boolean;
}> = [
  {
    question: 'Which provider?',
    header: 'LLM',
    options: [
      { label: 'openai', description: 'use openai' },
      { label: 'anthropic', description: 'use anthropic' },
    ],
    multi_select: false,
  },
  {
    question: 'Pick features?',
    header: 'Feat',
    options: [
      { label: 'fast', description: 'speed' },
      { label: 'cheap', description: 'cost' },
    ],
    multi_select: true,
  },
];

describe('AutoModeAskUserQuestionDeny Jev answerQuestions', () => {
  it('returns answers when Jev resolves a single-choice question', async () => {
    const policy = new AutoModeAskUserQuestionDenyPermissionPolicyService(
      modeService('auto'),
      jevDecider({
        q0: { type: 'choice', answer: 'anthropic', confidence: 0.82 },
        'q1_opt0': { type: 'noul', probability: 0.7 },
        'q1_opt1': { type: 'noul', probability: 0.2 },
      }),
      log,
    );
    const answers = await policy.answerQuestions(QUESTIONS);
    expect(answers?.['q0']).toBe('anthropic');
    expect(answers?.['q1']).toBe('fast');
  });

  it('falls back to the first option when Jev has no choice answer', async () => {
    const policy = new AutoModeAskUserQuestionDenyPermissionPolicyService(
      modeService('auto'),
      jevDecider({ q0: { type: 'choice', answer: undefined, confidence: 0.2 } }),
      log,
    );
    const answers = await policy.answerQuestions([QUESTIONS[0]!]);
    expect(answers).toEqual({ q0: 'openai' });
  });

  it('returns undefined when Jev is not configured', async () => {
    const policy = new AutoModeAskUserQuestionDenyPermissionPolicyService(
      modeService('auto'),
      jevDecider(undefined, false),
      log,
    );
    await expect(policy.answerQuestions([QUESTIONS[0]!])).resolves.toBeUndefined();
  });

  it('returns undefined when Jev decide fails', async () => {
    const policy = new AutoModeAskUserQuestionDenyPermissionPolicyService(
      modeService('auto'),
      jevDecider(undefined, true),
      log,
    );
    await expect(policy.answerQuestions([QUESTIONS[0]!])).resolves.toBeUndefined();
  });

  it('returns undefined outside auto/pentest modes', async () => {
    const policy = new AutoModeAskUserQuestionDenyPermissionPolicyService(
      modeService('manual'),
      jevDecider({ q0: { type: 'choice', answer: 'anthropic', confidence: 0.9 } }),
      log,
    );
    await expect(policy.answerQuestions([QUESTIONS[0]!])).resolves.toBeUndefined();
  });
});

describe('AutoModeAskUserQuestionDeny evaluate', () => {
  it('still denies AskUserQuestion in auto mode', () => {
    const policy = new AutoModeAskUserQuestionDenyPermissionPolicyService(
      modeService('auto'),
      jevDecider(undefined, false),
      log,
    );
    const context = {
      turnId: '0',
      stepNumber: 1,
      signal,
      llm: {},
      args: {},
      toolCall: {
        type: 'function',
        id: 'call_ask',
        name: 'AskUserQuestion',
        arguments: '{}',
      },
      toolCalls: [],
      execution: {
        accesses: ToolAccesses.none(),
        approvalRule: 'AskUserQuestion',
        execute: async () => ({ output: '' }),
      },
    } as unknown as ResolvedToolExecutionHookContext;
    const result = policy.evaluate(context);
    expect(result?.kind).toBe('deny');
  });
});
