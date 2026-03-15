
# Idleverse – AI Development Guide

## Purpose

This document explains how AI assistants should interact with the Idleverse codebase and which reference documents define the project.

Idleverse is being built with **AI-assisted development**, so these documents ensure all AI tools share the same understanding of:

- the game vision
- gameplay systems
- technical architecture
- progression formulas
- resource economy

Every AI assistant contributing to this project should reference these documents.

---

# Core AI Reference Documents

The following files define the global rules of the project.

## 1. AI Global Context

`Idleverse_AI_Global_Context.md`

Defines:

- game vision
- design philosophy
- UI style
- thematic rules
- overall gameplay direction

This file explains **what Idleverse is**.

---

## 2. AI Architecture

`Idleverse_AI_Architecture.md`

Defines:

- engine structure
- system architecture
- tick loop model
- persistence and save systems
- modular system design

This file explains **how Idleverse should be built**.

---

## 3. AI Content Guidelines

`Idleverse_AI_Content_Guidelines.md`

Defines:

- naming conventions
- system terminology
- research design
- anomaly design
- prestige terminology

This file ensures **consistent world building and content creation**.

---

## 4. Balance & Progression Formulas

`Idleverse_BALANCE_FORMULAS.md`

Defines:

- production formulas
- upgrade scaling
- mastery progression
- prestige rewards
- rarity tables

This file ensures **the economy remains balanced and scalable**.

---

## 5. System Blueprints

`Idleverse_SYSTEM_BLUEPRINTS.md`

Documents every implemented gameplay system:

- Asteroid Mining
- Reprocessing
- Manufacturing
- Skills
- Market
- Galaxy & Fleet Navigation
- Fleet Management
- Fleet Combat
- Factions
- Pilots

This file explains **how gameplay systems interact**.

---

## 6. Resource Registry

`Idleverse_RESOURCE_REGISTRY.md`

Defines the core resources of the game:

- tier classification
- production sources
- usage chains
- rarity levels

This file defines **the economic backbone of Idleverse**.

---

## 7. Design Plan

`Idleverse_DESIGN_PLAN.md`

Defines:

- implementation status per feature (✅ completed, 🔲 upcoming)
- upcoming feature phases with full specs and data structures
- file change lists per phase

This file is the **living roadmap** — check here before implementing new features.

---

# AI Development Rules

When generating code or design content for Idleverse, AI assistants should:

### Always

- follow the architecture defined in `Idleverse_AI_Architecture`
- respect the economic rules in `Idleverse_BALANCE_FORMULAS`
- use resources defined in `Idleverse_RESOURCE_REGISTRY`
- design systems consistent with `Idleverse_SYSTEM_BLUEPRINTS`
- maintain the sci‑fi theme defined in `Idleverse_AI_Global_Context`
- follow the feature pipeline in `Idleverse_DESIGN_PLAN`
- update documentation whenever code changes

### Avoid

- inventing random new resources
- introducing fantasy themes
- creating isolated systems
- bypassing the established progression model

---

# Recommended Project Structure

These documents should be stored in the repository under:

```
/docs
  Idleverse_AI_Global_Context.md
  Idleverse_AI_Architecture.md
  Idleverse_AI_Content_Guidelines.md
  Idleverse_BALANCE_FORMULAS.md
  Idleverse_SYSTEM_BLUEPRINTS.md
  Idleverse_RESOURCE_REGISTRY.md
  Idleverse_DESIGN_PLAN.md
  README_AI.md
```

AI tools should treat this directory as **global project context**.

---

# AI‑Assisted Development Workflow

When using AI tools such as:

- ChatGPT
- Claude Code
- GitHub Copilot
- Cursor

the assistant should:

1. read the AI reference documents
2. understand the Idleverse architecture
3. follow the established economic model
4. generate modular, extensible code
5. ensure new systems integrate with existing mechanics

---

# Project Vision Reminder

Idleverse is intended to become a **deep, long‑running idle strategy game** where players gradually build and automate a galactic civilization.

The game should support:

- long‑term progression
- layered gameplay systems
- automation and optimization
- strategic decision making
- a sleek futuristic interface

All development should reinforce this vision.
