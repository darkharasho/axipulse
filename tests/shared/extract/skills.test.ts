// tests/shared/extract/skills.test.ts
//
// The per-skill list primitives the three extracts share. Before
// `src/shared/extract/skills.ts` existed, `TOP_SKILL_COUNT = 8` was declared
// three times and pinned zero times: changing 8 to 4 in damage.ts,
// defense.ts or support.ts left the whole suite green.
import { describe, it, expect } from 'vitest';
import { TOP_SKILL_COUNT, requireHits, requireSkill } from '../../../src/shared/extract/skills';
import { extractDamage } from '../../../src/shared/extract/damage';
import { extractDefense } from '../../../src/shared/extract/defense';
import { extractSupport } from '../../../src/shared/extract/support';
import { localPlayerId } from '../../../src/shared/report';
import { loadNativeFixture } from '../oracle';

describe('TOP_SKILL_COUNT', () => {
    it('is 8, in exactly one place', () => {
        expect(TOP_SKILL_COUNT).toBe(8);
    });

    /**
     * Each list has more candidate rows than it keeps, so the slice is
     * load-bearing. Measured on the local player: 22 outgoing skills, 47
     * incoming, 8 healing.
     */
    it('caps every one of the four top-skill lists at that one value', () => {
        const r = loadNativeFixture();
        const id = localPlayerId(r);
        const detail = r.blocks.healing!.by_entity[String(id)].detail!;
        expect([
            Object.keys(r.blocks.damage!.by_entity[String(id)].by_skill!).length,
            Object.keys(r.blocks.damage!.by_entity[String(id)].by_skill_taken!).length,
            Object.keys(detail.by_skill).length,
        ]).toEqual([22, 47, 8]);

        // Literal 8, not TOP_SKILL_COUNT: comparing the output to the same
        // constant that produced it is self-referential and survives any
        // change to its value.
        expect(extractDamage(r, id).topSkills.length).toBe(8);
        expect(extractDefense(r, id).topDamageTakenSkills.length).toBe(8);
        expect(extractSupport(r, id).topHealingSkills.length).toBe(8);

        // Entity 28 is the fixture's only squad member with more than eight
        // barrier skills (10) -- the local player has none at all, so the
        // barrier list's cap can only be exercised through them.
        expect(Object.keys(r.blocks.healing!.by_entity['28'].detail!.barrier_by_skill).length).toBe(10);
        expect(extractSupport(r, 28).topBarrierSkills.length).toBe(8);
    });
});

describe('requireSkill', () => {
    it('returns the catalog entry when the id resolves', () => {
        const r = loadNativeFixture();
        expect(requireSkill(r, '19426', 11).name).toBe('Torment');
    });

    it('throws, naming the skill and the entity, when it does not', () => {
        expect(() => requireSkill(loadNativeFixture(), '999999999', 11))
            .toThrow('catalogs.skills has no entry for skill 999999999 (entity 11)');
    });
});

describe('requireHits', () => {
    it('passes a real count through, including a real 0', () => {
        expect(requireHits(0, '19426', 11)).toBe(0);
        expect(requireHits(55, '19426', 11)).toBe(55);
    });

    it('throws, naming the skill and the entity, when the count is absent', () => {
        expect(() => requireHits(undefined, '19426', 11))
            .toThrow('skill 19426 on entity 11 has no `hits` count');
    });
});

describe('the top-skill lists carry the fields nothing has ever asserted', () => {
    /**
     * `SkillDamage.hits` has NO renderer consumer -- neither does
     * `DamageStats.breakbarDamage`. Both are extracted, typed and shipped to
     * the UI, and nothing reads them. Asserted here anyway: the field exists
     * and is wired to the document, so an oracle keeps it honest until
     * something does read it.
     */
    it('carries each top damage skill\'s hit count from the document', () => {
        const r = loadNativeFixture();
        const id = localPlayerId(r);
        const bySkill = r.blocks.damage!.by_entity[String(id)].by_skill!;
        const top = extractDamage(r, id).topSkills;
        // Measured: the local player's top skill by damage is Torment
        // (19426), 4963 damage over 55 hits.
        expect([top[0].id, top[0].name, top[0].damage, top[0].hits]).toEqual([19426, 'Torment', 4963, 55]);
        for (const s of top) expect(s.hits).toBe(bySkill[String(s.id)].hits);
        // Not all equal, so a constant would not pass.
        expect(new Set(top.map(s => s.hits)).size).toBeGreaterThan(1);
    });

    /**
     * The DamageSubview's "down contribution" toggle sorts and filters on
     * this per-skill field. Zeroing it left the suite green.
     */
    it('carries per-skill down contribution, non-zero on 196 of 331 squad top-skill rows', () => {
        const r = loadNativeFixture();
        const id = localPlayerId(r);
        const byId = new Map(extractDamage(r, id).topSkills.map(s => [s.id, s.downContribution]));
        // Measured on the local player's own top eight.
        expect(byId.get(861)).toBe(2178);
        expect(byId.get(10701)).toBe(1305);
        expect(byId.get(62539)).toBe(0);

        let rows = 0, nonZero = 0;
        for (const e of r.entities.filter(x => x.role === 'squad')) {
            for (const s of extractDamage(r, e.id).topSkills) {
                rows++;
                if (s.downContribution > 0) nonZero++;
            }
        }
        expect([rows, nonZero]).toEqual([331, 196]);
    });

    /**
     * `topBarrierSkills` must come from `detail.barrier_by_skill`, not
     * `detail.by_skill`. Sourcing it from the healing map survived every
     * test, even though the two lists differ for 36 of the 46 squad members.
     */
    it('sources topBarrierSkills from barrier_by_skill, which differs from by_skill for 36 of 46', () => {
        const r = loadNativeFixture();
        const squad = r.entities.filter(e => e.role === 'squad');
        let differ = 0;
        for (const e of squad) {
            const d = r.blocks.healing!.by_entity[String(e.id)].detail!;
            const topIds = (m: Record<string, { total: number }>) => Object.entries(m)
                .sort((a, b) => b[1].total - a[1].total).slice(0, TOP_SKILL_COUNT).map(([k]) => Number(k));
            const heal = topIds(d.by_skill);
            const barrier = topIds(d.barrier_by_skill);
            if (heal.join() !== barrier.join()) differ++;
            expect(extractSupport(r, e.id).topBarrierSkills.map(s => s.id), `entity ${e.id}`).toEqual(barrier);
            expect(extractSupport(r, e.id).topHealingSkills.map(s => s.id), `entity ${e.id}`).toEqual(heal);
        }
        expect([differ, squad.length]).toEqual([36, 46]);
    });

    /**
     * `downedHealing` is the SupportSubview's "healing to downed allies"
     * mode, and it was unasserted. Entity 28 is the fixture's richest
     * barrier/healing source.
     */
    it('carries downedHealing from the document, for the 7 rows that have one', () => {
        const r = loadNativeFixture();
        const pairs: [number, number, number][] = [];
        for (const e of r.entities.filter(x => x.role === 'squad')) {
            const d = r.blocks.healing!.by_entity[String(e.id)].detail!;
            for (const s of extractSupport(r, e.id).topHealingSkills) {
                const row = d.by_skill[String(s.id)];
                expect(s.downedHealing, `entity ${e.id} skill ${s.id}`).toBe(row.total_downed ?? 0);
                if (row.total_downed !== undefined) pairs.push([e.id, s.id, row.total_downed]);
            }
        }
        // Measured: only 7 of the 182 squad healing rows carry a
        // `total_downed` at all, and every one of them is non-zero -- so the
        // `?? 0` on the other 175 is a real "healed no downed ally", not a
        // silent zero over a measurement.
        expect(pairs.length).toBe(7);
        expect(pairs.every(([, , v]) => v > 0)).toBe(true);
    });
});
