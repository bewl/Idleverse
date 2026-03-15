/**
 * Travel / warp logic.
 *
 * Design:
 * - Distance is measured in normalised [0,1]² galaxy units.
 * - BASE_WARP_LY_PER_SECOND is the default warp speed.
 * - Skills and ship upgrades can add to 'warp-speed' modifier.
 * - While in warp, mining is suspended (gated in tickRunner).
 * - Arriving in a new system marks it visited and resets mining belt targets.
 */

import type { GameState } from '@/types/game.types';
import type { StarSystem, WarpState } from '@/types/galaxy.types';
import { systemDistance } from '@/game/galaxy/galaxy.gen';

/** Base galaxy units per second. Galaxy is 200 LY wide → 1 unit = 200 LY.
 *  Base: 0.02 units/s ≈ 4 LY/s. Full cross-galaxy (~1.0 units) = ~50 seconds. */
export const BASE_WARP_SPEED = 0.020;

/** Minimum warp time in seconds regardless of speed/distance (transition feel). */
export const MIN_WARP_SECONDS = 6;

/** Maximum warp time cap in seconds (QoL — no 10-minute waits). */
export const MAX_WARP_SECONDS = 120;

export function getWarpSpeedMultiplier(state: GameState): number {
  return 1 + (state.modifiers['warp-speed'] ?? 0);
}

/** Compute warp duration for a given pair of systems. */
export function calcWarpDuration(
  state: GameState,
  from: StarSystem,
  to: StarSystem,
): number {
  const dist     = systemDistance(from, to);
  const speed    = BASE_WARP_SPEED * getWarpSpeedMultiplier(state);
  const raw      = dist / speed;
  return Math.max(MIN_WARP_SECONDS, Math.min(MAX_WARP_SECONDS, raw));
}

/** Returns warp progress [0, 1] at a given timestamp. */
export function getWarpProgress(warp: WarpState, nowMs: number): number {
  const elapsed = (nowMs - warp.startedAt) / 1000;
  return Math.min(1, elapsed / warp.durationSeconds);
}

/** True if the warp has completed. */
export function isWarpComplete(warp: WarpState, nowMs: number): boolean {
  return getWarpProgress(warp, nowMs) >= 1;
}

/** Estimated time remaining in seconds. */
export function warpEtaSeconds(warp: WarpState, nowMs: number): number {
  const elapsed = (nowMs - warp.startedAt) / 1000;
  return Math.max(0, warp.durationSeconds - elapsed);
}

export function formatEta(seconds: number): string {
  if (seconds < 60) return `${Math.ceil(seconds)}s`;
  const m = Math.floor(seconds / 60);
  const s = Math.ceil(seconds % 60);
  return `${m}m ${s}s`;
}

/** Tick function: advance warp progress, return arrival system ID if complete. */
export interface TravelTickResult {
  arrivedAt: string | null;
  newWarp: WarpState | null;
}

export function tickTravel(
  warp: WarpState | null,
  nowMs: number,
): TravelTickResult {
  if (!warp) return { arrivedAt: null, newWarp: null };

  if (isWarpComplete(warp, nowMs)) {
    return { arrivedAt: warp.toSystemId, newWarp: null };
  }

  const progress = getWarpProgress(warp, nowMs);
  return { arrivedAt: null, newWarp: { ...warp, progress } };
}
