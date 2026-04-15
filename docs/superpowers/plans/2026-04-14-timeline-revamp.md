# Timeline View Revamp Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single-chart Timeline view with a swimlane + inspector design that shows 10 data lanes (health, damage, boons, CC conditions) with a drag-to-select inspector panel.

**Architecture:** Data layer first (types, extraction, tests), then UI layer (swimlane components, inspector panel). The swimlanes use Recharts for continuous data lanes and custom SVG for boon/condition bar lanes. A transparent overlay div handles drag-select interaction across all lanes.

**Tech Stack:** React, TypeScript, Recharts, Zustand, Vitest, Tailwind CSS

**Spec:** `docs/superpowers/specs/2026-04-14-timeline-revamp-design.md`

---

## File Structure

### Files to Modify
- `src/shared/types.ts` — Update `TimelineData` interface, add buff/condition state types
- `src/shared/boonData.ts` — Add condition ID sets (hard CC, soft CC) and grouped boon ID sets
- `src/shared/extractPlayerData.ts` — Extract health timeline, boon/condition state timelines, expanded icon set
- `src/renderer/store.ts` — New `TimelineLayerToggles` with 10 lanes, updated presets, selection state
- `src/renderer/views/TimelineView.tsx` — New layout: preset bar + swimlanes + inspector
- `src/renderer/views/timeline/TimelinePresets.ts` — Updated lane definitions for 10 lanes

### Files to Create
- `src/renderer/views/timeline/TimelinePresetBar.tsx` — Preset buttons + lane toggle dots
- `src/renderer/views/timeline/TimelineSwimlanes.tsx` — Swimlane container with shared time axis + selection overlay
- `src/renderer/views/timeline/TimelineLane.tsx` — Single area-chart lane (health, damage, distance, healing, barrier)
- `src/renderer/views/timeline/TimelineBoonLane.tsx` — Horizontal bar lane for boons/conditions with icons
- `src/renderer/views/timeline/TimelineEventMarkers.tsx` — Down/death vertical markers spanning all lanes
- `src/renderer/views/timeline/TimelineInspector.tsx` — Inspector panel container (4 columns)
- `src/renderer/views/timeline/inspector/HealthPanel.tsx` — Health trajectory mini-chart
- `src/renderer/views/timeline/inspector/BoonStatePanel.tsx` — Boon state list with icons
- `src/renderer/views/timeline/inspector/TopHitsPanel.tsx` — Incoming damage skill list with icons
- `src/renderer/views/timeline/inspector/PositionPanel.tsx` — Distance to tag display
- `src/shared/timelineInspector.ts` — Pure functions for computing inspector data from a time range
- `tests/shared/timelineInspector.test.ts` — Tests for inspector computation functions

### Files to Delete
- `src/renderer/views/timeline/TimelineChart.tsx` — Replaced by swimlane components
- `src/renderer/views/timeline/TimelineControls.tsx` — Replaced by TimelinePresetBar

### Test Files to Modify
- `tests/shared/timelineData.test.ts` — Add tests for new extraction functions if any
- `tests/shared/extractPlayerData.test.ts` — Update for new TimelineData shape

---

## Task 1: Add Condition/CC ID Sets and Grouped Boon Sets to boonData.ts

**Files:**
- Modify: `src/shared/boonData.ts`
- Modify: `tests/shared/boonData.test.ts`

- [ ] **Step 1: Write failing test for condition ID sets**

Add to `tests/shared/boonData.test.ts`:

```typescript
import { WVW_BOON_IDS, OFFENSIVE_BOON_IDS, DEFENSIVE_BOON_IDS, HARD_CC_IDS, SOFT_CC_IDS, CONDITION_NAMES } from '../../src/shared/boonData';

describe('boon and condition ID sets', () => {
    it('has offensive boon IDs as subset of WVW_BOON_IDS', () => {
        for (const id of OFFENSIVE_BOON_IDS) {
            expect(WVW_BOON_IDS.has(id)).toBe(true);
        }
    });

    it('has defensive boon IDs as subset of WVW_BOON_IDS', () => {
        for (const id of DEFENSIVE_BOON_IDS) {
            expect(WVW_BOON_IDS.has(id)).toBe(true);
        }
    });

    it('offensive boons include Might, Fury, Quickness, Alacrity', () => {
        expect(OFFENSIVE_BOON_IDS.size).toBe(4);
        expect(OFFENSIVE_BOON_IDS.has(740)).toBe(true);  // Might
        expect(OFFENSIVE_BOON_IDS.has(725)).toBe(true);  // Fury
        expect(OFFENSIVE_BOON_IDS.has(1187)).toBe(true); // Quickness
        expect(OFFENSIVE_BOON_IDS.has(30328)).toBe(true); // Alacrity
    });

    it('defensive boons include Stability, Protection, Resistance, Aegis', () => {
        expect(DEFENSIVE_BOON_IDS.size).toBe(4);
        expect(DEFENSIVE_BOON_IDS.has(1122)).toBe(true);  // Stability
        expect(DEFENSIVE_BOON_IDS.has(717)).toBe(true);    // Protection
        expect(DEFENSIVE_BOON_IDS.has(26980)).toBe(true);  // Resistance
        expect(DEFENSIVE_BOON_IDS.has(743)).toBe(true);    // Aegis
    });

    it('hard CC IDs are defined', () => {
        expect(HARD_CC_IDS.size).toBeGreaterThan(0);
        for (const id of HARD_CC_IDS) {
            expect(CONDITION_NAMES[id]).toBeDefined();
        }
    });

    it('soft CC IDs are defined', () => {
        expect(SOFT_CC_IDS.size).toBeGreaterThan(0);
        for (const id of SOFT_CC_IDS) {
            expect(CONDITION_NAMES[id]).toBeDefined();
        }
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/shared/boonData.test.ts`
Expected: FAIL — `OFFENSIVE_BOON_IDS` not exported

- [ ] **Step 3: Add grouped boon sets and condition ID sets**

In `src/shared/boonData.ts`, add after the `WVW_BOON_IDS` line (line 19):

```typescript
export const OFFENSIVE_BOON_IDS = new Set([740, 725, 1187, 30328]); // Might, Fury, Quickness, Alacrity
export const DEFENSIVE_BOON_IDS = new Set([1122, 717, 26980, 743]); // Stability, Protection, Resistance, Aegis

// Condition IDs — these are GW2 API buff IDs. The EI JSON uses these same IDs
// in buffUptimes[].id. Verify against a real EI JSON parse if any are missing.
// The buffMap classification field can help: look for entries where
// classification is not "Boon".
export const CONDITION_NAMES: Record<number, string> = {
    872: 'Stun',
    833: 'Daze',
    785: 'Fear',
    727: 'Immobilize',
    722: 'Chill',
    26766: 'Slow',
    // Knockdown and Float may use different IDs in EI — verify during testing.
    // Add them here once confirmed from a real parse.
};

export const HARD_CC_IDS = new Set([872, 833, 785]); // Stun, Daze, Fear
export const SOFT_CC_IDS = new Set([722, 727, 26766]); // Chill, Immobilize, Slow

export const ALL_TRACKED_BUFF_IDS = new Set([
    ...WVW_BOON_IDS,
    ...HARD_CC_IDS,
    ...SOFT_CC_IDS,
]);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/shared/boonData.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/shared/boonData.ts tests/shared/boonData.test.ts
git commit -m "feat(timeline): add grouped boon sets and condition ID constants"
```

---

## Task 2: Update TimelineData Interface

**Files:**
- Modify: `src/shared/types.ts`

- [ ] **Step 1: Add BuffStateTimeline type and update TimelineData**

In `src/shared/types.ts`, add before `TimelineData` (before line 218):

```typescript
export interface BuffStateEntry {
    name: string;
    icon: string;
    states: [number, number][];
}
```

Then replace the `TimelineData` interface (lines 218-231) with:

```typescript
export interface TimelineData {
    bucketSizeMs: number;
    damageDealt: TimelineBucket[];
    damageTaken: TimelineBucket[];
    distanceToTag: TimelineBucket[];
    incomingHealing: TimelineBucket[];
    incomingBarrier: TimelineBucket[];
    healthPercent: [number, number][];
    offensiveBoons: Record<number, BuffStateEntry>;
    defensiveBoons: Record<number, BuffStateEntry>;
    hardCC: Record<number, BuffStateEntry>;
    softCC: Record<number, BuffStateEntry>;
    deathEvents: number[];
    downEvents: number[];
}
```

- [ ] **Step 2: Run type check to find all breakages**

Run: `npx tsc --noEmit`
Expected: Type errors in `extractPlayerData.ts` (returns old fields), `TimelineChart.tsx` (references old fields), `store.ts` (references old toggle keys), and tests. This is expected — we fix them in subsequent tasks.

- [ ] **Step 3: Commit**

```bash
git add src/shared/types.ts
git commit -m "feat(timeline): update TimelineData interface with boon/condition state timelines"
```

---

## Task 3: Update buildTimeline to Extract New Data

**Files:**
- Modify: `src/shared/extractPlayerData.ts`
- Modify: `tests/shared/extractPlayerData.test.ts`

- [ ] **Step 1: Write failing test for new timeline fields**

Add to `tests/shared/extractPlayerData.test.ts`:

```typescript
it('extracts health percent timeline', () => {
    const json = makeMinimalEiJson();
    json.players[0].healthPercents = [[0, 100], [5000, 80], [10000, 0]];
    const result = extractPlayerFightData(json, 1, 1000);
    expect(result.timeline.healthPercent).toEqual([[0, 100], [5000, 80], [10000, 0]]);
});

it('extracts offensive boon state timelines', () => {
    const json = makeMinimalEiJson();
    json.players[0].buffUptimes = [
        { id: 740, buffData: [{ uptime: 80, generation: 0, overstack: 0, wasted: 0 }], states: [[0, 15], [5000, 25]] },
    ];
    json.buffMap = { 'b740': { name: 'Might', stacking: 'intensity', icon: 'https://example.com/might.png' } };
    const result = extractPlayerFightData(json, 1, 1000);
    expect(result.timeline.offensiveBoons[740]).toBeDefined();
    expect(result.timeline.offensiveBoons[740].name).toBe('Might');
    expect(result.timeline.offensiveBoons[740].icon).toBe('https://example.com/might.png');
    expect(result.timeline.offensiveBoons[740].states).toEqual([[0, 15], [5000, 25]]);
});

it('extracts defensive boon state timelines', () => {
    const json = makeMinimalEiJson();
    json.players[0].buffUptimes = [
        { id: 1122, buffData: [{ uptime: 50, generation: 0, overstack: 0, wasted: 0 }], states: [[0, 1], [3000, 0]] },
    ];
    json.buffMap = { 'b1122': { name: 'Stability', stacking: 'stacking', icon: 'https://example.com/stab.png' } };
    const result = extractPlayerFightData(json, 1, 1000);
    expect(result.timeline.defensiveBoons[1122]).toBeDefined();
    expect(result.timeline.defensiveBoons[1122].name).toBe('Stability');
});

it('extracts condition state timelines when present', () => {
    const json = makeMinimalEiJson();
    json.players[0].buffUptimes = [
        { id: 722, buffData: [{ uptime: 10, generation: 0, overstack: 0, wasted: 0 }], states: [[2000, 1], [4000, 0]] },
    ];
    json.buffMap = { 'b722': { name: 'Chilled', stacking: 'duration', icon: 'https://example.com/chill.png' } };
    const result = extractPlayerFightData(json, 1, 1000);
    expect(result.timeline.softCC[722]).toBeDefined();
    expect(result.timeline.softCC[722].name).toBe('Chilled');
});

it('defaults healthPercent to empty array when not available', () => {
    const json = makeMinimalEiJson();
    delete json.players[0].healthPercents;
    const result = extractPlayerFightData(json, 1, 1000);
    expect(result.timeline.healthPercent).toEqual([]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/shared/extractPlayerData.test.ts`
Expected: FAIL — old TimelineData shape doesn't have `healthPercent`, `offensiveBoons`, etc.

- [ ] **Step 3: Update buildTimeline function**

Replace the `buildTimeline` function in `src/shared/extractPlayerData.ts` (lines 52-96):

```typescript
import { WVW_BOON_IDS, OFFENSIVE_BOON_IDS, DEFENSIVE_BOON_IDS, HARD_CC_IDS, SOFT_CC_IDS, ALL_TRACKED_BUFF_IDS } from './boonData';
import type { BuffStateEntry } from './types';

function buildTimeline(json: EiJson, player: EiPlayer, bucketSizeMs: number): TimelineData {
    const damage1S = player.targetDamage1S?.[0] ?? player.damage1S?.[0] ?? [];
    const damageDealt = extractDamageTimeline(damage1S, bucketSizeMs);

    const damageTaken1S = player.damageTaken1S?.[0] ?? [];
    const damageTaken = extractDamageTimeline(damageTaken1S, bucketSizeMs);

    const healingReceived1S = player.extHealingStats?.healingReceived1S?.[0] ?? [];
    const incomingHealing = extractDamageTimeline(healingReceived1S, bucketSizeMs);

    const barrierReceived1S = player.extBarrierStats?.barrierReceived1S?.[0] ?? [];
    const incomingBarrier = extractDamageTimeline(barrierReceived1S, bucketSizeMs);

    let distanceToTag: TimelineBucket[] = [];
    const commander = findCommander(json.players);
    const meta = json.combatReplayMetaData;
    if (commander && player !== commander && meta?.pollingRate && meta?.inchToPixel) {
        const playerPos = player.combatReplayData?.positions ?? [];
        const tagPos = commander.combatReplayData?.positions ?? [];
        if (playerPos.length > 0 && tagPos.length > 0) {
            distanceToTag = extractDistanceToTagTimeline(playerPos, tagPos, meta.pollingRate, meta.inchToPixel, bucketSizeMs);
        }
    }

    const healthPercent: [number, number][] = player.healthPercents ?? [];

    const offensiveBoons: Record<number, BuffStateEntry> = {};
    const defensiveBoons: Record<number, BuffStateEntry> = {};
    const hardCC: Record<number, BuffStateEntry> = {};
    const softCC: Record<number, BuffStateEntry> = {};

    for (const buff of player.buffUptimes ?? []) {
        if (!buff.states || !ALL_TRACKED_BUFF_IDS.has(buff.id)) continue;
        const buffMeta = json.buffMap?.[`b${buff.id}`];
        const entry: BuffStateEntry = {
            name: buffMeta?.name ?? `Buff ${buff.id}`,
            icon: buffMeta?.icon ?? '',
            states: buff.states,
        };
        if (OFFENSIVE_BOON_IDS.has(buff.id)) offensiveBoons[buff.id] = entry;
        else if (DEFENSIVE_BOON_IDS.has(buff.id)) defensiveBoons[buff.id] = entry;
        else if (HARD_CC_IDS.has(buff.id)) hardCC[buff.id] = entry;
        else if (SOFT_CC_IDS.has(buff.id)) softCC[buff.id] = entry;
    }

    return {
        bucketSizeMs,
        damageDealt,
        damageTaken,
        distanceToTag,
        incomingHealing,
        incomingBarrier,
        healthPercent,
        offensiveBoons,
        defensiveBoons,
        hardCC,
        softCC,
        deathEvents: getDeathTimes(player),
        downEvents: getDownTimes(player),
    };
}
```

Also update the import at the top of `extractPlayerData.ts`. Replace the existing boonData import:

```typescript
import { WVW_BOON_IDS, OFFENSIVE_BOON_IDS, DEFENSIVE_BOON_IDS, HARD_CC_IDS, SOFT_CC_IDS, ALL_TRACKED_BUFF_IDS } from './boonData';
```

And update the `buildMovementData` function's boon icon extraction (around line 155) to use `ALL_TRACKED_BUFF_IDS` instead of `WVW_BOON_IDS`:

```typescript
const boonIcons: Record<number, { name: string; icon: string }> = {};
for (const [key, val] of Object.entries(json.buffMap ?? {})) {
    const id = Number(key.replace('b', ''));
    if (ALL_TRACKED_BUFF_IDS.has(id) && val.icon) {
        boonIcons[id] = { name: val.name, icon: val.icon };
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/shared/extractPlayerData.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/shared/extractPlayerData.ts tests/shared/extractPlayerData.test.ts
git commit -m "feat(timeline): extract health, boon states, and condition timelines"
```

---

## Task 4: Add Inspector Computation Functions

**Files:**
- Create: `src/shared/timelineInspector.ts`
- Create: `tests/shared/timelineInspector.test.ts`

- [ ] **Step 1: Write failing tests for inspector functions**

Create `tests/shared/timelineInspector.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { getHealthInRange, getBoonStateAtTime, getAvgDistanceInRange } from '../../src/shared/timelineInspector';
import type { TimelineBucket, BuffStateEntry } from '../../src/shared/types';

describe('getHealthInRange', () => {
    const healthPercent: [number, number][] = [
        [0, 100], [2000, 90], [5000, 60], [8000, 30], [10000, 0],
    ];

    it('returns health points within the time range', () => {
        const result = getHealthInRange(healthPercent, 2000, 8000);
        expect(result).toEqual([[2000, 90], [5000, 60], [8000, 30]]);
    });

    it('includes boundary points interpolated from before range', () => {
        const result = getHealthInRange(healthPercent, 3000, 6000);
        expect(result.length).toBeGreaterThanOrEqual(1);
        expect(result[0][0]).toBeLessThanOrEqual(3000);
    });

    it('returns empty for empty input', () => {
        expect(getHealthInRange([], 0, 5000)).toEqual([]);
    });
});

describe('getBoonStateAtTime', () => {
    it('returns current stack count at given time', () => {
        const entry: BuffStateEntry = {
            name: 'Might',
            icon: 'https://example.com/might.png',
            states: [[0, 15], [3000, 25], [7000, 0]],
        };
        expect(getBoonStateAtTime(entry, 5000)).toEqual({ name: 'Might', icon: 'https://example.com/might.png', stacks: 25, active: true });
    });

    it('returns inactive when stacks are 0', () => {
        const entry: BuffStateEntry = {
            name: 'Stability',
            icon: 'https://example.com/stab.png',
            states: [[0, 1], [3000, 0]],
        };
        const result = getBoonStateAtTime(entry, 5000);
        expect(result.active).toBe(false);
        expect(result.stacks).toBe(0);
    });

    it('finds when boon was last active for droppedAgoMs', () => {
        const entry: BuffStateEntry = {
            name: 'Stability',
            icon: 'https://example.com/stab.png',
            states: [[0, 1], [3000, 0]],
        };
        const result = getBoonStateAtTime(entry, 5000);
        expect(result.droppedAgoMs).toBe(2000);
    });

    it('returns no droppedAgoMs when boon was never active', () => {
        const entry: BuffStateEntry = {
            name: 'Aegis',
            icon: '',
            states: [[0, 0]],
        };
        const result = getBoonStateAtTime(entry, 5000);
        expect(result.droppedAgoMs).toBeUndefined();
    });
});

describe('getAvgDistanceInRange', () => {
    it('averages distance buckets within range', () => {
        const buckets: TimelineBucket[] = [
            { time: 0, value: 100 },
            { time: 1000, value: 200 },
            { time: 2000, value: 300 },
            { time: 3000, value: 400 },
            { time: 4000, value: 500 },
        ];
        const result = getAvgDistanceInRange(buckets, 1000, 3000);
        expect(result.avg).toBe(300);
        expect(result.max).toBe(400);
    });

    it('returns 0 for empty range', () => {
        const result = getAvgDistanceInRange([], 0, 5000);
        expect(result.avg).toBe(0);
        expect(result.max).toBe(0);
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/shared/timelineInspector.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement inspector functions**

Create `src/shared/timelineInspector.ts`:

```typescript
import type { TimelineBucket, BuffStateEntry } from './types';

export function getHealthInRange(
    healthPercent: [number, number][],
    startMs: number,
    endMs: number,
): [number, number][] {
    if (healthPercent.length === 0) return [];

    const result: [number, number][] = [];
    let lastBefore: [number, number] | null = null;

    for (const point of healthPercent) {
        if (point[0] < startMs) {
            lastBefore = point;
        } else if (point[0] <= endMs) {
            if (result.length === 0 && lastBefore) {
                result.push(lastBefore);
            }
            result.push(point);
        }
    }

    if (result.length === 0 && lastBefore) {
        result.push(lastBefore);
    }

    return result;
}

export interface BoonSnapshot {
    name: string;
    icon: string;
    stacks: number;
    active: boolean;
    droppedAgoMs?: number;
}

export function getBoonStateAtTime(entry: BuffStateEntry, timeMs: number): BoonSnapshot {
    let currentStacks = 0;
    let lastActiveTime: number | undefined;

    for (const [t, stacks] of entry.states) {
        if (t > timeMs) break;
        if (stacks > 0) lastActiveTime = t;
        currentStacks = stacks;
    }

    const active = currentStacks > 0;
    let droppedAgoMs: number | undefined;

    if (!active && lastActiveTime !== undefined) {
        let droppedAt = 0;
        for (const [t, stacks] of entry.states) {
            if (t > timeMs) break;
            if (stacks === 0 && lastActiveTime !== undefined && t > lastActiveTime) {
                droppedAt = t;
                break;
            }
        }
        if (droppedAt > 0) {
            droppedAgoMs = timeMs - droppedAt;
        }
    }

    return { name: entry.name, icon: entry.icon, stacks: currentStacks, active, droppedAgoMs };
}

export function getAvgDistanceInRange(
    buckets: TimelineBucket[],
    startMs: number,
    endMs: number,
): { avg: number; max: number } {
    const inRange = buckets.filter(b => b.time >= startMs && b.time <= endMs);
    if (inRange.length === 0) return { avg: 0, max: 0 };

    const sum = inRange.reduce((s, b) => s + b.value, 0);
    const max = Math.max(...inRange.map(b => b.value));
    return { avg: Math.round(sum / inRange.length), max };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/shared/timelineInspector.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/shared/timelineInspector.ts tests/shared/timelineInspector.test.ts
git commit -m "feat(timeline): add inspector computation functions"
```

---

## Task 5: Update Store with New Toggle System

**Files:**
- Modify: `src/renderer/store.ts`

- [ ] **Step 1: Replace TimelineLayerToggles and presets**

In `src/renderer/store.ts`, replace the `TimelineLayerToggles` interface (lines 10-19) with:

```typescript
export interface TimelineLayerToggles {
    health: boolean;
    damageDealt: boolean;
    damageTaken: boolean;
    distanceToTag: boolean;
    incomingHealing: boolean;
    incomingBarrier: boolean;
    offensiveBoons: boolean;
    defensiveBoons: boolean;
    hardCC: boolean;
    softCC: boolean;
}
```

Replace `PRESET_TOGGLES` (lines 21-42) with:

```typescript
const PRESET_TOGGLES: Record<Exclude<TimelinePreset, 'custom'>, TimelineLayerToggles> = {
    'why-died': {
        health: true, damageDealt: false, damageTaken: true,
        distanceToTag: true, incomingHealing: false, incomingBarrier: false,
        offensiveBoons: false, defensiveBoons: true, hardCC: true, softCC: true,
    },
    'my-damage': {
        health: true, damageDealt: true, damageTaken: false,
        distanceToTag: false, incomingHealing: false, incomingBarrier: false,
        offensiveBoons: true, defensiveBoons: false, hardCC: false, softCC: false,
    },
    'support': {
        health: false, damageDealt: false, damageTaken: false,
        distanceToTag: false, incomingHealing: true, incomingBarrier: true,
        offensiveBoons: true, defensiveBoons: true, hardCC: false, softCC: false,
    },
};
```

Update `TimelinePreset` type (line 8):

```typescript
export type TimelinePreset = 'why-died' | 'my-damage' | 'support' | 'show-all' | 'custom';
```

Add selection state to `AppState` interface (after `bucketSizeMs` line ~69):

```typescript
    timelineSelection: { startMs: number; endMs: number } | null;
    setTimelineSelection: (selection: { startMs: number; endMs: number } | null) => void;
```

Update initial state for `timelineToggles` (lines 115-119):

```typescript
    timelineToggles: {
        health: true, damageDealt: true, damageTaken: true,
        distanceToTag: true, incomingHealing: true, incomingBarrier: true,
        offensiveBoons: true, defensiveBoons: true, hardCC: true, softCC: true,
    },
```

Add `applyPreset` handler for `'show-all'`. Update the `applyPreset` function (line 124):

```typescript
    applyPreset: (preset) => {
        if (preset === 'show-all') {
            const all: TimelineLayerToggles = {
                health: true, damageDealt: true, damageTaken: true,
                distanceToTag: true, incomingHealing: true, incomingBarrier: true,
                offensiveBoons: true, defensiveBoons: true, hardCC: true, softCC: true,
            };
            set({ timelineToggles: all, timelinePreset: preset });
        } else {
            set({ timelineToggles: { ...PRESET_TOGGLES[preset] }, timelinePreset: preset });
        }
    },
```

Update `TimelinePreset` type usage — change `applyPreset` signature in `AppState` interface:

```typescript
    applyPreset: (preset: Exclude<TimelinePreset, 'custom'>) => void;
```

Add selection state implementation in the store creator:

```typescript
    timelineSelection: null,
    setTimelineSelection: (selection) => set({ timelineSelection: selection }),
```

Also update the initial `timelinePreset` value (line 109) from `'custom'` to `'why-died'`:

```typescript
    timelinePreset: 'why-died',
```

- [ ] **Step 2: Run type check**

Run: `npx tsc --noEmit`
Expected: Should compile with remaining errors only in old timeline renderer files (TimelineChart.tsx, TimelineControls.tsx) which we'll replace.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/store.ts
git commit -m "feat(timeline): update store with 10-lane toggle system and selection state"
```

---

## Task 6: Update TimelinePresets.ts with New Lane Definitions

**Files:**
- Modify: `src/renderer/views/timeline/TimelinePresets.ts`

- [ ] **Step 1: Replace TIMELINE_LAYERS with new definitions**

Replace contents of `src/renderer/views/timeline/TimelinePresets.ts`:

```typescript
import type { TimelineLayerToggles } from '../../store';

export interface TimelineLayer {
    key: keyof TimelineLayerToggles;
    label: string;
    color: string;
    type: 'area' | 'bars';
}

export const TIMELINE_LANES: TimelineLayer[] = [
    { key: 'health', label: 'Health', color: '#10b981', type: 'area' },
    { key: 'damageDealt', label: 'Dmg Dealt', color: '#ef4444', type: 'area' },
    { key: 'damageTaken', label: 'Dmg Taken', color: '#f87171', type: 'area' },
    { key: 'distanceToTag', label: 'Dist to Tag', color: '#f59e0b', type: 'area' },
    { key: 'incomingHealing', label: 'Healing', color: '#4ade80', type: 'area' },
    { key: 'incomingBarrier', label: 'Barrier', color: '#a78bfa', type: 'area' },
    { key: 'offensiveBoons', label: 'Off Boons', color: '#60a5fa', type: 'bars' },
    { key: 'defensiveBoons', label: 'Def Boons', color: '#38bdf8', type: 'bars' },
    { key: 'hardCC', label: 'Hard CC', color: '#f43f5e', type: 'bars' },
    { key: 'softCC', label: 'Soft CC', color: '#c084fc', type: 'bars' },
];

export const PRESET_LABELS: { key: string; label: string }[] = [
    { key: 'why-died', label: 'Why did I die?' },
    { key: 'my-damage', label: 'My Damage' },
    { key: 'support', label: 'Am I Getting Support?' },
    { key: 'show-all', label: 'Show All' },
];
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/views/timeline/TimelinePresets.ts
git commit -m "feat(timeline): update preset definitions for 10-lane swimlane system"
```

---

## Task 7: Build TimelinePresetBar Component

**Files:**
- Create: `src/renderer/views/timeline/TimelinePresetBar.tsx`

- [ ] **Step 1: Create the preset bar component**

Create `src/renderer/views/timeline/TimelinePresetBar.tsx`:

```tsx
import { useAppStore, type TimelinePreset } from '../../store';
import { TIMELINE_LANES, PRESET_LABELS } from './TimelinePresets';

export function TimelinePresetBar() {
    const preset = useAppStore(s => s.timelinePreset);
    const toggles = useAppStore(s => s.timelineToggles);
    const setToggle = useAppStore(s => s.setTimelineToggle);
    const applyPreset = useAppStore(s => s.applyPreset);

    return (
        <div className="flex items-center gap-3 mb-3 px-1">
            <span className="text-[10px] text-[color:var(--text-muted)] uppercase tracking-wider">Preset:</span>
            <div className="flex gap-1.5">
                {PRESET_LABELS.map(p => (
                    <button
                        key={p.key}
                        onClick={() => applyPreset(p.key as Exclude<TimelinePreset, 'custom'>)}
                        className="px-2.5 py-1 text-[10px] rounded border transition-colors"
                        style={{
                            borderColor: preset === p.key ? 'var(--brand-primary)' : '#333',
                            background: preset === p.key ? 'rgba(16,185,129,0.15)' : 'transparent',
                            color: preset === p.key ? 'var(--brand-primary)' : '#888',
                        }}
                    >
                        {p.label}
                    </button>
                ))}
            </div>
            <div className="ml-auto flex items-center gap-1.5">
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
        </div>
    );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/views/timeline/TimelinePresetBar.tsx
git commit -m "feat(timeline): add preset bar with lane toggle dots"
```

---

## Task 8: Build TimelineLane Component (Area Charts)

**Files:**
- Create: `src/renderer/views/timeline/TimelineLane.tsx`

- [ ] **Step 1: Create the area chart lane component**

Create `src/renderer/views/timeline/TimelineLane.tsx`:

```tsx
import { AreaChart, Area, XAxis, YAxis, ResponsiveContainer } from 'recharts';
import type { TimelineBucket } from '../../../shared/types';

interface TimelineLaneProps {
    label: string;
    color: string;
    data: TimelineBucket[];
    domainMs: [number, number];
}

export function TimelineLane({ label, color, data, domainMs }: TimelineLaneProps) {
    if (data.length === 0) {
        return (
            <div className="flex items-center mb-0.5" style={{ height: 32 }}>
                <div className="w-[90px] text-right pr-2.5 text-[10px] font-medium" style={{ color }}>{label}</div>
                <div className="flex-1 h-full bg-[#0f0f0f] rounded border border-[#1a1a1a] flex items-center justify-center">
                    <span className="text-[8px] text-[#333]">No data</span>
                </div>
            </div>
        );
    }

    return (
        <div className="flex items-center mb-0.5" style={{ height: 32 }}>
            <div className="w-[90px] text-right pr-2.5 text-[10px] font-medium shrink-0" style={{ color }}>{label}</div>
            <div className="flex-1 h-full bg-[#0f0f0f] rounded border border-[#1a1a1a] overflow-hidden">
                <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={data} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
                        <XAxis dataKey="time" domain={domainMs} type="number" hide />
                        <YAxis hide />
                        <Area
                            type="monotone"
                            dataKey="value"
                            fill={`${color}33`}
                            stroke={color}
                            strokeWidth={1}
                            isAnimationActive={false}
                        />
                    </AreaChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/views/timeline/TimelineLane.tsx
git commit -m "feat(timeline): add area chart lane component"
```

---

## Task 9: Build TimelineBoonLane Component (Horizontal Bar Lanes)

**Files:**
- Create: `src/renderer/views/timeline/TimelineBoonLane.tsx`

- [ ] **Step 1: Create the boon/condition bar lane component**

Create `src/renderer/views/timeline/TimelineBoonLane.tsx`:

```tsx
import type { BuffStateEntry } from '../../../shared/types';

interface TimelineBoonLaneProps {
    label: string;
    color: string;
    buffs: Record<number, BuffStateEntry>;
    durationMs: number;
}

interface BarSegment {
    startPct: number;
    widthPct: number;
}

function getBarSegments(states: [number, number][], durationMs: number): BarSegment[] {
    if (states.length === 0 || durationMs <= 0) return [];
    const segments: BarSegment[] = [];
    let activeStart: number | null = null;

    for (const [time, stacks] of states) {
        if (stacks > 0 && activeStart === null) {
            activeStart = time;
        } else if (stacks === 0 && activeStart !== null) {
            segments.push({
                startPct: (activeStart / durationMs) * 100,
                widthPct: ((time - activeStart) / durationMs) * 100,
            });
            activeStart = null;
        }
    }
    if (activeStart !== null) {
        segments.push({
            startPct: (activeStart / durationMs) * 100,
            widthPct: ((durationMs - activeStart) / durationMs) * 100,
        });
    }
    return segments;
}

const BUFF_COLORS: Record<number, string> = {
    740: '#f59e0b',   // Might
    725: '#ef4444',   // Fury
    1187: '#a78bfa',  // Quickness
    30328: '#818cf8', // Alacrity
    1122: '#10b981',  // Stability
    717: '#60a5fa',   // Protection
    26980: '#a78bfa', // Resistance
    743: '#fbbf24',   // Aegis
    872: '#f43f5e',   // Stun
    833: '#e879f9',   // Daze
    785: '#fb923c',   // Fear
    722: '#67e8f9',   // Chill
    727: '#fbbf24',   // Immobilize
    26766: '#a78bfa', // Slow
};

export function TimelineBoonLane({ label, color, buffs, durationMs }: TimelineBoonLaneProps) {
    const buffEntries = Object.entries(buffs);
    const rowHeight = buffEntries.length > 0 ? Math.max(7, Math.min(10, 36 / buffEntries.length)) : 10;
    const laneHeight = Math.max(28, buffEntries.length * (rowHeight + 2) + 4);

    return (
        <div className="flex items-center mb-0.5" style={{ height: laneHeight }}>
            <div className="w-[90px] text-right pr-2.5 text-[10px] font-medium shrink-0" style={{ color }}>{label}</div>
            <div className="flex-1 h-full bg-[#0f0f0f] rounded border border-[#1a1a1a] relative overflow-hidden" style={{ padding: '2px 0' }}>
                {buffEntries.length === 0 && (
                    <div className="flex items-center justify-center h-full">
                        <span className="text-[8px] text-[#333]">None detected</span>
                    </div>
                )}
                {buffEntries.map(([idStr, entry], rowIdx) => {
                    const id = Number(idStr);
                    const segments = getBarSegments(entry.states, durationMs);
                    const barColor = BUFF_COLORS[id] ?? color;

                    return (
                        <div
                            key={id}
                            className="absolute w-full"
                            style={{ top: 2 + rowIdx * (rowHeight + 2), height: rowHeight }}
                        >
                            {segments.map((seg, i) => (
                                <div
                                    key={i}
                                    className="absolute rounded-sm"
                                    style={{
                                        left: `${seg.startPct}%`,
                                        width: `${seg.widthPct}%`,
                                        height: '100%',
                                        background: barColor,
                                        opacity: 0.5,
                                    }}
                                >
                                    {i === 0 && entry.icon && seg.widthPct > 3 && (
                                        <img
                                            src={entry.icon}
                                            alt={entry.name}
                                            className="absolute rounded-sm"
                                            style={{ left: 1, top: 0, height: rowHeight, width: rowHeight }}
                                        />
                                    )}
                                </div>
                            ))}
                            <span
                                className="absolute text-right pr-1"
                                style={{ right: 0, top: 0, fontSize: Math.min(7, rowHeight - 1), color: `${barColor}88`, lineHeight: `${rowHeight}px` }}
                            >
                                {entry.name}
                            </span>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/views/timeline/TimelineBoonLane.tsx
git commit -m "feat(timeline): add boon/condition horizontal bar lane component"
```

---

## Task 10: Build TimelineEventMarkers Component

**Files:**
- Create: `src/renderer/views/timeline/TimelineEventMarkers.tsx`

- [ ] **Step 1: Create event markers overlay**

Create `src/renderer/views/timeline/TimelineEventMarkers.tsx`:

```tsx
interface TimelineEventMarkersProps {
    downEvents: number[];
    deathEvents: number[];
    durationMs: number;
    onEventClick: (timeMs: number) => void;
}

export function TimelineEventMarkers({ downEvents, deathEvents, durationMs, onEventClick }: TimelineEventMarkersProps) {
    if (durationMs <= 0) return null;

    return (
        <>
            {downEvents.map((t, i) => (
                <div
                    key={`down-${i}`}
                    className="absolute top-0 bottom-0 z-[6] cursor-pointer"
                    style={{ left: `calc(90px + ${(t / durationMs) * 100}% * (100% - 90px) / 100%)`, width: 12, marginLeft: -6 }}
                    onClick={(e) => { e.stopPropagation(); onEventClick(t); }}
                >
                    <div className="absolute top-[-12px] left-[2px] text-[8px]">⬇</div>
                    <div className="absolute left-[5px] top-0 bottom-0 w-0 border-l border-dashed" style={{ borderColor: 'rgba(245,158,11,0.35)' }} />
                </div>
            ))}
            {deathEvents.map((t, i) => (
                <div
                    key={`death-${i}`}
                    className="absolute top-0 bottom-0 z-[6] cursor-pointer"
                    style={{ left: `calc(90px + ${(t / durationMs) * 100}% * (100% - 90px) / 100%)`, width: 12, marginLeft: -6 }}
                    onClick={(e) => { e.stopPropagation(); onEventClick(t); }}
                >
                    <div className="absolute top-[-12px] left-[1px] text-[8px]">💀</div>
                    <div className="absolute left-[5px] top-0 bottom-0 w-0 border-l border-dashed" style={{ borderColor: 'rgba(239,68,68,0.35)' }} />
                </div>
            ))}
        </>
    );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/views/timeline/TimelineEventMarkers.tsx
git commit -m "feat(timeline): add down/death event marker overlay"
```

---

## Task 11: Build TimelineSwimlanes Container with Selection

**Files:**
- Create: `src/renderer/views/timeline/TimelineSwimlanes.tsx`

- [ ] **Step 1: Create the swimlanes container with drag-select**

Create `src/renderer/views/timeline/TimelineSwimlanes.tsx`:

```tsx
import { useRef, useState, useCallback } from 'react';
import type { TimelineData } from '../../../shared/types';
import type { TimelineLayerToggles } from '../../store';
import { TimelineLane } from './TimelineLane';
import { TimelineBoonLane } from './TimelineBoonLane';
import { TimelineEventMarkers } from './TimelineEventMarkers';
import { extractBoonStatesTimeline, bucketTimeline } from '../../../shared/timelineData';

interface TimelineSwimlanesProps {
    data: TimelineData;
    toggles: TimelineLayerToggles;
    durationMs: number;
    onSelectionChange: (selection: { startMs: number; endMs: number } | null) => void;
    selection: { startMs: number; endMs: number } | null;
}

function healthPercentToBuckets(healthPercent: [number, number][], durationMs: number, bucketSizeMs: number): { time: number; value: number }[] {
    if (healthPercent.length === 0) return [];
    const bucketCount = Math.ceil(durationMs / bucketSizeMs);
    const buckets: { time: number; value: number }[] = [];
    let stateIdx = 0;

    for (let b = 0; b < bucketCount; b++) {
        const t = b * bucketSizeMs;
        while (stateIdx < healthPercent.length - 1 && healthPercent[stateIdx + 1][0] <= t) {
            stateIdx++;
        }
        buckets.push({ time: t, value: healthPercent[stateIdx][1] });
    }
    return buckets;
}

export function TimelineSwimlanes({ data, toggles, durationMs, onSelectionChange, selection }: TimelineSwimlanesProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const [dragging, setDragging] = useState(false);
    const [dragStart, setDragStart] = useState<number | null>(null);
    const [dragEnd, setDragEnd] = useState<number | null>(null);

    const labelWidth = 90;

    const pxToMs = useCallback((clientX: number) => {
        if (!containerRef.current) return 0;
        const rect = containerRef.current.getBoundingClientRect();
        const dataWidth = rect.width - labelWidth;
        const relX = clientX - rect.left - labelWidth;
        const pct = Math.max(0, Math.min(1, relX / dataWidth));
        return Math.round(pct * durationMs);
    }, [durationMs]);

    const handleMouseDown = (e: React.MouseEvent) => {
        const ms = pxToMs(e.clientX);
        setDragging(true);
        setDragStart(ms);
        setDragEnd(ms);
    };

    const handleMouseMove = (e: React.MouseEvent) => {
        if (!dragging) return;
        setDragEnd(pxToMs(e.clientX));
    };

    const handleMouseUp = () => {
        if (dragging && dragStart !== null && dragEnd !== null) {
            const startMs = Math.min(dragStart, dragEnd);
            const endMs = Math.max(dragStart, dragEnd);
            if (endMs - startMs > 500) {
                onSelectionChange({ startMs, endMs });
            } else {
                onSelectionChange(null);
            }
        }
        setDragging(false);
        setDragStart(null);
        setDragEnd(null);
    };

    const handleDeathClick = (timeMs: number) => {
        const startMs = Math.max(0, timeMs - 10000);
        const endMs = Math.min(durationMs, timeMs + 3000);
        onSelectionChange({ startMs, endMs });
    };

    const domainMs: [number, number] = [0, durationMs];
    const healthBuckets = healthPercentToBuckets(data.healthPercent, durationMs, data.bucketSizeMs);

    const activeSelection = dragging && dragStart !== null && dragEnd !== null
        ? { startMs: Math.min(dragStart, dragEnd), endMs: Math.max(dragStart, dragEnd) }
        : selection;

    const formatTick = (ms: number) => {
        const sec = Math.floor(ms / 1000);
        return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
    };

    const tickCount = Math.min(8, Math.max(3, Math.floor(durationMs / 30000) + 1));
    const ticks = Array.from({ length: tickCount }, (_, i) => Math.round((i / (tickCount - 1)) * durationMs));

    return (
        <div className="relative" ref={containerRef}>
            {/* Time axis */}
            <div className="flex justify-between text-[9px] text-[#555] mb-1.5" style={{ paddingLeft: labelWidth, paddingRight: 4 }}>
                {ticks.map(t => <span key={t}>{formatTick(t)}</span>)}
            </div>

            {/* Swimlane area with drag handler */}
            <div
                className="relative cursor-crosshair select-none"
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
            >
                {/* Selection highlight */}
                {activeSelection && activeSelection.endMs - activeSelection.startMs > 500 && (
                    <div
                        className="absolute top-0 bottom-0 z-[5] pointer-events-none"
                        style={{
                            left: `calc(${labelWidth}px + ${(activeSelection.startMs / durationMs) * 100}% * (100% - ${labelWidth}px) / 100%)`,
                            width: `calc(${((activeSelection.endMs - activeSelection.startMs) / durationMs) * 100}% * (100% - ${labelWidth}px) / 100%)`,
                            background: 'rgba(96,165,250,0.06)',
                            borderLeft: '1.5px solid rgba(96,165,250,0.4)',
                            borderRight: '1.5px solid rgba(96,165,250,0.4)',
                        }}
                    />
                )}

                {/* Event markers — click to auto-select window around event */}
                <TimelineEventMarkers
                    downEvents={data.downEvents}
                    deathEvents={data.deathEvents}
                    durationMs={durationMs}
                    onEventClick={handleDeathClick}
                />

                {/* Area chart lanes */}
                {toggles.health && <TimelineLane label="Health" color="#10b981" data={healthBuckets} domainMs={domainMs} />}
                {toggles.damageDealt && <TimelineLane label="Dmg Dealt" color="#ef4444" data={data.damageDealt} domainMs={domainMs} />}
                {toggles.damageTaken && <TimelineLane label="Dmg Taken" color="#f87171" data={data.damageTaken} domainMs={domainMs} />}
                {toggles.distanceToTag && <TimelineLane label="Dist to Tag" color="#f59e0b" data={data.distanceToTag} domainMs={domainMs} />}
                {toggles.incomingHealing && <TimelineLane label="Healing" color="#4ade80" data={data.incomingHealing} domainMs={domainMs} />}
                {toggles.incomingBarrier && <TimelineLane label="Barrier" color="#a78bfa" data={data.incomingBarrier} domainMs={domainMs} />}

                {/* Boon/condition bar lanes */}
                {toggles.offensiveBoons && <TimelineBoonLane label="Off Boons" color="#60a5fa" buffs={data.offensiveBoons} durationMs={durationMs} />}
                {toggles.defensiveBoons && <TimelineBoonLane label="Def Boons" color="#38bdf8" buffs={data.defensiveBoons} durationMs={durationMs} />}
                {toggles.hardCC && <TimelineBoonLane label="Hard CC" color="#f43f5e" buffs={data.hardCC} durationMs={durationMs} />}
                {toggles.softCC && <TimelineBoonLane label="Soft CC" color="#c084fc" buffs={data.softCC} durationMs={durationMs} />}
            </div>
        </div>
    );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/views/timeline/TimelineSwimlanes.tsx
git commit -m "feat(timeline): add swimlanes container with drag-select interaction"
```

---

## Task 12: Build Inspector Panel Components

**Files:**
- Create: `src/renderer/views/timeline/inspector/HealthPanel.tsx`
- Create: `src/renderer/views/timeline/inspector/BoonStatePanel.tsx`
- Create: `src/renderer/views/timeline/inspector/TopHitsPanel.tsx`
- Create: `src/renderer/views/timeline/inspector/PositionPanel.tsx`
- Create: `src/renderer/views/timeline/TimelineInspector.tsx`

- [ ] **Step 1: Create HealthPanel**

Create `src/renderer/views/timeline/inspector/HealthPanel.tsx`:

```tsx
import { AreaChart, Area, ResponsiveContainer } from 'recharts';
import { getHealthInRange } from '../../../../shared/timelineInspector';

interface HealthPanelProps {
    healthPercent: [number, number][];
    startMs: number;
    endMs: number;
    downEvents: number[];
    deathEvents: number[];
}

export function HealthPanel({ healthPercent, startMs, endMs, downEvents, deathEvents }: HealthPanelProps) {
    const points = getHealthInRange(healthPercent, startMs, endMs);
    const chartData = points.map(([time, value]) => ({ time, value }));
    const startHealth = points.length > 0 ? points[0][1] : 0;
    const endHealth = points.length > 0 ? points[points.length - 1][1] : 0;

    const downsInRange = downEvents.filter(t => t >= startMs && t <= endMs);
    const deathsInRange = deathEvents.filter(t => t >= startMs && t <= endMs);

    const formatTime = (ms: number) => {
        const sec = Math.floor(ms / 1000);
        return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
    };

    return (
        <div className="bg-[#111] rounded-[5px] p-2.5 border border-[#1a1a1a]">
            <div className="text-[9px] text-[#10b981] mb-2 uppercase tracking-wider">Health Trajectory</div>
            {chartData.length > 1 ? (
                <div className="h-[50px] mb-1.5 relative">
                    <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={chartData} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
                            <Area type="monotone" dataKey="value" fill="#10b98133" stroke="#10b981" strokeWidth={1} isAnimationActive={false} />
                        </AreaChart>
                    </ResponsiveContainer>
                    <div className="absolute top-0.5 left-1 text-[9px] text-[#10b981]">{startHealth}%</div>
                    <div className="absolute bottom-0.5 right-1 text-[12px] font-bold" style={{ color: endHealth > 50 ? '#10b981' : endHealth > 20 ? '#f59e0b' : '#ef4444' }}>
                        {endHealth}%
                    </div>
                </div>
            ) : (
                <div className="h-[50px] flex items-center justify-center text-[10px] text-[#555]">No health data</div>
            )}
            <div className="text-[9px] text-[#888] space-y-0.5">
                {downsInRange.map((t, i) => (
                    <div key={i}><span className="text-[#f59e0b]">⬇ Downed</span> at {formatTime(t)}</div>
                ))}
                {deathsInRange.map((t, i) => (
                    <div key={i}><span className="text-[#ef4444]">💀 Dead</span> at {formatTime(t)}</div>
                ))}
            </div>
        </div>
    );
}
```

- [ ] **Step 2: Create BoonStatePanel**

Create `src/renderer/views/timeline/inspector/BoonStatePanel.tsx`:

```tsx
import { getBoonStateAtTime } from '../../../../shared/timelineInspector';
import type { BuffStateEntry } from '../../../../shared/types';

interface BoonStatePanelProps {
    offensiveBoons: Record<number, BuffStateEntry>;
    defensiveBoons: Record<number, BuffStateEntry>;
    timeMs: number;
}

export function BoonStatePanel({ offensiveBoons, defensiveBoons, timeMs }: BoonStatePanelProps) {
    const allBoons = { ...offensiveBoons, ...defensiveBoons };
    const entries = Object.entries(allBoons).map(([idStr, entry]) => ({
        id: Number(idStr),
        ...getBoonStateAtTime(entry, timeMs),
    }));

    const formatDrop = (ms: number) => {
        const sec = Math.round(ms / 1000);
        return `dropped ${sec}s ago`;
    };

    return (
        <div className="bg-[#111] rounded-[5px] p-2.5 border border-[#1a1a1a]">
            <div className="text-[9px] text-[#38bdf8] mb-2 uppercase tracking-wider">Boon State</div>
            <div className="flex flex-col gap-1">
                {entries.length === 0 && <div className="text-[10px] text-[#555]">No boon data</div>}
                {entries.map(snap => (
                    <div key={snap.name} className="flex items-center gap-1.5">
                        <span className="text-[10px]" style={{ color: snap.active ? '#10b981' : '#ef4444' }}>
                            {snap.active ? '✓' : '✗'}
                        </span>
                        {snap.icon && <img src={snap.icon} alt={snap.name} className="w-3.5 h-3.5 rounded-sm" />}
                        <span className={`text-[10px] ${snap.active ? 'text-[#ddd]' : 'text-[#888] line-through'}`}>
                            {snap.name}{snap.stacks > 1 ? ` ×${snap.stacks}` : ''}
                        </span>
                        {!snap.active && snap.droppedAgoMs !== undefined && (
                            <span className="text-[8px] text-[#ef4444]">{formatDrop(snap.droppedAgoMs)}</span>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
}
```

- [ ] **Step 3: Create TopHitsPanel**

Create `src/renderer/views/timeline/inspector/TopHitsPanel.tsx`:

```tsx
import type { SkillDamage } from '../../../../shared/types';

interface TopHitsPanelProps {
    topDamageTakenSkills: SkillDamage[];
}

export function TopHitsPanel({ topDamageTakenSkills }: TopHitsPanelProps) {
    const top5 = topDamageTakenSkills.slice(0, 5);
    const maxDmg = top5.length > 0 ? top5[0].damage : 1;
    const remaining = topDamageTakenSkills.slice(5);
    const remainingTotal = remaining.reduce((sum, s) => sum + s.damage, 0);

    return (
        <div className="bg-[#111] rounded-[5px] p-2.5 border border-[#1a1a1a]">
            <div className="text-[9px] text-[#f87171] mb-2 uppercase tracking-wider">Top Hits Taken</div>
            <div className="flex flex-col gap-1.5">
                {top5.length === 0 && <div className="text-[10px] text-[#555]">No damage data</div>}
                {top5.map((skill, i) => (
                    <div key={i}>
                        <div className="flex justify-between text-[10px] mb-0.5">
                            <span className="text-[#ddd] flex items-center gap-1">
                                {skill.icon && <img src={skill.icon} alt={skill.name} className="w-3.5 h-3.5 rounded-sm border border-[#333]" />}
                                {skill.name}
                            </span>
                            <span className="text-[#ef4444] font-semibold">-{skill.damage.toLocaleString()}</span>
                        </div>
                        <div className="h-[3px] bg-[#1a1a1a] rounded">
                            <div
                                className="h-full bg-[#ef4444] rounded opacity-60"
                                style={{ width: `${(skill.damage / maxDmg) * 100}%` }}
                            />
                        </div>
                    </div>
                ))}
                {remaining.length > 0 && (
                    <div className="flex justify-between text-[10px]">
                        <span className="text-[#ccc]">+ {remaining.length} more</span>
                        <span className="text-[#f8717188]">-{remainingTotal.toLocaleString()}</span>
                    </div>
                )}
            </div>
        </div>
    );
}
```

- [ ] **Step 4: Create PositionPanel**

Create `src/renderer/views/timeline/inspector/PositionPanel.tsx`:

```tsx
import { getAvgDistanceInRange } from '../../../../shared/timelineInspector';
import type { TimelineBucket } from '../../../../shared/types';

interface PositionPanelProps {
    distanceToTag: TimelineBucket[];
    startMs: number;
    endMs: number;
}

export function PositionPanel({ distanceToTag, startMs, endMs }: PositionPanelProps) {
    const { avg, max } = getAvgDistanceInRange(distanceToTag, startMs, endMs);
    const distColor = avg < 600 ? '#10b981' : avg < 1200 ? '#f59e0b' : '#ef4444';
    const barPct = Math.min(100, (avg / 2400) * 100);

    return (
        <div className="bg-[#111] rounded-[5px] p-2.5 border border-[#1a1a1a]">
            <div className="text-[9px] text-[#f59e0b] mb-2 uppercase tracking-wider">Positioning</div>
            <div className="text-center mb-2">
                <div className="text-[28px] font-bold" style={{ color: distColor }}>{avg.toLocaleString()}</div>
                <div className="text-[9px] text-[#888]">avg distance to tag</div>
            </div>
            <div className="h-[3px] bg-[#1a1a1a] rounded mb-1.5">
                <div
                    className="h-full rounded"
                    style={{
                        width: `${barPct}%`,
                        background: 'linear-gradient(90deg, #10b981, #f59e0b, #ef4444)',
                    }}
                />
            </div>
            <div className="flex justify-between text-[8px] text-[#555]">
                <span>0</span><span>600</span><span>1200</span><span>2400+</span>
            </div>
            {avg > 1200 && (
                <div className="mt-2 text-[9px] text-[#f59e0b] bg-[#f59e0b11] px-1.5 py-1 rounded">
                    ⚠️ Far from squad — peaked at {max.toLocaleString()}
                </div>
            )}
        </div>
    );
}
```

- [ ] **Step 5: Create TimelineInspector container**

Create `src/renderer/views/timeline/TimelineInspector.tsx`:

```tsx
import type { TimelineData, SkillDamage } from '../../../shared/types';
import { HealthPanel } from './inspector/HealthPanel';
import { BoonStatePanel } from './inspector/BoonStatePanel';
import { TopHitsPanel } from './inspector/TopHitsPanel';
import { PositionPanel } from './inspector/PositionPanel';

interface TimelineInspectorProps {
    data: TimelineData;
    selection: { startMs: number; endMs: number };
    topDamageTakenSkills: SkillDamage[];
}

export function TimelineInspector({ data, selection, topDamageTakenSkills }: TimelineInspectorProps) {
    const formatTime = (ms: number) => {
        const sec = Math.floor(ms / 1000);
        return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
    };

    const windowSec = Math.round((selection.endMs - selection.startMs) / 1000);

    return (
        <div>
            <div className="border-t border-[#333] my-3 relative">
                <span className="absolute top-[-8px] left-1/2 -translate-x-1/2 bg-[#0a0a0a] px-3 text-[9px] text-[#60a5fa] tracking-wider">
                    ▲ INSPECTOR: {formatTime(selection.startMs)} — {formatTime(selection.endMs)} ({windowSec}s selected) ▲
                </span>
            </div>
            <div className="grid grid-cols-4 gap-2.5">
                <HealthPanel
                    healthPercent={data.healthPercent}
                    startMs={selection.startMs}
                    endMs={selection.endMs}
                    downEvents={data.downEvents}
                    deathEvents={data.deathEvents}
                />
                <BoonStatePanel
                    offensiveBoons={data.offensiveBoons}
                    defensiveBoons={data.defensiveBoons}
                    timeMs={selection.endMs}
                />
                <TopHitsPanel topDamageTakenSkills={topDamageTakenSkills} />
                <PositionPanel
                    distanceToTag={data.distanceToTag}
                    startMs={selection.startMs}
                    endMs={selection.endMs}
                />
            </div>
        </div>
    );
}
```

- [ ] **Step 6: Commit**

```bash
git add src/renderer/views/timeline/inspector/ src/renderer/views/timeline/TimelineInspector.tsx
git commit -m "feat(timeline): add inspector panel with health, boons, hits, and position panels"
```

---

## Task 13: Rewire TimelineView and Remove Old Components

**Files:**
- Modify: `src/renderer/views/TimelineView.tsx`
- Delete: `src/renderer/views/timeline/TimelineChart.tsx`
- Delete: `src/renderer/views/timeline/TimelineControls.tsx`

- [ ] **Step 1: Replace TimelineView.tsx**

Replace contents of `src/renderer/views/TimelineView.tsx`:

```tsx
import { useAppStore } from '../store';
import { TimelinePresetBar } from './timeline/TimelinePresetBar';
import { TimelineSwimlanes } from './timeline/TimelineSwimlanes';
import { TimelineInspector } from './timeline/TimelineInspector';
import { GanttChart } from 'lucide-react';

export function TimelineView() {
    const currentFight = useAppStore(s => s.currentFight);
    const toggles = useAppStore(s => s.timelineToggles);
    const selection = useAppStore(s => s.timelineSelection);
    const setSelection = useAppStore(s => s.setTimelineSelection);

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

    return (
        <div className="flex flex-col h-full overflow-y-auto px-2 py-2">
            <TimelinePresetBar />
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

- [ ] **Step 2: Delete old components**

```bash
rm src/renderer/views/timeline/TimelineChart.tsx
rm src/renderer/views/timeline/TimelineControls.tsx
```

- [ ] **Step 3: Run type check**

Run: `npx tsc --noEmit`
Expected: PASS — all type errors should be resolved. If any remain, fix them.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/views/TimelineView.tsx
git rm src/renderer/views/timeline/TimelineChart.tsx src/renderer/views/timeline/TimelineControls.tsx
git commit -m "feat(timeline): rewire TimelineView to swimlane + inspector layout"
```

---

## Task 14: Run Full Test Suite and Fix Issues

**Files:**
- Potentially modify any files with test failures

- [ ] **Step 1: Run all tests**

Run: `npx vitest run`
Expected: All tests pass. If any fail, fix them.

- [ ] **Step 2: Run type check**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 3: Run dev server and visually test**

Run: `npm run dev`

Test the following:
1. Open AxiPulse, navigate to Timeline tab — should show empty state
2. Parse a fight (or load from history) — swimlanes should appear
3. Click "Why did I die?" preset — should show Health, Dmg Taken, Dist, Def Boons, Hard CC, Soft CC
4. Click "My Damage" preset — should show Dmg Dealt, Off Boons, Health
5. Click individual lane toggle dots — lanes should show/hide
6. Drag-select a time range on the swimlanes — inspector panel should appear below
7. Inspector should show health trajectory, boon state, top hits, positioning
8. Boon bars should show icons where available
9. Click a death marker — should auto-select a 13-second window around the event

- [ ] **Step 4: Fix any visual issues found during testing**

Address layout, spacing, color, or data issues discovered.

- [ ] **Step 5: Commit fixes**

```bash
git add -A
git commit -m "fix(timeline): address issues from visual testing"
```

---

## Task 15: Final Cleanup

**Files:**
- Modify: `src/renderer/views/timeline/TimelineEventMarkers.tsx` (if position calculation needs fixing)

- [ ] **Step 1: Verify event marker positioning**

The event markers use CSS `calc()` which may need adjustment based on the actual container layout. Test with a fight that has down/death events and verify markers align with the correct timestamps on the swimlanes.

- [ ] **Step 2: Run final type check and tests**

Run: `npx tsc --noEmit && npx vitest run`
Expected: All pass.

- [ ] **Step 3: Final commit**

```bash
git add -A
git commit -m "feat(timeline): complete timeline revamp with swimlanes and inspector"
```
