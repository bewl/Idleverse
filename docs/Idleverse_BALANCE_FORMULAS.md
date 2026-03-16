
# Idleverse – Balance & Progression Formulas

## Purpose

This document defines the **mathematical progression rules** for Idleverse.

Idle games succeed or fail based on progression balance. These formulas ensure:

- predictable scaling
- long‑term progression (months/years)
- controllable economy tuning
- easy content balancing

All systems should follow these **standardized formulas** unless there is a clear reason not to.

---

# Core Economic Principles

Idleverse should follow these balancing rules:

1. Early progression is **fast and rewarding**
2. Midgame introduces **optimization and bottlenecks**
3. Late game emphasizes **automation and synergy**
4. Endgame relies on **prestige and specialization**

Avoid:

- flat linear progression
- sudden hard walls
- runaway exponential explosions without limits

---

# Resource Production Formula

Base resource production follows this structure:

```
Production = BaseRate × Multipliers + Additive Bonuses
```

Where:
- `BaseRate` = system base rate (defined in config)
- `Multipliers` = skills, modules, pilot bonuses
- `AdditiveBonuses` = flat modifiers from upgrades

**Actual mining formula:**

```
OreYield = belt.baseRate
         × (1 + modifiers['mining-yield'])    // from Mining, Astrogeology skills
         × miningLaserModuleMultiplier
         × assignedPilotMiningBonus
```

---

# Upgrade Cost Scaling

Upgrade costs scale exponentially.

```
Cost = BaseCost × GrowthRate^Level
```

**Actual value used:** `UPGRADE_GROWTH_RATE = 1.15` (from `src/game/balance/constants.ts`)

Example:

```
Mining upgrade, BaseCost = 500, GrowthRate = 1.15
  Level 1 → 575
  Level 5 → 1,006
  Level 10 → 2,023
```

---

# Resource Storage Scaling

Storage upgrades should grow slower than cost scaling to create logistical decisions.

Formula:

StorageCapacity = BaseCapacity × (1 + 0.25 × Level)

Example:

Level 1 → 125% capacity  
Level 2 → 150% capacity  
Level 3 → 175% capacity

---

# Research Time Scaling

Research duration should increase with complexity.

Formula:

ResearchTime = BaseTime × TierMultiplier × NodeDepth

Where:

TierMultiplier examples:

Tier 1 = 1x  
Tier 2 = 2x  
Tier 3 = 5x  
Tier 4 = 10x

NodeDepth increases deeper into the research tree.

---

# Mastery XP Progression

Mastery systems should require increasingly more experience.

Formula:

XPRequired = BaseXP × Level^1.5

Example:

BaseXP = 100

Level 1 → 100 XP  
Level 2 → 282 XP  
Level 3 → 520 XP  
Level 10 → 3162 XP

This ensures long‑term progression without exponential runaway.

---

# Prestige Scaling

Prestige rewards should grow logarithmically so resets remain meaningful but controlled.

Formula:

PrestigePoints = floor(log10(TotalLifetimeProduction))

Example:

Lifetime Production = 1,000 → 3 points  
Lifetime Production = 1,000,000 → 6 points

Prestige bonuses should provide multipliers such as:

ProductionBonus = 1 + (PrestigePoints × 0.02)

Example:

50 Prestige Points → +100% production

---

# Automation Unlock Curve

Automation should unlock in stages.

Example progression:

Stage 1 → Manual operation  
Stage 2 → Basic automation  
Stage 3 → Conditional automation  
Stage 4 → AI optimization

Each stage should require significant research investment.

---

# Offline Progress Calculation

Offline simulation should reuse the same formulas as live play.

Steps:

1. Load saved timestamp
2. Calculate elapsed time
3. Simulate production in chunks
4. Apply automation rules
5. Cap extremely long offline gains if necessary

Recommended cap:

OfflineCap = 24 hours

This prevents economy breakage.

---

# Resource Tier Value Scaling

Higher tier resources should follow a multiplier pattern.

Example:

Tier 1 → value 1  
Tier 2 → value 10  
Tier 3 → value 100  
Tier 4 → value 1000  
Tier 5 → value 10000

This supports meaningful conversion chains.

---

# Bottleneck Design

Every stage of the game should introduce at least one bottleneck.

Examples:

Early game → energy supply  
Mid game → logistics throughput  
Late game → exotic materials

Bottlenecks create strategic planning and progression pacing.

---

# Discovery Drop Rates

Rare discoveries should feel exciting but attainable.

Example rarity table:

Common = 60%  
Uncommon = 25%  
Rare = 10%  
Epic = 4%  
Legendary = 1%

Legendary discoveries should unlock unique gameplay features.

---

# Implemented Balance Constants

These values are live in the codebase (`src/game/balance/constants.ts`):

| Constant | Value | Role |
|---|---|---|
| `UPGRADE_GROWTH_RATE` | 1.15 | Per-level upgrade cost multiplier |
| `OFFLINE_CAP_SECONDS` | 86,400 (24 h) | Maximum offline catch-up window |
| `SKILL_LEVEL_SECONDS` | [60, 300, 1800, 10800, 64800] | Base training time per level (×skill rank) |
| `BASE_ORE_HOLD_CAPACITY` | 5,000 | Ore hold before auto-haul triggers |
| `IDLE_REPAIR_RATE_PER_SEC` | 1.5/60 (~0.025) | Hull % repaired per second while idle |
| `BASE_HAUL_SECONDS` | 120 | Default ore haul interval |
| `MIN_HAUL_SECONDS` | 10 | Minimum possible haul interval |
| `BASE_RESEARCH_TIME` | 300 | Base seconds for blueprint research level 0→1 |
| `BASE_COPY_TIME_MULTIPLIER` | 0.5 | Multiplier for copy time vs research time |
| `DEFAULT_RESEARCH_SLOTS` | 3 | Concurrent research/copy slots before Science bonuses |

---

# Skill Training Time Formula

```
SecondsToTrain = SKILL_LEVEL_SECONDS[targetLevel - 1] × skill.rank
```

Example — Mining (rank 2), Level 3:

```
1800 s × 2 = 3,600 s = 60 minutes
```

Example — Cruiser (rank 5), Level 5:

```
64,800 s × 5 = 324,000 s = 90 hours
```

---

# Haul Interval Formula

```
totalReduction = min(0.70, modifiers['haul-speed'] + haulingShipBonus)
haulingShipBonus = Σ (0.05 × hull.baseCargoMultiplier) per piloted hauling ship
haulInterval = max(MIN_HAUL_SECONDS, floor(BASE_HAUL_SECONDS × (1 - totalReduction)))
```

---

# Combat Rating Formula

```
fleetCombatRating = Σ (
  hull.baseCombatRating
  × pilotCombatModifier
  × combatModuleMultiplier
) × doctrineMultipliers

pilotCombatModifier = 1.0 + (0.05 × gunneryLevel) + moraleBonus
```

**Doctrine multipliers** (from DOCTRINE_DEFINITIONS in fleet.config.ts):

| Doctrine | DPS Mult | Tank Mult | Loot Mult | Variance |
|---|---|---|---|---|
| Balanced | ×1.0 | ×1.0 | ×1.0 | ±20% |
| Brawl | ×1.25 | ×0.7 | ×1.0 | ±15% |
| Sniper | ×1.15 | ×0.85 | ×1.0 | ±10% |
| Shield Wall | ×0.85 | ×1.4 | ×0.9 | ±25% |
| Stealth Raid | ×0.75 | ×1.0 | ×1.5 | ±10% |

---

# Hull Repair Formula

```
// Passive (idle, not in active combat fleet):
hullDamage -= IDLE_REPAIR_RATE_PER_SEC × deltaSeconds   // ~1.5%/min

// Instant (spend 1× hull-plate):
hullDamage = 0
```

Ships go offline at `hullDamage > 80%` (no combat contribution).

---

# Combat Outcome Formula

```
powerRatio = fleetCombatRating / npcGroup.strength
variance   = seededRandom × 0.4 − 0.2   (±20%, reduced by scout ships)
adjusted   = powerRatio × (1 + variance)

VICTORY (adjusted ≥ 1.0):
  fleetDamage% = 5 + 15 × (1 − adjusted)
  bountyEarned = npcGroup.bounty
  loot         = rollLootTable(npcGroup.lootTable, adjusted)

DEFEAT (adjusted < 1.0):
  fleetDamage% = 20 + 30 × (1 − adjusted)
  no loot, no bounty
```

---

# Progression Pacing Targets

Example player milestones:

First 30 minutes:
- First ore belt active, reprocessing running
- First mineral sell order for ISK

First few hours:
- Manufacturing queue producing components
- First ship built and deployed
- First fleet formed, first NPC patrol attempted

First day:
- Lowsec belts unlocked
- Multiple pilots trained, fleet combat viable
- Hull repair loop established

First week:
- Nullsec access, Exhumer fleet
- Multiple named fleets specialised by doctrine
- Phase 1 trade routes (upcoming)

---

First month:
- multiple colonies

Long term:
- megastructures and cosmic research

---

# Anomaly Scan Progress Formula

Scan progress per second for an anomaly being scanned by a fleet:

```
progressPerSecond = fleetScanStrength / anomaly.signatureRadius
fleetScanStrength = Σ ships × (hull.baseSensorStrength + Σ scan-strength modules) × (1 + scan-speed modifier)
```

An anomaly is **revealed** when `scanProgress >= 100`.

| Variable | Range | Notes |
|---|---|---|
| `hull.baseSensorStrength` | 3 (shuttle) – 15 (covert-ops) | Per hull definition |
| `scan-strength` module bonus | +0.10 (cargo-scanner-i) … +0.20 (scan-pinpointing-i) | Multiplicative per module |
| `scan-speed` modifier | +0.10/level via Astrometrics | Applied as `(1 + total_modifier)` |
| `signatureRadius` | 20–300 AU | Lower = harder; ore-pockets easy, relic-sites hardest |

**Example:** A fleet of 3 Covert Ops (baseSensor 15) each with one `scan-pinpointing-i` (+0.20) and Astrometrics L3 (+0.30 speed):
```
fleetScanStrength = 3 × (15 + 0.20) × (1 + 0.30) = 3 × 15.2 × 1.3 = 59.28
```
Against a relic site with `signatureRadius = 50`:
```
progressPerSecond = 59.28 / 50 = 1.186 %/s → revealed in ~84 seconds
```

---

# Blueprint Research Time Formula

Research duration grows exponentially with level to create a meaningful mid-game time investment.

```
ResearchTime(level) = round(BASE_RESEARCH_TIME × 1.5^level)
```

Where `BASE_RESEARCH_TIME = 300` seconds.

Each level also consumes 1 datacore of the appropriate type. Progress is scaled by:

```
effectiveRate = 1 / (researchTime × (1 / researchSpeedMultiplier))
researchSpeedMultiplier = 1 + modifiers['blueprint-research-speed']
```

Example research durations (accelerated by Science skill):

| Level | Base Time | Science L5 (~+20%) |
|---|---|---|
| 0 → 1 | 300 s (5 min) | ~250 s |
| 1 → 2 | 450 s (7.5 min) | ~375 s |
| 2 → 3 | 675 s (11 min) | ~562 s |
| 3 → 4 | 1,013 s (17 min) | ~844 s |
| 4 → 5 (T2 unlock) | 1,519 s (25 min) | ~1,266 s |

Total time to unlock a T2 BPO (levels 0–5): ~3,957 s base (~66 min) — 45 min with Science L5.

---

# Blueprint Copy Time Formula

```
CopyTime(runs) = round(BASE_RESEARCH_TIME × BASE_COPY_TIME_MULTIPLIER × runs)
             = round(300 × 0.5 × runs)
             = 150 × runs  (seconds)
```

Example copy times:

| Runs | Copy Time |
|---|---|
| 1 | 150 s (2.5 min) |
| 5 | 750 s (12.5 min) |
| 10 | 1,500 s (25 min) |

---

# Blueprint Research Slot Formula

```
maxResearchSlots = DEFAULT_RESEARCH_SLOTS + (science ≥ 3 ? 1 : 0) + (science ≥ 5 ? 1 : 0)
DEFAULT_RESEARCH_SLOTS = 3
```

Maximum: 5 slots (at Science L5).

---

# Balancing Guidelines

When designing new systems:

Prefer formulas that:

- scale predictably
- are easy to tune
- maintain long‑term progression

Avoid mechanics that produce:

- infinite loops
- uncontrolled exponential growth
- trivial late game economies

---

# Final Rule

All progression formulas should prioritize:

- longevity
- strategic decision making
- scalable complexity

Idleverse should remain engaging for **years of progression**.
