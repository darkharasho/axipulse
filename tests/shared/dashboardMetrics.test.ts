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
