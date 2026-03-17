# Idleverse – AI Gameplay Content & Design Conventions

## Purpose

This document defines **gameplay content standards and terminology** for Idleverse.

While the other AI documents cover:

- global design philosophy
- technical architecture
- simulation model

This file defines **how gameplay content should be created** so that:

- systems feel consistent
- terminology remains unified
- AI-generated content aligns with the universe
- progression remains balanced

This document should be referenced whenever generating:

- new systems
- resources
- upgrades
- research
- anomalies
- factions
- events
- prestige systems

---

# Universe Identity

Idleverse is a **hard sci‑fi idle strategy game**.

Tone of the universe:

- advanced technology
- cosmic scale
- mysterious phenomena
- automation and artificial intelligence
- exploration of unknown space

The universe should feel:

- ancient
- vast
- technological
- mysterious

Avoid:

- fantasy themes
- magic terminology
- comedic tone
- cartoon style systems

Everything should feel like it belongs in a **high‑technology galactic civilization**.

---

# Naming Conventions

## Systems

Systems represent major gameplay pillars.

System names should be **clear and technological**.

Actual implemented systems:

- Asteroid Mining
- Ore Reprocessing
- Manufacturing
- Skills
- Market
- Fleet Management
- Fleet Combat
- Galaxy Navigation
- Factions
- Pilots

Planned systems (see Design Plan):

- Dynamic Economy & Trade Routes
- Blueprint Research
- Exploration & Anomaly Scanning
- Stations & Mission Boards

Avoid vague names like:

- Stuff Factory
- Resource Builder
- Idle Generator

## UI Progress Labels

Animated progress labels should use a consistent vocabulary across the UI.

- Use `Progress` for completion bars that show percent-done work.
- Use `Load` for aggregate panel or system bars that summarize operational intensity.
- Use `Status` for single-entity bars that summarize the current live posture of one thing.
- Use `Rate` for bars whose companion value is throughput or speed rather than completion.

Avoid mixing near-synonyms like `tempo`, `pressure`, `activity`, and `throughput` unless they are the exact gameplay term the player already sees elsewhere.

## UI Iconography

- Player-facing UI should use themed SVG icon primitives instead of emoji glyphs.
- Prefer semantic icon tokens like `mining`, `market`, `manufacturing`, `fleet`, `reprocessing`, `scan`, `cargo`, and `shield` over raw symbol literals in panel code.
- Icon treatment should stay within the operational-console style: flat sci-fi linework, restrained glow, restrained hover motion, and subtle particle drift only.
- Use per-icon palette variation to separate systems visually. Multi-color icons are preferred when the secondary color communicates a real subsystem, signal, warning, or focal accent.
- When an icon belongs to a clickable row, card, tab, or button, the icon response should trigger from hovering the full interactive item, not just the icon hitbox.
- When an icon appears in more than one screen, centralize it in a shared component rather than duplicating one-off symbols.

---

## Resources

Resources follow the **actual tiered production chain** defined in `Idleverse_RESOURCE_REGISTRY.md`.

### Tier 1 – Raw Ores

Examples:

- Ferrock, Corite, Silisite, Platonite (highsec)
- Darkstone, Hematite, Voidite (lowsec)
- Arkonite, Crokitite (nullsec)

### Tier 2 – Minerals

Examples:

- Ferrite, Silite, Vexirite (common)
- Isorium, Noxium, Zyridium (mid-tier)
- Megacite, Voidsteel (rare/nullsec)

### Tier 3 – Manufactured Components

Examples:

- Hull Plate, Thruster Node, Condenser Coil
- Sensor Cluster, Mining Laser, Shield Emitter

### Tier 4 – Ships

Examples:

- Shuttle, Frigate, Mining Frigate
- Hauler, Destroyer, Exhumer

### Future Tiers (Phase 3+)

Examples:

- Morphite, Zydrine (T2 ore/mineral)
- Datacores (blueprint research inputs)

---

# Upgrade Design

Upgrades improve systems, production, or automation.

Every upgrade should include:

- name
- description
- cost
- effect
- prerequisites
- owning system

### Upgrade Categories

#### Efficiency Upgrades

Improve output.

Example:

Mining Laser Optimization  
→ Mining output +15%

#### Capacity Upgrades

Increase limits.

Example:

Expanded Cargo Bays  
→ Storage capacity +25%

#### Automation Upgrades

Enable autonomous behavior.

Example:

Drone Coordination AI  
→ Mining drones automatically select best asteroid clusters

#### Technology Upgrades

Unlock entirely new mechanics.

Example:

Quantum Smelting  
→ Enables production of Quantum Components

---

# Research Design

Blueprint Research (Phase 3) represents scientific progress.

Research converts **datacores** (dropped from NPC loot) + time + Science skill levels into
Tier 2 blueprint originals (BPOs). T2 ships and modules are 40-60% stronger per stat.

Research paths align with production:

### Industrial Research (Science skill)

Focus on manufacturing upgrades and T2 blueprints.

Examples:
- Hull Plate T2 blueprint research
- Mining Frigate T2 BPO

### Electronics Research (Electronics skill)

Focus on advanced modules.

Examples:
- Sensor Cluster T2
- Shield Emitter T2

### Exploration Research (planned Phase 4)

Unlocks anomaly scanning and wormhole traversal.

Examples:
- Astrometrics training
- Archaeology + Hacking skills

---

# Exploration & Anomaly Design (Phase 4)

Anomalies are hidden phenomena in non-highsec systems revealed by scanning fleets.

| Type | Reward |
|---|---|
| `ore-pocket` | Bonus mining yield stream for 2–6 hours |
| `data-site` | Datacores, skillbooks, schematics |
| `relic-site` | Exotic minerals, salvage components |
| `combat-site` | Hidden pirate base (enhanced loot) |
| `wormhole` | Temporary jump edge on galaxy map (12–48h) |

Anomalies should create **unexpected gameplay opportunities** while rewarding active engagement.

---

# Prestige Terminology

Prestige mechanics should always feel like **major cosmic events**.

Example names:

- Timeline Collapse
- Epoch Reset
- Singularity Reboot
- Cosmic Realignment
- Dimensional Shift

Prestige rewards may include:

- permanent research bonuses
- faster automation
- improved colony limits
- new research paths

---

# Progression Principles

Idleverse progression must always maintain **forward momentum**.

Players should constantly feel:

- growth
- discovery
- improvement

Every new system should:

1. introduce new mechanics
2. support existing systems
3. create new strategic decisions

---

# Rare Discoveries

Rare events create excitement.

Examples:

- precursor technology
- alien archives
- lost megastructures
- ancient AI cores
- unstable cosmic relics

Rare discoveries may unlock:

- unique upgrades
- permanent bonuses
- entirely new gameplay systems

---

# Content Creation Rules for AI

When generating new content for Idleverse:

### Always

- maintain the sci‑fi tone
- ensure systems connect to existing mechanics
- create scalable progression
- use clear technology‑focused names

### Avoid

- fantasy language
- one‑off gimmick mechanics
- short‑term progression systems
- isolated mechanics with no dependencies

---

# Final Guideline

Idleverse should feel like a **living, expanding technological civilization**.

All new content should reinforce that vision.
