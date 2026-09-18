import type { ToolCall } from '#human/llm/message';
import { describe, expect, it, vi } from 'vitest';

import type { IConfigService } from '#/app/config/config';
import type { ILogService } from '#/_base/log/log';
import type { IModelCatalog } from '#/llm-adapter/model/catalog';
import type { ModelRequester } from '#/llm-adapter/model/model-requester';
import type { ResolvedToolExecutionHookContext } from '#/agent/toolExecutor/toolHooks';
import { ToolAccesses } from '#/tool/toolContract';
import {
  NETWORK_EGRESS_REVIEW_SECTION,
  type NetworkEgressReviewConfig,
} from '#/agent/permissionPolicy/policies/network-egress-review-config';
import { NetworkEgressLLMReviewPermissionPolicyService } from '#/agent/permissionPolicy/policies/network-egress-llm-review';
import { extractEgressTarget } from '#/agent/permissionPolicy/policies/network-egress-target';

const signal = new AbortController().signal;

function configWith(cfg: NetworkEgressReviewConfig | undefined): IConfigService {
  return {
    _serviceBrand: undefined,
    get: vi.fn(() => cfg),
    ready: Promise.resolve(),
  } as unknown as IConfigService;
}

function reviewerReturning(text: string): ModelRequester {
  const events = [
    {
      type: 'finish' as const,
      message: {
        role: 'assistant' as const,
        content: [{ type: 'text' as const, text }],
      },
    },
  ];
  return {
    model: { name: 'mock' } as unknown as ModelRequester['model'],
    request: async function* () {
      for (const event of events) yield event;
    },
  } as unknown as ModelRequester;
}

function catalogWith(requester: ModelRequester | Error): IModelCatalog {
  return {
    _serviceBrand: undefined,
    getRequester: (_id: string) => {
      if (requester instanceof Error) throw requester;
      return requester;
    },
  } as unknown as IModelCatalog;
}

const log: ILogService = {
  _serviceBrand: undefined,
  level: 'warn' as never,
  setLevel: () => {},
  flush: async () => {},
  trace: () => {},
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
} as unknown as ILogService;

function policyContext(toolName: string, args: unknown): ResolvedToolExecutionHookContext {
  return {
    turnId: '0',
    stepNumber: 1,
    signal,
    llm: {},
    args,
    toolCall: {
      type: 'function',
      id: `call_${toolName}`,
      name: toolName,
      arguments: JSON.stringify(args),
    } satisfies ToolCall,
    toolCalls: [],
    execution: {
      accesses: ToolAccesses.none(),
      approvalRule: toolName,
      execute: async () => ({ output: '' }),
    },
  } as unknown as ResolvedToolExecutionHookContext;
}

describe('NetworkEgressLLMReviewPermissionPolicyService', () => {
  const enabled = { enabled: true, model: 'reviewer-model' };

  it('stays silent when the feature is disabled', async () => {
    const policy = new NetworkEgressLLMReviewPermissionPolicyService(
      configWith(undefined),
      catalogWith(reviewerReturning('ALLOW')),
      log,
    );
    await expect(
      policy.evaluate(policyContext('Bash', { command: 'curl https://example.com' })),
    ).resolves.toBeUndefined();
  });

  it('approves loopback targets without consulting the reviewer', async () => {
    const policy = new NetworkEgressLLMReviewPermissionPolicyService(
      configWith(enabled),
      catalogWith(reviewerReturning('DENY')),
      log,
    );
    await expect(
      policy.evaluate(policyContext('Bash', { command: 'curl http://127.0.0.1:8080/api' })),
    ).resolves.toEqual({
      kind: 'approve',
      reason: { policy: 'network-egress-llm-review', target: '127.0.0.1', scope: 'local' },
    });
  });

  it('approves private-network targets without consulting the reviewer', async () => {
    const policy = new NetworkEgressLLMReviewPermissionPolicyService(
      configWith(enabled),
      catalogWith(reviewerReturning('DENY')),
      log,
    );
    const result = await policy.evaluate(
      policyContext('Bash', { command: 'curl http://192.168.1.10/admin' }),
    );
    expect(result).toEqual({
      kind: 'approve',
      reason: { policy: 'network-egress-llm-review', target: '192.168.1.10', scope: 'local' },
    });
  });

  it('routes public targets through the reviewer model and approves on ALLOW', async () => {
    const policy = new NetworkEgressLLMReviewPermissionPolicyService(
      configWith(enabled),
      catalogWith(reviewerReturning('ALLOW read-only GET')),
      log,
    );
    const result = await policy.evaluate(
      policyContext('Bash', { command: 'curl -s https://api.example.com/v1/users' }),
    );
    expect(result?.kind).toBe('approve');
  });

  it('denies on reviewer DENY with the reviewer reason surfaced to the agent', async () => {
    const policy = new NetworkEgressLLMReviewPermissionPolicyService(
      configWith(enabled),
      catalogWith(reviewerReturning('DENY login form submission creates state')),
      log,
    );
    const result = await policy.evaluate(
      policyContext('Bash', {
        command: 'curl -X POST -d "user=a&pass=b" https://example.com/login',
      }),
    );
    expect(result?.kind).toBe('deny');
    expect(JSON.stringify(result)).toContain('login form submission');
  });

  it('covers FetchURL tool calls', async () => {
    const policy = new NetworkEgressLLMReviewPermissionPolicyService(
      configWith(enabled),
      catalogWith(reviewerReturning('ALLOW')),
      log,
    );
    const result = await policy.evaluate(
      policyContext('FetchURL', { url: 'https://example.com/page' }),
    );
    expect(result?.kind).toBe('approve');
  });

  it('falls back to ask when the reviewer model is not configured', async () => {
    const policy = new NetworkEgressLLMReviewPermissionPolicyService(
      configWith(enabled),
      catalogWith(new Error('model not found')),
      log,
    );
    const result = await policy.evaluate(
      policyContext('Bash', { command: 'curl https://example.com' }),
    );
    expect(result?.kind).toBe('ask');
  });

  it('falls back to ask when the reviewer output has no verdict', async () => {
    const policy = new NetworkEgressLLMReviewPermissionPolicyService(
      configWith(enabled),
      catalogWith(reviewerReturning('I am not sure about this one')),
      log,
    );
    const result = await policy.evaluate(
      policyContext('Bash', { command: 'curl https://example.com' }),
    );
    expect(result?.kind).toBe('ask');
  });

  it('ignores purely local commands', async () => {
    const policy = new NetworkEgressLLMReviewPermissionPolicyService(
      configWith(enabled),
      catalogWith(reviewerReturning('ALLOW')),
      log,
    );
    await expect(
      policy.evaluate(policyContext('Bash', { command: 'ls -la && rg pattern src/' })),
    ).resolves.toBeUndefined();
  });
});

describe('extractEgressTarget', () => {
  it('parses URLs with ports', () => {
    expect(extractEgressTarget('curl https://api.example.com:8443/v1')).toEqual({
      scheme: 'https',
      hostname: 'api.example.com',
      port: '8443',
      loopback: false,
    });
  });

  it('marks loopback hosts', () => {
    expect(extractEgressTarget('curl http://localhost:3000/health')?.loopback).toBe(true);
    expect(extractEgressTarget('curl http://127.0.0.1/x')?.loopback).toBe(true);
  });

  it('extracts flag hosts from ssh/nc-style commands', () => {
    const target = extractEgressTarget('ssh -p 2222 root@203.0.113.5');
    expect(target?.hostname).toBe('203.0.113.5');
  });

  it('captures the port from host:port targets', () => {
    const target = extractEgressTarget('nc -zv 203.0.113.5 2222 || curl telnet://203.0.113.5:2222');
    expect(target?.hostname).toBe('203.0.113.5');
    expect(target?.port).toBe('2222');
  });

  it('extracts bare hosts from network commands', () => {
    const target = extractEgressTarget('dig example.com');
    expect(target?.hostname).toBe('example.com');
  });

  it('returns undefined for local-only commands', () => {
    expect(extractEgressTarget('ls -la')).toBeUndefined();
    expect(extractEgressTarget('git status')).toBeUndefined();
  });

  it('flags a bare public IP even outside network commands', () => {
    const target = extractEgressTarget('nmap -sV 203.0.113.10');
    expect(target?.hostname).toBe('203.0.113.10');
  });
});
