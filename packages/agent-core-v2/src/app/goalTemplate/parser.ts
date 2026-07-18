/**
 * `goalTemplate` domain (L3) — goal template parsing primitives.
 *
 * Parses a goal template markdown file (frontmatter + optional body) into a
 * `GoalTemplate`, reusing the skill catalog's frontmatter parser. Pure
 * functions with no IO: callers (the scanner) read bytes however they like and
 * pass the decoded text in, mirroring `#/app/skillCatalog/parser`.
 */

import path from 'pathe';

import { parseFrontmatter, SkillParseError } from '#/app/skillCatalog/parser';

import type { GoalTemplate, GoalTemplateSource } from './types';

export interface ParseGoalTemplateOptions {
  readonly templatePath: string;
  readonly templateName: string;
  readonly source: GoalTemplateSource;
}

export interface ParseGoalTemplateTextOptions extends ParseGoalTemplateOptions {
  readonly text: string;
}

export function parseGoalTemplateText(options: ParseGoalTemplateTextOptions): GoalTemplate {
  let parsed;
  try {
    parsed = parseFrontmatter(options.text);
  } catch (error) {
    if (error instanceof SkillParseError) {
      throw new SkillParseError(
        `Invalid frontmatter in ${options.templatePath}: ${error.message}`,
        error,
      );
    }
    throw error;
  }

  const frontmatter = parsed.data ?? {};
  if (!isRecord(frontmatter)) {
    throw new SkillParseError(
      `Frontmatter in ${options.templatePath} must be a mapping at the top level`,
    );
  }

  const name = nonEmptyString(frontmatter['name']) ?? options.templateName;
  const description =
    nonEmptyString(frontmatter['description']) ?? descriptionFromBody(parsed.body.trim());
  const purpose = nonEmptyString(frontmatter['purpose']);
  const keyTasks = nonEmptyString(frontmatter['keyTasks']);
  const endState = nonEmptyString(frontmatter['endState']);
  const constraints = nonEmptyString(frontmatter['constraints']);
  const body = parsed.body.trim().length > 0 ? parsed.body.trim() : undefined;

  if (
    purpose === undefined &&
    keyTasks === undefined &&
    endState === undefined &&
    constraints === undefined
  ) {
    throw new SkillParseError(
      `Goal template ${options.templatePath} must define at least one of purpose/keyTasks/endState/constraints`,
    );
  }

  return {
    name,
    description,
    path: path.resolve(options.templatePath),
    source: options.source,
    purpose,
    keyTasks,
    endState,
    constraints,
    body,
  };
}

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function descriptionFromBody(body: string): string {
  const firstLine = body
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.length > 0);
  if (firstLine === undefined) return 'No description provided.';
  return firstLine.length > 240 ? `${firstLine.slice(0, 239)}…` : firstLine;
}
