# Idleverse – AI Global Context & Development Instructions

## Project Overview

**Idleverse** is a browser-based idle strategy game inspired by Eve Online. Players run a **player-owned corporation (corp)** — hiring pilots, deploying ship fleets, and building an automated industrial empire across a procedurally generated 400-system galaxy.

The player is a **CEO director** with no personal location. All resource production flows through fleets: mining ships accumulate ore in fleet cargo holds, haul it to Corp HQ, and feed the manufacturing chain.

The design philosophy prioritizes:

- Deep interconnected gameplay systems
- Long-term progression layers
- Clean, modern UI/UX
- Strong sci-fi aesthetic
- Strategic decision making rather than pure idle clicking

## Core Design Philosophy

When generating ideas, code, or systems for Idleverse, follow these principles.

### 1. Long-Term Progression

The game must support **very long-term play**.

Systems should include:

- short-term rewards (seconds to minutes)
- session goals (minutes to hours)
- mid-term projects (days)
- long-term achievements (weeks/months)
- permanent meta-progression

Avoid mechanics that reach a **quick end state**.

### 2. Interconnected Systems

No system should exist in isolation.

Example relationships:

| System | Supports |
|---|---|
| Asteroid Mining | Produces raw materials |
| Refining | Converts ore into advanced materials |
| Energy Grid | Powers advanced systems |
| Research | Unlocks upgrades and new systems |
| Manufacturing | Creates infrastructure |
| Terraforming | Enables colonies |
| Colonies | Generate population, science, and influence |

All systems should reinforce each other.

### 3. Earned Automation

Automation should be **earned through progression**, not available immediately.

Examples:

- drones
- AI overseers
- clone workers
- logistics automation
- smart factories

Early gameplay should involve **prioritization decisions**, while later gameplay evolves into **automation management**.

### 4. Gradual Complexity

The game should reveal complexity **progressively**.

Early gameplay must remain simple.

As players progress, new layers unlock:

- additional resources
- new systems
- automation tools
- specialization options

Avoid overwhelming the player with many systems at once.

### 5. Meaningful Strategic Choices

Players should make decisions that affect their empire's direction.

Examples:

- technology doctrine paths
- colony specialization
- research priorities
- resource focus
- expedition risks

Avoid systems where **all players eventually converge to identical builds**.

## Game Theme & Narrative

Idleverse takes place in a **clean, futuristic sci-fi universe**.

The player is an **overseer managing the expansion of a technological civilization**.

Tone:

- advanced technology
- galactic scale
- exploration and discovery
- automation and artificial intelligence
- mysterious cosmic phenomena

The world should feel **vast, mysterious, and technologically advanced**.

## Visual Design Guidelines

The UI should resemble a **futuristic command interface** rather than a typical web dashboard.

### Visual Style

Primary characteristics:

- dark sci-fi theme
- glowing accents
- minimalistic layout
- high readability
- subtle motion

Color palette guidance:

| Role | Color Style |
|---|---|
| Background | deep charcoal / near black |
| Primary accent | cyan / electric blue |
| Secondary accent | violet / teal |
| Success | cool green |
| Warning | amber |
| Danger | red/orange glow |

### Motion & Animation

Animations should communicate **system state and progress**, not be decorative.

Examples:

- progress bars pulse while active
- resource generation emits subtle particles
- unlocks appear with glow effects
- transitions slide smoothly between panels

Avoid excessive animation that causes visual noise.

## Core Gameplay Systems

These are the **implemented** gameplay systems of Idleverse.

AI should prefer expanding or supporting these systems rather than inventing unrelated mechanics.
For detailed specs see `Idleverse_SYSTEM_BLUEPRINTS.md`. For the upcoming pipeline see `Idleverse_DESIGN_PLAN.md`.

### Implemented Systems

- Asteroid Mining (9 ore belts, 3 security tiers, pool depletion)
- Ore Reprocessing (mineral yield, skill-scaled, auto-queue)
- Manufacturing (12 T1 + 6 T2 recipes — components + ships, skill-gated, BPC system)
- Skills (34+ corp-wide skills; pilots each have individual skill queues)
- NPC Market (ISK income via sell orders, dynamic per-system pricing, auto-sell, trade routes)
- Galaxy & Navigation (400 procedurally generated systems, BFS/Dijkstra routing)
- Fleet Management (ships, pilots, named fleets, doctrines, fleet commanders, wing commanders, fleet cargo and wing cargo holds)
- Fleet Cargo & Auto-Haul (non-wing fleets use `fleet.cargoHold`; fleets with one or more hauling wings distribute cargo across available `wing.cargoHold`s and auto-dispatch ready hauling wings independently)
- Fleet Combat (NPC pirate groups, patrol/raid orders, hull damage, loot, bounty)
- Corp Identity (state.corp: name + foundedAt; OverviewPanel = corp command center with HQ card)
- Factions (rep tracking, docking, Corp HQ registration)
- Pilots (individual crew with skills, morale, training focus, skill queue)
- Blueprint Research & T2 Manufacturing (research levels 0–10, BPC copies, T2 recipes)
- Exploration & Anomaly Scanning (scan progress, 5 anomaly types, discovery feed)

### Planned Systems (see Design Plan)

- Phase 5: Factions, Stations & Mission Boards
- Phase 6: Structures & Player Outposts
- Phase 7: Prestige / New Game+

## Resource Philosophy

Resources evolve through **multiple production tiers**, each adding value.

Actual current chain:

```text
Asteroid Belts
  → Raw Ore (Tier 1: Ferrock, Corite, Darkstone, Arkonite…)
    → Reprocessing
      → Minerals (Tier 2: Ferrite, Silite, Vexirite, Voidsteel…)
        → Manufacturing
          → Components (Tier 3: Hull Plate, Thruster Node…)
            → Manufacturing
              → Ships (Tier 4: Frigate, Hauler, Destroyer…)
                → NPC Market
                  → ISK (Currency)
```

Higher tier systems depend on lower-tier infrastructure. The full resource catalog lives in `Idleverse_RESOURCE_REGISTRY.md`.

## Exploration & Discovery

Idleverse should contain systems that produce **unexpected discoveries**.

Examples:

- alien artifacts
- derelict stations
- ancient technology
- spatial anomalies
- unknown materials

These discoveries should occasionally grant:

- unique upgrades
- permanent bonuses
- rare currencies
- new research branches

## Mastery Systems

Each major system may include:

- XP progression
- levels
- mastery perks
- milestones
- specialization branches

Mastery progression should be **very long-term**.

## Prestige / Reset Mechanics

Idleverse will include reset mechanics but they should be **integrated into the lore**.

Example concepts:

- Timeline Collapse
- Epoch Shift
- Singularity Reboot
- Cosmic Realignment

Resets should unlock **permanent progression benefits**.

## User Interface Structure

Recommended UI layout:

```text
Top Bar
- resources
- alerts
- notifications

Left Sidebar
- system navigation

Center Panel
- active system interface

Right Panel
- tasks
- objectives
- automation rules
```

Core pages may include:

- Dashboard
- Mining
- Energy
- Research
- Manufacturing
- Terraforming
- Colonies
- Logistics
- Expeditions
- Codex
- Timeline / Prestige

## AI Development Guidelines

When assisting development of Idleverse, AI should:

### Prioritize

- maintainable architecture
- modular systems
- scalability
- readability
- clear separation of game systems

### Avoid

- tightly coupled systems
- overly complex UI code
- hard-coded progression rules
- duplicated logic

## Technology Stack (Preferred)

Frontend:

- React
- TypeScript
- TailwindCSS
- Framer Motion

State management:

- Zustand or Redux Toolkit

Persistence (initial):

- LocalStorage / IndexedDB

Future expansion:

- cloud save
- multiplayer or shared systems

## Code Style Guidelines

AI should produce code that:

- uses clear naming
- avoids unnecessary abstractions
- favors readability over cleverness
- maintains modular structure

Game logic should be separated into:

```text
systems/
resources/
progression/
ui/
animations/
services/
```

## AI Output Expectations

When generating content for Idleverse:

1. Maintain the sci-fi theme.
2. Preserve long-term progression depth.
3. Ensure systems integrate with existing mechanics.
4. Prefer modular, extensible designs.
5. Keep UI modern and visually appealing.

## Project Goal

Idleverse should become a **deep, long-running idle strategy game** that players can enjoy progressing through for **months or years**, supported by a polished futuristic interface and layered gameplay systems.
