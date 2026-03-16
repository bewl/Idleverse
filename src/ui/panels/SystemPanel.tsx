/**
 * SystemPanel — current star system orrery + mining controls.
 *
 * Shows:
 *  • An animated SVG orrery of the current system's celestial bodies
 *  • Selecting a body reveals its details on the right
 *  • Asteroid belt bodies expose per-ore richness and mining toggles
 *  • A warp-in-progress banner blocks mining toggle interaction
 */

import { useState, useMemo } from 'react';
import { useGameStore } from '@/stores/gameStore';
import { getSystemById } from '@/game/galaxy/galaxy.gen';
import { formatEta, getWarpProgress, warpEtaSeconds } from '@/game/galaxy/travel.logic';
import { getCurrentSystemBeltIds, getBeltRichness } from '@/game/systems/mining/mining.logic';
import { ORE_BELTS } from '@/game/systems/mining/mining.config';
import { RESOURCE_REGISTRY } from '@/game/resources/resourceRegistry';
import type { CelestialBody } from '@/types/galaxy.types';
import type { Anomaly, AnomalyType } from '@/types/game.types';

// ─── Constants ────────────────────────────────────────────────────────────────

/** Orrery drawing radius — bodies orbit within this pixel radius. */
const ORRERY_R = 160;
const SVG_W = 400;
const SVG_H = 360;
const CX = SVG_W / 2; // orrery center X
const CY = SVG_H / 2; // orrery center Y

/** Orbit animation speedup (visual only — orbits are 10× faster than real period). */
const ORBIT_SPEED = 0.1;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function secColor(security: string) {
  if (security === 'highsec') return '#4ade80';
  if (security === 'lowsec')  return '#fb923c';
  return '#f87171';
}

function secLabel(security: string) {
  if (security === 'highsec') return 'High-Sec';
  if (security === 'lowsec')  return 'Low-Sec';
  return 'Null-Sec';
}

function richnessColor(r: number) {
  if (r >= 1.4) return '#22d3ee'; // rich — cyan
  if (r >= 1.0) return '#4ade80'; // good — green
  if (r >= 0.7) return '#fbbf24'; // fair — amber
  return '#f87171';               // poor — red
}

function richnessLabel(r: number) {
  if (r >= 1.4) return 'Rich';
  if (r >= 1.0) return 'Good';
  if (r >= 0.7) return 'Fair';
  return 'Sparse';
}

function bodyTypeLabel(type: string) {
  const labels: Record<string, string> = {
    'rocky':         'Rocky Planet',
    'barren':        'Barren Planet',
    'gas-giant':     'Gas Giant',
    'ice-giant':     'Ice Giant',
    'asteroid-belt': 'Asteroid Belt',
    'moon':          'Moon',
    'water-world':   'Water World',
    'lava-world':    'Lava World',
  };
  return labels[type] ?? type;
}

// ─── Orrery ───────────────────────────────────────────────────────────────────

function Orrery({
  bodies,
  starColor,
  starSize,
  selectedId,
  onSelect,
}: {
  bodies: CelestialBody[];
  starColor: string;
  starSize: number;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  // Scale orbits to fit within ORRERY_R
  const maxOrbit = Math.max(...bodies.map(b => b.orbitRadius), 100);
  const scale    = ORRERY_R / maxOrbit;

  return (
    <svg
      width={SVG_W} height={SVG_H}
      viewBox={`0 0 ${SVG_W} ${SVG_H}`}
      style={{ display: 'block' }}
    >
      <defs>
        <style>{`
          @keyframes orrery-orbit {
            from { transform: rotate(0deg); }
            to   { transform: rotate(360deg); }
          }
        `}</style>
        <radialGradient id="star-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0%"   stopColor={starColor} stopOpacity="0.35" />
          <stop offset="100%" stopColor={starColor} stopOpacity="0" />
        </radialGradient>
        <radialGradient id="orrery-bg" cx="50%" cy="50%" r="50%">
          <stop offset="0%"   stopColor="#0a0f28" stopOpacity="1" />
          <stop offset="100%" stopColor="#03050e" stopOpacity="1" />
        </radialGradient>
      </defs>

      {/* Background */}
      <rect width={SVG_W} height={SVG_H} fill="url(#orrery-bg)" />

      {/* Starfield dots */}
      {[1,2,3,4,5,6,7,8,9,10,11,12].map(i => (
        <circle
          key={i}
          cx={(i * 97 + 23) % SVG_W}
          cy={(i * 61 + 17) % SVG_H}
          r={i % 4 === 0 ? 0.8 : 0.4}
          fill="rgba(255,255,255,0.3)"
        />
      ))}

      <g transform={`translate(${CX}, ${CY})`}>
        {/* Orbit rings */}
        {bodies.map(body => {
          const r = body.orbitRadius * scale;
          if (body.type === 'asteroid-belt') {
            // For belts: draw a band (two concentric circles)
            return (
              <g key={`ring-${body.id}`}>
                <circle r={r - 4} fill="none" stroke={body.color} strokeWidth={8} opacity={0.12} />
                <circle r={r}     fill="none" stroke={body.color} strokeWidth={3} opacity={0.22} strokeDasharray="6,4" />
                <circle r={r + 4} fill="none" stroke={body.color} strokeWidth={1} opacity={0.08} />
              </g>
            );
          }
          return (
            <circle
              key={`ring-${body.id}`}
              r={r}
              fill="none"
              stroke="rgba(255,255,255,0.06)"
              strokeWidth={0.5}
            />
          );
        })}

        {/* Star glow */}
        <circle r={starSize * 3.5} fill="url(#star-glow)" />

        {/* Star */}
        <circle
          r={starSize / 1.5}
          fill={starColor}
          style={{ filter: `drop-shadow(0 0 ${starSize / 2}px ${starColor})` }}
        />

        {/* Orbiting bodies */}
        {bodies.map(body => {
          const r       = body.orbitRadius * scale;
          const isSelected = body.id === selectedId;

          if (body.type === 'asteroid-belt') {
            // Belt: represented by a click-target ring (no orbit animation)
            return (
              <g key={body.id}>
                <circle
                  r={r}
                  fill="none"
                  stroke="transparent"
                  strokeWidth={16}
                  style={{ cursor: 'pointer' }}
                  onClick={() => onSelect(body.id)}
                />
                {isSelected && (
                  <circle
                    r={r}
                    fill="none"
                    stroke="#fbbf24"
                    strokeWidth={1.5}
                    strokeDasharray="8,4"
                    opacity={0.8}
                  />
                )}
              </g>
            );
          }

          // Orbiting planet
          const period = Math.max(2, body.orbitPeriod * ORBIT_SPEED);
          const bodyR  = Math.max(3, body.size / 2.8);

          return (
            <g
              key={body.id}
              style={{
                animation:       `orrery-orbit ${period}s linear infinite`,
                transformOrigin: '0px 0px',
              }}
            >
              {/* Hit region */}
              <circle
                cx={r} cy={0}
                r={Math.max(bodyR + 5, 10)}
                fill="transparent"
                style={{ cursor: 'pointer' }}
                onClick={() => onSelect(body.id)}
              />
              {/* Body dot */}
              <circle
                cx={r} cy={0}
                r={bodyR}
                fill={body.color}
                style={{ filter: `drop-shadow(0 0 2px ${body.color}80)` }}
              />
              {/* Selection ring */}
              {isSelected && (
                <circle
                  cx={r} cy={0}
                  r={bodyR + 4}
                  fill="none"
                  stroke="#fbbf24"
                  strokeWidth={1.2}
                />
              )}
            </g>
          );
        })}
      </g>
    </svg>
  );
}

// ─── Body detail panel ────────────────────────────────────────────────────────

function BodyDetail({ body, inWarp }: { body: CelestialBody; inWarp: boolean }) {
  const state      = useGameStore(s => s.state);
  const toggleBelt = useGameStore(s => s.toggleMiningBelt);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div>
        <div style={{ fontSize: 12, fontWeight: 700, color: '#f8fafc', marginBottom: 2 }}>{body.name}</div>
        <div style={{ fontSize: 9, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          {bodyTypeLabel(body.type)}
        </div>
      </div>

      {body.type === 'asteroid-belt' && body.beltIds.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ fontSize: 8, color: '#334155', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
            Ore Deposits
          </div>
          {body.beltIds.map(beltId => {
            const def       = ORE_BELTS[beltId];
            if (!def) return null;
            const richness  = getBeltRichness(state, beltId);
            const isActive  = state.systems.mining.targets[beltId] ?? false;
            const respawnAt = state.systems.mining.beltRespawnAt[beltId] ?? 0;
            const isDepleted = respawnAt > 0 && state.lastUpdatedAt < respawnAt;
            const resNames  = def.outputs.map(o => RESOURCE_REGISTRY[o.resourceId]?.name ?? o.resourceId).join(', ');

            return (
              <div
                key={beltId}
                style={{
                  padding: '7px 9px',
                  borderRadius: 5,
                  border: isActive ? '1px solid rgba(34,211,238,0.3)' : '1px solid rgba(22,30,52,0.6)',
                  background: isActive ? 'rgba(8,51,68,0.3)' : 'rgba(6,9,20,0.5)',
                  display: 'flex', flexDirection: 'column', gap: 4,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 10, fontWeight: 600, color: '#cbd5e1' }}>{def.name}</span>
                  <span style={{
                    fontSize: 8, fontFamily: 'monospace', fontWeight: 700, letterSpacing: '0.05em',
                    padding: '1px 5px', borderRadius: 3,
                    color: richnessColor(richness),
                    border: `1px solid ${richnessColor(richness)}40`,
                    background: `${richnessColor(richness)}15`,
                  }}>
                    {richnessLabel(richness)} ×{richness.toFixed(2)}
                  </span>
                </div>
                <div style={{ fontSize: 9, color: '#475569' }}>{resNames}</div>
                <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }}>
                  {def.outputs.map(o => {
                    const effectiveRate = (o.baseRate * richness).toFixed(2);
                    return (
                      <span key={o.resourceId} style={{
                        fontSize: 9, fontFamily: 'monospace',
                        padding: '1px 5px', borderRadius: 3,
                        background: 'rgba(34,211,238,0.08)',
                        color: '#22d3ee80',
                        border: '1px solid rgba(34,211,238,0.12)',
                      }}>
                        +{effectiveRate}/s
                      </span>
                    );
                  })}
                  <button
                    disabled={inWarp || isDepleted}
                    onClick={() => toggleBelt(beltId)}
                    style={{
                      marginLeft: 'auto',
                      padding: '2px 8px', fontSize: 9, fontWeight: 700,
                      border: isDepleted ? '1px solid rgba(30,41,59,0.5)'
                        : isActive ? '1px solid rgba(248,113,113,0.4)' : '1px solid rgba(34,211,238,0.3)',
                      borderRadius: 3,
                      background: isDepleted ? 'rgba(15,23,42,0.3)'
                        : isActive ? 'rgba(127,29,29,0.2)' : 'rgba(8,51,68,0.3)',
                      color: isDepleted ? '#334155'
                        : isActive ? '#f87171' : '#22d3ee',
                      cursor: (inWarp || isDepleted) ? 'not-allowed' : 'pointer',
                      opacity: inWarp ? 0.5 : 1,
                    }}
                  >
                    {isDepleted ? 'Depleted' : isActive ? 'Stop' : 'Mine'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div style={{ fontSize: 9, color: '#334155', padding: '8px 0' }}>
          No minable resources
        </div>
      )}

      {/* Body stats */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 2 }}>
        {[
          { label: 'Orbit', value: `${body.orbitRadius} AU` },
          ...(body.type !== 'asteroid-belt' ? [{ label: 'Period', value: `${body.orbitPeriod}s` }] : []),
          { label: 'Size',  value: `${body.size}` },
        ].map(s => (
          <div key={s.label} style={{
            padding: '3px 7px', borderRadius: 4,
            border: '1px solid rgba(22,30,52,0.6)',
            background: 'rgba(6,9,20,0.5)',
          }}>
            <span style={{ fontSize: 8, color: '#334155', display: 'block' }}>{s.label}</span>
            <span style={{ fontSize: 9, fontFamily: 'monospace', color: '#64748b' }}>{s.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Anomaly helpers ──────────────────────────────────────────────────────────

function anomalyTypeColor(type: AnomalyType): string {
  switch (type) {
    case 'ore-pocket':   return '#22d3ee';
    case 'data-site':    return '#818cf8';
    case 'relic-site':   return '#f59e0b';
    case 'combat-site':  return '#f87171';
    case 'wormhole':     return '#a78bfa';
  }
}

function anomalyTypeLabel(type: AnomalyType): string {
  switch (type) {
    case 'ore-pocket':  return 'Ore Pocket';
    case 'data-site':   return 'Data Site';
    case 'relic-site':  return 'Relic Site';
    case 'combat-site': return 'Combat Site';
    case 'wormhole':    return 'Wormhole';
  }
}

function anomalyTypeIcon(type: AnomalyType): string {
  switch (type) {
    case 'ore-pocket':  return '◆';
    case 'data-site':   return '⬡';
    case 'relic-site':  return '⧖';
    case 'combat-site': return '☩';
    case 'wormhole':    return '⊕';
  }
}

function AnomalyCard({
  anomaly,
  canLootData,
  canLootRelic,
  fleetIdInSystem,
}: {
  anomaly: Anomaly;
  canLootData: boolean;
  canLootRelic: boolean;
  fleetIdInSystem: string | null;
}) {
  const lootSite        = useGameStore(s => s.lootSite);
  const activateOrePocket = useGameStore(s => s.activateOrePocket);

  const col = anomalyTypeColor(anomaly.type);

  const canLoot =
    (anomaly.type === 'data-site'  && canLootData)  ||
    (anomaly.type === 'relic-site' && canLootRelic);
  const canActivate = anomaly.type === 'ore-pocket';

  return (
    <div style={{
      padding: '8px 10px', borderRadius: 5,
      border: `1px solid ${col}25`,
      background: `${col}08`,
      display: 'flex', flexDirection: 'column', gap: 5,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
        <span style={{ color: col, fontSize: 10 }}>{anomalyTypeIcon(anomaly.type)}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          {anomaly.revealed ? (
            <div style={{ fontSize: 10, fontWeight: 700, color: col, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {anomaly.name}
            </div>
          ) : (
            <div style={{ fontSize: 10, color: '#475569', fontStyle: 'italic' }}>Unknown Signal</div>
          )}
          <div style={{ fontSize: 8, color: '#475569', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
            {anomaly.revealed ? anomalyTypeLabel(anomaly.type) : `Sig ${anomaly.signatureRadius.toFixed(0)} AU`}
          </div>
        </div>
        {anomaly.depleted && (
          <span style={{ fontSize: 8, color: '#374151', padding: '1px 5px', border: '1px solid #1f2937', borderRadius: 3 }}>
            depleted
          </span>
        )}
      </div>

      {/* Scan progress bar */}
      {!anomaly.revealed && !anomaly.depleted && (
        <div>
          <div style={{ fontSize: 8, color: '#475569', marginBottom: 2 }}>
            Scan progress — {anomaly.scanProgress.toFixed(0)}%
          </div>
          <div style={{ height: 3, background: 'rgba(30,41,59,0.6)', borderRadius: 3, overflow: 'hidden' }}>
            <div style={{
              height: '100%', borderRadius: 3,
              background: 'linear-gradient(90deg, #0e7490, #22d3ee)',
              width: `${anomaly.scanProgress}%`, transition: 'width 0.5s',
            }} />
          </div>
        </div>
      )}

      {/* Wormhole destination */}
      {anomaly.revealed && anomaly.type === 'wormhole' && anomaly.linkedSystemId && (
        <div style={{ fontSize: 8, color: '#7c3aed', fontFamily: 'monospace' }}>
          → {anomaly.linkedSystemId} · mass {((anomaly.massRemaining ?? 0) / 1000).toFixed(1)}kt
        </div>
      )}

      {/* Action buttons — only when fleet is present */}
      {anomaly.revealed && !anomaly.depleted && fleetIdInSystem && (
        <div style={{ display: 'flex', gap: 5, marginTop: 2 }}>
          {canActivate && (
            <button
              onClick={() => activateOrePocket(fleetIdInSystem, anomaly.id)}
              style={{
                flex: 1, padding: '3px 0', borderRadius: 3, cursor: 'pointer', fontSize: 8,
                border: '1px solid rgba(34,211,238,0.4)', color: '#22d3ee',
                background: 'rgba(8,51,68,0.25)',
              }}
            >
              Activate
            </button>
          )}
          {(anomaly.type === 'data-site' || anomaly.type === 'relic-site') && (
            <button
              onClick={() => canLoot ? lootSite(fleetIdInSystem, anomaly.id) : undefined}
              disabled={!canLoot}
              style={{
                flex: 1, padding: '3px 0', borderRadius: 3, cursor: canLoot ? 'pointer' : 'default', fontSize: 8,
                border: canLoot ? '1px solid rgba(129,140,248,0.4)' : '1px solid rgba(55,65,81,0.5)',
                color: canLoot ? '#818cf8' : '#374151',
                background: canLoot ? 'rgba(29,30,80,0.25)' : 'transparent',
              }}
            >
              {canLoot ? 'Loot Site' : (anomaly.type === 'data-site' ? 'Need Hacking' : 'Need Archaeology')}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function AnomaliesTab({ systemId }: { systemId: string }) {
  const state           = useGameStore(s => s.state);
  const setFleetScanning = useGameStore(s => s.setFleetScanning);

  const anomalies: Anomaly[]  = state.galaxy?.anomalies?.[systemId] ?? [];
  const canLootData   = !!state.unlocks['loot-data-sites'];
  const canLootRelic  = !!state.unlocks['loot-relic-sites'];
  const hasExploration = !!state.unlocks['system-exploration'];

  // Find all player fleets in this system
  const localFleets = Object.values(state.systems.fleet.fleets).filter(
    f => f.currentSystemId === systemId && f.shipIds.length > 0,
  );
  // First fleet in system for action buttons
  const primaryFleetId = localFleets[0]?.id ?? null;

  return (
    <div style={{ display: 'flex', flex: 1, flexDirection: 'column', overflow: 'hidden' }}>
      {/* Fleet scanning controls */}
      {localFleets.length > 0 && (
        <div style={{
          padding: '8px 12px',
          borderBottom: '1px solid rgba(22,30,52,0.6)',
          flexShrink: 0,
        }}>
          <div style={{ fontSize: 8, color: '#334155', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 5 }}>
            Fleet Scanners
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {localFleets.map(fleet => (
              <div key={fleet.id} style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '5px 8px', borderRadius: 4,
                border: fleet.isScanning ? '1px solid rgba(34,211,238,0.3)' : '1px solid rgba(22,30,52,0.5)',
                background: fleet.isScanning ? 'rgba(8,51,68,0.2)' : 'rgba(6,9,20,0.3)',
                cursor: 'pointer',
              }}
                onClick={() => setFleetScanning(fleet.id, !fleet.isScanning)}
              >
                <span style={{
                  width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
                  background: fleet.isScanning ? '#22d3ee' : '#1e293b',
                  boxShadow: fleet.isScanning ? '0 0 4px #22d3ee' : 'none',
                }} />
                <span style={{ flex: 1, fontSize: 10, color: fleet.isScanning ? '#22d3ee' : '#475569' }}>
                  {fleet.name}
                </span>
                <span style={{
                  fontSize: 8, color: fleet.isScanning ? '#22d3ee' : '#374151',
                  letterSpacing: '0.08em', textTransform: 'uppercase',
                }}>
                  {fleet.isScanning ? 'scanning' : 'idle'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Anomaly list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
        {!hasExploration ? (
          <div style={{
            padding: '16px 12px', fontSize: 9, color: '#334155',
            textAlign: 'center', lineHeight: 1.6,
          }}>
            Exploration locked.<br />
            Train <span style={{ color: '#818cf8' }}>Astrometrics I</span> to begin scanning anomalies.
          </div>
        ) : anomalies.length === 0 ? (
          <div style={{
            padding: '16px 12px', fontSize: 9, color: '#334155',
            textAlign: 'center', lineHeight: 1.6,
          }}>
            No anomalies detected.<br />
            Deploy a fleet and enable scanning to reveal signatures.
          </div>
        ) : (
          anomalies.map(anomaly => (
            <AnomalyCard
              key={anomaly.id}
              anomaly={anomaly}
              canLootData={canLootData}
              canLootRelic={canLootRelic}
              fleetIdInSystem={primaryFleetId}
            />
          ))
        )}
      </div>
    </div>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────

/** Inner panel — only rendered when galaxy state is confirmed present. */
function SystemPanelInner() {
  const state     = useGameStore(s => s.state);
  // galaxy is guaranteed non-null here (checked by wrapper)
  const galaxy    = state.galaxy!;
  const system    = useMemo(
    () => getSystemById(galaxy.seed, galaxy.currentSystemId),
    [galaxy.seed, galaxy.currentSystemId],
  );

  const [selectedBodyId, setSelectedBodyId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'orrery' | 'anomalies'>('orrery');

  const selectedBody = useMemo(
    () => system.bodies.find(b => b.id === selectedBodyId) ?? null,
    [system.bodies, selectedBodyId],
  );

  const warp          = galaxy.warp;
  const inWarp        = !!warp;
  const warpProgress  = warp ? getWarpProgress(warp, Date.now()) : 0;
  const warpEta       = warp ? warpEtaSeconds(warp, Date.now()) : 0;

  // Available belt count for this system
  const systemBeltIds = getCurrentSystemBeltIds(state);
  const activeBeltCount = systemBeltIds.filter(id => state.systems.mining.targets[id]).length;

  // Anomaly badge for the tab
  const systemAnomalies: Anomaly[] = galaxy.anomalies?.[system.id] ?? [];
  const revealedCount = systemAnomalies.filter(a => a.revealed && !a.depleted).length;

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: '100%', minHeight: 480,
      background: 'rgba(2, 4, 14, 0.97)',
      border: '1px solid rgba(22,30,52,0.8)',
      borderRadius: 8,
      overflow: 'hidden',
    }}>
      {/* ── Header ── */}
      <div style={{
        padding: '10px 16px', borderBottom: '1px solid rgba(22,30,52,0.8)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0,
      }}>
        <div>
          <span style={{ fontSize: 13, fontWeight: 700, color: '#ffe47a', letterSpacing: '0.1em' }}>
            ✦ {system.name}
          </span>
          <span style={{
            marginLeft: 8, fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
            padding: '2px 6px', borderRadius: 3,
            color: secColor(system.security),
            border: `1px solid ${secColor(system.security)}40`,
            background: `${secColor(system.security)}15`,
          }}>
            {secLabel(system.security)}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <span style={{ fontSize: 9, color: '#334155' }}>
            {system.starType}-type · {system.bodies.length} bodies · {systemBeltIds.length} ore belts
          </span>
          {activeBeltCount > 0 && (
            <span style={{
              fontSize: 9, fontFamily: 'monospace',
              padding: '2px 7px', borderRadius: 3,
              color: '#22d3ee', border: '1px solid rgba(34,211,238,0.3)',
              background: 'rgba(8,51,68,0.25)',
            }}>
              {activeBeltCount} mining
            </span>
          )}
        </div>
      </div>

      {/* ── Tab bar ── */}
      <div style={{
        display: 'flex', borderBottom: '1px solid rgba(22,30,52,0.8)', flexShrink: 0,
        background: 'rgba(3,5,16,0.5)',
      }}>
        {(['orrery', 'anomalies'] as const).map(tab => {
          const isActive = activeTab === tab;
          return (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                padding: '6px 14px', fontSize: 9, cursor: 'pointer',
                fontWeight: isActive ? 700 : 400, letterSpacing: '0.08em', textTransform: 'uppercase',
                color: isActive ? '#ffe47a' : '#334155',
                borderTop: 'none', borderLeft: 'none', borderRight: 'none',
                borderBottom: isActive ? '2px solid #ffe47a' : '2px solid transparent',
                background: 'transparent',
                display: 'flex', alignItems: 'center', gap: 5,
              }}
            >
              {tab === 'orrery' ? 'Orrery' : 'Anomalies'}
              {tab === 'anomalies' && revealedCount > 0 && (
                <span style={{
                  fontSize: 8, padding: '0px 4px', borderRadius: 8,
                  background: 'rgba(168,85,247,0.25)', color: '#a855f7',
                  border: '1px solid rgba(168,85,247,0.3)',
                }}>
                  {revealedCount}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ── Warp banner ── */}
      {inWarp && warp && (
        <div style={{
          padding: '7px 16px', background: 'rgba(30,10,60,0.6)',
          borderBottom: '1px solid rgba(168,85,247,0.25)',
          display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0,
        }}>
          <span style={{ fontSize: 10, color: '#a855f7', fontWeight: 700 }}>⊛ In Warp</span>
          <div style={{ flex: 1, background: 'rgba(15,5,30,0.8)', borderRadius: 3, height: 4, overflow: 'hidden' }}>
            <div style={{
              height: '100%', borderRadius: 3,
              background: 'linear-gradient(90deg, #7c3aed, #a855f7)',
              width: `${warpProgress * 100}%`, transition: 'width 0.25s',
            }} />
          </div>
          <span style={{ fontSize: 9, color: '#6d28d9', fontFamily: 'monospace', flexShrink: 0 }}>
            ETA {formatEta(warpEta)}
          </span>
          <span style={{ fontSize: 9, color: '#374151' }}>Mining suspended</span>
        </div>
      )}

      {/* ── Anomalies tab ── */}
      {activeTab === 'anomalies' && (
        <AnomaliesTab systemId={system.id} />
      )}

      {/* ── Orrery tab: orrery + detail ── */}
      {activeTab === 'orrery' && (
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Orrery */}
        <div
          style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}
          onClick={e => { if (e.target === e.currentTarget) setSelectedBodyId(null); }}
        >
          <Orrery
            bodies={system.bodies}
            starColor={system.starColor}
            starSize={system.starSize}
            selectedId={selectedBodyId}
            onSelect={id => setSelectedBodyId(prev => prev === id ? null : id)}
          />
        </div>

        {/* Detail sidebar */}
        <div style={{
          width: 230, borderLeft: '1px solid rgba(22,30,52,0.8)',
          padding: '12px 12px', display: 'flex', flexDirection: 'column', gap: 10,
          background: 'rgba(3,5,16,0.95)', overflowY: 'auto', flexShrink: 0,
        }}>
          {/* Body list */}
          <div>
            <div style={{ fontSize: 8, color: '#334155', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 4 }}>
              Celestial Bodies
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {system.bodies.map(body => {
                const isSel  = body.id === selectedBodyId;
                const isBelt = body.type === 'asteroid-belt';
                const hasActiveBelts = isBelt && body.beltIds.some(id => state.systems.mining.targets[id]);

                return (
                  <div
                    key={body.id}
                    onClick={() => setSelectedBodyId(prev => prev === body.id ? null : body.id)}
                    style={{
                      padding: '5px 8px', borderRadius: 4, cursor: 'pointer',
                      display: 'flex', alignItems: 'center', gap: 7,
                      border: isSel ? '1px solid rgba(251,191,36,0.3)' : '1px solid transparent',
                      background: isSel ? 'rgba(120,80,0,0.15)' : 'rgba(6,9,20,0.3)',
                      transition: 'all 0.1s',
                    }}
                  >
                    <span style={{
                      width: 7, height: 7, borderRadius: isBelt ? 0 : '50%',
                      background: body.color, flexShrink: 0,
                      border: isBelt ? `2px solid ${body.color}` : 'none',
                      outline: isBelt ? `2px solid transparent` : 'none',
                    }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 9, color: isSel ? '#fbbf24' : '#94a3b8', fontWeight: isSel ? 700 : 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {body.name}
                      </div>
                      <div style={{ fontSize: 8, color: '#334155' }}>{bodyTypeLabel(body.type)}</div>
                    </div>
                    {hasActiveBelts && (
                      <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#22d3ee', flexShrink: 0 }} />
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Selected body detail */}
          {selectedBody ? (
            <div style={{ borderTop: '1px solid rgba(22,30,52,0.5)', paddingTop: 10 }}>
              <BodyDetail body={selectedBody} inWarp={inWarp} />
            </div>
          ) : (
            <div style={{ fontSize: 9, color: '#1e293b', textAlign: 'center', padding: '12px 0', lineHeight: 1.4 }}>
              Click a body in the orrery or list to view details
            </div>
          )}

          {/* No belts in system message */}
          {systemBeltIds.length === 0 && (
            <div style={{
              marginTop: 'auto', padding: '8px 10px', borderRadius: 5,
              border: '1px solid rgba(239,68,68,0.2)',
              background: 'rgba(127,29,29,0.1)',
              fontSize: 9, color: '#6b2424', lineHeight: 1.4,
            }}>
              No asteroid belts detected in this system. Travel to another system to mine.
            </div>
          )}
        </div>
      </div>
      )}
    </div>
  );
}

/** Exported wrapper — guards against undefined galaxy on old saves. */
export function SystemPanel() {
  const hasGalaxy = useGameStore(s => !!s.state.galaxy);
  if (!hasGalaxy) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200, color: '#334155', fontSize: 11 }}>
        Loading system data…
      </div>
    );
  }
  return <SystemPanelInner />;
}
