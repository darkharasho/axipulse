# StatCard Remove Hover Glow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the inner-glow `:hover` state from `StatCard` so non-interactive Pulse cards stop signaling clickability they don't have.

**Architecture:** Two-file change. Strip the `stat-card-glow` className and the `--card-glow-color` inline CSS variable from `StatCard.tsx`, then delete the corresponding three CSS rule blocks from `index.css`. Entrance animation and left-border accent stay; only the hover affordance goes away.

**Tech Stack:** React + TypeScript, Tailwind, plain CSS in `src/renderer/index.css`. No automated UI test infra in this project (`test:unit` exists via Vitest but no renderer tests are wired up), so verification is `npm run typecheck`, `npm run lint`, and a manual hover check in `npm run dev`.

**Spec:** `docs/superpowers/specs/2026-04-27-statcard-remove-hover-design.md`

---

## File Map

- Modify: `src/renderer/views/StatCard.tsx` (remove className + `--card-glow-color` style)
- Modify: `src/renderer/index.css` (delete `.stat-card-glow*` rules at lines ~139–156)

No new files. No test files (project has no renderer tests, and a CSS hover removal is verified visually).

---

## Task 1: Remove hover className and CSS variable from StatCard

**Files:**
- Modify: `src/renderer/views/StatCard.tsx:25-30`

- [ ] **Step 1: Read the current StatCard component**

Run: read `src/renderer/views/StatCard.tsx` and confirm the `motion.div` at lines 21–31 currently has:

```tsx
className="stat-card-glow rounded-md overflow-hidden"
style={{
    background: 'var(--bg-card)',
    borderLeft: `3px solid ${accent}`,
    '--card-glow-color': accent.startsWith('#') ? `${accent}15` : accent.replace(')', ', 0.08)').replace('rgb(', 'rgba('),
} as React.CSSProperties}
```

- [ ] **Step 2: Replace the className and style block**

Edit `src/renderer/views/StatCard.tsx`. Change the `motion.div` opening (lines 21–31) from the above to:

```tsx
<motion.div
    initial={{ opacity: 0, y: 8 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.35, delay: index * 0.05, ease: [0.16, 1, 0.3, 1] }}
    className="rounded-md overflow-hidden"
    style={{
        background: 'var(--bg-card)',
        borderLeft: `3px solid ${accent}`,
    }}
>
```

Note: with `--card-glow-color` removed, the `style` object no longer contains a CSS custom property, so the `as React.CSSProperties` cast can also be dropped (TypeScript accepts the plain object).

- [ ] **Step 3: Verify `accent` is still used**

Run: `grep -n "accent" src/renderer/views/StatCard.tsx`
Expected: `accent` still appears in the `borderLeft` style and in the `color` of the label `<div>` (line 33). The `accentColor` prop and the `accent` local are still load-bearing — do not remove them.

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: passes with no errors.

- [ ] **Step 5: Lint**

Run: `npm run lint`
Expected: passes with no errors or warnings.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/views/StatCard.tsx
git commit -m "refactor(StatCard): drop hover glow className and CSS var"
```

---

## Task 2: Delete the dead `stat-card-glow` CSS rules

**Files:**
- Modify: `src/renderer/index.css` (around lines 139–156)

- [ ] **Step 1: Confirm the rules to delete**

Run: `grep -n "stat-card-glow" src/renderer/index.css`
Expected output (line numbers may have shifted slightly):

```
139:.stat-card-glow {
143:.stat-card-glow::before {
154:.stat-card-glow:hover::before {
```

- [ ] **Step 2: Delete the three rule blocks**

Edit `src/renderer/index.css` and remove this entire block (currently lines 139–156):

```css
.stat-card-glow {
  position: relative;
}

.stat-card-glow::before {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  opacity: 0;
  transition: opacity var(--duration-normal) ease;
  pointer-events: none;
  box-shadow: inset 0 0 20px var(--card-glow-color, rgba(16, 185, 129, 0.08));
}

.stat-card-glow:hover::before {
  opacity: 1;
}
```

Leave the surrounding rules (the gradient-text rule above and whatever follows below) untouched.

- [ ] **Step 3: Verify no stale references remain**

Run: `grep -rn "stat-card-glow\|--card-glow-color" src/`
Expected: no matches.

- [ ] **Step 4: Build the renderer to catch any CSS issues**

Run: `npm run typecheck`
Expected: passes.

Run: `npm run lint`
Expected: passes.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/index.css
git commit -m "style: remove dead stat-card-glow hover CSS"
```

---

## Task 3: Manual verification in the dev app

**Files:** none (manual visual check)

- [ ] **Step 1: Start the dev server**

Run: `npm run dev`
Expected: Vite serves on :5173 and Electron opens the AxiPulse window.

- [ ] **Step 2: Load a parsed fight**

Open any logged fight via History (or use a recent log if the watcher already parsed one). Navigate to the **Pulse** view.

- [ ] **Step 3: Hover-test each subview**

For each Pulse subview — **Overview**, **Damage**, **Defense**, **Support** — move the cursor over every `StatCard`. Confirm:

- No inner glow appears on hover.
- The left-border accent color is unchanged.
- The entrance animation on first render is unchanged.
- Cursor remains the default arrow (no `pointer` cursor — confirms we didn't accidentally make them look clickable in another way).

- [ ] **Step 4: Smoke-check unrelated hover states**

Hover over: navigation tabs, history rows, settings buttons, timeline elements. Confirm their hover states still work — we only touched `.stat-card-glow`, but a sanity check costs nothing.

- [ ] **Step 5: Stop the dev server**

Ctrl+C the `npm run dev` process.

- [ ] **Step 6: No commit needed**

This task is verification only. If issues are found, return to Task 1 or Task 2.

---

## Done Criteria

- `grep -rn "stat-card-glow" src/` returns nothing.
- `npm run typecheck` and `npm run lint` both pass.
- Manual hover test confirms no glow on any Pulse `StatCard` across all four subviews.
- Two clean commits on the branch.
