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

## Recommended Folder Structure

```text
src/
  app/
  game/
    core/
    resources/
    systems/
    progression/
    automation/
    prestige/
    offline/
    persistence/
    balance/
    content/
  ui/
    components/
    pages/
    layouts/
    panels/
    effects/
  hooks/
  stores/
  utils/
  types/
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

## State Model

Use a centralized state model, but keep logic modular.

Preferred options:

- Zustand for a lighter implementation
- Redux Toolkit if stricter organization is needed

### State Design Guidance

Global state should contain:

- resources
- unlocked systems
- per-system state
- global modifiers
- automation settings
- prestige state
- mastery state
- settings/preferences
- timestamps for save/offline logic

Example high-level shape:

```ts
interface GameState {
  version: number;
  lastUpdatedAt: number;
  resources: Record<string, number>;
  systems: Record<string, unknown>;
  unlocks: Record<string, boolean>;
  modifiers: Record<string, number>;
  mastery: Record<string, SystemMasteryState>;
  prestige: PrestigeState;
  automation: AutomationState;
  settings: GameSettings;
}
```

Avoid deeply tangled state relationships when possible.

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
