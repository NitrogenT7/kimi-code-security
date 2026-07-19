import { describe, expect, it } from 'vitest';

import {
  buildCompactionInstruction,
  COMPACTION_INSTRUCTION,
} from '../../../src/agent/compaction/full';

describe('buildCompactionInstruction', () => {
  it('falls back to the standard compaction instruction when no retention plan is provided', () => {
    const result = buildCompactionInstruction(undefined, undefined);
    expect(result).toBe(COMPACTION_INSTRUCTION(''));
  });

  it('preserves a custom instruction when no retention plan is provided', () => {
    const custom = 'Focus on Android audit workflow';
    const result = buildCompactionInstruction(custom, undefined);
    expect(result).toBe(COMPACTION_INSTRUCTION(custom));
  });

  it('injects the retention plan into the compaction instruction', () => {
    const custom = 'Focus on Android audit workflow';
    const plan =
      '## Current Task\nAudit APK IPC surface.\n## Must Retain\n- exported Activities in com.example.app';
    const result = buildCompactionInstruction(custom, plan);

    expect(result).toContain(custom);
    expect(result).toContain(
      'Use the following retention plan when deciding what to keep in the summary:',
    );
    expect(result).toContain(plan);
  });

  it('handles an empty custom instruction with a retention plan', () => {
    const plan = '## Current Task\nRefactor auth module.';
    const result = buildCompactionInstruction(undefined, plan);

    expect(result).not.toContain('Focus on');
    expect(result).toContain(
      'Use the following retention plan when deciding what to keep in the summary:',
    );
    expect(result).toContain(plan);
  });

  it('ignores a whitespace-only retention plan', () => {
    const custom = 'Keep errors only';
    const result = buildCompactionInstruction(custom, '   \n  ');
    expect(result).toBe(COMPACTION_INSTRUCTION(custom));
  });
});
