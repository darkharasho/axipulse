// src/shared/extract/timeline.ts
import type { ReportV1, SeriesOut } from '../report';
import { requireBlock, commanderId, decodeSeries } from '../report';
import type { TimelineData, TimelineBucket, BuffStateEntry } from '../types';
import { bucketTimeline, cumulativeToPerSecond } from '../timelineData';
import {
    OFFENSIVE_BOON_IDS, DEFENSIVE_BOON_IDS, HARD_CC_IDS, SOFT_CC_IDS, ALL_TRACKED_BUFF_IDS,
} from '../boonData';

/**
 * One cumulative `SeriesOut` -> summed per-bucket deltas.
 *
 * Every `blocks.series.by_entity[id].*` envelope is a CUMULATIVE running
 * total (the axilog type doc says so explicitly for `damage`/`damage_taken`
 * and `healing_received_1s`/`barrier_received_1s` are documented as
 * "Cumulative INCOMING ..."), which is the same shape EI's `damage1S` /
 * `healingReceived1S` had -- so the differencing step
 * (`cumulativeToPerSecond`) and the bucket summation (`bucketTimeline`) are
 * the exact functions the EI path used, reused rather than reimplemented.
 *
 * `bucketTimeline` works in whole seconds because EI's grid was always
 * 1000ms. Native carries `interval_ms` per series, so that assumption is
 * checked rather than trusted: an off-grid series is bucketed on its own
 * interval instead.
 */
function seriesToBuckets(s: SeriesOut | undefined, bucketSizeMs: number): TimelineBucket[] {
    if (!s) return [];
    const perInterval = cumulativeToPerSecond(decodeSeries(s));
    const intervalMs = s.interval_ms;
    if (intervalMs === 1000) return bucketTimeline(perInterval, bucketSizeMs);

    const step = Math.max(1, Math.round(bucketSizeMs / intervalMs));
    const buckets: TimelineBucket[] = [];
    for (let i = 0; i < perInterval.length; i += step) {
        let sum = 0;
        for (let j = i; j < Math.min(i + step, perInterval.length); j++) sum += perInterval[j];
        buckets.push({ time: i * intervalMs, value: sum });
    }
    return buckets;
}

/**
 * Per-bucket mean distance from this entity to the commander, world inches.
 *
 * Positions in `blocks.replay.tracks` are raw world inches -- there is no
 * `inchToPixel` divisor here, unlike `extractDistanceToTagTimelineEi`'s EI
 * combat-replay pixels. (On this fixture EI's own
 * `combatReplayMetaData.pollingRate`/`inchToPixel` are BOTH absent, so the
 * EI timeline path produced an empty `distanceToTag` for every player; the
 * native path is the first one that populates this lane at all.)
 *
 * The join is on the sample TIMESTAMP, never the array index. Tracks in
 * this format do not all start at the same tick (this fixture: `poll_ms`
 * 300, one track starting at t=0 and most at t=300) and have differing
 * lengths, so index `i` is a different instant for different entities.
 * Ticks missing on either side are skipped.
 *
 * Downed/dead samples are NOT dropped: the lane wants a position for every
 * tick the game reported one, and the EI path it replaces did not drop them
 * either. Buckets with no jointly-sampled tick get 0.
 */
function distanceToTagBuckets(
    r: ReportV1,
    id: number,
    bucketCount: number,
    bucketSizeMs: number,
): TimelineBucket[] {
    const cmdId = commanderId(r);
    if (cmdId === null || cmdId === id) return [];

    const tracks = requireBlock(r, 'replay').tracks;
    const selfSamples = tracks?.by_entity[String(id)]?.samples ?? [];
    const cmdSamples = tracks?.by_entity[String(cmdId)]?.samples ?? [];
    if (selfSamples.length === 0 || cmdSamples.length === 0) return [];

    const cmdByTime = new Map<number, [number, number, number]>();
    for (const s of cmdSamples) cmdByTime.set(s[0], s);

    const sums = new Array<number>(bucketCount).fill(0);
    const counts = new Array<number>(bucketCount).fill(0);
    for (const [t, x, y] of selfSamples) {
        const cmd = cmdByTime.get(t);
        if (!cmd) continue;
        const b = Math.floor(t / bucketSizeMs);
        if (b < 0 || b >= bucketCount) continue;
        const d = Math.hypot(x - cmd[1], y - cmd[2]);
        if (!Number.isFinite(d)) continue;
        sums[b] += d;
        counts[b]++;
    }

    return Array.from({ length: bucketCount }, (_, b) => ({
        time: b * bucketSizeMs,
        value: counts[b] > 0 ? Math.round(sums[b] / counts[b]) : 0,
    }));
}

/**
 * The per-fight timeline for one entity.
 *
 * KNOWN COVERAGE GAP -- `hardCC`/`softCC` are always empty under the native
 * format, and this is a real gap rather than a wiring bug. EI carried every
 * buff a player HELD, boons and conditions alike, in one `buffUptimes`
 * list. Native splits them: `blocks.boons.by_entity` is keyed by squad
 * entity and covers the 12 boon ids only (verified on this fixture: the id
 * union across every row is exactly those 12), while
 * `blocks.conditions.by_entity` -- the only block carrying condition stack
 * timelines -- is documented as "enemy entity id -> condition buff id" and
 * on this fixture contains rows for enemies and NPCs exclusively, never for
 * a squad member. Incoming CC on a squad member survives natively only as
 * the scalar `blocks.defenses`.`received_cc_count`/`received_cc_duration_ms`
 * and `blocks.cc`, neither of which is a timeline. Nothing here silently
 * substitutes a zero for a measured value: the states genuinely are not in
 * the document. Pinned by `timeline.test.ts` so the gap fails loudly if a
 * later axilog release closes it.
 */
export function extractTimeline(r: ReportV1, id: number, bucketSizeMs: number): TimelineData {
    const series = requireBlock(r, 'series').by_entity[String(id)];
    if (!series) throw new Error(`extractTimeline: no series row for entity ${id}`);
    const replay = requireBlock(r, 'replay').by_entity[String(id)];
    if (!replay) throw new Error(`extractTimeline: no replay row for entity ${id}`);

    const damageDealt = seriesToBuckets(series.damage, bucketSizeMs);
    const damageTaken = seriesToBuckets(series.damage_taken, bucketSizeMs);
    const incomingHealing = seriesToBuckets(series.healing_received_1s, bucketSizeMs);
    const incomingBarrier = seriesToBuckets(series.barrier_received_1s, bucketSizeMs);

    const distanceToTag = distanceToTagBuckets(r, id, damageDealt.length, bucketSizeMs);

    const offensiveBoons: Record<number, BuffStateEntry> = {};
    const defensiveBoons: Record<number, BuffStateEntry> = {};
    const hardCC: Record<number, BuffStateEntry> = {};
    const softCC: Record<number, BuffStateEntry> = {};

    const boonRow = requireBlock(r, 'boons').by_entity[String(id)] ?? {};
    for (const [key, row] of Object.entries(boonRow)) {
        const buffId = Number(key);
        if (!ALL_TRACKED_BUFF_IDS.has(buffId)) continue;
        if (row.states === undefined) {
            throw new Error(
                `extractTimeline: blocks.boons.by_entity[${id}][${buffId}] has no \`states\``
                + ' timeline -- it was parsed without `timeseries: true`',
            );
        }
        // axilog 1.2.0's `BuffEntry` type omits `icon`, but the runtime
        // document carries it (this file's test asserts every one of the
        // 322 comparable rows matches EI's `buffMap` icon exactly), so it
        // is read through a narrow structural cast rather than dropped.
        const def = r.catalogs.buffs[key] as { name: string; icon?: string } | undefined;
        const entry: BuffStateEntry = {
            name: def?.name ?? `Buff ${buffId}`,
            icon: def?.icon ?? '',
            // Copied, not aliased: the ReportV1 is memoized (the oracle
            // helper, and the production parse cache), so handing out the
            // live array would let any consumer that mutates it corrupt the
            // document for everyone else -- the same reason `decodeSeries`
            // copies.
            states: (row.states as [number, number][]).map(([t, v]) => [t, v] as [number, number]),
        };
        if (OFFENSIVE_BOON_IDS.has(buffId)) offensiveBoons[buffId] = entry;
        else if (DEFENSIVE_BOON_IDS.has(buffId)) defensiveBoons[buffId] = entry;
        else if (HARD_CC_IDS.has(buffId)) hardCC[buffId] = entry;
        else if (SOFT_CC_IDS.has(buffId)) softCC[buffId] = entry;
    }

    return {
        bucketSizeMs,
        damageDealt,
        damageTaken,
        distanceToTag,
        incomingHealing,
        incomingBarrier,
        // Copied for the same reason as `states` above.
        healthPercent: (series.health_percents ?? []).map(([t, v]) => [t, v] as [number, number]),
        offensiveBoons,
        defensiveBoons,
        hardCC,
        softCC,
        deathEvents: replay.dead.map(([start]) => start),
        downEvents: replay.down.map(([start]) => start),
    };
}
