import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { SyncDescriptor } from '#/_base/di/descriptors';
import { DisposableStore } from '#/_base/di/lifecycle';
import { TestInstantiationService } from '#/_base/di/test';
import { ILogService } from '#/_base/log/log';
import { IConfigService } from '#/app/config/config';
import { IKosongConfigService } from '#/app/kosongConfig/kosongConfig';
import { IModelCatalog, type Model } from '#/llm-adapter/model/catalog';
import {
  SECONDARY_MODEL_SECTION,
  SUBAGENT_SECTION,
} from '#/session/subagent/configSection';
import {
  ISessionSubagentModelsValidationService,
  ISubagentModelsDiagnosticsService,
} from '#/session/subagent/subagentModelsValidation';
import {
  SessionSubagentModelsValidationService,
  SubagentModelsDiagnosticsService,
} from '#/session/subagent/subagentModelsValidationService';

import { StubConfigService } from '../../stubs';
import { stubLog } from '../../_base/log/stubs';

async function flushMicrotasks(): Promise<void> {
  await new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

describe('SessionSubagentModelsValidationService', () => {
  let disposables: DisposableStore;
  let ix: TestInstantiationService;
  let modelIds: Set<string>;
  let config: StubConfigService;

  beforeEach(() => {
    disposables = new DisposableStore();
    ix = disposables.add(new TestInstantiationService());
    modelIds = new Set();
  });
  afterEach(() => {
    disposables.dispose();
  });

  function setup(configValues: Record<string, unknown>): void {
    config = new StubConfigService(configValues);
    ix.stub(IConfigService, config);
    ix.stub(ILogService, stubLog());
    ix.stub(IKosongConfigService, { _serviceBrand: undefined, ready: Promise.resolve() });
    ix.stub(IModelCatalog, {
      _serviceBrand: undefined,
      get: (id: string) => {
        if (!modelIds.has(id)) {
          throw new Error(`Model "${id}" is not configured in config.toml.`);
        }
        return { id } as Model;
      },
    } as unknown as IModelCatalog);
    ix.set(
      ISessionSubagentModelsValidationService,
      new SyncDescriptor(SessionSubagentModelsValidationService),
    );
  }

  function reportedMessage(): string | undefined {
    return config.diagnostics().find((d) => d.domain === SECONDARY_MODEL_SECTION)?.message;
  }

  async function resolve(): Promise<void> {
    ix.createInstance(SessionSubagentModelsValidationService);
    await flushMicrotasks();
  }

  it('is a no-op when no secondary_model section is configured', async () => {
    setup({});
    await resolve();
    expect(reportedMessage()).toBeUndefined();
  });

  it('is a no-op when only the [subagent] timeout is configured', async () => {
    setup({ [SUBAGENT_SECTION]: { timeoutMs: 5000 } });
    await resolve();
    expect(reportedMessage()).toBeUndefined();
  });

  it('constructs fine when default_model alone forms an implicit single-entry pool', async () => {
    modelIds.add('provider/fast');
    setup({ [SECONDARY_MODEL_SECTION]: { defaultModel: 'provider/fast' } });
    await resolve();
    expect(reportedMessage()).toBeUndefined();
  });

  it('constructs fine when the legacy model key alone forms the fallback pool', async () => {
    modelIds.add('provider/fast');
    setup({ [SECONDARY_MODEL_SECTION]: { model: 'provider/fast' } });
    await resolve();
    expect(reportedMessage()).toBeUndefined();
  });

  it('degrades to a diagnostic when the legacy model fallback does not resolve', async () => {
    setup({ [SECONDARY_MODEL_SECTION]: { model: 'provider/typo' } });
    await resolve();
    expect(reportedMessage()).toContain(
      '[secondary_model.models] entry "provider/typo" could not be resolved',
    );
  });

  it('constructs fine when force pins the legacy model fallback', async () => {
    modelIds.add('provider/fast');
    setup({ [SECONDARY_MODEL_SECTION]: { model: 'provider/fast', force: true } });
    await resolve();
    expect(reportedMessage()).toBeUndefined();
  });

  it('degrades to a diagnostic when a pool table relies on the legacy model key for its default', async () => {
    modelIds.add('provider/fast');
    setup({
      [SECONDARY_MODEL_SECTION]: {
        model: 'provider/fast',
        models: { 'provider/fast': 'fast and cheap' },
      },
    });
    await resolve();
    expect(reportedMessage()).toContain(
      '[secondary_model].default_model is required when [secondary_model.models] is configured',
    );
  });

  it('degrades to a diagnostic when a pool-less default_model does not resolve', async () => {
    setup({ [SECONDARY_MODEL_SECTION]: { defaultModel: 'provider/typo' } });
    await resolve();
    expect(reportedMessage()).toContain(
      '[secondary_model.models] entry "provider/typo" could not be resolved',
    );
  });

  it('constructs fine for a valid pool', async () => {
    modelIds.add('provider/fast').add('provider/smart');
    setup({
      [SECONDARY_MODEL_SECTION]: {
        defaultModel: 'provider/fast',
        models: { 'provider/fast': 'fast and cheap', 'provider/smart': 'hard tasks' },
      },
    });
    await resolve();
    expect(reportedMessage()).toBeUndefined();
  });

  it('degrades to a diagnostic when the pool has no default_model', async () => {
    modelIds.add('provider/fast');
    setup({ [SECONDARY_MODEL_SECTION]: { models: { 'provider/fast': 'fast and cheap' } } });
    await resolve();
    expect(reportedMessage()).toContain(
      '[secondary_model].default_model is required when [secondary_model.models] is configured',
    );
  });

  it('degrades to a diagnostic when default_model is not a pool key, listing the pool', async () => {
    modelIds.add('provider/fast').add('provider/smart');
    setup({
      [SECONDARY_MODEL_SECTION]: {
        defaultModel: 'provider/typo',
        models: { 'provider/fast': 'fast and cheap', 'provider/smart': 'hard tasks' },
      },
    });
    await resolve();
    expect(reportedMessage()).toContain('"provider/typo"');
    expect(reportedMessage()).toContain('Available models: provider/fast, provider/smart.');
  });

  it('degrades to a diagnostic when a pool key uses the reserved "primary" alias', async () => {
    modelIds.add('primary').add('provider/fast');
    setup({
      [SECONDARY_MODEL_SECTION]: {
        defaultModel: 'provider/fast',
        models: { primary: 'looks like a model', 'provider/fast': 'fast and cheap' },
      },
    });
    await resolve();
    expect(reportedMessage()).toContain('[secondary_model.models] key "primary" is reserved');
  });

  it('degrades to a diagnostic when a pool key does not resolve, naming the key', async () => {
    modelIds.add('provider/fast');
    setup({
      [SECONDARY_MODEL_SECTION]: {
        defaultModel: 'provider/fast',
        models: { 'provider/fast': 'fast and cheap', 'provider/typo': 'hard tasks' },
      },
    });
    await resolve();
    expect(reportedMessage()).toContain(
      '[secondary_model.models] entry "provider/typo" could not be resolved',
    );
    expect(reportedMessage()).toContain('"provider/typo" is not configured');
  });

  it('constructs fine when force pins a resolvable default_model', async () => {
    modelIds.add('provider/fast');
    setup({ [SECONDARY_MODEL_SECTION]: { defaultModel: 'provider/fast', force: true } });
    await resolve();
    expect(reportedMessage()).toBeUndefined();
  });

  it('degrades to a diagnostic when force is set without default_model', async () => {
    setup({ [SECONDARY_MODEL_SECTION]: { force: true } });
    await resolve();
    expect(reportedMessage()).toContain(
      '[secondary_model].default_model is required when [secondary_model].force is set',
    );
  });

  it('degrades to a diagnostic when force is combined with a models table', async () => {
    modelIds.add('provider/fast');
    setup({
      [SECONDARY_MODEL_SECTION]: {
        defaultModel: 'provider/fast',
        models: { 'provider/fast': 'fast and cheap' },
        force: true,
      },
    });
    await resolve();
    expect(reportedMessage()).toContain(
      '[secondary_model].force cannot be combined with [secondary_model.models]',
    );
  });

  it('degrades to a diagnostic when the forced default_model does not resolve', async () => {
    setup({ [SECONDARY_MODEL_SECTION]: { defaultModel: 'provider/typo', force: true } });
    await resolve();
    expect(reportedMessage()).toContain('"provider/typo"');
  });

  it('clears a previously reported diagnostic once the config validates again', async () => {
    setup({ [SECONDARY_MODEL_SECTION]: { defaultModel: 'provider/typo' } });
    await resolve();
    expect(reportedMessage()).toBeDefined();

    modelIds.add('provider/fast');
    config.setSilent(SECONDARY_MODEL_SECTION, { defaultModel: 'provider/fast' });
    await resolve();
    expect(reportedMessage()).toBeUndefined();
  });
});

describe('SubagentModelsDiagnosticsService', () => {
  let disposables: DisposableStore;
  let ix: TestInstantiationService;
  let modelIds: Set<string>;
  let config: StubConfigService;

  beforeEach(() => {
    disposables = new DisposableStore();
    ix = disposables.add(new TestInstantiationService());
    modelIds = new Set();
  });
  afterEach(() => {
    disposables.dispose();
  });

  function setup(configValues: Record<string, unknown>): void {
    config = new StubConfigService(configValues);
    ix.stub(IConfigService, config);
    ix.stub(ILogService, stubLog());
    ix.stub(IKosongConfigService, { _serviceBrand: undefined, ready: Promise.resolve() });
    ix.stub(IModelCatalog, {
      _serviceBrand: undefined,
      get: (id: string) => {
        if (!modelIds.has(id)) {
          throw new Error(`Model "${id}" is not configured in config.toml.`);
        }
        return { id } as Model;
      },
    } as unknown as IModelCatalog);
    ix.set(ISubagentModelsDiagnosticsService, new SyncDescriptor(SubagentModelsDiagnosticsService));
  }

  function reportedMessage(): string | undefined {
    return config.diagnostics().find((d) => d.domain === SECONDARY_MODEL_SECTION)?.message;
  }

  it('reports a diagnostic when a section change leaves the pool broken', async () => {
    modelIds.add('provider/fast');
    setup({});
    ix.get(ISubagentModelsDiagnosticsService);
    await flushMicrotasks();
    expect(reportedMessage()).toBeUndefined();

    await config.set(SECONDARY_MODEL_SECTION, { defaultModel: 'provider/typo' });
    await flushMicrotasks();
    expect(reportedMessage()).toContain('"provider/typo"');
  });

  it('clears the diagnostic when a section change fixes the pool', async () => {
    setup({ [SECONDARY_MODEL_SECTION]: { defaultModel: 'provider/typo' } });
    ix.get(ISubagentModelsDiagnosticsService);
    await flushMicrotasks();
    expect(reportedMessage()).toBeDefined();

    modelIds.add('provider/fast');
    await config.set(SECONDARY_MODEL_SECTION, { defaultModel: 'provider/fast' });
    await flushMicrotasks();
    expect(reportedMessage()).toBeUndefined();
  });

  it('ignores unrelated section changes', async () => {
    modelIds.add('provider/fast');
    setup({ [SECONDARY_MODEL_SECTION]: { defaultModel: 'provider/fast' } });
    ix.get(ISubagentModelsDiagnosticsService);
    await flushMicrotasks();

    await config.set(SUBAGENT_SECTION, { timeoutMs: 5000 });
    await flushMicrotasks();
    expect(reportedMessage()).toBeUndefined();
  });
});
