import { IBashParserService } from '#/app/bashParser/bashParser';
import { IConfigService } from '#/app/config/config';
import { IJevDecider, type JevQuestionSpec } from '#/features/jev/jev-decider';
import { ILogService } from '#/_base/log/log';
import type { ResolvedToolExecutionHookContext } from '#/agent/toolExecutor/toolHooks';
import { IAgentPermissionModeService } from '#/agent/permissionMode/permissionMode';
import { isDangerousCommandGuardEnabled } from '#/agent/permissionRules/configSection';
import {
  analyzeDangerousCommand,
  DANGEROUS_PARSE_OPTIONS,
} from '#/agent/permissionPolicy/policies/dangerous-command-ask';
import type {
  PermissionPolicy,
  PermissionPolicyResult,
} from '#/agent/permissionPolicy/types';

const DANGER_PROBABILITY_THRESHOLD = 0.5;

export class YoloModeDangerousReviewPermissionPolicyService implements PermissionPolicy {
  readonly name = 'yolo-mode-dangerous-review';

  constructor(
    @IAgentPermissionModeService private readonly modeService: IAgentPermissionModeService,
    @IJevDecider private readonly jev: IJevDecider,
    @IBashParserService private readonly bashParser: IBashParserService,
    @IConfigService private readonly config: IConfigService,
    @ILogService private readonly log: ILogService,
  ) {}

  async evaluate(
    context: ResolvedToolExecutionHookContext,
  ): Promise<PermissionPolicyResult | undefined> {
    if (this.modeService.mode !== 'yolo') return undefined;
    if (!isDangerousCommandGuardEnabled(this.config)) return undefined;
    if (context.toolCall.name !== 'Bash') return undefined;

    const command = bashCommandText(context.args);
    if (command === undefined) return undefined;

    const staticVerdict = analyzeDangerousCommand(command, (source) =>
      this.bashParser.parse(source, DANGEROUS_PARSE_OPTIONS),
    );
    if (staticVerdict?.kind === 'dangerous') {
      return {
        kind: 'ask',
        reason: { policy: this.name, dangerous_command: staticVerdict.command, source: 'static' },
      };
    }

    if (!this.jev.available()) return undefined;

    const questions: Record<string, JevQuestionSpec> = {
      destructive: {
        type: 'noul',
        instructions:
          'This command would create, modify, overwrite, or delete important local state (system files, user data, package manager state, git history, running services) if executed',
      },
      irreversible: {
        type: 'noul',
        instructions:
          'This command performs an operation that cannot be undone (permanent deletion, history rewrite, disk or filesystem operation, killing a critical process)',
      },
      exfil: {
        type: 'noul',
        instructions:
          'This command sends credentials, API keys, private keys, or contents of sensitive local files to an external destination',
      },
    };

    const answers = await this.jev.decide({ command }, questions);
    if (answers === undefined) return undefined;

    const signals: Array<{ signal: string; probability: number }> = [];
    for (const key of ['destructive', 'irreversible', 'exfil'] as const) {
      const answer = answers[key];
      if (answer?.type === 'noul') signals.push({ signal: key, probability: answer.probability });
    }
    if (signals.length === 0) return undefined;

    const triggered = signals.filter((s) => s.probability >= DANGER_PROBABILITY_THRESHOLD);
    if (triggered.length === 0) return undefined;

    this.log.warn('yolo dangerous command flagged by Jev', {
      signals: triggered.map((s) => `${s.signal}=${s.probability.toFixed(2)}`),
    });
    const top = triggered.reduce((a, b) => (b.probability > a.probability ? b : a));
    return {
      kind: 'ask',
      reason: {
        policy: this.name,
        dangerous_command: top.signal,
        source: 'jev',
        probability: Math.round(top.probability * 100) / 100,
      },
    };
  }
}

function bashCommandText(args: unknown): string | undefined {
  if (typeof args !== 'object' || args === null) return undefined;
  const command = (args as { readonly command?: unknown }).command;
  return typeof command === 'string' ? command : undefined;
}
