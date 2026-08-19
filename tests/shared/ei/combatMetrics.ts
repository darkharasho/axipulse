// tests/shared/ei/combatMetrics.ts -- EI-shaped oracle accessors, moved out of
// src/ by Task 11. No production caller; the equality oracles are the only
// consumers.
//
// PRUNED in fix round 1. The module was `git mv`'d whole, which carried four
// functions no oracle calls (`getStabilityGeneration`, `getTopHealingSkills`,
// `getTopBarrierSkills`, `getTopDamageTakenSkills`) plus, on a second pass,
// `getDeathTimes`/`getDownTimes`. Those last two were NOT caught by counting
// references: their only mentions anywhere are inside a prose comment in
// `extract/timeline.test.ts` explaining why the EI side has no death TIMES to
// compare against. A grep-based count -- mine and the review's alike -- reads
// a comment as a consumer. Mutation does not: forcing either to return `[]`
// left all 310 tests passing. They were dead for a good reason: the oracles
// that need those quantities read the EI fixture DIRECTLY
// (`p.extHealingStats.totalHealingDist`, `p.squadBuffs`), which is one fewer
// layer between the document and the assertion. Everything left here has at
// least one caller.
import type { EiPlayer, EiJson } from './types';
import type { SkillDamage } from '../../../src/shared/types';

type SkillMap = EiJson['skillMap'];
type BuffMap = EiJson['buffMap'];

function resolveSkillMeta(id: number, skillMap: SkillMap, buffMap: BuffMap): { name: string; icon?: string } {
    const mapped = skillMap[`s${id}`];
    if (mapped?.name) return { name: mapped.name, icon: mapped.icon };
    const buffMapped = buffMap[`b${id}`];
    if (buffMapped?.name) return { name: buffMapped.name, icon: buffMapped.icon };
    return { name: `Skill ${id}` };
}

export function getHealingOutput(player: EiPlayer): number {
    if (!player.extHealingStats?.outgoingHealingAllies) return 0;
    let total = 0;
    for (const ally of player.extHealingStats.outgoingHealingAllies) {
        for (const phase of ally) {
            total += phase.healing;
        }
    }
    return total;
}

export function getBarrierOutput(player: EiPlayer): number {
    if (!player.extBarrierStats?.outgoingBarrierAllies) return 0;
    let total = 0;
    for (const ally of player.extBarrierStats.outgoingBarrierAllies) {
        for (const phase of ally) {
            total += phase.barrier;
        }
    }
    return total;
}

export function getTopSkillDamage(
    player: EiPlayer,
    skillMap: SkillMap,
    buffMap: BuffMap,
    limit: number = 10,
): SkillDamage[] {
    const skills: SkillDamage[] = [];
    const phase = player.totalDamageDist[0];
    if (!phase) return skills;
    for (const entry of phase) {
        if (entry.totalDamage > 0) {
            const meta = resolveSkillMeta(entry.id, skillMap, buffMap);
            skills.push({ id: entry.id, name: meta.name, damage: entry.totalDamage, downContribution: entry.downContribution ?? 0, downedHealing: 0, hits: entry.connectedHits, icon: meta.icon });
        }
    }
    skills.sort((a, b) => b.damage - a.damage);
    return skills.slice(0, limit);
}

export function getSquadRank(
    squadPlayers: EiPlayer[],
    player: EiPlayer,
    getValue: (p: EiPlayer) => number,
): number {
    const playerValue = getValue(player);
    let rank = 1;
    for (const p of squadPlayers) {
        if (getValue(p) > playerValue) rank++;
    }
    return rank;
}

