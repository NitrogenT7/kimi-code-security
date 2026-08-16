import { truncateToWidth, type Component } from '@moonshot-ai/pi-tui';

import { STATUS_BULLET } from '#/tui/constant/symbols';
import { currentTheme } from '#/tui/theme';

export type SwarmModeMarkerState = 'active' | 'inactive' | 'ended';

/** Variant of swarm mode shown in the marker; currently only the security-audit variant. */
export type SwarmVariant = 'audit';

export class SwarmModeMarkerComponent implements Component {
  constructor(
    private readonly state: SwarmModeMarkerState,
    private readonly variant?: SwarmVariant,
  ) {}

  invalidate(): void {}

  render(width: number): string[] {
    const safeWidth = Math.max(0, width);
    if (safeWidth <= 0) return [''];

    const token = this.state === 'inactive' ? 'textDim' : 'success';
    const marker = currentTheme.boldFg(token, STATUS_BULLET);
    const label = currentTheme.boldFg(token, swarmMarkerLabel(this.state, this.variant));
    return ['', truncateToWidth(marker + label, safeWidth, '…')];
  }
}

function swarmMarkerLabel(state: SwarmModeMarkerState, variant: SwarmVariant | undefined): string {
  const subject = variant === 'audit' ? 'Audit swarm' : 'Swarm';
  switch (state) {
    case 'active':
      return `${subject} activated`;
    case 'inactive':
      return `${subject} deactivated`;
    case 'ended':
      return `${subject} ended`;
  }
}
