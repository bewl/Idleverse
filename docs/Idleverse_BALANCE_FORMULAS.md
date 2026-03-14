
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

Base resource production should use this structure:

Production = BaseRate × Multipliers + Additive Bonuses

Where:

BaseRate = system production value  
Multipliers = upgrades, mastery, research, prestige bonuses  
AdditiveBonuses = flat bonuses from discoveries or anomalies

Example:

MiningOutput =
BaseMiningRate
× MiningEfficiency
× ResearchMultiplier
× GlobalProductionBonus
+ FlatMiningBonus

---

# Upgrade Cost Scaling

Upgrade costs should scale exponentially to create long‑term progression.

Standard formula:

Cost = BaseCost × GrowthRate^Level

Recommended values:

BaseCost = initial upgrade cost  
GrowthRate = 1.12 – 1.20

Example:

Mining Drill Upgrade

Cost = 100 × 1.15^Level

This creates increasing difficulty without immediate hard caps.

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

# Progression Pacing Targets

Example player milestones:

First hour:
- unlock 2–3 systems

First day:
- unlock automation tier 1

First week:
- first prestige reset

First month:
- multiple colonies

Long term:
- megastructures and cosmic research

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
