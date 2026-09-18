import type { PermissionMode } from '@moonshot-ai/kimi-code-sdk';

export const PERMISSION_MODE_DISPLAY_NAMES: Readonly<Record<PermissionMode, string>> = {
  manual: 'Always Ask',
  yolo: 'Ask When Needed',
  auto: 'Never Ask',
  pentest: 'Pentest (LLM-Gated Egress)',
};

export const PERMISSION_MODE_DESCRIPTIONS: Readonly<Record<PermissionMode, string>> = {
  manual: 'Auto-read only; everything else needs your approval first.',
  yolo: 'Routine edits and commands run automatically; risky actions, questions, and plans still ask.',
  auto: 'Never interrupts you; everything runs and is decided automatically.',
  pentest: 'Local and private-network work runs unattended; outbound requests to public targets are vetted by a small reviewer model.',
};
