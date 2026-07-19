import { promises as fs } from 'node:fs';

import path from 'pathe';

import { SkillParseError } from '../skill/parser';
import { parseGoalTemplateFromFile } from './parser';
import type { GoalTemplate, GoalTemplateSource } from './types';

const PROJECT_DIR = '.goal' as const;
const USER_DIR = '.goal' as const;
const USER_GENERIC_DIR = path.join('.agents', 'goals') as string;

export interface GoalTemplatePathContext {
  readonly workDir: string;
  readonly userHomeDir: string;
}

export interface DiscoverGoalTemplatesOptions {
  readonly paths: GoalTemplatePathContext;
  readonly extraDirs?: readonly string[];
  readonly onWarning?: (message: string, cause?: unknown) => void;
  readonly onDiscoveredTemplate?: (template: GoalTemplate) => void;
  readonly readdir?: (p: string) => Promise<readonly string[]>;
  readonly isDir?: (p: string) => Promise<boolean>;
  readonly isFile?: (p: string) => Promise<boolean>;
}

export async function discoverGoalTemplates(
  options: DiscoverGoalTemplatesOptions,
): Promise<readonly GoalTemplate[]> {
  const readdir = options.readdir ?? defaultReaddir;
  const isDir = options.isDir ?? defaultIsDir;
  const isFile = options.isFile ?? defaultIsFile;
  const onWarning = options.onWarning ?? (() => {});

  const templates: GoalTemplate[] = [];
  const seen = new Set<string>();

  const roots: Array<{ dir: string; source: GoalTemplateSource }> = [
    { dir: path.join(options.paths.workDir, PROJECT_DIR), source: 'project' },
    { dir: path.join(options.paths.userHomeDir, USER_DIR), source: 'user' },
    { dir: path.join(options.paths.userHomeDir, USER_GENERIC_DIR), source: 'user' },
  ];

  for (const extra of options.extraDirs ?? []) {
    roots.push({ dir: extra, source: 'user' });
  }

  for (const root of roots) {
    if (!(await isDir(root.dir))) continue;
    let entries: readonly string[];
    try {
      entries = await readdir(root.dir);
    } catch (error) {
      onWarning(`Failed to read goal template directory ${root.dir}`, error);
      continue;
    }

    for (const entry of entries) {
      if (entry.startsWith('.') || !entry.endsWith('.md')) continue;
      const templatePath = path.join(root.dir, entry);
      if (!(await isFile(templatePath))) continue;
      const templateName = entry.slice(0, -'.md'.length);
      try {
        const template = await parseGoalTemplateFromFile({
          templatePath,
          templateName,
          source: root.source,
        });
        const key = template.name.toLowerCase();
        if (seen.has(key)) {
          onWarning(
            `Ignoring duplicate goal template ${templatePath} (name ${template.name} already seen)`,
          );
          continue;
        }
        seen.add(key);
        templates.push(template);
        options.onDiscoveredTemplate?.(template);
      } catch (error) {
        if (error instanceof SkillParseError) {
          onWarning(error.message, error);
        } else {
          onWarning(`Failed to parse goal template ${templatePath}`, error);
        }
      }
    }
  }

  return templates;
}

async function defaultReaddir(p: string): Promise<readonly string[]> {
  return await fs.readdir(p);
}

async function defaultIsDir(p: string): Promise<boolean> {
  try {
    return (await fs.stat(p)).isDirectory();
  } catch {
    return false;
  }
}

async function defaultIsFile(p: string): Promise<boolean> {
  try {
    return (await fs.stat(p)).isFile();
  } catch {
    return false;
  }
}
