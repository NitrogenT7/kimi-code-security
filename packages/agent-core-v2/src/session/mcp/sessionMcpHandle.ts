import { createDecorator, type ServiceIdentifier } from '#/_base/di/instantiation';
import type { ScopeSeed } from '#/_base/di/scope';
import type { McpConnectionView } from '#/mcpCore/connection-manager';

export interface McpGroupInfoDto {
  readonly name: string;
  readonly description?: string;
  readonly servers: readonly string[];
  readonly skillPrefixes: readonly string[];
  readonly loaded: boolean;
}

export interface McpGroupLoadOutcomeDto {
  readonly server: string;
  readonly ok: boolean;
  readonly error?: string;
}

export interface ISessionMcpHandle {
  readonly _serviceBrand: undefined;

  readonly ready: Promise<void>;
  readonly connectionManager: McpConnectionView;
  isBaselineServer(name: string): boolean;
  listMcpGroups?(): readonly McpGroupInfoDto[];
  loadMcpGroup?(groupName: string): Promise<readonly McpGroupLoadOutcomeDto[]>;
  unloadMcpGroup?(groupName: string): Promise<readonly McpGroupLoadOutcomeDto[]>;
}

export const ISessionMcpHandle: ServiceIdentifier<ISessionMcpHandle> =
  createDecorator<ISessionMcpHandle>('sessionMcpHandle');

export function sessionMcpHandleSeed(handle: ISessionMcpHandle): ScopeSeed {
  return [[ISessionMcpHandle as ServiceIdentifier<unknown>, handle]];
}
