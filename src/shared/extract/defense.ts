// src/shared/extract/defense.ts
import type { ReportV1 } from '../report';
import { requireBlock } from '../report';
import type { DefenseStats, SkillDamage } from '../types';

const TOP_SKILL_COUNT = 8;

/**
 * Defense stats for one entity.
 *
 * `damageTaken` lives on `blocks.damage` (the outgoing/incoming pair shares
 * one block), while the rest of the incoming counters live on
 * `blocks.defenses` -- so both blocks are required here.
 */
export function extractDefense(r: ReportV1, id: number): DefenseStats {
    const damage = requireBlock(r, 'damage').by_entity[String(id)];
    if (!damage) throw new Error(`extractDefense: no damage row for entity ${id}`);
    const defenses = requireBlock(r, 'defenses').by_entity[String(id)];
    if (!defenses) throw new Error(`extractDefense: no defenses row for entity ${id}`);
    const replay = requireBlock(r, 'replay').by_entity[String(id)];
    if (!replay) throw new Error(`extractDefense: no replay row for entity ${id}`);

    const bySkillTaken = damage.by_skill_taken ?? {};

    const topDamageTakenSkills: SkillDamage[] = Object.entries(bySkillTaken)
        .map(([skillId, row]): SkillDamage => {
            const def = r.catalogs.skills[skillId];
            return {
                id: Number(skillId),
                name: def?.name ?? `Skill ${skillId}`,
                icon: def?.icon,
                damage: row.total,
                hits: row.hits ?? 0,
                downContribution: 0,
                downedHealing: 0,
            };
        })
        .sort((a, b) => b.damage - a.damage)
        .slice(0, TOP_SKILL_COUNT);

    return {
        damageTaken: damage.taken,
        deaths: defenses.deaths,
        downs: defenses.downs_taken,
        deathTimes: replay.dead.map(([start]) => start),
        downTimes: replay.down.map(([start]) => start),
        dodges: defenses.dodge_count,
        blocked: defenses.blocked_count,
        evaded: defenses.evaded_count,
        missed: defenses.missed_count,
        invulned: defenses.invulned_count,
        interrupted: defenses.interrupted_count,
        incomingCC: defenses.received_cc_count,
        incomingStrips: defenses.boon_strips_taken,
        topDamageTakenSkills,
    };
}
