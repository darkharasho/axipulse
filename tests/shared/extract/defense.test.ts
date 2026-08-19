import { describe, it, expect } from 'vitest';
import { extractDefense } from '../../../src/shared/extract/defense';
import { localPlayerId } from '../../../src/shared/report';
import { loadEiFixture, loadNativeFixture } from '../oracle';

function eiLocal(ei: ReturnType<typeof loadEiFixture>) {
    return ei.players.find(p => p.account === ei.recordedAccountBy)
        ?? ei.players.find(p => p.name === ei.recordedBy)!;
}

describe('extractDefense', () => {
    // NOTE on `downs`/`downTimes`: `defenses.by_entity[id].downs_taken` (the
    // brief's mapping for `DefenseStats.downs`) is NOT the same quantity as
    // `replay.by_entity[id].down.length` (what backs `downTimes`), even
    // though both nominally count "times this entity went down". Measured
    // across the full 46-member roster (see the full-roster test below):
    // `downs_taken` exceeds the replay-interval count for 20 of 46 members,
    // and is never smaller. `downs_taken`'s own doc comment claims to mirror
    // GW2EI's `defenses[0].downCount`, but it disagrees with EI for 21 of 46
    // -- while the replay-interval count agrees with EI's `downCount` for
    // 45 of 46 (the one exception, `Anon151.6587`, is a genuine
    // native/EI down-detection disagreement, pinned separately). So
    // `downs_taken` is a broader (looser) native-only event counter, and
    // `downTimes.length === downs` cannot be asserted as a blanket
    // invariant -- only `downTimes.length <= downs`, which the data
    // supports everywhere.
    it('matches the EI oracle on the deterministic defense counters for the local player', () => {
        const ei = loadEiFixture();
        const native = loadNativeFixture();
        const p = eiLocal(ei);
        const actual = extractDefense(native, localPlayerId(native));
        const d = p.defenses[0];

        expect(actual.deaths).toBe(d.deadCount);
        expect(actual.dodges).toBe(d.dodgeCount);
        expect(actual.blocked).toBe(d.blockedCount);
        expect(actual.evaded).toBe(d.evadedCount);
        expect(actual.missed).toBe(d.missedCount);
        expect(actual.invulned).toBe(d.invulnedCount);
        expect(actual.interrupted).toBe(d.interruptedCount);
        expect(actual.incomingCC).toBe(d.receivedCrowdControl);
        expect(actual.incomingStrips).toBe(d.boonStrips);
        expect(actual.downs).toBeGreaterThanOrEqual(0);

        if (d.damageTaken === 0) {
            expect(actual.damageTaken).toBeLessThanOrEqual(1);
        } else {
            expect(Math.abs(actual.damageTaken - d.damageTaken) / d.damageTaken).toBeLessThan(0.01);
        }
    });

    it('reads death and down times from the replay intervals', () => {
        const native = loadNativeFixture();
        const ei = loadEiFixture();
        const p = eiLocal(ei);
        const actual = extractDefense(native, localPlayerId(native));
        expect(actual.deathTimes.length).toBe(actual.deaths);
        // See the NOTE above `downs`/`downTimes` are not the same quantity;
        // the interval count only ever bounds the event counter.
        expect(actual.downTimes.length).toBeLessThanOrEqual(actual.downs);
        // Every interval start must fall inside the fight.
        for (const t of [...actual.deathTimes, ...actual.downTimes]) {
            expect(t).toBeGreaterThanOrEqual(0);
            expect(t).toBeLessThanOrEqual(native.encounter.duration_ms);
        }
        expect(actual.deaths).toBe(p.defenses[0].deadCount);
    });

    it('names and orders top damage-taken skills', () => {
        const native = loadNativeFixture();
        const actual = extractDefense(native, localPlayerId(native));
        expect(actual.topDamageTakenSkills.length).toBeGreaterThan(0);
        expect(actual.topDamageTakenSkills.every(s => s.name.length > 0)).toBe(true);
        for (let i = 1; i < actual.topDamageTakenSkills.length; i++) {
            expect(actual.topDamageTakenSkills[i - 1].damage)
                .toBeGreaterThanOrEqual(actual.topDamageTakenSkills[i].damage);
        }
    });

    // Cross-checks the incoming skill-id join itself, not just
    // extractDefense's aggregates. Reads native's full `by_skill_taken` map
    // directly and compares it against EI's `totalDamageTaken[0]` -- phase
    // 0, the whole fight, the same single-phase convention `damage.test.ts`
    // relies on.
    it('cross-checks the per-skill damage-taken join against EI\'s totalDamageTaken for every squad member', () => {
        const ei = loadEiFixture();
        const native = loadNativeFixture();
        const missingFromNative: string[] = [];
        const totalMismatches: string[] = [];

        for (const e of native.entities.filter(x => x.role === 'squad')) {
            const eiPlayer = ei.players.find(p => p.account === e.account)!;
            const bySkillTaken = native.blocks.damage.by_entity[String(e.id)]?.by_skill_taken ?? {};
            const nativeIds = new Set(Object.keys(bySkillTaken).map(Number));
            const eiDist = eiPlayer.totalDamageTaken[0] ?? [];
            const eiIds = new Set(eiDist.map(row => row.id));

            for (const id of eiIds) {
                if (!nativeIds.has(id)) missingFromNative.push(`${e.account}:${id}`);
            }

            // Native folds pet/minion damage onto the summoning skill's id
            // where EI records a separate zero-damage cast event (see
            // damage.test.ts). The incoming analogue -- an enemy's summon
            // skill hitting the squad -- can show the same shape; detect it
            // by its real condition (relErr > 0.01) and pin it, not skip it.
            for (const id of nativeIds) {
                if (!eiIds.has(id)) continue;
                const nativeTotal = bySkillTaken[String(id)].total;
                const eiTotal = eiDist.find(row => row.id === id)!.totalDamage;
                if (eiTotal === 0 && nativeTotal === 0) continue;
                const relErr = Math.abs(nativeTotal - eiTotal) / Math.max(1, eiTotal);
                if (relErr > 0.01) totalMismatches.push(`${e.account}:${id}`);
            }
        }

        expect(missingFromNative, 'EI skill ids absent from native\'s join').toEqual([]);
        expect(totalMismatches, 'skill ids present on both sides with mismatched totals').toEqual([]);
    });

    it('matches the EI oracle on defense counters for every squad member', () => {
        const ei = loadEiFixture();
        const native = loadNativeFixture();
        const downCountMismatches: string[] = [];
        const downIntervalUndercounts: string[] = [];
        const downIntervalVsEiMismatches: string[] = [];

        for (const e of native.entities.filter(x => x.role === 'squad')) {
            const eiPlayer = ei.players.find(p => p.account === e.account);
            expect(eiPlayer, `no EI player for ${e.account}`).toBeDefined();
            const actual = extractDefense(native, e.id);
            const d = eiPlayer!.defenses[0];

            expect(actual.deaths).toBe(d.deadCount);
            expect(actual.dodges).toBe(d.dodgeCount);
            expect(actual.blocked).toBe(d.blockedCount);
            expect(actual.evaded).toBe(d.evadedCount);
            expect(actual.missed).toBe(d.missedCount);
            expect(actual.invulned).toBe(d.invulnedCount);
            expect(actual.interrupted).toBe(d.interruptedCount);
            expect(actual.incomingCC).toBe(d.receivedCrowdControl);
            expect(actual.incomingStrips).toBe(d.boonStrips);

            if (d.damageTaken === 0) {
                expect(actual.damageTaken).toBeLessThanOrEqual(1);
            } else {
                expect(Math.abs(actual.damageTaken - d.damageTaken) / d.damageTaken).toBeLessThan(0.01);
            }

            expect(actual.deathTimes.length).toBe(actual.deaths);
            // `downs` (defenses.downs_taken) is a native-only event counter
            // that never undercounts the replay-derived interval list --
            // see the NOTE above the single-player tests.
            expect(actual.downTimes.length).toBeLessThanOrEqual(actual.downs);

            if (actual.downs !== d.downCount) downCountMismatches.push(e.account);
            if (actual.downTimes.length !== actual.downs) downIntervalUndercounts.push(e.account);
            if (actual.downTimes.length !== d.downCount) downIntervalVsEiMismatches.push(e.account);
        }

        // Pinned, not tolerated: `downs_taken` disagreeing with EI's
        // `downCount` is real and reproducible on this fixture -- see the
        // NOTE above. If a regenerated fixture widens this set, it gets
        // re-examined rather than silently growing.
        expect(downCountMismatches, 'downs_taken vs EI downCount').toEqual([
            'Anon151.6587', 'Anon175.7475', 'Anon185.7845', 'Anon159.6883',
            'Anon172.7364', 'Anon150.6550', 'Anon158.6846', 'Anon168.7216',
            'Anon176.7512', 'Anon179.7623', 'Anon160.6920', 'Anon166.7142',
            'Anon180.7660', 'Anon174.7438', 'Anon177.7549', 'Anon183.7771',
            'Anon186.7882', 'Anon184.7808', 'Anon154.6698', 'Anon192.8104',
            'Anon194.8178',
        ]);
        expect(downIntervalUndercounts, 'replay down-interval count vs downs_taken').toEqual([
            'Anon175.7475', 'Anon185.7845', 'Anon159.6883', 'Anon172.7364',
            'Anon150.6550', 'Anon158.6846', 'Anon168.7216', 'Anon176.7512',
            'Anon179.7623', 'Anon160.6920', 'Anon166.7142', 'Anon180.7660',
            'Anon174.7438', 'Anon177.7549', 'Anon183.7771', 'Anon186.7882',
            'Anon184.7808', 'Anon154.6698', 'Anon192.8104', 'Anon194.8178',
        ]);
        // The replay-interval count (what `downTimes` is built from) is the
        // one that actually tracks EI closely: only one genuine
        // native/EI down-detection disagreement across the whole roster.
        expect(downIntervalVsEiMismatches, 'replay down-interval count vs EI downCount').toEqual([
            'Anon151.6587',
        ]);
    });

    it('throws on an unknown entity id rather than returning blanks', () => {
        expect(() => extractDefense(loadNativeFixture(), 999_999)).toThrow();
    });
});
