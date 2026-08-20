// src/shared/extract/damage.ts
import type { ReportV1 } from '../report';
import { requireBlock } from '../report';
import type { DamageStats, SkillDamage } from '../types';
import { TOP_SKILL_COUNT, requireHits, requireSkill } from './skills';

/**
 * Damage stats for one entity.
 *
 * `downContribution` comes from `blocks.contribution`, a different block
 * than the rest of these fields (`blocks.damage`) -- the contribution pass
 * is always-on (ungated), unlike the per-skill damage rows, so both blocks
 * are required here and a missing one is a hard error via `requireBlock`.
 */
export function extractDamage(r: ReportV1, id: number): DamageStats {
    const damage = requireBlock(r, 'damage').by_entity[String(id)];
    if (!damage) throw new Error(`extractDamage: no damage row for entity ${id}`);
    const contribution = requireBlock(r, 'contribution').by_entity[String(id)];
    if (!contribution) throw new Error(`extractDamage: no contribution row for entity ${id}`);
    // `by_skill` is `?`-typed because the per-skill pass is opt-in; this app's
    // fixed PARSE_OPTS always passes `skillDamage: true`, so an absent map
    // here means the parse options drifted, not that the player used no
    // skills. Measured: present for all 46 squad members on the fixture.
    if (!damage.by_skill) {
        throw new Error(
            `extractDamage: blocks.damage.by_entity[${id}] has no \`by_skill\``
            + ' -- the skill-damage pass did not run',
        );
    }
    const bySkill = damage.by_skill;
    // KEPT fallback, and measured: `downs_contribution_by_skill` is absent
    // for exactly 3 of the fixture's 46 squad members, and for each of those
    // three all four `downs_contribution` slices are 0 -- i.e. absence means
    // "contributed to no downs", a real state, not a gap. Every per-skill
    // lookup below then correctly yields 0.
    const downBySkill = contribution.downs_contribution_by_skill ?? {};

    const topSkills: SkillDamage[] = Object.entries(bySkill)
        .map(([skillId, row]): SkillDamage => {
            const def = requireSkill(r, skillId, id);
            return {
                id: Number(skillId),
                name: def.name,
                icon: def.icon,
                damage: row.total,
                // `SkillRow.hits` is `?`-typed because it is ABSENT on enemy
                // rows; this function only ever runs for the local player, a
                // squad member. Measured: present on every one of the
                // fixture's squad `by_skill` rows. A 0 here would read as
                // "landed nothing" for damage that demonstrably landed.
                hits: requireHits(row.hits, skillId, id),
                downContribution: downBySkill[skillId] ?? 0,
                downedHealing: 0,
            };
        })
        .sort((a, b) => b.damage - a.damage)
        .slice(0, TOP_SKILL_COUNT);

    return {
        totalDamage: damage.total,
        dps: damage.dps,
        breakbarDamage: damage.breakbar_damage_dealt,
        // Native splits down contribution four ways (damage / cc / strips /
        // movement_impairing). EI reported one number, which corresponds to
        // the damage slice; the UI's label is "down contribution" and the
        // damage slice is what it always meant.
        downContribution: contribution.downs_contribution.damage,
        topSkills,
    };
}
