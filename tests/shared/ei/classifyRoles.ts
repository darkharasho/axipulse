// tests/shared/ei/classifyRoles.ts
//
// The EI-shaped role classifier, MOVED here from `src/shared/classifyRole.ts`
// by Task 11.
//
// Task 10's review directed this to be DELETED with the rest of the EI
// surface. It is not deleted, it is relocated, because deleting it would have
// taken an oracle with it: `classifyRole.test.ts`'s headline assertion is that
// the native classifier assigns the same role to all 46 squad members as the
// EI one does, despite three of its six inputs being different quantities.
// That claim is only checkable while an EI classifier exists to check it
// against. What Task 10's review actually wanted -- no EI classifier in
// production, and the six SYNTHETIC `classifySquadRoles` unit tests gone -- is
// done; this is the oracle half.
//
// The scoring arithmetic is NOT duplicated here. `classifyFromMetrics` is
// imported from production, so the two paths differ only in where the six
// numbers came from, which is the whole point of the comparison.
import type { EiPlayer } from './types';
import { classifyFromMetrics } from '../../../src/shared/classifyRole';
import type { RoleClassification } from '../../../src/shared/classifyRole';
import { getHealingOutput } from './combatMetrics';
import { getDps, getDamage, getCleanses, getDownContribution } from './dashboardMetrics';

function getOutgoingHealing(player: EiPlayer): number {
    const total = getHealingOutput(player);
    if (!player.extHealingStats?.outgoingHealingAllies) return 0;
    let selfHealing = 0;
    const selfPhase = player.extHealingStats.outgoingHealingAllies[0];
    if (selfPhase) {
        for (const phase of selfPhase) {
            selfHealing += phase.healing;
        }
    }
    return Math.max(total - selfHealing, 0);
}

function getTotalBoonOutput(player: EiPlayer): number {
    let total = 0;
    for (const buff of player.squadBuffs ?? []) {
        total += buff.buffData[0]?.generation ?? 0;
    }
    return total;
}

/** Keyed by account, as the EI path was. The six metrics are built in
 *  `METRIC_WEIGHTS` order -- the same order `classifySquadRoleMap` uses. */
export function classifySquadRolesEi(players: EiPlayer[]): Map<string, RoleClassification> {
    const classifications = classifyFromMetrics(players.map(p => [
        getOutgoingHealing(p),
        getCleanses(p),
        getTotalBoonOutput(p),
        getDps(p),
        getDamage(p),
        getDownContribution(p),
    ]));
    return new Map(players.map((p, i) => [p.account, classifications[i]]));
}
