import { describe, expect, it } from 'vitest';

import { getAgentProfileContributions } from '#/app/agentProfileCatalog/contribution';
import '#/session/agentLifecycle/profile/profiles';
import '#/session/agentLifecycle/profile/security-profiles';

function profile(name: string) {
  const found = getAgentProfileContributions().find((p) => p.name === name);
  expect(found, `security profile "${name}" is registered`).toBeDefined();
  return found!;
}

describe('security agent profiles', () => {
  it('registers all five security roles', () => {
    for (const name of [
      'security-analyst',
      'android-reverser',
      'web-pentester',
      'binary-reverser',
      'code-auditor',
    ]) {
      const entry = profile(name);
      expect(entry.description?.length ?? 0).toBeGreaterThan(0);
      expect(entry.whenToUse?.length ?? 0).toBeGreaterThan(0);
    }
  });

  it('shares the security base tool set including Notepad', () => {
    for (const name of [
      'security-analyst',
      'android-reverser',
      'web-pentester',
      'binary-reverser',
      'code-auditor',
    ]) {
      const tools = profile(name).tools ?? [];
      for (const base of ['Read', 'Glob', 'Grep', 'Bash', 'Skill', 'TodoList', 'Notepad']) {
        expect(tools, `${name} keeps base tool ${base}`).toContain(base);
      }
    }
  });

  it('scopes each role to its MCP server tool globs', () => {
    expect(profile('security-analyst').tools).toContain('mcp__*');
    expect(profile('android-reverser').tools).toEqual(
      expect.arrayContaining(['mcp__jadx__*', 'mcp__ida__*', 'mcp__adb__*', 'mcp__frida__*']),
    );
    expect(profile('web-pentester').tools).toEqual(
      expect.arrayContaining(['mcp__playwright__*', 'mcp__chrome-devtools__*']),
    );
    expect(profile('binary-reverser').tools).toEqual(
      expect.arrayContaining(['mcp__ida__*', 'mcp__gdb__*', 'mcp__frida__*']),
    );
    expect(profile('code-auditor').tools).toContain('mcp__semgrep__*');
  });

  it('gives the main agent profile the MCPManager tool', () => {
    expect(profile('agent').tools).toContain('MCPManager');
  });

  it('lets the main agent delegate to the security roles', () => {
    const subagents = profile('agent').subagents ?? [];
    for (const name of [
      'security-analyst',
      'android-reverser',
      'web-pentester',
      'binary-reverser',
      'code-auditor',
    ]) {
      expect(subagents, `agent can spawn ${name}`).toContain(name);
    }
  });
});
