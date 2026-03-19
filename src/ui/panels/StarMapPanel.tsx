/**
 * StarMapPanel — three-tier galactic navigation system.
 *
 * Zoom levels:
 *   1. GALAXY VIEW  — 8×8 sector grid, Z-slice navigation, sector heat-map
 *   2. SECTOR VIEW  — isometric 3D star chart for one sector, jump-range
 *                     highlighting, route display, scale bar
 *
 * Features: search, multi-axis filtering, BFS route planner, scale bar,
 * jump-range highlighting, system intel panel.
 */

import { useState, useRef, useCallback, useEffect, useMemo, forwardRef, useImperativeHandle } from 'react';
import { useGameStore } from '@/stores/gameStore';
import { getAliveNpcGroupsInSystem } from '@/game/systems/combat/combat.logic';
import { GameDropdown, type DropdownOption } from '@/ui/components/GameDropdown';
import { NavTag } from '@/ui/components/NavTag';
import { useUiStore } from '@/stores/uiStore';
import { useResponsiveViewport } from '@/ui/hooks/useResponsiveViewport';
import {
  generateGalaxy, getSystemById, systemDistance,
  SECTOR_GRID_SIZE, sectorId, systemSector, buildSectors,
  GALAXY_WIDTH_LY,
} from '@/game/galaxy/galaxy.gen';
import { warpEtaSeconds, formatEta, getWarpProgress, calcWarpDuration } from '@/game/galaxy/travel.logic';
import { getFleetTransitWarpMultiplier } from '@/game/systems/fleet/fleet.logic';
import { findRoute, getReachableSystems, unitsToLy } from '@/game/galaxy/route.logic';
import { HULL_DEFINITIONS } from '@/game/systems/fleet/fleet.config';
import { FACTION_DEFINITIONS } from '@/game/systems/factions/faction.config';
import { getLocalPrice } from '@/game/systems/market/market.logic';
import { RESOURCE_REGISTRY } from '@/game/resources/resourceRegistry';
import { getTutorialFleetTravelContext, isTutorialStepCurrent } from '@/game/progression/tutorialSequence';
import type { StarSystem, GalacticSector, WarpState } from '@/types/galaxy.types';
import type { StarType, SystemSecurity } from '@/types/galaxy.types';
import type { ShipInstance, FleetActivity, PlayerFleet } from '@/types/game.types';
import type { RouteSecurityFilter } from '@/types/faction.types';

// ─── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_JUMP_RANGE_LY = 15;
const Z_SLICE_HALF_THICKNESS = 0.12;   // ±12% = 24% Z-depth window
const ISO_SCALE   = 200;               // isometric pixels per galaxy unit
const ELEV_SCALE  = 80;               // screen px per Z unit
const SECTOR_SVG_W = 800;
const SECTOR_SVG_H = 560;
const ISO_CX = SECTOR_SVG_W / 2;
const ISO_CY = 280;
const MAP_TRANSIT_REDRAW_MS = 180;
const MAP_WARP_REDRAW_MS = 180;

// ─── Types ────────────────────────────────────────────────────────────────────

interface MapFilters {
  highsec: boolean;
  lowsec:  boolean;
  nullsec: boolean;
  onlyVisited: boolean;
  onlyWithBelts: boolean;
  hasNullOres: boolean;
  showLabels: boolean;
}

interface ActiveRoute {
  fromId: string;
  toId:   string;
  path:   string[];
  hops:   number;
  totalLy: number;
  /** Security tier of the destination system for each hop leg. */
  legSecurity: SystemSecurity[];
  /** Ordered list of sector coords the route passes through. */
  sectorPath: Array<{ gx: number; gy: number }>;
}

interface HoverPreview {
  systemId: string;
  x: number;
  y: number;
}

interface RouteDispatchFeedback {
  tone: 'success' | 'error';
  text: string;
}

type DestinationSortMode = 'distance-asc' | 'name' | 'security' | 'belts' | 'threat';
type DestinationSecurityFilter = 'all' | SystemSecurity;
type DestinationThreatFilter = 'all' | 'quiet' | 'hostile';

type OverlayMode = 'default' | 'resource' | 'fleet' | 'faction';

type SectorArchetype = 'core' | 'border' | 'frontier' | 'null-zone' | 'mining-hub' | 'expanse';

const ARCHETYPE_META: Record<SectorArchetype, { label: string; icon: string; color: string }> = {
  core:          { label: 'Core',      icon: '◈', color: '#38bdf8' },
  border:        { label: 'Border',    icon: '◇', color: '#94a3b8' },
  frontier:      { label: 'Frontier',  icon: '·', color: '#4a5568' },
  'null-zone':   { label: 'Null Zone', icon: '▲', color: '#f87171' },
  'mining-hub':  { label: 'Mining',    icon: '⬡', color: '#fb923c' },
  expanse:       { label: 'Expanse',   icon: '·', color: '#1e293b' },
};

function computeArchetype(
  stats: { count: number; nullCount: number; lowCount: number; beltCount: number } | undefined,
): SectorArchetype {
  if (!stats || stats.count === 0) return 'expanse';
  const { count, nullCount, lowCount, beltCount } = stats;
  const highCount   = count - nullCount - lowCount;
  const nullFrac    = nullCount / count;
  const highFrac    = highCount / count;
  const beltDensity = beltCount / count;
  if (nullFrac > 0.6)                    return 'null-zone';
  if (beltDensity > 1.2 && nullFrac > 0) return 'mining-hub';
  if (highFrac > 0.7 && count >= 3)      return 'core';
  if (count <= 1)                        return 'frontier';
  return 'border';
}

const ACTIVITY_ICON: Partial<Record<FleetActivity, string>> = {
  mining: '⛏', hauling: '▶',
};
// suppress unused-variable lint for ACTIVITY_ICON (used in future tooltip)
void ACTIVITY_ICON;

interface DrawerSheetProps {
  title: string;
  eyebrow?: string;
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function secColor(s: SystemSecurity | string) {
  if (s === 'highsec') return '#4ade80';
  if (s === 'lowsec')  return '#fb923c';
  return '#f87171';
}

function secLabel(s: SystemSecurity | string) {
  if (s === 'highsec') return 'High-Sec';
  if (s === 'lowsec')  return 'Low-Sec';
  return 'Null-Sec';
}

function starTypeGlyph(t: StarType) {
  const m: Partial<Record<StarType, string>> = {
    'black-hole': '◈', neutron: '◉', 'white-dwarf': '○',
    O: '★', B: '★', A: '☆', F: '☆', G: '·', K: '·', M: '·',
  };
  return m[t] ?? '·';
}

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

function boundsOverlap(
  a: { left: number; top: number; right: number; bottom: number },
  b: { left: number; top: number; right: number; bottom: number },
) {
  return !(a.right < b.left || a.left > b.right || a.bottom < b.top || a.top > b.bottom);
}

/**
 * Isometric projection: maps (nx, ny, nz) within a sector to SVG screen coords.
 * nx, ny ∈ [0,1] (normalised within sector), nz = raw galaxy Z [0,1].
 */
function isoProject(nx: number, ny: number, nz: number) {
  const angle = Math.PI / 6; // 30°
  const sx = ISO_CX + (nx - ny) * Math.cos(angle) * ISO_SCALE;
  const sy = ISO_CY + (nx + ny) * Math.sin(angle) * ISO_SCALE - (nz - 0.5) * ELEV_SCALE;
  const fy = ISO_CY + (nx + ny) * Math.sin(angle) * ISO_SCALE; // floor Y (nz = 0.5)
  return { sx, sy, fy };
}

/** Build the filter-test function for a system given the current filters. */
function makeSystemFilter(
  filters: MapFilters,
  searchQuery: string,
  visitedSystems: Record<string, boolean>,
) {
  const q = searchQuery.trim().toLowerCase();
  return (sys: StarSystem): boolean => {
    if (!filters.highsec && sys.security === 'highsec') return false;
    if (!filters.lowsec  && sys.security === 'lowsec')  return false;
    if (!filters.nullsec && sys.security === 'nullsec') return false;
    if (filters.onlyVisited && !visitedSystems[sys.id]) return false;
    if (filters.onlyWithBelts && !sys.bodies.some(b => b.type === 'asteroid-belt')) return false;
    if (filters.hasNullOres && !sys.bodies.some(b =>
      b.beltIds.some(id => id === 'belt-arkonite' || id === 'belt-crokitite'),
    )) return false;
    if (q && !sys.name.toLowerCase().includes(q)) return false;
    return true;
  };
}

function buildSystemLookup(allSystems: StarSystem[]): Map<string, StarSystem> {
  return new Map(allSystems.map(system => [system.id, system]));
}

function buildActiveRouteFromPath(systemById: Map<string, StarSystem>, path: string[]): ActiveRoute | null {
  if (path.length < 2) return null;

  const seen = new Set<string>();
  const sectorPath: Array<{ gx: number; gy: number }> = [];
  const legSecurity: SystemSecurity[] = [];
  let totalLy = 0;

  for (let index = 0; index < path.length; index += 1) {
    const system = systemById.get(path[index]);
    if (!system) return null;

    const sector = systemSector(system);
    const sectorKey = sectorId(sector.gx, sector.gy);
    if (!seen.has(sectorKey)) {
      seen.add(sectorKey);
      sectorPath.push(sector);
    }

    if (index === 0) continue;
    const previousSystem = systemById.get(path[index - 1]);
    if (!previousSystem) return null;
    legSecurity.push(system.security);
    totalLy += unitsToLy(systemDistance(previousSystem, system));
  }

  return {
    fromId: path[0],
    toId: path[path.length - 1],
    path,
    hops: path.length - 1,
    totalLy,
    legSecurity,
    sectorPath,
  };
}

// ─── Scale Bar ────────────────────────────────────────────────────────────────

function ScaleBar({ pxPerUnit, baseLY = 25 }: { pxPerUnit: number; baseLY?: number }) {
  const candidates = [5, 10, 15, 20, 25, 50];
  let chosenLY = baseLY;
  for (const c of candidates) {
    const px = (c / GALAXY_WIDTH_LY) * pxPerUnit;
    if (px >= 40 && px <= 180) { chosenLY = c; break; }
  }
  const barPx = (chosenLY / GALAXY_WIDTH_LY) * pxPerUnit;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <div style={{ position: 'relative', height: 12 }}>
        <div style={{ position: 'absolute', bottom: 0, left: 0, width: barPx, height: 2, background: '#475569' }} />
        <div style={{ position: 'absolute', bottom: 0, left: 0, width: 1, height: 6, background: '#475569' }} />
        <div style={{ position: 'absolute', bottom: 0, left: barPx - 1, width: 1, height: 6, background: '#475569' }} />
      </div>
      <span style={{ fontSize: 9, color: '#475569', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
        {chosenLY} LY
      </span>
    </div>
  );
}

// ─── 3D Galaxy Star Map ───────────────────────────────────────────────────────
//
// Elite Dangerous-style orbit camera with perspective projection.
// Controls: left-drag orbit · shift+drag / middle-drag pan · scroll zoom · dbl reset
//
// Coordinate mapping — game [0,1] → world LY:
//   worldX = (sys.x - 0.5) * G3_XZ      (galaxy-plane horizontal)
//   worldY = (sys.z - 0.5) * G3_Y       (galactic elevation, thin disc)
//   worldZ = (sys.y - 0.5) * G3_XZ      (galaxy-plane depth)

const G3_XZ = 200;   // galaxy plane full extent (LY)
const G3_Y  = 50;    // galactic disc thickness  (LY)

/** Per-type glow colour */
const STAR_COL: Record<string, string> = {
  O: '#9bb0ff', B: '#aabfff', A: '#cad7ff', F: '#f8f7ff',
  G: '#fff4e8', K: '#ffd2a1', M: '#ffb071',
  neutron: '#44ffff', 'black-hole': '#cc44ff', 'white-dwarf': '#dde8ff',
};

interface BgStar3D { wx: number; wy: number; wz: number; r: number; a: number; ci: number; }

/** 3 500 procedural galaxy-disc stars — purely visual, not interactive */
const BG_STARS_3D = ((): BgStar3D[] => {
  const COLS = [
    '#9bb0ff','#aabfff','#cad7ff','#f8f7ff',
    '#ffffff','#ffffff','#ffffff','#fffce8','#ffd2a1','#ffb071',
  ];
  const out: BgStar3D[] = [];
  for (let i = 0; i < 3500; i++) {
    const h1 = ((i * 1664525  + 1013904223) ^ (i * 0x9e3779b9)) >>> 0;
    const h2 = ((h1 * 22695477 + 1)         ^ (i * 0x6c62272e)) >>> 0;
    const h3 = ((h2 * 0x12345678 + i)       ^ (h1 * 0x87654321)) >>> 0;
    // Exponential radial distribution — dense galactic core, extended disc
    const u     = (h1 & 0xFFFF) / 65535;
    const angle = ((h2 & 0xFFFF) / 65535) * Math.PI * 2;
    const rad   = -Math.log(1 - u * 0.97) * 62;           // 0 → ~400 LY
    const discH = 14 + (rad > 80 ? (rad - 80) * 0.05 : 0);
    out.push({
      wx: Math.cos(angle) * rad,
      wy: ((h3 & 0xFFFF) / 65535 - 0.5) * 2 * discH,
      wz: Math.sin(angle) * rad,
      r:  i % 80 === 0 ? 1.8 : i % 22 === 0 ? 1.1 : 0.55,
      a:  0.06 + ((h3 >>> 16) & 0xFF) / 255 * Math.max(0.06, 0.28 - rad * 0.0008),
      ci: (h2 >>> 24) % COLS.length,
    });
  }
  return out;
})();

interface NebBlob { wx: number; wy: number; wz: number; r: number; rgb: [number,number,number]; a: number; }
/** Nebula regions — large atmospheric blobs in 3D world space */
const NEBULAS_3D: NebBlob[] = [
  { wx:  -30, wy:  4, wz: -20, r:  95, rgb: [ 55, 12,140], a: 0.14 },
  { wx:   50, wy: -3, wz:  35, r:  85, rgb: [ 10, 28,120], a: 0.11 },
  { wx:  -55, wy:  7, wz:  65, r:  78, rgb: [115,  8, 48], a: 0.10 },
  { wx:   25, wy:  0, wz: -75, r:  90, rgb: [  8, 40, 95], a: 0.11 },
  { wx:    0, wy:  0, wz:   0, r: 158, rgb: [ 18, 18, 85], a: 0.07 },  // core glow
  { wx:  -85, wy: -5, wz: -40, r:  65, rgb: [ 50, 50,140], a: 0.09 },
  { wx:   70, wy:  2, wz: -55, r:  75, rgb: [ 90, 10, 70], a: 0.08 },
  { wx:   10, wy:  3, wz:  90, r:  80, rgb: [ 12, 60,100], a: 0.09 },
];

const BG_COLS_3D = [
  '#9bb0ff','#aabfff','#cad7ff','#f8f7ff',
  '#ffffff','#ffffff','#ffffff','#fffce8','#ffd2a1','#ffb071',
];

const CAM3_DEFAULT = { theta: 0.50, phi: 1.12, dist: 360, tx: 0, ty: 0, tz: 0 };

/** Game system coords → 3D world-space position [wx, wy, wz] */
function sysToWorld(sys: StarSystem): [number, number, number] {
  return [(sys.x - 0.5) * G3_XZ, (sys.z - 0.5) * G3_Y, (sys.y - 0.5) * G3_XZ];
}

/** Build perspective projection + camera basis from spherical cam params */
function buildCam3(
  theta: number, phi: number, dist: number,
  tx: number, ty: number, tz: number,
  W: number, H: number,
) {
  const sph = Math.sin(phi), cph = Math.cos(phi);
  const sth = Math.sin(theta), cth = Math.cos(theta);
  const camX = tx + dist * sph * sth;
  const camY = ty + dist * cph;
  const camZ = tz + dist * sph * cth;
  // forward = normalize(target − camera)
  const fx = tx - camX, fy = ty - camY, fz = tz - camZ;
  const fl = Math.sqrt(fx*fx + fy*fy + fz*fz) || 1;
  const fwX = fx/fl, fwY = fy/fl, fwZ = fz/fl;
  // right = normalize( cross(worldUp=(0,1,0), forward) )
  let rX = fwZ, rZ = -fwX;
  const rl = Math.sqrt(rX*rX + rZ*rZ) || 1;
  rX /= rl; rZ /= rl;
  // up = cross(forward, right)
  const uX = fwY * rZ, uY = fwZ * rX - fwX * rZ, uZ = -fwY * rX;
  const focalLen = Math.min(W, H) * 0.82;
  const project = (wx: number, wy: number, wz: number) => {
    const dx = wx - camX, dy = wy - camY, dz = wz - camZ;
    const pcx = dx * rX + dz * rZ;
    const pcy = dx * uX + dy * uY + dz * uZ;
    const pcz = dx * fwX + dy * fwY + dz * fwZ;
    if (pcz < 0.5) return null;
    const inv = focalLen / pcz;
    return { sx: W / 2 + pcx * inv, sy: H / 2 - pcy * inv, depth: pcz, scale: inv };
  };
  return { project, rX, rZ, uX, uY, uZ, focalLen };
}

// ─── 3D Galaxy Map component (Zoom Level 1) ───────────────────────────────────

export interface GalaxyGridHandle {
  focusSystem: (systemId: string, options?: { distance?: number; phi?: number; durationMs?: number }) => void;
}

const GalaxyGridView = forwardRef<GalaxyGridHandle, {
  allSystems:         StarSystem[];
  systemById:         Map<string, StarSystem>;
  sectors:            GalacticSector[];
  currentSystemId:    string;
  visitedSystems:     Record<string, boolean>;
  zSlice:             number;
  filters:            MapFilters;
  searchQuery:        string;
  onSystemClick:      (id: string) => void;
  selectedId:         string | null;
  reachable:          Set<string>;
  jumpRangeLY:        number;
  overlay:            OverlayMode;
  fleetShips:         ShipInstance[];
  playerFleets:       PlayerFleet[];
  activeRoute:        ActiveRoute | null;
  warpState:          WarpState | null;
  warpFromSystem:     StarSystem | null;
  warpToSystem:       StarSystem | null;
  onHoverChange?:     (hover: HoverPreview | null) => void;
}>(function GalaxyGridView({
  allSystems,
  systemById,
  sectors: _sectors,
  currentSystemId,
  visitedSystems,
  zSlice,
  filters,
  searchQuery,
  onSystemClick,
  selectedId,
  reachable,
  jumpRangeLY,
  overlay,
  fleetShips,
  playerFleets,
  activeRoute,
  warpState,
  warpFromSystem,
  warpToSystem,
  onHoverChange,
}, ref) {
  void _sectors;
  const canvasRef  = useRef<HTMLCanvasElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const cam        = useRef({ ...CAM3_DEFAULT });
  const camAnim    = useRef<{ from: typeof CAM3_DEFAULT; to: typeof CAM3_DEFAULT; startTime: number; duration: number } | null>(null);
  const drag       = useRef({ active: false, btn: 0, sx: 0, sy: 0, moved: false });
  const hovId      = useRef<string | null>(null);
  const mousePos   = useRef<{ x: number; y: number } | null>(null);
  const rafId      = useRef(0);
  const redrawTimeoutId = useRef<number | null>(null);
  const projCache  = useRef<Array<{ id: string; sx: number; sy: number }>>([]);
  const hoverPreviewRef = useRef<HoverPreview | null>(null);
  const scheduleRedrawRef = useRef<(delayMs?: number) => void>(() => undefined);

  // Props ref — lets the RAF callback always see latest values without re-creating draw
  const propsRef = useRef({
    allSystems, systemById, currentSystemId, visitedSystems, zSlice,
    filters, searchQuery, selectedId, reachable, jumpRangeLY,
    overlay, fleetShips, playerFleets, activeRoute,
    warpState, warpFromSystem, warpToSystem, onHoverChange,
  });
  propsRef.current = {
    allSystems, systemById, currentSystemId, visitedSystems, zSlice,
    filters, searchQuery, selectedId, reachable, jumpRangeLY,
    overlay, fleetShips, playerFleets, activeRoute,
    warpState, warpFromSystem, warpToSystem, onHoverChange,
  };

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    let nextDrawDelayMs: number | null = null;

    const requestNextDraw = (delayMs = 0) => {
      if (nextDrawDelayMs === null) {
        nextDrawDelayMs = delayMs;
        return;
      }
      nextDrawDelayMs = Math.min(nextDrawDelayMs, delayMs);
    };

    // Camera fly-to animation (smooth cubic ease-out lerp)
    const anim = camAnim.current;
    if (anim) {
      const t = Math.min(1, (performance.now() - anim.startTime) / anim.duration);
      const ease = 1 - Math.pow(1 - t, 3);
      cam.current = {
        theta: anim.from.theta + (anim.to.theta - anim.from.theta) * ease,
        phi:   anim.from.phi   + (anim.to.phi   - anim.from.phi)   * ease,
        dist:  anim.from.dist  + (anim.to.dist  - anim.from.dist)  * ease,
        tx:    anim.from.tx    + (anim.to.tx    - anim.from.tx)    * ease,
        ty:    anim.from.ty    + (anim.to.ty    - anim.from.ty)    * ease,
        tz:    anim.from.tz    + (anim.to.tz    - anim.from.tz)    * ease,
      };
      if (t < 1) requestNextDraw(0);
      else { cam.current = { ...anim.to }; camAnim.current = null; }
    }

    const dpr = window.devicePixelRatio || 1;
    const W   = canvas.width  / dpr;
    const H   = canvas.height / dpr;
    const {
      allSystems, systemById, currentSystemId, visitedSystems, zSlice,
      filters, searchQuery, selectedId, reachable, jumpRangeLY,
      overlay, fleetShips, playerFleets, activeRoute,
      warpState, warpFromSystem, warpToSystem, onHoverChange,
    } = propsRef.current;

    ctx.save();
    ctx.scale(dpr, dpr);

    // ── 1. Background ──────────────────────────────────────────────────────
    ctx.fillStyle = '#000008';
    ctx.fillRect(0, 0, W, H);

    const c = cam.current;
    const { project, rX, rZ, uX, uY, uZ, focalLen } = buildCam3(
      c.theta, c.phi, c.dist, c.tx, c.ty, c.tz, W, H,
    );

    // ── 2. Nebula blobs (3D world positions projected) ─────────────────────
    for (const neb of NEBULAS_3D) {
      const p = project(neb.wx, neb.wy, neb.wz);
      if (!p) continue;
      const sr = neb.r * p.scale;
      if (sr < 3 || p.sx + sr < 0 || p.sx - sr > W || p.sy + sr < 0 || p.sy - sr > H) continue;
      const [r, g, b] = neb.rgb;
      const grd = ctx.createRadialGradient(p.sx, p.sy, 0, p.sx, p.sy, sr);
      grd.addColorStop(0,    `rgba(${r},${g},${b},${neb.a.toFixed(3)})`);
      grd.addColorStop(0.55, `rgba(${r},${g},${b},${(neb.a * 0.28).toFixed(3)})`);
      grd.addColorStop(1,    `rgba(${r},${g},${b},0)`);
      ctx.beginPath(); ctx.arc(p.sx, p.sy, sr, 0, Math.PI * 2);
      ctx.fillStyle = grd; ctx.fill();
    }

    // ── 3. Procedural background stars (sorted far→near) ──────────────────
    const bgProj: Array<{ sx: number; sy: number; r: number; a: number; ci: number; depth: number }> = [];
    for (const s of BG_STARS_3D) {
      const p = project(s.wx, s.wy, s.wz);
      if (!p || p.sx < -4 || p.sx > W + 4 || p.sy < -4 || p.sy > H + 4) continue;
      bgProj.push({ sx: p.sx, sy: p.sy, r: s.r, a: s.a, ci: s.ci, depth: p.depth });
    }
    bgProj.sort((a, b) => b.depth - a.depth);
    for (const s of bgProj) {
      ctx.globalAlpha = s.a;
      ctx.fillStyle   = BG_COLS_3D[s.ci];
      ctx.beginPath(); ctx.arc(s.sx, s.sy, s.r, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;

    // ── 4. Game star systems ───────────────────────────────────────────────
    const filterFn   = makeSystemFilter(filters, searchQuery, visitedSystems);
    const fleetBySys = new Map<string, number>();
    for (const ship of fleetShips) {
      fleetBySys.set(ship.systemId, (fleetBySys.get(ship.systemId) ?? 0) + 1);
    }
    const routeSet = new Set(activeRoute?.path ?? []);

    interface SysEntry { sys: StarSystem; sx: number; sy: number; depth: number; scale: number; }
    const entries: SysEntry[] = [];
    const newProjCache: Array<{ id: string; sx: number; sy: number }> = [];

    for (const sys of allSystems) {
      if (!filterFn(sys)) continue;
      const [wx, wy, wz] = sysToWorld(sys);
      const p = project(wx, wy, wz);
      if (!p || p.sx < -80 || p.sx > W + 80 || p.sy < -80 || p.sy > H + 80) continue;
      entries.push({ sys, sx: p.sx, sy: p.sy, depth: p.depth, scale: p.scale });
      newProjCache.push({ id: sys.id, sx: p.sx, sy: p.sy });
    }
    projCache.current = newProjCache;
    entries.sort((a, b) => b.depth - a.depth);  // far → near, near renders on top

    // ── 4b. Fleet order route lines ────────────────────────────────────────
    // Each ship's planned autonomous route is a faint dashed polyline; the
    // destination system gets a glowing ring in the matching colour.
    {
      const ORDER_COLOURS = ['#a78bfa', '#fb923c', '#34d399', '#f472b6', '#60a5fa', '#fbbf24'];
      fleetShips.forEach((ship, ci) => {
        if (!ship.fleetOrder || ship.fleetOrder.route.length < 2) return;
        const route = ship.fleetOrder.route;
        const oc = ORDER_COLOURS[ci % ORDER_COLOURS.length];
        ctx.save();
        ctx.strokeStyle = oc + '88';
        ctx.lineWidth = 1.2;
        ctx.setLineDash([4, 3]);
        for (let i = 0; i < route.length - 1; i++) {
          const sa = systemById.get(route[i]);
          const sb = systemById.get(route[i + 1]);
          if (!sa || !sb) continue;
          const pa = project(...sysToWorld(sa));
          const pb = project(...sysToWorld(sb));
          if (!pa || !pb) continue;
          ctx.beginPath(); ctx.moveTo(pa.sx, pa.sy); ctx.lineTo(pb.sx, pb.sy); ctx.stroke();
        }
        // Destination ring
        const destSys = systemById.get(ship.fleetOrder.destinationSystemId);
        if (destSys) {
          const pd = project(...sysToWorld(destSys));
          if (pd) {
            ctx.setLineDash([]);
            ctx.strokeStyle = oc; ctx.lineWidth = 1.6;
            ctx.beginPath(); ctx.arc(pd.sx, pd.sy, 8, 0, Math.PI * 2); ctx.stroke();
          }
        }
        ctx.restore();
      });
    }

    // ── 4a. Jump lanes — drawn behind stars, visible when zoomed in ────────
    // Guard: only when few enough systems are on screen AND stars are large enough
    // to make the lanes meaningful (avoids clutter when galaxy-wide view).
    if (entries.length < 350 && entries.some(e => e.scale > 2.0)) {
      const rangeUnits = jumpRangeLY / GALAXY_WIDTH_LY;
      // Highlight lanes that are part of the active route
      const routeLaneSet = new Set<string>();
      if (activeRoute) {
        for (let i = 0; i < activeRoute.path.length - 1; i++) {
          const a = activeRoute.path[i], b = activeRoute.path[i + 1];
          routeLaneSet.add(`${a}|${b}`); routeLaneSet.add(`${b}|${a}`);
        }
      }
      ctx.save();
      ctx.setLineDash([3, 4]);
      for (let i = 0; i < entries.length; i++) {
        for (let j = i + 1; j < entries.length; j++) {
          const a = entries[i], b = entries[j];
          const dx = a.sys.x - b.sys.x, dz = a.sys.y - b.sys.y;
          if (Math.sqrt(dx * dx + dz * dz) > rangeUnits) continue;
          const onRoute = routeLaneSet.has(`${a.sys.id}|${b.sys.id}`);
          const lit = reachable.has(a.sys.id) || reachable.has(b.sys.id);
          ctx.lineWidth = onRoute ? 1.4 : 0.7;
          ctx.strokeStyle = onRoute ? 'rgba(34,211,238,0.45)'
            : lit ? 'rgba(34,211,238,0.18)' : 'rgba(30,58,92,0.28)';
          ctx.beginPath(); ctx.moveTo(a.sx, a.sy); ctx.lineTo(b.sx, b.sy); ctx.stroke();
        }
      }
      ctx.setLineDash([]); ctx.restore();
    }

    const labelZoomFade = clamp01((720 - c.dist) / 420);
    const declutterStrength = clamp01((c.dist - 320) / 220);
    const drawnLabelBounds: Array<{ left: number; top: number; right: number; bottom: number }> = [];

    for (const { sys, sx, sy, scale } of entries) {
      const isVisited  = !!visitedSystems[sys.id];
      const isHovered  = hovId.current === sys.id;
      const isSelected = sys.id === selectedId;
      const isCurrent  = sys.id === currentSystemId;
      const isOnRoute  = routeSet.has(sys.id);
      const inZSlice  = Math.abs(sys.z - zSlice) <= Z_SLICE_HALF_THICKNESS;
      const fleetN    = fleetBySys.get(sys.id) ?? 0;
      const col       = STAR_COL[sys.starType] ?? '#fff4e8';

      // Unvisited = very dim; out-of-z-slice = moderately dimmed
      const masterAlpha = (isVisited ? 1.0 : 0.18) * (inZSlice || isCurrent ? 1.0 : 0.40);

      ctx.save();
      ctx.globalAlpha = masterAlpha;

      const baseR = Math.max(1.2, Math.min(7.5, scale * 0.07 + 1.4));
      const glowR = baseR * 3.8;

      // Faction overlay: tint star glow with faction color when in faction mode
      const factionCol = (overlay === 'faction' && sys.factionId)
        ? FACTION_DEFINITIONS[sys.factionId]?.color ?? col
        : col;
      const starDisplayCol = overlay === 'faction' ? factionCol : col;

      // Glow halo
      if (glowR >= 3) {
        const grd = ctx.createRadialGradient(sx, sy, 0, sx, sy, glowR);
        grd.addColorStop(0,    starDisplayCol + 'cc');
        grd.addColorStop(0.35, starDisplayCol + '55');
        grd.addColorStop(1,    starDisplayCol + '00');
        ctx.beginPath(); ctx.arc(sx, sy, glowR, 0, Math.PI * 2);
        ctx.fillStyle = grd; ctx.fill();
      }

      // Route ring
      if (isOnRoute) {
        ctx.globalAlpha = masterAlpha * 0.9;
        ctx.beginPath(); ctx.arc(sx, sy, baseR + 5, 0, Math.PI * 2);
        ctx.strokeStyle = '#22d3ee'; ctx.lineWidth = 1.2; ctx.stroke();
      }

      // Current location double-ring
      if (isCurrent) {
        ctx.globalAlpha = 1;
        ctx.beginPath(); ctx.arc(sx, sy, baseR + 9, 0, Math.PI * 2);
        ctx.strokeStyle = '#fbbf24'; ctx.lineWidth = 1.5; ctx.stroke();
        ctx.beginPath(); ctx.arc(sx, sy, baseR + 4, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(251,191,36,0.32)'; ctx.lineWidth = 3; ctx.stroke();
      }

      // Selected system ring (distinct from current)
      if (isSelected && !isCurrent) {
        ctx.globalAlpha = masterAlpha;
        ctx.beginPath(); ctx.arc(sx, sy, baseR + 10, 0, Math.PI * 2);
        ctx.strokeStyle = '#fbbf24'; ctx.lineWidth = 1.5; ctx.stroke();
        ctx.beginPath(); ctx.arc(sx, sy, baseR + 15, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(251,191,36,0.14)'; ctx.lineWidth = 2; ctx.stroke();
      }

      // Hover ring
      if (isHovered) {
        ctx.globalAlpha = 0.9;
        ctx.beginPath(); ctx.arc(sx, sy, baseR + 6, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 1; ctx.stroke();
      }

      // Core star dot + bright highlight
      ctx.globalAlpha = masterAlpha;
      ctx.beginPath(); ctx.arc(sx, sy, baseR, 0, Math.PI * 2);
      ctx.fillStyle = starDisplayCol; ctx.fill();
      ctx.globalAlpha = masterAlpha * 0.65;
      ctx.beginPath(); ctx.arc(sx, sy, baseR * 0.38, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff'; ctx.fill();

      // Station icon — small diamond below star for systems with a dockable station
      if (sys.stationId && isVisited && scale > 1.2) {
        const stCol = sys.factionId ? (FACTION_DEFINITIONS[sys.factionId]?.color ?? '#94a3b8') : '#94a3b8';
        ctx.globalAlpha = masterAlpha * 0.85;
        ctx.fillStyle = stCol;
        const iconSize = Math.max(2, baseR * 0.65);
        const ix = sx, iy = sy + baseR + iconSize + 2;
        ctx.save();
        ctx.translate(ix, iy); ctx.rotate(Math.PI / 4);
        ctx.fillRect(-iconSize / 2, -iconSize / 2, iconSize, iconSize);
        ctx.restore();
      }

      // Security ring (coloured band when visited + in slice + zoomed close)
      if (isVisited && inZSlice && scale > 1.8) {
        const rc = overlay === 'faction' && sys.factionId
          ? FACTION_DEFINITIONS[sys.factionId]?.color ?? '#94a3b8'
          : sys.security === 'highsec' ? '#4ade80'
          : sys.security === 'lowsec'  ? '#fb923c' : '#f87171';
        ctx.globalAlpha = masterAlpha * 0.55;
        ctx.beginPath(); ctx.arc(sx, sy, baseR + 2.5, 0, Math.PI * 2);
        ctx.strokeStyle = rc; ctx.lineWidth = 1; ctx.stroke();
      }

      // Resource overlay: belt dots
      if (overlay === 'resource' && isVisited) {
        const belts = sys.bodies.filter(b => b.type === 'asteroid-belt').length;
        for (let bi = 0; bi < Math.min(belts, 5); bi++) {
          ctx.globalAlpha = masterAlpha * 0.80;
          ctx.fillStyle = '#fb923c';
          ctx.beginPath();
          ctx.arc(sx + baseR + 3 + bi * 3.5, sy, 1.5, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // Fleet badge
      if (fleetN > 0 && scale > 1.5) {
        ctx.globalAlpha = 1;
        const bx = sx + baseR + 2, by = sy - 10, bw = 16, bh = 10;
        ctx.fillStyle = 'rgba(34,211,238,0.15)';
        ctx.strokeStyle = 'rgba(34,211,238,0.5)'; ctx.lineWidth = 0.8;
        ctx.beginPath(); ctx.rect(bx, by, bw, bh); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#22d3ee';
        ctx.font = '7px monospace'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
        ctx.fillText(`${fleetN}▲`, bx + 2, by + bh / 2);
      }

      // System label — default-on for every visible system, with stronger treatment for active context.
      if (filters.showLabels) {
        const isCriticalLabel = isSelected || isCurrent || isHovered || isOnRoute;
        const labelPriority = isSelected ? 1
          : isCurrent ? 0.96
          : isHovered ? 0.93
          : isOnRoute ? 0.84
          : isVisited ? 0.6
          : 0.52;
        const depthFade = clamp01((scale - 1.05) / 2.6);
        const labelVisibility = isCriticalLabel
          ? 1
          : (inZSlice || isCurrent ? 0.92 : 0.62);
        const declutterAlphaPenalty = isCriticalLabel ? 1 : 1 - declutterStrength * 0.22;
        const labelAlpha = labelVisibility * declutterAlphaPenalty * (isCriticalLabel
          ? Math.max(0.76, depthFade * 0.8 + labelZoomFade * 0.45) * labelPriority
          : Math.max(0.56, depthFade * 0.62 + labelZoomFade * 0.22) * labelPriority);
        const showSecondary = isCriticalLabel || (isVisited && scale > 6.4 && labelZoomFade > 0.58);

        if (labelAlpha > 0.08) {
          const fs = Math.round(Math.max(8, Math.min(11, 7.2 + scale * 0.07)));
          const primaryY = sy - baseR - 5;
          ctx.font = `${isCurrent || isSelected ? 'bold ' : ''}${fs}px monospace`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'bottom';
          const primaryWidth = ctx.measureText(sys.name).width;
          const secondaryHeight = showSecondary ? 10 : 0;
          const declutterPadX = 7 + declutterStrength * 14;
          const declutterPadY = 4 + declutterStrength * 8;
          const labelBounds = {
            left: sx - primaryWidth / 2 - declutterPadX,
            right: sx + primaryWidth / 2 + declutterPadX,
            top: primaryY - fs - secondaryHeight - declutterPadY,
            bottom: primaryY + 3 + declutterPadY,
          };

          if (!isCriticalLabel && declutterStrength > 0.08 && drawnLabelBounds.some(bounds => boundsOverlap(labelBounds, bounds))) {
            ctx.restore();
            continue;
          }

          if (isCriticalLabel || declutterStrength > 0.08) {
            drawnLabelBounds.push(labelBounds);
          }
          ctx.globalAlpha = labelAlpha;
          ctx.fillStyle = isCurrent || isSelected
            ? '#fbbf24'
            : isOnRoute
              ? '#22d3ee'
              : isVisited
                ? '#cbd5e1'
                : '#94a3b8';
          ctx.fillText(sys.name, sx, primaryY);

          if (showSecondary) {
            const sl = sys.security === 'highsec' ? 'HIGH' : sys.security === 'lowsec' ? 'LOW' : 'NULL';
            ctx.font = '7px monospace';
            ctx.globalAlpha = Math.min(labelAlpha * 0.76, 0.58);
            ctx.fillStyle = sys.security === 'highsec' ? '#4ade80'
              : sys.security === 'lowsec' ? '#fb923c'
              : '#f87171';
            ctx.fillText(`${sl}  ${sys.starType}`, sx, primaryY - fs - 1);
          }
        }
      }

      ctx.restore();
    }

    // ── 4c. Animated fleet icons (per fleet group, following jump lines) ────
    // Each PlayerFleet with an active order is drawn as a color-coded arrow
    // lerping along the current leg of its route. Standalone ships (fleetId=null)
    // with solo orders are drawn with a distinct style.
    {
      const FLEET_COLOURS = ['#a78bfa', '#fb923c', '#34d399', '#f472b6', '#60a5fa'];
      const now = Date.now();
      let anyInTransit = false;

      // Draw fleet group icons
      playerFleets.forEach((fleet: PlayerFleet, fi: number) => {
        if (!fleet.fleetOrder) return;
        const { route, currentLeg, legDepartedAt } = fleet.fleetOrder;
        if (currentLeg >= route.length - 1) return;
        const fromSys = systemById.get(route[currentLeg]);
        const toSys = systemById.get(route[currentLeg + 1]);
        if (!fromSys || !toSys) return;
        const pa = project(...sysToWorld(fromSys));
        const pb = project(...sysToWorld(toSys));
        if (!pa || !pb) return;
        anyInTransit = true;
        const legDurationMs = Math.max(1000, (fleet.fleetOrder.legDurationSeconds ?? 1) * 1000);
        const t  = Math.min(1, Math.max(0, (now - legDepartedAt) / legDurationMs));
        const px = pa.sx + (pb.sx - pa.sx) * t;
        const py = pa.sy + (pb.sy - pa.sy) * t;
        const angle = Math.atan2(pb.sy - pa.sy, pb.sx - pa.sx);
        const avgScale = (pa.scale + pb.scale) * 0.5;
        const sz = Math.max(4, Math.min(9, avgScale * 0.04 + 3.5));
        const oc = FLEET_COLOURS[fi % FLEET_COLOURS.length];
        ctx.save();
        // Contrail
        const trailDist = sz * 5;
        const trailGrd = ctx.createLinearGradient(
          px - Math.cos(angle) * trailDist, py - Math.sin(angle) * trailDist, px, py,
        );
        trailGrd.addColorStop(0, oc + '00');
        trailGrd.addColorStop(1, oc + '55');
        ctx.strokeStyle = trailGrd; ctx.lineWidth = 1.8; ctx.setLineDash([]);
        ctx.beginPath();
        ctx.moveTo(px - Math.cos(angle) * trailDist, py - Math.sin(angle) * trailDist);
        ctx.lineTo(px, py); ctx.stroke();
        // Fleet arrowhead
        ctx.translate(px, py); ctx.rotate(angle);
        ctx.shadowBlur = 10; ctx.shadowColor = oc;
        ctx.fillStyle = oc;
        ctx.beginPath();
        ctx.moveTo(sz, 0);
        ctx.lineTo(-sz * 0.65, -sz * 0.48);
        ctx.lineTo(-sz * 0.28, 0);
        ctx.lineTo(-sz * 0.65,  sz * 0.48);
        ctx.closePath(); ctx.fill();
        // Ship count badge
        const shipCount = fleet.shipIds.length;
        ctx.rotate(-angle); ctx.shadowBlur = 0;
        if (shipCount > 1) {
          ctx.font = 'bold 7px monospace'; ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
          ctx.fillStyle = oc;
          ctx.fillText(`×${shipCount}`, sz + 2, -1);
        }
        // Fleet name label (abbreviated to 8 chars)
        ctx.font = '7px monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
        ctx.fillStyle = oc + 'cc';
        ctx.fillText(fleet.name.slice(0, 10), 0, -sz - 2);
        ctx.restore();
      });

      // Draw standalone ship icons (ships with fleetId=null and an active order)
      fleetShips.filter(s => s.fleetId === null && s.fleetOrder !== null).forEach((ship, ci) => {
        const order = ship.fleetOrder!;
        const { route, currentLeg, legDepartedAt } = order;
        if (currentLeg >= route.length - 1) return;
        const fromSys = systemById.get(route[currentLeg]);
        const toSys = systemById.get(route[currentLeg + 1]);
        if (!fromSys || !toSys) return;
        const pa = project(...sysToWorld(fromSys));
        const pb = project(...sysToWorld(toSys));
        if (!pa || !pb) return;
        anyInTransit = true;
        const legDurationMs = Math.max(1000, (order.legDurationSeconds ?? 1) * 1000);
        const t  = Math.min(1, Math.max(0, (now - legDepartedAt) / legDurationMs));
        const px = pa.sx + (pb.sx - pa.sx) * t;
        const py = pa.sy + (pb.sy - pa.sy) * t;
        const angle = Math.atan2(pb.sy - pa.sy, pb.sx - pa.sx);
        const avgScale = (pa.scale + pb.scale) * 0.5;
        const sz = Math.max(3, Math.min(7, avgScale * 0.04 + 2.5));
        const oc = '#94a3b8'; // slate for ungrouped ships
        ctx.save();
        ctx.translate(px, py); ctx.rotate(angle);
        ctx.shadowBlur = 6; ctx.shadowColor = oc;
        ctx.fillStyle = oc;
        ctx.beginPath();
        ctx.moveTo(sz, 0);
        ctx.lineTo(-sz * 0.65, -sz * 0.48);
        ctx.lineTo(-sz * 0.28, 0);
        ctx.lineTo(-sz * 0.65,  sz * 0.48);
        ctx.closePath(); ctx.fill();
        ctx.restore();
        void ci;
      });

      if (anyInTransit) requestNextDraw(MAP_TRANSIT_REDRAW_MS);
    }

    // ── 5. Route polyline — color-coded by security tier of each leg ─────────
    if (activeRoute && activeRoute.path.length >= 2) {
      const SEC_COLOR: Record<SystemSecurity, string> = {
        highsec: '#4ade80',
        lowsec:  '#fb923c',
        nullsec: '#f87171',
      };
      ctx.save();
      for (let i = 0; i < activeRoute.path.length - 1; i++) {
        const sa = systemById.get(activeRoute.path[i]);
        const sb = systemById.get(activeRoute.path[i + 1]);
        if (!sa || !sb) continue;
        const pa = project(...sysToWorld(sa));
        const pb = project(...sysToWorld(sb));
        if (!pa || !pb) continue;
        const legSec = activeRoute.legSecurity[i] ?? 'highsec';
        const col = SEC_COLOR[legSec];
        // Glow underlay
        ctx.setLineDash([]);
        ctx.strokeStyle = col + '28';
        ctx.lineWidth = 7;
        ctx.beginPath(); ctx.moveTo(pa.sx, pa.sy); ctx.lineTo(pb.sx, pb.sy); ctx.stroke();
        // Core line
        ctx.strokeStyle = col + 'cc';
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(pa.sx, pa.sy); ctx.lineTo(pb.sx, pb.sy); ctx.stroke();
        // Dashed overlay for lowsec/nullsec to emphasise danger
        if (legSec !== 'highsec') {
          ctx.strokeStyle = col;
          ctx.lineWidth = 1.2;
          ctx.setLineDash([5, 4]);
          ctx.beginPath(); ctx.moveTo(pa.sx, pa.sy); ctx.lineTo(pb.sx, pb.sy); ctx.stroke();
        }
      }
      // Origin marker (cyan ring)
      const originSys = systemById.get(activeRoute.fromId);
      if (originSys) {
        const po = project(...sysToWorld(originSys));
        if (po) {
          ctx.setLineDash([]);
          ctx.strokeStyle = '#22d3ee'; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.arc(po.sx, po.sy, 12, 0, Math.PI * 2); ctx.stroke();
        }
      }
      // Destination marker (gold bullseye)
      const destSys = systemById.get(activeRoute.toId);
      if (destSys) {
        const pd = project(...sysToWorld(destSys));
        if (pd) {
          ctx.setLineDash([]);
          ctx.strokeStyle = '#fbbf24'; ctx.lineWidth = 2.5;
          ctx.beginPath(); ctx.arc(pd.sx, pd.sy, 13, 0, Math.PI * 2); ctx.stroke();
          ctx.strokeStyle = 'rgba(251,191,36,0.3)'; ctx.lineWidth = 5;
          ctx.beginPath(); ctx.arc(pd.sx, pd.sy, 18, 0, Math.PI * 2); ctx.stroke();
        }
      }
      ctx.setLineDash([]); ctx.restore();
    }

    // ── 6. Player warp travel marker ──────────────────────────────────────
    // Golden arrow between exact system positions, labeled "PLAYER".
    if (warpState && warpFromSystem && warpToSystem) {
      const t = Math.min(1, Math.max(0, (Date.now() - warpState.startedAt) / (warpState.durationSeconds * 1000)));
      const pa = project(...sysToWorld(warpFromSystem));
      const pb = project(...sysToWorld(warpToSystem));
      if (pa && pb) {
        const px = pa.sx + (pb.sx - pa.sx) * t;
        const py = pa.sy + (pb.sy - pa.sy) * t;
        const angle = Math.atan2(pb.sy - pa.sy, pb.sx - pa.sx);
        const avgScale = (pa.scale + pb.scale) * 0.5;
        const sz = Math.max(4, Math.min(9, avgScale * 0.04 + 3.5));
        ctx.save();
        // Contrail
        const trailDist = sz * 5;
        const trailGrd = ctx.createLinearGradient(
          px - Math.cos(angle) * trailDist, py - Math.sin(angle) * trailDist, px, py,
        );
        trailGrd.addColorStop(0, '#fbbf2400');
        trailGrd.addColorStop(1, '#fbbf2444');
        ctx.strokeStyle = trailGrd; ctx.lineWidth = 1.8; ctx.setLineDash([]);
        ctx.beginPath();
        ctx.moveTo(px - Math.cos(angle) * trailDist, py - Math.sin(angle) * trailDist);
        ctx.lineTo(px, py); ctx.stroke();
        // Golden arrowhead
        ctx.translate(px, py); ctx.rotate(angle);
        ctx.shadowBlur = 12; ctx.shadowColor = '#fbbf24';
        ctx.fillStyle = '#fbbf24';
        ctx.beginPath();
        ctx.moveTo(sz, 0);
        ctx.lineTo(-sz * 0.65, -sz * 0.5);
        ctx.lineTo(-sz * 0.28, 0);
        ctx.lineTo(-sz * 0.65,  sz * 0.5);
        ctx.closePath(); ctx.fill();
        // "PLAYER" label
        ctx.rotate(-angle); ctx.shadowBlur = 0;
        ctx.font = '7px monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
        ctx.fillStyle = 'rgba(251,191,36,0.85)';
        ctx.fillText('PLAYER', 0, -sz - 2);
        ctx.restore();
        requestNextDraw(MAP_WARP_REDRAW_MS);
      }
    }

    // ── 7. Hover preview anchor for React overlay ────────────────────────
    const hovSys = hovId.current ? (systemById.get(hovId.current) ?? null) : null;
    const hovPos = hovId.current ? projCache.current.find(p => p.id === hovId.current) : null;
    if (onHoverChange) {
      const nextHover = hovSys && hovPos ? {
        systemId: hovSys.id,
        x: hovPos.sx,
        y: hovPos.sy,
      } : null;
      const prevHover = hoverPreviewRef.current;
      const changed = !prevHover || !nextHover
        ? prevHover !== nextHover
        : prevHover.systemId !== nextHover.systemId
          || Math.abs(prevHover.x - nextHover.x) > 0.75
          || Math.abs(prevHover.y - nextHover.y) > 0.75;
      if (changed) {
        hoverPreviewRef.current = nextHover;
        onHoverChange(nextHover);
      }
    }

    // ── 8. HUD ─────────────────────────────────────────────────────────────
    ctx.save();
    const orb = ((c.theta % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) * 180 / Math.PI).toFixed(0);
    const til = (c.phi * 180 / Math.PI).toFixed(0);
    ctx.font = '9px monospace'; ctx.fillStyle = 'rgba(71,85,105,0.72)';
    ctx.textAlign = 'right'; ctx.textBaseline = 'bottom';
    ctx.fillText(`orbit:${orb}°  tilt:${til}°  ${c.dist.toFixed(0)}ly`, W - 8, H - 8);
    ctx.globalAlpha = 0.28; ctx.font = '8px monospace';
    ctx.textAlign = 'left'; ctx.fillStyle = '#334155';
    ctx.fillText('drag·orbit   shift+drag·pan   scroll·zoom   click·select   dbl·fly-in', 8, H - 8);
    ctx.restore();

    ctx.restore(); // DPR scale

    if (nextDrawDelayMs !== null) {
      scheduleRedrawRef.current(nextDrawDelayMs);
    }
  }, []);

  useImperativeHandle(ref, () => ({
    focusSystem(systemId: string, options) {
      const sys = propsRef.current.systemById.get(systemId);
      if (!sys) return;
      const [wx, wy, wz] = sysToWorld(sys);
      const c = cam.current;
      camAnim.current = {
        from: { ...c },
        to: {
          theta: c.theta,
          phi: options?.phi ?? c.phi,
          dist: Math.min(c.dist, options?.distance ?? 280),
          tx: wx,
          ty: wy,
          tz: wz,
        },
        startTime: performance.now(),
        duration: options?.durationMs ?? 700,
      };
      scheduleRedrawRef.current();
    },
  }), []);

  const clearScheduledRedraw = useCallback(() => {
    cancelAnimationFrame(rafId.current);
    if (redrawTimeoutId.current !== null) {
      window.clearTimeout(redrawTimeoutId.current);
      redrawTimeoutId.current = null;
    }
  }, []);

  const scheduleRedraw = useCallback((delayMs = 0) => {
    clearScheduledRedraw();
    if (delayMs <= 0) {
      rafId.current = requestAnimationFrame(draw);
      return;
    }
    redrawTimeoutId.current = window.setTimeout(() => {
      redrawTimeoutId.current = null;
      rafId.current = requestAnimationFrame(draw);
    }, delayMs);
  }, [clearScheduledRedraw, draw]);

  scheduleRedrawRef.current = scheduleRedraw;

  // Canvas size sync via ResizeObserver
  useEffect(() => {
    const canvas  = canvasRef.current;
    const wrapper = wrapperRef.current;
    if (!canvas || !wrapper) return;
    const dpr = window.devicePixelRatio || 1;
    const sync = () => {
      const { width, height } = wrapper.getBoundingClientRect();
      if (!width || !height) return;
      canvas.width  = Math.round(width  * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.width  = `${width}px`;
      canvas.style.height = `${height}px`;
      scheduleRedraw();
    };
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(wrapper);
    return () => {
      ro.disconnect();
      clearScheduledRedraw();
    };
  }, [clearScheduledRedraw, scheduleRedraw]);

  // Redraw when visual inputs change.
  useEffect(() => {
    scheduleRedraw();
  }, [
    activeRoute,
    allSystems,
    currentSystemId,
    fleetShips,
    filters,
    jumpRangeLY,
    overlay,
    playerFleets,
    reachable,
    scheduleRedraw,
    searchQuery,
    selectedId,
    systemById,
    visitedSystems,
    warpFromSystem,
    warpState,
    warpToSystem,
    zSlice,
  ]);

  // Scroll zoom (non-passive so we can preventDefault)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const f = e.deltaY < 0 ? 0.88 : 1.14;
      cam.current.dist = Math.max(25, Math.min(1500, cam.current.dist * f));
      scheduleRedraw();
    };
    canvas.addEventListener('wheel', onWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', onWheel);
  }, [scheduleRedraw]);

  // ── Pointer handlers ──────────────────────────────────────────────────────

  const onMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    drag.current = { active: true, btn: e.button, sx: e.clientX, sy: e.clientY, moved: false };
    e.currentTarget.style.cursor = 'grabbing';
  }, []);

  const onMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const d = drag.current;
    if (d.active) {
      const dx = e.clientX - d.sx, dy = e.clientY - d.sy;
      if (Math.abs(dx) + Math.abs(dy) > 2) d.moved = true;
      d.sx = e.clientX; d.sy = e.clientY;
      if (d.btn === 1 || e.shiftKey) {
        // Pan: translate target laterally in camera space
        const cv = canvasRef.current;
        const cW = cv ? cv.width  / (window.devicePixelRatio || 1) : 600;
        const cH = cv ? cv.height / (window.devicePixelRatio || 1) : 400;
        const c  = cam.current;
        const { rX, rZ, uX, uY, uZ, focalLen } = buildCam3(c.theta, c.phi, c.dist, c.tx, c.ty, c.tz, cW, cH);
        const ps = c.dist / focalLen;
        c.tx -= rX * dx * ps; c.tz -= rZ * dx * ps;
        c.tx += uX * dy * ps; c.ty += uY * dy * ps; c.tz += uZ * dy * ps;
      } else {
        // Orbit: change azimuth + polar angle
        cam.current.theta += dx * 0.008;
        cam.current.phi    = Math.max(0.06, Math.min(Math.PI - 0.06, cam.current.phi - dy * 0.006));
      }
      scheduleRedraw();
    } else {
      // Hover hit-test using last-frame projected cache
      const rect = e.currentTarget.getBoundingClientRect();
      const mx = e.clientX - rect.left, my = e.clientY - rect.top;
      mousePos.current = { x: mx, y: my };
      let bestId: string | null = null;
      let bestD2 = 20 * 20;
      for (const p of projCache.current) {
        const d2 = (p.sx - mx) ** 2 + (p.sy - my) ** 2;
        if (d2 < bestD2) { bestD2 = d2; bestId = p.id; }
      }
      if (bestId !== hovId.current) {
        hovId.current = bestId;
        scheduleRedraw();
      }
    }
  }, [scheduleRedraw]);

  const onMouseUp = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const wasDrag = drag.current.moved;
    drag.current.active = false; drag.current.moved = false;
    e.currentTarget.style.cursor = 'crosshair';
    if (!wasDrag && hovId.current) {
      onSystemClick(hovId.current);
      // Smoothly pan camera to centre on the clicked system (keep orbit + distance)
      const sys = propsRef.current.systemById.get(hovId.current);
      if (sys) {
        const [wx, wy, wz] = sysToWorld(sys);
        const c = cam.current;
        camAnim.current = {
          from: { ...c },
          to: { theta: c.theta, phi: c.phi, dist: c.dist, tx: wx, ty: wy, tz: wz },
          startTime: performance.now(),
          duration: 600,
        };
        scheduleRedraw();
      }
    }
  }, [onSystemClick, scheduleRedraw]);

  const onMouseLeave = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    drag.current.active = false; drag.current.moved = false;
    e.currentTarget.style.cursor = 'crosshair';
    mousePos.current = null;
    if (hovId.current) {
      hovId.current = null;
      if (propsRef.current.onHoverChange) {
        hoverPreviewRef.current = null;
        propsRef.current.onHoverChange(null);
      }
      scheduleRedraw();
    }
  }, [scheduleRedraw]);

  const onDblClick = useCallback(() => {
    if (hovId.current) {
      // Fly in close to the hovered system
      const sys = propsRef.current.systemById.get(hovId.current);
      if (sys) {
        const [wx, wy, wz] = sysToWorld(sys);
        camAnim.current = {
          from: { ...cam.current },
          to: { theta: cam.current.theta, phi: 1.28, dist: 55, tx: wx, ty: wy, tz: wz },
          startTime: performance.now(),
          duration: 950,
        };
        scheduleRedraw();
        return;
      }
    }
    // Double-click empty space → smooth reset
    camAnim.current = {
      from: { ...cam.current },
      to: { ...CAM3_DEFAULT },
      startTime: performance.now(),
      duration: 700,
    };
    scheduleRedraw();
  }, [scheduleRedraw]);

  return (
    <div ref={wrapperRef} style={{ width: '100%', height: '100%', overflow: 'hidden' }}>
      <canvas
        ref={canvasRef}
        style={{ display: 'block', cursor: 'crosshair' }}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseLeave}
        onDoubleClick={onDblClick}
      />
    </div>
  );
});

// ─── Filter Panel ─────────────────────────────────────────────────────────────

function DrawerSheet({ title, eyebrow, open, onClose, children }: DrawerSheetProps) {
  if (!open) return null;

  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 24 }}>
      <button
        type="button"
        aria-label={`Close ${title}`}
        className="starmap-sheet-backdrop"
        onClick={onClose}
      />
      <div className="starmap-sheet">
        <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 8 }}>
          <span className="starmap-sheet-handle" />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '8px 14px 10px', borderBottom: '1px solid rgba(22,30,52,0.7)' }}>
          <div style={{ minWidth: 0 }}>
            {eyebrow && (
              <div style={{ fontSize: 8, color: '#475569', letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: 3 }}>
                {eyebrow}
              </div>
            )}
            <div style={{ fontSize: 12, fontWeight: 700, color: '#e2e8f0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {title}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="legacy-panel-btn"
            style={{
              padding: '3px 8px',
              fontSize: 9,
              '--legacy-border': 'rgba(71,85,105,0.28)',
              '--legacy-bg': 'rgba(6,9,20,0.45)',
              '--legacy-color': '#94a3b8',
              '--legacy-hover-border': 'rgba(148,163,184,0.36)',
              '--legacy-hover-bg': 'rgba(15,23,42,0.78)',
              '--legacy-hover-color': '#e2e8f0',
            } as React.CSSProperties}
          >
            Close
          </button>
        </div>
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
          {children}
        </div>
      </div>
    </div>
  );
}

function FilterPanel({
  filters,
  onChange,
  layout = 'rail',
}: {
  filters: MapFilters;
  onChange: (f: MapFilters) => void;
  layout?: 'rail' | 'sheet';
}) {
  function toggle(key: keyof MapFilters) {
    onChange({ ...filters, [key]: !filters[key] });
  }

  const inSheet = layout === 'sheet';

  const checkBtn = (active: boolean, color: string): React.CSSProperties => ({
    width: 12, height: 12, borderRadius: 2, flexShrink: 0,
    border: `1px solid ${active ? color : '#334155'}`,
    background: active ? `${color}30` : 'transparent',
    display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
  });

  const checkInner = (active: boolean, color: string): React.CSSProperties => ({
    width: 6, height: 6, borderRadius: 1, background: active ? color : 'transparent',
  });

  const rows: Array<{ key: keyof MapFilters; label: string; color: string }> = [
    { key: 'highsec',       label: 'High-Sec',      color: '#4ade80' },
    { key: 'lowsec',        label: 'Low-Sec',        color: '#fb923c' },
    { key: 'nullsec',       label: 'Null-Sec',       color: '#f87171' },
    { key: 'showLabels',    label: 'Show Labels',    color: '#cbd5e1' },
    { key: 'onlyVisited',   label: 'Only Visited',   color: '#22d3ee' },
    { key: 'onlyWithBelts', label: 'Has Ore Belts',  color: '#4ade80' },
    { key: 'hasNullOres',   label: 'Rare Null Ores', color: '#22d3ee' },
  ];

  const sections: Array<{ title: string; keys: Array<keyof MapFilters> }> = [
    { title: 'Security Zone', keys: ['highsec', 'lowsec', 'nullsec'] },
    { title: 'Display',       keys: ['showLabels'] },
    { title: 'Discovery',     keys: ['onlyVisited'] },
    { title: 'Resources',     keys: ['onlyWithBelts', 'hasNullOres'] },
  ];

  return (
    <div style={{
      width: inSheet ? '100%' : 168,
      borderRight: inSheet ? 'none' : '1px solid rgba(22,30,52,0.8)',
      background: inSheet ? 'transparent' : 'rgba(3,5,16,0.95)', overflowY: 'auto',
      display: 'flex', flexDirection: 'column', flexShrink: 0,
      paddingBottom: inSheet ? 12 : 0,
    }}>
      <div style={{
        padding: inSheet ? '10px 14px 8px' : '7px 12px', borderBottom: '1px solid rgba(22,30,52,0.6)',
        fontSize: 8, fontWeight: 700, color: '#334155', letterSpacing: '0.12em', textTransform: 'uppercase',
      }}>
        MAP FILTERS
      </div>

      {sections.map(section => (
        <div key={section.title} style={{ padding: inSheet ? '10px 14px' : '7px 12px', borderBottom: '1px solid rgba(22,30,52,0.35)' }}>
          <div style={{ fontSize: 8, color: '#334155', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 5 }}>
            {section.title}
          </div>
          {section.keys.map(key => {
            const row = rows.find(r => r.key === key)!;
            return (
              <label key={key} className="starmap-filter-row" style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', padding: inSheet ? '4px 0' : undefined }}>
                <span className="starmap-filter-check" style={checkBtn(filters[key] as boolean, row.color)} onClick={() => toggle(key)}>
                  <span style={checkInner(filters[key] as boolean, row.color)} />
                </span>
                <span style={{ fontSize: inSheet ? 11 : 10, color: (filters[key] as boolean) ? row.color : '#475569' }}>
                  {row.label}
                </span>
              </label>
            );
          })}
        </div>
      ))}

      {/* Legend */}
      <div style={{ padding: inSheet ? '10px 14px' : '7px 12px' }}>
        <div style={{ fontSize: 8, color: '#334155', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 6 }}>
          Legend
        </div>
        {[
          { dot: '#22d3ee', label: 'Jump range / route' },
          { dot: '#fbbf24', label: 'Selected system' },
          { dot: '#4ade80', label: 'High-sec' },
          { dot: '#fb923c', label: 'Low-sec' },
          { dot: '#f87171', label: 'Null-sec' },
          { dot: '#22d3ee', label: '◉ Rare ores', small: true },
        ].map((l, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 3 }}>
            <span style={{ width: l.small ? 5 : 7, height: l.small ? 5 : 7, borderRadius: '50%', background: l.dot, flexShrink: 0, opacity: l.small ? 0.6 : 1 }} />
            <span style={{ fontSize: 9, color: '#334155' }}>{l.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── System Intel Panel ───────────────────────────────────────────────────────

function SystemIntelPanel({
  sys, isVisited, isCurrent, distLY, onSetCourse, onSetRouteFrom, onSetRouteTo,
}: {
  sys: StarSystem; isVisited: boolean; isCurrent: boolean; distLY: number | null;
  onSetCourse: () => void; onSetRouteFrom: () => void; onSetRouteTo: () => void;
}) {
  const belts      = sys.bodies.filter(b => b.type === 'asteroid-belt');
  const planets    = sys.bodies.filter(b => b.type !== 'asteroid-belt' && b.type !== 'moon');
  const hasNullOres = belts.some(b => b.beltIds.some(id => id === 'belt-arkonite' || id === 'belt-crokitite'));
  const gameState  = useGameStore(s => s.state);
  const threats    = getAliveNpcGroupsInSystem(gameState, sys.id);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ fontSize: 8, color: '#334155', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 2 }}>
        System Intelligence
      </div>
      <div style={{ fontSize: 12, fontWeight: 700, color: isVisited ? '#f8fafc' : '#475569' }}>
        {isVisited ? sys.name : '??? Unknown'}
      </div>
      {isVisited && (
        <>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 8, color: secColor(sys.security), border: `1px solid ${secColor(sys.security)}40`, background: `${secColor(sys.security)}15` }}>
              {secLabel(sys.security)}
            </span>
            <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 8, color: '#64748b', border: '1px solid rgba(50,60,80,0.5)', background: 'rgba(6,9,20,0.4)' }}>
              {starTypeGlyph(sys.starType)} {sys.starType}
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            {[
              { label: 'Bodies',   val: sys.bodies.length },
              { label: 'Planets',  val: planets.length },
              { label: 'Belts',    val: belts.length },
            ].map(r => (
              <div key={r.label} style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 9, color: '#475569' }}>{r.label}</span>
                <span style={{ fontSize: 10, color: '#94a3b8', fontFamily: 'monospace' }}>{r.val}</span>
              </div>
            ))}
            {hasNullOres && (
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 9, color: '#475569' }}>Null Ores</span>
                <span style={{ fontSize: 9, color: '#22d3ee', fontFamily: 'monospace' }}>PRESENT</span>
              </div>
            )}
            {threats.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginTop: 4, borderTop: '1px solid rgba(248,113,113,0.15)', paddingTop: 4 }}>
                <span style={{ fontSize: 8, color: '#7f1d1d', letterSpacing: '0.08em', textTransform: 'uppercase' }}>? Active Threats ({threats.length})</span>
                {threats.map(t => (
                  <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 4 }}>
                    <span style={{ fontSize: 9, color: '#fca5a5', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.name}</span>
                    <span style={{ fontSize: 8, color: '#6b7280', fontFamily: 'monospace', flexShrink: 0 }}>STR {t.strength}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          {distLY !== null && (
            <div style={{ fontSize: 9, color: '#475569' }}>
              Distance: <span style={{ color: '#94a3b8', fontFamily: 'monospace' }}>{distLY.toFixed(1)} LY</span>
            </div>
          )}
        </>
      )}
      {isVisited && !isCurrent && (() => {
        const currentSysId = gameState.galaxy.currentSystemId;
        const TRADE_MINERALS = ['ferrite','silite','vexirite','isorium','noxium','zyridium','megacite','voidsteel'];
        const opportunities = TRADE_MINERALS
          .map(rid => ({
            rid,
            buyPrice:  getLocalPrice(gameState, rid, currentSysId),
            sellPrice: getLocalPrice(gameState, rid, sys.id),
          }))
          .filter(o => o.buyPrice > 0 && o.sellPrice > o.buyPrice * 1.05)
          .sort((a, b) => (b.sellPrice / b.buyPrice) - (a.sellPrice / a.buyPrice))
          .slice(0, 3);
        if (opportunities.length === 0) return null;
        return (
          <div style={{ marginTop: 6, borderTop: '1px solid rgba(34,211,238,0.1)', paddingTop: 6, display: 'flex', flexDirection: 'column', gap: 3 }}>
            <div style={{ fontSize: 8, color: '#334155', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Trade Opportunity</div>
            {opportunities.map(o => (
              <div key={o.rid} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <span style={{ fontSize: 9, color: '#94a3b8' }}>{RESOURCE_REGISTRY[o.rid]?.name ?? o.rid}</span>
                <span style={{ fontSize: 9, color: '#4ade80', fontFamily: 'monospace' }}>
                  +{((o.sellPrice / o.buyPrice - 1) * 100).toFixed(0)}%
                </span>
              </div>
            ))}
          </div>
        );
      })()}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginTop: 4 }}>
        {!isCurrent && (
          <button onClick={onSetCourse} className="legacy-panel-btn" style={{ padding: '8px 10px', fontSize: 9, fontWeight: 700, textAlign: 'left', gridColumn: '1 / -1', '--legacy-border': 'rgba(34,211,238,0.3)', '--legacy-bg': 'rgba(8,51,68,0.3)', '--legacy-color': '#22d3ee', '--legacy-hover-border': 'rgba(103,232,249,0.52)', '--legacy-hover-bg': 'rgba(8,51,68,0.52)', '--legacy-hover-color': '#cffafe', '--legacy-hover-shadow': '0 0 12px rgba(34,211,238,0.18)' } as React.CSSProperties}>
            ⊛ Set Course
          </button>
        )}
        <button onClick={onSetRouteFrom} className="legacy-panel-btn" style={{ padding: '8px 10px', fontSize: 9, textAlign: 'left', '--legacy-border': 'rgba(71,85,105,0.3)', '--legacy-bg': 'rgba(6,9,20,0.4)', '--legacy-color': '#94a3b8', '--legacy-hover-border': 'rgba(148,163,184,0.38)', '--legacy-hover-bg': 'rgba(15,23,42,0.72)', '--legacy-hover-color': '#e2e8f0' } as React.CSSProperties}>
          Route: Set as Origin
        </button>
        <button onClick={onSetRouteTo} className="legacy-panel-btn" style={{ padding: '8px 10px', fontSize: 9, textAlign: 'left', '--legacy-border': 'rgba(71,85,105,0.3)', '--legacy-bg': 'rgba(6,9,20,0.4)', '--legacy-color': '#94a3b8', '--legacy-hover-border': 'rgba(148,163,184,0.38)', '--legacy-hover-bg': 'rgba(15,23,42,0.72)', '--legacy-hover-color': '#e2e8f0' } as React.CSSProperties}>
          Route: Set as Destination
        </button>
      </div>
    </div>
  );
}

// ─── Route Planner ────────────────────────────────────────────────────────────

function RoutePlanner({
  allSystems, visitedSystems, currentSystemId,
  routeFrom, routeTo, jumpRangeLY, routeFilter, activeRoute, routeComputed,
  onSetFrom, onSetTo, onSetJumpRange, onSetFilter, onComputeRoute, onClearRoute,
  fleetJumpRangeLY, playerFleets, fleetShips, routeFleetId, onSetFleet, onDispatch, dispatchFeedback,
}: {
  allSystems: StarSystem[]; visitedSystems: Record<string, boolean>;
  currentSystemId: string; routeFrom: string | null; routeTo: string | null;
  jumpRangeLY: number; routeFilter: RouteSecurityFilter; activeRoute: ActiveRoute | null; routeComputed: boolean;
  onSetFrom: (id: string) => void; onSetTo: (id: string) => void;
  onSetJumpRange: (ly: number) => void; onSetFilter: (f: RouteSecurityFilter) => void;
  onComputeRoute: () => void; onClearRoute: () => void;
  /** Effective jump range derived from fleet's best hull. */
  fleetJumpRangeLY: number;
  playerFleets: PlayerFleet[];
  fleetShips: ShipInstance[];
  routeFleetId: string | null;
  onSetFleet: (id: string | null) => void;
  onDispatch: (fleetId: string) => boolean;
  dispatchFeedback: RouteDispatchFeedback | null;
}) {
  const gameState = useGameStore(s => s.state);
  const tutorialDispatchStep = isTutorialStepCurrent(gameState, 'starmap-dispatch-fleet');
  const tutorialFleetContext = getTutorialFleetTravelContext(gameState);
  const knownSystems = useMemo(
    () => allSystems.filter(s => visitedSystems[s.id]).sort((a, b) => a.name.localeCompare(b.name)),
    [allSystems, visitedSystems],
  );
  const [destinationSort, setDestinationSort] = useState<DestinationSortMode>('distance-asc');
  const [destinationSecurity, setDestinationSecurity] = useState<DestinationSecurityFilter>('all');
  const [destinationThreat, setDestinationThreat] = useState<DestinationThreatFilter>('all');
  const [destinationVisitedOnly, setDestinationVisitedOnly] = useState(false);
  const [destinationReachableOnly, setDestinationReachableOnly] = useState(false);
  const [destinationStationsOnly, setDestinationStationsOnly] = useState(false);
  const [destinationBeltsOnly, setDestinationBeltsOnly] = useState(false);
  const [destinationSameRegionOnly, setDestinationSameRegionOnly] = useState(false);

  const selStyle: React.CSSProperties = {
    width: '100%', padding: '7px 8px', fontSize: 9,
    background: 'rgba(6,9,20,0.8)', color: '#94a3b8',
    border: '1px solid rgba(30,40,60,0.8)', borderRadius: 6,
  };
  const tutorialFocusWrapStyle: React.CSSProperties = tutorialDispatchStep
    ? {
        borderRadius: 10,
        padding: 4,
        background: 'linear-gradient(135deg, rgba(34,211,238,0.14), rgba(6,9,20,0))',
        boxShadow: '0 0 0 1px rgba(34,211,238,0.16), 0 0 18px rgba(34,211,238,0.16)',
      }
    : {};
  const tutorialButtonStyle: React.CSSProperties = tutorialDispatchStep
    ? {
        boxShadow: '0 0 0 1px rgba(34,211,238,0.18), 0 0 18px rgba(34,211,238,0.18)',
        borderColor: 'rgba(103,232,249,0.5)',
      }
    : {};
  const tutorialDropdownStyle: React.CSSProperties = tutorialDispatchStep
    ? {
        ...selStyle,
        border: '1px solid rgba(103,232,249,0.48)',
        background: 'rgba(8,51,68,0.30)',
        color: '#cffafe',
        boxShadow: '0 0 0 1px rgba(34,211,238,0.14), 0 0 16px rgba(34,211,238,0.14)',
      }
    : selStyle;

  const ROUTE_FLEET_COLORS = ['#a78bfa', '#fb923c', '#34d399', '#f472b6', '#60a5fa'];
  const selectedFleet = routeFleetId ? (playerFleets.find(f => f.id === routeFleetId) ?? null) : null;
  const selectedFleetColor = selectedFleet
    ? ROUTE_FLEET_COLORS[playerFleets.indexOf(selectedFleet) % ROUTE_FLEET_COLORS.length]
    : null;
  const routeOriginSystem = useMemo(
    () => allSystems.find(system => system.id === routeFrom) ?? allSystems.find(system => system.id === currentSystemId) ?? null,
    [allSystems, currentSystemId, routeFrom],
  );
  const selectedFleetRange = useMemo(() => {
    if (!selectedFleet) return fleetJumpRangeLY;
    const ships = fleetShips.filter(s => selectedFleet.shipIds.includes(s.id));
    let maxBonus = 0;
    for (const ship of ships) {
      const hull = HULL_DEFINITIONS[ship.shipDefinitionId];
      if (hull && hull.warpSpeedBonus > maxBonus) maxBonus = hull.warpSpeedBonus;
    }
    return Math.round(DEFAULT_JUMP_RANGE_LY + maxBonus * 100);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedFleet?.id, fleetShips]);

  const FILTER_OPTIONS: Array<{ value: RouteSecurityFilter; label: string; color: string; title: string }> = [
    { value: 'shortest',   label: 'Shortest',   color: '#22d3ee', title: 'Fewest hops — ignores security' },
    { value: 'avoid-null', label: 'No Null',    color: '#fb923c', title: 'Avoid nullsec intermediate nodes' },
    { value: 'avoid-low',  label: 'No Low',     color: '#4ade80', title: 'Highsec only (avoid lowsec + null)' },
    { value: 'safest',     label: 'Safest',     color: '#a78bfa', title: 'Dijkstra: strongly prefers highsec, avoids dangerous systems' },
  ];
  const fleetOptions = useMemo<DropdownOption[]>(() => (
    playerFleets.map(fleet => {
      const system = allSystems.find(s => s.id === fleet.currentSystemId);
      const inTransit = !!fleet.fleetOrder;
      const tone: DropdownOption['tone'] = inTransit ? 'amber' : 'cyan';
      return {
        value: fleet.id,
        label: fleet.name,
        description: system ? `Origin ${system.name}` : 'Unknown origin',
        meta: inTransit ? 'IN TRANSIT' : 'READY',
        group: inTransit ? 'In Transit' : 'Ready',
        tone,
        badges: system ? [{ label: secLabel(system.security), color: secColor(system.security) }] : undefined,
        keywords: [fleet.name, system?.name ?? '', system?.security ?? ''],
      };
    })
  ), [allSystems, playerFleets]);
  const originOptions = useMemo<DropdownOption[]>(() => {
    const currentSystem = allSystems.find(s => s.id === currentSystemId);
    const known = knownSystems.filter(s => s.id !== currentSystemId).map(system => {
      const tone: DropdownOption['tone'] = system.security === 'highsec' ? 'emerald' : system.security === 'lowsec' ? 'amber' : 'rose';
      return {
        value: system.id,
        label: system.name,
        description: `${secLabel(system.security)} origin`,
        group: secLabel(system.security),
        tone,
        badges: [{ label: system.starType, color: '#94a3b8' }],
        keywords: [system.name, system.security, system.starType],
      };
    });
    return currentSystem
      ? [{
          value: currentSystem.id,
          label: currentSystem.name,
          description: 'Current location',
          group: 'Current',
          tone: 'cyan',
          badges: [{ label: secLabel(currentSystem.security), color: secColor(currentSystem.security) }],
          keywords: [currentSystem.name, currentSystem.security, 'current'],
        }, ...known]
      : known;
  }, [allSystems, currentSystemId, knownSystems]);
  const destinationIntel = useMemo(() => {
    const originSector = routeOriginSystem ? systemSector(routeOriginSystem) : null;
    return allSystems.map(system => {
      const isVisited = !!visitedSystems[system.id];
      const beltCount = system.bodies.filter(body => body.type === 'asteroid-belt').length;
      const threatCount = isVisited ? getAliveNpcGroupsInSystem(gameState, system.id).length : 0;
      const distanceLy = routeOriginSystem ? unitsToLy(systemDistance(routeOriginSystem, system)) : 0;
      const directReachable = routeOriginSystem !== null && system.id !== routeOriginSystem.id && distanceLy <= jumpRangeLY;
      const sameRegion = routeOriginSystem !== null && system.regionName === routeOriginSystem.regionName;
      const sameSector = originSector ? (() => {
        const destinationSector = systemSector(system);
        return destinationSector.gx === originSector.gx && destinationSector.gy === originSector.gy;
      })() : false;

      return {
        system,
        isVisited,
        beltCount,
        threatCount,
        distanceLy,
        directReachable,
        sameRegion,
        sameSector,
      };
    });
  }, [allSystems, gameState, jumpRangeLY, routeOriginSystem, visitedSystems]);

  const destinationOptions = useMemo<DropdownOption[]>(() => {
    const filtered = destinationIntel.filter(({ system, isVisited, beltCount, threatCount, directReachable, sameRegion }) => {
      if (routeOriginSystem && system.id === routeOriginSystem.id) return false;
      if (destinationSecurity !== 'all' && system.security !== destinationSecurity) return false;
      if (destinationVisitedOnly && !isVisited) return false;
      if (destinationReachableOnly && !directReachable) return false;
      if (destinationStationsOnly && !system.stationId) return false;
      if (destinationBeltsOnly && beltCount === 0) return false;
      if (destinationSameRegionOnly && !sameRegion) return false;
      if (destinationThreat === 'quiet' && threatCount > 0) return false;
      if (destinationThreat === 'hostile' && threatCount === 0) return false;
      return true;
    });

    filtered.sort((left, right) => {
      if (destinationSort === 'distance-asc') {
        const distanceDelta = left.distanceLy - right.distanceLy;
        if (Math.abs(distanceDelta) > 0.01) return distanceDelta;
        return left.system.name.localeCompare(right.system.name);
      }
      if (destinationSort === 'security') {
        const securityRank = { highsec: 0, lowsec: 1, nullsec: 2 } as const;
        const securityDelta = securityRank[left.system.security] - securityRank[right.system.security];
        if (securityDelta !== 0) return securityDelta;
        return left.system.name.localeCompare(right.system.name);
      }
      if (destinationSort === 'belts') {
        if (right.beltCount !== left.beltCount) return right.beltCount - left.beltCount;
        return left.distanceLy - right.distanceLy;
      }
      if (destinationSort === 'threat') {
        if (right.threatCount !== left.threatCount) return right.threatCount - left.threatCount;
        return left.distanceLy - right.distanceLy;
      }
      return left.system.name.localeCompare(right.system.name);
    });

    const mapped: DropdownOption[] = filtered.map(({ system, isVisited, beltCount, threatCount, distanceLy, directReachable, sameRegion, sameSector }) => {
      const tone: DropdownOption['tone'] = !isVisited
        ? 'slate'
        : system.security === 'highsec'
          ? 'emerald'
          : system.security === 'lowsec'
            ? 'amber'
            : 'rose';
      const badges = [
        { label: secLabel(system.security), color: secColor(system.security) },
        { label: `${distanceLy.toFixed(1)} LY`, color: '#67e8f9' },
        { label: system.starType, color: '#94a3b8' },
      ];
      if (beltCount > 0) badges.push({ label: `${beltCount} Belts`, color: '#fb923c' });
      if (system.stationId) badges.push({ label: 'Station', color: '#a78bfa' });
      if (threatCount > 0) badges.push({ label: `${threatCount} Threat`, color: '#f87171' });
      if (directReachable) badges.push({ label: 'Direct', color: '#34d399' });

      return {
        value: system.id,
        label: `${isVisited ? '' : '? '}${system.name}`,
        description: [
          isVisited ? secLabel(system.security) : 'Unvisited',
          sameRegion ? 'same region' : sameSector ? 'same sector' : system.regionName,
        ].join(' · '),
        meta: [
          `${distanceLy.toFixed(1)} LY`,
          directReachable ? 'direct jump' : 'multi-hop',
        ].join(' · '),
        group: isVisited ? secLabel(system.security) : 'Unvisited',
        tone,
        badges,
        keywords: [
          system.name,
          system.security,
          system.starType,
          system.regionName,
          isVisited ? 'visited' : 'unvisited',
          directReachable ? 'reachable direct' : 'multi hop',
          system.stationId ? 'station' : 'no station',
          beltCount > 0 ? 'belts mining' : 'no belts',
          threatCount > 0 ? 'hostile threat pirates' : 'quiet safe',
          sameRegion ? 'same region' : '',
          sameSector ? 'same sector' : '',
        ].filter(Boolean),
      };
    });

    if (routeTo && !mapped.some(option => option.value === routeTo)) {
      const selected = destinationIntel.find(entry => entry.system.id === routeTo);
      if (selected) {
        mapped.unshift({
          value: selected.system.id,
          label: `${selected.isVisited ? '' : '? '}${selected.system.name}`,
          description: 'Currently selected destination · hidden by active filters',
          meta: `${selected.distanceLy.toFixed(1)} LY`,
          group: 'Selected',
          tone: (selected.isVisited ? 'cyan' : 'slate') as DropdownOption['tone'],
          badges: [{ label: 'Selected', color: '#22d3ee' }],
          keywords: [selected.system.name, 'selected'],
        });
      }
    }

    return mapped;
  }, [
    destinationBeltsOnly,
    destinationIntel,
    destinationReachableOnly,
    destinationSameRegionOnly,
    destinationSecurity,
    destinationSort,
    destinationStationsOnly,
    destinationThreat,
    destinationVisitedOnly,
    routeOriginSystem,
    routeTo,
  ]);
  const selectedDestinationOption = useMemo(
    () => destinationOptions.find(option => option.value === routeTo) ?? null,
    [destinationOptions, routeTo],
  );
  const destinationFilterCount = [
    destinationSecurity !== 'all',
    destinationThreat !== 'all',
    destinationVisitedOnly,
    destinationReachableOnly,
    destinationStationsOnly,
    destinationBeltsOnly,
    destinationSameRegionOnly,
  ].filter(Boolean).length;
  const destinationMenuHeader = useMemo(() => {
    const toggleChipStyle = (active: boolean, color: string): React.CSSProperties => ({
      padding: '4px 8px',
      borderRadius: 999,
      border: `1px solid ${active ? `${color}55` : 'rgba(51,65,85,0.65)'}`,
      background: active ? `${color}14` : 'rgba(15,23,42,0.72)',
      color: active ? color : '#94a3b8',
      fontSize: 8,
      fontWeight: 600,
      letterSpacing: '0.08em',
      textTransform: 'uppercase',
      cursor: 'pointer',
    });

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <span style={{ fontSize: 8, color: '#64748b', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Destination Filters</span>
          <span style={{ fontSize: 8, color: destinationFilterCount > 0 ? '#67e8f9' : '#475569', fontFamily: 'JetBrains Mono, monospace' }}>
            {destinationOptions.length} matches · {destinationFilterCount > 0 ? `${destinationFilterCount} active` : 'broad scan'}
          </span>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {[
            { value: 'distance-asc', label: 'Nearest', color: '#22d3ee' },
            { value: 'name', label: 'A-Z', color: '#94a3b8' },
            { value: 'security', label: 'Security', color: '#34d399' },
            { value: 'belts', label: 'Belts', color: '#fb923c' },
            { value: 'threat', label: 'Threat', color: '#f87171' },
          ].map(chip => (
            <button
              key={chip.value}
              type="button"
              onClick={() => setDestinationSort(chip.value as DestinationSortMode)}
              style={toggleChipStyle(destinationSort === chip.value, chip.color)}
            >
              {chip.label}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {[
            { value: 'all', label: 'Any Sec', color: '#22d3ee' },
            { value: 'highsec', label: 'High', color: '#34d399' },
            { value: 'lowsec', label: 'Low', color: '#fb923c' },
            { value: 'nullsec', label: 'Null', color: '#f87171' },
          ].map(chip => (
            <button
              key={chip.value}
              type="button"
              onClick={() => setDestinationSecurity(chip.value as DestinationSecurityFilter)}
              style={toggleChipStyle(destinationSecurity === chip.value, chip.color)}
            >
              {chip.label}
            </button>
          ))}
          {[
            { value: 'all', label: 'Any Threat', color: '#22d3ee' },
            { value: 'quiet', label: 'Quiet', color: '#34d399' },
            { value: 'hostile', label: 'Hostile', color: '#f87171' },
          ].map(chip => (
            <button
              key={chip.value}
              type="button"
              onClick={() => setDestinationThreat(chip.value as DestinationThreatFilter)}
              style={toggleChipStyle(destinationThreat === chip.value, chip.color)}
            >
              {chip.label}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {[
            { label: 'Visited', active: destinationVisitedOnly, onClick: () => setDestinationVisitedOnly(value => !value), color: '#22d3ee' },
            { label: 'Direct', active: destinationReachableOnly, onClick: () => setDestinationReachableOnly(value => !value), color: '#34d399' },
            { label: 'Stations', active: destinationStationsOnly, onClick: () => setDestinationStationsOnly(value => !value), color: '#a78bfa' },
            { label: 'Belts', active: destinationBeltsOnly, onClick: () => setDestinationBeltsOnly(value => !value), color: '#fb923c' },
            { label: 'Same Region', active: destinationSameRegionOnly, onClick: () => setDestinationSameRegionOnly(value => !value), color: '#67e8f9' },
          ].map(chip => (
            <button
              key={chip.label}
              type="button"
              onClick={chip.onClick}
              style={toggleChipStyle(chip.active, chip.color)}
            >
              {chip.label}
            </button>
          ))}
        </div>
      </div>
    );
  }, [
    destinationBeltsOnly,
    destinationFilterCount,
    destinationOptions.length,
    destinationReachableOnly,
    destinationSameRegionOnly,
    destinationSecurity,
    destinationSort,
    destinationStationsOnly,
    destinationThreat,
    destinationVisitedOnly,
  ]);

  const renderDestinationDetail = useCallback((option: DropdownOption | null) => {
    if (!option) {
      return <div style={{ fontSize: 10, color: '#64748b' }}>Hover a destination to inspect travel, risk, and mining intel.</div>;
    }
    const intel = destinationIntel.find(entry => entry.system.id === option.value);
    if (!intel) {
      return <div style={{ fontSize: 10, color: '#64748b' }}>Destination intel unavailable.</div>;
    }

    const { system, isVisited, distanceLy, directReachable, beltCount, threatCount, sameRegion, sameSector } = intel;
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#e2e8f0' }}>{system.name}</div>
          <div style={{ marginTop: 2, fontSize: 9, color: '#64748b' }}>{system.regionName}</div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 6 }}>
          <div style={{ padding: '6px 8px', borderRadius: 8, border: '1px solid rgba(51,65,85,0.7)', background: 'rgba(15,23,42,0.62)' }}>
            <div style={{ fontSize: 8, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Distance</div>
            <div style={{ marginTop: 2, fontSize: 11, color: '#67e8f9', fontFamily: 'JetBrains Mono, monospace' }}>{distanceLy.toFixed(1)} LY</div>
          </div>
          <div style={{ padding: '6px 8px', borderRadius: 8, border: '1px solid rgba(51,65,85,0.7)', background: 'rgba(15,23,42,0.62)' }}>
            <div style={{ fontSize: 8, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Security</div>
            <div style={{ marginTop: 2, fontSize: 11, color: secColor(system.security) }}>{secLabel(system.security)}</div>
          </div>
          <div style={{ padding: '6px 8px', borderRadius: 8, border: '1px solid rgba(51,65,85,0.7)', background: 'rgba(15,23,42,0.62)' }}>
            <div style={{ fontSize: 8, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Travel</div>
            <div style={{ marginTop: 2, fontSize: 11, color: directReachable ? '#34d399' : '#fbbf24' }}>{directReachable ? 'Direct jump' : 'Route solve needed'}</div>
          </div>
          <div style={{ padding: '6px 8px', borderRadius: 8, border: '1px solid rgba(51,65,85,0.7)', background: 'rgba(15,23,42,0.62)' }}>
            <div style={{ fontSize: 8, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Threats</div>
            <div style={{ marginTop: 2, fontSize: 11, color: threatCount > 0 ? '#f87171' : '#94a3b8' }}>{threatCount > 0 ? `${threatCount} active` : 'Quiet'}</div>
          </div>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          <span style={{ fontSize: 8, padding: '2px 6px', borderRadius: 999, border: '1px solid rgba(51,65,85,0.7)', color: '#94a3b8', background: 'rgba(15,23,42,0.62)' }}>{isVisited ? 'Visited' : 'Unvisited'}</span>
          <span style={{ fontSize: 8, padding: '2px 6px', borderRadius: 999, border: '1px solid rgba(51,65,85,0.7)', color: beltCount > 0 ? '#fb923c' : '#94a3b8', background: 'rgba(15,23,42,0.62)' }}>{beltCount > 0 ? `${beltCount} asteroid belts` : 'No belts'}</span>
          <span style={{ fontSize: 8, padding: '2px 6px', borderRadius: 999, border: '1px solid rgba(51,65,85,0.7)', color: system.stationId ? '#a78bfa' : '#94a3b8', background: 'rgba(15,23,42,0.62)' }}>{system.stationId ? 'Station' : 'No station'}</span>
          <span style={{ fontSize: 8, padding: '2px 6px', borderRadius: 999, border: '1px solid rgba(51,65,85,0.7)', color: sameRegion || sameSector ? '#22d3ee' : '#94a3b8', background: 'rgba(15,23,42,0.62)' }}>{sameRegion ? 'Same region' : sameSector ? 'Same sector' : 'Remote destination'}</span>
        </div>
      </div>
    );
  }, [destinationIntel]);

  // Compute security breakdown for active route
  const secCount = activeRoute ? {
    highsec: activeRoute.legSecurity.filter(s => s === 'highsec').length,
    lowsec:  activeRoute.legSecurity.filter(s => s === 'lowsec').length,
    nullsec: activeRoute.legSecurity.filter(s => s === 'nullsec').length,
  } : null;
  const estimatedTravelSeconds = useMemo(() => {
    if (!activeRoute) return 0;
    const routeWarpMultiplier = selectedFleet
      ? getFleetTransitWarpMultiplier(gameState, selectedFleet.shipIds, selectedFleet)
      : 1;
    let total = 0;
    for (let index = 0; index < activeRoute.path.length - 1; index += 1) {
      const from = allSystems.find(system => system.id === activeRoute.path[index]);
      const to = allSystems.find(system => system.id === activeRoute.path[index + 1]);
      if (!from || !to) continue;
      total += calcWarpDuration(gameState, from, to, routeWarpMultiplier);
    }
    return total;
  }, [activeRoute, allSystems, gameState, selectedFleet]);
  const averageJumpSeconds = activeRoute && activeRoute.hops > 0 ? estimatedTravelSeconds / activeRoute.hops : 0;
  const routeExposure = secCount
    ? secCount.nullsec > 0
      ? 'High exposure'
      : secCount.lowsec > 0
        ? 'Moderate exposure'
        : 'Low exposure'
    : 'Unknown';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ fontSize: 8, color: '#334155', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 2 }}>
        Route Planner
      </div>

      {/* Fleet selector */}
      <div
        data-tutorial-anchor={tutorialDispatchStep ? 'starmap-route-fleet' : undefined}
        className={tutorialDispatchStep ? 'tutorial-breathe relative z-[74]' : undefined}
        style={tutorialDispatchStep ? tutorialFocusWrapStyle : undefined}
      >
        <div style={{ fontSize: 8, color: '#475569', marginBottom: 3 }}>Fleet (as origin)</div>
        <GameDropdown
          value={routeFleetId ?? ''}
          onChange={nextValue => onSetFleet(nextValue || null)}
          options={fleetOptions}
          placeholder="Select fleet..."
          emptyOptionLabel="Manual origin"
          emptyOptionDescription="Do not bind the route to a fleet yet"
          searchPlaceholder="Search fleets or staging systems..."
          size="compact"
          menuWidth={320}
          buttonStyle={tutorialDropdownStyle}
        />
      </div>

      <div>
        <div style={{ fontSize: 8, color: '#475569', marginBottom: 3 }}>Origin</div>
        {selectedFleet ? (
          <div style={{
            padding: '4px 8px', fontSize: 9, borderRadius: 3,
            border: `1px solid ${selectedFleetColor}40`,
            background: `${selectedFleetColor}12`,
            color: selectedFleetColor ?? '#94a3b8',
            display: 'flex', alignItems: 'center', gap: 6,
          }}>
            <span style={{ fontSize: 10 }}>▶</span>
            <span style={{ fontWeight: 600 }}>{selectedFleet.name}</span>
            <span style={{ color: '#64748b', fontSize: 8 }}>
              @ {allSystems.find(s => s.id === selectedFleet.currentSystemId)?.name ?? '?'}
            </span>
          </div>
        ) : (
          <GameDropdown
            value={routeFrom ?? ''}
            onChange={onSetFrom}
            options={originOptions}
            placeholder="Select origin..."
            emptyOptionLabel="No origin selected"
            emptyOptionDescription="Pick a manual starting system"
            searchPlaceholder="Search visited origin systems..."
            size="compact"
            menuWidth={320}
            buttonStyle={selStyle}
          />
        )}
      </div>

      <div
        data-tutorial-anchor={tutorialDispatchStep ? 'starmap-route-destination' : undefined}
        className={tutorialDispatchStep ? 'tutorial-breathe relative z-[74]' : undefined}
        style={tutorialDispatchStep ? tutorialFocusWrapStyle : undefined}
      >
        <div style={{ fontSize: 8, color: '#475569', marginBottom: 3 }}>Destination</div>
        <GameDropdown
          value={routeTo ?? ''}
          onChange={onSetTo}
          options={destinationOptions}
          placeholder="Select destination..."
          emptyOptionLabel="No destination selected"
          emptyOptionDescription="Pick a target system to solve a route"
          searchPlaceholder="Search all known and unknown systems..."
          size="compact"
          menuWidth={420}
          menuHeader={destinationMenuHeader}
          renderDetail={renderDestinationDetail}
          detailTitle={selectedDestinationOption?.label ? `${selectedDestinationOption.label} intel` : 'Destination intel'}
          detailEmpty="Hover a destination to inspect it before selecting."
          detailPlacement="bottom"
          buttonStyle={tutorialDropdownStyle}
        />
        <div style={{ fontSize: 7, color: tutorialDispatchStep ? '#67e8f9' : '#334155', marginTop: 4, lineHeight: 1.45 }}>
          {tutorialDispatchStep && tutorialFleetContext.targetSystemName
            ? `Route the starter fleet into ${tutorialFleetContext.targetSystemName}, then solve and dispatch the route.`
            : 'Tip: sort by distance, narrow by security or threat profile, then click a system on the map at any time to set it as the destination.'}
        </div>
      </div>

      <div>
        <div style={{ fontSize: 8, color: '#475569', marginBottom: 3, display: 'flex', justifyContent: 'space-between' }}>
          <span>Jump Range: <span style={{ color: '#94a3b8', fontFamily: 'monospace' }}>{jumpRangeLY} LY</span></span>
          <span style={{ color: selectedFleetRange <= jumpRangeLY ? '#4ade80' : '#fb923c', fontFamily: 'monospace', fontSize: 7 }}>
            {selectedFleet ? `${selectedFleet.name}:` : 'Fleet max:'} {selectedFleetRange} LY
          </span>
        </div>
        <div style={{ position: 'relative' }}>
          <input type="range" min={5} max={60} step={1} value={jumpRangeLY}
            onChange={e => onSetJumpRange(parseInt(e.target.value, 10))}
            style={{ width: '100%', accentColor: '#22d3ee', cursor: 'pointer' }} />
          {/* Fleet cap marker */}
          <div style={{
            position: 'absolute', top: 0,
            left: `${((selectedFleetRange - 5) / 55) * 100}%`,
            width: 2, height: '100%',
            background: '#4ade80', opacity: 0.5, pointerEvents: 'none',
            transform: 'translateX(-50%)',
          }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 8, color: '#334155' }}>
          <span>5 LY</span><span>60 LY</span>
        </div>
        {jumpRangeLY > selectedFleetRange && (
          <div style={{ fontSize: 8, color: '#fb923c', marginTop: 3 }}>
            ⚠ Exceeds fleet capability — route may be unreachable
          </div>
        )}
      </div>

      {/* Security filter */}
      <div>
        <div style={{ fontSize: 8, color: '#475569', marginBottom: 4 }}>Route Filter</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 3 }}>
          {FILTER_OPTIONS.map(opt => (
            <button
              key={opt.value}
              onClick={() => onSetFilter(opt.value)}
              title={opt.title}
              style={{
                padding: '6px 5px', fontSize: 8, fontWeight: 700,
                border: `1px solid ${routeFilter === opt.value ? opt.color + '55' : 'rgba(30,40,60,0.6)'}`,
                borderRadius: 6, cursor: 'pointer',
                background: routeFilter === opt.value ? opt.color + '18' : 'rgba(6,9,20,0.4)',
                color: routeFilter === opt.value ? opt.color : '#334155',
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <div style={{ fontSize: 7, color: '#1e293b', marginTop: 3 }}>
          {FILTER_OPTIONS.find(o => o.value === routeFilter)?.title}
        </div>
        <div style={{ fontSize: 7, color: '#334155', marginTop: 3, lineHeight: 1.5 }}>
          Travel time is estimated hop-by-hop. Faster postures cut jumps, safer postures reduce exposure.
        </div>
      </div>

      <div style={{ display: 'flex', gap: 4 }}>
        <button onClick={onComputeRoute} disabled={!routeFrom || !routeTo}
          data-tutorial-anchor={tutorialDispatchStep ? 'starmap-route-find' : undefined}
          className={`legacy-panel-btn ${tutorialDispatchStep ? 'tutorial-breathe relative z-[74]' : ''}`.trim()}
          style={{
            flex: 1, padding: '8px 10px', fontSize: 9, fontWeight: 700,
            '--legacy-border': 'rgba(34,211,238,0.3)',
            '--legacy-bg': routeFrom && routeTo ? 'rgba(8,51,68,0.4)' : 'rgba(6,9,20,0.2)',
            '--legacy-color': routeFrom && routeTo ? '#22d3ee' : '#334155',
            '--legacy-hover-border': 'rgba(103,232,249,0.52)',
            '--legacy-hover-bg': 'rgba(8,51,68,0.56)',
            '--legacy-hover-color': '#cffafe',
            '--legacy-hover-shadow': '0 0 12px rgba(34,211,238,0.18)',
            ...tutorialButtonStyle,
          } as React.CSSProperties}
        >
          Find Route
        </button>
        {activeRoute && (
          <button onClick={onClearRoute} className="legacy-panel-btn" style={{ padding: '8px 10px', fontSize: 9, '--legacy-border': 'rgba(239,68,68,0.25)', '--legacy-bg': 'rgba(127,29,29,0.15)', '--legacy-color': '#f87171', '--legacy-hover-border': 'rgba(248,113,113,0.48)', '--legacy-hover-bg': 'rgba(127,29,29,0.3)', '--legacy-hover-color': '#fecaca', '--legacy-hover-shadow': '0 0 10px rgba(239,68,68,0.14)' } as React.CSSProperties}>
            Clear
          </button>
        )}
      </div>

      {activeRoute && (
        <div data-tutorial-anchor={tutorialDispatchStep ? 'starmap-route-summary' : undefined} style={{ padding: '10px 12px', borderRadius: 8, border: '1px solid rgba(34,211,238,0.2)', background: 'linear-gradient(180deg, rgba(8,51,68,0.22), rgba(4,6,18,0.88))' }}>
          <div style={{ fontSize: 9, color: '#22d3ee', fontWeight: 700, marginBottom: 8, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Route Summary</div>

          {/* Dispatch button */}
          {selectedFleet && (
            <button
              onClick={() => onDispatch(selectedFleet.id)}
              data-tutorial-anchor={tutorialDispatchStep ? 'starmap-route-dispatch' : undefined}
              className={`legacy-panel-btn ${tutorialDispatchStep ? 'tutorial-breathe relative z-[74]' : ''}`.trim()}
              style={{
                width: '100%', padding: '8px 10px', fontSize: 9, fontWeight: 700,
                '--legacy-border': `${selectedFleetColor}55`,
                '--legacy-bg': `${selectedFleetColor}20`,
                '--legacy-color': selectedFleetColor ?? '#a78bfa',
                '--legacy-hover-border': `${selectedFleetColor}88`,
                '--legacy-hover-bg': `${selectedFleetColor}32`,
                '--legacy-hover-color': selectedFleetColor ?? '#c4b5fd',
                '--legacy-hover-shadow': `0 0 12px ${selectedFleetColor}22`,
                marginBottom: 8,
                letterSpacing: '0.06em',
                boxShadow: tutorialDispatchStep ? '0 0 0 1px rgba(34,211,238,0.16), 0 0 18px rgba(34,211,238,0.16)' : undefined,
              } as React.CSSProperties}
            >
              ▶ Dispatch {selectedFleet.name} →
            </button>
          )}
          {dispatchFeedback && (
            <div style={{
              marginBottom: 8,
              padding: '7px 8px',
              fontSize: 8,
              lineHeight: 1.5,
              borderRadius: 6,
              border: dispatchFeedback.tone === 'success'
                ? '1px solid rgba(74,222,128,0.22)'
                : '1px solid rgba(248,113,113,0.22)',
              background: dispatchFeedback.tone === 'success'
                ? 'rgba(20,83,45,0.18)'
                : 'rgba(127,29,29,0.18)',
              color: dispatchFeedback.tone === 'success' ? '#86efac' : '#fca5a5',
            }}>
              {dispatchFeedback.text}
            </div>
          )}

          {/* Summary stats */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginBottom: 8 }}>
            {[
              { l: 'Jumps',       v: activeRoute.hops },
              { l: 'Distance',    v: `${activeRoute.totalLy.toFixed(1)} LY` },
              { l: 'Sectors',     v: activeRoute.sectorPath.length },
              { l: 'Travel Time', v: formatEta(estimatedTravelSeconds) },
              { l: 'Avg / jump',  v: activeRoute.hops > 0 ? formatEta(averageJumpSeconds) : '0s' },
              { l: 'Exposure',    v: routeExposure },
            ].map(r => (
              <div key={r.l} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9 }}>
                <span style={{ color: '#475569' }}>{r.l}</span>
                <span style={{ color: '#94a3b8', fontFamily: 'monospace' }}>{r.v}</span>
              </div>
            ))}
          </div>

          {/* Security breakdown */}
          {secCount && (
            <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
              {secCount.highsec > 0 && (
                <div style={{ flex: 1, textAlign: 'center', padding: '2px 4px', borderRadius: 3, background: 'rgba(74,222,128,0.08)', border: '1px solid rgba(74,222,128,0.2)' }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: '#4ade80' }}>{secCount.highsec}</div>
                  <div style={{ fontSize: 7, color: '#4ade8066' }}>HIGH</div>
                </div>
              )}
              {secCount.lowsec > 0 && (
                <div style={{ flex: 1, textAlign: 'center', padding: '2px 4px', borderRadius: 3, background: 'rgba(251,146,60,0.08)', border: '1px solid rgba(251,146,60,0.25)' }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: '#fb923c' }}>{secCount.lowsec}</div>
                  <div style={{ fontSize: 7, color: '#fb923c66' }}>LOW</div>
                </div>
              )}
              {secCount.nullsec > 0 && (
                <div style={{ flex: 1, textAlign: 'center', padding: '2px 4px', borderRadius: 3, background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.25)' }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: '#f87171' }}>{secCount.nullsec}</div>
                  <div style={{ fontSize: 7, color: '#f8717166' }}>NULL</div>
                </div>
              )}
            </div>
          )}

          {/* Sector-by-sector breakdown */}
          <div style={{ fontSize: 8, color: '#334155', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 5 }}>
            Sector transit
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginBottom: 8 }}>
            {activeRoute.sectorPath.map((sec, i) => {
              const sysInSector = activeRoute.path.filter(id => {
                const s = allSystems.find(x => x.id === id);
                if (!s) return false;
                const ss = systemSector(s);
                return ss.gx === sec.gx && ss.gy === sec.gy;
              });
              const jumpsHere = Math.max(0, sysInSector.length - 1);
              const isLast = i === activeRoute.sectorPath.length - 1;
              return (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <div style={{ width: 5, height: 5, borderRadius: '50%',
                    background: i === 0 ? '#22d3ee' : isLast ? '#fbbf24' : 'rgba(34,211,238,0.4)',
                    flexShrink: 0,
                  }} />
                  <span style={{ fontSize: 9, color: '#64748b', fontFamily: 'monospace', flex: 1 }}>
                    [{sec.gx},{sec.gy}]
                  </span>
                  {jumpsHere > 0 && (
                    <span style={{ fontSize: 8, color: '#334155', fontFamily: 'monospace' }}>
                      {jumpsHere} jump{jumpsHere !== 1 ? 's' : ''}
                    </span>
                  )}
                  {!isLast && (
                    <span style={{ fontSize: 7, color: '#1e293b' }}>→</span>
                  )}
                </div>
              );
            })}
          </div>

          {/* System-level hop list */}
          <div style={{ fontSize: 8, color: '#334155', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 4 }}>
            Jump sequence
          </div>
          <div style={{ fontSize: 8, lineHeight: 1.8, maxHeight: 80, overflowY: 'auto' }}>
            {activeRoute.path.map((id, i) => {
              const s = allSystems.find(x => x.id === id);
              const sec = i > 0 ? activeRoute.legSecurity[i - 1] : undefined;
              const sc = sec === 'nullsec' ? '#f87171' : sec === 'lowsec' ? '#fb923c' : '#64748b';
              return (
                <span key={id}>
                  {i > 0 && <span style={{ color: '#1e293b', margin: '0 2px' }}>→</span>}
                  <span style={{ color: sc }}>{s?.name ?? id}</span>
                </span>
              );
            })}
          </div>
        </div>
      )}

      {routeComputed && !activeRoute && routeFrom && routeTo && (
        <div style={{ fontSize: 9, color: '#f87171' }}>
          No route found. Try increasing jump range or changing the route filter.
        </div>
      )}
    </div>
  );
}

// ─── Z Layer Controls ─────────────────────────────────────────────────────────

function ZLayerControl({ zSlice, onUp, onDown, onReset }: {
  zSlice: number; onUp: () => void; onDown: () => void; onReset: () => void;
}) {
  const bs: React.CSSProperties = {
    width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 10, fontWeight: 700,
    border: '1px solid rgba(22,30,52,0.8)', borderRadius: 4,
    background: 'rgba(6,9,20,0.9)', color: '#475569', cursor: 'pointer',
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
      <div style={{ fontSize: 7, color: '#334155', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Z</div>
      <button className="legacy-panel-btn" style={bs} onClick={onUp}    title="Move Up (higher Z slice)">△</button>
      <button className="legacy-panel-btn" style={bs} onClick={onReset} title="Galactic plane (Z=50%)">⌂</button>
      <button className="legacy-panel-btn" style={bs} onClick={onDown}  title="Move Down (lower Z slice)">▽</button>
      <div style={{ fontSize: 7, color: '#334155', fontFamily: 'monospace', textAlign: 'center', marginTop: 2 }}>
        {(zSlice * 100).toFixed(0)}
      </div>
    </div>
  );
}

function StarSystemHoverCard({
  hover,
  sys,
  allSystems,
  currentSystem,
  visitedSystems,
  activeRoute,
  fleetShips,
  playerFleets,
}: {
  hover: HoverPreview;
  sys: StarSystem;
  allSystems: StarSystem[];
  currentSystem: StarSystem;
  visitedSystems: Record<string, boolean>;
  activeRoute: ActiveRoute | null;
  fleetShips: ShipInstance[];
  playerFleets: PlayerFleet[];
}) {
  const gameState = useGameStore(s => s.state);
  const isVisited = !!visitedSystems[sys.id];
  const isCurrent = sys.id === currentSystem.id;
  const starColor = STAR_COL[sys.starType] ?? '#fff4e8';
  const belts = sys.bodies.filter(body => body.type === 'asteroid-belt').length;
  const planets = sys.bodies.filter(body => body.type !== 'asteroid-belt' && body.type !== 'moon').length;
  const hasNullOres = sys.bodies.some(body => body.beltIds.some(id => id === 'belt-arkonite' || id === 'belt-crokitite'));
  const threatGroups = isVisited ? getAliveNpcGroupsInSystem(gameState, sys.id) : [];
  const fleetsHere = playerFleets.filter(fleet => fleet.currentSystemId === sys.id).length;
  const shipsHere = fleetShips.filter(ship => ship.systemId === sys.id).length;
  const routeHopIndex = activeRoute ? activeRoute.path.indexOf(sys.id) : -1;
  const distLY = unitsToLy(systemDistance(currentSystem, sys));
  const TRADE_MINERALS = ['ferrite','silite','vexirite','isorium','noxium','zyridium','megacite','voidsteel'];
  const tradeOpportunities = isVisited && !isCurrent
    ? TRADE_MINERALS
        .map(resourceId => ({
          resourceId,
          buyPrice: getLocalPrice(gameState, resourceId, currentSystem.id),
          sellPrice: getLocalPrice(gameState, resourceId, sys.id),
        }))
        .filter(opportunity => opportunity.buyPrice > 0 && opportunity.sellPrice > opportunity.buyPrice * 1.05)
        .sort((a, b) => (b.sellPrice / b.buyPrice) - (a.sellPrice / a.buyPrice))
        .slice(0, 2)
    : [];

  let left = hover.x + 18;
  let top = hover.y - 88;
  if (left + 260 > window.innerWidth - 260) left = hover.x - 278;
  if (top < 12) top = 12;

  return (
    <div style={{
      position: 'absolute',
      left,
      top,
      width: 260,
      pointerEvents: 'none',
      background: 'rgba(4,6,22,0.96)',
      border: `1px solid ${isVisited ? `${starColor}40` : 'rgba(51,65,85,0.45)'}`,
      borderRadius: 8,
      boxShadow: '0 18px 42px rgba(0,0,0,0.55)',
      overflow: 'hidden',
      zIndex: 12,
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 10,
        padding: '10px 12px 8px',
        borderBottom: '1px solid rgba(15,23,42,0.85)',
        background: 'linear-gradient(180deg, rgba(15,23,42,0.68), rgba(4,6,22,0.2))',
      }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 8, color: '#334155', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 3 }}>
            {isVisited ? 'System Hover' : 'Unknown Signature'}
          </div>
          <div style={{ fontSize: 12, fontWeight: 700, color: isVisited ? '#f8fafc' : '#64748b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {isVisited ? sys.name : '??? Unknown System'}
          </div>
        </div>
        <div style={{
          flexShrink: 0,
          fontSize: 9,
          padding: '2px 7px',
          borderRadius: 999,
          color: isVisited ? secColor(sys.security) : '#475569',
          border: `1px solid ${isVisited ? `${secColor(sys.security)}35` : 'rgba(71,85,105,0.35)'}`,
          background: isVisited ? `${secColor(sys.security)}14` : 'rgba(15,23,42,0.6)',
        }}>
          {isVisited ? secLabel(sys.security) : 'Unscanned'}
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '10px 12px 12px' }}>
        {isVisited ? (
          <>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 9, color: '#94a3b8', border: '1px solid rgba(51,65,85,0.65)', borderRadius: 999, padding: '2px 7px', background: 'rgba(15,23,42,0.45)' }}>
                {starTypeGlyph(sys.starType)} {sys.starType}-type
              </span>
              {sys.factionId && (
                <span style={{ fontSize: 9, color: '#22d3ee', border: '1px solid rgba(34,211,238,0.25)', borderRadius: 999, padding: '2px 7px', background: 'rgba(8,51,68,0.18)' }}>
                  ⚑ {FACTION_DEFINITIONS[sys.factionId]?.name ?? sys.factionId}
                </span>
              )}
              {sys.stationId && (
                <span style={{ fontSize: 9, color: '#cbd5e1', border: '1px solid rgba(148,163,184,0.25)', borderRadius: 999, padding: '2px 7px', background: 'rgba(15,23,42,0.52)' }}>
                  ⬡ Station
                </span>
              )}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 14px' }}>
              {[
                ['Distance', `${distLY.toFixed(1)} LY`],
                ['Bodies', `${sys.bodies.length}`],
                ['Planets', `${planets}`],
                ['Belts', `${belts}`],
                ['Fleets', `${fleetsHere}`],
                ['Ships', `${shipsHere}`],
              ].map(([label, value]) => (
                <div key={label} style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <span style={{ fontSize: 9, color: '#475569' }}>{label}</span>
                  <span style={{ fontSize: 9, color: '#cbd5e1', fontFamily: 'monospace' }}>{value}</span>
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 8, color: '#64748b', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                {isCurrent ? 'Current Location' : 'Inspectable'}
              </span>
              {hasNullOres && (
                <span style={{ fontSize: 8, color: '#22d3ee', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                  Null Ore Signal
                </span>
              )}
              {routeHopIndex >= 0 && (
                <span style={{ fontSize: 8, color: '#fbbf24', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                  Route Hop {routeHopIndex + 1}
                </span>
              )}
            </div>

            {(threatGroups.length > 0 || tradeOpportunities.length > 0) && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <div style={{ fontSize: 8, color: '#334155', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 4 }}>
                    Threats
                  </div>
                  {threatGroups.length > 0 ? threatGroups.slice(0, 2).map(group => (
                    <div key={group.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 9, marginBottom: 3 }}>
                      <span style={{ color: '#fca5a5', minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{group.name}</span>
                      <span style={{ color: '#7f1d1d', fontFamily: 'monospace', flexShrink: 0 }}>STR {group.strength}</span>
                    </div>
                  )) : (
                    <div style={{ fontSize: 9, color: '#475569' }}>No active contacts</div>
                  )}
                </div>

                <div>
                  <div style={{ fontSize: 8, color: '#334155', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 4 }}>
                    Trade
                  </div>
                  {tradeOpportunities.length > 0 ? tradeOpportunities.map(opportunity => (
                    <div key={opportunity.resourceId} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 9, marginBottom: 3 }}>
                      <span style={{ color: '#94a3b8' }}>{RESOURCE_REGISTRY[opportunity.resourceId]?.name ?? opportunity.resourceId}</span>
                      <span style={{ color: '#4ade80', fontFamily: 'monospace', flexShrink: 0 }}>
                        +{((opportunity.sellPrice / opportunity.buyPrice - 1) * 100).toFixed(0)}%
                      </span>
                    </div>
                  )) : (
                    <div style={{ fontSize: 9, color: '#475569' }}>No strong spread</div>
                  )}
                </div>
              </div>
            )}

            <div style={{ fontSize: 8, color: '#64748b', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              Click to inspect · double-click to fly in
            </div>
          </>
        ) : (
          <>
            <div style={{ fontSize: 10, color: '#64748b', lineHeight: 1.45 }}>
              Scan required to reveal detailed system telemetry.
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 9, color: '#475569' }}>Distance</span>
                <span style={{ fontSize: 9, color: '#94a3b8', fontFamily: 'monospace' }}>{distLY.toFixed(1)} LY</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 9, color: '#475569' }}>Status</span>
                <span style={{ fontSize: 9, color: '#64748b', fontFamily: 'monospace' }}>UNKNOWN</span>
              </div>
            </div>
            <div style={{ fontSize: 8, color: '#475569', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              Click to lock selection before planning a scan or route
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Main panel ───────────────────────────────────────────────────────────────

function StarMapPanelInner() {
  const galaxy          = useGameStore(s => s.state.galaxy)!;
  const tutorialDispatchStep = useGameStore(s => isTutorialStepCurrent(s.state, 'starmap-dispatch-fleet'));
  const initiateWarp           = useGameStore(s => s.initiateWarp);
  const cancelWarp             = useGameStore(s => s.cancelWarp);
  const doIssueFleetOrder      = useGameStore(s => s.issueFleetOrder);
  const doCancelFleetOrder     = useGameStore(s => s.cancelFleetOrder);
  const doIssueFleetGroupOrder  = useGameStore(s => s.issueFleetGroupOrder);
  const doCancelFleetGroupOrder = useGameStore(s => s.cancelFleetGroupOrder);
  const fleetShipsRecord  = useGameStore(s => s.state.systems.fleet.ships);
  const fleetFleetsRecord = useGameStore(s => s.state.systems.fleet.fleets);
  const maxFleets         = useGameStore(s => s.state.systems.fleet.maxFleets);
  const viewport = useResponsiveViewport();
  const useDrawerPanels = viewport.starmapUsesDrawerPanels;
  const seed = galaxy.seed;

  const allSystems   = useMemo(() => generateGalaxy(seed), [seed]);
  const systemById   = useMemo(() => buildSystemLookup(allSystems), [allSystems]);
  const sectors      = useMemo(() => buildSectors(allSystems), [allSystems]);
  const fleetShips   = useMemo(() => Object.values(fleetShipsRecord), [fleetShipsRecord]);
  const playerFleets = useMemo(() => Object.values(fleetFleetsRecord), [fleetFleetsRecord]);

  // Fleet effective jump range — best hull warp bonus across all ships
  const fleetJumpRangeLY = useMemo(() => {
    let maxBonus = 0;
    for (const ship of fleetShips) {
      const hull = HULL_DEFINITIONS[ship.shipDefinitionId];
      if (hull && hull.warpSpeedBonus > maxBonus) maxBonus = hull.warpSpeedBonus;
    }
    return Math.round(DEFAULT_JUMP_RANGE_LY + maxBonus * 100);
  }, [fleetShips]);

  const currentSystem = useMemo(
    () => getSystemById(seed, galaxy.currentSystemId),
    [seed, galaxy.currentSystemId],
  );

  const savedPanelState = useUiStore(s => s.panelStates.starmap);
  const setPanelState = useUiStore(s => s.setPanelState);

  const [selectedId,   setSelectedId]   = useState<string | null>(() => savedPanelState.selectedId ?? null);
  const [zSlice,       setZSlice]       = useState(galaxy.galacticSliceZ ?? 0.5);
  const [searchQuery,  setSearchQuery]  = useState('');
  const [showFilters,  setShowFilters]  = useState(() => !useDrawerPanels);
  const [showRight,    setShowRight]    = useState(() => !useDrawerPanels);
  const [rightTab,    setRightTab]    = useState<'intel' | 'route'>(() => savedPanelState.rightTab ?? 'intel');
  const [filters, setFilters] = useState<MapFilters>({
    highsec: true, lowsec: true, nullsec: true,
    showLabels: true,
    onlyVisited: false, onlyWithBelts: false, hasNullOres: false,
  });

  const [routeFrom,      setRouteFrom]      = useState<string | null>(() => savedPanelState.routeFrom ?? galaxy.currentSystemId);
  const [routeTo,        setRouteTo]        = useState<string | null>(() => savedPanelState.routeTo ?? null);
  const [jumpRangeLY,    setJumpRangeLY]    = useState(DEFAULT_JUMP_RANGE_LY);
  const [routeFilter,    setRouteFilter]    = useState<RouteSecurityFilter>(() => savedPanelState.routeFilter ?? 'shortest');
  const [activeRoute,    setActiveRoute]    = useState<ActiveRoute | null>(null);
  const [routeComputed,  setRouteComputed]  = useState(false);
  const [routeFleetId,   setRouteFleetId]   = useState<string | null>(() => savedPanelState.routeFleetId ?? null);
  const [dispatchFeedback, setDispatchFeedback] = useState<RouteDispatchFeedback | null>(null);
  const [overlay,        setOverlay]        = useState<OverlayMode>('default');
  const [hoverPreview,   setHoverPreview]   = useState<HoverPreview | null>(null);
  const gridRef = useRef<GalaxyGridHandle>(null);
  const previousDrawerModeRef = useRef(useDrawerPanels);
  const tutorialStarterFleetId = useMemo(() => {
    if (fleetFleetsRecord['fleet-starter']) return 'fleet-starter';
    return playerFleets[0]?.id ?? null;
  }, [fleetFleetsRecord, playerFleets]);

  useEffect(() => {
    if (savedPanelState.selectedId !== undefined && savedPanelState.selectedId !== selectedId) {
      setSelectedId(savedPanelState.selectedId ?? null);
    }
    if (savedPanelState.rightTab && savedPanelState.rightTab !== rightTab) {
      setRightTab(savedPanelState.rightTab);
    }
    if (savedPanelState.routeFrom !== undefined && savedPanelState.routeFrom !== routeFrom) {
      setRouteFrom(savedPanelState.routeFrom ?? null);
    }
    if (savedPanelState.routeTo !== undefined && savedPanelState.routeTo !== routeTo) {
      setRouteTo(savedPanelState.routeTo ?? null);
    }
    if (savedPanelState.routeFilter && savedPanelState.routeFilter !== routeFilter) {
      setRouteFilter(savedPanelState.routeFilter);
    }
    if (savedPanelState.routeFleetId !== undefined && savedPanelState.routeFleetId !== routeFleetId) {
      setRouteFleetId(savedPanelState.routeFleetId ?? null);
    }
  }, [
    savedPanelState.selectedId,
    savedPanelState.rightTab,
    savedPanelState.routeFrom,
    savedPanelState.routeTo,
    savedPanelState.routeFilter,
    savedPanelState.routeFleetId,
  ]);

  useEffect(() => {
    setPanelState('starmap', { selectedId, rightTab, routeFrom, routeTo, routeFilter, routeFleetId });
  }, [selectedId, rightTab, routeFrom, routeTo, routeFilter, routeFleetId, setPanelState]);

  useEffect(() => {
    if (previousDrawerModeRef.current === useDrawerPanels) return;
    previousDrawerModeRef.current = useDrawerPanels;

    if (useDrawerPanels) {
      setShowFilters(false);
      setShowRight(selectedId !== null || rightTab === 'route');
      return;
    }

    setShowFilters(true);
    setShowRight(true);
  }, [rightTab, selectedId, useDrawerPanels]);

  useEffect(() => {
    if (!useDrawerPanels && !viewport.isCoarsePointer) return;
    setHoverPreview(null);
  }, [useDrawerPanels, viewport.isCoarsePointer]);

  // Warp ticker
  const warp    = galaxy.warp;
  const nowRef  = useRef(Date.now());
  const [, forceUpdate] = useState(0);
  useEffect(() => {
    if (!warp) return;
    const id = setInterval(() => { nowRef.current = Date.now(); forceUpdate(n => n + 1); }, 250);
    return () => clearInterval(id);
  }, [warp]);
  const warpTo = warp ? (systemById.get(warp.toSystemId) ?? null) : null;
  const warpProgress = warp ? getWarpProgress(warp, nowRef.current) : 0;
  const warpEta      = warp ? warpEtaSeconds(warp, nowRef.current) : 0;

  // Star systems for the animated player-warp arrow on the map
  const warpFromSystem = useMemo(() => {
    if (!warp) return null;
    return systemById.get(warp.fromSystemId) ?? null;
  }, [systemById, warp]);
  const warpToSystem = useMemo(() => {
    if (!warp) return null;
    return systemById.get(warp.toSystemId) ?? null;
  }, [systemById, warp]);

  const reachable = useMemo(
    () => getReachableSystems(allSystems, galaxy.currentSystemId, jumpRangeLY),
    [allSystems, galaxy.currentSystemId, jumpRangeLY],
  );

  const handleSystemSelect = useCallback((id: string) => {
    if (rightTab === 'route') {
      setSelectedId(id);
      setRouteTo(id);
      setActiveRoute(null);
      setRouteComputed(false);
      setDispatchFeedback(null);
      if (useDrawerPanels) {
        setShowFilters(false);
        setShowRight(true);
      }
      return;
    }

    const nextSelectedId = selectedId === id ? null : id;
    setSelectedId(nextSelectedId);
    setRightTab('intel');
    if (useDrawerPanels) {
      setShowFilters(false);
      setShowRight(nextSelectedId !== null);
    }
  }, [rightTab, selectedId, useDrawerPanels]);

  const handleSetCourse = useCallback(() => {
    if (!selectedId || selectedId === galaxy.currentSystemId) return;
    initiateWarp(selectedId);
  }, [selectedId, galaxy.currentSystemId, initiateWarp]);

  const handleComputeRoute = useCallback(() => {
    setDispatchFeedback(null);
    if (!routeFrom || !routeTo) return;
    const result = findRoute(allSystems, routeFrom, routeTo, jumpRangeLY, routeFilter);
    if (result) {
      // Build ordered unique sector path
      const seen = new Set<string>();
      const sectorPath: Array<{ gx: number; gy: number }> = [];
      for (const id of result.path) {
        const sys = systemById.get(id);
        if (!sys) continue;
        const sec = systemSector(sys);
        const k = sectorId(sec.gx, sec.gy);
        if (!seen.has(k)) { seen.add(k); sectorPath.push(sec); }
      }
      setActiveRoute({ fromId: routeFrom, toId: routeTo, path: result.path, hops: result.hops, totalLy: result.totalLy, legSecurity: result.legSecurity, sectorPath });
    } else {
      setActiveRoute(null);
    }
    setRouteComputed(true);
    setRightTab('route');
  }, [routeFrom, routeTo, allSystems, jumpRangeLY, routeFilter, systemById]);

  const handleClearRoute = useCallback(() => {
    setActiveRoute(null);
    setRouteComputed(false);
    setDispatchFeedback(null);
  }, []);

  useEffect(() => {
    if (!routeFleetId) return;
    const fleet = playerFleets.find(entry => entry.id === routeFleetId);
    if (!fleet) {
      setRouteFleetId(null);
      return;
    }
    if (!fleet.fleetOrder) return;

    const liveRoute = buildActiveRouteFromPath(systemById, fleet.fleetOrder.route);
    if (!liveRoute) return;

    setRouteFrom(liveRoute.fromId);
    setRouteTo(fleet.fleetOrder.destinationSystemId);
    setRouteFilter(fleet.fleetOrder.securityFilter);
    setActiveRoute(currentRoute => {
      if (
        currentRoute
        && currentRoute.path.length === liveRoute.path.length
        && currentRoute.path.every((systemId, index) => systemId === liveRoute.path[index])
        && currentRoute.toId === liveRoute.toId
      ) {
        return currentRoute;
      }
      return liveRoute;
    });
    setRouteComputed(true);
  }, [playerFleets, routeFleetId, systemById]);

  useEffect(() => {
    if (!tutorialDispatchStep) {
      return;
    }
    if (rightTab !== 'route') {
      setRightTab('route');
    }
    if (tutorialStarterFleetId && routeFleetId !== tutorialStarterFleetId) {
      setRouteFleetId(tutorialStarterFleetId);
    }
  }, [tutorialDispatchStep, rightTab, routeFleetId, tutorialStarterFleetId]);

  // When a fleet is selected as origin, sync its current system + jump range
  useEffect(() => {
    if (!routeFleetId) return;
    const fleet = playerFleets.find(f => f.id === routeFleetId);
    if (!fleet) { setRouteFleetId(null); return; }
    setRouteFrom(fleet.currentSystemId);
    const tutorialRouteFocus = tutorialDispatchStep && routeFleetId === tutorialStarterFleetId;
    gridRef.current?.focusSystem(
      fleet.currentSystemId,
      tutorialRouteFocus
        ? { distance: 120, phi: 1.24, durationMs: 850 }
        : undefined,
    );
    const ships = fleetShips.filter(s => fleet.shipIds.includes(s.id));
    let maxBonus = 0;
    for (const ship of ships) {
      const hull = HULL_DEFINITIONS[ship.shipDefinitionId];
      if (hull && hull.warpSpeedBonus > maxBonus) maxBonus = hull.warpSpeedBonus;
    }
    setJumpRangeLY(Math.round(DEFAULT_JUMP_RANGE_LY + maxBonus * 100));
    setActiveRoute(null);
    setRouteComputed(false);
    setDispatchFeedback(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeFleetId, tutorialDispatchStep, tutorialStarterFleetId]);

  const handleDispatchFleet = useCallback((fleetId: string) => {
    if (!routeTo) {
      setDispatchFeedback({ tone: 'error', text: 'Pick a destination before dispatching a fleet.' });
      return false;
    }

    const dispatched = doIssueFleetGroupOrder(fleetId, routeTo, routeFilter);
    setDispatchFeedback(dispatched
      ? { tone: 'success', text: 'Order issued. The fleet will depart on the next travel tick.' }
      : { tone: 'error', text: 'Dispatch failed. Recompute the route with the fleet\'s actual range or confirm the fleet is ready to move.' });
    return dispatched;
  }, [routeTo, routeFilter, doIssueFleetGroupOrder]);

  const selectedSys = selectedId ? (systemById.get(selectedId) ?? null) : null;
  const selectedVisited = selectedId ? !!galaxy.visitedSystems[selectedId] : false;
  const selectedDistLY  = selectedSys ? unitsToLy(systemDistance(currentSystem, selectedSys)) : null;
  const hoveredSys = hoverPreview ? (systemById.get(hoverPreview.systemId) ?? null) : null;
  const rightToggleLabel = useDrawerPanels
    ? rightTab === 'route'
      ? 'Route'
      : selectedSys
        ? 'Intel'
        : 'Panel'
    : 'Panel';

  const handleToggleFilters = useCallback(() => {
    if (useDrawerPanels) {
      setShowRight(false);
    }
    setShowFilters(current => !current);
  }, [useDrawerPanels]);

  const handleToggleRightPanel = useCallback(() => {
    if (useDrawerPanels) {
      setShowFilters(false);
    }
    setShowRight(current => !current);
  }, [useDrawerPanels]);

  const handleRightTabChange = useCallback((tab: typeof rightTab) => {
    setRightTab(tab);
    if (useDrawerPanels) {
      setShowFilters(false);
      setShowRight(true);
    }
  }, [useDrawerPanels]);

  const rightPanelContent = (
    <>
      <div style={{ display: 'flex', borderBottom: '1px solid rgba(22,30,52,0.6)', flexShrink: 0 }}>
        {([
          ['intel',  'Intel'],
          ['route',  'Route'],
        ] as [typeof rightTab, string][]).map(([tab, label]) => (
          <button key={tab} onClick={() => handleRightTabChange(tab)} data-tutorial-anchor={tutorialDispatchStep && tab === 'route' ? 'starmap-route-tab' : undefined} className={`legacy-panel-btn ${tutorialDispatchStep && tab === 'route' ? 'tutorial-breathe relative z-[74]' : ''}`.trim()} style={{
            flex: 1, padding: '7px 4px', fontSize: 9, fontWeight: 600,
            letterSpacing: '0.08em', textTransform: 'uppercase',
            '--legacy-border': 'transparent',
            '--legacy-bg': rightTab === tab ? 'rgba(8,51,68,0.3)' : 'transparent',
            '--legacy-color': rightTab === tab ? '#22d3ee' : '#334155',
            '--legacy-hover-border': 'transparent',
            '--legacy-hover-bg': rightTab === tab ? 'rgba(8,51,68,0.42)' : 'rgba(15,23,42,0.68)',
            '--legacy-hover-color': rightTab === tab ? '#cffafe' : '#cbd5e1',
            '--legacy-radius': '0px',
            borderBottom: rightTab === tab ? '2px solid #22d3ee' : '2px solid transparent',
            boxShadow: tutorialDispatchStep && tab === 'route' ? 'inset 0 0 0 1px rgba(34,211,238,0.14), 0 0 14px rgba(34,211,238,0.12)' : undefined,
          } as React.CSSProperties}>
            {label}
          </button>
        ))}
      </div>

      <div style={{ padding: '10px 12px', overflowY: 'auto', flex: 1 }}>
        {rightTab === 'intel' ? (
          <>
            <div style={{ paddingBottom: 10, marginBottom: 10, borderBottom: '1px solid rgba(22,30,52,0.5)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                <div>
                  <div style={{ fontSize: 8, color: '#334155', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 3 }}>Current Location</div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#22d3ee' }}>{currentSystem.name}</div>
                </div>
                <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                  <span style={{ fontSize: 8, padding: '2px 7px', borderRadius: 999, color: secColor(currentSystem.security), border: `1px solid ${secColor(currentSystem.security)}30`, background: `${secColor(currentSystem.security)}12`, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                    {secLabel(currentSystem.security)}
                  </span>
                  <span style={{ fontSize: 8, padding: '2px 7px', borderRadius: 999, color: '#64748b', border: '1px solid rgba(100,116,139,0.25)', background: 'rgba(15,23,42,0.52)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                    {currentSystem.bodies.length} Bodies
                  </span>
                </div>
              </div>
            </div>

            {selectedSys ? (
              <SystemIntelPanel
                sys={selectedSys}
                isVisited={selectedVisited}
                isCurrent={selectedSys.id === galaxy.currentSystemId}
                distLY={selectedDistLY}
                onSetCourse={handleSetCourse}
                onSetRouteFrom={() => { setDispatchFeedback(null); setRouteFrom(selectedSys.id); setActiveRoute(null); setRouteComputed(false); handleRightTabChange('route'); }}
                onSetRouteTo={() => { setDispatchFeedback(null); setRouteTo(selectedSys.id); setActiveRoute(null); setRouteComputed(false); handleRightTabChange('route'); }}
              />
            ) : (
              <div style={{ fontSize: 9, color: '#475569', textAlign: 'left', padding: '12px 14px', border: '1px solid rgba(30,41,59,0.72)', borderRadius: 8, background: 'linear-gradient(180deg, rgba(8,12,28,0.94), rgba(4,6,18,0.9))', lineHeight: 1.5 }}>
                {useDrawerPanels
                  ? 'Tap a star to peek intel and route context without leaving the map.'
                  : 'Click any star to inspect it. Hover gives fast intel, selection opens the full inspector, and double-click flies the camera in.'}
              </div>
            )}
          </>
        ) : (
          <RoutePlanner
            allSystems={allSystems}
            visitedSystems={galaxy.visitedSystems}
            currentSystemId={galaxy.currentSystemId}
            routeFrom={routeFrom}
            routeTo={routeTo}
            jumpRangeLY={jumpRangeLY}
            routeFilter={routeFilter}
            activeRoute={activeRoute}
            routeComputed={routeComputed}
            onSetFrom={(id) => { setDispatchFeedback(null); setRouteFrom(id); setActiveRoute(null); setRouteComputed(false); }}
            onSetTo={(id) => { setDispatchFeedback(null); setRouteTo(id); setActiveRoute(null); setRouteComputed(false); }}
            onSetJumpRange={(ly) => { setDispatchFeedback(null); setJumpRangeLY(ly); }}
            onSetFilter={(filter) => { setDispatchFeedback(null); setRouteFilter(filter); setActiveRoute(null); setRouteComputed(false); }}
            onComputeRoute={handleComputeRoute}
            onClearRoute={handleClearRoute}
            fleetJumpRangeLY={fleetJumpRangeLY}
            playerFleets={playerFleets}
            fleetShips={fleetShips}
            routeFleetId={routeFleetId}
            onSetFleet={(id) => { setDispatchFeedback(null); setRouteFleetId(id); }}
            onDispatch={handleDispatchFleet}
            dispatchFeedback={dispatchFeedback}
          />
        )}
      </div>
    </>
  );

  const Z_STEP = 0.08;

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: '100%', minHeight: useDrawerPanels ? 0 : 560,
      background: 'rgba(2,4,14,0.97)', border: '1px solid rgba(22,30,52,0.8)',
      borderRadius: 8, overflow: 'hidden',
    }}>

      {/* Header */}
      <div style={{
        padding: '8px 14px', borderBottom: '1px solid rgba(22,30,52,0.8)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0, gap: 10,
        flexWrap: useDrawerPanels ? 'wrap' : 'nowrap',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: '#22d3ee', letterSpacing: '0.12em' }}>
            ✦ GALAXY MAP
          </span>
          {selectedId && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ fontSize: 9, color: '#475569' }}>⊛</span>
              <span style={{ fontSize: 9, color: '#94a3b8' }}>
                {systemById.get(selectedId)?.name ?? selectedId}
              </span>
              <button onClick={() => setSelectedId(null)}
                className="legacy-panel-btn"
                style={{ fontSize: 8, padding: '1px 5px', marginLeft: 2, '--legacy-border': 'rgba(71,85,105,0.3)', '--legacy-bg': 'transparent', '--legacy-color': '#475569', '--legacy-hover-border': 'rgba(148,163,184,0.38)', '--legacy-hover-bg': 'rgba(15,23,42,0.68)', '--legacy-hover-color': '#e2e8f0', '--legacy-radius': '3px' } as React.CSSProperties}
              >×</button>
            </div>
          )}
        </div>

        <div style={{ flex: useDrawerPanels ? '1 0 100%' : 1, maxWidth: useDrawerPanels ? '100%' : 260, minWidth: useDrawerPanels ? '100%' : 0, position: 'relative', order: useDrawerPanels ? 3 : 0 }}>
          <input
            type="text" placeholder="Search systems..." value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            style={{
              width: '100%', padding: '4px 24px 4px 8px', fontSize: 10,
              background: 'rgba(6,9,20,0.7)', border: '1px solid rgba(30,40,60,0.7)',
              borderRadius: 4, color: '#94a3b8', outline: 'none', boxSizing: 'border-box',
            }}
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery('')}
              className="legacy-panel-btn"
              style={{ position: 'absolute', right: 4, top: '50%', transform: 'translateY(-50%)', fontSize: 10, padding: '0 2px', '--legacy-border': 'transparent', '--legacy-bg': 'transparent', '--legacy-color': '#475569', '--legacy-hover-border': 'transparent', '--legacy-hover-bg': 'rgba(15,23,42,0.45)', '--legacy-hover-color': '#e2e8f0', '--legacy-radius': '3px' } as React.CSSProperties}
            >×</button>
          )}
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', justifyContent: useDrawerPanels ? 'space-between' : 'flex-end', width: useDrawerPanels ? '100%' : undefined }}>
          {/* Overlay mode selector */}
          <div style={{ display: 'flex', gap: 1, border: '1px solid rgba(22,30,52,0.7)', borderRadius: 4, overflow: 'hidden' }}>
            {([
              ['default',  '◈ MAP'],
              ['resource', '⬡ RES'],
              ['fleet',    '▶ FLT'],
              ['faction',  '⚑ FAC'],
            ] as [OverlayMode, string][]).map(([mode, label]) => (
              <button key={mode} onClick={() => setOverlay(mode)} className="legacy-panel-btn" style={{
                padding: '3px 7px', fontSize: 8, fontWeight: 600, letterSpacing: '0.06em',
                '--legacy-border': 'transparent',
                '--legacy-bg': overlay === mode ? 'rgba(34,211,238,0.15)' : 'rgba(6,9,20,0.5)',
                '--legacy-color': overlay === mode ? '#22d3ee' : '#334155',
                '--legacy-hover-border': 'transparent',
                '--legacy-hover-bg': overlay === mode ? 'rgba(34,211,238,0.24)' : 'rgba(15,23,42,0.74)',
                '--legacy-hover-color': overlay === mode ? '#cffafe' : '#cbd5e1',
                '--legacy-radius': '0px',
                textTransform: 'uppercase',
              } as React.CSSProperties}>
                {label}
              </button>
            ))}
          </div>
          {(['Filters', 'Panel'] as const).map((label, i) => {
            const active = i === 0 ? showFilters : showRight;
            const toggle = i === 0 ? handleToggleFilters : handleToggleRightPanel;
            const buttonLabel = i === 0 ? label : rightToggleLabel;
            return (
              <button key={label} onClick={toggle} className="legacy-panel-btn" style={{
                fontSize: 9, padding: '3px 8px',
                '--legacy-border': active ? 'rgba(34,211,238,0.3)' : 'rgba(30,40,60,0.5)',
                '--legacy-bg': active ? 'rgba(8,51,68,0.2)' : 'rgba(6,9,20,0.3)',
                '--legacy-color': active ? '#22d3ee' : '#475569',
                '--legacy-hover-border': active ? 'rgba(103,232,249,0.5)' : 'rgba(148,163,184,0.34)',
                '--legacy-hover-bg': active ? 'rgba(8,51,68,0.4)' : 'rgba(15,23,42,0.72)',
                '--legacy-hover-color': active ? '#cffafe' : '#cbd5e1',
                '--legacy-radius': '3px',
              } as React.CSSProperties}>⊛ {buttonLabel}</button>
            );
          })}
          <span style={{ fontSize: 8, color: '#1e293b', fontFamily: 'monospace' }}>
            0x{seed.toString(16).toUpperCase()}
          </span>
        </div>
      </div>

      {/* Warp banner */}
      {warp && warpTo && (
        <div style={{
          padding: '7px 14px', background: 'rgba(30,10,60,0.6)',
          borderBottom: '1px solid rgba(168,85,247,0.25)',
          display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0,
        }}>
          <div style={{ flex: 1, background: 'rgba(15,5,30,0.8)', borderRadius: 3, height: 5, overflow: 'hidden', border: '1px solid rgba(168,85,247,0.2)' }}>
            <div style={{ height: '100%', borderRadius: 3, background: 'linear-gradient(90deg, #7c3aed, #a855f7)', width: `${warpProgress * 100}%`, transition: 'width 0.25s' }} />
          </div>
          <span style={{ fontSize: 10, color: '#c084fc', fontFamily: 'monospace', flexShrink: 0 }}>
            ⊛ Warping to {warpTo.name} — {formatEta(warpEta)}
          </span>
          <button onClick={cancelWarp} className="legacy-panel-btn" style={{ padding: '2px 7px', fontSize: 9, '--legacy-border': 'rgba(239,68,68,0.3)', '--legacy-bg': 'rgba(127,29,29,0.15)', '--legacy-color': '#f87171', '--legacy-hover-border': 'rgba(248,113,113,0.48)', '--legacy-hover-bg': 'rgba(127,29,29,0.3)', '--legacy-hover-color': '#fecaca', '--legacy-radius': '3px' } as React.CSSProperties}>
            Abort
          </button>
        </div>
      )}

      {/* Body row */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden', minHeight: 0 }}>

        {!useDrawerPanels && showFilters && <FilterPanel filters={filters} onChange={setFilters} />}

        {/* Map area */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative' }}>

          {/* Z-slice control */}
          <div style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', zIndex: 10 }}>
            <ZLayerControl
              zSlice={zSlice}
              onUp={() => setZSlice(z => Math.min(0.96, z + Z_STEP))}
              onDown={() => setZSlice(z => Math.max(0.04, z - Z_STEP))}
              onReset={() => setZSlice(0.5)}
            />
          </div>

          <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
            <GalaxyGridView
              ref={gridRef}
              allSystems={allSystems}
              systemById={systemById}
              sectors={sectors}
              currentSystemId={galaxy.currentSystemId}
              visitedSystems={galaxy.visitedSystems}
              zSlice={zSlice}
              filters={filters}
              searchQuery={searchQuery}
              onSystemClick={handleSystemSelect}
              selectedId={selectedId}
              reachable={reachable}
              jumpRangeLY={jumpRangeLY}
              overlay={overlay}
              fleetShips={fleetShips}
              playerFleets={playerFleets}
              activeRoute={activeRoute}
              warpState={warp ?? null}
              warpFromSystem={warpFromSystem}
              warpToSystem={warpToSystem}
              onHoverChange={useDrawerPanels || viewport.isCoarsePointer ? undefined : setHoverPreview}
            />
            {!useDrawerPanels && !viewport.isCoarsePointer && hoverPreview && hoveredSys && (
              <StarSystemHoverCard
                hover={hoverPreview}
                sys={hoveredSys}
                allSystems={allSystems}
                currentSystem={currentSystem}
                visitedSystems={galaxy.visitedSystems}
                activeRoute={activeRoute}
                fleetShips={fleetShips}
                playerFleets={playerFleets}
              />
            )}
            {useDrawerPanels && (
              <>
                <DrawerSheet
                  title="Galaxy Filters"
                  eyebrow="Map Controls"
                  open={showFilters}
                  onClose={() => setShowFilters(false)}
                >
                  <FilterPanel filters={filters} onChange={setFilters} layout="sheet" />
                </DrawerSheet>

                <DrawerSheet
                  title={rightTab === 'route' ? 'Route Planner' : selectedSys ? selectedSys.name : 'System Intel'}
                  eyebrow={rightTab === 'route' ? 'Navigation' : selectedSys ? 'Tap-to-Peek Intel' : 'Galaxy Intel'}
                  open={showRight}
                  onClose={() => setShowRight(false)}
                >
                  <div style={{ background: 'rgba(3,5,16,0.95)', minHeight: '100%' }}>
                    {rightPanelContent}
                  </div>
                </DrawerSheet>
              </>
            )}
          </div>
        </div>

        {/* Right panel */}
        {!useDrawerPanels && showRight && (
          <div style={{
            width: 292, borderLeft: '1px solid rgba(22,30,52,0.8)',
            background: 'rgba(3,5,16,0.95)', display: 'flex', flexDirection: 'column',
            overflowY: 'auto', flexShrink: 0,
          }}>
            {rightPanelContent}
          </div>
        )}
      </div>
    </div>
  );
}

// --- Public export -----------------------------------------------------------

export default function StarMapPanel() {
  const galaxy = useGameStore(s => s.state.galaxy);
  if (!galaxy) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200, color: '#334155', fontSize: 11 }}>
        Galaxy not initialized.
      </div>
    );
  }
  return <StarMapPanelInner />;
}