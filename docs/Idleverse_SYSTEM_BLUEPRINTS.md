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
  targets: Record<beltId, boolean>     // legacy field — no longer drives mining production
  beltPool: Record<beltId, number>     // remaining ore before depletion
  beltRespawnAt: Record<beltId, ms>    // when a depleted belt respawns
}
```

> Note: `oreHold` has been removed. All ore production flows through fleet `cargoHold` via `fleet.tick.ts` → `oreDeltas` → `tickRunner` step 8. `tickMining()` now only manages belt pool respawn timers.

## Mechanics

- **10 ore belts** across 3 security tiers (highsec ×4, lowsec ×4, nullsec ×2)
- Lowsec progression now branches across Advanced Mining I-II and Mining Barge I; nullsec belts require Mining Barge I or Astrogeology V depending on deposit class
- **Belt skill gates**: `ORE_BELTS[beltId].requiredSkill` is checked in `setShipActivity()` before a ship can be assigned to mine a belt; if the corp's skill level is below the required minimum the assignment is rejected. The `SystemPanel` renders locked belt cards with a 🔒 disabled button and a `GameTooltip` displaying the required skill name and level; unlocked belts surface live fleet-assignment status rather than a legacy mining toggle.
- The `SystemPanel` is the operational assignment surface for mining: each unlocked belt card can now directly assign a configured mining wing in the current system to that belt, pushing the wing's ships into `activity: 'mining'` with the selected `assignedBeltId`.
- The `MiningPanel` now groups active operations by mining wing rather than showing a single fleet-level cargo bar, so belt assignments and storage fill are presented in the same wing section. Storage is framed everywhere as a `Storage Target`: either shared fleet storage when no hauling wing exists, a single hauling-wing cargo hold, or a multi-wing hauling network.
- Each belt has a `poolSize` — it depletes as ore is extracted, then respawns
- Ore accumulates in the storage target for the fleet: `fleet.cargoHold` for legacy fleets, or `haulingWing.cargoHold` when a hauling wing exists. The active hold has a capacity derived from assigned hull cargo.
- Auto-haul at 80% cargo fill — see System 7 Fleet Cargo Hold for the full round-trip logic

UI notes: the `FleetPanel` storage module and the Mining HUD tooltip use the same storage-target language so fleets, mining wings, and the top data bar no longer describe the same storage pool using different labels.

## Dependencies

- Skills: Mining, Astrogeology, Advanced Mining (belt security gates), Ice Harvesting, Drone Interfacing, Mining Barge
- Fleet: ships assigned to a belt via `setShipActivity('mining', assignedBeltId)` drive ore production through `fleet.tick.ts`; belt skill gate enforced at assignment time

---

# System 2 – Reprocessing

## Role

Converts raw ores into refined minerals — the input material for all manufacturing.

## State

`src/game/systems/reprocessing/`

## Mechanics

- Works as a job queue (up to 3 simultaneous jobs)
- Each job processes a batch of ore into minerals over time
- The lowsec `Ionite` branch adds `Fluxite` as a midgame conductive mineral for cruiser reactors and combat electronics
- **Efficiency** skill-scaled: Reprocessing, Reprocessing Efficiency, Metallurgy skills apply
- Auto-reprocessing: per-ore toggle + configurable minimum-keep threshold
- Yield improved by `reprocessing-efficiency` modifier
- Locked-state UX now uses a shared unlock-preview card that shows the exact skill requirement, ETA from current corp skills, why reprocessing matters, and a direct jump to the Skills panel instead of a bare denial state

---

# System 3 – Manufacturing

## Role

Converts minerals and intermediate parts into manufactured components, modules, and ships via a recipe queue.

## State

`src/game/systems/manufacturing/`

## Recipes

Current live recipes cover:

- Tier 3 shared components, including the cruiser-support set: Armor Honeycomb, Reactor Lattice, and Targeting Bus
- Craftable ship fittings for every current T1 module definition
- Tier 4 T1 ships from Shuttle through Cruiser and Exhumer
- T2 components, T2 ships, and the POS Core strategic structure item

## Mechanics

- Recipe queue with up to 5 parallel jobs
- Manufacturing speed scaled by Industry + Advanced Industry skills
- Ship recipes produce a `ShipInstance` (not a stackable resource)
- Module recipes produce stackable resource inventory, and fitting now consumes module stock while removal or ship recall returns modules to inventory
- Some recipes gated by skill level (e.g. Sensor Cluster requires Electronics II)
- Locked-state UX now uses a shared unlock-preview card that explains the Industry I requirement, ETA from the current corp skill sheet, and the downstream value of converting ore and minerals into ships, components, and later blueprint research

---

# System 4 – Skills

## Role

The core progression system. Corp-wide skills apply global modifiers. Pilots have individual skill
queues for combat/mining specialisation.

## State

`src/game/systems/skills/`

## Skill Categories (35 skills total)

| Category | Skills |
|---|---|
| Mining | Mining, Astrogeology, Advanced Mining, Ice Harvesting, Drone Interfacing, Mining Barge |
| Spaceship | Spaceship Command, Navigation, Frigate, Mining Frigate, Industrial, Destroyer, Cruiser, Gunnery, Military Operations |
| Industry | Industry, Advanced Industry, Reprocessing, Reprocessing Efficiency |
| Science | Science, Metallurgy, Survey, Astrometrics, Archaeology, Hacking |
| Electronics | Electronics, CPU Management, Ladar Sensing |
| Trade | Trade, Broker Relations, Accounting |

## Mechanics

- Training one level at a time; queue holds up to 50 entries
- Time per level: `SKILL_LEVEL_SECONDS[level-1] × rank` (level 1 = 60s × rank, level 5 = 64,800s × rank)
- Skills apply effects via `modifiers` dictionary in GameState
- Pilot skills (individual) trained through the Pilots tab in the Fleet panel
- `Navigation` is now the baseline travel-speed progression hook. Corp training increases the global `warp-speed` modifier, while pilot-trained Navigation contributes to the assigned ship's live transit profile during fleet and wing travel.
- The Overview panel now reads the current skill sheet to frame five parallel progression tracks (Mining, Industry, Trade, Combat, Exploration), each with a next unlock target and ETA so the skill system teaches options rather than only exposing raw modifier rows
- `SkillsPanel` now includes a path-oriented specialization guide plus outcome text in the detail pane, so players can compare payoff, ETA, and downstream unlocks before committing queue time
- `SkillsPanel` now also surfaces advisory specialization lanes ranked from the live corp state. The top recommendations are computed from current inventory, unlock status, fleet activity, and first-week progression context rather than being static card ordering.
- When the skill queue is idle or has no follow-up entries, `SkillsPanel` now collapses the empty training/queue placeholders into a compact command strip so the browser and detail pane move higher instead of losing vertical space to oversized empty states.
- The `SkillsPanel` detail pane is independently scrollable and the full panel reserves mobile bottom-nav space so late-page training controls remain reachable on smaller viewports

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
- Locked-state UX now uses the shared unlock-preview card to explain the Trade I requirement, ETA, immediate sale-value payoff, and the later Trade III automation branch

---

# System 6 – Galaxy & Fleet Navigation

## Role

A 400-system procedurally generated galaxy with jump lanes. Player fleets travel between
systems via BFS shortest-path or Dijkstra least-cost routing.

## State

`src/game/galaxy/`, `src/types/galaxy.types.ts`

## Mechanics

- 400 systems procedurally generated from a seed; 3 security tiers (highsec, lowsec, nullsec)
- Jump lanes form a connected graph; fleets and detached hauling/escort wings now advance across timed warp legs derived from the same warp-duration model used by manual travel
- Fleet `fleetOrder` drives movement; `maxJumpRangeLY` constrains which hops are valid, while each active leg stores departure time plus computed duration so ETA/progress can be rendered consistently in simulation and UI
- Fleet and wing warp timing now composes four live speed sources: corp `warp-speed`, hull warp bonus, assigned-pilot Navigation skill, and fitted/commander travel bonuses (`warp-tuner-i`, `logistics-command`)
- RoutePlanner in StarMapPanel: calculates and dispatches multi-hop routes
- While the Route tab is open, clicking a system directly on the map now sets the route destination in-place instead of kicking the user back to Intel view
- Changing the route origin, destination, or route filter clears the currently rendered route preview so the map never shows a stale path after planner inputs change
- Fleet-group dispatch now recalculates effective jump range from the fleet's live hull mix before issuing an order and refreshes stale cached range values, so saved fleets cannot silently fail valid routes because of outdated `maxJumpRangeLY` data
- StarMapPanel right panel: Intel tab (system info, threats) | Route tab (route planning)
- FleetPanel navigation now surfaces the selected route posture's consequence inline (`Direct`, `Safest`, `No-null`, `High-sec`) so movement policy reads as a tradeoff between speed and exposure instead of a hidden dropdown value
- StarMap route summaries now estimate total travel time, average hop time, and route exposure from the solved hop sequence so players can compare fast-vs-safe posture before dispatching a fleet; when a fleet is bound as the route origin, the estimate uses that fleet's live warp profile instead of a generic hull-only assumption
- Route summaries now surface inline dispatch acceptance/failure messaging so route-planning clicks resolve into a visible fleet-order state instead of a silent no-op when a move is rejected
- FleetPanel now exposes in-transit destination, next jump, current-leg progress, and aggregate ETA for whole-fleet movement, while dispatched hauling wings surface convoy ETA based on their detached ship orders
- StarMapPanel defaults to rendering a name label for every visible system, including unvisited systems, so the galaxy canvas matches route-planning dropdown intel. A Display filter can hide labels for a cleaner view, and the canvas now reintroduces zoom-adaptive decluttering at wide zoom levels so non-critical labels thin out before they become unreadable. Highlighted systems (selected/current/hovered/route) still receive stronger alpha and optional secondary security/star-type text.
- StarMapPanel hover detail is now rendered as a React overlay anchored to the projected star position instead of a canvas text box. Hover cards can show richer system intel such as fleets present, body counts, active threats, trade spreads, and route-hop context while the canvas remains responsible only for hit-testing and highlight rings.
- StarMapPanel right rail now gives more room to route planning and system inspection: the rail is wider, the current-location summary is condensed into a compact header strip, and route controls use larger task-oriented controls with a more legible route-summary card.

---

# System 7 – Fleet Management

## Role

The player's ships, pilots, and named fleets. All fleet operations (mining assignment, hauling,
combat) flow through this system. The player acts as a **CEO director** — no personal location.
All ore production and hauling runs through fleet storage → Corp HQ. That storage is either `fleet.cargoHold` or a hauling wing's `cargoHold`.

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
  shipIds, currentSystemId, fleetOrder, doctrine, combatOrder, isScanning
  cargoHold: Record<string, number>   // legacy ore hold for non-wing fleets
  miningOriginSystemId?: string       // set during haul trip; used to route return + restore mining
  // cargoCapacity computed via computeFleetCargoCapacity(fleet, ships)
}
```

## UI Notes

- `ShipCard` now surfaces a `Hull Identity` block with the hull description, warp bonus, slot layout, and a compact summary of currently fitted bonus directions (mining, combat, cargo, scan, warp) so players can read hull tradeoffs before optimizing deeper fitting behavior

## Corp Identity

The corporation state lives in `GameState.corp: CorpState { name, foundedAt }`.
The deprecated `state.pilot` field is migration-only and no longer written to.

## Corporal HQ

`GameState.systems.factions.homeStationId / homeStationSystemId` tracks the designated Corp HQ.
Starter saves seed `station-home` as an already-registered HQ. Additional stations must be docked and registered through `registerWithStation(stationId)` before `setHomeStation(stationId, systemId)` can promote them to active HQ.
Player-built outposts now occupy the same HQ slot: consuming one manufactured `pos-core` via `deployPOS(systemId)` anchors a player outpost in that system, records it in `factions.outposts`, and promotes it to the active Corp HQ immediately.
The active HQ station also grants one faction-specific passive bonus:

- Concordat HQ: +10% manufacturing speed
- Veldris HQ: +15% mining yield in Veldris-controlled systems
- Covenant HQ: +10% market sell price
- Syndicate HQ: +20% combat loot quality

Player outposts currently provide the infrastructure baseline without a faction passive bonus. They act as a neutral full-access HQ for manufacturing and reprocessing gating, and their level/storage hooks establish the upgrade path for the remaining FC-4 POS work.

## Fleet Cargo Hold

Each `PlayerFleet` has a legacy `cargoHold: Record<string, number>` for non-wing mining. Fleets that define a hauling wing instead store mined ore in `FleetWing.cargoHold` on that hauling wing. `computeFleetCargoCapacity(fleet, ships)` still sums total fleet capacity, while `getWingCargoCapacity(wing, ships)` computes hauling-wing capacity.

**Auto-haul trigger**: Every tick, the auto-haul block chooses one of two paths:

- **Hauling wing present**: when the hauling wing cargo reaches ≥90% of hauling-wing capacity and the wing is not already dispatched, only the hauling wing and its optional escort wing are sent to HQ.
- **Escort-aware route policy**: unescorted hauling wings now prefer the safest available route to HQ and only fall back to more direct routes when needed. Hauling wings with an active escort wing prefer direct routing first and fall back to safer paths if no direct route exists.
- **No hauling wing present**: when the fleet cargo reaches ≥80% capacity and no active movement order exists, the original whole-fleet auto-haul path fires.

- **Fleet already at HQ** (`currentSystemId === homeSystemId`): ore is dumped inline immediately into `state.resources`. No haul trip is dispatched and `miningOriginSystemId` is not set. This prevents cargo from being stripped on the same tick it was produced for stationary mining fleets.
- **Fleet away from HQ**: `fleet.miningOriginSystemId` is set to `fleet.currentSystemId`, and a haul route to HQ is dispatched via `issueFleetGroupOrder`.

**HQ dump on arrival**: When a whole fleet arrives at the HQ system carrying ore (indicated by `miningOriginSystemId` being set), its `cargoHold` is flushed into `state.resources`. When a hauling wing arrives, `haulingWing.cargoHold` is flushed instead.

**Return to origin**: After dumping, either the whole fleet or the dispatched hauling wing group is automatically sent back to its origin.

**Mining restored**: When the return trip completes, ships with an `assignedBeltId` have their `activity` restored to `'mining'`, completing the round-trip loop.

**Manual haul**: FleetPanel expanded card shows a fill bar and a "Haul to HQ" button. For whole fleets without hauling wings, this now uses the same `miningOriginSystemId` round-trip stamp as auto-haul so the fleet dumps at HQ and returns to its mining system correctly.

## Mechanics

- Ships have activity assignments and combat roles
- Named fleets group ships for travel and combat orders
- **Fleet Doctrines** (Balanced, Brawl, Sniper, Shield Wall, Stealth Raid) adjust combat multipliers
- Hull damage accumulates in combat; passive idle repair at ~1.5% hull integrity/min
- Instant repair costs 1× Hull Plate resource
- Ships with `activity: 'hauling'` reduce the mining haul interval
- Pilot morale tracked; morale affects combat effectiveness + training speed
- The Recruitment Office no longer relies only on manual contract posting. Progression milestones can now auto-post targeted contracts, with offers biased toward the live bottleneck: first-sale expansion, storage-pressure hauling support, combat-ready patrol staffing, or exploration staffing after scanning unlocks
- These one-time milestone contracts are tracked in fleet state so they only trigger once per save. Offers carry source metadata and an in-UI rationale so the player can see why a pilot is being recommended now instead of seeing recruitment as a disconnected generic shop

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

Four galactic factions with reputation tracking, docking rules, and the first Corp HQ registration consequences. Broader standing consequences still expand in Phase 5.

## Factions

| ID | Name | Territory |
|---|---|---|
| `concordat` | The Concordat | Highsec core systems |
| `veldris` | Veldris Corporation | Highsec industrial systems |
| `free-covenant` | Free Covenant | Lowsec border systems |
| `null-syndicate` | Null Syndicate | Nullsec deep space |

## Current State

Reputation (`standing`) is tracked per faction and already affects two live station behaviors:

- docking access through `minRepToDock`
- Corp HQ registration through station-specific `registrationRepRequired`

Stations also expose deterministic registration credit costs. The broader consequence layer (station services, hostile patrols, mission boards) remains designed but not yet active.
The active HQ faction bonus is already live and feeds manufacturing, mining, market, or combat depending on the registered HQ station's faction.

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

# System 11 – Blueprint Research & T2 Manufacturing

## Role

Converts NPC combat loot (datacores) + Science skill + time into T2 blueprints. T2 ships
and components are 40–60% stronger and represent the mid-game manufacturing plateau.
The research loop closes the combat → manufacturing → combat cycle.

## State

`src/game/systems/manufacturing/` (extended)

```ts
ManufacturingState {
  // existing fields ...
  blueprints:   Blueprint[]
  researchJobs: ResearchJob[]
  copyJobs:     CopyJob[]
}

Blueprint {
  id: string
  itemId: string            // links to manufacturing recipe
  tier: 1 | 2
  type: 'original' | 'copy'
  researchLevel: number     // 0–10 (originals only); level 5 unlocks T2 BPO
  copiesRemaining: number | null  // null = unlimited (originals)
  isLocked: boolean         // true while being researched or copied
}

ResearchJob {
  id: string              // unique job id
  blueprintId: string     // which BPO is being researched
  progress: number        // seconds accumulated
  totalTime: number       // computed by getResearchTimeForLevel(currentLevel)
}

CopyJob {
  id: string
  sourceBlueprintId: string
  runs: number            // BPC run count chosen at copy time
  progress: number
  totalTime: number
}
```

## Mechanics

### Blueprint Library
All players start with 12 T1 BPOs (one per T1 recipe) at `researchLevel 0`.

### Research Queue
- Default 3 concurrent slots; +1 at Science L3; +1 at Science L5 (max 5)
- Each level consumes 1 datacore of the matching type and takes `300 × 1.5^currentLevel` seconds
- Progress rate: `1 unit/s × researchSpeedMultiplier`; speed from `blueprint-research-speed` modifier (Science skill)
- At `researchLevel 5` on a T1 BPO → corresponding T2 BPO automatically unlocked
- BPO is `isLocked = true` while being researched or copied

### Copy System
- Select a BPO + number of runs (1–10); occupies one research slot
- Copy time: `150 × runs` seconds
- On completion: BPO unlocked; new BPC added to `blueprints` with `copiesRemaining = runs`
- BPC consumed one-per-job on manufacturing completion (decrements `copiesRemaining`; removed at 0)

### T2 Manufacturing
- T2 recipes require T2 BPC + morphite/zydrine + T1 components
- Queuing a T2 job via `queueManufacturingWithBpc` validates the BPC and deducts resources
- T2 jobs show blueprintId in the job card; amber color theme in UI

## Dependencies

- Skills: Science (research speed, +slots), Advanced Industry (T2 BPC usage)
- Resources: datacores (research cost), morphite + zydrine (T2 material inputs)
- Combat: NPC loot tables (datacore source)

## Key Functions (`manufacturing.logic.ts`)

| Function | Description |
|---|---|
| `getResearchSpeedMultiplier(state)` | Returns `1 + blueprint-research-speed` modifier sum |
| `getMaxResearchSlots(state)` | Returns 3–5 based on Science skill level |
| `getResearchTimeForLevel(level)` | Returns `round(300 × 1.5^level)` |
| `getCopyTime(runs)` | Returns `round(150 × runs)` |
| `tickResearch(state, delta)` | Advances all research/copy jobs; handles completions |

## Store Actions (`gameStore.ts`)

| Action | Description |
|---|---|
| `queueManufacturingWithBpc(recipeId, qty, blueprintId)` | T2 manufacturing job with BPC validation |
| `researchBlueprint(blueprintId)` | Start research on a BPO (deducts datacore, checks slots) |
| `cancelResearchJob(jobId)` | Cancel active research; unlock BPO; no datacore refund |
| `copyBlueprint(blueprintId, runs)` | Start copying; checks slots; locks BPO |
| `cancelCopyJob(jobId)` | Cancel copy; unlock source BPO |

## UI

**ManufacturingPanel** — two tabs:
- **Jobs tab** — active + queued jobs; T2 BPC info rows; T2 amber color accent
- **Blueprints tab** — research slot counter, active research/copy job cards (violet/green progress), BPO/BPC library with research level pips, Improve/Copy/Queue buttons

---

# System 12 — Exploration & Anomaly Scanning

**Phase:** 4 (Shipped July 2025)

## Purpose

Give unexplored systems a sense of genuine mystery. Fleets equipped with sensor modules can scan down hidden anomalies that yield unique rewards — bonus ore, datacores, relics, and wormhole connections that temporarily reshape the galaxy.

## Anomaly Types

| Type | signatureRadius | Reward |
|---|---|---|
| `ore-pocket` | 100–300 AU | `activateOrePocket` awards bonus ferrite; depleted immediately |
| `data-site` | 40–100 AU | `lootSite` (requires Hacking L1) — datacores & electronic components |
| `relic-site` | 20–70 AU | `lootSite` (requires Archaeology L1) — advanced alloys & starship datacores |
| `combat-site` | 30–120 AU | Revealed for manual combat initiation (Phase 2 resolution) |
| `wormhole` | 60–150 AU | Temporary jump edge; `linkedSystemId`, `massRemaining`, `expiresAt` |

## Scan Formula

```
progressPerSecond = fleetScanStrength / anomaly.signatureRadius
fleetScanStrength = Σ ships × (hull.baseSensorStrength + scanStrengthModules) × (1 + scan-speed modifier)
```

- `scan-speed` modifier: Astrometrics skill (+0.10/level)
- `scan-strength` from modules: `cargo-scanner-i` (+0.10), `scan-pinpointing-i` (+0.20)
- Anomaly revealed when `scanProgress >= 100`

## Anomaly Generation

Anomalies are generated lazily when a scanning fleet first ticks in a system:

- Seed: `FNV(systemId) XOR daySeed` where `daySeed = Math.floor(nowMs / 86_400_000)`
- Pools and count ranges vary by security tier:
  - Highsec: 0–2, bias ore-pocket/data-site
  - Lowsec: 1–3, bias combat-site/relic-site
  - Nullsec: 2–4, bias wormhole/combat-site

## New Skills (Science category)

| Skill | Rank | Effect | Prereq |
|---|---|---|---|
| `astrometrics` | 2 | scan-speed +10%/level | science:1 |
| `archaeology` | 3 | unlocks loot-relic-sites | astrometrics:1 |
| `hacking` | 2 | unlocks loot-data-sites | astrometrics:1 |

## T2 Hulls Added

| Hull | baseSensorStrength | Role |
|---|---|---|
| `assault-frigate` | 8 | T2 combat frigate |
| `covert-ops` | 15 | Best scanner; exploration specialist |
| `command-destroyer` | 7 | T2 fleet command destroyer |

## State Shape

```ts
// GalaxyState
anomalies: Record<string, Anomaly[]>   // systemId → daily anomaly pool

// FleetState
discoveries: DiscoveryEntry[]          // last 50 discovery events

// PlayerFleet
isScanning: boolean                    // scanning mode toggle
```

## Tick Integration

Step 8c in `tickRunner.ts` (gated by `unlocks['system-exploration']`):
1. Iterates scanning fleets
2. Lazily generates anomalies for each fleet's current system
3. Advances `scanProgress` per anomaly
4. Emits `DiscoveryEntry` on revelation
5. Merges results back into `state.galaxy.anomalies` and `state.systems.fleet.discoveries`

## Files

- `src/game/galaxy/anomaly.gen.ts` — deterministic generation
- `src/game/systems/fleet/exploration.logic.ts` — tick logic + scan strength helper
- `src/stores/gameStore.ts` — `setFleetScanning`, `lootSite`, `activateOrePocket`
- `src/ui/panels/SystemPanel.tsx` — Anomalies tab with scan progress bars & action buttons
- `src/ui/panels/OverviewPanel.tsx` — `DiscoveriesCard` feed

---

# System 13 — Navigation, Tooltip & UI Framework

## Role

Horizontal UI infrastructure layer providing content-aware navigation, composable nested
tolltips, and a consistent visual language of glows, entity tags, and data-rich panel layouts
across all 9 game panels.

## Components

### `useUiStore` — UI State Store

`src/stores/uiStore.ts`

```ts
interface UiStore {
  activePanel: PanelId;          // which panel is visible
  focusTarget: FocusTarget | null; // entity to highlight after navigation
  devTimeScale: number;          // DEV only — tick speed multiplier

  navigate(panelId: PanelId, focus?: FocusTarget): void;
  clearFocus(): void;
  setDevTimeScale(scale: number): void;
}

type PanelId = 'overview' | 'skills' | 'fleet' | 'starmap' | 'system'
             | 'mining' | 'manufacturing' | 'reprocessing' | 'market';

type EntityType = 'fleet' | 'pilot' | 'ship' | 'skill' | 'resource' | 'system' | 'anomaly';

type FocusTarget = { entityType: EntityType; entityId: string };
```

Held in its own Zustand store (separate from `gameStore`) so that navigation calls from inside
portal-rendered tooltips work without being in the React component tree.

### `<GameTooltip>` — Behavioral Shell

`src/ui/components/GameTooltip.tsx`

Props: `content: ReactNode`, `pinnable?: boolean`, `delay?: number`, `width?: number | 'auto'`

- Uses `TooltipDepthContext` (React Context) to track nesting depth
- z-index formula: `9998 + depth × 4` (supports tooltips inside tooltips)
- 80ms hover delay with **smart close**: fires only after mouse leaves both trigger AND tooltip body
- Optional `pinnable`: click-to-pin, ESC or second click to close
- Viewport-clamped position via `getBoundingClientRect()`
- Renders via `createPortal(…, document.body)`
- **Zero layout opinions** — content is 100% caller-defined

### `TT.*` — Composable Tooltip Primitives

Named export from the same file as `GameTooltip`. Stateless presentational building blocks
for assembling rich tooltip layouts. All accept `ReactNode` children.

| Primitive | Purpose |
|---|---|
| `TT.Header` | Accent-colored header bar with icon, title, subtitle, badge slots |
| `TT.Section` | Labeled section with optional right-side adornment |
| `TT.Grid` | 2–4-column key/value data grid |
| `TT.Row` | Single label/value row with optional accent color |
| `TT.Divider` | Thin separator with optional centered label |
| `TT.ProgressBar` | Labeled inline mini progress bar |
| `TT.BadgeRow` | Horizontal row of colored status badges |
| `TT.Footer` | Muted hint/tip text section |
| `TT.Spacer` | Fixed vertical gap |

Design principle: primitives compose freely. A fleet tooltip uses `TT.Header` + `TT.Grid` +
`TT.BadgeRow` + inline `NavTag`s — no structure is imposed.

### `<GameDropdown>` — Behavioral Selection Shell

`src/ui/components/GameDropdown.tsx`

Props include: `value`, `options`, `onChange`, `placeholder`, plus search/filter/layout controls such as
`searchable`, `filterable`, `menuWidth`, `size`, `renderValue`, `renderOption`, and `renderDetail`.

- Portal-rendered dropdown popup with viewport clamping; avoids clipping in narrow panels and scroll containers
- Shares popup depth behavior with tooltips via `TooltipDepthContext`
- Option model supports `description`, `meta`, `group`, `tone`, `keywords`, and badge chips for rich rows
- Search input and group-filter chips are derived from the option content instead of being reimplemented per panel
- Optional split detail pane supports high-information selectors without reverting to bespoke modal pickers
- Mouse-first interactions: open from the trigger, inspect by hover, select by click, dismiss by outside click
- Initial adopters: `StarMapPanel` route planner, `MarketPanel` trade-route creation form, `FleetPanel` navigation + wing/fitting controls, `ManufacturingPanel` T2 blueprint picker, `ReprocessingPanel` ore selector, `DevPanel` galaxy utilities

### Overview Progression Shell + `<SystemUnlockCard>`

`src/ui/panels/OverviewPanel.tsx`, `src/ui/components/SystemUnlockCard.tsx`

- `OverviewPanel` now uses an explicit in-panel tab strip between `Operations` and `Guidance` so the default surface stays focused on command triage while heavier progression coaching lives one click away in the same route
- `OpeningOperationsCard` gives the first-hour loop a live checkpoint briefing: extraction status, storage / haul pressure, first-sale guidance, and the first-branch prompt are all derived from current game state instead of hard-coded tutorial copy
- `ProgressPromptStrip` adds dismissible milestone callouts for the current opening state, including first-haul-in-progress, first-haul-complete, first-sale-ready, and first-branch prompts. These are UI-state persisted so players can clear guidance that is already understood without mutating game state.
- The same prompt strip now advertises milestone recruitment contracts when the game auto-posts targeted specialists, routing the player directly to the Fleet operations recruitment office.
- The same Overview surface now lists the nearest early system unlocks (Manufacturing, Market, Reprocessing, Exploration) with chain-aware ETAs that include missing prerequisite skills rather than only the final skill's direct training time
- `AdvisoryLanesCard` ranks the best near-term specialization directions for the current save instead of treating all five paths as equally urgent. This is intentionally advisory only: it recommends a best-fit lane and one strong alternative without hard-locking the player into a branch.
- `ProgressionShellCard` surfaces current opportunities plus explicit specialist and hybrid system chains so early-game players can see multiple valid next moves
- `ProgressPathGrid` renders five parallel tracks — Mining, Industry, Trade, Combat, Exploration — each with current status, next unlock target, ETA, payoff, and synergy text
- The `Operations` subview keeps only urgent or current-state cards such as alerts, active training, resource income, fleet/manufacturing summaries, and optional collapsed activity feeds so the player is not forced to parse strategic planning content during routine play
- The `Guidance` subview groups opening checkpoints, advisory lanes, and long-form progression framing into a dedicated planning mode without adding a new top-level sidebar destination
- `<SystemUnlockCard>` provides a shared locked-system preview for early branch panels (`ManufacturingPanel`, `ReprocessingPanel`, `MarketPanel`) with requirement, ETA, payoff explanation, and a Skills-panel CTA. Its ETA helper is prerequisite-aware, so chained unlocks no longer under-report time by ignoring missing precursor skills.
- The intent is onboarding clarity without forcing a single tutorial path; focused specialisation and jack-of-all-trades play are both surfaced as legitimate strategies

### Shared Progression Advisor

`src/game/progression/specializationAdvisor.ts`

- Centralizes prerequisite-aware training ETA calculation for UI progression surfaces
- Ranks the five early specialization lanes (Mining, Industry, Trade, Combat, Exploration) from current game state
- Uses current inventory, fleet activity, unlock state, and first-sale/first-branch context to generate advisory ordering plus lane rationale
- Exists specifically to keep `OverviewPanel`, `SkillsPanel`, and locked-system previews aligned on what the game thinks the best near-term branch actually is

### Recruitment Milestone Advisor

`src/game/progression/recruitmentAdvisor.ts`

- Detects staffing-relevant progression beats by comparing the previous and next game state during the tick loop
- Current triggers: first completed sale, active storage pressure, Spaceship Command II patrol readiness, and exploration unlock
- Produces targeted recruitment directives consumed by `gameStore.tick`, which prepends milestone offers into the Fleet recruitment office without overwriting existing contracts
- Keeps staffing pivots tied to actual game progression instead of a static manual refresh button

### `<NavTag>` — Content-Aware Navigation Chip

`src/ui/components/NavTag.tsx`

Props: `entityType: EntityType`, `entityId: string`, `label: string`, `tooltip?: ReactNode`

- On click: calls `useUiStore.getState().navigate(PANEL_FOR_TYPE[entityType], { entityType, entityId })`, which now records the previous panel plus its view snapshot in UI history before switching panels
- Routing table: `fleet/pilot/ship → 'fleet'`, `skill → 'skills'`, `resource → 'mining'`, `system/anomaly → 'system'`
- If `tooltip` provided, wraps in `<GameTooltip content={tooltip}>` — enabling NavTags inside tooltips that have their own tooltip (n-level nesting)
- Color by entity type: fleet=cyan, pilot/ship=violet, skill/resource=amber, system=`#ffe47a`, anomaly=rose
- Styled with `.entity-tag` CSS base class + per-type color overrides

### UI History + Breadcrumbs

`src/stores/uiStore.ts`, `src/ui/layouts/GameLayout.tsx`

- The UI layer now keeps a bounded back stack of navigation entries rather than only the current panel ID
- Each history entry stores panel ID, focus target, and a snapshot of the panel's current UI state (tab, selection, expanded row, viewed system, and similar high-value context)
- `GameLayout` renders a compact breadcrumb row plus a Back button immediately under the data bar
- Breadcrumb restoration is context-aware: returning to Skills, Fleet, Market, System, Manufacturing, or Star Map restores the tab/selection state that was active when the user left that page
- This history is intentionally UI-only and session-scoped; it does not write into save data or alter simulation state

### Focus Handling in Panels

When `focusTarget` is set after navigation, the target panel should:
1. Read `useUiStore(s => s.focusTarget)` on mount + on change
2. Find the matching entity card, expand it if collapsed
3. Scroll it into view (`scrollIntoView({ behavior: 'smooth' })`)
4. Apply `.focus-pulse` class for ~3s (CSS keyframe: 3-cycle cyan glow then fade)
5. Call `useUiStore.getState().clearFocus()` after consuming

## CSS Utilities Added

`src/index.css`

| Class | Effect |
|---|---|
| `.glow-cyan` | `box-shadow: 0 0 10px rgba(34,211,238,0.18), 0 0 20px rgba(34,211,238,0.08)` |
| `.glow-amber` | Same pattern, amber RGB |
| `.glow-violet` | Same pattern, violet RGB |
| `.glow-emerald` | Same pattern, emerald RGB |
| `.glow-rose` | Same pattern, rose RGB |
| `.entity-tag` | Base chip style: `rounded-sm px-1.5 py-0.5 text-[9px] font-mono uppercase tracking-wide border cursor-pointer transition-colors` |
| `.focus-pulse` | Keyframe: 3-cycle cyan glow pulse fading to 0 over ~3s |

## Dependencies

- All 9 panels: import `NavTag`, use `useUiStore`
- `StatTooltip`: thin wrapper over `GameTooltip` — external API unchanged
- `GameDropdown`: shared rich selector for content-heavy picking flows
- `ResourceBar`: private `Tooltip`/`HoverCard` replaced by `GameTooltip` + `TT.*`; the top bar now behaves as a slim single-row live data bar with summary chips for credits, mining, fleets, training, manufacturing, reprocessing, corp status, and grouped inventory instead of a tier-sorted raw resource tape
- `DevPanel`: `devTimeScale` field from `useUiStore`; game loop multiplies `delta` in DEV guard

## Files

- `src/stores/uiStore.ts` — store
- `src/ui/components/SystemUnlockCard.tsx` — shared early-system unlock preview card + skill ETA helper
- `src/ui/components/GameTooltip.tsx` — shell + TT.* primitives
- `src/ui/components/GameDropdown.tsx` — shell for searchable/filterable dropdowns
- `src/ui/components/NavTag.tsx` — entity navigation chip
- `src/ui/components/StatTooltip.tsx` — refactored to use GameTooltip
- `src/index.css` — glow utilities + entity-tag + focus-pulse + dropdown popup styles

---

# System 14 — Fleet Commander Skills

## Role

Any pilot in a player fleet can be designated **Fleet Commander**. Commanders train a separate skill queue called *command skills* whose trained levels apply fleet-wide bonuses passively during the game tick. Command skills are additive with corp skills and pilot skills.

## Data Model

```ts
interface CommanderSkillQueueEntry {
  skillId: string;
  targetLevel: 1 | 2 | 3 | 4 | 5;
}

interface CommanderSkillState {
  levels: Record<string, number>;     // commandSkillId → trained level 0–5
  queue: CommanderSkillQueueEntry[];  // manually ordered training queue
  activeSkillId: string | null;
  activeProgress: number;             // seconds elapsed on current level
}

// On PlayerFleet:
commanderId: string | null;   // pilotId of designated commander

// On PilotInstance:
commandSkills: CommanderSkillState;
```

## Command Skill Definitions

File: `src/game/systems/fleet/commander.config.ts`

| Skill ID | Effect per level |
|---|---|
| `mining-command` | +4% fleet mining yield per level (max +20%) |
| `combat-command` | +5% fleet DPS and +3% fleet tank per level |
| `logistics-command` | +8% fleet cargo capacity, −5% haul trip duration, and +2% warp speed per level |
| `industrial-command` | +6% on-site refining yield per level |
| `recon-command` | +10% scan strength and −8% anomaly signature radius per level |

Training times: **7200 / 14400 / 28800 / 57600 / 172800 seconds** (2h / 4h / 8h / 16h / 48h per level).

Active fleets (moving, in combat, or hauling cargo) train at **1.5× speed**.

## State Transitions (Tick)

`tickCommanderSkillTraining(pilot, fleet, deltaSeconds)`:
1. If `activeSkillId` is null, pop next entry from queue and set it.
2. Compute `effectiveDelta = delta × (fleetIsActive ? 1.5 : 1)`.
3. Add `effectiveDelta` to `activeProgress`. If `activeProgress ≥ totalTime`: advance level, clear active, repeat for remainder (offline multi-level catch-up).
4. Returns `{ newCommandSkills, advanced }`.

## Mining Bonus Wiring

Inside `fleet.tick.ts`, `commanderFleetMap: Map<pilotId, PlayerFleet>` is built once per tick from all `fleet.commanderId` values. For each fleet's ore production loop:

```ts
const commanderPilot = commanderFleetMap.get(pilot.id) ? pilot : null;
const commanderMult = 1 + getCommanderMiningBonus(commanderPilot);
oreYield *= commanderMult;
```

## UI

Fleet Commander section appears above Doctrine in each fleet card:

- **No commander assigned**: empty state + "Designate…" dropdown listing fleet pilots.
- **Commander assigned**: pilot name chip + dismiss button (×).
- **Active training bar**: skill name, target level (Roman numeral), ETA countdown, progress bar (amber).
- **Queue**: one row per entry — skill name, target level, ETA, × remove.
- **Add-skill buttons**: one per skill × level not yet queued; disabled if skill already in queue.
- **Bonus chips**: amber chips for each non-zero bonus — e.g. `Mining Yield +8%`.

## Store Actions

| Action | Signature | Notes |
|---|---|---|
| `designateFleetCommander` | `(fleetId, pilotId \| null) => boolean` | Validates pilot is in fleet |
| `queueCommanderSkill` | `(pilotId, skillId, targetLevel) => boolean` | Prevents duplicates; auto-starts if idle |
| `removeCommanderSkillFromQueue` | `(pilotId, index) => void` | Filters by index |

## Files

| File | Change |
|---|---|
| `src/types/game.types.ts` | `CommanderSkillQueueEntry`, `CommanderSkillState`; `commandSkills` on `PilotInstance`; `commanderId` on `PlayerFleet` |
| `src/game/systems/fleet/commander.config.ts` | *(new)* `COMMANDER_SKILL_DEFINITIONS`, `COMMANDER_SKILL_LEVEL_SECONDS`, `COMMANDER_BONUS_LABELS` |
| `src/game/systems/fleet/commander.logic.ts` | *(new)* bonus getters + `tickCommanderSkillTraining` |
| `src/game/systems/fleet/fleet.tick.ts` | Commander training tick, `commanderFleetMap`, mining yield multiplier |
| `src/stores/initialState.ts` | Default `commandSkills` on pilot-0, `commanderId: null` on fleet-starter |
| `src/stores/gameStore.ts` | 3 new actions + static import |
| `src/ui/panels/FleetPanel.tsx` | Fleet Commander section with queue, training bar, bonus chips |
| `src/game/persistence/saveLoad.ts` | Migrate old saves: patch missing `commandSkills` / `commanderId` |

---

# System 15 — Fleet Wings

## Role

Fleet Wings subdivide a player fleet into role-based ship groups so that hauling can detach from the mining line instead of forcing the entire fleet to travel. The shipped implementation covers hauling-wing automation, escort pairing, wing commanders, and operational gating for unwinged ships.

## Data Model

```ts
type WingType = 'mining' | 'hauling' | 'combat' | 'recon' | 'industrial';

interface FleetWing {
  id: string;
  name: string;
  type: WingType;
  shipIds: string[];
  commanderId: string | null;
  escortWingId: string | null;
  isDispatched: boolean;
  haulingOriginSystemId: string | null;
  lastEscortCombatAt: number;
}

// On PlayerFleet:
wings: FleetWing[];
```

Each ship can belong to at most one wing. Ships not assigned to any wing remain available in the fleet card's Unassigned row, but they are inactive for wing-driven systems until assigned.

Hauling wings additionally carry their own ore inventory:

```ts
interface FleetWing {
  // ...
  cargoHold: Record<string, number>;
}
```

## Automation Model

File: `src/game/systems/fleet/wings.logic.ts`

- `getWingCargoCapacity(wing, ships)` computes wing-local cargo capacity from the assigned hulls.
- `getWingCargoUsed(wing)` computes current wing-held ore.
- `dispatchHaulerWing(state, fleetId, wingId, homeSystemId)` issues per-ship fleet orders for a specific hauling wing and its optional combat escort wing, selecting the best available route from an escort-aware security preference stack.
- `processWingArrivalAtHQ(state, fleetId, wingId, homeSystemId)` deposits the specified hauling wing cargo hold once its dispatched ships reach HQ, then issues return orders.
- `processWingReturn(state, fleetId, wingId)` clears dispatch state and restores the specified wing's ships to mining or idle once they return to origin.
- `tickEscortedHaulingWingCombat(state)` resolves detached convoy skirmishes for escorted hauling wings when they traverse hostile systems, throttled by `lastEscortCombatAt`.

## Tick Integration

Inside `tickRunner.ts`:

1. If a fleet has one or more hauling wings, mining ore is distributed across non-dispatched hauling-wing cargo holds before any remainder stays in the legacy fleet cargo hold.
2. Fleet ships without a wing assignment are ignored by fleet mining, scanning, and combat resolution.
3. Auto-haul checks each hauling wing independently instead of assuming a single logistics group.
4. At `≥ 90%` full, only the selected hauling wing and its escort wing are dispatched.
5. Route selection for dispatched hauling wings is escort-aware: escorted trips prefer direct routing, while unescorted trips prefer safer routing.
6. Fleets without a hauling wing still use the original FC-1 whole-fleet auto-haul path.
7. After `advanceFleetOrders`, escorted hauling wings can auto-resolve a detached combat skirmish against local NPC threats without involving the rest of the fleet.
8. After detached escort combat and route advancement, the tick checks every dispatched hauling wing for HQ arrival and later for return completion.

## Wing Commanders

- Every wing can designate a `commanderId` that must belong to a pilot whose ship is assigned to that wing.
- Wing commanders use the same `PilotInstance.commandSkills` data as fleet commanders.
- Command bonuses are resolved by combining the fleet commander and the wing commander for the relevant ship or wing calculation.
- If the same pilot is both fleet commander and wing commander, their skill bonuses are deduplicated rather than double-stacked.
- Pilots assigned as either fleet commander or wing commander train command skills at the accelerated active-fleet rate.

## UI

Fleet Wings appears as a dedicated section in each expanded fleet card:

- Create buttons for all five wing types.
- Newly created fleets are seeded with an initial populated wing so ships are operational immediately.
- Per-wing expandable rows showing name, type badge, ship count, hauling fill state, and dispatch status.
- Hauling wing rows now surface route posture directly so players can tell whether a trip is running under escort cover or safe-route protocol.
- Fleet and Overview summaries surface live escort-response state when a detached convoy is actively skirmishing in hostile space.
- Inline wing commander selector sourced from pilots whose ships are inside that wing.
- Inline rename support inside the expanded wing row.
- The top storage module switches from fleet Cargo Hold to Hauling Hold or Hauling Network when hauling wings exist.
- Manual dispatch is available per hauling wing row; single-hauler fleets also keep the top-card shortcut.
- Escort selector populated from the fleet's combat wings.
- Ship assignment selector for every ship in the fleet.
- Unassigned ship chips at the bottom for quick visual auditing.
- Fleet-level summaries show total fleet members separately from operational wing-assigned ships so inactive members remain visible without being counted as active for mining, scanning, or combat.

## Store Actions

| Action | Signature | Notes |
|---|---|---|
| `createFleetWing` | `(fleetId, type, name) => boolean` | Creates an empty wing with persisted dispatch fields |
| `renameFleetWing` | `(fleetId, wingId, name) => boolean` | Renames a wing without changing assignments |
| `deleteFleetWing` | `(fleetId, wingId) => boolean` | Removes the wing and clears escort references to it |
| `designateWingCommander` | `(fleetId, wingId, pilotId \| null) => boolean` | Pilot must be flying a ship assigned to the wing |
| `assignShipToWing` | `(fleetId, shipId, wingId \| null) => boolean` | Ensures a ship belongs to at most one wing |
| `setWingEscort` | `(fleetId, wingId, escortWingId \| null) => boolean` | Only combat wings may be assigned as escorts |
| `dispatchHaulingWingToHQ` | `(fleetId, wingId?) => boolean` | Manual dispatch for a specific hauling wing to Corp HQ |

Mutation safety rules:

- Wings cannot be deleted, reassigned, renamed, re-commanded, or have escort mappings changed while dispatched or while the whole fleet has an active fleet-order movement.
- Whole-fleet move and cancel-order actions are blocked while any hauling wing is dispatched, preventing fleet-level travel from trampling the dispatched wing's ship-level orders.
- Reassigning a ship out of a wing automatically clears that wing commander if the commander no longer has a ship in the wing.
- A combat escort wing can only be assigned to one hauling wing at a time.
- Deleting a non-dispatched wing transfers any stored `cargoHold` contents back into the fleet legacy hold.

## Files

| File | Change |
|---|---|
| `src/types/game.types.ts` | `WingType`, `FleetWing`, `commanderId` on `FleetWing`, and `wings` on `PlayerFleet` |
| `src/stores/initialState.ts` | Starter fleet seeded with an initial populated wing |
| `src/stores/gameStore.ts` | Wing CRUD + rename + commander assignment + escort assignment + targeted hauling-wing dispatch |
| `src/game/systems/fleet/wings.logic.ts` | New wing automation helpers |
| `src/game/core/tickRunner.ts` | Multi-hauler storage distribution plus wing-aware dispatch, HQ arrival, and return processing |
| `src/game/systems/fleet/fleet.tick.ts` | Mining yield and training integration for fleet + wing commanders |
| `src/game/systems/fleet/exploration.logic.ts` | Scan strength integration for fleet + wing commanders |
| `src/ui/panels/FleetPanel.tsx` | Fleet Wings management UI with expandable rows, inline rename, commander selectors, and per-wing dispatch |
| `src/game/persistence/saveLoad.ts` | Save migration for missing `wings` arrays and wing commander defaults |

---

# Planned Future Systems

See `Idleverse_DESIGN_PLAN.md` for detailed specs on:

| System | Phase |
|---|---|
| Factions, Stations & Mission Boards | Phase 5 |
| Structures & Player Outposts | Phase 6 |
| Prestige / New Game+ | Phase 7 |
