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

## Planning Log Usage

This file is also the canonical home for long-lived plans created during discussion.

Use these rules whenever a new plan is discussed:

1. Add the plan here in the same session it is created.
2. Update the existing section when the plan evolves; do not leave conflicting versions in chat or append stale duplicates.
3. Keep the section implementation-facing: scope, dependencies, milestones, risks, and follow-up slices.
4. If the plan changes architecture, formulas, or resources, update the matching docs alongside this file.

### Planning Section Template

```markdown
# Phase / Feature / Initiative — Name
> **Status:** Proposed | Active | Blocked | Deferred
> **Last updated:** March 2026
> **Depends on:** list prerequisites or `None`

## Goal

One paragraph describing what this plan is trying to achieve and why it matters.

## Scope

- In scope item
- In scope item
- Explicitly out of scope item

## Implementation Outline

1. First concrete slice.
2. Second concrete slice.
3. Validation and follow-up slice.

## Risks / Open Questions

- Risk or unresolved design question.
- Balance or UX question to revisit.

## Files Likely Affected

- `src/...`
- `docs/...`
```

### Recommended Status Meanings

- `Proposed` — discussed and documented, but not being implemented yet.
- `Active` — current working plan and expected implementation track.
- `Blocked` — valid plan, but waiting on another dependency or decision.
- `Deferred` — intentionally paused; kept for future reference.

---

# Initiative — Layered Content Expansion
> **Status:** Active
> **Last updated:** March 2026
> **Depends on:** Manufacturing queue, fleet fitting, timed fleet travel, current T1/T2 ship pipeline

## Goal

Broaden the midgame industrial ladder so progression does not stall at destroyer-era hulls and a thin fitting catalog. The approved direction is foundation-first: make modules real manufactured inventory, add one new ore-to-mineral branch, add shared cruiser-support components, and use that base to unlock the first cruiser-class hull and its supporting module family.

## Scope

- Convert all current T1 modules into manufactured inventory items with starter blueprints, market pricing, and save-safe migration support.
- Add the Ionite → Fluxite lowsec resource branch to widen midgame mineral sourcing.
- Add shared Tier 3 industrial parts: Armor Honeycomb, Reactor Lattice, and Targeting Bus.
- Add the first cruiser-support module family via Tracking Computer I/II.
- Add the first cruiser-class hull and its manufacturing recipe.
- Explicitly out of scope: T2 cruisers, faction cruiser variants, exploration-loot content chains, and a full second module balance pass.

## Implementation Outline

1. Ship the fitting foundation: module resources, module recipes, starter BPOs, and module consumption/return rules for fitting, removal, recall, and save migration.
2. Ship the new industrial branch: Ionite belt, Fluxite mineral, and the shared cruiser-support components that feed modules and hulls.
3. Ship the first visible payoff: Tracking Computers, Cruiser hull manufacturing, market visibility, and doc/balance sync.

## Risks / Open Questions

- Market, dev, and utility surfaces must read canonical registry exports rather than stale hardcoded item lists or future content waves will drift again.
- Module recipes are now broad, but a later pass should decide which modules deserve skill gating or T2 upgrade paths.
- Cruiser content currently lands as a single broad combat hull; specialized cruiser branches remain a follow-up wave.

## Files Likely Affected

- `src/game/resources/resourceRegistry.ts`
- `src/game/systems/manufacturing/manufacturing.config.ts`
- `src/game/systems/fleet/fleet.config.ts`
- `src/game/systems/fleet/fleet.logic.ts`
- `src/game/systems/mining/mining.config.ts`
- `src/game/systems/reprocessing/reprocessing.config.ts`
- `src/stores/initialState.ts`
- `src/stores/gameStore.ts`
- `docs/Idleverse_RESOURCE_REGISTRY.md`
- `docs/Idleverse_SYSTEM_BLUEPRINTS.md`
- `docs/Idleverse_BALANCE_FORMULAS.md`

---

# Initiative — Manufacturing Panel Overhaul
> **Status:** Active
> **Last updated:** March 2026
> **Depends on:** Existing manufacturing queue, blueprint research/copy systems, current UI primitives

## Goal

Refresh the manufacturing panel with the same higher-effort treatment as the reprocessing tab, but tuned for Idleverse's preferred UI flavor: dense, compact, data-forward, and only subtly animated. The panel should reduce jobs-versus-blueprints fragmentation without changing the underlying manufacturing, research, or copy mechanics.

## Scope

- Keep the existing `jobs` and `blueprints` tabs for now.
- Make the `jobs` view operationally complete by surfacing production queue state, research/copy activity, and T2 BPC readiness in one place.
- Tighten queued-job presentation into expandable compact rows with stronger hierarchy and better ETA surfacing.
- Make T2 recipe blockers visible before queue attempts.
- Explicitly out of scope: manufacturing logic changes, blueprint system redesign, or fully merging both tabs into one monolithic panel.

## Implementation Outline

1. Add a compact manufacturing command header with queue load, lab load, speed grade, and a subtle activity indicator.
2. Integrate research/copy telemetry and T2 readiness into the jobs view so common production work no longer requires constant tab switching.
3. Replace flat queued-job rows with expandable dense operational rows and tighten recipe cards for faster scanning.

## Risks / Open Questions

- The jobs view can become noisy if research/copy telemetry is surfaced too aggressively; density has to stay scan-friendly.
- Keeping tabs while reducing fragmentation is lower risk, but a future pass may still want a single-scroll manufacturing surface.
- The current panel already has strong T2 mechanics; the main risk is UX regression from over-condensing controls.
- The new themed icon pass should replace player-facing emoji consistently across nav, headers, alerts, and status chips so the UI does not end up with two conflicting visual languages.

## Files Likely Affected

- `src/ui/panels/ManufacturingPanel.tsx`
- `src/ui/components/PanelInfoSection.tsx`
- `src/ui/effects/ActivityBar.tsx`
- `src/ui/components/FlairProgressBar.tsx`

---

# Initiative — Reprocessing Panel Overhaul
> **Status:** Active
> **Last updated:** March 2026
> **Depends on:** Existing reprocessing queue, auto-reprocessing thresholds, current UI primitives

## Goal

Refresh the reprocessing panel with the same higher-effort treatment as manufacturing: dense, operational, subtly animated, and easier to scan as a live refinery console rather than a flat form plus queue. The underlying reprocessing mechanics remain unchanged.

## Scope

- Add a compact command deck with queue load, efficiency, auto-line status, and live refinery activity.
- Tighten auto-refinery cards so they expose surplus, ready batches, queued batches, and line state at a glance.
- Replace flat queued-job rows with expandable compact refinery rows.
- Keep the current mechanics and controls, but make the panel feel more alive and more operationally legible.
- Explicitly out of scope: reprocessing logic changes or any new industrial mechanics.

## Implementation Outline

1. Add the command deck and refinery activity strip at the top of the panel.
2. Enrich auto-refinery cards with denser telemetry and semantic status treatment.
3. Upgrade the manual queue section with stronger active-job presentation and expandable queued-batch rows.

## Risks / Open Questions

- Reprocessing is simpler than manufacturing, so added telemetry has to stay compact enough to avoid feeling ornamental.
- Auto-refinery lines need to feel alive without obscuring the manual queue flow.
- If the panel becomes too tall, a later pass may need more aggressive progressive-disclosure defaults.

## Files Likely Affected

- `src/ui/panels/ReprocessingPanel.tsx`
- `src/ui/components/PanelInfoSection.tsx`
- `src/ui/effects/ActivityBar.tsx`
- `src/ui/components/FlairProgressBar.tsx`

---

# Initiative — Overview Operations Deck Refresh
> **Status:** Active
> **Last updated:** March 2026
> **Depends on:** Existing Overview operations mode, UI navigation store, current industrial panel language

## Goal

Tighten the Overview operations mode so it behaves like a real command deck: dense, read-only, and better aligned with the newer manufacturing and reprocessing panel treatment. The overview should stay a summary surface, but it should expose live tempo and industrial posture faster.

## Scope

- Add a compact operations command deck that summarizes corp training, industry, refinery load, and fleet tempo.
- Upgrade the overview manufacturing card so it carries the denser industrial language used in the full manufacturing panel.
- Keep the overview read-only and drill-down oriented; no queue-management controls are added here.
- Explicitly out of scope: rewriting the full overview layout or moving system-panel controls into the dashboard.

## Implementation Outline

1. Add a top-level command deck with normalized activity feedback and drill-down navigation.
2. Refresh the manufacturing summary card with richer queue, lab, and blueprint telemetry.
3. Validate that operations mode still reads as a summary surface rather than a second full system panel.

## Risks / Open Questions

- The overview already has many cards, so added density must improve scan speed rather than just add noise.
- Click targets need to stay clearly navigational and not imply direct system control from the dashboard.
- If future system cards adopt the same density, the overview may need stronger grouping or collapsible sections.

## Files Likely Affected

- `src/ui/panels/OverviewPanel.tsx`
- `src/ui/effects/ActivityBar.tsx`
- `docs/Idleverse_DESIGN_PLAN.md`

---

# Initiative — Market Panel Overhaul
> **Status:** Active
> **Last updated:** March 2026
> **Depends on:** Existing market listings, auto-sell settings, trade route automation, current UI primitives

## Goal

Refresh the market panel so it reads like an economic operations surface instead of a flat listings table plus route form. The focus is denser telemetry, clearer route posture, and better scan speed while keeping the existing market and trade-route mechanics intact.

## Scope

- Add a compact command deck with price bonus, lifetime sales, auto-sell posture, and route activity.
- Tighten listings rows so auto-sell surplus, keep thresholds, and stock state are easier to scan.
- Replace flat trade-route cards with expandable compact operational rows.
- Keep the market panel interactive, but do not change pricing or route automation logic.
- Explicitly out of scope: economy rebalance, trade-route simulation changes, or new market mechanics.

## Implementation Outline

1. Add a top-level market command deck and per-tab activity summaries.
2. Enrich listings rows with stronger stock, surplus, and auto-sell state treatment.
3. Convert trade routes into denser expandable rows with clearer live status and profit telemetry.

## Risks / Open Questions

- Listings density can become noisy because the market spans many resources; telemetry has to stay compact.
- Trade routes need stronger operational context without turning the market panel into a second fleet panel.
- If route count grows substantially later, the tab may need stronger filtering or grouping.

## Files Likely Affected

- `src/ui/panels/MarketPanel.tsx`
- `src/ui/effects/ActivityBar.tsx`
- `docs/Idleverse_DESIGN_PLAN.md`

---

# Initiative — Mining Panel Overhaul
> **Status:** Active
> **Last updated:** March 2026
> **Depends on:** Existing fleet mining view, hauling wing storage model, current UI primitives

## Goal

Refresh the mining panel so it reads as a live extraction console rather than a stack of static fleet cards. The target is denser telemetry around ore flow, storage pressure, and hauling posture while keeping the underlying mining and hauling loop unchanged.

## Scope

- Add a compact mining command deck with fleet count, ore flow, cargo pressure, and hauling status.
- Tighten mining fleet cards so ore throughput, storage state, hauling posture, and belt security are easier to scan.
- Preserve the current drill-down shape and haul dispatch control.
- Explicitly out of scope: mining balance changes, hauling logic changes, or wing-behaviour redesign.

## Implementation Outline

1. Add a panel-level command deck with normalized activity feedback.
2. Enrich fleet cards with denser metrics and stronger operational status treatment.
3. Validate that the panel remains readable with multiple fleets active at once.

## Risks / Open Questions

- Mining surfaces can get repetitive when several fleets mirror the same structure, so the denser cards still need strong scan hierarchy.
- Cargo and hauling telemetry should clarify pressure without overshadowing the ore-output view.
- Mining-panel haul controls must call haul-aware fleet actions rather than generic move orders, otherwise HQ unload-and-return state is skipped for whole-fleet haul trips.
- Fleet and mining surfaces should describe concrete activity states like heading to a named system, returning to HQ, or mining on a named belt instead of generic labels like transit or active, and fleet-level summaries must aggregate wing state rather than assuming one fleet-wide mining posture. Wing rows should surface their own activity detail directly in the wing section, including fleet-level movement or combat posture when that wing is participating.
- A later pass may still want progressive disclosure if mining fleet counts grow significantly.

## Files Likely Affected

- `src/ui/panels/MiningPanel.tsx`
- `src/ui/effects/ActivityBar.tsx`
- `docs/Idleverse_DESIGN_PLAN.md`

---

# Initiative — Fleet Operations Tab Refresh
> **Status:** Active
> **Last updated:** March 2026
> **Depends on:** Existing FleetPanel operations tab, recruitment offers, hangar deployment, current UI primitives

## Goal

Refresh the Fleet operations tab so it reads like a compact staffing and deployment console rather than a flat list of deploy buttons plus candidate cards. The mechanics stay the same; the change is density, hierarchy, and operational scan speed.

## Scope

- Add a fleet-operations command deck covering hangar readiness, recruitment pressure, affordable hires, and payroll runway.
- Tighten deployable-hull rows so hangar actions read like operational launch lines.
- Enrich recruitment cards with stronger status treatment and clearer payroll impact.
- Explicitly out of scope: fleet-combat logic, fleet-tab redesign, or pilot/ship data model changes.

## Implementation Outline

1. Add a top command deck with normalized activity feedback.
2. Tighten hangar deployment rows around availability and deploy posture.
3. Improve recruitment card hierarchy with clearer milestone and affordability state.

## Risks / Open Questions

- The fleet panel is already large, so operations-only changes need to avoid leaking a new style mismatch into the other tabs.
- Recruitment cards can become noisy if recommendation text and preview skills dominate the compact layout.
- A later pass may still want a broader fleet-panel consistency sweep after the operations tab lands.

## Files Likely Affected

- `src/ui/panels/FleetPanel.tsx`
- `src/ui/effects/ActivityBar.tsx`
- `docs/Idleverse_DESIGN_PLAN.md`

---

# Initiative — System Panel Refresh
> **Status:** Active
> **Last updated:** March 2026
> **Depends on:** Existing SystemPanel orrery, anomaly tab, station/outpost controls, current UI primitives

## Goal

Refresh the SystemPanel so the command layer around the orrery feels as deliberate as the newer operations surfaces. The orrery and system logic stay intact; the focus is clearer system-level telemetry, better control hierarchy, and a stronger sidebar intel frame.

## Scope

- Add a compact system command deck covering fleets, mining-belt activity, anomaly presence, and corp foothold in the current system.
- Tighten the sidebar with a clearer selected-body or system-intel summary.
- Preserve the current orrery, body selection, station controls, and anomaly interactions.
- Explicitly out of scope: orrery rendering changes, mining logic changes, or anomaly-system redesign.

## Implementation Outline

1. Add a top system command deck with normalized activity feedback.
2. Add a compact sidebar intel summary to improve orientation when switching between bodies and tabs.
3. Validate that the panel remains readable while keeping the existing inline-style structure stable.

## Risks / Open Questions

- The SystemPanel is still largely inline-styled, so targeted improvements need to avoid turning the file into a half-migrated styling mix.
- The command deck must not crowd the header and warp banners when several system-state banners are visible at once.
- A later pass may still want a deeper cleanup of the body-detail section for consistency with newer panel patterns.

## Files Likely Affected

- `src/ui/panels/SystemPanel.tsx`
- `src/ui/effects/ActivityBar.tsx`
- `docs/Idleverse_DESIGN_PLAN.md`

---

# Initiative — Fleet Panel Consistency Sweep
> **Status:** Active
> **Last updated:** March 2026
> **Depends on:** Existing FleetPanel fleet/pilot/ship tabs, prior Fleet Operations tab refresh, current UI primitives

## Goal

Bring the remaining FleetPanel tabs into the same compact operational-console language now used by the operations tab. The underlying fleet, pilot, and ship mechanics stay unchanged; the work is about scan speed, denser telemetry, and clearer command posture.

## Scope

- Add compact command decks for the fleets, pilots, and ships tabs.
- Tighten fleet, pilot, and ship cards so readiness, staffing, fitting, morale, and posture are easier to scan before expanding.
- Preserve the existing interaction model, command actions, and detailed drill-down controls.
- Explicitly out of scope: fleet balance changes, new fleet mechanics, or ship/pilot progression redesign.

## Implementation Outline

1. Reuse the fleet-operations command-deck language in the other FleetPanel tabs.
2. Enrich fleet cards with readiness, commander, wing, and cargo telemetry.
3. Enrich pilot and ship cards with compact assignment, training, integrity, and fitting posture summaries.

## Risks / Open Questions

- Fleet cards already carry a large amount of control density, so the new telemetry layer must not bury existing actions.
- Pilot and ship tabs can become repetitive at higher counts, so scan hierarchy matters more than raw data quantity.
- If the panel continues growing, a later pass may still want filtering or grouping rather than more inline telemetry.

## Files Likely Affected

- `src/ui/panels/FleetPanel.tsx`
- `docs/Idleverse_DESIGN_PLAN.md`

---

# Initiative — Cross-Panel UI Polish Pass
> **Status:** Active
> **Last updated:** March 2026
> **Depends on:** Prior manufacturing, reprocessing, overview, fleet, market, mining, and system panel refresh work

## Goal

Smooth the remaining presentation drift between recently refreshed panels so the command-deck language feels intentional across the UI instead of panel-by-panel. This pass is about spacing, section rhythm, shell treatment, and clearer mode framing rather than adding new systems or mechanics.

## Scope

- Normalize section rhythm and shell treatment in refreshed panels where headers or mode switches still feel flatter than the newer command decks.
- Tighten idle states and section summaries so players can scan what each section is for before opening detailed controls.
- Improve progress-bar readability with always-on semantic labels and a normalized vocabulary so animated bars explain the metric they represent instead of relying on nearby context alone.
- Repair any stale or malformed design-plan text created while multiple UI initiatives landed back-to-back.
- Explicitly out of scope: gameplay changes, new telemetry surfaces, or deeper component architecture refactors.

## Implementation Outline

1. Audit recently refreshed panels for spacing, shell, and section-header drift.
2. Patch the most visible inconsistencies in overview, manufacturing, and reprocessing without expanding scope into new system work.
3. Add always-on semantic labels to shared animated progress bars and normalize them around `Progress`, `Load`, `Status`, and `Rate`.
4. Correct the design-plan ordering so shipped UI initiatives remain coherent and searchable.

## Risks / Open Questions

- A polish pass can easily become a stealth redesign if the scope is not constrained to presentation rhythm.
- Some remaining inconsistency comes from older file structure, so deeper unification may still want shared panel-shell primitives later.
- The design docs now carry many UI initiatives, so keeping ordering and section boundaries clean matters as much as the code patch itself.

## Files Likely Affected

- `src/ui/panels/OverviewPanel.tsx`
- `src/ui/panels/ManufacturingPanel.tsx`
- `src/ui/panels/ReprocessingPanel.tsx`
- `docs/Idleverse_DESIGN_PLAN.md`

---

# Initiative — Market And Reprocessing Width Pass
> **Status:** Active
> **Last updated:** March 2026
> **Depends on:** Existing MarketPanel and ReprocessingPanel refresh work, local-price market logic, reprocessing yield logic

## Goal

Use the newly widened panel real estate in Market and Reprocessing for actual decision support rather than larger shells. The player should gain better regional trade awareness and refinery throughput awareness without changing any of the underlying mechanics.

## Scope

- Expand the Market listings view with live regional analytics built from real local-price and pressure data.
- Expand the Market trade-routes view with route-command analytics so the widened layout adds margin and fleet-coverage context instead of empty space.
- Surface a stock-market-style market board using current regional quotes, spread comparisons, sales mix, and auto-sell readiness rather than fabricated time-series history.
- Expand Reprocessing with throughput analytics built from queue state, auto-threshold surplus, ore security mix, and projected mineral yield value.
- Keep the Reprocessing control surface and analytics surface visually distinct so actionable refinery lanes do not blur together with read-only forecast cards.
- Give the auto-refinery cards a stronger interactive module treatment than the analytics cards so the actionable lane controls feel like the primary surface.
- Tune column ratios on ultrawide layouts so the refreshed left/right rails feel intentional rather than simply uncapped.
- Preserve all existing sell, auto-sell, route, queue, and auto-refinery interactions.
- Explicitly out of scope: new market mechanics, persisted market-history storage, reprocessing balance changes, or queue-rule changes.

## Implementation Outline

1. Add a Market analytics rail with a focus-resource price tape, live spread board, sales mix, and auto-sell watch list.
2. Add a Trade Routes analytics rail with route-command, live margin, and realized-profit context.
3. Widen the Reprocessing layout with a refinery analytics rail showing mineral forecast, ore security mix, and hot-lane readiness.
4. Keep the existing operational controls in place while using the extra width for scan-speed and planning clarity.

## Risks / Open Questions

- The market currently does not store historical quotes, so any stock-market styling must be derived from live regional price snapshots and pressure rather than fake history.
- Analytics density can compete with listings and queue controls if the side rails become too visually loud.
- Future persistence work may eventually want real quote history, but this pass should not invent a second market state model prematurely.
- Performance guardrail: wide analytics and route/fleet rows should reuse shared galaxy/system lookup caches at the panel level rather than regenerating the 400-system map per row or per card.

## Files Likely Affected

- `src/ui/panels/MarketPanel.tsx`
- `src/ui/panels/ReprocessingPanel.tsx`
- `docs/Idleverse_DESIGN_PLAN.md`

---

## Current Implementation Status

| System | Status | Notes |
|---|---|---|
| Mining (ore belts, pools, auto-haul) | ✅ Complete | 10 belts, security-gated, pool depletion |
| Reprocessing (ore → minerals, auto-queue) | ✅ Complete | Efficiency skill-scaled |
| Manufacturing (recipe queue, components, modules, ships) | ✅ Complete | Speed skill-scaled; craftable module inventory and cruiser-tier production now live |
| Skills (35 skills, prerequisites, training queue) | ✅ Complete | Full prerequisite chains; Navigation now adds corp and pilot warp-speed progression |
| Market (NPC sell, auto-sell, lifetime tracking) | ✅ Complete | Prices static — dynamic pricing in Phase 1 |
| Galaxy (400 systems, procedural, jump lanes) | ✅ Complete | BFS + Dijkstra routing |
| Fleet movement (player fleets, orders, warp) | ✅ Complete | Timed warp-leg advancement with fleet/wing ETA + progress; travel speed now composes corp skill, pilot skill, hull, module, and commander bonuses |
| Fleet ship roles & doctrines | ✅ Complete | ShipRole, FleetDoctrine, FleetPanel Fleets tab, StarMapPanel Intel\|Route |
| Fleet combat | ✅ Complete | NPC groups, patrol/raid orders, hull damage, bounty/loot, combat log |
| Blueprint research & T2 manufacturing | ✅ Complete | Phase 3 shipped — research queue, BPC copies, T2 recipes |
| Exploration & anomalies | ✅ Complete | Phase 4 shipped — anomaly scanning, discovery feed, Astrometrics/Archaeology/Hacking skills |
| UI Overhaul — navigation, tooltips, data density | ✅ Complete | GameTooltip + NavTag + useUiStore + DevPanel overhaul + 8-panel renovation (Stream D); March 2026 follow-up adds Overview progression shell, richer lock previews, and first-pass procedural audio cues |
| Fleet-centric remodel — cargo hold + auto-haul (FC-1b/c/d/e) | ✅ Complete | oreDeltas wired to fleet cargoHold; auto-haul to Corp HQ; HQ dump on arrival |
| Corp identity migration (FC-1G partial) | ✅ Complete | state.pilot → state.corp; OverviewPanel → corp command center (CorpCard + CorpHQCard) |
| Fleet-centric foundation (FC-1: cargo holds, auto-haul, corp identity, richness wiring) | ✅ Complete | All FC-1 steps shipped |
| **Fleet commander skills** | **✅ FC-2 COMPLETE** | **Designate pilot as commander; command skill trees; fleet-wide bonuses** |
| **Fleet wings (hauling + escort)** | **⚡ FC-3 ACTIVE** | **Core wing model and escort-aware haul routing shipped; detached combat-response follow-ons remain** |
| **Corp HQ — station registration & POS** | **⚡ FC-4 ACTIVE** | **Station registration, HQ reassignment, industrial HQ gating, faction HQ passive bonuses, and POS core deployment shipped; outpost upgrades and station-specific follow-ons still pending** |
| **On-site fleet reprocessing** | **🟠 FC-5 QUEUED** | **Post-FC-4 industrial operations layer; ore refinery module and industrial hulls** |
| **Dynamic mining threats & fleet defense** | **🟠 FC-6 QUEUED** | **Post-FC-3/FC-4 threat layer; mining pressure, combat response, and fleet reputation** |
| Factions & missions | ⬜ Phase 5 | Reputation tracking exists; station consequences, services, and mission content are still unimplemented |
| Dynamic economy & trade routes | ✅ Complete | Phase 1 shipped — dynamic prices + trade route automation |
| Structures & player outposts | ⬜ Phase 6 | Type stub exists |
| Prestige / New Game+ | ⬜ Phase 7 | Planned |

---

## Immediate Roadmap

| Stage | Focus | Why it is next |
|---|---|---|
| **Now** | **FC-3 follow-ons** | Core wings and escort-aware haul routing are live, but detached combat-response behaviors still need to land on top of the shipped wing model. |
| **Now** | **FC-4 completion** | Station registration, HQ gating, and first-pass POS deployment are live; the remaining FC-4 work is outpost upgrades and station-specific follow-ons. |
| **After FC-4** | **FC-5 On-site Reprocessing** | Deep-space refining makes the most sense once HQ registration and corp infrastructure rules are established. |
| **After FC-3 + FC-4** | **FC-6 Mining Threats** | Threat escalation is strongest once fleets can defend themselves with wings and once faction-controlled territory has real consequences. |
| **Broader expansion** | **Phase 5 Factions, Stations & Mission Boards** | Builds on the FC-4 reputation-gating slice and expands it into station services, mission boards, and faction-hostility consequences. |

This is the intended near-term ship order: finish FC-3 follow-ons, complete the remaining FC-4 POS/station work, then layer FC-5 and FC-6 on top before tackling the broader Phase 5 faction-content rollout.

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

# UI Overhaul — Data Density, Navigation & Developer Tooling

> **Status:** 🔄 In Progress — March 2026
> **Type:** Horizontal UI renovation — not a gameplay phase; no gameplay mechanics changed.

## Goal

Every panel should look **busy with data**. Important values should pop visually. Any entity
referenced in a panel — a fleet name, a pilot, a skill, a resource — should be a clickable tag
that navigates directly to that entity. Tooltips should support arbitrary rich layouts and can nest
n-levels deep with their own clickable tags.

## Four Parallel Workstreams

### Stream A — Core Infrastructure  *(sequential first; others depend on this)*

| Step | File | Change |
|---|---|---|
| A1 | `src/stores/uiStore.ts` *(new)* | Zustand store: `activePanel`, `focusTarget`, `devTimeScale`; actions: `navigate(panel, focus?)`, `clearFocus()`, `setDevTimeScale(n)` |
| A2 | `src/ui/layouts/GameLayout.tsx` | Use `useUiStore` for `activePanel`; game loop multiplies `delta` by `devTimeScale` (DEV guard) |
| A3 | `src/ui/components/GameTooltip.tsx` *(new)* | Pure behavioral shell: depth-aware z-index (`9998 + depth×4`), 80ms hover delay, smart close (leaves trigger AND body), optional pin; + `TT.*` composable content primitives |
| A3b | `src/ui/components/GameDropdown.tsx` *(new, later follow-up)* | Pure behavioral shell for searchable, filterable, portal-rendered rich dropdowns; content-aware option model with badges, tone, metadata, render hooks, and optional split detail pane |
| A4 | `src/ui/components/NavTag.tsx` *(new)* | Clickable entity chip; routes to correct panel + sets `focusTarget` on click; optional nested tooltip |
| A5 | `src/ui/components/StatTooltip.tsx` | Refactor: thin wrapper over `<GameTooltip pinnable content={<StatSheet>}>` — API unchanged |
| A6 | `src/ui/panels/ResourceBar.tsx` | Replace private `Tooltip`/`HoverCard` with `GameTooltip` + `TT.*`; resource name chips → `NavTag` |
| A7 | `src/index.css` | Add `.glow-{cyan|amber|violet|emerald|rose}`, `.entity-tag`, `@keyframes focus-pulse`; widen `.tooltip-popup` to 320px |

### Stream B — Missing Action Buttons  ✅ Shipped — March 2026

> **Files changed:** `src/ui/panels/FleetPanel.tsx`

| # | Action | Panel | Status |
|---|---|---|---|
| B1 | `prioritizeManufacturingJob(index)` | ManufacturingPanel | ⬜ Deferred to ManufacturingPanel renovation |
| B2 | `repairShip(shipId)` | FleetPanel ships | ✅ Hull bar + Repair button in ShipCard expanded |
| B3 | `setPilotTrainingFocus(pilotId, focus)` | FleetPanel pilots | ✅ Focus selector chips in PilotCard expanded |
| B4 | `fitModule` / `removeModule` | FleetPanel ships | ✅ Slot grid with + fit select and ✕ per module |
| B5 | `issueFleetGroupOrder` / `cancelFleetGroupOrder` | FleetPanel fleets | ✅ Navigation section: destination + route filter + Move/Cancel |
| B6 | `removePilotSkillFromQueue` / `renamePilotCharacter` | FleetPanel pilots | ✅ Training queue with ✕ rows + click-to-rename |
| B7 | `dockAtStation` / `undockFromStation` | SystemPanel | ✅ Dock/Undock button wired in SystemPanelInner (Stream D) |
| B8 | `refreshRecruitmentOffers()` | FleetPanel pilots | ✅ Refresh Offers button in Operations tab |

### Stream C — DevPanel Complete Overhaul  ✅ Shipped — March 2026

> **Files changed:** `src/ui/dev/DevPanel.tsx`

- **C1** ✅ — Fixed: added `'system-exploration'` to `ALL_SYSTEM_UNLOCKS`; `SectionLabel`/`InjectButton` extended with optional `style`/`disabled` props
- **C2** ✅ — Time controls header: speed toggles **0.1× 0.5× 1× 2× 5× 10× 50×** via `useUiStore.setDevTimeScale` + **+1 min / +1 hr / +24 hr** instant-tick buttons
- **C3** ✅ — New **Galaxy** tab: reactive current system card + security badge, warp progress bar, Teleport select → patches `galaxy.currentSystemId`, Reveal System (scanSystem), Inject Anomaly with type selector
- **C4** — New **Manufacturing** tab: deferred — existing Scenarios/Unlocks tabs already cover blueprint unlocks; no additional tab added
- **C5** ✅ — New **Factions** tab: docked-station indicator + Undock button, per-faction rep bars (reactive), ±10/±100 rep buttons via `adjustReputation`
- **C6** ✅ — New **State** tab: key metrics grid (credits, ships, pilots, mfg jobs, unlock count), Dump-to-Console button, active unlocks list, state keys reference
- **C7** ✅ — Fleet tab enhanced: **Ship Integrity** section with live hull % bars (colour-coded green/amber/red) + per-ship **REPAIR** button via `repairShip`
- **C8** ✅ — ScenariosTab: **Wipe Save** danger zone added at bottom with inline two-click confirmation (no `window.confirm`); calls `clearSave()` which deletes the persisted save and resets state to `createInitialState()`; old RESET GAME footer button removed

### ✅ COMPLETED — Stream D — Panel Renovations
> **Status:** ✅ Shipped — June 2025
> **Files changed:** `OverviewPanel.tsx`, `MiningPanel.tsx`, `ManufacturingPanel.tsx`, `SkillsPanel.tsx`, `SystemPanel.tsx`, `ReprocessingPanel.tsx`, `MarketPanel.tsx`, `FleetPanel.tsx`
> **Commit:** `d1e4e32`

All 8 targeted panels renovated with NavTag entity links, data density additions, and contextual status indicators. A later follow-up pass started on StarMapPanel readability, beginning with zoom-aware label decluttering and lower-priority label suppression.

### What Was Built

| Panel | Shipped |
|---|---|
| OverviewPanel | `FleetStatusCard` (fleet dots, status label, hull dmg avg, NavTag fleet+system links); `ResourceIncomeCard` (active ore/credit rates) |
| MiningPanel | NavTag on current system name; NavTag on skill-lock refs in BeltCard |
| ManufacturingPanel | Queue utilization bar (amber@50%, rose@90%); NavTag on material cost labels in `CostBar` |
| SkillsPanel | `QueueEtaBadge` in panel header (queue count + total ETA); NavTag on prerequisite skill refs in `SkillDetail` |
| SystemPanel (B7) | Dock/Undock button with rep gate and disabled state; "Fleets here" strip with NavTag fleet links |
| ReprocessingPanel | Letter-grade efficiency badge (S/A/B/C/D, color-coded) in header; NavTag on Reprocessing skill ref |
| MarketPanel | Trend arrows (▲▼─) on price vs base in `MarketRow`; NavTag on resource names; NavTag on skill lock messages |
| FleetPanel | NavTag on system location in fleet header; NavTag on navigation destination; NavTag on patrol/raid skill requirement messages; NavTag on active skill in pilot card |

### March 2026 Follow-up — New Player Progression Shell

> **Status:** 🔄 In Progress — March 2026
> **Files changed:** `src/ui/panels/OverviewPanel.tsx`, `src/ui/panels/SkillsPanel.tsx`, `src/ui/panels/FleetPanel.tsx`, `src/ui/panels/ManufacturingPanel.tsx`, `src/ui/panels/ReprocessingPanel.tsx`, `src/ui/panels/MarketPanel.tsx`, `src/ui/components/SystemUnlockCard.tsx`

- `OverviewPanel` now includes a progression shell that surfaces current opportunities, five parallel focus tracks, next unlock targets, and explicit specialist/hybrid system chains
- `SkillsPanel` now frames the skill tree with specialization guide cards and outcome-first detail text so queue decisions expose payoffs and unlock consequences instead of only modifier rows
- `FleetPanel` movement controls now explain route posture directly where fleet orders are issued, making travel choice a visible speed-versus-safety decision
- `StarMapPanel` route summaries now show estimated total travel time, average hop time, and route exposure, while `FleetPanel` ship cards now surface hull identity and aggregate fitting bonuses to make travel and fitting tradeoffs legible before deeper balance work lands
- Locked `ManufacturingPanel`, `ReprocessingPanel`, and `MarketPanel` states now explain requirement, ETA, payoff, and next action instead of showing only a denial message
- `GameLayout` now exposes a lightweight top-bar audio control (`audioEnabled` + `masterVolume`) and the runtime plays subtle procedural sci-fi SFX for navigation, save confirmation, manufacturing completion, and skill advancement without introducing an asset pipeline
- The procedural audio layer now supports multiple "takes" per cue with slight timing, detune, filter, and gain variation so repeat interactions sound dynamic while keeping the ship-console tone restrained
- The current goal is onboarding clarity without a forced questline; outcome-first SkillsPanel framing and travel/fitting visibility remain the next follow-up slices

| Panel | Key Data Additions | Notable NavTags |
|---|---|---|
| OverviewPanel | FleetStatusRow card, ResourceIncomeCard, belt depletion ETA, MFG ISK/hr | pilot→Fleet, skill→Skills, system→System |
| FleetPanel | Combat readiness %, hull bars (B2), training focus (B3), fitting grid (B4), group orders (B5), pilot rename+queue (B6), refresh offers (B8), doctrine compliance bar | pilot→Skills, hull→hull-stats tooltip, doctrine→requirements tooltip |
| MiningPanel | Belt depletion ETA, efficiency %, 20-tick CSS sparkline, ship-to-belt assignment | skills→Skills, fleet→Fleet |
| ManufacturingPanel | Queue utilization bar, material grid, ISK/margin, bottleneck indicator, ↑ button (B1) | ship→Fleet, minerals→Mining, bottleneck→Market |
| ReprocessingPanel | Efficiency grade badge (S/A/B/C), output yield table, throughput/hr | skills→Skills |
| MarketPanel | Trade volume, trend arrows ↑↓, inflow/outflow row, margin % | — |
| SkillsPanel | Queue total ETA, affects-system NavTags, next-level preview, category pill row | systems→panels |
| StarMapPanel | Fleet position dots, anomaly density heat, fleet dot click, default-on system-name labels with a show/hide filter plus zoom-adaptive decluttering, projected React hover intel card, widened right rail with clearer route/intel hierarchy | system→System, fleet dot→Fleet+focus |
| SystemPanel | Belt ore composition bars, fleet assignment section, anomaly counts by type, Dock/Undock (B7) | fleet→Fleet |

## Key Technical Decisions

- `activePanel` lives in `useUiStore` (Zustand), **not** local component state or React Context — NavTags inside tooltip portals need to navigate without being in the component tree
- `GameTooltip` is a **behavioral shell only** — content layout is 100% caller-defined via `TT.*` primitives or arbitrary JSX
- `GameDropdown` follows the same rule as `GameTooltip`: shared behavior, caller-owned content semantics via structured option data + optional render hooks, including inline detail panes for dense selectors
- `TT.*` primitives: `TT.Header`, `TT.Section`, `TT.Grid`, `TT.Row`, `TT.Divider`, `TT.ProgressBar`, `TT.BadgeRow`, `TT.Footer`, `TT.Spacer` — stateless, freely composable
- Focus behavior on NavTag navigation: **auto-expand + scroll into view + 3s `.focus-pulse` glow**, then `clearFocus()`
- Nested tooltip depth tracked via `TooltipDepthContext`; z-index formula `9998 + depth × 4`
- Mini charts: **inline SVG or CSS flex bars only** — no chart library dependency

## Files

| File | Stream | Action |
|---|---|---|
| `src/stores/uiStore.ts` | A1 | CREATE |
| `src/ui/layouts/GameLayout.tsx` | A2 | MODIFY |
| `src/ui/components/GameTooltip.tsx` | A3 | CREATE |
| `src/ui/components/GameDropdown.tsx` | A3b | CREATE |
| `src/ui/components/NavTag.tsx` | A4 | CREATE |
| `src/ui/components/StatTooltip.tsx` | A5 | REFACTOR |
| `src/ui/panels/ResourceBar.tsx` | A6 | REFACTOR + NavTags |
| `src/index.css` | A7 | MODIFY |
| `src/ui/panels/ManufacturingPanel.tsx` | B1 + D | Missing ↑ button + renovation |
| `src/ui/panels/FleetPanel.tsx` | B2–B6 + B8 + D | All missing buttons + renovation |
| `src/ui/panels/SystemPanel.tsx` | B7 + D | Dock/Undock + renovation |
| `src/ui/dev/DevPanel.tsx` | C1–C7 | OVERHAUL — fix + 4 new tabs |
| `src/ui/panels/OverviewPanel.tsx` | D | Renovation |
| `src/ui/panels/MiningPanel.tsx` | D | Renovation |
| `src/ui/panels/ReprocessingPanel.tsx` | D | Renovation |
| `src/ui/panels/MarketPanel.tsx` | D | Renovation |
| `src/ui/panels/SkillsPanel.tsx` | D | Renovation |
| `src/ui/panels/StarMapPanel.tsx` | D | Renovation |
| `docs/Idleverse_AI_Architecture.md` | — | Document UI layer architecture |
| `docs/Idleverse_SYSTEM_BLUEPRINTS.md` | — | System 13 |

---

---

# ✅ COMPLETED — FC-1 — Fleet-Centric Foundation

> **Status:** ✅ Shipped — March 2026
> **Files changed:** `game.types.ts`, `faction.types.ts`, `fleet.logic.ts`, `fleet.tick.ts`, `mining.logic.ts`, `tickRunner.ts`, `initialState.ts`, `gameStore.ts`, `FleetPanel.tsx`, `OverviewPanel.tsx`, `SystemPanel.tsx`

## What Was Shipped

| Step | Status | Notes |
|---|---|---|
| **FC-1a** — Remove `currentSystemId` mining gate | ✅ Shipped | `getBeltRichnessForSystem(galaxy, beltId, systemId)` pure fn added; legacy `tickMining` mine-loop removed; belt pool depletion now driven by fleet ships |
| **FC-1b** — Wire fleet `oreDeltas` to `cargoHold` | ✅ Shipped | `tickRunner` applies `oreDeltas` to each fleet's `cargoHold` each tick, capped by cargo capacity |
| **FC-1c** — Fleet cargo hold model | ✅ Shipped | `PlayerFleet.cargoHold: Record<string, number>` added; `computeFleetCargoCapacity()` in `fleet.logic.ts` |
| **FC-1d** — Corp HQ concept | ✅ Shipped | `FactionsState.homeStationId / homeStationSystemId / registeredStations`; `setHomeStation` store action; pre-seeded with `homeStationId: 'station-home'`, `homeStationSystemId: 'home'` in `initialState.ts` |
| **FC-1e** — Fleet auto-haul to HQ | ✅ Shipped | Full round-trip loop: fleet at HQ dumps immediately inline; fleet away stamps `miningOriginSystemId`, dispatches haul trip; on HQ arrival ore dumped + fleet dispatched back; on return `activity: 'mining'` restored per ship and `miningOriginSystemId` cleared; FleetPanel "Haul to HQ" button + fill bar |
| **FC-1f** — Clean remaining UI gates | ✅ Shipped | MiningPanel fully fleet-centric; `getCurrentSystemBeltIds` removed; `ORE_BELTS` richness wired into fleet mining yield |
| **FC-1G** — Corp identity (state.pilot → state.corp) | ✅ Shipped | `state.corp: CorpState` replaces deprecated `state.pilot`; save migration included; OverviewPanel → CorpCard + CorpHQCard |
| **FC-1H** — Belt skill gates | ✅ Shipped | `ORE_BELTS[beltId].requiredSkill` checked in `setShipActivity()`; `SystemPanel` shows locked belt cards with 🔒 tooltip and live fleet-assignment status for unlocked belts; dead `unlocks` arrays removed from `skills.config.ts` |

## Key Architecture Changes

- `tickMining()` now only handles **belt pool respawn timers** — the mine-loop that wrote to `oreHold` is removed
- Fleet ore production flows entirely through `fleet.tick.ts` → `oreDeltas` → `fleet.cargoHold` → Corp HQ dump
- Belt pool depletion is now driven by `fleetResult.beltPoolDeltas` in `tickRunner` step 8; depleted belts unassign mining ships automatically
- `getBeltRichnessForSystem(galaxy, beltId, systemId)` is a new pure function; all fleet mining applies system richness multipliers correctly
- Deep-ore yield bonus (`deep-ore-yield` modifier) now correctly applied in fleet mining
- `getCurrentSystemBeltIds` removed; `SystemPanel` uses `getBeltsForSystem(system.id, galaxy.seed)`
- **Auto-haul is two-branch**: fleet already at HQ → ore dumped inline immediately (no haul trip); fleet away from HQ → `miningOriginSystemId` stamped on `PlayerFleet`, haul trip dispatched; dump block only fires for fleets with `miningOriginSystemId` set (prevents instant ore drain for stationary miners at HQ)
- **Re-mining round-trip**: after dumping at HQ, fleet auto-dispatches back to `miningOriginSystemId`; on arrival, ships with `assignedBeltId` have `activity: 'mining'` restored and `miningOriginSystemId` cleared
- Belt skill gates: `ORE_BELTS[beltId].requiredSkill` checked in `setShipActivity()`; `SystemPanel` renders locked belt cards with a 🔒 disabled button and `GameTooltip` showing the required skill name and level, while unlocked belts now show actual fleet assignment status instead of the old `mining.targets` toggle state

---

# ✅ COMPLETED — FC-2 — Fleet Commander System
> **Status:** ✅ Shipped — July 2025
> **Files changed:** `game.types.ts`, `commander.config.ts` (new), `commander.logic.ts` (new), `fleet.tick.ts`, `initialState.ts`, `gameStore.ts`, `FleetPanel.tsx`, `saveLoad.ts`

## What Was Built

- Any pilot in a fleet can be designated **Fleet Commander** via a new UI section in FleetPanel above the Doctrine selector.
- Commanders have a separate `commandSkills: CommanderSkillState` queue trained independently of corp skills.
- Five command skill trees (5 levels each): `mining-command` (+4%/lvl yield), `combat-command` (+5%/lvl DPS +3%/lvl tank), `logistics-command` (+8%/lvl cargo, −5%/lvl haul, +2%/lvl warp), `industrial-command` (+6%/lvl on-site refining), `recon-command` (+10%/lvl scan −8%/lvl sig).
- Training times: 2h / 4h / 8h / 16h / 48h per level. Active fleets train 1.5× faster.
- Commander mining bonus wired directly into `fleet.tick.ts` yield per ship.
- Old saves are patched on load (`saveLoad.ts` migration) to add `commandSkills` and `commanderId` defaults.
- UI shows: commander name, active training bar with ETA, queued skills, per-level queue buttons, and live bonus chips for non-zero bonuses.

---

---

# ⚡ FC-3 — Fleet Wings

> **Status:** Partially shipped — core wing systems and escort-aware hauling shipped March 2026; detached combat follow-ons remain.
> **Priority:** High — this is active follow-on work on top of an already-live wing model.

> **Depends on:** FC-1 (fleet cargo model), FC-2 (commander skills feed wing-level bonuses).

## Goal

Sub-divide a fleet into **Wings** — logical groups of ships with defined roles (mining, hauling, combat/escort, recon, industrial). A hauling wing attached to a mining wing automatically routes to Corp HQ when cargo is full, optionally with a combat escort wing traveling alongside.

## Data Model

**Type changes** (`src/types/game.types.ts`):
```ts
type WingType = 'combat' | 'mining' | 'hauling' | 'recon' | 'industrial';

interface FleetWing {
  id: string;
  name: string;
  type: WingType;
  shipIds: string[];
  commanderId: string | null;
  cargoHold: Record<string, number>;
  escortWingId: string | null;      // combat wing that escorts this wing on haul trips
  isDispatched: boolean;            // true while the wing is hauling to HQ
  haulingOriginSystemId: string | null;
}

interface PlayerFleet {
  // existing...
  wings: FleetWing[];
}
```

Ships can be unassigned (no wing) or assigned to exactly one wing. Unassigned fleet ships remain in the fleet for organization and travel, but they do not contribute to wing-driven gameplay systems until assigned to a wing.

## Logic

New file: `src/game/systems/fleet/wings.logic.ts`
- `getWingCargoCapacity(wing, ships)` — sum ship cargo capacity within the wing.
- `getWingCargoUsed(wing)` — sum ore currently stored in the wing's cargo hold.
- `dispatchHaulerWing(fleetId, wingId, homeSystemId)` — issues sub-group haul orders for a specific hauling wing and its optional escort wing.
- `processWingArrivalAtHQ(fleetId, wingId, homeSystemId)` — dumps a hauling wing cargo hold when that wing's dispatched ships reach HQ, then issues the return trip.
- `processWingReturn(fleetId, wingId)` — restores activity and clears dispatch state after the specified wing returns.

**Tick behavior:**
- If one or more hauling wings exist, mined ore is distributed across non-dispatched hauling wings before falling back to the legacy fleet hold.
- Fleet ships that are not assigned to any wing are ignored by fleet mining, scanning, and combat resolution until assigned to a wing.
- Each hauling wing checks its own capacity threshold; when a wing reaches 90% fill, `dispatchHaulerWing` fires for that wing only.
- Only ships in the dispatched hauling wing plus its optional combat escort wing are sent to HQ; the rest of the fleet stays on station.
- Wing commanders apply command-skill bonuses to their own wing scope; a fleet commander may also be a wing commander at the same time without duplicate-stacking the same pilot twice.
- On HQ arrival: the dispatched wing cargo is deposited, the dispatched ships receive return orders, and the wing dispatch state is cleared when they reach origin.

## UI: Wing Management in Fleet Card

- `src/ui/panels/FleetPanel.tsx`: "Fleet Wings" collapsible section in expanded fleet card.
  - "+ Create Wing" buttons per wing type.
  - Each wing: compact expandable row with inline rename, wing commander selector, ship assignment dropdowns, escort assignment dropdown, and per-wing dispatch button for hauling wings.
  - Hauling wing status chip: `Hauling Wing — 2 ships — 3,400 / 4,000 m³ (85%) → hauling to HQ`.
  - Top cargo module switches to **Hauling Hold** or **Hauling Network** when hauling wings exist and shows aggregate hauling storage.
  - Ships not in any wing shown as "Unassigned" at the bottom.

## Store Actions

- `createFleetWing(fleetId, type, name): void`
- `renameFleetWing(fleetId, wingId, name): void`
- `deleteFleetWing(fleetId, wingId): void`
- `designateWingCommander(fleetId, wingId, pilotId | null): void`
- `assignShipToWing(fleetId, shipId, wingId | null): void`
- `setWingEscort(fleetId, wingId, escortWingId | null): void`
- `dispatchHaulingWingToHQ(fleetId, wingId?): void`

## Files Changed

| File | Change |
|---|---|
| `src/types/game.types.ts` | Add `FleetWing`, `WingType`; add `wings` to `PlayerFleet`; add `commanderId` on `FleetWing` |
| `src/stores/initialState.ts` | Starter fleet seeded with `Starter Mining Wing` |
| `src/stores/gameStore.ts` | `createFleetWing`, `renameFleetWing`, `deleteFleetWing`, `designateWingCommander`, `assignShipToWing`, `setWingEscort`, targeted hauling-wing dispatch |
| `src/game/systems/fleet/wings.logic.ts` | *(new)* wing capacity + dispatch logic |
| `src/game/core/tickRunner.ts` | Multi-hauler cargo distribution, per-wing auto-haul dispatch, HQ arrival, and return processing |
| `src/game/systems/fleet/fleet.tick.ts` | Wing-command training eligibility and wing-scope mining bonuses |
| `src/game/systems/fleet/exploration.logic.ts` | Wing-scope recon bonus propagation for scan strength |
| `src/ui/panels/FleetPanel.tsx` | Wing management section with compact expandable rows, commander assignment, and per-wing dispatch |
| `src/game/persistence/saveLoad.ts` | Patch old saves with `wings: []` and `wing.commanderId` |

## What Was Built So Far

- Fleets now support typed `wings` with persistent assignment state.
- The Fleet panel can create wings, rename them, assign wing commanders, assign ships into them, set combat escorts, and manually dispatch individual hauling wings.
- New fleets and the starter fleet now begin with an initial populated wing so the opening experience is immediately usable.
- Hauling wings now own cargo directly via `wing.cargoHold`, and fleets with multiple hauling wings distribute ore across available wing holds.
- Auto-haul now dispatches ready hauling wings independently, sending only the selected hauling wing and its escort to HQ.
- Hauling wings now choose routes based on escort cover: escorted trips prefer direct routing, while unescorted trips automatically prefer the safest available path and only fall back to riskier routes when necessary.
- Fleet and wing commander bonuses now propagate at ship scope for mining and exploration, and at wing scope for hauling capacity.
- Wing mutation rules are hardened: wings cannot be mutated while dispatched or while the whole fleet is in transit, whole-fleet movement and fleet membership changes are blocked while a hauling wing is dispatched, and deleting a wing transfers stored cargo back into the fleet hold.
- A pilot can be both fleet commander and wing commander at the same time; the same pilot's command bonus is only counted once per ship/wing calculation.
- Fleets with no hauling wing keep the prior FC-1 whole-fleet auto-haul behavior.
- Fleet, mining, and overview summaries now distinguish total fleet members from operational wing-assigned ships so inactive unwinged ships remain visible without being misreported as active contributors.
- Fleet and overview UI now surface whether a dispatched hauling operation is running under escort cover or under safe-route protocol so wing logistics state is visible without drilling into order internals.
- Fleet and Overview now surface live escort-response state when a detached convoy is actively fighting through hostile space.

---

---

# ⚡ FC-4 — Corp HQ: Station Registration & Player-Owned Structures

> **Status:** In progress — station registration and HQ gating shipped March 2026; POS path still pending.
> **Priority:** Highest — active gating milestone for corp operations, industrial rules, and faction-station access.
> **Depends on:** FC-1 (homeStationId model), existing faction reputation tracking from `FactionsState` for station-registration requirements.

## Goal

Two flavors of Corp HQ:
1. **Register with a faction station** — pay credits + meet rep threshold → access corp facilities at that station.
2. **Build a POS (Player-Owned Station)** — manufacture a `pos-core` and deploy it in any system → full corp HQ with upgradeable tiers.

Manufacturing and reprocessing gain a soft warning (then hard gate in this phase) when no HQ is set.

## Registered Faction Stations

- `src/game/systems/factions/station.gen.ts`: Stations now expose deterministic `registrationCost` and `registrationRepRequired` values by faction.
- `src/stores/gameStore.ts`: `registerWithStation(stationId)` now requires docking, checks standing and credits, adds the station to `registeredStations`, and sets it as the active Corp HQ.
- Each faction station provides a unique passive bonus:

| Faction | Station Bonus |
|---|---|
| Concordat | +10% manufacturing speed |
| Veldris | +15% mining yield in their systems |
| Free Covenant | +10% market sell price |
| Null Syndicate | +20% combat loot quality |

## Player-Owned Station (POS)

- New manufacturing recipe `pos-core` (T2 tier): requires advanced minerals + T2 components.
- New store action: `deployPOS(systemId): void` — places POS in `FactionsState.outposts` (stub already exists in type).
- POS acts as full Corp HQ: factory, refinery, hangar access for all fleets.
- POS upgradeable via `StructuresState.levels` (already stubbed): Level 1–5, each level increases speed/yield bonuses and unlocks additional slots.
- POS can be attacked by NPC factions if faction rep is sufficiently negative → creates defense alert event.

## UI Changes

- `src/ui/panels/SystemPanel.tsx`: Gold ⬡ icon on orrery star when viewing the Corp HQ system. Docked stations can now be registered if the corp meets the standing and credit requirements; already-registered stations can be promoted to Corp HQ.
- `src/ui/panels/ManufacturingPanel.tsx`: Show HQ status banner and hard-stop job creation/research/copy actions if no HQ is registered.
- `src/ui/panels/ReprocessingPanel.tsx`: Show HQ status banner and disable job creation/auto-refinery controls if no HQ is registered.

## Store Actions

- `registerWithStation(stationId): void`
- `deployPOS(systemId): void`
- `upgradePOS(systemId): void`

## What Was Built So Far

- Stations now expose registration requirements and costs by faction.
- Docked stations can be registered as corp facilities through `registerWithStation`, which also promotes the chosen station to active Corp HQ.
- `setHomeStation` is now restricted to stations already present in `registeredStations`, so HQ reassignment follows the registration flow instead of bypassing it.
- Manufacturing, blueprint research/copy, and reprocessing actions now require an active Corp HQ in the store layer.
- Active Corp HQ stations now grant faction-specific passive bonuses: Concordat manufacturing speed, Veldris mining yield in Veldris space, Covenant market sell price, and Syndicate combat loot quality.
- System, Manufacturing, and Reprocessing panels now surface HQ state directly so the gating is visible to the player.
- `pos-core` can now be manufactured as a strategic infrastructure component and consumed through `deployPOS(systemId)` to anchor a player outpost.
- Player outposts now occupy the Corp HQ slot, satisfy manufacturing/reprocessing HQ gating, surface in the System and Overview panels, and seed the future FC-4 upgrade path via persistent outpost state plus `structures.levels` tracking.

## Files Changed

| File | Change |
|---|---|
| `src/types/faction.types.ts` | Add station registration cost/standing fields |
| `src/game/systems/factions/station.gen.ts` | Deterministic station registration requirements by faction |
| `src/stores/gameStore.ts` | `registerWithStation`; restrict HQ reassignment to registered stations; gate manufacturing/reprocessing actions behind HQ presence |
| `src/stores/initialState.ts` | Seed starter Corp HQ as already registered |
| `src/game/persistence/saveLoad.ts` | Migrate legacy saves so `registeredStations` always includes `homeStationId` |
| `src/game/systems/factions/faction.logic.ts` | Active HQ station lookup + faction passive bonus definitions |
| `src/game/systems/manufacturing/manufacturing.logic.ts` | Concordat HQ manufacturing bonus applied to effective speed |
| `src/game/systems/market/market.logic.ts` | Covenant HQ sell-price bonus applied to effective market value |
| `src/game/systems/fleet/fleet.tick.ts` | Veldris HQ mining bonus applied in Veldris-controlled systems |
| `src/game/systems/combat/combat.logic.ts` | Syndicate HQ loot-quality bonus applied to victory loot rolls |
| `src/ui/panels/SystemPanel.tsx` | HQ marker, station registration flow, registered-station HQ reassignment, missing-HQ banner |
| `src/ui/panels/ManufacturingPanel.tsx` | HQ status indicator |
| `src/ui/panels/ReprocessingPanel.tsx` | HQ status indicator |
| `src/ui/panels/OverviewPanel.tsx` | HQ card now surfaces the active faction passive bonus |
| `src/game/resources/resourceRegistry.ts` | Add `pos-core` strategic infrastructure resource |
| `src/game/systems/manufacturing/manufacturing.config.ts` | Add `craft-pos-core` recipe |
| `src/game/systems/factions/faction.logic.ts` | Add outpost helpers and HQ lookup support for player outposts |
| `src/game/persistence/saveLoad.ts` | Migrate outposts to carry stable IDs |
| `src/ui/panels/SystemPanel.tsx` | Add POS deployment button, outpost strip, and outpost HQ promotion |

---

---

# 🟠 FC-5 — On-Site Reprocessing & Industrial Ships

> **Status:** Designed, not yet implemented.
> **Priority:** High — depth addition; reduces haul trips and enables deep-space industrial operations.
> **Depends on:** FC-2 (`industrial-command` L2 gate), FC-4 (HQ registration/infrastructure rules establish the baseline refining loop this extends).

## Goal

Fleets equipped with an **Ore Refinery Array** module and a commander trained in `industrial-command` can refine ore in the field. On-site yield is 65% (vs HQ 100%), but minerals weigh far less than ore — dramatically reducing haul trip frequency.

## Refinery Module

- `src/game/systems/fleet/fleet.config.ts`: New module entry:
  ```ts
  {
    id: 'ore-refinery',
    name: 'Ore Refinery Array',
    slot: 'high',
    fitsHullTypes: ['exhumer', 'industrial-barge', 'hauler'],
    gives: { onSiteRefiningEfficiency: 0.65 }
  }
  ```
- Unlocked via `industrial-command` L2 (commander skill gating).

## Industrial Barge Hull

- `src/game/systems/fleet/fleet.config.ts`: New hull `industrial-barge`:
  - High cargo hold (8,000 m³)
  - Can fit `ore-refinery` module
  - Low combat rating (not a combat ship)
  - Slow movement (higher warp time per hop)

## On-Site Refining Tick

- `src/game/systems/fleet/fleet.tick.ts`: Each tick, if fleet has ≥1 ship with `ore-refinery` module AND `fleet.commanderId` pilot has `industrial-command` level ≥ 2:
  - Process a fraction of fleet `cargoHold` ore into minerals.
  - Yield = `0.65 × (1 + getCommanderIndustrialBonus(commander))`.
  - Minerals replace ore in fleet cargoHold (minerals have lower m³/unit → frees capacity).

## UI Changes

- `src/ui/panels/FleetPanel.tsx`: Fleet card shows "Refining Active" badge when on-site refining is running. Efficiency chip: `♻ Refining at 72%`.
- `src/ui/panels/MiningPanel.tsx`: Fleet mining rows show whether ore is being stored raw or refined on-site.

## Files Changed

| File | Change |
|---|---|
| `src/game/systems/fleet/fleet.config.ts` | `ore-refinery` module; `industrial-barge` hull |
| `src/game/systems/fleet/fleet.tick.ts` | On-site refining tick logic |
| `src/game/resources/resourceRegistry.ts` | Register `industrial-barge` hull |
| `src/ui/panels/FleetPanel.tsx` | Refining active badge |
| `src/ui/panels/MiningPanel.tsx` | Raw vs refined indicator |

---

---

# 🟠 FC-6 — Dynamic Mining Threats & Fleet Defense

> **Status:** Designed, not yet implemented.
> **Priority:** High — provides ongoing tension and content generation for fleet operations.
> **Depends on:** FC-1 (fleet-based mining), FC-3 (combat wings and escort response behavior), Phase 2 combat systems that are already shipped.

## Goal

Sustained mining operations in contested space attract NPC pirate responses, creating an ongoing threat loop. Fleets with combat wings handle threats autonomously; unprotected mining fleets trigger player alerts. Resource claim beacons make territory visible to factions.

## Mining Threat Escalation

- `src/game/systems/fleet/fleet.tick.ts` / `src/game/systems/combat/combat.logic.ts`:
  - Track per-fleet `continuousMiningMinutes` counter (reset on fleet move or idle).
  - If mining in lowsec and `continuousMiningMinutes >= 20`: spawn a pirate group threat in the system.
  - If mining in nullsec and `continuousMiningMinutes >= 10`: spawn a stronger NPC group.
  - If fleet has a combat wing assigned: auto-engage (reuse existing patrol/combat order resolution).
  - If no combat wing: fire a fleet alert event — `{ type: 'mining-threat', fleetId, systemId }`; mining pauses.

## Resource Claim Beacons

- New store action: `plantResourceClaim(fleetId, systemId): void`.
- Adds a `ResourceClaim` to `FactionsState` — visible to faction NPC logic.
- If claiming systems in a faction's territory with rep `< −200`: faction dispatches an enforcement fleet to the system (existing NPC spawn mechanic) within `12–48h`.
- Creates dynamic consequence: the more ore you extract from faction space, the more active their response.

## Fleet Reputation

**Type changes** (`src/types/game.types.ts`):
```ts
interface PlayerFleet {
  // existing...
  combatReputation: number;   // earned from NPC kills
  miningReputation: number;   // earned from total ore extracted
}
```

Reputation milestones unlock fleet-specific passive bonuses:
- `combatReputation >= 100`: "Battle-Hardened" — +5% fleet combat stats
- `combatReputation >= 500`: "Veteran" — +10% combat stats, −5% hull damage taken
- `miningReputation >= 1000`: "Ore Baron" — +5% mining yield, +10% cargo capacity

## UI Changes

- `src/ui/panels/FleetPanel.tsx`: Fleet reputation bars (combat / mining) in fleet card expanded section. Active reputation bonus chips.
- `src/ui/panels/OverviewPanel.tsx`: Alert card for mining threats; "Assign Combat Wing" quick action.

## Store Actions

- `plantResourceClaim(fleetId, systemId): void`
- `dismissMiningThreat(alertId): void`

## Files Changed

| File | Change |
|---|---|
| `src/types/game.types.ts` | Add `combatReputation`, `miningReputation`, `continuousMiningMinutes` to `PlayerFleet`; add `ResourceClaim` to `FactionsState` |
| `src/stores/initialState.ts` | Default `combatReputation: 0`, `miningReputation: 0` |
| `src/stores/gameStore.ts` | `plantResourceClaim`, `dismissMiningThreat` |
| `src/game/systems/fleet/fleet.tick.ts` | Threat escalation timer; auto-engage check |
| `src/ui/panels/FleetPanel.tsx` | Reputation bars + bonus chips |
| `src/ui/panels/OverviewPanel.tsx` | Mining threat alert card |

---

---

# Phase 5 — Factions, Stations & Mission Boards

> **Status:** Designed, not yet implemented.
> **Depends on:** FC-4 for station registration/HQ gating; uses already-shipped Phase 2 combat results for mission and hostility hooks.

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
