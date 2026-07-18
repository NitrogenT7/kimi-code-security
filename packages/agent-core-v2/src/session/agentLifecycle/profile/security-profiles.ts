/**
 * `agentLifecycle` domain (L6) — security-research agent profile contributions.
 *
 * Registers the security subagent roles bound to MCP groups (see
 * `agent/mcp/group-config.ts`): each role's tool set carries the
 * `mcp__<server>__*` globs for its group's servers, and its `skillPrefixes`
 * sandbox the skill listing to the group's skills. Because the v2 MCP
 * connection manager is session-shared, a loaded group's tools are visible to
 * every agent — per-role restriction is done here via profile tool globs, not
 * connection scoping.
 *
 * Import-triggered registration: side-effect-imported by the package barrel
 * next to `./profiles`.
 */

import { registerAgentProfile } from '#/app/agentProfileCatalog/contribution';
import {
  renderSystemPrompt,
  TASK_AGENT_ROLE_PREFIX,
} from '#/app/agentProfileCatalog/profile-shared';

const SECURITY_BASE_TOOLS = [
  'Read',
  'ReadMediaFile',
  'Glob',
  'Grep',
  'Bash',
  'Skill',
  'WebSearch',
  'FetchURL',
  'TodoList',
] as const;

const SECURITY_SUMMARY_ROLE =
  'Your final message is the entire handoff — the parent sees nothing else from your run. ' +
  'Make it technically complete: what you analyzed, every concrete finding with its evidence ' +
  '(file paths, offsets, endpoints, requests), what remains unverified, and suggested next steps.';

interface SecurityRoleSpec {
  readonly name: string;
  readonly description: string;
  readonly whenToUse: string;
  readonly role: string;
  readonly mcpServerGlobs: readonly string[];
  readonly skillPrefixes?: readonly string[];
}

function registerSecurityRole(spec: SecurityRoleSpec): void {
  const tools = [...SECURITY_BASE_TOOLS, ...spec.mcpServerGlobs];
  const role = `${TASK_AGENT_ROLE_PREFIX}\n\n${spec.role}\n\n${SECURITY_SUMMARY_ROLE}`;
  registerAgentProfile({
    name: spec.name,
    description: spec.description,
    whenToUse: spec.whenToUse,
    tools,
    skillPrefixes: spec.skillPrefixes,
    systemPrompt: (context) => renderSystemPrompt(role, context, tools),
  });
}

registerSecurityRole({
  name: 'security-analyst',
  description: 'General security-research coordinator; works with any loaded MCP group.',
  whenToUse:
    'Use this agent for security-research tasks that do not fit a specialized role, or that span several MCP groups. The main agent must load the required MCP group (MCPManager load_group) before delegating.',
  role:
    'You are a security-research analyst. You work with whichever MCP servers the main agent ' +
    'has loaded for you — you cannot load MCP groups yourself. If a tool you need is missing, ' +
    'say so in your final message instead of trying to load it.',
  mcpServerGlobs: ['mcp__*'],
});

registerSecurityRole({
  name: 'android-reverser',
  description: 'Mobile security role bound to the android MCP group (APK, Jadx, Frida, ADB).',
  whenToUse:
    'Use this agent for Android security work: APK static analysis, decompilation, dynamic instrumentation, and device interaction. Requires the android MCP group to be loaded first.',
  role:
    'You are an Android security researcher. You decompile and analyze APKs, trace IPC and ' +
    'deeplink surfaces, and drive dynamic instrumentation through the android MCP group ' +
    'servers (jadx, ida, adb, frida, jshook) that the main agent has loaded for you.',
  mcpServerGlobs: ['mcp__jadx__*', 'mcp__ida__*', 'mcp__jshook__*', 'mcp__adb__*', 'mcp__frida__*'],
  skillPrefixes: ['android-', 'apk-', 'audit-'],
});

registerSecurityRole({
  name: 'web-pentester',
  description:
    'Web vulnerability role bound to the web MCP group (Playwright, DevTools, JS hooking).',
  whenToUse:
    'Use this agent for web penetration testing: browser-driven recon, endpoint probing, and client-side analysis. Requires the web MCP group to be loaded first.',
  role:
    'You are a web penetration tester. You drive browsers, inspect network traffic, and probe ' +
    'endpoints through the web MCP group servers (playwright, chrome-devtools, jshook) that ' +
    'the main agent has loaded for you.',
  mcpServerGlobs: ['mcp__playwright__*', 'mcp__chrome-devtools__*', 'mcp__jshook__*'],
  skillPrefixes: ['web-', 'cloud-', 'audit-'],
});

registerSecurityRole({
  name: 'binary-reverser',
  description:
    'Desktop binary reverse-engineering role bound to the binary MCP group (IDA, GDB, Frida).',
  whenToUse:
    'Use this agent for native binary analysis: disassembly, debugging, and dynamic instrumentation of desktop binaries. Requires the binary MCP group to be loaded first.',
  role:
    'You are a binary reverse engineer. You disassemble, debug, and instrument native binaries ' +
    'through the binary MCP group servers (ida, gdb, frida) that the main agent has loaded ' +
    'for you.',
  mcpServerGlobs: ['mcp__ida__*', 'mcp__gdb__*', 'mcp__frida__*'],
  skillPrefixes: ['binary-', 'audit-', 'code-'],
});

registerSecurityRole({
  name: 'code-auditor',
  description: 'Static code-audit role bound to the audit MCP group (Semgrep and scanners).',
  whenToUse:
    'Use this agent for source-code security audits: pattern-based scanning, taint reasoning, and vulnerability triage. Requires the audit MCP group to be loaded first.',
  role:
    'You are a code auditor. You scan source for vulnerability patterns and reason about ' +
    'source-to-sink data flow, using the audit MCP group servers (semgrep) that the main ' +
    'agent has loaded for you, plus your own read/search tools.',
  mcpServerGlobs: ['mcp__semgrep__*'],
  skillPrefixes: ['audit-', 'code-'],
});
