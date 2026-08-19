import { describe, it, expect } from 'vitest';
import { extractSupport } from '../../../src/shared/extract/support';
import { localPlayerId } from '../../../src/shared/report';
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
    // large measured healing/barrier elsewhere in the same EI document. The
    // per-skill distributions (`totalHealingDist`/`totalBarrierDist`) DO
    // carry real numbers and their sums equal native's
    // `outgoing_total`/`barrier_out` (allies + self) almost exactly, so
    // those are the actual working oracle here. `healingOutput` itself
    // (allies-only, i.e. `outgoing_total - outgoing_self`) has no EI
    // counterpart on this fixture; it's validated via the additive identity
    // against native's own `outgoing_total`/`outgoing_self` instead.
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
            if (eiBarrierTotal === 0) {
                if (healing!.barrier_out > 1) barrierMismatches.push(e.account);
            } else if (Math.abs(healing!.barrier_out - eiBarrierTotal) / eiBarrierTotal >= 0.01) {
                barrierMismatches.push(e.account);
            }

            // The allies-only figure `extractSupport` surfaces is only
            // internally checkable on this fixture: allies + self must sum
            // to the (EI-verified) total.
            expect(healing!.outgoing_allies + healing!.outgoing_self).toBe(healing!.outgoing_total);
        }

        expect(barrierMismatches, 'squad members whose native barrier_out disagrees with EI\'s totalBarrierDist sum')
            .toEqual(['Anon178.7586']);
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
            expect(actual.stabilityGeneration).toBeGreaterThanOrEqual(0);
            expect(Number.isFinite(actual.stabilityGeneration)).toBe(true);
        }
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
