/**
 * v2 engine client — an `SDKRpcClientBase` subclass that serves the v1
 * `CoreAPI` RPC contract from an in-process agent-core-v2 engine.
 *
 * `SDKRpcClient` wires the RPC pair to v1's `KimiCore`; this client wires the
 * same pair to `V2CoreBridge`, which answers every CoreAPI method by calling
 * native v2 DI services (bootstrap scope → session/agent scope handles). The
 * rest of the SDK (`Session`, `KimiHarness`, `ClientAPI`, auth facade) runs
 * unchanged on top, so hosts (the TUI) switch engines by swapping the client.
 */

import {
  createRPC,
  ensureConfigFile,
  getRootLogger,
  noopTelemetryClient,
  resolveConfigPath,
  resolveKimiHome,
  resolveLoggingConfig,
  type CoreAPI,
  type RPCMethods,
  type SDKAPI,
  type TelemetryClient,
} from '@moonshot-ai/agent-core';
import {
  assertKimiHostIdentity,
  createKimiDefaultHeaders,
} from '@moonshot-ai/kimi-code-oauth';
import {
  bootstrap,
  hostRequestHeadersSeed,
  logSeed,
  skillCatalogRuntimeOptionsSeed,
  type Scope,
} from '@moonshot-ai/agent-core-v2';

import { KimiAuthFacade } from '#/auth';
import { ClientAPI, SDKRpcClientBase } from '#/rpc';
import type { SDKRpcClientOptions } from '#/sdk-rpc-client';
import type {
  CreateSessionOptions,
  ResumedSessionSummary,
  ResumeSessionInput,
  SessionSummary,
} from '#/types';
import type { Kaos } from '@moonshot-ai/kaos';

import { V2CoreBridge } from './bridge';

export class V2SDKRpcClient extends SDKRpcClientBase {
  readonly homeDir: string;
  readonly configPath: string;
  readonly identity: SDKRpcClientOptions['identity'];
  readonly telemetry: TelemetryClient;
  readonly auth: KimiAuthFacade;
  private readonly app: Scope;
  private readonly bridge: V2CoreBridge;

  private readonly ready: Promise<RPCMethods<CoreAPI>>;

  constructor(options: SDKRpcClientOptions = {}) {
    super();
    this.identity =
      options.identity === undefined ? undefined : assertKimiHostIdentity(options.identity);
    this.homeDir = resolveKimiHome(options.homeDir);
    this.configPath = resolveConfigPath({
      homeDir: this.homeDir,
      configPath: options.configPath,
    });
    this.telemetry = options.telemetry ?? noopTelemetryClient;
    this.auth = new KimiAuthFacade({
      homeDir: this.homeDir,
      configPath: this.configPath,
      identity: this.identity,
      onRefresh: options.onOAuthRefresh,
    });

    void getRootLogger().configure(resolveLoggingConfig({ homeDir: this.homeDir }));

    const hostHeaders = this.createKimiRequestHeaders();
    const { app } = bootstrap(
      { homeDir: this.homeDir, clientVersion: this.identity?.version ?? 'unknown' },
      [
        ...logSeed(resolveLoggingConfig({ homeDir: this.homeDir })),
        ...(hostHeaders !== undefined ? hostRequestHeadersSeed(hostHeaders) : []),
        ...skillCatalogRuntimeOptionsSeed(options.skillDirs),
      ],
    );
    this.app = app;

    const [coreRpc, sdkRpc] = createRPC<CoreAPI, SDKAPI>();
    this.bridge = new V2CoreBridge(coreRpc, {
      app,
      homeDir: this.homeDir,
      configPath: this.configPath,
      telemetry: this.telemetry,
      uiMode: options.uiMode,
      version: this.identity?.version,
    });
    this.ready = sdkRpc(new ClientAPI(this));
  }

  override async createSessionWithKaos(
    input: CreateSessionOptions,
    kaos: Kaos,
    persistenceKaos?: Kaos,
  ): Promise<SessionSummary> {
    // v2 has a single persistence channel that always stays on the local
    // registry; `persistenceKaos` is therefore ignored (v1 used it to reroute
    // state.json / wire storage, which v2 keeps on the App-scoped stores).
    void persistenceKaos;
    this.bridge.setSessionKaos(kaos);
    try {
      return await this.createSession(input);
    } finally {
      this.bridge.setSessionKaos(undefined);
    }
  }

  override async resumeSessionWithKaos(
    input: ResumeSessionInput,
    kaos: Kaos,
    persistenceKaos?: Kaos,
  ): Promise<ResumedSessionSummary> {
    // v2 resume does not re-materialize through the kaos channel yet (see
    // plan/v2-parity-gap.md); it falls back to the plain resume path.
    void kaos;
    void persistenceKaos;
    return this.resumeSession(input);
  }

  private createKimiRequestHeaders(): Record<string, string> | undefined {
    if (this.identity === undefined) return undefined;
    return createKimiDefaultHeaders({
      homeDir: this.homeDir,
      ...this.identity,
    });
  }

  async ensureConfigFile(): Promise<void> {
    await ensureConfigFile(this.configPath);
  }

  protected getRpc(): Promise<RPCMethods<CoreAPI>> {
    return this.ready;
  }

  async close(): Promise<void> {
    try {
      await getRootLogger().flush();
    } catch {
      // never let logger flush block process exit
    }
    this.app.dispose();
  }
}
