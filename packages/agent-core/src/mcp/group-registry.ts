import type { McpServerConfig } from '#/config/schema';

import type { McpGroup } from './group-config';

export interface McpGroupEntry {
  readonly name: string;
  readonly description?: string;
  readonly servers: readonly string[];
  readonly skillPrefixes: readonly string[];
}

/**
 * Holds MCP group definitions and resolves them against the configured MCP
 * servers. Groups are lazy: this registry only stores definitions; actual
 * connections are still owned by {@link McpConnectionManager}.
 */
export class McpGroupRegistry {
  private readonly groups = new Map<string, McpGroupEntry>();
  private readonly servers: Readonly<Record<string, McpServerConfig>>;

  constructor(groups: Record<string, McpGroup>, servers: Record<string, McpServerConfig>) {
    this.servers = servers;
    for (const [name, group] of Object.entries(groups)) {
      this.groups.set(name, {
        name,
        description: group.description,
        servers: group.servers,
        skillPrefixes: group.skillPrefixes ?? [],
      });
    }
  }

  list(): readonly McpGroupEntry[] {
    return Array.from(this.groups.values());
  }

  get(name: string): McpGroupEntry | undefined {
    return this.groups.get(name);
  }

  has(name: string): boolean {
    return this.groups.has(name);
  }

  /**
   * Expand a group's server references into actual MCP server configs.
   * A server name of `"*"` expands to all known servers.
   */
  resolveServers(groupName: string): Record<string, McpServerConfig> | undefined {
    const group = this.groups.get(groupName);
    if (group === undefined) return undefined;

    const result: Record<string, McpServerConfig> = {};
    for (const serverName of group.servers) {
      if (serverName === '*') {
        for (const [name, config] of Object.entries(this.servers)) {
          result[name] = config;
        }
      } else if (this.servers[serverName] !== undefined) {
        result[serverName] = this.servers[serverName]!;
      }
    }
    return result;
  }

  /**
   * Return the skill prefixes associated with a group, or an empty array if
   * the group is unknown.
   */
  skillPrefixes(groupName: string): readonly string[] {
    return this.groups.get(groupName)?.skillPrefixes ?? [];
  }
}
