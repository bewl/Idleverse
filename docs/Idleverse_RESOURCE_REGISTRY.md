
# Idleverse – Resource Registry

## Purpose

This document defines the **resource catalog** for Idleverse as it is **currently implemented**.

It is the reference for:

- what resources exist in the game
- how they are obtained
- how they feed into other systems
- which tier they belong to

The actual source of truth for resource IDs, names, and categories is `src/game/resources/resourceRegistry.ts`.

---

# Tier Model

Idleverse resources follow a five-tier production chain.

| Tier | Category | Examples | Produced By |
|---|---|---|---|
| Tier 1 | Raw Ore | Ferrock, Corite, Arkonite | Asteroid belt mining |
| Tier 2 | Minerals | Ferrite, Silite, Voidsteel | Reprocessing ore |
| Tier 3 | Components | Hull Plate, Thruster Node | Manufacturing minerals |
| Tier 4 | Ships | Frigate, Hauler, Destroyer | Manufacturing components |
| T0 | Currency | ISK (credits) | NPC market sales |

---

# Currency

### ISK (`credits`)
The universal unit of exchange. Earned by selling resources or ships to the NPC market.
Used for: market purchases, pilot payroll, future trade route operations.

---

# Tier 1 – Raw Ores

Ores are extracted from asteroid belts. Yield rates and belt availability depend on system security tier.

## Highsec Ores (available from the start)

| Resource ID | Name | Belt |
|---|---|---|
| `ferrock` | Ferrock | Highsec |
| `corite` | Corite | Highsec |
| `silisite` | Silisite | Highsec |
| `platonite` | Platonite | Highsec |

*Require: no skill gating — available by default.*

## Lowsec Ores (Advanced Mining I required)

| Resource ID | Name | Belt |
|---|---|---|
| `darkstone` | Darkstone | Lowsec |
| `hematite` | Hematite | Lowsec |
| `voidite` | Voidite | Lowsec |

*Require: Advanced Mining L1 unlock.*

## Nullsec Ores (Advanced Mining III required)

| Resource ID | Name | Belt |
|---|---|---|
| `arkonite` | Arkonite | Nullsec |
| `crokitite` | Crokitite | Nullsec |

*Require: Advanced Mining L3 unlock. Highest yield, most dangerous space.*

---

# Tier 2 – Minerals

Minerals are produced by reprocessing raw ores. They are the building block of all manufactured goods.

| Resource ID | Name | Notes |
|---|---|---|
| `ferrite` | Ferrite | Common base mineral from highsec ores |
| `silite` | Silite | Common base mineral from highsec ores |
| `vexirite` | Vexirite | Mid-tier mineral from diversified ore mix |
| `isorium` | Isorium | Mid-tier mineral from lowsec ores |
| `noxium` | Noxium | Mid-tier mineral from lowsec ores |
| `zyridium` | Zyridium | Rare mineral, primarily from lowsec/nullsec ores |
| `megacite` | Megacite | Rare mineral from nullsec ores |
| `voidsteel` | Voidsteel | Premium mineral, nullsec exclusive; used in T2 manufacturing |

---

# Tier 3 – Manufactured Components

Components are crafted in the Manufacturing queue from minerals. They are consumed by ship and module recipes.

| Resource ID | Name | Notes |
|---|---|---|
| `hull-plate` | Hull Plate | Ship construction + instant hull repair (1× per repair) |
| `thruster-node` | Thruster Node | Ship construction; propulsion systems |
| `condenser-coil` | Condenser Coil | Ship construction; energy management |
| `sensor-cluster` | Sensor Cluster | Ship construction; requires Electronics II |
| `mining-laser` | Mining Laser | Ship construction; dedicated mining component |
| `shield-emitter` | Shield Emitter | Ship construction; requires Electronics I |

---

# Tier 4 – Ships

Ships are the end products of manufacturing. Each manufactured ship spawns a `ShipInstance` in the fleet system.

| Resource ID | Name | Hull Class | Required Pilot Skill |
|---|---|---|---|
| `ship-shuttle` | Shuttle | `shuttle` | None |
| `ship-frigate` | Frigate | `frigate` | Spaceship Command I |
| `ship-mining-frigate` | Mining Frigate | `mining-frigate` | Mining Frigate I |
| `ship-hauler` | Hauler | `hauler` | Industrial I |
| `ship-destroyer` | Destroyer | `destroyer` | Destroyer I |
| `ship-exhumer` | Exhumer | `exhumer` | Mining Barge III |

Ships are not stacked in inventory. Each manufactured ship creates one unique `ShipInstance`.

---

# Resource Economic Chains

## Full Production Chain

```
Asteroid Belts
  └─ Raw Ore (Tier 1)
       └─ Reprocessing
            └─ Minerals (Tier 2)
                 └─ Manufacturing
                      └─ Components (Tier 3)
                           └─ Manufacturing
                                └─ Ships (Tier 4)
```

## Hull Repair Loop

```
Minerals → Hull Plate (T3)
  ├─ Used for manufacturing ships
  └─ Spent to instantly repair a damaged ship (1× hull-plate per use)
     OR: Ship idles → passive repair at ~1.5% hull integrity per minute
```

## ISK Flow

```
Minerals / Components / Ships → NPC Market → ISK
  └─ Used for: pilot payroll, future trade route purchases, structure costs
```

---

# Planned Future Resources (Phase 3+)

Designed but not yet implemented:

| Resource | Source | Phase |
|---|---|---|
| `morphite` | Nullsec belt (T2 ore) | Phase 3 – T2 manufacturing |
| `zydrine` | Nullsec anomaly | Phase 3 – T2 manufacturing |
| Mechanical Engineering Core | Lowsec NPC loot | Phase 3 – Blueprint research |
| Electronic Systems Core | Nullsec NPC loot | Phase 3 – Blueprint research |
| Starship Engineering Core | Faction raid loot | Phase 3 – Blueprint research |

---

# Design Guidelines

When adding new resources to Idleverse:

### Do

- assign a unique lowercase hyphenated `id` matching resource registry convention
- place it in a clear tier with a clear production source
- ensure it feeds at least one downstream recipe or system
- use EVE-inspired technological naming (e.g. `voidsteel`, `zyridium`)
- register it in `src/game/resources/resourceRegistry.ts`

### Avoid

- fantasy-sounding names
- resources with no upstream source or downstream consumer
- duplicate IDs that collide with existing skills or system IDs
- documenting resources here without also adding them to `resourceRegistry.ts`
