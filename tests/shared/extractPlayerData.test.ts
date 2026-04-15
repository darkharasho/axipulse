// tests/shared/extractPlayerData.test.ts
import { describe, it, expect } from 'vitest';
import { extractPlayerFightData } from '../../src/shared/extractPlayerData';
import type { EiJson } from '../../src/shared/types';

function makeMinimalEiJson(): EiJson {
    return {
        fightName: 'Detailed WvW - Green Alpine Borderlands',
        durationMS: 63000,
        success: true,
        players: [{
            name: 'TestPlayer', account: 'Test.1234', profession: 'Guardian', elite_spec: 'Firebrand',
            group: 1, hasCommanderTag: false, notInSquad: false, isFake: false,
            activeTimes: [63000],
            dpsAll: [{ damage: 100000, dps: 1587, breakbarDamage: 200 }],
            statsAll: [{ downContribution: 5, distToCom: 180, stackDist: 200, appliedCrowdControl: 3, appliedCrowdControlDuration: 4500 }],
            defenses: [{ damageTaken: 30000, deadCount: 0, downCount: 1, dodgeCount: 5, blockedCount: 8, evadedCount: 4, missedCount: 2, invulnedCount: 1, interruptedCount: 0, receivedCrowdControl: 2, receivedCrowdControlDuration: 1500, boonStrips: 3, boonStripsTime: 1000 }],
            support: [{ condiCleanse: 10, condiCleanseSelf: 4, boonStrips: 15, boonStripsTime: 5000 }],
            damage1S: [[0, 10000, 30000, 60000, 100000]], targetDamage1S: [[0, 9000, 28000, 58000, 98000]],
            totalDamageDist: [[{ id: 1, name: 'Sword', totalDamage: 60000, connectedHits: 50, min: 500, max: 2000 }]],
            buffUptimes: [{ id: 740, buffData: [{ uptime: 80, generation: 0, overstack: 0, wasted: 0 }] }],
            selfBuffs: [], groupBuffs: [], squadBuffs: [], rotation: [],
            combatReplayData: { positions: [[100, 100], [105, 100]], down: [[15000, 15000]], dead: [] },
        }],
        targets: [],
        skillMap: {},
        buffMap: {},
        combatReplayMetaData: { inchToPixel: 0.02, pollingRate: 150 },
    };
}

describe('extractPlayerFightData', () => {
    it('extracts fight metadata', () => {
        const result = extractPlayerFightData(makeMinimalEiJson(), 1, 1000);
        expect(result.mapName).toBe('Green BL');
        expect(result.durationFormatted).toBe('1:03');
        expect(result.profession).toBe('Guardian');
        expect(result.eliteSpec).toBe('Firebrand');
    });

    it('extracts damage stats', () => {
        const result = extractPlayerFightData(makeMinimalEiJson(), 1, 1000);
        expect(result.damage.totalDamage).toBe(100000);
        expect(result.damage.dps).toBe(1587);
        expect(result.damage.downContribution).toBe(5);
    });

    it('extracts defense stats', () => {
        const result = extractPlayerFightData(makeMinimalEiJson(), 1, 1000);
        expect(result.defense.deaths).toBe(0);
        expect(result.defense.downs).toBe(1);
        expect(result.defense.damageTaken).toBe(30000);
    });

    it('extracts support stats', () => {
        const result = extractPlayerFightData(makeMinimalEiJson(), 1, 1000);
        expect(result.support.boonStrips).toBe(15);
        expect(result.support.cleanses).toBe(14);
    });

    it('generates fight label with landmark', () => {
        const result = extractPlayerFightData(makeMinimalEiJson(), 3, 1000);
        expect(result.fightLabel).toContain('F3');
        expect(result.fightLabel).toContain('Green BL');
        expect(result.fightLabel).toContain('1:03');
    });

    it('extracts health percent timeline', () => {
        const json = makeMinimalEiJson();
        json.players[0].healthPercents = [[0, 100], [5000, 80], [10000, 0]];
        const result = extractPlayerFightData(json, 1, 1000);
        expect(result.timeline.healthPercent).toEqual([[0, 100], [5000, 80], [10000, 0]]);
    });

    it('extracts offensive boon state timelines', () => {
        const json = makeMinimalEiJson();
        json.players[0].buffUptimes = [
            { id: 740, buffData: [{ uptime: 80, generation: 0, overstack: 0, wasted: 0 }], states: [[0, 15], [5000, 25]] },
        ];
        json.buffMap = { 'b740': { name: 'Might', stacking: 'intensity', icon: 'https://example.com/might.png' } };
        const result = extractPlayerFightData(json, 1, 1000);
        expect(result.timeline.offensiveBoons[740]).toBeDefined();
        expect(result.timeline.offensiveBoons[740].name).toBe('Might');
        expect(result.timeline.offensiveBoons[740].icon).toBe('https://example.com/might.png');
        expect(result.timeline.offensiveBoons[740].states).toEqual([[0, 15], [5000, 25]]);
    });

    it('extracts defensive boon state timelines', () => {
        const json = makeMinimalEiJson();
        json.players[0].buffUptimes = [
            { id: 1122, buffData: [{ uptime: 50, generation: 0, overstack: 0, wasted: 0 }], states: [[0, 1], [3000, 0]] },
        ];
        json.buffMap = { 'b1122': { name: 'Stability', stacking: 'stacking', icon: 'https://example.com/stab.png' } };
        const result = extractPlayerFightData(json, 1, 1000);
        expect(result.timeline.defensiveBoons[1122]).toBeDefined();
        expect(result.timeline.defensiveBoons[1122].name).toBe('Stability');
    });

    it('extracts condition state timelines when present', () => {
        const json = makeMinimalEiJson();
        json.players[0].buffUptimes = [
            { id: 722, buffData: [{ uptime: 10, generation: 0, overstack: 0, wasted: 0 }], states: [[2000, 1], [4000, 0]] },
        ];
        json.buffMap = { 'b722': { name: 'Chilled', stacking: 'duration', icon: 'https://example.com/chill.png' } };
        const result = extractPlayerFightData(json, 1, 1000);
        expect(result.timeline.softCC[722]).toBeDefined();
        expect(result.timeline.softCC[722].name).toBe('Chilled');
    });

    it('defaults healthPercent to empty array when not available', () => {
        const json = makeMinimalEiJson();
        delete json.players[0].healthPercents;
        const result = extractPlayerFightData(json, 1, 1000);
        expect(result.timeline.healthPercent).toEqual([]);
    });
});
