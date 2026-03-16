import { type CSSProperties, type ReactNode, useEffect, useState } from 'react';
import { useGameStore } from '@/stores/gameStore';
import {
  RESOURCE_REGISTRY,
  formatCredits,
  formatResourceAmount,
} from '@/game/resources/resourceRegistry';
import { useResourceRates } from '@/game/hooks/useResourceRates';
import {
  MANUFACTURING_RECIPES,
} from '@/game/systems/manufacturing/manufacturing.config';
import { getManufacturingSpeedMultiplier } from '@/game/systems/manufacturing/manufacturing.logic';
import { ORE_BELTS } from '@/game/systems/mining/mining.config';
import { SKILL_DEFINITIONS } from '@/game/systems/skills/skills.config';
import {
  activeTrainingEta,
  formatTrainingEta,
} from '@/game/systems/skills/skills.logic';
import { skillTrainingSeconds } from '@/game/balance/constants';
import {
  getBatchYieldPreview,
  getReprocessingEfficiency,
} from '@/game/systems/reprocessing/reprocessing.logic';
import { BATCH_TIME_SECONDS } from '@/game/systems/reprocessing/reprocessing.config';
import {
  getCorpHqBonusFromState,
  getHomeOutpost,
  getHomeStationDefinition,
} from '@/game/systems/factions/faction.logic';
import {
  getFleetStoredCargo,
  getFleetStorageCapacity,
  getHaulingWings,
  getOperationalFleetShipIds,
  getWingCurrentSystemId,
  hasActiveEscortWing,
} from '@/game/systems/fleet/wings.logic';
import { getAliveNpcGroupsInSystem } from '@/game/systems/combat/combat.logic';
import { getSystemById } from '@/game/galaxy/galaxy.gen';
import { GameTooltip, TT } from '@/ui/components/GameTooltip';

type ChipTone = 'cyan' | 'amber' | 'violet' | 'emerald' | 'rose' | 'slate';

const CHIP_COLORS: Record<ChipTone, { accent: string; text: string; meta: string }> = {
  cyan: { accent: '#22d3ee', text: '#cffafe', meta: '#67e8f9' },
  amber: { accent: '#fbbf24', text: '#fef3c7', meta: '#fcd34d' },
  violet: { accent: '#a78bfa', text: '#ede9fe', meta: '#c4b5fd' },
  emerald: { accent: '#34d399', text: '#d1fae5', meta: '#6ee7b7' },
  rose: { accent: '#fb7185', text: '#ffe4e6', meta: '#fda4af' },
  slate: { accent: '#94a3b8', text: '#e2e8f0', meta: '#94a3b8' },
};

function fmtRate(rate: number): { text: string; positive: boolean } | null {
  const abs = Math.abs(rate);
  if (abs < 0.001) return null;
  const arrow = rate > 0 ? '+' : '-';
  if (abs >= 1000) return { text: `${arrow}${(abs / 1000).toFixed(1)}k/s`, positive: rate > 0 };
  if (abs >= 10) return { text: `${arrow}${abs.toFixed(1)}/s`, positive: rate > 0 };
  return { text: `${arrow}${abs.toFixed(2)}/s`, positive: rate > 0 };
}

function fmtSeconds(seconds: number): string {
  if (seconds < 0) seconds = 0;
  if (seconds < 60) return `${Math.ceil(seconds)}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`;
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
}

function formatShortCount(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}m`;
  if (value >= 10_000) return `${Math.round(value / 1000)}k`;
  if (value >= 1000) return `${(value / 1000).toFixed(1)}k`;
  return value.toString();
}

function getStorageTargetCopy(haulingWingCount: number) {
  if (haulingWingCount <= 0) {
    return {
      label: 'Shared Storage',
      detail: 'Mining output is currently using shared fleet storage because no hauling wing is configured.',
    };
  }
  if (haulingWingCount === 1) {
    return {
      label: 'Hauling Wing Storage',
      detail: 'Mining output is currently routing into the fleet\'s single hauling wing cargo hold.',
    };
  }
  return {
    label: 'Hauling Network',
    detail: `Mining output is currently distributed across ${haulingWingCount} hauling wings in the fleet storage network.`,
  };
}

function MiniProgress({ percent, color }: { percent: number; color: string }) {
  return (
    <div className="hud-data-chip-progress-track">
      <div
        className="hud-data-chip-progress-fill"
        style={{ width: `${Math.max(0, Math.min(100, percent))}%`, backgroundColor: color }}
      />
    </div>
  );
}

function ChipLine({ label, value, valueColor }: { label: string; value: ReactNode; valueColor?: string }) {
  return <TT.Row label={label} value={value} valueColor={valueColor} />;
}

function DataChip({
  tone,
  label,
  value,
  meta,
  tooltip,
  progress,
  alert = false,
}: {
  tone: ChipTone;
  label: string;
  value: ReactNode;
  meta?: ReactNode;
  tooltip: ReactNode;
  progress?: number;
  alert?: boolean;
}) {
  const colors = CHIP_COLORS[tone];

  return (
    <GameTooltip pinnable width={320} content={tooltip}>
      <div
        className={`hud-data-chip ${alert ? 'hud-data-chip-alert' : ''}`}
        style={{ '--chip-accent': colors.accent } as CSSProperties}
      >
        <div className="hud-data-chip-head-row">
          <div className="hud-data-chip-label-row">
            <span className="hud-data-chip-dot" style={{ backgroundColor: colors.accent }} />
            <span className="hud-data-chip-label">{label}</span>
          </div>
          <div className="hud-data-chip-value" style={{ color: colors.text }}>
            {value}
          </div>
        </div>
        <div className="hud-data-chip-meta-row">
          {meta ? (
            <span className="hud-data-chip-meta" style={{ color: colors.meta }}>
              {meta}
            </span>
          ) : (
            <span className="hud-data-chip-meta hud-data-chip-meta-muted">No live detail</span>
          )}
          {typeof progress === 'number' && <MiniProgress percent={progress} color={colors.accent} />}
        </div>
      </div>
    </GameTooltip>
  );
}

function CreditsChip() {
  const state = useGameStore(s => s.state);
  const rates = useResourceRates();
  const credits = state.resources['credits'] ?? 0;
  const creditRate = rates['credits'] ?? 0;
  const rateLabel = fmtRate(creditRate);
  const positiveFlows = Object.entries(rates)
    .filter(([id, rate]) => id !== 'credits' && rate > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  return (
    <DataChip
      tone="amber"
      label="Credits"
      value={formatCredits(credits)}
      meta={rateLabel ? rateLabel.text : 'Stable cashflow'}
      tooltip={
        <>
          <TT.Header title="Credits" subtitle="Primary liquidity signal. Keep this visible; inspect the tooltip for what is feeding it." color="#fbbf24" />
          <TT.Section label="Balance">
            <TT.Grid>
              <ChipLine label="Available" value={formatCredits(credits)} valueColor="#fde68a" />
              <ChipLine label="Net flow" value={rateLabel?.text ?? 'stable'} valueColor={rateLabel ? (rateLabel.positive ? '#34d399' : '#fb7185') : '#94a3b8'} />
            </TT.Grid>
          </TT.Section>
          {positiveFlows.length > 0 && (
            <TT.Section label="Top inflows">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {positiveFlows.map(([resourceId, rate]) => (
                  <div key={resourceId} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 10 }}>
                    <span style={{ color: '#94a3b8' }}>{RESOURCE_REGISTRY[resourceId]?.name ?? resourceId}</span>
                    <span style={{ color: '#34d399', fontVariantNumeric: 'tabular-nums' }}>{fmtRate(rate)?.text}</span>
                  </div>
                ))}
              </div>
            </TT.Section>
          )}
          <TT.Footer>Use this chip as your at-a-glance liquidity read; everything else in the bar should explain what is moving it.</TT.Footer>
        </>
      }
    />
  );
}

function InventoryChip() {
  const resources = useGameStore(s => s.state.resources);
  const rates = useResourceRates();

  const tracked = Object.entries(resources)
    .filter(([id, amount]) => amount > 0 && RESOURCE_REGISTRY[id] && RESOURCE_REGISTRY[id].category !== 'currency')
    .sort((a, b) => b[1] - a[1]);

  const countsByTier = tracked.reduce<Record<number, number>>((acc, [id]) => {
    const tier = RESOURCE_REGISTRY[id]?.tier;
    if (tier) acc[tier] = (acc[tier] ?? 0) + 1;
    return acc;
  }, {});

  const oreFlow = Object.entries(rates)
    .filter(([id, rate]) => rate > 0 && RESOURCE_REGISTRY[id]?.category === 'ore')
    .reduce((sum, [, rate]) => sum + rate, 0);

  const mineralFlow = Object.entries(rates)
    .filter(([id, rate]) => rate > 0 && RESOURCE_REGISTRY[id]?.tier === 2)
    .reduce((sum, [, rate]) => sum + rate, 0);

  return (
    <DataChip
      tone="slate"
      label="Inventory"
      value={`${tracked.length} stacks`}
      meta={`${countsByTier[1] ?? 0} ore · ${countsByTier[2] ?? 0} min · ${countsByTier[3] ?? 0} comp`}
      tooltip={
        <>
          <TT.Header title="Inventory Summary" subtitle="Collapsed raw resources live here instead of occupying the full bar width." color="#94a3b8" />
          <TT.Section label="Composition">
            <TT.Grid>
              <ChipLine label="Ore stacks" value={countsByTier[1] ?? 0} valueColor="#fcd34d" />
              <ChipLine label="Mineral stacks" value={countsByTier[2] ?? 0} valueColor="#67e8f9" />
              <ChipLine label="Component stacks" value={countsByTier[3] ?? 0} valueColor="#c4b5fd" />
              <ChipLine label="Ship stacks" value={countsByTier[4] ?? 0} valueColor="#fda4af" />
            </TT.Grid>
          </TT.Section>
          <TT.Section label="Throughput">
            <TT.Grid>
              <ChipLine label="Ore inflow" value={oreFlow > 0 ? `${oreFlow.toFixed(2)}/s` : 'idle'} valueColor={oreFlow > 0 ? '#34d399' : '#94a3b8'} />
              <ChipLine label="Mineral inflow" value={mineralFlow > 0 ? `${mineralFlow.toFixed(2)}/s` : 'idle'} valueColor={mineralFlow > 0 ? '#34d399' : '#94a3b8'} />
            </TT.Grid>
          </TT.Section>
          {tracked.length > 0 && (
            <TT.Section label="Largest holdings">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {tracked.slice(0, 7).map(([resourceId, amount]) => {
                  const def = RESOURCE_REGISTRY[resourceId];
                  if (!def) return null;
                  return (
                    <div key={resourceId} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 10 }}>
                      <span style={{ color: '#cbd5e1' }}>{def.name}</span>
                      <span style={{ color: '#94a3b8', fontVariantNumeric: 'tabular-nums' }}>
                        {formatResourceAmount(amount, def.precision)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </TT.Section>
          )}
        </>
      }
    />
  );
}

function MiningChip() {
  const state = useGameStore(s => s.state);
  const rates = useResourceRates();
  const ships = state.systems.fleet.ships;
  const pilots = state.systems.fleet.pilots;
  const fleets = Object.values(state.systems.fleet.fleets);

  const miningShips = Object.values(ships).filter(ship => ship.activity === 'mining' && !!ship.assignedBeltId);
  const activeBeltIds = Array.from(new Set(miningShips.map(ship => ship.assignedBeltId).filter((beltId): beltId is string => !!beltId)));
  const oreRates = Object.entries(rates)
    .filter(([id, rate]) => rate > 0 && RESOURCE_REGISTRY[id]?.category === 'ore')
    .sort((a, b) => b[1] - a[1]);
  const oreFlow = oreRates.reduce((sum, [, rate]) => sum + rate, 0);
  const topOre = oreRates[0];
  const depletedBelts = activeBeltIds.filter(beltId => (state.systems.mining.beltRespawnAt[beltId] ?? 0) > Date.now()).length;
  const miningFleetSummaries = fleets
    .map(fleet => {
      const operationalShipIds = new Set(getOperationalFleetShipIds(fleet));
      const activeMinerCount = fleet.shipIds.filter(shipId => operationalShipIds.has(shipId) && !!ships[shipId]?.assignedBeltId).length;
      if (activeMinerCount === 0) return null;
      const storageUsed = getFleetStoredCargo(fleet);
      const storageCapacity = getFleetStorageCapacity(fleet, ships, pilots);
      const storageFill = storageCapacity > 0 ? Math.round((storageUsed / storageCapacity) * 100) : 0;
      const storageTarget = getStorageTargetCopy(getHaulingWings(fleet).length);
      return {
        fleetId: fleet.id,
        fleetName: fleet.name,
        activeMinerCount,
        storageTarget,
        storageUsed,
        storageCapacity,
        storageFill,
      };
    })
    .filter(Boolean) as Array<{
      fleetId: string;
      fleetName: string;
      activeMinerCount: number;
      storageTarget: { label: string; detail: string };
      storageUsed: number;
      storageCapacity: number;
      storageFill: number;
    }>;
  const storageMeta = miningFleetSummaries.length === 1
    ? `${miningFleetSummaries[0].storageTarget.label} ${miningFleetSummaries[0].storageFill}%`
    : miningFleetSummaries.length > 1
      ? `avg storage ${Math.round(miningFleetSummaries.reduce((sum, fleet) => sum + fleet.storageFill, 0) / miningFleetSummaries.length)}%`
      : 'No storage pressure';

  return (
    <DataChip
      tone={oreFlow > 0 ? 'cyan' : 'slate'}
      label="Mining"
      value={oreFlow > 0 ? `${oreFlow.toFixed(2)}/s` : 'Idle'}
      meta={miningShips.length > 0 ? `${miningShips.length} miners · ${activeBeltIds.length} belts · ${storageMeta}` : 'No active miners'}
      alert={depletedBelts > 0}
      tooltip={
        <>
          <TT.Header title="Mining" subtitle="Live extraction status and ore flow." color="#22d3ee" />
          <TT.Section label="Current output">
            <TT.Grid>
              <ChipLine label="Ore flow" value={oreFlow > 0 ? `${oreFlow.toFixed(2)}/s` : 'idle'} valueColor={oreFlow > 0 ? '#67e8f9' : '#94a3b8'} />
              <ChipLine label="Active miners" value={miningShips.length} valueColor="#67e8f9" />
              <ChipLine label="Active belts" value={activeBeltIds.length} valueColor="#67e8f9" />
              <ChipLine label="Mining fleets" value={miningFleetSummaries.length} valueColor="#67e8f9" />
              <ChipLine label="Depleted belts" value={depletedBelts} valueColor={depletedBelts > 0 ? '#fbbf24' : '#94a3b8'} />
            </TT.Grid>
          </TT.Section>
          {topOre && (
            <TT.Section label="Top ore stream">
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 10 }}>
                <span style={{ color: '#cbd5e1' }}>{RESOURCE_REGISTRY[topOre[0]]?.name ?? topOre[0]}</span>
                <span style={{ color: '#67e8f9', fontVariantNumeric: 'tabular-nums' }}>{topOre[1].toFixed(2)}/s</span>
              </div>
            </TT.Section>
          )}
          {miningFleetSummaries.length > 0 && (
            <TT.Section label="Storage targets">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {miningFleetSummaries.slice(0, 4).map(summary => (
                  <div key={summary.fleetId} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto', gap: 12, fontSize: 10 }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ color: '#e2e8f0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{summary.fleetName}</div>
                      <div style={{ color: '#64748b' }}>{summary.storageTarget.detail}</div>
                    </div>
                    <div style={{ textAlign: 'right', color: '#94a3b8', fontVariantNumeric: 'tabular-nums' }}>
                      <div>{summary.storageTarget.label}</div>
                      <div>{summary.storageFill}% · {formatResourceAmount(summary.storageUsed, 0)} / {formatResourceAmount(summary.storageCapacity, 0)}</div>
                    </div>
                  </div>
                ))}
              </div>
            </TT.Section>
          )}
          {activeBeltIds.length > 0 && (
            <TT.Section label="Belt assignments">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {activeBeltIds.slice(0, 5).map(beltId => {
                  const minersOnBelt = miningShips.filter(ship => ship.assignedBeltId === beltId).length;
                  const beltName = ORE_BELTS[beltId]?.name ?? beltId;
                  const isDepleted = (state.systems.mining.beltRespawnAt[beltId] ?? 0) > Date.now();
                  return (
                    <div key={beltId} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 10 }}>
                      <span style={{ color: '#cbd5e1' }}>{beltName}</span>
                      <span style={{ color: isDepleted ? '#fbbf24' : '#94a3b8', fontVariantNumeric: 'tabular-nums' }}>
                        {minersOnBelt} miner{minersOnBelt !== 1 ? 's' : ''}{isDepleted ? ' · respawn' : ''}
                      </span>
                    </div>
                  );
                })}
              </div>
            </TT.Section>
          )}
        </>
      }
    />
  );
}

function FleetsChip() {
  const state = useGameStore(s => s.state);
  const fleets = Object.values(state.systems.fleet.fleets);
  const ships = state.systems.fleet.ships;
  const pilots = state.systems.fleet.pilots;

  const summary = {
    transit: 0,
    hauling: 0,
    patrol: 0,
    raid: 0,
    idle: 0,
    cargoAlerts: 0,
    hullAlerts: 0,
    idleAlerts: 0,
    escortAlerts: 0,
  };

  const lines = fleets.map(fleet => {
    if (fleet.fleetOrder !== null) summary.transit += 1;
    else if (getHaulingWings(fleet).some(wing => wing.isDispatched)) summary.hauling += 1;
    else if (fleet.combatOrder?.type === 'patrol') summary.patrol += 1;
    else if (fleet.combatOrder?.type === 'raid') summary.raid += 1;
    else summary.idle += 1;

    const cargoUsed = getFleetStoredCargo(fleet);
    const cargoCap = getFleetStorageCapacity(fleet, ships, pilots);
    const cargoFill = cargoCap > 0 ? (cargoUsed / cargoCap) * 100 : 0;
    if (cargoFill >= 80 && fleet.fleetOrder === null) summary.cargoAlerts += 1;

    const avgHull = fleet.shipIds.length > 0
      ? fleet.shipIds.reduce((sum, shipId) => sum + (ships[shipId]?.hullDamage ?? 0), 0) / fleet.shipIds.length
      : 0;
    if (avgHull > 30) summary.hullAlerts += 1;

    const dispatched = getHaulingWings(fleet).filter(wing => wing.isDispatched && hasActiveEscortWing(fleet, wing));
    for (const wing of dispatched) {
      const convoySystemId = getWingCurrentSystemId(fleet, wing, ships);
      if (!convoySystemId) continue;
      if (getAliveNpcGroupsInSystem(state, convoySystemId).length > 0) {
        summary.escortAlerts += 1;
        break;
      }
    }

    const operationalShipIds = getOperationalFleetShipIds(fleet);
    if (operationalShipIds.length > 0 && fleet.fleetOrder === null && !fleet.combatOrder) {
      const anyMining = operationalShipIds.some(shipId => ships[shipId]?.assignedBeltId);
      if (!anyMining && !fleet.isScanning) summary.idleAlerts += 1;
    }

    let systemName = fleet.currentSystemId;
    try {
      systemName = getSystemById(state.galaxy.seed, fleet.currentSystemId).name;
    } catch {
      systemName = fleet.currentSystemId;
    }

    return {
      id: fleet.id,
      name: fleet.name,
      systemName,
      cargoFill: Math.round(cargoFill),
      avgHull: Math.round(avgHull),
      operationalShips: operationalShipIds.length,
      totalShips: fleet.shipIds.length,
    };
  });

  const totalAlerts = summary.cargoAlerts + summary.hullAlerts + summary.idleAlerts + summary.escortAlerts;
  const tone: ChipTone = summary.hullAlerts > 0 || summary.escortAlerts > 0 ? 'rose' : totalAlerts > 0 ? 'amber' : 'cyan';
  const activeLabel = summary.transit > 0
    ? `${summary.transit} transit`
    : summary.hauling > 0
      ? `${summary.hauling} hauling`
      : summary.patrol > 0
        ? `${summary.patrol} patrol`
        : summary.raid > 0
          ? `${summary.raid} raid`
          : `${summary.idle} idle`;

  return (
    <DataChip
      tone={tone}
      label="Fleets"
      value={`${fleets.length} active`}
      meta={totalAlerts > 0 ? `${activeLabel} · ${totalAlerts} alert${totalAlerts !== 1 ? 's' : ''}` : activeLabel}
      alert={totalAlerts > 0}
      tooltip={
        <>
          <TT.Header title="Fleet Status" subtitle="Compact operations summary: movement, cargo pressure, hull damage, and idle fleets." color={CHIP_COLORS[tone].accent} />
          <TT.Section label="Activity mix">
            <TT.Grid>
              <ChipLine label="Transit" value={summary.transit} valueColor="#67e8f9" />
              <ChipLine label="Hauling" value={summary.hauling} valueColor="#fcd34d" />
              <ChipLine label="Patrol" value={summary.patrol} valueColor="#fda4af" />
              <ChipLine label="Raid" value={summary.raid} valueColor="#fda4af" />
              <ChipLine label="Idle" value={summary.idle} valueColor="#94a3b8" />
              <ChipLine label="Total alerts" value={totalAlerts} valueColor={totalAlerts > 0 ? '#fbbf24' : '#94a3b8'} />
            </TT.Grid>
          </TT.Section>
          {totalAlerts > 0 && (
            <TT.Section label="Alert pressure">
              <TT.BadgeRow badges={[
                { label: `Cargo ${summary.cargoAlerts}`, color: summary.cargoAlerts > 0 ? '#fbbf24' : '#334155' },
                { label: `Hull ${summary.hullAlerts}`, color: summary.hullAlerts > 0 ? '#fb7185' : '#334155' },
                { label: `Idle ${summary.idleAlerts}`, color: summary.idleAlerts > 0 ? '#94a3b8' : '#334155' },
                { label: `Escort ${summary.escortAlerts}`, color: summary.escortAlerts > 0 ? '#fb7185' : '#334155' },
              ]} />
            </TT.Section>
          )}
          <TT.Section label="Fleet rows">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {lines.slice(0, 6).map(line => (
                <div key={line.id} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto', gap: 12, fontSize: 10 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ color: '#e2e8f0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{line.name}</div>
                    <div style={{ color: '#475569' }}>{line.systemName}</div>
                  </div>
                  <div style={{ textAlign: 'right', color: '#94a3b8', fontVariantNumeric: 'tabular-nums' }}>
                    <div>{line.operationalShips}/{line.totalShips} ops</div>
                    <div>{line.cargoFill}% cargo · {line.avgHull}% hull</div>
                  </div>
                </div>
              ))}
            </div>
          </TT.Section>
        </>
      }
    />
  );
}

function TrainingChip() {
  const skillsState = useGameStore(s => s.state.systems.skills);
  const activeSkillId = skillsState.activeSkillId;

  if (!activeSkillId) {
    return (
      <DataChip
        tone="slate"
        label="Training"
        value="Idle"
        meta={skillsState.queue.length > 0 ? `${skillsState.queue.length} queued` : 'Queue empty'}
        tooltip={
          <>
            <TT.Header title="Corp Training" subtitle="No active skill is training right now." color="#94a3b8" />
            <TT.Section label="Queue">
              <TT.Grid>
                <ChipLine label="Queued skills" value={skillsState.queue.length} valueColor="#94a3b8" />
              </TT.Grid>
            </TT.Section>
          </>
        }
      />
    );
  }

  const def = SKILL_DEFINITIONS[activeSkillId];
  const nextLevel = (skillsState.levels[activeSkillId] ?? 0) + 1;
  const totalSeconds = def ? skillTrainingSeconds(def.rank, nextLevel) : 1;
  const progress = Math.min(100, (skillsState.activeProgress / totalSeconds) * 100);
  const eta = activeTrainingEta(skillsState);

  return (
    <DataChip
      tone="cyan"
      label="Training"
      value={formatTrainingEta(eta)}
      meta={`${def?.name ?? activeSkillId} · Lv ${nextLevel} · ${skillsState.queue.length} queued`}
      progress={progress}
      tooltip={
        <>
          <TT.Header title="Corp Training" subtitle="Global corp skill training remains one of the highest-value persistent progress bars in the game." color="#22d3ee" />
          <TT.Section label="Active level">
            <TT.Grid>
              <ChipLine label="Skill" value={def?.name ?? activeSkillId} valueColor="#cffafe" />
              <ChipLine label="Target" value={`Lv ${nextLevel}`} valueColor="#67e8f9" />
              <ChipLine label="ETA" value={formatTrainingEta(eta)} valueColor="#67e8f9" />
              <ChipLine label="Rank" value={def ? `Rank ${def.rank}` : '—'} valueColor="#94a3b8" />
            </TT.Grid>
            <TT.ProgressBar value={skillsState.activeProgress} max={totalSeconds} color="#22d3ee" label="Progress" />
          </TT.Section>
          {skillsState.queue.length > 0 && (
            <TT.Section label="Up next">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {skillsState.queue.slice(0, 5).map((entry, index) => (
                  <div key={`${entry.skillId}-${entry.targetLevel}-${index}`} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 10 }}>
                    <span style={{ color: '#cbd5e1' }}>{SKILL_DEFINITIONS[entry.skillId]?.name ?? entry.skillId}</span>
                    <span style={{ color: '#67e8f9', fontVariantNumeric: 'tabular-nums' }}>Lv {entry.targetLevel}</span>
                  </div>
                ))}
              </div>
            </TT.Section>
          )}
        </>
      }
    />
  );
}

function ManufacturingChip() {
  const state = useGameStore(s => s.state);
  const mfg = state.systems.manufacturing;

  if (!state.unlocks['system-manufacturing']) {
    return (
      <DataChip
        tone="slate"
        label="Manufacturing"
        value="Locked"
        meta="Train Industry I"
        tooltip={<TT.Header title="Manufacturing" subtitle="Locked. Industry I unlocks the production queue." color="#94a3b8" />}
      />
    );
  }

  const speedMult = getManufacturingSpeedMultiplier(state);
  const head = mfg.queue[0] ?? null;
  const recipe = head ? MANUFACTURING_RECIPES[head.recipeId] : null;
  const completedAllTime = Object.values(mfg.completedCount).reduce((sum, value) => sum + value, 0);

  if (!head || !recipe) {
    return (
      <DataChip
        tone="violet"
        label="Manufacturing"
        value="Idle"
        meta={`${mfg.queue.length} queued · x${speedMult.toFixed(2)}`}
        tooltip={
          <>
            <TT.Header title="Manufacturing" subtitle="Unlocked but currently idle." color="#a78bfa" />
            <TT.Section label="Snapshot">
              <TT.Grid>
                <ChipLine label="Queue length" value={mfg.queue.length} valueColor="#c4b5fd" />
                <ChipLine label="Speed" value={`x${speedMult.toFixed(2)}`} valueColor="#c4b5fd" />
                <ChipLine label="Produced all time" value={completedAllTime} valueColor="#94a3b8" />
              </TT.Grid>
            </TT.Section>
          </>
        }
      />
    );
  }

  const totalSeconds = (recipe.timeCost * head.quantity) / Math.max(speedMult, 0.001);
  const progress = Math.min(100, (head.progress / totalSeconds) * 100);
  const remaining = Math.max(0, totalSeconds - head.progress);

  return (
    <DataChip
      tone="violet"
      label="Manufacturing"
      value={fmtSeconds(remaining)}
      meta={`${recipe.name} · ${mfg.queue.length} jobs · x${speedMult.toFixed(2)}`}
      progress={progress}
      tooltip={
        <>
          <TT.Header title="Manufacturing" subtitle="Production queue summary. Keep this chip persistent; inspect for job detail and backlog." color="#a78bfa" />
          <TT.Section label="Active job">
            <TT.Grid>
              <ChipLine label="Recipe" value={recipe.name} valueColor="#ede9fe" />
              <ChipLine label="Quantity" value={`×${head.quantity}`} valueColor="#c4b5fd" />
              <ChipLine label="ETA" value={fmtSeconds(remaining)} valueColor="#c4b5fd" />
              <ChipLine label="Speed" value={`x${speedMult.toFixed(2)}`} valueColor="#c4b5fd" />
            </TT.Grid>
            <TT.ProgressBar value={head.progress} max={totalSeconds} color="#8b5cf6" label="Progress" />
          </TT.Section>
          {mfg.queue.length > 1 && (
            <TT.Section label="Backlog">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {mfg.queue.slice(1, 5).map((job, index) => (
                  <div key={`${job.recipeId}-${index}`} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 10 }}>
                    <span style={{ color: '#cbd5e1' }}>{MANUFACTURING_RECIPES[job.recipeId]?.name ?? job.recipeId}</span>
                    <span style={{ color: '#94a3b8', fontVariantNumeric: 'tabular-nums' }}>×{job.quantity}</span>
                  </div>
                ))}
              </div>
            </TT.Section>
          )}
        </>
      }
    />
  );
}

function ReprocessingChip() {
  const state = useGameStore(s => s.state);
  const repr = state.systems.reprocessing;

  if (!state.unlocks['system-reprocessing']) {
    return (
      <DataChip
        tone="slate"
        label="Reprocessing"
        value="Locked"
        meta="Train Reprocessing I"
        tooltip={<TT.Header title="Reprocessing" subtitle="Locked. Reprocessing I unlocks ore-to-mineral conversion." color="#94a3b8" />}
      />
    );
  }

  const head = repr.queue[0] ?? null;
  const autoTargetsEnabled = Object.values(repr.autoTargets ?? {}).filter(Boolean).length;
  const efficiency = getReprocessingEfficiency(state);

  if (!head) {
    return (
      <DataChip
        tone="emerald"
        label="Reprocessing"
        value="Idle"
        meta={`${autoTargetsEnabled} auto target${autoTargetsEnabled !== 1 ? 's' : ''}`}
        tooltip={
          <>
            <TT.Header title="Reprocessing" subtitle="Unlocked but currently idle." color="#34d399" />
            <TT.Section label="Snapshot">
              <TT.Grid>
                <ChipLine label="Queue length" value={repr.queue.length} valueColor="#6ee7b7" />
                <ChipLine label="Auto targets" value={autoTargetsEnabled} valueColor="#6ee7b7" />
                <ChipLine label="Yield multiplier" value={`x${efficiency.toFixed(2)}`} valueColor="#6ee7b7" />
              </TT.Grid>
            </TT.Section>
          </>
        }
      />
    );
  }

  const def = RESOURCE_REGISTRY[head.oreId];
  const remaining = Math.max(0, BATCH_TIME_SECONDS - head.progress);
  const progress = Math.min(100, (head.progress / BATCH_TIME_SECONDS) * 100);

  return (
    <DataChip
      tone="emerald"
      label="Reprocessing"
      value={fmtSeconds(remaining)}
      meta={`${def?.name ?? head.oreId} · ${repr.queue.length} batches · x${efficiency.toFixed(2)}`}
      progress={progress}
      tooltip={
        <>
          <TT.Header title="Reprocessing" subtitle="Batch conversion from ore into minerals." color="#34d399" />
          <TT.Section label="Active batch">
            <TT.Grid>
              <ChipLine label="Ore" value={def?.name ?? head.oreId} valueColor="#d1fae5" />
              <ChipLine label="Batch size" value={head.amount} valueColor="#6ee7b7" />
              <ChipLine label="ETA" value={fmtSeconds(remaining)} valueColor="#6ee7b7" />
              <ChipLine label="Yield multiplier" value={`x${efficiency.toFixed(2)}`} valueColor="#6ee7b7" />
            </TT.Grid>
            <TT.ProgressBar value={head.progress} max={BATCH_TIME_SECONDS} color="#34d399" label="Progress" />
          </TT.Section>
          <TT.Section label="Expected output">
            <div style={{ fontSize: 10, color: '#94a3b8', lineHeight: 1.45 }}>
              {getBatchYieldPreview(state, head.oreId)}
            </div>
          </TT.Section>
          {autoTargetsEnabled > 0 && (
            <TT.Section label="Automation">
              <div style={{ fontSize: 10, color: '#94a3b8' }}>
                {autoTargetsEnabled} ore target{autoTargetsEnabled !== 1 ? 's' : ''} currently feed the queue automatically.
              </div>
            </TT.Section>
          )}
        </>
      }
    />
  );
}

function CorpChip() {
  const state = useGameStore(s => s.state);
  const rates = useResourceRates();
  const totalShips = Object.keys(state.systems.fleet.ships).length;
  const totalFleets = Object.keys(state.systems.fleet.fleets).length;
  const skillsKnown = Object.values(state.systems.skills.levels).filter(level => level > 0).length;
  const highestSkill = Math.max(0, ...Object.values(state.systems.skills.levels));
  const homeStation = getHomeStationDefinition(state);
  const homeOutpost = getHomeOutpost(state);
  const hqBonus = getCorpHqBonusFromState(state);
  const oreFlow = Object.entries(rates)
    .filter(([id, rate]) => rate > 0 && RESOURCE_REGISTRY[id]?.category === 'ore')
    .reduce((sum, [, rate]) => sum + rate, 0);
  const mineralFlow = Object.entries(rates)
    .filter(([id, rate]) => rate > 0 && RESOURCE_REGISTRY[id]?.tier === 2)
    .reduce((sum, [, rate]) => sum + rate, 0);
  const hqName = homeOutpost?.name ?? homeStation?.name ?? 'No HQ';
  const tone: ChipTone = homeStation || homeOutpost ? 'cyan' : 'slate';

  return (
    <DataChip
      tone={tone}
      label="Corp"
      value={`${formatShortCount(totalShips)} ships`}
      meta={`${totalFleets} fleets · ${skillsKnown} skills · ${hqName}`}
      tooltip={
        <>
          <TT.Header title={state.corp.name} subtitle="High-level corp snapshot: assets, progression, throughput, and HQ context." color={CHIP_COLORS[tone].accent} />
          <TT.Section label="Assets">
            <TT.Grid>
              <ChipLine label="Fleets" value={totalFleets} valueColor="#67e8f9" />
              <ChipLine label="Ships" value={totalShips} valueColor="#67e8f9" />
              <ChipLine label="Skills known" value={skillsKnown} valueColor="#67e8f9" />
              <ChipLine label="Highest skill" value={highestSkill > 0 ? `Lv ${highestSkill}` : '—'} valueColor="#67e8f9" />
            </TT.Grid>
          </TT.Section>
          <TT.Section label="Economy pulse">
            <TT.Grid>
              <ChipLine label="Ore inflow" value={oreFlow > 0 ? `${oreFlow.toFixed(2)}/s` : 'idle'} valueColor={oreFlow > 0 ? '#34d399' : '#94a3b8'} />
              <ChipLine label="Mineral inflow" value={mineralFlow > 0 ? `${mineralFlow.toFixed(2)}/s` : 'idle'} valueColor={mineralFlow > 0 ? '#34d399' : '#94a3b8'} />
            </TT.Grid>
          </TT.Section>
          <TT.Section label="HQ">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 10 }}>
              <div style={{ color: '#cbd5e1' }}>{hqName}</div>
              {homeOutpost && <div style={{ color: '#94a3b8' }}>Player outpost · Level {homeOutpost.level}</div>}
              {homeStation && <div style={{ color: '#94a3b8' }}>Faction station · {homeStation.factionId}</div>}
              {hqBonus && <div style={{ color: '#67e8f9' }}>{hqBonus.description}</div>}
              {!homeStation && !homeOutpost && <div style={{ color: '#64748b' }}>No active Corp HQ bonus.</div>}
            </div>
          </TT.Section>
        </>
      }
    />
  );
}

export function ResourceBar() {
  const [, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="hud-bar px-3 sm:px-4 shrink-0" style={{ zIndex: 50 }}>
      <div className="hud-data-bar-shell py-2">
        <div className="hud-data-priority-group">
          <CreditsChip />
          <MiningChip />
        </div>
        <div className="hud-data-scroll-group">
          <FleetsChip />
          <TrainingChip />
          <ManufacturingChip />
          <ReprocessingChip />
          <CorpChip />
          <InventoryChip />
        </div>
      </div>
    </div>
  );
}