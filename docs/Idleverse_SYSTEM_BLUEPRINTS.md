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

### `<NavTag>` — Content-Aware Navigation Chip

`src/ui/components/NavTag.tsx`

Props: `entityType: EntityType`, `entityId: string`, `label: string`, `tooltip?: ReactNode`

- On click: calls `useUiStore.getState().navigate(PANEL_FOR_TYPE[entityType], { entityType, entityId })`
- Routing table: `fleet/pilot/ship → 'fleet'`, `skill → 'skills'`, `resource → 'mining'`, `system/anomaly → 'system'`
- If `tooltip` provided, wraps in `<GameTooltip content={tooltip}>` — enabling NavTags inside tooltips that have their own tooltip (n-level nesting)
- Color by entity type: fleet=cyan, pilot/ship=violet, skill/resource=amber, system=`#ffe47a`, anomaly=rose
- Styled with `.entity-tag` CSS base class + per-type color overrides

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
- `ResourceBar`: private `Tooltip`/`HoverCard` replaced by `GameTooltip` + `TT.*`
- `DevPanel`: `devTimeScale` field from `useUiStore`; game loop multiplies `delta` in DEV guard

## Files

- `src/stores/uiStore.ts` — store
- `src/ui/components/GameTooltip.tsx` — shell + TT.* primitives
- `src/ui/components/NavTag.tsx` — entity navigation chip
- `src/ui/components/StatTooltip.tsx` — refactored to use GameTooltip
- `src/index.css` — glow utilities + entity-tag + focus-pulse

---

# Planned Future Systems

See `Idleverse_DESIGN_PLAN.md` for detailed specs on:

| System | Phase |
|---|---|
| Factions, Stations & Mission Boards | Phase 5 |
| Structures & Player Outposts | Phase 6 |
| Prestige / New Game+ | Phase 7 |
