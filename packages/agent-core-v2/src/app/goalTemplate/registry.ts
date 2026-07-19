/**
 * `goalTemplate` domain (L3) — in-memory goal template registry.
 *
 * Name-keyed (case-insensitive) template lookup with sorted listing, loaded
 * from discovery results and open to ad-hoc registration. Held by the
 * Session-scoped goal template service; it is not a scoped service itself,
 * mirroring `#/app/skillCatalog/registry`.
 */

import { discoverGoalTemplates, type DiscoverGoalTemplatesOptions } from './scanner';
import type { GoalTemplate, GoalTemplateSummary } from './types';

export interface GoalTemplateRegistryOptions {
  readonly discover?: typeof discoverGoalTemplates;
  readonly onWarning?: (message: string, cause?: unknown) => void;
}

export class GoalTemplateRegistry {
  private readonly byName = new Map<string, GoalTemplate>();
  private readonly discoverImpl: typeof discoverGoalTemplates;
  private readonly onWarning: (message: string, cause?: unknown) => void;

  constructor(options: GoalTemplateRegistryOptions = {}) {
    this.discoverImpl = options.discover ?? discoverGoalTemplates;
    this.onWarning = options.onWarning ?? (() => {});
  }

  async loadRoots(
    paths: DiscoverGoalTemplatesOptions['paths'],
    extraDirs?: readonly string[],
  ): Promise<void> {
    const templates = await this.discoverImpl({
      paths,
      extraDirs,
      onWarning: this.onWarning,
    });

    for (const template of templates) {
      this.byName.set(template.name.toLowerCase(), template);
    }
  }

  register(template: GoalTemplate, options: { readonly replace?: boolean } = {}): void {
    const key = template.name.toLowerCase();
    if (options.replace === true || !this.byName.has(key)) {
      this.byName.set(key, template);
    }
  }

  getTemplate(name: string): GoalTemplate | undefined {
    return this.byName.get(name.toLowerCase());
  }

  listTemplates(): readonly GoalTemplate[] {
    return [...this.byName.values()].toSorted((a, b) => a.name.localeCompare(b.name));
  }

  listSummaries(): readonly GoalTemplateSummary[] {
    return this.listTemplates().map((t) => ({
      name: t.name,
      description: t.description,
      path: t.path,
      source: t.source,
    }));
  }
}
