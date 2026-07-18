/**
 * Scenario: session goal template catalog discovery and lookup.
 * Responsibilities: verify the Session-scoped service scans the workspace `.goal/`
 * directory and the user goal directories, caches results, and reports unknown names.
 * Wiring: real service with stubbed bootstrap/workspace boundaries and temp directories.
 * Run: `pnpm --filter @moonshot-ai/agent-core-v2 exec vitest run test/session/sessionGoalTemplate/goalTemplate.test.ts`.
 */

import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';

import { join } from 'pathe';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createScopedTestHost, stubPair, type ScopedTestHost } from '#/_base/di/test';
import { LifecycleScope } from '#/_base/di/scope';
import { IBootstrapService } from '#/app/bootstrap/bootstrap';
import { ErrorCodes } from '#/errors';
import { ISessionWorkspaceContext } from '#/session/workspaceContext/workspaceContext';
import { ISessionGoalTemplateService } from '#/session/sessionGoalTemplate/goalTemplate';
import '#/session/sessionGoalTemplate/goalTemplateService';

import { stubBootstrap } from '../../app/bootstrap/stubs';

function workspaceStub(workDir: string): ISessionWorkspaceContext {
  return {
    _serviceBrand: undefined,
    workDir,
    additionalDirs: [],
    setWorkDir: () => {},
    setAdditionalDirs: () => {},
    resolve: (rel: string) => rel,
    isWithin: () => true,
    assertAllowed: (p: string) => p,
    addAdditionalDir: () => {},
    removeAdditionalDir: () => {},
  };
}

const SAMPLE_TEMPLATE = `---
name: sample
description: Sample template
purpose: Do a sample thing
keyTasks: |
  - First
  - Second
endState: Sample done
constraints: No shortcuts
---
Extra guidance body.
`;

describe('SessionGoalTemplateService', () => {
  let root: string;
  let workDir: string;
  let homeDir: string;
  let host: ScopedTestHost;
  let templates: ISessionGoalTemplateService;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'goal-template-service-'));
    workDir = join(root, 'workspace');
    homeDir = join(root, 'home');
    await mkdir(join(workDir, '.goal'), { recursive: true });
    await mkdir(join(homeDir, '.agents', 'goals'), { recursive: true });
    await writeFile(join(workDir, '.goal', 'sample.md'), SAMPLE_TEMPLATE);
    await writeFile(
      join(homeDir, '.agents', 'goals', 'user-sample.md'),
      `---\nname: user-sample\npurpose: User sample\n---\n`,
    );

    host = createScopedTestHost([
      stubPair(IBootstrapService, { ...stubBootstrap(homeDir), osHomeDir: homeDir }),
    ]);
    const session = host.child(LifecycleScope.Session, 's1', [
      stubPair(ISessionWorkspaceContext, workspaceStub(workDir)),
    ]);
    templates = session.accessor.get(ISessionGoalTemplateService);
  });

  afterEach(async () => {
    host.dispose();
    await rm(root, { recursive: true, force: true });
  });

  it('lists templates from the workspace and user goal directories', async () => {
    const summaries = await templates.listTemplates();

    expect(summaries.map((t) => t.name)).toEqual(['sample', 'user-sample']);
    expect(summaries[0]).toMatchObject({ source: 'project', description: 'Sample template' });
    expect(summaries[1]).toMatchObject({ source: 'user' });
  });

  it('resolves a template detail by name, case-insensitively', async () => {
    const detail = await templates.getTemplate('SAMPLE');

    expect(detail).toMatchObject({
      name: 'sample',
      purpose: 'Do a sample thing',
      endState: 'Sample done',
      constraints: 'No shortcuts',
      body: 'Extra guidance body.',
    });
    expect(detail.keyTasks).toContain('First');
  });

  it('throws goal.template_not_found for unknown names', async () => {
    await expect(templates.getTemplate('missing')).rejects.toMatchObject({
      code: ErrorCodes.GOAL_TEMPLATE_NOT_FOUND,
    });
  });

  it('caches discovery until reload', async () => {
    await templates.listTemplates();
    await writeFile(join(workDir, '.goal', 'late.md'), `---\nendState: Late\n---\n`);

    expect((await templates.listTemplates()).map((t) => t.name)).toEqual([
      'sample',
      'user-sample',
    ]);

    await templates.reload();
    expect((await templates.listTemplates()).map((t) => t.name)).toEqual([
      'late',
      'sample',
      'user-sample',
    ]);
  });
});
