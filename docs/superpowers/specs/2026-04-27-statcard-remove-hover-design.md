# StatCard: Remove Hover Glow

**Date:** 2026-04-27
**Source:** Discord feedback thread 1498417075276746882 (pixelbox)

## Problem

`StatCard` displays an inner-glow effect on `:hover`. None of the cards have a click action, hover-triggered tooltip, or drill-down behavior. The hover affordance misleads users into expecting an interaction that does not exist.

Reporter's framing: cards aren't dense tabular info (no row-focus benefit), and there's no action behind the hover. Future siloed breakdowns may reintroduce interactivity, but until then the hover should be gone.

## Scope

Apply to every `StatCard` instance — Overview, Damage, Defense, and Support subviews. The reasoning ("no hover or click action ⇒ no hover state") is universal, not Overview-specific.

Out of scope: timeline lanes, inspector panels, history rows, settings, modals. These have their own interaction patterns and were not part of the feedback.

## Changes

### 1. `src/renderer/views/StatCard.tsx`

- Remove the `stat-card-glow` className from the root `motion.div`.
- Remove the `--card-glow-color` CSS custom property from the inline `style` object.
- Keep the entrance animation (`initial`/`animate`/`transition`) and the `borderLeft` accent — neither is hover-related.

### 2. `src/renderer/index.css`

Delete these three rule blocks (currently around lines 139–156):

- `.stat-card-glow`
- `.stat-card-glow::before`
- `.stat-card-glow:hover::before`

They become dead code once the className is removed.

## Verification

- `npm run dev` and confirm no glow appears when hovering any card across all four Pulse subviews (Overview, Damage, Defense, Support).
- `npm run build` to type-check and confirm no stale references to `stat-card-glow` or the removed CSS variable.
- Visual check: left-border accent and entrance animation still render as before.

## Non-Goals

- No new `interactive` prop or opt-in mechanism. When drill-downs ship, they will introduce their own hover/click affordances on the components that gain real interactivity.
- No audit of hover states elsewhere in the codebase. The general rule (no hover state without an interaction) is captured in project memory and will guide future work, but isn't being applied retroactively here.
