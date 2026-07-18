import type { McpServerConfig } from './config-schema';

import { loadMcpServers } from './config-loader';
import { loadMcpGroups, type McpGroup } from './group-config';
import { McpGroupRegistry } from './group-registry';

export interface SessionMcpConfig {
  readonly servers: Record<string, McpServerConfig>;
  readonly groups?: Record<string, McpGroup>;
  readonly groupRegistry?: McpGroupRegistry;
}

export interface ResolveSessionMcpConfigInput {
  readonly cwd: string;
  readonly homeDir?: string;
}

export async function resolveSessionMcpConfig(
  input: ResolveSessionMcpConfigInput,
): Promise<SessionMcpConfig | undefined> {
  const servers = await loadMcpServers({
    cwd: input.cwd,
    homeDir: input.homeDir,
  });
  if (Object.keys(servers).length === 0) return undefined;

  const groups = await loadMcpGroups({
    cwd: input.cwd,
    homeDir: input.homeDir,
  });

  return {
    servers,
    groups,
    groupRegistry: new McpGroupRegistry(groups, servers),
  };
}

export function mergeCallerMcpServers(
  base: SessionMcpConfig | undefined,
  callerServers: Readonly<Record<string, McpServerConfig>> | undefined,
): SessionMcpConfig | undefined {
  if (callerServers === undefined || Object.keys(callerServers).length === 0) {
    return base;
  }
  const mergedServers = {
    ...base?.servers,
    ...callerServers,
  };
  const groups = base?.groups;
  if (groups === undefined) {
    return { servers: mergedServers };
  }
  return {
    servers: mergedServers,
    groups,
    groupRegistry: new McpGroupRegistry(groups, mergedServers),
  };
}

export interface PartitionedMcpServers {
  /** Servers not claimed by any group — connected eagerly at session startup. */
  readonly eager: Record<string, McpServerConfig>;
  /** Servers claimed by at least one group — stay lazy until the group loads. */
  readonly lazy: Record<string, McpServerConfig>;
}

/**
 * Split configured servers into the eagerly-connected set and the lazy
 * (group-managed) set. A group server reference of `"*"` claims every server.
 * When no groups are declared, everything is eager (legacy behavior).
 */
export function partitionServersByGroup(
  servers: Record<string, McpServerConfig>,
  registry: McpGroupRegistry | undefined,
): PartitionedMcpServers {
  if (registry === undefined || registry.list().length === 0) {
    return { eager: servers, lazy: {} };
  }
  const lazyNames = new Set<string>();
  for (const group of registry.list()) {
    for (const serverName of group.servers) {
      if (serverName === '*') {
        for (const name of Object.keys(servers)) lazyNames.add(name);
      } else if (servers[serverName] !== undefined) {
        lazyNames.add(serverName);
      }
    }
  }
  const eager: Record<string, McpServerConfig> = {};
  const lazy: Record<string, McpServerConfig> = {};
  for (const [name, config] of Object.entries(servers)) {
    if (lazyNames.has(name)) {
      lazy[name] = config;
    } else {
      eager[name] = config;
    }
  }
  return { eager, lazy };
}
