# Fight Composition Card Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a full-width segmented bar card at the bottom of the Pulse Overview showing squad/ally/enemy team counts, with click-to-expand GW2 profession icon class breakdowns.

**Architecture:** New data is extracted in `buildFightComposition()` and stored on `PlayerFightData`. A new `FightCompositionCard` React component reads that data and manages expand/collapse state locally. A shared `classIconUtils.ts` handles icon loading via `import.meta.glob` (Vite, base64 data URIs for Electron compatibility), replacing the ad-hoc approach in `MovementView.tsx`.

**Tech Stack:** TypeScript, React, Vite (`import.meta.glob`), `gw2-class-icons` npm package (already installed at `^0.3.0`), Vitest for unit tests.

---

## File Map

| Action | Path | Responsibility |
|---|---|---|
| Create | `src/shared/professionUtils.ts` | `PROFESSION_COLORS`, `getProfessionBase`, `getProfessionColor` |
| Create | `src/renderer/classIconUtils.ts` | `getProfessionIconPath` via `import.meta.glob` SVG→base64 |
| Modify | `src/shared/types.ts` | Add `teamID?/teamId?` to `EiPlayer`+`EiTarget`; add `FightComposition`; add field to `PlayerFightData` |
| Modify | `src/shared/extractPlayerData.ts` | Add `buildFightComposition()`, call it |
| Create | `src/renderer/views/pulse/FightCompositionCard.tsx` | Segmented bar + legend + expandable class breakdown |
| Modify | `src/renderer/views/pulse/OverviewSubview.tsx` | Add `<FightCompositionCard>` at bottom of stat grid |
| Modify | `src/renderer/views/map/MovementView.tsx` | Replace `getClassIconUrl`/`ICON_NAMES` with `getProfessionIconPath` from `classIconUtils` |
| Create | `tests/shared/fightComposition.test.ts` | Unit tests for `buildFightComposition` |

---

## Task 1: Create `professionUtils.ts`

**Files:**
- Create: `src/shared/professionUtils.ts`

- [ ] **Step 1: Create the file**

```typescript
// src/shared/professionUtils.ts
export const PROFESSION_COLORS: Record<string, string> = {
    'Guardian': '#72C1D9',
    'Dragonhunter': '#72C1D9',
    'Firebrand': '#72C1D9',
    'Willbender': '#72C1D9',
    'Luminary': '#72C1D9',

    'Revenant': '#D16E5A',
    'Herald': '#D16E5A',
    'Renegade': '#D16E5A',
    'Vindicator': '#D16E5A',
    'Conduit': '#D16E5A',

    'Warrior': '#FFD166',
    'Berserker': '#FFD166',
    'Spellbreaker': '#FFD166',
    'Bladesworn': '#FFD166',
    'Paragon': '#FFD166',

    'Engineer': '#D09C59',
    'Scrapper': '#D09C59',
    'Holosmith': '#D09C59',
    'Mechanist': '#D09C59',
    'Amalgam': '#D09C59',

    'Ranger': '#8CDC82',
    'Druid': '#8CDC82',
    'Soulbeast': '#8CDC82',
    'Untamed': '#8CDC82',
    'Galeshot': '#8CDC82',

    'Thief': '#C08F95',
    'Daredevil': '#C08F95',
    'Deadeye': '#C08F95',
    'Specter': '#C08F95',
    'Antiquary': '#C08F95',

    'Elementalist': '#F68A87',
    'Tempest': '#F68A87',
    'Weaver': '#F68A87',
    'Catalyst': '#F68A87',
    'Evoker': '#F68A87',

    'Mesmer': '#B679D5',
    'Chronomancer': '#B679D5',
    'Mirage': '#B679D5',
    'Virtuoso': '#B679D5',
    'Troubadour': '#B679D5',

    'Necromancer': '#52A76F',
    'Reaper': '#52A76F',
    'Scourge': '#52A76F',
    'Harbinger': '#52A76F',
    'Ritualist': '#52A76F',

    'Unknown': '#64748B',
};

const PROFESSION_BASE: Record<string, string> = {
    Guardian: 'Guardian', Dragonhunter: 'Guardian', Firebrand: 'Guardian', Willbender: 'Guardian', Luminary: 'Guardian',
    Revenant: 'Revenant', Herald: 'Revenant', Renegade: 'Revenant', Vindicator: 'Revenant', Conduit: 'Revenant',
    Warrior: 'Warrior', Berserker: 'Warrior', Spellbreaker: 'Warrior', Bladesworn: 'Warrior', Paragon: 'Warrior',
    Engineer: 'Engineer', Scrapper: 'Engineer', Holosmith: 'Engineer', Mechanist: 'Engineer', Amalgam: 'Engineer',
    Ranger: 'Ranger', Druid: 'Ranger', Soulbeast: 'Ranger', Untamed: 'Ranger', Galeshot: 'Ranger',
    Thief: 'Thief', Daredevil: 'Thief', Deadeye: 'Thief', Specter: 'Thief', Antiquary: 'Thief',
    Elementalist: 'Elementalist', Tempest: 'Elementalist', Weaver: 'Elementalist', Catalyst: 'Elementalist', Evoker: 'Elementalist',
    Mesmer: 'Mesmer', Chronomancer: 'Mesmer', Mirage: 'Mesmer', Virtuoso: 'Mesmer', Troubadour: 'Mesmer',
    Necromancer: 'Necromancer', Reaper: 'Necromancer', Scourge: 'Necromancer', Harbinger: 'Necromancer', Ritualist: 'Necromancer',
    Unknown: 'Unknown',
};

export function getProfessionBase(profession: string): string {
    if (!profession) return 'Unknown';
    return PROFESSION_BASE[profession] ?? profession;
}

export function getProfessionColor(profession: string): string {
    return PROFESSION_COLORS[profession] ?? PROFESSION_COLORS['Unknown'];
}
```

- [ ] **Step 2: Commit**

```bash
git add src/shared/professionUtils.ts
git commit -m "feat: add shared professionUtils with PROFESSION_COLORS"
```

---

## Task 2: Create `classIconUtils.ts`

**Files:**
- Create: `src/renderer/classIconUtils.ts`

This utility loads all SVGs from `gw2-class-icons` eagerly via Vite's `import.meta.glob`, encodes them as base64 data URIs (required because Electron's renderer cannot load SVGs via URL from `node_modules`), and exposes `getProfessionIconPath`.

- [ ] **Step 1: Create the file**

```typescript
// src/renderer/classIconUtils.ts
import { getProfessionBase } from '../shared/professionUtils';
import { PROFESSION_COLORS } from '../shared/professionUtils';

const iconModules = import.meta.glob<string>(
    '../../node_modules/gw2-class-icons/wiki/svg/*.svg',
    { eager: true, query: '?raw', import: 'default' }
);

const iconsByName: Record<string, string> = {};
for (const [filePath, svgContent] of Object.entries(iconModules)) {
    const name = filePath.split('/').pop()!.replace('.svg', '');
    iconsByName[name] = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svgContent)))}`;
}

export function getProfessionIconPath(profession: string | undefined | null): string | null {
    if (!profession || profession === 'Unknown') return null;
    if (PROFESSION_COLORS[profession] && iconsByName[profession]) return iconsByName[profession];
    const base = getProfessionBase(profession);
    if (base && base !== 'Unknown' && iconsByName[base]) return iconsByName[base];
    return null;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/classIconUtils.ts
git commit -m "feat: add classIconUtils with gw2-class-icons base64 loader"
```

---

## Task 3: Update types

**Files:**
- Modify: `src/shared/types.ts`

- [ ] **Step 1: Add `teamID?/teamId?` to `EiPlayer`**

In `src/shared/types.ts`, find the `EiPlayer` interface (around line 6) and add after `isFake: boolean;`:

```typescript
    teamID?: number;
    teamId?: number;
```

- [ ] **Step 2: Add `teamID?/teamId?` to `EiTarget`**

Find the `EiTarget` interface (around line 55) and add after `isFake: boolean;`:

```typescript
    teamID?: number;
    teamId?: number;
```

- [ ] **Step 3: Add `FightComposition` interface**

Add after the `SquadContext` interface (around line 262):

```typescript
export interface FightComposition {
    squadCount: number;
    allyCount: number;
    enemyCount: number;
    /** Top 3 enemy teams sorted by count descending */
    teamBreakdown: { teamId: string; count: number }[];
    /** elite_spec or profession → count */
    squadClassCounts: Record<string, number>;
    allyClassCounts: Record<string, number>;
    /** teamId → (elite_spec or profession → count) */
    enemyClassCountsByTeam: Record<string, Record<string, number>>;
}
```

- [ ] **Step 4: Add `fightComposition` to `PlayerFightData`**

Find the `PlayerFightData` interface and add after the `distanceToTag` field:

```typescript
    fightComposition: FightComposition;
```

- [ ] **Step 5: Commit**

```bash
git add src/shared/types.ts
git commit -m "feat: add FightComposition type and teamID fields to EI types"
```

---

## Task 4: Implement `buildFightComposition` and wire it up

**Files:**
- Modify: `src/shared/extractPlayerData.ts`
- Create: `tests/shared/fightComposition.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/shared/fightComposition.test.ts`:

```typescript
// tests/shared/fightComposition.test.ts
import { describe, it, expect } from 'vitest';
import { extractPlayerFightData } from '../../src/shared/extractPlayerData';
import type { EiJson } from '../../src/shared/types';

function makeBase(): EiJson {
    return {
        fightName: 'Detailed WvW - Green Alpine Borderlands',
        durationMS: 30000,
        success: true,
        players: [{
            name: 'P1', account: 'A.1234', profession: 'Guardian', elite_spec: 'Firebrand',
            group: 1, hasCommanderTag: false, notInSquad: false, isFake: false,
            teamID: 10,
            activeTimes: [30000],
            dpsAll: [{ damage: 0, dps: 0, breakbarDamage: 0 }],
            statsAll: [{ downContribution: 0, distToCom: 0, stackDist: 0, appliedCrowdControl: 0, appliedCrowdControlDuration: 0 }],
            defenses: [{ damageTaken: 0, deadCount: 0, downCount: 0, dodgeCount: 0, blockedCount: 0, evadedCount: 0, missedCount: 0, invulnedCount: 0, interruptedCount: 0, receivedCrowdControl: 0, receivedCrowdControlDuration: 0, boonStrips: 0, boonStripsTime: 0 }],
            support: [{ condiCleanse: 0, condiCleanseSelf: 0, boonStrips: 0, boonStripsTime: 0 }],
            damage1S: [[]], totalDamageDist: [[]], totalDamageTaken: [[]], rotation: [],
        }],
        targets: [],
        skillMap: {},
        buffMap: {},
    };
}

describe('fightComposition', () => {
    it('counts squad and ally players', () => {
        const json = makeBase();
        json.players.push({
            ...json.players[0],
            name: 'P2', account: 'B.1234', notInSquad: true, teamID: 10,
        });
        const result = extractPlayerFightData(json, 1, 1000);
        expect(result.fightComposition.squadCount).toBe(1);
        expect(result.fightComposition.allyCount).toBe(1);
    });

    it('counts enemies and groups by team', () => {
        const json = makeBase();
        json.targets = [
            { name: 'E1', enemyPlayer: true, isFake: false, teamID: 20, totalDamageDist: [], totalDamageTaken: [] } as any,
            { name: 'E2', enemyPlayer: true, isFake: false, teamID: 20, totalDamageDist: [], totalDamageTaken: [] } as any,
            { name: 'E3', enemyPlayer: true, isFake: false, teamID: 30, totalDamageDist: [], totalDamageTaken: [] } as any,
        ];
        const result = extractPlayerFightData(json, 1, 1000);
        expect(result.fightComposition.enemyCount).toBe(3);
        expect(result.fightComposition.teamBreakdown).toHaveLength(2);
        expect(result.fightComposition.teamBreakdown[0]).toEqual({ teamId: '20', count: 2 });
        expect(result.fightComposition.teamBreakdown[1]).toEqual({ teamId: '30', count: 1 });
    });

    it('excludes ally team IDs from enemy breakdown', () => {
        const json = makeBase(); // squad player has teamID: 10
        json.targets = [
            { name: 'E1', enemyPlayer: true, isFake: false, teamID: 10, totalDamageDist: [], totalDamageTaken: [] } as any,
            { name: 'E2', enemyPlayer: true, isFake: false, teamID: 20, totalDamageDist: [], totalDamageTaken: [] } as any,
        ];
        const result = extractPlayerFightData(json, 1, 1000);
        expect(result.fightComposition.enemyCount).toBe(1);
        expect(result.fightComposition.teamBreakdown).toHaveLength(1);
        expect(result.fightComposition.teamBreakdown[0].teamId).toBe('20');
    });

    it('skips fake and non-enemy targets', () => {
        const json = makeBase();
        json.targets = [
            { name: 'Golem', enemyPlayer: false, isFake: false, teamID: 99, totalDamageDist: [], totalDamageTaken: [] } as any,
            { name: 'Fake', enemyPlayer: true,  isFake: true,  teamID: 99, totalDamageDist: [], totalDamageTaken: [] } as any,
        ];
        const result = extractPlayerFightData(json, 1, 1000);
        expect(result.fightComposition.enemyCount).toBe(0);
    });

    it('builds squad class counts using elite_spec', () => {
        const json = makeBase();
        json.players.push({
            ...json.players[0],
            name: 'P2', account: 'B.1234', elite_spec: 'Firebrand',
        });
        const result = extractPlayerFightData(json, 1, 1000);
        expect(result.fightComposition.squadClassCounts['Firebrand']).toBe(2);
    });

    it('limits teamBreakdown to top 3 teams', () => {
        const json = makeBase();
        json.targets = [
            { name: 'E1', enemyPlayer: true, isFake: false, teamID: 20, totalDamageDist: [], totalDamageTaken: [] } as any,
            { name: 'E2', enemyPlayer: true, isFake: false, teamID: 30, totalDamageDist: [], totalDamageTaken: [] } as any,
            { name: 'E3', enemyPlayer: true, isFake: false, teamID: 40, totalDamageDist: [], totalDamageTaken: [] } as any,
            { name: 'E4', enemyPlayer: true, isFake: false, teamID: 50, totalDamageDist: [], totalDamageTaken: [] } as any,
        ];
        const result = extractPlayerFightData(json, 1, 1000);
        expect(result.fightComposition.teamBreakdown).toHaveLength(3);
    });

    it('groups enemies with no teamID under unknown', () => {
        const json = makeBase();
        json.targets = [
            { name: 'E1', enemyPlayer: true, isFake: false, totalDamageDist: [], totalDamageTaken: [] } as any,
        ];
        const result = extractPlayerFightData(json, 1, 1000);
        expect(result.fightComposition.teamBreakdown[0].teamId).toBe('unknown');
    });
});
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
npm test -- tests/shared/fightComposition.test.ts
```

Expected: FAIL — `result.fightComposition` is `undefined`.

- [ ] **Step 3: Implement `buildFightComposition` in `extractPlayerData.ts`**

Add this function before `extractPlayerFightData`:

```typescript
function buildFightComposition(json: EiJson): FightComposition {
    const squadPlayers = json.players.filter(p => !p.notInSquad && !p.isFake);
    const allyPlayers  = json.players.filter(p =>  p.notInSquad && !p.isFake);
    const enemies      = json.targets.filter(t => t.enemyPlayer && !t.isFake);

    const allyTeamIds = new Set<number>();
    for (const p of squadPlayers) {
        const id = p.teamID ?? p.teamId;
        if (id != null) allyTeamIds.add(id);
    }

    const classKey = (spec: string, prof: string) => spec || prof;

    const squadClassCounts: Record<string, number> = {};
    for (const p of squadPlayers) {
        const k = classKey(p.elite_spec, p.profession);
        squadClassCounts[k] = (squadClassCounts[k] ?? 0) + 1;
    }

    const allyClassCounts: Record<string, number> = {};
    for (const p of allyPlayers) {
        const k = classKey(p.elite_spec, p.profession);
        allyClassCounts[k] = (allyClassCounts[k] ?? 0) + 1;
    }

    const teamCountMap = new Map<string, number>();
    const enemyClassCountsByTeam: Record<string, Record<string, number>> = {};
    let filteredEnemyCount = 0;

    for (const t of enemies) {
        const rawId = t.teamID ?? t.teamId;
        if (rawId != null && allyTeamIds.has(rawId)) continue;
        filteredEnemyCount++;
        const teamId = rawId != null ? String(rawId) : 'unknown';
        teamCountMap.set(teamId, (teamCountMap.get(teamId) ?? 0) + 1);
        if (!enemyClassCountsByTeam[teamId]) enemyClassCountsByTeam[teamId] = {};
        const k = t.profession ?? 'Unknown';
        enemyClassCountsByTeam[teamId][k] = (enemyClassCountsByTeam[teamId][k] ?? 0) + 1;
    }

    const teamBreakdown = Array.from(teamCountMap.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([teamId, count]) => ({ teamId, count }));

    return {
        squadCount: squadPlayers.length,
        allyCount: allyPlayers.length,
        enemyCount: filteredEnemyCount,
        teamBreakdown,
        squadClassCounts,
        allyClassCounts,
        enemyClassCountsByTeam,
    };
}
```

Also add `FightComposition` to the import at the top of the file:
```typescript
import type { EiJson, EiPlayer, PlayerFightData, TimelineData, TimelineBucket, SquadContext, MovementData, SquadMemberMovement, BuffStateEntry, FightComposition } from './types';
```

- [ ] **Step 4: Call `buildFightComposition` inside `extractPlayerFightData`**

At the end of `extractPlayerFightData`, before the `return` statement, add:

```typescript
        fightComposition: buildFightComposition(json),
```

- [ ] **Step 5: Run tests — verify they pass**

```bash
npm test -- tests/shared/fightComposition.test.ts
```

Expected: All 7 tests PASS.

- [ ] **Step 6: Run the full test suite to check for regressions**

```bash
npm test
```

Expected: All tests PASS.

- [ ] **Step 7: Commit**

```bash
git add src/shared/extractPlayerData.ts src/shared/types.ts tests/shared/fightComposition.test.ts
git commit -m "feat: extract fight composition (squad/ally/enemy team counts and class breakdown)"
```

---

## Task 5: Create `FightCompositionCard` component

**Files:**
- Create: `src/renderer/views/pulse/FightCompositionCard.tsx`

- [ ] **Step 1: Create the component**

```tsx
// src/renderer/views/pulse/FightCompositionCard.tsx
import { useState } from 'react';
import type { FightComposition } from '../../../shared/types';
import { getProfessionIconPath } from '../../classIconUtils';

const SEGMENT_COLORS = ['#ef4444', '#f97316', '#dc2626'] as const;

interface Group {
    key: string;
    label: string;
    count: number;
    color: string;
    classCounts: Record<string, number>;
}

export function FightCompositionCard({ composition }: { composition: FightComposition }) {
    const [activeKey, setActiveKey] = useState<string | null>(null);

    const { squadCount, allyCount, enemyCount, teamBreakdown, squadClassCounts, allyClassCounts, enemyClassCountsByTeam } = composition;

    if (squadCount + allyCount + enemyCount === 0) return null;

    const groups: Group[] = [];
    if (squadCount > 0) groups.push({ key: 'squad', label: 'Squad', count: squadCount, color: '#10b981', classCounts: squadClassCounts });
    if (allyCount > 0)  groups.push({ key: 'ally',  label: 'Allies', count: allyCount, color: '#06b6d4', classCounts: allyClassCounts });
    teamBreakdown.forEach(({ teamId, count }, i) => {
        groups.push({
            key: `team-${teamId}`,
            label: `Enemy T${i + 1}`,
            count,
            color: SEGMENT_COLORS[i] ?? SEGMENT_COLORS[2],
            classCounts: enemyClassCountsByTeam[teamId] ?? {},
        });
    });

    const total = groups.reduce((s, g) => s + g.count, 0);
    const activeGroup = groups.find(g => g.key === activeKey) ?? null;

    function toggle(key: string) {
        setActiveKey(prev => prev === key ? null : key);
    }

    return (
        <div
            className="rounded-md p-2.5"
            style={{
                gridColumn: '1 / -1',
                background: 'rgba(239,68,68,0.04)',
                border: '1px solid rgba(239,68,68,0.2)',
            }}
        >
            <div className="text-[9px] uppercase tracking-[0.07em] mb-2" style={{ color: '#f87171' }}>
                Fight Composition
            </div>

            {/* Segmented bar */}
            <div className="flex h-2.5 rounded-full overflow-hidden gap-[2px] mb-2">
                {groups.map(g => (
                    <div
                        key={g.key}
                        className="rounded-sm cursor-pointer transition-opacity duration-150"
                        style={{
                            flex: g.count,
                            background: g.color,
                            opacity: activeKey && activeKey !== g.key ? 0.3 : 1,
                        }}
                        onClick={() => toggle(g.key)}
                    />
                ))}
            </div>

            {/* Legend pills */}
            <div className="flex flex-wrap gap-1.5">
                {groups.map(g => (
                    <button
                        key={g.key}
                        onClick={() => toggle(g.key)}
                        className="flex items-center gap-1.5 text-[10px] px-2 py-0.5 rounded-full transition-colors"
                        style={{
                            border: `1px solid ${activeKey === g.key ? '#2a3550' : 'transparent'}`,
                            background: activeKey === g.key ? 'rgba(255,255,255,0.06)' : 'transparent',
                            cursor: 'pointer',
                        }}
                    >
                        <span className="inline-block w-2 h-2 rounded-sm" style={{ background: g.color }} />
                        <span style={{ color: '#e2e8f0', fontWeight: 700 }}>{g.count}</span>
                        <span style={{ color: '#64748b' }}>{g.label}</span>
                        <span style={{ color: '#374151' }}>
                            {Math.round((g.count / total) * 100)}%
                        </span>
                    </button>
                ))}
            </div>

            {/* Class breakdown panel */}
            {activeGroup && (
                <div className="mt-2 pt-2" style={{ borderTop: '1px solid #1a2535' }}>
                    <div className="flex flex-wrap gap-1.5">
                        {Object.entries(activeGroup.classCounts)
                            .sort((a, b) => b[1] - a[1])
                            .map(([spec, count]) => {
                                const iconUrl = getProfessionIconPath(spec);
                                return (
                                    <div
                                        key={spec}
                                        className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded"
                                        style={{ background: '#0f1520', border: '1px solid #1a2535' }}
                                    >
                                        {iconUrl && (
                                            <img src={iconUrl} alt={spec} width={14} height={14} className="rounded-sm" />
                                        )}
                                        <span style={{ color: '#94a3b8' }}>{spec}</span>
                                        <span style={{ color: '#e2e8f0', fontWeight: 700 }}>{count}</span>
                                    </div>
                                );
                            })}
                    </div>
                </div>
            )}
        </div>
    );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/views/pulse/FightCompositionCard.tsx
git commit -m "feat: add FightCompositionCard component with segmented bar and class breakdown"
```

---

## Task 6: Wire `FightCompositionCard` into `OverviewSubview`

**Files:**
- Modify: `src/renderer/views/pulse/OverviewSubview.tsx`

- [ ] **Step 1: Add import at the top of `OverviewSubview.tsx`**

After the existing imports, add:

```typescript
import { FightCompositionCard } from './FightCompositionCard';
```

- [ ] **Step 2: Add card at the bottom of the stat grid**

In both the `isSupport` and non-support branches, the `<div className="grid grid-cols-2 gap-2">` closes with `</div>`. Before that closing tag in both branches, add the `FightCompositionCard` and the existing last two cards. Since the grid structure is shared, the cleanest approach is to add `<FightCompositionCard>` after `<DistanceToTagCard>` (which is outside the conditional blocks at line 109):

Replace the closing of the outer grid div (the one wrapping all StatCards) so it looks like:

```tsx
            <div className="grid grid-cols-2 gap-2">
                {isSupport ? (
                    <>
                        {/* ... existing support cards ... */}
                    </>
                ) : (
                    <>
                        {/* ... existing damage cards ... */}
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
                <FightCompositionCard composition={data.fightComposition} />
            </div>
```

- [ ] **Step 3: Run the dev server and verify visually**

```bash
npm run dev
```

Open the app, load a fight log. The Overview tab should show the fight composition card at the bottom of the stat grid. Verify:
- Segmented bar appears with correct proportions
- Legend pills show counts and percentages
- Clicking a pill highlights the bar segment and expands the class chip list with GW2 icons
- Clicking again collapses

- [ ] **Step 4: Commit**

```bash
git add src/renderer/views/pulse/OverviewSubview.tsx
git commit -m "feat: add FightCompositionCard to Overview subview"
```

---

## Task 7: Migrate `MovementView` to use `classIconUtils`

**Files:**
- Modify: `src/renderer/views/map/MovementView.tsx`

This removes the duplicate `getClassIconUrl`/`ICON_NAMES` logic that predates the shared utility.

- [ ] **Step 1: Add import to `MovementView.tsx`**

At the top of the file, add:

```typescript
import { getProfessionIconPath } from '../../classIconUtils';
```

- [ ] **Step 2: Remove the old constants and function**

Delete these from the file:

```typescript
const ICON_NAMES = new Set([
    'Amalgam', ... // the whole set
]);

function getClassIconUrl(eliteSpec: string, profession: string): string {
    if (eliteSpec && ICON_NAMES.has(eliteSpec)) return `./img/professions/${eliteSpec}.svg`;
    if (ICON_NAMES.has(profession)) return `./img/professions/${profession}.svg`;
    return '';
}
```

- [ ] **Step 3: Replace all call sites**

Search for `getClassIconUrl(` in `MovementView.tsx`. For each call, replace:

```typescript
// Before:
getClassIconUrl(member.eliteSpec, member.profession)

// After:
getProfessionIconPath(member.eliteSpec) ?? getProfessionIconPath(member.profession) ?? ''
```

Also update `getProfessionColor` calls if `MovementView.tsx` has its own inline color map — replace with the import:

```typescript
import { getProfessionColor } from '../../../shared/professionUtils';
```

And delete any local `PROFESSION_COLORS` or `getProfessionColor` that was inlined in `MovementView.tsx`.

- [ ] **Step 4: Run the dev server and verify the map view still shows icons**

```bash
npm run dev
```

Open the app, go to the Timeline/Map view. Verify profession icons still appear on squad members in the party panel.

- [ ] **Step 5: Run the full test suite**

```bash
npm test
```

Expected: All tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/views/map/MovementView.tsx src/shared/professionUtils.ts
git commit -m "refactor: migrate MovementView to shared classIconUtils and professionUtils"
```

---

## Self-Review

**Spec coverage check:**

| Spec requirement | Task |
|---|---|
| Segmented bar, flex-proportional | Task 5 |
| Squad / Ally / Enemy T1/T2/T3 segments with correct colors | Task 5 |
| Legend pills with count, group name, percentage | Task 5 |
| Click to expand class breakdown | Task 5 |
| Click active to collapse (toggle off) | Task 5 |
| Class chips: GW2 icon + spec name + count | Task 5 |
| Ally segment omitted when allyCount === 0 | Task 5 (groups array conditionally pushes) |
| Full-width card, last in stat grid | Task 6 |
| Renders null when all counts zero | Task 5 |
| `FightComposition` type | Task 3 |
| `fightComposition` on `PlayerFightData` | Tasks 3+4 |
| `teamID?/teamId?` on `EiPlayer` + `EiTarget` | Task 3 |
| `buildFightComposition`: squad/ally/enemy split | Task 4 |
| Ally team ID exclusion from enemies | Task 4 |
| Top 3 enemy teams | Task 4 |
| Class key = `elite_spec || profession` | Task 4 |
| Enemies with no teamID → `'unknown'` | Task 4 |
| `classIconUtils.ts` with `import.meta.glob` + base64 | Task 2 |
| `professionUtils.ts` shared | Task 1 |
| `MovementView` migrated to shared utils | Task 7 |

All spec requirements covered. No placeholders. Types are consistent across tasks (`FightComposition`, `getProfessionIconPath`, `buildFightComposition` all named consistently).
