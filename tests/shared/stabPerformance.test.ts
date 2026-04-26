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

describe('party identification', () => {
    it('returns group-mates excluding local player and excluding notInSquad/isFake', () => {
        const local = makePlayer({ name: 'Local', account: 'Local.1', group: 2 });
        const mate1 = makePlayer({ name: 'Mate1', account: 'Mate1.2', group: 2, profession: 'Warrior' });
        const mate2 = makePlayer({ name: 'Mate2', account: 'Mate2.3', group: 2, profession: 'Engineer' });
        const otherGroup = makePlayer({ name: 'Other', account: 'Other.4', group: 3 });
        const notInSquad = makePlayer({ name: 'Pug', account: 'Pug.5', group: 2, notInSquad: true });
        const fake = makePlayer({ name: 'Fake', account: 'Fake.6', group: 2, isFake: true });
        const json = makeJson({ players: [local, mate1, mate2, otherGroup, notInSquad, fake] });

        const result = computeStabPerformance(json, local, 1000);
        const keys = result!.partyMembers.map(m => m.key).sort();
        expect(keys).toEqual(['Mate1.2', 'Mate2.3']);
        expect(result!.partyMembers[0].displayName).toBe('Mate1');
        expect(result!.partyMembers[0].profession).toBe('Warrior');
    });

    it('returns empty partyMembers when local player has group 0', () => {
        const local = makePlayer({ group: 0 });
        const mate = makePlayer({ name: 'Mate', account: 'Mate.2', group: 0 });
        const json = makeJson({ players: [local, mate] });
        const result = computeStabPerformance(json, local, 1000);
        expect(result!.partyMembers).toEqual([]);
    });
});

describe('party member stab stacks', () => {
    it('integrates stack-states into bucket averages', () => {
        // Mate has 5 stacks for first 2s, 0 for next 1s, 3 for next 1s, 0 thereafter, fight 5s
        const mate = makePlayer({
            name: 'M', account: 'M.2', group: 1,
            buffUptimes: [{
                id: 1122,
                buffData: [{ uptime: 0, generation: 0, overstack: 0, wasted: 0 }],
                states: [[0, 5], [2000, 0], [3000, 3], [4000, 0]],
            }],
        });
        const local = makePlayer({ group: 1 });
        const json = makeJson({ durationMS: 5000, players: [local, mate] });
        const result = computeStabPerformance(json, local, 1000);
        const stacks = result!.partyMembers[0].stacks;
        // Bucket 0 [0,1000): all at 5 → avg 5
        // Bucket 1 [1000,2000): all at 5 → avg 5
        // Bucket 2 [2000,3000): all at 0 → avg 0
        // Bucket 3 [3000,4000): all at 3 → avg 3
        // Bucket 4 [4000,5000): all at 0 → avg 0
        expect(stacks).toEqual([5, 5, 0, 3, 0]);
    });

    it('handles state changes that span bucket boundaries', () => {
        // 5 stacks for 500ms, then 0 — bucket 0 [0,1000) avg = (5*500 + 0*500)/1000 = 2.5
        const mate = makePlayer({
            name: 'M', account: 'M.2', group: 1,
            buffUptimes: [{
                id: 1122,
                buffData: [{ uptime: 0, generation: 0, overstack: 0, wasted: 0 }],
                states: [[0, 5], [500, 0]],
            }],
        });
        const local = makePlayer({ group: 1 });
        const json = makeJson({ durationMS: 1000, players: [local, mate] });
        const result = computeStabPerformance(json, local, 1000);
        expect(result!.partyMembers[0].stacks).toEqual([2.5]);
    });

    it('returns zero stacks when buff never appears', () => {
        const mate = makePlayer({ name: 'M', account: 'M.2', group: 1, buffUptimes: [] });
        const local = makePlayer({ group: 1 });
        const json = makeJson({ durationMS: 3000, players: [local, mate] });
        const result = computeStabPerformance(json, local, 1000);
        expect(result!.partyMembers[0].stacks).toEqual([0, 0, 0]);
    });
});

describe('party member deaths', () => {
    it('buckets deaths by cast time', () => {
        const mate = makePlayer({
            name: 'M', account: 'M.2', group: 1,
            rotation: [{ id: -28, skills: [{ castTime: 1500, duration: 0 }, { castTime: 4200, duration: 0 }] }],
        });
        const local = makePlayer({ group: 1 });
        const json = makeJson({ durationMS: 5000, players: [local, mate] });
        const result = computeStabPerformance(json, local, 1000);
        expect(result!.partyMembers[0].deaths).toEqual([0, 1, 0, 0, 1]);
    });

    it('returns all zeros when there is no death skill', () => {
        const mate = makePlayer({ name: 'M', account: 'M.2', group: 1, rotation: [] });
        const local = makePlayer({ group: 1 });
        const json = makeJson({ durationMS: 3000, players: [local, mate] });
        const result = computeStabPerformance(json, local, 1000);
        expect(result!.partyMembers[0].deaths).toEqual([0, 0, 0]);
    });
});
