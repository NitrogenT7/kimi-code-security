import { z } from 'zod';

import { createDecorator } from '#/_base/di/instantiation';
import type { AgentTool } from '#/tool/toolContract';

export interface JevTriageFindingInput {
  title: string;
  type: string;
  endpoint: string;
  evidence: string;
  claimed_impact: string;
}

export interface JevTriageInput {
  finding: JevTriageFindingInput;
  verify_intent?: boolean;
}

export const JevTriageInputSchema: z.ZodType<JevTriageInput> = z.object({
  finding: z.object({
    title: z.string().min(1).describe('Short finding title.'),
    type: z
      .string()
      .min(1)
      .describe(
        'Vulnerability class in English, e.g. IDOR, SQLi, SSRF, auth-bypass, hardcoded-secret, IPC-injection.',
      ),
    endpoint: z
      .string()
      .describe('Affected endpoint, component, file or function. Empty if not applicable.'),
    evidence: z
      .string()
      .min(1)
      .describe('Concrete observed evidence: log line, response diff, code path, request/response.'),
    claimed_impact: z.string().min(1).describe('Impact if the finding is confirmed.'),
  }),
  verify_intent: z
    .boolean()
    .default(false)
    .describe(
      'Set true when the next step would actively verify the finding against a live target.',
    ),
});

export interface IJevTriageTool extends AgentTool<JevTriageInput> {
  readonly _serviceBrand: undefined;
}
export const IJevTriageTool = createDecorator<IJevTriageTool>('jevTriageTool');
