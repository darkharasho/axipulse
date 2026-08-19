import { describe, it, expect } from 'vitest';
import {
    classifySquadRoleMap, classifyRole, classifyFromMetrics, computeRatio, OUTLIER_RATIO,
} from '../../src/shared/classifyRole';
import { classifySquadRolesEi } from './ei/classifyRoles';
import { localPlayerId } from '../../src/shared/report';
import type { ReportV1 } from '../../src/shared/report';
import { WVW_BOON_IDS } from '../../src/shared/boonData';
import { loadEiFixture, loadNativeFixture } from './oracle';

/*
 * Task 11 deleted the six SYNTHETIC `classifySquadRoles` unit tests that
 * stood here, along with their `makePlayer` / `makeDpsPlayer` /
 * `makeSupportPlayer` builders: they exercised a production API that no
 * longer exists. The EI classifier itself survives as an ORACLE in
 * `tests/shared/ei/classifyRoles.ts` -- see the note there -- because the
 * one assertion below that matters is a comparison against it.
 */

/* --- native format ------------------------------------------------------- */

/** A shallow-cloned report with one surgical change. Never mutates the
 *  memoized fixture. */
function edited(r: ReportV1, edit: (draft: any) => void): ReportV1 {
    const draft = { ...r, entities: structuredClone(r.entities), blocks: structuredClone(r.blocks) };
    edit(draft);
    return draft as ReportV1;
}

describe('classifySquadRoleMap / classifyRole (native)', () => {
    /**
     * THE oracle for this migration: three of the six scoring inputs are
     * different quantities after the cutover (see below), so the only claim
     * worth making is about the OUTPUT. Every one of the 46 squad members
     * gets the same role label from the native classifier as from the EI
     * one -- compared per account, not as a count of supports, because 23
     * supports drawn from a different 23 members would pass a count check.
     */
    it('agrees with the EI classifier on every squad member\'s role', () => {
        const native = loadNativeFixture();
        const ei = loadEiFixture();
        const eiRoles = classifySquadRolesEi(ei.players.filter(p => !p.notInSquad && !p.isFake));
        const nativeRoles = classifySquadRoleMap(native);

        const disagreements: unknown[] = [];
        for (const e of native.entities.filter(x => x.role === 'squad')) {
            const mine = nativeRoles.get(e.id)!;
            const theirs = eiRoles.get(e.account!)!;
            expect(theirs, `no EI classification for ${e.account}`).toBeDefined();
            if (mine.role !== theirs.role) disagreements.push([e.account, theirs.role, mine.role]);
            expect(mine.confidenceScore, e.account).toBeGreaterThanOrEqual(0);
            expect(mine.confidenceScore, e.account).toBeLessThanOrEqual(1);
        }
        expect(disagreements).toEqual([]);
        expect(nativeRoles.size).toBe(46);
        expect([...nativeRoles.values()].filter(c => c.role === 'support').length).toBe(23);
    });

    /**
     * The three inputs that genuinely changed, measured rather than
     * asserted away. `supportScore` is therefore NOT expected to match EI's
     * and is not compared above -- only the role it produces is.
     *
     * 1. Boon output: EI summed `squadBuffs`, which spans 32 buff ids on
     *    this log (boons plus conjures, spirits and other shared buffs);
     *    axilog's boons block carries only the 12 core `WVW_BOON_IDS`.
     * 2. Healing: EI summed its roster-limited `outgoingHealingAllies` grid
     *    INCLUDING the healer's own cell; native's `outgoing_allies` is
     *    allies-only over the full roster.
     * 3. Down contribution: arcdps methodology vs EI's downstate window --
     *    two different algorithms (axilog `types.d.ts`, on
     *    `PerTargetStatsOut.downs_contribution_damage`).
     */
    it('pins the metric-source divergences that the agreeing roles survive', () => {
        const native = loadNativeFixture();
        const ei = loadEiFixture();
        const squad = native.entities.filter(x => x.role === 'squad');

        const eiBuffIds = new Set<number>();
        for (const e of squad) {
            const p = ei.players.find(x => x.account === e.account)!;
            for (const b of p.squadBuffs ?? []) eiBuffIds.add(b.id);
        }
        expect(eiBuffIds.size).toBe(32);
        expect(WVW_BOON_IDS.size).toBe(12);
        // Every boon axilog carries is one EI carried too; the extra 20 are
        // EI-only, so the native sum is a strict subset, never a superset.
        expect([...WVW_BOON_IDS].filter(id => !eiBuffIds.has(id))).toEqual([]);

        let boonDiffs = 0;
        let healingDiffs = 0;
        let downContribDiffs = 0;
        for (const e of squad) {
            const p = ei.players.find(x => x.account === e.account)!;
            const boonRow = native.blocks.boons!.by_entity[String(e.id)]!;
            const nativeBoons = [...WVW_BOON_IDS]
                .reduce((s, id) => s + boonRow[String(id)]!.generation.squad_pct, 0);
            const eiBoons = (p.squadBuffs ?? []).reduce((s, b) => s + (b.buffData[0]?.generation ?? 0), 0);
            if (Math.abs(nativeBoons - eiBoons) > 0.05) boonDiffs++;

            const eiHealing = (p.extHealingStats?.outgoingHealingAllies ?? [])
                .reduce((s, ally) => s + ally.reduce((a, ph) => a + ph.healing, 0), 0);
            if (native.blocks.healing!.by_entity[String(e.id)]!.outgoing_allies !== eiHealing) healingDiffs++;

            const eiDc = p.statsAll[0]!.downContribution;
            if (native.blocks.contribution!.by_entity[String(e.id)]!.downs_contribution.damage !== eiDc) {
                downContribDiffs++;
            }
        }
        expect(boonDiffs, 'squad members whose total boon output changed').toBe(33);
        expect(healingDiffs, 'squad members whose healing metric changed').toBe(15);
        expect(downContribDiffs, 'squad members whose down contribution changed').toBe(41);
    });

    /**
     * The role LABEL is a coarse output -- it survives quite large changes
     * to the inputs, which makes it too blunt to guard the metric wiring on
     * its own. (Measured: swapping the healing and cleanses WEIGHTS, or
     * reading `outgoing_total` instead of `outgoing_allies`, changes no
     * member's role at all.) So the continuous score every label is derived
     * from is pinned exactly, for the squad's top, bottom and local member.
     * Any mis-wired metric, weight or block field moves these.
     */
    it('pins the support scores the role labels are derived from', () => {
        const native = loadNativeFixture();
        const roles = classifySquadRoleMap(native);
        const byAccount = (account: string) =>
            roles.get(native.entities.find(e => e.role === 'squad' && e.account === account)!.id)!;

        // Highest-scoring support in the squad.
        expect(byAccount('Anon164.7068').supportScore).toBeCloseTo(28.873849818551918, 9);
        expect(byAccount('Anon164.7068').confidenceScore).toBe(1);
        // Lowest-scoring damage dealer.
        expect(byAccount('Anon167.7179').supportScore).toBeCloseTo(-106.4013686402476, 9);
        expect(byAccount('Anon167.7179').confidenceScore).toBe(1);
        // The local player.
        expect(byAccount('Anon150.6550').supportScore).toBeCloseTo(6.530136360765569, 9);
        expect(byAccount('Anon150.6550').confidenceScore).toBeCloseTo(0.23603068161292806, 9);
    });

    /**
     * Why a mutation replacing the DPS metric with the damage metric cannot
     * be killed, stated as a proof rather than left as an untested path:
     * axilog derives `damage.dps` from the ENCOUNTER duration, the same
     * divisor for every entity, so `dps` is a scalar multiple of `total`
     * and `computeRatio`'s median normalisation makes the two metrics
     * numerically identical. EI's `dps` divided by each player's own ACTIVE
     * time instead, which is why it was a (weak) independent signal there.
     * If axilog ever switches to active time, this test fails and the DPS
     * weight starts doing real work again.
     */
    it('shows the native DPS metric is collinear with the damage metric', () => {
        const native = loadNativeFixture();
        const ei = loadEiFixture();
        const squad = native.entities.filter(e => e.role === 'squad');
        const damage = native.blocks.damage!.by_entity;

        const divisors = new Set(squad
            .map(e => damage[String(e.id)]!)
            .filter(d => d.dps > 0)
            .map(d => d.total / d.dps));
        expect(divisors.size).toBe(1);
        expect([...divisors][0]).toBeCloseTo(native.encounter.duration_ms / 1000, 6);

        // EI's divisor was per-player active time: 7 distinct values here.
        const eiDivisors = new Set(ei.players
            .filter(p => !p.notInSquad && !p.isFake)
            .map(p => p.activeTimes![0]));
        expect(eiDivisors.size).toBe(7);
    });

    it('classifies the local player and rejects a non-squad id', () => {
        const native = loadNativeFixture();
        const local = localPlayerId(native);
        expect(classifyRole(native, local).role).toBe('support');

        const enemy = native.entities.find(e => e.role === 'enemy_player')!;
        expect(() => classifyRole(native, enemy.id))
            .toThrow(`classifyRole: entity ${enemy.id} is not a squad member`);
    });

    /**
     * A present block missing one squad member's row, and a present boons
     * row missing one of the twelve boons, are both silent-zero hazards: a
     * median is computed across the squad, so one fabricated 0 moves every
     * other member's ratio. Each throw site is asserted on a message unique
     * to it.
     */
    it('throws rather than scoring a missing row as zero', () => {
        const native = loadNativeFixture();
        const victim = native.entities.filter(e => e.role === 'squad')[9]!;

        for (const block of ['damage', 'support', 'contribution', 'healing', 'boons'] as const) {
            const broken = edited(native, d => { delete d.blocks[block].by_entity[String(victim.id)]; });
            expect(() => classifySquadRoleMap(broken), block)
                .toThrow(`classifySquadRoleMap: no ${block} row for squad entity ${victim.id}`);
        }

        const noMight = edited(native, d => { delete d.blocks.boons.by_entity[String(victim.id)]['740']; });
        expect(() => classifySquadRoleMap(noMight))
            .toThrow(`classifySquadRoleMap: squad entity ${victim.id} has no boons row for buff 740`);

        const noBoons = edited(native, d => {
            delete d.blocks.boons;
            d.coverage = { ...d.coverage, boons: 'not_computed' };
        });
        expect(() => classifySquadRoleMap(noBoons))
            .toThrow('axilog report is missing the "boons" block (coverage: not_computed)');
    });

    it('returns an empty map for a squadless report', () => {
        const native = loadNativeFixture();
        const empty = edited(native, d => { d.entities = d.entities.filter((e: any) => e.role !== 'squad'); });
        expect(classifySquadRoleMap(empty).size).toBe(0);
    });
});

/**
 * `computeRatio`'s zero-median contract, bound directly.
 *
 * The `OUTLIER_RATIO` arm is unreachable through `classifyFromMetrics` --
 * that caller takes every median over `values.filter(v => v > 0)`, so a
 * median of 0 means the whole column was non-positive and `value > 0` cannot
 * hold. It is DEFINED behaviour for a case made impossible by a filter two
 * functions away, which is why it is kept rather than deleted; a direct test
 * is the only thing that can fail when it changes.
 */
describe('computeRatio', () => {
    it('divides by a positive median', () => {
        expect(computeRatio(300, 100)).toBe(3);
        expect(computeRatio(0, 100)).toBe(0);
    });

    it('calls a positive value against a zero median an outlier, not infinity', () => {
        expect(OUTLIER_RATIO).toBe(2);
        expect(computeRatio(1, 0)).toBe(OUTLIER_RATIO);
        expect(computeRatio(1e9, 0)).toBe(OUTLIER_RATIO);
        expect(Number.isFinite(computeRatio(1, 0))).toBe(true);
    });

    it('is 0 when both the value and the median are absent', () => {
        expect(computeRatio(0, 0)).toBe(0);
    });

    it('is unreachable from classifyFromMetrics, which is why it needs this test', () => {
        // A whole column of zeros -- the only way to drive a median to 0 --
        // leaves every value non-positive too, so the outlier arm cannot
        // fire and every score is finite.
        const rows = [[0, 1, 0, 0, 0, 0], [0, 3, 0, 0, 0, 0], [0, 2, 0, 0, 0, 0]];
        const out = classifyFromMetrics(rows);
        expect(out.length).toBe(3);
        for (const c of out) {
            expect(Number.isFinite(c.supportScore)).toBe(true);
            expect(c.confidenceScore).toBeGreaterThanOrEqual(0);
            expect(c.confidenceScore).toBeLessThanOrEqual(1);
        }
    });

    /**
     * The `|| 1` spans, the other survivor in this file. They are NOT an
     * absence -- there is no field to name -- but a divide-by-zero guard on
     * computed values. Measured: a one-row squad is NOT enough to reach them
     * (its single score is 0.4 against a 0.5 threshold, so both spans are
     * 0.1); what is enough is every score landing exactly ON the threshold,
     * which happens when every score is 0 -- a squad that registered on none
     * of the six metrics. Without the `|| 1` that is 0/0 = NaN confidence.
     */
    it('is 0.1, not 0, for a one-row squad -- the span guard does not fire there', () => {
        const out = classifyFromMetrics([[100, 10, 50, 1000, 100000, 500]]);
        expect(out.length).toBe(1);
        expect(out[0].supportScore).toBeCloseTo(0.4, 10);
        expect(out[0].confidenceScore).toBe(1);
    });

    it('gives an all-zero squad zero confidence rather than NaN', () => {
        const out = classifyFromMetrics([[0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0]]);
        expect(out.map(c => c.supportScore)).toEqual([0, 0]);
        expect(out.map(c => c.confidenceScore)).toEqual([0, 0]);
        expect(out.every(c => !Number.isNaN(c.confidenceScore))).toBe(true);
    });
});
