// src/shared/extract/skills.ts
//
// The per-skill-list primitives the damage, defense and support extracts
// share. They were three independent copies before -- including three
// separate `const TOP_SKILL_COUNT = 8`, none of which any test pinned, so
// changing 8 to 4 in any one of them left the whole suite green.
import type { ReportV1 } from '../report';
import type { SkillEntry } from '@axiapps/axilog/types';

/**
 * How many rows each "top skills" list carries.
 *
 * ONE declaration, shared by `extractDamage`, `extractDefense` and
 * `extractSupport`, so the three lists cannot drift apart, and pinned by
 * `tests/shared/extract/skills.test.ts` so the value cannot change silently.
 */
export const TOP_SKILL_COUNT = 8;

/**
 * A skill's catalog entry, or a throw naming the skill and the entity.
 *
 * The `def?.name ?? \`Skill ${skillId}\`` this replaces put a placeholder in
 * the UI that is indistinguishable from a real skill name, so a catalog that
 * silently stopped resolving ids would have looked like a game patch rather
 * than a bug. Measured on the fixture: every skill id referenced by the 46
 * squad members' `by_skill`, `by_skill_taken`, `detail.by_skill` and
 * `detail.barrier_by_skill` rows resolves -- zero misses.
 */
export function requireSkill(r: ReportV1, skillId: string, entityId: number): SkillEntry {
    const def = r.catalogs.skills[skillId];
    if (!def) {
        throw new Error(
            `catalogs.skills has no entry for skill ${skillId} (entity ${entityId})`,
        );
    }
    return def;
}

/**
 * `SkillRow.hits`, or a throw.
 *
 * Optional in the format because it is absent on ENEMY rows; every caller
 * here runs for the local player, a squad member, and the fixture's squad
 * rows all carry it. A `?? 0` reported "landed nothing" for damage that
 * demonstrably landed.
 */
export function requireHits(hits: number | undefined, skillId: string, entityId: number): number {
    if (hits === undefined) {
        throw new Error(
            `skill ${skillId} on entity ${entityId} has no \`hits\` count`,
        );
    }
    return hits;
}
