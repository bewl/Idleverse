import type { GameState, ReprocessingJob } from '@/types/game.types';
import {
  ORE_YIELD_TABLE,
  BATCH_SIZE_BASE,
  BATCH_TIME_SECONDS,
  MAX_AUTO_BATCHES_PER_ORE,
} from './reprocessing.config';

// ─── Result type ────────────────────────────────────────────────────────────

export interface ReprocessingTickResult {
  /** Minerals to add to player inventory after completed batches. */
  mineralDeltas: Record<string, number>;
  /** Ore consumed during this tick (manual batches already deducted when queued;
   *  auto-batches are deducted here at run-time). */
  oreConsumed: Record<string, number>;
  /** Updated queue after processing. */
  newQueue: ReprocessingJob[];
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/** The reprocessing-efficiency multiplier from trained skills. */
export function getReprocessingEfficiency(state: GameState): number {
  return 1 + (state.modifiers['reprocessing-efficiency'] ?? 0);
}

/** Minerals produced by converting `amount` units of `oreId`. */
export function getReprocessingYield(
  state: GameState,
  oreId: string,
  amount: number,
): Record<string, number> {
  const table = ORE_YIELD_TABLE[oreId];
  if (!table) return {};
  const efficiency  = getReprocessingEfficiency(state);
  const scaleFactor = (amount / BATCH_SIZE_BASE) * efficiency;
  const result: Record<string, number> = {};
  for (const [mineralId, baseYield] of Object.entries(table)) {
    const qty = Math.floor(baseYield * scaleFactor);
    if (qty > 0) result[mineralId] = qty;
  }
  return result;
}

/** A short human-readable preview of what one batch of this ore yields. */
export function getBatchYieldPreview(state: GameState, oreId: string): string {
  const minerals = getReprocessingYield(state, oreId, BATCH_SIZE_BASE);
  if (Object.keys(minerals).length === 0) return 'Unknown ore';
  return Object.entries(minerals)
    .map(([id, qty]) => `${qty} ${id}`)
    .join(' + ');
}

// ─── Main tick ───────────────────────────────────────────────────────────────

export function tickReprocessing(state: GameState, deltaSeconds: number): ReprocessingTickResult {
  const mineralDeltas: Record<string, number> = {};
  const oreConsumed:   Record<string, number> = {};

  // Start with a mutable copy of the queue
  let queue: ReprocessingJob[] = [...state.systems.reprocessing.queue];

  // ── Auto-queue: fill queue from enabled auto-targets ──────────────────
  const autoTargets   = state.systems.reprocessing.autoTargets  ?? {};
  const autoThreshold = state.systems.reprocessing.autoThreshold ?? {};
  const prospectiveResources: Record<string, number> = { ...state.resources };

  for (const [oreId, enabled] of Object.entries(autoTargets)) {
    if (!enabled) continue;
    const available  = prospectiveResources[oreId] ?? 0;
    const keepAmount = autoThreshold[oreId] ?? 0;
    const surplus    = available - keepAmount;
    if (surplus < BATCH_SIZE_BASE) continue;

    // Count how many auto-batches for this ore are already queued
    const existingAutoBatches = queue.filter(j => j.oreId === oreId && j.isAuto).length;
    const slotsAvailable      = MAX_AUTO_BATCHES_PER_ORE - existingAutoBatches;
    if (slotsAvailable <= 0) continue;

    // Add up to slotsAvailable new batches, as long as there's enough surplus
    let canAdd = Math.min(slotsAvailable, Math.floor(surplus / BATCH_SIZE_BASE));
    for (let i = 0; i < canAdd; i++) {
      const prospective = prospectiveResources[oreId] ?? 0;
      if (prospective - (autoThreshold[oreId] ?? 0) < BATCH_SIZE_BASE) break;
      // Deduct from prospective (actual deduction returned to caller via oreConsumed)
      prospectiveResources[oreId] = (prospectiveResources[oreId] ?? 0) - BATCH_SIZE_BASE;
      oreConsumed[oreId] = (oreConsumed[oreId] ?? 0) + BATCH_SIZE_BASE;
      queue.push({ oreId, amount: BATCH_SIZE_BASE, progress: 0, isAuto: true });
    }
  }

  // ── Process queue head ────────────────────────────────────────────────
  let remaining = deltaSeconds;
  while (remaining > 0 && queue.length > 0) {
    const head = queue[0];
    const needed = BATCH_TIME_SECONDS - head.progress;

    if (remaining >= needed) {
      // Batch completes this tick
      const minerals = getReprocessingYield(state, head.oreId, head.amount);
      for (const [k, v] of Object.entries(minerals)) {
        mineralDeltas[k] = (mineralDeltas[k] ?? 0) + v;
      }
      remaining -= needed;
      queue = queue.slice(1);
    } else {
      // Still in progress
      queue = [{ ...head, progress: head.progress + remaining }, ...queue.slice(1)];
      remaining = 0;
    }
  }

  return { mineralDeltas, oreConsumed, newQueue: queue };
}
