
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
| Tier 2 | Minerals | Ferrite, Silite, Morphite | Reprocessing ore |
| Tier 3 | Components / Modules / Datacores | Hull Plate, Tracking Computer I, Datacores | Manufacturing or NPC loot |
| Tier 4 | Ships | Frigate, Hauler, Destroyer | Manufacturing components |
| Tier 5 | T2 Components / T2 Ships / Strategic Infrastructure | Advanced Hull Plate, Assault Frigate, POS Core | T2 manufacturing |
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
| `ionite` | Ionite | Lowsec |

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
| `fluxite` | Fluxite | Conductive midgame mineral from Ionite; used in cruiser electronics and reactors |
| `zyridium` | Zyridium | Rare mineral, primarily from lowsec/nullsec ores |
| `megacite` | Megacite | Rare mineral from nullsec ores |
| `voidsteel` | Voidsteel | Premium mineral, nullsec exclusive; used in T1 advanced recipes |
| `morphite` | Morphite | Advanced nullsec mineral; required for T2 manufacturing |
| `zydrine` | Zydrine | Advanced nullsec mineral; required for T2 manufacturing |

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
| `armor-honeycomb` | Armor Honeycomb | Cruiser armor bands and defensive module subframes |
| `reactor-lattice` | Reactor Lattice | Cruiser power routing and high-draw combat modules |
| `targeting-bus` | Targeting Bus | Fire-control and targeting computer signal backbone |

---

# Tier 3 – Manufactured Modules

Modules are built through Manufacturing, stored in the normal resource inventory, and consumed when fitted to a ship. Removing a module or recalling a fitted ship returns the module item back to inventory.

| Resource ID | Name | Slot | Notes |
|---|---|---|---|
| `mining-laser-i` | Mining Laser I | High | Entry mining fitting |
| `mining-laser-ii` | Mining Laser II | High | Higher-yield mining fitting |
| `salvager-i` | Salvager I | High | Utility salvage fitting |
| `missile-launcher-i` | Missile Launcher I | High | Baseline combat weapon fitting |
| `shield-extender-i` | Shield Extender I | Mid | Defensive buffer fitting |
| `warp-scrambler-i` | Warp Scrambler I | Mid | Interdiction fitting |
| `survey-scanner-i` | Survey Scanner I | Mid | Belt intel fitting |
| `cargo-scanner-i` | Cargo Scanner I | Mid | Cargo inspection fitting |
| `scan-pinpointing-i` | Scan Pinpointing Array I | Mid | Exploration scan-strength fitting |
| `warp-tuner-i` | Warp Tuner I | Mid | Transit-speed fitting |
| `tracking-computer-i` | Tracking Computer I | Mid | Cruiser-era combat targeting fitting |
| `tracking-computer-ii` | Tracking Computer II | Mid | Higher-grade cruiser combat targeting fitting |
| `cargo-expander-i` | Cargo Expander I | Low | Basic logistics fitting |
| `cargo-expander-ii` | Cargo Expander II | Low | Improved logistics fitting |
| `mining-upgrade-i` | Mining Upgrade I | Low | Passive mining yield fitting |
| `hull-reinforcement-i` | Hull Reinforcement I | Low | Passive hull survivability fitting |

---

# Tier 3 – Datacores

Datacores are rare loot resources obtained from NPC combat. They are consumed by the blueprint research queue to level up BPOs.

| Resource ID | Name | Source | Used For |
|---|---|---|---|
| `datacore-mechanical` | Mechanical Engineering Core | Lowsec pirate loot | Research industrial/component blueprints |
| `datacore-electronic` | Electronic Systems Core | Nullsec pirate loot | Research sensor/electronics blueprints |
| `datacore-starship` | Starship Engineering Core | Faction raid loot | Research advanced hull/ship blueprints |

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
| `ship-cruiser` | Cruiser | `cruiser` | Cruiser I |
| `ship-exhumer` | Exhumer | `exhumer` | Mining Barge III |

Ships are not stacked in inventory. Each manufactured ship creates one unique `ShipInstance`.

---

# Tier 5 – T2 Components

Advanced manufactured components crafted from morphite, zydrine, and T1 components. Required for T2 ship manufacturing and consumed by T2 BPCs.

| Resource ID | Name | Notes |
|---|---|---|
| `advanced-hull-plate` | Advanced Hull Plate | T2 ship construction; requires morphite + hull-plate |
| `advanced-thruster-node` | Advanced Thruster Node | T2 ship construction; requires zydrine + thruster-node |
| `advanced-condenser-coil` | Advanced Condenser Coil | T2 ship construction; requires morphite + zydrine + condenser-coil |
| `pos-core` | POS Core | Manufactured strategic structure core; consumed to deploy a player outpost and establish an independent Corp HQ |

---

# Tier 5 – T2 Ships

Tech 2 ships manufactured using T2 components and a T2 BPC (Blueprint Copy). Represent mid-game progression pinnacles — 40–60% stronger per stat than equivalent T1 hulls.

| Resource ID | Name | Hull Class | Prerequisites |
|---|---|---|---|
| `ship-assault-frigate` | Assault Frigate | `frigate` | T2 BPC + Advanced Industry L1 |
| `ship-covert-ops` | Covert Ops | `frigate` | T2 BPC + Advanced Industry L1 |
| `ship-command-destroyer` | Command Destroyer | `destroyer` | T2 BPC + Advanced Industry L1 |

---

# Resource Economic Chains

## Full Production Chain

```
Asteroid Belts
  └─ Raw Ore (Tier 1)
       └─ Reprocessing
            └─ Minerals (Tier 2)  [+ morphite/zydrine for T2]
                 └─ Manufacturing (T1 recipes)
                      └─ Components (Tier 3)
                      └─ Modules (Tier 3)
                           └─ Ship fitting inventory and role specialization
                      └─ Manufacturing (T1 ship recipes)
                           └─ T1 Ships (Tier 4)
                           └─ Manufacturing (T2 recipes, requires T2 BPC)
                                ├─ T2 Components (Tier 5)
                                └─ T2 Ships (Tier 5)
                      └─ Strategic infrastructure recipe
                           └─ POS Core (Tier 5)
                                └─ System deployment
                                     └─ Player Outpost / Corp HQ
NPC Combat Loot
  └─ Datacores (Tier 3)
       └─ Blueprint Research Queue
            └─ BPO level up → T2 BPO at level 5
                 └─ Blueprint Copy → BPC
                      └─ T2 Manufacturing (consumed per job)
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
