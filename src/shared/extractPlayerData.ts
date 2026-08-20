// src/shared/extractPlayerData.ts
//
// The composer. Every number in `PlayerFightData` is produced by one of the
// `extract/*` units, each of which was migrated and oracled against Elite
// Insights independently (Tasks 3-10). This file's only jobs are to resolve
// the local player once, hand each unit the report and that id, and derive
// the handful of fields that belong to no unit -- the map identity, the
// fight label, and the distance-to-tag summary.
import type { Arena } from '@axiapps/axilog/types';
import type { PlayerFightData, TimelineData, SquadMemberMovement } from './types';
import type { ReportV1 } from './report';
import { localPlayerId, requireBlock } from './report';
import { extractIdentity } from './extract/identity';
import { extractDamage } from './extract/damage';
import { extractSupport } from './extract/support';
import { extractDefense } from './extract/defense';
import { extractBoons } from './extract/boons';
import { extractTimeline } from './extract/timeline';
import { extractComposition, extractSquadContext } from './extract/composition';
import { extractMovement, arenaPixelSize } from './extract/movement';
import { memberPosAt } from './movementFrame';
import { classifyRole } from './classifyRole';
import { resolveMapFromMapId, normalizeMapName, formatDuration } from './mapUtils';
import { findNearestLandmark } from './wvwLandmarks';

/**
 * How far past a death the runback exclusion keeps excluding: until the
 * distance falls back to `RUNBACK_MULTIPLIER` times the pre-death distance,
 * or `RUNBACK_FLOOR_INCHES`, whichever is larger. Both carried verbatim from
 * the EI-path implementation this replaces.
 */
const RUNBACK_MULTIPLIER = 1.5;
const RUNBACK_FLOOR_INCHES = 400;

/**
 * Average and median distance to the commander, excluding deaths and runbacks.
 *
 * `deadRanges` is `blocks.replay.by_entity[id].dead`, and passing it is the
 * whole point of this signature. `extract/timeline.ts` deliberately does NOT
 * apply the exclusion -- that reading was reviewed and upheld in Task 8, on
 * the grounds that doing it in both places would double-exclude and would
 * also strip buckets out of the RENDERED lane, which wants a point for every
 * tick the game sampled. So the `distanceToTag` lane arrives here still
 * carrying its dead-interval buckets, and this is the only place they are
 * dropped. Omitting the argument would silently average every corpse-run
 * into the player's distance to tag.
 *
 * That omission was untestable on the EI path: `combatReplayData.dead` is
 * `[]` for all 46 players in the frozen EI fixture, so the exclusion never
 * executed and no oracle could see it missing.
 *
 * It is testable now, but NOT via the local player, who has `dead: []` and
 * `down: []` like everyone did under EI (asserted by this file's own test).
 * THREE OTHER squad members -- `Anon151.6587`, `Anon175.7475`,
 * `Anon174.7438` -- carry one real `blocks.replay.by_entity[id].dead`
 * interval each, and `extractPlayerData.test.ts` reaches them by repointing
 * `encounter.recorded_by`. For `Anon151.6587` the exclusion moves the mean
 * from 17986 to 2046 inches. Both figures are pinned, so dropping the
 * argument fails. (An earlier revision of this comment said the intervals
 * were the local player's; they are not.)
 *
 * No `?? 0` on the pre-death reference distance. A death with no earlier
 * sampled bucket has no reference, which is a different thing from a
 * reference of zero (that would read as "was standing on the tag" and set
 * the return threshold to the bare floor by accident rather than on
 * purpose); the floor is applied explicitly instead.
 */
export function computeDistanceToTagStats(
    timeline: TimelineData,
    deadRanges: [number, number][],
    isCommander: boolean,
): { average: number; median: number } | null {
    if (isCommander) return null;
    const buckets = timeline.distanceToTag;
    if (buckets.length === 0) return null;

    let effective = buckets;
    if (deadRanges.length > 0) {
        const excluded = new Set<number>();
        for (const [s, e] of deadRanges) {
            const preDeathBucket = buckets.filter(b => b.time < s).at(-1);
            const returnThreshold = preDeathBucket === undefined
                ? RUNBACK_FLOOR_INCHES
                : Math.max(preDeathBucket.value * RUNBACK_MULTIPLIER, RUNBACK_FLOOR_INCHES);
            let inExcluded = false;
            for (let i = 0; i < buckets.length; i++) {
                const b = buckets[i];
                if (b.time >= s && b.time <= e) {
                    excluded.add(i);
                    inExcluded = true;
                } else if (inExcluded && b.time > e) {
                    if (b.value <= returnThreshold) {
                        inExcluded = false;
                    } else {
                        excluded.add(i);
                    }
                }
            }
        }
        const filtered = buckets.filter((_, i) => !excluded.has(i));
        effective = filtered.length > 0 ? filtered : buckets;
    }

    const values = effective.map(b => b.value);
    const sum = values.reduce((a, b) => a + b, 0);
    const average = Math.round(sum / values.length);
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    const median = Math.round(
        sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid],
    );
    return { average, median };
}

/**
 * The median x and the median y of the local player's projected track --
 * NOT a position they ever occupied, and not meant to be. It is the "where
 * was this fight" marker, and the median is used rather than the mean
 * because a single runback across the map would drag a mean off the field.
 * Carried verbatim from the EI path (which took the same two independent
 * medians).
 */
function computeFightPosition(local: SquadMemberMovement | undefined): [number, number] | null {
    if (!local || local.positions.length === 0) return null;
    const xs = local.positions.map(p => p[0]).sort((a, b) => a - b);
    const ys = local.positions.map(p => p[1]).sort((a, b) => a - b);
    const mid = Math.floor(local.positions.length / 2);
    return [xs[mid], ys[mid]];
}

/**
 * Where the player was at each of `times`, in the same squeezed
 * combat-replay pixel space the map view draws in.
 *
 * Through `memberPosAt`, i.e. through TIME -- never `positions[floor(t /
 * pollingRate)]`, which is what the EI path did. Position tracks do not
 * share a start tick (this fixture: ten distinct start instants across 93
 * tracks), so an index computed from an absolute time is only correct for a
 * member whose track happens to begin at 0. This is the fourth appearance of
 * that bug class in this migration.
 *
 * `null` for a time before the track begins is DROPPED rather than clamped
 * to the first sample: a death recorded before the player's first position
 * poll has no known location, and pinning a skull to wherever they later
 * appeared would be inventing one. The EI path's `positions[idx] ?? null`
 * filter had the same effect for out-of-range indices.
 */
function positionsAt(
    local: SquadMemberMovement | undefined,
    times: number[],
    pollingRate: number | undefined,
): [number, number][] {
    // Both absences travel together and are the same absence: a member only
    // exists because `extractMovement` returned a `MovementData`, which is
    // where `pollingRate` comes from. Taking `number | undefined` rather
    // than letting the caller write `?? 0` keeps the impossible combination
    // out of the type instead of papering it over with a sentinel that
    // would divide.
    if (!local || pollingRate === undefined) return [];
    return times
        .map(t => memberPosAt(local, t, pollingRate))
        .filter((p): p is [number, number] => p !== null);
}

/**
 * The map image size the renderer lays its SVG out in.
 *
 * From `blocks.replay.tracks.arena`, squeezed through `arenaPixelSize` into
 * GW2EI's 750px-max combat-replay pixel space -- the space this app's
 * landmark tables and tile calibration are already expressed in, and the
 * space `extractMovement` projects positions into. Reading it from the
 * document rather than from `wvwTiles.ts`' hand-transcribed table means the
 * markers and the tiles cannot disagree.
 *
 * `null` when the log has no arena (a map axilog has no world rect for),
 * which is the same condition that makes `extractMovement` return `null`.
 */
function arenaOf(r: ReportV1): Arena | undefined {
    return r.blocks.replay?.tracks?.arena;
}

/**
 * Wall-clock fight start as an ISO string, or `null`.
 *
 * `encounter.started_at_unix` is SECONDS since the epoch and is documented
 * as "Omitted when the log carries no such event -- absence is deliberately
 * distinguishable from epoch zero, so do not default it to 0".
 *
 * `null`, not a throw, and not `new Date().toISOString()` (which the EI path
 * used and which silently labelled an old log with the time it was parsed).
 * A throw would discard an otherwise completely analysable fight over a
 * field only the history list's clock renders; `null` is the honest value
 * and `HistoryEntry.tsx` renders it as a dash. `PlayerFightData.timestamp`
 * and `FightHistoryEntry.timestamp` were widened to `string | null` for
 * this, so a consumer that forgets the case is a type error rather than a
 * `new Date(null)` that quietly reads 1970.
 */
function isoTimestamp(r: ReportV1): string | null {
    const secs = r.encounter.started_at_unix;
    if (secs === undefined) return null;
    return new Date(secs * 1000).toISOString();
}

export function extractPlayerFightData(
    r: ReportV1,
    fightNumber: number,
    bucketSizeMs: number,
): PlayerFightData {
    const id = localPlayerId(r);
    const identity = extractIdentity(r, id);

    // `encounter.map` is the display name and `map_id` is the join key. The
    // id path (Task 9's `resolveMapFromMapId`) is the only one production
    // uses now -- it covers all four WvW maps this app holds assets for, and
    // `mapUtils.test.ts` pins that it agrees with the retired display-name
    // matcher on every one of them. `map_id` is optional in the format
    // ("Omitted when the log carries no MAP_ID event"), and absence means
    // "no map assets", exactly as an unrecognised id does.
    const mapId = r.encounter.map_id;
    const map = mapId === undefined ? null : resolveMapFromMapId(mapId);
    const mapName = normalizeMapName(r.encounter.map);

    const arena = arenaOf(r);
    const mapSize: [number, number] | null = arena ? arenaPixelSize(arena) : null;

    const movementData = extractMovement(r, id);
    const localMember = movementData?.members.find(m => m.isLocal);
    const avgPos = computeFightPosition(localMember);

    let nearestLandmark: string | null = null;
    if (map && avgPos) {
        nearestLandmark = findNearestLandmark(map, avgPos[0], avgPos[1])?.name ?? null;
    }

    const replay = requireBlock(r, 'replay').by_entity[String(id)];
    if (!replay) {
        throw new Error(`extractPlayerFightData: no replay intervals row for local entity ${id}`);
    }

    // No `?? 300` and no `?? 0`: the poll grid comes from the document that
    // produced the positions. `movementData === null` means there are no
    // positions to place at all, and `positionsAt` takes the `undefined`
    // rather than being handed a sentinel.
    const pollingRate = movementData?.pollingRate;
    const downPositions = positionsAt(localMember, replay.down.map(([t]) => t), pollingRate);
    const deathPositions = positionsAt(localMember, replay.dead.map(([t]) => t), pollingRate);

    const duration = r.encounter.duration_ms;
    const durationFormatted = formatDuration(duration);
    const landmarkPart = nearestLandmark ? ` — ${nearestLandmark}` : '';
    const fightLabel = `F${fightNumber} — ${mapName}${landmarkPart} — ${durationFormatted}`;

    const timeline = extractTimeline(r, id, bucketSizeMs);

    return {
        fightLabel,
        fightNumber,
        mapName,
        mapId: mapId ?? null,
        nearestLandmark,
        // `blocks.replay.tracks.arena.image_url` is the native format's
        // equivalent of GW2EI's `combatReplayMetaData.maps[0].url`, and it
        // is non-optional on `Arena`. `null` only when the log carries no
        // arena at all -- `MapView` has no tile fallback, so a null here is
        // a bare rectangle with floating pins.
        mapImageUrl: arena ? arena.image_url : null,
        mapSize,
        avgPosition: avgPos,
        downPositions,
        deathPositions,
        duration,
        durationFormatted,
        timestamp: isoTimestamp(r),
        playerName: identity.playerName,
        accountName: identity.accountName,
        profession: identity.profession,
        eliteSpec: identity.eliteSpec,
        isCommander: identity.isCommander,

        damage: extractDamage(r, id),
        support: extractSupport(r, id),
        defense: extractDefense(r, id),
        // The live bucket size, not a baked-in constant. `SettingsView`
        // lets the user change it in-session and `useFightListener` passes
        // the current value in; `extractBoons` used to hardcode 1000, which
        // would have made that control a silent no-op for the two boon
        // performance charts.
        boons: extractBoons(r, id, bucketSizeMs),
        timeline,
        squadContext: extractSquadContext(r, id),
        movementData,
        roleClassification: classifyRole(r, id),
        distanceToTag: computeDistanceToTagStats(timeline, replay.dead, identity.isCommander),
        fightComposition: extractComposition(r),
    };
}
