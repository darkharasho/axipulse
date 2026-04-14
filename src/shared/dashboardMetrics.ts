// src/shared/dashboardMetrics.ts
import type { EiPlayer } from './types';

export function getDamage(player: EiPlayer): number {
    return player.dpsAll[0]?.damage ?? 0;
}

export function getDps(player: EiPlayer): number {
    return player.dpsAll[0]?.dps ?? 0;
}

export function getBreakbarDamage(player: EiPlayer): number {
    return player.dpsAll[0]?.breakbarDamage ?? 0;
}

export function getCleanses(player: EiPlayer): number {
    const s = player.support[0];
    if (!s) return 0;
    return s.condiCleanse + s.condiCleanseSelf;
}

export function getCleanseSelf(player: EiPlayer): number {
    return player.support[0]?.condiCleanseSelf ?? 0;
}

export function getStrips(player: EiPlayer): number {
    return player.support[0]?.boonStrips ?? 0;
}

export function getDistToTag(player: EiPlayer): number {
    const stats = player.statsAll[0];
    if (!stats) return 0;
    return stats.distToCom || stats.stackDist || 0;
}

export function getDamageTaken(player: EiPlayer): number {
    return player.defenses[0]?.damageTaken ?? 0;
}

export function getDeaths(player: EiPlayer): number {
    return player.defenses[0]?.deadCount ?? 0;
}

export function getDowns(player: EiPlayer): number {
    return player.defenses[0]?.downCount ?? 0;
}

export function getDodges(player: EiPlayer): number {
    return player.defenses[0]?.dodgeCount ?? 0;
}

export function getDownContribution(player: EiPlayer): number {
    return player.statsAll[0]?.downContribution ?? 0;
}

export function getIncomingCC(player: EiPlayer): number {
    return player.defenses[0]?.receivedCrowdControl ?? 0;
}

export function getIncomingStrips(player: EiPlayer): number {
    return player.defenses[0]?.boonStrips ?? 0;
}

export function getBlocked(player: EiPlayer): number {
    return player.defenses[0]?.blockedCount ?? 0;
}

export function getEvaded(player: EiPlayer): number {
    return player.defenses[0]?.evadedCount ?? 0;
}

export function getMissed(player: EiPlayer): number {
    return player.defenses[0]?.missedCount ?? 0;
}

export function getInvulned(player: EiPlayer): number {
    return player.defenses[0]?.invulnedCount ?? 0;
}

export function getInterrupted(player: EiPlayer): number {
    return player.defenses[0]?.interruptedCount ?? 0;
}
