// src/shared/extract/damage.ts
import type { ReportV1 } from '../report';
import { requireBlock } from '../report';
import type { DamageStats, SkillDamage } from '../types';

const TOP_SKILL_COUNT = 8;

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
    const bySkill = damage.by_skill ?? {};
    const downBySkill = contribution?.downs_contribution_by_skill ?? {};

    const topSkills: SkillDamage[] = Object.entries(bySkill)
        .map(([skillId, row]): SkillDamage => {
            const def = r.catalogs.skills[skillId];
            return {
                id: Number(skillId),
                name: def?.name ?? `Skill ${skillId}`,
                icon: def?.icon,
                damage: row.total,
                hits: row.hits ?? 0,
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
        downContribution: contribution?.downs_contribution.damage ?? 0,
        topSkills,
    };
}
