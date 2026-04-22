// tests/shared/fightComposition.test.ts
import { describe, it, expect } from 'vitest';
import { extractPlayerFightData } from '../../src/shared/extractPlayerData';
import type { EiJson } from '../../src/shared/types';

function makeBase(): EiJson {
    return {
        fightName: 'Detailed WvW - Green Alpine Borderlands',
        durationMS: 30000,
        success: true,
        players: [{
            name: 'P1', account: 'A.1234', profession: 'Guardian', elite_spec: 'Firebrand',
            group: 1, hasCommanderTag: false, notInSquad: false, isFake: false,
            teamID: 10,
            activeTimes: [30000],
            dpsAll: [{ damage: 0, dps: 0, breakbarDamage: 0 }],
            statsAll: [{ downContribution: 0, distToCom: 0, stackDist: 0, appliedCrowdControl: 0, appliedCrowdControlDuration: 0 }],
            defenses: [{ damageTaken: 0, deadCount: 0, downCount: 0, dodgeCount: 0, blockedCount: 0, evadedCount: 0, missedCount: 0, invulnedCount: 0, interruptedCount: 0, receivedCrowdControl: 0, receivedCrowdControlDuration: 0, boonStrips: 0, boonStripsTime: 0 }],
            support: [{ condiCleanse: 0, condiCleanseSelf: 0, boonStrips: 0, boonStripsTime: 0 }],
            damage1S: [[]], totalDamageDist: [[]], totalDamageTaken: [[]], rotation: [],
        }],
        targets: [],
        skillMap: {},
        buffMap: {},
    };
}

describe('fightComposition', () => {
    it('counts squad and ally players', () => {
        const json = makeBase();
        json.players.push({
            ...json.players[0],
            name: 'P2', account: 'B.1234', notInSquad: true, teamID: 10,
        });
        const result = extractPlayerFightData(json, 1, 1000);
        expect(result.fightComposition.squadCount).toBe(1);
        expect(result.fightComposition.allyCount).toBe(1);
    });

    it('counts enemies and groups by team', () => {
        const json = makeBase();
        json.targets = [
            { name: 'E1', enemyPlayer: true, isFake: false, teamID: 20, totalDamageDist: [], totalDamageTaken: [] } as any,
            { name: 'E2', enemyPlayer: true, isFake: false, teamID: 20, totalDamageDist: [], totalDamageTaken: [] } as any,
            { name: 'E3', enemyPlayer: true, isFake: false, teamID: 30, totalDamageDist: [], totalDamageTaken: [] } as any,
        ];
        const result = extractPlayerFightData(json, 1, 1000);
        expect(result.fightComposition.enemyCount).toBe(3);
        expect(result.fightComposition.teamBreakdown).toHaveLength(2);
        expect(result.fightComposition.teamBreakdown[0]).toEqual({ teamId: '20', count: 2 });
        expect(result.fightComposition.teamBreakdown[1]).toEqual({ teamId: '30', count: 1 });
    });

    it('excludes ally team IDs from enemy breakdown', () => {
        const json = makeBase(); // squad player has teamID: 10
        json.targets = [
            { name: 'E1', enemyPlayer: true, isFake: false, teamID: 10, totalDamageDist: [], totalDamageTaken: [] } as any,
            { name: 'E2', enemyPlayer: true, isFake: false, teamID: 20, totalDamageDist: [], totalDamageTaken: [] } as any,
        ];
        const result = extractPlayerFightData(json, 1, 1000);
        expect(result.fightComposition.enemyCount).toBe(1);
        expect(result.fightComposition.teamBreakdown).toHaveLength(1);
        expect(result.fightComposition.teamBreakdown[0].teamId).toBe('20');
    });

    it('skips fake and non-enemy targets', () => {
        const json = makeBase();
        json.targets = [
            { name: 'Golem', enemyPlayer: false, isFake: false, teamID: 99, totalDamageDist: [], totalDamageTaken: [] } as any,
            { name: 'Fake', enemyPlayer: true,  isFake: true,  teamID: 99, totalDamageDist: [], totalDamageTaken: [] } as any,
        ];
        const result = extractPlayerFightData(json, 1, 1000);
        expect(result.fightComposition.enemyCount).toBe(0);
    });

    it('builds squad class counts using elite_spec', () => {
        const json = makeBase();
        json.players.push({
            ...json.players[0],
            name: 'P2', account: 'B.1234', elite_spec: 'Firebrand',
        });
        const result = extractPlayerFightData(json, 1, 1000);
        expect(result.fightComposition.squadClassCounts['Firebrand']).toBe(2);
    });

    it('limits teamBreakdown to top 3 teams', () => {
        const json = makeBase();
        json.targets = [
            { name: 'E1', enemyPlayer: true, isFake: false, teamID: 20, totalDamageDist: [], totalDamageTaken: [] } as any,
            { name: 'E2', enemyPlayer: true, isFake: false, teamID: 30, totalDamageDist: [], totalDamageTaken: [] } as any,
            { name: 'E3', enemyPlayer: true, isFake: false, teamID: 40, totalDamageDist: [], totalDamageTaken: [] } as any,
            { name: 'E4', enemyPlayer: true, isFake: false, teamID: 50, totalDamageDist: [], totalDamageTaken: [] } as any,
        ];
        const result = extractPlayerFightData(json, 1, 1000);
        expect(result.fightComposition.teamBreakdown).toHaveLength(3);
    });

    it('groups enemies with no teamID under unknown', () => {
        const json = makeBase();
        json.targets = [
            { name: 'E1', enemyPlayer: true, isFake: false, totalDamageDist: [], totalDamageTaken: [] } as any,
        ];
        const result = extractPlayerFightData(json, 1, 1000);
        expect(result.fightComposition.teamBreakdown[0].teamId).toBe('unknown');
    });
});
