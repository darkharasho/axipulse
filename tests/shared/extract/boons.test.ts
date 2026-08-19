import { describe, it, expect } from 'vitest';
import { extractBoons } from '../../../src/shared/extract/boons';
import { computeBoonPerformance, STABILITY_BUFF_ID, MIGHT_BUFF_ID } from '../../../src/shared/boonPerformance';
import { localPlayerId, squadMembers } from '../../../src/shared/report';
import type { ReportV1 } from '../../../src/shared/report';
import { WVW_BOON_IDS } from '../../../src/shared/boonData';
import { loadEiFixture, loadNativeFixture } from '../oracle';

/**
 * The EXACT set of (member, buff, scope) generation figures where EI and
 * native disagree by more than `GEN_TOLERANCE`. Pinned rather than absorbed
 * into a loose tolerance so the suite fails if the divergence widens or
 * spreads to a boon that is currently clean.
 *
 * Ruled on by the reviewer after Task 7: this divergence is REAL, not an
 * oracle artifact. The per-member TOTALS agree to <0.1% and sum-over-sources
 * equals the total on both sides -- only the SPLIT among concurrent sources
 * differs, because EI and axilog resolve the overlapping-source queue
 * differently. Hence Regeneration (718), the longest-duration and most
 * heavily overlapped boon here, dominates: 38 of these 46 entries.
 *
 * Currently clean and expected to STAY clean: Aegis (743), Vigor (726),
 * Alacrity (30328), Might (740), Stability (1122).
 */
const GENERATION_MISMATCHES = [
    'Anon150.6550:718:group',
    'Anon150.6550:718:self',
    'Anon150.6550:718:squad',
    'Anon150.6550:719:self',
    'Anon154.6698:725:self',
    'Anon155.6735:718:group',
    'Anon155.6735:718:self',
    'Anon158.6846:718:group',
    'Anon158.6846:718:self',
    'Anon158.6846:718:squad',
    'Anon159.6883:718:self',
    'Anon160.6920:719:group',
    'Anon161.6957:718:group',
    'Anon161.6957:718:self',
    'Anon162.6994:718:group',
    'Anon162.6994:718:self',
    'Anon164.7068:718:squad',
    'Anon165.7105:718:self',
    'Anon166.7142:718:group',
    'Anon166.7142:718:squad',
    'Anon169.7253:718:group',
    'Anon169.7253:718:self',
    'Anon170.7290:725:group',
    'Anon171.7327:718:group',
    'Anon171.7327:718:self',
    'Anon171.7327:718:squad',
    'Anon176.7512:718:group',
    'Anon177.7549:718:group',
    'Anon177.7549:718:self',
    'Anon178.7586:718:group',
    'Anon179.7623:718:group',
    'Anon180.7660:718:self',
    'Anon184.7808:718:group',
    'Anon184.7808:718:squad',
    'Anon185.7845:718:group',
    'Anon185.7845:718:self',
    'Anon187.7919:718:self',
    'Anon189.7993:1187:self',
    'Anon189.7993:26980:self',
    'Anon189.7993:717:self',
    'Anon189.7993:873:self',
    'Anon195.8215:718:group',
    'Anon195.8215:718:self',
    'Anon195.8215:718:squad',
    'Anon209.8733:718:group',
    'Anon209.8733:718:self',
];

const GEN_TOLERANCE = 0.5;
const SQUAD_SIZE = 46;

/** A shallow copy of the report with one buff's catalog entry replaced. */
function withCatalogBuff(
    r: ReportV1,
    buffId: number,
    patch: Partial<ReportV1['catalogs']['buffs'][string]> | null,
): ReportV1 {
    const buffs = { ...r.catalogs.buffs };
    if (patch === null) delete buffs[String(buffId)];
    else buffs[String(buffId)] = { ...buffs[String(buffId)], ...patch };
    return { ...r, catalogs: { ...r.catalogs, buffs } };
}

describe('extractBoons', () => {
    // Same vacuity-guard convention as support.test.ts/defense.test.ts: every
    // full-roster loop below filters `native.entities` by `role === 'squad'`
    // and either collects mismatches into an array (asserted with `toEqual`)
    // or increments a `checkedAny`-style counter. If the filter ever matched
    // zero entities, those checks would pass vacuously.
    it('has the full 46-member squad roster this file\'s full-roster tests assume', () => {
        const native = loadNativeFixture();
        expect(squadMembers(native).length).toBe(SQUAD_SIZE);
    });

    // Step 1's oracle, strengthened per the controller ruling to the full
    // 46-member roster rather than just the local player: every WVW boon id
    // EI reports uptime for is present in native's `blocks.boons.by_entity[id]`,
    // and the two agree within the brief's stated tolerances (1pp for
    // duration-stacking `uptime_pct`, 0.1 for intensity-stacking `avg_stacks`).
    //
    // One exception, measured not assumed: Anon189.7993's Stability
    // (id 1122, intensity-stacking) diverges by ~0.196 avg-stacks, just
    // outside the 0.1 tolerance -- every other one of the 504 (id, member)
    // pairs checked agrees within tolerance. Pinned via `toEqual` rather
    // than loosening the tolerance for everyone to hide it.
    it('matches the EI buffUptimes oracle on uptime for every squad member and every WVW boon id EI reports', () => {
        const ei = loadEiFixture();
        const native = loadNativeFixture();
        const missingFromNative: string[] = [];
        const mismatches: string[] = [];
        let checkedAny = 0;

        for (const e of squadMembers(native)) {
            const eiPlayer = ei.players.find(p => p.account === e.account);
            expect(eiPlayer, `no EI player for ${e.account}`).toBeDefined();
            const actual = extractBoons(native, e.id);
            const nativeBoons = native.blocks.boons!.by_entity[String(e.id)];

            for (const buff of eiPlayer!.buffUptimes ?? []) {
                if (!WVW_BOON_IDS.has(buff.id)) continue;
                checkedAny++;
                if (!nativeBoons[String(buff.id)]) {
                    missingFromNative.push(`${e.account}:${buff.id}`);
                    continue;
                }
                const entry = actual.uptimes.find(u => u.id === buff.id);
                expect(entry, `extractBoons(${e.account}) missing uptime entry for ${buff.id}`).toBeDefined();

                const eiUptime = buff.buffData[0]?.uptime ?? 0;
                // Which tolerance applies is decided by the catalog, the same
                // source the implementation reads -- not a hardcoded id list.
                const tolerance = native.catalogs.buffs[String(buff.id)].stacking === 'intensity' ? 0.1 : 1;
                if (Math.abs(entry!.uptime - eiUptime) > tolerance) {
                    mismatches.push(`${e.account}:${buff.id}`);
                }
            }
        }

        expect(checkedAny).toBeGreaterThan(0);
        expect(missingFromNative, 'EI boon ids absent from native\'s blocks.boons.by_entity[id]').toEqual([]);
        expect(mismatches, 'uptime mismatches beyond tolerance').toEqual(['Anon189.7993:1122']);
    });

    it('tags stacking from catalogs.buffs for every squad member', () => {
        const native = loadNativeFixture();
        let checkedAny = 0;
        for (const e of squadMembers(native)) {
            const actual = extractBoons(native, e.id);
            for (const entry of actual.uptimes) {
                checkedAny++;
                expect(entry.stacking).toBe(native.catalogs.buffs[String(entry.id)].stacking);
            }
        }
        expect(checkedAny).toBe(SQUAD_SIZE * WVW_BOON_IDS.size);
    });

    // The real catalog-vs-id-list test: the previous version compared the
    // extract's `stacking` to the catalog on a fixture where the catalog and
    // `INTENSITY_STACKING_BOON_IDS` never disagree, so it passed with the
    // catalog lookup ripped out. Here the two are forced to DISAGREE.
    it('lets catalogs.buffs override the id list when the two disagree', () => {
        const native = loadNativeFixture();
        const id = localPlayerId(native);
        const row = native.blocks.boons!.by_entity[String(id)][String(MIGHT_BUFF_ID)];
        // Vacuity guard: the two candidate fields must actually differ, or
        // reading the wrong one would be undetectable.
        expect(row.avg_stacks).toBeDefined();
        expect(row.avg_stacks).not.toBeCloseTo(row.uptime_pct, 3);
        expect(native.catalogs.buffs[String(MIGHT_BUFF_ID)].stacking).toBe('intensity');

        // Might is intensity-stacking in both the catalog and the legacy id
        // list. Flip ONLY the catalog: the extract must follow the catalog.
        const flipped = withCatalogBuff(native, MIGHT_BUFF_ID, { stacking: 'duration' });
        const entry = extractBoons(flipped, id).uptimes.find(u => u.id === MIGHT_BUFF_ID)!;
        expect(entry.stacking).toBe('duration');
        expect(entry.uptime).toBe(row.uptime_pct);
    });

    it('throws rather than inferring stacking when the catalog entry is missing', () => {
        const native = loadNativeFixture();
        const id = localPlayerId(native);
        const stripped = withCatalogBuff(native, MIGHT_BUFF_ID, null);
        expect(() => extractBoons(stripped, id)).toThrow(String(MIGHT_BUFF_ID));
    });

    // The banned silent zero: `avg_stacks` is documented as present for
    // intensity-stacking buffs only. Forcing a duration boon (one chosen
    // from the catalog, not hardcoded) to intensity produces a row with no
    // `avg_stacks` -- which must throw, never render 0.
    it('throws instead of rendering 0 when an intensity buff row has no avg_stacks', () => {
        const native = loadNativeFixture();
        const id = localPlayerId(native);
        const durationBoonId = [...WVW_BOON_IDS]
            .find(b => native.catalogs.buffs[String(b)].stacking === 'duration');
        expect(durationBoonId, 'fixture has no duration-stacking WvW boon').toBeDefined();
        expect(native.blocks.boons!.by_entity[String(id)][String(durationBoonId!)].avg_stacks).toBeUndefined();

        const flipped = withCatalogBuff(native, durationBoonId!, { stacking: 'intensity' });
        expect(() => extractBoons(flipped, id)).toThrow(/avg_stacks/);
    });

    // ONE mismatch-set pin over all 12 WVW buff ids x all 46 squad members x
    // all three generation scopes, replacing the previous split of "tight
    // oracle for Might/Stability, finite/non-negative hand-wave for the other
    // 10". `GENERATION_MISMATCHES` documents what is known about the
    // divergence; the point of pinning is that it cannot widen unnoticed.
    it('pins the exact EI/native generation mismatch set for all 12 boons x all 46 squad members', () => {
        const ei = loadEiFixture();
        const native = loadNativeFixture();
        const roster = squadMembers(native);
        expect(roster.length).toBe(SQUAD_SIZE);

        const mismatches: string[] = [];
        let comparedPairs = 0;

        for (const e of roster) {
            const eiPlayer = ei.players.find(p => p.account === e.account);
            expect(eiPlayer, `no EI player for ${e.account}`).toBeDefined();
            const actual = extractBoons(native, e.id);

            for (const buffId of WVW_BOON_IDS) {
                const entry = actual.generation.find(g => g.id === buffId);
                expect(entry, `extractBoons(${e.account}) missing generation entry for ${buffId}`).toBeDefined();
                comparedPairs++;

                const gen = (buffs: { id: number; buffData: { generation: number }[] }[] | undefined) =>
                    (buffs ?? []).find(b => b.id === buffId)?.buffData[0]?.generation ?? 0;

                const scopes: Array<[string, number, number]> = [
                    ['self', entry!.selfGeneration, gen(eiPlayer!.selfBuffs)],
                    ['group', entry!.groupGeneration, gen(eiPlayer!.groupBuffs)],
                    ['squad', entry!.squadGeneration, gen(eiPlayer!.squadBuffs)],
                ];
                for (const [scope, nativeValue, eiValue] of scopes) {
                    expect(Number.isFinite(nativeValue)).toBe(true);
                    expect(nativeValue).toBeGreaterThanOrEqual(0);
                    if (Math.abs(nativeValue - eiValue) > GEN_TOLERANCE) {
                        mismatches.push(`${e.account}:${buffId}:${scope}`);
                    }
                }
            }
        }

        // Vacuity guards: the full cross-product really was walked.
        expect(comparedPairs).toBe(SQUAD_SIZE * WVW_BOON_IDS.size);
        expect([...mismatches].sort()).toEqual(GENERATION_MISMATCHES);
    });

    it('is non-null for stability and might, with a populated party, for every squad member', () => {
        const native = loadNativeFixture();
        let checkedAny = 0;
        for (const e of squadMembers(native)) {
            const actual = extractBoons(native, e.id);
            checkedAny++;
            expect(actual.boonPerformance).not.toBeNull();
            expect(actual.boonPerformance!.stability).not.toBeNull();
            expect(actual.boonPerformance!.might).not.toBeNull();

            for (const breakdown of [actual.boonPerformance!.stability!, actual.boonPerformance!.might!]) {
                expect(breakdown.selfGeneration.length).toBe(breakdown.bucketCount);
                expect(breakdown.partyIncomingDamage.length).toBe(breakdown.bucketCount);
                expect(breakdown.buckets.length).toBe(breakdown.bucketCount);
                for (const member of breakdown.partyMembers) {
                    expect(member.stacks.length).toBe(breakdown.bucketCount);
                    expect(member.deaths.length).toBe(breakdown.bucketCount);
                    expect(member.distances.length).toBe(breakdown.bucketCount);
                }
            }
        }
        expect(checkedAny).toBe(SQUAD_SIZE);
    });

    // The rekeying itself: `BoonPerfPartyMember.key` is now the entity id
    // (a numeric string), not an account string -- verified for the local
    // player's actual party (4 real squad-mates in subgroup 3 of this
    // fixture), not a synthetic one.
    it('rekeys BoonPerfPartyMember.key by entity id, not account', () => {
        const native = loadNativeFixture();
        const id = localPlayerId(native);
        const actual = extractBoons(native, id);
        const breakdown = actual.boonPerformance!.stability!;

        expect(breakdown.partyMembers.length).toBeGreaterThan(0);
        for (const member of breakdown.partyMembers) {
            // A numeric-string entity id, never containing the account
            // separator an EI-shaped key would have had.
            expect(member.key).not.toContain('.');
            expect(Number.isInteger(Number(member.key))).toBe(true);

            const entity = native.entities.find(e => String(e.id) === member.key);
            expect(entity, `no entity for key ${member.key}`).toBeDefined();
            expect(member.displayName).toBe(entity!.account!.split('.')[0]);
            expect(member.profession).toBe(entity!.profession ?? '');
        }
    });

    // computeBoonPerformance is exercised directly (not just through
    // extractBoons's baked-in 1000ms default) to confirm a caller-supplied
    // bucket size actually changes the breakdown.
    it('computeBoonPerformance respects an explicit bucketSizeMs', () => {
        const native = loadNativeFixture();
        const id = localPlayerId(native);
        const a = computeBoonPerformance(native, id, 1000, STABILITY_BUFF_ID);
        const b = computeBoonPerformance(native, id, 5000, STABILITY_BUFF_ID);
        expect(a).not.toBeNull();
        expect(b).not.toBeNull();
        expect(a!.bucketSizeMs).toBe(1000);
        expect(b!.bucketSizeMs).toBe(5000);
        expect(b!.bucketCount).toBeLessThan(a!.bucketCount);
    });

    it('throws on an unknown entity id rather than returning blanks', () => {
        expect(() => extractBoons(loadNativeFixture(), 999_999)).toThrow();
    });
});
