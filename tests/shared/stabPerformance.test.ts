import { describe, it, expect } from 'vitest';
import { computeStabPerformance } from '../../src/shared/stabPerformance';
import type { EiJson, EiPlayer } from '../../src/shared/types';

function makePlayer(overrides: Partial<EiPlayer> = {}): EiPlayer {
    return {
        name: 'Local', account: 'Local.1111', profession: 'Guardian', elite_spec: 'Firebrand',
        group: 1, hasCommanderTag: false, notInSquad: false, isFake: false,
        activeTimes: [10000],
        dpsAll: [{ damage: 0, dps: 0, breakbarDamage: 0 }],
        statsAll: [{ downContribution: 0, distToCom: 0, stackDist: 0, appliedCrowdControl: 0, appliedCrowdControlDuration: 0 }],
        defenses: [{ damageTaken: 0, deadCount: 0, downCount: 0, dodgeCount: 0, blockedCount: 0, evadedCount: 0, missedCount: 0, invulnedCount: 0, interruptedCount: 0, receivedCrowdControl: 0, receivedCrowdControlDuration: 0, boonStrips: 0, boonStripsTime: 0 }],
        support: [{ condiCleanse: 0, condiCleanseSelf: 0, boonStrips: 0, boonStripsTime: 0 }],
        damage1S: [[]], targetDamage1S: [[]], totalDamageDist: [[]], totalDamageTaken: [[]], rotation: [],
        ...overrides,
    } as EiPlayer;
}

function makeJson(overrides: Partial<EiJson> = {}): EiJson {
    return {
        fightName: 'Test', durationMS: 10000, success: false,
        players: [], targets: [], skillMap: {}, buffMap: {},
        ...overrides,
    } as EiJson;
}

describe('computeStabPerformance', () => {
    it('returns null when fight duration is zero', () => {
        const local = makePlayer();
        const json = makeJson({ durationMS: 0, players: [local] });
        expect(computeStabPerformance(json, local, 1000)).toBeNull();
    });

    it('produces correct bucket count and labels for 1s buckets over 10s', () => {
        const local = makePlayer();
        const json = makeJson({ players: [local] });
        const result = computeStabPerformance(json, local, 1000);
        expect(result).not.toBeNull();
        expect(result!.bucketSizeMs).toBe(1000);
        expect(result!.bucketCount).toBe(10);
        expect(result!.buckets[0]).toEqual({ startMs: 0, label: '0s' });
        expect(result!.buckets[9]).toEqual({ startMs: 9000, label: '9s' });
    });

    it('floors bucket size to 1s minimum', () => {
        const local = makePlayer();
        const json = makeJson({ players: [local] });
        const result = computeStabPerformance(json, local, 250);
        expect(result!.bucketSizeMs).toBe(1000);
    });

    it('rounds up partial trailing bucket', () => {
        const local = makePlayer();
        const json = makeJson({ durationMS: 10500, players: [local] });
        const result = computeStabPerformance(json, local, 2000);
        expect(result!.bucketCount).toBe(6); // ceil(10500/2000)
    });
});
