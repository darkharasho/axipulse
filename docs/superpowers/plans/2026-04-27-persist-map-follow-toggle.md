# Persist Map Follow Toggle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Map view's Follow toggle remember its on/off state across history-instance switches for the duration of the app session.

**Architecture:** Lift `followPlayer` from `MovementView`'s local `useState` into the existing Zustand `useAppStore`. Zustand state lives for the process lifetime, giving us free session-only persistence and matching the pattern already used for other cross-fight UI state (`mapSubview`, `timelinePreset`, etc.).

**Tech Stack:** React, TypeScript, Zustand, Vite. (Component tests are not used for renderer state in this codebase — verification is manual + `npm run build` typecheck.)

Spec: `docs/superpowers/specs/2026-04-27-persist-map-follow-toggle-design.md`

---

## File Structure

- **Modify:** `src/renderer/store.ts` — add `mapFollowPlayer` field and `setMapFollowPlayer` action to `AppState` and the store creator.
- **Modify:** `src/renderer/views/map/MovementView.tsx` — replace local `useState` for `followPlayer` with reads from the store; adjust the toggle button's `onClick` to use a value (not an updater function).

No new files. No tests added — this is pure UI state plumbing in a React component, and the codebase only has Vitest tests for shared/main-process logic, not renderer components.

---

### Task 1: Add `mapFollowPlayer` to the Zustand store

**Files:**
- Modify: `src/renderer/store.ts`

- [ ] **Step 1: Add the field and action to the `AppState` interface**

In `src/renderer/store.ts`, find the `AppState` interface (around lines 41–84). Add the following two lines somewhere near the other map/view state (e.g. immediately after the `mapSubview` / `setMapSubview` pair on lines 54–55):

```ts
    mapFollowPlayer: boolean;
    setMapFollowPlayer: (value: boolean) => void;
```

- [ ] **Step 2: Initialize the field and implement the action in the store creator**

In the `create<AppState>(...)` call (starting line 86), add the two entries near the other map state (e.g. immediately after the `setMapSubview` line — currently line 107):

```ts
    mapFollowPlayer: false,
    setMapFollowPlayer: (value) => set({ mapFollowPlayer: value }),
```

- [ ] **Step 3: Typecheck**

Run: `npm run build`

Expected: build succeeds (TypeScript compiles cleanly). If TS reports an error about missing properties on `AppState`, you missed adding them either to the interface or the creator — fix and re-run.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/store.ts
git commit -m "feat(store): add mapFollowPlayer session state"
```

---

### Task 2: Wire `MovementView` to the store

**Files:**
- Modify: `src/renderer/views/map/MovementView.tsx`

- [ ] **Step 1: Replace the local `useState` with store selectors**

In `src/renderer/views/map/MovementView.tsx`, find this line (currently line 131):

```ts
    const [followPlayer, setFollowPlayer] = useState(false);
```

Replace it with:

```ts
    const followPlayer = useAppStore(s => s.mapFollowPlayer);
    const setFollowPlayer = useAppStore(s => s.setMapFollowPlayer);
```

`useAppStore` is already imported at the top of the file (line 3) — no new import needed.

- [ ] **Step 2: Update the toggle button's `onClick` to pass a value**

The existing button (currently line 344) uses an updater function:

```tsx
                        onClick={() => setFollowPlayer(v => !v)}
```

Zustand's setter takes a value, not an updater. Change it to:

```tsx
                        onClick={() => setFollowPlayer(!followPlayer)}
```

Leave the other call site — `setFollowPlayer(false)` inside `handleMouseDown` (currently line 242) — unchanged. It already passes a value and preserves the existing "drag turns off Follow" behavior.

- [ ] **Step 3: Verify `useState` is still imported only as needed**

`useState` is still used elsewhere in the file (e.g. `view`, `timeMs`, `hoveredMember`, `showSquad`, `playing`, `playSpeed`, `showPanel`). Do **not** remove it from the import on line 1.

- [ ] **Step 4: Typecheck**

Run: `npm run build`

Expected: build succeeds. The follow effect's dependency array `[followPlayer, timeMs, currentFight]` (line 213) continues to work — `followPlayer` is still a stable boolean.

- [ ] **Step 5: Manual verification**

Run: `npm run dev`

Then in the running app:
1. Load a fight that has movement data and navigate to **Map → Movement**.
2. Click **Follow** to enable it. The view should snap to the local player (you).
3. Switch to a different fight via the History view.
4. Return to Map → Movement. **Expected:** the Follow button is still highlighted (ON) and the view is centered on the local player in the new fight.
5. With Follow still ON, drag the map. **Expected:** Follow turns OFF (existing escape hatch preserved).
6. Stop the dev server, restart with `npm run dev`. **Expected:** Follow defaults to OFF (session-only persistence).

If any of these fail, check that the store action is wired correctly and that the button now passes `!followPlayer` rather than an updater.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/views/map/MovementView.tsx
git commit -m "feat(map): persist Follow toggle across history switches"
```

---

## Done

After both tasks are complete and committed, the Follow toggle will persist across history-instance swaps for the lifetime of the app session, with no behavior change to the existing on/drag-off interactions.
