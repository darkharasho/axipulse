# Subnav Redesign: Floating Capsule in Content Area

## Problem

The current subnav uses a hidden slide-in/out pill bar (`SubviewPillExpansion`) toggled by a chevron button. Subviews are invisible by default, requiring an extra click to reveal. This adds friction to switching between subviews (e.g. Damage → Support → Boons in Pulse).

## Decision

Replace the collapsible subnav with an always-visible floating capsule rendered inside each view's content area — not in the nav chrome.

## Design

### Layout (top to bottom)

1. **Titlebar** (unchanged) — logo, fight info (F#, map, duration, spec), window controls
2. **Nav bar** (unchanged) — Pulse, Timeline, Map, History, Settings tabs
3. **Content area** — each view that has subviews renders a floating capsule at the top of its content

### Floating capsule spec

- **Position**: Top of content area, left-aligned, not sticky (scrolls with content)
- **Container**: `display: inline-flex`, dark recessed background (`--bg-inset` or ~`#0a0a16`), `border-radius: 9px`, `padding: 3px`, gap `1px` between pills
- **Depth**: `box-shadow: 0 1px 4px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.015)` and `border: 1px solid rgba(255,255,255,0.024)`
- **Spacing**: `12px` top margin from nav bar border, `16px` horizontal padding matching content area

### Pill spec

- **Size**: `padding: 5px 13px`, `font-size: 10px`, `border-radius: 6px`
- **Inactive**: `color: var(--text-tertiary)` (~`#555`), no background, `transition: all 0.15s ease`
- **Hover**: `color: var(--text-secondary)`, subtle background tint
- **Active**: `color: var(--brand-primary)` (`#10b981`), `font-weight: 500`, `background: linear-gradient(135deg, rgba(16,185,129,0.13), rgba(16,185,129,0.06))`, `box-shadow: 0 0 10px rgba(16,185,129,0.06), inset 0 1px 0 rgba(16,185,129,0.08)`
- **Active transition**: `transition: all 0.2s ease` — the highlight slides smoothly when switching pills

### Views with subviews

| View | Pills | IDs |
|------|-------|-----|
| Pulse | Overview, Damage, Support, Defense, Boons | `overview`, `damage`, `support`, `defense`, `boons` |
| Timeline | Why did I die?, My damage, Getting support?, Positioning, Custom | `why-died`, `my-damage`, `support`, `positioning`, `custom` |
| Map | Overview, Movement | `overview`, `movement` |

### Views without subviews

History and Settings render no capsule — content starts immediately below the nav bar.

## Components to change

### Remove

- `SubviewPillExpansion` component in `src/renderer/app/SubviewPillBar.tsx`
- `SubviewToggle` component in `src/renderer/app/SubviewPillBar.tsx`
- `pillBarExpanded` / `setPillBarExpanded` / `togglePillBar` from Zustand store
- All references to `SubviewPillExpansion` and `SubviewToggle` in `AppLayout.tsx`

### Add

- `SubviewCapsule` component — a generic floating capsule that accepts pills config and renders the active/inactive states. Placed inside each view component (PulseView, TimelineView, MapView) rather than in AppLayout.

### Modify

- `AppLayout.tsx` — remove the subview expansion area (lines 169-172) and the SubviewToggle in the nav bar (lines 163-165). The nav bar becomes simpler.
- `PulseView.tsx` — render `SubviewCapsule` at top of content
- `TimelineView.tsx` — render `SubviewCapsule` at top of content
- `MapView.tsx` — render `SubviewCapsule` at top of content
- `store.ts` — remove `pillBarExpanded`, `setPillBarExpanded`, `togglePillBar` state

## Animation

- Active pill highlight uses CSS transitions for color/shadow changes
- Use Framer Motion `layoutId` for the sliding background highlight behind the active pill — an absolutely-positioned `motion.div` behind the active pill that animates position/size when selection changes
- Inactive pill hover: 150ms ease color transition
- Active pill change: 200ms ease for background/shadow/color

## Out of scope

- Changing the titlebar or primary nav bar styling
- The Map view's separate slide-in party panel (MovementView.tsx) — that's a different interaction pattern
- Adding new subviews to any view
