// src/shared/combatMetrics.ts
import type { EiPlayer, EiJson, SkillDamage } from './types';

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

const STABILITY_BUFF_ID = 1122;

export function getStabilityGeneration(player: EiPlayer): number {
    let selfMs = 0;
    let squadMs = 0;
    for (const buff of player.selfBuffs ?? []) {
        if (buff.id === STABILITY_BUFF_ID) {
            selfMs += buff.buffData[0]?.generation ?? 0;
        }
    }
    for (const buff of player.squadBuffs ?? []) {
        if (buff.id === STABILITY_BUFF_ID) {
            squadMs += buff.buffData[0]?.generation ?? 0;
        }
    }
    return (selfMs + squadMs) / 1000;
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

export function getTopHealingSkills(
    player: EiPlayer,
    skillMap: SkillMap,
    buffMap: BuffMap,
    limit: number = 8,
): SkillDamage[] {
    const phase = player.extHealingStats?.totalHealingDist?.[0];
    if (!phase) return [];
    const skills: SkillDamage[] = [];
    for (const entry of phase) {
        if (entry.totalHealing > 0) {
            const meta = resolveSkillMeta(entry.id, skillMap, buffMap);
            skills.push({ id: entry.id, name: meta.name, damage: entry.totalHealing, downContribution: 0, downedHealing: entry.totalDownedHealing ?? 0, hits: entry.hits, icon: meta.icon });
        }
    }
    skills.sort((a, b) => b.damage - a.damage);
    return skills.slice(0, limit);
}

export function getTopBarrierSkills(
    player: EiPlayer,
    skillMap: SkillMap,
    buffMap: BuffMap,
    limit: number = 8,
): SkillDamage[] {
    const phase = player.extBarrierStats?.totalBarrierDist?.[0];
    if (!phase) return [];
    const skills: SkillDamage[] = [];
    for (const entry of phase) {
        if (entry.totalBarrier > 0) {
            const meta = resolveSkillMeta(entry.id, skillMap, buffMap);
            skills.push({ id: entry.id, name: meta.name, damage: entry.totalBarrier, downContribution: 0, downedHealing: 0, hits: entry.hits, icon: meta.icon });
        }
    }
    skills.sort((a, b) => b.damage - a.damage);
    return skills.slice(0, limit);
}

export function getTopDamageTakenSkills(
    player: EiPlayer,
    skillMap: SkillMap,
    buffMap: BuffMap,
    limit: number = 8,
): SkillDamage[] {
    const phase = player.totalDamageTaken?.[0];
    if (!phase) return [];
    const skills: SkillDamage[] = [];
    for (const entry of phase) {
        if (entry.totalDamage > 0) {
            const meta = resolveSkillMeta(entry.id, skillMap, buffMap);
            skills.push({ id: entry.id, name: meta.name, damage: entry.totalDamage, downContribution: 0, downedHealing: 0, hits: entry.connectedHits, icon: meta.icon });
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

export function getDeathTimes(player: EiPlayer): number[] {
    if (!player.combatReplayData?.dead) return [];
    return player.combatReplayData.dead.map(([time]) => time);
}

export function getDownTimes(player: EiPlayer): number[] {
    if (!player.combatReplayData?.down) return [];
    return player.combatReplayData.down.map(([time]) => time);
}
