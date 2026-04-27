# Persist Map Follow Toggle Across Fights

## Problem

On the Map view (Movement subview), the **Follow** button currently resets to `false` every time the user switches between fights in history. Users have to re-enable it on each new entry, which is friction when reviewing several fights in a row.

Source: Discord thread "AxiPulse Map Page UI" (1498417382828408863).

## Goal

Make the Follow toggle remember its on/off state for the duration of the app session, so switching between history entries no longer clears it.

## Non-goals

- Persistence across app restarts (session-only).
- Changing what the toggle follows — it still follows the local player (you), not the commander or an arbitrary target.
- Changes to other map controls (Show Squad, party panel, etc.).

## Design

Lift the `followPlayer` state from `MovementView`'s local `useState` into the existing Zustand `useAppStore`. Zustand state is process-lifetime by default, which gives us session-only persistence with no extra wiring and matches the pattern already used for other cross-fight UI state (e.g. `mapSubview`, `timelinePreset`).

### Store changes — `src/renderer/store.ts`

Add to `AppState`:

```ts
mapFollowPlayer: boolean;
setMapFollowPlayer: (value: boolean) => void;
```

Initialize `mapFollowPlayer: false` in the store creator and implement `setMapFollowPlayer` as `(value) => set({ mapFollowPlayer: value })`.

### MovementView changes — `src/renderer/views/map/MovementView.tsx`

Replace:

```ts
const [followPlayer, setFollowPlayer] = useState(false);
```

with:

```ts
const followPlayer = useAppStore(s => s.mapFollowPlayer);
const setFollowPlayer = useAppStore(s => s.setMapFollowPlayer);
```

All existing call sites keep their semantics:
- Button `onClick={() => setFollowPlayer(v => !v)}` → rewritten as `onClick={() => setFollowPlayer(!followPlayer)}` (Zustand setters take a value, not an updater).
- `setFollowPlayer(false)` inside `handleMouseDown` keeps the existing "drag turns off Follow" behavior.
- The follow effect's dependency `[followPlayer, timeMs, currentFight]` continues to work — `followPlayer` is now a store value but is still a stable boolean.

## Testing

Manual verification:

1. Toggle Follow ON, switch to a different fight in history → Follow stays ON, view snaps to the local player in the new fight.
2. Drag the map while Follow is ON → Follow turns OFF (preserves existing escape hatch).
3. Restart the app → Follow is OFF (session-only persistence confirmed).

Type-check (`npm run build`) must pass.
