import type { GameState } from '@/types/game.types';
import { tickMining, getOreHoldCapacity, getHaulIntervalSeconds } from '@/game/systems/mining/mining.logic';
import { tickSkills } from '@/game/systems/skills/skills.logic';
import { tickManufacturing, tickResearch } from '@/game/systems/manufacturing/manufacturing.logic';
import { tickReprocessing } from '@/game/systems/reprocessing/reprocessing.logic';
import { tickMarket } from '@/game/systems/market/market.logic';
import { tickPricePressure, tickTradeRoutes } from '@/game/systems/market/market.logic';
import { processUnlocks } from '@/game/progression/unlocks';
import { tickTravel } from '@/game/galaxy/travel.logic';
import { getSystemById, getSystemBeltIds } from '@/game/galaxy/galaxy.gen';
import { tickFleet } from '@/game/systems/fleet/fleet.tick';
import { advanceFleetOrders } from '@/game/systems/fleet/fleet.orders';
import { tickCombat } from '@/game/systems/combat/combat.logic';

export interface TickResult {
  newState: GameState;
  completedManufacturing: Record<string, number>;
  skillsAdvanced: Array<{ skillId: string; fromLevel: number; toLevel: number }>;
}

export function runTick(state: GameState, deltaSeconds: number): TickResult {
  const completedManufacturing: Record<string, number> = {};
  let skillsAdvanced: Array<{ skillId: string; fromLevel: number; toLevel: number }> = [];

  // ── 1. Skills: advance training queue ─────────────────────────────────
  const skillsResult = tickSkills(state, deltaSeconds);
  let s: GameState = {
    ...state,
    systems: { ...state.systems, skills: skillsResult.newSkillsState },
  };
  skillsAdvanced = skillsResult.advanced;

  // Merge modifier deltas from newly levelled skills
  if (Object.keys(skillsResult.modifierDeltas).length > 0) {
    const newMods = { ...s.modifiers };
    for (const [k, v] of Object.entries(skillsResult.modifierDeltas)) {
      newMods[k] = (newMods[k] ?? 0) + v;
    }
    s = { ...s, modifiers: newMods };
  }

  // Merge unlock deltas from newly levelled skills
  if (Object.keys(skillsResult.unlockDeltas).length > 0) {
    s = { ...s, unlocks: { ...s.unlocks, ...skillsResult.unlockDeltas } };
  }

  // ── 2. Mining: produce ores into ore hold (suspended during warp) ──────
  const inWarp = !!(s.galaxy?.warp);
  const miningResult = inWarp
    ? { oreHoldDeltas: {}, newBeltPool: {}, newBeltRespawnAt: {}, autoDeactivated: [] }
    : tickMining(s, deltaSeconds);

  {
    // Apply ore hold deltas (capped by capacity)
    const capacity = getOreHoldCapacity(s);
    const currentUsed = Object.values(s.systems.mining.oreHold ?? {}).reduce((a, v) => a + v, 0);
    let spaceLeft = Math.max(0, capacity - currentUsed);

    const newOreHold = { ...s.systems.mining.oreHold ?? {} };
    for (const [resourceId, delta] of Object.entries(miningResult.oreHoldDeltas)) {
      const clamped = Math.min(delta, spaceLeft);
      if (clamped <= 0) continue;
      newOreHold[resourceId] = (newOreHold[resourceId] ?? 0) + clamped;
      spaceLeft -= clamped;
    }

    // Merge belt pool & respawn meta
    const newBeltPool     = { ...s.systems.mining.beltPool ?? {},     ...miningResult.newBeltPool };
    const newBeltRespawnAt = { ...s.systems.mining.beltRespawnAt ?? {}, ...miningResult.newBeltRespawnAt };

    // Deactivate depleted belts
    const newTargets = { ...s.systems.mining.targets };
    for (const beltId of miningResult.autoDeactivated) {
      newTargets[beltId] = false;
    }

    // Lifetime tracking (ore that reached the hold counts)
    const newLifetime = { ...s.systems.mining.lifetimeProduced ?? {} };
    for (const [resourceId, delta] of Object.entries(miningResult.oreHoldDeltas)) {
      newLifetime[resourceId] = (newLifetime[resourceId] ?? 0) + delta;
    }

    s = {
      ...s,
      systems: {
        ...s.systems,
        mining: {
          ...s.systems.mining,
          targets: newTargets,
          oreHold: newOreHold,
          beltPool: newBeltPool,
          beltRespawnAt: newBeltRespawnAt,
          lifetimeProduced: newLifetime,
        },
      },
    };

    // ── 2a. Auto-haul trigger ─────────────────────────────────────────────
    const haulIntervalMs = getHaulIntervalSeconds(s) * 1000;
    const nowMs = s.lastUpdatedAt + Math.round(deltaSeconds * 1000);
    const lastHaulAt = s.systems.mining.lastHaulAt ?? s.lastUpdatedAt;
    if (nowMs - lastHaulAt >= haulIntervalMs) {
      // Flush hold into resources
      const newResources = { ...s.resources };
      const flushedHold: Record<string, number> = {};
      for (const [resourceId, amount] of Object.entries(s.systems.mining.oreHold ?? {})) {
        newResources[resourceId] = (newResources[resourceId] ?? 0) + amount;
        flushedHold[resourceId]  = 0;
      }
      s = {
        ...s,
        resources: newResources,
        systems: {
          ...s.systems,
          mining: {
            ...s.systems.mining,
            oreHold: flushedHold,
            lastHaulAt: nowMs,
          },
        },
      };
    }
  }

  // ── 3. Reprocessing: auto-queue and advance active batch ───────────────
  if (s.unlocks['system-reprocessing']) {
    const reprResult = tickReprocessing(s, deltaSeconds);

    // Apply ore consumed by auto-batching
    const newResAfterOre = { ...s.resources };
    for (const [oreId, consumed] of Object.entries(reprResult.oreConsumed)) {
      newResAfterOre[oreId] = Math.max(0, (newResAfterOre[oreId] ?? 0) - consumed);
    }
    // Apply mineral deltas from completed batches
    for (const [mineralId, gained] of Object.entries(reprResult.mineralDeltas)) {
      newResAfterOre[mineralId] = (newResAfterOre[mineralId] ?? 0) + gained;
    }

    s = {
      ...s,
      resources: newResAfterOre,
      systems: {
        ...s.systems,
        reprocessing: { ...s.systems.reprocessing, queue: reprResult.newQueue },
      },
    };
  }

  // ── 4. Manufacturing: advance active job ───────────────────────────────
  const mfgResult = tickManufacturing(s, deltaSeconds);
  if (mfgResult.completedJobs.length > 0) {
    const newQueue          = s.systems.manufacturing.queue.slice(1);
    const newCompletedCount = { ...s.systems.manufacturing.completedCount };
    const newResources      = { ...s.resources };
    let blueprints = [...s.systems.manufacturing.blueprints];
    for (const job of mfgResult.completedJobs) {
      newCompletedCount[job.recipeId] = (newCompletedCount[job.recipeId] ?? 0) + job.qty;
      completedManufacturing[job.recipeId] = (completedManufacturing[job.recipeId] ?? 0) + job.qty;
      // Consume BPC run if applicable
      if (job.blueprintId) {
        blueprints = blueprints.reduce<typeof blueprints>((acc, bp) => {
          if (bp.id !== job.blueprintId) { acc.push(bp); return acc; }
          const remaining = bp.copiesRemaining !== null ? bp.copiesRemaining - 1 : null;
          if (remaining === null || remaining > 0) {
            acc.push({ ...bp, copiesRemaining: remaining });
          }
          // remaining === 0 → BPC deleted (not pushed)
          return acc;
        }, []);
      }
    }
    for (const [id, amount] of Object.entries(mfgResult.resourceProduced)) {
      newResources[id] = (newResources[id] ?? 0) + amount;
    }
    s = {
      ...s,
      resources: newResources,
      systems: {
        ...s.systems,
        manufacturing: { ...s.systems.manufacturing, queue: newQueue, completedCount: newCompletedCount, blueprints },
      },
    };
  } else if (s.systems.manufacturing.queue.length > 0) {
    const updatedQueue = [...s.systems.manufacturing.queue];
    updatedQueue[0] = { ...updatedQueue[0], progress: updatedQueue[0].progress + mfgResult.progressIncrement };
    s = {
      ...s,
      systems: { ...s.systems, manufacturing: { ...s.systems.manufacturing, queue: updatedQueue } },
    };
  }

  // ── 4a. Research & Copy: advance blueprint research/copy jobs ─────────
  if (s.unlocks['system-manufacturing']) {
    const researchResult = tickResearch(s, deltaSeconds);

    if (
      researchResult.completedResearch.length > 0 ||
      researchResult.completedCopies.length > 0 ||
      researchResult.newBlueprints.length > 0
    ) {
      const completedResearchIds = new Set(researchResult.completedResearch.map(j => j.id));
      const completedCopyIds     = new Set(researchResult.completedCopies.map(j => j.id));
      const unlockIds            = new Set(researchResult.unlockBlueprintIds);

      // Apply blueprint updates (level-ups + unlocks)
      const blueprintUpdateMap = new Map(researchResult.blueprintUpdates.map(b => [b.id, b]));
      let updatedBlueprints = s.systems.manufacturing.blueprints.map(b => {
        if (blueprintUpdateMap.has(b.id))    return blueprintUpdateMap.get(b.id)!;
        if (unlockIds.has(b.id))             return { ...b, isLocked: false };
        return b;
      });

      // Add newly created T2 BPOs and BPCs
      updatedBlueprints = [...updatedBlueprints, ...researchResult.newBlueprints];

      const updatedResearchJobs = s.systems.manufacturing.researchJobs
        .filter(j => !completedResearchIds.has(j.id));
      const updatedCopyJobs = s.systems.manufacturing.copyJobs
        .filter(j => !completedCopyIds.has(j.id));

      s = {
        ...s,
        systems: {
          ...s.systems,
          manufacturing: {
            ...s.systems.manufacturing,
            blueprints: updatedBlueprints,
            researchJobs: updatedResearchJobs,
            copyJobs: updatedCopyJobs,
          },
        },
      };
    } else {
      // Just advance progress on all running research/copy jobs
      const mfgSys = s.systems.manufacturing;
      const completedResearchIds = new Set(researchResult.completedResearch.map(j => j.id));
      const completedCopyIds     = new Set(researchResult.completedCopies.map(j => j.id));
      const speedMult = 1 + (s.modifiers['blueprint-research-speed'] ?? 0);
      const effectiveDelta = deltaSeconds * speedMult;

      if (mfgSys.researchJobs.length > 0 || mfgSys.copyJobs.length > 0) {
        const updatedResearch = mfgSys.researchJobs
          .filter(j => !completedResearchIds.has(j.id))
          .map(j => ({ ...j, progress: j.progress + effectiveDelta }));
        const updatedCopies = mfgSys.copyJobs
          .filter(j => !completedCopyIds.has(j.id))
          .map(j => ({ ...j, progress: j.progress + effectiveDelta }));
        s = {
          ...s,
          systems: {
            ...s.systems,
            manufacturing: { ...s.systems.manufacturing, researchJobs: updatedResearch, copyJobs: updatedCopies },
          },
        };
      }
    }
  }

  // ── 5. Market: auto-sell tick ─────────────────────────────────────────
  if (s.unlocks['system-market']) {
    const marketResult = tickMarket(s, deltaSeconds);
    if (marketResult.iskGained > 0 || Object.keys(marketResult.resourcesSold).length > 0) {
      const newResAfterSell = { ...s.resources };
      for (const [resourceId, sold] of Object.entries(marketResult.resourcesSold)) {
        newResAfterSell[resourceId] = Math.max(0, (newResAfterSell[resourceId] ?? 0) - sold);
      }
      newResAfterSell['credits'] = (newResAfterSell['credits'] ?? 0) + marketResult.iskGained;
      s = {
        ...s,
        resources: newResAfterSell,
        systems: {
          ...s.systems,
          market: {
            ...s.systems.market,
            lastTickAt: s.lastUpdatedAt,
            lifetimeSold: marketResult.newLifetimeSold,
          },
        },
      };
    }
  }

  // ── 6. Unlock checks ──────────────────────────────────────────────────
  const newUnlocks = processUnlocks(s);
  if (Object.keys(newUnlocks).length > 0) {
    s = { ...s, unlocks: { ...s.unlocks, ...newUnlocks } };
  }

  // ── 7. Travel: advance warp, handle arrival ───────────────────────────
  const nowMs = s.lastUpdatedAt + Math.round(deltaSeconds * 1000);
  if (s.galaxy?.warp) {
    const travelResult = tickTravel(s.galaxy.warp, nowMs);
    if (travelResult.arrivedAt) {
      // Arrived — update current system, mark visited, clear available belt targets
      const arrivedId = travelResult.arrivedAt;
      const arrivedSystem = getSystemById(s.galaxy.seed, arrivedId);
      const systemBeltIds = getSystemBeltIds(arrivedSystem);
      // Build fresh target map: all belts in new system default to false
      const freshTargets: Record<string, boolean> = {};
      for (const beltId of systemBeltIds) {
        freshTargets[beltId] = false;
      }
      s = {
        ...s,
        galaxy: {
          ...s.galaxy,
          currentSystemId: arrivedId,
          warp: null,
          visitedSystems: { ...s.galaxy.visitedSystems, [arrivedId]: true },
        },
        systems: {
          ...s.systems,
          mining: {
            ...s.systems.mining,
            targets: freshTargets,
            // Clear belt pool + respawn state for the new system (fresh discovery)
            beltPool: {},
            beltRespawnAt: {},
          },
        },
      };
    } else if (travelResult.newWarp) {
      s = { ...s, galaxy: { ...s.galaxy, warp: travelResult.newWarp } };
    }
  }

  // ── 8. Fleet: tick pilots (skills, morale), compute fleet mining ─────────
  if (s.unlocks['system-fleet']) {
    const fleetResult = tickFleet(s, deltaSeconds);
    s = {
      ...s,
      systems: {
        ...s.systems,
        fleet: fleetResult.newFleetState,
      },
    };
    // ── 8a. Advance autonomous fleet orders (one hop per tick) ──────────
    const orderResult = advanceFleetOrders(s);
    s = orderResult.newState;

    // ── 8b. Trade route automation (buy/sell + dispatch) ────────────────
    s = tickTradeRoutes(s);
  }

  // ── 9. Combat: resolve fleet combat engagements ─────────────────────────
  if (s.unlocks['system-fleet']) {
    const combatResult = tickCombat(s, deltaSeconds);
    s = combatResult.newState;
  }

  // ── 10. Price pressure decay (all active system pressure → 1.0) ──────────
  s = tickPricePressure(s, deltaSeconds);

  // ── 11. Advance timestamp ─────────────────────────────────────────────────
  s = { ...s, lastUpdatedAt: nowMs };

  return { newState: s, completedManufacturing, skillsAdvanced };
}

