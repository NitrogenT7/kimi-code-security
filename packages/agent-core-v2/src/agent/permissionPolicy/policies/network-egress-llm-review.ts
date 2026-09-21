import { IConfigService } from '#/app/config/config';
import { ILogService } from '#/_base/log/log';
import { IModelCatalog } from '#/llm-adapter/model/catalog';
import type { ModelRequester } from '#/llm-adapter/model/model-requester';
import { createUserMessage, type Message } from '#/llm-adapter/contract/message';
import { IAgentPermissionModeService } from '#/agent/permissionMode/permissionMode';
import { IJevDecider, type JevQuestionSpec } from '#/features/jev/jev-decider';
import type { ResolvedToolExecutionHookContext } from '#/agent/toolExecutor/toolHooks';
import type {
  PermissionPolicy,
  PermissionPolicyResult,
} from '#/agent/permissionPolicy/types';
import {
  networkEgressReviewerModel,
} from './network-egress-review-config';
import { extractEgressTarget, type EgressTarget } from './network-egress-target';

const REVIEW_TIMEOUT_MS = 30_000;

const REVIEW_SYSTEM_PROMPT = [
  'You are a lightweight approval gate for outbound network requests made by an authorized security-testing agent.',
  'Decide whether the request may run against the remote target.',
  '',
  'Rules:',
  '- Read-only requests (GET/HEAD/OPTIONS, DNS queries, pings, port probing) against in-scope targets: ALLOW.',
  '- Requests that would create, modify, or delete remote state (POST/PUT/PATCH/DELETE with side effects, login submissions, file uploads, posting comments/messages/orders, sending emails): DENY unless the operator has explicitly granted this action earlier in the conversation.',
  '- Requests that send real credentials/secrets to a third-party host, exfiltrate local files, or target a host clearly outside the authorized scope: DENY.',
  '- When genuinely uncertain: DENY.',
  '',
  'Answer with exactly one line starting with ALLOW or DENY, optionally followed by a one-sentence reason.',
].join('\n');

export class NetworkEgressLLMReviewPermissionPolicyService implements PermissionPolicy {
  readonly name = 'network-egress-llm-review';

  constructor(
    @IConfigService private readonly config: IConfigService,
    @IModelCatalog private readonly modelCatalog: IModelCatalog,
    @ILogService private readonly log: ILogService,
    @IAgentPermissionModeService private readonly modeService: IAgentPermissionModeService,
    @IJevDecider private readonly jev: IJevDecider,
  ) {}

  async evaluate(
    context: ResolvedToolExecutionHookContext,
  ): Promise<PermissionPolicyResult | undefined> {
    if (this.modeService.mode !== 'pentest') return undefined;

    const toolName = context.toolCall.name;
    let target: EgressTarget | undefined;
    if (toolName === 'Bash') {
      const command = bashCommandText(context.args);
      if (command === undefined) return undefined;
      target = extractEgressTarget(command);
    } else if (toolName === 'FetchURL') {
      const url = fetchUrlText(context.args);
      target = url === undefined ? undefined : extractEgressTarget(url);
    } else {
      return undefined;
    }
    if (target === undefined) return undefined;

    if (target.loopback || isPrivateHost(target.hostname)) {
      return {
        kind: 'approve',
        reason: { policy: this.name, target: target.hostname, scope: 'local' },
      };
    }

    const jevVerdict = await this.reviewWithJev(context, target);
    if (jevVerdict !== undefined) {
      if (jevVerdict.kind === 'allow') {
        return {
          kind: 'approve',
          reason: {
            policy: this.name,
            target: target.hostname,
            reviewer: 'jev',
            read_only: jevVerdict.scores.readOnly,
            destructive: jevVerdict.scores.destructive,
            exfil: jevVerdict.scores.exfil,
          },
        };
      }
      return {
        kind: 'deny',
        reason: {
          policy: this.name,
          target: target.hostname,
          reviewer: 'jev',
          signal: jevVerdict.signal ?? 'ambiguous',
          read_only: jevVerdict.scores.readOnly,
          destructive: jevVerdict.scores.destructive,
          exfil: jevVerdict.scores.exfil,
        },
        message:
          jevVerdict.signal === undefined
            ? `Network egress to ${target.hostname} denied by the Jev decision model. Reframe the step to be read-only, or ask the operator to grant it.`
            : `Network egress to ${target.hostname} denied by the Jev decision model (signal: ${jevVerdict.signal}). Reframe the step to be read-only, or ask the operator to grant it.`,
      };
    }

    let requester: ModelRequester;
    try {
      requester = this.modelCatalog.getRequester(networkEgressReviewerModel(this.config));
    } catch (error) {
      this.log.warn('network egress reviewer model unavailable; asking the user instead', {
        model: networkEgressReviewerModel(this.config),
        error: error instanceof Error ? error.message : String(error),
      });
      return {
        kind: 'ask',
        reason: { policy: this.name, target: target.hostname, fallback: 'model-unavailable' },
      };
    }

    const verdict = await this.review(requester, context, target);
    if (verdict === undefined) {
      return {
        kind: 'ask',
        reason: { policy: this.name, target: target.hostname, fallback: 'review-inconclusive' },
      };
    }
    if (verdict.kind === 'allow') {
      return {
        kind: 'approve',
        reason: { policy: this.name, target: target.hostname, reviewer: verdict.reason ?? '' },
      };
    }
    return {
      kind: 'deny',
      reason: { policy: this.name, target: target.hostname, reviewer: verdict.reason ?? '' },
      message:
        verdict.reason === undefined
          ? `Network egress to ${target.hostname} denied by the safety reviewer model. Reframe the step to be read-only, or ask the operator to grant it.`
          : `Network egress to ${target.hostname} denied by the safety reviewer model: ${verdict.reason} Reframe the step to be read-only, or ask the operator to grant it.`,
    };
  }

  private async reviewWithJev(
    context: ResolvedToolExecutionHookContext,
    target: EgressTarget,
  ): Promise<
    | {
        readonly kind: 'allow' | 'deny';
        readonly signal?: string;
        readonly scores: { readonly readOnly: number; readonly destructive: number; readonly exfil: number };
      }
    | undefined
  > {
    if (!this.jev.available()) return undefined;

    const questions: Record<string, JevQuestionSpec> = {
      read_only: {
        type: 'noul',
        instructions:
          'The request only reads remote state (GET/HEAD/OPTIONS, DNS query, ping, port probe); it does not create, modify, or delete anything',
      },
      destructive: {
        type: 'noul',
        instructions:
          'The request would create, modify, or delete remote state (form or login submission, file upload, posting a comment, message, or order)',
      },
      exfil: {
        type: 'noul',
        instructions:
          'The request sends real credentials, secrets, or contents of local files to the remote host, or clearly targets a host outside the authorized testing scope',
      },
    };

    const answers = await this.jev.decide(
      {
        tool: context.toolCall.name,
        arguments: context.args,
        target: { scheme: target.scheme, hostname: target.hostname, port: target.port },
      },
      questions,
    );
    if (answers === undefined) return undefined;

    const readOnly = noulProbability(answers, 'read_only');
    const destructive = noulProbability(answers, 'destructive');
    const exfil = noulProbability(answers, 'exfil');
    const scores = {
      readOnly: round2(readOnly),
      destructive: round2(destructive),
      exfil: round2(exfil),
    };

    if (destructive >= 0.5 || exfil >= 0.5) {
      const signal = exfil >= destructive ? 'exfil' : 'destructive';
      return { kind: 'deny', signal, scores };
    }
    if (readOnly >= 0.8) {
      return { kind: 'allow', scores };
    }
    return undefined;
  }

  private async review(
    requester: ModelRequester,
    context: ResolvedToolExecutionHookContext,
    target: EgressTarget,
  ): Promise<{ readonly kind: 'allow' | 'deny'; readonly reason?: string } | undefined> {
    const payload = JSON.stringify(
      {
        tool: context.toolCall.name,
        arguments: context.args,
        target: { scheme: target.scheme, hostname: target.hostname, port: target.port },
      },
      null,
      2,
    );
    const messages: Message[] = [
      createUserMessage(`Review this outbound request:\n${payload}`),
    ];
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REVIEW_TIMEOUT_MS);
    try {
      for await (const event of requester.request(
        { systemPrompt: REVIEW_SYSTEM_PROMPT, tools: [], messages },
        controller.signal,
      )) {
        if (event.type !== 'finish') continue;
        const text = event.message.content
          .filter((part) => part.type === 'text')
          .map((part) => part.text)
          .join('')
          .trim();
        const match = /(?:^|\s)(ALLOW|DENY)\b/.exec(text);
        if (match === null) return undefined;
        const reason = text
          .slice((match.index ?? 0) + match[0]!.length)
          .replace(/^[\s:—-]+/, '')
          .replace(/\s+$/, '');
        return {
          kind: match[1] === 'ALLOW' ? 'allow' : 'deny',
          reason: reason.length > 0 ? reason.slice(0, 300) : undefined,
        };
      }
      return undefined;
    } catch (error) {
      this.log.warn('network egress review request failed', {
        target: target.hostname,
        error: error instanceof Error ? error.message : String(error),
      });
      return undefined;
    } finally {
      clearTimeout(timer);
    }
  }
}

function bashCommandText(args: unknown): string | undefined {
  if (typeof args !== 'object' || args === null) return undefined;
  const command = (args as { readonly command?: unknown }).command;
  return typeof command === 'string' ? command : undefined;
}

function fetchUrlText(args: unknown): string | undefined {
  if (typeof args !== 'object' || args === null) return undefined;
  const url = (args as { readonly url?: unknown }).url;
  return typeof url === 'string' ? url : undefined;
}

function isPrivateHost(hostname: string): boolean {
  if (hostname === 'localhost') return true;
  if (hostname.startsWith('127.')) return true;
  if (hostname.startsWith('10.')) return true;
  if (hostname.startsWith('192.168.')) return true;
  if (hostname.startsWith('169.254.')) return true;
  const m172 = /^172\.(\d{1,2})\./.exec(hostname);
  if (m172 !== null) {
    const second = Number(m172[1]);
    return second >= 16 && second <= 31;
  }
  return false;
}

function noulProbability(
  answers: Readonly<Record<string, import('#/features/jev/jev-decider').JevAnswer>>,
  key: string,
): number {
  const answer = answers[key];
  return answer?.type === 'noul' ? answer.probability : 0;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
