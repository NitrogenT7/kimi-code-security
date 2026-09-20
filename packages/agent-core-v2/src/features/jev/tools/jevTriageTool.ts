import type { ToolExecution } from '#/tool/toolContract';
import { toInputJsonSchema } from '#/tool/input-schema';

import { IJevDecider } from '#/features/jev/jev-decider';
import { registerAgentToolService } from '#/agent/toolRegistry/toolContribution';

import {
  JevTriageInputSchema,
  IJevTriageTool,
  type JevTriageInput,
} from './jev-triage';
import DESCRIPTION from './jev-triage.md?raw';

const PARAMETERS = toInputJsonSchema(JevTriageInputSchema);

interface TriageVerdict {
  readonly concrete: number;
  readonly evidence_supports: number;
  readonly guardrail_ok: number;
  readonly severity: number | undefined;
}

const SEVERITY_LEVELS = [
  'informational: disclosure only, no direct abuse',
  'low: limited data exposure or minor logic flaw',
  'medium: sensitive data exposure or business-logic bypass',
  'high: authentication bypass or significant data exposure',
  'critical: remote code execution or full account takeover',
] as const;

function severityLabel(score: number | undefined): string {
  if (score === undefined) return 'unknown';
  const index = Math.max(0, Math.min(SEVERITY_LEVELS.length - 1, Math.round(score)));
  const level = SEVERITY_LEVELS[index] ?? SEVERITY_LEVELS[0]!;
  return level.slice(0, level.indexOf(':'));
}

export class JevTriageTool implements IJevTriageTool {
  declare readonly _serviceBrand: undefined;
  readonly name = 'JevTriage' as const;

  constructor(@IJevDecider private readonly jev: IJevDecider) {}

  get description(): string {
    return DESCRIPTION;
  }

  get parameters(): Record<string, unknown> {
    return PARAMETERS;
  }

  resolveExecution(args: JevTriageInput): ToolExecution {
    return {
      description: `Triaging finding: ${args.finding.title}`,
      approvalRule: this.name,
      execute: () => this.execute(args),
    };
  }

  private async execute(args: JevTriageInput) {
    if (!this.jev.available()) {
      return {
        isError: false,
        output: JSON.stringify({
          fallback: true,
          note: 'Jev decision model is not configured ([jev] section or OPENROUTER_API_KEY missing). Triage this finding yourself.',
        }),
      };
    }

    const questions: Record<string, import('#/features/jev/jev-decider').JevQuestionSpec> = {
      concrete: {
        type: 'noul',
        instructions:
          'The finding describes a specific, reproducible behavior at a specific endpoint or code path, not a theoretical or best-practice concern',
      },
      evidence_supports: {
        type: 'noul',
        instructions:
          'The cited evidence directly demonstrates the claimed behavior (an actual observed response, log line, or traced code path), it is not circumstantial',
      },
      guardrail_ok: {
        type: 'noul',
        instructions:
          'Verifying this finding requires only read-only observation of the target; it does not require modifying, deleting, flooding, or stressing any real system, and it does not use credentials obtained during the test',
      },
      severity: {
        type: 'score',
        instructions: 'If the finding is confirmed, rate its severity',
        levels: SEVERITY_LEVELS,
      },
    };
    if (args.verify_intent === true) {
      questions['before_verify'] = {
        type: 'noul',
        instructions:
          'The very next verification step is strictly read-only (a single GET or passive observation) against an authorized target',
      };
    }

    const answers = await this.jev.decide(
      {
        finding: {
          title: args.finding.title,
          type: args.finding.type,
          endpoint: args.finding.endpoint,
          evidence: args.finding.evidence,
          claimed_impact: args.finding.claimed_impact,
        },
      },
      questions,
    );

    if (answers === undefined) {
      return {
        isError: false,
        output: JSON.stringify({
          fallback: true,
          note: 'Jev decision request failed or timed out. Triage this finding yourself.',
        }),
      };
    }

    const verdict: TriageVerdict = {
      concrete: numberOf(answers['concrete']),
      evidence_supports: numberOf(answers['evidence_supports']),
      guardrail_ok: numberOf(answers['guardrail_ok']),
      severity:
        answers['severity']?.type === 'score' ? (answers['severity'].score ?? undefined) : undefined,
    };
    const beforeVerifyAnswer = answers['before_verify'];
    const beforeVerify = beforeVerifyAnswer?.type === 'noul' ? beforeVerifyAnswer.probability : undefined;

    const guardrailPass = verdict.guardrail_ok >= 0.5;
    const beforeVerifyPass = beforeVerify === undefined ? true : beforeVerify >= 0.8;
    const proceed =
      verdict.concrete >= 0.5 &&
      verdict.evidence_supports >= 0.5 &&
      guardrailPass &&
      beforeVerifyPass;

    return {
      isError: false,
      output: JSON.stringify({
        fallback: false,
        proceed,
        severity: severityLabel(verdict.severity),
        scores: {
          concrete: round2(verdict.concrete),
          evidence_supports: round2(verdict.evidence_supports),
          guardrail_ok: round2(verdict.guardrail_ok),
          before_verify: beforeVerify === undefined ? undefined : round2(beforeVerify),
        },
        guidance: guidanceFor(verdict, guardrailPass, beforeVerifyPass, proceed),
      }),
    };
  }
}

function numberOf(answer: import('#/features/jev/jev-decider').JevAnswer | undefined): number {
  if (answer?.type === 'noul') return answer.probability;
  if (answer?.type === 'choice') return answer.confidence;
  return 0;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function guidanceFor(
  verdict: TriageVerdict,
  guardrailPass: boolean,
  beforeVerifyPass: boolean,
  proceed: boolean,
): string {
  if (!guardrailPass) {
    return 'Active verification would likely modify or stress a real target (violates the verify-dont-destroy rule). Keep this finding as analysis-only; describe the impact in the report without live verification.';
  }
  if (!beforeVerifyPass) {
    return 'The next verification step is not clearly read-only. Narrow it to a single passive observation before proceeding.';
  }
  if (!proceed) {
    return 'Evidence does not yet support the claim. Gather a concrete request/response or code-path trace before treating this as a finding.';
  }
  return 'The finding is concrete, evidence-backed, and verifiable read-only. Proceed with passive verification, then record it.';
}

registerAgentToolService(IJevTriageTool, JevTriageTool, {
  name: 'JevTriage',
  domain: 'jev',
});
