// tests/shared/boonData.test.ts
import { describe, it, expect } from 'vitest';
import { extractBoonUptimes, extractBoonGeneration, WVW_BOON_IDS } from '../../src/shared/boonData';
import type { EiPlayer } from '../../src/shared/types';

function makePlayer(overrides: Partial<EiPlayer> = {}): EiPlayer {
    return {
        name: 'Test', account: 'Test.1234', profession: 'Guardian', elite_spec: 'Firebrand',
        group: 1, hasCommanderTag: false, notInSquad: false, isFake: false,
        activeTimes: [60000],
        dpsAll: [{ damage: 0, dps: 0, breakbarDamage: 0 }],
        statsAll: [{ downContribution: 0, distToCom: 0, stackDist: 0, appliedCrowdControl: 0, appliedCrowdControlDuration: 0 }],
        defenses: [{ damageTaken: 0, deadCount: 0, downCount: 0, dodgeCount: 0, blockedCount: 0, evadedCount: 0, missedCount: 0, invulnedCount: 0, interruptedCount: 0, receivedCrowdControl: 0, receivedCrowdControlDuration: 0, boonStrips: 0, boonStripsTime: 0 }],
        support: [{ condiCleanse: 0, condiCleanseSelf: 0, boonStrips: 0, boonStripsTime: 0 }],
        damage1S: [[]], targetDamage1S: [[]], totalDamageDist: [[]], rotation: [],
        buffUptimes: [
            { id: 740, buffData: [{ uptime: 85.5, generation: 500, overstack: 0, wasted: 0 }] },
            { id: 725, buffData: [{ uptime: 92.3, generation: 600, overstack: 0, wasted: 0 }] },
        ],
        selfBuffs: [
            { id: 740, buffData: [{ generation: 100, overstack: 0, wasted: 0 }] },
        ],
        groupBuffs: [
            { id: 740, buffData: [{ generation: 200, overstack: 0, wasted: 0 }] },
        ],
        squadBuffs: [
            { id: 740, buffData: [{ generation: 300, overstack: 0, wasted: 0 }] },
        ],
        ...overrides,
    } as EiPlayer;
}

describe('extractBoonUptimes', () => {
    it('extracts uptime for known boons', () => {
        const uptimes = extractBoonUptimes(makePlayer());
        const might = uptimes.find(u => u.id === 740);
        expect(might).toBeDefined();
        expect(might!.uptime).toBe(85.5);
    });

    it('filters out non-boon buffs', () => {
        const player = makePlayer({
            buffUptimes: [
                { id: 740, buffData: [{ uptime: 85, generation: 0, overstack: 0, wasted: 0 }] },
                { id: 99999, buffData: [{ uptime: 50, generation: 0, overstack: 0, wasted: 0 }] },
            ],
        });
        const uptimes = extractBoonUptimes(player);
        expect(uptimes.every(u => WVW_BOON_IDS.has(u.id))).toBe(true);
    });
});

describe('extractBoonGeneration', () => {
    it('extracts self/group/squad generation', () => {
        const gen = extractBoonGeneration(makePlayer());
        const might = gen.find(g => g.id === 740);
        expect(might).toBeDefined();
        expect(might!.selfGeneration).toBe(100);
        expect(might!.groupGeneration).toBe(200);
        expect(might!.squadGeneration).toBe(300);
    });
});
