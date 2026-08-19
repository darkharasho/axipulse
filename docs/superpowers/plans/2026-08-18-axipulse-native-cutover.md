# AxiPulse (Electron) — Native axilog Cutover

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Elite Insights CLI with in-process axilog parsing against the native `ReportV1` format, with no change to the renderer's domain model.

**Architecture:** `src/shared/report.ts` adds the native-format primitives (entity index, RLE series decoder, coverage guard). `extractPlayerData.ts` is split into `src/shared/extract/*`, migrated one unit at a time against an equality oracle that computes each value both from the frozen EI JSON and from `ReportV1`. Only once every unit is green does the parse path swap to an Electron `utilityProcess` calling `@axiapps/axilog`, and the EI manager, its IPC surface and its UI are deleted.

**Tech Stack:** Electron 35, React 18, TypeScript 5.2, Vite 6, Vitest 4, `@axiapps/axilog` 1.2.0 (napi-rs).

**Spec:** `docs/superpowers/specs/2026-08-18-axilog-migration-design.md` (Parts 1, 2, 4)

**Depends on:** `docs/superpowers/plans/2026-08-18-axilog-v1.1.0-parse-facade.md` — **satisfied.** The facade shipped in axilog 1.2.0 and `@axiapps/axilog@1.2.0` is published on npm.

## Global Constraints

- **Run vitest as `npx vitest run --maxWorkers=2`** (or rely on the repo's `vitest.config.ts`, which already pins `pool: 'forks'`, `maxForks: 2`, `maxWorkers: 2`). Never run it unbounded — this machine runs games alongside dev work.
- Parse options are **explicit**: `{ replay: true, skillDamage: true, timeseries: true, rotation: true }`. Never `everything: true` — `modifiers` gates a full extra event pass this app does not use.
- A block whose `coverage` reads `not_computed` is a **hard error**. Never render a zero for it, never fall back to EI.
- `src/shared/types.ts` from `SkillCast` (line 97) down is **frozen** — `PlayerFightData` and everything below it must not change. The renderer stays untouched apart from the EI-management UI.
- Every native field name is `snake_case`; napi's serde-json bridge does not camelCase them.
- `dist_to_com` is tri-state: absent = pass never ran, `-1` = EI's "nothing qualified" sentinel, `>= 0` = a real distance. Never render `-1`.
- Two times are NOT log-relative: `encounter.markers[].time_ms` and `entities[].commander.segments`. Subtract `encounter.log_start_ms` first.
- Each extract unit's oracle test must be green before the next unit starts.

---

### Task 1: Fixture and the equality oracle harness

**Files:**
- Create: `tests/fixtures/wvw.zevtc` (anonymized)
- Create: `tests/fixtures/wvw.ei.json` (the frozen EI output for that fixture)
- Create: `tests/fixtures/README.md`
- Create: `tests/shared/oracle.ts`
- Modify: `package.json` (add `@axiapps/axilog`)

**Interfaces:**
- Consumes: `@axiapps/axilog@1.2.0`'s `parseFile`, `anonymizeFile`.
- Produces:
  - `tests/shared/oracle.ts` exporting `loadEiFixture(): EiJson`, `loadNativeFixture(): ReportV1`, and `PARSE_OPTS`.

- [ ] **Step 1: Install the dependency**

```bash
npm install @axiapps/axilog@1.2.0
node -e "console.log(Object.keys(require('@axiapps/axilog')))"
```
Expected: `[ 'anonymizeFile', 'parseBuffer', 'parseFile', 'parseFileEi' ]`.

- [ ] **Step 2: Produce the anonymized fixture**

Pick a real mid-size WvW `.zevtc` from the arcdps log directory — one with a commander, a squad, enemies from more than one team, and the healing extension active (otherwise the healing units cannot be tested).

```bash
mkdir -p tests/fixtures
node -e "
  const {anonymizeFile} = require('@axiapps/axilog');
  const n = anonymizeFile(process.argv[1], 'tests/fixtures/wvw.zevtc');
  console.log('anonymized', n, 'player agents');
" /path/to/real/log.zevtc
```
Expected: a non-zero agent count. Confirm no real account names survive:
```bash
node -e "
  const {parseFile} = require('@axiapps/axilog');
  const r = parseFile('tests/fixtures/wvw.zevtc');
  console.log(r.entities.filter(e=>e.account).slice(0,5).map(e=>e.account));
"
```
Expected: `Anon1`-style placeholders only.

- [ ] **Step 3: Freeze the EI baseline**

With the EI parser still working (this is the last time it is used), parse the fixture through the existing pipeline and save the JSON:

```bash
npm run dev   # let EI install if it has not
# then, in a node REPL against the installed CLI, or by copying the
# JSON the app already wrote to userData for this log:
cp "$(ls -t ~/.config/axipulse/ei-output/*.json | head -1)" tests/fixtures/wvw.ei.json
node -e "const j=require('./tests/fixtures/wvw.ei.json'); console.log(j.players.length,'players',j.durationMS,'ms')"
```
Expected: a plausible player count and duration. If the output path differs, find it with `grep -n "outputDir\|writeFile" src/main/eiParser.ts`.

- [ ] **Step 4: Document the fixture**

Create `tests/fixtures/README.md`:

```markdown
# Test fixtures

- `wvw.zevtc` — an anonymized mid-size WvW fight (via axilog's
  `anonymizeFile`). Chosen because it has a commander, a multi-team enemy
  set, and an active arcdps healing extension, so every extract unit has
  something to assert against.
- `wvw.ei.json` — Elite Insights output for that exact log, frozen before
  the axilog migration. It is the equality oracle: each extract unit is
  migrated by asserting the native computation matches this. **Delete it,
  and the EI types it needs, in the final migration commit** — it has no
  purpose once nothing computes from it.
```

- [ ] **Step 5: Write the oracle helper**

Create `tests/shared/oracle.ts`:

```ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseFile } from '@axiapps/axilog';
import type { ReportV1 } from '@axiapps/axilog/types';
import type { EiJson } from '../../src/shared/types';

const FIXTURES = join(__dirname, '..', 'fixtures');

/** The exact options this app parses with in production. Keep in sync
 *  with src/main/axilogParser.ts — the coverage test guards the drift. */
export const PARSE_OPTS = {
    replay: true,
    skillDamage: true,
    timeseries: true,
    rotation: true,
} as const;

let cachedNative: ReportV1 | null = null;

/** The frozen Elite Insights output — the equality oracle's left-hand side. */
export function loadEiFixture(): EiJson {
    return JSON.parse(readFileSync(join(FIXTURES, 'wvw.ei.json'), 'utf8')) as EiJson;
}

/** The native document for the same log — the oracle's right-hand side.
 *  Parsed once per test process; parsing is ~0.3s but not free. */
export function loadNativeFixture(): ReportV1 {
    if (!cachedNative) {
        cachedNative = parseFile(join(FIXTURES, 'wvw.zevtc'), PARSE_OPTS) as ReportV1;
    }
    return cachedNative;
}
```

- [ ] **Step 6: Write the smoke test**

Create `tests/shared/oracle.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { loadEiFixture, loadNativeFixture } from './oracle';

describe('oracle fixtures', () => {
    it('describe the same fight', () => {
        const ei = loadEiFixture();
        const native = loadNativeFixture();
        // Durations come from different engines; allow one polling tick.
        expect(Math.abs(native.encounter.duration_ms - ei.durationMS)).toBeLessThan(1000);
    });

    it('agree on the squad roster', () => {
        const ei = loadEiFixture();
        const native = loadNativeFixture();
        const eiAccounts = new Set(
            ei.players.filter(p => !p.isFake && !p.notInSquad).map(p => p.account),
        );
        const nativeAccounts = new Set(
            native.entities.filter(e => e.role === 'squad').map(e => e.account!),
        );
        expect([...nativeAccounts].sort()).toEqual([...eiAccounts].sort());
    });

    it('resolve the local player to an entity id', () => {
        const native = loadNativeFixture();
        expect(typeof native.encounter.recorded_by).toBe('number');
    });
});
```

- [ ] **Step 7: Run it**

Run: `npx vitest run tests/shared/oracle.test.ts --maxWorkers=2`
Expected: 3 passing. If the roster test fails, the EI baseline and the `.zevtc` are from different fights — redo Steps 2-3.

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json tests/fixtures tests/shared/oracle.ts tests/shared/oracle.test.ts
git commit -m "test: add the axilog equality-oracle fixture and harness"
```

---

### Task 2: `src/shared/report.ts` — the native-format primitives

**Files:**
- Create: `src/shared/report.ts`
- Create: `tests/shared/report.test.ts`

**Interfaces:**
- Consumes: `@axiapps/axilog/types`.
- Produces:
  - `export type { ReportV1, EntityOut, SeriesOut, CoverageState } from '@axiapps/axilog/types'`
  - `decodeSeries(s: SeriesOut): number[]`
  - `entityById(r: ReportV1): Map<number, EntityOut>`
  - `squadMembers(r: ReportV1): EntityOut[]`
  - `enemyPlayers(r: ReportV1): EntityOut[]`
  - `requireBlock<K extends keyof ReportV1['blocks']>(r: ReportV1, name: K): NonNullable<ReportV1['blocks'][K]>`
  - `localPlayerId(r: ReportV1): number`
  - `commanderId(r: ReportV1): number | null`

- [ ] **Step 1: Write the failing tests**

Create `tests/shared/report.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
    decodeSeries, entityById, squadMembers, enemyPlayers,
    requireBlock, localPlayerId, commanderId,
} from '../../src/shared/report';
import { loadNativeFixture } from './oracle';
import type { SeriesOut, ReportV1 } from '@axiapps/axilog/types';

describe('decodeSeries', () => {
    it('passes raw series through', () => {
        const s = { interval_ms: 1000, len: 3, enc: 'raw', data: [1, 2, 3] } as SeriesOut;
        expect(decodeSeries(s)).toEqual([1, 2, 3]);
    });

    it('expands rle runs', () => {
        const s = { interval_ms: 1000, len: 5, enc: 'rle', data: [[0, 3], [7, 2]] } as SeriesOut;
        expect(decodeSeries(s)).toEqual([0, 0, 0, 7, 7]);
    });

    it('expands a single-run rle series', () => {
        const s = { interval_ms: 1000, len: 4, enc: 'rle', data: [[9, 4]] } as SeriesOut;
        expect(decodeSeries(s)).toEqual([9, 9, 9, 9]);
    });

    it('throws when the decoded length disagrees with len', () => {
        const s = { interval_ms: 1000, len: 5, enc: 'rle', data: [[1, 2]] } as SeriesOut;
        expect(() => decodeSeries(s)).toThrow(/expected 5/);
    });

    it('decodes every series in the real fixture to its declared length', () => {
        const r = loadNativeFixture();
        const series = requireBlock(r, 'series');
        for (const [id, e] of Object.entries(series.by_entity)) {
            expect(decodeSeries(e.damage).length, `entity ${id} damage`).toBe(e.damage.len);
            expect(decodeSeries(e.damage_taken).length, `entity ${id} taken`).toBe(e.damage_taken.len);
        }
    });
});

describe('requireBlock', () => {
    it('returns a present block', () => {
        expect(requireBlock(loadNativeFixture(), 'damage')).toBeDefined();
    });

    it('throws with the coverage state when a block was not computed', () => {
        const r = { blocks: {}, coverage: { missiles: 'not_computed' } } as unknown as ReportV1;
        expect(() => requireBlock(r, 'missiles')).toThrow(/missiles.*not_computed/);
    });
});

describe('entity helpers', () => {
    it('indexes every entity by id', () => {
        const r = loadNativeFixture();
        const map = entityById(r);
        expect(map.size).toBe(r.entities.length);
        expect(map.get(r.entities[0].id)).toBe(r.entities[0]);
    });

    it('partitions players by role', () => {
        const r = loadNativeFixture();
        expect(squadMembers(r).every(e => e.role === 'squad')).toBe(true);
        expect(enemyPlayers(r).every(e => e.role === 'enemy_player')).toBe(true);
        expect(squadMembers(r).length).toBeGreaterThan(0);
    });

    it('resolves the local player from encounter.recorded_by', () => {
        const r = loadNativeFixture();
        expect(entityById(r).has(localPlayerId(r))).toBe(true);
    });

    it('resolves the commander, or null when the fight had none', () => {
        const r = loadNativeFixture();
        const id = commanderId(r);
        if (id !== null) expect(entityById(r).get(id)!.commander).toBeDefined();
    });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/shared/report.test.ts --maxWorkers=2`
Expected: FAIL — cannot resolve `../../src/shared/report`.

- [ ] **Step 3: Implement**

Create `src/shared/report.ts`:

```ts
// src/shared/report.ts
//
// The primitives every native-format consumer needs. axilog ships the
// types but no JS runtime helpers, so the RLE decoder and the coverage
// guard live here rather than being re-derived per module.
import type {
    ReportV1, EntityOut, SeriesOut, CoverageState,
} from '@axiapps/axilog/types';

export type { ReportV1, EntityOut, SeriesOut, CoverageState };

/**
 * Expand one of the format's series envelopes.
 *
 * `enc` is `'raw'` (a plain value array) or `'rle'` (`[value, runLength]`
 * pairs), chosen per series by whichever serializes smaller. `len` is the
 * DECODED length in both cases -- NOT `data.length` -- which is why this
 * validates after decoding rather than trusting either.
 */
export function decodeSeries(s: SeriesOut): number[] {
    let out: number[];
    if (s.enc === 'raw') {
        out = s.data as number[];
    } else {
        out = [];
        for (const pair of s.data as [number, number][]) {
            const [value, run] = pair;
            for (let i = 0; i < run; i++) out.push(value);
        }
    }
    if (out.length !== s.len) {
        throw new Error(
            `decodeSeries: expected ${s.len} samples, decoded ${out.length} (enc=${s.enc})`,
        );
    }
    return out;
}

export function entityById(r: ReportV1): Map<number, EntityOut> {
    return new Map(r.entities.map(e => [e.id, e]));
}

export function squadMembers(r: ReportV1): EntityOut[] {
    return r.entities.filter(e => e.role === 'squad');
}

export function enemyPlayers(r: ReportV1): EntityOut[] {
    return r.entities.filter(e => e.role === 'enemy_player');
}

/**
 * Fetch a block, or throw.
 *
 * Per the migration spec, a block this app reads whose coverage is
 * `not_computed` is a hard failure: it means the parse options drifted
 * from what the code expects, and rendering a zero would silently report
 * "measured, and it was nothing".
 */
export function requireBlock<K extends keyof ReportV1['blocks']>(
    r: ReportV1,
    name: K,
): NonNullable<ReportV1['blocks'][K]> {
    const block = r.blocks[name];
    if (block === undefined) {
        const state: CoverageState | undefined = r.coverage[name as string];
        throw new Error(
            `axilog report is missing the "${String(name)}" block (coverage: ${state ?? 'absent'})`,
        );
    }
    return block as NonNullable<ReportV1['blocks'][K]>;
}

/**
 * The recording player's entity id.
 *
 * `encounter.recorded_by` is an entity id, not a name -- so unlike the EI
 * path there is no `recordedAccountBy`/`recordedBy`/heuristic ladder.
 * Falls back to the first squad member only when the log carries no
 * recorder at all.
 */
export function localPlayerId(r: ReportV1): number {
    if (typeof r.encounter.recorded_by === 'number') return r.encounter.recorded_by;
    const first = squadMembers(r)[0];
    if (!first) throw new Error('axilog report has no squad members and no recorded_by');
    return first.id;
}

/** The commander's entity id, or null when nobody held a tag. */
export function commanderId(r: ReportV1): number | null {
    return r.entities.find(e => e.commander)?.id ?? null;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run tests/shared/report.test.ts --maxWorkers=2`
Expected: all passing.

- [ ] **Step 5: Add the coverage-drift guard**

Create `tests/shared/coverage.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { loadNativeFixture } from './oracle';

/**
 * The drift guard. This app requests explicit parse flags rather than
 * `everything: true`, so it must fail loudly if axilog ever moves a
 * surface it reads behind a new gate.
 */
const BLOCKS_THIS_APP_READS = [
    'damage', 'defenses', 'cc', 'boons', 'support',
    'contribution', 'healing', 'rotation', 'replay', 'series',
] as const;

describe('parse-option coverage', () => {
    it.each(BLOCKS_THIS_APP_READS)('computes the %s block', (block) => {
        expect(loadNativeFixture().coverage[block]).toBe('present');
    });
});
```

- [ ] **Step 6: Run it**

Run: `npx vitest run tests/shared/coverage.test.ts --maxWorkers=2`
Expected: 10 passing. A failure here means `PARSE_OPTS` in `tests/shared/oracle.ts` is missing a flag.

- [ ] **Step 7: Commit**

```bash
git add src/shared/report.ts tests/shared/report.test.ts tests/shared/coverage.test.ts
git commit -m "feat(shared): add native-format primitives and the coverage drift guard"
```

---

### Task 3: `extract/identity.ts` — the migration template

This task establishes the pattern every later extract task repeats. Read it in full even if you are assigned a later task.

**Files:**
- Create: `src/shared/extract/identity.ts`
- Create: `tests/shared/extract/identity.test.ts`

**Interfaces:**
- Consumes: `report.ts`'s `entityById`, `localPlayerId`, `commanderId`, `squadMembers`.
- Produces:
  ```ts
  export interface Identity {
      playerName: string; accountName: string;
      profession: string; eliteSpec: string;
      isCommander: boolean; group: number;
  }
  export function extractIdentity(r: ReportV1, id: number): Identity
  ```

- [ ] **Step 1: Write the failing oracle test**

Create `tests/shared/extract/identity.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { extractIdentity } from '../../../src/shared/extract/identity';
import { localPlayerId } from '../../../src/shared/report';
import { loadEiFixture, loadNativeFixture } from '../oracle';

describe('extractIdentity', () => {
    it('matches the EI oracle for the local player', () => {
        const ei = loadEiFixture();
        const native = loadNativeFixture();

        // The EI side, computed the way findLocalPlayer does today.
        const eiPlayer =
            ei.players.find(p => p.account === ei.recordedAccountBy) ??
            ei.players.find(p => p.name === ei.recordedBy)!;

        const actual = extractIdentity(native, localPlayerId(native));

        expect(actual.accountName).toBe(eiPlayer.account);
        expect(actual.playerName).toBe(eiPlayer.name);
        expect(actual.profession).toBe(eiPlayer.profession);
        expect(actual.eliteSpec).toBe(eiPlayer.elite_spec);
        expect(actual.group).toBe(eiPlayer.group);
        expect(actual.isCommander).toBe(eiPlayer.hasCommanderTag);
    });

    it('matches the EI oracle for every squad member', () => {
        const ei = loadEiFixture();
        const native = loadNativeFixture();
        for (const e of native.entities.filter(x => x.role === 'squad')) {
            const eiPlayer = ei.players.find(p => p.account === e.account);
            expect(eiPlayer, `no EI player for ${e.account}`).toBeDefined();
            const actual = extractIdentity(native, e.id);
            expect(actual.profession).toBe(eiPlayer!.profession);
            expect(actual.group).toBe(eiPlayer!.group);
        }
    });

    it('throws on an unknown entity id rather than returning blanks', () => {
        expect(() => extractIdentity(loadNativeFixture(), 999_999)).toThrow(/999999/);
    });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/shared/extract/identity.test.ts --maxWorkers=2`
Expected: FAIL — cannot resolve the module.

- [ ] **Step 3: Implement**

Create `src/shared/extract/identity.ts`:

```ts
// src/shared/extract/identity.ts
import type { ReportV1 } from '../report';
import { entityById } from '../report';

export interface Identity {
    playerName: string;
    accountName: string;
    profession: string;
    eliteSpec: string;
    isCommander: boolean;
    group: number;
}

/**
 * Identity for one entity.
 *
 * Native carries identity on `entities[]` and nothing else -- no
 * `isFake`/`notInSquad` booleans to reconcile, and `elite_spec` is an
 * empty string (never a numeric id) when the agent has none.
 */
export function extractIdentity(r: ReportV1, id: number): Identity {
    const e = entityById(r).get(id);
    if (!e) throw new Error(`extractIdentity: no entity with id ${id}`);
    return {
        playerName: e.character ?? e.name ?? '',
        accountName: e.account ?? '',
        profession: e.profession ?? '',
        eliteSpec: e.elite_spec ?? '',
        isCommander: e.commander !== undefined,
        group: e.subgroup ?? 0,
    };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run tests/shared/extract/identity.test.ts --maxWorkers=2`
Expected: 3 passing.

If the `isCommander` assertion fails: native's `commander` is present whenever a tag was *detected*, and EI's `hasCommanderTag` can disagree on a player who tagged mid-fight. If so, assert instead that the set of commander entities is a superset of EI's, and record the difference in `docs/superpowers/specs/2026-08-18-axilog-migration-design.md` under "Accepted risks".

- [ ] **Step 5: Commit**

```bash
git add src/shared/extract/identity.ts tests/shared/extract/identity.test.ts
git commit -m "feat(extract): migrate identity to the native format"
```

---

### Task 4: `extract/damage.ts`

**Files:**
- Create: `src/shared/extract/damage.ts`
- Create: `tests/shared/extract/damage.test.ts`
- Reference: `src/shared/dashboardMetrics.ts`, `src/shared/combatMetrics.ts` (the EI implementations being replaced)

**Interfaces:**
- Consumes: `report.ts`; `catalogs.skills` for icons and names.
- Produces: `export function extractDamage(r: ReportV1, id: number): DamageStats` where `DamageStats` is the **existing frozen** interface from `src/shared/types.ts` — `{ totalDamage, dps, breakbarDamage, downContribution, topSkills: SkillDamage[] }`.

**Native paths:**
- `totalDamage` ← `blocks.damage.by_entity[id].total`
- `dps` ← `blocks.damage.by_entity[id].dps`
- `breakbarDamage` ← `blocks.damage.by_entity[id].breakbar_damage_dealt`
- `downContribution` ← `blocks.contribution.by_entity[id].downs_contribution.damage`
- `topSkills` ← `blocks.damage.by_entity[id].by_skill` (keyed by skill id), joined to `catalogs.skills[skillId].{name,icon}`, with each skill's `downContribution` ← `blocks.contribution.by_entity[id].downs_contribution_by_skill[skillId] ?? 0`

- [ ] **Step 1: Write the failing oracle test**

Create `tests/shared/extract/damage.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { extractDamage } from '../../../src/shared/extract/damage';
import { localPlayerId } from '../../../src/shared/report';
import { loadEiFixture, loadNativeFixture } from '../oracle';

function eiLocal(ei: ReturnType<typeof loadEiFixture>) {
    return ei.players.find(p => p.account === ei.recordedAccountBy)
        ?? ei.players.find(p => p.name === ei.recordedBy)!;
}

describe('extractDamage', () => {
    it('matches the EI oracle on damage totals', () => {
        const ei = loadEiFixture();
        const native = loadNativeFixture();
        const p = eiLocal(ei);
        const actual = extractDamage(native, localPlayerId(native));

        // Two engines counting the same events: allow 1% drift, not 0.
        expect(actual.totalDamage).toBeGreaterThan(0);
        expect(Math.abs(actual.totalDamage - p.dpsAll[0].damage) / p.dpsAll[0].damage)
            .toBeLessThan(0.01);
        expect(Math.abs(actual.breakbarDamage - p.dpsAll[0].breakbarDamage))
            .toBeLessThan(Math.max(1, p.dpsAll[0].breakbarDamage * 0.01));
    });

    it('reports dps consistent with its own total and the duration', () => {
        const native = loadNativeFixture();
        const actual = extractDamage(native, localPlayerId(native));
        const expected = actual.totalDamage / (native.encounter.duration_ms / 1000);
        expect(Math.abs(actual.dps - expected) / expected).toBeLessThan(0.01);
    });

    it('reports down contribution as the damage slice, documented as a narrowing', () => {
        const ei = loadEiFixture();
        const native = loadNativeFixture();
        const p = eiLocal(ei);
        const actual = extractDamage(native, localPlayerId(native));
        // Native splits contribution four ways; EI's single number is the
        // damage slice. This asserts the documented RELATIONSHIP, not
        // equality -- see the spec's "Accepted risks".
        expect(actual.downContribution).toBeLessThanOrEqual(p.statsAll[0].downContribution * 1.01);
        expect(actual.downContribution).toBeGreaterThan(0);
    });

    it('names and orders top skills', () => {
        const native = loadNativeFixture();
        const actual = extractDamage(native, localPlayerId(native));
        expect(actual.topSkills.length).toBeGreaterThan(0);
        expect(actual.topSkills.every(s => s.name.length > 0)).toBe(true);
        for (let i = 1; i < actual.topSkills.length; i++) {
            expect(actual.topSkills[i - 1].damage).toBeGreaterThanOrEqual(actual.topSkills[i].damage);
        }
    });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/shared/extract/damage.test.ts --maxWorkers=2`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/shared/extract/damage.ts`:

```ts
// src/shared/extract/damage.ts
import type { ReportV1 } from '../report';
import { requireBlock } from '../report';
import type { DamageStats, SkillDamage } from '../types';

const TOP_SKILL_COUNT = 8;

export function extractDamage(r: ReportV1, id: number): DamageStats {
    const damage = requireBlock(r, 'damage').by_entity[String(id)];
    if (!damage) throw new Error(`extractDamage: no damage row for entity ${id}`);
    const contribution = requireBlock(r, 'contribution').by_entity[String(id)];
    const bySkill = damage.by_skill ?? {};
    const downBySkill = contribution?.downs_contribution_by_skill ?? {};

    const topSkills: SkillDamage[] = Object.entries(bySkill)
        .map(([skillId, row]): SkillDamage => {
            const def = r.catalogs.skills[skillId];
            return {
                id: Number(skillId),
                name: def?.name ?? `Skill ${skillId}`,
                icon: def?.icon,
                damage: row.total,
                hits: row.hits,
                downContribution: downBySkill[skillId] ?? 0,
                downedHealing: 0,
            };
        })
        .sort((a, b) => b.damage - a.damage)
        .slice(0, TOP_SKILL_COUNT);

    return {
        totalDamage: damage.total,
        dps: damage.dps,
        breakbarDamage: damage.breakbar_damage_dealt,
        // Native splits down contribution four ways (damage / cc / strips /
        // movement_impairing). EI reported one number, which corresponds to
        // the damage slice; the UI's label is "down contribution" and the
        // damage slice is what it always meant.
        downContribution: contribution?.downs_contribution.damage ?? 0,
        topSkills,
    };
}
```

Check `row.hits` against the real `SkillRow` field name first: `grep -n "export interface SkillRow" -A 20 node_modules/@axiapps/axilog/types.d.ts`. Use whatever that names the connected-hit count.

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run tests/shared/extract/damage.test.ts --maxWorkers=2`
Expected: 4 passing.

- [ ] **Step 5: Commit**

```bash
git add src/shared/extract/damage.ts tests/shared/extract/damage.test.ts
git commit -m "feat(extract): migrate damage to the native format"
```

---

### Task 5: `extract/defense.ts`

**Files:**
- Create: `src/shared/extract/defense.ts`
- Create: `tests/shared/extract/defense.test.ts`

**Interfaces:**
- Produces: `export function extractDefense(r: ReportV1, id: number): DefenseStats` — the frozen interface from `src/shared/types.ts`.

**Native paths** (all under `blocks.defenses.by_entity[id]` unless noted):

| `DefenseStats` field | Native path |
|---|---|
| `damageTaken` | `blocks.damage.by_entity[id].taken` |
| `deaths` | `deaths` |
| `downs` | `downs_taken` |
| `dodges` | `dodge_count` |
| `blocked` | `blocked_count` |
| `evaded` | `evaded_count` |
| `missed` | `missed_count` |
| `invulned` | `invulned_count` |
| `interrupted` | `interrupted_count` |
| `incomingCC` | `received_cc_count` |
| `incomingStrips` | `boon_strips_taken` |
| `deathTimes` | `blocks.replay.by_entity[id].dead[].0` |
| `downTimes` | `blocks.replay.by_entity[id].down[].0` |
| `topDamageTakenSkills` | `blocks.damage.by_entity[id].by_skill_taken`, joined to `catalogs.skills` |

- [ ] **Step 1: Write the failing oracle test**

Create `tests/shared/extract/defense.test.ts`. It needs the same local-player helper Task 4 defined — repeat it rather than importing across test files:

```ts
function eiLocal(ei: ReturnType<typeof loadEiFixture>) {
    return ei.players.find(p => p.account === ei.recordedAccountBy)
        ?? ei.players.find(p => p.name === ei.recordedBy)!;
}
```

Assert each scalar against the EI local player's `defenses[0]` counterpart with the same 1% tolerance pattern as Task 4, plus:

```ts
    it('reads death and down times from the replay intervals', () => {
        const native = loadNativeFixture();
        const ei = loadEiFixture();
        const p = eiLocal(ei);
        const actual = extractDefense(native, localPlayerId(native));
        expect(actual.deathTimes.length).toBe(actual.deaths);
        expect(actual.downTimes.length).toBe(actual.downs);
        // Every interval start must fall inside the fight.
        for (const t of [...actual.deathTimes, ...actual.downTimes]) {
            expect(t).toBeGreaterThanOrEqual(0);
            expect(t).toBeLessThanOrEqual(native.encounter.duration_ms);
        }
        expect(actual.deaths).toBe(p.defenses[0].deadCount);
    });
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/shared/extract/defense.test.ts --maxWorkers=2`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Write `src/shared/extract/defense.ts` following Task 4's shape: `requireBlock(r, 'defenses')`, `requireBlock(r, 'damage')`, `requireBlock(r, 'replay')`, index each `by_entity[String(id)]`, throw on a missing row, and map exactly the table above. `deathTimes`/`downTimes` take element `[0]` of each `[start, end]` interval pair. Reuse Task 4's top-skill mapping shape for `topDamageTakenSkills`, reading `by_skill_taken`.

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run tests/shared/extract/defense.test.ts --maxWorkers=2`
Expected: all passing.

- [ ] **Step 5: Commit**

```bash
git add src/shared/extract/defense.ts tests/shared/extract/defense.test.ts
git commit -m "feat(extract): migrate defense to the native format"
```

---

### Task 6: `extract/support.ts`

**Files:**
- Create: `src/shared/extract/support.ts`
- Create: `tests/shared/extract/support.test.ts`

**Interfaces:**
- Produces: `export function extractSupport(r: ReportV1, id: number): SupportStats` — the frozen interface.

**Native paths:**

| `SupportStats` field | Native path |
|---|---|
| `boonStrips` | `blocks.support.by_entity[id].strips` |
| `cleanses` | `blocks.support.by_entity[id].cleanses` |
| `cleanseSelf` | `blocks.support.by_entity[id].cleanses_self` |
| `healingOutput` | `blocks.healing.by_entity[id].outgoing_allies` |
| `barrierOutput` | `blocks.healing.by_entity[id].barrier_out` |
| `stabilityGeneration` | `blocks.boons.by_entity[id]['1122'].generation.squad_pct` |
| `topHealingSkills` | `blocks.healing.by_entity[id].detail.by_skill` → `catalogs.skills` |
| `topBarrierSkills` | `blocks.healing.by_entity[id].detail.barrier_by_skill` → `catalogs.skills` |

`HealSkillRow` has `total`, `total_downed?` (omitted when zero — read absent as 0), `hits`, `min`, `max`, `indirect`. Map `total` → `SkillDamage.damage`, `total_downed ?? 0` → `downedHealing`, `hits` → `hits`, `0` → `downContribution`.

Stability's buff id is already defined as `STABILITY_BUFF_ID` in `src/shared/boonPerformance.ts` — import it rather than hardcoding `1122`.

- [ ] **Step 1: Write the failing oracle test**

Assert `boonStrips`/`cleanses`/`cleanseSelf` against the EI player's `support[0]` counterparts with exact equality (these are integer event counts, not derived floats), and `healingOutput`/`barrierOutput` against `extHealingStats.outgoingHealingAllies[0]` / `extBarrierStats.outgoingBarrierAllies[0]` summed, at 1% tolerance. Assert both top-skill lists are non-empty, descending by `damage`, and fully named.

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/shared/extract/support.test.ts --maxWorkers=2`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Write `src/shared/extract/support.ts` per the table. `detail` is optional on `HealingEntity` — absence means "the pass did not run", so throw with that wording rather than returning empty lists, since this app always requests `skillDamage`.

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run tests/shared/extract/support.test.ts --maxWorkers=2`
Expected: all passing.

- [ ] **Step 5: Commit**

```bash
git add src/shared/extract/support.ts tests/shared/extract/support.test.ts
git commit -m "feat(extract): migrate support to the native format"
```

---

### Task 7: `extract/boons.ts`

**Files:**
- Create: `src/shared/extract/boons.ts`
- Create: `tests/shared/extract/boons.test.ts`
- Modify: `src/shared/boonData.ts` (signature change)
- Modify: `src/shared/boonPerformance.ts` (signature change + rekeying)

**Interfaces:**
- Produces: `export function extractBoons(r: ReportV1, id: number): BoonStats` — `{ uptimes, generation, boonPerformance }`, all frozen interfaces.

**Native paths** (`blocks.boons.by_entity[id][buffId]`):
- `BoonUptimeEntry.uptime` ← `uptime_pct` for duration-stacking buffs, `avg_stacks` for intensity-stacking. Read `catalogs.buffs[buffId].stacking` to choose — do **not** infer from the id.
- `BoonUptimeEntry.name` ← `catalogs.buffs[buffId].name`; `stacking` ← `catalogs.buffs[buffId].stacking`.
- `BoonGenerationEntry.{selfGeneration,groupGeneration,squadGeneration}` ← `generation.{self_pct,group_pct,squad_pct}` (this replaces EI's three separate `selfBuffs`/`groupBuffs`/`squadBuffs` arrays).

**The rekeying, and why it matters:** EI's `statesPerSource` is keyed by **character name**; native's `per_source` is keyed by **entity id**. `boonPerformance.ts` currently builds `BoonPerfPartyMember.key` from an account string. Change it to build from the entity id and derive `displayName` from `entityById(r).get(sourceId)!.account!.split('.')[0]`. Two players sharing a character name collided under EI and cannot under native — that is a fix, not a regression, and the oracle test must tolerate it.

- [ ] **Step 1: Write the failing oracle test**

Assert, for the local player, that every boon id present in EI's `buffUptimes` is present in native's `blocks.boons.by_entity[id]`, and that duration-stacking uptimes agree within 1 percentage point while intensity-stacking average stacks agree within 0.1. Then assert `boonPerformance.stability` and `.might` are non-null with `partyMembers.length > 0` and every member's `stacks`, `deaths`, `distances` arrays the same length as `buckets`.

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/shared/extract/boons.test.ts --maxWorkers=2`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Write `src/shared/extract/boons.ts`, then update `boonData.ts` and `boonPerformance.ts` to take `(r: ReportV1, id: number)`. Keep the existing bucket arithmetic in `boonPerformance.ts` unchanged — only its inputs move.

- [ ] **Step 4: Run the boon suites**

Run: `npx vitest run tests/shared/extract/boons.test.ts tests/shared/boonData.test.ts tests/shared/boonPerformance.test.ts --maxWorkers=2`
Expected: all passing. The two pre-existing suites will need their EI-shaped fixtures replaced with `loadNativeFixture()` — do that as part of this step.

- [ ] **Step 5: Commit**

```bash
git add src/shared/extract/boons.ts src/shared/boonData.ts src/shared/boonPerformance.ts tests/shared/extract/boons.test.ts tests/shared/boonData.test.ts tests/shared/boonPerformance.test.ts
git commit -m "feat(extract): migrate boons to the native format, rekeying per-source by entity id"
```

---

### Task 8: `extract/timeline.ts`

**Files:**
- Create: `src/shared/extract/timeline.ts`
- Create: `tests/shared/extract/timeline.test.ts`
- Modify: `src/shared/timelineData.ts` (signature change)

**Interfaces:**
- Produces: `export function extractTimeline(r: ReportV1, id: number, bucketSizeMs: number): TimelineData` — the frozen interface.

**Native paths** (`blocks.series.by_entity[id]`, every `SeriesOut` through `decodeSeries`):

| `TimelineData` field | Native path |
|---|---|
| `damageDealt` | `damage` |
| `damageTaken` | `damage_taken` |
| `incomingHealing` | `healing_received_1s` — **new in axilog 1.1.0** |
| `incomingBarrier` | `barrier_received_1s` — **new in axilog 1.1.0** |
| `healthPercent` | `health_percents` (a step-function pair list, NOT a `SeriesOut` — do not decode it) |
| `distanceToTag` | computed from `blocks.replay.tracks` — the local player's samples against the commander's, per sample index |
| `offensiveBoons` / `defensiveBoons` / `hardCC` / `softCC` | `blocks.boons.by_entity[id][buffId].states`, filtered by the id sets already in `src/shared/boonData.ts` |
| `deathEvents` / `downEvents` | `blocks.replay.by_entity[id].{dead,down}[].0` |

`healing_received_1s` and `barrier_received_1s` are **cumulative**. EI's `healingReceived1S` was cumulative too and `extractDamageTimeline` already differences it — verify that by reading `src/shared/timelineData.ts` before assuming.

- [ ] **Step 1: Write the failing oracle test**

Assert `damageDealt` and `damageTaken` bucket sums are within 1% of the EI-derived series, that `incomingHealing`'s final cumulative value is within 1% of EI's `healingReceived1S[0]` last element, that every returned series has the same bucket count, and that `healthPercent` is non-empty and monotonic in time.

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/shared/extract/timeline.test.ts --maxWorkers=2`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Write `src/shared/extract/timeline.ts`, and port `distanceToTag` from `extractDistanceToTagTimeline` in `timelineData.ts`. **Preserve the runback exclusion** documented in `extractPlayerData.ts`'s `computeDistanceToTagStats`: after a death, keep excluding samples until distance returns to within 50% of the pre-death value, floor 400 units. Read that function before writing this one.

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run tests/shared/extract/timeline.test.ts tests/shared/timelineData.test.ts --maxWorkers=2`
Expected: all passing.

- [ ] **Step 5: Commit**

```bash
git add src/shared/extract/timeline.ts src/shared/timelineData.ts tests/shared/extract/timeline.test.ts tests/shared/timelineData.test.ts
git commit -m "feat(extract): migrate the timeline to the native format"
```

---

### Task 9: `extract/movement.ts`

**Files:**
- Create: `src/shared/extract/movement.ts`
- Create: `tests/shared/extract/movement.test.ts`
- Modify: `src/shared/wvwTiles.ts`, `src/shared/mapUtils.ts`

**Interfaces:**
- Produces: `export function extractMovement(r: ReportV1, id: number): MovementData | null` — the frozen interface.

**Native paths:**
- `members[].positions` ← `blocks.replay.tracks` per entity.
- `members[].{downRanges,deadRanges}` ← `blocks.replay.by_entity[id].{down,dead}`.
- `members[].boonStates` ← `blocks.boons.by_entity[id][buffId].states`.
- `members[].healthPercents` ← `blocks.series.by_entity[id].health_percents`.
- `members[].skillCasts` ← `blocks.rotation.by_entity[id]` (a flat, time-ordered `CastRow[]` — no per-skill grouping to flatten).
- `pollingRate` ← `blocks.replay.tracks`' sample interval.
- `inchToPixel` — **derive from `blocks.replay.arena`**, do not look for an EI field:
  ```ts
  const sx = arena.image_width / (arena.world_max_x - arena.world_min_x);
  const sy = arena.image_height / (arena.world_max_y - arena.world_min_y);
  ```
  Positions are raw world inches. Project with the formula in `arena`'s doc comment, remembering world y grows northward and image y grows downward:
  ```ts
  const px = (x - a.world_min_x) / (a.world_max_x - a.world_min_x) * a.image_width;
  const py = (1 - (y - a.world_min_y) / (a.world_max_y - a.world_min_y)) * a.image_height;
  ```

- [ ] **Step 1: Write the failing oracle test**

Assert the member count matches the squad+enemy roster, that every member's `positions` array is the same length (one polling grid), that projecting the commander's first position with the `arena` formula lands inside `[0, image_width] × [0, image_height]`, and that `skillCasts` is time-ordered.

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/shared/extract/movement.test.ts --maxWorkers=2`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Write `src/shared/extract/movement.ts`, then update `wvwTiles.ts` and `mapUtils.ts` to consume `arena` instead of reverse-engineering `combatReplayMetaData`. Switch landmark and tile lookup from display-name matching to `encounter.map_id` where `wvwLandmarks.ts` allows it.

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run tests/shared/extract/movement.test.ts tests/shared/mapUtils.test.ts tests/shared/wvwLandmarks.test.ts --maxWorkers=2`
Expected: all passing.

- [ ] **Step 5: Commit**

```bash
git add src/shared/extract/movement.ts src/shared/wvwTiles.ts src/shared/mapUtils.ts tests/shared/extract/movement.test.ts tests/shared/mapUtils.test.ts tests/shared/wvwLandmarks.test.ts
git commit -m "feat(extract): migrate movement to the native replay block and arena rect"
```

---

### Task 10: `extract/composition.ts` and squad ranks

**Files:**
- Create: `src/shared/extract/composition.ts`
- Create: `tests/shared/extract/composition.test.ts`
- Modify: `src/shared/classifyRole.ts`

**Interfaces:**
- Produces:
  - `export function extractComposition(r: ReportV1): FightComposition`
  - `export function extractSquadContext(r: ReportV1, id: number): SquadContext`

Both are frozen interfaces.

**Native paths:**
- `squadCount` ← `entities.filter(e => e.role === 'squad').length`
- `allyCount` ← `role === 'friendly_player'`
- `enemyCount` ← `role === 'enemy_player'`
- `teamBreakdown` ← group enemies by `entities[].team`, top 3 descending
- `squadClassCounts` / `allyClassCounts` / `enemyClassCountsByTeam` ← count `elite_spec || profession` per role
- `SquadContext.*Rank` ← rank the local player among `role === 'squad'` entities on the block field each rank names: `damage.total`, `contribution.downs_contribution.damage`, `support.strips`, `support.cleanses`, `healing.outgoing_allies`, `damage.taken`

This deletes the `isFake`/`notInSquad`/`enemyPlayer`/`teamID`-vs-`teamId` reconciliation entirely — `role` and `team` are unambiguous.

- [ ] **Step 1: Write the failing oracle test**

Assert `squadCount` equals the EI count of `!isFake && !notInSquad` players, `enemyCount` equals EI's `enemyPlayer` targets, `teamBreakdown` has at most 3 entries in descending count order, and every rank is in `[1, squadCount]`.

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/shared/extract/composition.test.ts --maxWorkers=2`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Write `src/shared/extract/composition.ts` and update `classifyRole.ts` to take `(r: ReportV1, id: number)`.

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run tests/shared/extract/composition.test.ts tests/shared/fightComposition.test.ts tests/shared/classifyRole.test.ts --maxWorkers=2`
Expected: all passing.

- [ ] **Step 5: Commit**

```bash
git add src/shared/extract/composition.ts src/shared/classifyRole.ts tests/shared/extract/composition.test.ts tests/shared/fightComposition.test.ts tests/shared/classifyRole.test.ts
git commit -m "feat(extract): migrate fight composition and squad ranks to entity roles"
```

---

### Task 11: Recompose `extractPlayerData` and delete the EI types

**Files:**
- Modify: `src/shared/extractPlayerData.ts` (426 lines → a thin composer)
- Modify: `src/shared/types.ts` (delete lines 1-95)
- Modify: `tests/shared/extractPlayerData.test.ts`
- Delete: `src/shared/dashboardMetrics.ts`, `src/shared/combatMetrics.ts` if fully absorbed (check with grep first)

**Interfaces:**
- Consumes: every `extract/*` function from Tasks 3-10.
- Produces: `export function extractPlayerData(r: ReportV1, fightNumber: number): PlayerFightData` — **the same return type as today.**

- [ ] **Step 1: Write the failing test**

Rewrite `tests/shared/extractPlayerData.test.ts` to call `extractPlayerData(loadNativeFixture(), 1)` and assert every top-level field of `PlayerFightData` is populated:

```ts
import { describe, it, expect } from 'vitest';
import { extractPlayerData } from '../../src/shared/extractPlayerData';
import { loadNativeFixture } from './oracle';

describe('extractPlayerData', () => {
    it('produces a fully populated PlayerFightData', () => {
        const d = extractPlayerData(loadNativeFixture(), 1);
        expect(d.playerName.length).toBeGreaterThan(0);
        expect(d.accountName.length).toBeGreaterThan(0);
        expect(d.profession.length).toBeGreaterThan(0);
        expect(d.duration).toBeGreaterThan(0);
        expect(d.durationFormatted).toMatch(/^\d+:\d{2}$/);
        expect(d.damage.totalDamage).toBeGreaterThan(0);
        expect(d.damage.topSkills.length).toBeGreaterThan(0);
        expect(d.support.boonStrips).toBeGreaterThanOrEqual(0);
        expect(d.defense.damageTaken).toBeGreaterThan(0);
        expect(d.boons.uptimes.length).toBeGreaterThan(0);
        expect(d.timeline.damageDealt.length).toBeGreaterThan(0);
        expect(d.timeline.incomingHealing.length).toBeGreaterThan(0);
        expect(d.squadContext.squadSize).toBeGreaterThan(0);
        expect(d.fightComposition.squadCount).toBeGreaterThan(0);
        expect(d.movementData).not.toBeNull();
        expect(d.roleClassification).toBeDefined();
    });

    it('never reports -1 as a distance', () => {
        const d = extractPlayerData(loadNativeFixture(), 1);
        if (d.distanceToTag) {
            expect(d.distanceToTag.average).toBeGreaterThanOrEqual(0);
            expect(d.distanceToTag.median).toBeGreaterThanOrEqual(0);
        }
    });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/shared/extractPlayerData.test.ts --maxWorkers=2`
Expected: FAIL — `extractPlayerData` still expects an `EiJson`.

- [ ] **Step 3: Rewrite the composer**

Replace `extractPlayerData.ts`'s body with a function that resolves `localPlayerId(r)` once and calls each `extract/*` unit. Map `mapName` from `encounter.map`, `timestamp` from `encounter.started_at_unix` (**seconds** — multiply by 1000 for a `Date`, and handle its absence rather than defaulting to epoch zero), `duration` from `encounter.duration_ms`.

`distanceToTag` reads `blocks.replay.by_entity[id].dist_to_com` and must return `null` for both absent and `-1`.

- [ ] **Step 4: Delete the EI types**

Remove lines 1-95 of `src/shared/types.ts` (`EiPlayer`, `EiTarget`, `EiJson`). Keep everything from `SkillCast` onward byte-for-byte.

- [ ] **Step 5: Typecheck and run the full suite**

Run:
```bash
npm run typecheck
npx vitest run --maxWorkers=2
```
Expected: no type errors and a green suite. Any remaining `EiJson` reference is a module that was missed — migrate it now.

- [ ] **Step 6: Commit**

```bash
git add src/shared tests/shared
git commit -m "feat(shared): compose PlayerFightData from native extractors, delete the EI types"
```

---

### Task 12: Swap the parse path and delete Elite Insights

**Files:**
- Create: `src/main/axilogParser.ts`
- Create: `src/main/axilogWorker.ts`
- Modify: `src/main/index.ts`
- Delete: `src/main/eiParser.ts`, `src/main/handlers/eiHandlers.ts`
- Modify: `src/preload/index.ts`, `src/renderer/globals.d.ts`, `src/renderer/views/SettingsView.tsx`, `src/renderer/views/TroubleshootModal.tsx`, `src/renderer/app/AppLayout.tsx`
- Modify: `package.json` (drop `adm-zip`)
- Delete: `tests/fixtures/wvw.ei.json`

**Interfaces:**
- Produces: `export async function parseLog(logPath: string): Promise<ReportV1>` from `src/main/axilogParser.ts` — replacing `eiManager.parseLog(logPath, logId)` at `src/main/index.ts:200`, `:252` and `:370`.

- [ ] **Step 1: Write the failing integration test**

Create `tests/main/axilogParser.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import { parseInProcess } from '../../src/main/axilogParser';

describe('parseInProcess', () => {
    it('parses the fixture to a native report', async () => {
        const r = await parseInProcess(join(__dirname, '..', 'fixtures', 'wvw.zevtc'));
        expect(r.axilog).toBeDefined();
        expect(r.entities.length).toBeGreaterThan(0);
        expect(r.coverage.series).toBe('present');
    });

    it('rejects with a useful message on a missing file', async () => {
        await expect(parseInProcess('/nonexistent.zevtc')).rejects.toThrow();
    });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/main/axilogParser.test.ts --maxWorkers=2`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the worker and the parser**

Create `src/main/axilogWorker.ts` — the `utilityProcess` entry point. It owns one job: receive a path, parse, post the report back.

```ts
// src/main/axilogWorker.ts
//
// Runs in an Electron utilityProcess. parseFile is synchronous napi;
// calling it on the main thread freezes the window for the length of the
// parse, and a fight landing mid-session is exactly when that matters.
import { parseFile } from '@axiapps/axilog';

const PARSE_OPTS = {
    replay: true,
    skillDamage: true,
    timeseries: true,
    rotation: true,
} as const;

process.parentPort.on('message', (e) => {
    const { id, path } = e.data as { id: number; path: string };
    try {
        process.parentPort.postMessage({ id, ok: true, report: parseFile(path, PARSE_OPTS) });
    } catch (err) {
        process.parentPort.postMessage({ id, ok: false, error: String((err as Error)?.message ?? err) });
    }
});
```

Create `src/main/axilogParser.ts` exporting both `parseInProcess(path)` (a direct synchronous call, for tests) and `parseLog(path)` (the production path that round-trips through the `utilityProcess`, spawning it lazily and serialising requests by an incrementing id).

Keep `PARSE_OPTS` in exactly one place and export it, so `tests/shared/oracle.ts` can import it instead of duplicating the literal. Update `oracle.ts` to do that.

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run tests/main/axilogParser.test.ts --maxWorkers=2`
Expected: 2 passing.

- [ ] **Step 5: Rewire the main process**

In `src/main/index.ts`: delete the `EiManager` import, the `eiManager` variable, its construction at `:381`, the settings load at `:383-387`, the `registerEiHandlers` call at `:395`, and every `eiManager.isInstalled()` guard (`:171`, `:231`, `:360`). Replace the three `eiManager.parseLog(...)` calls with `parseLog(logPath)`. Delete `setParseProgressCallback` wiring — there is no progress to report on a 0.3s in-process parse.

- [ ] **Step 6: Delete the EI surface**

```bash
git rm src/main/eiParser.ts src/main/handlers/eiHandlers.ts tests/fixtures/wvw.ei.json
```

Then remove by hand:
- `src/preload/index.ts` lines 90-112 (the 15 `ei*` bindings).
- The matching entries in `src/renderer/globals.d.ts`.
- The EI install/update/uninstall/.NET/auto-manage sections of `src/renderer/views/SettingsView.tsx` (its state at `:89-95`, the handler at `:136`, and the re-check button at `:221`).
- The EI and .NET probes in `src/renderer/views/TroubleshootModal.tsx` (`:163`, `:178`).
- The `eiCheckDotnet` effect at `src/renderer/app/AppLayout.tsx:46`.
- `adm-zip` from `package.json`, then `npm install`.
- The `dev:dotnet-missing` and `dev:mock-win` scripts in `package.json` if they exist only to exercise the .NET install path.

Also update `tests/shared/oracle.ts` to drop `loadEiFixture` — nothing computes from EI any more.

- [ ] **Step 7: Full verification**

Run:
```bash
npm run typecheck
npx vitest run --maxWorkers=2
grep -rn "EiJson\|EiPlayer\|eiManager\|adm-zip\|elite" src/ package.json
npm run build
```
Expected: clean typecheck, green suite, **no output from the grep**, and a successful build.

- [ ] **Step 8: Manual smoke test**

Run `npm run dev`, drop a real `.zevtc` into the watched log directory, and confirm: the fight appears within about a second, Pulse shows non-zero damage / strips / boons, Timeline shows all six series including incoming healing and barrier, and the Map view draws positions with the commander centred. Confirm Settings no longer offers an EI or .NET section.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: parse logs in-process with axilog, remove Elite Insights"
```

---

## Done when

- `npm run typecheck` and `npx vitest run --maxWorkers=2` are green.
- `grep -rn "EiJson\|eiManager\|adm-zip" src/` returns nothing.
- A dropped `.zevtc` renders a complete Pulse, Timeline and Map without an EI install step or a .NET runtime.
- `npm run build:linux` and `npm run build:win` both succeed.
