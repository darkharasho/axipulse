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
            // `start: 890` is deliberately OFF the 150ms poll grid. GW2EI's
            // own JSON model documents `positions[i]`'s time as
            // `ceil(Start / PollingRate) * PollingRate + i * PollingRate`, so
            // the first sample here is at 900, not 890 and not 750. Every
            // `combatReplayData` EI emits carries `start` (non-nullable
            // `long`, and EI's serializer omits nulls only), so a synthetic
            // player without it would not be a smaller fixture -- it would be
            // an impossible one.
            combatReplayData: { positions: [[100, 100], [105, 100]], down: [[15000, 15000]], dead: [], start: 890 },
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

    it('includes roleClassification', () => {
        const result = extractPlayerFightData(makeMinimalEiJson(), 1, 1000);
        expect(result.roleClassification).toBeDefined();
        expect(result.roleClassification.role).toBe('damage');
        expect(result.roleClassification.confidenceScore).toBeGreaterThanOrEqual(0);
        expect(result.roleClassification.confidenceScore).toBeLessThanOrEqual(1);
    });

    it('includes damageTakenRank in squadContext', () => {
        const result = extractPlayerFightData(makeMinimalEiJson(), 1, 1000);
        expect(result.squadContext.damageTakenRank).toBe(1);
    });

    it('computes distanceToTag as null for single player with no commander', () => {
        const result = extractPlayerFightData(makeMinimalEiJson(), 1, 1000);
        expect(result.distanceToTag).toBeNull();
    });

    /**
     * The EI producer's half of `SquadMemberMovement.positionsStartMs`.
     *
     * SYNTHETIC on purpose, and it has to be: the frozen `wvw.ei.json`
     * carries no `combatReplayMetaData` and no `combatReplayData` on any of
     * its 47 players or 47 targets, so `buildMovementData` returns `null`
     * for the whole log and cannot exercise this field at all. Ruling 9-A
     * ratified `positionsStartMs` on the condition that BOTH producers were
     * verified; the native one is oracled against the raw tracks in
     * `tests/shared/extract/movement.test.ts`, and this is the other one.
     *
     * The value is NOT `start` verbatim. GW2EI's own JSON model documents
     * `positions[i]`'s time as
     * `ceil(Start / PollingRate) * PollingRate + i * PollingRate`, so with
     * `start: 890` on a 150ms poll grid the first sample is at 900. Raw
     * would give 890 and `floor` (which `computeDistancesPerBucketEi` still
     * uses for the same quantity) would give 750.
     */
    it('carries GW2EI\'s combat-replay start, rounded UP to the poll grid', () => {
        const json = makeMinimalEiJson();
        const result = extractPlayerFightData(json, 1, 1000);
        const member = result.movementData!.members.find(m => m.account === 'Test.1234')!;
        expect(json.combatReplayMetaData!.pollingRate).toBe(150);
        expect(json.players[0].combatReplayData!.start).toBe(890);
        expect(member.positionsStartMs).toBe(900);
        expect(result.movementData!.pollingRate).toBe(150);
        expect(result.movementData!.inchToPixel).toBe(0.02);

        // Already on the grid: unchanged, so the rounding is not a constant.
        const onGrid = makeMinimalEiJson();
        onGrid.players[0].combatReplayData!.start = 4500;
        expect(extractPlayerFightData(onGrid, 1, 1000).movementData!.members[0].positionsStartMs)
            .toBe(4500);
        // A late joiner keeps their own start rather than being folded to 0.
        const late = makeMinimalEiJson();
        late.players[0].combatReplayData!.start = 61000;
        expect(extractPlayerFightData(late, 1, 1000).movementData!.members[0].positionsStartMs)
            .toBe(61050);
    });

    /**
     * No `?? 0`, and no `?? 300` / `?? 1` on the two replay scalars either.
     * `Start` is a non-nullable `long` and `PollingRate`/`InchToPixel` are a
     * non-nullable `int`/`float` in EI's model, and EI's serializer is
     * configured to omit NULLS only -- so all three are present whenever the
     * enclosing object is. Missing them means a broken document, and
     * defaulting would silently assert "the track began at fight start" /
     * "the poll grid was 300ms" / "one pixel per inch".
     */
    it('throws rather than defaulting when EI\'s replay scalars are missing', () => {
        const noStart = makeMinimalEiJson();
        delete noStart.players[0].combatReplayData!.start;
        expect(() => extractPlayerFightData(noStart, 1, 1000)).toThrow(/no `start`/);

        const noMeta = makeMinimalEiJson();
        delete noMeta.combatReplayMetaData;
        expect(() => extractPlayerFightData(noMeta, 1, 1000))
            .toThrow(/no\s+combatReplayMetaData\.pollingRate/);

        // ... but a log with no combat replay at all is still `null`, not a
        // throw -- that is the frozen fixture's own shape.
        const noReplay = makeMinimalEiJson();
        delete noReplay.combatReplayMetaData;
        delete noReplay.players[0].combatReplayData;
        expect(extractPlayerFightData(noReplay, 1, 1000).movementData).toBeNull();
    });

    it('computes distanceToTag stats when commander exists', () => {
        const json = makeMinimalEiJson();
        json.players[0].hasCommanderTag = true;
        const follower = {
            ...json.players[0],
            name: 'Follower', account: 'Follower.5678',
            hasCommanderTag: false,
            statsAll: [{ downContribution: 0, distToCom: 250, stackDist: 200, appliedCrowdControl: 0, appliedCrowdControlDuration: 0 }],
            combatReplayData: { positions: [[120, 120], [130, 130]] as [number, number][], down: [] as [number, number][], dead: [] as [number, number][], start: 0 },
        };
        json.players.push(follower as any);
        json.recordedAccountBy = 'Follower.5678';
        const result = extractPlayerFightData(json, 1, 1000);
        expect(result.distanceToTag).not.toBeNull();
        expect(result.distanceToTag!.average).toBeGreaterThanOrEqual(0);
        expect(result.distanceToTag!.median).toBeGreaterThanOrEqual(0);
    });
});
