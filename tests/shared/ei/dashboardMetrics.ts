// tests/shared/ei/dashboardMetrics.ts -- EI-shaped oracle accessors, moved out
// of src/ by Task 11. No production caller; the equality oracles are the only
// consumers.
//
// PRUNED in fix round 1: eleven per-counter accessors
// (`getCleanseSelf`/`getDeaths`/`getDowns`/`getDodges`/`getIncomingCC`/
// `getIncomingStrips`/`getBlocked`/`getEvaded`/`getMissed`/`getInvulned`/
// `getInterrupted`) had zero callers anywhere and were carried over by a
// whole-file `git mv` under the "the oracles need them" banner when they
// demonstrably were not needed. Confirmed dead by mutation: forcing
// `getDeaths` to return 99 left every test passing. The defensive-counter
// oracle in `extractPlayerData.test.ts` reads `p.defenses[0].dodgeCount` and
// friends off the fixture directly instead. Everything left here has a caller.
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

export function getDownContribution(player: EiPlayer): number {
    // statsAll[0] is authoritative when populated. In WvW, EI may use an aggregate
    // "Enemy Players" target that leaves this field at 0 — fall back to summing
    // downContribution across all entries in totalDamageDist.
    const fromStatsAll = player.statsAll[0]?.downContribution ?? 0;
    if (fromStatsAll > 0) return fromStatsAll;

    let total = 0;
    for (const phase of player.totalDamageDist ?? []) {
        if (!phase) continue;
        for (const entry of phase) {
            total += entry.downContribution ?? 0;
        }
    }
    return total;
}

