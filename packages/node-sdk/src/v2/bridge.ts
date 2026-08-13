/**
 * v2 core bridge — serves the v1 `CoreAPI` RPC contract from an in-process
 * agent-core-v2 engine.
 *
 * The class mirrors `KimiCore`'s role in the v1 wiring: it registers itself
 * on the left side of `createRPC<CoreAPI, SDKAPI>()`, so every SDK `Session`
 * / `KimiHarness` method lands here unchanged. Each method resolves the
 * session / agent scope handle and delegates to the native v2 DI services;
 * return values are mapped back to the v1 wire shapes. Events flow the other
 * way: per-agent `IEventBus` subscriptions are tagged with sessionId/agentId
 * and forwarded through the SDKAPI `emitEvent` callback, and session-level
 * approval / question interactions are bridged to the SDKAPI
 * `requestApproval` / `requestQuestion` reverse-RPC handlers.
 *
 * Methods with no v2 engine capability throw `ErrorCodes.NOT_IMPLEMENTED`
 * instead of silently misbehaving; each such case carries a note. Known
 * engine-level gaps (tracked in plan/v2-parity-gap.md): global MCP server
 * CRUD/auth/test RPC family, importContext, deleteSession, forkSession
 * turnIndex truncation, MCP startup metrics.
 */

import {
  ErrorCodes,
  KimiError,
  loadRuntimeConfigSafe,
  mergeConfigPatch,
  readConfigFileForUpdate,
  writeConfigFile,
  type AddAdditionalDirPayload,
  type AddAdditionalDirResult,
  type AgentContextData,
  type ApprovalRequest,
  type ApprovalResponse,
  type ArchiveSessionPayload,
  type BeginCompactionPayload,
  type CancelPayload,
  type CancelPlanPayload,
  type CancelShellCommandPayload,
  type CoreAPI,
  type CoreRPCClient,
  type CreateGoalPayload,
  type CreateSessionPayload,
  type DeleteSessionPayload,
  type EmptyPayload,
  type Event,
  type ExportSessionPayload,
  type ExportSessionResult,
  type ForkSessionPayload,
  type GetBackgroundOutputPayload,
  type GetBackgroundPayload,
  type GetCronTasksResult,
  type GetGoalTemplatePayload,
  type GetKimiConfigPayload,
  type GetPluginInfoPayload,
  type GoalSnapshot,
  type GoalToolResult,
  type ImportContextPayload,
  type InstallPluginPayload,
  type KimiConfig,
  type ListSessionsPayload,
  type ListWorkspaceSkillsPayload,
  type LoadMcpGroupPayload,
  type McpStartupMetrics,
  type PluginSummary,
  type PromptPayload,
  type QuestionRequest,
  type QuestionResult,
  type ReconnectMcpServerPayload,
  type RegisterToolPayload,
  type ReloadPluginsResult,
  type ReloadSessionPayload,
  type RemovePluginPayload,
  type RenameSessionPayload,
  type ResumeSessionPayload,
  type ResumeSessionResult,
  type RPCMethods,
  type RunShellCommandPayload,
  type SDKAPI,
  type SessionMeta,
  type SessionSummary,
  type SetMcpGroupModePayload,
  type SetModelPayload,
  type SetModelResult,
  type SetNotepadPayload,
  type SetPermissionPayload,
  type SetPluginEnabledPayload,
  type SetPluginMcpServerEnabledPayload,
  type SetThinkingPayload,
  type SkillSummary,
  type SteerPayload,
  type TelemetryClient,
  type UndoHistoryPayload,
  type UnregisterToolPayload,
  type UpdateSessionMetadataPayload,
  type SetActiveToolsPayload,
  type CronTaskSnapshot,
  type BackgroundTaskInfo,
  type ShellCommandResult,
  type ToolInfo,
  type PluginCommandDef,
  type McpServerInfo,
  type GoalTemplateDetail,
  type GoalTemplateSummary,
  type UsageStatus,
  type ConfigDiagnostics,
  type ExperimentalFeatureState,
  type CoreInfo,
  type AgentReplayRecord,
  type ResumedAgentState,
  type EnterSwarmPayload,
  type PluginInfo as V1PluginInfo,
} from '@moonshot-ai/agent-core';
import {
  ensureMainAgent,
  IAgentFullCompactionService,
  IAgentGoalService,
  IAgentLifecycleService,
  IAgentLoopService,
  IAgentPermissionModeService,
  IAgentPermissionRulesService,
  IAgentPlanService,
  IAgentProfileService,
  IAgentPromptService,
  IAgentShellCommandService,
  IAgentSkillService,
  IAgentSwarmService,
  IAgentTaskService,
  IAgentToolRegistryService,
  IAgentUsageService,
  IAgentUserToolService,
  IBootstrapService,
  IConfigService,
  IEventBus,
  IEventService,
  expandCommandArguments,
  applyPromptMetadataUpdate,
  promptMetadataTextFromPluginCommand,
  promptMetadataTextFromSkill,
  IFlagService,
  IPluginService,
  ISessionBtwService,
  ISessionContext,
  ISessionCronService,
  ISessionGoalTemplateService,
  ISessionIndex,
  ISessionInitService,
  ISessionInteractionService,
  ISessionLifecycleService,
  ISessionMcpService,
  ISessionMetadata,
  ISessionNotepadService,
  ISessionSkillCatalog,
  ISessionWorkspaceCommandService,
  ISessionExportService,
  IAgentContextMemoryService,
  IWorkspaceRegistry,
  type IAgentScopeHandle,
  type ISessionScopeHandle,
  type Interaction,
  type Scope,
} from '@moonshot-ai/agent-core-v2';
import {
  encodeWorkDirKey,
  workspaceRootKey,
} from '@moonshot-ai/agent-core-v2/_base/utils/workdir-slug';

import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';

type SessionScopedPayload<P> = P & { readonly sessionId: string };
type SessionAgentPayload<P> = SessionScopedPayload<P & { readonly agentId: string }>;

type AgentConfigData = ReturnType<CoreAPI['getConfig']>;
type PermissionData = ReturnType<CoreAPI['getPermission']>;
type PlanData = Awaited<ReturnType<CoreAPI['getPlan']>>;
type SessionWarning = Awaited<ReturnType<CoreAPI['getSessionWarnings']>>[number];


export interface V2CoreBridgeOptions {
  readonly app: unknown;
  readonly homeDir: string;
  readonly configPath: string;
  readonly telemetry: TelemetryClient;
  readonly uiMode?: string;
  readonly version?: string;
}

function notImplemented(feature: string): never {
  throw new KimiError(
    ErrorCodes.NOT_IMPLEMENTED,
    `${feature} is not yet supported on the v2 engine`,
  );
}

export class V2CoreBridge {
  private readonly sdk: Promise<RPCMethods<SDKAPI>>;
  private readonly sessionsWired = new Set<string>();
  private readonly pendingInteractions = new Set<string>();

  constructor(
    coreRpc: CoreRPCClient,
    private readonly options: V2CoreBridgeOptions,
  ) {
    this.sdk = coreRpc(this);
    const lifecycle = this.app.get(ISessionLifecycleService);
    for (const session of lifecycle.list()) {
      this.wireSession(session);
    }
    lifecycle.onDidCreateSession((event) => {
      const handle = lifecycle.get(event.sessionId);
      if (handle !== undefined) this.wireSession(handle);
    });
  }

  private get app(): Scope['accessor'] {
    return (this.options.app as Scope).accessor;
  }

  // -------------------------------------------------------------------------
  // Scope resolution + event / interaction wiring
  // -------------------------------------------------------------------------

  private session(sessionId: string): ISessionScopeHandle {
    const handle = this.app.get(ISessionLifecycleService).get(sessionId);
    if (handle === undefined) {
      throw new KimiError(ErrorCodes.SESSION_NOT_FOUND, `Session "${sessionId}" was not found`);
    }
    return handle;
  }

  private agent(sessionId: string, agentId: string): IAgentScopeHandle {
    const handle = this.session(sessionId).accessor.get(IAgentLifecycleService).get(agentId);
    if (handle === undefined) {
      throw new KimiError(ErrorCodes.AGENT_NOT_FOUND, `Agent "${agentId}" was not found`);
    }
    return handle;
  }

  private mainAgent(sessionId: string): Promise<IAgentScopeHandle> {
    return ensureMainAgent(this.session(sessionId));
  }

  private wireSession(session: ISessionScopeHandle): void {
    if (this.sessionsWired.has(session.id)) return;
    this.sessionsWired.add(session.id);

    const agents = session.accessor.get(IAgentLifecycleService);
    for (const agent of agents.list()) {
      this.wireAgentEvents(session.id, agent);
    }
    agents.onDidCreate((agent) => {
      this.wireAgentEvents(session.id, agent);
    });

    const interaction = session.accessor.get(ISessionInteractionService);
    interaction.onDidChangePending(() => {
      this.pumpInteractions(session, interaction.listPending());
    });
  }

  private wireAgentEvents(sessionId: string, agent: IAgentScopeHandle): void {
    agent.accessor.get(IEventBus).subscribe((event) => {
      void this.emit({ ...event, sessionId, agentId: agent.id } as unknown as Event);
    });
  }

  private async emit(event: Event): Promise<void> {
    await (await this.sdk).emitEvent(event);
  }

  private pumpInteractions(session: ISessionScopeHandle, pending: readonly Interaction[]): void {
    for (const item of pending) {
      if (this.pendingInteractions.has(item.id)) continue;
      this.pendingInteractions.add(item.id);
      void this.handleInteraction(session, item).finally(() => {
        this.pendingInteractions.delete(item.id);
      });
    }
  }

  private async handleInteraction(session: ISessionScopeHandle, item: Interaction): Promise<void> {
    const sdk = await this.sdk;
    const interaction = session.accessor.get(ISessionInteractionService);
    if (item.kind === 'approval') {
      const payload = item.payload as ApprovalRequest;
      const response: ApprovalResponse = await sdk.requestApproval({
        ...payload,
        id: item.id,
        sessionId: session.id,
        agentId: item.origin.agentId ?? 'main',
      } as ApprovalRequest & { sessionId: string; agentId: string });
      interaction.respond(item.id, response);
      return;
    }
    if (item.kind === 'question') {
      const payload = item.payload as QuestionRequest;
      const response: QuestionResult = await sdk.requestQuestion({
        ...payload,
        sessionId: session.id,
        agentId: item.origin.agentId ?? 'main',
      } as QuestionRequest & { sessionId: string; agentId: string });
      interaction.respond(item.id, response);
    }
  }

  // -------------------------------------------------------------------------
  // Shape mapping
  // -------------------------------------------------------------------------

  private async toSessionSummary(session: ISessionScopeHandle): Promise<SessionSummary> {
    const ctx = session.accessor.get(ISessionContext);
    const meta = await session.accessor.get(ISessionMetadata).read();
    return {
      id: session.id,
      title: meta.title,
      lastPrompt: meta.lastPrompt,
      workDir: ctx.cwd,
      sessionDir: ctx.sessionDir,
      createdAt: meta.createdAt,
      updatedAt: meta.updatedAt,
      archived: meta.archived,
      metadata: meta.custom as SessionSummary['metadata'],
    };
  }

  private toSessionMeta(meta: {
    readonly id: string;
    readonly title?: string;
    readonly isCustomTitle?: boolean;
    readonly lastPrompt?: string;
    readonly createdAt: number;
    readonly updatedAt: number;
    readonly archived: boolean;
    readonly cwd?: string;
    readonly forkedFrom?: string;
    readonly custom?: Record<string, unknown>;
  }): SessionMeta {
    return {
      id: meta.id,
      title: meta.title,
      isCustomTitle: meta.isCustomTitle,
      lastPrompt: meta.lastPrompt,
      createdAt: meta.createdAt,
      updatedAt: meta.updatedAt,
      archived: meta.archived,
      cwd: meta.cwd,
      forkedFrom: meta.forkedFrom,
      custom: meta.custom,
    } as unknown as SessionMeta;
  }

  private async buildResumeResult(session: ISessionScopeHandle): Promise<ResumeSessionResult> {
    const [summary, meta] = await Promise.all([
      this.toSessionSummary(session),
      session.accessor.get(ISessionMetadata).read(),
    ]);
    const agents: Record<string, ResumedAgentState> = {};
    for (const agent of session.accessor.get(IAgentLifecycleService).list()) {
      agents[agent.id] = await this.buildAgentState(session.id, agent);
    }
    return {
      ...summary,
      sessionMetadata: this.toSessionMeta(meta),
      agents,
    };
  }

  private async buildAgentState(
    sessionId: string,
    agent: IAgentScopeHandle,
  ): Promise<ResumedAgentState> {
    const profile = agent.accessor.get(IAgentProfileService);
    const plan = agent.accessor.get(IAgentPlanService);
    const usage = agent.accessor.get(IAgentUsageService);
    const tasks = agent.accessor.get(IAgentTaskService);
    const tools = agent.accessor.get(IAgentToolRegistryService);
    const goal = agent.accessor.get(IAgentGoalService);
    const permission = agent.accessor.get(IAgentPermissionModeService);
    const rules = agent.accessor.get(IAgentPermissionRulesService);
    const context = agent.accessor.get(IAgentContextMemoryService);

    const config = profile.data();
    const replay: AgentReplayRecord[] = context.get().map((message) => ({
      type: 'message',
      message: message as never,
      time: 0,
    }));
    const goalState = goal.getGoal();
    if (goalState.goal !== null) {
      replay.push({
        type: 'goal_updated',
        snapshot: goalState.goal,
        change: { kind: 'created' },
        time: 0,
      } as AgentReplayRecord);
    }

    return {
      type: agent.id === 'main' ? 'main' : 'sub',
      config: {
        cwd: config.cwd,
        modelAlias: config.modelAlias,
        modelCapabilities: config.modelCapabilities,
        profileName: config.profileName,
        thinkingEffort: config.thinkingLevel,
        systemPrompt: config.systemPrompt,
      } as AgentConfigData,
      context: {
        history: context.get() as never,
        tokenCount: 0,
      } as AgentContextData,
      replay,
      permission: {
        mode: permission.mode,
        rules: [...rules.rules],
      } as PermissionData,
      plan: (await plan.status()) as PlanData,
      swarmMode: agent.accessor.get(IAgentSwarmService).isActive,
      usage: usage.status() as UsageStatus,
      tools: tools.list() as unknown as ToolInfo[],
      background: tasks.list(false) as unknown as BackgroundTaskInfo[],
    };
  }

  // -------------------------------------------------------------------------
  // Core: session lifecycle
  // -------------------------------------------------------------------------

  async createSession(payload: CreateSessionPayload): Promise<SessionSummary> {
    const session = await this.app.get(ISessionLifecycleService).create({
      sessionId: payload.id,
      workDir: payload.workDir,
      additionalDirs: payload.additionalDirs,
      mcpServers: payload.mcpServers,
    });
    this.wireSession(session);
    const agent = await ensureMainAgent(session);
    const profile = agent.accessor.get(IAgentProfileService);
    const modelAlias =
      payload.model ?? this.app.get(IConfigService).get<string>('defaultModel') ?? undefined;
    if (modelAlias !== undefined) {
      await profile.setModel(modelAlias);
    }
    if (payload.thinking !== undefined) {
      profile.setThinking(payload.thinking);
    }
    if (payload.permission !== undefined) {
      agent.accessor.get(IAgentPermissionModeService).setMode(payload.permission);
    }
    return this.toSessionSummary(session);
  }

  async closeSession(payload: SessionScopedPayload<EmptyPayload>): Promise<void> {
    await this.app.get(ISessionLifecycleService).close(payload.sessionId);
  }

  async archiveSession(payload: ArchiveSessionPayload): Promise<void> {
    await this.app.get(ISessionLifecycleService).archive(payload.sessionId);
  }

  async deleteSession(_payload: DeleteSessionPayload): Promise<void> {
    // v2 has no session-delete capability (plan/v2-parity-gap.md P0-4).
    notImplemented('deleteSession');
  }

  async resumeSession(payload: ResumeSessionPayload): Promise<ResumeSessionResult> {
    const session = await this.app.get(ISessionLifecycleService).resume(payload.sessionId);
    if (session === undefined) {
      throw new KimiError(
        ErrorCodes.SESSION_NOT_FOUND,
        `Session "${payload.sessionId}" was not found`,
      );
    }
    this.wireSession(session);
    await ensureMainAgent(session);
    return this.buildResumeResult(session);
  }

  async reloadSession(payload: ReloadSessionPayload): Promise<ResumeSessionResult> {
    const lifecycle = this.app.get(ISessionLifecycleService);
    await lifecycle.close(payload.sessionId);
    const session = await lifecycle.resume(payload.sessionId);
    if (session === undefined) {
      throw new KimiError(
        ErrorCodes.SESSION_NOT_FOUND,
        `Session "${payload.sessionId}" was not found`,
      );
    }
    this.sessionsWired.delete(payload.sessionId);
    this.wireSession(session);
    await ensureMainAgent(session);
    return this.buildResumeResult(session);
  }

  async forkSession(payload: ForkSessionPayload): Promise<ResumeSessionResult> {
    // v2 fork copies the full wire; v1's turnIndex truncation has no v2
    // counterpart yet (plan/v2-parity-gap.md P0-3).
    const session = await this.app.get(ISessionLifecycleService).fork({
      sourceSessionId: payload.sessionId,
      newSessionId: payload.id,
      title: payload.title,
    });
    this.wireSession(session);
    await ensureMainAgent(session);
    return this.buildResumeResult(session);
  }

  async listSessions(payload: ListSessionsPayload): Promise<readonly SessionSummary[]> {
    const registry = this.app.get(IWorkspaceRegistry);
    // v1 semantics: `workDir` scopes the listing to one physical directory.
    // A registered root expands to every id spelling of that directory (legacy
    // split buckets); an unregistered one falls back to the minted bucket id.
    let workspaceIds: readonly string[] | undefined;
    if (payload.workDir !== undefined) {
      if (payload.workDir.trim() === '') {
        throw new KimiError(ErrorCodes.REQUEST_WORK_DIR_REQUIRED, 'listSessions requires workDir');
      }
      const workDir = resolve(payload.workDir);
      const key = workspaceRootKey(workDir);
      const match = (await registry.list()).find((w) => workspaceRootKey(w.root) === key);
      workspaceIds =
        match === undefined ? [encodeWorkDirKey(workDir)] : await registry.resolveAliasIds(match.id);
    }
    const page = await this.app.get(ISessionIndex).list({
      workspaceIds,
      sessionId: payload.sessionId,
      includeArchived: payload.includeArchive,
    });
    // Map v2 index entries (`cwd`/`custom`) onto the v1 SDK shape
    // (`workDir`/`metadata`). `cwd` comes from the session's own summary, with
    // the registry root as back-compat fallback; entries with no recoverable
    // workDir are skipped, same as the kap-server /sessions route.
    const roots = new Map((await registry.list()).map((w) => [w.id, w.root] as const));
    const bootstrap = this.app.get(IBootstrapService);
    const summaries: SessionSummary[] = [];
    for (const item of page.items) {
      const workDir = item.cwd ?? roots.get(item.workspaceId);
      if (workDir === undefined) continue;
      summaries.push({
        id: item.id,
        title: item.title,
        lastPrompt: item.lastPrompt,
        workDir,
        sessionDir: bootstrap.sessionDir(item.workspaceId, item.id),
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
        archived: item.archived,
        metadata: item.custom as SessionSummary['metadata'],
      });
    }
    return summaries;
  }

  async exportSession(payload: ExportSessionPayload): Promise<ExportSessionResult> {
    return this.app.get(ISessionExportService).export(payload) as Promise<ExportSessionResult>;
  }

  // -------------------------------------------------------------------------
  // Session-scoped methods
  // -------------------------------------------------------------------------

  async renameSession(payload: SessionScopedPayload<RenameSessionPayload>): Promise<void> {
    await this.session(payload.sessionId).accessor.get(ISessionMetadata).setTitle(payload.title);
  }

  async updateSessionMetadata(
    payload: SessionScopedPayload<UpdateSessionMetadataPayload>,
  ): Promise<void> {
    await this.session(payload.sessionId).accessor.get(ISessionMetadata).update({
      custom: payload.metadata as Record<string, unknown>,
    });
  }

  async getSessionMetadata(payload: SessionScopedPayload<EmptyPayload>): Promise<SessionMeta> {
    const meta = await this.session(payload.sessionId).accessor.get(ISessionMetadata).read();
    return this.toSessionMeta(meta);
  }

  async listSkills(payload: SessionScopedPayload<EmptyPayload>): Promise<readonly SkillSummary[]> {
    const catalog = this.session(payload.sessionId).accessor.get(ISessionSkillCatalog);
    await catalog.ready;
    return catalog.catalog.listSkills().map(
      (skill) =>
        ({
          name: skill.name,
          description: skill.description,
        }) as unknown as SkillSummary,
    );
  }

  async listGoalTemplates(
    payload: SessionScopedPayload<EmptyPayload>,
  ): Promise<readonly GoalTemplateSummary[]> {
    return this.session(payload.sessionId).accessor.get(ISessionGoalTemplateService).listTemplates();
  }

  async getGoalTemplate(
    payload: SessionScopedPayload<GetGoalTemplatePayload>,
  ): Promise<GoalTemplateDetail> {
    return this.session(payload.sessionId)
      .accessor.get(ISessionGoalTemplateService)
      .getTemplate(payload.name);
  }

  async listPluginCommands(
    _payload: SessionScopedPayload<EmptyPayload>,
  ): Promise<readonly PluginCommandDef[]> {
    return this.app.get(IPluginService).listPluginCommands() as Promise<readonly PluginCommandDef[]>;
  }

  async listMcpServers(
    payload: SessionScopedPayload<EmptyPayload>,
  ): Promise<readonly McpServerInfo[]> {
    const mcp = this.session(payload.sessionId).accessor.get(ISessionMcpService);
    await mcp.ensureMcpReady();
    return mcp.connectionManager().list() as unknown as readonly McpServerInfo[];
  }

  async getMcpStartupMetrics(
    _payload: SessionScopedPayload<EmptyPayload>,
  ): Promise<McpStartupMetrics> {
    // v2 does not track MCP startup timings (plan/v2-parity-gap.md P0-1).
    return { durationMs: 0 };
  }

  async reconnectMcpServer(payload: SessionScopedPayload<ReconnectMcpServerPayload>): Promise<void> {
    await this.session(payload.sessionId).accessor.get(ISessionMcpService).loadServer(payload.name);
  }

  async loadMcpGroup(payload: SessionScopedPayload<LoadMcpGroupPayload>): Promise<void> {
    await this.session(payload.sessionId).accessor.get(ISessionMcpService).loadGroup(payload.name);
  }

  // Fork extension surface (`McpGroupRpcSurface` in node-sdk): not part of
  // upstream v1 CoreAPI, served here for the MCP-group workflow.
  async listMcpGroups(
    payload: SessionScopedPayload<EmptyPayload>,
  ): Promise<readonly import('#/types').McpGroupInfo[]> {
    return this.session(payload.sessionId).accessor.get(ISessionMcpService).listGroups();
  }

  setMcpGroupMode(payload: SessionScopedPayload<SetMcpGroupModePayload>): void {
    this.session(payload.sessionId).accessor.get(ISessionMcpService).setGroupMode(payload.groupName);
  }

  async generateAgentsMd(payload: SessionScopedPayload<EmptyPayload>): Promise<void> {
    await this.session(payload.sessionId).accessor.get(ISessionInitService).generateAgentsMd();
  }

  async getSessionWarnings(
    payload: SessionScopedPayload<EmptyPayload>,
  ): Promise<readonly SessionWarning[]> {
    const agent = await this.mainAgent(payload.sessionId);
    const warning = agent.accessor.get(IAgentProfileService).getAgentsMdWarning();
    if (warning === undefined) return [];
    return [{ code: 'agents-md-oversized', message: warning, severity: 'warning' }];
  }

  async waitForBackgroundTasksOnPrint(
    _payload: SessionScopedPayload<EmptyPayload>,
  ): Promise<void> {
    // Print-mode drain is handled natively by the v2 print runner; interactive
    // hosts never call this.
  }

  async handlePrintMainTurnCompleted(
    _payload: SessionScopedPayload<EmptyPayload>,
  ): Promise<'finish' | 'continue'> {
    return 'finish';
  }

  async addAdditionalDir(
    payload: SessionScopedPayload<AddAdditionalDirPayload>,
  ): Promise<AddAdditionalDirResult> {
    return this.session(payload.sessionId)
      .accessor.get(ISessionWorkspaceCommandService)
      .addAdditionalDir(payload) as Promise<AddAdditionalDirResult>;
  }

  // -------------------------------------------------------------------------
  // Agent-scoped methods
  // -------------------------------------------------------------------------

  async prompt(payload: SessionAgentPayload<PromptPayload>): Promise<void> {
    const agent = this.agent(payload.sessionId, payload.agentId);
    await agent.accessor.get(IAgentPromptService).enqueue({
      message: {
        role: 'user',
        content: payload.input,
        toolCalls: [],
        origin: { kind: 'user' },
      } as never,
    });
  }

  async steer(payload: SessionAgentPayload<SteerPayload>): Promise<void> {
    const agent = this.agent(payload.sessionId, payload.agentId);
    await agent.accessor.get(IAgentPromptService).inject({
      role: 'user',
      content: payload.input,
      toolCalls: [],
      origin: { kind: 'steer' },
    } as never);
  }

  cancel(payload: SessionAgentPayload<CancelPayload>): void {
    const agent = this.agent(payload.sessionId, payload.agentId);
    agent.accessor.get(IAgentLoopService).cancel(payload.turnId);
  }

  undoHistory(payload: SessionAgentPayload<UndoHistoryPayload>): void {
    const agent = this.agent(payload.sessionId, payload.agentId);
    agent.accessor.get(IAgentPromptService).undo(payload.count);
  }

  setThinking(payload: SessionAgentPayload<SetThinkingPayload>): void {
    this.agent(payload.sessionId, payload.agentId)
      .accessor.get(IAgentProfileService)
      .setThinking(payload.effort);
  }

  setPermission(payload: SessionAgentPayload<SetPermissionPayload>): void {
    this.agent(payload.sessionId, payload.agentId)
      .accessor.get(IAgentPermissionModeService)
      .setMode(payload.mode);
  }

  async setModel(payload: SessionAgentPayload<SetModelPayload>): Promise<SetModelResult> {
    const result = await this.agent(payload.sessionId, payload.agentId)
      .accessor.get(IAgentProfileService)
      .setModel(payload.model);
    return { model: result.model, providerName: result.providerName };
  }

  getModel(payload: SessionAgentPayload<EmptyPayload>): string {
    return this.agent(payload.sessionId, payload.agentId).accessor.get(IAgentProfileService).getModel();
  }

  async enterPlan(payload: SessionAgentPayload<EmptyPayload>): Promise<void> {
    await this.agent(payload.sessionId, payload.agentId).accessor.get(IAgentPlanService).enter();
  }

  cancelPlan(payload: SessionAgentPayload<CancelPlanPayload>): void {
    this.agent(payload.sessionId, payload.agentId).accessor.get(IAgentPlanService).cancel(payload.id);
  }

  async clearPlan(payload: SessionAgentPayload<EmptyPayload>): Promise<void> {
    await this.agent(payload.sessionId, payload.agentId).accessor.get(IAgentPlanService).clear();
  }

  enterSwarm(payload: SessionAgentPayload<EnterSwarmPayload>): void {
    this.agent(payload.sessionId, payload.agentId)
      .accessor.get(IAgentSwarmService)
      .enter(payload.trigger, payload.variant);
  }

  exitSwarm(payload: SessionAgentPayload<EmptyPayload>): void {
    this.agent(payload.sessionId, payload.agentId).accessor.get(IAgentSwarmService).exit();
  }

  getSwarmMode(payload: SessionAgentPayload<EmptyPayload>): boolean {
    return this.agent(payload.sessionId, payload.agentId).accessor.get(IAgentSwarmService).isActive;
  }

  beginCompaction(payload: SessionAgentPayload<BeginCompactionPayload>): void {
    this.agent(payload.sessionId, payload.agentId)
      .accessor.get(IAgentFullCompactionService)
      .begin({ source: 'manual', instruction: payload.instruction } as never);
  }

  cancelCompaction(payload: SessionAgentPayload<EmptyPayload>): void {
    void payload;
    this.agent(payload.sessionId, payload.agentId)
      .accessor.get(IAgentFullCompactionService)
      .compacting?.abortController.abort();
  }

  registerTool(payload: SessionAgentPayload<RegisterToolPayload>): void {
    this.agent(payload.sessionId, payload.agentId)
      .accessor.get(IAgentUserToolService)
      .register(payload as never);
  }

  unregisterTool(payload: SessionAgentPayload<UnregisterToolPayload>): void {
    this.agent(payload.sessionId, payload.agentId)
      .accessor.get(IAgentUserToolService)
      .unregister(payload.name);
  }

  setActiveTools(payload: SessionAgentPayload<SetActiveToolsPayload>): void {
    this.agent(payload.sessionId, payload.agentId)
      .accessor.get(IAgentProfileService)
      .update({ activeToolNames: payload.names });
  }

  async stopBackground(payload: SessionAgentPayload<EmptyPayload>): Promise<void> {
    await this.agent(payload.sessionId, payload.agentId).accessor.get(IAgentTaskService).stopAll();
  }

  detachBackground(payload: SessionAgentPayload<{ taskId: string }>): BackgroundTaskInfo | undefined {
    return this.agent(payload.sessionId, payload.agentId)
      .accessor.get(IAgentTaskService)
      .detach(payload.taskId) as unknown as BackgroundTaskInfo | undefined;
  }

  clearContext(payload: SessionAgentPayload<EmptyPayload>): void {
    this.agent(payload.sessionId, payload.agentId).accessor.get(IAgentContextMemoryService).clear();
  }

  importContext(_payload: SessionAgentPayload<ImportContextPayload>): void {
    // No v2 counterpart (plan/v2-parity-gap.md P0-2).
    notImplemented('importContext');
  }

  async activateSkill(payload: SessionAgentPayload<{ name: string; args?: string }>): Promise<void> {
    const agent = this.agent(payload.sessionId, payload.agentId);
    await agent.accessor.get(IAgentSkillService).activate({
      name: payload.name,
      args: payload.args,
    });
    await this.applyPromptMetadata(payload.sessionId, promptMetadataTextFromSkill(payload));
  }

  async activatePluginCommand(
    payload: SessionAgentPayload<{ pluginId: string; commandName: string; args?: string }>,
  ): Promise<void> {
    const agent = this.agent(payload.sessionId, payload.agentId);
    const commands = await this.app.get(IPluginService).listPluginCommands();
    const def = commands.find(
      (command) => command.pluginId === payload.pluginId && command.name === payload.commandName,
    );
    if (def === undefined) {
      throw new KimiError(
        ErrorCodes.REQUEST_INVALID,
        `Plugin command "${payload.pluginId}:${payload.commandName}" was not found`,
      );
    }
    const origin = {
      kind: 'plugin_command' as const,
      activationId: randomUUID(),
      pluginId: payload.pluginId,
      commandName: payload.commandName,
      commandArgs: payload.args,
      trigger: 'user-slash' as const,
    };
    agent.accessor.get(IEventBus).publish({
      type: 'plugin_command.activated',
      activationId: origin.activationId,
      pluginId: origin.pluginId,
      commandName: origin.commandName,
      commandArgs: origin.commandArgs,
      trigger: origin.trigger,
    } as never);
    await agent.accessor.get(IAgentPromptService).enqueue({
      message: {
        role: 'user',
        content: [{ type: 'text', text: expandCommandArguments(def.body, payload.args ?? '') }],
        toolCalls: [],
        origin,
      } as never,
    });
    await this.applyPromptMetadata(
      payload.sessionId,
      promptMetadataTextFromPluginCommand(payload as never),
    );
  }

  private async applyPromptMetadata(sessionId: string, text: string | undefined): Promise<void> {
    if (text === undefined) return;
    await applyPromptMetadataUpdate(
      {
        metadata: this.session(sessionId).accessor.get(ISessionMetadata),
        eventService: this.app.get(IEventService),
        sessionId,
      },
      text,
    );
  }

  async startBtw(payload: SessionAgentPayload<EmptyPayload>): Promise<string> {
    return this.session(payload.sessionId).accessor.get(ISessionBtwService).start();
  }

  async createGoal(payload: SessionAgentPayload<CreateGoalPayload>): Promise<GoalSnapshot> {
    return this.agent(payload.sessionId, payload.agentId)
      .accessor.get(IAgentGoalService)
      .createGoal(payload as never) as Promise<GoalSnapshot>;
  }

  getGoal(payload: SessionAgentPayload<EmptyPayload>): GoalToolResult {
    return this.agent(payload.sessionId, payload.agentId).accessor.get(IAgentGoalService).getGoal() as GoalToolResult;
  }

  async pauseGoal(payload: SessionAgentPayload<EmptyPayload>): Promise<GoalSnapshot> {
    return this.agent(payload.sessionId, payload.agentId)
      .accessor.get(IAgentGoalService)
      .pauseGoal() as Promise<GoalSnapshot>;
  }

  async resumeGoal(payload: SessionAgentPayload<EmptyPayload>): Promise<GoalSnapshot> {
    return this.agent(payload.sessionId, payload.agentId)
      .accessor.get(IAgentGoalService)
      .resumeGoal() as Promise<GoalSnapshot>;
  }

  async cancelGoal(payload: SessionAgentPayload<EmptyPayload>): Promise<GoalSnapshot> {
    return this.agent(payload.sessionId, payload.agentId)
      .accessor.get(IAgentGoalService)
      .cancelGoal() as Promise<GoalSnapshot>;
  }

  getNotepad(payload: SessionAgentPayload<EmptyPayload>): string {
    return this.session(payload.sessionId).accessor.get(ISessionNotepadService).getContent();
  }

  setNotepad(payload: SessionAgentPayload<SetNotepadPayload>): void {
    this.session(payload.sessionId).accessor.get(ISessionNotepadService).setContent(payload.content);
  }

  getCronTasks(payload: SessionAgentPayload<EmptyPayload>): GetCronTasksResult {
    const cron = this.session(payload.sessionId).accessor.get(ISessionCronService);
    const tasks: CronTaskSnapshot[] = cron.list().map((task) => ({
      id: task.id,
      cron: task.cron,
      recurring: task.recurring ?? true,
      createdAt: task.createdAt,
      lastFiredAt: task.lastFiredAt,
      nextFireAt: cron.getNextFireForTask(task.id),
    }));
    return { tasks };
  }

  async getBackgroundOutput(payload: SessionAgentPayload<GetBackgroundOutputPayload>): Promise<string> {
    return this.agent(payload.sessionId, payload.agentId)
      .accessor.get(IAgentTaskService)
      .readOutput(payload.taskId, payload.tail);
  }

  getContext(payload: SessionAgentPayload<EmptyPayload>): AgentContextData {
    const context = this.agent(payload.sessionId, payload.agentId).accessor.get(IAgentContextMemoryService);
    return { history: context.get() as never, tokenCount: 0 } as AgentContextData;
  }

  getConfig(payload: SessionAgentPayload<EmptyPayload>): AgentConfigData {
    const data = this.agent(payload.sessionId, payload.agentId).accessor.get(IAgentProfileService).data();
    return {
      cwd: data.cwd,
      modelAlias: data.modelAlias,
      modelCapabilities: data.modelCapabilities,
      profileName: data.profileName,
      thinkingEffort: data.thinkingLevel,
      systemPrompt: data.systemPrompt,
    } as AgentConfigData;
  }

  getPermission(payload: SessionAgentPayload<EmptyPayload>): PermissionData {
    const agent = this.agent(payload.sessionId, payload.agentId);
    return {
      mode: agent.accessor.get(IAgentPermissionModeService).mode,
      rules: [...agent.accessor.get(IAgentPermissionRulesService).rules],
    } as PermissionData;
  }

  async getPlan(payload: SessionAgentPayload<EmptyPayload>): Promise<PlanData> {
    return this.agent(payload.sessionId, payload.agentId).accessor.get(IAgentPlanService).status() as Promise<PlanData>;
  }

  getUsage(payload: SessionAgentPayload<EmptyPayload>): UsageStatus {
    return this.agent(payload.sessionId, payload.agentId).accessor.get(IAgentUsageService).status() as UsageStatus;
  }

  getTools(payload: SessionAgentPayload<EmptyPayload>): readonly ToolInfo[] {
    return this.agent(payload.sessionId, payload.agentId)
      .accessor.get(IAgentToolRegistryService)
      .list() as unknown as readonly ToolInfo[];
  }

  getBackground(payload: SessionAgentPayload<GetBackgroundPayload>): readonly BackgroundTaskInfo[] {
    return this.agent(payload.sessionId, payload.agentId)
      .accessor.get(IAgentTaskService)
      .list(payload.activeOnly ?? false, payload.limit) as unknown as readonly BackgroundTaskInfo[];
  }

  async runShellCommand(payload: SessionAgentPayload<RunShellCommandPayload>): Promise<ShellCommandResult> {
    return this.agent(payload.sessionId, payload.agentId)
      .accessor.get(IAgentShellCommandService)
      .run(payload as never) as Promise<ShellCommandResult>;
  }

  cancelShellCommand(payload: SessionAgentPayload<CancelShellCommandPayload>): void {
    this.agent(payload.sessionId, payload.agentId)
      .accessor.get(IAgentShellCommandService)
      .cancel(payload.commandId);
  }

  // -------------------------------------------------------------------------
  // Core: config / flags / plugins / MCP globals / workspace skills
  // -------------------------------------------------------------------------

  getCoreInfo(_payload: EmptyPayload): CoreInfo {
    return { version: this.options.version ?? 'unknown' };
  }

  getExperimentalFeatures(_payload: EmptyPayload): readonly ExperimentalFeatureState[] {
    return this.app.get(IFlagService).explainAll() as unknown as readonly ExperimentalFeatureState[];
  }

  getKimiConfig(_payload: GetKimiConfigPayload): KimiConfig {
    // The config.toml file is the shared source of truth for both engines;
    // serve the v1 shape through v1's own lenient loader.
    return loadRuntimeConfigSafe(this.options.configPath).config;
  }

  getConfigDiagnostics(_payload: EmptyPayload): ConfigDiagnostics {
    const { fileWarnings, envWarnings } = loadRuntimeConfigSafe(this.options.configPath);
    return { warnings: [...fileWarnings, ...envWarnings] } as unknown as ConfigDiagnostics;
  }

  async setKimiConfig(payload: Record<string, unknown>): Promise<KimiConfig> {
    const merged = mergeConfigPatch(
      readConfigFileForUpdate(this.options.configPath),
      payload as never,
    );
    await writeConfigFile(this.options.configPath, merged);
    await this.app.get(IConfigService).reload();
    return loadRuntimeConfigSafe(this.options.configPath).config;
  }

  async removeKimiProvider(payload: { providerId: string }): Promise<KimiConfig> {
    const config = readConfigFileForUpdate(this.options.configPath);
    delete config.providers[payload.providerId];
    await writeConfigFile(this.options.configPath, config);
    await this.app.get(IConfigService).reload();
    return loadRuntimeConfigSafe(this.options.configPath).config;
  }

  listGlobalMcpServers(): never {
    // v2 has no global MCP CRUD RPC surface (plan/v2-parity-gap.md P0-1).
    return notImplemented('listGlobalMcpServers');
  }

  addGlobalMcpServer(): never {
    return notImplemented('addGlobalMcpServer');
  }

  updateGlobalMcpServer(): never {
    return notImplemented('updateGlobalMcpServer');
  }

  removeGlobalMcpServer(): never {
    return notImplemented('removeGlobalMcpServer');
  }

  beginGlobalMcpServerAuth(): never {
    return notImplemented('beginGlobalMcpServerAuth');
  }

  completeGlobalMcpServerAuth(): never {
    return notImplemented('completeGlobalMcpServerAuth');
  }

  cancelGlobalMcpServerAuth(): never {
    return notImplemented('cancelGlobalMcpServerAuth');
  }

  resetGlobalMcpServerAuth(): never {
    return notImplemented('resetGlobalMcpServerAuth');
  }

  testGlobalMcpServer(): never {
    return notImplemented('testGlobalMcpServer');
  }

  async listWorkspaceSkills(
    _payload: ListWorkspaceSkillsPayload,
  ): Promise<readonly SkillSummary[]> {
    notImplemented('listWorkspaceSkills');
  }

  listPlugins(_payload: EmptyPayload): Promise<readonly PluginSummary[]> {
    return this.app.get(IPluginService).listPlugins() as Promise<readonly PluginSummary[]>;
  }

  installPlugin(payload: InstallPluginPayload): Promise<PluginSummary> {
    return this.app.get(IPluginService).installPlugin(payload as never) as Promise<PluginSummary>;
  }

  async setPluginEnabled(payload: SetPluginEnabledPayload): Promise<void> {
    await this.app.get(IPluginService).setPluginEnabled(payload as never);
  }

  async setPluginMcpServerEnabled(payload: SetPluginMcpServerEnabledPayload): Promise<void> {
    await this.app.get(IPluginService).setPluginMcpServerEnabled(payload as never);
  }

  async removePlugin(payload: RemovePluginPayload): Promise<void> {
    await this.app.get(IPluginService).removePlugin(payload as never);
  }

  reloadPlugins(_payload: EmptyPayload): Promise<ReloadPluginsResult> {
    return this.app.get(IPluginService).reloadPlugins() as Promise<ReloadPluginsResult>;
  }

  getPluginInfo(payload: GetPluginInfoPayload): Promise<V1PluginInfo> {
    return this.app.get(IPluginService).getPluginInfo(payload as never) as Promise<V1PluginInfo>;
  }
}
