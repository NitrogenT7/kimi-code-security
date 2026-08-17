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
import { IInstantiationService } from '#/_base/di/instantiation';
import { IAgentLifecycleService, MAIN_AGENT_ID } from '#/session/agentLifecycle/agentLifecycle';
import { IAgentSkillService } from '#/agent/skill/skill';

import { ISessionMcpService, type McpGroupInfo, type McpGroupLoadResult } from './sessionMcp';

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
    @IInstantiationService private readonly instantiation: IInstantiationService,
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
        serverNames.every((name) => manager.get(name)?.status === 'connected');
      return {
        name: group.name,
        description: group.description,
        servers: group.servers,
        skillPrefixes: group.skillPrefixes,
        loaded,
      };
    });
  }

  async loadGroup(name: string): Promise<McpGroupLoadResult> {
    const registry = this.mcpGroupRegistry;
    if (registry === undefined || !registry.has(name)) {
      throw new Error2(ErrorCodes.MCP_SERVER_NOT_FOUND, `Unknown MCP group: ${name}`);
    }
    await this.ensureMcpReady();
    const manager = this.connectionManager();
    const serverNames = Object.keys(registry.resolveServers(name) ?? {});
    await manager.loadGroup(name, registry);
    const connected: string[] = [];
    const needsAuth: string[] = [];
    const failed: { readonly name: string; readonly error?: string }[] = [];
    for (const serverName of serverNames) {
      const entry = manager.get(serverName);
      if (entry?.status === 'connected') {
        connected.push(serverName);
      } else if (entry?.status === 'needs-auth') {
        needsAuth.push(serverName);
      } else {
        failed.push({ name: serverName, error: entry?.error });
      }
    }
    // Mark active only when the group is actually usable — a fully failed
    // load must not claim success.
    if (connected.length > 0) this.activeGroupName = name;
    return { connected, needsAuth, failed };
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
    const registry = this.mcpGroupRegistry;
    if (name !== null) {
      if (registry === undefined || !registry.has(name)) {
        throw new Error2(ErrorCodes.MCP_SERVER_NOT_FOUND, `Unknown MCP group: ${name}`);
      }
    }
    this.activeGroupName = name;
    // v1 parity (session/rpc setMcpGroupMode): switching group mode also
    // sandboxes the main agent's skill activation to the group's
    // `skillPrefixes` (hard gate in AgentSkillService / SkillTool). Resolved
    // lazily through the instantiation service — a constructor injection of
    // `IAgentLifecycleService` would form a DI cycle
    // (agentLifecycle → sessionMcp → agentLifecycle).
    const prefixes = name === null ? undefined : registry!.skillPrefixes(name);
    const main = this.instantiation.invokeFunction((accessor) =>
      accessor.get(IAgentLifecycleService).get(MAIN_AGENT_ID),
    );
    main?.accessor.get(IAgentSkillService).setAllowedSkillPrefixes(prefixes);
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
    if (withCaller?.groupConfigError !== undefined) {
      this.log.warn('invalid mcpGroups config; continuing without groups', {
        error: withCaller.groupConfigError,
      });
    }
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
