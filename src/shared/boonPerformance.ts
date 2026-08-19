import type { BoonPerfBreakdown, BoonPerfPartyMember } from './types';
import type { ReportV1 } from './report';
import { requireBlock, squadMembers, commanderId, decodeSeries } from './report';

export const STABILITY_BUFF_ID = 1122;
export const MIGHT_BUFF_ID = 740;


// ---- Pure bucket arithmetic. Carried through the native migration
// unchanged -- these two functions were shared with the EI path that Task 11
// deleted, and are identical to what it used. ----

function integrateStatesPerBucket(
    states: Array<[number, number]>,
    bucketCount: number,
    bucketSizeMs: number,
): number[] {
    const out = new Array<number>(bucketCount).fill(0);
    if (!states || states.length === 0) return out;
    const sorted = [...states].sort((a, b) => Number(a[0]) - Number(b[0]));
    for (let b = 0; b < bucketCount; b++) {
        const bucketStart = b * bucketSizeMs;
        const bucketEnd = bucketStart + bucketSizeMs;
        let curStacks = 0;
        for (let i = sorted.length - 1; i >= 0; i--) {
            if (Number(sorted[i][0]) <= bucketStart) { curStacks = Number(sorted[i][1]); break; }
        }
        let weightedSum = 0;
        let prevTime = bucketStart;
        for (const [tRaw, sRaw] of sorted) {
            const t = Number(tRaw);
            if (t <= bucketStart) continue;
            if (t >= bucketEnd) break;
            weightedSum += curStacks * (t - prevTime);
            prevTime = t;
            curStacks = Number(sRaw);
        }
        weightedSum += curStacks * (bucketEnd - prevTime);
        out[b] = weightedSum / bucketSizeMs;
    }
    return out;
}

function cumulativeToDeltas(cum: number[]): number[] {
    return cum.map((v, i) => i === 0 ? 0 : Math.max(0, Number(v || 0) - Number(cum[i - 1] || 0)));
}

// ---- Native (axilog ReportV1) ----

function computeDeathsPerBucketNative(
    dead: [number, number][],
    bucketCount: number,
    bucketSizeMs: number,
): number[] {
    const out = new Array<number>(bucketCount).fill(0);
    for (const [start] of dead) {
        const idx = Math.min(bucketCount - 1, Math.floor(start / bucketSizeMs));
        if (idx >= 0) out[idx]++;
    }
    return out;
}

/**
 * Positions in `blocks.replay.tracks` are raw world inches already -- no
 * `inchToPixel` conversion needed here (unlike the EI path, whose combat
 * replay positions were image pixels).
 *
 * Member and commander samples are joined on the sample TIMESTAMP, never on
 * the array index. Tracks in this format do not all start at the same tick
 * (this fixture has tracks starting at both t=0 and t=300 with poll_ms=300)
 * and they do not all have the same length, so index `i` is a different
 * instant for different entities -- an index join silently compares a
 * member's position against the commander's position one poll earlier.
 * A tick with no sample on either side is skipped.
 *
 * Oracle for this function (see `boonPerformance.test.ts`):
 * `blocks.replay.by_entity[id].dist_to_com` is documented as "mean distance
 * to the commander over this actor's ACTIVE polls". Measured against the
 * fixture, the sample mean of the distances this function computes, taken
 * over samples outside the actor's `down`/`dead` intervals, reproduces
 * `dist_to_com` to within 0.005% for all 46 squad members -- so the two are
 * the same quantity and the field is a genuine independent check, not a
 * restatement. Note this function itself does NOT drop downed/dead samples
 * (neither did the EI path it replaces); the chart wants a position for
 * every tick. Only the oracle applies the liveness filter.
 */
/**
 * The value a bucket with no jointly-sampled replay poll takes.
 *
 * MEASURED, not chosen. The EI path this replaces padded such buckets with
 * `statsAll[0].distToCom` -- GW2EI's mean distance to the commander over the
 * actor's active polls -- and `blocks.replay.by_entity[id].dist_to_com` is
 * documented as literally that same quantity, so passing it through is
 * matching EI rather than inventing a rule. (Truncation, which
 * `extract/timeline.ts` chose for its own lane, is not available here:
 * `BoonPerfPartyMember.distances` is a fixed-length `number[]` indexed by
 * bucket, so there is no way to express "absent" except by not padding at
 * all, which the type forbids.)
 *
 * Which buckets are these? Measured across the 45 non-commander squad
 * members of the fixture, against `computeBoonPerformance`'s own bucket
 * grid: 0 leading, 0 interior, and 7 trailing at 1000ms (5 at 2000ms, 4 at
 * 3000ms, 0 at 5000ms) -- the same shape `extract/timeline.ts` measured, and
 * for the same reason: the last replay poll is t=138300 against a 138333ms
 * fight. Padding a trailing bucket with the actor's own mean distance is
 * therefore the whole of this path.
 *
 * The two non-values are NOT collapsed to zero, which is what the previous
 * revision did and which reads downstream as "standing on the commander":
 *
 *   - ABSENT means the position pass never ran. Under this app's fixed
 *     `PARSE_OPTS` (`replay: true`) it always runs, so absence is a broken
 *     document.
 *   - `-1` is GW2EI's sentinel for "the pass ran and nothing qualified" --
 *     there is no mean to pad with, and EI's own code would have propagated
 *     the -1 as a negative distance, which is not a behaviour worth copying.
 *
 * Both are unreachable on this fixture (all 47 rows carry a real `>= 0`
 * value), so `boonPerformance.test.ts` reaches them by mutating a shallow
 * copy of the report rather than leaving them as untested dead code.
 */
function requireFallbackDist(distToCom: number | undefined, entityId: number): number {
    if (distToCom === undefined) {
        throw new Error(
            `computeBoonPerformance: blocks.replay.by_entity[${entityId}].dist_to_com is absent`
            + ' -- the log was parsed without `replay: true`, so unsampled buckets have no'
            + ' measured distance to fall back to',
        );
    }
    if (distToCom < 0) {
        throw new Error(
            `computeBoonPerformance: blocks.replay.by_entity[${entityId}].dist_to_com is`
            + ` ${distToCom} -- GW2EI's "nothing qualified" sentinel, which is not a distance`,
        );
    }
    return distToCom;
}

function computeDistancesPerBucketNative(
    memberSamples: [number, number, number][],
    cmdSamples: [number, number, number][],
    fallbackDist: number,
    bucketCount: number,
    bucketSizeMs: number,
): number[] {
    const cmdByTime = new Map<number, [number, number, number]>();
    for (const s of cmdSamples) cmdByTime.set(s[0], s);

    const sums = new Array<number>(bucketCount).fill(0);
    const counts = new Array<number>(bucketCount).fill(0);
    for (const [t, x, y] of memberSamples) {
        const cmd = cmdByTime.get(t);
        if (!cmd) continue;
        const idx = Math.min(bucketCount - 1, Math.floor(t / bucketSizeMs));
        if (idx < 0) continue;
        const d = Math.hypot(x - cmd[1], y - cmd[2]);
        if (!Number.isFinite(d)) continue;
        sums[idx] += d;
        counts[idx]++;
    }
    return sums.map((sum, i) => (counts[i] > 0 ? sum / counts[i] : fallbackDist));
}

/**
 * Sums, across every squad member, the portion of `buffId`'s stack timeline
 * that `localId` applied -- the rekeyed equivalent of EI's
 * `statesPerSource[localName]`. Native's `per_source.by_source` is keyed by
 * the APPLYING entity's id, so no name join (and no name-collision hazard)
 * is needed.
 *
 * There is no "no `per_source` anywhere" fallback. Under the app's fixed
 * `PARSE_OPTS` (`timeseries: true`) `per_source` is present on every row
 * whose `states` timeline is non-empty; it is omitted only where `states`
 * is `[]`, i.e. that entity never held the buff, which carries no source
 * attribution to lose. A row with a non-empty `states` and no `per_source`
 * is a real data gap and throws rather than being papered over.
 *
 * An all-zero result is therefore a REAL zero (this entity applied the buff
 * to nobody), not a stand-in for missing data -- measured on the fixture:
 * 15 of 46 squad members generate no Stability for anyone, and their own
 * `generation.{self,group,squad}_pct` are all exactly 0, agreeing.
 */
function computeSelfGenerationPerBucketNative(
    r: ReportV1,
    localId: number,
    buffId: number,
    bucketCount: number,
    bucketSizeMs: number,
): number[] {
    const boons = requireBlock(r, 'boons');
    const summed = new Array<number>(bucketCount).fill(0);
    for (const member of squadMembers(r)) {
        const row = boons.by_entity[String(member.id)]?.[String(buffId)];
        if (!row) continue;
        if (row.states === undefined) {
            throw new Error(
                `computeSelfGenerationPerBucketNative: blocks.boons.by_entity[${member.id}][${buffId}]`
                + ' has no `states` timeline -- it was parsed without `timeseries: true`',
            );
        }
        if (row.states.length > 0 && !row.per_source) {
            throw new Error(
                `computeSelfGenerationPerBucketNative: blocks.boons.by_entity[${member.id}][${buffId}]`
                + ' has a non-empty `states` timeline but no `per_source` attribution',
            );
        }
        const sourceStates = row.per_source?.by_source?.[String(localId)];
        if (!sourceStates || sourceStates.length === 0) continue;
        const perBucket = integrateStatesPerBucket(sourceStates as Array<[number, number]>, bucketCount, bucketSizeMs);
        for (let b = 0; b < bucketCount; b++) summed[b] += perBucket[b];
    }
    return summed;
}

function computePartyIncomingDamageNative(
    r: ReportV1,
    partyIds: number[],
    bucketCount: number,
    bucketSizeMs: number,
): number[] {
    const out = new Array<number>(bucketCount).fill(0);
    const series = requireBlock(r, 'series');
    for (const pid of partyIds) {
        const entitySeries = series.by_entity[String(pid)];
        if (!entitySeries) continue;
        // `damage_taken` is a CUMULATIVE running total (established in Task 2)
        // -- difference it before bucketing, same as the EI path differenced
        // `damageTaken1S`.
        const cum = decodeSeries(entitySeries.damage_taken);
        const deltas = cumulativeToDeltas(cum);
        const intervalMs = entitySeries.damage_taken.interval_ms;
        if (deltas.length === 0 || intervalMs <= 0) continue;
        const bucketSizeIntervals = Math.max(1, Math.round(bucketSizeMs / intervalMs));
        for (let s = 0; s < deltas.length; s++) {
            const bucketIdx = Math.min(bucketCount - 1, Math.floor(s / bucketSizeIntervals));
            out[bucketIdx] += deltas[s];
        }
    }
    return out;
}

/**
 * Boon-performance breakdown for one entity, native format.
 *
 * Rekeying: EI's `statesPerSource` is keyed by character NAME; native's
 * `per_source` is keyed by entity id. `BoonPerfPartyMember.key` is built
 * from the entity id (`String(e.id)`), not an account string -- two players
 * sharing a character name collided under EI and cannot under native, which
 * is a fix, not a regression.
 */
export function computeBoonPerformance(
    r: ReportV1,
    id: number,
    bucketSizeMs: number,
    buffId: number,
): BoonPerfBreakdown | null {
    const durationMs = r.encounter.duration_ms;
    if (!durationMs || durationMs <= 0) return null;

    const effectiveBucketMs = Math.max(1000, Math.round(bucketSizeMs / 1000) * 1000);
    const bucketCount = Math.max(1, Math.ceil(durationMs / effectiveBucketMs));
    const buckets = Array.from({ length: bucketCount }, (_, i) => ({
        startMs: i * effectiveBucketMs,
        label: `${Math.round((i * effectiveBucketMs) / 1000)}s`,
    }));

    const local = r.entities.find(e => e.id === id);
    const localSubgroup = local?.subgroup ?? 0;
    const partyEntities = localSubgroup > 0
        ? squadMembers(r).filter(e => e.subgroup === localSubgroup && e.id !== id)
        : [];

    const boons = requireBlock(r, 'boons');
    const replay = requireBlock(r, 'replay');
    // `tracks` is the separately gated half of `blocks.replay` -- axilog's
    // own doc warns `coverage.replay === "present"` does NOT mean positions
    // are available. Without it every bucket of every party member would
    // take the `dist_to_com` fallback, i.e. the chart would draw one flat
    // line per member and look like a measurement. The app's fixed
    // `PARSE_OPTS` always passes `replay: true`, so absence is a broken
    // parse, and it now fails the same way the absent `dist_to_com` two
    // lines down does.
    const tracks = replay.tracks;
    if (!tracks) {
        throw new Error(
            'computeBoonPerformance: blocks.replay has no `tracks` -- the log was parsed'
            + ' without `replay: true`, so there are no positions to measure distance from',
        );
    }

    const cmdId = commanderId(r) ?? id;
    const cmdTrack = tracks.by_entity[String(cmdId)];
    if (!cmdTrack) {
        throw new Error(`computeBoonPerformance: no replay track for commander entity ${cmdId}`);
    }
    const cmdSamples = cmdTrack.samples;

    const partyMembers: BoonPerfPartyMember[] = partyEntities.map(e => {
        // Native emits a row per tracked boon id for EVERY entity it
        // analysed, so an absent row is "this entity was not analysed", not
        // "this player held no Stability" -- the `?? []` that used to stand
        // here rendered the first as the second, a flat zero lane. A row
        // with no `states` is the `timeseries` gate being off, which
        // `computeSelfGenerationPerBucketNative` already throws for.
        const row = boons.by_entity[String(e.id)]?.[String(buffId)];
        if (!row) {
            throw new Error(
                `computeBoonPerformance: no blocks.boons row for squad entity ${e.id}`
                + ` and buff ${buffId}`,
            );
        }
        if (row.states === undefined) {
            throw new Error(
                `computeBoonPerformance: blocks.boons.by_entity[${e.id}][${buffId}] has no`
                + ' `states` timeline -- it was parsed without `timeseries: true`',
            );
        }
        const states = row.states as Array<[number, number]>;
        // `blocks.replay.by_entity` is keyed by SQUAD entity and `partyEntities`
        // is a subset of `squadMembers(r)`, so a missing row is a broken
        // document rather than "this player has no intervals". The previous
        // `?? []` turned that into a member who silently never died.
        const intervals = replay.by_entity[String(e.id)];
        if (!intervals) {
            throw new Error(`computeBoonPerformance: no replay intervals row for squad entity ${e.id}`);
        }
        const dead = intervals.dead;
        // Same reasoning as the commander's track above: a squad member with
        // no track is a data gap, and silently handing the distance join an
        // empty sample list makes every bucket take the fallback.
        const memberTrack = tracks.by_entity[String(e.id)];
        if (!memberTrack) {
            throw new Error(`computeBoonPerformance: no replay track for squad entity ${e.id}`);
        }
        const memberSamples = memberTrack.samples;
        const fallbackDist = requireFallbackDist(intervals.dist_to_com, e.id);
        return {
            key: String(e.id),
            displayName: (e.account ?? e.name ?? '').split('.')[0],
            profession: e.profession ?? '',
            stacks: integrateStatesPerBucket(states, bucketCount, effectiveBucketMs),
            deaths: computeDeathsPerBucketNative(dead, bucketCount, effectiveBucketMs),
            distances: computeDistancesPerBucketNative(
                memberSamples,
                cmdSamples,
                fallbackDist,
                bucketCount,
                effectiveBucketMs,
            ),
        };
    });

    return {
        bucketSizeMs: effectiveBucketMs,
        bucketCount,
        buckets,
        selfGeneration: computeSelfGenerationPerBucketNative(r, id, buffId, bucketCount, effectiveBucketMs),
        partyIncomingDamage: computePartyIncomingDamageNative(r, partyEntities.map(e => e.id), bucketCount, effectiveBucketMs),
        partyMembers,
    };
}
