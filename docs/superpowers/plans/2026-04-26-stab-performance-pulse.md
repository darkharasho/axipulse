# Stab Performance Fight Breakdown Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a per-fight stability breakdown chart to the Pulse → Boons subview, modeled after axibridge's `StabPerformanceSection`, focused on the local player with party-member overlays.

**Architecture:** A new pure computation module (`src/shared/stabPerformance.ts`) builds a `StabPerfBreakdown` from EI JSON during `extractPlayerFightData`. A new renderer component (`src/renderer/views/pulse/StabPerformanceChart.tsx`) consumes it via `BoonStats.stabPerformance` and renders a recharts `ComposedChart` with toggleable overlays. Bucket size threads through from existing `bucketSizeMs`.

**Tech Stack:** TypeScript, React 18, recharts 3.6, framer-motion, lucide-react, vitest. Stability buff id = `1122`. Death skill id = `-28`.

**Spec:** `docs/superpowers/specs/2026-04-26-stab-performance-pulse-design.md`

---

## File Structure

| Path | Status | Responsibility |
| --- | --- | --- |
| `src/shared/stabPerformance.ts` | **NEW** | Pure computation: stab generation, party stacks/deaths/distances/damage, all bucket-aware. |
| `src/shared/types.ts` | EDIT | Add `StabPerfBreakdown`, `StabPerfPartyMember` interfaces; extend `BoonStats`. |
| `src/shared/extractPlayerData.ts` | EDIT | Invoke `computeStabPerformance` and attach to `boons.stabPerformance`. |
| `src/renderer/views/pulse/StabPerformanceChart.tsx` | **NEW** | Recharts `ComposedChart` + 3 toggle buttons. Self-contained. |
| `src/renderer/views/pulse/BoonsSubview.tsx` | EDIT | Append `<StabPerformanceChart>` after Boon Generation table. |
| `tests/shared/stabPerformance.test.ts` | **NEW** | Unit tests for bucket math, fallback path, group filtering. |

---

## Task 1: Add types

**Files:**
- Modify: `src/shared/types.ts`

- [ ] **Step 1: Add new interfaces above `BoonStats` (after `BoonGenerationEntry`)**

In `src/shared/types.ts`, insert before the `BoonStats` interface:

```ts
export interface StabPerfPartyMember {
    /** Account name, e.g. "Player.1234" */
    key: string;
    /** Name shown in the UI; account.split('.')[0] */
    displayName: string;
    profession: string;
    /** Avg stab stacks during each bucket (0–25). */
    stacks: number[];
    /** Death count per bucket (typically 0 or 1). */
    deaths: number[];
    /** Average inches to commander per bucket. */
    distances: number[];
}

export interface StabPerfBreakdown {
    bucketSizeMs: number;
    bucketCount: number;
    buckets: { startMs: number; label: string }[];
    /** Local player's avg stab stacks generated per bucket, summed across the party (can exceed 25). */
    selfGeneration: number[];
    /** Sum of party members' incoming damage per bucket. */
    partyIncomingDamage: number[];
    /** Group-mates of the local player; excludes the local player themselves. */
    partyMembers: StabPerfPartyMember[];
}
```

- [ ] **Step 2: Extend `BoonStats`**

Replace the existing `BoonStats` interface with:

```ts
export interface BoonStats {
    uptimes: BoonUptimeEntry[];
    generation: BoonGenerationEntry[];
    stabPerformance: StabPerfBreakdown | null;
}
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: errors in `extractPlayerData.ts` (missing `stabPerformance` field) and `boonData.test.ts` (test fixtures missing field). These will be resolved in later tasks.

- [ ] **Step 4: Commit**

```bash
git add src/shared/types.ts
git commit -m "feat(types): add StabPerfBreakdown to BoonStats"
```

---

## Task 2: Scaffold computeStabPerformance with bucket setup

**Files:**
- Create: `src/shared/stabPerformance.ts`
- Create: `tests/shared/stabPerformance.test.ts`

- [ ] **Step 1: Write the failing test for empty/malformed input**

Create `tests/shared/stabPerformance.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { computeStabPerformance } from '../../src/shared/stabPerformance';
import type { EiJson, EiPlayer } from '../../src/shared/types';

function makePlayer(overrides: Partial<EiPlayer> = {}): EiPlayer {
    return {
        name: 'Local', account: 'Local.1111', profession: 'Guardian', elite_spec: 'Firebrand',
        group: 1, hasCommanderTag: false, notInSquad: false, isFake: false,
        activeTimes: [10000],
        dpsAll: [{ damage: 0, dps: 0, breakbarDamage: 0 }],
        statsAll: [{ downContribution: 0, distToCom: 0, stackDist: 0, appliedCrowdControl: 0, appliedCrowdControlDuration: 0 }],
        defenses: [{ damageTaken: 0, deadCount: 0, downCount: 0, dodgeCount: 0, blockedCount: 0, evadedCount: 0, missedCount: 0, invulnedCount: 0, interruptedCount: 0, receivedCrowdControl: 0, receivedCrowdControlDuration: 0, boonStrips: 0, boonStripsTime: 0 }],
        support: [{ condiCleanse: 0, condiCleanseSelf: 0, boonStrips: 0, boonStripsTime: 0 }],
        damage1S: [[]], targetDamage1S: [[]], totalDamageDist: [[]], totalDamageTaken: [[]], rotation: [],
        ...overrides,
    } as EiPlayer;
}

function makeJson(overrides: Partial<EiJson> = {}): EiJson {
    return {
        fightName: 'Test', durationMS: 10000, success: false,
        players: [], targets: [], skillMap: {}, buffMap: {},
        ...overrides,
    } as EiJson;
}

describe('computeStabPerformance', () => {
    it('returns null when fight duration is zero', () => {
        const local = makePlayer();
        const json = makeJson({ durationMS: 0, players: [local] });
        expect(computeStabPerformance(json, local, 1000)).toBeNull();
    });

    it('produces correct bucket count and labels for 1s buckets over 10s', () => {
        const local = makePlayer();
        const json = makeJson({ players: [local] });
        const result = computeStabPerformance(json, local, 1000);
        expect(result).not.toBeNull();
        expect(result!.bucketSizeMs).toBe(1000);
        expect(result!.bucketCount).toBe(10);
        expect(result!.buckets[0]).toEqual({ startMs: 0, label: '0s' });
        expect(result!.buckets[9]).toEqual({ startMs: 9000, label: '9s' });
    });

    it('floors bucket size to 1s minimum', () => {
        const local = makePlayer();
        const json = makeJson({ players: [local] });
        const result = computeStabPerformance(json, local, 250);
        expect(result!.bucketSizeMs).toBe(1000);
    });

    it('rounds up partial trailing bucket', () => {
        const local = makePlayer();
        const json = makeJson({ durationMS: 10500, players: [local] });
        const result = computeStabPerformance(json, local, 2000);
        expect(result!.bucketCount).toBe(6); // ceil(10500/2000)
    });
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `npx vitest run tests/shared/stabPerformance.test.ts`
Expected: FAIL — "Cannot find module".

- [ ] **Step 3: Create skeleton module**

Create `src/shared/stabPerformance.ts`:

```ts
import type { EiJson, EiPlayer, StabPerfBreakdown, StabPerfPartyMember } from './types';

const STABILITY_BUFF_ID = 1122;
const DEATH_SKILL_ID = -28;
const DISTANCE_THRESHOLD_UNITS = 600;

export function computeStabPerformance(
    json: EiJson,
    localPlayer: EiPlayer,
    bucketSizeMs: number,
): StabPerfBreakdown | null {
    const durationMs = Number(json?.durationMS || 0);
    if (durationMs <= 0) return null;

    const effectiveBucketMs = Math.max(1000, Math.round(bucketSizeMs / 1000) * 1000);
    const bucketCount = Math.max(1, Math.ceil(durationMs / effectiveBucketMs));
    const buckets = Array.from({ length: bucketCount }, (_, i) => ({
        startMs: i * effectiveBucketMs,
        label: `${Math.round((i * effectiveBucketMs) / 1000)}s`,
    }));

    return {
        bucketSizeMs: effectiveBucketMs,
        bucketCount,
        buckets,
        selfGeneration: new Array(bucketCount).fill(0),
        partyIncomingDamage: new Array(bucketCount).fill(0),
        partyMembers: [],
    };
}
```

- [ ] **Step 4: Run test to verify pass**

Run: `npx vitest run tests/shared/stabPerformance.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/shared/stabPerformance.ts tests/shared/stabPerformance.test.ts
git commit -m "feat(stabPerformance): scaffold computation module with bucket setup"
```

---

## Task 3: Identify party (group-mates excluding local player)

**Files:**
- Modify: `src/shared/stabPerformance.ts`
- Modify: `tests/shared/stabPerformance.test.ts`

- [ ] **Step 1: Add failing test**

Append to the test file:

```ts
describe('party identification', () => {
    it('returns group-mates excluding local player and excluding notInSquad/isFake', () => {
        const local = makePlayer({ name: 'Local', account: 'Local.1', group: 2 });
        const mate1 = makePlayer({ name: 'Mate1', account: 'Mate1.2', group: 2, profession: 'Warrior' });
        const mate2 = makePlayer({ name: 'Mate2', account: 'Mate2.3', group: 2, profession: 'Engineer' });
        const otherGroup = makePlayer({ name: 'Other', account: 'Other.4', group: 3 });
        const notInSquad = makePlayer({ name: 'Pug', account: 'Pug.5', group: 2, notInSquad: true });
        const fake = makePlayer({ name: 'Fake', account: 'Fake.6', group: 2, isFake: true });
        const json = makeJson({ players: [local, mate1, mate2, otherGroup, notInSquad, fake] });

        const result = computeStabPerformance(json, local, 1000);
        const keys = result!.partyMembers.map(m => m.key).sort();
        expect(keys).toEqual(['Mate1.2', 'Mate2.3']);
        expect(result!.partyMembers[0].displayName).toBe('Mate1');
        expect(result!.partyMembers[0].profession).toBe('Warrior');
    });

    it('returns empty partyMembers when local player has group 0', () => {
        const local = makePlayer({ group: 0 });
        const mate = makePlayer({ name: 'Mate', account: 'Mate.2', group: 0 });
        const json = makeJson({ players: [local, mate] });
        const result = computeStabPerformance(json, local, 1000);
        expect(result!.partyMembers).toEqual([]);
    });
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `npx vitest run tests/shared/stabPerformance.test.ts`
Expected: FAIL with `Expected: ['Mate1.2', 'Mate2.3']` got `[]`.

- [ ] **Step 3: Implement party identification**

Replace the `return` block in `src/shared/stabPerformance.ts` with:

```ts
    const localGroup = Number(localPlayer?.group || 0);
    const partyPlayers = localGroup > 0
        ? json.players.filter(p =>
            p && !p.notInSquad && !p.isFake
            && Number(p.group || 0) === localGroup
            && p.account !== localPlayer.account)
        : [];

    const partyMembers: StabPerfPartyMember[] = partyPlayers.map(p => ({
        key: p.account,
        displayName: p.account.split('.')[0],
        profession: p.profession,
        stacks: new Array(bucketCount).fill(0),
        deaths: new Array(bucketCount).fill(0),
        distances: new Array(bucketCount).fill(0),
    }));

    return {
        bucketSizeMs: effectiveBucketMs,
        bucketCount,
        buckets,
        selfGeneration: new Array(bucketCount).fill(0),
        partyIncomingDamage: new Array(bucketCount).fill(0),
        partyMembers,
    };
```

- [ ] **Step 4: Run test to verify pass**

Run: `npx vitest run tests/shared/stabPerformance.test.ts`
Expected: PASS (6 tests total).

- [ ] **Step 5: Commit**

```bash
git add src/shared/stabPerformance.ts tests/shared/stabPerformance.test.ts
git commit -m "feat(stabPerformance): identify party (group-mates) excluding local player"
```

---

## Task 4: Compute party-member stab stacks per bucket

**Files:**
- Modify: `src/shared/stabPerformance.ts`
- Modify: `tests/shared/stabPerformance.test.ts`

Stab stacks come from `buffUptimes[id=1122].states` — array of `[timeMs, stacks]` pairs marking step changes. We integrate stacks×duration over each bucket window and divide by bucket size to get average stacks.

- [ ] **Step 1: Add failing test**

Append:

```ts
describe('party member stab stacks', () => {
    it('integrates stack-states into bucket averages', () => {
        // Mate has 5 stacks for first 2s, 0 for next 1s, 3 for next 1s, 0 thereafter, fight 5s
        const mate = makePlayer({
            name: 'M', account: 'M.2', group: 1,
            buffUptimes: [{
                id: 1122,
                buffData: [{ uptime: 0, generation: 0, overstack: 0, wasted: 0 }],
                states: [[0, 5], [2000, 0], [3000, 3], [4000, 0]],
            }],
        });
        const local = makePlayer({ group: 1 });
        const json = makeJson({ durationMS: 5000, players: [local, mate] });
        const result = computeStabPerformance(json, local, 1000);
        const stacks = result!.partyMembers[0].stacks;
        // Bucket 0 [0,1000): all at 5 → avg 5
        // Bucket 1 [1000,2000): all at 5 → avg 5
        // Bucket 2 [2000,3000): all at 0 → avg 0
        // Bucket 3 [3000,4000): all at 3 → avg 3
        // Bucket 4 [4000,5000): all at 0 → avg 0
        expect(stacks).toEqual([5, 5, 0, 3, 0]);
    });

    it('handles state changes that span bucket boundaries', () => {
        // 5 stacks for 500ms, then 0 — bucket 0 [0,1000) avg = (5*500 + 0*500)/1000 = 2.5
        const mate = makePlayer({
            name: 'M', account: 'M.2', group: 1,
            buffUptimes: [{
                id: 1122,
                buffData: [{ uptime: 0, generation: 0, overstack: 0, wasted: 0 }],
                states: [[0, 5], [500, 0]],
            }],
        });
        const local = makePlayer({ group: 1 });
        const json = makeJson({ durationMS: 1000, players: [local, mate] });
        const result = computeStabPerformance(json, local, 1000);
        expect(result!.partyMembers[0].stacks).toEqual([2.5]);
    });

    it('returns zero stacks when buff never appears', () => {
        const mate = makePlayer({ name: 'M', account: 'M.2', group: 1, buffUptimes: [] });
        const local = makePlayer({ group: 1 });
        const json = makeJson({ durationMS: 3000, players: [local, mate] });
        const result = computeStabPerformance(json, local, 1000);
        expect(result!.partyMembers[0].stacks).toEqual([0, 0, 0]);
    });
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `npx vitest run tests/shared/stabPerformance.test.ts`
Expected: FAIL — stacks all `0` instead of expected values.

- [ ] **Step 3: Add helper and wire it in**

Add this helper at the top of `src/shared/stabPerformance.ts` (below the constants):

```ts
function integrateStatesPerBucket(
    states: Array<[number, number]>,
    bucketCount: number,
    bucketSizeMs: number,
): number[] {
    const out = new Array<number>(bucketCount).fill(0);
    if (!states || states.length === 0) return out;
    const sorted = [...states].sort((a, b) => Number(a[0]) - Number(b[0]));
    for (let b = 0; b < bucketCount; b++) {
        const bucketStart = b * bucketSizeMs;
        const bucketEnd = bucketStart + bucketSizeMs;
        // Find stack value at bucketStart (last state at or before it)
        let curStacks = 0;
        for (let i = sorted.length - 1; i >= 0; i--) {
            if (Number(sorted[i][0]) <= bucketStart) { curStacks = Number(sorted[i][1]); break; }
        }
        let weightedSum = 0;
        let prevTime = bucketStart;
        for (const [tRaw, sRaw] of sorted) {
            const t = Number(tRaw);
            if (t <= bucketStart) continue;
            if (t >= bucketEnd) break;
            weightedSum += curStacks * (t - prevTime);
            prevTime = t;
            curStacks = Number(sRaw);
        }
        weightedSum += curStacks * (bucketEnd - prevTime);
        out[b] = weightedSum / bucketSizeMs;
    }
    return out;
}

function getStabilityBuff(player: EiPlayer): EiPlayer['buffUptimes'][number] | undefined {
    return (player.buffUptimes ?? []).find(b => Number(b?.id) === STABILITY_BUFF_ID);
}
```

Then modify the `partyMembers` construction:

```ts
    const partyMembers: StabPerfPartyMember[] = partyPlayers.map(p => {
        const stabBuff = getStabilityBuff(p);
        const states = (stabBuff?.states ?? []).map(s => [Number(s[0]), Number(s[1])] as [number, number]);
        return {
            key: p.account,
            displayName: p.account.split('.')[0],
            profession: p.profession,
            stacks: integrateStatesPerBucket(states, bucketCount, effectiveBucketMs),
            deaths: new Array(bucketCount).fill(0),
            distances: new Array(bucketCount).fill(0),
        };
    });
```

Note: `EiPlayer['buffUptimes']` may be optional in the type — adjust the helper return type to `NonNullable<EiPlayer['buffUptimes']>[number] | undefined` if TS complains.

- [ ] **Step 4: Run test to verify pass**

Run: `npx vitest run tests/shared/stabPerformance.test.ts`
Expected: PASS (9 tests total).

- [ ] **Step 5: Commit**

```bash
git add src/shared/stabPerformance.ts tests/shared/stabPerformance.test.ts
git commit -m "feat(stabPerformance): compute party member stab stacks per bucket"
```

---

## Task 5: Compute party-member deaths per bucket

**Files:**
- Modify: `src/shared/stabPerformance.ts`
- Modify: `tests/shared/stabPerformance.test.ts`

EI marks deaths as casts of skill id `-28` in the player's `rotation`. Bucket each cast by `Math.floor(castTime / bucketSizeMs)`.

- [ ] **Step 1: Add failing test**

Append:

```ts
describe('party member deaths', () => {
    it('buckets deaths by cast time', () => {
        const mate = makePlayer({
            name: 'M', account: 'M.2', group: 1,
            rotation: [{ id: -28, skills: [{ castTime: 1500, duration: 0 }, { castTime: 4200, duration: 0 }] }],
        });
        const local = makePlayer({ group: 1 });
        const json = makeJson({ durationMS: 5000, players: [local, mate] });
        const result = computeStabPerformance(json, local, 1000);
        expect(result!.partyMembers[0].deaths).toEqual([0, 1, 0, 0, 1]);
    });

    it('returns all zeros when there is no death skill', () => {
        const mate = makePlayer({ name: 'M', account: 'M.2', group: 1, rotation: [] });
        const local = makePlayer({ group: 1 });
        const json = makeJson({ durationMS: 3000, players: [local, mate] });
        const result = computeStabPerformance(json, local, 1000);
        expect(result!.partyMembers[0].deaths).toEqual([0, 0, 0]);
    });
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `npx vitest run tests/shared/stabPerformance.test.ts`
Expected: FAIL — deaths still all `0`.

- [ ] **Step 3: Add helper and use it**

Add helper to `src/shared/stabPerformance.ts`:

```ts
function computeDeathsPerBucket(player: EiPlayer, bucketCount: number, bucketSizeMs: number): number[] {
    const out = new Array<number>(bucketCount).fill(0);
    const deathSkill = (player.rotation ?? []).find(r => Number(r?.id) === DEATH_SKILL_ID);
    if (!deathSkill || !Array.isArray(deathSkill.skills)) return out;
    for (const skill of deathSkill.skills) {
        const idx = Math.min(bucketCount - 1, Math.floor(Number(skill?.castTime || 0) / bucketSizeMs));
        if (idx >= 0) out[idx]++;
    }
    return out;
}
```

Replace `deaths: new Array(bucketCount).fill(0)` in the party members map with:

```ts
            deaths: computeDeathsPerBucket(p, bucketCount, effectiveBucketMs),
```

- [ ] **Step 4: Run test to verify pass**

Run: `npx vitest run tests/shared/stabPerformance.test.ts`
Expected: PASS (11 tests total).

- [ ] **Step 5: Commit**

```bash
git add src/shared/stabPerformance.ts tests/shared/stabPerformance.test.ts
git commit -m "feat(stabPerformance): compute party member deaths per bucket"
```

---

## Task 6: Compute party-member distance to commander per bucket

**Files:**
- Modify: `src/shared/stabPerformance.ts`
- Modify: `tests/shared/stabPerformance.test.ts`

Distance is averaged over polling-rate ticks within the bucket using `combatReplayData.positions`. Convert via `combatReplayMetaData.inchToPixel`. Falls back to `statsAll[0].distToCom` when positions are unavailable.

- [ ] **Step 1: Add failing test**

Append:

```ts
describe('party member distances', () => {
    it('averages per-tick distance from commander positions', () => {
        // Polling 500ms, inchToPixel = 2 → distance in pixels divided by 2 = inches
        // Local commander stays at [0,0]. Mate at [10,0] then [20,0] then [30,0] then [40,0] (10 inches per tick).
        // Bucket [0,1000) covers ticks 0,1: avg pixel dist = (10+20)/2 = 15, /2 = 7.5 inches
        // Bucket [1000,2000) covers ticks 2,3: avg = (30+40)/2 = 35, /2 = 17.5
        const local = makePlayer({
            group: 1, hasCommanderTag: true,
            combatReplayData: { positions: [[0, 0], [0, 0], [0, 0], [0, 0]], start: 0 },
        });
        const mate = makePlayer({
            name: 'M', account: 'M.2', group: 1,
            combatReplayData: { positions: [[10, 0], [20, 0], [30, 0], [40, 0]], start: 0 },
        });
        const json = makeJson({
            durationMS: 2000, players: [local, mate],
            combatReplayMetaData: { pollingRate: 500, inchToPixel: 2 },
        });
        const result = computeStabPerformance(json, local, 1000);
        expect(result!.partyMembers[0].distances).toEqual([7.5, 17.5]);
    });

    it('falls back to statsAll[0].distToCom when positions are missing', () => {
        const local = makePlayer({ group: 1, hasCommanderTag: true, combatReplayData: { positions: [], start: 0 } });
        const mate = makePlayer({
            name: 'M', account: 'M.2', group: 1,
            statsAll: [{ downContribution: 0, distToCom: 425, stackDist: 0, appliedCrowdControl: 0, appliedCrowdControlDuration: 0 }],
            combatReplayData: { positions: [], start: 0 },
        });
        const json = makeJson({ durationMS: 2000, players: [local, mate] });
        const result = computeStabPerformance(json, local, 1000);
        expect(result!.partyMembers[0].distances).toEqual([425, 425]);
    });

    it('uses any commander-tagged player when local player is not commander', () => {
        // Make sure commander resolution works; use squad-mate as commander
        const cmd = makePlayer({ name: 'Cmd', account: 'Cmd.0', group: 1, hasCommanderTag: true,
            combatReplayData: { positions: [[0, 0], [0, 0]], start: 0 } });
        const local = makePlayer({ group: 1, combatReplayData: { positions: [[0, 0], [0, 0]], start: 0 } });
        const mate = makePlayer({ name: 'M', account: 'M.2', group: 1,
            combatReplayData: { positions: [[10, 0], [10, 0]], start: 0 } });
        const json = makeJson({
            durationMS: 1000, players: [cmd, local, mate],
            combatReplayMetaData: { pollingRate: 500, inchToPixel: 1 },
        });
        const result = computeStabPerformance(json, local, 1000);
        // mate is at distance 10 from cmd consistently
        expect(result!.partyMembers[0].distances).toEqual([10]);
    });
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `npx vitest run tests/shared/stabPerformance.test.ts`
Expected: FAIL — distances all `0`.

- [ ] **Step 3: Add helpers and resolve commander**

Add helpers to `src/shared/stabPerformance.ts`:

```ts
function resolveCommander(json: EiJson, localPlayer: EiPlayer): EiPlayer {
    if (localPlayer.hasCommanderTag) return localPlayer;
    const tagged = json.players.find(p => p?.hasCommanderTag && !p.notInSquad && !p.isFake);
    return tagged ?? localPlayer;
}

function computeDistancesPerBucket(
    player: EiPlayer,
    cmdPositions: Array<[number, number]>,
    cmdStartMs: number,
    pollingRate: number,
    inchToPixel: number,
    fallbackDist: number,
    bucketCount: number,
    bucketSizeMs: number,
): number[] {
    const playerPositions = player.combatReplayData?.positions ?? [];
    const playerStartMs = Number(player.combatReplayData?.start ?? 0);
    const cmdOffset = Math.floor(cmdStartMs / pollingRate);
    const playerOffset = Math.floor(playerStartMs / pollingRate);

    return Array.from({ length: bucketCount }, (_, b) => {
        if (cmdPositions.length === 0 || playerPositions.length === 0) return fallbackDist;
        const bucketStart = b * bucketSizeMs;
        const bucketEnd = bucketStart + bucketSizeMs;
        let sum = 0;
        let count = 0;
        for (let t = bucketStart; t < bucketEnd; t += pollingRate) {
            const tick = Math.floor(t / pollingRate);
            const cmdIdx = tick - cmdOffset;
            const playerIdx = tick - playerOffset;
            if (cmdIdx < 0 || cmdIdx >= cmdPositions.length) continue;
            if (playerIdx < 0 || playerIdx >= playerPositions.length) continue;
            const [cx, cy] = cmdPositions[cmdIdx];
            const [px, py] = playerPositions[playerIdx];
            const d = Math.hypot(px - cx, py - cy) / inchToPixel;
            if (Number.isFinite(d)) { sum += d; count++; }
        }
        return count > 0 ? sum / count : fallbackDist;
    });
}
```

Wire it into the partyMembers construction. Insert before the `partyMembers` map:

```ts
    const meta = json.combatReplayMetaData ?? {};
    const inchToPixel = Number(meta.inchToPixel || 0) > 0 ? Number(meta.inchToPixel) : 1;
    const pollingRate = Number(meta.pollingRate || 0) > 0 ? Number(meta.pollingRate) : 500;
    const commander = resolveCommander(json, localPlayer);
    const cmdPositions = (commander.combatReplayData?.positions ?? []) as Array<[number, number]>;
    const cmdStartMs = Number(commander.combatReplayData?.start ?? 0);
```

Replace `distances: new Array(bucketCount).fill(0)` with:

```ts
            distances: computeDistancesPerBucket(
                p,
                cmdPositions,
                cmdStartMs,
                pollingRate,
                inchToPixel,
                Number(p.statsAll?.[0]?.distToCom ?? 0),
                bucketCount,
                effectiveBucketMs,
            ),
```

- [ ] **Step 4: Run test to verify pass**

Run: `npx vitest run tests/shared/stabPerformance.test.ts`
Expected: PASS (14 tests total).

- [ ] **Step 5: Commit**

```bash
git add src/shared/stabPerformance.ts tests/shared/stabPerformance.test.ts
git commit -m "feat(stabPerformance): compute distance-to-commander per bucket"
```

---

## Task 7: Compute party incoming damage per bucket

**Files:**
- Modify: `src/shared/stabPerformance.ts`
- Modify: `tests/shared/stabPerformance.test.ts`

`damageTaken1S` is `number[][]` per target — first row contains cumulative per-second damage taken across the fight. Convert cumulative to per-second deltas, sum across party, then sum into buckets.

- [ ] **Step 1: Add failing test**

Append:

```ts
describe('party incoming damage', () => {
    it('sums per-second deltas across party into buckets', () => {
        const local = makePlayer({ group: 1 });
        // Mate1 cumulative: [0, 100, 250, 400, 600] over 5s → deltas [0, 100, 150, 150, 200]
        // Mate2 cumulative: [0, 50,  50, 200, 200] → deltas [0, 50, 0, 150, 0]
        // Per-sec sum: [0, 150, 150, 300, 200]
        // 2s buckets: [0, 150+150, 300+200] but bucket count = ceil(5/2) = 3
        //   bucket 0 [0,2): seconds 0,1 → 0+150 = 150
        //   bucket 1 [2,4): seconds 2,3 → 150+300 = 450
        //   bucket 2 [4,6): second 4 → 200
        const mate1 = makePlayer({ name: 'M1', account: 'M1.2', group: 1, damageTaken1S: [[0, 100, 250, 400, 600]] });
        const mate2 = makePlayer({ name: 'M2', account: 'M2.3', group: 1, damageTaken1S: [[0, 50, 50, 200, 200]] });
        const json = makeJson({ durationMS: 5000, players: [local, mate1, mate2] });
        const result = computeStabPerformance(json, local, 2000);
        expect(result!.partyIncomingDamage).toEqual([150, 450, 200]);
    });

    it('returns zeros when no party damage data exists', () => {
        const local = makePlayer({ group: 1 });
        const mate = makePlayer({ name: 'M', account: 'M.2', group: 1, damageTaken1S: [[]] });
        const json = makeJson({ durationMS: 3000, players: [local, mate] });
        const result = computeStabPerformance(json, local, 1000);
        expect(result!.partyIncomingDamage).toEqual([0, 0, 0]);
    });
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `npx vitest run tests/shared/stabPerformance.test.ts`
Expected: FAIL.

- [ ] **Step 3: Add helper and use it**

Add to `src/shared/stabPerformance.ts`:

```ts
function cumulativeToDeltas(cum: number[]): number[] {
    return cum.map((v, i) => Math.max(0, Number(v || 0) - Number(cum[i - 1] || 0)));
}

function computePartyIncomingDamage(
    partyPlayers: EiPlayer[],
    bucketCount: number,
    bucketSizeMs: number,
): number[] {
    const out = new Array<number>(bucketCount).fill(0);
    const bucketSizeSec = Math.max(1, Math.round(bucketSizeMs / 1000));
    for (const p of partyPlayers) {
        const row = (p.damageTaken1S ?? [])[0] ?? [];
        if (row.length === 0) continue;
        const deltas = cumulativeToDeltas(row.map(Number));
        for (let s = 0; s < deltas.length; s++) {
            const bucketIdx = Math.min(bucketCount - 1, Math.floor(s / bucketSizeSec));
            out[bucketIdx] += deltas[s];
        }
    }
    return out;
}
```

Replace `partyIncomingDamage: new Array(bucketCount).fill(0)` in the return object with:

```ts
        partyIncomingDamage: computePartyIncomingDamage(partyPlayers, bucketCount, effectiveBucketMs),
```

- [ ] **Step 4: Run test to verify pass**

Run: `npx vitest run tests/shared/stabPerformance.test.ts`
Expected: PASS (16 tests total).

- [ ] **Step 5: Commit**

```bash
git add src/shared/stabPerformance.ts tests/shared/stabPerformance.test.ts
git commit -m "feat(stabPerformance): compute party incoming damage per bucket"
```

---

## Task 8: Compute local player's stab generation per bucket

**Files:**
- Modify: `src/shared/stabPerformance.ts`
- Modify: `tests/shared/stabPerformance.test.ts`

For each squad member (any group), read their `buffUptimes[id=1122].statesPerSource[localPlayerName]` — the timeline of stab applied **by the local player** to that target. Integrate stack-ms, sum across all squad members, divide by `bucketSizeMs`.

Fallback when no `statesPerSource` data: distribute `selfBuffs[stab].generation + groupBuffs[stab].generation + squadBuffs[stab].generation` (in ms) evenly across all buckets, converted to avg stacks per bucket via `(totalGenMs / fightDurationMs)` (i.e., constant uptime fraction). This is less truthful — flag with a code comment.

- [ ] **Step 1: Add failing test**

Append:

```ts
describe('local player stab generation', () => {
    it('integrates statesPerSource across all squad members', () => {
        // Local applies stab to two squad-mates.
        // Mate1 receives 3 stacks at t=0, falls to 0 at t=1000 → 3 stack-seconds in [0,1000)
        // Mate2 receives 2 stacks at t=500, falls to 0 at t=1500 → in [0,1000): 2*500ms = 1 stack-sec
        //   in [1000,2000): 2*500ms = 1 stack-sec
        // Bucket [0,1000): (3000 + 1000)/1000 = 4 avg stacks
        // Bucket [1000,2000): (0 + 1000)/1000 = 1 avg stack
        const local = makePlayer({ name: 'Local', account: 'Local.1', group: 1 });
        const mate1 = makePlayer({
            name: 'M1', account: 'M1.2', group: 1,
            buffUptimes: [{
                id: 1122,
                buffData: [{ uptime: 0, generation: 0, overstack: 0, wasted: 0 }],
                statesPerSource: { 'Local': [[0, 3], [1000, 0]] },
            }],
        });
        const mate2 = makePlayer({
            name: 'M2', account: 'M2.3', group: 2,
            buffUptimes: [{
                id: 1122,
                buffData: [{ uptime: 0, generation: 0, overstack: 0, wasted: 0 }],
                statesPerSource: { 'Local': [[500, 2], [1500, 0]] },
            }],
        });
        const json = makeJson({ durationMS: 2000, players: [local, mate1, mate2] });
        const result = computeStabPerformance(json, local, 1000);
        expect(result!.selfGeneration).toEqual([4, 1]);
    });

    it('falls back to evenly distributed total generation when no statesPerSource', () => {
        // local has selfBuffs gen 1000ms over 2000ms fight → uptime fraction 0.5 → 0.5 avg stacks per bucket
        const local = makePlayer({
            group: 1,
            selfBuffs: [{ id: 1122, buffData: [{ generation: 1000, overstack: 0, wasted: 0 }] }],
            groupBuffs: [], squadBuffs: [],
        });
        const json = makeJson({ durationMS: 2000, players: [local] });
        const result = computeStabPerformance(json, local, 1000);
        expect(result!.selfGeneration).toEqual([0.5, 0.5]);
    });

    it('returns zeros when no generation data exists', () => {
        const local = makePlayer({ group: 1 });
        const json = makeJson({ durationMS: 3000, players: [local] });
        const result = computeStabPerformance(json, local, 1000);
        expect(result!.selfGeneration).toEqual([0, 0, 0]);
    });
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `npx vitest run tests/shared/stabPerformance.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement self generation**

Add to `src/shared/stabPerformance.ts`:

```ts
function computeSelfGenerationPerBucket(
    json: EiJson,
    localPlayer: EiPlayer,
    bucketCount: number,
    bucketSizeMs: number,
    durationMs: number,
): number[] {
    const localName = localPlayer.name;
    const squadMembers = json.players.filter(p => p && !p.notInSquad && !p.isFake);
    let anyStatesPerSource = false;
    const summed = new Array<number>(bucketCount).fill(0);
    for (const member of squadMembers) {
        const stab = (member.buffUptimes ?? []).find(b => Number(b?.id) === STABILITY_BUFF_ID);
        const sps = stab?.statesPerSource;
        if (!sps || typeof sps !== 'object') continue;
        const sourceStates = sps[localName];
        if (!Array.isArray(sourceStates) || sourceStates.length === 0) continue;
        anyStatesPerSource = true;
        const states = sourceStates.map(s => [Number(s[0]), Number(s[1])] as [number, number]);
        const perBucket = integrateStatesPerBucket(states, bucketCount, bucketSizeMs);
        for (let b = 0; b < bucketCount; b++) summed[b] += perBucket[b];
    }
    if (anyStatesPerSource) return summed;

    // Fallback: distribute total generation evenly. Less accurate; statesPerSource is preferred.
    let totalGenMs = 0;
    for (const buff of localPlayer.selfBuffs ?? []) {
        if (Number(buff?.id) === STABILITY_BUFF_ID) totalGenMs += Number(buff.buffData?.[0]?.generation || 0);
    }
    for (const buff of localPlayer.groupBuffs ?? []) {
        if (Number(buff?.id) === STABILITY_BUFF_ID) totalGenMs += Number(buff.buffData?.[0]?.generation || 0);
    }
    for (const buff of localPlayer.squadBuffs ?? []) {
        if (Number(buff?.id) === STABILITY_BUFF_ID) totalGenMs += Number(buff.buffData?.[0]?.generation || 0);
    }
    if (totalGenMs <= 0 || durationMs <= 0) return summed;
    const uptimeFraction = totalGenMs / durationMs;
    return summed.map(() => uptimeFraction);
}
```

Replace `selfGeneration: new Array(bucketCount).fill(0)` with:

```ts
        selfGeneration: computeSelfGenerationPerBucket(json, localPlayer, bucketCount, effectiveBucketMs, durationMs),
```

Note: the `EiPlayer.buffUptimes[i]` type has `statesPerSource?: Record<string, [number, number][]>` (already in `types.ts`). If TS complains it's not present, add it to the type before this task. Verify with `Grep`.

- [ ] **Step 4: Run test to verify pass**

Run: `npx vitest run tests/shared/stabPerformance.test.ts`
Expected: PASS (19 tests total).

- [ ] **Step 5: Commit**

```bash
git add src/shared/stabPerformance.ts tests/shared/stabPerformance.test.ts
git commit -m "feat(stabPerformance): compute local player stab generation per bucket"
```

---

## Task 9: Wire computation into extractPlayerData

**Files:**
- Modify: `src/shared/extractPlayerData.ts`
- Modify: `tests/shared/extractPlayerData.test.ts` (only if it asserts on `boons` shape)

- [ ] **Step 1: Add import**

In `src/shared/extractPlayerData.ts`, add to the import block at the top (alongside other shared imports):

```ts
import { computeStabPerformance } from './stabPerformance';
```

- [ ] **Step 2: Populate the field in the returned object**

Find the `boons:` block (around line 410):

```ts
        boons: {
            uptimes: extractBoonUptimes(player),
            generation: extractBoonGeneration(player),
        },
```

Replace with:

```ts
        boons: {
            uptimes: extractBoonUptimes(player),
            generation: extractBoonGeneration(player),
            stabPerformance: computeStabPerformance(json, player, bucketSizeMs),
        },
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: PASS — `BoonStats.stabPerformance` is now satisfied. If `tests/shared/extractPlayerData.test.ts` constructs `boons` literals, add `stabPerformance: null` to those fixtures to satisfy the type.

- [ ] **Step 4: Run all shared tests**

Run: `npx vitest run tests/shared/`
Expected: PASS for all suites.

- [ ] **Step 5: Commit**

```bash
git add src/shared/extractPlayerData.ts tests/shared/
git commit -m "feat(stabPerformance): attach breakdown to extracted player fight data"
```

---

## Task 10: Build StabPerformanceChart component

**Files:**
- Create: `src/renderer/views/pulse/StabPerformanceChart.tsx`

This is a single-file component, ~250 lines. No tests — visual component verified by manual dev-server check at the end. Follow existing renderer patterns (framer-motion entry, dark theme tokens, tailwind classes).

- [ ] **Step 1: Create the component file**

Create `src/renderer/views/pulse/StabPerformanceChart.tsx`:

```tsx
import { useState } from 'react';
import { motion } from 'framer-motion';
import {
    Bar, Brush, CartesianGrid, Cell, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { MapPin, Shield, Skull } from 'lucide-react';
import type { StabPerfBreakdown } from '../../../shared/types';

const PARTY_MEMBER_COLORS = [
    '#a78bfa', '#34d399', '#f59e0b', '#60a5fa', '#f472b6',
    '#fb923c', '#4ade80', '#e879f9', '#38bdf8', '#fbbf24',
];

const SELF_LINE_COLOR = '#10b981'; // brand-primary
const DISTANCE_THRESHOLD = 600;

type Props = {
    breakdown: StabPerfBreakdown;
};

type ChartPoint = {
    label: string;
    value: number;
    incomingDamage: number;
    incomingIntensity: number;
    incomingHeatBand: 1;
    [memberKey: string]: any; // pm_<key>, deaths_<key>, distance_<key>
};

export function StabPerformanceChart({ breakdown }: Props) {
    const [showHeatmap, setShowHeatmap] = useState(true);
    const [showDeaths, setShowDeaths] = useState(true);
    const [showDistance, setShowDistance] = useState(true);

    const incomingMax = breakdown.partyIncomingDamage.reduce((m, v) => Math.max(m, v), 0);
    const hasIncomingHeat = incomingMax > 0;

    const data: ChartPoint[] = breakdown.buckets.map((b, i) => {
        const incomingDamage = breakdown.partyIncomingDamage[i] ?? 0;
        const intensity = incomingMax > 0 ? Math.max(0, Math.min(1, incomingDamage / incomingMax)) : 0;
        const point: ChartPoint = {
            label: b.label,
            value: breakdown.selfGeneration[i] ?? 0,
            incomingDamage,
            incomingIntensity: intensity,
            incomingHeatBand: 1,
        };
        for (const m of breakdown.partyMembers) {
            point[`pm_${m.key}`] = m.stacks[i] ?? 0;
            point[`deaths_${m.key}`] = m.deaths[i] ?? 0;
            point[`distance_${m.key}`] = m.distances[i] ?? 0;
        }
        return point;
    });

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3, duration: 0.3 }}
        >
            <div className="flex items-center justify-between mb-3">
                <div className="text-xs uppercase tracking-[0.08em] font-medium flex items-center gap-1.5"
                    style={{ color: 'var(--text-muted)' }}>
                    <Shield className="w-3.5 h-3.5 text-violet-300" />
                    Stab Performance
                </div>
                <div className="flex gap-3">
                    <ToggleButton active={showHeatmap} onClick={() => setShowHeatmap(v => !v)}
                        activeColor="text-red-300" hoverActive="hover:text-red-200">
                        Party Damage
                    </ToggleButton>
                    <ToggleButton active={showDeaths} onClick={() => setShowDeaths(v => !v)}
                        activeColor="text-red-400" hoverActive="hover:text-red-300">
                        Deaths
                    </ToggleButton>
                    <ToggleButton active={showDistance} onClick={() => setShowDistance(v => !v)}
                        activeColor="text-yellow-300" hoverActive="hover:text-yellow-200"
                        title={`Flags party members averaging more than ${DISTANCE_THRESHOLD} units from the commander`}>
                        Distance
                    </ToggleButton>
                </div>
            </div>

            {breakdown.partyMembers.length > 0 && (
                <div className="flex flex-wrap gap-x-4 gap-y-1 mb-2">
                    {breakdown.partyMembers.map((m, mi) => (
                        <div key={m.key} className="flex items-center gap-1.5">
                            <div className="w-5 h-0"
                                style={{ borderTop: `2px dashed ${PARTY_MEMBER_COLORS[mi % PARTY_MEMBER_COLORS.length]}` }} />
                            <span className="text-[10px] text-[color:var(--text-muted)]">{m.displayName}</span>
                        </div>
                    ))}
                </div>
            )}

            <div className="h-[260px] rounded-md p-2" style={{ background: 'var(--bg-card)' }}>
                <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={data}>
                        <CartesianGrid stroke="rgba(255,255,255,0.08)" strokeDasharray="3 3" />
                        <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#64748b' }}
                            axisLine={{ stroke: 'rgba(255,255,255,0.08)' }} tickLine={false} />
                        <YAxis tick={{ fontSize: 10, fill: '#64748b' }}
                            axisLine={{ stroke: 'rgba(255,255,255,0.08)' }} tickLine={false}
                            tickFormatter={(v: number) => v.toFixed(1)} width={36} />
                        <YAxis yAxisId="incomingHeat" hide domain={[0, 1]} />
                        <YAxis yAxisId="stabStacks" hide domain={[0, 25]} />
                        <Tooltip content={(props: any) => (
                            <StabTooltip {...props} breakdown={breakdown}
                                showHeatmap={showHeatmap} />
                        )} />
                        {showHeatmap && hasIncomingHeat && (
                            <Bar
                                yAxisId="incomingHeat"
                                dataKey="incomingHeatBand"
                                barSize={24}
                                fill="rgba(239,68,68,0.35)"
                                stroke="none"
                                isAnimationActive={false}
                            >
                                {data.map((entry, idx) => {
                                    const alpha = 0.06 + 0.52 * entry.incomingIntensity;
                                    return <Cell key={`heat-${idx}`} fill={`rgba(239, 68, 68, ${alpha.toFixed(3)})`} />;
                                })}
                            </Bar>
                        )}
                        <Line type="monotone" dataKey="value"
                            name="Self Stab Generation"
                            stroke={SELF_LINE_COLOR} strokeWidth={2}
                            dot={{ r: 2, fill: SELF_LINE_COLOR }}
                            activeDot={{ r: 4 }}
                            isAnimationActive animationDuration={500} animationEasing="ease-out" />
                        {breakdown.partyMembers.map((m, mi) => {
                            const color = PARTY_MEMBER_COLORS[mi % PARTY_MEMBER_COLORS.length];
                            return (
                                <Line key={m.key}
                                    yAxisId="stabStacks"
                                    type="monotone"
                                    dataKey={`pm_${m.key}`}
                                    name={m.displayName}
                                    stroke={color} strokeWidth={1.5} strokeDasharray="4 2"
                                    dot={(props: any) => {
                                        const point = props.payload;
                                        if (!point) return null;
                                        const deaths = Number(point[`deaths_${m.key}`] || 0);
                                        const distance = Number(point[`distance_${m.key}`] || 0);
                                        const hasDeath = showDeaths && deaths > 0;
                                        const hasFar = showDistance && distance > DISTANCE_THRESHOLD;
                                        if (!hasDeath && !hasFar) return null;
                                        const size = 16;
                                        const half = size / 2;
                                        return (
                                            <g transform={`translate(${props.cx - half}, ${props.cy - half})`}>
                                                {hasDeath && <Skull width={size} height={size} color="#ffffff" strokeWidth={2} />}
                                                {!hasDeath && hasFar && <MapPin width={size} height={size} color="#fbbf24" strokeWidth={2} />}
                                            </g>
                                        );
                                    }}
                                    activeDot={{ r: 3, fill: color }}
                                    isAnimationActive animationDuration={500} animationEasing="ease-out" />
                            );
                        })}
                        {data.length > 10 && (
                            <Brush dataKey="label" height={20}
                                stroke="rgba(129,140,248,0.4)" fill="rgba(15,23,42,0.8)"
                                travellerWidth={8} tickFormatter={() => ''} />
                        )}
                    </ComposedChart>
                </ResponsiveContainer>
            </div>
        </motion.div>
    );
}

function ToggleButton({
    active, onClick, activeColor, hoverActive, title, children,
}: {
    active: boolean;
    onClick: () => void;
    activeColor: string;
    hoverActive: string;
    title?: string;
    children: React.ReactNode;
}) {
    return (
        <button
            onClick={onClick}
            title={title}
            className={`text-[10px] uppercase tracking-wider transition-colors ${
                active ? `${activeColor} ${hoverActive}` : 'text-slate-500 hover:text-slate-300'
            }`}
        >
            {children}
        </button>
    );
}

function StabTooltip({
    payload, label, breakdown, showHeatmap,
}: {
    payload?: any[];
    label?: string;
    breakdown: StabPerfBreakdown;
    showHeatmap: boolean;
}) {
    if (!payload || payload.length === 0) return null;
    const point = payload[0]?.payload || {};
    const gen = Number(point.value || 0);
    const damage = Number(point.incomingDamage || 0);
    const sortedMembers = [...breakdown.partyMembers]
        .sort((a, b) => a.displayName.localeCompare(b.displayName));

    return (
        <div className="bg-slate-900 border border-white/10 rounded-lg px-3 py-2 text-xs shadow-xl">
            <div className="text-slate-200 font-medium mb-1">
                {String(label || '')}
                {gen > 0 && (
                    <span className="text-emerald-300">{` · Gen: ${gen.toFixed(2)} stacks`}</span>
                )}
            </div>
            {showHeatmap && damage > 0 && (
                <div className="text-red-300 mb-1">
                    Party Incoming Damage: {Math.round(damage).toLocaleString()}
                </div>
            )}
            {sortedMembers.map(m => {
                const mi = breakdown.partyMembers.indexOf(m);
                const color = PARTY_MEMBER_COLORS[mi % PARTY_MEMBER_COLORS.length];
                const stacks = Number(point[`pm_${m.key}`] ?? 0);
                const deaths = Number(point[`deaths_${m.key}`] || 0);
                const distance = Number(point[`distance_${m.key}`] || 0);
                const hasFar = distance > DISTANCE_THRESHOLD;
                return (
                    <div key={m.key} style={{ color }} className="py-px flex items-center gap-1">
                        <span>{m.displayName}</span>
                        <span>: {stacks === 0 ? 'No stab' : `${stacks.toFixed(1)} stacks`}</span>
                        {distance > 0 && (
                            <span className={`flex items-center gap-0.5 ${hasFar ? 'text-yellow-400' : 'text-slate-400'}`}>
                                <MapPin className="inline w-3 h-3" />
                                {Math.round(distance)}u
                            </span>
                        )}
                        {deaths > 0 && <Skull className="inline w-3.5 h-3.5 text-white" />}
                    </div>
                );
            })}
        </div>
    );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/views/pulse/StabPerformanceChart.tsx
git commit -m "feat(pulse): add StabPerformanceChart component"
```

---

## Task 11: Render the chart in BoonsSubview

**Files:**
- Modify: `src/renderer/views/pulse/BoonsSubview.tsx`

- [ ] **Step 1: Import the component**

At the top of `src/renderer/views/pulse/BoonsSubview.tsx`, add:

```ts
import { StabPerformanceChart } from './StabPerformanceChart';
```

- [ ] **Step 2: Render after Boon Generation**

At the end of the outer `<div className="space-y-5">`, after the closing `)}` of the Boon Generation block (line 143), add:

```tsx
            {boons.stabPerformance && (
                <StabPerformanceChart breakdown={boons.stabPerformance} />
            )}
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/views/pulse/BoonsSubview.tsx
git commit -m "feat(pulse): render StabPerformanceChart in Boons subview"
```

---

## Task 12: Manual verification in dev server

**Files:** none

- [ ] **Step 1: Run full test suite**

Run: `npx vitest run`
Expected: all tests PASS.

- [ ] **Step 2: Run type check and build**

Run: `npx tsc --noEmit && npm run build`
Expected: clean build, no TS errors.

- [ ] **Step 3: Start dev server**

Run: `npm run dev`

- [ ] **Step 4: Visual checklist**

Open the app, load a fight where the local player generated stability (a Firebrand or Spellbreaker fight is ideal):

- [ ] Pulse → Boons tab shows a "Stab Performance" section below "Boon Generation".
- [ ] Solid emerald line traces local player's stab generation across the fight.
- [ ] One dashed line per group-mate, color-coded with a legend strip above the chart.
- [ ] Three header toggles (Party Damage, Deaths, Distance) flip on/off, updating the chart.
- [ ] Hover a bucket: tooltip lists each party member's stacks, distance with map-pin icon, death indicator if any.
- [ ] Skull icons render on dashed lines at death buckets when "Deaths" is on.
- [ ] MapPin icons render at >600u distance buckets when "Distance" is on.
- [ ] Red heatmap bars increase in opacity with party incoming damage when "Party Damage" is on.
- [ ] Brush appears for fights longer than 10 buckets and scrubs cleanly.

- [ ] **Step 5: Verify the empty/no-stab case**

Load a fight where the local player generated no stability (e.g., a DPS class):

- [ ] Section still renders.
- [ ] Solid line stays at 0.
- [ ] Party overlays (stacks, deaths, distance, heatmap) still work.

- [ ] **Step 6: Commit any final tweaks**

If any visual fixes were needed during the manual pass, commit them now:

```bash
git add -A
git commit -m "fix(stabPerformance): visual polish from manual review"
```

---

## Done

The local player can now see how their stab generation lined up with party need across any single fight, directly in the Pulse → Boons subview.
