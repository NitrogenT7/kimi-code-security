/**
 * `sessionLifecycle` domain (L6) — creates and tracks sessions at the process root.
 *
 * Defines the public contract of session lifecycle: the `CreateSessionOptions`,
 * `ForkSessionOptions`, `CreateChildSessionOptions`, and the
 * `ISessionLifecycleService` used to create sessions (`create`), look up the
 * live ones (`get` / `list`), close them (`close`), archive/restore them,
 * fork them (`fork`), and fork-then-tag them as direct children (`createChild`). Announces
 * lifecycle transitions through ordered hook slots plus
 * `onDidCreateSession` / `onDidCloseSession` / `onDidArchiveSession` /
 * `onDidForkSession`. App-scoped — a single
 * process-wide instance owns the live session scope tree. Persisted
 * sessions (open or closed) are the `sessionIndex` read model; per-session
 * behaviour lives in the Session-scoped domains.
 */

import { createDecorator, type ServiceIdentifier } from '#/_base/di/instantiation';
import type { ISessionScopeHandle } from '#/_base/di/scope';
import type { Event } from '#/_base/event';
import type { McpServerConfig } from '#/agent/mcp/config-schema';
import type { SessionMeta } from '#/session/sessionMetadata/sessionMetadata';
import type { Hooks } from '#/hooks';
import type { Kaos } from '@moonshot-ai/kaos';

export interface CreateSessionOptions {
  readonly sessionId?: string;
  readonly workDir: string;
  readonly additionalDirs?: readonly string[];
  readonly mcpServers?: Readonly<Record<string, McpServerConfig>>;
  /**
   * Host-supplied execution environment bridged onto this session's file
   * tools (v1 parity: the SDK's `createSessionWithKaos` channel). When set,
   * a `KaosHostFileSystem` shadows the App-scoped local `IHostFileSystem` for
   * this session only; App-scoped persistence stays on the local disk. ACP
   * uses this to route file operations over the reverse-RPC `AcpKaos`.
   */
  readonly kaos?: Kaos;
}

export interface ForkSessionOptions {
  readonly sourceSessionId: string;
  readonly newSessionId?: string;
  readonly title?: string;
  readonly metadata?: Record<string, unknown>;
}

export interface CreateChildSessionOptions {
  readonly sourceSessionId: string;
  readonly newSessionId?: string;
  readonly title?: string;
  readonly metadata?: Record<string, unknown>;
}

export interface PatchSessionMetaOptions {
  readonly sessionId: string;
  readonly title?: string;
  readonly custom?: Record<string, unknown>;
}

export interface SessionCreatedEvent {
  readonly sessionId: string;
  readonly handle: ISessionScopeHandle;
  readonly source: SessionCreateSource;
}

export interface SessionClosedEvent {
  readonly sessionId: string;
}

export type SessionCreateSource = 'startup' | 'resume' | 'fork';

export type SessionCloseReason = 'exit';

export interface SessionWillCloseEvent {
  readonly sessionId: string;
  readonly handle: ISessionScopeHandle;
  readonly reason: SessionCloseReason;
}

export type SessionLifecycleHooks = {
  readonly onDidCreateSession: SessionCreatedEvent;
  readonly onWillCloseSession: SessionWillCloseEvent;
};

export interface SessionArchivedEvent {
  readonly sessionId: string;
}

export interface SessionForkedEvent {
  readonly sourceSessionId: string;
  readonly sessionId: string;
  readonly handle: ISessionScopeHandle;
}

export interface ISessionLifecycleService {
  readonly _serviceBrand: undefined;

  readonly onDidCreateSession: Event<SessionCreatedEvent>;
  readonly onDidCloseSession: Event<SessionClosedEvent>;
  readonly onDidArchiveSession: Event<SessionArchivedEvent>;
  readonly onDidForkSession: Event<SessionForkedEvent>;
  readonly hooks: Hooks<SessionLifecycleHooks>;
  create(opts: CreateSessionOptions): Promise<ISessionScopeHandle>;
  get(sessionId: string): ISessionScopeHandle | undefined;
  list(): readonly ISessionScopeHandle[];
  resume(sessionId: string): Promise<ISessionScopeHandle | undefined>;
  close(sessionId: string): Promise<void>;
  archive(sessionId: string): Promise<void>;
  restore(sessionId: string): Promise<ISessionScopeHandle | undefined>;
  /**
   * Hard-delete a session: close it if live, remove its persisted directory,
   * tombstone it in the v1-compatible `session_index.jsonl` so v1 readers
   * (TUI, export) forget it too, purge its read-model row, and drop its cron
   * tasks. Throws `SESSION_NOT_FOUND` when the id is neither live nor
   * persisted.
   */
  delete(sessionId: string): Promise<void>;
  fork(opts: ForkSessionOptions): Promise<ISessionScopeHandle>;
  createChild(opts: CreateChildSessionOptions): Promise<ISessionScopeHandle>;
  /**
   * Patch a session's durable metadata (`title`, `custom`) without requiring
   * the session to be live. Live sessions delegate to their Session-scoped
   * `sessionMetadata`; closed sessions patch `state.json` directly through the
   * same store. Throws `SESSION_NOT_FOUND` when the id is neither live nor
   * persisted.
   */
  patchSessionMeta(opts: PatchSessionMetaOptions): Promise<void>;
  /**
   * Read a session's full `SessionMeta` regardless of liveness — live
   * sessions through their Session-scoped `sessionMetadata`, closed ones from
   * `state.json` on disk. Resolves `undefined` when the id is neither live
   * nor persisted. The read side of `patchSessionMeta`'s two branches, so
   * read-modify-write metadata flows work on closed sessions too.
   */
  readSessionMeta(sessionId: string): Promise<SessionMeta | undefined>;
}

export const ISessionLifecycleService: ServiceIdentifier<ISessionLifecycleService> =
  createDecorator<ISessionLifecycleService>('sessionLifecycleService');
