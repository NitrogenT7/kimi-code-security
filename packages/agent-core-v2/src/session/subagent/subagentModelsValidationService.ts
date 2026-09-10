import { Disposable } from '#/_base/di/lifecycle';
import { ScopeActivation, registerScopedService } from '#/_base/di/scope';
import { ILogService } from '#/_base/log/log';
import { IConfigService } from '#/app/config/config';
import { describeUnknownError } from '#/app/config/configPure';
import { IKosongConfigService } from '#/app/kosongConfig/kosongConfig';
import { MODELS_SECTION, PROVIDERS_SECTION } from '#/app/kosongConfig/configSection';
import { LifecycleScope } from '#/app/scopes';
import { IModelCatalog } from '#/llm-adapter/model/catalog';

import { SECONDARY_MODEL_SECTION, assertValidSubagentModelConfig } from './configSection';
import {
  ISessionSubagentModelsValidationService,
  ISubagentModelsDiagnosticsService,
} from './subagentModelsValidation';

const SUBAGENT_MODELS_DIAGNOSTIC_KEY = 'subagentModels';

export function reportSubagentModelsDiagnostic(
  config: IConfigService,
  modelCatalog: IModelCatalog,
  log: ILogService,
): void {
  try {
    assertValidSubagentModelConfig(config, modelCatalog);
    config.clearReportedDiagnostic(SUBAGENT_MODELS_DIAGNOSTIC_KEY);
  } catch (error) {
    log.warn('invalid [secondary_model] configuration', { error: describeUnknownError(error) });
    config.reportDiagnostic(SUBAGENT_MODELS_DIAGNOSTIC_KEY, {
      domain: SECONDARY_MODEL_SECTION,
      severity: 'warning',
      message: `${describeUnknownError(error)} Sessions still start; subagent spawning that relies on [secondary_model] fails until this is fixed.`,
    });
  }
}

export class SessionSubagentModelsValidationService
  implements ISessionSubagentModelsValidationService
{
  declare readonly _serviceBrand: undefined;

  constructor(
    @IConfigService config: IConfigService,
    @IModelCatalog modelCatalog: IModelCatalog,
    @ILogService log: ILogService,
    @IKosongConfigService kosongConfig: IKosongConfigService,
  ) {
    void kosongConfig.ready.then(
      () => reportSubagentModelsDiagnostic(config, modelCatalog, log),
      (error) =>
        log.warn('subagent models validation skipped: config bridge failed', {
          error: describeUnknownError(error),
        }),
    );
  }
}

registerScopedService(
  LifecycleScope.Session,
  ISessionSubagentModelsValidationService,
  SessionSubagentModelsValidationService,
  ScopeActivation.OnScopeCreated,
  'subagent',
);

export class SubagentModelsDiagnosticsService
  extends Disposable
  implements ISubagentModelsDiagnosticsService
{
  declare readonly _serviceBrand: undefined;

  constructor(
    @IConfigService config: IConfigService,
    @IModelCatalog modelCatalog: IModelCatalog,
    @ILogService log: ILogService,
    @IKosongConfigService kosongConfig: IKosongConfigService,
  ) {
    super();
    const validate = (): void => {
      void kosongConfig.ready.then(
        () => reportSubagentModelsDiagnostic(config, modelCatalog, log),
        (error) =>
          log.warn('subagent models diagnostics skipped: config bridge failed', {
            error: describeUnknownError(error),
          }),
      );
    };
    validate();
    this._register(
      config.onDidSectionChange((e) => {
        if (
          e.domain !== SECONDARY_MODEL_SECTION &&
          e.domain !== MODELS_SECTION &&
          e.domain !== PROVIDERS_SECTION
        ) {
          return;
        }
        validate();
      }),
    );
  }
}

registerScopedService(
  LifecycleScope.App,
  ISubagentModelsDiagnosticsService,
  SubagentModelsDiagnosticsService,
  ScopeActivation.OnScopeCreated,
  'subagent',
);
