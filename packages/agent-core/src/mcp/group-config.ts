import { readFile } from 'node:fs/promises';

import { McpServerConfigSchema } from '#/config/schema';
import { ErrorCodes, KimiError } from '#/errors';
import { z } from 'zod';

import { resolveMcpJsonPaths } from './config-loader';

export const McpGroupSchema = z.object({
  description: z.string().optional(),
  servers: z.array(z.string()).min(1),
  skillPrefixes: z.array(z.string()).optional(),
});

export type McpGroup = z.infer<typeof McpGroupSchema>;

export const McpGroupsFileSchema = z.object({
  mcpServers: z.record(z.string(), McpServerConfigSchema).default({}),
  mcpGroups: z.record(z.string(), McpGroupSchema).default({}),
});

export type McpGroupsFile = z.infer<typeof McpGroupsFileSchema>;

export interface LoadMcpGroupsInput {
  readonly cwd: string;
  readonly homeDir?: string;
}

/**
 * Load MCP group declarations from the same three locations as MCP servers:
 *   - `~/.kimi-code/mcp.json`
 *   - `<project root>/.mcp.json`
 *   - `<cwd>/.kimi-code/mcp.json`
 *
 * Later files override earlier files by group name. If no groups are declared
 * but servers are present, default security-research groups are auto-generated
 * to match the legacy Python kimi-cli behavior.
 */
export async function loadMcpGroups(
  input: LoadMcpGroupsInput,
): Promise<Record<string, McpGroup>> {
  const paths = await resolveMcpJsonPaths({ cwd: input.cwd, homeDir: input.homeDir });

  const userFile = await readMcpGroupsFile(paths.user);
  const projectRootFile = await readMcpGroupsFile(paths.projectRoot);
  const projectFile = await readMcpGroupsFile(paths.project);

  const servers = {
    ...userFile.mcpServers,
    ...projectRootFile.mcpServers,
    ...projectFile.mcpServers,
  };

  let groups = {
    ...userFile.mcpGroups,
    ...projectRootFile.mcpGroups,
    ...projectFile.mcpGroups,
  };

  if (Object.keys(groups).length === 0 && Object.keys(servers).length > 0) {
    groups = generateDefaultMcpGroups(Object.keys(servers));
  }

  return groups;
}

async function readMcpGroupsFile(filePath: string): Promise<McpGroupsFile> {
  let text: string;
  try {
    text = await readFile(filePath, 'utf-8');
  } catch (error: unknown) {
    const code = (error as { code?: string }).code;
    if (code === 'ENOENT' || code === 'ENOTDIR') {
      return { mcpServers: {}, mcpGroups: {} };
    }
    throw new KimiError(ErrorCodes.CONFIG_INVALID, `Failed to read ${filePath}: ${describeError(error)}`, {
      cause: error,
    });
  }

  if (text.trim().length === 0) {
    return { mcpServers: {}, mcpGroups: {} };
  }

  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (error: unknown) {
    throw new KimiError(ErrorCodes.CONFIG_INVALID, `Invalid JSON in ${filePath}: ${describeError(error)}`, {
      cause: error,
    });
  }

  try {
    return McpGroupsFileSchema.parse(data);
  } catch (error: unknown) {
    throw new KimiError(ErrorCodes.CONFIG_INVALID, `Invalid MCP group config in ${filePath}: ${describeError(error)}`, {
      cause: error,
    });
  }
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Replicates the legacy Python kimi-cli default group initialization from
 * `cli/mcp.py:_init_default_groups`. Groups are created only when at least one
 * of their predefined servers is present in the user's MCP config.
 */
export function generateDefaultMcpGroups(serverNames: readonly string[]): Record<string, McpGroup> {
  if (serverNames.length === 0) return {};
  const names = new Set(serverNames);
  const predefined: Record<string, { description: string; servers: string[]; skillPrefixes: string[] }> = {
    android: {
      description: '移动安全组：APK反编译 + 二进制逆向 + WebView调试 + ADB设备控制 + Frida动态插桩',
      servers: ['ida', 'jadx', 'jshook', 'adb', 'frida'],
      // Allow the Android-specific skills plus generic audit/review skills that
      // are commonly used inside an Android audit workflow (e.g. review/validate).
      skillPrefixes: ['android-', 'apk-', 'audit-'],
    },
    web: {
      description: 'Web挖洞组：浏览器自动化 + 深度调试 + JS逆向 + 云端渗透',
      servers: ['playwright', 'chrome-devtools', 'jshook'],
      // Web/cloud skills plus generic audit/review skills used for web findings.
      skillPrefixes: ['web-', 'cloud-', 'audit-'],
    },
    audit: {
      description: '代码审计组：静态安全扫描',
      servers: ['semgrep'],
      // Audit skills plus the code-security-review skill (code- prefix).
      skillPrefixes: ['audit-', 'code-'],
    },
    binary: {
      description: '桌面二进制逆向：IDA静态分析 + GDB动态调试 + Frida插桩',
      servers: ['ida', 'gdb', 'frida'],
      // Fix: was mistakenly set to ['audit-']. Allow binary-specific skills,
      // generic audit/review skills, and code review skills.
      skillPrefixes: ['binary-', 'audit-', 'code-'],
    },
    full: {
      description: '全量模式（所有服务器）',
      servers: ['*'],
      skillPrefixes: ['*'],
    },
  };

  const groups: Record<string, McpGroup> = {};
  for (const [groupName, groupDef] of Object.entries(predefined)) {
    if (groupName === 'full') {
      groups[groupName] = {
        description: groupDef.description,
        servers: groupDef.servers,
        skillPrefixes: groupDef.skillPrefixes,
      };
      continue;
    }

    const matched = groupDef.servers.filter((s) => names.has(s));
    if (matched.length > 0) {
      groups[groupName] = {
        description: groupDef.description,
        servers: matched,
        skillPrefixes: groupDef.skillPrefixes,
      };
    }
  }

  return groups;
}
