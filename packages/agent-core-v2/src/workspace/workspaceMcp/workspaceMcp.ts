import { createDecorator, type ServiceIdentifier } from '#/_base/di/instantiation';
import type { McpConnectionManager } from '#/mcpCore/connection-manager';
import type { McpServerConfig } from '#/mcpCore/config-schema';
import type { McpGroupRegistry } from '#/mcpCore/group-registry';
import type { ISessionMcpHandle } from '#/session/mcp/sessionMcpHandle';

export interface ISessionMcpOverlay {
  readonly handle: ISessionMcpHandle;
  shutdown(): Promise<void>;
}

export interface SessionMcpOverlayOptions {
  readonly stdioCwd?: string;
}

export interface McpGroupLoadOutcome {
  readonly server: string;
  readonly ok: boolean;
  readonly error?: string;
}

export interface IWorkspaceMcpService {
  readonly _serviceBrand: undefined;

  readonly ready: Promise<void>;

  connectionManager(): McpConnectionManager;

  groupRegistry(): McpGroupRegistry | undefined;

  loadGroup(groupName: string): Promise<readonly McpGroupLoadOutcome[]>;

  unloadGroup(groupName: string): Promise<readonly McpGroupLoadOutcome[]>;

  sessionHandle(): ISessionMcpHandle;

  sessionOverlay(
    servers: Readonly<Record<string, McpServerConfig>>,
    opts?: SessionMcpOverlayOptions,
  ): ISessionMcpOverlay;
}

export const IWorkspaceMcpService: ServiceIdentifier<IWorkspaceMcpService> =
  createDecorator<IWorkspaceMcpService>('workspaceMcpService');
