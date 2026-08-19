import { describe, it, expect } from 'vitest';
import { extractDamage } from '../../../src/shared/extract/damage';
import { localPlayerId, requireBlock } from '../../../src/shared/report';
import type { ReportV1 } from '../../../src/shared/report';
import { loadEiFixture, loadNativeFixture, accountOf } from '../oracle';

function eiLocal(ei: ReturnType<typeof loadEiFixture>) {
    return ei.players.find(p => p.account === ei.recordedAccountBy)
        ?? ei.players.find(p => p.name === ei.recordedBy)!;
}

describe('extractDamage', () => {
    it('matches the EI oracle on damage totals', () => {
        const ei = loadEiFixture();
        const native = loadNativeFixture();
        const p = eiLocal(ei);
        const actual = extractDamage(native, localPlayerId(native));

        // Two engines counting the same events: allow 1% drift, not 0.
        expect(actual.totalDamage).toBeGreaterThan(0);
        expect(Math.abs(actual.totalDamage - p.dpsAll[0].damage) / p.dpsAll[0].damage)
            .toBeLessThan(0.01);
        expect(Math.abs(actual.breakbarDamage - p.dpsAll[0].breakbarDamage))
            .toBeLessThan(Math.max(1, p.dpsAll[0].breakbarDamage * 0.01));
    });

    it('reports dps consistent with its own total and the duration', () => {
        const native = loadNativeFixture();
        const actual = extractDamage(native, localPlayerId(native));
        const expected = actual.totalDamage / (native.encounter.duration_ms / 1000);
        expect(Math.abs(actual.dps - expected) / expected).toBeLessThan(0.01);
    });

    // NOTE on down contribution: this field cannot be validated against the
    // EI oracle, and no assertion here claims otherwise.
    //
    // `blocks.contribution.by_entity[id].downs_contribution.damage`'s own
    // doc comment (axilog/types.d.ts, PerTargetStatsOut) says it is "the
    // arcdps-methodology per-target down-contribution, NOT EI's own
    // 90%-to-downstate-window algorithm". These are two different
    // *algorithms* computing two different quantities, not the same
    // quantity split four ways (the brief's working assumption) -- across
    // the 46-member squad in this fixture, native's number exceeds EI's for
    // 35 members, is within 1% for 5, and is smaller for 6 (measured
    // directly; see the full-roster test below). There is no consistent
    // narrowing, subset, or bounding relationship to assert. The only thing
    // both engines agree on is direction (zero iff zero, see below) and
    // that the value is non-negative -- that's what's checked here.
    it('reports a non-negative down contribution, consistent with having dealt damage', () => {
        const native = loadNativeFixture();
        const actual = extractDamage(native, localPlayerId(native));
        expect(actual.downContribution).toBeGreaterThanOrEqual(0);
        expect(Number.isFinite(actual.downContribution)).toBe(true);
    });

    it('names and orders top skills', () => {
        const native = loadNativeFixture();
        const actual = extractDamage(native, localPlayerId(native));
        expect(actual.topSkills.length).toBeGreaterThan(0);
        expect(actual.topSkills.every(s => s.name.length > 0)).toBe(true);
        for (let i = 1; i < actual.topSkills.length; i++) {
            expect(actual.topSkills[i - 1].damage).toBeGreaterThanOrEqual(actual.topSkills[i].damage);
        }
    });

    // Cross-checks the skill-id join itself, not just extractDamage's
    // aggregate totals or topSkills' internal ordering/naming. Reads native's
    // full `by_skill` map directly (not through extractDamage/topSkills,
    // which only surfaces the top 8) and compares it against EI's
    // `totalDamageDist[0]` -- phase 0, confirmed the whole fight: this
    // fixture's `ei.phases.length === 1` and `dpsAll.length === 1`, the same
    // single-phase convention every other test in this file already relies
    // on for `dpsAll[0]`/`statsAll[0]`.
    //
    // EI's `totalDamageDist[].name` field exists in the TS type but the real
    // fixture never populates it (every row's `name` is `undefined`, like
    // `EiPlayer.elite_spec` elsewhere in this codebase) -- so id + damage
    // total are the only fields on this shape that are actually comparable;
    // asserting `name` would just encode the absence, not check anything.
    it('cross-checks the per-skill damage join against EI\'s totalDamageDist for every squad member', () => {
        const ei = loadEiFixture();
        const native = loadNativeFixture();
        const missingFromNative: string[] = [];
        const totalMismatches: string[] = [];

        for (const e of native.entities.filter(x => x.role === 'squad')) {
            const eiPlayer = ei.players.find(p => p.account === e.account)!;
            const bySkill = requireBlock(native, 'damage').by_entity[String(e.id)]?.by_skill ?? {};
            const nativeIds = new Set(Object.keys(bySkill).map(Number));
            const eiDist = eiPlayer.totalDamageDist[0] ?? [];
            const eiIds = new Set(eiDist.map(row => row.id));

            // A real join bug (off-by-one catalog key, wrong id space) would
            // show up here: a skill id EI attributes damage to that native's
            // join never produced. Collect and pin -- measured empty across
            // the full roster today, so this is a live regression guard, not
            // a vacuous one.
            for (const id of eiIds) {
                if (!nativeIds.has(id)) missingFromNative.push(`${e.account}:${id}`);
            }

            // Native is documented to fold pet/minion damage onto the owner
            // under the pet's own skill id (SkillDamageOut's doc comment),
            // "unlike GW2EI's totalDamageDist, which tracks the player actor
            // only and excludes pet/minion damage entirely" -- so ids only
            // native reports (pet/phantasm/minion skills) are EXPECTED and
            // not a join defect; they're structurally incomparable, not
            // wrong, so this test doesn't touch them.
            //
            // For ids BOTH sides report, the totals should agree -- except
            // the same pet-fold phenomenon can still touch a shared id: a
            // summon-cast skill id where EI's own row is the zero-damage
            // cast-attempt event, while native's row for that id also
            // carries the summoned pet's actual damage output. Detected by
            // its real condition (the two totals disagreeing beyond a 1%
            // float-drift tolerance) and pinned, not skipped.
            for (const id of nativeIds) {
                if (!eiIds.has(id)) continue;
                const nativeTotal = bySkill[String(id)].total;
                const eiTotal = eiDist.find(row => row.id === id)!.totalDamage;
                if (eiTotal === 0 && nativeTotal === 0) continue;
                const relErr = Math.abs(nativeTotal - eiTotal) / Math.max(1, eiTotal);
                if (relErr > 0.01) totalMismatches.push(`${e.account}:${id}`);
            }
        }

        expect(missingFromNative, 'EI skill ids absent from native\'s join').toEqual([]);
        // Pinned, not tolerated: if a regenerated fixture widens this set,
        // the test fails and the gap gets re-examined rather than quietly
        // growing.
        expect(totalMismatches, 'skill ids present on both sides with mismatched totals').toEqual([
            'Anon180.7660:71953',
        ]);
    });

    it('matches the EI oracle on damage totals for every squad member', () => {
        const ei = loadEiFixture();
        const native = loadNativeFixture();
        const zeroDamageMembers: string[] = [];

        for (const e of native.entities.filter(x => x.role === 'squad')) {
            const eiPlayer = ei.players.find(p => p.account === e.account);
            expect(eiPlayer, `no EI player for ${e.account}`).toBeDefined();
            const actual = extractDamage(native, e.id);
            const eiDamage = eiPlayer!.dpsAll[0].damage;

            // A squad member who did zero recorded damage (e.g. never
            // engaged, or was downed/dead before landing a hit) makes the
            // relative-error check divide by zero. Detect that real
            // condition -- both engines agreeing on zero -- and compare
            // with an absolute bound instead of skipping the member.
            if (eiDamage === 0) {
                zeroDamageMembers.push(accountOf(e));
                expect(actual.totalDamage).toBeLessThanOrEqual(1);
            } else {
                expect(Math.abs(actual.totalDamage - eiDamage) / eiDamage).toBeLessThan(0.01);
            }

            expect(Math.abs(actual.breakbarDamage - eiPlayer!.dpsAll[0].breakbarDamage))
                .toBeLessThan(Math.max(1, eiPlayer!.dpsAll[0].breakbarDamage * 0.01));

            // dps must stay internally consistent with total/duration for
            // every member, not just the local player.
            if (actual.totalDamage > 0) {
                const expectedDps = actual.totalDamage / (native.encounter.duration_ms / 1000);
                expect(Math.abs(actual.dps - expectedDps) / expectedDps).toBeLessThan(0.01);
            } else {
                expect(actual.dps).toBe(0);
            }
        }

        // Pinned, not tolerated: if a regenerated fixture changes who sat
        // out the fight entirely (dealt no damage per both engines), this
        // fails and the set gets re-examined rather than silently growing.
        expect(zeroDamageMembers, 'squad members with zero recorded damage').toEqual([
            'Anon206.8622',
        ]);
    });

    it('reports non-negative, finite down contribution for every squad member', () => {
        const native = loadNativeFixture();
        for (const e of native.entities.filter(x => x.role === 'squad')) {
            const actual = extractDamage(native, e.id);
            expect(actual.downContribution).toBeGreaterThanOrEqual(0);
            expect(Number.isFinite(actual.downContribution)).toBe(true);
        }
    });

    it('throws on an unknown entity id rather than returning blanks', () => {
        // Anchored to the FIRST guard's own message. A bare `toThrow()` here
        // passes on any throw from anywhere in the function, which is how
        // four earlier guards in this branch ended up certified by a throw
        // they never produced.
        expect(() => extractDamage(loadNativeFixture(), 999_999))
            .toThrow('extractDamage: no damage row for entity 999999');
    });

    describe('absences that are errors, not zeros', () => {
        const native = () => loadNativeFixture();
        const id = () => localPlayerId(native());

        /** A shallow copy of the report with one `blocks.damage` row field
         *  removed. Copies only the spine down to the row, never the fixture
         *  itself -- the module-level cache is shared with every other test
         *  in this file. */
        function withoutDamageField(field: 'by_skill' | 'by_skill_taken'): ReportV1 {
            const r = native();
            const key = String(id());
            const row = { ...r.blocks.damage!.by_entity[key] };
            delete row[field];
            return {
                ...r,
                blocks: {
                    ...r.blocks,
                    damage: {
                        ...r.blocks.damage!,
                        by_entity: { ...r.blocks.damage!.by_entity, [key]: row },
                    },
                },
            } as ReportV1;
        }

        it('throws when the skill-damage pass left no by_skill map', () => {
            expect(() => extractDamage(withoutDamageField('by_skill'), id()))
                .toThrow(/by_skill.*skill-damage pass did not run/s);
        });

        it('throws when a contributing skill has no hits count', () => {
            const r = native();
            const key = String(id());
            const bySkill = { ...r.blocks.damage!.by_entity[key].by_skill! };
            const firstSkill = Object.keys(bySkill)[0];
            const row = { ...bySkill[firstSkill] };
            delete row.hits;
            bySkill[firstSkill] = row;
            const mutated = {
                ...r,
                blocks: {
                    ...r.blocks,
                    damage: {
                        ...r.blocks.damage!,
                        by_entity: {
                            ...r.blocks.damage!.by_entity,
                            [key]: { ...r.blocks.damage!.by_entity[key], by_skill: bySkill },
                        },
                    },
                },
            } as ReportV1;
            expect(() => extractDamage(mutated, id()))
                .toThrow(new RegExp(`skill ${firstSkill} on entity ${id()} has no .hits. count`));
        });

        it('throws when a skill id is missing from catalogs.skills', () => {
            const r = native();
            const skills = { ...r.catalogs.skills };
            const used = Object.keys(r.blocks.damage!.by_entity[String(id())].by_skill!)[0];
            delete skills[used];
            const mutated = { ...r, catalogs: { ...r.catalogs, skills } } as ReportV1;
            expect(() => extractDamage(mutated, id()))
                .toThrow(`catalogs.skills has no entry for skill ${used} (entity ${id()})`);
        });

        it('throws when the contribution block has no row for the entity', () => {
            const r = native();
            const by = { ...r.blocks.contribution!.by_entity };
            delete by[String(id())];
            const mutated = {
                ...r,
                blocks: { ...r.blocks, contribution: { ...r.blocks.contribution!, by_entity: by } },
            } as ReportV1;
            expect(() => extractDamage(mutated, id()))
                .toThrow(`extractDamage: no contribution row for entity ${id()}`);
        });

        /**
         * The one KEPT fallback here, and the reason it is kept. Measured on
         * the fixture: `downs_contribution_by_skill` is absent for exactly 3
         * of the 46 squad members (entities 0, 1 and 30), and for each of
         * those three every slice of `downs_contribution` is 0 -- absence
         * means "contributed to no downs", not "not measured". Throwing
         * would reject a real log.
         */
        it('treats an absent downs_contribution_by_skill as a real zero, on the 3 members that have one', () => {
            const r = native();
            const without = r.entities
                .filter(e => e.role === 'squad')
                .filter(e => r.blocks.contribution!.by_entity[String(e.id)].downs_contribution_by_skill === undefined)
                .map(e => e.id);
            expect(without).toEqual([0, 1, 30]);
            for (const eid of without) {
                expect(r.blocks.contribution!.by_entity[String(eid)].downs_contribution)
                    .toEqual({ cc: 0, damage: 0, movement_impairing: 0, strips: 0 });
                const actual = extractDamage(r, eid);
                expect(actual.downContribution).toBe(0);
                expect(actual.topSkills.every(s => s.downContribution === 0)).toBe(true);
            }
        });
    });
});
