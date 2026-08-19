// src/shared/extract/composition.ts
import type { EntityOut, ReportV1 } from '../report';
import { requireBlock, squadMembers } from '../report';
import type { FightComposition, SquadContext } from '../types';

/** EI's own cap, kept because `FightCompositionCard` only has three enemy
 *  segment colours (`SEGMENT_COLORS`). */
const TEAM_BREAKDOWN_LIMIT = 3;

/**
 * The label a player entity is counted under in the three class-count maps.
 *
 * `elite_spec || profession` is the ONE sanctioned fallback in this module,
 * and it is deliberate: axilog returns `elite_spec: ''` for 8 of this
 * fixture's 93 player entities (2 squad, 6 enemy) whose specialization it
 * cannot name, where Elite Insights names Antiquary / Conduit / Galeshot.
 * That is an upstream gap and a user-visible regression after the cutover.
 * The literal mapping is kept so the gap stays VISIBLE rather than papered
 * over with a local lookup table; `tests/shared/extract/composition.test.ts`
 * pins the exact divergence set by account/entity so the test fails loudly
 * if axilog either fixes it or breaks it further.
 *
 * `profession` is `profession?: string` on `EntityOut` ("present exactly
 * for player roles"), so a player entity with neither is a contradiction in
 * the document, not a thing to render as "Unknown".
 */
function classKey(e: EntityOut): string {
    const key = e.elite_spec || e.profession;
    if (!key) {
        throw new Error(
            `extractComposition: player entity ${e.id} (role ${e.role}) has neither elite_spec nor profession`,
        );
    }
    return key;
}

function countByClass(entities: EntityOut[]): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const e of entities) {
        const k = classKey(e);
        counts[k] = (counts[k] ?? 0) + 1;
    }
    return counts;
}

/**
 * Squad / ally / enemy counts and their class breakdowns.
 *
 * `role` and `team` replace the EI path's whole reconciliation ladder:
 * `!isFake && !notInSquad` for squad, `notInSquad` for allies,
 * `targets.filter(enemyPlayer && !isFake)` for enemies, plus a
 * `teamID ?? teamId` normalisation and an "enemy on an ally team" filter.
 * `Role` is a closed enum on every entity and `team` is always present, so
 * none of that survives. The populations are proven identical to EI's by
 * IDENTITY (squad/ally accounts, enemy `instid`s), not by count, in the
 * test file -- equal counts over different members is exactly the failure
 * a count-only oracle cannot see.
 *
 * ONE deliberate divergence in the output: `teamBreakdown[].teamId` is
 * axilog's team COLOUR (`"green"`, `"red"`) where EI's was the stringified
 * numeric team id (`"2767"`, `"707"`). It is only ever used as a lookup key
 * into `enemyClassCountsByTeam` and as a React key -- `FightCompositionCard`
 * labels the segments `Enemy T1..T3` positionally and never renders the id
 * -- so this is invisible to the user. `encounter.teams` carries the
 * colour<->id mapping and the test pins it.
 */
export function extractComposition(r: ReportV1): FightComposition {
    const squad = squadMembers(r);
    const allies = r.entities.filter(e => e.role === 'friendly_player');
    const enemies = r.entities.filter(e => e.role === 'enemy_player');

    const teamCounts = new Map<string, number>();
    const enemyClassCountsByTeam: Record<string, Record<string, number>> = {};
    for (const e of enemies) {
        teamCounts.set(e.team, (teamCounts.get(e.team) ?? 0) + 1);
        const perTeam = enemyClassCountsByTeam[e.team] ??= {};
        const k = classKey(e);
        perTeam[k] = (perTeam[k] ?? 0) + 1;
    }

    // Descending by count, then ascending by team name. The EI path sorted
    // on count alone and let `Array.prototype.sort`'s stability decide ties,
    // which made a tied breakdown depend on target iteration order; the
    // explicit second key makes the result a function of the data only.
    const teamBreakdown = Array.from(teamCounts.entries())
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .slice(0, TEAM_BREAKDOWN_LIMIT)
        .map(([teamId, count]) => ({ teamId, count }));

    return {
        squadCount: squad.length,
        allyCount: allies.length,
        enemyCount: enemies.length,
        teamBreakdown,
        squadClassCounts: countByClass(squad),
        allyClassCounts: countByClass(allies),
        enemyClassCountsByTeam,
    };
}

/**
 * The local player's standing among the squad on six metrics.
 *
 * Rank rule, matched to the EI path's `getSquadRank` exactly: `1 + the
 * number of squad members with a STRICTLY greater value`. Ties therefore
 * share the better (lower) rank and the next distinct value skips -- and,
 * because nothing is sorted, the result cannot depend on entity iteration
 * order. `every rank is in [1, squadCount]` would not have caught an
 * order-dependent rule, so the tie behaviour is pinned directly.
 */
export function extractSquadContext(r: ReportV1, id: number): SquadContext {
    const squad = squadMembers(r);
    const self = squad.find(e => e.id === id);
    if (!self) {
        throw new Error(`extractSquadContext: entity ${id} is not a squad member`);
    }

    const damage = requireBlock(r, 'damage').by_entity;
    const support = requireBlock(r, 'support').by_entity;
    const contribution = requireBlock(r, 'contribution').by_entity;
    const healing = requireBlock(r, 'healing').by_entity;

    // A block that is PRESENT but missing a row for a squad member is a
    // different failure from an absent block (which `requireBlock` already
    // rejects), and ranking against a fabricated 0 would silently move
    // every player above that member.
    function row<T>(by: Record<string, T>, block: string, e: EntityOut): T {
        const found = by[String(e.id)];
        if (!found) {
            throw new Error(`extractSquadContext: no ${block} row for squad entity ${e.id}`);
        }
        return found;
    }

    function rank(value: (e: EntityOut) => number): number {
        const mine = value(self!);
        let position = 1;
        for (const e of squad) {
            if (value(e) > mine) position++;
        }
        return position;
    }

    return {
        squadSize: squad.length,
        damageRank: rank(e => row(damage, 'damage', e).total),
        // `contribution.downs_contribution.damage` is the arcdps-methodology
        // down contribution, a DIFFERENT algorithm from EI's
        // 90%-to-downstate-window one (axilog's own `types.d.ts` says so on
        // `PerTargetStatsOut.downs_contribution_damage`). It is the same
        // field `extractDamage` reports as `downContribution`, so the number
        // and its rank stay consistent on screen -- but this rank does NOT
        // reproduce EI's, and the test pins the measured divergence.
        downContributionRank: rank(e => row(contribution, 'contribution', e).downs_contribution.damage),
        stripsRank: rank(e => row(support, 'support', e).strips),
        // EI's `getCleanses` was `condiCleanse + condiCleanseSelf`; native's
        // split is the same split, so both terms are summed here too.
        cleanseRank: rank(e => {
            const s = row(support, 'support', e);
            return s.cleanses + s.cleanses_self;
        }),
        // `outgoing_allies` is allies-only over the FULL roster. EI's
        // `getHealingOutput` summed the roster-limited `outgoingHealingAllies`
        // grid INCLUDING the healer's own cell -- a different quantity. The
        // matching EI-side oracle (established in Task 5/6) is
        // `totalHealingDist - alliedHealingDist[self]`, which the test uses.
        healingRank: rank(e => row(healing, 'healing', e).outgoing_allies),
        damageTakenRank: rank(e => row(damage, 'damage', e).taken),
    };
}
