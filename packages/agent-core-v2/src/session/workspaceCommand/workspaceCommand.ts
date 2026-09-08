import { createDecorator, type ServiceIdentifier } from '#/_base/di/instantiation';

export interface ChangeWorkDirInput {
  readonly path: string;
  readonly persist?: boolean;
}

export interface ChangeWorkDirResult {
  readonly workDir: string;
  readonly previousWorkDir: string;
  readonly persisted: boolean;
}

export interface ISessionWorkspaceCommandService {
  readonly _serviceBrand: undefined;

  changeWorkDir(input: ChangeWorkDirInput): Promise<ChangeWorkDirResult>;
}

export const ISessionWorkspaceCommandService: ServiceIdentifier<ISessionWorkspaceCommandService> =
  createDecorator<ISessionWorkspaceCommandService>('sessionWorkspaceCommandService');
