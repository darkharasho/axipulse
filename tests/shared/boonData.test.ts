// tests/shared/boonData.test.ts
import { describe, it, expect } from 'vitest';
import {
    extractBoonUptimes, extractBoonGeneration,
    WVW_BOON_IDS, OFFENSIVE_BOON_IDS, DEFENSIVE_BOON_IDS, HARD_CC_IDS, SOFT_CC_IDS, CONDITION_NAMES,
} from '../../src/shared/boonData';
import { extractBoonUptimesEi, extractBoonGenerationEi } from './ei/boonData';
import type { EiPlayer } from './ei/types';
import { squadMembers } from '../../src/shared/report';
import { loadEiFixture, loadNativeFixture } from './oracle';

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

/**
 * Fix round 1, finding 4. `HARD_CC_IDS` carried `785` for Fear. That id
 * exists in NEITHER document -- native's `catalogs.buffs` has no `785` and
 * EI's `buffMap` has no `b785`; both define `791` as Fear. The consequence
 * was a live silent drop on the still-active EI path: `buildTimeline`'s hard
 * CC lane filters `player.buffUptimes` by `ALL_TRACKED_BUFF_IDS`, so every
 * Fear timeline in the log was discarded. This pins the corrected id against
 * both documents rather than against the constant itself.
 */
describe('HARD_CC_IDS Fear id', () => {
    it('uses 791, the id both documents actually define for Fear', () => {
        const ei = loadEiFixture();
        const native = loadNativeFixture();

        expect(HARD_CC_IDS.has(791), 'Fear (791) is tracked').toBe(true);
        expect(HARD_CC_IDS.has(785), 'the phantom id 785 is not tracked').toBe(false);

        // The oracle: both documents, not the constant.
        expect(native.catalogs.buffs['785'], 'native catalog entry for 785').toBeUndefined();
        expect(ei.buffMap?.['b785'], 'EI buffMap entry for b785').toBeUndefined();
        expect(native.catalogs.buffs['791']?.name).toBe('Fear');
        expect(ei.buffMap?.['b791']?.name).toBe('Fear');

        // And the data the wrong id was dropping: EI players carrying a Fear
        // state timeline. Vacuity guard -- if this were 0 the fix would be
        // untestable and the id would be a coin flip.
        const withFear = ei.players.filter(p => (p.buffUptimes ?? [])
            .some(b => b.id === 791 && (b.states?.length ?? 0) > 0));
        expect(withFear.length, 'EI players whose Fear timeline the wrong id dropped').toBe(7);
    });
});


describe('extractBoonUptimes', () => {
    it('extracts uptime for known boons', () => {
        const uptimes = extractBoonUptimesEi(makePlayer());
        const might = uptimes.find(u => u.id === 740);
        expect(might).toBeDefined();
        expect(might!.uptime).toBe(85.5);
    });

    it('tags intensity-stacking boons (Might, Stability)', () => {
        const player = makePlayer({
            buffUptimes: [
                { id: 740, buffData: [{ uptime: 15, generation: 0, overstack: 0, wasted: 0 }] },
                { id: 1122, buffData: [{ uptime: 2.3, generation: 0, overstack: 0, wasted: 0 }] },
                { id: 725, buffData: [{ uptime: 92, generation: 0, overstack: 0, wasted: 0 }] },
            ],
        });
        const uptimes = extractBoonUptimesEi(player);
        expect(uptimes.find(u => u.id === 740)!.stacking).toBe('intensity');
        expect(uptimes.find(u => u.id === 1122)!.stacking).toBe('intensity');
        expect(uptimes.find(u => u.id === 725)!.stacking).toBe('duration');
    });

    it('filters out non-boon buffs', () => {
        const player = makePlayer({
            buffUptimes: [
                { id: 740, buffData: [{ uptime: 85, generation: 0, overstack: 0, wasted: 0 }] },
                { id: 99999, buffData: [{ uptime: 50, generation: 0, overstack: 0, wasted: 0 }] },
            ],
        });
        const uptimes = extractBoonUptimesEi(player);
        expect(uptimes.every(u => WVW_BOON_IDS.has(u.id))).toBe(true);
    });
});

describe('extractBoonGeneration', () => {
    it('extracts self/group/squad generation', () => {
        const gen = extractBoonGenerationEi(makePlayer());
        const might = gen.find(g => g.id === 740);
        expect(might).toBeDefined();
        expect(might!.selfGeneration).toBe(100);
        expect(might!.groupGeneration).toBe(200);
        expect(might!.squadGeneration).toBe(300);
    });
});

describe('boon and condition ID sets', () => {
    it('has offensive boon IDs as subset of WVW_BOON_IDS', () => {
        for (const id of OFFENSIVE_BOON_IDS) {
            expect(WVW_BOON_IDS.has(id)).toBe(true);
        }
    });

    it('has defensive boon IDs as subset of WVW_BOON_IDS', () => {
        for (const id of DEFENSIVE_BOON_IDS) {
            expect(WVW_BOON_IDS.has(id)).toBe(true);
        }
    });

    it('offensive boons include Might, Fury, Quickness, Alacrity', () => {
        expect(OFFENSIVE_BOON_IDS.size).toBe(4);
        expect(OFFENSIVE_BOON_IDS.has(740)).toBe(true);
        expect(OFFENSIVE_BOON_IDS.has(725)).toBe(true);
        expect(OFFENSIVE_BOON_IDS.has(1187)).toBe(true);
        expect(OFFENSIVE_BOON_IDS.has(30328)).toBe(true);
    });

    it('defensive boons include Stability, Protection, Resistance, Aegis', () => {
        expect(DEFENSIVE_BOON_IDS.size).toBe(4);
        expect(DEFENSIVE_BOON_IDS.has(1122)).toBe(true);
        expect(DEFENSIVE_BOON_IDS.has(717)).toBe(true);
        expect(DEFENSIVE_BOON_IDS.has(26980)).toBe(true);
        expect(DEFENSIVE_BOON_IDS.has(743)).toBe(true);
    });

    it('hard CC IDs are defined', () => {
        expect(HARD_CC_IDS.size).toBeGreaterThan(0);
        for (const id of HARD_CC_IDS) {
            expect(CONDITION_NAMES[id]).toBeDefined();
        }
    });

    it('soft CC IDs are defined', () => {
        expect(SOFT_CC_IDS.size).toBeGreaterThan(0);
        for (const id of SOFT_CC_IDS) {
            expect(CONDITION_NAMES[id]).toBeDefined();
        }
    });
});

describe('extractBoonUptimes / extractBoonGeneration (native)', () => {
    it('returns exactly the WVW_BOON_IDS present in blocks.boons.by_entity[id] for every squad member', () => {
        const native = loadNativeFixture();
        let checkedAny = 0;
        for (const e of squadMembers(native)) {
            checkedAny++;
            const boonsRow = native.blocks.boons!.by_entity[String(e.id)];
            const expectedIds = [...WVW_BOON_IDS].filter(id => boonsRow[String(id)] !== undefined).sort((a, b) => a - b);

            const uptimes = extractBoonUptimes(native, e.id);
            expect(uptimes.map(u => u.id).sort((a, b) => a - b)).toEqual(expectedIds);
            for (const u of uptimes) {
                expect(u.name.length).toBeGreaterThan(0);
                expect(Number.isFinite(u.uptime)).toBe(true);
                expect(['duration', 'intensity']).toContain(u.stacking);
            }

            const generation = extractBoonGeneration(native, e.id);
            expect(generation.map(g => g.id).sort((a, b) => a - b)).toEqual(expectedIds);
        }
        expect(checkedAny).toBe(46);
    });

    it('throws on an unknown entity id rather than returning blanks', () => {
        const native = loadNativeFixture();
        // Anchored to each function's own first guard: both used to be bare
        // `toThrow()`s, which would have passed if either function threw for
        // some entirely unrelated reason.
        expect(() => extractBoonUptimes(native, 999_999))
            .toThrow('extractBoonUptimes: no boons row for entity 999999');
        expect(() => extractBoonGeneration(native, 999_999))
            .toThrow('extractBoonGeneration: no boons row for entity 999999');
    });

    describe('the catalog is the only source of truth', () => {
        function withoutBuff(buffId: number) {
            const r = loadNativeFixture();
            const buffs = { ...r.catalogs.buffs };
            delete buffs[String(buffId)];
            return { ...r, catalogs: { ...r.catalogs, buffs } };
        }

        it('makes extractBoonGeneration throw for a buff the catalog does not carry', () => {
            // Previously `def?.name ?? BOON_NAMES[buffId] ?? \`Boon ${id}\``:
            // the hardcoded table silently won, so the two halves of the same
            // block disagreed about whether this absence was an error.
            const native = loadNativeFixture();
            const id = squadMembers(native)[0].id;
            expect(() => extractBoonGeneration(withoutBuff(740), id))
                .toThrow(`extractBoonGeneration: catalogs.buffs[740] is missing for entity ${id}`);
        });

        it('makes extractBoonUptimes throw for the same absence', () => {
            const native = loadNativeFixture();
            const id = squadMembers(native)[0].id;
            expect(() => extractBoonUptimes(withoutBuff(740), id))
                .toThrow(/catalogs\.buffs\[740\] has no `stacking`/);
        });
    });
});
