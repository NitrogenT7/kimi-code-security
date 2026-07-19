/**
 * `mcp` domain (L5), Session scope — the session's shared MCP subsystem.
 *
 * Owns the session-wide `McpConnectionManager` (one per session, shared by
 * every agent, matching v1's session-scoped MCP and avoiding a reconnect
 * storm per agent), the initial connect attempt (`ensureMcpReady`), and its
 * telemetry. When `mcpGroups` are declared in mcp.json, servers claimed by a
 * group stay `registered` (lazy) until the group is loaded through
 * {@link ISessionMcpService.loadGroup}; ungrouped servers connect eagerly.
 * Split out of `agentLifecycle`: agent existence and MCP connections are
 * independent concerns — the lifecycle only needs to await the initial
 * connect before an agent's first turn and to seed the shared manager into
 * each agent scope. Bound at Session scope.
 */

import { createDecorator, type ServiceIdentifier } from '#/_base/di/instantiation';
import type { McpConnectionManager } from '#/agent/mcp/connection-manager';
import type { McpServerConfig } from '#/agent/mcp/config-schema';
import type { McpGroupRegistry } from '#/agent/mcp/group-registry';

/** Wire-safe view of one MCP group (see `McpGroupRegistry`). */
export interface McpGroupInfo {
  readonly name: string;
  readonly description?: string;
  readonly servers: readonly string[];
  readonly skillPrefixes: readonly string[];
  /** True once every server the group resolves to has been loaded. */
  readonly loaded: boolean;
}

export interface ISessionMcpService {
  readonly _serviceBrand: undefined;

  /**
   * Resolve the session/plugin MCP config and wait for the initial connection
   * attempt to finish. Per-server failures are reflected in MCP status entries
   * rather than rejecting this promise; an outright failure is logged.
   * `callerServers` (caller-supplied servers from session create) merge into
   * the initial connect between file config and plugin servers; the first
   * call wins — the initial load is cached and later calls ignore the arg.
   */
  ensureMcpReady(callerServers?: Readonly<Record<string, McpServerConfig>>): Promise<void>;

  /** The session's shared connection manager (built lazily, cached). */
  connectionManager(): McpConnectionManager;

  /** The session's MCP group registry, or `undefined` when no groups exist. */
  groupRegistry(): McpGroupRegistry | undefined;

  /** List declared MCP groups with their lazy-load state. */
  listGroups(): readonly McpGroupInfo[];

  /**
   * Connect every server in the named group and mark it as the active group
   * (see {@link activeGroup}). Throws `mcp.server_not_found` for unknown
   * groups.
   */
  loadGroup(name: string): Promise<void>;

  /** Connect a single known (registered) MCP server on demand. */
  loadServer(name: string): Promise<void>;

  /** Register a new server or replace an existing server's config and connect it. */
  addOrUpdateServer(name: string, config: McpServerConfig): Promise<void>;

  /** Disconnect and remove a server from the runtime manager. */
  removeServer(name: string): Promise<boolean>;

  /** The currently active MCP group name, or `null` when no group mode is set. */
  activeGroup(): string | null;

  /**
   * Set or clear the active MCP group. Passing a name only marks the group as
   * active (it does not connect its servers — use {@link loadGroup} for that);
   * passing `null` clears the mode. Throws `mcp.server_not_found` for unknown
   * groups.
   */
  setGroupMode(name: string | null): void;
}

export const ISessionMcpService: ServiceIdentifier<ISessionMcpService> =
  createDecorator<ISessionMcpService>('sessionMcpService');
