
# Idleverse – Core System Blueprints

## Purpose

This document defines the **first core gameplay systems of Idleverse** in enough detail that AI tools or developers can implement the MVP of the game consistently.

These blueprints are **not final content numbers** but structural definitions for how each system should behave and interact with the economy.

The goal is to create a **deep but modular idle simulation architecture**.

---

# System 1 – Asteroid Mining

## Role

Asteroid Mining is the **primary starting system** and the foundation of the resource economy.

It produces the earliest materials used across most other systems.

## Core Resources

Primary outputs:

- Raw Ore
- Metallic Dust
- Carbon Materials
- Ice Deposits

## Core Mechanics

Players choose mining targets:

- asteroid clusters
- ice bodies
- metallic asteroids

Each target has:

- yield rate
- depletion rate
- rarity modifier

## Upgrade Categories

Efficiency upgrades
→ increase mining speed

Extraction upgrades
→ increase resource yield

Drone upgrades
→ allow automated mining

Deep mining upgrades
→ unlock rare resources

## Dependencies

Mining depends on:

- Energy Grid (power)
- Research (efficiency improvements)

---

# System 2 – Energy Grid

## Role

Energy is required for most advanced operations.

The Energy Grid acts as a **global resource limiter**.

## Core Resources

- Energy Units

## Energy Sources

Examples:

- Solar Arrays
- Fusion Reactors
- Stellar Harvesters
- Dark Matter Reactors

## Mechanics

Systems consume energy to operate.

Example:

Mining operation = 5 energy/sec

If power supply is insufficient:

- production slows
- automation pauses
- systems enter low power mode

## Upgrade Paths

- energy efficiency
- reactor output
- grid stability
- storage capacity

---

# System 3 – Research Laboratory

## Role

Research unlocks new systems, upgrades, and technologies.

It is the **primary long-term progression driver**.

## Research Types

Industrial Research
→ production improvements

Energy Research
→ new power generation

AI Research
→ automation unlocks

Exploration Research
→ expedition upgrades

## Mechanics

Research consumes:

- time
- energy
- scientific resources

Research nodes form a **branching tree**.

Completing nodes unlocks:

- new systems
- upgrades
- automation tiers

---

# System 4 – Manufacturing Complex

## Role

Manufacturing converts raw resources into advanced components.

## Input Resources

Examples:

- Refined Metals
- Carbon Materials
- Energy

## Output Resources

Examples:

- Structural Alloys
- Machine Parts
- Drone Components
- Quantum Circuits

## Mechanics

Manufacturing uses **production queues**.

Players choose recipes to produce specific components.

Automation upgrades allow queues to self-maintain.

---

# System 5 – Logistics Network

## Role

The logistics system manages **transport and distribution** of resources between systems and colonies.

## Mechanics

Resources may require transportation between:

- asteroid fields
- manufacturing hubs
- colonies

Throughput is limited by logistics capacity.

Example upgrades:

- cargo drones
- transport ships
- quantum relay systems

---

# System 6 – Terraforming Operations

## Role

Terraforming allows planets to become habitable colonies.

## Terraforming Stages

Stage 1 – Atmospheric Stabilization  
Stage 2 – Water Cycle Formation  
Stage 3 – Biosphere Seeding  
Stage 4 – Colony Preparation

Each stage requires:

- energy
- advanced materials
- time

Once complete, a planet becomes a **colony system**.

---

# System 7 – Colony Administration

## Role

Colonies provide large-scale production and strategic bonuses.

## Colony Specializations

Mining Colony
→ boosts raw material production

Industrial Colony
→ boosts manufacturing output

Research Colony
→ boosts scientific progress

Energy Colony
→ boosts power generation

Trade Colony
→ boosts logistics throughput

## Mechanics

Each colony:

- consumes resources
- produces specialized output
- unlocks colony upgrades

Colony size may scale through:

- population
- infrastructure
- technological level

---

# System 8 – Expedition Command

## Role

Expeditions explore unknown sectors of space.

They provide rare resources, discoveries, and anomalies.

## Expedition Targets

Examples:

- derelict stations
- alien ruins
- asteroid anomalies
- black hole boundaries
- deep space voids

## Mechanics

Expeditions require:

- ships
- crew or drones
- fuel
- time

Risk vs reward should be balanced.

---

# System 9 – Anomaly Research

## Role

Anomalies represent mysterious cosmic events.

Studying them may unlock powerful benefits.

## Examples

- temporal distortions
- alien technology remnants
- gravitational anomalies
- abandoned AI networks

## Rewards

Possible rewards:

- permanent bonuses
- rare resources
- research unlocks
- unique upgrades

---

# System 10 – Timeline Prestige

## Role

Prestige allows players to reset progress in exchange for permanent bonuses.

This system represents **major cosmic resets**.

## Reset Concept

Example reset names:

- Timeline Collapse
- Epoch Reset
- Singularity Reboot

## Preserved Progress

Prestige may retain:

- permanent research bonuses
- discovery records
- rare relics
- prestige currency

## Reset Progress

Reset may remove:

- temporary resources
- colony infrastructure
- production systems

Prestige bonuses should improve:

- production efficiency
- automation speed
- system unlock speed

---

# System Interaction Map

Example system dependency graph:

Mining
→ feeds Manufacturing

Energy
→ powers all systems

Research
→ unlocks upgrades

Manufacturing
→ produces infrastructure

Logistics
→ distributes resources

Terraforming
→ enables Colonies

Colonies
→ produce large-scale bonuses

Expeditions
→ discover anomalies

Anomalies
→ unlock rare technologies

Prestige
→ improves future runs

---

# MVP Implementation Order

Recommended order for development:

1. Asteroid Mining
2. Energy Grid
3. Research Laboratory
4. Manufacturing
5. Basic Prestige System

After MVP stability:

6. Logistics
7. Terraforming
8. Colonies
9. Expeditions
10. Anomaly Research

---

# Final Guideline

Idleverse systems should always:

- integrate with the broader economy
- scale over long progression
- support automation later in the game
- remain modular for future expansion
