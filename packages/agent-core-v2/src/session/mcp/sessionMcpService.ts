/**
 * `mcp` domain (L5), Session scope — `ISessionMcpService` implementation.
 *
 * Owns the session-wide `McpConnectionManager` (built lazily, shared by every
 * agent), resolves the session + caller-supplied + plugin MCP config, drives
 * the initial connect (`ensureMcpReady`, cached so session creation and first
 * agent creation can both await it), and reports connection telemetry. An
 * outright initial-load failure is logged (per-server failures are status
 * entries). Bound at Session scope.
 */

import { InstantiationType } from '#/_base/di/extensions';
import { Disposable } from '#/_base/di/lifecycle';
import { LifecycleScope, registerScopedService } from '#/_base/di/scope';
import { McpConnectionManager } from '#/agent/mcp/connection-manager';
import type { McpServerConfig } from '#/agent/mcp/config-schema';
import type { McpGroupRegistry } from '#/agent/mcp/group-registry';
import { McpOAuthService } from '#/agent/mcp/oauth/service';
import { createMcpOAuthStore } from '#/agent/mcp/oauth/store';
import {
  mergeCallerMcpServers,
  partitionServersByGroup,
  resolveSessionMcpConfig,
} from '#/agent/mcp/session-config';
import { ErrorCodes, Error2 } from '#/errors';
import { IBootstrapService } from '#/app/bootstrap/bootstrap';
import { IPluginService } from '#/app/plugin/plugin';
import { ITelemetryService } from '#/app/telemetry/telemetry';
import { ILogService } from '#/_base/log/log';
import { IAtomicDocumentStore } from '#/persistence/interface/atomicDocumentStore';
import { ISessionWorkspaceContext } from '#/session/workspaceContext/workspaceContext';

import { ISessionMcpService, type McpGroupInfo } from './sessionMcp';

export class SessionMcpService extends Disposable implements ISessionMcpService {
  declare readonly _serviceBrand: undefined;

  private mcpManager: McpConnectionManager | undefined;
  private mcpInitialLoad: Promise<void> | undefined;
  private mcpGroupRegistry: McpGroupRegistry | undefined;
  private activeGroupName: string | null = null;

  constructor(
    @IBootstrapService private readonly bootstrap: IBootstrapService,
    @ISessionWorkspaceContext private readonly workspace: ISessionWorkspaceContext,
    @IPluginService private readonly plugins: IPluginService,
    @IAtomicDocumentStore private readonly atomicDocs: IAtomicDocumentStore,
    @ILogService private readonly log: ILogService,
    @ITelemetryService private readonly telemetry: ITelemetryService,
  ) {
    super();
  }

  ensureMcpReady(callerServers?: Readonly<Record<string, McpServerConfig>>): Promise<void> {
    if (this.mcpInitialLoad !== undefined) return this.mcpInitialLoad;
    const manager = this.connectionManager();
    const initialLoad = this.connectMcpServers(manager, callerServers).catch((error: unknown) => {
      this.log.error('mcp initial load failed', { error });
    });
    this.mcpInitialLoad = initialLoad;
    return initialLoad;
  }

  connectionManager(): McpConnectionManager {
    if (this.mcpManager !== undefined) return this.mcpManager;
    const oauthService = new McpOAuthService({
      store: createMcpOAuthStore(this.atomicDocs),
    });
    const manager = new McpConnectionManager({
      log: this.log,
      oauthService,
      stdioCwd: this.workspace.workDir,
    });
    this.mcpManager = manager;
    this._register({ dispose: () => void manager.shutdown() });
    return manager;
  }

  groupRegistry(): McpGroupRegistry | undefined {
    return this.mcpGroupRegistry;
  }

  listGroups(): readonly McpGroupInfo[] {
    const registry = this.mcpGroupRegistry;
    if (registry === undefined) return [];
    const manager = this.connectionManager();
    return registry.list().map((group) => {
      const resolved = registry.resolveServers(group.name) ?? {};
      const serverNames = Object.keys(resolved);
      const loaded =
        serverNames.length > 0 &&
        serverNames.every((name) => {
          const status = manager.get(name)?.status;
          return status === 'connected' || status === 'failed' || status === 'needs-auth';
        });
      return {
        name: group.name,
        description: group.description,
        servers: group.servers,
        skillPrefixes: group.skillPrefixes,
        loaded,
      };
    });
  }

  async loadGroup(name: string): Promise<void> {
    const registry = this.mcpGroupRegistry;
    if (registry === undefined || !registry.has(name)) {
      throw new Error2(ErrorCodes.MCP_SERVER_NOT_FOUND, `Unknown MCP group: ${name}`);
    }
    await this.ensureMcpReady();
    await this.connectionManager().loadGroup(name, registry);
    this.activeGroupName = name;
  }

  async loadServer(name: string): Promise<void> {
    await this.ensureMcpReady();
    const manager = this.connectionManager();
    if (manager.get(name) === undefined) {
      throw new Error2(ErrorCodes.MCP_SERVER_NOT_FOUND, `Unknown MCP server: ${name}`);
    }
    await manager.reconnect(name);
  }

  async addOrUpdateServer(name: string, config: McpServerConfig): Promise<void> {
    await this.ensureMcpReady();
    await this.connectionManager().connect(name, config);
  }

  async removeServer(name: string): Promise<boolean> {
    await this.ensureMcpReady();
    return this.connectionManager().remove(name);
  }

  activeGroup(): string | null {
    return this.activeGroupName;
  }

  setGroupMode(name: string | null): void {
    if (name !== null) {
      const registry = this.mcpGroupRegistry;
      if (registry === undefined || !registry.has(name)) {
        throw new Error2(ErrorCodes.MCP_SERVER_NOT_FOUND, `Unknown MCP group: ${name}`);
      }
    }
    this.activeGroupName = name;
  }

  private async connectMcpServers(
    manager: McpConnectionManager,
    callerServers?: Readonly<Record<string, McpServerConfig>>,
  ): Promise<void> {
    const [base, pluginServers] = await Promise.all([
      resolveSessionMcpConfig({ cwd: this.workspace.workDir, homeDir: this.bootstrap.homeDir }),
      this.plugins.enabledMcpServers(),
    ]);
    const withCaller = mergeCallerMcpServers(base, callerServers);
    const registry = withCaller?.groupRegistry;
    this.mcpGroupRegistry = registry;
    const servers = { ...withCaller?.servers, ...pluginServers };
    if (Object.keys(servers).length === 0) return;
    const { eager, lazy } = partitionServersByGroup(servers, registry);
    manager.registerLazyServers(lazy);
    await manager.connectAll(eager);
    this.trackMcpInitialLoad(manager);
  }

  private trackMcpInitialLoad(manager: McpConnectionManager): void {
    const entries = manager.list().filter((entry) => entry.status !== 'disabled');
    const totalCount = entries.length;
    if (totalCount === 0) return;

    const connectedCount = entries.filter((entry) => entry.status === 'connected').length;
    if (connectedCount > 0) {
      this.telemetry.track2('mcp_connected', {
        server_count: connectedCount,
        total_count: totalCount,
      });
    }

    const failedCount = entries.filter((entry) => entry.status === 'failed').length;
    if (failedCount > 0) {
      this.telemetry.track2('mcp_failed', {
        failed_count: failedCount,
        total_count: totalCount,
      });
    }
  }
}

registerScopedService(
  LifecycleScope.Session,
  ISessionMcpService,
  SessionMcpService,
  InstantiationType.Eager,
  'sessionMcp',
);
