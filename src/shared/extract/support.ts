// src/shared/extract/support.ts
import type { ReportV1 } from '../report';
import { requireBlock } from '../report';
import type { SkillDamage, SupportStats } from '../types';
import { STABILITY_BUFF_ID } from '../boonPerformance';
import { TOP_SKILL_COUNT, requireSkill } from './skills';

function toSkillDamage(r: ReportV1, entityId: number, skillId: string, row: {
    total: number; total_downed?: number; hits: number;
}): SkillDamage {
    const def = requireSkill(r, skillId, entityId);
    return {
        id: Number(skillId),
        name: def.name,
        icon: def.icon,
        damage: row.total,
        // `HealSkillRow.hits` is required (`.d.ts`: "hits/min/max count EVERY
        // event in the group ... GW2EI's healing dist has no HasHit gate"),
        // unlike `SkillRow.hits` (defense.ts/damage.ts), which is optional --
        // no `?? 0` fallback needed or wanted here.
        hits: row.hits,
        downContribution: 0,
        // KEPT fallback, and measured rather than assumed: `total_downed` is
        // absent on 175 of the fixture's 182 squad healing rows and on all 38
        // barrier rows. It means "none of this skill's output landed on a
        // DOWNED ally" -- a real, common state, not a gap. Throwing here
        // would reject almost every real log.
        downedHealing: row.total_downed ?? 0,
    };
}

/**
 * The entity's squad-facing Stability generation, or a throw.
 *
 * `boonData.ts` records -- and `boonData.test.ts` pins -- that every one of
 * the fixture's 46 squad members carries exactly the twelve `WVW_BOON_IDS`
 * rows, Stability among them. A `?? 0` here rendered "generated no
 * Stability" (a headline WvW support number) for a row that was never
 * measured at all.
 */
function requireStability(boons: Record<string, { generation: { squad_pct: number } }>, id: number): number {
    const row = boons[String(STABILITY_BUFF_ID)];
    if (!row) {
        throw new Error(
            `extractSupport: entity ${id} has no Stability (${STABILITY_BUFF_ID}) row in blocks.boons`,
        );
    }
    return row.generation.squad_pct;
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
        .map(([skillId, row]) => toSkillDamage(r, id, skillId, row))
        .sort((a, b) => b.damage - a.damage)
        .slice(0, TOP_SKILL_COUNT);

    const topBarrierSkills: SkillDamage[] = Object.entries(healing.detail.barrier_by_skill)
        .map(([skillId, row]) => toSkillDamage(r, id, skillId, row))
        .sort((a, b) => b.damage - a.damage)
        .slice(0, TOP_SKILL_COUNT);

    return {
        boonStrips: support.strips,
        cleanses: support.cleanses,
        cleanseSelf: support.cleanses_self,
        healingOutput: healing.outgoing_allies,
        barrierOutput: healing.barrier_out,
        stabilityGeneration: requireStability(boons, id),
        topHealingSkills,
        topBarrierSkills,
    };
}
