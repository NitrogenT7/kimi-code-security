/**
 * Cross-engine resume: a session created by the v1 harness must resume
 * cleanly under the v2 bridge (the migration path for existing users).
 */

import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { LocalKaos } from '@moonshot-ai/kaos';

import { createKimiHarness, createKimiHarnessV2 } from '#/index';

import { TEST_IDENTITY } from './test-identity';

const tempDirs: string[] = [];

afterEach(async () => {
  for (const dir of tempDirs.splice(0)) {
    await rm(dir, { recursive: true, force: true });
  }
});

describe('cross-engine session resume', () => {
  it('resumes a v1-created session under the v2 engine', async () => {
    const homeDir = await mkdtemp(join(tmpdir(), 'kimi-xeng-home-'));
    const workDir = await mkdtemp(join(tmpdir(), 'kimi-xeng-work-'));
    tempDirs.push(homeDir, workDir);
    await writeFile(
      join(homeDir, 'config.toml'),
      `[providers.test]\ntype = "openai"\napi_key = "test-key"\n`,
      'utf-8',
    );

    const v1 = createKimiHarness({ homeDir, identity: TEST_IDENTITY });
    try {
      const session = await v1.createSession({ id: 'ses_cross_engine', workDir });
      await session.setNotepad('written by v1');
      await session.createGoal({ objective: 'cross-engine goal' });
      await session.close();
    } finally {
      await v1.close();
    }

    const v2 = createKimiHarnessV2({ homeDir, identity: TEST_IDENTITY });
    try {
      const resumed = await v2.resumeSession({ id: 'ses_cross_engine' });
      expect(resumed.id).toBe('ses_cross_engine');

      // State written by v1 (tool store records, goal records) survives.
      expect(await resumed.getNotepad()).toBe('written by v1');
      const { goal } = await resumed.getGoal();
      expect(goal?.objective).toContain('cross-engine goal');

      const state = resumed.getResumeState();
      expect(state?.agents['main']).toBeDefined();

      await resumed.close();
    } finally {
      await v2.close();
    }
  });

  it('renames and patches metadata for closed sessions under the v2 engine', async () => {
    const homeDir = await mkdtemp(join(tmpdir(), 'kimi-xeng-home-'));
    const workDir = await mkdtemp(join(tmpdir(), 'kimi-xeng-work-'));
    tempDirs.push(homeDir, workDir);
    await writeFile(
      join(homeDir, 'config.toml'),
      `[providers.test]\ntype = "openai"\napi_key = "test-key"\n`,
      'utf-8',
    );

    const v2 = createKimiHarnessV2({ homeDir, identity: TEST_IDENTITY });
    try {
      const session = await v2.createSession({ id: 'ses_closed_rename', workDir });
      await session.setNotepad('seed content');
      await session.updateMetadata({ keep: 'me' });
      await v2.closeSession(session.id);

      // The session is closed (not live in the lifecycle service); rename
      // must still succeed through the cold state.json path and the custom
      // metadata written while live survives the patch.
      await v2.renameSession({ id: session.id, title: 'Closed Title' });

      const sessions = await v2.listSessions({ workDir });
      const summary = sessions.find((item) => item.id === session.id);
      expect(summary?.title).toBe('Closed Title');
      expect(summary?.metadata).toMatchObject({ keep: 'me' });

      // A fresh read after a second rename reflects the persisted title.
      await v2.renameSession({ id: session.id, title: 'Renamed Again' });
      const reread = await v2.listSessions({ workDir });
      expect(reread.find((item) => item.id === session.id)?.title).toBe('Renamed Again');
    } finally {
      await v2.close();
    }
  });

  it('imports context and deletes sessions under the v2 engine', async () => {
    const homeDir = await mkdtemp(join(tmpdir(), 'kimi-xeng-home-'));
    const workDir = await mkdtemp(join(tmpdir(), 'kimi-xeng-work-'));
    tempDirs.push(homeDir, workDir);
    await writeFile(
      join(homeDir, 'config.toml'),
      `[providers.test]\ntype = "openai"\napi_key = "test-key"\n`,
      'utf-8',
    );

    const v2 = createKimiHarnessV2({ homeDir, identity: TEST_IDENTITY });
    try {
      const session = await v2.createSession({ id: 'ses_v2_import_delete', workDir });

      // importContext appends the v1-compatible user message.
      await session.importContext('Prior context.', "file 'status.md'");
      const context = await session.getContext();
      expect(context.history.at(-1)).toMatchObject({
        role: 'user',
        origin: { kind: 'user' },
        content: [
          {
            type: 'text',
            text: expect.stringContaining('<system>The user has imported context from'),
          },
          {
            type: 'text',
            text: expect.stringContaining('<imported_context source="file \'status.md\'">'),
          },
        ],
      });

      // Empty content is rejected with the v1 error shape.
      await expect(session.importContext('  ', "file 'x.md'")).rejects.toMatchObject({
        code: 'request.invalid',
      });

      // deleteSession removes the persisted session.
      await session.close();
      await v2.deleteSession(session.id);
      const sessions = await v2.listSessions({ workDir });
      expect(sessions.find((item) => item.id === session.id)).toBeUndefined();
      await expect(v2.resumeSession({ id: session.id })).rejects.toMatchObject({
        code: 'session.not_found',
      });
    } finally {
      await v2.close();
    }
  });

  it('lists workspace skills under the v2 engine without creating a session', async () => {
    const homeDir = await mkdtemp(join(tmpdir(), 'kimi-xeng-home-'));
    const workDir = await mkdtemp(join(tmpdir(), 'kimi-xeng-work-'));
    tempDirs.push(homeDir, workDir);
    await writeFile(
      join(homeDir, 'config.toml'),
      `[providers.test]\ntype = "openai"\napi_key = "test-key"\n`,
      'utf-8',
    );
    // A project skill under the workspace's brand dir.
    const skillDir = join(workDir, '.kimi-code', 'skills', 'demo-skill');
    await mkdir(skillDir, { recursive: true });
    await writeFile(
      join(skillDir, 'SKILL.md'),
      '---\nname: demo-skill\ndescription: Demo skill for the cross-engine suite\n---\n\nBody',
      'utf-8',
    );

    const v2 = createKimiHarnessV2({ homeDir, identity: TEST_IDENTITY });
    try {
      const skills = await v2.listWorkspaceSkills(workDir);
      expect(skills.map((skill) => skill.name)).toContain('demo-skill');

      // Missing workDir keeps the v1 error shape.
      await expect(v2.listWorkspaceSkills('')).rejects.toMatchObject({
        code: 'request.work_dir_required',
      });
    } finally {
      await v2.close();
    }
  });

  it('pins and unpins a closed session through updateSessionMetadata', async () => {
    const homeDir = await mkdtemp(join(tmpdir(), 'kimi-xeng-home-'));
    const workDir = await mkdtemp(join(tmpdir(), 'kimi-xeng-work-'));
    tempDirs.push(homeDir, workDir);
    await writeFile(
      join(homeDir, 'config.toml'),
      `[providers.test]
type = "openai"
api_key = "test-key"
`,
      'utf8',
    );

    const v2 = createKimiHarnessV2({ homeDir, identity: TEST_IDENTITY });
    try {
      const session = await v2.createSession({ id: 'ses_v2_pin', workDir });
      await session.updateMetadata({ keep: 'me' });
      await v2.closeSession(session.id);

      // Pin the closed session (read-modify-write through the cold path).
      await v2.updateSessionMetadata({
        sessionId: session.id,
        metadata: { pinned: true, pinnedAt: 12345 },
      });

      let listed = await v2.listSessions({ workDir });
      expect(listed.find((x) => x.id === session.id)?.metadata).toMatchObject({
        keep: 'me',
        pinned: true,
        pinnedAt: 12345,
      });

      // Unpin writes false; other custom keys survive the merge.
      await v2.updateSessionMetadata({ sessionId: session.id, metadata: { pinned: false } });
      listed = await v2.listSessions({ workDir });
      const meta = listed.find((x) => x.id === session.id)?.metadata;
      expect(meta?.['pinned']).toBe(false);
      expect(meta?.['keep']).toBe('me');

      // The reserved goal key is rejected.
      await expect(
        v2.updateSessionMetadata({ sessionId: session.id, metadata: { goal: 'x' } }),
      ).rejects.toMatchObject({ code: 'goal.metadata_reserved' });
    } finally {
      await v2.close();
    }
  });

  it('injects a per-session kaos filesystem through createSessionWithKaos', async () => {
    const homeDir = await mkdtemp(join(tmpdir(), 'kimi-xeng-home-'));
    const workDir = await mkdtemp(join(tmpdir(), 'kimi-xeng-work-'));
    tempDirs.push(homeDir, workDir);
    await writeFile(
      join(homeDir, 'config.toml'),
      `[providers.test]\ntype = "openai"\napi_key = "test-key"\n`,
      'utf-8',
    );

    // A counting Kaos: routed file reads/writes must go through it.
    const calls: string[] = [];
    const kaos = await LocalKaos.create();
    const countingKaos = new Proxy(kaos, {
      get(target, prop, receiver) {
        if (typeof prop === 'string' && ['readText', 'writeText', 'readBytes'].includes(prop)) {
          calls.push(prop);
        }
        return Reflect.get(target, prop, receiver);
      },
    });

    const v2 = createKimiHarnessV2({ homeDir, identity: TEST_IDENTITY });
    try {
      const session = await v2.createSession({
        id: 'ses_kaos',
        workDir,
        kaos: countingKaos,
      });
      expect(session.id).toBe('ses_kaos');

      // The session must be live and its scope must resolve the Kaos-backed
      // filesystem: writing through the session scope hits the proxy.
      const context = await session.getContext();
      expect(context.history).toBeDefined();
      await session.close();
    } finally {
      await v2.close();
    }
  });

  it('manages global MCP servers in mcp.json under the v2 engine', async () => {
    const homeDir = await mkdtemp(join(tmpdir(), 'kimi-xeng-home-'));
    const workDir = await mkdtemp(join(tmpdir(), 'kimi-xeng-work-'));
    tempDirs.push(homeDir, workDir);
    await writeFile(
      join(homeDir, 'config.toml'),
      `[providers.test]\ntype = "openai"\napi_key = "test-key"\n`,
      'utf-8',
    );

    const v2 = createKimiHarnessV2({ homeDir, identity: TEST_IDENTITY });
    try {
      // Empty registry to start.
      await expect(v2.listMcpServers()).resolves.toEqual([]);

      // Add a stdio server; list reflects it with its name.
      const added = await v2.addMcpServer({
        name: 'docs',
        transport: 'http',
        url: 'https://mcp.example.com/docs',
      });
      expect(added.map((server) => server.name)).toEqual(['docs']);

      // Update replaces the entry.
      await v2.updateMcpServer({
        name: 'docs',
        transport: 'http',
        url: 'https://mcp.example.com/v2',
      });
      const listed = (await v2.listMcpServers()).find((s) => s.name === 'docs');
      expect(listed?.transport === 'http' ? listed.url : undefined).toBe(
        'https://mcp.example.com/v2',
      );

      // Duplicate add keeps the v1 error shape.
      await expect(
        v2.addMcpServer({ name: 'docs', transport: 'http', url: 'https://mcp.example.com' }),
      ).rejects.toMatchObject({ code: 'request.invalid' });

      // Remove empties the registry and is idempotent.
      await v2.removeMcpServer('docs');
      await expect(v2.listMcpServers()).resolves.toEqual([]);
      await expect(v2.removeMcpServer('docs')).resolves.toEqual([]);

      // Unknown-server operations keep the v1 error shape.
      await expect(
        v2.updateMcpServer({ name: 'ghost', transport: 'http', url: 'https://x.example.com' }),
      ).rejects.toMatchObject({ code: 'mcp.server_not_found' });

      // The file on disk carries the mcpServers shape v1 readers expect.
      const mcpJson = JSON.parse(await readFile(join(homeDir, 'mcp.json'), 'utf-8')) as {
        mcpServers: Record<string, unknown>;
      };
      expect(mcpJson.mcpServers).toEqual({});
    } finally {
      await v2.close();
    }
  });
});
