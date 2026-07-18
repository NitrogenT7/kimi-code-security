#!/usr/bin/env node
/**
 * Merge gate for the security-research fork.
 *
 * Runs the checks that must pass before merging a feature branch into
 * `security-research/main`:
 *
 *   1. pnpm typecheck
 *   2. pnpm lint (warnings allowed; errors fail)
 *   3. MCP and profile unit tests
 *   4. CHANGELOG.md contains an Unreleased section
 *
 * Usage:
 *   node scripts/merge-gate.mjs
 */

import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const repoRoot = dirname(dirname(__filename));

const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
};

function log(message) {
  // eslint-disable-next-line no-console
  console.log(message);
}

function run(command, args, cwd) {
  log(`\n${colors.bold}> ${command} ${args.join(' ')}${colors.reset}`);
  const result = spawnSync(command, args, {
    cwd,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  return result.status ?? 1;
}

let failed = false;

// 1. Type check
if (run('pnpm', ['typecheck'], repoRoot) !== 0) {
  failed = true;
}

// 2. Lint (oxlint exits 1 only on errors; warnings are acceptable)
if (run('pnpm', ['lint'], repoRoot) !== 0) {
  failed = true;
}

// 3. Run MCP and profile tests in the agent-core package
const testStatus = run(
  'pnpm',
  ['--filter', '@moonshot-ai/agent-core', 'exec', 'vitest', 'run', 'test/mcp', 'test/profile'],
  repoRoot,
);
if (testStatus !== 0) {
  failed = true;
}

// 4. Changelog gate: require an Unreleased section
let changelogText;
try {
  changelogText = readFileSync(join(repoRoot, 'CHANGELOG.md'), 'utf-8');
} catch {
  log(`${colors.red}CHANGELOG.md not found${colors.reset}`);
  changelogText = '';
  failed = true;
}

if (!/##\s*\[?Unreleased\]?/i.test(changelogText)) {
  log(`${colors.red}CHANGELOG.md must contain an Unreleased section before merging.${colors.reset}`);
  failed = true;
} else {
  log(`${colors.green}CHANGELOG.md Unreleased section found.${colors.reset}`);
}

if (failed) {
  log(`\n${colors.red}${colors.bold}Merge gate FAILED.${colors.reset}`);
  process.exit(1);
}

log(`\n${colors.green}${colors.bold}Merge gate PASSED.${colors.reset}`);
