import { createDecorator, type ServiceIdentifier } from '#/_base/di/instantiation';

export interface ISessionSubagentModelsValidationService {
  readonly _serviceBrand: undefined;
}

export const ISessionSubagentModelsValidationService: ServiceIdentifier<ISessionSubagentModelsValidationService> =
  createDecorator<ISessionSubagentModelsValidationService>(
    'sessionSubagentModelsValidationService',
  );

export interface ISubagentModelsDiagnosticsService {
  readonly _serviceBrand: undefined;
}

export const ISubagentModelsDiagnosticsService: ServiceIdentifier<ISubagentModelsDiagnosticsService> =
  createDecorator<ISubagentModelsDiagnosticsService>(
    'subagentModelsDiagnosticsService',
  );
