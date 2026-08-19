import { describe, it, expect } from 'vitest';
import { extractSupport } from '../../../src/shared/extract/support';
import { localPlayerId } from '../../../src/shared/report';
import { STABILITY_BUFF_ID } from '../../../src/shared/boonPerformance';
import { loadEiFixture, loadNativeFixture } from '../oracle';

function eiLocal(ei: ReturnType<typeof loadEiFixture>) {
    return ei.players.find(p => p.account === ei.recordedAccountBy)
        ?? ei.players.find(p => p.name === ei.recordedBy)!;
}

describe('extractSupport', () => {
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
    // CORRECTION (fix round 1): an earlier version of this file claimed
    // `healingOutput` has no EI counterpart at all on this fixture. That
    // was wrong -- EI carries a second, real oracle:
    // `extHealingStats.alliedHealingDist` / `extBarrierStats.alliedBarrierDist`
    // (positional per-ALLY arrays, one entry per `players[]` index,
    // including the healer's own index). Summed, these DO disagree with
    // native's `outgoing_allies` beyond 1% on 15 of 46 squad members -- a
    // real, structural, previously-undetected finding. See the dedicated
    // `healingOutput`/`barrierOutput` oracle test below for the pinned
    // mismatch set and the root cause.
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

    it('matches the EI per-skill healing/barrier distribution totals for every squad member', () => {
        const ei = loadEiFixture();
        const native = loadNativeFixture();
        const barrierMismatches: string[] = [];

        for (const e of native.entities.filter(x => x.role === 'squad')) {
            const eiPlayer = ei.players.find(p => p.account === e.account);
            expect(eiPlayer, `no EI player for ${e.account}`).toBeDefined();
            const healing = native.blocks.healing.by_entity[String(e.id)];
            expect(healing, `no native healing row for ${e.account}`).toBeDefined();
            const actual = extractSupport(native, e.id);

            const eiHealingTotal = eiPlayer!.extHealingStats?.totalHealingDist?.[0]
                ?.reduce((a, b) => a + b.totalHealing, 0) ?? 0;
            const eiBarrierTotal = eiPlayer!.extBarrierStats?.totalBarrierDist?.[0]
                ?.reduce((a, b) => a + b.totalBarrier, 0) ?? 0;

            if (eiHealingTotal === 0) {
                expect(healing!.outgoing_total).toBeLessThanOrEqual(1);
            } else {
                expect(Math.abs(healing!.outgoing_total - eiHealingTotal) / eiHealingTotal).toBeLessThan(0.01);
            }
            // Barrier has the same pet/minion-fold phenomenon documented in
            // damage.test.ts for damage: one account's native barrier total
            // disagrees with EI beyond float drift. Detected by its real
            // condition and pinned below, not silently tolerated here.
            // Routed through `extractSupport(...).barrierOutput` (fix round
            // 1), not the raw block, so a wrong-field bug in the extract
            // itself would be caught here.
            if (eiBarrierTotal === 0) {
                if (actual.barrierOutput > 1) barrierMismatches.push(e.account);
            } else if (Math.abs(actual.barrierOutput - eiBarrierTotal) / eiBarrierTotal >= 0.01) {
                barrierMismatches.push(e.account);
            }

            // Internal identity, always exact on this fixture: allies + self
            // must sum to the (EI-verified) total. Does NOT by itself prove
            // `outgoing_allies` (and therefore `healingOutput`) is correct --
            // see the dedicated oracle test below for that.
            expect(healing!.outgoing_allies + healing!.outgoing_self).toBe(healing!.outgoing_total);
        }

        expect(barrierMismatches, 'squad members whose extractSupport().barrierOutput disagrees with EI\'s totalBarrierDist sum')
            .toEqual(['Anon178.7586']);
    });

    // Fix round 1, finding 2/3: a REAL oracle for `healingOutput` does
    // exist on this fixture -- `extHealingStats.alliedHealingDist`, a
    // per-ALLY array (index = position in `players[]`, including the
    // healer's own index) of per-skill healing rows, summed across allies
    // and skills. This disagrees with native's `outgoing_allies` (what
    // `healingOutput` reads) beyond 1% on 15 of 46 squad members.
    //
    // Root cause, established by comparing THREE independent sources for
    // the same quantity:
    //   1. native's scalar `HealingEntity.outgoing_allies` (what this app reads)
    //   2. native's own `HealingEntity.detail.by_ally` breakdown, summed
    //   3. EI's `alliedHealingDist`, summed
    // Source (2) matches source (3) EXACTLY for all 46 squad members (zero
    // mismatches -- see the loop below). So the per-ally breakdown pass
    // inside axilog agrees perfectly with EI, and the disagreement is
    // entirely between native's OWN scalar (`outgoing_allies`, sourced from
    // a different internal pass) and native's OWN per-ally breakdown -- not
    // a native/EI measurement gap. This is a genuine axilog-internal
    // inconsistency (a third upstream bug, alongside the `downs_taken` and
    // pet/minion-fold findings already on record), not something this
    // extract layer introduces or can locally correct without deviating
    // from the frozen `DefenseStats`/`SupportStats` field mapping the brief
    // specifies (`healingOutput` -> `outgoing_allies`, verbatim). Pinned,
    // not softened, so a fixture regeneration that changes the set gets
    // re-examined.
    it('matches EI\'s alliedHealingDist oracle on healingOutput, and totalBarrierDist on barrierOutput, for every squad member', () => {
        const ei = loadEiFixture();
        const native = loadNativeFixture();
        const healingMismatches: string[] = [];
        const barrierMismatches: string[] = [];
        const byAllyVsAlliedDistMismatches: string[] = [];

        for (const e of native.entities.filter(x => x.role === 'squad')) {
            const eiPlayer = ei.players.find(p => p.account === e.account)!;
            const actual = extractSupport(native, e.id);
            const healing = native.blocks.healing.by_entity[String(e.id)];

            const alliedHealingSum = (eiPlayer.extHealingStats?.alliedHealingDist ?? [])
                .reduce((total, entry) => total + (entry[0] ?? []).reduce((a, b) => a + b.totalHealing, 0), 0);
            if (alliedHealingSum === 0) {
                if (actual.healingOutput > 1) healingMismatches.push(e.account);
            } else if (Math.abs(actual.healingOutput - alliedHealingSum) / alliedHealingSum >= 0.01) {
                healingMismatches.push(e.account);
            }

            // Source (2) vs source (3) from the comment above: native's own
            // per-ally breakdown against EI's alliedHealingDist. Zero
            // mismatches expected -- proving the disagreement above is
            // internal to native, not a native/EI gap.
            const byAllySum = Object.values(healing!.detail?.by_ally ?? {}).reduce((a, b) => a + b.healing, 0);
            if (alliedHealingSum === 0) {
                if (byAllySum > 1) byAllyVsAlliedDistMismatches.push(e.account);
            } else if (Math.abs(byAllySum - alliedHealingSum) / alliedHealingSum >= 0.01) {
                byAllyVsAlliedDistMismatches.push(e.account);
            }

            const eiBarrierTotal = eiPlayer.extBarrierStats?.totalBarrierDist?.[0]
                ?.reduce((a, b) => a + b.totalBarrier, 0) ?? 0;
            if (eiBarrierTotal === 0) {
                if (actual.barrierOutput > 1) barrierMismatches.push(e.account);
            } else if (Math.abs(actual.barrierOutput - eiBarrierTotal) / eiBarrierTotal >= 0.01) {
                barrierMismatches.push(e.account);
            }
        }

        expect(byAllyVsAlliedDistMismatches, 'native detail.by_ally sum vs EI alliedHealingDist sum').toEqual([]);
        expect(healingMismatches, 'extractSupport().healingOutput vs EI\'s alliedHealingDist sum').toEqual([
            'Anon200.8400', 'Anon164.7068', 'Anon150.6550', 'Anon158.6846',
            'Anon168.7216', 'Anon171.7327', 'Anon162.6994', 'Anon163.7031',
            'Anon176.7512', 'Anon160.6920', 'Anon177.7549', 'Anon188.7956',
            'Anon191.8067', 'Anon165.7105', 'Anon209.8733',
        ]);
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
            if (Math.abs(actual.stabilityGeneration - eiVal) > 0.005) mismatches.push(e.account);
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
            const bySkill = native.blocks.healing.by_entity[String(e.id)]?.detail?.by_skill ?? {};
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
            const bySkill = native.blocks.healing.by_entity[String(e.id)]?.detail?.barrier_by_skill ?? {};
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
        expect(() => extractSupport(loadNativeFixture(), 999_999)).toThrow();
    });
});
