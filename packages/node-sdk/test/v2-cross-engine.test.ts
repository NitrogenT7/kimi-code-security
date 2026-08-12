/**
 * Cross-engine resume: a session created by the v1 harness must resume
 * cleanly under the v2 bridge (the migration path for existing users).
 */

import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { createKimiHarness, createKimiHarnessV2 } from '#/index';

import { TEST_IDENTITY } from './test-identity';

const tempDirs: string[] = [];

afterEach(async () => {
  for (const dir of tempDirs.splice(0)) {
    await rm(dir, { recursive: true, force: true });
  }
});

describe('cross-engine session resume', () => {
  it('resumes a v1-created session under the v2 engine', async () => {
    const homeDir = await mkdtemp(join(tmpdir(), 'kimi-xeng-home-'));
    const workDir = await mkdtemp(join(tmpdir(), 'kimi-xeng-work-'));
    tempDirs.push(homeDir, workDir);
    await writeFile(
      join(homeDir, 'config.toml'),
      `[providers.test]\ntype = "openai"\napi_key = "test-key"\n`,
      'utf-8',
    );

    const v1 = createKimiHarness({ homeDir, identity: TEST_IDENTITY });
    try {
      const session = await v1.createSession({ id: 'ses_cross_engine', workDir });
      await session.setNotepad('written by v1');
      await session.createGoal({ objective: 'cross-engine goal' });
      await session.close();
    } finally {
      await v1.close();
    }

    const v2 = createKimiHarnessV2({ homeDir, identity: TEST_IDENTITY });
    try {
      const resumed = await v2.resumeSession({ id: 'ses_cross_engine' });
      expect(resumed.id).toBe('ses_cross_engine');

      // State written by v1 (tool store records, goal records) survives.
      expect(await resumed.getNotepad()).toBe('written by v1');
      const { goal } = await resumed.getGoal();
      expect(goal?.objective).toContain('cross-engine goal');

      const state = resumed.getResumeState();
      expect(state?.agents['main']).toBeDefined();

      await resumed.close();
    } finally {
      await v2.close();
    }
  });
});
