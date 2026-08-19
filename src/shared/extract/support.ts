// src/shared/extract/support.ts
import type { ReportV1 } from '../report';
import { requireBlock } from '../report';
import type { SkillDamage, SupportStats } from '../types';
import { STABILITY_BUFF_ID } from '../boonPerformance';

const TOP_SKILL_COUNT = 8;

function toSkillDamage(r: ReportV1, skillId: string, row: {
    total: number; total_downed?: number; hits: number;
}): SkillDamage {
    const def = r.catalogs.skills[skillId];
    return {
        id: Number(skillId),
        name: def?.name ?? `Skill ${skillId}`,
        icon: def?.icon,
        damage: row.total,
        hits: row.hits,
        downContribution: 0,
        downedHealing: row.total_downed ?? 0,
    };
}

/**
 * Support stats for one entity.
 *
 * `boons`/`support`/`healing` are three separate blocks. `healing.detail`
 * is opt-in ("the pass did not run" is a real signal distinct from a
 * measured empty pass) -- this app always requests `skillDamage`, so an
 * absent `detail` here is a hard error, not an empty-list fallback.
 */
export function extractSupport(r: ReportV1, id: number): SupportStats {
    const support = requireBlock(r, 'support').by_entity[String(id)];
    if (!support) throw new Error(`extractSupport: no support row for entity ${id}`);
    const healing = requireBlock(r, 'healing').by_entity[String(id)];
    if (!healing) throw new Error(`extractSupport: no healing row for entity ${id}`);
    const boons = requireBlock(r, 'boons').by_entity[String(id)];
    if (!boons) throw new Error(`extractSupport: no boons row for entity ${id}`);

    if (!healing.detail) {
        throw new Error(
            `extractSupport: entity ${id}'s healing row has no per-skill detail -- the skill-damage pass did not run`,
        );
    }

    const topHealingSkills: SkillDamage[] = Object.entries(healing.detail.by_skill)
        .map(([skillId, row]) => toSkillDamage(r, skillId, row))
        .sort((a, b) => b.damage - a.damage)
        .slice(0, TOP_SKILL_COUNT);

    const topBarrierSkills: SkillDamage[] = Object.entries(healing.detail.barrier_by_skill)
        .map(([skillId, row]) => toSkillDamage(r, skillId, row))
        .sort((a, b) => b.damage - a.damage)
        .slice(0, TOP_SKILL_COUNT);

    return {
        boonStrips: support.strips,
        cleanses: support.cleanses,
        cleanseSelf: support.cleanses_self,
        healingOutput: healing.outgoing_allies,
        barrierOutput: healing.barrier_out,
        stabilityGeneration: boons[String(STABILITY_BUFF_ID)]?.generation.squad_pct ?? 0,
        topHealingSkills,
        topBarrierSkills,
    };
}
