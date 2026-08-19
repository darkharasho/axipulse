// src/shared/extract/timeline.ts
import type { ReportV1, SeriesOut } from '../report';
import { requireBlock, commanderId, decodeSeries } from '../report';
import type { TimelineData, TimelineBucket, BuffStateEntry } from '../types';
import { bucketTimeline, cumulativeToPerSecond } from '../timelineData';
import {
    OFFENSIVE_BOON_IDS, DEFENSIVE_BOON_IDS, HARD_CC_IDS, SOFT_CC_IDS,
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
 * 1000ms, and every series this module reads carries `interval_ms: 1000`
 * for all 46 squad members (measured). That assumption is CHECKED rather
 * than trusted, and a violation throws instead of being papered over: the
 * previous revision bucketed an off-grid series on its own interval, which
 * silently emitted `time: i * intervalMs` and would have broken the
 * `time === bucketIndex * bucketSizeMs` grid every other lane guarantees,
 * while `round(bucketSizeMs / intervalMs)` truncated a non-integer ratio.
 * Dead code that would be wrong if it ever ran is worse than no code.
 *
 * `undefined` is a legitimate input, not an error: `healing_received_1s` /
 * `barrier_received_1s` are optional in the format (absent for enemies and
 * for any log recorded without the arcdps healing extension), and an absent
 * SERIES is not the same thing as a `not_computed` BLOCK -- the block-level
 * hard error is `requireBlock`'s job, and it is applied to `series` in
 * `extractTimeline`. An empty lane renders as "No data", not as a zero.
 * Oracled directly by timeline.test.ts's absent-series test.
 */
function seriesToBuckets(s: SeriesOut | undefined, bucketSizeMs: number): TimelineBucket[] {
    if (!s) return [];
    if (s.interval_ms !== 1000) {
        throw new Error(
            `extractTimeline: series interval_ms is ${s.interval_ms}, expected 1000 --`
            + ' the bucket grid this module emits assumes a one-second sample interval',
        );
    }
    return bucketTimeline(cumulativeToPerSecond(decodeSeries(s)), bucketSizeMs);
}

/**
 * Per-bucket mean distance from this entity to the commander, world inches.
 *
 * Positions in `blocks.replay.tracks` are raw world inches -- there is no
 * `inchToPixel` divisor here, unlike the EI lane's combat-replay pixels
 * (`extractDistanceToTagTimelineEi`, deleted by Task 11). (On this fixture EI's own
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
 * either.
 *
 * `computeDistanceToTagStats` in `extractPlayerData.ts` is the consumer
 * that turns this lane into the average/median distance, and it is where
 * the post-death runback exclusion lives. This lane deliberately KEEPS
 * downed/dead buckets so that consumer has something to exclude; do not
 * move the exclusion in here, it would double-exclude and also strip
 * buckets from the rendered lane. Task 11 wired that consumer to
 * `blocks.replay.by_entity[id].dead` -- three squad members carry real dead
 * intervals natively (EI's `combatReplayData.dead` was `[]` for all 46), and
 * for two of them the exclusion moves the average by an order of magnitude.
 * `extractPlayerData.test.ts` pins both the excluded and unexcluded values.
 *
 * SHAPE -- the lane is TRUNCATED to the ticks actually sampled on both
 * sides, never padded to the damage grid. A bucket with no jointly-sampled
 * poll is an ABSENCE and must not be rendered as distance 0, which reads as
 * "standing on the commander" and would drag the consumer's average toward
 * zero. This matched the EI lane, which built its per-second array only
 * from the samples it had and never padded. Measured
 * on this fixture: 52 unsampled buckets across the 45 non-commander squad
 * members, ALL of them trailing (the last replay poll is t=138300, bucket
 * 138, against a 140-bucket damage grid) and ZERO interior. Because
 * `TimelineBucket` carries an explicit `time`, a lane that starts late or
 * ends early renders correctly against the shared time axis.
 *
 * Interior/leading gaps cannot occur under TWO preconditions, both of which
 * the previous revision's proof was missing one of:
 *
 *  1. every track's samples are contiguous multiples of `poll_ms` -- each
 *     track then covers one contiguous time RANGE, and the intersection of
 *     two contiguous ranges is contiguous. Asserted for all 93 tracks of
 *     this log by the test. NOTE this is a property of the LOG, not a
 *     guarantee of the format.
 *  2. `poll_ms <= bucketSizeMs` -- a contiguous run of ticks only covers a
 *     contiguous run of BUCKETS if consecutive ticks are at most one bucket
 *     apart. At `poll_ms = 300` and `bucketSizeMs = 200` every third bucket
 *     is legitimately empty, and the throw below would fire on a perfectly
 *     healthy log. `extractTimeline` checks that precondition up front and
 *     fails with a message naming both numbers, so the failure is legible
 *     rather than surfacing here as a confusing "interior gap".
 *
 * With both preconditions held, a hole reaching the throw below is a
 * genuine data gap, and this throws rather than inventing a value for it --
 * there is no EI behaviour to copy for a case EI's index join could not
 * represent, so a loud failure is the only non-inventing option.
 */
function distanceToTagBuckets(
    r: ReportV1,
    id: number,
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

    const sums = new Map<number, number>();
    const counts = new Map<number, number>();
    for (const [t, x, y] of selfSamples) {
        const cmd = cmdByTime.get(t);
        if (!cmd) continue;
        const b = Math.floor(t / bucketSizeMs);
        if (b < 0) continue;
        const d = Math.hypot(x - cmd[1], y - cmd[2]);
        if (!Number.isFinite(d)) continue;
        sums.set(b, (sums.get(b) ?? 0) + d);
        counts.set(b, (counts.get(b) ?? 0) + 1);
    }
    if (counts.size === 0) return [];

    const occupied = [...counts.keys()].sort((a, b) => a - b);
    const first = occupied[0];
    const last = occupied[occupied.length - 1];

    const buckets: TimelineBucket[] = [];
    for (let b = first; b <= last; b++) {
        const n = counts.get(b);
        if (n === undefined) {
            throw new Error(
                `extractTimeline: entity ${id} has no jointly-sampled replay poll in bucket ${b}`
                + ` of [${first}, ${last}] -- an interior gap cannot be filled without`
                + ' inventing a distance',
            );
        }
        // Rounded to an integer for parity with the EI lane, whose
        // `bucketTimelineAvg` rounded (that function died with the EI
        // cutover in Task 11); asserted by the test so removing the
        // rounding is a visible change rather than a silent one.
        buckets.push({ time: b * bucketSizeMs, value: Math.round(sums.get(b)! / n) });
    }
    return buckets;
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
    const replayBlock = requireBlock(r, 'replay');
    const replay = replayBlock.by_entity[String(id)];
    if (!replay) throw new Error(`extractTimeline: no replay row for entity ${id}`);

    // Precondition for `distanceToTagBuckets`' interior-gap detection: a
    // poll interval wider than a bucket leaves buckets legitimately empty,
    // which is EXPECTED ABSENCE, not a gap in the data. Checked here so the
    // failure names both numbers instead of surfacing as an "interior gap"
    // error from inside the distance join.
    //
    // Unreachable today, and structurally so rather than by luck:
    //   - axilog's poll interval is the fixed constant `DEFAULT_POLL_MS =
    //     300` (`axilog-core/src/analysis/replay.rs:84`). It does NOT scale
    //     with fight length. The Node binding this app parses through passes
    //     that constant unconditionally
    //     (`axilog-node/src/lib.rs:209-213`) and its `ParseOptions`
    //     (`axilog-node/src/lib.rs:78-97`) exposes no poll override at all,
    //     so no parse this app can issue produces a different value.
    //   - the only bucket sizes the UI offers are 1000/2000/3000/5000ms
    //     (`src/renderer/views/SettingsView.tsx:234`), default 1000
    //     (`src/renderer/store.ts:136`) -- every one of them >= 300.
    // It exists because both of those are external facts that can change
    // without this file noticing.
    const pollMs = replayBlock.tracks?.poll_ms;
    if (pollMs !== undefined && pollMs > bucketSizeMs) {
        throw new Error(
            `extractTimeline: replay poll_ms (${pollMs}) exceeds bucketSizeMs (${bucketSizeMs})`
            + ' -- buckets narrower than the poll interval cannot all be sampled, so the'
            + ' distance lane would report absence it cannot distinguish from a data gap',
        );
    }

    const damageDealt = seriesToBuckets(series.damage, bucketSizeMs);
    const damageTaken = seriesToBuckets(series.damage_taken, bucketSizeMs);
    const incomingHealing = seriesToBuckets(series.healing_received_1s, bucketSizeMs);
    const incomingBarrier = seriesToBuckets(series.barrier_received_1s, bucketSizeMs);

    const distanceToTag = distanceToTagBuckets(r, id, bucketSizeMs);

    const offensiveBoons: Record<number, BuffStateEntry> = {};
    const defensiveBoons: Record<number, BuffStateEntry> = {};
    const hardCC: Record<number, BuffStateEntry> = {};
    const softCC: Record<number, BuffStateEntry> = {};

    // No `?? {}`: a squad entity with no boons row at all is a data gap, not
    // "this player held no boons" -- native emits a row per tracked boon id
    // for every entity it analysed, so an absent row means the entity was
    // not analysed and eight lanes would silently render empty.
    const boonRow = requireBlock(r, 'boons').by_entity[String(id)];
    if (!boonRow) throw new Error(`extractTimeline: no boons row for entity ${id}`);
    for (const [key, row] of Object.entries(boonRow)) {
        const buffId = Number(key);
        // Classify FIRST. The previous revision pre-filtered on
        // `ALL_TRACKED_BUFF_IDS` and then classified, which was exactly
        // redundant -- the four lane sets are a subset of
        // `ALL_TRACKED_BUFF_IDS`, so the pre-filter could never change the
        // outcome (proven by mutation: deleting it left all 223 tests
        // passing). Worse, it was a footgun: adding an id to a lane set
        // without also adding it to `ALL_TRACKED_BUFF_IDS` would have
        // silently dropped it, which is the exact shape of the Fear-785 bug.
        // Classifying first makes the lane sets the single source of truth,
        // and scopes the `states` hard error to ids this module actually
        // renders rather than to every id the block happens to carry.
        const lane = OFFENSIVE_BOON_IDS.has(buffId) ? offensiveBoons
            : DEFENSIVE_BOON_IDS.has(buffId) ? defensiveBoons
                : HARD_CC_IDS.has(buffId) ? hardCC
                    : SOFT_CC_IDS.has(buffId) ? softCC
                        : null;
        if (lane === null) continue;
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
        //
        // Neither a missing catalog entry nor a missing icon gets a silent
        // fallback: the previous `?? \`Buff ${id}\`` / `?? ''` would have
        // rendered a nameless, iconless lane that looks like a real one.
        // The catalog is the document's own index of every buff id it
        // emitted, so a boons row referencing an id it does not define is a
        // broken document.
        const def = r.catalogs.buffs[key] as { name: string; icon?: string } | undefined;
        if (!def) throw new Error(`extractTimeline: buff ${buffId} is missing from catalogs.buffs`);
        if (!def.icon) throw new Error(`extractTimeline: buff ${buffId} has no icon in catalogs.buffs`);
        const entry: BuffStateEntry = {
            name: def.name,
            icon: def.icon,
            // Copied, not aliased. There is no production parse cache --
            // that claim was in an earlier revision of this comment and was
            // simply false. The two REAL reasons:
            //   - a `ReportV1` is a parsed input document, and an extract
            //     that returns interior pointers into it makes the
            //     document's immutability depend on every caller's
            //     discipline forever. Defensive copying at the extract
            //     boundary is the whole justification.
            //   - it is already load-bearing under test: `loadNativeFixture`
            //     memoizes ONE report per test file, shared by every
            //     `extractTimeline` call in it, so an aliased array mutated
            //     by one caller would corrupt every later one.
            states: (row.states as [number, number][]).map(([t, v]) => [t, v] as [number, number]),
        };
        lane[buffId] = entry;
    }

    return {
        bucketSizeMs,
        damageDealt,
        damageTaken,
        distanceToTag,
        incomingHealing,
        incomingBarrier,
        // Copied for the same reasons as `states` above. Absence is
        // legitimate and stays an empty lane: `health_percents` is optional
        // in the format and is omitted for an entity that emitted no health
        // updates at all (the format's own doc notes EI omits
        // `healthPercents` for such a player rather than writing `[]`), so
        // this is a real absence rather than a `not_computed` block. Oracled
        // by timeline.test.ts's absent-health-percents test.
        healthPercent: (series.health_percents ?? []).map(([t, v]) => [t, v] as [number, number]),
        offensiveBoons,
        defensiveBoons,
        hardCC,
        softCC,
        deathEvents: replay.dead.map(([start]) => start),
        downEvents: replay.down.map(([start]) => start),
    };
}
