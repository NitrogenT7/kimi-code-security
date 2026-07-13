import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  discoverGoalTemplates,
  GoalTemplateRegistry,
  parseGoalTemplateText,
} from '../../src/goal-template';

describe('goal-template parser', () => {
  it('parses a full template', () => {
    const template = parseGoalTemplateText({
      templatePath: '/tmp/refactor.md',
      templateName: 'refactor',
      source: 'project',
      text: `---
name: refactor-and-test
description: Refactor without changing behavior
purpose: Improve maintainability
keyTasks: |
  - Read the code
  - Refactor in small steps
endState: Tests pass
constraints: |
  - No new features
---
Body text here.
`,
    });

    expect(template.name).toBe('refactor-and-test');
    expect(template.description).toBe('Refactor without changing behavior');
    expect(template.purpose).toBe('Improve maintainability');
    expect(template.keyTasks).toContain('Read the code');
    expect(template.endState).toBe('Tests pass');
    expect(template.constraints).toContain('No new features');
    expect(template.body).toBe('Body text here.');
  });

  it('requires at least one four-element field', () => {
    expect(() =>
      parseGoalTemplateText({
        templatePath: '/tmp/empty.md',
        templateName: 'empty',
        source: 'project',
        text: `---
name: empty
description: Empty template
---
`,
      }),
    ).toThrow('must define at least one of purpose/keyTasks/endState/constraints');
  });
});

describe('goal-template scanner', () => {
  it('discovers templates from .goal/ and .agents/goals/ directories', async () => {
    const root = await mkdtemp(join(tmpdir(), 'goal-template-'));
    try {
      const projectGoalDir = join(root, '.goal');
      const userGoalDir = join(root, 'home', '.goal');
      const userGenericDir = join(root, 'home', '.agents', 'goals');
      await writeFile(join(root, 'x.txt'), 'noop');
      const { mkdir } = await import('node:fs/promises');
      await mkdir(projectGoalDir, { recursive: true });
      await mkdir(userGoalDir, { recursive: true });
      await mkdir(userGenericDir, { recursive: true });
      await writeFile(
        join(projectGoalDir, 'sample.md'),
        `---
name: sample
purpose: Do a sample thing
endState: Sample done
---
`,
      );
      await writeFile(
        join(userGoalDir, 'user-sample.md'),
        `---
name: user-sample
purpose: Do a user sample thing
endState: User sample done
---
`,
      );
      await writeFile(
        join(userGenericDir, 'generic-sample.md'),
        `---
name: generic-sample
purpose: Do a generic sample thing
endState: Generic sample done
---
`,
      );

      const templates = await discoverGoalTemplates({
        paths: { workDir: root, userHomeDir: join(root, 'home') },
      });

      expect(templates).toHaveLength(3);
      expect(templates.map((t) => t.name).toSorted()).toEqual([
        'generic-sample',
        'sample',
        'user-sample',
      ]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

describe('GoalTemplateRegistry', () => {
  it('stores and retrieves templates by name', async () => {
    const registry = new GoalTemplateRegistry();
    registry.register({
      name: 'Alpha',
      description: 'First',
      path: '/tmp/alpha.md',
      source: 'project',
      purpose: 'P',
      endState: 'E',
    });

    expect(registry.getTemplate('alpha')).toBeDefined();
    expect(registry.getTemplate('ALPHA')?.purpose).toBe('P');
    expect(registry.listTemplates()).toHaveLength(1);
  });
});
