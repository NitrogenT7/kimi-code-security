/**
 * Welcome panel shown at the top of the TUI.
 * Renders a round-bordered box with the logo, session, model, and version.
 */

import type { Component } from '@moonshot-ai/pi-tui';
import { truncateToWidth, visibleWidth } from '@moonshot-ai/pi-tui';
import chalk from 'chalk';

import { effectiveModelAlias } from '@moonshot-ai/kimi-code-sdk';

import { isRainbowDancing, renderDanceWelcomeHeader } from '#/tui/easter-eggs/dance';
import type { AppState } from '#/tui/types';
import { currentTheme } from '#/tui/theme';
import { isForkBuild } from '#/utils/host-package';

/**
 * Fork (ksec) logo: the security fork's mark in ASCII — a blue left arm
 * (`v`, #3F47CC like the source SVG) sweeping down-right, crossed by the
 * primary-colored band (`@`) that runs from the top-right all the way down
 * into the left-leaning stem. Downsampled from the full-size ASCII original.
 */
const KSEC_LOGO = [
  'vvvvvvvvvvvvvvvvvvvvv     -@@@@@@@@@@@@@',
  '        vvvvvvvvvvvv       @@@@@@@@@@@+',
  '          vvvvvvvv       @@@@@@@@@@@=',
  '            vvvv       @@@@@@@@@@@-',
  '             v        @@@@@@@@@@.',
  '                    @@@@@@@@@@.',
  '                  @@@@@@@@@@',
  '              @@@@@@@@@@@@',
  '              @@@@@@@@@@',
  '              @@@@@@@%',
  '              @@@@@#',
  '              @@@*',
] as const;
const KSEC_LOGO_BLUE = '#3F47CC';

function colorKsecLogoRow(row: string): string {
  const blue = chalk.hex(KSEC_LOGO_BLUE);
  const primary = chalk.hex(currentTheme.palette.primary);
  // Rows are `<spaces><v-run><@-run>`; color the v arm blue, the rest primary.
  const match = /^(\s*)(v*)(.*)$/.exec(row);
  if (match === null) return primary(row);
  const [, spaces, vs, rest] = match;
  return spaces + (vs.length > 0 ? blue(vs) : '') + (rest.length > 0 ? primary(rest) : '');
}

export class WelcomeComponent implements Component {
  private state: AppState;

  constructor(state: AppState) {
    this.state = state;
  }

  invalidate(): void {}

  render(width: number): string[] {
    const safeWidth = Math.max(0, width);
    const primary = (s: string): string => chalk.hex(currentTheme.palette.primary)(s);
    const isLoggedOut = !this.state.model;
    const activeModel = this.state.availableModels[this.state.model];
    const effectiveActiveModel = activeModel === undefined ? undefined : effectiveModelAlias(activeModel);
    const fork = isForkBuild();
    const titleText = fork ? 'Welcome to Kimi Code Security!' : 'Welcome to Kimi Code!';
    const taglineText = fork
      ? "Security research build — verify, don't destroy. Send /help for help."
      : 'Send /help for help information.';

    if (safeWidth < 24) {
      const title = chalk.bold.hex(currentTheme.palette.primary)(titleText);
      const prompt = isLoggedOut
        ? chalk.hex(currentTheme.palette.warning)('Run /login or /provider to get started.')
        : chalk.hex(currentTheme.palette.textDim)(taglineText);
      const model = isLoggedOut
        ? chalk.hex(currentTheme.palette.warning)('not set, run /login or /provider')
        : (effectiveActiveModel?.displayName ?? effectiveActiveModel?.model ?? this.state.model);
      return ['', title, prompt, `Model: ${model}`].map((line) =>
        truncateToWidth(line, safeWidth, '…'),
      );
    }

    const innerWidth = Math.max(1, safeWidth - 4);
    const pad = '  ';

    // Logo + side-by-side text.
    const logo = fork ? KSEC_LOGO : (['▐█▛█▛█▌', '▐█████▌'] as const);
    const logoWidth = Math.max(...logo.map((row) => visibleWidth(row)));
    const gap = '  ';
    const textWidth = Math.max(4, innerWidth - logoWidth - gap.length);

    const rightRow0 = truncateToWidth(
      chalk.bold.hex(currentTheme.palette.primary)(titleText),
      textWidth,
      '…',
    );
    const dim = chalk.hex(currentTheme.palette.textDim);
    const labelStyle = chalk.bold.hex(currentTheme.palette.textDim);
    const rightRow1 = truncateToWidth(
      dim(isLoggedOut ? 'Run /login or /provider to get started.' : taglineText),
      textWidth,
      '…',
    );

    let renderedHeaderLines: string[];
    if (fork) {
      // Center the title/tagline against the taller fork logo.
      renderedHeaderLines = logo.map((row, index) => {
        const base = colorKsecLogoRow(row.padEnd(logoWidth));
        if (index === 3) return base + gap + rightRow0;
        if (index === 4) return base + gap + rightRow1;
        return base;
      });
    } else {
      renderedHeaderLines = [
        primary(logo[0]!.padEnd(logoWidth)) + gap + rightRow0,
        primary(logo[1]!.padEnd(logoWidth)) + gap + rightRow1,
      ];
      if (isRainbowDancing()) {
        renderedHeaderLines = renderDanceWelcomeHeader(logo, textWidth, rightRow1);
      }
    }

    const modelValue = isLoggedOut
      ? chalk.hex(currentTheme.palette.warning)('not set, run /login or /provider')
      : (effectiveActiveModel?.displayName ?? effectiveActiveModel?.model ?? this.state.model);

    const versionValue = fork ? `${this.state.version} (ksec)` : this.state.version;

    const infoLines = [
      labelStyle('Directory: ') + this.state.workDir,
      labelStyle('Session:   ') + this.state.sessionId,
      labelStyle('Model:     ') + modelValue,
      labelStyle('Version:   ') + versionValue,
    ];

    if (this.state.mcpServersSummary) {
      infoLines.push(labelStyle('MCP:       ') + this.state.mcpServersSummary);
    }

    const contentLines: string[] = [...renderedHeaderLines, '', ...infoLines];

    const lines: string[] = [
      '',
      primary('╭' + '─'.repeat(safeWidth - 2) + '╮'),
      primary('│') + ' '.repeat(safeWidth - 2) + primary('│'),
    ];

    for (const content of contentLines) {
      const truncated = truncateToWidth(content, innerWidth, '…');
      const vis = visibleWidth(truncated);
      const rightPad = Math.max(0, innerWidth - vis);
      lines.push(primary('│') + pad + truncated + ' '.repeat(rightPad) + primary('│'));
    }

    lines.push(primary('│') + ' '.repeat(safeWidth - 2) + primary('│'));
    lines.push(primary('╰' + '─'.repeat(safeWidth - 2) + '╯'));
    lines.push('');

    return lines.map((line) => truncateToWidth(line, safeWidth, '…'));
  }
}
