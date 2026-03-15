---
applyTo: "src/ui/**"
---

# Idleverse UI/UX Standards

## Core Philosophy

Every UI decision follows three rules:
1. **Progressive disclosure** — show the minimum needed to understand state; drill down on demand.
2. **Project-centric framing** — group by player intent (the project/goal), not by system internals (raw queues, indices).
3. **Whole-area interaction** — clickable regions, never tiny isolated buttons. The user should be able to click anywhere in a logical area to trigger the primary action.

---

## Visual Language

### Colour Semantics
| Colour | Meaning | Tailwind tokens |
|--------|---------|-----------------|
| **Cyan** | Active / in-progress | `cyan-400`, `cyan-700/20`, `cyan-950/20` |
| **Emerald** | Complete / met / success | `emerald-400`, `emerald-500`, `emerald-900/15` |
| **Amber** | Pending / waiting / partial | `amber-400/60`, `amber-600/60`, `amber-300` |
| **Violet** | Queued / scheduled | `violet-*` |
| **Slate** | Idle / empty / neutral | `slate-500`, `slate-600`, `slate-700/20` |
| **Red** | Destructive / cancel | `red-500/40` hover → `red-300` |

Always use the same colour token for the same semantic state everywhere. Never use cyan for "complete" or emerald for "active".

### Status Dots
Every row/card that represents a trackable item leads with a status dot:
```tsx
<span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
  isActive   ? 'bg-cyan-400 animate-pulse' :
  isComplete ? 'bg-emerald-400' :
  isPending  ? 'bg-amber-400/60' :
               'bg-slate-600'
}`} />
```

### Typography Scale
| Role | Size | Weight | Colour |
|------|------|--------|--------|
| Section header | `text-xs` | `font-semibold` | `text-slate-400` uppercase tracking-wider |
| Card title | `text-[11px]` | `font-semibold` | semantic (cyan/emerald/slate) |
| Body label | `text-[10px]`–`text-xs` | normal | `text-slate-300`–`text-slate-500` |
| Metadata / mono | `text-[9px]`–`text-[10px]` | `font-mono` | `text-slate-500`–`text-slate-600` |
| Badge / pill | `text-[8px]`–`text-[9px]` | tracking-widest uppercase | contextual |

---

## Information Hierarchy

### Four-level drill-down
```
Dashboard (Overview tab)
  → System card (Mining, Energy, Manufacturing…)
    → Project/group row  [collapsed by default, except active]
      → Job/item detail  [expanded on click]
```

Each level shows only what is needed to understand status at that depth. Full detail is always one click away, never permanently hidden, never permanently shown.

### Compact row anatomy
```
[status dot] [name/label — flex-1 truncate] [summary badges] [ETA] [▾/▴] [✕]
```
- Status dot: leftmost, always visible
- Name: `flex-1 min-w-0 truncate` — never wraps, never pushes other elements off
- Summary badges: compact `font-mono` counts/values, `shrink-0`
- ETA: `font-mono shrink-0`, coloured by urgency (amber = waiting, cyan = counting down)
- Chevron (`▾/▴`): rightmost before the cancel; `text-[10px] text-slate-600`
- Cancel (`✕`): always last; `text-red-500/40 hover:text-red-300`; **always** has `e.stopPropagation()`

---

## Expandable Rows

### Pattern
```tsx
function MyRow({ ... }) {
  const [expanded, setExpanded] = useState(defaultExpanded ?? false);
  return (
    <div className="rounded-md border overflow-hidden border-slate-700/20">
      {/* Clickable header — entire header row is the toggle */}
      <div
        className="flex items-center gap-1.5 px-2 py-1.5 cursor-pointer select-none hover:bg-white/[0.03] transition-colors"
        onClick={() => setExpanded(e => !e)}
      >
        <span className="status-dot" />
        <span className="flex-1 min-w-0 truncate text-[11px] font-semibold">{label}</span>
        <span className="text-[10px] text-slate-600">{expanded ? '▴' : '▾'}</span>
        {onCancel && (
          <button
            onClick={e => { e.stopPropagation(); onCancel(); }}
            className="text-[10px] text-red-500/40 hover:text-red-300 transition-colors pl-1"
          >✕</button>
        )}
      </div>

      {/* Collapsed hint — progress bar only */}
      {!expanded && <div className="px-2 pb-1.5"><ProgressBar ... /></div>}

      {/* Expanded details */}
      {expanded && (
        <div className="flex flex-col gap-1.5 px-2 pb-2 pt-1"
             style={{ borderTop: '1px solid rgba(30,41,59,0.5)' }}>
          {/* full detail */}
        </div>
      )}
    </div>
  );
}
```

### Rules
- The **entire header div** is the click target, not just a small button.
- Minimum touch target height: `py-1.5` (≈ 32px effective height).
- `select-none` on the click div to prevent text selection on rapid clicks.
- `hover:bg-white/[0.03]` subtle highlight — never a heavy background change.
- Active items (`isActive`) open `defaultExpanded={true}`; queued items default collapsed.
- The `✕` cancel always uses `e.stopPropagation()`.

---

## Progress Bars

Use `FlairProgressBar` for primary progress (recipe completion, research, etc.).  
Use raw `<div>` mini-bars at `h-1` for secondary/collapsed hints:

```tsx
<div className="flex-1 bg-slate-800/70 rounded-full h-1 overflow-hidden">
  <div
    className="h-full rounded-full transition-all duration-500 bg-cyan-500/70"
    style={{ width: `${pct}%` }}
  />
</div>
```

Colour mapping: `bg-emerald-500` (complete) / `bg-cyan-500/70` (active) / `bg-amber-600/60` (pending).

---

## Activity Bars (`ActivityBar`)

Rate must always be **normalised** — pass a `rate` value in `[0, 1]` where `1` = maximum known rate.

```tsx
// Mining: normalise against MAX_MINING_RATE
<ActivityBar active rate={totalBaseRate / MAX_MINING_RATE} color="cyan" />

// Energy: normalise against total demand
<ActivityBar active rate={contribution / totalDemand} color="amber" />

// Manufacturing: pass effectiveSpd directly (already 0–1 fraction)
<ActivityBar active rate={effectiveSpd} color="cyan" />
```

Never pass raw resource-per-second values as `rate`.

---

## StatPills

Used in every system card header row for at-a-glance KPIs:

```tsx
<div className="flex gap-3">
  <StatPill label="Label"  value="formatted value"  color="cyan|emerald|amber|violet|slate" />
</div>
```

- Use `color="slate"` when the value is zero/neutral.
- Maximum 3–4 pills per card — if more data is needed, put it in the expanded section.

---

## MasteryBar

Always include directly under `<SectionHeader>` in every system card:

```tsx
<SectionHeader>⚙ System Name</SectionHeader>
<MasteryBar systemId="mining" />
```

---

## HoverCard / Tooltip

- Use `HoverCard` from `ResourceBar.tsx` for pill tooltips in the HUD.
- The card's `scroll` listener must check `cardRef.contains(e.target)` before dismissing — inner scroll must never close the card.
- Scrollable inner content: `overflowY: 'auto', maxHeight: '65vh'`.

---

## Panels vs. Overview

| Context | Detail level | Controls |
|---------|-------------|----------|
| **Overview tab** | Summary — status, single active item, queued count | Read-only, drill-down only |
| **System panel** | Full — all items, all controls, create/cancel/queue | Full interactive |

Never put queue management controls (create project, add crafts) in the Overview. Never show full raw job lists in the Overview without project grouping.

---

## Naming Conventions for Components

| Pattern | Example |
|---------|---------|
| Panel-level card | `ManufacturingCard`, `MiningCard` |
| Within-panel section | `MfgProjectRow`, `ProjectRow`, `UpgradeCard` |
| Shared UI primitive | `FlairProgressBar`, `ActivityBar`, `StatPill`, `MasteryBar` |
| HUD element | `ResourceBar`, `ProjectsPill`, `EnergyPill` |

---

## Anti-patterns (never do these)

- ❌ A button smaller than `text-[10px]` with only `px-1` padding as the sole click target
- ❌ Listing raw job arrays without project grouping
- ❌ Hard-coding progress bar colours without using the semantic colour table
- ❌ Using `overflow-hidden` on a `HoverCard` that contains a scrollable list  
- ❌ Dismissing a tooltip on scroll events that originate inside the card
- ❌ Passing raw resource/sec values directly to `ActivityBar rate` without normalisation
- ❌ Showing fabricated ETAs — only show ETA if `rate > 0`
