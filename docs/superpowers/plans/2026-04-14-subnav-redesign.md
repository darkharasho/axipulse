# Subnav Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the hidden slide-in/out subnav with an always-visible floating capsule rendered inside each view's content area.

**Architecture:** Remove `SubviewPillExpansion` and `SubviewToggle` from the nav chrome. Create a new `SubviewCapsule` component that each view (Pulse, Timeline, Map) renders at the top of its own content area. The capsule uses Framer Motion `layoutId` for a sliding background highlight behind the active pill. Timeline's existing `TimelinePresetBar` preset buttons become redundant (replaced by the capsule), but its lane toggle dots are preserved in a separate inline element.

**Tech Stack:** React, TypeScript, Framer Motion (already in project), Tailwind CSS, Zustand store

**Spec:** `docs/superpowers/specs/2026-04-14-subnav-redesign-design.md`

---

## File Structure

| Action | File | Responsibility |
|--------|------|---------------|
| Create | `src/renderer/app/SubviewCapsule.tsx` | Generic floating capsule component with pill rendering, active highlight, and Framer Motion `layoutId` animation |
| Modify | `src/renderer/app/AppLayout.tsx` | Remove `SubviewToggle`, `SubviewPillExpansion`, and related pill definitions/handlers from nav bar |
| Modify | `src/renderer/views/PulseView.tsx` | Render `SubviewCapsule` at top of content |
| Modify | `src/renderer/views/TimelineView.tsx` | Render `SubviewCapsule` at top of content, remove `TimelinePresetBar` preset buttons |
| Modify | `src/renderer/views/timeline/TimelinePresetBar.tsx` | Strip out preset buttons, keep only lane toggle dots, rename to `TimelineLaneToggles` |
| Modify | `src/renderer/views/MapView.tsx` | Render `SubviewCapsule` at top of content |
| Modify | `src/renderer/store.ts` | Remove `pillBarExpanded`, `setPillBarExpanded`, `togglePillBar` |
| Delete | `src/renderer/app/SubviewPillBar.tsx` | Replaced entirely by `SubviewCapsule` |

---

### Task 1: Create SubviewCapsule component

**Files:**
- Create: `src/renderer/app/SubviewCapsule.tsx`

- [ ] **Step 1: Create the SubviewCapsule component**

Create `src/renderer/app/SubviewCapsule.tsx`:

```tsx
import { motion } from 'framer-motion';

interface PillDef {
    id: string;
    label: string;
}

interface SubviewCapsuleProps {
    pills: PillDef[];
    activeId: string;
    onSelect: (id: string) => void;
    layoutGroup: string;
}

export function SubviewCapsule({ pills, activeId, onSelect, layoutGroup }: SubviewCapsuleProps) {
    return (
        <div
            className="inline-flex items-center gap-[1px] rounded-[9px] p-[3px] mb-3"
            style={{
                background: '#0a0a16',
                border: '1px solid rgba(255,255,255,0.024)',
                boxShadow: '0 1px 4px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.015)',
            }}
        >
            {pills.map(pill => {
                const isActive = pill.id === activeId;
                return (
                    <button
                        key={pill.id}
                        onClick={() => onSelect(pill.id)}
                        className="relative px-[13px] py-[5px] rounded-[6px] text-[10px] transition-colors duration-150 cursor-pointer"
                        style={{
                            color: isActive ? 'var(--brand-primary)' : '#555',
                            fontWeight: isActive ? 500 : 400,
                        }}
                    >
                        {isActive && (
                            <motion.div
                                layoutId={`capsule-highlight-${layoutGroup}`}
                                className="absolute inset-0 rounded-[6px]"
                                style={{
                                    background: 'linear-gradient(135deg, rgba(16,185,129,0.13), rgba(16,185,129,0.06))',
                                    boxShadow: '0 0 10px rgba(16,185,129,0.06), inset 0 1px 0 rgba(16,185,129,0.08)',
                                }}
                                transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                            />
                        )}
                        <span className="relative z-10">{pill.label}</span>
                    </button>
                );
            })}
        </div>
    );
}
```

The `layoutGroup` prop ensures each view's capsule has its own animation namespace so Framer Motion doesn't try to animate between different views.

- [ ] **Step 2: Verify the file was created**

Run: `ls -la src/renderer/app/SubviewCapsule.tsx`
Expected: File exists

- [ ] **Step 3: Commit**

```bash
git add src/renderer/app/SubviewCapsule.tsx
git commit -m "feat: add SubviewCapsule component with floating pill design"
```

---

### Task 2: Integrate capsule into PulseView

**Files:**
- Modify: `src/renderer/views/PulseView.tsx`

- [ ] **Step 1: Add SubviewCapsule to PulseView**

Replace the full contents of `src/renderer/views/PulseView.tsx` with:

```tsx
import { useAppStore, type PulseSubview } from '../store';
import { SubviewCapsule } from '../app/SubviewCapsule';
import { OverviewSubview } from './pulse/OverviewSubview';
import { DamageSubview } from './pulse/DamageSubview';
import { SupportSubview } from './pulse/SupportSubview';
import { DefenseSubview } from './pulse/DefenseSubview';
import { BoonsSubview } from './pulse/BoonsSubview';
import { Activity } from 'lucide-react';

const PULSE_PILLS = [
    { id: 'overview', label: 'Overview' },
    { id: 'damage', label: 'Damage' },
    { id: 'support', label: 'Support' },
    { id: 'defense', label: 'Defense' },
    { id: 'boons', label: 'Boons' },
];

export function PulseView() {
    const currentFight = useAppStore(s => s.currentFight);
    const subview = useAppStore(s => s.pulseSubview);
    const setPulseSubview = useAppStore(s => s.setPulseSubview);

    if (!currentFight) {
        return (
            <div className="flex flex-col items-center justify-center h-full gap-4 text-[color:var(--text-muted)]">
                <Activity className="w-12 h-12 opacity-30" />
                <div className="text-center">
                    <p className="text-sm font-medium text-[color:var(--text-secondary)]">Waiting for combat data</p>
                    <p className="text-xs mt-1">Set your arcdps log directory in Settings to begin</p>
                </div>
            </div>
        );
    }

    return (
        <>
            <SubviewCapsule
                pills={PULSE_PILLS}
                activeId={subview}
                onSelect={(id) => setPulseSubview(id as PulseSubview)}
                layoutGroup="pulse"
            />
            {subview === 'overview' && <OverviewSubview data={currentFight} />}
            {subview === 'damage' && <DamageSubview data={currentFight} />}
            {subview === 'support' && <SupportSubview data={currentFight} />}
            {subview === 'defense' && <DefenseSubview data={currentFight} />}
            {subview === 'boons' && <BoonsSubview data={currentFight} />}
        </>
    );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit --project tsconfig.json 2>&1 | head -20`
Expected: No errors related to PulseView

- [ ] **Step 3: Commit**

```bash
git add src/renderer/views/PulseView.tsx
git commit -m "feat: integrate SubviewCapsule into PulseView"
```

---

### Task 3: Integrate capsule into TimelineView and refactor TimelinePresetBar

**Files:**
- Modify: `src/renderer/views/TimelineView.tsx`
- Modify: `src/renderer/views/timeline/TimelinePresetBar.tsx`

The Timeline has a unique situation: it already has `TimelinePresetBar` inside its content area which renders preset buttons AND lane toggle dots. The preset buttons are now handled by the `SubviewCapsule`, so `TimelinePresetBar` should be stripped down to only the lane toggle dots.

- [ ] **Step 1: Refactor TimelinePresetBar to only contain lane toggles**

Replace the full contents of `src/renderer/views/timeline/TimelinePresetBar.tsx` with:

```tsx
import { useAppStore } from '../../store';
import { TIMELINE_LANES } from './TimelinePresets';

export function TimelineLaneToggles() {
    const toggles = useAppStore(s => s.timelineToggles);
    const setToggle = useAppStore(s => s.setTimelineToggle);

    return (
        <div className="flex items-center gap-1.5">
            <span className="text-[9px] text-[color:var(--text-muted)]">Lanes:</span>
            {TIMELINE_LANES.map(lane => (
                <div
                    key={lane.key}
                    title={lane.label}
                    onClick={() => setToggle(lane.key, !toggles[lane.key])}
                    className="w-2 h-2 rounded-sm cursor-pointer transition-opacity"
                    style={{
                        background: lane.color,
                        opacity: toggles[lane.key] ? 0.9 : 0.25,
                    }}
                />
            ))}
        </div>
    );
}
```

- [ ] **Step 2: Update TimelineView to use SubviewCapsule and lane toggles**

Replace the full contents of `src/renderer/views/TimelineView.tsx` with:

```tsx
import { useAppStore, type TimelinePreset } from '../store';
import { SubviewCapsule } from '../app/SubviewCapsule';
import { TimelineLaneToggles } from './timeline/TimelinePresetBar';
import { TimelineSwimlanes } from './timeline/TimelineSwimlanes';
import { TimelineInspector } from './timeline/TimelineInspector';
import { GanttChart } from 'lucide-react';

const TIMELINE_PILLS = [
    { id: 'why-died', label: 'Why did I die?' },
    { id: 'my-damage', label: 'My damage' },
    { id: 'support', label: 'Getting support?' },
    { id: 'show-all', label: 'Show all' },
    { id: 'custom', label: 'Custom' },
];

export function TimelineView() {
    const currentFight = useAppStore(s => s.currentFight);
    const preset = useAppStore(s => s.timelinePreset);
    const toggles = useAppStore(s => s.timelineToggles);
    const selection = useAppStore(s => s.timelineSelection);
    const setSelection = useAppStore(s => s.setTimelineSelection);
    const applyPreset = useAppStore(s => s.applyPreset);
    const setTimelinePreset = useAppStore(s => s.setTimelinePreset);

    if (!currentFight) {
        return (
            <div className="flex flex-col items-center justify-center h-full gap-4 text-[color:var(--text-muted)]">
                <GanttChart className="w-12 h-12 opacity-30" />
                <div className="text-center">
                    <p className="text-sm font-medium text-[color:var(--text-secondary)]">Fight Timeline</p>
                    <p className="text-xs mt-1">Timeline analysis will appear here after a fight is parsed</p>
                </div>
            </div>
        );
    }

    const handlePresetSelect = (id: string) => {
        if (id !== 'custom') {
            applyPreset(id as Exclude<TimelinePreset, 'custom'>);
        }
        setTimelinePreset(id as TimelinePreset);
    };

    return (
        <div className="flex flex-col h-full overflow-y-auto px-2 py-2">
            <div className="flex items-center justify-between mb-3">
                <SubviewCapsule
                    pills={TIMELINE_PILLS}
                    activeId={preset}
                    onSelect={handlePresetSelect}
                    layoutGroup="timeline"
                />
                <TimelineLaneToggles />
            </div>
            <TimelineSwimlanes
                data={currentFight.timeline}
                toggles={toggles}
                durationMs={currentFight.duration}
                onSelectionChange={setSelection}
                selection={selection}
            />
            {selection && (
                <TimelineInspector
                    data={currentFight.timeline}
                    selection={selection}
                    topDamageTakenSkills={currentFight.defense.topDamageTakenSkills}
                />
            )}
        </div>
    );
}
```

Note: The capsule and lane toggles sit in a flex row — capsule on the left, lane dots on the right. The `mb-3` on the capsule is removed since the wrapper div handles spacing.

- [ ] **Step 3: Update SubviewCapsule to not add bottom margin when in a flex container**

Actually, the `mb-3` in SubviewCapsule would conflict with the Timeline's flex layout. Remove `mb-3` from the capsule component and let each view control its own spacing. Edit `src/renderer/app/SubviewCapsule.tsx` — change the outer div's `className` from:

```
"inline-flex items-center gap-[1px] rounded-[9px] p-[3px] mb-3"
```
to:
```
"inline-flex items-center gap-[1px] rounded-[9px] p-[3px]"
```

Then update `PulseView.tsx` to wrap the capsule in a `<div className="mb-3">` tag:

In `src/renderer/views/PulseView.tsx`, change:
```tsx
            <SubviewCapsule
                pills={PULSE_PILLS}
                activeId={subview}
                onSelect={(id) => setPulseSubview(id as PulseSubview)}
                layoutGroup="pulse"
            />
```
to:
```tsx
            <div className="mb-3">
                <SubviewCapsule
                    pills={PULSE_PILLS}
                    activeId={subview}
                    onSelect={(id) => setPulseSubview(id as PulseSubview)}
                    layoutGroup="pulse"
                />
            </div>
```

- [ ] **Step 4: Verify TypeScript compiles**

Run: `npx tsc --noEmit --project tsconfig.json 2>&1 | head -20`
Expected: No errors related to TimelineView or TimelinePresetBar

- [ ] **Step 5: Commit**

```bash
git add src/renderer/views/TimelineView.tsx src/renderer/views/timeline/TimelinePresetBar.tsx src/renderer/app/SubviewCapsule.tsx src/renderer/views/PulseView.tsx
git commit -m "feat: integrate SubviewCapsule into TimelineView, refactor lane toggles"
```

---

### Task 4: Integrate capsule into MapView

**Files:**
- Modify: `src/renderer/views/MapView.tsx`

- [ ] **Step 1: Add SubviewCapsule to MapView**

MapView currently switches between `MapOverview` and `MovementView` based on `mapSubview` store state (lines 8-14). The capsule needs to render above whichever subview is active.

At the top of `src/renderer/views/MapView.tsx`, add the imports:

```tsx
import { SubviewCapsule } from '../app/SubviewCapsule';
import type { MapSubview } from '../store';
```

Add the pill definitions after the existing imports:

```tsx
const MAP_PILLS = [
    { id: 'overview', label: 'Overview' },
    { id: 'movement', label: 'Movement' },
];
```

Replace the `MapView` function (lines 8-15) with:

```tsx
export function MapView() {
    const mapSubview = useAppStore(s => s.mapSubview);
    const setMapSubview = useAppStore(s => s.setMapSubview);

    return (
        <div className="flex flex-col h-full">
            <div className="mb-3 shrink-0">
                <SubviewCapsule
                    pills={MAP_PILLS}
                    activeId={mapSubview}
                    onSelect={(id) => setMapSubview(id as MapSubview)}
                    layoutGroup="map"
                />
            </div>
            <div className="flex-1 min-h-0">
                {mapSubview === 'movement' ? <MovementView /> : <MapOverview />}
            </div>
        </div>
    );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit --project tsconfig.json 2>&1 | head -20`
Expected: No errors related to MapView

- [ ] **Step 3: Commit**

```bash
git add src/renderer/views/MapView.tsx
git commit -m "feat: integrate SubviewCapsule into MapView"
```

---

### Task 5: Clean up AppLayout and store

**Files:**
- Modify: `src/renderer/app/AppLayout.tsx`
- Modify: `src/renderer/store.ts`
- Delete: `src/renderer/app/SubviewPillBar.tsx`

- [ ] **Step 1: Remove subnav from AppLayout**

In `src/renderer/app/AppLayout.tsx`:

1. Remove the import of `SubviewToggle` and `SubviewPillExpansion` (line 4):
   ```
   import { SubviewToggle, SubviewPillExpansion } from './SubviewPillBar';
   ```

2. Remove the pill definition constants `PULSE_PILLS`, `MAP_PILLS`, `TIMELINE_PILLS` (lines 21-40).

3. Remove these store subscriptions from the component body (lines 47-53):
   ```tsx
   const pulseSubview = useAppStore(s => s.pulseSubview);
   const setPulseSubview = useAppStore(s => s.setPulseSubview);
   const mapSubview = useAppStore(s => s.mapSubview);
   const setMapSubview = useAppStore(s => s.setMapSubview);
   const timelinePreset = useAppStore(s => s.timelinePreset);
   const setTimelinePreset = useAppStore(s => s.setTimelinePreset);
   const applyPreset = useAppStore(s => s.applyPreset);
   ```

4. Remove these derived values and handler (lines 71-86):
   ```tsx
   const hasSubviews = view === 'pulse' || view === 'map' || view === 'timeline';
   const pills = view === 'pulse' ? PULSE_PILLS : ...
   const activeSubviewId = view === 'pulse' ? pulseSubview : ...

   const handleSubviewSelect = (id: string) => { ... };
   ```

5. In the nav bar JSX, remove the SubviewToggle section (lines 157-166) — the entire block:
   ```tsx
   <div className="flex items-center gap-2">
       {IS_DEV && ( ... )}
       {hasSubviews && (
           <SubviewToggle pills={pills} activeId={activeSubviewId} />
       )}
   </div>
   ```
   Keep only the dev dice icon if `IS_DEV`:
   ```tsx
   {IS_DEV && (
       <span title="Parse random log (Ctrl+Shift+P)" onClick={() => window.electronAPI?.devParseRandom()} className="cursor-pointer text-amber-300 hover:text-amber-200 transition-colors">
           <Dices className="w-4 h-4" />
       </span>
   )}
   ```

6. Remove the subview pill expansion area (lines 169-172):
   ```tsx
   {hasSubviews && (
       <SubviewPillExpansion pills={pills} activeId={activeSubviewId} onSelect={handleSubviewSelect} />
   )}
   ```

7. Clean up unused imports: remove `type PulseSubview`, `type MapSubview`, `type TimelinePreset` from the store import if no longer used. The store import should become:
   ```tsx
   import { useAppStore, type View } from '../store';
   ```

- [ ] **Step 2: Remove pillBar state from store**

In `src/renderer/store.ts`:

1. Remove from the `AppState` interface (lines 56-58):
   ```tsx
   pillBarExpanded: boolean;
   setPillBarExpanded: (expanded: boolean) => void;
   togglePillBar: () => void;
   ```

2. Remove from the store implementation (lines 106-108):
   ```tsx
   pillBarExpanded: false,
   setPillBarExpanded: (expanded) => set({ pillBarExpanded: expanded }),
   togglePillBar: () => set((state) => ({ pillBarExpanded: !state.pillBarExpanded })),
   ```

- [ ] **Step 3: Delete SubviewPillBar.tsx**

Run: `rm src/renderer/app/SubviewPillBar.tsx`

- [ ] **Step 4: Verify TypeScript compiles**

Run: `npx tsc --noEmit --project tsconfig.json 2>&1 | head -20`
Expected: No errors. If there are remaining imports of `SubviewPillBar`, fix them.

- [ ] **Step 5: Verify the app runs**

Run: `npm run dev`
Expected: App starts without errors. Verify in browser:
- Pulse view shows the floating capsule with 5 pills, Overview is active
- Click each pill — highlight slides smoothly, content switches
- Timeline shows capsule with presets + lane toggle dots on the right
- Map shows capsule with 2 pills
- History and Settings show no capsule
- Nav bar no longer has the chevron toggle button

- [ ] **Step 6: Commit**

```bash
git add -u
git add src/renderer/app/AppLayout.tsx src/renderer/store.ts
git commit -m "refactor: remove SubviewPillBar, clean up AppLayout and store"
```

---

### Task 6: Add hover states to capsule pills

**Files:**
- Modify: `src/renderer/app/SubviewCapsule.tsx`

- [ ] **Step 1: Add hover interaction**

In `src/renderer/app/SubviewCapsule.tsx`, update the button element to include hover styling. Replace the button's `className` and `style` with:

```tsx
<button
    key={pill.id}
    onClick={() => onSelect(pill.id)}
    className="relative px-[13px] py-[5px] rounded-[6px] text-[10px] transition-colors duration-150 cursor-pointer hover:text-[color:var(--text-secondary)]"
    style={{
        color: isActive ? 'var(--brand-primary)' : undefined,
        fontWeight: isActive ? 500 : 400,
    }}
>
```

The key change: added `hover:text-[color:var(--text-secondary)]` to the className. The inactive color `#555` is set via default styling, and the hover brightens it. The active state's inline `color` style takes precedence over the hover class.

- [ ] **Step 2: Verify in browser**

Run: `npm run dev`
Expected: Hovering over inactive pills brightens their text color. Active pill color remains emerald.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/app/SubviewCapsule.tsx
git commit -m "feat: add hover states to capsule pills"
```
