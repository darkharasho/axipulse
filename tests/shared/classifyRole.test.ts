import { describe, it, expect } from 'vitest';
import { classifySquadRoles } from '../../src/shared/classifyRole';
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
