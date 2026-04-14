# AxiPulse Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build AxiPulse — a compact WvW combat analysis dashboard that parses arcdps logs via Elite Insights and displays per-fight individual stats in Pulse (stat cards) and Timeline (layered time-series charts) views with session history.

**Architecture:** Electron + React + TypeScript. Raw EI JSON flows through a data extraction layer (`src/shared/`) that produces player-focused data structures, stored in a Zustand store, consumed by React views. The EI parser, log watcher, and IPC bridge already exist in the skeleton.

**Tech Stack:** Electron 35, React 18, TypeScript (strict), Vite 6, Tailwind CSS 3, Zustand 5, Recharts 3, Framer Motion 10, lucide-react, gw2-class-icons, chokidar, electron-store, vitest.

**Spec:** `docs/superpowers/specs/2026-04-14-axipulse-design.md`

---

## File Structure

### New files to create

```
src/shared/
  types.ts                    EI JSON types + extracted player data types
  wvwLandmarks.ts             Self-contained WvW landmark coordinate system
  mapUtils.ts                 Map name normalization, zone resolution
  extractPlayerData.ts        Main extraction: raw EI JSON → PlayerFightData
  combatMetrics.ts            Down contribution, CC, stability gen, damage mitigation
  dashboardMetrics.ts         Damage, DPS, cleanses, strips, healing, barrier
  boonData.ts                 Boon uptime + generation extraction
  timelineData.ts             Per-second bucketed arrays for timeline layers

src/renderer/
  store.ts                    Zustand store (all slices)
  app/
    AppLayout.tsx              (modify) — add subview nav, toast, fight badge
    SubviewPillBar.tsx         Collapsible pill bar component
    Toast.tsx                  Toast notification component
  views/
    PulseView.tsx              Pulse tab root — routes to subviews
    pulse/
      OverviewSubview.tsx      Stat card grid
      DamageSubview.tsx        Damage breakdown
      SupportSubview.tsx       Support stats
      DefenseSubview.tsx       Defense/survivability stats
      BoonsSubview.tsx         Boon uptime + generation
    StatCard.tsx               Reusable stat card component
    TimelineView.tsx           Timeline tab root
    timeline/
      TimelineChart.tsx        Shared-axis chart with toggleable layers
      TimelineControls.tsx     Layer toggles + preset selector
      TimelinePresets.ts       Preset definitions
    HistoryView.tsx            History tab — fight list
    history/
      HistoryEntry.tsx         Single fight entry component
    SettingsView.tsx           Settings tab — log dir + EI management

tests/
  shared/
    wvwLandmarks.test.ts
    extractPlayerData.test.ts
    combatMetrics.test.ts
    dashboardMetrics.test.ts
    boonData.test.ts
    timelineData.test.ts
    mapUtils.test.ts
```

### Files to modify

```
src/main/index.ts             Update DEFAULT_EI_SETTINGS (parseCombatReplay: true)
src/renderer/App.tsx           Replace with Zustand-driven routing
src/renderer/app/AppLayout.tsx Add subview pill bar, toast, fight badge
src/renderer/globals.d.ts     Already complete — no changes needed
src/preload/index.ts           Already complete — no changes needed
package.json                   Add gw2-class-icons dependency
```

---

## Task 1: Shared Types

**Files:**
- Create: `src/shared/types.ts`
- Test: `tests/shared/types.test.ts` (type-only smoke test)

- [ ] **Step 1: Create the EI JSON types and extracted data types**

```typescript
// src/shared/types.ts

// --- Raw EI JSON types (subset we use) ---

export interface EiPlayer {
    name: string;
    account: string;
    profession: string;
    elite_spec: string;
    group: number;
    hasCommanderTag: boolean;
    notInSquad: boolean;
    isFake: boolean;
    activeTimes: number[];
    dpsAll: { damage: number; dps: number; breakbarDamage: number }[];
    statsAll: { downContribution: number; distToCom: number; stackDist: number; appliedCrowdControl: number; appliedCrowdControlDuration: number }[];
    defenses: {
        damageTaken: number; deadCount: number; downCount: number;
        dodgeCount: number; blockedCount: number; evadedCount: number;
        missedCount: number; invulnedCount: number; interruptedCount: number;
        receivedCrowdControl: number; receivedCrowdControlDuration: number;
        boonStrips: number; boonStripsTime: number;
    }[];
    support: { condiCleanse: number; condiCleanseSelf: number; boonStrips: number; boonStripsTime: number }[];
    damage1S: number[][];
    targetDamage1S?: number[][];
    totalDamageDist: { id: number; name: string; totalDamage: number; connectedHits: number; min: number; max: number; downContribution?: number }[][];
    buffUptimes: { id: number; buffData: { uptime: number; generation: number; overstack: number; wasted: number }[]; statesPerSource?: Record<string, [number, number][]> }[];
    selfBuffs: { id: number; buffData: { generation: number; overstack: number; wasted: number }[] }[];
    groupBuffs: { id: number; buffData: { generation: number; overstack: number; wasted: number }[] }[];
    squadBuffs: { id: number; buffData: { generation: number; overstack: number; wasted: number }[] }[];
    extHealingStats?: {
        outgoingHealingAllies: { healing: number }[][];
        totalHealingDist: { id: number; name: string; totalHealing: number; hits: number }[][];
    };
    extBarrierStats?: {
        outgoingBarrierAllies: { barrier: number }[][];
        totalBarrierDist: { id: number; name: string; totalBarrier: number; hits: number }[][];
    };
    rotation: { id: number; skills: { castTime: number; duration: number }[] }[];
    combatReplayData?: {
        positions?: [number, number][];
        dead?: [number, number][];
        down?: [number, number][];
        start?: number;
    };
}

export interface EiTarget {
    name: string;
    totalDamageDist: { id: number; name: string; totalDamage: number; connectedHits: number; min: number; max: number }[][];
    damage1S?: number[][];
    enemyPlayer: boolean;
    isFake: boolean;
    profession?: string;
}

export interface EiJson {
    fightName: string;
    zone?: string;
    mapName?: string;
    map?: string;
    durationMS: number;
    success: boolean;
    uploadTime?: string;
    players: EiPlayer[];
    targets: EiTarget[];
    skillMap: Record<string, { name: string; icon: string; autoAttack: boolean }>;
    buffMap: Record<string, { name: string; stacking: string; icon: string; classification?: string }>;
    combatReplayMetaData?: {
        inchToPixel?: number;
        pollingRate?: number;
    };
}

// --- Extracted player-focused data ---

export interface PlayerFightData {
    fightLabel: string;
    fightNumber: number;
    mapName: string;
    nearestLandmark: string | null;
    duration: number;
    durationFormatted: string;
    timestamp: string;
    playerName: string;
    accountName: string;
    profession: string;
    eliteSpec: string;
    isCommander: boolean;

    damage: DamageStats;
    support: SupportStats;
    defense: DefenseStats;
    boons: BoonStats;
    timeline: TimelineData;
    squadContext: SquadContext;
}

export interface DamageStats {
    totalDamage: number;
    dps: number;
    breakbarDamage: number;
    downContribution: number;
    topSkills: SkillDamage[];
}

export interface SkillDamage {
    id: number;
    name: string;
    damage: number;
    hits: number;
}

export interface SupportStats {
    boonStrips: number;
    cleanses: number;
    cleanseSelf: number;
    healingOutput: number;
    barrierOutput: number;
    stabilityGeneration: number;
}

export interface DefenseStats {
    damageTaken: number;
    deaths: number;
    downs: number;
    deathTimes: number[];
    downTimes: number[];
    dodges: number;
    blocked: number;
    evaded: number;
    missed: number;
    invulned: number;
    interrupted: number;
    incomingCC: number;
    incomingStrips: number;
}

export interface BoonUptimeEntry {
    id: number;
    name: string;
    uptime: number;
}

export interface BoonGenerationEntry {
    id: number;
    name: string;
    selfGeneration: number;
    groupGeneration: number;
    squadGeneration: number;
}

export interface BoonStats {
    uptimes: BoonUptimeEntry[];
    generation: BoonGenerationEntry[];
}

export interface TimelineBucket {
    time: number;
    value: number;
}

export interface TimelineData {
    bucketSizeMs: number;
    damageDealt: TimelineBucket[];
    damageTaken: TimelineBucket[];
    distanceToTag: TimelineBucket[];
    incomingHealing: TimelineBucket[];
    incomingBarrier: TimelineBucket[];
    boonUptimeTimeline: Record<string, TimelineBucket[]>;
    boonGenerationTimeline: Record<string, TimelineBucket[]>;
    ccDealt: number[];
    ccReceived: number[];
    deathEvents: number[];
    downEvents: number[];
}

export interface SquadContext {
    squadSize: number;
    damageRank: number;
    stripsRank: number;
    healingRank: number;
    cleanseRank: number;
}

export interface FightHistoryEntry {
    fightNumber: number;
    fightLabel: string;
    timestamp: string;
    profession: string;
    eliteSpec: string;
    duration: number;
    durationFormatted: string;
    quickStats: {
        damage: number;
        deaths: number;
        strips: number;
        dps: number;
    };
    data: PlayerFightData;
}
```

- [ ] **Step 2: Verify types compile**

Run: `npx tsc --noEmit`
Expected: PASS (no errors)

- [ ] **Step 3: Commit**

```bash
git add src/shared/types.ts
git commit -m "feat: add shared types for EI JSON and extracted player data"
```

---

## Task 2: WvW Landmark System

**Files:**
- Create: `src/shared/wvwLandmarks.ts`
- Create: `src/shared/mapUtils.ts`
- Test: `tests/shared/wvwLandmarks.test.ts`
- Test: `tests/shared/mapUtils.test.ts`

- [ ] **Step 1: Write failing tests for landmark system**

```typescript
// tests/shared/wvwLandmarks.test.ts
import { describe, it, expect } from 'vitest';
import { WvwMap, findNearestLandmark, WVW_LANDMARKS } from '../../src/shared/wvwLandmarks';

describe('WVW_LANDMARKS', () => {
    it('has entries for all four maps', () => {
        expect(WVW_LANDMARKS[WvwMap.EternalBattlegrounds].length).toBeGreaterThan(0);
        expect(WVW_LANDMARKS[WvwMap.GreenBorderlands].length).toBeGreaterThan(0);
        expect(WVW_LANDMARKS[WvwMap.BlueBorderlands].length).toBeGreaterThan(0);
        expect(WVW_LANDMARKS[WvwMap.RedBorderlands].length).toBeGreaterThan(0);
    });
});

describe('findNearestLandmark', () => {
    it('returns the closest landmark by euclidean distance', () => {
        const landmarks = WVW_LANDMARKS[WvwMap.EternalBattlegrounds];
        const target = landmarks[0];
        const result = findNearestLandmark(WvwMap.EternalBattlegrounds, target.x + 1, target.y + 1);
        expect(result.name).toBe(target.name);
    });

    it('returns null for a map with no landmarks', () => {
        // This tests the guard — should not happen with real data
        const result = findNearestLandmark('nonexistent' as WvwMap, 0, 0);
        expect(result).toBeNull();
    });
});
```

```typescript
// tests/shared/mapUtils.test.ts
import { describe, it, expect } from 'vitest';
import { resolveMapFromZone, normalizeMapName } from '../../src/shared/mapUtils';
import { WvwMap } from '../../src/shared/wvwLandmarks';

describe('resolveMapFromZone', () => {
    it('resolves Eternal Battlegrounds variants', () => {
        expect(resolveMapFromZone('Eternal Battlegrounds')).toBe(WvwMap.EternalBattlegrounds);
        expect(resolveMapFromZone('Detailed WvW - Eternal Battlegrounds')).toBe(WvwMap.EternalBattlegrounds);
    });

    it('resolves Green Borderlands', () => {
        expect(resolveMapFromZone('Green Alpine Borderlands')).toBe(WvwMap.GreenBorderlands);
        expect(resolveMapFromZone('Green Desert Borderlands')).toBe(WvwMap.GreenBorderlands);
    });

    it('resolves Blue Borderlands', () => {
        expect(resolveMapFromZone('Blue Alpine Borderlands')).toBe(WvwMap.BlueBorderlands);
    });

    it('resolves Red Borderlands', () => {
        expect(resolveMapFromZone('Red Desert Borderlands')).toBe(WvwMap.RedBorderlands);
    });

    it('returns null for non-WvW zones', () => {
        expect(resolveMapFromZone('Lions Arch')).toBeNull();
    });
});

describe('normalizeMapName', () => {
    it('shortens map names for display', () => {
        expect(normalizeMapName('Eternal Battlegrounds')).toBe('EBG');
        expect(normalizeMapName('Green Alpine Borderlands')).toBe('Green BL');
        expect(normalizeMapName('Blue Desert Borderlands')).toBe('Blue BL');
        expect(normalizeMapName('Red Alpine Borderlands')).toBe('Red BL');
    });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/shared/wvwLandmarks.test.ts tests/shared/mapUtils.test.ts`
Expected: FAIL (modules not found)

- [ ] **Step 3: Implement wvwLandmarks.ts**

```typescript
// src/shared/wvwLandmarks.ts
// Self-contained module — no AxiPulse-specific dependencies.
// Designed for portability to axibridge or a shared package.

export enum WvwMap {
    EternalBattlegrounds = 'EternalBattlegrounds',
    GreenBorderlands = 'GreenBorderlands',
    BlueBorderlands = 'BlueBorderlands',
    RedBorderlands = 'RedBorderlands',
}

export interface WvwLandmark {
    name: string;
    x: number;
    y: number;
    type: 'keep' | 'tower' | 'camp' | 'ruins' | 'named';
}

// Coordinates are in EI combatReplayData pixel space.
// Sources: GW2 community coordinate data, validated against EI replay output.
// These are approximate center positions — landmark matching uses nearest-neighbor.
export const WVW_LANDMARKS: Record<WvwMap, WvwLandmark[]> = {
    [WvwMap.EternalBattlegrounds]: [
        // Keeps
        { name: 'Stonemist Castle', x: 12288, y: 12288, type: 'keep' },
        // Garrison / Bay / Hills per color
        { name: 'Green Keep', x: 9000, y: 16000, type: 'keep' },
        { name: 'Blue Keep', x: 16000, y: 16000, type: 'keep' },
        { name: 'Red Keep', x: 12288, y: 8500, type: 'keep' },
        // Towers
        { name: 'Speldan Clearcut', x: 8500, y: 10000, type: 'tower' },
        { name: 'Danelon Passage', x: 10000, y: 8500, type: 'tower' },
        { name: 'Umberglade Woods', x: 14500, y: 8500, type: 'tower' },
        { name: 'Durios Gulch', x: 16000, y: 10000, type: 'tower' },
        { name: 'Bravost Escarpment', x: 16000, y: 14500, type: 'tower' },
        { name: 'Langor Gulch', x: 14500, y: 16000, type: 'tower' },
        { name: 'Quentin Lake', x: 10000, y: 16000, type: 'tower' },
        { name: 'Mendons Gap', x: 8500, y: 14500, type: 'tower' },
        // Camps
        { name: 'Golanta Clearing', x: 7500, y: 12000, type: 'camp' },
        { name: 'Pangloss Rise', x: 10000, y: 7500, type: 'camp' },
        { name: 'Valley of Ogrewatch', x: 14500, y: 7500, type: 'camp' },
        { name: 'Duerfield Valley', x: 17000, y: 12000, type: 'camp' },
        { name: 'Anzalias Pass', x: 14500, y: 17000, type: 'camp' },
        { name: 'Ogrewatch Cut', x: 10000, y: 17000, type: 'camp' },
        // Ruins
        { name: 'Temple of Lost Prayers', x: 12288, y: 10500, type: 'ruins' },
        { name: 'Battle Hollow', x: 10500, y: 13000, type: 'ruins' },
        { name: 'Carvers Ascent', x: 14000, y: 13000, type: 'ruins' },
    ],
    [WvwMap.GreenBorderlands]: [
        { name: 'Garrison', x: 12288, y: 12288, type: 'keep' },
        { name: 'Bay', x: 8500, y: 9500, type: 'keep' },
        { name: 'Hills', x: 16000, y: 9500, type: 'keep' },
        { name: 'Ascension Bay Tower', x: 9500, y: 7500, type: 'tower' },
        { name: 'Woodhaven Tower', x: 15000, y: 7500, type: 'tower' },
        { name: 'Dawns Eyrie Tower', x: 10000, y: 15000, type: 'tower' },
        { name: 'Redvale Refuge Tower', x: 14500, y: 15000, type: 'tower' },
        { name: 'Faithleap Camp', x: 12288, y: 7000, type: 'camp' },
        { name: 'Bluevale Refuge Camp', x: 7500, y: 12288, type: 'camp' },
        { name: 'Greenwater Lowlands Camp', x: 17000, y: 12288, type: 'camp' },
        { name: 'Gods Eye Camp', x: 12288, y: 17000, type: 'camp' },
    ],
    [WvwMap.BlueBorderlands]: [
        { name: 'Garrison', x: 12288, y: 12288, type: 'keep' },
        { name: 'Bay', x: 8500, y: 9500, type: 'keep' },
        { name: 'Hills', x: 16000, y: 9500, type: 'keep' },
        { name: 'Ascension Bay Tower', x: 9500, y: 7500, type: 'tower' },
        { name: 'Woodhaven Tower', x: 15000, y: 7500, type: 'tower' },
        { name: 'Dawns Eyrie Tower', x: 10000, y: 15000, type: 'tower' },
        { name: 'Redvale Refuge Tower', x: 14500, y: 15000, type: 'tower' },
        { name: 'Faithleap Camp', x: 12288, y: 7000, type: 'camp' },
        { name: 'Bluevale Refuge Camp', x: 7500, y: 12288, type: 'camp' },
        { name: 'Greenwater Lowlands Camp', x: 17000, y: 12288, type: 'camp' },
        { name: 'Gods Eye Camp', x: 12288, y: 17000, type: 'camp' },
    ],
    [WvwMap.RedBorderlands]: [
        { name: 'Garrison', x: 12288, y: 12288, type: 'keep' },
        { name: 'Bay', x: 8500, y: 9500, type: 'keep' },
        { name: 'Hills', x: 16000, y: 9500, type: 'keep' },
        { name: 'Ascension Bay Tower', x: 9500, y: 7500, type: 'tower' },
        { name: 'Woodhaven Tower', x: 15000, y: 7500, type: 'tower' },
        { name: 'Dawns Eyrie Tower', x: 10000, y: 15000, type: 'tower' },
        { name: 'Redvale Refuge Tower', x: 14500, y: 15000, type: 'tower' },
        { name: 'Faithleap Camp', x: 12288, y: 7000, type: 'camp' },
        { name: 'Bluevale Refuge Camp', x: 7500, y: 12288, type: 'camp' },
        { name: 'Greenwater Lowlands Camp', x: 17000, y: 12288, type: 'camp' },
        { name: 'Gods Eye Camp', x: 12288, y: 17000, type: 'camp' },
    ],
};

export function findNearestLandmark(map: WvwMap, x: number, y: number): WvwLandmark | null {
    const landmarks = WVW_LANDMARKS[map];
    if (!landmarks || landmarks.length === 0) return null;

    let nearest = landmarks[0];
    let minDist = Math.hypot(x - nearest.x, y - nearest.y);

    for (let i = 1; i < landmarks.length; i++) {
        const d = Math.hypot(x - landmarks[i].x, y - landmarks[i].y);
        if (d < minDist) {
            minDist = d;
            nearest = landmarks[i];
        }
    }

    return nearest;
}
```

- [ ] **Step 4: Implement mapUtils.ts**

```typescript
// src/shared/mapUtils.ts
import { WvwMap } from './wvwLandmarks';

const ZONE_PREFIXES = ['Detailed WvW - ', 'World vs World - ', 'WvW - '];

function stripPrefix(zone: string): string {
    for (const prefix of ZONE_PREFIXES) {
        if (zone.startsWith(prefix)) return zone.slice(prefix.length);
    }
    return zone;
}

export function resolveMapFromZone(zone: string): WvwMap | null {
    const clean = stripPrefix(zone).toLowerCase();
    if (clean.includes('eternal battlegrounds')) return WvwMap.EternalBattlegrounds;
    if (clean.includes('green')) return WvwMap.GreenBorderlands;
    if (clean.includes('blue')) return WvwMap.BlueBorderlands;
    if (clean.includes('red')) return WvwMap.RedBorderlands;
    return null;
}

export function normalizeMapName(zone: string): string {
    const clean = stripPrefix(zone).toLowerCase();
    if (clean.includes('eternal battlegrounds')) return 'EBG';
    if (clean.includes('green')) return 'Green BL';
    if (clean.includes('blue')) return 'Blue BL';
    if (clean.includes('red')) return 'Red BL';
    return zone;
}

export function formatDuration(ms: number): string {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${String(seconds).padStart(2, '0')}`;
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/shared/wvwLandmarks.test.ts tests/shared/mapUtils.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/shared/wvwLandmarks.ts src/shared/mapUtils.ts tests/shared/
git commit -m "feat: add WvW landmark system and map utilities"
```

---

## Task 3: Dashboard Metrics Extraction

**Files:**
- Create: `src/shared/dashboardMetrics.ts`
- Create: `src/shared/combatMetrics.ts`
- Test: `tests/shared/dashboardMetrics.test.ts`
- Test: `tests/shared/combatMetrics.test.ts`

- [ ] **Step 1: Write failing tests for dashboard metrics**

```typescript
// tests/shared/dashboardMetrics.test.ts
import { describe, it, expect } from 'vitest';
import { getDamage, getDps, getBreakbarDamage, getCleanses, getStrips, getDistToTag, getDamageTaken } from '../../src/shared/dashboardMetrics';
import type { EiPlayer } from '../../src/shared/types';

function makePlayer(overrides: Partial<EiPlayer> = {}): EiPlayer {
    return {
        name: 'Test', account: 'Test.1234', profession: 'Guardian', elite_spec: 'Firebrand',
        group: 1, hasCommanderTag: false, notInSquad: false, isFake: false,
        activeTimes: [60000],
        dpsAll: [{ damage: 100000, dps: 1667, breakbarDamage: 500 }],
        statsAll: [{ downContribution: 5, distToCom: 180, stackDist: 200, appliedCrowdControl: 3, appliedCrowdControlDuration: 4500 }],
        defenses: [{ damageTaken: 50000, deadCount: 1, downCount: 2, dodgeCount: 5, blockedCount: 10, evadedCount: 8, missedCount: 3, invulnedCount: 2, interruptedCount: 1, receivedCrowdControl: 4, receivedCrowdControlDuration: 3000, boonStrips: 6, boonStripsTime: 2000 }],
        support: [{ condiCleanse: 15, condiCleanseSelf: 5, boonStrips: 20, boonStripsTime: 8000 }],
        damage1S: [[]], targetDamage1S: [[]], totalDamageDist: [[]], buffUptimes: [],
        selfBuffs: [], groupBuffs: [], squadBuffs: [], rotation: [],
        ...overrides,
    } as EiPlayer;
}

describe('dashboardMetrics', () => {
    const player = makePlayer();

    it('getDamage returns total damage', () => {
        expect(getDamage(player)).toBe(100000);
    });

    it('getDps returns DPS', () => {
        expect(getDps(player)).toBe(1667);
    });

    it('getBreakbarDamage returns breakbar damage', () => {
        expect(getBreakbarDamage(player)).toBe(500);
    });

    it('getCleanses returns total cleanses', () => {
        expect(getCleanses(player)).toBe(20);
    });

    it('getStrips returns boon strips', () => {
        expect(getStrips(player)).toBe(20);
    });

    it('getDistToTag returns distance to commander', () => {
        expect(getDistToTag(player)).toBe(180);
    });

    it('getDamageTaken returns damage taken', () => {
        expect(getDamageTaken(player)).toBe(50000);
    });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/shared/dashboardMetrics.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement dashboardMetrics.ts**

```typescript
// src/shared/dashboardMetrics.ts
import type { EiPlayer } from './types';

export function getDamage(player: EiPlayer): number {
    return player.dpsAll[0]?.damage ?? 0;
}

export function getDps(player: EiPlayer): number {
    return player.dpsAll[0]?.dps ?? 0;
}

export function getBreakbarDamage(player: EiPlayer): number {
    return player.dpsAll[0]?.breakbarDamage ?? 0;
}

export function getCleanses(player: EiPlayer): number {
    const s = player.support[0];
    if (!s) return 0;
    return s.condiCleanse + s.condiCleanseSelf;
}

export function getCleanseSelf(player: EiPlayer): number {
    return player.support[0]?.condiCleanseSelf ?? 0;
}

export function getStrips(player: EiPlayer): number {
    return player.support[0]?.boonStrips ?? 0;
}

export function getDistToTag(player: EiPlayer): number {
    const stats = player.statsAll[0];
    if (!stats) return 0;
    return stats.distToCom || stats.stackDist || 0;
}

export function getDamageTaken(player: EiPlayer): number {
    return player.defenses[0]?.damageTaken ?? 0;
}

export function getDeaths(player: EiPlayer): number {
    return player.defenses[0]?.deadCount ?? 0;
}

export function getDowns(player: EiPlayer): number {
    return player.defenses[0]?.downCount ?? 0;
}

export function getDodges(player: EiPlayer): number {
    return player.defenses[0]?.dodgeCount ?? 0;
}

export function getDownContribution(player: EiPlayer): number {
    return player.statsAll[0]?.downContribution ?? 0;
}

export function getIncomingCC(player: EiPlayer): number {
    return player.defenses[0]?.receivedCrowdControl ?? 0;
}

export function getIncomingStrips(player: EiPlayer): number {
    return player.defenses[0]?.boonStrips ?? 0;
}

export function getBlocked(player: EiPlayer): number {
    return player.defenses[0]?.blockedCount ?? 0;
}

export function getEvaded(player: EiPlayer): number {
    return player.defenses[0]?.evadedCount ?? 0;
}

export function getMissed(player: EiPlayer): number {
    return player.defenses[0]?.missedCount ?? 0;
}

export function getInvulned(player: EiPlayer): number {
    return player.defenses[0]?.invulnedCount ?? 0;
}

export function getInterrupted(player: EiPlayer): number {
    return player.defenses[0]?.interruptedCount ?? 0;
}
```

- [ ] **Step 4: Write failing tests for combat metrics**

```typescript
// tests/shared/combatMetrics.test.ts
import { describe, it, expect } from 'vitest';
import { getHealingOutput, getBarrierOutput, getStabilityGeneration, getTopSkillDamage, getSquadRank } from '../../src/shared/combatMetrics';
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
        ...overrides,
    } as EiPlayer;
}

describe('getHealingOutput', () => {
    it('sums healing across all allies', () => {
        const player = makePlayer({
            extHealingStats: {
                outgoingHealingAllies: [[{ healing: 5000 }], [{ healing: 3000 }]],
                totalHealingDist: [],
            },
        });
        expect(getHealingOutput(player)).toBe(8000);
    });

    it('returns 0 when no healing stats', () => {
        expect(getHealingOutput(makePlayer())).toBe(0);
    });
});

describe('getBarrierOutput', () => {
    it('sums barrier across all allies', () => {
        const player = makePlayer({
            extBarrierStats: {
                outgoingBarrierAllies: [[{ barrier: 2000 }], [{ barrier: 1000 }]],
                totalBarrierDist: [],
            },
        });
        expect(getBarrierOutput(player)).toBe(3000);
    });
});

describe('getTopSkillDamage', () => {
    it('returns skills sorted by damage descending', () => {
        const player = makePlayer({
            totalDamageDist: [[
                { id: 1, name: 'Skill A', totalDamage: 5000, connectedHits: 10, min: 100, max: 800 },
                { id: 2, name: 'Skill B', totalDamage: 15000, connectedHits: 20, min: 200, max: 1200 },
                { id: 3, name: 'Skill C', totalDamage: 8000, connectedHits: 5, min: 500, max: 2000 },
            ]],
        });
        const result = getTopSkillDamage(player, 3);
        expect(result[0].name).toBe('Skill B');
        expect(result[1].name).toBe('Skill C');
        expect(result[2].name).toBe('Skill A');
    });
});

describe('getSquadRank', () => {
    it('ranks player among squad by value extractor', () => {
        const players = [
            makePlayer({ account: 'A.1', dpsAll: [{ damage: 50000, dps: 0, breakbarDamage: 0 }] }),
            makePlayer({ account: 'B.2', dpsAll: [{ damage: 100000, dps: 0, breakbarDamage: 0 }] }),
            makePlayer({ account: 'C.3', dpsAll: [{ damage: 75000, dps: 0, breakbarDamage: 0 }] }),
        ];
        const rank = getSquadRank(players, players[2], p => p.dpsAll[0]?.damage ?? 0);
        expect(rank).toBe(2);
    });
});
```

- [ ] **Step 5: Implement combatMetrics.ts**

```typescript
// src/shared/combatMetrics.ts
import type { EiPlayer, SkillDamage } from './types';

export function getHealingOutput(player: EiPlayer): number {
    if (!player.extHealingStats?.outgoingHealingAllies) return 0;
    let total = 0;
    for (const ally of player.extHealingStats.outgoingHealingAllies) {
        for (const phase of ally) {
            total += phase.healing;
        }
    }
    return total;
}

export function getBarrierOutput(player: EiPlayer): number {
    if (!player.extBarrierStats?.outgoingBarrierAllies) return 0;
    let total = 0;
    for (const ally of player.extBarrierStats.outgoingBarrierAllies) {
        for (const phase of ally) {
            total += phase.barrier;
        }
    }
    return total;
}

const STABILITY_BUFF_ID = 1122;

export function getStabilityGeneration(player: EiPlayer): number {
    let selfMs = 0;
    let squadMs = 0;
    for (const buff of player.selfBuffs) {
        if (buff.id === STABILITY_BUFF_ID) {
            selfMs += buff.buffData[0]?.generation ?? 0;
        }
    }
    for (const buff of player.squadBuffs) {
        if (buff.id === STABILITY_BUFF_ID) {
            squadMs += buff.buffData[0]?.generation ?? 0;
        }
    }
    return (selfMs + squadMs) / 1000;
}

export function getTopSkillDamage(player: EiPlayer, limit: number = 10): SkillDamage[] {
    const skills: SkillDamage[] = [];
    const phase = player.totalDamageDist[0];
    if (!phase) return skills;
    for (const entry of phase) {
        if (entry.totalDamage > 0) {
            skills.push({ id: entry.id, name: entry.name, damage: entry.totalDamage, hits: entry.connectedHits });
        }
    }
    skills.sort((a, b) => b.damage - a.damage);
    return skills.slice(0, limit);
}

export function getSquadRank(
    squadPlayers: EiPlayer[],
    player: EiPlayer,
    getValue: (p: EiPlayer) => number,
): number {
    const playerValue = getValue(player);
    let rank = 1;
    for (const p of squadPlayers) {
        if (getValue(p) > playerValue) rank++;
    }
    return rank;
}

export function getDeathTimes(player: EiPlayer): number[] {
    if (!player.combatReplayData?.dead) return [];
    return player.combatReplayData.dead.map(([time]) => time);
}

export function getDownTimes(player: EiPlayer): number[] {
    if (!player.combatReplayData?.down) return [];
    return player.combatReplayData.down.map(([time]) => time);
}
```

- [ ] **Step 6: Run all tests**

Run: `npx vitest run tests/shared/`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/shared/dashboardMetrics.ts src/shared/combatMetrics.ts tests/shared/
git commit -m "feat: add dashboard and combat metric extraction from EI data"
```

---

## Task 4: Boon Data Extraction

**Files:**
- Create: `src/shared/boonData.ts`
- Test: `tests/shared/boonData.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// tests/shared/boonData.test.ts
import { describe, it, expect } from 'vitest';
import { extractBoonUptimes, extractBoonGeneration, WVW_BOON_IDS } from '../../src/shared/boonData';
import type { EiPlayer } from '../../src/shared/types';

function makePlayer(overrides: Partial<EiPlayer> = {}): EiPlayer {
    return {
        name: 'Test', account: 'Test.1234', profession: 'Guardian', elite_spec: 'Firebrand',
        group: 1, hasCommanderTag: false, notInSquad: false, isFake: false,
        activeTimes: [60000],
        dpsAll: [{ damage: 0, dps: 0, breakbarDamage: 0 }],
        statsAll: [{ downContribution: 0, distToCom: 0, stackDist: 0, appliedCrowdControl: 0, appliedCrowdControlDuration: 0 }],
        defenses: [{ damageTaken: 0, deadCount: 0, downCount: 0, dodgeCount: 0, blockedCount: 0, evadedCount: 0, missedCount: 0, invulnedCount: 0, interruptedCount: 0, receivedCrowdControl: 0, receivedCrowdControlDuration: 0, boonStrips: 0, boonStripsTime: 0 }],
        support: [{ condiCleanse: 0, condiCleanseSelf: 0, boonStrips: 0, boonStripsTime: 0 }],
        damage1S: [[]], targetDamage1S: [[]], totalDamageDist: [[]], rotation: [],
        buffUptimes: [
            { id: 740, buffData: [{ uptime: 85.5, generation: 500, overstack: 0, wasted: 0 }] },
            { id: 725, buffData: [{ uptime: 92.3, generation: 600, overstack: 0, wasted: 0 }] },
        ],
        selfBuffs: [
            { id: 740, buffData: [{ generation: 100, overstack: 0, wasted: 0 }] },
        ],
        groupBuffs: [
            { id: 740, buffData: [{ generation: 200, overstack: 0, wasted: 0 }] },
        ],
        squadBuffs: [
            { id: 740, buffData: [{ generation: 300, overstack: 0, wasted: 0 }] },
        ],
        ...overrides,
    } as EiPlayer;
}

describe('extractBoonUptimes', () => {
    it('extracts uptime for known boons', () => {
        const uptimes = extractBoonUptimes(makePlayer());
        const might = uptimes.find(u => u.id === 740);
        expect(might).toBeDefined();
        expect(might!.uptime).toBe(85.5);
    });

    it('filters out non-boon buffs', () => {
        const player = makePlayer({
            buffUptimes: [
                { id: 740, buffData: [{ uptime: 85, generation: 0, overstack: 0, wasted: 0 }] },
                { id: 99999, buffData: [{ uptime: 50, generation: 0, overstack: 0, wasted: 0 }] },
            ],
        });
        const uptimes = extractBoonUptimes(player);
        expect(uptimes.every(u => WVW_BOON_IDS.has(u.id))).toBe(true);
    });
});

describe('extractBoonGeneration', () => {
    it('extracts self/group/squad generation', () => {
        const gen = extractBoonGeneration(makePlayer());
        const might = gen.find(g => g.id === 740);
        expect(might).toBeDefined();
        expect(might!.selfGeneration).toBe(100);
        expect(might!.groupGeneration).toBe(200);
        expect(might!.squadGeneration).toBe(300);
    });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/shared/boonData.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement boonData.ts**

```typescript
// src/shared/boonData.ts
import type { EiPlayer, BoonUptimeEntry, BoonGenerationEntry } from './types';

const BOON_NAMES: Record<number, string> = {
    740: 'Might',
    725: 'Fury',
    717: 'Protection',
    718: 'Regeneration',
    726: 'Vigor',
    1122: 'Stability',
    719: 'Swiftness',
    743: 'Aegis',
    873: 'Retaliation',
    1187: 'Quickness',
    30328: 'Alacrity',
    26980: 'Resistance',
    // Resolution (replaced Retaliation in newer EI versions)
    873: 'Resolution',
};

export const WVW_BOON_IDS = new Set(Object.keys(BOON_NAMES).map(Number));

export function extractBoonUptimes(player: EiPlayer): BoonUptimeEntry[] {
    const uptimes: BoonUptimeEntry[] = [];
    for (const buff of player.buffUptimes) {
        if (!WVW_BOON_IDS.has(buff.id)) continue;
        const name = BOON_NAMES[buff.id] ?? `Boon ${buff.id}`;
        const uptime = buff.buffData[0]?.uptime ?? 0;
        uptimes.push({ id: buff.id, name, uptime });
    }
    return uptimes;
}

export function extractBoonGeneration(player: EiPlayer): BoonGenerationEntry[] {
    const genMap = new Map<number, BoonGenerationEntry>();

    for (const buff of player.selfBuffs) {
        if (!WVW_BOON_IDS.has(buff.id)) continue;
        const name = BOON_NAMES[buff.id] ?? `Boon ${buff.id}`;
        genMap.set(buff.id, {
            id: buff.id, name,
            selfGeneration: buff.buffData[0]?.generation ?? 0,
            groupGeneration: 0,
            squadGeneration: 0,
        });
    }

    for (const buff of player.groupBuffs) {
        if (!WVW_BOON_IDS.has(buff.id)) continue;
        const existing = genMap.get(buff.id);
        if (existing) {
            existing.groupGeneration = buff.buffData[0]?.generation ?? 0;
        } else {
            const name = BOON_NAMES[buff.id] ?? `Boon ${buff.id}`;
            genMap.set(buff.id, {
                id: buff.id, name,
                selfGeneration: 0,
                groupGeneration: buff.buffData[0]?.generation ?? 0,
                squadGeneration: 0,
            });
        }
    }

    for (const buff of player.squadBuffs) {
        if (!WVW_BOON_IDS.has(buff.id)) continue;
        const existing = genMap.get(buff.id);
        if (existing) {
            existing.squadGeneration = buff.buffData[0]?.generation ?? 0;
        } else {
            const name = BOON_NAMES[buff.id] ?? `Boon ${buff.id}`;
            genMap.set(buff.id, {
                id: buff.id, name,
                selfGeneration: 0,
                groupGeneration: 0,
                squadGeneration: buff.buffData[0]?.generation ?? 0,
            });
        }
    }

    return Array.from(genMap.values());
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/shared/boonData.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/shared/boonData.ts tests/shared/boonData.test.ts
git commit -m "feat: add boon uptime and generation extraction"
```

---

## Task 5: Timeline Data Extraction

**Files:**
- Create: `src/shared/timelineData.ts`
- Test: `tests/shared/timelineData.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// tests/shared/timelineData.test.ts
import { describe, it, expect } from 'vitest';
import { extractDamageTimeline, extractDistanceToTagTimeline, bucketTimeline } from '../../src/shared/timelineData';

describe('bucketTimeline', () => {
    it('buckets per-second data into requested bucket size', () => {
        const perSecond = [100, 200, 300, 400, 500];
        const result = bucketTimeline(perSecond, 1000);
        expect(result).toHaveLength(5);
        expect(result[0]).toEqual({ time: 0, value: 100 });
        expect(result[4]).toEqual({ time: 4000, value: 500 });
    });

    it('aggregates into larger buckets', () => {
        const perSecond = [100, 200, 300, 400, 500, 600];
        const result = bucketTimeline(perSecond, 3000);
        expect(result).toHaveLength(2);
        expect(result[0]).toEqual({ time: 0, value: 600 });
        expect(result[1]).toEqual({ time: 3000, value: 1500 });
    });
});

describe('extractDamageTimeline', () => {
    it('converts cumulative damage1S to per-second values', () => {
        const cumulative = [0, 100, 350, 600, 1000];
        const result = extractDamageTimeline(cumulative, 1000);
        expect(result[0].value).toBe(0);
        expect(result[1].value).toBe(100);
        expect(result[2].value).toBe(250);
        expect(result[3].value).toBe(250);
        expect(result[4].value).toBe(400);
    });
});

describe('extractDistanceToTagTimeline', () => {
    it('samples positions at bucket intervals', () => {
        const playerPositions: [number, number][] = [[100, 100], [110, 100], [120, 100], [130, 100]];
        const tagPositions: [number, number][] = [[100, 100], [100, 100], [100, 100], [100, 100]];
        const pollingRate = 1000;
        const inchToPixel = 1;
        const result = extractDistanceToTagTimeline(playerPositions, tagPositions, pollingRate, inchToPixel, 1000);
        expect(result[0].value).toBe(0);
        expect(result[1].value).toBe(10);
        expect(result[2].value).toBe(20);
        expect(result[3].value).toBe(30);
    });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/shared/timelineData.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement timelineData.ts**

```typescript
// src/shared/timelineData.ts
import type { TimelineBucket } from './types';

export function bucketTimeline(perSecondValues: number[], bucketSizeMs: number): TimelineBucket[] {
    const bucketSizeSec = Math.max(1, Math.round(bucketSizeMs / 1000));
    const buckets: TimelineBucket[] = [];

    for (let i = 0; i < perSecondValues.length; i += bucketSizeSec) {
        let sum = 0;
        for (let j = i; j < Math.min(i + bucketSizeSec, perSecondValues.length); j++) {
            sum += perSecondValues[j];
        }
        buckets.push({ time: i * 1000, value: sum });
    }

    return buckets;
}

export function cumulativeToPerSecond(cumulative: number[]): number[] {
    const perSecond: number[] = [];
    for (let i = 0; i < cumulative.length; i++) {
        perSecond.push(i === 0 ? cumulative[0] : cumulative[i] - cumulative[i - 1]);
    }
    return perSecond;
}

export function extractDamageTimeline(cumulativeDamage1S: number[], bucketSizeMs: number): TimelineBucket[] {
    const perSecond = cumulativeToPerSecond(cumulativeDamage1S);
    return bucketTimeline(perSecond, bucketSizeMs);
}

export function extractDistanceToTagTimeline(
    playerPositions: [number, number][],
    tagPositions: [number, number][],
    pollingRate: number,
    inchToPixel: number,
    bucketSizeMs: number,
): TimelineBucket[] {
    const scale = inchToPixel || 1;
    const perSample: number[] = [];

    const len = Math.min(playerPositions.length, tagPositions.length);
    for (let i = 0; i < len; i++) {
        const [px, py] = playerPositions[i];
        const [tx, ty] = tagPositions[i];
        perSample.push(Math.round(Math.hypot(px - tx, py - ty) / scale));
    }

    // Resample from pollingRate intervals to 1-second intervals
    const samplesPerSecond = Math.max(1, Math.round(1000 / pollingRate));
    const perSecond: number[] = [];
    for (let i = 0; i < perSample.length; i += samplesPerSecond) {
        let sum = 0;
        let count = 0;
        for (let j = i; j < Math.min(i + samplesPerSecond, perSample.length); j++) {
            sum += perSample[j];
            count++;
        }
        perSecond.push(count > 0 ? Math.round(sum / count) : 0);
    }

    return bucketTimeline(perSecond, bucketSizeMs);
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/shared/timelineData.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/shared/timelineData.ts tests/shared/timelineData.test.ts
git commit -m "feat: add timeline data extraction with configurable bucket sizes"
```

---

## Task 6: Player Data Extraction (Orchestrator)

**Files:**
- Create: `src/shared/extractPlayerData.ts`
- Test: `tests/shared/extractPlayerData.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// tests/shared/extractPlayerData.test.ts
import { describe, it, expect } from 'vitest';
import { extractPlayerFightData } from '../../src/shared/extractPlayerData';
import type { EiJson } from '../../src/shared/types';

function makeMinimalEiJson(): EiJson {
    return {
        fightName: 'WvW Fight',
        zone: 'Green Alpine Borderlands',
        durationMS: 63000,
        success: true,
        players: [{
            name: 'TestPlayer', account: 'Test.1234', profession: 'Guardian', elite_spec: 'Firebrand',
            group: 1, hasCommanderTag: false, notInSquad: false, isFake: false,
            activeTimes: [63000],
            dpsAll: [{ damage: 100000, dps: 1587, breakbarDamage: 200 }],
            statsAll: [{ downContribution: 5, distToCom: 180, stackDist: 200, appliedCrowdControl: 3, appliedCrowdControlDuration: 4500 }],
            defenses: [{ damageTaken: 30000, deadCount: 0, downCount: 1, dodgeCount: 5, blockedCount: 8, evadedCount: 4, missedCount: 2, invulnedCount: 1, interruptedCount: 0, receivedCrowdControl: 2, receivedCrowdControlDuration: 1500, boonStrips: 3, boonStripsTime: 1000 }],
            support: [{ condiCleanse: 10, condiCleanseSelf: 4, boonStrips: 15, boonStripsTime: 5000 }],
            damage1S: [[0, 10000, 30000, 60000, 100000]], targetDamage1S: [[0, 9000, 28000, 58000, 98000]],
            totalDamageDist: [[{ id: 1, name: 'Sword', totalDamage: 60000, connectedHits: 50, min: 500, max: 2000 }]],
            buffUptimes: [{ id: 740, buffData: [{ uptime: 80, generation: 0, overstack: 0, wasted: 0 }] }],
            selfBuffs: [], groupBuffs: [], squadBuffs: [], rotation: [],
            combatReplayData: { positions: [[100, 100], [105, 100]], down: [[15000, 15000]], dead: [] },
        }],
        targets: [],
        skillMap: {},
        buffMap: {},
        combatReplayMetaData: { inchToPixel: 0.02, pollingRate: 150 },
    };
}

describe('extractPlayerFightData', () => {
    it('extracts fight metadata', () => {
        const result = extractPlayerFightData(makeMinimalEiJson(), 1, 1000);
        expect(result.mapName).toBe('Green BL');
        expect(result.durationFormatted).toBe('1:03');
        expect(result.profession).toBe('Guardian');
        expect(result.eliteSpec).toBe('Firebrand');
    });

    it('extracts damage stats', () => {
        const result = extractPlayerFightData(makeMinimalEiJson(), 1, 1000);
        expect(result.damage.totalDamage).toBe(100000);
        expect(result.damage.dps).toBe(1587);
        expect(result.damage.downContribution).toBe(5);
    });

    it('extracts defense stats', () => {
        const result = extractPlayerFightData(makeMinimalEiJson(), 1, 1000);
        expect(result.defense.deaths).toBe(0);
        expect(result.defense.downs).toBe(1);
        expect(result.defense.damageTaken).toBe(30000);
    });

    it('extracts support stats', () => {
        const result = extractPlayerFightData(makeMinimalEiJson(), 1, 1000);
        expect(result.support.boonStrips).toBe(15);
        expect(result.support.cleanses).toBe(14);
    });

    it('generates fight label with landmark', () => {
        const result = extractPlayerFightData(makeMinimalEiJson(), 3, 1000);
        expect(result.fightLabel).toContain('F3');
        expect(result.fightLabel).toContain('Green BL');
        expect(result.fightLabel).toContain('1:03');
    });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/shared/extractPlayerData.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement extractPlayerData.ts**

```typescript
// src/shared/extractPlayerData.ts
import type { EiJson, EiPlayer, PlayerFightData, TimelineData, SquadContext } from './types';
import { getDamage, getDps, getBreakbarDamage, getCleanses, getCleanseSelf, getStrips, getDamageTaken, getDeaths, getDowns, getDodges, getDownContribution, getIncomingCC, getIncomingStrips, getBlocked, getEvaded, getMissed, getInvulned, getInterrupted } from './dashboardMetrics';
import { getHealingOutput, getBarrierOutput, getStabilityGeneration, getTopSkillDamage, getSquadRank, getDeathTimes, getDownTimes } from './combatMetrics';
import { extractBoonUptimes, extractBoonGeneration } from './boonData';
import { extractDamageTimeline, extractDistanceToTagTimeline, bucketTimeline } from './timelineData';
import { resolveMapFromZone, normalizeMapName, formatDuration } from './mapUtils';
import { findNearestLandmark } from './wvwLandmarks';

function findLocalPlayer(json: EiJson): EiPlayer {
    // The recording player is typically the first non-fake player
    const candidate = json.players.find(p => !p.isFake && !p.notInSquad);
    return candidate ?? json.players[0];
}

function findCommander(players: EiPlayer[]): EiPlayer | null {
    const commanders = players.filter(p => p.hasCommanderTag);
    if (commanders.length === 0) return null;
    commanders.sort((a, b) => (b.activeTimes[0] ?? 0) - (a.activeTimes[0] ?? 0));
    return commanders[0];
}

function computeAveragePosition(players: EiPlayer[]): [number, number] | null {
    let totalX = 0, totalY = 0, count = 0;
    for (const p of players) {
        const positions = p.combatReplayData?.positions;
        if (!positions || positions.length === 0) continue;
        // Use midpoint of the fight
        const midIdx = Math.floor(positions.length / 2);
        totalX += positions[midIdx][0];
        totalY += positions[midIdx][1];
        count++;
    }
    if (count === 0) return null;
    return [totalX / count, totalY / count];
}

function buildSquadContext(json: EiJson, player: EiPlayer): SquadContext {
    const squadPlayers = json.players.filter(p => !p.notInSquad && !p.isFake);
    return {
        squadSize: squadPlayers.length,
        damageRank: getSquadRank(squadPlayers, player, getDamage),
        stripsRank: getSquadRank(squadPlayers, player, getStrips),
        healingRank: getSquadRank(squadPlayers, player, getHealingOutput),
        cleanseRank: getSquadRank(squadPlayers, player, getCleanses),
    };
}

function buildTimeline(json: EiJson, player: EiPlayer, bucketSizeMs: number): TimelineData {
    const damage1S = player.targetDamage1S?.[0] ?? player.damage1S?.[0] ?? [];
    const damageDealt = extractDamageTimeline(damage1S, bucketSizeMs);

    // Damage taken timeline — not available as per-second array in EI, use empty for now
    const damageTaken: { time: number; value: number }[] = [];

    // Distance to tag
    let distanceToTag: { time: number; value: number }[] = [];
    const commander = findCommander(json.players);
    const meta = json.combatReplayMetaData;
    if (commander && player !== commander && meta?.pollingRate && meta?.inchToPixel) {
        const playerPos = player.combatReplayData?.positions ?? [];
        const tagPos = commander.combatReplayData?.positions ?? [];
        if (playerPos.length > 0 && tagPos.length > 0) {
            distanceToTag = extractDistanceToTagTimeline(playerPos, tagPos, meta.pollingRate, meta.inchToPixel, bucketSizeMs);
        }
    }

    return {
        bucketSizeMs,
        damageDealt,
        damageTaken,
        distanceToTag,
        incomingHealing: [],
        incomingBarrier: [],
        boonUptimeTimeline: {},
        boonGenerationTimeline: {},
        ccDealt: [],
        ccReceived: [],
        deathEvents: getDeathTimes(player),
        downEvents: getDownTimes(player),
    };
}

export function extractPlayerFightData(json: EiJson, fightNumber: number, bucketSizeMs: number): PlayerFightData {
    const player = findLocalPlayer(json);
    const zone = json.zone ?? json.mapName ?? json.map ?? json.fightName;
    const map = resolveMapFromZone(zone);
    const mapName = normalizeMapName(zone);

    let nearestLandmark: string | null = null;
    if (map) {
        const avgPos = computeAveragePosition(json.players.filter(p => !p.notInSquad));
        if (avgPos) {
            const landmark = findNearestLandmark(map, avgPos[0], avgPos[1]);
            nearestLandmark = landmark?.name ?? null;
        }
    }

    const durationFormatted = formatDuration(json.durationMS);
    const landmarkPart = nearestLandmark ? ` — Near ${nearestLandmark}` : '';
    const fightLabel = `F${fightNumber}${landmarkPart} — ${mapName} — ${durationFormatted}`;

    return {
        fightLabel,
        fightNumber,
        mapName,
        nearestLandmark,
        duration: json.durationMS,
        durationFormatted,
        timestamp: json.uploadTime ?? new Date().toISOString(),
        playerName: player.name,
        accountName: player.account,
        profession: player.profession,
        eliteSpec: player.elite_spec,
        isCommander: player.hasCommanderTag,

        damage: {
            totalDamage: getDamage(player),
            dps: getDps(player),
            breakbarDamage: getBreakbarDamage(player),
            downContribution: getDownContribution(player),
            topSkills: getTopSkillDamage(player),
        },
        support: {
            boonStrips: getStrips(player),
            cleanses: getCleanses(player),
            cleanseSelf: getCleanseSelf(player),
            healingOutput: getHealingOutput(player),
            barrierOutput: getBarrierOutput(player),
            stabilityGeneration: getStabilityGeneration(player),
        },
        defense: {
            damageTaken: getDamageTaken(player),
            deaths: getDeaths(player),
            downs: getDowns(player),
            deathTimes: getDeathTimes(player),
            downTimes: getDownTimes(player),
            dodges: getDodges(player),
            blocked: getBlocked(player),
            evaded: getEvaded(player),
            missed: getMissed(player),
            invulned: getInvulned(player),
            interrupted: getInterrupted(player),
            incomingCC: getIncomingCC(player),
            incomingStrips: getIncomingStrips(player),
        },
        boons: {
            uptimes: extractBoonUptimes(player),
            generation: extractBoonGeneration(player),
        },
        timeline: buildTimeline(json, player, bucketSizeMs),
        squadContext: buildSquadContext(json, player),
    };
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/shared/extractPlayerData.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/shared/extractPlayerData.ts tests/shared/extractPlayerData.test.ts
git commit -m "feat: add orchestrator to extract player-focused fight data from EI JSON"
```

---

## Task 7: Zustand Store

**Files:**
- Create: `src/renderer/store.ts`
- Modify: `src/main/index.ts` (update DEFAULT_EI_SETTINGS)

- [ ] **Step 1: Update EI parser settings in main process**

In `src/main/index.ts`, find where `eiManager` is created and update the default settings to enable `parseCombatReplay`:

```typescript
// In the app.whenReady() callback, after creating eiManager:
// Change the default settings override
import { DEFAULT_EI_SETTINGS } from './eiParser';

// Replace the existing settings initialization with:
const AXIPULSE_EI_SETTINGS = {
    ...DEFAULT_EI_SETTINGS,
    parseCombatReplay: true,
};

// And use AXIPULSE_EI_SETTINGS as the base when loading saved settings
```

Specifically, change lines in `app.whenReady()`:
```typescript
// Before:
if (savedEiSettings) {
    eiManager.setSettings({ ...DEFAULT_EI_SETTINGS, ...savedEiSettings });
}

// After:
const AXIPULSE_EI_DEFAULTS = { ...DEFAULT_EI_SETTINGS, parseCombatReplay: true };
if (savedEiSettings) {
    eiManager.setSettings({ ...AXIPULSE_EI_DEFAULTS, ...savedEiSettings });
} else {
    eiManager.setSettings(AXIPULSE_EI_DEFAULTS);
}
```

- [ ] **Step 2: Create Zustand store**

```typescript
// src/renderer/store.ts
import { create } from 'zustand';
import type { PlayerFightData, FightHistoryEntry } from '../shared/types';

export type View = 'pulse' | 'timeline' | 'history' | 'settings';
export type PulseSubview = 'overview' | 'damage' | 'support' | 'defense' | 'boons';
export type TimelinePreset = 'why-died' | 'my-damage' | 'support' | 'positioning' | 'custom';

export interface TimelineLayerToggles {
    distanceToTag: boolean;
    damageDealt: boolean;
    damageTaken: boolean;
    incomingHealing: boolean;
    incomingBarrier: boolean;
    boonUptime: boolean;
    boonGeneration: boolean;
    ccDealtReceived: boolean;
}

const PRESET_TOGGLES: Record<Exclude<TimelinePreset, 'custom'>, TimelineLayerToggles> = {
    'why-died': {
        distanceToTag: true, damageDealt: false, damageTaken: true,
        incomingHealing: true, incomingBarrier: true, boonUptime: true,
        boonGeneration: false, ccDealtReceived: false,
    },
    'my-damage': {
        distanceToTag: false, damageDealt: true, damageTaken: false,
        incomingHealing: false, incomingBarrier: false, boonUptime: true,
        boonGeneration: false, ccDealtReceived: false,
    },
    'support': {
        distanceToTag: false, damageDealt: false, damageTaken: false,
        incomingHealing: true, incomingBarrier: true, boonUptime: true,
        boonGeneration: false, ccDealtReceived: false,
    },
    'positioning': {
        distanceToTag: true, damageDealt: true, damageTaken: false,
        incomingHealing: false, incomingBarrier: false, boonUptime: false,
        boonGeneration: false, ccDealtReceived: false,
    },
};

interface AppState {
    // Current fight
    currentFight: PlayerFightData | null;
    setCurrentFight: (fight: PlayerFightData) => void;

    // Session history
    sessionHistory: FightHistoryEntry[];
    pushToHistory: (entry: FightHistoryEntry) => void;
    loadFromHistory: (fightNumber: number) => void;
    activeFightNumber: number | null;

    // UI state
    view: View;
    setView: (view: View) => void;
    pulseSubview: PulseSubview;
    setPulseSubview: (subview: PulseSubview) => void;
    timelinePreset: TimelinePreset;
    setTimelinePreset: (preset: TimelinePreset) => void;
    pillBarExpanded: boolean;
    setPillBarExpanded: (expanded: boolean) => void;
    togglePillBar: () => void;

    // Timeline settings
    timelineToggles: TimelineLayerToggles;
    setTimelineToggle: (layer: keyof TimelineLayerToggles, enabled: boolean) => void;
    applyPreset: (preset: Exclude<TimelinePreset, 'custom'>) => void;
    bucketSizeMs: number;
    setBucketSizeMs: (ms: number) => void;

    // Toast
    toasts: { id: string; message: string; fightLabel: string }[];
    addToast: (message: string, fightLabel: string) => void;
    removeToast: (id: string) => void;

    // Settings
    logDirectory: string;
    setLogDirectory: (dir: string) => void;
    eiStatus: { installed: boolean; version: string | null; installing: boolean; error: string | null };
    setEiStatus: (status: AppState['eiStatus']) => void;

    // Fight counter
    fightCounter: number;
    incrementFightCounter: () => number;
}

export const useAppStore = create<AppState>((set, get) => ({
    currentFight: null,
    setCurrentFight: (fight) => set({ currentFight: fight, activeFightNumber: fight.fightNumber }),

    sessionHistory: [],
    pushToHistory: (entry) => set((state) => ({
        sessionHistory: [entry, ...state.sessionHistory],
    })),
    loadFromHistory: (fightNumber) => {
        const entry = get().sessionHistory.find(e => e.fightNumber === fightNumber);
        if (entry) {
            set({ currentFight: entry.data, activeFightNumber: fightNumber });
        }
    },
    activeFightNumber: null,

    view: 'pulse',
    setView: (view) => set({ view }),
    pulseSubview: 'overview',
    setPulseSubview: (subview) => set({ pulseSubview: subview }),
    timelinePreset: 'why-died',
    setTimelinePreset: (preset) => set({ timelinePreset: preset }),
    pillBarExpanded: false,
    setPillBarExpanded: (expanded) => set({ pillBarExpanded: expanded }),
    togglePillBar: () => set((state) => ({ pillBarExpanded: !state.pillBarExpanded })),

    timelineToggles: PRESET_TOGGLES['why-died'],
    setTimelineToggle: (layer, enabled) => set((state) => ({
        timelineToggles: { ...state.timelineToggles, [layer]: enabled },
        timelinePreset: 'custom',
    })),
    applyPreset: (preset) => set({
        timelineToggles: { ...PRESET_TOGGLES[preset] },
        timelinePreset: preset,
    }),
    bucketSizeMs: 1000,
    setBucketSizeMs: (ms) => set({ bucketSizeMs: ms }),

    toasts: [],
    addToast: (message, fightLabel) => {
        const id = `${Date.now()}-${Math.random()}`;
        set((state) => ({ toasts: [...state.toasts, { id, message, fightLabel }] }));
        setTimeout(() => get().removeToast(id), 4000);
    },
    removeToast: (id) => set((state) => ({
        toasts: state.toasts.filter(t => t.id !== id),
    })),

    logDirectory: '',
    setLogDirectory: (dir) => set({ logDirectory: dir }),
    eiStatus: { installed: false, version: null, installing: false, error: null },
    setEiStatus: (status) => set({ eiStatus: status }),

    fightCounter: 0,
    incrementFightCounter: () => {
        const next = get().fightCounter + 1;
        set({ fightCounter: next });
        return next;
    },
}));
```

- [ ] **Step 3: Verify types compile**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/renderer/store.ts src/main/index.ts
git commit -m "feat: add Zustand store and enable parseCombatReplay in EI defaults"
```

---

## Task 8: App Shell — Subview Pill Bar & Toast

**Files:**
- Create: `src/renderer/app/SubviewPillBar.tsx`
- Create: `src/renderer/app/Toast.tsx`
- Modify: `src/renderer/App.tsx`
- Modify: `src/renderer/app/AppLayout.tsx`

- [ ] **Step 1: Create SubviewPillBar component**

```typescript
// src/renderer/app/SubviewPillBar.tsx
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { useAppStore } from '../store';

interface PillDef {
    id: string;
    label: string;
}

interface SubviewPillBarProps {
    pills: PillDef[];
    activeId: string;
    onSelect: (id: string) => void;
}

export function SubviewPillBar({ pills, activeId, onSelect }: SubviewPillBarProps) {
    const expanded = useAppStore(s => s.pillBarExpanded);
    const togglePillBar = useAppStore(s => s.togglePillBar);
    const activePill = pills.find(p => p.id === activeId);

    return (
        <>
            {/* Toggle button — sits in the tab bar (rendered via portal or flex) */}
            <button
                onClick={togglePillBar}
                className="flex items-center gap-1.5 no-drag px-2 py-1 rounded transition-colors hover:bg-white/5"
            >
                <span className="text-[11px] text-[color:var(--text-secondary)]">
                    {activePill?.label ?? 'Select'}
                </span>
                {expanded
                    ? <ChevronUp className="w-3 h-3 text-[color:var(--brand-primary)]" />
                    : <ChevronDown className="w-3 h-3 text-[color:var(--text-muted)]" />
                }
            </button>

            {/* Expandable pill row */}
            <AnimatePresence>
                {expanded && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
                        className="overflow-hidden border-b shrink-0"
                        style={{ borderColor: 'var(--border-subtle)', background: 'var(--bg-base)' }}
                    >
                        <div className="flex items-center px-3 py-1.5 gap-1.5">
                            {pills.map(pill => (
                                <button
                                    key={pill.id}
                                    onClick={() => {
                                        onSelect(pill.id);
                                        togglePillBar();
                                    }}
                                    className={`px-2.5 py-1 text-[11px] rounded-full transition-colors ${
                                        pill.id === activeId
                                            ? 'text-[color:var(--brand-primary)] bg-[color:var(--accent-bg)] border border-[color:var(--accent-border)]'
                                            : 'text-[color:var(--text-muted)] hover:text-[color:var(--text-secondary)]'
                                    }`}
                                >
                                    {pill.label}
                                </button>
                            ))}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </>
    );
}
```

- [ ] **Step 2: Create Toast component**

```typescript
// src/renderer/app/Toast.tsx
import { AnimatePresence, motion } from 'framer-motion';
import { useAppStore } from '../store';

export function ToastContainer() {
    const toasts = useAppStore(s => s.toasts);

    return (
        <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
            <AnimatePresence>
                {toasts.map(toast => (
                    <motion.div
                        key={toast.id}
                        initial={{ opacity: 0, y: 20, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -10, scale: 0.95 }}
                        transition={{ duration: 0.2 }}
                        className="px-3 py-2 rounded-md border text-xs max-w-[280px]"
                        style={{
                            background: 'var(--bg-card)',
                            borderColor: 'var(--accent-border)',
                            boxShadow: 'var(--shadow-dropdown)',
                        }}
                    >
                        <div className="text-[color:var(--brand-primary)] font-medium">{toast.fightLabel}</div>
                        <div className="text-[color:var(--text-secondary)] mt-0.5">{toast.message}</div>
                    </motion.div>
                ))}
            </AnimatePresence>
        </div>
    );
}
```

- [ ] **Step 3: Update App.tsx to use Zustand store**

```typescript
// src/renderer/App.tsx
import { AppLayout } from './app/AppLayout';

function App() {
    return <AppLayout />;
}

export default App;
```

- [ ] **Step 4: Update AppLayout.tsx with subview pill bar, toast, and fight badge**

Rewrite `src/renderer/app/AppLayout.tsx` to integrate the store, subview pill bar, toast container, and route to actual view components. The full content is extensive — see the spec for the navigation structure. Key changes:

- Remove `view` and `setView` props — read from Zustand store
- Add `SubviewPillBar` toggle button to right side of tab bar
- Add `SubviewPillBar` expandable row between tab bar and content
- Add fight badge showing active fight number
- Add `ToastContainer`
- Content area renders placeholder views (to be replaced in later tasks)

```typescript
// src/renderer/app/AppLayout.tsx
import { Activity, Clock3, GanttChart, Minus, Settings as SettingsIcon, Square, X } from 'lucide-react';
import { useAppStore, type View, type PulseSubview, type TimelinePreset } from '../store';
import { SubviewPillBar } from './SubviewPillBar';
import { ToastContainer } from './Toast';

const NAV_ITEMS: { id: View; label: string; icon: typeof Activity }[] = [
    { id: 'pulse', label: 'Pulse', icon: Activity },
    { id: 'timeline', label: 'Timeline', icon: GanttChart },
    { id: 'history', label: 'History', icon: Clock3 },
    { id: 'settings', label: 'Settings', icon: SettingsIcon },
];

const PULSE_PILLS = [
    { id: 'overview', label: 'Overview' },
    { id: 'damage', label: 'Damage' },
    { id: 'support', label: 'Support' },
    { id: 'defense', label: 'Defense' },
    { id: 'boons', label: 'Boons' },
];

const TIMELINE_PILLS = [
    { id: 'why-died', label: 'Why did I die?' },
    { id: 'my-damage', label: 'My damage' },
    { id: 'support', label: 'Am I getting support?' },
    { id: 'positioning', label: 'Positioning' },
    { id: 'custom', label: 'Custom' },
];

export function AppLayout() {
    const view = useAppStore(s => s.view);
    const setView = useAppStore(s => s.setView);
    const pulseSubview = useAppStore(s => s.pulseSubview);
    const setPulseSubview = useAppStore(s => s.setPulseSubview);
    const timelinePreset = useAppStore(s => s.timelinePreset);
    const setTimelinePreset = useAppStore(s => s.setTimelinePreset);
    const applyPreset = useAppStore(s => s.applyPreset);
    const activeFightNumber = useAppStore(s => s.activeFightNumber);

    const hasSubviews = view === 'pulse' || view === 'timeline';
    const pills = view === 'pulse' ? PULSE_PILLS : view === 'timeline' ? TIMELINE_PILLS : [];
    const activeSubviewId = view === 'pulse' ? pulseSubview : view === 'timeline' ? timelinePreset : '';

    const handleSubviewSelect = (id: string) => {
        if (view === 'pulse') {
            setPulseSubview(id as PulseSubview);
        } else if (view === 'timeline') {
            if (id !== 'custom') {
                applyPreset(id as Exclude<TimelinePreset, 'custom'>);
            }
            setTimelinePreset(id as TimelinePreset);
        }
    };

    return (
        <div className="h-full w-full flex flex-col select-none">
            {/* Title Bar */}
            <div
                className="h-11 shrink-0 w-full flex justify-between items-center px-4 border-b drag-region"
                style={{ background: 'var(--bg-base)', borderColor: 'var(--border-subtle)' }}
            >
                <div className="flex items-center gap-2.5">
                    <img src="./img/axipulse-white.png" alt="AxiPulse" className="h-4 w-auto object-contain opacity-90" draggable={false} />
                    <span style={{ fontFamily: '"Cinzel", serif', fontSize: '0.95rem', letterSpacing: '0.06em', fontWeight: 500 }}>
                        <span style={{ color: '#ffffff' }}>Axi</span>
                        <span style={{ color: 'var(--brand-primary)' }}>Pulse</span>
                    </span>
                    {activeFightNumber !== null && (
                        <span className="ml-1 px-1.5 py-0.5 text-[9px] font-semibold rounded border"
                            style={{ color: 'var(--brand-primary)', borderColor: 'var(--accent-border)', background: 'var(--accent-bg)' }}>
                            F{activeFightNumber}
                        </span>
                    )}
                </div>
                <div className="flex items-center gap-4 no-drag">
                    <button onClick={() => window.electronAPI?.windowControl('minimize')} className="text-gray-400 hover:text-white transition-colors">
                        <Minus className="w-4 h-4" />
                    </button>
                    <button onClick={() => window.electronAPI?.windowControl('maximize')} className="text-gray-400 hover:text-white transition-colors">
                        <Square className="w-3 h-3" />
                    </button>
                    <button onClick={() => window.electronAPI?.windowControl('close')} className="text-gray-400 hover:text-red-400 transition-colors">
                        <X className="w-4 h-4" />
                    </button>
                </div>
            </div>

            {/* Nav Bar */}
            <div
                className="flex items-center justify-between px-3 py-1.5 border-b shrink-0"
                style={{ borderColor: 'var(--border-subtle)', background: 'var(--bg-elevated)' }}
            >
                <div className="flex items-center gap-1">
                    {NAV_ITEMS.map(({ id, label, icon: Icon }) => (
                        <button
                            key={id}
                            title={label}
                            onClick={() => setView(id)}
                            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded transition-colors ${
                                view === id
                                    ? 'text-[color:var(--brand-primary)]'
                                    : 'text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)]'
                            }`}
                            style={view === id ? { background: 'var(--accent-bg)' } : {}}
                        >
                            <Icon className="w-3.5 h-3.5" />
                            {label}
                        </button>
                    ))}
                </div>
                {hasSubviews && (
                    <SubviewPillBar pills={pills} activeId={activeSubviewId} onSelect={handleSubviewSelect} />
                )}
            </div>

            {/* Subview pill expansion area */}
            {hasSubviews && (
                <SubviewPillBar pills={pills} activeId={activeSubviewId} onSelect={handleSubviewSelect} />
            )}

            {/* Content Area */}
            <div className="flex-1 overflow-auto p-4">
                {view === 'pulse' && <PlaceholderView label="Pulse" sublabel={pulseSubview} />}
                {view === 'timeline' && <PlaceholderView label="Timeline" sublabel={timelinePreset} />}
                {view === 'history' && <PlaceholderView label="History" />}
                {view === 'settings' && <PlaceholderView label="Settings" />}
            </div>

            <ToastContainer />
        </div>
    );
}

function PlaceholderView({ label, sublabel }: { label: string; sublabel?: string }) {
    return (
        <div className="flex flex-col items-center justify-center h-full gap-2 text-[color:var(--text-muted)]">
            <p className="text-sm font-medium text-[color:var(--text-secondary)]">{label}</p>
            {sublabel && <p className="text-xs">{sublabel}</p>}
        </div>
    );
}
```

Note: The `SubviewPillBar` is rendered in two places — the toggle button in the tab bar, and the expandable row below it. This needs refactoring to split into `SubviewToggle` (button) and `SubviewPillExpansion` (expandable row). The implementing agent should split the component accordingly so the toggle button renders inside the nav bar's right side, and the expandable pill row renders as a sibling below the nav bar.

- [ ] **Step 5: Verify app compiles and renders**

Run: `npx tsc --noEmit && npx vite build`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/renderer/App.tsx src/renderer/app/ src/renderer/store.ts
git commit -m "feat: add Zustand store, subview pill bar, toast system, fight badge"
```

---

## Task 9: Pulse View — Stat Cards & Subviews

**Files:**
- Create: `src/renderer/views/StatCard.tsx`
- Create: `src/renderer/views/PulseView.tsx`
- Create: `src/renderer/views/pulse/OverviewSubview.tsx`
- Create: `src/renderer/views/pulse/DamageSubview.tsx`
- Create: `src/renderer/views/pulse/SupportSubview.tsx`
- Create: `src/renderer/views/pulse/DefenseSubview.tsx`
- Create: `src/renderer/views/pulse/BoonsSubview.tsx`

- [ ] **Step 1: Create StatCard component**

```typescript
// src/renderer/views/StatCard.tsx
interface StatCardProps {
    label: string;
    value: string | number;
    detail?: string;
    detailColor?: 'good' | 'bad' | 'neutral';
}

export function StatCard({ label, value, detail, detailColor = 'neutral' }: StatCardProps) {
    const colorClass = detailColor === 'good' ? 'text-[color:var(--brand-primary)]'
        : detailColor === 'bad' ? 'text-[color:var(--status-error)]'
        : 'text-[color:var(--text-muted)]';

    return (
        <div className="rounded p-3" style={{ background: 'var(--bg-card)' }}>
            <div className="text-[10px] uppercase tracking-wider text-[color:var(--text-muted)]">{label}</div>
            <div className="text-lg font-semibold text-[color:var(--text-primary)] mt-0.5">
                {typeof value === 'number' ? value.toLocaleString() : value}
            </div>
            {detail && <div className={`text-[10px] mt-0.5 ${colorClass}`}>{detail}</div>}
        </div>
    );
}
```

- [ ] **Step 2: Create Overview subview**

```typescript
// src/renderer/views/pulse/OverviewSubview.tsx
import type { PlayerFightData } from '../../shared/types';
import { StatCard } from '../StatCard';

export function OverviewSubview({ data }: { data: PlayerFightData }) {
    const { damage, defense, support, squadContext } = data;

    return (
        <div className="grid grid-cols-2 gap-2">
            <StatCard
                label="Damage"
                value={damage.totalDamage.toLocaleString()}
                detail={`${damage.dps.toLocaleString()} DPS`}
                detailColor="good"
            />
            <StatCard
                label="Down Cont."
                value={damage.downContribution}
                detail={squadContext.damageRank <= 3 ? `${squadContext.damageRank}${ordinal(squadContext.damageRank)} in squad` : undefined}
                detailColor="good"
            />
            <StatCard
                label="Deaths / Downs"
                value={`${defense.deaths} / ${defense.downs}`}
                detail={defense.deathTimes.length > 0 ? `at ${defense.deathTimes.map(t => formatTime(t)).join(', ')}` : undefined}
                detailColor={defense.deaths > 0 ? 'bad' : 'good'}
            />
            <StatCard
                label="Strips"
                value={support.boonStrips}
                detail={squadContext.stripsRank <= 3 ? `${squadContext.stripsRank}${ordinal(squadContext.stripsRank)} in squad` : undefined}
                detailColor="good"
            />
            <StatCard label="Cleanses" value={support.cleanses} detail={`self: ${support.cleanseSelf}`} />
            {support.healingOutput > 0 && (
                <StatCard
                    label="Healing"
                    value={support.healingOutput.toLocaleString()}
                    detail="squad total"
                    detailColor="good"
                />
            )}
        </div>
    );
}

function ordinal(n: number): string {
    if (n === 1) return 'st';
    if (n === 2) return 'nd';
    if (n === 3) return 'rd';
    return 'th';
}

function formatTime(ms: number): string {
    const sec = Math.floor(ms / 1000);
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
}
```

- [ ] **Step 3: Create Damage, Support, Defense, Boons subviews**

Each follows the same pattern as Overview — receives `PlayerFightData` and renders stat cards + any charts specific to that category. The implementing agent should use the spec's metric lists from Section 3 and the `StatCard` component. Key notes:

- **DamageSubview**: StatCards for total damage, DPS, breakbar, down contribution. Plus a ranked list of `data.damage.topSkills` (name + damage bar).
- **SupportSubview**: StatCards for strips, cleanses, healing, barrier, stability generation.
- **DefenseSubview**: StatCards for damage taken, deaths/downs with timestamps, dodges, plus a breakdown grid for blocked/evaded/missed/invulned/interrupted, incoming CC, incoming strips.
- **BoonsSubview**: Horizontal bar chart for `data.boons.uptimes` (boon name + percentage bar 0-100%). Below that, a table for `data.boons.generation` (self/group/squad columns).

- [ ] **Step 4: Create PulseView router**

```typescript
// src/renderer/views/PulseView.tsx
import { useAppStore } from '../store';
import { OverviewSubview } from './pulse/OverviewSubview';
import { DamageSubview } from './pulse/DamageSubview';
import { SupportSubview } from './pulse/SupportSubview';
import { DefenseSubview } from './pulse/DefenseSubview';
import { BoonsSubview } from './pulse/BoonsSubview';
import { Activity } from 'lucide-react';

export function PulseView() {
    const currentFight = useAppStore(s => s.currentFight);
    const subview = useAppStore(s => s.pulseSubview);

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

    switch (subview) {
        case 'overview': return <OverviewSubview data={currentFight} />;
        case 'damage': return <DamageSubview data={currentFight} />;
        case 'support': return <SupportSubview data={currentFight} />;
        case 'defense': return <DefenseSubview data={currentFight} />;
        case 'boons': return <BoonsSubview data={currentFight} />;
    }
}
```

- [ ] **Step 5: Verify build**

Run: `npx tsc --noEmit && npx vite build`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/renderer/views/
git commit -m "feat: add Pulse view with Overview, Damage, Support, Defense, Boons subviews"
```

---

## Task 10: Timeline View

**Files:**
- Create: `src/renderer/views/TimelineView.tsx`
- Create: `src/renderer/views/timeline/TimelineChart.tsx`
- Create: `src/renderer/views/timeline/TimelineControls.tsx`
- Create: `src/renderer/views/timeline/TimelinePresets.ts`

- [ ] **Step 1: Create TimelinePresets constants**

```typescript
// src/renderer/views/timeline/TimelinePresets.ts
import type { TimelineLayerToggles } from '../../store';

export interface TimelineLayer {
    key: keyof TimelineLayerToggles;
    label: string;
    color: string;
    chartType: 'line' | 'area' | 'band' | 'marker';
}

export const TIMELINE_LAYERS: TimelineLayer[] = [
    { key: 'distanceToTag', label: 'Distance to Tag', color: '#f59e0b', chartType: 'line' },
    { key: 'damageDealt', label: 'Damage Dealt', color: '#ef4444', chartType: 'area' },
    { key: 'damageTaken', label: 'Damage Taken', color: '#f87171', chartType: 'area' },
    { key: 'incomingHealing', label: 'Incoming Healing', color: '#4ade80', chartType: 'area' },
    { key: 'incomingBarrier', label: 'Incoming Barrier', color: '#a78bfa', chartType: 'area' },
    { key: 'boonUptime', label: 'Boon Uptime', color: '#38bdf8', chartType: 'band' },
    { key: 'boonGeneration', label: 'Boon Generation', color: '#818cf8', chartType: 'band' },
    { key: 'ccDealtReceived', label: 'CC Dealt/Received', color: '#fb923c', chartType: 'marker' },
];
```

- [ ] **Step 2: Create TimelineControls — layer toggle checkboxes**

```typescript
// src/renderer/views/timeline/TimelineControls.tsx
import { useAppStore, type TimelineLayerToggles } from '../../store';
import { TIMELINE_LAYERS } from './TimelinePresets';

export function TimelineControls() {
    const toggles = useAppStore(s => s.timelineToggles);
    const setToggle = useAppStore(s => s.setTimelineToggle);

    return (
        <div className="flex flex-wrap gap-2 mb-3">
            {TIMELINE_LAYERS.map(layer => (
                <label
                    key={layer.key}
                    className="flex items-center gap-1.5 text-[10px] cursor-pointer select-none"
                >
                    <div
                        className="w-2.5 h-2.5 rounded-sm border"
                        style={{
                            borderColor: layer.color,
                            background: toggles[layer.key] ? layer.color : 'transparent',
                        }}
                        onClick={() => setToggle(layer.key, !toggles[layer.key])}
                    />
                    <span className={toggles[layer.key] ? 'text-[color:var(--text-primary)]' : 'text-[color:var(--text-muted)]'}>
                        {layer.label}
                    </span>
                </label>
            ))}
        </div>
    );
}
```

- [ ] **Step 3: Create TimelineChart using Recharts**

```typescript
// src/renderer/views/timeline/TimelineChart.tsx
import { ComposedChart, Area, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import type { TimelineData } from '../../../shared/types';
import type { TimelineLayerToggles } from '../../store';
import { TIMELINE_LAYERS } from './TimelinePresets';

interface TimelineChartProps {
    data: TimelineData;
    toggles: TimelineLayerToggles;
    durationMs: number;
}

export function TimelineChart({ data, toggles, durationMs }: TimelineChartProps) {
    // Merge all enabled layers into a unified dataset keyed by time
    const timeMap = new Map<number, Record<string, number>>();

    function addSeries(key: string, buckets: { time: number; value: number }[]) {
        for (const { time, value } of buckets) {
            const entry = timeMap.get(time) ?? { time };
            entry[key] = value;
            timeMap.set(time, entry);
        }
    }

    if (toggles.damageDealt) addSeries('damageDealt', data.damageDealt);
    if (toggles.damageTaken) addSeries('damageTaken', data.damageTaken);
    if (toggles.distanceToTag) addSeries('distanceToTag', data.distanceToTag);
    if (toggles.incomingHealing) addSeries('incomingHealing', data.incomingHealing);
    if (toggles.incomingBarrier) addSeries('incomingBarrier', data.incomingBarrier);

    const chartData = Array.from(timeMap.values()).sort((a, b) => a.time - b.time);

    if (chartData.length === 0) {
        return (
            <div className="flex items-center justify-center h-full text-[color:var(--text-muted)] text-xs">
                Enable layers above to see timeline data
            </div>
        );
    }

    const formatTick = (ms: number) => {
        const sec = Math.floor(ms / 1000);
        return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
    };

    return (
        <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData} margin={{ top: 5, right: 10, bottom: 5, left: 10 }}>
                <XAxis dataKey="time" tickFormatter={formatTick} tick={{ fontSize: 10, fill: '#8b929e' }} />
                <YAxis tick={{ fontSize: 10, fill: '#8b929e' }} width={45} />
                <Tooltip
                    labelFormatter={formatTick}
                    contentStyle={{ background: '#1a1f2e', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 4, fontSize: 11 }}
                />

                {/* Death/down markers */}
                {data.deathEvents.map((t, i) => (
                    <ReferenceLine key={`death-${i}`} x={t} stroke="#ef4444" strokeDasharray="3 3" />
                ))}
                {data.downEvents.map((t, i) => (
                    <ReferenceLine key={`down-${i}`} x={t} stroke="#f59e0b" strokeDasharray="2 2" />
                ))}

                {toggles.damageDealt && <Area type="monotone" dataKey="damageDealt" fill="#ef444433" stroke="#ef4444" strokeWidth={1.5} />}
                {toggles.damageTaken && <Area type="monotone" dataKey="damageTaken" fill="#f8717133" stroke="#f87171" strokeWidth={1.5} />}
                {toggles.distanceToTag && <Line type="monotone" dataKey="distanceToTag" stroke="#f59e0b" strokeWidth={1.5} dot={false} />}
                {toggles.incomingHealing && <Area type="monotone" dataKey="incomingHealing" fill="#4ade8033" stroke="#4ade80" strokeWidth={1.5} />}
                {toggles.incomingBarrier && <Area type="monotone" dataKey="incomingBarrier" fill="#a78bfa33" stroke="#a78bfa" strokeWidth={1.5} />}
            </ComposedChart>
        </ResponsiveContainer>
    );
}
```

- [ ] **Step 4: Create TimelineView**

```typescript
// src/renderer/views/TimelineView.tsx
import { useAppStore } from '../store';
import { TimelineChart } from './timeline/TimelineChart';
import { TimelineControls } from './timeline/TimelineControls';
import { GanttChart } from 'lucide-react';

export function TimelineView() {
    const currentFight = useAppStore(s => s.currentFight);
    const toggles = useAppStore(s => s.timelineToggles);

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
        <div className="flex flex-col h-full">
            <TimelineControls />
            <div className="flex-1 min-h-0">
                <TimelineChart data={currentFight.timeline} toggles={toggles} durationMs={currentFight.duration} />
            </div>
        </div>
    );
}
```

- [ ] **Step 5: Verify build**

Run: `npx tsc --noEmit && npx vite build`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/renderer/views/TimelineView.tsx src/renderer/views/timeline/
git commit -m "feat: add Timeline view with layered chart, toggles, and presets"
```

---

## Task 11: History View

**Files:**
- Create: `src/renderer/views/HistoryView.tsx`
- Create: `src/renderer/views/history/HistoryEntry.tsx`
- Modify: `package.json` (add gw2-class-icons dependency)

- [ ] **Step 1: Install gw2-class-icons**

Run: `npm install gw2-class-icons`

- [ ] **Step 2: Create HistoryEntry component**

```typescript
// src/renderer/views/history/HistoryEntry.tsx
import type { FightHistoryEntry } from '../../../shared/types';

interface HistoryEntryProps {
    entry: FightHistoryEntry;
    isActive: boolean;
    isCurrent: boolean;
    onClick: () => void;
}

export function HistoryEntry({ entry, isActive, isCurrent, onClick }: HistoryEntryProps) {
    return (
        <button
            onClick={onClick}
            className={`w-full text-left px-3 py-2.5 rounded transition-colors ${
                isActive ? 'ring-1 ring-[color:var(--accent-border)]' : ''
            }`}
            style={{
                background: isActive ? 'var(--accent-bg)' : 'var(--bg-card)',
                borderLeft: isCurrent ? '2px solid var(--brand-primary)' : '2px solid transparent',
            }}
        >
            <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-[color:var(--text-primary)]">{entry.fightLabel}</span>
                <span className="text-[10px] text-[color:var(--text-muted)]">
                    {new Date(entry.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
            </div>
            <div className="flex items-center gap-3 mt-1">
                <span className="text-[10px] text-[color:var(--text-secondary)]">{entry.eliteSpec || entry.profession}</span>
                <span className="text-[10px] text-[color:var(--text-muted)]">
                    {entry.quickStats.damage.toLocaleString()} dmg
                </span>
                <span className="text-[10px] text-[color:var(--text-muted)]">
                    {entry.quickStats.strips} strips
                </span>
                {entry.quickStats.deaths > 0 && (
                    <span className="text-[10px] text-[color:var(--status-error)]">
                        {entry.quickStats.deaths} death{entry.quickStats.deaths > 1 ? 's' : ''}
                    </span>
                )}
            </div>
        </button>
    );
}
```

- [ ] **Step 3: Create HistoryView**

```typescript
// src/renderer/views/HistoryView.tsx
import { useAppStore } from '../store';
import { HistoryEntry } from './history/HistoryEntry';
import { Clock3 } from 'lucide-react';

export function HistoryView() {
    const sessionHistory = useAppStore(s => s.sessionHistory);
    const activeFightNumber = useAppStore(s => s.activeFightNumber);
    const loadFromHistory = useAppStore(s => s.loadFromHistory);
    const fightCounter = useAppStore(s => s.fightCounter);

    if (sessionHistory.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center h-full gap-4 text-[color:var(--text-muted)]">
                <Clock3 className="w-12 h-12 opacity-30" />
                <div className="text-center">
                    <p className="text-sm font-medium text-[color:var(--text-secondary)]">Session History</p>
                    <p className="text-xs mt-1">Past fights from this session will appear here</p>
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-1.5">
            {sessionHistory.map(entry => (
                <HistoryEntry
                    key={entry.fightNumber}
                    entry={entry}
                    isActive={entry.fightNumber === activeFightNumber}
                    isCurrent={entry.fightNumber === fightCounter}
                    onClick={() => loadFromHistory(entry.fightNumber)}
                />
            ))}
        </div>
    );
}
```

- [ ] **Step 4: Verify build**

Run: `npx tsc --noEmit && npx vite build`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/renderer/views/HistoryView.tsx src/renderer/views/history/ package.json package-lock.json
git commit -m "feat: add History view with fight entry list and active fight tracking"
```

---

## Task 12: Settings View

**Files:**
- Create: `src/renderer/views/SettingsView.tsx`

- [ ] **Step 1: Create SettingsView**

```typescript
// src/renderer/views/SettingsView.tsx
import { useEffect, useState } from 'react';
import { useAppStore } from '../store';
import { FolderOpen, Download, RefreshCw, Trash2, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';

export function SettingsView() {
    const logDirectory = useAppStore(s => s.logDirectory);
    const setLogDirectory = useAppStore(s => s.setLogDirectory);
    const eiStatus = useAppStore(s => s.eiStatus);
    const setEiStatus = useAppStore(s => s.setEiStatus);
    const bucketSizeMs = useAppStore(s => s.bucketSizeMs);
    const setBucketSizeMs = useAppStore(s => s.setBucketSizeMs);
    const [eiProgress, setEiProgress] = useState<string>('');

    useEffect(() => {
        window.electronAPI?.getSettings().then(s => {
            if (s.logDirectory) setLogDirectory(s.logDirectory);
        });
        window.electronAPI?.eiGetStatus().then(setEiStatus);

        const cleanupProgress = window.electronAPI?.onEiDownloadProgress((p) => {
            setEiProgress(p.stage + (p.percent != null ? ` (${p.percent}%)` : ''));
        });
        const cleanupStatus = window.electronAPI?.onEiStatusChanged(setEiStatus);

        return () => { cleanupProgress?.(); cleanupStatus?.(); };
    }, []);

    const handleBrowse = async () => {
        const dir = await window.electronAPI?.selectDirectory();
        if (dir) {
            setLogDirectory(dir);
            window.electronAPI?.startWatching(dir);
            window.electronAPI?.saveSettings({ logDirectory: dir });
        }
    };

    const handleEiAction = async (action: 'install' | 'update' | 'reinstall' | 'uninstall') => {
        setEiStatus({ ...eiStatus, installing: true, error: null });
        try {
            if (action === 'install') await window.electronAPI?.eiInstall();
            else if (action === 'update') await window.electronAPI?.eiUpdate();
            else if (action === 'reinstall') await window.electronAPI?.eiReinstall();
            else if (action === 'uninstall') await window.electronAPI?.eiUninstall();
        } catch (err: any) {
            setEiStatus({ ...eiStatus, installing: false, error: err?.message ?? 'Failed' });
        }
        setEiProgress('');
    };

    return (
        <div className="max-w-md space-y-6">
            {/* Log Directory */}
            <section>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-[color:var(--text-muted)] mb-2">Log Directory</h3>
                <div className="flex items-center gap-2">
                    <div className="flex-1 text-xs px-2.5 py-1.5 rounded truncate"
                        style={{ background: 'var(--bg-input)', color: logDirectory ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                        {logDirectory || 'Not configured'}
                    </div>
                    <button onClick={handleBrowse}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded transition-colors hover:bg-white/5 text-[color:var(--text-secondary)]">
                        <FolderOpen className="w-3.5 h-3.5" /> Browse
                    </button>
                </div>
                {logDirectory && (
                    <div className="flex items-center gap-1 mt-1.5 text-[10px] text-[color:var(--status-success)]">
                        <CheckCircle className="w-3 h-3" /> Watching for new logs
                    </div>
                )}
            </section>

            {/* Elite Insights */}
            <section>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-[color:var(--text-muted)] mb-2">Elite Insights</h3>
                <div className="text-xs text-[color:var(--text-secondary)] mb-2">
                    {eiStatus.installed
                        ? <span className="flex items-center gap-1"><CheckCircle className="w-3 h-3 text-[color:var(--status-success)]" /> Installed {eiStatus.version ? `v${eiStatus.version}` : ''}</span>
                        : <span className="flex items-center gap-1"><AlertCircle className="w-3 h-3 text-[color:var(--status-warning)]" /> Not installed</span>
                    }
                </div>
                {eiStatus.installing && eiProgress && (
                    <div className="flex items-center gap-1.5 text-[10px] text-[color:var(--text-muted)] mb-2">
                        <Loader2 className="w-3 h-3 animate-spin" /> {eiProgress}
                    </div>
                )}
                {eiStatus.error && (
                    <div className="text-[10px] text-[color:var(--status-error)] mb-2">{eiStatus.error}</div>
                )}
                <div className="flex gap-2">
                    {!eiStatus.installed && (
                        <button onClick={() => handleEiAction('install')} disabled={eiStatus.installing}
                            className="flex items-center gap-1 px-2.5 py-1 text-[11px] rounded transition-colors bg-[color:var(--accent-bg)] text-[color:var(--brand-primary)] hover:bg-[color:var(--accent-bg-strong)] disabled:opacity-50">
                            <Download className="w-3 h-3" /> Install
                        </button>
                    )}
                    {eiStatus.installed && (
                        <>
                            <button onClick={() => handleEiAction('update')} disabled={eiStatus.installing}
                                className="flex items-center gap-1 px-2.5 py-1 text-[11px] rounded transition-colors hover:bg-white/5 text-[color:var(--text-secondary)] disabled:opacity-50">
                                <Download className="w-3 h-3" /> Update
                            </button>
                            <button onClick={() => handleEiAction('reinstall')} disabled={eiStatus.installing}
                                className="flex items-center gap-1 px-2.5 py-1 text-[11px] rounded transition-colors hover:bg-white/5 text-[color:var(--text-secondary)] disabled:opacity-50">
                                <RefreshCw className="w-3 h-3" /> Reinstall
                            </button>
                            <button onClick={() => handleEiAction('uninstall')} disabled={eiStatus.installing}
                                className="flex items-center gap-1 px-2.5 py-1 text-[11px] rounded transition-colors hover:bg-white/5 text-[color:var(--status-error)] disabled:opacity-50">
                                <Trash2 className="w-3 h-3" /> Uninstall
                            </button>
                        </>
                    )}
                </div>
            </section>

            {/* Timeline Bucket Size */}
            <section>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-[color:var(--text-muted)] mb-2">Timeline</h3>
                <div className="flex items-center gap-3">
                    <span className="text-xs text-[color:var(--text-secondary)]">Bucket size:</span>
                    {[1000, 2000, 3000, 5000].map(ms => (
                        <button
                            key={ms}
                            onClick={() => setBucketSizeMs(ms)}
                            className={`px-2 py-0.5 text-[11px] rounded transition-colors ${
                                bucketSizeMs === ms
                                    ? 'text-[color:var(--brand-primary)] bg-[color:var(--accent-bg)] border border-[color:var(--accent-border)]'
                                    : 'text-[color:var(--text-muted)] hover:text-[color:var(--text-secondary)]'
                            }`}
                        >
                            {ms / 1000}s
                        </button>
                    ))}
                </div>
            </section>
        </div>
    );
}
```

- [ ] **Step 2: Verify build**

Run: `npx tsc --noEmit && npx vite build`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/renderer/views/SettingsView.tsx
git commit -m "feat: add Settings view with log directory, EI management, bucket size"
```

---

## Task 13: Wire Views into AppLayout + Parse Event Handling

**Files:**
- Modify: `src/renderer/app/AppLayout.tsx` (replace placeholders with real views)
- Create: `src/renderer/app/useFightListener.ts` (hook to handle incoming parse events)

- [ ] **Step 1: Create useFightListener hook**

```typescript
// src/renderer/app/useFightListener.ts
import { useEffect } from 'react';
import { useAppStore } from '../store';
import { extractPlayerFightData } from '../../shared/extractPlayerData';
import type { EiJson, FightHistoryEntry } from '../../shared/types';

export function useFightListener() {
    const setCurrentFight = useAppStore(s => s.setCurrentFight);
    const pushToHistory = useAppStore(s => s.pushToHistory);
    const currentFight = useAppStore(s => s.currentFight);
    const incrementFightCounter = useAppStore(s => s.incrementFightCounter);
    const addToast = useAppStore(s => s.addToast);
    const bucketSizeMs = useAppStore(s => s.bucketSizeMs);

    useEffect(() => {
        const cleanup = window.electronAPI?.onParseComplete((event) => {
            const json = event.data as EiJson;
            const fightNumber = incrementFightCounter();
            const fightData = extractPlayerFightData(json, fightNumber, bucketSizeMs);

            // Push current fight to history before replacing
            if (currentFight) {
                const historyEntry: FightHistoryEntry = {
                    fightNumber: currentFight.fightNumber,
                    fightLabel: currentFight.fightLabel,
                    timestamp: currentFight.timestamp,
                    profession: currentFight.profession,
                    eliteSpec: currentFight.eliteSpec,
                    duration: currentFight.duration,
                    durationFormatted: currentFight.durationFormatted,
                    quickStats: {
                        damage: currentFight.damage.totalDamage,
                        deaths: currentFight.defense.deaths,
                        strips: currentFight.support.boonStrips,
                        dps: currentFight.damage.dps,
                    },
                    data: currentFight,
                };
                pushToHistory(historyEntry);
            }

            setCurrentFight(fightData);
            addToast('Fight parsed successfully', fightData.fightLabel);
        });

        return cleanup;
    }, [currentFight, bucketSizeMs]);
}
```

- [ ] **Step 2: Update AppLayout to use real views and the fight listener**

Replace the `PlaceholderView` calls in AppLayout content area with:

```typescript
import { PulseView } from '../views/PulseView';
import { TimelineView } from '../views/TimelineView';
import { HistoryView } from '../views/HistoryView';
import { SettingsView } from '../views/SettingsView';
import { useFightListener } from './useFightListener';

// Inside AppLayout component body, add:
useFightListener();

// In the content area, replace placeholders:
{view === 'pulse' && <PulseView />}
{view === 'timeline' && <TimelineView />}
{view === 'history' && <HistoryView />}
{view === 'settings' && <SettingsView />}
```

Remove the `PlaceholderView` component.

- [ ] **Step 3: Verify build**

Run: `npx tsc --noEmit && npx vite build`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/renderer/app/AppLayout.tsx src/renderer/app/useFightListener.ts
git commit -m "feat: wire real views into app shell and add fight parse listener"
```

---

## Task 14: Final Integration & Manual Testing

- [ ] **Step 1: Run full build**

Run: `npm run build`
Expected: PASS (TypeScript compiles for both targets, Vite builds renderer)

- [ ] **Step 2: Run all unit tests**

Run: `npx vitest run`
Expected: All tests PASS

- [ ] **Step 3: Start dev server and verify UI**

Run: `npm run dev`

Verify:
- App launches with frameless window
- Titlebar shows AxiPulse logo + branding
- Four tabs navigate correctly
- Subview pill bar toggles open/closed
- Pulse/Timeline show "waiting for data" states
- Settings allows log directory selection and EI install
- History shows empty state

- [ ] **Step 4: Commit any fixes**

```bash
git add -A
git commit -m "fix: integration fixes from manual testing"
```

- [ ] **Step 5: Final typecheck**

Run: `npm run typecheck`
Expected: PASS
