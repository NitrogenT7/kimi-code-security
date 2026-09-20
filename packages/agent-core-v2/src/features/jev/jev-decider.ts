import { createDecorator } from '#/_base/di/instantiation';
import { Service } from '#/_base/di/service';

import { IConfigService } from '#/app/config/config';
import { ILogService, type ILogger } from '#/_base/log/log';

import { JEV_SECTION, resolveJevEndpoint } from './jev-config';

export type JevQuestionSpec =
  | {
      readonly type: 'noul';
      readonly instructions: string;
    }
  | {
      readonly type: 'choice';
      readonly instructions: string;
      readonly options: readonly string[];
    }
  | {
      readonly type: 'score';
      readonly instructions: string;
      readonly levels: readonly string[];
    };

export interface JevNoulAnswer {
  readonly type: 'noul';
  readonly probability: number;
}

export interface JevChoiceAnswer {
  readonly type: 'choice';
  readonly answer: string | undefined;
  readonly confidence: number;
}

export interface JevScoreAnswer {
  readonly type: 'score';
  readonly score: number | undefined;
  readonly confidence: number;
}

export type JevAnswer = JevNoulAnswer | JevChoiceAnswer | JevScoreAnswer;

export type JevAnswers = Readonly<Record<string, JevAnswer>>;

export interface IJevDecider {
  readonly _serviceBrand: undefined;
  available(): boolean;
  decide(
    state: unknown,
    questions: Readonly<Record<string, JevQuestionSpec>>,
  ): Promise<JevAnswers | undefined>;
}

export const IJevDecider = createDecorator<IJevDecider>('jevDecider');

const REQUEST_TIMEOUT_MS_DEFAULT = 30_000;
const STATE_BUDGET_CHARS = 24_000;

type RawAnswer = JevAnswer | undefined;

export class JevDeciderService extends Service implements IJevDecider {
  declare readonly _serviceBrand: undefined;

  constructor(
    @IConfigService config: IConfigService,
    @ILogService log: ILogService,
  ) {
    super();
    this.configService = config;
    this.log = log.child({ component: 'jevDecider' });
  }

  private readonly configService: IConfigService;
  private readonly log: ILogger;

  available(): boolean {
    return resolveJevEndpoint(this.configService) !== undefined;
  }

  async decide(
    state: unknown,
    questions: Readonly<Record<string, JevQuestionSpec>>,
  ): Promise<JevAnswers | undefined> {
    const endpoint = resolveJevEndpoint(this.configService);
    if (endpoint === undefined) return undefined;
    const keys = Object.keys(questions);
    if (keys.length === 0) return undefined;

    const body = {
      model: endpoint.model,
      state: budgetState(state),
      questions: wireQuestions(questions),
    };

    const timeoutMs = this.timeoutMs();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(endpoint.url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${endpoint.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (!response.ok) {
        this.log.warn('jev decision request failed', {
          status: response.status,
          model: endpoint.model,
        });
        return undefined;
      }
      const payload = (await response.json()) as { answers?: Record<string, unknown> };
      const answers = parseAnswers(payload.answers);
      if (answers === undefined) return undefined;
      const missing = keys.some((key) => answers[key] === undefined);
      if (missing) {
        this.log.warn('jev decision response missing answers', { model: endpoint.model });
        return undefined;
      }
      return answers;
    } catch (error) {
      this.log.warn('jev decision request errored', {
        model: endpoint.model,
        error: error instanceof Error ? error.message : String(error),
      });
      return undefined;
    } finally {
      clearTimeout(timer);
    }
  }

  private timeoutMs(): number {
    const cfg = this.configService.get<{ timeoutMs?: number } | undefined>(JEV_SECTION);
    return cfg?.timeoutMs ?? REQUEST_TIMEOUT_MS_DEFAULT;
  }
}

function budgetState(state: unknown): unknown {
  const serialized = JSON.stringify(state);
  if (serialized === undefined) return state;
  if (serialized.length <= STATE_BUDGET_CHARS) return state;
  return {
    note: 'state truncated to fit the decision model context budget',
    partial: serialized.slice(0, STATE_BUDGET_CHARS),
  };
}

function wireQuestions(
  questions: Readonly<Record<string, JevQuestionSpec>>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, spec] of Object.entries(questions)) {
    if (spec.type === 'noul') {
      out[key] = { type: 'noul', instructions: spec.instructions };
    } else if (spec.type === 'choice') {
      out[key] = {
        type: 'choice',
        instructions: spec.instructions,
        criteria: Object.fromEntries(spec.options.map((option) => [option, option])),
      };
    } else {
      out[key] = {
        type: 'score',
        instructions: spec.instructions,
        criteria: spec.levels,
      };
    }
  }
  return out;
}

function parseAnswers(raw: Record<string, unknown> | undefined): JevAnswers | undefined {
  if (raw === undefined || typeof raw !== 'object' || raw === null) return undefined;
  const out: Record<string, JevAnswer> = {};
  for (const [key, value] of Object.entries(raw)) {
    const answer = parseAnswer(value);
    if (answer === undefined) return undefined;
    out[key] = answer;
  }
  return out;
}

function parseAnswer(raw: unknown): RawAnswer {
  if (typeof raw !== 'object' || raw === null) return undefined;
  const type = (raw as { type?: unknown }).type;
  if (type === 'noul') {
    const probability = (raw as { noul?: unknown }).noul;
    if (typeof probability !== 'number' || Number.isNaN(probability)) return undefined;
    return { type: 'noul', probability };
  }
  if (type === 'choice') {
    const choice = (raw as { choice?: unknown }).choice;
    const confidence = numericField(raw, 'confidence');
    return {
      type: 'choice',
      answer: typeof choice === 'string' ? choice : undefined,
      confidence: confidence ?? 0,
    };
  }
  if (type === 'score') {
    const score = (raw as { score?: unknown }).score;
    const confidence = numericField(raw, 'confidence');
    return {
      type: 'score',
      score: typeof score === 'number' && !Number.isNaN(score) ? score : undefined,
      confidence: confidence ?? 0,
    };
  }
  return undefined;
}

function numericField(raw: object, field: string): number | undefined {
  const value = (raw as Record<string, unknown>)[field];
  return typeof value === 'number' && !Number.isNaN(value) ? value : undefined;
}
