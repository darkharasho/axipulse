import type { EntityOut, ReportV1 } from './report';
import { requireBlock, squadMembers } from './report';
import { WVW_BOON_IDS } from './boonData';

export interface RoleClassification {
    role: 'support' | 'damage';
    supportScore: number;
    confidenceScore: number;
}

/**
 * FROZEN. Three elements of this scoring are inert after the native
 * cutover; Task 11 measured all three and deliberately changed NONE of
 * them, because re-tuning weights to compensate for a lost signal is a
 * product decision, not a migration.
 *
 *  1. `dps` carries no independent information any more. axilog's
 *     `damage.dps` is `total / (encounter.duration_ms / 1000)` for EVERY
 *     entity -- one divisor for all 46 -- so the DPS ratio and the damage
 *     ratio are equal to float epsilon and the -0.8 weight is simply added
 *     to the -1.5 one. PROVED by mutation rather than asserted: setting
 *     `dps: 0, damage: -2.3` leaves all 295 tests, including the pinned
 *     `supportScore` values, unchanged. EI divided by each player's ACTIVE
 *     time (7 distinct values on this log), so there it was a genuine
 *     second signal.
 *  2. `Math.min(..., 1)` in `confidenceScore` below cannot bind, since
 *     `supportSpan = |maxScore - threshold|` bounds the numerator.
 *  3. `OUTLIER_RATIO`'s branch in `computeRatio` is unreachable, because
 *     the medians are taken over positive values only.
 *
 * (2) and (3) are kept rather than deleted, and this is a choice with a
 * reason: both are the DEFINED behaviour for a case that is unreachable
 * only because of a filter elsewhere in this file (`.filter(v => v > 0)`)
 * and an algebraic identity two functions apart. Deleting them would make
 * `confidenceScore`'s documented [0, 1] range and `computeRatio`'s
 * zero-median contract depend on those distant facts staying true, with
 * nothing local saying so. Confirmed still-equivalent by mutation in Task
 * 11 (both survive with the suite green), while the controls -- the
 * `supportSpan` denominator and the DPS weight in isolation -- are both
 * killed, so this is an equivalent-mutant finding and not a coverage hole.
 */
const WEIGHTS = {
    healing: 1.8,
    cleanses: 1.6,
    totalBoonOutput: 1.8,
    dps: -0.8,
    damage: -1.5,
    downContrib: -2.5,
} as const;

const THRESHOLD_MULTIPLIER = 1.25;
const OUTLIER_RATIO = 2.0;

function computeMedian(values: number[]): number {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function computeRatio(value: number, median: number): number {
    if (median > 0) return value / median;
    if (value > 0) return OUTLIER_RATIO;
    return 0;
}

/**
 * The order the six weights are applied in. The native entry point below
 * and the EI-shaped ORACLE (`tests/shared/ei/classifyRoles.ts`, which
 * imports `classifyFromMetrics` rather than restating it) both build their
 * metric rows in THIS order, so the two cannot drift apart in the
 * arithmetic -- only in where the numbers came from, which is exactly what
 * `classifyRole.test.ts` is measuring.
 */
const METRIC_WEIGHTS = [
    WEIGHTS.healing,
    WEIGHTS.cleanses,
    WEIGHTS.totalBoonOutput,
    WEIGHTS.dps,
    WEIGHTS.damage,
    WEIGHTS.downContrib,
] as const;

/**
 * `rows[i]` is one squad member's six metric values, in `METRIC_WEIGHTS`
 * order. Returns one classification per row, positionally.
 *
 * Exported for the EI oracle only -- production's single entry point is
 * `classifySquadRoleMap` below.
 */
export function classifyFromMetrics(rows: number[][]): RoleClassification[] {
    if (rows.length === 0) return [];

    const medians = METRIC_WEIGHTS.map((_, i) =>
        computeMedian(rows.map(r => r[i]).filter(v => v > 0)),
    );

    const scores = rows.map(row => {
        let supportScore = 0;
        for (let i = 0; i < METRIC_WEIGHTS.length; i++) {
            supportScore += computeRatio(row[i], medians[i]) * METRIC_WEIGHTS[i];
        }
        return supportScore;
    });

    const medianScore = computeMedian(scores);
    const threshold = medianScore + Math.abs(medianScore) * (THRESHOLD_MULTIPLIER - 1);

    const maxScore = Math.max(...scores);
    const minScore = Math.min(...scores);
    // KEPT, and not an absence: these are divide-by-zero guards on COMPUTED
    // values, so there is no field to name and nothing to report as missing.
    // The span collapses to 0 only when every row scores identically on the
    // relevant side of the threshold -- a one-member squad, or a squad where
    // nobody registered on any of the six metrics. Both are legitimate logs,
    // and both then give every member `confidenceScore` 0, which is the
    // honest answer. Measured: unreachable on the fixture, whose 46 members
    // score from -106.40 to 28.87, so neither span is anywhere near 0.
    // Throwing here would reject a solo log.
    const supportSpan = Math.abs(maxScore - threshold) || 1;
    const damageSpan = Math.abs(threshold - minScore) || 1;

    return scores.map(supportScore => {
        const role: 'support' | 'damage' = supportScore > threshold ? 'support' : 'damage';
        const span = role === 'support' ? supportSpan : damageSpan;
        return {
            role,
            supportScore,
            confidenceScore: Math.min(Math.abs(supportScore - threshold) / span, 1),
        };
    });
}

function requireRow<T>(by: Record<string, T>, block: string, id: number): T {
    const row = by[String(id)];
    if (!row) {
        throw new Error(`classifySquadRoleMap: no ${block} row for squad entity ${id}`);
    }
    return row;
}

/**
 * Total boon output, native: the squad-facing generation of the twelve
 * `WVW_BOON_IDS` boons.
 *
 * A MISSING buff row throws rather than contributing 0. Every one of this
 * fixture's 46 squad members carries exactly those twelve keys (pinned in
 * `boonData.ts` and re-checked in the test), and a sum that silently drops
 * a term reads as "generated nothing" instead of "was not measured".
 * `extractBoonUptimes` skips absent rows instead, which is correct there --
 * it builds a LIST, and a list can be short without lying.
 *
 * This does not reproduce EI's `squadBuffs` sum: EI's list spans 32 buff ids
 * on this fixture (boons plus conjures, spirits and other shared buffs)
 * where axilog's boons block carries only the twelve core boons. Measured
 * consequence: the per-player totals differ on 33 of 46 squad members, yet
 * the resulting role LABEL is identical for all 46 -- oracled in
 * `tests/shared/classifyRole.test.ts`.
 */
function totalBoonOutput(r: ReportV1, id: number): number {
    const row = requireRow(requireBlock(r, 'boons').by_entity, 'boons', id);
    let total = 0;
    for (const buffId of WVW_BOON_IDS) {
        const boon = row[String(buffId)];
        if (!boon) {
            throw new Error(
                `classifySquadRoleMap: squad entity ${id} has no boons row for buff ${buffId}`,
            );
        }
        total += boon.generation.squad_pct;
    }
    return total;
}

/**
 * Every squad member's classification, keyed by ENTITY ID.
 *
 * Keyed by id rather than account because the algorithm is inherently
 * squad-wide -- every metric is scored against the squad's median, so one
 * member cannot be classified alone.
 *
 * Metric sources vs the EI path: healing is `healing.outgoing_allies`
 * (allies-only, full roster) where EI summed its roster-limited
 * `outgoingHealingAllies` grid INCLUDING self; boon output covers twelve
 * boons where EI's covered 32 buffs; down contribution is the
 * arcdps-methodology figure, not EI's downstate-window one. Damage, DPS and
 * cleanses are exact matches. Despite three of the six inputs differing,
 * the emitted role agrees with the EI path on all 46 squad members.
 */
export function classifySquadRoleMap(r: ReportV1): Map<number, RoleClassification> {
    const squad = squadMembers(r);
    const damage = requireBlock(r, 'damage').by_entity;
    const support = requireBlock(r, 'support').by_entity;
    const contribution = requireBlock(r, 'contribution').by_entity;
    const healing = requireBlock(r, 'healing').by_entity;

    const metrics = (e: EntityOut): number[] => {
        const s = requireRow(support, 'support', e.id);
        const d = requireRow(damage, 'damage', e.id);
        return [
            requireRow(healing, 'healing', e.id).outgoing_allies,
            s.cleanses + s.cleanses_self,
            totalBoonOutput(r, e.id),
            // MEASURED, and it changes what this metric is worth: axilog's
            // `damage.dps` is `total / (encounter.duration_ms / 1000)` for
            // EVERY entity -- exactly 138.333s here, identical divisor for
            // all 46 -- so `dps` is a scalar multiple of `total`, and
            // `computeRatio` divides both by their own medians. The two
            // ratios are therefore equal to float epsilon (max observed
            // deviation 4.4e-16) and the -0.8 DPS weight simply adds to the
            // -1.5 damage weight. EI's `dpsAll[0].dps` divided by each
            // player's ACTIVE time (7 distinct values on this log) and
            // rounded to an integer, so it did carry a little independent
            // signal (ratios diverged by up to 0.027). Kept as a separate
            // metric anyway: the six weights are the frozen behaviour, and
            // the role labels agree with EI's on all 46 members regardless.
            // Pinned in `tests/shared/classifyRole.test.ts`.
            d.dps,
            d.total,
            requireRow(contribution, 'contribution', e.id).downs_contribution.damage,
        ];
    };

    const classifications = classifyFromMetrics(squad.map(metrics));
    return new Map(squad.map((e, i) => [e.id, classifications[i]]));
}

/** One squad member's classification. Throws when `id` is not in the squad. */
export function classifyRole(r: ReportV1, id: number): RoleClassification {
    const found = classifySquadRoleMap(r).get(id);
    if (!found) {
        throw new Error(`classifyRole: entity ${id} is not a squad member`);
    }
    return found;
}
