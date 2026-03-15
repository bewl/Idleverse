# Idleverse – Core System Blueprints

## Purpose

This document defines the **implemented gameplay systems** of Idleverse.
It is the reference for how each system behaves, what it depends on, and how it integrates with
the rest of the game.

For the forward-looking feature pipeline (upcoming phases), see `Idleverse_DESIGN_PLAN.md`.

---

# System 1 – Asteroid Mining

## Role

The starting system and foundation of the resource economy. Players activate ore belts to
continuously produce raw ore that accumulates in an ore hold, then gets hauled to inventory.

## State

`src/game/systems/mining/`

```ts
MiningState {
  targets: Record<beltId, boolean>     // which belts are active
  oreHold: Record<resourceId, number>  // ore collected, not yet hauled
  beltPool: Record<beltId, number>     // remaining ore before depletion
  beltRespawnAt: Record<beltId, ms>    // when a depleted belt respawns
  lastHaulAt: number                   // unix-ms of last auto/manual haul
}
```

## Mechanics

- **9 ore belts** across 3 security tiers (highsec ×4, lowsec ×3, nullsec ×2)
- Lowsec requires Advanced Mining I; nullsec requires Advanced Mining III
- Each belt has a `poolSize` — it depletes as ore is extracted, then respawns
- Ore accumulates in `oreHold`; the hold has a capacity (`BASE_ORE_HOLD_CAPACITY = 5,000`)
- Auto-haul timer: base 120 s, reduced by `haul-speed` modifier and hauling-assigned ships
- Hauling-role ships reduce the haul interval by `0.05 × hull.baseCargoMultiplier` each, capped at 70% total reduction

## Dependencies

- Skills: Mining, Astrogeology, Advanced Mining, Ice Harvesting, Drone Interfacing, Mining Barge
- Fleet: ships with `activity: 'hauling'` reduce haul timer

---

# System 2 – Reprocessing

## Role

Converts raw ores into refined minerals — the input material for all manufacturing.

## State

`src/game/systems/reprocessing/`

## Mechanics

- Works as a job queue (up to 3 simultaneous jobs)
- Each job processes a batch of ore into minerals over time
- **Efficiency** skill-scaled: Reprocessing, Reprocessing Efficiency, Metallurgy skills apply
- Auto-reprocessing: per-ore toggle + configurable minimum-keep threshold
- Yield improved by `reprocessing-efficiency` modifier

---

# System 3 – Manufacturing

## Role

Converts minerals into manufactured components and ships via a recipe queue.

## State

`src/game/systems/manufacturing/`

## Recipes (12 total)

**Components (Tier 3):** Hull Plate, Thruster Node, Condenser Coil, Sensor Cluster, Mining Laser, Shield Emitter

**Ships (Tier 4):** Shuttle, Frigate, Mining Frigate, Hauler, Destroyer, Exhumer

## Mechanics

- Recipe queue with up to 5 parallel jobs
- Manufacturing speed scaled by Industry + Advanced Industry skills
- Ship recipes produce a `ShipInstance` (not a stackable resource)
- Some recipes gated by skill level (e.g. Sensor Cluster requires Electronics II)

---

# System 4 – Skills

## Role

The core progression system. Corp-wide skills apply global modifiers. Pilots have individual skill
queues for combat/mining specialisation.

## State

`src/game/systems/skills/`

## Skill Categories (34 skills total)

| Category | Skills |
|---|---|
| Mining | Mining, Astrogeology, Advanced Mining, Ice Harvesting, Drone Interfacing, Mining Barge |
| Spaceship | Spaceship Command, Frigate, Mining Frigate, Industrial, Destroyer, Cruiser, Gunnery, Military Operations |
| Industry | Industry, Advanced Industry, Reprocessing, Reprocessing Efficiency |
| Science | Science, Metallurgy, Survey |
| Electronics | Electronics, CPU Management, Ladar Sensing |
| Trade | Trade, Broker Relations |

## Mechanics

- Training one level at a time; queue holds up to 50 entries
- Time per level: `SKILL_LEVEL_SECONDS[level-1] × rank` (level 1 = 60s × rank, level 5 = 64,800s × rank)
- Skills apply effects via `modifiers` dictionary in GameState
- Pilot skills (individual) trained through the Pilots tab in the Fleet panel

---

# System 5 – Market

## Role

NPC buy/sell orders for all resources and ships. Provides the primary ISK income loop.
Prices are dynamic per system, driven by seeded demand and a live pressure model.

## State

`src/game/systems/market/`

`galaxy.systemPressure: Record<systemId, Record<resourceId, number>>` — live price pressure per system

## Mechanics

### Static Prices & Sell Bonuses
- Base NPC buy prices per resource defined in `market.config.ts`
- Auto-sell: per-resource toggle with configurable keep-threshold
- Trade skill improves effective sell price via `market-sell-price` modifier
- Lifetime ISK tracking per resource

### Dynamic Per-System Pricing (Phase 1)

```
localPrice(resource, system) = basePrice × demandMultiplier × systemPressure
```

- **`demandMultiplier`** — seeded [0.5, 2.0] from `galaxySeed + systemId + resourceId`; static per galaxy
- **`systemPressure`** — starts at 1.0; trade buys raise it, trade sells depress it; decays to 1.0 at **5%/hr**
- **Price clamp:** `[base × 0.6, base × 1.4]` — absolute ±40% floor/ceiling
- **`systemDemandVolume`** = `max(5, round(500_000 / basePrice))` — ~500k ISK saturates any market

Functions: `getDemandMultiplier`, `getSystemPressure`, `getLocalPrice`, `tickPricePressure`

### Trade Routes (Phase 1)

Automated fleet buy/haul/sell loops registered as `TradeRoute` records in `fleet.tradeRoutes`.

```ts
TradeRoute { id, name, fleetId, fromSystemId, toSystemId, resourceId, amountPerRun,
             enabled, inTransit, buyCostForTransit, lastRunProfit, totalRunsCompleted }
```

**Loop:**
1. Fleet idle at `fromSystemId` → buys `amountPerRun` at local price, dispatches to `toSystemId`
2. Fleet arrives at `toSystemId` → sells cargo, records profit, dispatches back
3. Repeat while `enabled`

**Unlock:** Trade III required; max routes = `tradeLevel − 2` (1 at III, 2 at IV, 3 at V)

Function: `tickTradeRoutes` (called in tick step 8b)

**Store actions:** `createTradeRoute`, `deleteTradeRoute`, `toggleTradeRoute`

## UI

- **MarketPanel** — tab bar: "Market Listings" (original view) | "Trade Routes"
- **Trade Routes tab** — quota display, route cards (status/profit/run count), create-route form
- **StarMapPanel Intel panel** — "Trade Opportunity" block showing top-3 minerals by buy-here/sell-there ratio (only if ratio > 1.05)

---

# System 6 – Galaxy & Fleet Navigation

## Role

A 400-system procedurally generated galaxy with jump lanes. Player fleets travel between
systems via BFS shortest-path or Dijkstra least-cost routing.

## State

`src/game/galaxy/`, `src/types/galaxy.types.ts`

## Mechanics

- 400 systems procedurally generated from a seed; 3 security tiers (highsec, lowsec, nullsec)
- Jump lanes form a connected graph; fleets advance one hop per tick
- Fleet `fleetOrder` drives movement; `maxJumpRangeLY` constrains which hops are valid
- RoutePlanner in StarMapPanel: calculates and dispatches multi-hop routes
- StarMapPanel right panel: Intel tab (system info, threats) | Route tab (route planning)

---

# System 7 – Fleet Management

## Role

The player's ships, pilots, and named fleets. All fleet operations (mining assignment, hauling,
combat) flow through this system.

## State

`src/game/systems/fleet/`

## Key Types

```ts
ShipInstance {
  activity: 'idle' | 'mining' | 'hauling' | 'transport'
  role: 'tank' | 'dps' | 'support' | 'scout' | 'unassigned'
  hullDamage: number   // 0–100%; >80% = offline
  assignedPilotId, fleetId, fittedModules, systemId, ...
}

PlayerFleet {
  shipIds, currentSystemId, fleetOrder, doctrine, combatOrder, ...
}
```

## Mechanics

- Ships have activity assignments and combat roles
- Named fleets group ships for travel and combat orders
- **Fleet Doctrines** (Balanced, Brawl, Sniper, Shield Wall, Stealth Raid) adjust combat multipliers
- Hull damage accumulates in combat; passive idle repair at ~1.5% hull integrity/min
- Instant repair costs 1× Hull Plate resource
- Ships with `activity: 'hauling'` reduce the mining haul interval
- Pilot morale tracked; morale affects combat effectiveness + training speed

---

# System 8 – Fleet Combat

## Role

Fleets earn ISK bounties and resource loot by engaging NPC pirate groups. Resolution is automatic.

## State

`src/game/systems/combat/`, `src/types/combat.types.ts`

## NPC Groups

- Spawned deterministically per system from `seed + systemId`
- Lowsec: 1–3 groups, strength 50–200; Nullsec: 2–5 groups, strength 100–500
- Respawn timer: 4–12 hours after destruction

## Combat Resolution

```
powerRatio = fleetCombatRating / npcGroup.strength
variance   = seededRandom × 0.4 − 0.2         (±20%, reduced by scout ships)
adjusted   = powerRatio × (1 + variance) × doctrineMultipliers

VICTORY (adjusted ≥ 1.0):
  loot        = rollLootTable(npcGroup.lootTable)
  bounty      = npcGroup.bounty
  fleetDamage = 5%  + 15%  × (1 − adjusted)

DEFEAT (adjusted < 1.0):
  no loot, no bounty
  fleetDamage = 20% + 30% × (1 − adjusted)
```

## Orders

- **Patrol** — fleet continuously engages weakest alive NPC group (requires Spaceship Command II)
- **Raid** — single engagement with a specific NPC group (requires Military Operations I)

## Combat Log

Last 20 engagements tracked in `combat.log` with outcome, bounty, and damage taken.

---

# System 9 – Factions

## Role

Four galactic factions with reputation tracking. Standing consequences planned for Phase 5.

## Factions

| ID | Name | Territory |
|---|---|---|
| `concordat` | The Concordat | Highsec core systems |
| `veldris` | Veldris Corporation | Highsec industrial systems |
| `free-covenant` | Free Covenant | Lowsec border systems |
| `null-syndicate` | Null Syndicate | Nullsec deep space |

## Current State

Reputation (`standing`) tracked per faction. Effects (docking access, hostile patrols,
mission boards) are designed for Phase 5 but not yet active.

---

# System 10 – Pilots

## Role

Individual crew members assigned to ships. Each pilot has skills, morale, a training focus,
and specialisations that affect their ship's combat/mining/hauling effectiveness.

## Mechanics

- Pilots are generated with seeded names, stats, and skill levels
- Assigned to ships via FleetPanel → Ships tab
- Pilot skills trained individually on a per-pilot queue
- Training focus (`mining`, `combat`, `hauling`, `exploration`, `balanced`) guides auto-training
- Morale: 0–100%, affected by combat outcomes and pilot events
- `getPilotCombatBonus()`, `getPilotMiningBonus()`, `getPilotHaulingBonus()` compute effectiveness

---

# Planned Future Systems

See `Idleverse_DESIGN_PLAN.md` for detailed specs on:

| System | Phase |
|---|---|
| Dynamic Economy & Trade Routes | Phase 1 |
| Blueprint Research & T2 Manufacturing | Phase 3 |
| Exploration & Anomaly Scanning | Phase 4 |
| Factions, Stations & Mission Boards | Phase 5 |
| Structures & Player Outposts | Phase 6 |
| Prestige / New Game+ | Phase 7 |
