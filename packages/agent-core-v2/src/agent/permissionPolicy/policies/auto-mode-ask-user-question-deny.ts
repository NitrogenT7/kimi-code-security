import { IJevDecider, type JevQuestionSpec } from '#/features/jev/jev-decider';
import { ILogService } from '#/_base/log/log';
import type { ResolvedToolExecutionHookContext } from '#/agent/toolExecutor/toolHooks';
import { IAgentPermissionModeService } from '#/agent/permissionMode/permissionMode';
import type {
  PermissionPolicy,
  PermissionPolicyResult,
} from '#/agent/permissionPolicy/types';
import type { QuestionAnswers } from '#/agent/interaction/question';
import type { AskUserQuestionInput } from '#/agent/tools/ask-user-question/ask-user-question';

const DECISION_CONFIDENCE_THRESHOLD = 0.5;

export class AutoModeAskUserQuestionDenyPermissionPolicyService implements PermissionPolicy {
  readonly name = 'auto-mode-ask-user-question-deny';

  constructor(
    @IAgentPermissionModeService private readonly modeService: IAgentPermissionModeService,
    @IJevDecider private readonly jev: IJevDecider,
    @ILogService private readonly log: ILogService,
  ) {}

  evaluate(context: ResolvedToolExecutionHookContext): PermissionPolicyResult | undefined {
    if (this.modeService.mode !== 'auto' && this.modeService.mode !== 'pentest') return undefined;
    if (context.toolCall.name !== 'AskUserQuestion') return undefined;
    return {
      kind: 'deny',
      message:
        'AskUserQuestion is disabled while auto/pentest permission mode is active. Make a reasonable decision and continue without asking the user.',
    };
  }

  async answerQuestions(
    questions: AskUserQuestionInput['questions'],
  ): Promise<QuestionAnswers | undefined> {
    if (this.modeService.mode !== 'auto' && this.modeService.mode !== 'pentest') return undefined;
    if (!this.jev.available()) return undefined;

    const specs: Record<string, JevQuestionSpec> = {};
    for (const [index, question] of questions.entries()) {
      const options = question.options.map((option) => option.label);
      if (question.multi_select) {
        for (const [optionIndex, option] of question.options.entries()) {
          specs[`q${index}_opt${optionIndex}`] = {
            type: 'noul',
            instructions: `Given the situation, would the operator choose this option for the question "${question.question}"? Option: ${option.label}. ${option.description}`,
          };
        }
      } else {
        specs[`q${index}`] = {
          type: 'choice',
          instructions: `${question.question} Choose the single option the operator is most likely to pick.`,
          options,
        };
      }
    }

    const answers = await this.jev.decide(
      {
        questions: questions.map((question) => ({
          question: question.question,
          header: question.header,
          options: question.options.map((option) => ({
            label: option.label,
            description: option.description,
          })),
          multi_select: question.multi_select,
        })),
      },
      specs,
    );
    if (answers === undefined) return undefined;

    const out: QuestionAnswers = {};
    for (const [index, question] of questions.entries()) {
      if (question.multi_select) {
        const picked: string[] = [];
        for (const [optionIndex, option] of question.options.entries()) {
          const answer = answers[`q${index}_opt${optionIndex}`];
          if (answer?.type === 'noul' && answer.probability >= DECISION_CONFIDENCE_THRESHOLD) {
            picked.push(option.label);
          }
        }
        const fallbackPick = question.options[0]?.label ?? '';
        out[`q${index}`] = picked[0] ?? fallbackPick;
        for (const extra of picked.slice(1)) {
          out[`q${index}_extra_${extra}`] = true;
        }
      } else {
        const answer = answers[`q${index}`];
        if (answer?.type === 'choice' && answer.answer !== undefined) {
          out[`q${index}`] = answer.answer;
        } else {
          out[`q${index}`] = question.options[0]?.label ?? '';
        }
      }
    }
    this.log.info('AskUserQuestion answered by Jev', {
      mode: this.modeService.mode,
      questionCount: questions.length,
    });
    return out;
  }
}
