import type { McpServerConfig } from './config-schema';
import type { McpGroup } from './group-config';

export interface McpGroupEntry {
  readonly name: string;
  readonly description?: string;
  readonly servers: readonly string[];
  readonly skillPrefixes: readonly string[];
}

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

  serversOfGroup(groupName: string): readonly string[] | undefined {
    const group = this.groups.get(groupName);
    if (group === undefined) return undefined;
    if (group.servers.includes('*')) return Object.keys(this.servers);
    return group.servers;
  }

  groupOfServer(serverName: string): McpGroupEntry | undefined {
    for (const group of this.groups.values()) {
      if (group.servers.includes('*')) return group;
      if (group.servers.includes(serverName)) return group;
    }
    return undefined;
  }
}
