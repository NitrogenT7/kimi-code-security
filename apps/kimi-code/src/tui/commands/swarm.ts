import type { PermissionMode } from '@moonshot-ai/kimi-code-sdk';

import {
  SwarmStartPermissionPromptComponent,
  type SwarmStartPermissionChoice,
} from '../components/dialogs/swarm-start-permission-prompt';
import {
  SwarmModeMarkerComponent,
  type SwarmModeMarkerState,
  type SwarmVariant,
} from '../components/messages/swarm-markers';
import { LLM_NOT_SET_MESSAGE, NO_ACTIVE_SESSION_MESSAGE } from '../constant/kimi-tui';
import { formatErrorMessage } from '../utils/event-payload';
import type { SlashCommandHost } from './dispatch';

export async function handleSwarmCommand(host: SlashCommandHost, args: string): Promise<void> {
  if (host.session === undefined) {
    host.showError(NO_ACTIVE_SESSION_MESSAGE);
    return;
  }

  const raw = args.trim();
  const { variant, rest: prompt } = parseSwarmVariant(raw);
  const mode = swarmModeSubcommand(prompt);
  if (mode !== undefined) {
    await applySwarmMode(host, mode, `/swarm ${raw}`, variant);
    return;
  }

  if (prompt.length === 0) {
    await applySwarmMode(host, !host.state.appState.swarmMode, `/swarm ${raw}`, variant);
    return;
  }

  if (host.state.appState.model.trim().length === 0) {
    host.showError(LLM_NOT_SET_MESSAGE);
    return;
  }

  if (host.state.appState.permissionMode === 'manual') {
    showSwarmStartPermissionPrompt(host, `/swarm ${raw}`, 'Swarm task not started.', (choice) =>
      startSwarmWithPermission(host, prompt, choice, variant),
    );
    return;
  }

  await startSwarmTask(host, prompt, variant);
}

/**
 * Split a leading `audit` token from the swarm arguments. `/swarm audit ...`
 * enters the security-audit variant of swarm mode; anything else is the
 * general-purpose swarm.
 */
function parseSwarmVariant(input: string): { variant?: SwarmVariant; rest: string } {
  const match = /^(\S+)(?:\s+(.*))?$/s.exec(input);
  // Strict lowercase match: "audit" is the variant keyword, but a task prompt
  // that merely opens with the English word "Audit ..." stays a general swarm.
  if (match?.[1] !== 'audit') return { variant: undefined, rest: input };
  return { variant: 'audit', rest: match[2]?.trim() ?? '' };
}

function showSwarmStartPermissionPrompt(
  host: SlashCommandHost,
  commandText: string,
  cancelStatus: string,
  onSelect: (choice: SwarmStartPermissionChoice) => Promise<void>,
): void {
  const cancelStart = (): void => {
    host.restoreInputText(commandText);
    host.showStatus(cancelStatus);
  };
  host.mountEditorReplacement(
    new SwarmStartPermissionPromptComponent({
      onSelect: (choice) => {
        host.restoreEditor();
        void onSelect(choice);
      },
      onCancel: cancelStart,
    }),
  );
}

async function startSwarmWithPermission(
  host: SlashCommandHost,
  prompt: string,
  choice: SwarmStartPermissionChoice,
  variant: SwarmVariant | undefined,
): Promise<void> {
  if (choice === 'auto' || choice === 'yolo') {
    if (!(await setPermissionForSwarm(host, choice))) return;
  }
  await startSwarmTask(host, prompt, variant);
}

async function setPermissionForSwarm(host: SlashCommandHost, mode: PermissionMode): Promise<boolean> {
  try {
    await host.requireSession().setPermission(mode);
  } catch (error) {
    host.showError(`Failed to set permission mode: ${formatErrorMessage(error)}`);
    return false;
  }
  host.setAppState({ permissionMode: mode });
  return true;
}

async function startSwarmTask(
  host: SlashCommandHost,
  prompt: string,
  variant: SwarmVariant | undefined,
): Promise<void> {
  if (!host.state.appState.swarmMode && !(await setSwarmMode(host, true, 'task', variant))) {
    return;
  }
  renderSwarmModeMarker(host, 'active', host.state.appState.swarmVariant);
  host.sendNormalUserInput(prompt);
}

async function applySwarmMode(
  host: SlashCommandHost,
  enabled: boolean,
  commandText: string,
  variant: SwarmVariant | undefined,
): Promise<void> {
  if (enabled && host.state.appState.swarmMode) {
    host.showStatus('Swarm mode is already on.');
    return;
  }
  if (!enabled && !host.state.appState.swarmMode) {
    host.showStatus('Swarm mode is already off.');
    return;
  }
  if (enabled && host.state.appState.permissionMode === 'manual') {
    showSwarmStartPermissionPrompt(host, commandText, 'Swarm mode not enabled.', async (choice) => {
      if ((choice === 'auto' || choice === 'yolo') && !(await setPermissionForSwarm(host, choice))) {
        return;
      }
      if (!(await setSwarmMode(host, true, 'manual', variant))) return;
      renderSwarmModeMarker(host, 'active', variant);
    });
    return;
  }
  if (!(await setSwarmMode(host, enabled, 'manual', variant))) return;
  renderSwarmModeMarker(host, enabled ? 'active' : 'inactive', enabled ? variant : undefined);
}

async function setSwarmMode(
  host: SlashCommandHost,
  enabled: boolean,
  trigger: 'manual' | 'task',
  variant: SwarmVariant | undefined,
): Promise<boolean> {
  try {
    await host.requireSession().setSwarmMode(enabled, trigger, variant);
  } catch (error) {
    host.showError(
      `Failed to ${enabled ? 'enable' : 'disable'} swarm mode: ${formatErrorMessage(error)}`,
    );
    return false;
  }
  host.setAppState({ swarmMode: enabled, swarmVariant: enabled ? variant : undefined });
  host.state.swarmModeEntry = enabled ? trigger : undefined;
  return true;
}

function swarmModeSubcommand(input: string): boolean | undefined {
  const command = input.toLowerCase();
  if (command === 'on') return true;
  if (command === 'off') return false;
  return undefined;
}

function renderSwarmModeMarker(
  host: SlashCommandHost,
  state: SwarmModeMarkerState,
  variant: SwarmVariant | undefined,
): void {
  host.state.transcriptContainer.addChild(
    new SwarmModeMarkerComponent(state, variant),
  );
  host.state.ui.requestRender();
}
