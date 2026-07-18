/**
 * Goal template helpers for the `/goal set` slash command.
 *
 * Templates are markdown files with frontmatter (`purpose` / `keyTasks` /
 * `endState` / `constraints`) discovered from the project `.goal/` directory
 * and the user goal directories (`~/.goal/`, `~/.agents/goals/`). Discovery
 * and parsing are delegated to agent-core-v2's `goalTemplate` domain so the
 * CLI and the v2 engine share one scanner; the CLI reads the local filesystem
 * directly because its default engine path does not expose template RPCs.
 */

import { readdirSync } from 'node:fs';
import { homedir } from 'node:os';

import { basename, join } from 'pathe';

import { discoverGoalTemplates } from '@moonshot-ai/agent-core-v2/app/goalTemplate/scanner';
import type {
  GoalTemplate,
  GoalTemplateSummary,
} from '@moonshot-ai/agent-core-v2/app/goalTemplate/types';

function templateDirs(workDir: string): readonly string[] {
  return [
    join(workDir, '.goal'),
    join(homedir(), '.goal'),
    join(homedir(), '.agents', 'goals'),
  ];
}

async function discoverTemplates(workDir: string): Promise<readonly GoalTemplate[]> {
  return discoverGoalTemplates({
    paths: { workDir, userHomeDir: homedir() },
    onWarning: () => {},
  });
}

export async function listGoalTemplates(
  workDir: string,
): Promise<readonly GoalTemplateSummary[]> {
  const templates = await discoverTemplates(workDir);
  return templates
    .toSorted((a, b) => a.name.localeCompare(b.name))
    .map((t) => ({ name: t.name, description: t.description, path: t.path, source: t.source }));
}

/** Finds a template by frontmatter name or filename stem (case-insensitive). */
export async function findGoalTemplate(
  workDir: string,
  name: string,
): Promise<GoalTemplate | undefined> {
  const key = name.trim().toLowerCase();
  if (key.length === 0) return undefined;
  const templates = await discoverTemplates(workDir);
  return templates.find(
    (t) =>
      t.name.toLowerCase() === key ||
      basename(t.path).toLowerCase() === `${key}.md`,
  );
}

/**
 * Composes the four-element commander's-intent objective from a template:
 * [Purpose] / [Key Tasks] / [End State] / [Constraints], plus any free-form
 * body. The parser guarantees at least one element is present.
 */
export function composeGoalObjectiveFromTemplate(template: GoalTemplate): string {
  const parts: string[] = [];
  if (template.purpose !== undefined) parts.push(`[Purpose]\n${template.purpose}`);
  if (template.keyTasks !== undefined) parts.push(`[Key Tasks]\n${template.keyTasks}`);
  if (template.endState !== undefined) parts.push(`[End State]\n${template.endState}`);
  if (template.constraints !== undefined) parts.push(`[Constraints]\n${template.constraints}`);
  if (template.body !== undefined) parts.push(template.body);
  return parts.join('\n\n');
}

/**
 * Synchronous template-name listing for autocomplete: `.md` filename stems
 * from the template directories (parsing frontmatter would be too slow on the
 * completion path). Names that only differ by frontmatter `name` still apply
 * through {@link findGoalTemplate}'s filename fallback.
 */
export function listGoalTemplateNames(workDir: string): readonly string[] {
  const names = new Set<string>();
  for (const dir of templateDirs(workDir)) {
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (entry.startsWith('.') || !entry.endsWith('.md')) continue;
      names.add(entry.slice(0, -'.md'.length));
    }
  }
  return [...names].toSorted();
}
