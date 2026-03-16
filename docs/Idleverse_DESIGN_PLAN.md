# Idleverse – Feature Design Plan

## Purpose

This document is the **living design plan** for Idleverse. It captures every planned feature
in enough detail to guide implementation decisions without prescribing exact code structure.

Features are grouped into **phases** ordered by gameplay dependency and player progression
impact. Each phase is independently shippable and leaves the game in a playable, fun state.

---

## Design Pillars

| Pillar | Description |
|---|---|
| **Hybrid Idle** | Background systems (mining, manufacturing, skills) run unattended. Active systems (fleet tasking, trade, missions) reward engagement. |
| **Earned Automation** | Trade routes, patrol orders, and auto-sell are unlocked through progression, not available from day one. |
| **Interconnected Economy** | Every system feeds another. Combat loot fuels blueprints, blueprints fuel T2 ships, T2 ships earn better loot. |
| **Meaningful Choices** | Selecting faction alignment, specializing a fleet, or routing a trade lane should have lasting consequences — not just be number-maximization. |
| **Gradual Complexity** | New layers reveal themselves as the player progresses. The first hour is mine → sell. The first month adds research, combat, and exploration. |

---

## Current Implementation Status

| System | Status | Notes |
|---|---|---|
| Mining (ore belts, pools, auto-haul) | ✅ Complete | 9 belts, security-gated, pool depletion |
| Reprocessing (ore → minerals, auto-queue) | ✅ Complete | Efficiency skill-scaled |
| Manufacturing (recipe queue, 12 recipes) | ✅ Complete | Speed skill-scaled |
| Skills (34 skills, prerequisites, training queue) | ✅ Complete | Full prerequisite chains |
| Market (NPC sell, auto-sell, lifetime tracking) | ✅ Complete | Prices static — dynamic pricing in Phase 1 |
| Galaxy (400 systems, procedural, jump lanes) | ✅ Complete | BFS + Dijkstra routing |
| Fleet movement (player fleets, orders, warp) | ✅ Complete | Per-hop tick advancement |
| Fleet ship roles & doctrines | ✅ Complete | ShipRole, FleetDoctrine, FleetPanel Fleets tab, StarMapPanel Intel\|Route |
| Fleet combat | ✅ Complete | NPC groups, patrol/raid orders, hull damage, bounty/loot, combat log |
| Blueprint research & T2 manufacturing | ✅ Complete | Phase 3 shipped — research queue, BPC copies, T2 recipes |
| Exploration & anomalies | ✅ Complete | Phase 4 shipped — anomaly scanning, discovery feed, Astrometrics/Archaeology/Hacking skills |
| Factions & missions | ⬜ Phase 5 | Rep tracking exists, no consequences |
| Dynamic economy & trade routes | ✅ Complete | Phase 1 shipped — dynamic prices + trade route automation |
| Structures & player outposts | ⬜ Phase 6 | Type stub exists |
| Prestige / New Game+ | ⬜ Phase 7 | Planned |

---

---

# ✅ COMPLETED — Candidate A — Fleet Roles, Doctrines & FleetPanel Overhaul

> **Status:** ✅ Shipped.
> **Files changed:** `game.types.ts`, `fleet.config.ts`, `fleet.logic.ts`, `gameStore.ts`, `FleetPanel.tsx`, `StarMapPanel.tsx`

## What Was Built

- `ShipRole`: `tank | dps | support | scout | unassigned` per `ShipInstance`
- `FleetDoctrine`: `balanced | brawl | sniper | shield-wall | stealth-raid` per `PlayerFleet`
- `DOCTRINE_DEFINITIONS` config with DPS/tank/loot multipliers and variance adjustments
- `suggestDoctrine()`, `getDoctrineRequirementsMet()`, `computeRoleAdjustedCombatStats()` logic functions
- `setShipRole` / `setFleetDoctrine` store actions
- FleetPanel: **Fleets tab** with doctrine picker, role buttons per ship, hull damage bars in fleet view
- StarMapPanel: right panel trimmed to **Intel | Route** tabs only; fleet management lives entirely in FleetPanel

---

---

# ✅ COMPLETED — Phase 2 — Fleet Combat & NPC Encounters

> **Status:** ✅ Shipped.
> **Files changed:** `combat.logic.ts`, `combat.types.ts`, `fleet.tick.ts`, `fleet.logic.ts`, `fleet.orders.ts`, `game.types.ts`, `FleetPanel.tsx`, `StarMapPanel.tsx`, `OverviewPanel.tsx`

## What Was Built

- NPC groups spawned deterministically per system (lowsec 1–3, nullsec 2–5 groups)
- Patrol order: fleet continuously engages weakest alive NPC group (requires Spaceship Command II)
- Raid order: single engagement with specific target (requires Military Operations I)
- Combat resolution using `powerRatio × variance × doctrine/role multipliers`
- Hull damage system: `ShipInstance.hullDamage` (0–100%); ships offline above 80%
- Passive idle repair: ~1.5% hull/min while idle and not in combat fleet
- Instant repair: 1× hull-plate consumable
- Bounty + loot drops on victory; fleet damage on defeat
- Combat log: last 20 engagements in `state.combat.log`
- NPC group respawn timer: 4–12 hours after destruction
- `FleetActivity` narrowed to `idle | mining | hauling | transport` (stale values migrated on load)
- Hauling-role ships reduce haul interval passively

---

## Ship Roles

Each `ShipInstance` gains a `role: ShipRole` field.

| Role | `ShipRole` value | Combat Effect |
|---|---|---|
| **Tank** | `'tank'` | Absorbs incoming damage first, proportional to `tankRating / fleetTotal`. Damage only bleeds through to other ships after tank ships exceed 80% hull damage. |
| **DPS** | `'dps'` | +25% combat rating for this ship. |
| **Support** | `'support'` | −2% incoming fleet hull damage rate *per support ship* (repair) + +3 morale/min to all fleet pilots during combat (stacks with pilot Support specialization). |
| **Scout** | `'scout'` | Reduces combat variance from ±20% to ±10%; +15% loot quality per scout ship in the fleet. |
| **Unassigned** | `'unassigned'` | No role bonus; treated as baseline DPS in combat resolution. |

---

## Fleet Doctrines

Each `PlayerFleet` gains a `doctrine: FleetDoctrine` field.

The doctrine is **auto-suggested** from the current ship roster composition, but players can override.
Selecting an invalid doctrine (e.g., Shield Wall with no tank-role ships) shows a requirements warning.

| Doctrine | `FleetDoctrine` | DPS Mult | Tank Mult | Loot Mult | Variance | Requirement |
|---|---|---|---|---|---|---|
| Balanced | `'balanced'` | ×1.0 | ×1.0 | ×1.0 | ±20% | None |
| Brawl | `'brawl'` | ×1.25 | ×0.7 | ×1.0 | ±15% | ≥1 DPS ship |
| Sniper | `'sniper'` | ×1.15 | ×0.85 | ×1.0 | ±10% | ≥1 Scout ship |
| Shield Wall | `'shield-wall'` | ×0.85 | ×1.4 | ×0.9 | ±25% | ≥1 Tank ship |
| Stealth Raid | `'stealth-raid'` | ×0.75 | ×1.0 | ×1.5 | ±10% | ≥1 Scout ship |

### Auto-Suggest Logic

Evaluated live whenever the fleet's ship roster or assigned roles change:

```
if   scoutRatio >= 0.3                       → suggest 'stealth-raid'
elif tankRatio  >= 0.4                       → suggest 'shield-wall'
elif dpsRatio   >= 0.6                       → suggest 'brawl'
elif dpsRatio   >= 0.4 and scoutRatio >= 0.2 → suggest 'sniper'
else                                         → suggest 'balanced'
```

---

## FleetPanel Overhaul

FleetPanel becomes the **primary fleet management hub** with 4 tabs:
**Fleets** (new) · **Ships** · **Pilots** · **Operations**

### Fleets Tab Layout

```
[+ New Fleet]

┌───────────────────────────────────────────────────────────┐
│ ▶  Alpha Fleet   [BRAWL]   ⊛ Auviken   ● Idle            │
│    T:1 · D:2 · S:0 · SC:1    Auto: Brawl    [▼ Expand]   │
├───────────────────────────────────────────────────────────┤  ← expanded
│  Doctrine:  [Balanced] [Brawl ✓] [Sniper] [Shield] [Stealth] │
│             ↑ Auto-suggested: Brawl                       │
│                                                           │
│  Stalker (Destroyer)    [T] [D✓] [S] [SC] [−]            │
│  Iron Veil (Hauler)     [T✓][D]  [S] [SC] [−]            │
│  Probe I (Frigate)      [T] [D]  [S] [SC✓][−]            │
│  + Add Ship ▾                                             │
│                                         [Disband Fleet]   │
└───────────────────────────────────────────────────────────┘

— Unassigned Ships ————————————————————————————————————————
  Mining Frigate III  (Mining Frigate)  @ Auviken  [+ Add to Fleet ▾]
```

**Collapsed card** shows: fleet name, doctrine badge, role composition minibar (T·D·S·SC counts),
current system, travel/idle status.

**Expanded card** shows: 5-button doctrine row with auto-suggested highlighted; ship roster rows
with 4 role toggle icon-buttons + remove (−); Add Ship dropdown (filtered to same-system ships).

---

## StarMapPanel Simplification

Fleet tab **removed entirely** from the right panel. Right panel collapses to **2 tabs: Intel | Route**.

**Removed** from `StarMapPanelInner`:
- `FleetGroupsPanel` component and all its props
- `orderFilter` state
- `doCreateFleet`, `doDisbandFleet`, `doAddShipToFleet`, `doRemoveShipFromFleet` hooks
- "Fleet/Orders" tab from the right-panel tab row

**Kept** in `StarMapPanel`:
- Fleet position icons on the canvas (informational — show location and travel animation)
- Fleet selector in the Route tab for route planning + dispatch

---

## New Logic Functions

- `computeRoleAdjustedCombatStats(fleet, ships, pilots)` → `{ effectiveDPS, tankRating, supportRepairRate, varianceMultiplier, lootQualityMult }` — called by Phase 2 `resolveCombat()`
- `suggestDoctrine(fleet, ships)` → `FleetDoctrine`
- `getDoctrineRequirementsMet(doctrine, ships)` → `boolean` — for requirements warning badge in UI

---

## Data Changes

| File | Change |
|---|---|
| `src/types/game.types.ts` | Add `ShipRole` + `FleetDoctrine` types; add `role` to `ShipInstance`; add `doctrine` to `PlayerFleet` |
| `src/game/systems/fleet/fleet.config.ts` | Add `DOCTRINE_DEFINITIONS` config constant |
| `src/game/systems/fleet/fleet.logic.ts` | Add `computeRoleAdjustedCombatStats()`, `suggestDoctrine()`, `getDoctrineRequirementsMet()` |
| `src/stores/gameStore.ts` | Add `setShipRole`, `setFleetDoctrine` store actions |
| `src/stores/initialState.ts` | Default `role: 'unassigned'`, `doctrine: 'balanced'` |
| `src/ui/panels/FleetPanel.tsx` | Full overhaul — add Fleets tab |
| `src/ui/panels/StarMapPanel.tsx` | Remove `FleetGroupsPanel` + Fleet tab; right panel → 2 tabs |

---

---

# ✅ COMPLETED — Phase 1 — Dynamic Economy & Trade Routes

> **Status:** ✅ Shipped — July 2025
> **Files changed:** `game.types.ts`, `galaxy.types.ts`, `initialState.ts`, `market.logic.ts`, `tickRunner.ts`, `gameStore.ts`, `MarketPanel.tsx`, `StarMapPanel.tsx`

## What Was Built

**Dynamic per-system pricing** — every system has a seeded demand multiplier [0.5–2.0] giving it
permanent personality, plus a live pressure value that shifts as goods are bought and sold. Prices
are clamped to ±40% of base to prevent runaway feedback.

```
localPrice = basePrice × getDemandMultiplier(seed, systemId, resourceId) × systemPressure
```

Pressure decays back to 1.0 at 5%/hr; `systemDemandVolume = max(5, round(500_000 / basePrice))` sets market depth.

**Trade route automation** — `TradeRoute` data model added to `FleetState`. When a fleet is idle
at `fromSystemId`, it autonomously buys cargo, travels to `toSystemId`, sells, and returns.
Pressure is applied at both ends. Profit tracked per-run and lifetime.

**Unlock gating** — Trade III required; max routes = `tradeLevel − 2` (1 at III, 2 at IV, 3 at V).

**MarketPanel — Trade Routes tab** — tab bar added. Listings tab unchanged. Routes tab shows quota,
route cards with status/profit, and a create-route form (fleet, resource, from/to system, amount).

**StarMapPanel Intel panel** — "Trade Opportunity" section shows top 3 minerals with the best
buy-here/sell-there ratio for the selected destination system (only if ratio > 1.05).

## New Data

- `game.types.ts` — `TradeRoute` interface; `tradeRoutes: TradeRoute[]` in `FleetState`
- `galaxy.types.ts` — `systemPressure: Record<string, Record<string, number>>` in `GalaxyState`
- `initialState.ts` — `tradeRoutes: []`, `systemPressure: {}`

## New Logic

- `market.logic.ts` — `getDemandMultiplier`, `getDemandVolume`, `getSystemPressure`, `getLocalPrice`, `applyPricePressure` (internal), `tickPricePressure`, `tickTradeRoutes`
- `tickRunner.ts` — step 8b: `tickTradeRoutes`; step 10: `tickPricePressure`
- `gameStore.ts` — `createTradeRoute`, `deleteTradeRoute`, `toggleTradeRoute`

---

---

# ✅ COMPLETED — Phase 3 — Blueprint Research & T2 Manufacturing

> **Status:** ✅ Shipped — July 2025
> **Files changed:** `src/types/game.types.ts`, `src/game/resources/resourceRegistry.ts`, `src/game/systems/manufacturing/manufacturing.config.ts`, `src/game/systems/manufacturing/manufacturing.logic.ts`, `src/stores/initialState.ts`, `src/game/core/tickRunner.ts`, `src/stores/gameStore.ts`, `src/ui/panels/ManufacturingPanel.tsx`

## What Was Built

- `Blueprint` type: id, itemId, tier (1|2), type ('original'|'copy'), researchLevel 0–10, copiesRemaining, isLocked
- 12 T1 BPOs in initial state (one per existing recipe) at researchLevel 0
- **Research queue**: up to 3 concurrent slots (+1 at Science L3, +1 at Science L5); each level costs 1 datacore; time formula `300 × 1.5^currentLevel`; at level 5 the corresponding T2 BPO is auto-unlocked
- **Copy system**: BPC with 1–10 runs chosen at copy time; copy time `300 × 0.5 × runs`; BPC consumed one-per-job on manufacturing completion
- **3 T2 component recipes**: Advanced Hull Plate, Advanced Thruster Node, Advanced Condenser Coil (require morphite/zydrine + T1 components + T2 BPC)
- **3 T2 ship recipes**: Assault Frigate, Covert Ops, Command Destroyer (require T2 components + T2 BPC)
- **3 datacore resources**: datacore-mechanical (lowsec loot), datacore-electronic (nullsec loot), datacore-starship (faction loot)
- **2 advanced minerals**: morphite and zydrine (nullsec-only, required for T2 manufacturing)
- **ManufacturingPanel** rewritten with Jobs tab (existing queue with T2 BPC info) and Blueprints tab (library, research slots, active research/copy jobs)

## Goal

Research converts combat loot (datacores) + time + Science skills into T2 blueprints. T2 ships
and modules are 40–60% stronger per stat — creating the mid-game production loop:
fight → research → upgrade → fight harder.

## Blueprints

```
Blueprint {
  id
  itemId              // links to manufacturing recipe
  tier: 1 | 2
  type: 'original' | 'copy'
  researchLevel: 0–10  // originals only; level 5 unlocks T2 equivalent
  copiesRemaining: number | null  // null = unlimited (originals)
  isLocked: boolean   // true while being researched or copied
}
```

All players start with T1 BPOs for every current recipe at `researchLevel 0`.

## Datacores

New resources bridging combat and manufacturing:

| Datacore | Source | Used For |
|---|---|---|
| Mechanical Engineering Core | Lowsec pirate loot | Industrial ship research |
| Electronic Systems Core | Nullsec pirate loot | Electronic module research |
| Starship Engineering Core | Faction raid loot | Advanced hull research |

## Research Queue

- Default: 3 concurrent research slots; +1 at Science L3; +1 at Science L5
- Progress per tick: `baseResearchRate × (1 + scienceSkillBonus)`
- Time per level: `baseTime × 1.5^researchLevel` (each new level takes 50% longer than the previous)
- At `researchLevel 5` on a T1 BPO → corresponding T2 BPO unlocked

## Blueprint Copy System

- Copy action on a BPO produces BPCs with 1–10 run limit (chosen at copy time)
- Copy time: same formula as research but at 0.5× rate
- BPCs consumed one-per-job on manufacturing completion
- BPCs enable parallel factory runs without risking the original BPO

## T2 Manufacturing

T2 recipes require:
- T1 equivalent components (from T1 manufacturing)
- Advanced minerals: Morphite, Zydrine (nullsec belts only)
- A T2 BPC (consumed on completion)

**Unlock:** Research queue requires Science L1 (currently stub). T2 BPC usage requires
Advanced Industry L1 (new sub-skill under Industry category).

## New Data

- `manufacturing.blueprints: Blueprint[]`
- `manufacturing.researchJobs: ResearchJob[]`
- `manufacturing.copyJobs: CopyJob[]`
- New resources: Mechanical Engineering Core, Electronic Systems Core, Starship Engineering Core, Morphite, Zydrine

## UI Changes

- **ManufacturingPanel — Blueprints tab** — BPO/BPC library cards, Research button, Copy button, research/copy progress bars, T2 lock state
- **ManufacturingPanel — Jobs tab** — job cards show "using BPC: [name] (X runs left)"
- **SkillsPanel** — Science skill milestones at L3 and L5 labeled "unlocks research slot"

## Files

`manufacturing.config.ts`, `manufacturing.logic.ts`, `game.types.ts`, `tickRunner.ts`, `ManufacturingPanel.tsx`

---

---

# ✅ COMPLETED — Phase 4 — Exploration & Anomaly Scanning

> **Status:** ✅ Shipped — July 2025
> **Files changed:** `game.types.ts`, `galaxy.types.ts`, `skills.config.ts`, `fleet.config.ts`, `anomaly.gen.ts` (new), `exploration.logic.ts` (new), `tickRunner.ts`, `initialState.ts`, `gameStore.ts`, `SystemPanel.tsx`, `OverviewPanel.tsx`

## What Was Built

- **5 anomaly types:** `ore-pocket`, `data-site`, `relic-site`, `combat-site`, `wormhole`
- **Deterministic generation:** `generateAnomalies(systemId, security, daySeed, allSystemIds, nowMs)` — seeded LCG + FNV hash ensures consistent daily anomaly pools per system
- **Scan mechanics:** Per-tick progress = `fleetScanStrength / signatureRadius`; fleet revealed at 100%
- **Fleet scanning toggle:** Fleets can set `isScanning: true`; scanning tick runs in step 8c of tickRunner
- **3 new skills:** Astrometrics (scan-speed +10%/level), Archaeology (loot relic sites), Hacking (loot data sites)
- **3 T2 hulls:** `assault-frigate` (baseSensor 8), `covert-ops` (baseSensor 15), `command-destroyer` (baseSensor 7)
- **New module:** `scan-pinpointing-i` (+20% scan-strength, mid-slot)
- **Store actions:** `setFleetScanning`, `lootSite`, `activateOrePocket`
- **UI — SystemPanel Anomalies tab:** Scan progress bars, revealed anomaly cards, action buttons, fleet scanner toggle
- **UI — OverviewPanel Discoveries feed:** `DiscoveriesCard` shows last 8 finds with type icon, system name, timestamp
- **Save migration:** Old saves patched with `discoveries: []`, `anomalies: {}`, `isScanning: false` on all fleets

---

## Goal

Unexplored systems feel genuinely unknown. Exploration frigates scan down anomalies that yield
unique rewards — bonus ore pockets, data caches, derelict ships, and temporary wormhole
connections that reshape travel paths for hours.

## Anomaly Types

| Type | Description | Reward |
|---|---|---|
| `ore-pocket` | Dense hidden asteroid cluster | Bonus mining yield stream for 2–6 hours |
| `data-site` | Derelict data node | Datacores, skillbooks, schematics |
| `relic-site` | Ancient structure | Exotic minerals, salvage components |
| `combat-site` | Hidden pirate base | NPC encounter + enhanced loot table |
| `wormhole` | Unstable spatial rift | Temporary galaxy map jump edge (12–48h, mass-limited) |

## Spawning

Anomalies spawn lazily on first warp-to-system, seeded from `systemId + day`:

| Security | Count | Quality Bias |
|---|---|---|
| Highsec | 0–2 | data-site, ore-pocket |
| Lowsec | 1–3 | combat-site, relic-site |
| Nullsec | 2–4 | wormhole, combat-site, advanced loot |

Anomalies in visited systems re-roll daily while a fleet has a scan order active there.

## Scanning

Fleet order: `scan` — fleet stays in system advancing scan progress each tick:

```
progressPerTick = Σ (ship.sensorStrength × scannerModuleBonus) / anomaly.signatureRadius
```

Each anomaly has a `signatureRadius` (harder = smaller = longer to scan). At 100% → revealed.

Scan strength improved by:
- **Astrometrics** skill: +10% per level (up to +50% at L5)
- Scan Pinpointing module
- Exploration-class frigate hull (higher base `sensorStrength`)

**Unlock:** `scan` order requires Astrometrics L1 (new Science sub-skill).

## Anomaly Interactions

- `mine-anomaly(id)` — ore pocket: higher yield than standard belts for duration
- `loot-site(id)` — data/relic: fleet loots over 1–3 ticks; items added to cargo
- `engage-site(id)` — combat site: triggers combat resolution (Phase 2 mechanics)
- Wormholes become traversable jump edges on the galaxy map canvas

## Wormhole Rules

- Rendered as pulsing orange edges separate from standard jump lanes
- `maxMass` — each ship transit consumes mass; collapses when depleted or timer expires
- Mass remaining + expiry shown in system Intel panel

**Unlock:** Data/relic site interaction requires Archaeology L1 and Hacking L1 (new skills).

## New Data

- `galaxy.anomalies: Record<systemId, Anomaly[]>`
- `galaxy.wormholes: WormholeEdge[]`
- New skills: Astrometrics, Archaeology, Hacking

## UI Changes

- **StarMapPanel** — system nodes show anomaly count badge; pulsing orange wormhole edges on canvas
- **SystemPanel — Anomalies tab** — list of revealed anomalies, per-anomaly scan progress bar, action buttons
- **OverviewPanel — Discoveries feed** — recent finds with type icon, system name, reward preview

## Files

`galaxy.gen.ts`, `fleet.tick.ts`, `galaxy.types.ts`, `game.types.ts`, `StarMapPanel.tsx`, `SystemPanel.tsx`, `OverviewPanel.tsx`

---

---

# Phase 5 — Factions, Stations & Mission Boards

> **Status:** Designed, not yet implemented.
> **Depends on:** Phase 2 (combat missions track kill count from fleet combat results).

## Goal

Faction standing becomes a core progression axis with real gameplay consequences. Stations
provide active services gated by reputation. Mission boards give active narrative tasks.
Hostile factions send NPC patrols after player fleets in their territory.

## Faction Standing Consequences

All 4 factions (Concordat, Veldris, Free Covenant, Null Syndicate) already track reputation.
This phase wires rep to actual gameplay:

| Standing | Threshold | Consequence |
|---|---|---|
| Hostile | < −500 | NPC groups in faction territory aggro player fleets on sight |
| Unfriendly | < −200 | Station docking refused |
| Neutral | −200 to +200 | Standard station access and prices |
| Friendly | > +200 | 5% price discount; Tier 2 mission access |
| Trusted | > +500 | 10% discount; Tier 3 missions; recruiter unlocked |
| Allied | > +800 | 15% discount; exclusive faction BPOs; intel sharing |

**Rep events** (already defined in `faction.logic.ts` — wire these):
- Complete mission: +50 to +200 rep
- Destroy faction's NPC group: −10 rep per group
- Haul goods to faction home systems: +5 rep per completed trade run
- Destroy rival faction ships: +rep with that faction's enemy

## Station Services (Activate Existing Stubs)

Services are already generated per station — this phase makes them functional:

| Service | Mechanic |
|---|---|
| **Market** | Local dynamic prices (Phase 1). Lower transaction fee with higher rep |
| **Recruiter** | Hire pilots. Pilot quality scales with rep and faction type |
| **Factory** | Manufacturing speed bonus applied while any fleet is docked here |
| **Refit** | Fit/swap modules without returning to home system |
| **Intel** | Reveals all anomalies in adjacent systems for 24h (Friendly+ only) |
| **Blackmarket** | Nullsec only. Fence goods at 70% value; buy contraband modules |
| **Hangar** | Remote storage; items can be retrieved by any of your fleets |

## Mission System

```
Mission {
  id, factionId, stationId
  type: 'combat' | 'delivery' | 'mining'
  tier: 1 | 2 | 3
  description: string
  objective: MissionObjective
  reward: { isk, rep, items? }
  expiresAt: timestamp
  acceptedAt: timestamp | null
  assignedFleetId: string | null
}

MissionObjective =
  | { type: 'kill',    targetGroupId, count, current }
  | { type: 'deliver', resourceId, amount, toSystemId }
  | { type: 'mine',    resourceId, amount }
```

Mission boards: 3–5 missions per station, refreshed every 4 hours.
Tier access gated by standing (T1 = Neutral+, T2 = Friendly+, T3 = Trusted+).

**Max active missions:** 3 default; +1 at Trade L3; +1 at Trade L5.

**Progress tracking** — each tick checks active missions automatically:
- Kill missions: fleet combat resolution increments kill count
- Delivery missions: fleet arrival at target system with required cargo
- Mining missions: cumulative ore mined since accept date

## New Data

- `game.activeMissions: Mission[]`
- `game.completedMissions: number`
- `game.factionMissionBoards: Record<stationId, Mission[]>`
- `fleet.dockedAtStationId: string | null` per fleet

## UI Changes

- **SystemPanel** — redesigned as Station Hub with tabs: Overview / Market / Missions / Services
- **FleetPanel — Fleets tab** — dock/undock button when fleet is at a station system; docked fleet shows "Refit" option
- **OverviewPanel** — Active Missions tracker with progress bars and "Assign Fleet" dropdown per mission

## Files

`faction.logic.ts`, `game.types.ts`, `fleet.tick.ts`, `gameStore.ts`, `SystemPanel.tsx`, `OverviewPanel.tsx`

---

---

# Phase 6 — Player Structures & Outposts

> **Status:** High-level design only, details TBD.

## Goal

Players construct and upgrade permanent outposts in systems they control. Structures
specialize systems for production, combat, or trade — and must be actively defended.

## Structure Types

| Structure | Key Benefit | Specialization |
|---|---|---|
| Refinery Outpost | +20% ore yield in system, ore compression | Mining base |
| Factory Outpost | +30% manufacturing speed; T2 jobs available locally | Production hub |
| Trade Hub | +NPC trader traffic → larger demand volume + higher prices | Commerce center |
| Defense Platform | +50% fleet combat rating in system; auto-engages hostile NPCs | Security |
| Deep Space Relay | +10 LY jump range for all fleets in system | Logistics |
| Research Station | +20% research speed; +1 research slot | Science hub |

One structure type per system (specialization choice). Upgradeable Level 1–5.

**Unlock:** Engineering L3 (new skill). Level 3+ requires Advanced Engineering L1.

## New Data

- `galaxy.playerStructures: Record<systemId, PlayerStructure>`
- `PlayerStructure { systemId, type, level, health, constructionProgress }`

## UI Changes

- **SystemPanel — Structure tab** — current structure card with level, health bar, upgrade button
- **StarMapPanel** — structure icon overlay on owned systems; damaged structures in amber/red

---

---

# Phase 7 — Prestige & Meta-Progression

> **Status:** High-level design only, details TBD.

## Goal

After the endgame (T2 fleet, nullsec operation, maxed skills), players enter a meaningful reset
loop. Prestige feels like completing a chapter — preserving identity while opening new depth.

## Prestige Requirements

- 3+ fully upgraded Level 5 outposts
- 20+ completed Tier 3 missions
- 8+ T2 blueprints researched

## What Resets

All resources, ships, manufacturing/research/skill queues, active missions, and trade routes.

## What Persists

- **Capsuleer Legacy Points (CLP)** — earned per prestige run, depth-scaled
- Skills above L3 bank a permanent +1% bonus per level in that category

## Ascension Store (CLP Spending)

- Permanent % production bonuses (stack across runs)
- Additional starting ship
- Faster early-game skill training multiplier
- New faction alignment starting options
- "Galaxy Memory" — visited system data persists across reset

## Ascension Tiers

Each prestige increments Ascension Tier (max 10). Higher tiers generate more CLP per run,
unlock cosmetic galaxy map overlays, and at Tier 3+ allow running 2 galaxy seeds simultaneously.

## New Data

- `meta.ascensionTier: number`
- `meta.capsuleerLegacyPoints: number`
- `meta.legacyBonuses: LegacyBonus[]`
- `meta.prestigeCount: number`

---

---

# Future Feature Candidates

## Candidate B — Pilot Officer System

Named elite pilots with unique trait modifiers (e.g., "Cold Precision" → +15% damage, −10% tank).
Earned via Tier 3 mission rewards or rare recruiter pulls. Officers can be killed in high-damage
combat; succession system for officer slots.

## Candidate C — Dynamic Galaxy Events

Scheduled world events visible on the galaxy map with countdown timers:
- **Faction Wars** — two factions contest a system; player can ally and earn high rep
- **Resource Boom** — system briefly offers 2× demand multiplier
- **Pirate Invasion** — nullsec group raids lowsec systems; player can intercept for bonus bounty

## Candidate D — Salvage & Reverse Engineering

Wrecked NPC ships leave debris collectible by salvage fleets:
- Salvage modules collect components from wrecks
- Wrecks can be reverse-engineered into BPC Fragments
- Combining 3 matching fragments produces a usable BPC
- Alternative path to T2 items that bypasses research but requires more combat time

## Candidate E — Colonization & Population

- Habitable planets colonized at Engineering L5
- Colonies grow population over time; population multiplies colony output
- Colony buildings (farms, factories, labs) constructed like outposts
- Max colonies gated behind a Colonization skill tier
- Colonized systems generate passive income scaling into the late game

## Candidate F — Corporations (Multiplayer Layer)

Requires backend infrastructure — out of scope for current local-first architecture.
Shared wallet, factory, fleet coordination, corporation wars, territory consequences.

---

*Version 1.0 — March 2026*
*Next update: after Candidate A (Fleet Roles) implementation complete*
