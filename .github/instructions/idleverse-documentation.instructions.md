---
applyTo: "**"
---

# Idleverse Documentation Standards

## Rule: Documentation Is Part of Every Update

Every code change **must** be accompanied by the relevant documentation update in the same session. This is not optional — treating docs as a separate follow-up is forbidden.

## Rule: Plans Must Be Documented When They Are Created

Any meaningful plan created during discussion — feature plan, system design, phased rollout, balance plan, content expansion plan, refactor plan, or implementation roadmap — **must be written into the documentation during the same session**.

Do not leave plans only in chat, memory, or temporary notes. If a plan is important enough to guide future work, it must be captured in `/docs/` so it can be updated, referenced later, and not lost.

If a plan changes later, update the documented version immediately rather than creating a second conflicting plan in chat.

---

## What to Update and When

| Change type | Documents to update |
|---|---|
| New resource added | `Idleverse_RESOURCE_REGISTRY.md` — add resource, tier, source, usage |
| Resource removed or renamed | `Idleverse_RESOURCE_REGISTRY.md` — update or remove entry |
| New system implemented | `Idleverse_SYSTEM_BLUEPRINTS.md` — add system section; `Idleverse_AI_Global_Context.md` — add to systems list |
| System significantly changed | `Idleverse_SYSTEM_BLUEPRINTS.md` — update affected section |
| New balance constant or formula | `Idleverse_BALANCE_FORMULAS.md` — document constant and formula |
| Balance constant changed | `Idleverse_BALANCE_FORMULAS.md` — update value and examples |
| New store slice or state shape | `Idleverse_AI_Architecture.md` — update state model section |
| Folder structure changes | `Idleverse_AI_Architecture.md` — update project structure section |
| Phase or feature completed | `Idleverse_DESIGN_PLAN.md` — mark phase `✅ COMPLETED` with date and files changed |
| New phase or feature designed | `Idleverse_DESIGN_PLAN.md` — add phase section with full spec |
| New implementation plan or roadmap discussed | `Idleverse_DESIGN_PLAN.md` — add or update the relevant phase/feature plan section in the same session |
| New terminology or naming convention | `Idleverse_AI_Content_Guidelines.md` — add to relevant section |

---

## Planning Documentation Rules

When a plan is created, documented it using these rules:

1. Put long-lived feature, system, or rollout plans in `Idleverse_DESIGN_PLAN.md`.
2. If the plan changes the architecture or state model, also update `Idleverse_AI_Architecture.md`.
3. If the plan introduces formulas, pacing targets, or progression constants, also update `Idleverse_BALANCE_FORMULAS.md`.
4. If the plan introduces new resources, item families, or production chains, also update `Idleverse_RESOURCE_REGISTRY.md`.
5. Replace stale plan text instead of appending contradictory versions.
6. Chat-only planning is not sufficient for repo memory; the docs are the source of truth.

Use temporary memory notes only as working scratch space. Once the plan is real, the docs must carry it.

---

## Documentation Files Reference

All documentation lives in `/docs/`:

| File | Purpose |
|---|---|
| `Idleverse_AI_Global_Context.md` | Game vision, design philosophy, systems list |
| `Idleverse_AI_Architecture.md` | Folder structure, state model, tick loop |
| `Idleverse_AI_Content_Guidelines.md` | Naming conventions, terminology, system design rules |
| `Idleverse_BALANCE_FORMULAS.md` | All balance constants and progression formulas |
| `Idleverse_SYSTEM_BLUEPRINTS.md` | Spec for every implemented system |
| `Idleverse_RESOURCE_REGISTRY.md` | Every resource: tier, source, usage, production chain |
| `Idleverse_DESIGN_PLAN.md` | Feature roadmap and implementation status |
| `README_AI.md` | Entry point — how to use the docs |

---

## How to Mark a Phase Complete in DESIGN_PLAN.md

When all work for a design phase is shipped, replace the phase header block:

```markdown
# Phase N — Name
> **Status:** Designed, not yet implemented.
```

with:

```markdown
# ✅ COMPLETED — Phase N — Name
> **Status:** ✅ Shipped — [Month Year]
> **Files changed:** list the key files
```

Then add a concise "What Was Built" section summarising the shipped behaviour.

---

## Stale Documentation Is a Bug

If you discover that a doc describes systems, resources, or behaviours that no longer exist in code, fix the doc immediately — do not leave it for later. Stale documentation is treated as a defect with the same priority as a runtime bug.
