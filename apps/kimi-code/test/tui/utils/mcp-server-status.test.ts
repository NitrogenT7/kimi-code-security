import { describe, expect, it } from 'vitest';

import {
  formatMcpStartupStatusSummary,
  selectMcpStartupStatusRows,
  type McpServerStatusSnapshot,
} from '#/tui/utils/mcp-server-status';

function server(
  name: string,
  status: McpServerStatusSnapshot['status'],
): McpServerStatusSnapshot {
  return { name, transport: 'stdio', status, toolCount: 0 };
}

describe('selectMcpStartupStatusRows', () => {
  it('omits registered and disabled servers from startup transcript rows', () => {
    const rows = selectMcpStartupStatusRows([
      server('lazy-a', 'registered'),
      server('lazy-b', 'registered'),
      server('off', 'disabled'),
      server('broken', 'failed'),
      server('up', 'connected'),
    ]);
    expect(rows.map((s) => s.name)).toEqual(['broken', 'up']);
  });

  it('keeps actionable states ordered by priority', () => {
    const rows = selectMcpStartupStatusRows([
      server('up', 'connected'),
      server('oauth', 'needs-auth'),
      server('broken', 'failed'),
      server('loading', 'pending'),
    ]);
    expect(rows.map((s) => s.name)).toEqual(['broken', 'oauth', 'loading', 'up']);
  });
});

describe('formatMcpStartupStatusSummary', () => {
  it('still counts registered servers for the footer summary', () => {
    const summary = formatMcpStartupStatusSummary([
      server('lazy-a', 'registered'),
      server('lazy-b', 'registered'),
      server('broken', 'failed'),
    ]);
    expect(summary).toBe('1 failed, 2 registered');
  });
});
