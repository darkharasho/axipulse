// src/shared/combatMetrics.ts
import type { EiPlayer, SkillDamage } from './types';

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
    skillMap: Record<string, { name: string; icon: string; autoAttack: boolean }>,
    limit: number = 10,
): SkillDamage[] {
    const skills: SkillDamage[] = [];
    const phase = player.totalDamageDist[0];
    if (!phase) return skills;
    for (const entry of phase) {
        if (entry.totalDamage > 0) {
            const name = skillMap[`s${entry.id}`]?.name ?? entry.name ?? `Skill ${entry.id}`;
            skills.push({ id: entry.id, name, damage: entry.totalDamage, hits: entry.connectedHits });
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
