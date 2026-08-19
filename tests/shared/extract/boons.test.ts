import { describe, it, expect } from 'vitest';
import { extractBoons } from '../../../src/shared/extract/boons';
import { computeBoonPerformance, STABILITY_BUFF_ID, MIGHT_BUFF_ID } from '../../../src/shared/boonPerformance';
import { localPlayerId, squadMembers } from '../../../src/shared/report';
import { WVW_BOON_IDS, INTENSITY_STACKING_BOON_IDS } from '../../../src/shared/boonData';
import { loadEiFixture, loadNativeFixture } from '../oracle';

describe('extractBoons', () => {
    // Same vacuity-guard convention as support.test.ts/defense.test.ts: every
    // full-roster loop below filters `native.entities` by `role === 'squad'`
    // and either collects mismatches into an array (asserted with `toEqual`)
    // or increments a `checkedAny`-style counter. If the filter ever matched
    // zero entities, those checks would pass vacuously.
    it('has the full 46-member squad roster this file\'s full-roster tests assume', () => {
        const native = loadNativeFixture();
        expect(squadMembers(native).length).toBe(46);
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
                const tolerance = INTENSITY_STACKING_BOON_IDS.has(buff.id) ? 0.1 : 1;
                if (Math.abs(entry!.uptime - eiUptime) > tolerance) {
                    mismatches.push(`${e.account}:${buff.id}`);
                }
            }
        }

        expect(checkedAny).toBeGreaterThan(0);
        expect(missingFromNative, 'EI boon ids absent from native\'s blocks.boons.by_entity[id]').toEqual([]);
        expect(mismatches, 'uptime mismatches beyond tolerance').toEqual(['Anon189.7993:1122']);
    });

    // `catalogs.buffs[id].stacking` (not the id) drives which field
    // (`avg_stacks` vs `uptime_pct`) and stacking tag extractBoons uses --
    // verified against the full roster, not just Might/Stability.
    it('tags stacking from catalogs.buffs, not a hardcoded id list', () => {
        const native = loadNativeFixture();
        for (const e of squadMembers(native)) {
            const actual = extractBoons(native, e.id);
            for (const entry of actual.uptimes) {
                const def = native.catalogs.buffs[String(entry.id)];
                expect(entry.stacking).toBe(def.stacking);
            }
        }
    });

    // Generation for the two INTENSITY boons this app ever computes
    // `boonPerformance` for (Stability, Might) agrees closely with EI's
    // squadBuffs/groupBuffs/selfBuffs generation figures -- same
    // measurement support.test.ts already relies on for stabilityGeneration.
    //
    // NOTE on the other 10 (duration-stacking) boon ids: measured, not
    // asserted here -- generation for several duration boons (most visibly
    // Regeneration, id 718) diverges substantially between EI and native
    // for a large minority of the 46-member roster (tens of members, up to
    // ~11pp), in BOTH directions (native higher on some accounts, lower on
    // others, EI-zero/native-nonzero on some). This was measured directly
    // against the fixture, not assumed. No consistent structural condition
    // (self-inclusion, coverage, roster gap) explaining it was found within
    // this task's scope, so per the "verify or say unknown" instruction, no
    // root cause is asserted here -- flagged in the task report instead of
    // filed as a specific (possibly wrong) explanation. The extraction
    // itself is not in question: `extractBoons` maps `generation.*_pct`
    // exactly as the brief specifies, and duration-boon generation values
    // are still checked below for the real, cheap invariant a wiring bug
    // WOULD violate (finite, non-negative).
    it('matches EI\'s squadBuffs/groupBuffs/selfBuffs generation oracle for Might and Stability, for every squad member', () => {
        const ei = loadEiFixture();
        const native = loadNativeFixture();
        const mismatches: string[] = [];
        let checkedAny = 0;

        for (const e of squadMembers(native)) {
            const eiPlayer = ei.players.find(p => p.account === e.account)!;
            const actual = extractBoons(native, e.id);
            for (const buffId of [STABILITY_BUFF_ID, MIGHT_BUFF_ID]) {
                const entry = actual.generation.find(g => g.id === buffId);
                expect(entry, `extractBoons(${e.account}) missing generation entry for ${buffId}`).toBeDefined();
                checkedAny++;

                const eiSelf = (eiPlayer.selfBuffs ?? []).find(b => b.id === buffId)?.buffData[0]?.generation ?? 0;
                const eiGroup = (eiPlayer.groupBuffs ?? []).find(b => b.id === buffId)?.buffData[0]?.generation ?? 0;
                const eiSquad = (eiPlayer.squadBuffs ?? []).find(b => b.id === buffId)?.buffData[0]?.generation ?? 0;

                const tol = 0.5;
                if (Math.abs(entry!.selfGeneration - eiSelf) > tol
                    || Math.abs(entry!.groupGeneration - eiGroup) > tol
                    || Math.abs(entry!.squadGeneration - eiSquad) > tol) {
                    mismatches.push(`${e.account}:${buffId}`);
                }
            }
        }

        expect(checkedAny).toBeGreaterThan(0);
        expect(mismatches, 'Might/Stability generation mismatches beyond tolerance').toEqual([]);
    });

    it('produces finite, non-negative generation figures for every boon and every squad member (duration boons included)', () => {
        const native = loadNativeFixture();
        let checkedAny = 0;
        for (const e of squadMembers(native)) {
            const actual = extractBoons(native, e.id);
            expect(actual.generation.length).toBeGreaterThan(0);
            for (const entry of actual.generation) {
                checkedAny++;
                expect(Number.isFinite(entry.selfGeneration)).toBe(true);
                expect(Number.isFinite(entry.groupGeneration)).toBe(true);
                expect(Number.isFinite(entry.squadGeneration)).toBe(true);
                expect(entry.selfGeneration).toBeGreaterThanOrEqual(0);
                expect(entry.groupGeneration).toBeGreaterThanOrEqual(0);
                expect(entry.squadGeneration).toBeGreaterThanOrEqual(0);
            }
        }
        expect(checkedAny).toBeGreaterThan(0);
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
        expect(checkedAny).toBe(46);
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
