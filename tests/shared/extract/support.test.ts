import { describe, it, expect } from 'vitest';
import { extractSupport } from '../../../src/shared/extract/support';
import { localPlayerId, requireBlock } from '../../../src/shared/report';
import { STABILITY_BUFF_ID } from '../../../src/shared/boonPerformance';
import type { ReportV1 } from '../../../src/shared/report';
import { loadEiFixture, loadNativeFixture, accountOf } from '../oracle';

function eiLocal(ei: ReturnType<typeof loadEiFixture>) {
    return ei.players.find(p => p.account === ei.recordedAccountBy)
        ?? ei.players.find(p => p.name === ei.recordedBy)!;
}

describe('extractSupport', () => {
    // Fix round 3, finding 5: every full-roster loop in this file filters
    // `native.entities` by `role === 'squad'` and collects mismatches into
    // an array asserted with `toEqual([])` (or `toEqual([<pinned accounts>])`).
    // If that filter ever returned zero entities (a fixture regression, a
    // wrong role string, an axilog schema change), every one of those
    // checks would pass vacuously -- 0 mismatches out of 0 entities looks
    // identical to 0 mismatches out of 46. This single guard, covering the
    // whole file, makes that failure mode loud instead of silent.
    it('has the full 46-member squad roster this file\'s full-roster tests assume', () => {
        const native = loadNativeFixture();
        expect(native.entities.filter(e => e.role === 'squad').length).toBe(46);
    });

    it('matches the EI oracle on integer event counts for the local player', () => {
        const ei = loadEiFixture();
        const native = loadNativeFixture();
        const p = eiLocal(ei);
        const actual = extractSupport(native, localPlayerId(native));
        const s = p.support[0];

        expect(actual.boonStrips).toBe(s.boonStrips);
        expect(actual.cleanses).toBe(s.condiCleanse);
        expect(actual.cleanseSelf).toBe(s.condiCleanseSelf);
    });

    // NOTE on `healingOutput`/`barrierOutput`: the brief's suggested oracle
    // (`extHealingStats.outgoingHealingAllies[0]` /
    // `extBarrierStats.outgoingBarrierAllies[0]`, summed) is unusable on
    // this fixture -- EI reports it as all-zero for every single player in
    // the 46-member roster (verified below, not assumed), even players with
    // large measured healing/barrier elsewhere in the same EI document.
    //
    // A working oracle for `healingOutput` DOES exist:
    // `extHealingStats.totalHealingDist` (EI's full outgoing total) minus
    // EI's own self-healing figure (`alliedHealingDist[selfIndex]`, summed)
    // -- see the dedicated `healingOutput`/`barrierOutput` oracle test
    // below, which matches native's `outgoing_allies` EXACTLY on all 46
    // squad members. An earlier round of this file compared native's
    // allies-only total against `alliedHealingDist`'s OWN sum (a
    // roster-limited per-ally breakdown, not "everyone but me") and found
    // an apparent 15/46 mismatch; that was a mis-specified oracle, not a
    // real disagreement -- both native and EI restrict `alliedHealingDist`
    // / `detail.by_ally` to the same limited friendlies roster, and agree
    // exactly on it (see `byAllyVsAlliedDistMismatches` below).
    it('confirms outgoingHealingAllies/outgoingBarrierAllies are unpopulated in this EI fixture', () => {
        const ei = loadEiFixture();
        const nonZero: string[] = [];
        for (const p of ei.players) {
            const sumH = p.extHealingStats?.outgoingHealingAllies?.[0]?.reduce((a, b) => a + b.healing, 0) ?? 0;
            const sumB = p.extBarrierStats?.outgoingBarrierAllies?.[0]?.reduce((a, b) => a + b.barrier, 0) ?? 0;
            if (sumH !== 0 || sumB !== 0) nonZero.push(p.account);
        }
        expect(nonZero, 'players with a nonzero outgoingHealingAllies/outgoingBarrierAllies sum').toEqual([]);
    });

    // NOTE: this test intentionally does NOT re-check `barrierOutput`
    // against `totalBarrierDist` -- that comparison, and its
    // `Anon178.7586` pin, live in the dedicated oracle test below
    // (`matches EI's (totalHealingDist - self) oracle on healingOutput...`)
    // and both tests fail together on any `barrierOutput` mutation, so a
    // duplicate copy here adds no kill power (fix round 3, finding 4). What
    // IS unique to this test: `outgoing_total` vs EI's `totalHealingDist`
    // directly (not routed through `extractSupport`, which has no field
    // exposing the raw total), and the `outgoing_allies + outgoing_self`
    // additive identity -- both would catch a fixture/axilog regeneration
    // that broke the native healing block's internal consistency, even if
    // `healingOutput`/`barrierOutput` themselves stayed accidentally
    // correct.
    it('matches the EI per-skill healing distribution total for every squad member', () => {
        const ei = loadEiFixture();
        const native = loadNativeFixture();

        for (const e of native.entities.filter(x => x.role === 'squad')) {
            const eiPlayer = ei.players.find(p => p.account === e.account);
            expect(eiPlayer, `no EI player for ${e.account}`).toBeDefined();
            const healing = requireBlock(native, 'healing').by_entity[String(e.id)];
            expect(healing, `no native healing row for ${e.account}`).toBeDefined();

            const eiHealingTotal = eiPlayer!.extHealingStats?.totalHealingDist?.[0]
                ?.reduce((a, b) => a + b.totalHealing, 0) ?? 0;

            if (eiHealingTotal === 0) {
                expect(healing!.outgoing_total).toBeLessThanOrEqual(1);
            } else {
                expect(Math.abs(healing!.outgoing_total - eiHealingTotal) / eiHealingTotal).toBeLessThan(0.01);
            }

            // Internal identity, always exact on this fixture: allies + self
            // must sum to the (EI-verified) total. Does NOT by itself prove
            // `outgoing_allies` (and therefore `healingOutput`) is correct --
            // see the dedicated oracle test below for that.
            expect(healing!.outgoing_allies + healing!.outgoing_self).toBe(healing!.outgoing_total);
        }
    });

    // Fix round 2, finding 3: the round-1 oracle for `healingOutput` was
    // mis-specified, not a real disagreement. The DOMINANT cause is
    // self-inclusion: `alliedHealingDist` summed raw includes the healer's
    // own index (self-healing), while native's `outgoing_allies` is
    // allies-only (total minus self) -- comparing them head-on mixes two
    // different definitions. Measured: 15 of 46 squad members have nonzero
    // EI self-healing, and those are EXACTLY the 15 accounts round 1 pinned
    // as "mismatched". A secondary, smaller effect also exists:
    // `alliedHealingDist` only covers the `players[]` friendlies roster,
    // so its sum can additionally fall short of EI's own `totalHealingDist`
    // sum for healing that landed on an off-roster ally -- measured on 10
    // of 46 members (a strict subset of the 15, since every off-roster-gap
    // case also has nonzero self-healing). Both are EI-side-only
    // definitional gaps, not a native/EI disagreement: EI's own
    // `alliedHealingDist` sum is short of its own `totalHealingDist` sum by
    // the identical amount native's `detail.by_ally` sum is short of
    // native's `outgoing_total` (proven per-account, not asserted).
    //
    // The correct EI-side oracle for `healingOutput` (`outgoing_allies`,
    // i.e. total minus self) is therefore
    // `totalHealingDist sum - alliedHealingDist[selfIndex] sum` -- EI's
    // full total, self-healing subtracted out via EI's own self-indexed
    // allied-dist entry, not `alliedHealingDist`'s (roster-limited) sum
    // used as a stand-in for "everyone but me". This yields EXACT integer
    // equality with native's `outgoing_allies` for all 46 squad members.
    it('matches EI\'s (totalHealingDist - self) oracle on healingOutput, and totalBarrierDist on barrierOutput, for every squad member', () => {
        const ei = loadEiFixture();
        const native = loadNativeFixture();
        const healingMismatches: string[] = [];
        const barrierMismatches: string[] = [];
        const byAllyVsAlliedDistMismatches: string[] = [];

        for (const e of native.entities.filter(x => x.role === 'squad')) {
            const eiIndex = ei.players.findIndex(p => p.account === e.account);
            const eiPlayer = ei.players[eiIndex];
            expect(eiPlayer, `no EI player for ${e.account}`).toBeDefined();
            const actual = extractSupport(native, e.id);
            const healing = requireBlock(native, 'healing').by_entity[String(e.id)];

            const alliedHealingSum = (eiPlayer.extHealingStats?.alliedHealingDist ?? [])
                .reduce((total, entry) => total + (entry[0] ?? []).reduce((a, b) => a + b.totalHealing, 0), 0);

            // Proves native and EI agree on the roster-limited per-ally
            // breakdown itself (this IS a valid, matching comparison --
            // both sides cover the same friendlies roster).
            const byAllySum = Object.values(healing!.detail?.by_ally ?? {}).reduce((a, b) => a + b.healing, 0);
            if (alliedHealingSum === 0) {
                if (byAllySum > 1) byAllyVsAlliedDistMismatches.push(accountOf(e));
            } else if (Math.abs(byAllySum - alliedHealingSum) / alliedHealingSum >= 0.01) {
                byAllyVsAlliedDistMismatches.push(accountOf(e));
            }

            const eiTotalHealing = eiPlayer.extHealingStats?.totalHealingDist?.[0]
                ?.reduce((a, b) => a + b.totalHealing, 0) ?? 0;
            const eiSelfHealing = (eiPlayer.extHealingStats?.alliedHealingDist?.[eiIndex]?.[0] ?? [])
                .reduce((a, b) => a + b.totalHealing, 0);
            const eiAlliesOnly = eiTotalHealing - eiSelfHealing;
            if (actual.healingOutput !== eiAlliesOnly) healingMismatches.push(accountOf(e));

            // One account (Anon178.7586, a Specter with an EMPTY `minions`
            // list -- there is no summon/pet to fold, ruling out the
            // pet-fold mechanism documented for `damage.test.ts`) disagrees
            // with EI beyond float drift on `barrierOutput`. Measured, not
            // assumed: native has exactly one extra hit on each of two
            // skills (63066 "Shadow Bolt": 24 native hits/8286 total vs 23
            // EI hits/7928 total; 63351 "Shadow Sap": 7 vs 6 hits, 6919 vs
            // 5868 total). Native's own `detail.by_ally` barrier sum equals
            // `barrier_out` exactly, so both sides ARE roster-covered here
            // -- this is a one-extra-hit event-inclusion difference on two
            // skills, not a coverage or fold mechanism. No further
            // mechanism is asserted beyond what was measured.
            const eiBarrierTotal = eiPlayer.extBarrierStats?.totalBarrierDist?.[0]
                ?.reduce((a, b) => a + b.totalBarrier, 0) ?? 0;
            if (eiBarrierTotal === 0) {
                if (actual.barrierOutput > 1) barrierMismatches.push(accountOf(e));
            } else if (Math.abs(actual.barrierOutput - eiBarrierTotal) / eiBarrierTotal >= 0.01) {
                barrierMismatches.push(accountOf(e));
            }
        }

        expect(byAllyVsAlliedDistMismatches, 'native detail.by_ally sum vs EI alliedHealingDist sum').toEqual([]);
        expect(healingMismatches, 'extractSupport().healingOutput vs EI\'s (totalHealingDist - self) oracle').toEqual([]);
        expect(barrierMismatches, 'extractSupport().barrierOutput vs EI\'s totalBarrierDist sum').toEqual([
            'Anon178.7586',
        ]);
    });

    it('matches the EI oracle on integer event counts for every squad member', () => {
        const ei = loadEiFixture();
        const native = loadNativeFixture();

        for (const e of native.entities.filter(x => x.role === 'squad')) {
            const eiPlayer = ei.players.find(p => p.account === e.account);
            expect(eiPlayer, `no EI player for ${e.account}`).toBeDefined();
            const actual = extractSupport(native, e.id);
            const s = eiPlayer!.support[0];

            expect(actual.boonStrips).toBe(s.boonStrips);
            expect(actual.cleanses).toBe(s.condiCleanse);
            expect(actual.cleanseSelf).toBe(s.condiCleanseSelf);
            expect(actual.healingOutput).toBeGreaterThanOrEqual(0);
            expect(actual.barrierOutput).toBeGreaterThanOrEqual(0);
            expect(Number.isFinite(actual.stabilityGeneration)).toBe(true);
        }
    });

    // Fix round 1, finding 4: `stabilityGeneration` previously had no real
    // oracle -- just `>= 0` / finite, which a wrong buff id (or the `?? 0`
    // fallback) would satisfy while silently rendering a zero. EI carries a
    // directly comparable figure: `player.squadBuffs.find(b => b.id ===
    // STABILITY_BUFF_ID).buffData[0].generation`, on the same 0-100 `squad_pct`
    // scale as native's `boons.by_entity[id][STABILITY_BUFF_ID].generation.squad_pct`.
    // EI rounds this to 3 decimals, so a small tolerance (not exact
    // equality) absorbs that rounding without hiding a real mismatch --
    // measured at 0 mismatches for all 46 squad members at this tolerance
    // (2 members need it: without any tolerance the diff is up to ~0.003).
    it('matches EI\'s squadBuffs generation oracle on stabilityGeneration for every squad member', () => {
        const ei = loadEiFixture();
        const native = loadNativeFixture();
        const mismatches: string[] = [];

        for (const e of native.entities.filter(x => x.role === 'squad')) {
            const eiPlayer = ei.players.find(p => p.account === e.account)!;
            const actual = extractSupport(native, e.id);
            const stabBuff = (eiPlayer.squadBuffs ?? []).find(b => b.id === STABILITY_BUFF_ID);
            const eiVal = stabBuff?.buffData[0]?.generation ?? 0;
            if (Math.abs(actual.stabilityGeneration - eiVal) > 0.005) mismatches.push(accountOf(e));
        }

        expect(mismatches, 'stabilityGeneration vs EI\'s squadBuffs[1122].buffData[0].generation').toEqual([]);
    });

    it('names and orders top healing and barrier skills for the local player', () => {
        const native = loadNativeFixture();
        const actual = extractSupport(native, localPlayerId(native));

        expect(actual.topHealingSkills.length).toBeGreaterThan(0);
        expect(actual.topHealingSkills.every(s => s.name.length > 0)).toBe(true);
        for (let i = 1; i < actual.topHealingSkills.length; i++) {
            expect(actual.topHealingSkills[i - 1].damage).toBeGreaterThanOrEqual(actual.topHealingSkills[i].damage);
        }

        for (let i = 1; i < actual.topBarrierSkills.length; i++) {
            expect(actual.topBarrierSkills[i - 1].damage).toBeGreaterThanOrEqual(actual.topBarrierSkills[i].damage);
        }
    });

    // Cross-checks the healing skill-id join itself against EI's
    // totalHealingDist, the same way damage.test.ts cross-checks
    // totalDamageDist -- for every squad member, not a sample.
    it('cross-checks the healing skill-id join against EI\'s totalHealingDist for every squad member', () => {
        const ei = loadEiFixture();
        const native = loadNativeFixture();
        const missingFromNative: string[] = [];
        const totalMismatches: string[] = [];

        for (const e of native.entities.filter(x => x.role === 'squad')) {
            const eiPlayer = ei.players.find(p => p.account === e.account)!;
            const bySkill = requireBlock(native, 'healing').by_entity[String(e.id)]?.detail?.by_skill ?? {};
            const nativeIds = new Set(Object.keys(bySkill).map(Number));
            const eiDist = eiPlayer.extHealingStats?.totalHealingDist?.[0] ?? [];
            const eiIds = new Set(eiDist.map(row => row.id));

            for (const id of eiIds) {
                if (!nativeIds.has(id)) missingFromNative.push(`${e.account}:${id}`);
            }
            for (const id of nativeIds) {
                if (!eiIds.has(id)) continue;
                const nativeTotal = bySkill[String(id)].total;
                const eiTotal = eiDist.find(row => row.id === id)!.totalHealing;
                if (eiTotal === 0 && nativeTotal === 0) continue;
                const relErr = Math.abs(nativeTotal - eiTotal) / Math.max(1, eiTotal);
                if (relErr > 0.01) totalMismatches.push(`${e.account}:${id}`);
            }
        }

        expect(missingFromNative, 'EI healing skill ids absent from native\'s join').toEqual([]);
        expect(totalMismatches, 'healing skill ids present on both sides with mismatched totals').toEqual([]);
    });

    // Same cross-check for barrier against EI's totalBarrierDist.
    it('cross-checks the barrier skill-id join against EI\'s totalBarrierDist for every squad member', () => {
        const ei = loadEiFixture();
        const native = loadNativeFixture();
        const missingFromNative: string[] = [];
        const totalMismatches: string[] = [];

        for (const e of native.entities.filter(x => x.role === 'squad')) {
            const eiPlayer = ei.players.find(p => p.account === e.account)!;
            const bySkill = requireBlock(native, 'healing').by_entity[String(e.id)]?.detail?.barrier_by_skill ?? {};
            const nativeIds = new Set(Object.keys(bySkill).map(Number));
            const eiDist = eiPlayer.extBarrierStats?.totalBarrierDist?.[0] ?? [];
            const eiIds = new Set(eiDist.map(row => row.id));

            for (const id of eiIds) {
                if (!nativeIds.has(id)) missingFromNative.push(`${e.account}:${id}`);
            }
            for (const id of nativeIds) {
                if (!eiIds.has(id)) continue;
                const nativeTotal = bySkill[String(id)].total;
                const eiTotal = eiDist.find(row => row.id === id)!.totalBarrier;
                if (eiTotal === 0 && nativeTotal === 0) continue;
                const relErr = Math.abs(nativeTotal - eiTotal) / Math.max(1, eiTotal);
                if (relErr > 0.01) totalMismatches.push(`${e.account}:${id}`);
            }
        }

        expect(missingFromNative, 'EI barrier skill ids absent from native\'s join').toEqual([]);
        // Pinned, not tolerated: the same account flagged in the previous
        // test contributes its per-skill mismatches here too.
        expect(totalMismatches, 'barrier skill ids present on both sides with mismatched totals').toEqual([
            'Anon178.7586:63066',
            'Anon178.7586:63351',
        ]);
    });

    it('throws on an unknown entity id rather than returning blanks', () => {
        // Anchored: this function has four separate guards and a bare
        // `toThrow()` cannot tell which one fired.
        expect(() => extractSupport(loadNativeFixture(), 999_999))
            .toThrow('extractSupport: no support row for entity 999999');
    });

    describe('absences that are errors, not zeros', () => {
        const id = () => localPlayerId(loadNativeFixture());

        function withoutRow(block: 'healing' | 'boons'): ReportV1 {
            const r = loadNativeFixture();
            const by = { ...r.blocks[block]!.by_entity };
            delete by[String(id())];
            return {
                ...r, blocks: { ...r.blocks, [block]: { ...r.blocks[block]!, by_entity: by } },
            } as ReportV1;
        }

        it('throws, naming healing, when only the healing row is gone', () => {
            expect(() => extractSupport(withoutRow('healing'), id()))
                .toThrow(`extractSupport: no healing row for entity ${id()}`);
        });

        it('throws, naming boons, when only the boons row is gone', () => {
            expect(() => extractSupport(withoutRow('boons'), id()))
                .toThrow(`extractSupport: no boons row for entity ${id()}`);
        });

        it('throws when the healing row carries no per-skill detail', () => {
            const r = loadNativeFixture();
            const key = String(id());
            const row: Record<string, unknown> = { ...r.blocks.healing!.by_entity[key] };
            delete row.detail;
            const mutated = {
                ...r,
                blocks: {
                    ...r.blocks,
                    healing: {
                        ...r.blocks.healing!,
                        by_entity: { ...r.blocks.healing!.by_entity, [key]: row },
                    },
                },
            } as unknown as ReportV1;
            expect(() => extractSupport(mutated, id()))
                .toThrow(/healing row has no per-skill detail/);
        });

        it('throws when the entity has no Stability row, rather than reporting 0% generation', () => {
            const r = loadNativeFixture();
            const key = String(id());
            const boons: Record<string, unknown> = { ...r.blocks.boons!.by_entity[key] };
            delete boons[String(STABILITY_BUFF_ID)];
            const mutated = {
                ...r,
                blocks: {
                    ...r.blocks,
                    boons: { ...r.blocks.boons!, by_entity: { ...r.blocks.boons!.by_entity, [key]: boons } },
                },
            } as unknown as ReportV1;
            expect(() => extractSupport(mutated, id()))
                .toThrow(`extractSupport: entity ${id()} has no Stability (${STABILITY_BUFF_ID}) row in blocks.boons`);
        });

        it('throws when a healing skill id is missing from catalogs.skills', () => {
            const r = loadNativeFixture();
            const used = Object.keys(r.blocks.healing!.by_entity[String(id())].detail!.by_skill)[0];
            const skills = { ...r.catalogs.skills };
            delete skills[used];
            const mutated = { ...r, catalogs: { ...r.catalogs, skills } } as ReportV1;
            expect(() => extractSupport(mutated, id()))
                .toThrow(`catalogs.skills has no entry for skill ${used} (entity ${id()})`);
        });

        /**
         * The one KEPT fallback here. Measured across the 46 squad members:
         * `total_downed` is absent on 175 of 182 healing rows and on all 38
         * barrier rows. It means "none of this skill's output landed on a
         * DOWNED ally" -- the common case, not a gap.
         */
        it('reads an absent total_downed as a real zero, which is 175 of 182 healing rows', () => {
            const r = loadNativeFixture();
            let rows = 0, absent = 0, barrierRows = 0, barrierAbsent = 0;
            for (const e of r.entities.filter(x => x.role === 'squad')) {
                const detail = r.blocks.healing!.by_entity[String(e.id)].detail!;
                for (const row of Object.values(detail.by_skill)) {
                    rows++; if (row.total_downed === undefined) absent++;
                }
                for (const row of Object.values(detail.barrier_by_skill)) {
                    barrierRows++; if (row.total_downed === undefined) barrierAbsent++;
                }
            }
            expect([rows, absent]).toEqual([182, 175]);
            expect([barrierRows, barrierAbsent]).toEqual([38, 38]);
            // And the extract turns that absence into 0 rather than throwing.
            expect(extractSupport(r, id()).topBarrierSkills.every(s => s.downedHealing === 0)).toBe(true);
        });
    });
});
