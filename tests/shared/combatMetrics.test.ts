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
        const skillMap = {
            's1': { name: 'Skill A', icon: '', autoAttack: false },
            's2': { name: 'Skill B', icon: '', autoAttack: false },
            's3': { name: 'Skill C', icon: '', autoAttack: false },
        };
        const result = getTopSkillDamage(player, skillMap, 3);
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
