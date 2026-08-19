import { describe, it, expect } from 'vitest';
import { computeBoonPerformance, STABILITY_BUFF_ID, MIGHT_BUFF_ID } from '../../src/shared/boonPerformance';
import { squadMembers, localPlayerId, decodeSeries, commanderId } from '../../src/shared/report';
import type { ReportV1 } from '../../src/shared/report';
import { loadEiFixture, loadNativeFixture } from './oracle';

/**
 * Time-weighted mean held-stack count per bucket, written independently of
 * `boonPerformance.ts` so it can serve as an oracle for `partyMembers[].stacks`
 * against EI's `buffUptimes[].states`.
 */
function integrateStates(
    states: [number, number][],
    bucketCount: number,
    bucketSizeMs: number,
): number[] {
    const out = new Array<number>(bucketCount).fill(0);
    if (states.length === 0) return out;
    const sorted = [...states].map(s => [Number(s[0]), Number(s[1])] as [number, number])
        .sort((a, b) => a[0] - b[0]);
    for (let b = 0; b < bucketCount; b++) {
        const start = b * bucketSizeMs;
        const end = start + bucketSizeMs;
        let held = 0;
        for (let i = sorted.length - 1; i >= 0; i--) {
            if (sorted[i][0] <= start) { held = sorted[i][1]; break; }
        }
        let area = 0;
        let prev = start;
        for (const [t, s] of sorted) {
            if (t <= start) continue;
            if (t >= end) break;
            area += held * (t - prev);
            prev = t;
            held = s;
        }
        out[b] = (area + held * (end - prev)) / bucketSizeMs;
    }
    return out;
}

const stab = (bucketSizeMs: number, id = localPlayerId(loadNativeFixture())) =>
    computeBoonPerformance(loadNativeFixture(), id, bucketSizeMs, STABILITY_BUFF_ID);

describe('computeBoonPerformance (native)', () => {
    it('produces correct bucket count and labels from the real fixture\'s duration', () => {
        const native = loadNativeFixture();
        const result = stab(1000);
        expect(result).not.toBeNull();
        // Fixture duration is 138333ms (established in Task 1's report) --
        // ceil(138333 / 1000) = 139 one-second buckets.
        expect(native.encounter.duration_ms).toBe(138333);
        expect(result!.bucketSizeMs).toBe(1000);
        expect(result!.bucketCount).toBe(139);
        expect(result!.buckets[0]).toEqual({ startMs: 0, label: '0s' });
        expect(result!.buckets[138]).toEqual({ startMs: 138000, label: '138s' });
    });

    it('floors bucket size to 1s minimum', () => {
        const result = stab(250);
        expect(result!.bucketSizeMs).toBe(1000);
    });

    it('rounds up a partial trailing bucket for a non-round bucket size', () => {
        const result = stab(4000);
        expect(result!.bucketCount).toBe(Math.ceil(138333 / 4000));
    });

    it('respects an explicit bucketSizeMs distinct from the 1000ms default', () => {
        const a = stab(1000);
        const b = stab(6000);
        expect(b!.bucketSizeMs).toBe(6000);
        expect(b!.bucketCount).toBeLessThan(a!.bucketCount);
    });
});

describe('party identification (subgroup-based, native)', () => {
    // The rekeying's other half: party membership is now `subgroup`
    // equality on `EntityOut`, not EI's `group` field on `EiPlayer` --
    // cross-checked for every squad member against an independent
    // subgroup filter, not just the local player's own party.
    it('matches an independent subgroup filter for every squad member with a nonzero subgroup', () => {
        const native = loadNativeFixture();
        let checkedAny = 0;
        for (const e of squadMembers(native)) {
            if (!e.subgroup) continue;
            checkedAny++;
            const result = computeBoonPerformance(native, e.id, 1000, STABILITY_BUFF_ID)!;
            const expectedIds = squadMembers(native)
                .filter(m => m.subgroup === e.subgroup && m.id !== e.id)
                .map(m => String(m.id))
                .sort();
            const actualIds = result.partyMembers.map(m => m.key).sort();
            expect(actualIds).toEqual(expectedIds);
        }
        expect(checkedAny).toBe(46);
    });

    it('returns an empty party for an entity with no subgroup', () => {
        const native = loadNativeFixture();
        const noSubgroup = { ...native.entities[0], subgroup: undefined };
        // No real squad member in this fixture lacks a subgroup (checked by
        // the 46-count assertion above), so this exercises the branch
        // directly rather than searching for a fixture example that may not
        // exist.
        expect(noSubgroup.subgroup).toBeUndefined();
        const result = computeBoonPerformance(native, 999_999, 1000, STABILITY_BUFF_ID);
        // An unknown id resolves to no entity at all -- subgroup falls back
        // to 0, so partyMembers is empty (not a throw: computeBoonPerformance
        // has no "entity must exist" precondition of its own, unlike
        // extractBoons/extractBoonUptimes).
        expect(result!.partyMembers).toEqual([]);
    });
});

describe('party member deaths (native, replay-interval based)', () => {
    // For every squad member's own party, the per-bucket death counts this
    // function derives from `blocks.replay.by_entity[id].dead` must sum to
    // exactly that member's real `dead.length` -- checked against the whole
    // roster's actual party structure, not a synthetic death list.
    it('sums to the real dead-interval count for every party member across the full roster', () => {
        const native = loadNativeFixture();
        let checkedMembers = 0;
        for (const e of squadMembers(native)) {
            if (!e.subgroup) continue;
            const result = computeBoonPerformance(native, e.id, 1000, STABILITY_BUFF_ID)!;
            for (const member of result.partyMembers) {
                checkedMembers++;
                const realDeadCount = native.blocks.replay!.by_entity[member.key]!.dead.length;
                const summedDeaths = member.deaths.reduce((a, b) => a + b, 0);
                expect(summedDeaths, `${member.key} via local ${e.account}`).toBe(realDeadCount);
            }
        }
        expect(checkedMembers).toBeGreaterThan(0);
    });

    it('buckets a death at the bucket containing its real start time', () => {
        const native = loadNativeFixture();
        // Find any real squad member with at least one death this fixture
        // actually recorded, rather than injecting a synthetic one.
        const withDeath = squadMembers(native).find(e =>
            (native.blocks.replay!.by_entity[String(e.id)]?.dead.length ?? 0) > 0);
        expect(withDeath, 'no squad member in this fixture has a recorded death').toBeDefined();

        const localMate = squadMembers(native).find(e => e.subgroup === withDeath!.subgroup && e.id !== withDeath!.id);
        expect(localMate, `no party-mate for ${withDeath!.account} to observe them through`).toBeDefined();

        const result = computeBoonPerformance(native, localMate!.id, 1000, STABILITY_BUFF_ID)!;
        const member = result.partyMembers.find(m => m.key === String(withDeath!.id))!;
        const dead = native.blocks.replay!.by_entity[String(withDeath!.id)].dead;
        for (const [start] of dead) {
            const idx = Math.min(result.bucketCount - 1, Math.floor(start / result.bucketSizeMs));
            expect(member.deaths[idx]).toBeGreaterThan(0);
        }
    });
});

describe('party member stacks (native, per-bucket boon timeline)', () => {
    /**
     * `partyMembers[].stacks` is the literal content of the boon-performance
     * chart and previously had no oracle at all -- replacing the buff-id
     * lookup in `boons.by_entity[e.id][buffId]` with a hardcoded id left the
     * whole suite green.
     *
     * The oracle is EI's own `buffUptimes[buffId].states` for the same
     * account, integrated per bucket by an independent implementation above.
     * Agreement is EXACT (max per-bucket difference 0) for 89 of the 92
     * (member, buff) pairs; the three exceptions are pinned rather than
     * absorbed into a tolerance. Anon189.7993 is the same member whose
     * Stability `avg_stacks` the uptime oracle already pins -- native holds
     * one extra 3s application there.
     */
    const STACK_MISMATCHES = ['Anon154.6698:1122', 'Anon189.7993:1122', 'Anon189.7993:740'];

    it('matches an independent integration of EI buffUptimes[].states for every party member and both charted boons', () => {
        const ei = loadEiFixture();
        const native = loadNativeFixture();
        const accountByKey = new Map(native.entities.map(e => [String(e.id), e.account]));

        const mismatches = new Set<string>();
        const seen = new Set<string>();
        const missingEiPlayer = new Set<string>();

        for (const e of squadMembers(native)) {
            if (!e.subgroup) continue;
            for (const buffId of [STABILITY_BUFF_ID, MIGHT_BUFF_ID]) {
                const result = computeBoonPerformance(native, e.id, 1000, buffId)!;
                for (const member of result.partyMembers) {
                    const account = accountByKey.get(member.key);
                    if (!account) { missingEiPlayer.add(member.key); continue; }
                    seen.add(`${account}:${buffId}`);

                    const eiPlayer = ei.players.find(p => p.account === account);
                    if (!eiPlayer) { missingEiPlayer.add(member.key); continue; }
                    // EI omits a buffUptimes row entirely for a boon the
                    // player never held -- an empty timeline, not a gap.
                    const eiStates = (eiPlayer.buffUptimes ?? []).find(b => b.id === buffId)?.states ?? [];
                    const expected = integrateStates(eiStates, result.bucketCount, result.bucketSizeMs);

                    let maxDiff = 0;
                    for (let b = 0; b < result.bucketCount; b++) {
                        maxDiff = Math.max(maxDiff, Math.abs(member.stacks[b] - expected[b]));
                    }
                    if (maxDiff > 1e-9) mismatches.add(`${account}:${buffId}`);
                }
            }
        }

        expect([...missingEiPlayer], 'party member keys with no EI counterpart').toEqual([]);
        // Vacuity guard: every squad member is somebody's party-mate, so all
        // 46 must be reached for both charted boons.
        expect(seen.size).toBe(46 * 2);
        expect([...mismatches].sort()).toEqual(STACK_MISMATCHES);
    });
});

describe('party member distances (native, world-inch replay tracks)', () => {
    it('produces finite, non-negative distances for every party member across the full roster', () => {
        const native = loadNativeFixture();
        let checkedAny = 0;
        for (const e of squadMembers(native)) {
            if (!e.subgroup) continue;
            const result = computeBoonPerformance(native, e.id, 1000, STABILITY_BUFF_ID)!;
            for (const member of result.partyMembers) {
                for (const d of member.distances) {
                    checkedAny++;
                    expect(Number.isFinite(d)).toBe(true);
                    expect(d).toBeGreaterThanOrEqual(0);
                }
            }
        }
        expect(checkedAny).toBeGreaterThan(0);
    });

    /**
     * The real oracle for `distances`, and the only assertion here that
     * survives mutation.
     *
     * `blocks.replay.by_entity[id].dist_to_com` is documented as "GW2EI's
     * `distToCom` -- mean distance to the commander over this actor's ACTIVE
     * polls, in world inches", i.e. exactly the quantity these per-bucket
     * means average, restricted to polls where the actor is neither downed
     * nor dead. Verified against the fixture before this test was written:
     * recomputing that sample mean from the raw tracks reproduces
     * `dist_to_com` to within 0.005% for all 46 squad members, so it is a
     * genuine independent check rather than a restatement of the same code.
     *
     * `computeBoonPerformance` deliberately does NOT drop downed/dead
     * samples (neither did the EI path), so the comparison is done two ways:
     *
     *  - members with no `down`/`dead` interval at all: every bucket is
     *    live, so the sample-count-weighted mean of `distances` must match
     *    `dist_to_com` to 0.1%. (Measured worst case: 0.0021%.)
     *  - members with a `down`/`dead` interval: buckets that mix live and
     *    non-live samples are dropped, which leaves a coarser estimate, so
     *    2.5% there. (Measured worst case: 1.79%.)
     *
     * The weights come from sample TIMESTAMPS only -- the quantity under
     * test, the distance itself, is read solely from the extract's output.
     *
     * Note the plain unweighted mean of `distances` is NOT usable at 0.5%:
     * 1s buckets hold 3 or 4 of the 300ms polls, and weighting buckets
     * equally rather than by occupancy costs up to 1.2% on its own.
     */
    it('mean party-member distance reproduces blocks.replay.by_entity[id].dist_to_com across the full roster', () => {
        const native = loadNativeFixture();
        const replay = native.blocks.replay!;
        const tracks = replay.tracks!;
        const cmdTimes = new Set((tracks.by_entity[String(commanderId(native)!)]?.samples ?? []).map(s => s[0]));
        expect(cmdTimes.size).toBeGreaterThan(0);

        // `dist_to_com` is tri-state: absent = the position pass never ran,
        // -1 = EI's own "nothing qualified" sentinel, >= 0 = a real distance.
        // Neither non-real state may be averaged in as if it were a distance.
        const absentDistToCom = new Set<string>();
        const sentinelDistToCom = new Set<string>();
        const emptyComparison = new Set<string>();
        const compared = new Set<string>();
        const livenessExcluded = new Set<string>();
        const commanderSelf = new Set<string>();
        const mismatches = new Set<string>();

        for (const e of squadMembers(native)) {
            if (!e.subgroup) continue;
            const result = computeBoonPerformance(native, e.id, 1000, STABILITY_BUFF_ID)!;

            for (const member of result.partyMembers) {
                const row = replay.by_entity[member.key]!;
                const expected = row.dist_to_com;
                if (expected === undefined) { absentDistToCom.add(member.key); continue; }
                if (expected < 0) { sentinelDistToCom.add(member.key); continue; }

                const intervals = [...row.dead, ...row.down];
                const isLive = (t: number) => !intervals.some(([from, to]) => t >= from && t <= to);
                const matched = new Array<number>(result.bucketCount).fill(0);
                const live = new Array<number>(result.bucketCount).fill(0);
                for (const [t] of tracks.by_entity[member.key]?.samples ?? []) {
                    if (!cmdTimes.has(t)) continue;
                    const b = Math.min(result.bucketCount - 1, Math.floor(t / result.bucketSizeMs));
                    matched[b]++;
                    if (isLive(t)) live[b]++;
                }

                const hasLivenessGap = intervals.length > 0;
                if (hasLivenessGap) livenessExcluded.add(member.key);
                let sum = 0;
                let weight = 0;
                for (let b = 0; b < result.bucketCount; b++) {
                    if (matched[b] === 0) continue;
                    if (hasLivenessGap && live[b] !== matched[b]) continue;
                    sum += member.distances[b] * matched[b];
                    weight += matched[b];
                }
                if (weight === 0) { emptyComparison.add(member.key); continue; }
                const actual = sum / weight;

                if (expected === 0) {
                    // The commander's own row: distance to self, in inches.
                    commanderSelf.add(member.key);
                    expect(actual, `commander ${member.key} distance to self`).toBeLessThan(1);
                    continue;
                }
                compared.add(member.key);
                const tolerance = hasLivenessGap ? 0.025 : 0.001;
                if (Math.abs(actual - expected) / expected > tolerance) {
                    mismatches.add(`${member.key} ${actual.toFixed(2)} vs ${expected.toFixed(2)}`);
                }
            }
        }

        expect([...absentDistToCom], 'party members with no dist_to_com at all').toEqual([]);
        expect([...sentinelDistToCom], 'party members with the -1 dist_to_com sentinel').toEqual([]);
        expect([...emptyComparison], 'party members left with no comparable bucket').toEqual([]);
        // Vacuity guards: the liveness skip must not have emptied the tight
        // comparison, and the whole roster must have been reached.
        expect(compared.size + commanderSelf.size).toBe(46);
        expect(commanderSelf.size).toBe(1);
        expect(livenessExcluded.size).toBe(6);
        expect(compared.size - livenessExcluded.size).toBe(39);
        expect([...mismatches]).toEqual([]);
    });
});

/**
 * The unsampled-bucket path -- previously a silent zero, and previously
 * unoracled: forcing its value to 0 left the whole suite green, because the
 * `dist_to_com` oracle above skips exactly the buckets that are its only
 * consumer.
 */
describe('party member distances: the unsampled-bucket fallback (native)', () => {
    /**
     * WHICH buckets take the fallback, measured rather than assumed, and
     * WHAT they take, oracled against the document.
     *
     * The EI path padded a bucket with no jointly-sampled poll using
     * `statsAll[0].distToCom`; `blocks.replay.by_entity[id].dist_to_com` is
     * documented as that same quantity, so the native path pads with it.
     * Truncation -- the answer `extract/timeline.ts` reached for its own
     * lane -- is not available here: `distances` is a fixed-length array
     * indexed by bucket, so "absent" has no representation except padding.
     *
     * Measured across the 45 non-commander squad members at 1000ms buckets:
     * 0 leading, 0 interior, 7 trailing. Trailing because the last replay
     * poll is t=138300 against a 138333ms fight. Pinned at 2000/3000ms too,
     * where the count shrinks as the buckets widen, which is the signature
     * of a trailing edge rather than a scattering of holes.
     */
    it('pads only trailing unsampled buckets, and pads them with dist_to_com', () => {
        const native = loadNativeFixture();
        const replay = native.blocks.replay!;
        const tracks = replay.tracks!;
        const cmdTimes = new Set((tracks.by_entity[String(commanderId(native)!)]!.samples).map(s => s[0]));

        for (const [bucketMs, expectedTrailing] of [[1000, 7], [2000, 5], [3000, 4]] as const) {
            let leading = 0;
            let interior = 0;
            let trailing = 0;
            const wrongValue: string[] = [];
            const seen = new Set<string>();

            for (const e of squadMembers(native)) {
                if (!e.subgroup) continue;
                const result = computeBoonPerformance(native, e.id, bucketMs, STABILITY_BUFF_ID)!;
                for (const member of result.partyMembers) {
                    if (seen.has(member.key)) continue;
                    seen.add(member.key);
                    const expected = replay.by_entity[member.key]!.dist_to_com!;
                    const occupied = new Set<number>();
                    for (const [t] of tracks.by_entity[member.key]!.samples) {
                        if (cmdTimes.has(t)) {
                            occupied.add(Math.min(result.bucketCount - 1, Math.floor(t / result.bucketSizeMs)));
                        }
                    }
                    expect(occupied.size, `${member.key} has some sampled bucket`).toBeGreaterThan(0);
                    const first = Math.min(...occupied);
                    const last = Math.max(...occupied);
                    for (let b = 0; b < result.bucketCount; b++) {
                        if (occupied.has(b)) continue;
                        if (b < first) leading++;
                        else if (b > last) trailing++;
                        else interior++;
                        if (member.distances[b] !== expected) {
                            wrongValue.push(`${member.key}@${b} ${member.distances[b]} != ${expected}`);
                        }
                    }
                }
            }
            expect(seen.size, `${bucketMs}ms roster`).toBe(46);
            expect(leading, `${bucketMs}ms leading`).toBe(0);
            expect(interior, `${bucketMs}ms interior`).toBe(0);
            expect(trailing, `${bucketMs}ms trailing`).toBe(expectedTrailing);
            expect(wrongValue, `${bucketMs}ms padded value`).toEqual([]);
        }
    });

    /**
     * The three absences that sit two lines from `requireFallbackDist` and
     * used to degrade instead of failing: the whole `tracks` half of the
     * replay block, the commander's track, and a party member's own track.
     * All three would have made every bucket take the fallback -- one flat
     * line per member, indistinguishable from a measurement. Unreachable on
     * this fixture, so reached by editing a clone.
     */
    it('throws when the replay tracks, the commander\'s track or a member\'s track is missing', () => {
        const native = loadNativeFixture();
        const local = localPlayerId(native);
        const cmd = commanderId(native)!;
        const partyKey = computeBoonPerformance(native, local, 1000, STABILITY_BUFF_ID)!.partyMembers[0].key;

        const edit = (fn: (replay: any) => void): ReportV1 => {
            const replay = structuredClone(native.blocks.replay!);
            fn(replay);
            return { ...native, blocks: { ...native.blocks, replay } } as ReportV1;
        };
        expect(() => computeBoonPerformance(edit(rp => { delete rp.tracks; }), local, 1000, STABILITY_BUFF_ID))
            .toThrow(/has no `tracks`/);
        expect(() => computeBoonPerformance(edit(rp => { delete rp.tracks.by_entity[String(cmd)]; }), local, 1000, STABILITY_BUFF_ID))
            .toThrow(/no replay track for commander/);
        expect(() => computeBoonPerformance(edit(rp => { delete rp.tracks.by_entity[partyKey]; }), local, 1000, STABILITY_BUFF_ID))
            .toThrow(/no replay track for squad entity/);

        // ... and the boons side of the same class.
        const boons = structuredClone(native.blocks.boons!);
        delete (boons.by_entity as any)[partyKey][String(STABILITY_BUFF_ID)];
        expect(() => computeBoonPerformance(
            { ...native, blocks: { ...native.blocks, boons } } as ReportV1, local, 1000, STABILITY_BUFF_ID,
        )).toThrow(/no blocks.boons row/);

        const boons2 = structuredClone(native.blocks.boons!);
        delete ((boons2.by_entity as any)[partyKey][String(STABILITY_BUFF_ID)]).states;
        expect(() => computeBoonPerformance(
            { ...native, blocks: { ...native.blocks, boons: boons2 } } as ReportV1, local, 1000, STABILITY_BUFF_ID,
            // Anchored on the FUNCTION NAME: `computeSelfGenerationPerBucketNative`
            // throws a message with identical wording for the same row, so an
            // unanchored regex passes even when this check is removed (proved
            // by mutation).
        )).toThrow(/computeBoonPerformance: blocks\.boons\.by_entity\[\d+\]\[\d+\] has no `states` timeline/);
    });

    /**
     * KNOWN DIVERGENCE, accepted as-is by controller ruling rather than
     * chased: the padding RULE matches EI (pad an unsampled bucket with the
     * actor's mean distance to the commander), but the padded NUMBER does
     * not always match EI's own `statsAll[0].distToCom`.
     *
     * Measured across all 46 squad members: median relative difference
     * 0.55%, 38 within 1%, 44 within 2%, and two far-from-tag players at
     * 26.5% (19861.4 vs 15695.9) and 16.3% (19130.5 vs 16455.1). That is an
     * upstream difference in which polls each parser counts as "active" -- a
     * coverage-population difference, the class this plan documents rather
     * than reconciles. The MECHANISM behind the two outliers specifically is
     * UNKNOWN; only the population hypothesis is stated, and it is not
     * proven here.
     *
     * Pinned so the divergence cannot widen unnoticed.
     */
    it('pins the native-vs-EI dist_to_com divergence the padded value inherits', () => {
        const native = loadNativeFixture();
        const ei = loadEiFixture();
        const replay = native.blocks.replay!;

        const rels: number[] = [];
        const worst: string[] = [];
        for (const e of squadMembers(native)) {
            const p = ei.players.find(q => q.account === e.account);
            expect(p, `EI player for ${e.account}`).toBeDefined();
            const nat = replay.by_entity[String(e.id)]!.dist_to_com!;
            const eiv = p!.statsAll![0].distToCom!;
            if (eiv === 0) {
                // The commander's own row: distance to self. Both parsers
                // agree exactly, and it stays in the population so the
                // percentile counts below cover all 46.
                expect(e.commander, `${e.account} has distToCom 0`).toBeDefined();
                expect(nat).toBe(0);
                rels.push(0);
                continue;
            }
            const rel = Math.abs(nat - eiv) / eiv;
            rels.push(rel);
            if (rel > 0.02) worst.push(`${e.account} ${nat.toFixed(1)} vs ${eiv.toFixed(1)}`);
        }
        expect(rels.length).toBe(46);
        rels.sort((a, b) => a - b);
        expect(rels[Math.floor(rels.length / 2)]).toBeCloseTo(0.00554, 4);
        expect(rels.filter(x => x <= 0.01).length).toBe(38);
        expect(rels.filter(x => x <= 0.02).length).toBe(44);
        expect(worst.sort()).toEqual([
            'Anon151.6587 19861.4 vs 15695.9',
            'Anon175.7475 19130.5 vs 16455.1',
        ]);
        expect(rels[rels.length - 1]).toBeCloseTo(0.2654, 4);
    });

    /**
     * The two non-values `dist_to_com` can carry are NOT distances and are
     * no longer collapsed to zero. Both are unreachable on this fixture (all
     * 47 rows carry a real `>= 0` value, asserted here so the mutation is
     * known to be creating the state rather than observing it), so they are
     * reached by editing a clone.
     */
    it('throws rather than padding zero when dist_to_com is absent or the -1 sentinel', () => {
        const native = loadNativeFixture();
        const local = localPlayerId(native);
        const rows = Object.values(native.blocks.replay!.by_entity);
        expect(rows.length).toBe(47);
        expect(rows.every(r => r.dist_to_com !== undefined && r.dist_to_com >= 0)).toBe(true);

        const partyKey = computeBoonPerformance(native, local, 1000, STABILITY_BUFF_ID)!.partyMembers[0].key;

        const edit = (fn: (row: any) => void): ReportV1 => {
            const replay = structuredClone(native.blocks.replay!);
            fn((replay.by_entity as any)[partyKey]);
            return { ...native, blocks: { ...native.blocks, replay } } as ReportV1;
        };

        expect(() => computeBoonPerformance(edit(r => { delete r.dist_to_com; }), local, 1000, STABILITY_BUFF_ID))
            .toThrow(/dist_to_com is absent/);
        expect(() => computeBoonPerformance(edit(r => { r.dist_to_com = -1; }), local, 1000, STABILITY_BUFF_ID))
            .toThrow(/sentinel/);

        // ... and a squad member with no intervals row at all is a broken
        // document, not a member who never died.
        const replay = structuredClone(native.blocks.replay!);
        delete (replay.by_entity as any)[partyKey];
        const stripped = { ...native, blocks: { ...native.blocks, replay } } as ReportV1;
        expect(() => computeBoonPerformance(stripped, local, 1000, STABILITY_BUFF_ID))
            .toThrow(/no replay intervals row/);
    });
});

describe('party incoming damage (native, differenced series)', () => {
    // `blocks.series.by_entity[id].damage_taken` is CUMULATIVE (established
    // in Task 2) -- this function differences it before bucketing, exactly
    // like the EI path differenced `damageTaken1S`. The bucketed sum for
    // one party member must equal that member's own final cumulative value
    // (the sum of all per-interval deltas), checked against the real
    // decoded series, not a synthetic one.
    it('bucket sum for the local player\'s party equals the independently summed final cumulative damage_taken of that same party', () => {
        const native = loadNativeFixture();
        const local = squadMembers(native).find(e => e.subgroup)!;
        const result = computeBoonPerformance(native, local.id, 1000, STABILITY_BUFF_ID)!;

        // The exact party computeBoonPerformance builds internally: squad
        // members sharing `local`'s subgroup, excluding `local` itself.
        const partyIds = squadMembers(native)
            .filter(e => e.subgroup === local.subgroup && e.id !== local.id)
            .map(e => e.id);
        expect(partyIds.length).toBeGreaterThan(0);

        let expectedSum = 0;
        for (const pid of partyIds) {
            const s = native.blocks.series!.by_entity[String(pid)];
            if (!s) continue;
            const c = decodeSeries(s.damage_taken);
            expectedSum += c[c.length - 1] ?? 0;
        }

        const actualSum = result.partyIncomingDamage.reduce((a, b) => a + b, 0);
        expect(actualSum).toBeCloseTo(expectedSum, 5);
        // Sanity that this isn't a vacuous 0-vs-0 comparison.
        expect(expectedSum).toBeGreaterThan(0);
    });

    it('is all zero when the local id has no subgroup-mates', () => {
        const native = loadNativeFixture();
        // Pick a real squad member and pretend they're isolated by calling
        // with an id no one else shares a subgroup with -- easiest real
        // case: an id with subgroup undefined resolves to an empty party.
        const result = computeBoonPerformance(native, 999_999, 1000, STABILITY_BUFF_ID)!;
        expect(result.partyIncomingDamage.every(v => v === 0)).toBe(true);
    });
});

describe('local player stab generation (native, rekeyed per_source)', () => {
    it('produces a non-negative, finite selfGeneration series of the right length for every squad member', () => {
        const native = loadNativeFixture();
        let checkedAny = 0;
        for (const e of squadMembers(native)) {
            checkedAny++;
            const result = computeBoonPerformance(native, e.id, 1000, MIGHT_BUFF_ID)!;
            expect(result.selfGeneration.length).toBe(result.bucketCount);
            for (const v of result.selfGeneration) {
                expect(Number.isFinite(v)).toBe(true);
                expect(v).toBeGreaterThanOrEqual(0);
            }
        }
        expect(checkedAny).toBe(46);
    });

    // Rekeying oracle: summing this function's bucketed selfGeneration
    // (built from `per_source.by_source[String(localId)]`, entity-id-keyed)
    // must integrate to the same total as the local entity's OWN raw
    // per-source contribution, checked by directly integrating
    // `per_source.by_source[id]` from every squad member's boons row over
    // the WHOLE fight in one bucket -- an independent recomputation of the
    // same rekeying this function performs, not a re-read of its output.
    it('integrates to the same total as an independent single-bucket re-derivation from per_source.by_source', () => {
        const native = loadNativeFixture();
        const localId = localPlayerId(native);
        const result = computeBoonPerformance(native, localId, 1000, STABILITY_BUFF_ID)!;
        const summedOverBuckets = result.selfGeneration.reduce((a, b) => a + b * 1000, 0);

        const boons = native.blocks.boons!;
        let independentTotal = 0;
        for (const member of squadMembers(native)) {
            const row = boons.by_entity[String(member.id)][String(STABILITY_BUFF_ID)];
            const src = row.per_source?.by_source[String(localId)];
            if (!src || src.length === 0) continue;
            // Integrate this one source timeline over the whole fight as a
            // single bucket, independent of computeBoonPerformance's own
            // bucketing loop.
            const sorted = [...src].sort((a, b) => a[0] - b[0]);
            let sum = 0;
            for (let i = 0; i < sorted.length; i++) {
                const [t, stacks] = sorted[i];
                const next = sorted[i + 1]?.[0] ?? native.encounter.duration_ms;
                sum += stacks * Math.max(0, next - t);
            }
            independentTotal += sum;
        }

        expect(summedOverBuckets).toBeCloseTo(independentTotal, -1);
    });

    // The removed fallback. `per_source` is omitted exactly where `states`
    // is `[]` (measured on this fixture: 48 such rows, every one with an
    // empty timeline and a 0 uptime), so a row with a non-empty `states` and
    // no `per_source` is a real data gap, not a case to paper over.
    it('throws when a boons row has a non-empty states timeline but no per_source', () => {
        const native = loadNativeFixture();
        const boons = native.blocks.boons!;
        const victim = squadMembers(native).find(e =>
            (boons.by_entity[String(e.id)][String(STABILITY_BUFF_ID)].states?.length ?? 0) > 0);
        expect(victim, 'no squad member has a non-empty stability timeline').toBeDefined();

        const key = String(victim!.id);
        const row = { ...boons.by_entity[key][String(STABILITY_BUFF_ID)] };
        expect(row.per_source).toBeDefined();
        delete row.per_source;
        const mutated: ReportV1 = {
            ...native,
            blocks: {
                ...native.blocks,
                boons: {
                    by_entity: {
                        ...boons.by_entity,
                        [key]: { ...boons.by_entity[key], [String(STABILITY_BUFF_ID)]: row },
                    },
                },
            },
        };

        expect(() => computeBoonPerformance(mutated, localPlayerId(native), 1000, STABILITY_BUFF_ID))
            .toThrow(/per_source/);
    });

    // The other half of the removed fallback. `states` is absent only when
    // the report was parsed without `timeseries: true`, which our fixed
    // PARSE_OPTS never does -- so an absent timeline means the caller got a
    // report it cannot compute generation from, and must not see zeros.
    it('throws when a boons row has no states timeline at all', () => {
        const native = loadNativeFixture();
        const boons = native.blocks.boons!;
        const victim = squadMembers(native).find(e =>
            (boons.by_entity[String(e.id)][String(STABILITY_BUFF_ID)].states?.length ?? 0) > 0);
        expect(victim, 'no squad member has a non-empty stability timeline').toBeDefined();

        const key = String(victim!.id);
        const row = { ...boons.by_entity[key][String(STABILITY_BUFF_ID)] };
        expect(row.states).toBeDefined();
        delete row.states;
        const mutated: ReportV1 = {
            ...native,
            blocks: {
                ...native.blocks,
                boons: {
                    by_entity: {
                        ...boons.by_entity,
                        [key]: { ...boons.by_entity[key], [String(STABILITY_BUFF_ID)]: row },
                    },
                },
            },
        };

        expect(() => computeBoonPerformance(mutated, localPlayerId(native), 1000, STABILITY_BUFF_ID))
            .toThrow(/states/);
    });

    // An all-zero selfGeneration is a REAL zero (this entity applied the
    // boon to nobody), which is why the old "no per_source anywhere ->
    // spread the summary generation evenly" fallback was wrong rather than
    // merely unreachable: it fired for 15 of the 46 squad members on this
    // fixture, and only produced the same zeros by luck.
    it('returns all zeros for a member who applied the boon to nobody, and their summary generation agrees', () => {
        const native = loadNativeFixture();
        const boons = native.blocks.boons!;
        const roster = squadMembers(native);
        const silent = roster.filter(e => !roster.some(m =>
            (boons.by_entity[String(m.id)][String(STABILITY_BUFF_ID)].per_source?.by_source?.[String(e.id)]?.length ?? 0) > 0));
        expect(silent.length).toBe(15);

        for (const e of silent) {
            const result = computeBoonPerformance(native, e.id, 1000, STABILITY_BUFF_ID)!;
            expect(result.selfGeneration.every(v => v === 0), `${e.account} selfGeneration`).toBe(true);
            // Cross-check against the independent summary figures: if this
            // entity really generated nothing, its own generation row is 0
            // too, so the zeros are corroborated, not assumed.
            const gen = boons.by_entity[String(e.id)][String(STABILITY_BUFF_ID)].generation;
            expect(gen.self_pct + gen.group_pct + gen.squad_pct).toBe(0);
        }
    });
});
