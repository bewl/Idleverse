# Idleverse – AI Architecture & Simulation Instructions

## Purpose of This Document

This document defines the preferred **technical architecture, simulation model, progression structure, save model, and coding rules** for Idleverse.

AI assistants should use this as the **global implementation reference** when generating code, proposing architecture, or extending systems.

The goal is to keep Idleverse:

- modular
- scalable
- deterministic where practical
- easy to expand
- easy to balance
- maintainable over a long project lifespan

## Architecture Principles

### 1. System-Driven Design

Idleverse should be composed of **independent gameplay systems**.

Examples:

- MiningSystem
- EnergySystem
- ResearchSystem
- ManufacturingSystem
- TerraformingSystem
- ColonySystem
- LogisticsSystem
- ExpeditionSystem

Each system should be responsible for:

- its own state
- its own progression rules
- its own unlock logic
- its own calculations
- exposing a clean interface to the rest of the game

Avoid giant all-in-one game managers.

### 2. Data-Driven Wherever Reasonable

Prefer data/config-driven definitions over hard-coded values.

Examples of things that should be configuration-based:

- resources
- upgrades
- unlock requirements
- mastery milestones
- task durations
- production formulas
- research definitions
- prestige rewards

This makes balancing and content expansion much easier.

### 3. Separation of Concerns

Keep the following layers separate:

- **simulation logic**
- **progression/unlock rules**
- **persistence**
- **UI rendering**
- **animation/presentation**

UI components should not contain core simulation logic.

### 4. Extensibility First

Every major feature should be built so that future systems can plug into the same pattern.

If one system has upgrades, timers, unlock conditions, and mastery, then future systems should be able to reuse the same architecture style.

## Actual Folder Structure

The following is the **real folder structure** as of the current implementation:

```text
src/
  App.tsx
  main.tsx
  game/
    balance/        — constants.ts (tick rates, upgrade growth rate, haul times)
    core/           — tick runner, game loop
    galaxy/         — galaxy generation, system graph, NPC group seeding
    hooks/          — useResourceRates and other computed hooks
    offline/        — offline progress catch-up calculation
    persistence/    — save/load, migration, serialization
    prestige/       — stub (Phase 7)
    progression/    — unlock checks, milestone tracking
    resources/      — resourceRegistry.ts, formatters
    systems/
      combat/       — combat.logic.ts, combat.tick.ts
      energy/       — stub
      exploration/  — implemented in fleet/exploration.logic.ts
      factions/     — faction.config.ts, rep tracking, station generation
      fleet/        — commander.config.ts, commander.logic.ts,
      |               fleet.config.ts, fleet.logic.ts, fleet.tick.ts,
      |               fleet.orders.ts, fleet.gen.ts, pilot.logic.ts,
      |               exploration.logic.ts, wings.logic.ts
      manufacturing/ — manufacturing.config.ts, manufacturing.logic.ts (T1 + T2 + research)
      market/       — market.config.ts, market.logic.ts (dynamic pricing + trade routes)
      mining/       — mining.config.ts, mining.logic.ts, mining.tick.ts
      project/      — stub
      reprocessing/ — reprocessing.logic.ts
      research/     — implemented in manufacturing/manufacturing.logic.ts (Phase 3 done)
      skills/       — skills.config.ts, skills.logic.ts
    utils/          — seeded RNG, math helpers
  stores/
    gameStore.ts    — Zustand store (all actions, selectors)
    initialState.ts — factory defaults for a new game
  types/
    game.types.ts   — core GameState + all system state types
    galaxy.types.ts — GalaxyState, SystemNode, JumpLane
    faction.types.ts — factions, FleetOrder
    combat.types.ts  — CombatOrder, NpcGroupDef, CombatLogEntry
  ui/
    components/     — shared UI primitives (GameTooltip, GameDropdown, NavTag, SystemUnlockCard)
    dev/            — DevPanel (cheat/debug panel)
    effects/        — StarField, StarfieldBackground
    layouts/        — GameLayout (nav + panel switcher)
    panels/
      FleetPanel.tsx
      ManufacturingPanel.tsx
      MarketPanel.tsx
      MiningPanel.tsx
      OverviewPanel.tsx
      ReprocessingPanel.tsx
      ResourceBar.tsx
      SkillsPanel.tsx
      StarMapPanel.tsx
      SystemPanel.tsx
```

### Folder Intent

#### `game/core`
Shared engine-level logic.

Examples:

- tick runner
- time math
- game loop helpers
- global state interfaces
- calculation helpers

#### `game/resources`
Resource definitions and helpers.

Examples:

- resource registry
- resource metadata
- production/consumption helpers

#### `game/systems`
All gameplay systems.

Each system should ideally have its own folder.

Example:

```text
game/systems/mining/
  mining.types.ts
  mining.config.ts
  mining.logic.ts
  mining.selectors.ts
```

#### `game/progression`
Unlocks, milestones, research, and account progression rules.

This layer now also owns state-derived progression advisory helpers. Shared recommendation logic such as specialization-lane ranking and prerequisite-aware training ETA calculation should live here so Overview, Skills, and locked-system previews do not drift into conflicting progression advice.
Recruitment timing and milestone staffing advice also belong here when they are driven by progression beats rather than by a raw UI action.

#### `game/automation`
Automation rules, worker assignment, AI behavior, clone slots, scheduling logic.

#### `game/prestige`
Timeline resets, permanent bonuses, and meta progression.

#### `game/offline`
Offline calculation rules and catch-up processing.

#### `game/persistence`
Save/load, migrations, serialization, validation.

#### `game/content`
Static content definitions used by systems.

Examples:

- upgrades
- research nodes
- expedition encounters
- colony templates

#### `ui/components`

Reusable UI primitives shared across panels.

Key components:

- `GameTooltip.tsx` — behavioral tooltip shell + `TT.*` composable content primitives
- `GameDropdown.tsx` — behavioral dropdown shell for searchable, filterable, portal-rendered option pickers
- `NavTag.tsx` — content-aware navigation chip (entity type → panel routing)
- `StatTooltip.tsx` — modifier breakdown tooltip (wraps GameTooltip)
- `UpgradeCard.tsx`, `ProgressBar.tsx`, `FlairProgressBar.tsx` — panel building blocks

#### `ui/dev`

Development-only panel (`DevPanel.tsx`). Gated by `import.meta.env.DEV` — Vite strips it
entirely from production builds. Toggle with Ctrl+\`.

#### `ui/effects`

Visual-only components with no game logic (e.g., `StarField.tsx`).

#### `ui/layouts`

Top-level layout wrapper (`GameLayout.tsx`). Holds nav sidebar, resource bar, panel switcher.
Uses `useUiStore` for `activePanel` rather than local state.

The persistent top bar should be treated as a flexible live data bar, not a raw inventory strip. `ResourceBar.tsx`
is expected to summarize high-value operational and economic state in a slim single-row chip layout with
immediately visible status and rate text, then use tooltip drill-downs for deeper inspection without duplicating
full Overview cards.

#### `ui/panels`

One file per top-level panel. No game simulation logic lives here — panels read from stores
and call store actions only.

`OverviewPanel.tsx` is expected to separate operational triage from strategic guidance rather than stacking every card into one scroll. The default `Operations` subview should answer what needs attention now, while the `Guidance` subview holds opening-loop explanation, branch advice, and progression framing. Early-game guidance should remain state-derived and action-oriented: explain what the starter loop is currently doing, surface the nearest unlocks with truthful prerequisite-aware ETAs, and route the player directly to the panel or skill that resolves the current blocker.

## UI State Model

UI-only state (navigation, focus, dev time scale) is kept in a **separate Zustand store**
distinct from `gameStore`. This is critical because `NavTag` components rendered inside
`createPortal` tooltip trees need to trigger navigation without being in the React tree.

```ts
// src/stores/uiStore.ts
interface UiStore {
  activePanel: PanelId;
  focusTarget: FocusTarget | null;
  devTimeScale: number;           // DEV only
  collapsedInfoSections: Record<string, boolean>;
  dismissedProgressPrompts: Record<string, boolean>;
  panelStates: PanelStateMap;
  navigationHistory: NavigationHistoryEntry[];

  navigate(panelId: PanelId, focus?: FocusTarget): void;
  goBack(): void;
  restoreHistory(historyId: string): void;
  clearFocus(): void;
  setDevTimeScale(scale: number): void;
  setInfoSectionCollapsed(sectionId: string, collapsed: boolean): void;
  toggleInfoSection(sectionId: string): void;
  dismissProgressPrompt(promptId: string): void;
  restoreProgressPrompt(promptId: string): void;
  setPanelState(panelId: PanelId, nextState: Partial<PanelStateMap[PanelId]>): void;
}

type PanelId = 'overview' | 'skills' | 'fleet' | 'starmap' | 'system'
             | 'mining' | 'manufacturing' | 'reprocessing' | 'market';

type EntityType = 'fleet' | 'pilot' | 'ship' | 'wing' | 'skill' | 'resource' | 'system' | 'anomaly' | 'panel';

type FocusTarget = {
  entityType: EntityType;
  entityId: string;
  panelSection?: string;
  parentEntityId?: string;
};

`collapsedInfoSections` stores panel-level progressive-disclosure preferences for static guide/context blocks.
Use `PanelInfoSection.tsx` for any non-interactive explanatory content that should be hideable to keep controls near the top of the panel.

`dismissedProgressPrompts` stores dismissible onboarding and progression callouts separately from panel info disclosure. Use it for milestone-style guidance that is derived from live game state but should be closable once the player understands the point.

`panelStates` stores restorable per-panel view context such as active tabs, current selections, and intra-panel modes. Use it for UI state that should come back when the player returns through breadcrumbs or entity-tag navigation, but should still remain outside persistent simulation state.

`navigationHistory` stores the UI-only back stack. Each history entry captures the previous panel, focus target, and the leaving panel's snapshot from `panelStates`, allowing a breadcrumb or Back action to restore the view the player actually left instead of only reopening a panel shell.

`focusTarget` is section-aware: panel navigation can land on a page, switch to the correct tab/section, and optionally expand a nested entity such as a specific fleet wing.
type FocusTarget = { entityType: EntityType; entityId: string };
```

**Rule:** never put UI-only transient state (active tab, open/closed panel, highlight state)
into `gameStore`. `gameStore` is for persistent game simulation state only.

`GameLayout.tsx` now owns a compact breadcrumb row and Back control driven entirely by `useUiStore`. Navigation initiated from sidebar buttons, mobile nav, and `NavTag` chips all feeds the same history stack.

## Tooltip System

All tooltips flow through a single engine: `<GameTooltip>` in `src/ui/components/GameTooltip.tsx`.

### Nesting

Tooltips track depth via `TooltipDepthContext = createContext(0)`. Each rendered popup wraps
its content in `<TooltipDepthContext.Provider value={depth + 1}>`. z-index formula:

```
zIndex = 9998 + depth × 4
```

This supports tooltips inside tooltips without z-index collisions.

### Behavior

- **Hover delay:** 80ms before show
- **Smart close:** debounce fires only when mouse has left both the trigger element AND the
  tooltip body — prevents flicker when moving from trigger into the popup
- **Pin:** click trigger → toggled pin state; ESC or second click → close
- **Portal:** always rendered via `createPortal(…, document.body)` to escape parent overflow clipping
- **`pointer-events: auto`:** always set so nested interactive content (NavTags, buttons) works

### Content

`GameTooltip` has **zero layout opinions** — `content` is `ReactNode`. The companion `TT.*`
export provides composable primitives for building layouts:

```tsx
// Example — fleet card tooltip
<GameTooltip width={280} content={
  <>
    <TT.Header accentColor="#22d3ee" title="Alpha Fleet" badge="BRAWL" />
    <TT.Grid items={[
      { label: 'Ships', value: '4' },
      { label: 'Readiness', value: '87%', accent: '#4ade80' },
    ]} />
    <TT.BadgeRow badges={[
      { text: 'T1', color: '#4ade80', bg: '#4ade8022' },
      { text: 'D2', color: '#f87171', bg: '#f8717122' },
    ]} />
    <TT.Divider />
    <TT.Footer>Click to view fleet details</TT.Footer>
  </>
}>
  <span>Alpha Fleet</span>
</GameTooltip>
```

  ## Dropdown System

  All rich dropdowns flow through a single engine: `<GameDropdown>` in `src/ui/components/GameDropdown.tsx`.

  ### Behavior

  - Portal-rendered via `createPortal(…, document.body)` so menus are not clipped by panel overflow
  - Reuses tooltip depth stacking by reading `TooltipDepthContext`, so dropdowns and tooltips layer cleanly together
  - Searchable option list with `useDeferredValue(search)` to keep filtering responsive
  - Auto-derived group filters from option content (`group` field) for contextual filtering without panel-specific logic
  - Mouse-first interaction model: open from the trigger, inspect options by hover, select by click, dismiss by outside click
  - Viewport-clamped positioning based on trigger geometry, with width anchored to trigger or an explicit menu width
  - Optional split detail pane for dense pickers such as fleet fittings and blueprint selection, so option scanning and option inspection stay in the same popup
  - Trigger height is normalized by size (`compact` vs `default`) so dropdown controls keep a consistent vertical rhythm across panels even when option metadata differs
  - Default option rows are compressed into a denser single-row-biased layout so more items remain visible in the menu at once while keeping tones, badges, and metadata styling

  ### Content Model

  `GameDropdown` is a behavioral shell like `GameTooltip`, but for selection workflows. Options are data objects rather than raw JSX:

  ```ts
  interface DropdownOption {
    value: string;
    label: string;
    description?: string;
    meta?: string;
    group?: string;
    tone?: 'cyan' | 'emerald' | 'amber' | 'violet' | 'rose' | 'slate';
    icon?: ReactNode;
    keywords?: string[];
    badges?: Array<{ label: string; color?: string }>;
    disabled?: boolean;
  }
  ```

  Panels can override `renderValue` and `renderOption`, but the default renderer already supports
  colored rows, metadata, badges, and group-aware filtering. Dense pickers can additionally provide
  `renderDetail` to render a right-hand or bottom-mounted inspection pane without rewriting the
  shell behavior.

## NavTag Routing

`<NavTag>` calls `useUiStore.getState().navigate(...)` on click. The routing table:

| `entityType` | Target panel | Focus behavior |
|---|---|---|
| `'fleet'` | `'fleet'` | Expand matching fleet card + scroll + 3s pulse |
| `'pilot'` | `'fleet'` | Switch to Pilots tab + highlight pilot row |
| `'ship'` | `'fleet'` | Switch to Ships tab + highlight ship row |
| `'skill'` | `'skills'` | Scroll to skill in tree |
| `'resource'` | `'mining'` | Scroll to relevant section |
| `'system'` | `'system'` | (already on system panel) |
| `'anomaly'` | `'system'` | Switch to Anomalies tab |

## State Model

State is managed via **Zustand** with a single `GameState` object. The store lives in
`src/stores/gameStore.ts`; initial values in `src/stores/initialState.ts`.

Actual top-level GameState shape (from `src/types/game.types.ts`):

```ts
interface GameState {
  version: number;
  lastUpdatedAt: number;
  corp: CorpState;
  pilot?: PilotState;    // legacy migration field only
  resources: Record<string, number>;
  systems: {
    skills: SkillsState;
    mining: MiningState;
    reprocessing: ReprocessingState;
    manufacturing: ManufacturingState;
    market: MarketState;
    fleet: FleetState;
    structures: StructuresState;
    factions: FactionsState;
  };
  unlocks: Record<string, boolean>;
  modifiers: Record<string, number>;
  settings: GameSettings;
  galaxy: GalaxyState;
}
```

Avoid deeply tangled state relationships when possible.

Fleet state now includes fleet commanders, wing commanders, hauling-wing cargo holds, and typed `wings` on each `PlayerFleet`. New-game defaults in `src/stores/initialState.ts` seed a starter fleet, starter ship, Corp HQ, and an initial populated mining wing so the opening state is immediately operational.

## Tick / Simulation Model

### Core Requirement

Idleverse is an idle game, so simulation must be deterministic and stable over time.

Use a central simulation tick.

### Recommended Tick Model

Use a **fixed logical tick** for simulation.

Example:

- simulation tick every 1 second for core economy
- UI can animate more frequently, but simulation should remain logically stable

Alternative:
- run smaller internal ticks if necessary for fine control, but expose a clean top-level tick pipeline

### Tick Flow

Recommended order:

```text
1. determine elapsed time
2. split into simulation steps if needed
3. process passive production
4. process consumption costs
5. process queues/timers
6. process unlock checks
7. process automation decisions
8. process mastery/experience gains
9. process event generation
10. update derived values/selectors
```

### Important Rules

- avoid UI-driven calculations
- avoid side effects hidden in selectors
- keep simulation math centralized
- prefer deterministic formulas over ad hoc mutation scattered throughout components

## System Contract Pattern

Each gameplay system should follow a similar contract.

Example conceptual interface:

```ts
interface GameSystem<TState> {
  id: string;
  initialize(): TState;
  tick(state: GameState, deltaSeconds: number): void;
  getUnlockStatus(state: GameState): boolean;
  getDerivedState?(state: GameState): unknown;
}
```

This does not need to be used literally everywhere, but the architecture should **feel consistent**.

Each system should support:

- initialization
- ticking/updating
- unlock evaluation
- calculation helpers
- selectors for UI consumption

## Resource Model

Resources should be generic and reusable.

Each resource should have metadata such as:

- id
- display name
- category
- rarity
- icon key
- precision / formatting rules

Example:

```ts
interface ResourceDefinition {
  id: string;
  name: string;
  category: string;
  precision?: number;
  isHidden?: boolean;
}
```

Prefer a registry-based model so resources can be referenced by ID.

## Production Model

Production should be formula-driven.

Typical production flow:

```text
base production
× multiplicative bonuses
+ additive bonuses
× global modifiers
− consumption costs
= net output
```

Formulas should be clear and inspectable.

Avoid burying important balance math deep inside UI code.

## Unlock Model

Unlocks should be explicit and data-driven.

Possible unlock conditions:

- resource thresholds
- previous system level
- completed research
- completed milestones
- prestige requirements
- expedition discoveries

Prefer unlock definitions like:

```ts
interface UnlockRequirement {
  type: "resource" | "research" | "systemLevel" | "milestone" | "prestige";
  target: string;
  value: number | string;
}
```

This makes content authoring much easier.

## Upgrades & Research

Upgrades and research should be represented as content definitions plus logic.

Each should generally include:

- id
- display name
- description
- cost
- prerequisites
- effect payload
- repeatable or not
- category/system ownership

Avoid hard-coding unique upgrade logic into random components unless absolutely necessary.

## Mastery Model

Each major system should have long-term mastery progression.

Suggested mastery data:

```ts
interface SystemMasteryState {
  level: number;
  xp: number;
  milestonesClaimed: string[];
  specializationPath?: string;
}
```

Mastery should grant:

- efficiency boosts
- unlocks
- quality-of-life automation
- system specialization

## Automation Model

Automation must be progression-based.

Early game should have limited or no automation.
Later game should unlock automation slots and rules.

Potential automation structures:

```ts
interface AutomationRule {
  id: string;
  systemId: string;
  enabled: boolean;
  condition?: string;
  action: string;
  priority?: number;
}
```

Examples of automations:

- auto-start mining task
- auto-buy upgrade when affordable
- auto-switch resource focus
- auto-assign clones
- auto-run expedition category

Automation should never feel like an afterthought. It is a major progression layer.

## Prestige Model

Prestige should reset selected portions of state while preserving others.

Define clearly what is reset:

- temporary resources
- system progress
- selected unlocks

Define what is preserved:

- prestige currency
- permanent doctrines
- codex entries
- special discoveries
- account-wide bonuses

Prestige should be implemented through explicit reset rules, not one-off mutations.

## Offline Progress Calculation

Offline progress is critical for an idle game.

### Requirements

- saves must store a timestamp
- resume flow should compute elapsed time
- offline gains should be bounded if needed
- automation and queue completion rules should still make sense offline

### Preferred Approach

Use the same simulation logic as live play whenever practical.

Do not write a completely separate economy model for offline progress unless necessary.

Possible approach:

```text
1. load save
2. compute elapsed seconds
3. cap elapsed time if desired
4. process simulation in chunks
5. apply resulting state
6. generate offline summary
```

### Offline Summary

Player should see:

- resources gained
- completed tasks
- completed research
- unlocked systems
- automation actions taken

## Save / Load Model

Persistence should be versioned from the beginning.

### Save Requirements

- version number
- timestamp
- serialized game state
- future migration support

Example:

```ts
interface SaveFile {
  version: number;
  savedAt: number;
  state: GameState;
}
```

### Save Design Rules

- always support migration paths
- validate loaded data
- fail gracefully on corrupted saves
- prefer explicit defaults over assuming fields exist

### Persistence Targets

Initial MVP:

- LocalStorage or IndexedDB

Future:

- cloud save
- account sync
- server-side profiles

## Balancing Philosophy

Idleverse should feel generous but not trivial.

Balance goals:

- early progression is satisfying and quick
- midgame introduces bottlenecks and choices
- long-term progression becomes about optimization, synergy, and specialization
- there is always a meaningful next milestone

AI should prefer formulas and systems that can be tuned easily from config.

## UI Architecture Guidance

The UI should be built as a modern polished app, but remain separated from simulation.

### Prefer

- reusable panels
- clean page layout
- presentational components fed by selectors
- motion effects isolated from game logic
- clear visual hierarchy

### Avoid

- resource calculations inside React components
- large monolithic page files
- tightly coupling animations with business logic

## Animation Guidelines

Animations should reinforce state.

Examples:

- active production glows softly
- new unlocks animate in
- bottlenecks pulse subtly
- notifications slide and fade cleanly
- major milestones receive stronger animated emphasis

Use Framer Motion for panel transitions and microinteractions where it improves clarity.

## Naming Conventions

AI should use consistent names.

Prefer:

- `MiningSystem`
- `calculateMiningOutput`
- `getMiningDerivedState`
- `miningConfig`
- `researchDefinitions`

Avoid vague names like:

- `doStuff`
- `handleEverything`
- `tempData`
- `miscLogic`

## Code Generation Rules for AI

When generating code for Idleverse, AI should:

1. keep logic modular
2. prefer config-driven content
3. separate simulation from rendering
4. create reusable patterns for future systems
5. include types/interfaces
6. avoid unnecessary abstraction layers
7. keep functions small and understandable
8. make offline and save compatibility easier, not harder

## MVP Architecture Recommendation

The first playable slice should include:

- one global game store
- one tick loop
- one save/load path
- one offline progress path
- 3 to 4 core systems only

Recommended first systems:

- Asteroid Mining
- Energy Grid
- Research Lab
- one prestige/timeline mechanic

This is enough to prove:

- simulation stability
- progression feel
- UI identity
- extensibility

## Final Instruction to AI

When helping with Idleverse, always optimize for:

- long-term extensibility
- clean architecture
- deterministic simulation
- excellent UX
- strong sci-fi identity
- layered progression depth

Do not generate throwaway architecture unless explicitly asked for a prototype.
