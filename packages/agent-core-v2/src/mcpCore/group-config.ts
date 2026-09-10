import { z } from 'zod';

import { resolveMcpJsonPaths } from '#/app/mcpConfig/configLoader';
import { ErrorCodes, Error2 } from '#/errors';
import type { IHostFileSystem } from '#/os/interface/hostFileSystem';
import { OsFsErrors, HostFsError } from '#/os/interface/hostFsErrors';

export const McpGroupSchema = z.object({
  description: z.string().optional(),
  servers: z.array(z.string()).min(1),
  skillPrefixes: z.array(z.string()).optional(),
});

export type McpGroup = z.infer<typeof McpGroupSchema>;

export interface LoadMcpGroupsInput {
  readonly fs: IHostFileSystem;
  readonly cwd: string;
  readonly homeDir?: string;
  readonly includeProject?: boolean;
}

export async function loadMcpGroups(input: LoadMcpGroupsInput): Promise<Record<string, McpGroup>> {
  const paths = await resolveMcpJsonPaths({ fs: input.fs, cwd: input.cwd, homeDir: input.homeDir });
  const files =
    input.includeProject === false
      ? [paths.user]
      : [paths.user, paths.projectRoot, paths.project];
  const groups: Record<string, McpGroup> = Object.create(null);
  for (const filePath of files) {
    const layer = await readMcpGroupsLayer(input.fs, filePath);
    Object.assign(groups, layer);
  }
  return groups;
}

async function readMcpGroupsLayer(
  fs: IHostFileSystem,
  filePath: string,
): Promise<Record<string, McpGroup>> {
  let text: string;
  try {
    text = await fs.readText(filePath);
  } catch (error: unknown) {
    if (error instanceof HostFsError && error.code === OsFsErrors.codes.OS_FS_NOT_FOUND) {
      return {};
    }
    throw new Error2(
      ErrorCodes.CONFIG_INVALID,
      `Failed to read ${filePath}: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  }
  if (text.trim().length === 0) return {};

  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (error: unknown) {
    throw new Error2(
      ErrorCodes.CONFIG_INVALID,
      `Invalid JSON in ${filePath}: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  }

  if (typeof data !== 'object' || data === null || Array.isArray(data)) return {};
  const raw = (data as Record<string, unknown>)['mcpGroups'];
  if (raw === undefined) return {};
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new Error2(ErrorCodes.CONFIG_INVALID, `"mcpGroups" in ${filePath} must be an object`);
  }
  const groups: Record<string, McpGroup> = Object.create(null);
  for (const [name, value] of Object.entries(raw)) {
    const parsed = McpGroupSchema.safeParse(value);
    if (!parsed.success) {
      throw new Error2(
        ErrorCodes.CONFIG_INVALID,
        `Invalid MCP group "${name}" in ${filePath}: ${parsed.error.message}`,
      );
    }
    groups[name] = parsed.data;
  }
  return groups;
}
