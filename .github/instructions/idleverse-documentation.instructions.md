---
applyTo: "**"
---

# Idleverse Documentation Standards

## Rule: Documentation Is Part of Every Update

Every code change **must** be accompanied by the relevant documentation update in the same session. This is not optional — treating docs as a separate follow-up is forbidden.

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
| New terminology or naming convention | `Idleverse_AI_Content_Guidelines.md` — add to relevant section |

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
