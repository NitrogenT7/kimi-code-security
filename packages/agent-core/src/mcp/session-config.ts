import type { McpServerConfig } from '#/config/schema';

import { loadMcpServers } from './config-loader';
import { loadMcpGroups, type McpGroup } from './group-config';
import { McpGroupRegistry } from './group-registry';

export interface SessionMcpConfig {
  readonly servers: Record<string, McpServerConfig>;
  readonly groups: Record<string, McpGroup>;
  readonly groupRegistry: McpGroupRegistry;
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
  const groups = base?.groups ?? {};
  return {
    servers: mergedServers,
    groups,
    groupRegistry: new McpGroupRegistry(groups, mergedServers),
  };
}
