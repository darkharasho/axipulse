import { describe, it, expect } from 'vitest';
import { classifySquadRoles, classifySquadRoleMap, classifyRole } from '../../src/shared/classifyRole';
import { localPlayerId } from '../../src/shared/report';
import type { ReportV1 } from '../../src/shared/report';
import { WVW_BOON_IDS } from '../../src/shared/boonData';
import type { EiPlayer } from '../../src/shared/types';
import { loadEiFixture, loadNativeFixture } from './oracle';

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
        const eiRoles = classifySquadRoles(ei.players.filter(p => !p.notInSquad && !p.isFake));
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
