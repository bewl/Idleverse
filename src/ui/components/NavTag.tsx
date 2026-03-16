import type { CSSProperties, KeyboardEvent, MouseEvent } from 'react';
import { useUiStore, type EntityType, type PanelId } from '@/stores/uiStore';

// ─── Entity → Panel routing ───────────────────────────────────────────────

const PANEL_FOR_TYPE: Record<EntityType, PanelId> = {
  fleet:    'fleet',
  pilot:    'fleet',
  ship:     'fleet',
  skill:    'skills',
  resource: 'mining',
  system:   'system',
  anomaly:  'system',
};

// ─── Color palette by entity type ────────────────────────────────────────────

const COLOR_FOR_TYPE: Record<EntityType, string> = {
  fleet:    '#22d3ee', // cyan
  pilot:    '#a78bfa', // violet
  ship:     '#a78bfa', // violet
  skill:    '#fbbf24', // amber
  resource: '#fbbf24', // amber
  system:   '#ffe47a', // gold
  anomaly:  '#fb7185', // rose
};

// ─── NavTag ───────────────────────────────────────────────────────────────────

interface NavTagProps {
  entityType: EntityType;
  entityId: string;
  label: string;
  /** Optional tooltip shown on hover before navigating. */
  tooltip?: string;
}

/**
 * Clickable entity tag that navigates to the relevant panel and focuses the
 * entity. Works inside tooltips (nested navigation) and panel content alike.
 */
export function NavTag({ entityType, entityId, label, tooltip }: NavTagProps) {
  const color = COLOR_FOR_TYPE[entityType];

  const handleClick = (e: MouseEvent) => {
    e.stopPropagation();
    useUiStore.getState().navigate(PANEL_FOR_TYPE[entityType], { entityType, entityId });
  };

  return (
    <span
      className="entity-tag"
      style={{ '--tag-color': color } as CSSProperties}
      onClick={handleClick}
      title={tooltip}
      role="button"
      tabIndex={0}
      onKeyDown={(e: KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') handleClick(e as unknown as MouseEvent); }}
    >
      {label}
    </span>
  );
}
