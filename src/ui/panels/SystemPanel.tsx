/**
 * SystemPanel — current star system orrery + mining controls.
 *
 * Shows:
 *  • An animated SVG orrery of the current system's celestial bodies
 *  • Selecting a body reveals its details on the right
 *  • Asteroid belt bodies expose per-ore richness and mining toggles
 *  • A warp-in-progress banner blocks mining toggle interaction
 */

import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { useGameStore } from '@/stores/gameStore';
import { useUiStore } from '@/stores/uiStore';
import { getSystemById } from '@/game/galaxy/galaxy.gen';
import { formatEta, getWarpProgress, warpEtaSeconds } from '@/game/galaxy/travel.logic';
import { getCurrentSystemBeltIds, getBeltRichness } from '@/game/systems/mining/mining.logic';
import { ORE_BELTS } from '@/game/systems/mining/mining.config';
import { RESOURCE_REGISTRY } from '@/game/resources/resourceRegistry';
import { getStationInSystem } from '@/game/systems/factions/faction.logic';
import { NavTag } from '@/ui/components/NavTag';
import { HULL_DEFINITIONS } from '@/game/systems/fleet/fleet.config';
import type { CelestialBody } from '@/types/galaxy.types';
import type { Anomaly, AnomalyType, PlayerFleet } from '@/types/game.types';

// ─── Constants ────────────────────────────────────────────────────────────────

/** Moon visual orbit radius around parent planet dot (px). */
const MOON_ORBIT_R = 28;
/** Moon orbit speed multiplier relative to its own orbitPeriod. */
const MOON_SPEED_MULT = 3.5;
/** Parking orbit ring for fleets, as fraction of available orrery radius. */
const FLEET_PARKING_FRAC = 0.28;

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

// ─── Orrery math helpers ──────────────────────────────────────────────────────

/** Stable per-body start angle via djb2 hash of the body id → [0, 2π]. */
function hashId(id: string): number {
  let h = 5381;
  for (let i = 0; i < id.length; i++) h = ((h << 5) + h) ^ id.charCodeAt(i);
  return (h >>> 0) / 0xffffffff * Math.PI * 2;
}

interface BodyScreenPos {
  sx: number;
  sy: number;
  isMoon: boolean;
}

/**
 * Compute the screen-space position of a celestial body at time `now` (ms).
 * Moons are detected by ID convention (body-${i}-moon) and orbit around their
 * parent's position, not around the star.
 */
function computeBodyScreenPos(
  body: CelestialBody,
  bodies: CelestialBody[],
  now: number,
  cx: number,
  cy: number,
  scale: number,
): BodyScreenPos {
  const moonMatch = body.id.match(/^(body-\d+)-moon$/);
  if (moonMatch) {
    const parentId = moonMatch[1];
    const parent = bodies.find(b => b.id === parentId);
    if (parent) {
      const parentPos = computeBodyScreenPos(parent, bodies, now, cx, cy, scale);
      const moonAngle =
        (now / (body.orbitPeriod * 1000 / MOON_SPEED_MULT)) * Math.PI * 2 + hashId(body.id);
      return {
        sx: parentPos.sx + Math.cos(moonAngle) * MOON_ORBIT_R,
        sy: parentPos.sy + Math.sin(moonAngle) * MOON_ORBIT_R,
        isMoon: true,
      };
    }
  }
  // Normal body — orbits the star
  const orbitR = body.orbitRadius * scale;
  const angle = (now / (body.orbitPeriod * 1000)) * Math.PI * 2 + hashId(body.id);
  return {
    sx: cx + Math.cos(angle) * orbitR,
    sy: cy + Math.sin(angle) * orbitR,
    isMoon: false,
  };
}

// ─── OrreryCanvas ─────────────────────────────────────────────────────────────

interface HitEntry { id: string; sx: number; sy: number; r: number; }
interface FleetHitEntry { id: string; sx: number; sy: number; }

function OrreryCanvas({
  bodies,
  starColor,
  starSize,
  selectedId,
  onSelect,
  fleets,
  systemId,
  pinnedFleetId,
  onFleetHover,
  onFleetLeave,
  onFleetClick,
}: {
  bodies: CelestialBody[];
  starColor: string;
  starSize: number;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  fleets: PlayerFleet[];
  systemId: string;
  pinnedFleetId: string | null;
  onFleetHover: (fleetId: string, x: number, y: number) => void;
  onFleetLeave: () => void;
  onFleetClick: (fleetId: string) => void;
}) {
  const canvasRef  = useRef<HTMLCanvasElement>(null);
  const wrapRef    = useRef<HTMLDivElement>(null);
  const rafId      = useRef<number>(0);
  const hovId      = useRef<string | null>(null);
  const hovFleetId = useRef<string | null>(null);
  const hitCache   = useRef<HitEntry[]>([]);
  const fleetHit   = useRef<FleetHitEntry[]>([]);
  const propsRef   = useRef({ bodies, starColor, starSize, selectedId, fleets, systemId, pinnedFleetId });
  propsRef.current = { bodies, starColor, starSize, selectedId, fleets, systemId, pinnedFleetId };

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const W   = canvas.width  / dpr;
    const H   = canvas.height / dpr;
    const cx  = W / 2;
    const cy  = H / 2;
    const now = performance.now();

    const { bodies, starColor, starSize, selectedId, fleets, systemId, pinnedFleetId } = propsRef.current;

    // Orbit scale: largest orbit fits within 42% of the shortest canvas dimension (leaves margin)
    const maxOrbit = Math.max(...bodies.map(b => b.orbitRadius), 100);
    const orreryR  = Math.min(W, H) * 0.42;
    const scale    = orreryR / maxOrbit;

    ctx.save();
    ctx.scale(dpr, dpr);

    // ── 1. Background ──────────────────────────────────────────────────────
    const bgGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(W, H) * 0.7);
    bgGrad.addColorStop(0,   '#090e22');
    bgGrad.addColorStop(1,   '#02040c');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, W, H);

    // ── 2. Seeded starfield dots ──────────────────────────────────────────
    const sysHash = hashId(systemId);
    for (let i = 0; i < 28; i++) {
      const ax    = hashId(systemId + i * 7)        * W;
      const ay    = hashId(systemId + i * 13 + 1)   * H;
      const aSize = i % 5 === 0 ? 0.9 : 0.45;
      const aAlpha = 0.15 + (sysHash * 0.1 + i * 0.02) % 0.25;
      ctx.globalAlpha = aAlpha;
      ctx.fillStyle   = '#e2e8f0';
      ctx.beginPath();
      ctx.arc(ax, ay, aSize, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // ── 3. Orbit rings + belt bands ───────────────────────────────────────
    const newHitCache: HitEntry[] = [];
    const nonMoonBodies = bodies.filter(b => !b.id.match(/^body-\d+-moon$/));

    for (const body of nonMoonBodies) {
      const orbitR = body.orbitRadius * scale;
      if (body.type === 'asteroid-belt') {
        // Belt: an arc band with two dashed strokes
        ctx.save();
        ctx.strokeStyle = body.color;
        ctx.lineWidth = 7;
        ctx.globalAlpha = 0.10;
        ctx.beginPath();
        ctx.arc(cx, cy, orbitR - 3, 0, Math.PI * 2);
        ctx.stroke();

        ctx.setLineDash([6, 4]);
        ctx.lineWidth = 2.5;
        ctx.globalAlpha = 0.20;
        ctx.beginPath();
        ctx.arc(cx, cy, orbitR, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.lineWidth = 1;
        ctx.globalAlpha = 0.07;
        ctx.beginPath();
        ctx.arc(cx, cy, orbitR + 4, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      } else {
        ctx.globalAlpha = 0.05;
        ctx.strokeStyle = 'rgba(255,255,255,1)';
        ctx.lineWidth   = 0.5;
        ctx.beginPath();
        ctx.arc(cx, cy, orbitR, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }

    // Moon mini-orbit rings (tiny dashed, centered on parent's live position)
    const moonBodies = bodies.filter(b => b.id.match(/^body-\d+-moon$/));
    for (const moon of moonBodies) {
      const parentMatch = moon.id.match(/^(body-\d+)-moon$/);
      if (!parentMatch) continue;
      const parent = bodies.find(b => b.id === parentMatch[1]);
      if (!parent || parent.type === 'asteroid-belt') continue;
      const { sx: px, sy: py } = computeBodyScreenPos(parent, bodies, now, cx, cy, scale);
      ctx.save();
      ctx.globalAlpha   = 0.12;
      ctx.strokeStyle   = moon.color;
      ctx.lineWidth     = 0.7;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.arc(px, py, MOON_ORBIT_R, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    }

    // ── 4. Fleet parking orbit ring ───────────────────────────────────────
    if (fleets.length > 0) {
      const parkR = Math.min(W, H) * FLEET_PARKING_FRAC;
      ctx.globalAlpha = 0.08;
      ctx.strokeStyle = '#22d3ee';
      ctx.lineWidth   = 0.6;
      ctx.setLineDash([4, 6]);
      ctx.beginPath();
      ctx.arc(cx, cy, parkR, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
    }

    // ── 5. Star glow + core ───────────────────────────────────────────────
    const glowR = starSize * 4.5;
    const glowGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, glowR);
    glowGrad.addColorStop(0,    starColor + 'cc');
    glowGrad.addColorStop(0.35, starColor + '55');
    glowGrad.addColorStop(1,    starColor + '00');
    ctx.fillStyle = glowGrad;
    ctx.beginPath();
    ctx.arc(cx, cy, glowR, 0, Math.PI * 2);
    ctx.fill();

    ctx.shadowBlur  = starSize * 2;
    ctx.shadowColor = starColor;
    ctx.fillStyle   = starColor;
    ctx.beginPath();
    ctx.arc(cx, cy, starSize / 1.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur  = 0;
    ctx.shadowColor = 'transparent';

    // ── 6. Bodies ─────────────────────────────────────────────────────────
    for (const body of bodies) {
      const isSelected = body.id === selectedId;
      const isHovered  = body.id === hovId.current;

      if (body.type === 'asteroid-belt') {
        // Belt click target: invisible band hit test
        const orbitR = body.orbitRadius * scale;
        const beltHitR = 10;
        // For asteroids, push a ring-shaped hit entry (we handle in hit test via distance-to-ring)
        // Approximate as circle hit test at the ring + broad tolerance
        // We'll add several hit points around the ring
        for (let a = 0; a < Math.PI * 2; a += 0.3) {
          newHitCache.push({
            id: body.id,
            sx: cx + Math.cos(a) * orbitR,
            sy: cy + Math.sin(a) * orbitR,
            r: beltHitR,
          });
        }
        // Hover ring: bright white dashed outline + inner glow band
        if (isHovered && !isSelected) {
          ctx.save();
          ctx.globalAlpha = 0.55;
          ctx.strokeStyle = 'rgba(255,255,255,0.7)';
          ctx.lineWidth   = 1.2;
          ctx.setLineDash([5, 3]);
          ctx.beginPath();
          ctx.arc(cx, cy, orbitR, 0, Math.PI * 2);
          ctx.stroke();
          ctx.setLineDash([]);
          // Inner glow band
          ctx.strokeStyle = body.color;
          ctx.lineWidth   = 5;
          ctx.globalAlpha = 0.18;
          ctx.beginPath();
          ctx.arc(cx, cy, orbitR - 3, 0, Math.PI * 2);
          ctx.stroke();
          ctx.restore();
        }
        if (isSelected) {
          ctx.save();
          ctx.globalAlpha  = 0.85;
          ctx.strokeStyle  = '#fbbf24';
          ctx.lineWidth    = 1.5;
          ctx.setLineDash([8, 4]);
          ctx.beginPath();
          ctx.arc(cx, cy, orbitR, 0, Math.PI * 2);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.restore();
        }
        continue;
      }

      const { sx, sy } = computeBodyScreenPos(body, bodies, now, cx, cy, scale);
      const bodyR      = Math.max(3, body.size / 2.8);

      // Glow halo
      const bodyGlow = ctx.createRadialGradient(sx, sy, 0, sx, sy, bodyR * 3.5);
      bodyGlow.addColorStop(0,   body.color + '55');
      bodyGlow.addColorStop(1,   body.color + '00');
      ctx.fillStyle = bodyGlow;
      ctx.beginPath();
      ctx.arc(sx, sy, bodyR * 3.5, 0, Math.PI * 2);
      ctx.fill();

      // Core dot
      ctx.fillStyle = body.color;
      ctx.beginPath();
      ctx.arc(sx, sy, bodyR, 0, Math.PI * 2);
      ctx.fill();

      // Highlight spec
      ctx.fillStyle   = 'rgba(255,255,255,0.35)';
      ctx.beginPath();
      ctx.arc(sx - bodyR * 0.28, sy - bodyR * 0.28, bodyR * 0.4, 0, Math.PI * 2);
      ctx.fill();

      // Selection ring
      if (isSelected) {
        ctx.strokeStyle = '#fbbf24';
        ctx.lineWidth   = 1.5;
        ctx.globalAlpha = 0.9;
        ctx.beginPath();
        ctx.arc(sx, sy, bodyR + 5, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 0.3;
        ctx.beginPath();
        ctx.arc(sx, sy, bodyR + 9, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }

      // Hover ring
      if (isHovered && !isSelected) {
        ctx.strokeStyle = 'rgba(255,255,255,0.55)';
        ctx.lineWidth   = 1;
        ctx.beginPath();
        ctx.arc(sx, sy, bodyR + 5, 0, Math.PI * 2);
        ctx.stroke();
      }

      newHitCache.push({ id: body.id, sx, sy, r: Math.max(bodyR + 8, 12) });
    }

    hitCache.current = newHitCache;

    // ── 7. Fleet dots on parking orbit ────────────────────────────────────
    const newFleetHit: FleetHitEntry[] = [];
    if (fleets.length > 0) {
      const parkR     = Math.min(W, H) * FLEET_PARKING_FRAC;
      const angleStep = (Math.PI * 2) / fleets.length;

      fleets.forEach((fleet, fi) => {
        const angle    = angleStep * fi + hashId(fleet.id);
        const fx       = cx + Math.cos(angle) * parkR;
        const fy       = cy + Math.sin(angle) * parkR;
        const pulse    = Math.sin(now / 300 + fi * 1.4) * 0.35 + 0.65;
        const isHovF    = hovFleetId.current === fleet.id;
        const isPinned  = pinnedFleetId === fleet.id;
        const isActive  = isHovF || isPinned;

        ctx.save();
        ctx.globalAlpha = isPinned ? 1.0 : pulse * (isHovF ? 1.0 : 0.75);

        // Pinned orbit ring
        if (isPinned) {
          ctx.globalAlpha = 0.9;
          ctx.strokeStyle = '#fbbf24';
          ctx.lineWidth   = 1.5;
          ctx.beginPath();
          ctx.arc(fx, fy, 14, 0, Math.PI * 2);
          ctx.stroke();
          ctx.globalAlpha = 0.25;
          ctx.strokeStyle = '#fbbf24';
          ctx.lineWidth   = 4;
          ctx.beginPath();
          ctx.arc(fx, fy, 17, 0, Math.PI * 2);
          ctx.stroke();
          ctx.globalAlpha = isPinned ? 1.0 : pulse;
        }

        // Scanning ripple rings — two expanding arcs that fade and loop
        if (fleet.isScanning) {
          const RIPPLE_MAX = 28;
          for (let ri = 0; ri < 2; ri++) {
            const phase  = ((now / 1200 + ri * 0.5) % 1);         // 0→1 per loop
            const rr     = 10 + phase * RIPPLE_MAX;                // radius grows 10→38
            const alpha  = (1 - phase) * 0.45;                    // fades out
            ctx.globalAlpha = alpha;
            ctx.strokeStyle = '#a78bfa';
            ctx.lineWidth   = 1.0;
            ctx.beginPath();
            ctx.arc(fx, fy, rr, 0, Math.PI * 2);
            ctx.stroke();
          }
          ctx.globalAlpha = isPinned ? 1.0 : pulse * (isHovF ? 1.0 : 0.75);
        }

        // Outer glow
        const fGlow = ctx.createRadialGradient(fx, fy, 0, fx, fy, 14);
        fGlow.addColorStop(0, fleet.isScanning ? 'rgba(167,139,250,0.5)' : 'rgba(34,211,238,0.22)');
        fGlow.addColorStop(1, 'rgba(34,211,238,0)');
        ctx.fillStyle = fGlow;
        ctx.beginPath();
        ctx.arc(fx, fy, 14, 0, Math.PI * 2);
        ctx.fill();

        // Diamond ◆
        ctx.fillStyle   = fleet.isScanning ? '#a78bfa' : '#0e7490';
        ctx.strokeStyle = fleet.isScanning ? '#a78bfa' : '#22d3ee';
        ctx.lineWidth   = 0.8;
        ctx.translate(fx, fy);
        ctx.rotate(Math.PI / 4);
        const ds = isActive ? 5.5 : 4;
        ctx.fillRect(-ds, -ds, ds * 2, ds * 2);
        ctx.strokeRect(-ds, -ds, ds * 2, ds * 2);
        ctx.rotate(-Math.PI / 4);

        // Label when hovered or pinned
        if (isActive) {
          ctx.globalAlpha  = 0.95;
          ctx.font         = '9px monospace';
          ctx.textAlign    = 'center';
          ctx.textBaseline = 'bottom';
          ctx.fillStyle    = isPinned ? '#fbbf24' : '#22d3ee';
          ctx.fillText(fleet.name, 0, -ds * Math.SQRT2 - 4);
        }

        ctx.restore();
        newFleetHit.push({ id: fleet.id, sx: fx, sy: fy });
      });
    }
    fleetHit.current = newFleetHit;

    ctx.restore();

    // Always schedule next frame — positions are time-dependent
    rafId.current = requestAnimationFrame(draw);
  }, []);

  // Start / stop RAF
  useEffect(() => {
    rafId.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafId.current);
  }, [draw]);

  // Resize observer — update canvas pixel dimensions on size change
  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const observer = new ResizeObserver(entries => {
      const entry = entries[0];
      if (!entry) return;
      const { width, height } = entry.contentRect;
      const canvas = canvasRef.current;
      if (!canvas) return;
      const dpr = window.devicePixelRatio || 1;
      canvas.width  = Math.round(width  * dpr);
      canvas.height = Math.round(height * dpr);
    });
    observer.observe(wrap);
    return () => observer.disconnect();
  }, []);

  // Mouse move: hit-test bodies and fleet dots
  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mx   = e.clientX - rect.left;
    const my   = e.clientY - rect.top;

    // Test bodies
    let newHov: string | null = null;
    for (const entry of hitCache.current) {
      const dx = mx - entry.sx, dy = my - entry.sy;
      if (dx * dx + dy * dy < entry.r * entry.r) { newHov = entry.id; break; }
    }
    hovId.current = newHov;

    // Update cursor: pointer when hovering a body/belt/fleet dot
    if (wrapRef.current) {
      const anyHit = newHov !== null || fleetHit.current.some(f => {
        const dx = mx - f.sx, dy = my - f.sy;
        return dx * dx + dy * dy < 14 * 14;
      });
      wrapRef.current.style.cursor = anyHit ? 'pointer' : 'crosshair';
    }

    // Test fleet dots
    let newHovFleet: string | null = null;
    for (const entry of fleetHit.current) {
      const dx = mx - entry.sx, dy = my - entry.sy;
      if (dx * dx + dy * dy < 14 * 14) { newHovFleet = entry.id; break; }
    }
    if (newHovFleet !== hovFleetId.current) {
      hovFleetId.current = newHovFleet;
      if (newHovFleet) {
        onFleetHover(newHovFleet, e.clientX, e.clientY);
      } else {
        onFleetLeave();
      }
    }
  }, [onFleetHover, onFleetLeave]);

  // Click: fleet dots first, then body selection
  const handleClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mx   = e.clientX - rect.left;
    const my   = e.clientY - rect.top;

    // Fleet dots take priority
    for (const entry of fleetHit.current) {
      const dx = mx - entry.sx, dy = my - entry.sy;
      if (dx * dx + dy * dy < 16 * 16) {
        onFleetClick(entry.id);
        return;
      }
    }

    // Otherwise toggle body selection
    let hitId: string | null = null;
    for (const entry of hitCache.current) {
      const dx = mx - entry.sx, dy = my - entry.sy;
      if (dx * dx + dy * dy < entry.r * entry.r) { hitId = entry.id; break; }
    }
    onSelect(hitId ?? null);
  }, [onSelect, onFleetClick]);

  return (
    <div
      ref={wrapRef}
      onMouseMove={handleMouseMove}
      onClick={handleClick}
      style={{ flex: 1, position: 'relative', cursor: 'crosshair', userSelect: 'none' }}
    >
      <canvas
        ref={canvasRef}
        style={{ display: 'block', width: '100%', height: '100%' }}
      />
    </div>
  );
}

// ─── Body detail panel ────────────────────────────────────────────────────────

function compositionInfo(type: string): { label: string; color: string } {
  switch (type) {
    case 'rocky':
    case 'barren':
    case 'lava-world':    return { label: 'Silicate & Iron', color: '#f87171' };
    case 'gas-giant':     return { label: 'Hydrogen & Helium', color: '#fbbf24' };
    case 'ice-giant':     return { label: 'Ice & Methane', color: '#67e8f9' };
    case 'water-world':   return { label: 'Surface Oceans', color: '#60a5fa' };
    case 'moon':          return { label: 'Regolith', color: '#94a3b8' };
    default:              return { label: 'Unknown', color: '#64748b' };
  }
}

function temperatureInfo(orbitFrac: number): { label: string; color: string } {
  if (orbitFrac < 0.20) return { label: 'Scorching', color: '#ef4444' };
  if (orbitFrac < 0.45) return { label: 'Warm',      color: '#f59e0b' };
  if (orbitFrac < 0.65) return { label: 'Temperate', color: '#4ade80' };
  return                        { label: 'Frozen',    color: '#67e8f9' };
}

function BodyDetail({ body, inWarp, maxOrbit }: { body: CelestialBody; inWarp: boolean; maxOrbit: number }) {
  const state      = useGameStore(s => s.state);
  const toggleBelt = useGameStore(s => s.toggleMiningBelt);

  const comp = compositionInfo(body.type);
  const temp = temperatureInfo(body.orbitRadius / Math.max(maxOrbit, 1));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div>
        <div style={{ fontSize: 12, fontWeight: 700, color: '#f8fafc', marginBottom: 3 }}>{body.name}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 9, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            {bodyTypeLabel(body.type)}
          </span>
          {body.type !== 'asteroid-belt' && (
            <>
              <span style={{
                fontSize: 8, padding: '1px 5px', borderRadius: 3,
                color: comp.color, background: comp.color + '18',
                border: `1px solid ${comp.color}40`,
              }}>
                {comp.label}
              </span>
              <span style={{
                fontSize: 8, padding: '1px 5px', borderRadius: 3,
                color: temp.color, background: temp.color + '18',
                border: `1px solid ${temp.color}40`,
              }}>
                {temp.label}
              </span>
            </>
          )}
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
        body.type !== 'asteroid-belt' ? null : (
          <div style={{ fontSize: 9, color: '#334155', padding: '8px 0' }}>
            No minable resources
          </div>
        )
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
  const state           = useGameStore(s => s.state);
  const dockAction      = useGameStore(s => s.dockAtStation);
  const undockAction    = useGameStore(s => s.undockFromStation);
  const setHomeStation  = useGameStore(s => s.setHomeStation);
  // galaxy is guaranteed non-null here (checked by wrapper)
  const galaxy    = state.galaxy!;

  const focusTarget = useUiStore(s => s.focusTarget);
  const clearFocus  = useUiStore(s => s.clearFocus);

  // Ref to the orrery wrapper so we can compute tooltip position on focus navigation
  const orreryWrapRef = useRef<HTMLDivElement>(null);

  const [viewingSystemId, setViewingSystemId] = useState<string>(galaxy.currentSystemId);

  // Fleet tooltip state (declared early so focusTarget effect can pin)
  const [hovFleetId, setHovFleetId] = useState<string | null>(null);
  const [pinnedFleetId, setPinnedFleetId] = useState<string | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const setFleetScanning = useGameStore(s => s.setFleetScanning);

  // Sync viewing system when player warps to a new system
  useEffect(() => {
    setViewingSystemId(galaxy.currentSystemId);
  }, [galaxy.currentSystemId]);

  // Navigate to a system when a NavTag points here
  useEffect(() => {
    if (focusTarget?.entityType === 'system') {
      setViewingSystemId(focusTarget.entityId);
      clearFocus();
    } else if (focusTarget?.entityType === 'fleet') {
      // Navigate to the fleet's current system and auto-pin it
      const fleets     = Object.values(state.systems.fleet.fleets);
      const fleet      = fleets.find(f => f.id === focusTarget.entityId);
      if (fleet) {
        setViewingSystemId(fleet.currentSystemId);
        setPinnedFleetId(fleet.id);
        // Compute expected canvas parking-orbit position for the tooltip
        const wrap = orreryWrapRef.current;
        if (wrap) {
          const rect     = wrap.getBoundingClientRect();
          const cx       = rect.left + rect.width  / 2;
          const cy       = rect.top  + rect.height / 2;
          const parkR    = Math.min(rect.width, rect.height) * FLEET_PARKING_FRAC;
          // Use the same stable angle as the canvas (hashId + angleStep)
          const fleetIds = fleets
            .filter(f => f.currentSystemId === fleet.currentSystemId && f.shipIds.length > 0)
            .map(f => f.id);
          const fi       = fleetIds.indexOf(fleet.id);
          const angle    = (Math.PI * 2 / Math.max(fleetIds.length, 1)) * fi + hashId(fleet.id);
          setTooltipPos({
            x: cx + Math.cos(angle) * parkR,
            y: cy + Math.sin(angle) * parkR,
          });
        }
      }
      clearFocus();
    }
  }, [focusTarget, clearFocus, state.systems.fleet.fleets]);

  const system    = useMemo(
    () => getSystemById(galaxy.seed, viewingSystemId),
    [galaxy.seed, viewingSystemId],
  );
  const isBrowsing = viewingSystemId !== galaxy.currentSystemId;

  const [selectedBodyId, setSelectedBodyId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'orrery' | 'anomalies'>('orrery');

  const selectedBody = useMemo(
    () => system.bodies.find(b => b.id === selectedBodyId) ?? null,
    [system.bodies, selectedBodyId],
  );

  const maxOrbit = useMemo(
    () => Math.max(...system.bodies.map(b => b.orbitRadius), 100),
    [system.bodies],
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

  // Station in current system
  const systemIndex = system.id === 'home' ? 0 : parseInt(system.id.replace('sys-', ''), 10);
  const stationDef  = useMemo(
    () => getStationInSystem(system, galaxy.seed, systemIndex),
    [system, galaxy.seed, systemIndex],
  );
  const dockedStationId    = state.systems.factions.dockedStationId;
  const homeStationSystemId = state.systems.factions.homeStationSystemId;
  const isHqSystem          = homeStationSystemId === system.id;
  const isDocked            = !!dockedStationId && stationDef?.id === dockedStationId;
  const canDockHere         = !!stationDef && !isDocked && !inWarp;
  const rep                 = stationDef ? (state.systems.factions.rep[stationDef.factionId] ?? 0) : 0;
  const canAffordDock       = rep >= (stationDef?.minRepToDock ?? -1000);

  // Local fleets in this system
  const localFleets = Object.values(state.systems.fleet.fleets).filter(
    f => f.currentSystemId === system.id && f.shipIds.length > 0,
  );

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: '100%', minHeight: 480,
      background: 'rgba(2, 4, 14, 0.97)',
      // browsing banner injects at top
      border: '1px solid rgba(22,30,52,0.8)',
      borderRadius: 8,
      overflow: 'hidden',
    }}>
      {/* ── Browsing banner (shown when viewing a non-current system) ── */}
      {isBrowsing && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '5px 16px', flexShrink: 0,
          background: 'rgba(251,191,36,0.08)', borderBottom: '1px solid rgba(251,191,36,0.2)',
        }}>
          <span style={{ fontSize: 10, color: '#fbbf24' }}>
            👁 Browsing <strong>{system.name}</strong> — not your current location
          </span>
          <button
            onClick={() => setViewingSystemId(galaxy.currentSystemId)}
            style={{
              fontSize: 9, padding: '2px 8px', borderRadius: 4, cursor: 'pointer',
              border: '1px solid rgba(251,191,36,0.4)', color: '#fbbf24',
              background: 'rgba(120,70,0,0.2)',
            }}
          >
            Return to current system
          </button>
        </div>
      )}
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
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
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
          {/* Corp HQ badge / set button */}
          {stationDef && (
            isHqSystem ? (
              <span style={{
                fontSize: 9, fontWeight: 700, padding: '3px 10px', borderRadius: 4,
                border: '1px solid rgba(251,191,36,0.5)', color: '#fbbf24',
                background: 'rgba(120,70,0,0.2)',
              }}>
                ⭡ Corp HQ
              </span>
            ) : (
              <button
                onClick={() => { if (stationDef) setHomeStation(stationDef.id, system.id); }}
                style={{
                  fontSize: 9, fontWeight: 700, padding: '3px 10px', borderRadius: 4, cursor: 'pointer',
                  border: '1px solid rgba(251,191,36,0.25)', color: '#a08020',
                  background: 'transparent',
                }}
                title={`Set ${stationDef.name} as Corp HQ`}
              >
                ⭡ Set Corp HQ
              </button>
            )
          )}
          {/* Dock / Undock */}
          {stationDef && (
            isDocked ? (
              <button
                onClick={() => undockAction()}
                style={{
                  fontSize: 9, fontWeight: 700, padding: '3px 10px', borderRadius: 4, cursor: 'pointer',
                  border: '1px solid rgba(251,191,36,0.4)', color: '#fbbf24',
                  background: 'rgba(120,70,0,0.25)',
                }}
              >
                ⬡ {stationDef.name} · Undock
              </button>
            ) : (
              <button
                disabled={!canAffordDock}
                onClick={() => { if (stationDef) dockAction(stationDef.id); }}
                style={{
                  fontSize: 9, fontWeight: 700, padding: '3px 10px', borderRadius: 4,
                  cursor: canAffordDock ? 'pointer' : 'not-allowed',
                  border: `1px solid ${canAffordDock ? 'rgba(34,211,238,0.35)' : 'rgba(55,65,81,0.4)'}`,
                  color: canAffordDock ? '#22d3ee' : '#374151',
                  background: canAffordDock ? 'rgba(8,51,68,0.25)' : 'transparent',
                  opacity: inWarp ? 0.4 : 1,
                }}
                title={!canAffordDock ? `Rep too low to dock (${rep} / ${stationDef.minRepToDock} needed)` : `Dock at ${stationDef.name}`}
              >
                ⬡ {stationDef.name} · Dock
              </button>
            )
          )}
        </div>
      </div>

      {/* ── Fleets in system ── */}
      {localFleets.length > 0 && (
        <div style={{
          padding: '6px 16px',
          borderBottom: '1px solid rgba(22,30,52,0.6)',
          display: 'flex', gap: 8, flexWrap: 'wrap', flexShrink: 0,
          background: 'rgba(3,5,16,0.4)',
        }}>
          <span style={{ fontSize: 8, color: '#334155', textTransform: 'uppercase', letterSpacing: '0.08em', alignSelf: 'center' }}>
            Fleets here:
          </span>
          {localFleets.map(fleet => (
            <span key={fleet.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#22d3ee', flexShrink: 0 }} />
              <NavTag entityType="fleet" entityId={fleet.id} label={fleet.name} />
            </span>
          ))}
        </div>
      )}

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
        {/* Canvas orrery — fills available space */}
        <div ref={orreryWrapRef} style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
          <OrreryCanvas
            bodies={system.bodies}
            starColor={system.starColor}
            starSize={system.starSize}
            selectedId={selectedBodyId}
            onSelect={id => {
              setSelectedBodyId(prev => (id === null || prev === id) ? null : id);
              setPinnedFleetId(null);
            }}
            fleets={localFleets}
            systemId={system.id}
            pinnedFleetId={pinnedFleetId}
            onFleetHover={(fleetId, x, y) => {
              setHovFleetId(fleetId);
              setTooltipPos({ x, y });
            }}
            onFleetLeave={() => setHovFleetId(null)}
            onFleetClick={fleetId => {
              setPinnedFleetId(prev => prev === fleetId ? null : fleetId);
              setSelectedBodyId(null);
            }}
          />

          {/* Fleet tooltip — hover preview or pinned detail card */}
          {(hovFleetId || pinnedFleetId) && (() => {
            const activeId = pinnedFleetId ?? hovFleetId;
            const fleet = localFleets.find(f => f.id === activeId);
            if (!fleet) return null;
            const isPinned   = !!pinnedFleetId;
            const ships      = fleet.shipIds.map(id => state.systems.fleet.ships[id]).filter(Boolean);

            return (
              <div
                style={{
                  position: 'fixed',
                  left: tooltipPos.x + 16,
                  top: tooltipPos.y - 10,
                  zIndex: 9999,
                  width: isPinned ? 220 : 168,
                  padding: isPinned ? '10px 12px' : '8px 10px',
                  borderRadius: 7,
                  background: 'rgba(4,8,24,0.97)',
                  border: isPinned ? '1px solid rgba(251,191,36,0.4)' : '1px solid rgba(34,211,238,0.35)',
                  boxShadow: isPinned
                    ? '0 0 20px rgba(251,191,36,0.10)'
                    : '0 0 14px rgba(34,211,238,0.10)',
                  pointerEvents: isPinned ? 'auto' : 'none',
                  display: 'flex', flexDirection: 'column', gap: 6,
                }}
              >
                {/* Header row */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{
                    width: 7, height: 7, borderRadius: 1, flexShrink: 0,
                    background: fleet.isScanning ? '#22d3ee' : '#0e7490',
                    transform: 'rotate(45deg)',
                    boxShadow: fleet.isScanning ? '0 0 5px #22d3ee' : 'none',
                  }} />
                  <span style={{ flex: 1, fontSize: 11, fontWeight: 700, color: isPinned ? '#fbbf24' : '#22d3ee' }}>
                    {fleet.name}
                  </span>
                  {isPinned && (
                    <button
                      onClick={() => setPinnedFleetId(null)}
                      style={{
                        width: 16, height: 16, borderRadius: 3, flexShrink: 0,
                        border: '1px solid rgba(251,191,36,0.3)',
                        background: 'rgba(120,70,0,0.2)',
                        color: '#fbbf24', fontSize: 9, cursor: 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        padding: 0, lineHeight: 1,
                      }}
                    >✕</button>
                  )}
                </div>

                {/* Status row */}
                <div style={{ fontSize: 9, color: '#475569' }}>
                  {ships.length} ship{ships.length !== 1 ? 's' : ''}
                  <span style={{ color: fleet.isScanning ? '#22d3ee' : '#334155', marginLeft: 6 }}>
                    ● {fleet.isScanning ? 'Scanning' : 'Idle'}
                  </span>
                </div>

                {isPinned && (
                  <>
                    {/* Ship list */}
                    {ships.length > 0 && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 3, borderTop: '1px solid rgba(22,30,52,0.6)', paddingTop: 6 }}>
                        {ships.map(ship => {
                          const hull = HULL_DEFINITIONS[ship.shipDefinitionId];
                          return (
                            <div key={ship.id} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                              <span style={{
                                width: 5, height: 5, borderRadius: '50%', flexShrink: 0,
                                background: ship.hullDamage > 50 ? '#f87171' : ship.hullDamage > 20 ? '#fbbf24' : '#4ade80',
                              }} />
                              <span style={{ flex: 1, fontSize: 9, color: '#94a3b8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {ship.customName ?? hull?.name ?? ship.shipDefinitionId}
                              </span>
                              {ship.hullDamage > 0 && (
                                <span style={{ fontSize: 8, color: '#f87171', fontFamily: 'monospace' }}>
                                  {ship.hullDamage.toFixed(0)}% dmg
                                </span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Actions */}
                    <div style={{ display: 'flex', gap: 5, borderTop: '1px solid rgba(22,30,52,0.6)', paddingTop: 6 }}>
                      <button
                        onClick={() => setFleetScanning(fleet.id, !fleet.isScanning)}
                        style={{
                          flex: 1, padding: '3px 0', borderRadius: 3, cursor: 'pointer', fontSize: 8, fontWeight: 700,
                          border: fleet.isScanning ? '1px solid rgba(248,113,113,0.4)' : '1px solid rgba(34,211,238,0.35)',
                          color: fleet.isScanning ? '#f87171' : '#22d3ee',
                          background: fleet.isScanning ? 'rgba(127,29,29,0.2)' : 'rgba(8,51,68,0.25)',
                        }}
                      >
                        {fleet.isScanning ? '◼ Stop Scan' : '◉ Scan'}
                      </button>
                      <NavTag entityType="fleet" entityId={fleet.id} label="Open" />
                    </div>
                  </>
                )}

                {!isPinned && (
                  <div style={{
                    fontSize: 8, color: '#22d3ee50',
                    borderTop: '1px solid rgba(22,30,52,0.5)', paddingTop: 4,
                    letterSpacing: '0.07em', textTransform: 'uppercase',
                  }}>
                    Click to pin
                  </div>
                )}
              </div>
            );
          })()}
        </div>

        {/* Detail sidebar */}
        <div style={{
          width: 230, borderLeft: '1px solid rgba(22,30,52,0.8)',
          padding: '12px 12px', display: 'flex', flexDirection: 'column', gap: 10,
          background: 'rgba(3,5,16,0.95)', overflowY: 'auto', flexShrink: 0,
        }}>
          {/* Body list — moons grouped under parents */}
          <div>
            <div style={{ fontSize: 8, color: '#334155', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 4 }}>
              Celestial Bodies
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {(() => {
                // Build moon → parentId lookup
                const moonParent = new Map<string, string>();
                system.bodies.forEach(b => {
                  const m = b.id.match(/^(body-\d+)-moon$/);
                  if (m) moonParent.set(b.id, m[1]);
                });
                const topLevel = system.bodies.filter(b => !moonParent.has(b.id));

                const renderBodyRow = (body: CelestialBody, indent: boolean) => {
                  const isSel  = body.id === selectedBodyId;
                  const isBelt = body.type === 'asteroid-belt';
                  const hasActiveBelts = isBelt && body.beltIds.some(id => state.systems.mining.targets[id]);

                  return (
                    <div
                      key={body.id}
                      onClick={() => setSelectedBodyId(prev => prev === body.id ? null : body.id)}
                      style={{
                        paddingLeft: indent ? 18 : 8,
                        paddingRight: 8, paddingTop: 4, paddingBottom: 4,
                        borderRadius: 4, cursor: 'pointer',
                        display: 'flex', alignItems: 'center', gap: 7,
                        border: isSel ? '1px solid rgba(251,191,36,0.3)' : '1px solid transparent',
                        background: isSel ? 'rgba(120,80,0,0.15)' : 'rgba(6,9,20,0.3)',
                        transition: 'all 0.1s',
                      }}
                    >
                      {indent && (
                        <span style={{ fontSize: 8, color: '#334155', flexShrink: 0, marginRight: -3 }}>↳</span>
                      )}
                      <span style={{
                        width: indent ? 5 : 7,
                        height: indent ? 5 : 7,
                        borderRadius: isBelt ? 0 : '50%',
                        background: body.color, flexShrink: 0,
                        border: isBelt ? `2px solid ${body.color}` : 'none',
                      }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{
                          fontSize: indent ? 8 : 9,
                          color: isSel ? '#fbbf24' : indent ? '#64748b' : '#94a3b8',
                          fontWeight: isSel ? 700 : 400,
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        }}>
                          {body.name}
                        </div>
                        {!indent && (
                          <div style={{ fontSize: 8, color: '#334155' }}>{bodyTypeLabel(body.type)}</div>
                        )}
                      </div>
                      {hasActiveBelts && (
                        <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#22d3ee', flexShrink: 0 }} />
                      )}
                    </div>
                  );
                };

                return topLevel.map(body => {
                  const moonId = body.id + '-moon';
                  const moon   = system.bodies.find(b => b.id === moonId);
                  return (
                    <div key={body.id}>
                      {renderBodyRow(body, false)}
                      {moon && renderBodyRow(moon, true)}
                    </div>
                  );
                });
              })()}
            </div>
          </div>

          {/* Selected body detail */}
          {selectedBody ? (
            <div style={{ borderTop: '1px solid rgba(22,30,52,0.5)', paddingTop: 10 }}>
              <BodyDetail body={selectedBody} inWarp={inWarp} maxOrbit={maxOrbit} />
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
