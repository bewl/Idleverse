import { useCallback, useEffect, useRef } from 'react';
import type { CelestialBody, StarSystem } from '@/types/galaxy.types';
import type { PlayerFleet } from '@/types/game.types';
import { getFleetColorByIndex } from '@/ui/utils/fleetColors';

const SYSTEM_CAM_DEFAULT = { theta: 0.72, phi: 1.08, dist: 170, tx: 0, ty: 0, tz: 0 };
const SYSTEM_WORLD_RADIUS = 118;
const SYSTEM_FLEET_ORBIT_RADIUS = 38;
const SYSTEM_FLEET_WARP_RADIUS = 86;
const SYSTEM_FLEET_TRANSITION_MIN_MS = 1800;
const SYSTEM_FLEET_TRANSITION_MAX_MS = 4200;
const SYSTEM_FLEET_EXIT_LINGER_MS = 900;
const SYSTEM_FLEET_ARRIVAL_SETTLE_MS = 2200;

type SceneEntityKind = 'body' | 'fleet' | 'station' | 'outpost';

export interface SystemSceneHoverTarget {
  kind: SceneEntityKind;
  id: string;
  x: number;
  y: number;
}

interface StructureMarker {
  kind: 'station' | 'outpost';
  id: string;
  label: string;
  color: string;
}

interface MiningLink {
  fleetId: string;
  wingId: string;
  wingName: string;
  beltId: string;
  shipCount: number;
}

interface ConvoyContact {
  id: string;
  label: string;
  fleetId: string;
  shipCount: number;
  colorIndex: number;
  fromSystemId: string;
  toSystemId: string;
  legDepartedAt: number;
  legDurationSeconds: number;
  hqOffloadStartedAt: number | null;
  hqOffloadCargoUnits: number;
  cargoTransferDurationSeconds: number;
  recentArrivalFromSystemId: string | null;
  recentArrivalAt: number | null;
}

interface SystemSceneCanvasProps {
  system: StarSystem;
  selectedBodyId: string | null;
  pinnedFleetId: string | null;
  fleets: PlayerFleet[];
  fleetColorIndexById: Record<string, number>;
  convoyContacts: ConvoyContact[];
  miningLinks: MiningLink[];
  structures: StructureMarker[];
  onSelectBody: (bodyId: string | null) => void;
  onFleetClick: (fleetId: string) => void;
  onHoverChange: (target: SystemSceneHoverTarget | null) => void;
}

interface CamState {
  theta: number;
  phi: number;
  dist: number;
  tx: number;
  ty: number;
  tz: number;
}

interface HitEntry {
  kind: SceneEntityKind;
  id: string;
  sx: number;
  sy: number;
  r: number;
}

interface ScenePoint {
  wx: number;
  wy: number;
  wz: number;
}

interface BodySceneEntry extends ScenePoint {
  body: CelestialBody;
  orbitR: number;
  angle: number;
  radius: number;
  isMoon: boolean;
  isBelt: boolean;
}

function hashId(id: string): number {
  let hash = 5381;
  for (let index = 0; index < id.length; index += 1) {
    hash = ((hash << 5) + hash) ^ id.charCodeAt(index);
  }
  return ((hash >>> 0) / 0xffffffff) * Math.PI * 2;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function getProjectedVisualScale(pointScale: number, min: number, max: number) {
  return clamp(pointScale / 12, min, max);
}

function colorToRgba(hex: string, alpha: number) {
  const normalized = hex.replace('#', '');
  const value = normalized.length === 3
    ? normalized.split('').map(part => part + part).join('')
    : normalized;
  const r = Number.parseInt(value.slice(0, 2), 16);
  const g = Number.parseInt(value.slice(2, 4), 16);
  const b = Number.parseInt(value.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function miningLinkColor(wingId: string) {
  const palette = ['#67e8f9', '#fbbf24', '#c4b5fd', '#86efac', '#fda4af', '#93c5fd'];
  const index = Math.floor((hashId(wingId) / (Math.PI * 2)) * palette.length) % palette.length;
  return palette[index];
}

function createSeededRandom(seedKey: string) {
  let state = Math.floor((hashId(seedKey) / (Math.PI * 2)) * 0xffffffff) >>> 0;
  return () => {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function median(values: number[]) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

function shouldBreakProjectedSegment(
  previousPoint: { sx: number; sy: number } | null,
  point: { sx: number; sy: number },
  recentSegments: number[],
) {
  if (!previousPoint) return { shouldBreak: false, segmentLength: 0 };

  const segmentLength = Math.hypot(point.sx - previousPoint.sx, point.sy - previousPoint.sy);
  const baseline = median(recentSegments);
  const maxAllowed = baseline > 0
    ? Math.max(54, baseline * 3.6)
    : 120;

  return {
    shouldBreak: segmentLength > maxAllowed,
    segmentLength,
  };
}

function buildCam3(cam: CamState, width: number, height: number) {
  const sph = Math.sin(cam.phi);
  const cph = Math.cos(cam.phi);
  const sth = Math.sin(cam.theta);
  const cth = Math.cos(cam.theta);
  const camX = cam.tx + cam.dist * sph * sth;
  const camY = cam.ty + cam.dist * cph;
  const camZ = cam.tz + cam.dist * sph * cth;
  const fx = cam.tx - camX;
  const fy = cam.ty - camY;
  const fz = cam.tz - camZ;
  const fl = Math.sqrt(fx * fx + fy * fy + fz * fz) || 1;
  const fwX = fx / fl;
  const fwY = fy / fl;
  const fwZ = fz / fl;
  let rX = fwZ;
  let rZ = -fwX;
  const rl = Math.sqrt(rX * rX + rZ * rZ) || 1;
  rX /= rl;
  rZ /= rl;
  const uX = fwY * rZ;
  const uY = fwZ * rX - fwX * rZ;
  const uZ = -fwY * rX;
  const focalLen = Math.min(width, height) * 0.84;

  const project = (wx: number, wy: number, wz: number) => {
    const dx = wx - camX;
    const dy = wy - camY;
    const dz = wz - camZ;
    const pcx = dx * rX + dz * rZ;
    const pcy = dx * uX + dy * uY + dz * uZ;
    const pcz = dx * fwX + dy * fwY + dz * fwZ;
    if (pcz < 0.5) return null;
    const inv = focalLen / pcz;
    return {
      sx: width / 2 + pcx * inv,
      sy: height / 2 - pcy * inv,
      depth: pcz,
      scale: inv,
    };
  };

  return { project, rX, rZ, uX, uY, uZ, focalLen };
}

function buildBodyEntries(bodies: CelestialBody[]) {
  const maxOrbit = Math.max(...bodies.map(body => body.orbitRadius), 100);
  const orbitScale = SYSTEM_WORLD_RADIUS / maxOrbit;
  const entries = new Map<string, BodySceneEntry>();

  const placeBody = (body: CelestialBody): BodySceneEntry => {
    const cached = entries.get(body.id);
    if (cached) return cached;

    const moonMatch = body.id.match(/^(body-\d+)-moon$/);
    if (moonMatch) {
      const parent = bodies.find(candidate => candidate.id === moonMatch[1]);
      if (parent) {
        const parentEntry = placeBody(parent);
        const moonOrbit = 10 + ((body.orbitRadius / maxOrbit) * 14);
        const angle = hashId(body.id);
        const entry: BodySceneEntry = {
          body,
          wx: parentEntry.wx + Math.cos(angle) * moonOrbit,
          wy: parentEntry.wy + Math.sin(angle * 1.35) * 3.5,
          wz: parentEntry.wz + Math.sin(angle) * moonOrbit,
          orbitR: moonOrbit,
          angle,
          radius: Math.max(4.5, Math.min(9, body.size / 2.6 + 1.5)),
          isMoon: true,
          isBelt: false,
        };
        entries.set(body.id, entry);
        return entry;
      }
    }

    const orbitR = Math.max(18, body.orbitRadius * orbitScale);
    const angle = hashId(body.id);
    const isBelt = body.type === 'asteroid-belt';
    const entry: BodySceneEntry = {
      body,
      wx: Math.cos(angle) * orbitR,
      wy: isBelt ? Math.sin(angle * 2.2) * 1.5 : 0,
      wz: Math.sin(angle) * orbitR,
      orbitR,
      angle,
      radius: isBelt ? 10 : Math.max(5.5, Math.min(18, body.size / 2.2 + 2)),
      isMoon: false,
      isBelt,
    };
    entries.set(body.id, entry);
    return entry;
  };

  bodies.forEach(placeBody);
  return Array.from(entries.values());
}

function drawOrbitLoop(
  ctx: CanvasRenderingContext2D,
  project: ReturnType<typeof buildCam3>['project'],
  orbitR: number,
  strokeStyle: string,
  lineWidth: number,
  alpha: number,
) {
  let started = false;
  let previousPoint: { sx: number; sy: number } | null = null;
  const recentSegments: number[] = [];
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = strokeStyle;
  ctx.lineWidth = lineWidth;
  ctx.beginPath();
  for (let step = 0; step <= 72; step += 1) {
    const angle = (step / 72) * Math.PI * 2;
    const point = project(Math.cos(angle) * orbitR, 0, Math.sin(angle) * orbitR);
    if (!point) {
      started = false;
      previousPoint = null;
      recentSegments.length = 0;
      continue;
    }

    const { shouldBreak, segmentLength } = shouldBreakProjectedSegment(previousPoint, point, recentSegments);

    if (!started || shouldBreak) {
      ctx.moveTo(point.sx, point.sy);
      started = true;
    } else {
      ctx.lineTo(point.sx, point.sy);
      recentSegments.push(segmentLength);
      if (recentSegments.length > 6) recentSegments.shift();
    }

    previousPoint = { sx: point.sx, sy: point.sy };
  }
  if (started) ctx.stroke();
  ctx.restore();
}

function drawDustCloud(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  color: string,
  alpha: number,
) {
  const gradient = ctx.createRadialGradient(x, y, 0, x, y, size);
  gradient.addColorStop(0, colorToRgba(color, alpha));
  gradient.addColorStop(0.45, colorToRgba(color, alpha * 0.42));
  gradient.addColorStop(1, colorToRgba(color, 0));
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(x, y, size, 0, Math.PI * 2);
  ctx.fill();
}

function drawNebulaBlob(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  color: string,
  alpha: number,
) {
  const normalized = color.replace('#', '');
  const value = normalized.length === 3
    ? normalized.split('').map(part => part + part).join('')
    : normalized;
  const r = Number.parseInt(value.slice(0, 2), 16);
  const g = Number.parseInt(value.slice(2, 4), 16);
  const b = Number.parseInt(value.slice(4, 6), 16);
  const gradient = ctx.createRadialGradient(x, y, 0, x, y, size);
  gradient.addColorStop(0, `rgba(${r},${g},${b},${alpha.toFixed(3)})`);
  gradient.addColorStop(0.55, `rgba(${r},${g},${b},${(alpha * 0.32).toFixed(3)})`);
  gradient.addColorStop(1, `rgba(${r},${g},${b},0)`);
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(x, y, size, 0, Math.PI * 2);
  ctx.fill();
}

function strokeProjectedRibbon(
  ctx: CanvasRenderingContext2D,
  points: Array<{ sx: number; sy: number }>,
  strokeStyle: string,
  lineWidth: number,
  alpha: number,
) {
  if (points.length < 2) return;

  let started = false;
  let previousPoint: { sx: number; sy: number } | null = null;
  const recentSegments: number[] = [];
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = strokeStyle;
  ctx.lineWidth = lineWidth;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();

  for (const point of points) {
    const { shouldBreak, segmentLength } = shouldBreakProjectedSegment(previousPoint, point, recentSegments);

    if (!started || shouldBreak) {
      ctx.moveTo(point.sx, point.sy);
      started = true;
    } else {
      ctx.lineTo(point.sx, point.sy);
      recentSegments.push(segmentLength);
      if (recentSegments.length > 6) recentSegments.shift();
    }

    previousPoint = point;
  }

  if (started) ctx.stroke();
  ctx.restore();
}

function drawNebulaRingBelt(
  ctx: CanvasRenderingContext2D,
  points: Array<{ sx: number; sy: number }>,
  seedKey: string,
  color: string,
  intensity: number,
  scale: number,
) {
  if (points.length < 3) return;

  const rand = createSeededRandom(seedKey);
  ctx.save();
  ctx.globalCompositeOperation = 'screen';

  const blobCount = points.length * 3;
  for (let index = 0; index < blobCount; index += 1) {
    const pointIndex = Math.floor(rand() * points.length);
    const point = points[pointIndex];
    const nextPoint = points[(pointIndex + 1) % points.length];
    const prev = points[(pointIndex - 1 + points.length) % points.length];
    const t = rand();
    const baseX = lerp(point.sx, nextPoint.sx, t);
    const baseY = lerp(point.sy, nextPoint.sy, t);
    const tangentX = nextPoint.sx - prev.sx;
    const tangentY = nextPoint.sy - prev.sy;
    const tangentLength = Math.hypot(tangentX, tangentY) || 1;
    const tangentUnitX = tangentX / tangentLength;
    const tangentUnitY = tangentY / tangentLength;
    const normalX = -tangentUnitY;
    const normalY = tangentUnitX;

    const sizeRoll = rand();
    const majorSize = (sizeRoll > 0.86 ? 24 : sizeRoll > 0.58 ? 17 : 11) * (0.88 + rand() * 0.32) * intensity * scale;
    const offsetAcross = (rand() - 0.5) * 14 * scale;
    const offsetAlong = (rand() - 0.5) * 14 * scale;
    const majorX = baseX + normalX * offsetAcross + tangentUnitX * offsetAlong;
    const majorY = baseY + normalY * offsetAcross + tangentUnitY * offsetAlong;
    drawNebulaBlob(ctx, majorX, majorY, majorSize, color, 0.048 * intensity);

    const lobeCount = 2 + Math.floor(rand() * 3);
    for (let lobeIndex = 0; lobeIndex < lobeCount; lobeIndex += 1) {
      const lobeSize = majorSize * (0.36 + rand() * 0.34);
      const lobeAcross = (rand() - 0.5) * majorSize * 0.85;
      const lobeAlong = (rand() - 0.5) * majorSize * 1.05;
      const lobeX = majorX + normalX * lobeAcross + tangentUnitX * lobeAlong;
      const lobeY = majorY + normalY * lobeAcross + tangentUnitY * lobeAlong;
      drawNebulaBlob(ctx, lobeX, lobeY, lobeSize, color, 0.032 * intensity);
    }
  }

  ctx.restore();
}

function drawBeltAsteroids(
  ctx: CanvasRenderingContext2D,
  points: Array<{ sx: number; sy: number }>,
  seedKey: string,
  color: string,
  intensity: number,
  scale: number,
  hitCache: HitEntry[],
  beltId: string,
) {
  if (points.length < 3) return;

  const rand = createSeededRandom(seedKey);
  const asteroidCount = 88;

  for (let index = 0; index < asteroidCount; index += 1) {
    const pointIndex = Math.floor(rand() * points.length);
    const point = points[pointIndex];
    const prev = points[(pointIndex - 1 + points.length) % points.length];
    const next = points[(pointIndex + 1) % points.length];
    const tangentX = next.sx - prev.sx;
    const tangentY = next.sy - prev.sy;
    const tangentLength = Math.hypot(tangentX, tangentY) || 1;
    const tangentUnitX = tangentX / tangentLength;
    const tangentUnitY = tangentY / tangentLength;
    const normalX = -tangentUnitY;
    const normalY = tangentUnitX;

    const alongOffset = (rand() - 0.5) * 18 * scale;
    const acrossOffset = (rand() - 0.5) * 15 * scale;
    const asteroidX = point.sx + tangentUnitX * alongOffset + normalX * acrossOffset;
    const asteroidY = point.sy + tangentUnitY * alongOffset + normalY * acrossOffset;
    const radius = (rand() > 0.9 ? 1.7 : rand() > 0.55 ? 1.2 : 0.82) * (0.86 + intensity * 0.1) * scale;

    ctx.globalAlpha = 0.08 + rand() * 0.1;
    ctx.fillStyle = colorToRgba(color, 0.45);
    ctx.beginPath();
    ctx.arc(asteroidX, asteroidY, radius * 1.8, 0, Math.PI * 2);
    ctx.fill();

    ctx.globalAlpha = 0.56;
    ctx.fillStyle = colorToRgba(color, 0.88);
    ctx.beginPath();
    ctx.arc(asteroidX, asteroidY, radius, 0, Math.PI * 2);
    ctx.fill();

    ctx.globalAlpha = 0.22;
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.beginPath();
    ctx.arc(asteroidX - radius * 0.28, asteroidY - radius * 0.24, radius * 0.34, 0, Math.PI * 2);
    ctx.fill();

    hitCache.push({ kind: 'body', id: beltId, sx: asteroidX, sy: asteroidY, r: 8 });
  }

  ctx.globalAlpha = 1;
}

export function SystemSceneCanvas({
  system,
  selectedBodyId,
  pinnedFleetId,
  fleets,
  fleetColorIndexById,
  convoyContacts,
  miningLinks,
  structures,
  onSelectBody,
  onFleetClick,
  onHoverChange,
}: SystemSceneCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef(0);
  const hoverRef = useRef<string | null>(null);
  const hitCacheRef = useRef<HitEntry[]>([]);
  const camRef = useRef<CamState>({ ...SYSTEM_CAM_DEFAULT });
  const dragRef = useRef({ active: false, mode: 'orbit' as 'orbit' | 'pan', startX: 0, startY: 0 });
  const pointerGesture = useRef<{
    pointers: Map<number, { x: number; y: number }>;
    lastCenter: { x: number; y: number } | null;
    lastDistance: number | null;
    moved: boolean;
    lastTapPointerId: number | null;
  }>({
    pointers: new Map(),
    lastCenter: null,
    lastDistance: null,
    moved: false,
    lastTapPointerId: null,
  });
  const camAnimRef = useRef<{ from: CamState; to: CamState; startTime: number; duration: number } | null>(null);
  const propsRef = useRef({ system, selectedBodyId, pinnedFleetId, fleets, fleetColorIndexById, convoyContacts, miningLinks, structures });
  propsRef.current = { system, selectedBodyId, pinnedFleetId, fleets, fleetColorIndexById, convoyContacts, miningLinks, structures };

  const focusTarget = useCallback((point: ScenePoint | null, distance?: number) => {
    if (!point) return;
    const from = { ...camRef.current };
    camAnimRef.current = {
      from,
      to: {
        ...from,
        tx: point.wx * 0.7,
        ty: point.wy * 0.55,
        tz: point.wz * 0.7,
        dist: distance ?? from.dist,
      },
      startTime: performance.now(),
      duration: 520,
    };
  }, []);

  useEffect(() => {
    const entries = buildBodyEntries(system.bodies);
    if (selectedBodyId) {
      const target = entries.find(entry => entry.body.id === selectedBodyId);
      focusTarget(target ?? null, target?.isMoon ? 120 : target?.isBelt ? 132 : 126);
      return;
    }
    if (pinnedFleetId) {
      const fleetIndex = fleets.findIndex(fleet => fleet.id === pinnedFleetId);
      if (fleetIndex >= 0) {
        const angle = hashId(pinnedFleetId) + fleetIndex * 0.82;
        focusTarget({ wx: Math.cos(angle) * 32, wy: 14, wz: Math.sin(angle) * 32 }, 130);
      }
    }
  }, [system.bodies, selectedBodyId, pinnedFleetId, fleets, focusTarget]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const width = canvas.width / dpr;
    const height = canvas.height / dpr;
    const now = performance.now();
    const worldNow = Date.now();
    const { system, selectedBodyId, pinnedFleetId, fleets, fleetColorIndexById, convoyContacts, miningLinks, structures } = propsRef.current;

    const anim = camAnimRef.current;
    if (anim) {
      const t = clamp((now - anim.startTime) / anim.duration, 0, 1);
      const ease = 1 - Math.pow(1 - t, 3);
      camRef.current = {
        theta: lerp(anim.from.theta, anim.to.theta, ease),
        phi: lerp(anim.from.phi, anim.to.phi, ease),
        dist: lerp(anim.from.dist, anim.to.dist, ease),
        tx: lerp(anim.from.tx, anim.to.tx, ease),
        ty: lerp(anim.from.ty, anim.to.ty, ease),
        tz: lerp(anim.from.tz, anim.to.tz, ease),
      };
      if (t === 1) camAnimRef.current = null;
    }

    const { project } = buildCam3(camRef.current, width, height);
    const bodyEntries = buildBodyEntries(system.bodies);
    const hoverKey = hoverRef.current;
    const newHitCache: HitEntry[] = [];
    const beltEntryById = new Map<string, BodySceneEntry>();

    ctx.save();
    ctx.scale(dpr, dpr);

    const bg = ctx.createRadialGradient(width * 0.5, height * 0.42, 0, width * 0.5, height * 0.42, Math.max(width, height) * 0.9);
    bg.addColorStop(0, '#0b1731');
    bg.addColorStop(0.55, '#050a18');
    bg.addColorStop(1, '#010308');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, width, height);

    const starRand = createSeededRandom(`${system.id}-scene-stars`);
    for (let index = 0; index < 140; index += 1) {
      const x = starRand() * width;
      const y = starRand() * height;
      const sizeRoll = starRand();
      const size = sizeRoll > 0.96 ? 1.5 : sizeRoll > 0.8 ? 1.05 : 0.55;
      ctx.globalAlpha = 0.08 + starRand() * 0.18;
      ctx.fillStyle = starRand() > 0.82 ? '#93c5fd' : '#e2e8f0';
      ctx.beginPath();
      ctx.arc(x, y, size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    bodyEntries
      .filter(entry => !entry.isMoon)
      .forEach(entry => {
        if (entry.isBelt) {
          const isActiveBelt = hoverKey === `body:${entry.body.id}` || selectedBodyId === entry.body.id;
          const projectedRibbon: Array<{ sx: number; sy: number }> = [];
          let beltScale = 0.7;
          for (let sampleIndex = 0; sampleIndex < 72; sampleIndex += 1) {
            const angle = (sampleIndex / 72) * Math.PI * 2;
            const projected = project(
              Math.cos(angle) * entry.orbitR,
              Math.sin(angle * 2.1) * 0.7,
              Math.sin(angle) * entry.orbitR,
            );
            if (!projected) continue;
            projectedRibbon.push({ sx: projected.sx, sy: projected.sy });
            newHitCache.push({ kind: 'body', id: entry.body.id, sx: projected.sx, sy: projected.sy, r: 12 });
            beltScale = Math.max(beltScale, getProjectedVisualScale(projected.scale, 0.28, 1.22));
          }

          beltEntryById.set(entry.body.id, entry);

          drawNebulaRingBelt(
            ctx,
            projectedRibbon,
            `${system.id}-${entry.body.id}-nebula-ring`,
            entry.body.color,
            isActiveBelt ? 1.02 : 0.72,
            beltScale,
          );
          drawBeltAsteroids(
            ctx,
            projectedRibbon,
            `${system.id}-${entry.body.id}-asteroids`,
            entry.body.color,
            isActiveBelt ? 1 : 0.9,
            beltScale,
            newHitCache,
            entry.body.id,
          );
          strokeProjectedRibbon(
            ctx,
            projectedRibbon,
            colorToRgba(entry.body.color, isActiveBelt ? 0.2 : 0.1),
            (isActiveBelt ? 0.8 : 0.45) * beltScale,
            isActiveBelt ? 0.075 : 0.035,
          );

          const labelPoint = project(Math.cos(entry.angle) * entry.orbitR, 0, Math.sin(entry.angle) * entry.orbitR);
          if (labelPoint && isActiveBelt) {
            ctx.globalAlpha = 0.95;
            ctx.font = '10px monospace';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'bottom';
            ctx.fillStyle = '#fbbf24';
            ctx.fillText(entry.body.name, labelPoint.sx, labelPoint.sy - 12);
          }

          ctx.globalAlpha = 1;
          return;
        }

        drawOrbitLoop(ctx, project, entry.orbitR, '#94a3b8', 0.7, entry.isMoon ? 0.08 : 0.13);
      });

    const planeGlow = project(0, -2, 0);
    if (planeGlow) {
      const glow = ctx.createRadialGradient(planeGlow.sx, planeGlow.sy, 0, planeGlow.sx, planeGlow.sy, width * 0.38);
      glow.addColorStop(0, 'rgba(34,211,238,0.06)');
      glow.addColorStop(1, 'rgba(34,211,238,0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(planeGlow.sx, planeGlow.sy, width * 0.38, 0, Math.PI * 2);
      ctx.fill();
    }

    const fleetPointById = new Map<string, { sx: number; sy: number }>();
    const renderedFleetEntries: Array<{
      fleet: PlayerFleet;
      sx: number;
      sy: number;
      fleetColor: string;
      markerAlpha: number;
      isPinned: boolean;
      isHovered: boolean;
      motion: 'holding' | 'departing' | 'arriving';
      trailPoint: { sx: number; sy: number } | null;
      interactive: boolean;
    }> = [];
    fleets.forEach((fleet, index) => {
      const colorIndex = fleetColorIndexById[fleet.id] ?? index;
      const fleetColor = getFleetColorByIndex(colorIndex);
      const orbitAngle = hashId(fleet.id) + colorIndex * 0.82;
      const orbitPoint = project(
        Math.cos(orbitAngle) * SYSTEM_FLEET_ORBIT_RADIUS,
        14 + (colorIndex % 3) * 2.5,
        Math.sin(orbitAngle) * SYSTEM_FLEET_ORBIT_RADIUS,
      );
      if (!orbitPoint) return;

      const isHovered = hoverKey === `fleet:${fleet.id}`;
      const isPinned = pinnedFleetId === fleet.id;
      let drawPoint = { sx: orbitPoint.sx, sy: orbitPoint.sy };
      let markerAlpha = 1;
      let motion: 'holding' | 'departing' | 'arriving' = 'holding';
      let trailPoint: { sx: number; sy: number } | null = null;
      let interactive = fleet.currentSystemId === system.id;
      const arrivalSnapshot = fleet.currentSystemId === system.id
        && fleet.recentTransitArrival?.toSystemId === system.id
        ? fleet.recentTransitArrival
        : null;

      const order = fleet.fleetOrder;
      if (order && order.currentLeg < order.route.length - 1) {
        const fromSystemId = order.route[order.currentLeg] ?? fleet.currentSystemId;
        const toSystemId = order.route[order.currentLeg + 1] ?? order.destinationSystemId;
        const legDurationMs = Math.max(1000, (order.legDurationSeconds ?? 1) * 1000);
        const transitionDurationMs = clamp(legDurationMs * 0.32, SYSTEM_FLEET_TRANSITION_MIN_MS, SYSTEM_FLEET_TRANSITION_MAX_MS);
        const warpAngle = hashId(`${fromSystemId}:${toSystemId}`);
        const warpPoint = project(
          Math.cos(warpAngle) * SYSTEM_FLEET_WARP_RADIUS,
          17 + (colorIndex % 3) * 3.2,
          Math.sin(warpAngle) * SYSTEM_FLEET_WARP_RADIUS,
        );

        if (warpPoint && fromSystemId === system.id) {
          const elapsedSinceDepartureMs = Math.max(0, worldNow - order.legDepartedAt);
          const departureProgress = clamp(elapsedSinceDepartureMs / transitionDurationMs, 0, 1);
          const exitFadeProgress = clamp((elapsedSinceDepartureMs - transitionDurationMs) / SYSTEM_FLEET_EXIT_LINGER_MS, 0, 1);
          if (departureProgress >= 1 && exitFadeProgress >= 1) return;
          drawPoint = departureProgress >= 1
            ? { sx: warpPoint.sx, sy: warpPoint.sy }
            : {
                sx: lerp(orbitPoint.sx, warpPoint.sx, departureProgress),
                sy: lerp(orbitPoint.sy, warpPoint.sy, departureProgress),
              };
          trailPoint = { sx: orbitPoint.sx, sy: orbitPoint.sy };
          motion = 'departing';
          markerAlpha = departureProgress >= 1
            ? lerp(0.46, 0, exitFadeProgress)
            : lerp(1, 0.58, departureProgress);
          interactive = false;
        }
      } else if (arrivalSnapshot) {
        const arrivalProgress = clamp((worldNow - arrivalSnapshot.arrivedAt) / SYSTEM_FLEET_ARRIVAL_SETTLE_MS, 0, 1);
        const arrivalWarpAngle = hashId(`${arrivalSnapshot.fromSystemId}:${arrivalSnapshot.toSystemId}`);
        const warpPoint = project(
          Math.cos(arrivalWarpAngle) * SYSTEM_FLEET_WARP_RADIUS,
          17 + (colorIndex % 3) * 3.2,
          Math.sin(arrivalWarpAngle) * SYSTEM_FLEET_WARP_RADIUS,
        );
        if (warpPoint && arrivalProgress < 1) {
          drawPoint = {
            sx: lerp(warpPoint.sx, orbitPoint.sx, arrivalProgress),
            sy: lerp(warpPoint.sy, orbitPoint.sy, arrivalProgress),
          };
          trailPoint = { sx: warpPoint.sx, sy: warpPoint.sy };
          motion = 'arriving';
          markerAlpha = lerp(0.52, 1, arrivalProgress);
        }
      }

      fleetPointById.set(fleet.id, drawPoint);
      renderedFleetEntries.push({
        fleet,
        sx: drawPoint.sx,
        sy: drawPoint.sy,
        fleetColor,
        markerAlpha,
        isPinned,
        isHovered,
        motion,
        trailPoint,
        interactive,
      });
    });

    miningLinks.forEach(link => {
      const fleetPoint = fleetPointById.get(link.fleetId);
      const beltEntry = beltEntryById.get(link.beltId);
      if (!fleetPoint || !beltEntry) return;

      const anchorAngle = hashId(`${link.fleetId}:${link.wingId}:${link.beltId}`);
      const beltPoint = project(
        Math.cos(anchorAngle) * beltEntry.orbitR,
        Math.sin(anchorAngle * 2.1) * 0.7,
        Math.sin(anchorAngle) * beltEntry.orbitR,
      );
      if (!beltPoint) return;

      const isPinned = pinnedFleetId === link.fleetId;
      const isBeltFocused = selectedBodyId === link.beltId || hoverKey === `body:${link.beltId}`;
      const linkColor = miningLinkColor(link.wingId);
      const alpha = isPinned || isBeltFocused ? 0.4 : 0.2;
      const dx = beltPoint.sx - fleetPoint.sx;
      const dy = beltPoint.sy - fleetPoint.sy;
      const pulseOffset = ((now / 1300) + ((hashId(`${link.fleetId}:${link.wingId}:${link.beltId}`) / (Math.PI * 2)))) % 1;
      const pulseCount = Math.max(1, Math.min(3, Math.ceil(link.shipCount / 3)));

      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = isPinned || isBeltFocused ? colorToRgba(linkColor, 0.95) : colorToRgba(linkColor, 0.78);
      ctx.lineWidth = isPinned || isBeltFocused ? 1.4 : 0.9;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(fleetPoint.sx, fleetPoint.sy);
      ctx.lineTo(beltPoint.sx, beltPoint.sy);
      ctx.stroke();
      ctx.setLineDash([]);

      for (let pulseIndex = 0; pulseIndex < pulseCount; pulseIndex += 1) {
        const phase = (pulseOffset + pulseIndex / pulseCount) % 1;
        const pulseX = fleetPoint.sx + dx * phase;
        const pulseY = fleetPoint.sy + dy * phase;
        ctx.globalAlpha = (isPinned || isBeltFocused ? 0.9 : 0.58) * (1 - pulseIndex * 0.12);
        ctx.fillStyle = colorToRgba(linkColor, 0.95);
        ctx.beginPath();
        ctx.arc(pulseX, pulseY, isPinned || isBeltFocused ? 2.4 : 1.8, 0, Math.PI * 2);
        ctx.fill();

        ctx.globalAlpha = (isPinned || isBeltFocused ? 0.22 : 0.14);
        ctx.fillStyle = colorToRgba(linkColor, 0.8);
        ctx.beginPath();
        ctx.arc(pulseX, pulseY, isPinned || isBeltFocused ? 5.8 : 4.4, 0, Math.PI * 2);
        ctx.fill();
      }

      const midX = (fleetPoint.sx + beltPoint.sx) / 2;
      const midY = (fleetPoint.sy + beltPoint.sy) / 2;
      ctx.fillStyle = 'rgba(2,6,23,0.88)';
      ctx.strokeStyle = isPinned || isBeltFocused ? colorToRgba(linkColor, 0.5) : colorToRgba(linkColor, 0.3);
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.roundRect(midX - 9, midY - 6, 18, 12, 6);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = linkColor;
      ctx.font = '9px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`${link.shipCount}`, midX, midY + 0.5);
      ctx.restore();
    });

    const starPoint = project(0, 0, 0);
    if (starPoint) {
      const starScale = getProjectedVisualScale(starPoint.scale, 0.42, 1.35);
      const starGlowRadius = Math.max(24, 60 * starScale);
      const starCoreRadius = Math.max(5.5, (system.starSize / 1.6) * starScale);
      const starGlow = ctx.createRadialGradient(starPoint.sx, starPoint.sy, 0, starPoint.sx, starPoint.sy, starGlowRadius);
      starGlow.addColorStop(0, `${system.starColor}dd`);
      starGlow.addColorStop(0.35, `${system.starColor}55`);
      starGlow.addColorStop(1, `${system.starColor}00`);
      ctx.fillStyle = starGlow;
      ctx.beginPath();
      ctx.arc(starPoint.sx, starPoint.sy, starGlowRadius, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = system.starColor;
      ctx.beginPath();
      ctx.arc(starPoint.sx, starPoint.sy, starCoreRadius, 0, Math.PI * 2);
      ctx.fill();
    }

    const projectedBodies = bodyEntries
      .filter(entry => !entry.isBelt)
      .map(entry => {
        const point = project(entry.wx, entry.wy, entry.wz);
        if (!point) return null;
        return { entry, point };
      })
      .filter((entry): entry is { entry: BodySceneEntry; point: NonNullable<ReturnType<ReturnType<typeof buildCam3>['project']>> } => !!entry)
      .sort((a, b) => b.point.depth - a.point.depth);

    projectedBodies.forEach(({ entry, point }) => {
      const isHovered = hoverKey === `body:${entry.body.id}`;
      const isSelected = selectedBodyId === entry.body.id;
      const radius = Math.max(2.2, entry.radius * getProjectedVisualScale(point.scale, 0.35, 1.55));
      const bodyGlow = ctx.createRadialGradient(point.sx, point.sy, 0, point.sx, point.sy, radius * 3.8);
      bodyGlow.addColorStop(0, `${entry.body.color}66`);
      bodyGlow.addColorStop(1, `${entry.body.color}00`);
      ctx.fillStyle = bodyGlow;
      ctx.beginPath();
      ctx.arc(point.sx, point.sy, radius * 3.8, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = entry.body.color;
      ctx.beginPath();
      ctx.arc(point.sx, point.sy, radius, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = 'rgba(255,255,255,0.34)';
      ctx.beginPath();
      ctx.arc(point.sx - radius * 0.28, point.sy - radius * 0.34, radius * 0.36, 0, Math.PI * 2);
      ctx.fill();

      if (isSelected || isHovered) {
        ctx.strokeStyle = isSelected ? '#fbbf24' : 'rgba(255,255,255,0.55)';
        ctx.lineWidth = isSelected ? 1.6 : 1;
        ctx.globalAlpha = isSelected ? 0.95 : 0.7;
        ctx.beginPath();
        ctx.arc(point.sx, point.sy, radius + 6, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }

      if (isSelected || isHovered) {
        ctx.font = '10px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillStyle = isSelected ? '#fbbf24' : '#cbd5e1';
        ctx.fillText(entry.body.name, point.sx, point.sy - radius - 8);
      }

      newHitCache.push({ kind: 'body', id: entry.body.id, sx: point.sx, sy: point.sy, r: Math.max(14, radius + 6) });
    });

    structures.forEach((structure, index) => {
      const angle = hashId(`${system.id}-${structure.kind}`) + index * 0.6;
      const point = project(Math.cos(angle) * 28, 8 + index * 3, Math.sin(angle) * 28);
      if (!point) return;
      const isHovered = hoverKey === `${structure.kind}:${structure.id}`;
      const structureScale = getProjectedVisualScale(point.scale, 0.45, 1.2);
      const structureSize = 5 * structureScale;
      const structureRing = 7 * structureScale;
      ctx.save();
      ctx.translate(point.sx, point.sy);
      ctx.rotate(Math.PI / 4);
      ctx.fillStyle = `${structure.color}${isHovered ? '' : ''}`;
      ctx.globalAlpha = isHovered ? 0.95 : 0.7;
      ctx.fillRect(-structureSize, -structureSize, structureSize * 2, structureSize * 2);
      ctx.strokeStyle = structure.color;
      ctx.lineWidth = 1.1;
      ctx.strokeRect(-structureRing, -structureRing, structureRing * 2, structureRing * 2);
      ctx.restore();
      if (isHovered) {
        ctx.font = '10px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillStyle = structure.color;
        ctx.fillText(structure.label, point.sx, point.sy - 12);
      }
      newHitCache.push({ kind: structure.kind, id: structure.id, sx: point.sx, sy: point.sy, r: 13 });
    });

    renderedFleetEntries.forEach((entry, index) => {
      const { fleet, sx, sy, fleetColor, markerAlpha, isPinned, isHovered, motion, trailPoint, interactive } = entry;
      const pulse = Math.sin(now / 320 + index) * 0.22 + 0.78;
      const fleetScale = getProjectedVisualScale(project(Math.cos(hashId(fleet.id) + (fleetColorIndexById[fleet.id] ?? index) * 0.82) * SYSTEM_FLEET_ORBIT_RADIUS, 14 + ((fleetColorIndexById[fleet.id] ?? index) % 3) * 2.5, Math.sin(hashId(fleet.id) + (fleetColorIndexById[fleet.id] ?? index) * 0.82) * SYSTEM_FLEET_ORBIT_RADIUS)?.scale ?? 12, 0.45, 1.18);
      const fleetGlowRadius = 18 * fleetScale;
      const fleetScanRadius = (10 + Math.sin(now / 220 + index) * 1.4) * fleetScale;
      const fleetPinRadius = 12 * fleetScale;

      ctx.save();
      ctx.globalAlpha = pulse * markerAlpha * (isPinned ? 1 : 0.88);
      const glow = ctx.createRadialGradient(sx, sy, 0, sx, sy, fleetGlowRadius);
      glow.addColorStop(0, colorToRgba(fleetColor, fleet.isScanning ? 0.54 : 0.34));
      glow.addColorStop(1, colorToRgba(fleetColor, 0));
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(sx, sy, fleetGlowRadius, 0, Math.PI * 2);
      ctx.fill();

      if (trailPoint && motion !== 'holding') {
        const trailGradient = ctx.createLinearGradient(trailPoint.sx, trailPoint.sy, sx, sy);
        trailGradient.addColorStop(0, colorToRgba(fleetColor, motion === 'arriving' ? 0.16 : 0.42));
        trailGradient.addColorStop(1, colorToRgba(fleetColor, 0));
        ctx.strokeStyle = trailGradient;
        ctx.lineWidth = motion === 'arriving' ? 1.3 : 1.7;
        ctx.setLineDash(motion === 'arriving' ? [3, 3] : []);
        ctx.beginPath();
        ctx.moveTo(trailPoint.sx, trailPoint.sy);
        ctx.lineTo(sx, sy);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      if (fleet.isScanning) {
        ctx.strokeStyle = 'rgba(196,181,253,0.66)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(sx, sy, fleetScanRadius, 0, Math.PI * 2);
        ctx.stroke();
      }

      if (isPinned) {
        ctx.strokeStyle = '#fbbf24';
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.arc(sx, sy, fleetPinRadius, 0, Math.PI * 2);
        ctx.stroke();
      }

      ctx.translate(sx, sy);
      ctx.rotate(Math.PI / 4);
      const size = (isPinned || isHovered ? 5.5 : 4.5) * fleetScale;
      ctx.fillStyle = colorToRgba(fleetColor, (motion === 'arriving' ? 0.72 : 0.88) * markerAlpha);
      ctx.strokeStyle = motion === 'departing' || motion === 'arriving'
        ? colorToRgba(fleetColor, markerAlpha >= 0.95 ? 1 : Math.max(0.62, markerAlpha))
        : '#e2e8f0';
      ctx.lineWidth = 0.9;
      ctx.fillRect(-size, -size, size * 2, size * 2);
      ctx.strokeRect(-size, -size, size * 2, size * 2);
      ctx.restore();

      if (isPinned || isHovered) {
        ctx.font = '10px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillStyle = isPinned ? '#fbbf24' : fleetColor;
        ctx.fillText(fleet.name, sx, sy - 12);
      }

      if (interactive) {
        newHitCache.push({ kind: 'fleet', id: fleet.id, sx, sy, r: 14 });
      }
    });

    convoyContacts.forEach((contact, index) => {
      const convoyColor = getFleetColorByIndex(contact.colorIndex);
      const orbitAngle = hashId(`${contact.fleetId}:${contact.id}:convoy`) + contact.colorIndex * 0.66;
      const orbitPoint = project(
        Math.cos(orbitAngle) * (SYSTEM_FLEET_ORBIT_RADIUS + 10),
        11 + (contact.colorIndex % 2) * 3,
        Math.sin(orbitAngle) * (SYSTEM_FLEET_ORBIT_RADIUS + 10),
      );
      if (!orbitPoint) return;

      const warpAngle = hashId(`${contact.fromSystemId}:${contact.toSystemId}:${contact.id}`);
      const warpPoint = project(
        Math.cos(warpAngle) * (SYSTEM_FLEET_WARP_RADIUS + 8),
        20 + (contact.colorIndex % 3) * 2.4,
        Math.sin(warpAngle) * (SYSTEM_FLEET_WARP_RADIUS + 8),
      );
      if (!warpPoint) return;
      const convoyScale = getProjectedVisualScale(Math.max(orbitPoint.scale, warpPoint.scale), 0.42, 1.12);

      let drawPoint = { sx: orbitPoint.sx, sy: orbitPoint.sy };
      let trailPoint: { sx: number; sy: number } | null = null;
      let alpha = 0.82;
      let offloading = false;
      const arrivalSnapshot = contact.recentArrivalFromSystemId && contact.recentArrivalAt !== null
        ? {
            fromSystemId: contact.recentArrivalFromSystemId,
            arrivedAt: contact.recentArrivalAt,
          }
        : null;

      if (arrivalSnapshot && worldNow - arrivalSnapshot.arrivedAt < SYSTEM_FLEET_ARRIVAL_SETTLE_MS) {
        const arrivalProgress = clamp((worldNow - arrivalSnapshot.arrivedAt) / SYSTEM_FLEET_ARRIVAL_SETTLE_MS, 0, 1);
        const arrivalWarpAngle = hashId(`${arrivalSnapshot.fromSystemId}:${system.id}:${contact.id}`);
        const arrivalWarpPoint = project(
          Math.cos(arrivalWarpAngle) * (SYSTEM_FLEET_WARP_RADIUS + 8),
          20 + (contact.colorIndex % 3) * 2.4,
          Math.sin(arrivalWarpAngle) * (SYSTEM_FLEET_WARP_RADIUS + 8),
        );
        if (!arrivalWarpPoint) return;
        drawPoint = {
          sx: lerp(arrivalWarpPoint.sx, orbitPoint.sx, arrivalProgress),
          sy: lerp(arrivalWarpPoint.sy, orbitPoint.sy, arrivalProgress),
        };
        trailPoint = { sx: arrivalWarpPoint.sx, sy: arrivalWarpPoint.sy };
        alpha = lerp(0.48, 0.94, arrivalProgress);
        offloading = !!contact.hqOffloadStartedAt;
      } else if (contact.hqOffloadStartedAt) {
        offloading = true;
        const offloadDurationMs = Math.max(1000, contact.cargoTransferDurationSeconds * 1000);
        const offloadProgress = clamp((worldNow - contact.hqOffloadStartedAt) / offloadDurationMs, 0, 1);
        drawPoint = { sx: orbitPoint.sx, sy: orbitPoint.sy };
        alpha = lerp(0.92, 0.55, offloadProgress);
      } else {
        const legDurationMs = Math.max(1000, contact.legDurationSeconds * 1000);
        const transitionDurationMs = clamp(legDurationMs * 0.32, SYSTEM_FLEET_TRANSITION_MIN_MS, SYSTEM_FLEET_TRANSITION_MAX_MS);
        if (contact.fromSystemId === system.id) {
          const elapsedSinceDepartureMs = Math.max(0, worldNow - contact.legDepartedAt);
          const departureProgress = clamp(elapsedSinceDepartureMs / transitionDurationMs, 0, 1);
          const exitFadeProgress = clamp((elapsedSinceDepartureMs - transitionDurationMs) / SYSTEM_FLEET_EXIT_LINGER_MS, 0, 1);
          if (departureProgress >= 1 && exitFadeProgress >= 1) return;
          drawPoint = departureProgress >= 1
            ? { sx: warpPoint.sx, sy: warpPoint.sy }
            : {
                sx: lerp(orbitPoint.sx, warpPoint.sx, departureProgress),
                sy: lerp(orbitPoint.sy, warpPoint.sy, departureProgress),
              };
          trailPoint = { sx: orbitPoint.sx, sy: orbitPoint.sy };
          alpha = departureProgress >= 1
            ? lerp(0.4, 0, exitFadeProgress)
            : lerp(0.95, 0.56, departureProgress);
        } else if (contact.toSystemId === system.id) {
          const arrivalStartAt = contact.legDepartedAt + Math.max(0, legDurationMs - transitionDurationMs);
          const arrivalProgress = clamp((worldNow - arrivalStartAt) / transitionDurationMs, 0, 1);
          if (arrivalProgress <= 0) return;
          drawPoint = {
            sx: lerp(warpPoint.sx, orbitPoint.sx, arrivalProgress),
            sy: lerp(warpPoint.sy, orbitPoint.sy, arrivalProgress),
          };
          trailPoint = { sx: warpPoint.sx, sy: warpPoint.sy };
          alpha = lerp(0.48, 0.94, arrivalProgress);
        }
      }

      ctx.save();
      ctx.globalAlpha = alpha * (0.82 + Math.sin(now / 260 + index) * 0.08);
      const glow = ctx.createRadialGradient(drawPoint.sx, drawPoint.sy, 0, drawPoint.sx, drawPoint.sy, (offloading ? 16 : 14) * convoyScale);
      glow.addColorStop(0, colorToRgba(convoyColor, offloading ? 0.58 : 0.36));
      glow.addColorStop(1, colorToRgba(convoyColor, 0));
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(drawPoint.sx, drawPoint.sy, (offloading ? 16 : 14) * convoyScale, 0, Math.PI * 2);
      ctx.fill();

      if (trailPoint) {
        const trailGradient = ctx.createLinearGradient(trailPoint.sx, trailPoint.sy, drawPoint.sx, drawPoint.sy);
        trailGradient.addColorStop(0, colorToRgba(convoyColor, offloading ? 0.2 : 0.44));
        trailGradient.addColorStop(1, colorToRgba(convoyColor, 0));
        ctx.strokeStyle = trailGradient;
        ctx.lineWidth = 1.2;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(trailPoint.sx, trailPoint.sy);
        ctx.lineTo(drawPoint.sx, drawPoint.sy);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      if (offloading) {
        ctx.strokeStyle = colorToRgba(convoyColor, 0.72);
        ctx.lineWidth = 1;
        ctx.setLineDash([2, 3]);
        ctx.beginPath();
        ctx.arc(drawPoint.sx, drawPoint.sy, (10 + Math.sin(now / 180 + index) * 1.6) * convoyScale, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      ctx.translate(drawPoint.sx, drawPoint.sy);
      ctx.rotate(Math.PI / 4);
      const size = (offloading ? 4.2 : 3.8) * convoyScale;
      ctx.fillStyle = colorToRgba(convoyColor, offloading ? 0.64 : 0.84);
      ctx.strokeStyle = colorToRgba(convoyColor, 0.96);
      ctx.lineWidth = 0.9;
      ctx.fillRect(-size, -size, size * 2, size * 2);
      ctx.strokeRect(-size, -size, size * 2, size * 2);
      ctx.restore();
    });

    ctx.restore();
    hitCacheRef.current = newHitCache;
    rafRef.current = requestAnimationFrame(draw);
  }, []);

  useEffect(() => {
    rafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafRef.current);
  }, [draw]);

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const observer = new ResizeObserver(entries => {
      const entry = entries[0];
      const canvas = canvasRef.current;
      if (!entry || !canvas) return;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(entry.contentRect.width * dpr);
      canvas.height = Math.round(entry.contentRect.height * dpr);
    });
    observer.observe(wrap);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();
      camRef.current.dist = clamp(camRef.current.dist * (event.deltaY < 0 ? 0.88 : 1.12), 72, 280);
    };
    canvas.addEventListener('wheel', handleWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', handleWheel);
  }, []);

  const applyPanDelta = useCallback((dx: number, dy: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const width = canvas.width / dpr;
    const height = canvas.height / dpr;
    const { rX, rZ, uX, uY, uZ, focalLen } = buildCam3(camRef.current, width, height);
    const worldPerPixel = camRef.current.dist / focalLen;
    camRef.current.tx -= (dx * rX - dy * uX) * worldPerPixel;
    camRef.current.ty -= (-dy * uY) * worldPerPixel;
    camRef.current.tz -= (dx * rZ - dy * uZ) * worldPerPixel;
  }, []);

  const applyOrbitDelta = useCallback((dx: number, dy: number) => {
    camRef.current.theta += dx * 0.008;
    camRef.current.phi = clamp(camRef.current.phi - dy * 0.006, 0.55, 1.45);
  }, []);

  const applyZoomFactor = useCallback((factor: number) => {
    camRef.current.dist = clamp(camRef.current.dist * factor, 72, 280);
  }, []);

  const hitTest = useCallback((x: number, y: number) => {
    for (const hit of hitCacheRef.current) {
      const dx = x - hit.sx;
      const dy = y - hit.sy;
      if (dx * dx + dy * dy <= hit.r * hit.r) {
        return hit;
      }
    }
    return null;
  }, []);

  const handleMouseDown = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    dragRef.current = {
      active: true,
      mode: event.shiftKey || event.button === 1 ? 'pan' : 'orbit',
      startX: event.clientX,
      startY: event.clientY,
    };
  }, []);

  const handleMouseUp = useCallback(() => {
    dragRef.current.active = false;
  }, []);

  const handleMouseLeave = useCallback(() => {
    dragRef.current.active = false;
    hoverRef.current = null;
    onHoverChange(null);
  }, [onHoverChange]);

  const handleMouseMove = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const mouseX = event.clientX - rect.left;
    const mouseY = event.clientY - rect.top;

    if (dragRef.current.active) {
      const dx = event.clientX - dragRef.current.startX;
      const dy = event.clientY - dragRef.current.startY;
      dragRef.current.startX = event.clientX;
      dragRef.current.startY = event.clientY;

      if (dragRef.current.mode === 'pan') {
        applyPanDelta(dx, dy);
      } else {
        applyOrbitDelta(dx, dy);
      }

      hoverRef.current = null;
      onHoverChange(null);
      return;
    }

    const nextHit = hitTest(mouseX, mouseY);

    hoverRef.current = nextHit ? `${nextHit.kind}:${nextHit.id}` : null;
    onHoverChange(nextHit ? { kind: nextHit.kind, id: nextHit.id, x: mouseX, y: mouseY } : null);
    if (wrapRef.current) {
      wrapRef.current.style.cursor = nextHit ? 'pointer' : 'grab';
    }
  }, [applyOrbitDelta, applyPanDelta, hitTest, onHoverChange]);

  const handleClick = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mouseX = event.clientX - rect.left;
    const mouseY = event.clientY - rect.top;

    const hit = hitTest(mouseX, mouseY);
    if (hit) {
      if (hit.kind === 'fleet') {
        onFleetClick(hit.id);
        return;
      }
      if (hit.kind === 'body') {
        onSelectBody(hit.id);
        return;
      }
      return;
    }

    onSelectBody(null);
  }, [hitTest, onFleetClick, onSelectBody]);

  const onPointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== 'touch') return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    event.preventDefault();
    const rect = canvas.getBoundingClientRect();
    event.currentTarget.setPointerCapture(event.pointerId);

    pointerGesture.current.pointers.set(event.pointerId, {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    });
    pointerGesture.current.lastTapPointerId = event.pointerId;
    pointerGesture.current.moved = false;
    hoverRef.current = null;
    onHoverChange(null);

    if (pointerGesture.current.pointers.size >= 2) {
      const points = Array.from(pointerGesture.current.pointers.values());
      const dx = points[1].x - points[0].x;
      const dy = points[1].y - points[0].y;
      pointerGesture.current.lastDistance = Math.hypot(dx, dy);
      pointerGesture.current.lastCenter = {
        x: (points[0].x + points[1].x) / 2,
        y: (points[0].y + points[1].y) / 2,
      };
    }
  }, [onHoverChange]);

  const onPointerMove = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== 'touch') return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const gesture = pointerGesture.current;
    if (!gesture.pointers.has(event.pointerId)) return;

    const nextPoint = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    const previousPoint = gesture.pointers.get(event.pointerId);
    if (!previousPoint) return;
    gesture.pointers.set(event.pointerId, nextPoint);

    const moveDx = nextPoint.x - previousPoint.x;
    const moveDy = nextPoint.y - previousPoint.y;
    if (Math.abs(moveDx) > 2 || Math.abs(moveDy) > 2) {
      gesture.moved = true;
    }

    if (gesture.pointers.size >= 2) {
      const points = Array.from(gesture.pointers.values());
      const center = {
        x: (points[0].x + points[1].x) / 2,
        y: (points[0].y + points[1].y) / 2,
      };
      const dx = points[1].x - points[0].x;
      const dy = points[1].y - points[0].y;
      const distance = Math.hypot(dx, dy);

      if (gesture.lastCenter) {
        applyPanDelta(center.x - gesture.lastCenter.x, center.y - gesture.lastCenter.y);
      }

      if (gesture.lastDistance && distance > 0 && gesture.lastDistance > 0) {
        const zoomFactor = clamp(gesture.lastDistance / distance, 0.9, 1.1);
        applyZoomFactor(zoomFactor);
      }

      gesture.lastCenter = center;
      gesture.lastDistance = distance;
      return;
    }

    applyOrbitDelta(moveDx, moveDy);
  }, [applyOrbitDelta, applyPanDelta, applyZoomFactor]);

  const onPointerEnd = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== 'touch') return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const gesture = pointerGesture.current;
    const releasedPoint = gesture.pointers.get(event.pointerId) ?? {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };
    const wasTap = !gesture.moved && gesture.lastTapPointerId === event.pointerId && gesture.pointers.size === 1;

    gesture.pointers.delete(event.pointerId);
    if (gesture.pointers.size < 2) {
      gesture.lastCenter = null;
      gesture.lastDistance = null;
    }

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    if (!wasTap) return;

    const hit = hitTest(releasedPoint.x, releasedPoint.y);
    if (hit?.kind === 'fleet') {
      onFleetClick(hit.id);
      return;
    }
    if (hit?.kind === 'body') {
      onSelectBody(hit.id);
      return;
    }
    onSelectBody(null);
  }, [hitTest, onFleetClick, onSelectBody]);

  const handleReset = useCallback(() => {
    camAnimRef.current = {
      from: { ...camRef.current },
      to: { ...SYSTEM_CAM_DEFAULT },
      startTime: performance.now(),
      duration: 680,
    };
  }, []);

  return (
    <div
      ref={wrapRef}
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseLeave}
      onMouseMove={handleMouseMove}
      onClick={handleClick}
      onDoubleClick={handleReset}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', minHeight: 0, overflow: 'hidden', cursor: 'grab', userSelect: 'none', touchAction: 'none' }}
    >
      <canvas ref={canvasRef} style={{ display: 'block', width: '100%', height: '100%' }} />

      <div style={{ position: 'absolute', left: 16, top: 14, display: 'flex', gap: 8, alignItems: 'center' }}>
        <div style={{
          padding: '6px 10px',
          borderRadius: 999,
          border: '1px solid rgba(34,211,238,0.18)',
          background: 'rgba(2,6,23,0.68)',
          fontSize: 9,
          color: '#94a3b8',
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
        }}>
          Drag orbit · Shift-drag pan · Wheel zoom
        </div>
        <button
          onClick={event => {
            event.stopPropagation();
            handleReset();
          }}
          style={{
            padding: '6px 10px',
            borderRadius: 999,
            border: '1px solid rgba(148,163,184,0.2)',
            background: 'rgba(2,6,23,0.72)',
            color: '#cbd5e1',
            cursor: 'pointer',
            fontSize: 9,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
          }}
        >
          Reset View
        </button>
      </div>
    </div>
  );
}