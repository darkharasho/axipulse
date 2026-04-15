# Role-Aware Pulse Overview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Detect the local player's role (damage vs support) using squad-relative combat metrics and adjust the Pulse overview to emphasize role-relevant stats.

**Architecture:** A standalone `classifyRole.ts` module (ported from axibridge) computes a weighted support score per player against squad medians. The result is attached to `PlayerFightData` during extraction. `OverviewSubview` reads the role and renders a damage-focused or support-focused layout with appropriate hero banner and stat cards.

**Tech Stack:** TypeScript, React, Vitest, Tailwind CSS, Framer Motion

---

### Task 1: Role Classification Module — Tests

**Files:**
- Create: `tests/shared/classifyRole.test.ts`

- [ ] **Step 1: Write tests for `classifyRole`**

Create `tests/shared/classifyRole.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { classifySquadRoles } from '../../src/shared/classifyRole';
import type { EiPlayer } from '../../src/shared/types';

function makePlayer(overrides: Partial<EiPlayer> = {}): EiPlayer {
    return {
        name: 'Test', account: 'Test.1234', profession: 'Guardian', elite_spec: 'Firebrand',
        group: 1, hasCommanderTag: false, notInSquad: false, isFake: false,
        activeTimes: [60000],
        dpsAll: [{ damage: 100000, dps: 1667, breakbarDamage: 0 }],
        statsAll: [{ downContribution: 0, distToCom: 0, stackDist: 0, appliedCrowdControl: 0, appliedCrowdControlDuration: 0 }],
        defenses: [{ damageTaken: 0, deadCount: 0, downCount: 0, dodgeCount: 0, blockedCount: 0, evadedCount: 0, missedCount: 0, invulnedCount: 0, interruptedCount: 0, receivedCrowdControl: 0, receivedCrowdControlDuration: 0, boonStrips: 0, boonStripsTime: 0 }],
        support: [{ condiCleanse: 0, condiCleanseSelf: 0, boonStrips: 0, boonStripsTime: 0 }],
        damage1S: [[]], targetDamage1S: [[]], totalDamageDist: [[]], buffUptimes: [],
        selfBuffs: [], groupBuffs: [], squadBuffs: [], rotation: [],
        totalDamageTaken: [],
        ...overrides,
    } as EiPlayer;
}

function makeDpsPlayer(account: string): EiPlayer {
    return makePlayer({
        name: account, account,
        dpsAll: [{ damage: 200000, dps: 3333, breakbarDamage: 500 }],
        statsAll: [{ downContribution: 12, distToCom: 200, stackDist: 200, appliedCrowdControl: 5, appliedCrowdControlDuration: 6000 }],
        support: [{ condiCleanse: 3, condiCleanseSelf: 2, boonStrips: 20, boonStripsTime: 8000 }],
    });
}

function makeSupportPlayer(account: string): EiPlayer {
    return makePlayer({
        name: account, account,
        dpsAll: [{ damage: 40000, dps: 667, breakbarDamage: 0 }],
        statsAll: [{ downContribution: 1, distToCom: 150, stackDist: 150, appliedCrowdControl: 0, appliedCrowdControlDuration: 0 }],
        support: [{ condiCleanse: 80, condiCleanseSelf: 10, boonStrips: 5, boonStripsTime: 2000 }],
        extHealingStats: {
            outgoingHealingAllies: [[{ healing: 50000 }], [{ healing: 30000 }]],
            totalHealingDist: [],
        },
        squadBuffs: [
            { id: 717, buffData: [{ generation: 60, overstack: 5, wasted: 2 }] },
            { id: 718, buffData: [{ generation: 55, overstack: 3, wasted: 1 }] },
            { id: 740, buffData: [{ generation: 70, overstack: 8, wasted: 3 }] },
        ],
    });
}

describe('classifySquadRoles', () => {
    it('classifies DPS players in an all-DPS squad as damage', () => {
        const players = [makeDpsPlayer('A.1'), makeDpsPlayer('B.2'), makeDpsPlayer('C.3')];
        const result = classifySquadRoles(players);
        for (const p of players) {
            expect(result.get(p.account)!.role).toBe('damage');
        }
    });

    it('classifies healer as support in a mixed squad', () => {
        const healer = makeSupportPlayer('Healer.1');
        const players = [makeDpsPlayer('A.1'), makeDpsPlayer('B.2'), makeDpsPlayer('C.3'), healer];
        const result = classifySquadRoles(players);
        expect(result.get('Healer.1')!.role).toBe('support');
        expect(result.get('A.1')!.role).toBe('damage');
    });

    it('returns confidence scores between 0 and 1', () => {
        const players = [makeDpsPlayer('A.1'), makeSupportPlayer('Healer.1')];
        const result = classifySquadRoles(players);
        for (const classification of result.values()) {
            expect(classification.confidenceScore).toBeGreaterThanOrEqual(0);
            expect(classification.confidenceScore).toBeLessThanOrEqual(1);
        }
    });

    it('handles single player (defaults to damage)', () => {
        const result = classifySquadRoles([makeDpsPlayer('Solo.1')]);
        expect(result.get('Solo.1')!.role).toBe('damage');
    });

    it('handles empty array', () => {
        const result = classifySquadRoles([]);
        expect(result.size).toBe(0);
    });

    it('classifies based on metrics not spec name', () => {
        const healGuardian = makeSupportPlayer('HealGuard.1');
        healGuardian.profession = 'Guardian';
        healGuardian.elite_spec = 'Firebrand';
        const players = [makeDpsPlayer('A.1'), makeDpsPlayer('B.2'), healGuardian];
        const result = classifySquadRoles(players);
        expect(result.get('HealGuard.1')!.role).toBe('support');
    });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/shared/classifyRole.test.ts`
Expected: FAIL — `classifySquadRoles` not found / module does not exist

---

### Task 2: Role Classification Module — Implementation

**Files:**
- Create: `src/shared/classifyRole.ts`

- [ ] **Step 1: Implement `classifySquadRoles`**

Create `src/shared/classifyRole.ts`:

```typescript
import type { EiPlayer } from './types';
import { getHealingOutput } from './combatMetrics';
import { getDps, getDamage, getCleanses, getDownContribution } from './dashboardMetrics';

export interface RoleClassification {
    role: 'support' | 'damage';
    supportScore: number;
    confidenceScore: number;
}

const WEIGHTS = {
    healing: 1.8,
    cleanses: 1.6,
    totalBoonOutput: 1.8,
    dps: -0.8,
    damage: -1.5,
    downContrib: -2.5,
} as const;

const THRESHOLD_MULTIPLIER = 1.25;
const OUTLIER_RATIO = 2.0;

function computeMedian(values: number[]): number {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function computeRatio(value: number, median: number): number {
    if (median > 0) return value / median;
    if (value > 0) return OUTLIER_RATIO;
    return 0;
}

function getOutgoingHealing(player: EiPlayer): number {
    const total = getHealingOutput(player);
    if (!player.extHealingStats?.outgoingHealingAllies) return 0;
    let selfHealing = 0;
    const selfPhase = player.extHealingStats.outgoingHealingAllies[0];
    if (selfPhase) {
        for (const phase of selfPhase) {
            selfHealing += phase.healing;
        }
    }
    return Math.max(total - selfHealing, 0);
}

function getTotalBoonOutput(player: EiPlayer): number {
    let total = 0;
    for (const buff of player.squadBuffs ?? []) {
        total += buff.buffData[0]?.generation ?? 0;
    }
    return total;
}

export function classifySquadRoles(players: EiPlayer[]): Map<string, RoleClassification> {
    const result = new Map<string, RoleClassification>();
    if (players.length === 0) return result;

    const metricDefs = [
        { weight: WEIGHTS.healing, getValue: getOutgoingHealing },
        { weight: WEIGHTS.cleanses, getValue: getCleanses },
        { weight: WEIGHTS.totalBoonOutput, getValue: getTotalBoonOutput },
        { weight: WEIGHTS.dps, getValue: getDps },
        { weight: WEIGHTS.damage, getValue: getDamage },
        { weight: WEIGHTS.downContrib, getValue: getDownContribution },
    ];

    const medians = metricDefs.map(def => {
        const values = players.map(p => def.getValue(p)).filter(v => v > 0);
        return computeMedian(values);
    });

    const scores = players.map(p => {
        let supportScore = 0;
        for (let i = 0; i < metricDefs.length; i++) {
            const value = metricDefs[i].getValue(p);
            const ratio = computeRatio(value, medians[i]);
            supportScore += ratio * metricDefs[i].weight;
        }
        return { account: p.account, supportScore };
    });

    const allScores = scores.map(s => s.supportScore);
    const medianScore = computeMedian(allScores);
    const threshold = medianScore + Math.abs(medianScore) * (THRESHOLD_MULTIPLIER - 1);

    const maxScore = Math.max(...allScores);
    const minScore = Math.min(...allScores);
    const supportSpan = Math.abs(maxScore - threshold) || 1;
    const damageSpan = Math.abs(threshold - minScore) || 1;

    for (const { account, supportScore } of scores) {
        const role: 'support' | 'damage' = supportScore > threshold ? 'support' : 'damage';
        const span = role === 'support' ? supportSpan : damageSpan;
        const confidenceScore = Math.min(Math.abs(supportScore - threshold) / span, 1);
        result.set(account, { role, supportScore, confidenceScore });
    }

    return result;
}
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `npx vitest run tests/shared/classifyRole.test.ts`
Expected: All 6 tests PASS

- [ ] **Step 3: Commit**

```bash
git add src/shared/classifyRole.ts tests/shared/classifyRole.test.ts
git commit -m "feat: add role classification module with tests"
```

---

### Task 3: Type Changes

**Files:**
- Modify: `src/shared/types.ts:120-147` (PlayerFightData) and `src/shared/types.ts:240-247` (SquadContext)

- [ ] **Step 1: Add `RoleClassification` import and new fields to types**

In `src/shared/types.ts`, add the import at the top:

```typescript
import type { RoleClassification } from './classifyRole';
```

Add to `PlayerFightData` (after the `movementData` field at line 146):

```typescript
    roleClassification: RoleClassification;
    distanceToTag: { average: number; median: number } | null;
```

Add to `SquadContext` (after `healingRank` at line 246):

```typescript
    damageTakenRank: number;
```

- [ ] **Step 2: Run type check to see what breaks**

Run: `npx tsc --noEmit`
Expected: Errors in `extractPlayerData.ts` (missing new required fields) — this confirms the types are wired in and will be fixed in Task 4.

- [ ] **Step 3: Commit**

```bash
git add src/shared/types.ts
git commit -m "feat: add RoleClassification, distanceToTag, damageTakenRank to types"
```

---

### Task 4: Extraction Layer Changes — Tests

**Files:**
- Modify: `tests/shared/extractPlayerData.test.ts`

- [ ] **Step 1: Add tests for new extracted fields**

Append to the existing `describe('extractPlayerFightData', ...)` block in `tests/shared/extractPlayerData.test.ts`:

```typescript
    it('includes roleClassification', () => {
        const result = extractPlayerFightData(makeMinimalEiJson(), 1, 1000);
        expect(result.roleClassification).toBeDefined();
        expect(result.roleClassification.role).toBe('damage');
        expect(result.roleClassification.confidenceScore).toBeGreaterThanOrEqual(0);
        expect(result.roleClassification.confidenceScore).toBeLessThanOrEqual(1);
    });

    it('includes damageTakenRank in squadContext', () => {
        const result = extractPlayerFightData(makeMinimalEiJson(), 1, 1000);
        expect(result.squadContext.damageTakenRank).toBe(1);
    });

    it('computes distanceToTag as null for single player with no commander', () => {
        const result = extractPlayerFightData(makeMinimalEiJson(), 1, 1000);
        expect(result.distanceToTag).toBeNull();
    });

    it('computes distanceToTag stats when commander exists', () => {
        const json = makeMinimalEiJson();
        json.players[0].hasCommanderTag = true;
        const follower = {
            ...json.players[0],
            name: 'Follower', account: 'Follower.5678',
            hasCommanderTag: false,
            statsAll: [{ downContribution: 0, distToCom: 250, stackDist: 200, appliedCrowdControl: 0, appliedCrowdControlDuration: 0 }],
            combatReplayData: { positions: [[120, 120], [130, 130]] as [number, number][], down: [] as [number, number][], dead: [] as [number, number][] },
        };
        json.players.push(follower as any);
        json.recordedAccountBy = 'Follower.5678';
        const result = extractPlayerFightData(json, 1, 1000);
        expect(result.distanceToTag).not.toBeNull();
        expect(result.distanceToTag!.average).toBeGreaterThanOrEqual(0);
        expect(result.distanceToTag!.median).toBeGreaterThanOrEqual(0);
    });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/shared/extractPlayerData.test.ts`
Expected: FAIL — `roleClassification`, `damageTakenRank`, `distanceToTag` not yet returned

---

### Task 5: Extraction Layer Changes — Implementation

**Files:**
- Modify: `src/shared/extractPlayerData.ts`

- [ ] **Step 1: Add imports**

At the top of `src/shared/extractPlayerData.ts`, add to the existing import from `./dashboardMetrics`:

Add `getDamageTaken` to the import from `./dashboardMetrics` (it's already imported).

Add a new import:

```typescript
import { classifySquadRoles } from './classifyRole';
```

- [ ] **Step 2: Add `damageTakenRank` to `buildSquadContext`**

In `buildSquadContext` function, add after the `healingRank` line:

```typescript
        damageTakenRank: getSquadRank(squadPlayers, player, getDamageTaken),
```

- [ ] **Step 3: Add distance-to-tag summary computation**

Add a new helper function after `computeFightPosition`:

```typescript
function computeDistanceToTagStats(
    timeline: TimelineData,
    player: EiPlayer,
): { average: number; median: number } | null {
    if (player.hasCommanderTag) return null;
    const buckets = timeline.distanceToTag;
    if (buckets.length === 0) return null;
    const values = buckets.map(b => b.value);
    const sum = values.reduce((a, b) => a + b, 0);
    const average = Math.round(sum / values.length);
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    const median = Math.round(
        sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid],
    );
    return { average, median };
}
```

- [ ] **Step 4: Wire new fields into `extractPlayerFightData` return**

In the `extractPlayerFightData` function, add before the `return` statement:

```typescript
    const squadPlayers = json.players.filter(p => !p.notInSquad && !p.isFake);
    const roleMap = classifySquadRoles(squadPlayers);
    const roleClassification = roleMap.get(player.account) ?? { role: 'damage' as const, supportScore: 0, confidenceScore: 0 };
```

Note: `squadPlayers` is already computed inside `buildSquadContext`. To avoid filtering twice, extract it before both calls. Refactor: move `const squadPlayers = json.players.filter(...)` before the `buildSquadContext` call and pass it in, or compute it once at the top of `extractPlayerFightData`.

The simplest approach: compute `squadPlayers` once and use it for both. Modify `buildSquadContext` to accept `squadPlayers` as a parameter instead of computing it internally:

Change `buildSquadContext` signature to:
```typescript
function buildSquadContext(squadPlayers: EiPlayer[], player: EiPlayer): SquadContext {
```

Remove the `const squadPlayers = ...` line inside it.

Then in `extractPlayerFightData`, before building timeline:
```typescript
    const squadPlayers = json.players.filter(p => !p.notInSquad && !p.isFake);
    const timeline = buildTimeline(json, player, bucketSizeMs);
    const roleMap = classifySquadRoles(squadPlayers);
    const roleClassification = roleMap.get(player.account) ?? { role: 'damage' as const, supportScore: 0, confidenceScore: 0 };
    const distanceToTagStats = computeDistanceToTagStats(timeline, player);
```

Update the `buildSquadContext` call:
```typescript
        squadContext: buildSquadContext(squadPlayers, player),
```

Add the new fields to the return object:
```typescript
        roleClassification,
        distanceToTag: distanceToTagStats,
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/shared/extractPlayerData.test.ts`
Expected: All tests PASS (including the 4 new ones)

- [ ] **Step 6: Run full test suite**

Run: `npx vitest run`
Expected: All tests PASS

- [ ] **Step 7: Commit**

```bash
git add src/shared/extractPlayerData.ts tests/shared/extractPlayerData.test.ts
git commit -m "feat: wire role classification and distance-to-tag into extraction"
```

---

### Task 6: Overview Subview — Role-Aware Layout

**Files:**
- Modify: `src/renderer/views/pulse/OverviewSubview.tsx`

- [ ] **Step 1: Rewrite `OverviewSubview` with role-aware rendering**

Replace the contents of `src/renderer/views/pulse/OverviewSubview.tsx` with:

```typescript
import { motion } from 'framer-motion';
import type { PlayerFightData } from '../../../shared/types';
import { StatCard } from '../StatCard';

export function OverviewSubview({ data }: { data: PlayerFightData }) {
    const { damage, defense, support, squadContext, roleClassification, distanceToTag } = data;
    const isSupport = roleClassification.role === 'support';

    return (
        <div className="space-y-3">
            {isSupport ? (
                <HeroBanner
                    label="Healing Output"
                    primaryValue={support.healingOutput}
                    secondaryValue={support.barrierOutput}
                    secondaryLabel="Barrier"
                    rank={squadContext.healingRank}
                />
            ) : (
                <HeroBanner
                    label="Damage Dealt"
                    primaryValue={damage.totalDamage}
                    secondaryValue={damage.dps}
                    secondaryLabel="DPS"
                    rank={squadContext.damageRank}
                />
            )}

            <div className="grid grid-cols-2 gap-2">
                {isSupport ? (
                    <>
                        <StatCard
                            label="Cleanses"
                            value={support.cleanses}
                            detail={`${ordinal(squadContext.cleanseRank)} in squad`}
                            detailColor="good"
                            accentColor="var(--brand-secondary)"
                            index={1}
                        />
                        <StatCard
                            label="Barrier Output"
                            value={support.barrierOutput.toLocaleString()}
                            accentColor="#a78bfa"
                            index={2}
                        />
                        <StatCard
                            label="Strips"
                            value={support.boonStrips}
                            detail={`${ordinal(squadContext.stripsRank)} in squad`}
                            detailColor="good"
                            accentColor="var(--brand-secondary)"
                            index={3}
                        />
                        <StatCard
                            label="Deaths / Downs"
                            value={`${defense.deaths} / ${defense.downs}`}
                            detail={defense.deathTimes.length > 0 ? `at ${defense.deathTimes.map(t => formatTime(t)).join(', ')}` : 'clean fight'}
                            detailColor={defense.deaths > 0 ? 'bad' : 'good'}
                            accentColor={defense.deaths > 0 ? 'var(--status-error)' : 'var(--status-success)'}
                            index={4}
                        />
                    </>
                ) : (
                    <>
                        <StatCard
                            label="Down Contribution"
                            value={damage.downContribution}
                            detail={`${ordinal(squadContext.downContributionRank)} in squad`}
                            detailColor="good"
                            accentColor="var(--brand-primary)"
                            index={1}
                        />
                        <StatCard
                            label="Deaths / Downs"
                            value={`${defense.deaths} / ${defense.downs}`}
                            detail={defense.deathTimes.length > 0 ? `at ${defense.deathTimes.map(t => formatTime(t)).join(', ')}` : 'clean fight'}
                            detailColor={defense.deaths > 0 ? 'bad' : 'good'}
                            accentColor={defense.deaths > 0 ? 'var(--status-error)' : 'var(--status-success)'}
                            index={2}
                        />
                        <StatCard
                            label="Strips"
                            value={support.boonStrips}
                            detail={`${ordinal(squadContext.stripsRank)} in squad`}
                            detailColor="good"
                            accentColor="var(--brand-secondary)"
                            index={3}
                        />
                        <StatCard
                            label="Cleanses"
                            value={support.cleanses}
                            detail={`${ordinal(squadContext.cleanseRank)} in squad`}
                            detailColor="good"
                            accentColor="var(--brand-secondary)"
                            index={4}
                        />
                    </>
                )}
                <StatCard
                    label="Damage Taken"
                    value={defense.damageTaken.toLocaleString()}
                    detail={`${ordinal(squadContext.damageTakenRank)} in squad`}
                    detailColor="neutral"
                    accentColor="var(--status-warning, #f59e0b)"
                    index={5}
                />
                <DistanceToTagCard distanceToTag={distanceToTag} index={6} />
            </div>
        </div>
    );
}

function HeroBanner({ label, primaryValue, secondaryValue, secondaryLabel, rank }: {
    label: string;
    primaryValue: number;
    secondaryValue: number;
    secondaryLabel: string;
    rank: number;
}) {
    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
            className="rounded-lg p-4 relative overflow-hidden"
            style={{ background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.12), rgba(6, 182, 212, 0.08))' }}
        >
            <div className="absolute inset-0 rounded-lg" style={{ border: '1px solid rgba(16, 185, 129, 0.2)' }} />
            <div className="relative flex items-end justify-between">
                <div>
                    <div className="text-xs uppercase tracking-[0.1em] font-medium" style={{ color: 'var(--brand-primary)' }}>
                        {label}
                    </div>
                    <div className="font-stat font-bold text-4xl leading-none mt-1 gradient-text">
                        {primaryValue.toLocaleString()}
                    </div>
                </div>
                <div className="text-right">
                    <span className="font-stat font-bold text-2xl" style={{ color: 'var(--text-primary)' }}>
                        {secondaryValue.toLocaleString()}
                    </span>
                    <span className="text-xs ml-1 font-medium" style={{ color: 'var(--text-muted)' }}>{secondaryLabel}</span>
                    <div className="mt-0.5">
                        <RankBadge rank={rank} />
                    </div>
                </div>
            </div>
        </motion.div>
    );
}

function DistanceToTagCard({ distanceToTag, index }: {
    distanceToTag: { average: number; median: number } | null;
    index: number;
}) {
    if (!distanceToTag) {
        return (
            <StatCard
                label="Distance to Tag"
                value="N/A"
                detail="no tag data"
                detailColor="neutral"
                accentColor="var(--text-muted)"
                index={index}
            />
        );
    }
    return (
        <StatCard
            label="Distance to Tag"
            value={`${distanceToTag.average} / ${distanceToTag.median}`}
            detail="avg / median"
            detailColor="neutral"
            accentColor="var(--brand-secondary)"
            index={index}
        />
    );
}

function ordinal(n: number): string {
    const s = ['th', 'st', 'nd', 'rd'];
    const v = n % 100;
    return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
}

function RankBadge({ rank }: { rank: number }) {
    const colors = ['#fbbf24', '#94a3b8', '#cd7f32', 'var(--text-muted)', 'var(--text-muted)'];
    const color = colors[rank - 1] ?? 'var(--text-muted)';
    return (
        <span
            className="inline-block text-xs font-bold px-1.5 py-0.5 rounded font-stat tracking-wide"
            style={{ color, border: `1px solid ${color}`, opacity: 0.9 }}
        >
            {ordinal(rank)}
        </span>
    );
}

function formatTime(ms: number): string {
    const sec = Math.floor(ms / 1000);
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
}
```

- [ ] **Step 2: Run type check**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/renderer/views/pulse/OverviewSubview.tsx
git commit -m "feat: role-aware overview with support/damage layouts"
```

---

### Task 7: Visual Verification

**Files:** None (testing only)

- [ ] **Step 1: Run full test suite**

Run: `npx vitest run`
Expected: All tests PASS

- [ ] **Step 2: Run type check**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Start dev server and verify in browser**

Run: `npm run dev`

Verify:
1. Load a fight log — overview should render without errors
2. For a DPS player: hero banner shows Damage/DPS, grid has Down Contribution, Deaths/Downs, Strips, Cleanses, Damage Taken, Distance to Tag
3. For a support player (if available): hero banner shows Healing Output/Barrier, grid has Cleanses, Barrier Output, Strips, Deaths/Downs, Damage Taken, Distance to Tag
4. Distance to Tag card shows "N/A" when player is commander
5. All stat cards animate in with staggered delay
6. Rank badges render correctly on ranked cards
