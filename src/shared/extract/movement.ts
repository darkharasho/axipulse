// src/shared/extract/movement.ts
import type { Arena, ReplayTrack } from '@axiapps/axilog/types';
import type { ReportV1 } from '../report';
import { requireBlock } from '../report';
import type { MovementData, SquadMemberMovement, SkillCast } from '../types';
import { ALL_TRACKED_BUFF_IDS } from '../boonData';

/**
 * GW2EI squeezes every combat-replay map image to a 750px maximum
 * dimension and reports THAT size as `combatReplayMetaData.sizes`; axilog's
 * own `Arena` doc comment says so explicitly ("GW2EI's `combatReplayMetaData`
 * carries the image size squeezed to a 750px maximum dimension and an
 * `inchToPixel` rounded to three decimals, both artifacts of its renderer").
 *
 * This app's map assets are all expressed in that squeezed space and were
 * NOT produced by this migration: `WVW_LANDMARKS` coordinates are documented
 * as "converted to EI combatReplayData pixel space", with per-map sizes
 * "Alpine BLs: 523x750, EBG: 716x750", and `wvwTiles.ts`' `pixelSize`/
 * `pixelOffset` calibration lives in the same space. Emitting positions in
 * the arena's NATIVE pixel size instead would silently displace every
 * landmark and every map tile by the squeeze factor.
 *
 * The squeeze is checkable rather than assumed: this fixture's map (GW2 map
 * id 95, Green Alpine Borderlands) carries `arena` 697x1000, and
 * 697 * 750/1000 = 522.75, which rounds to the 523 already in
 * `wvwTiles.ts`. `tests/shared/extract/movement.test.ts` pins that agreement
 * for GREEN ONLY -- it is the only map with an `arena` in this fixture, and
 * an arena cannot be synthesised for the other three without assuming the
 * answer. EBG (716x750 over a SQUARE world rect), Blue and Red are
 * unpinned; the tile-rect agreement asserted there is likewise Green's.
 */
export const EI_MAX_IMAGE_DIM = 750;

/**
 * `Arena`'s four world bounds and two image dimensions, validated.
 *
 * Every consumer below divides by one of these spans. A zero or inverted
 * span would silently produce `Infinity`/`NaN`/mirrored coordinates, so it
 * is rejected here once rather than checked at four call sites or -- worse
 * -- papered over with a `|| 1`.
 */
function arenaSpans(a: Arena): { spanX: number; spanY: number } {
    const spanX = a.world_max_x - a.world_min_x;
    const spanY = a.world_max_y - a.world_min_y;
    if (!(spanX > 0) || !(spanY > 0)) {
        throw new Error(
            `extractMovement: arena world rect is degenerate (spanX=${spanX}, spanY=${spanY})`,
        );
    }
    if (!(a.image_width > 0) || !(a.image_height > 0)) {
        throw new Error(
            `extractMovement: arena image is degenerate (${a.image_width}x${a.image_height})`,
        );
    }
    return { spanX, spanY };
}

/**
 * The arena image rescaled into GW2EI's squeezed combat-replay pixel space.
 *
 * A SQUEEZE, never a stretch. `EI_MAX_IMAGE_DIM / max(w, h)` is a downscale
 * only while the arena image is at least 750px on its longest side; a
 * smaller image would be UPSCALED into a space this app's landmark tables do
 * not share, silently displacing every marker on that map. Unreachable on
 * this fixture (max dimension 1000) and not checkable against any other map
 * without a second arena, so it is made loud rather than guessed at: whether
 * GW2EI clamps at 1 or scales both ways is UNKNOWN to me, and picking one
 * silently would be inventing a behaviour. Exercised by
 * `tests/shared/extract/movement.test.ts` with a synthetic sub-750px arena.
 */
export function arenaPixelSize(a: Arena): [number, number] {
    arenaSpans(a);
    const longest = Math.max(a.image_width, a.image_height);
    if (longest < EI_MAX_IMAGE_DIM) {
        throw new Error(
            `extractMovement: arena image is ${a.image_width}x${a.image_height}, whose longest`
            + ` side is below GW2EI's ${EI_MAX_IMAGE_DIM}px cap -- squeezing it would UPSCALE`
            + " into a pixel space this app's landmark and tile tables do not share",
        );
    }
    const squeeze = EI_MAX_IMAGE_DIM / longest;
    return [a.image_width * squeeze, a.image_height * squeeze];
}

/**
 * World inches -> squeezed combat-replay pixels, per `Arena`'s doc comment:
 * world y grows northward and image y grows downward, so the y axis flips.
 */
export function projectToArena(a: Arena, x: number, y: number): [number, number] {
    const { spanX, spanY } = arenaSpans(a);
    const [w, h] = arenaPixelSize(a);
    return [
        (x - a.world_min_x) / spanX * w,
        (1 - (y - a.world_min_y) / spanY) * h,
    ];
}

/**
 * The single pixels-per-inch scalar `MovementData.inchToPixel` has to be.
 *
 * The projection is ANISOTROPIC and that is a property of the data, not a
 * mistake here: on this fixture the arena image is 697x1000 over a
 * 61440x86016 world rect, so `sx = 0.008508` px/inch and `sy = 0.008719`
 * px/inch, a ratio of 0.9758. GW2EI had the same problem and answered it
 * with one rounded scalar; `MovementData.inchToPixel` is that scalar and the
 * renderer divides a pixel distance by it to recover inches.
 *
 * The geometric mean is chosen because it is the MINIMAX scalar for an
 * anisotropic map: any single `s` errs by `sx/s` along x and `sy/s` along y,
 * and `s = sqrt(sx*sy)` is the unique choice that equalises the two relative
 * errors (here +/-1.2% rather than 0% on one axis and 2.4% on the other).
 * That is an argument, not a preference -- but the residual error is real,
 * so it is measured and pinned by `movement.test.ts`.
 *
 * This scalar affects ONLY the map view's on-screen distance readout. The
 * authoritative distance-to-tag numbers (`extract/timeline.ts`,
 * `boonPerformance.ts`) work in raw world inches and never touch it.
 */
export function arenaInchToPixel(a: Arena): number {
    const { spanX, spanY } = arenaSpans(a);
    const [w, h] = arenaPixelSize(a);
    return Math.sqrt((w / spanX) * (h / spanY));
}

/**
 * GW2EI's pseudo-skills (weapon swap, dodge, pet spawn, relic procs) carry
 * NEGATIVE ids. axilog's schema types every skill id as an unsigned 32-bit
 * integer, so those arrive as `4294967294` (`-2`), `4294967268` (`-28`) and
 * so on. Measured on this fixture: six such ids, and every one of them is
 * exactly its EI counterpart reinterpreted as `u32`.
 *
 * They are converted back rather than passed through, because `SkillCast.id`
 * and `MovementData.skillIcons` are the EI-shaped domain model the renderer
 * already speaks, and half the pipeline would otherwise be keyed on
 * `4294967294` while the other half looks up `-2`.
 */
export function signedSkillId(id: number): number {
    return id >= 0x8000_0000 ? id - 0x1_0000_0000 : id;
}

/**
 * A skill id -> `{name, icon}` map for the ids the map view can actually
 * draw. Mirrors the EI producer's rule exactly: an icon is required (there
 * is nothing to render without one) and auto-attacks are excluded (they
 * would bury every deliberate cast).
 *
 * KNOWN UPSTREAM GAP -- axilog's `catalogs.skills` is missing an `icon` for
 * 16 skills that EI's `skillMap` has one for, 8 of which are actually cast
 * in this log, and 6 of those 8 are the pseudo-skills above (Weapon Swap,
 * Ranger Pet Spawned, and four relic/trait procs). The rule below is EI's
 * rule; the divergence is entirely in the input. Pinned by
 * `movement.test.ts` so it fails loudly if axilog closes it.
 */
function buildSkillIcons(r: ReportV1): Record<number, { name: string; icon: string }> {
    const out: Record<number, { name: string; icon: string }> = {};
    for (const [key, def] of Object.entries(r.catalogs.skills)) {
        if (!def.icon || def.auto_attack) continue;
        out[signedSkillId(Number(key))] = { name: def.name, icon: def.icon };
    }
    return out;
}

/**
 * Icons for the buffs the map view's per-member boon strip renders.
 *
 * axilog 1.2.0's `BuffEntry` type omits `icon` but the runtime document
 * carries it -- the same narrow structural cast `extract/timeline.ts` uses,
 * and for the same reason. A tracked buff present in the catalog with no
 * icon is dropped rather than rendered as a blank square, matching the EI
 * producer's `if (... && val.icon)`.
 */
function buildBoonIcons(r: ReportV1): Record<number, { name: string; icon: string }> {
    const out: Record<number, { name: string; icon: string }> = {};
    for (const [key, def] of Object.entries(r.catalogs.buffs)) {
        const id = Number(key);
        if (!ALL_TRACKED_BUFF_IDS.has(id)) continue;
        const icon = (def as { icon?: string }).icon;
        if (!icon) continue;
        out[id] = { name: def.name, icon };
    }
    return out;
}

/**
 * The projected position track, plus the instant its first sample was taken.
 *
 * `SquadMemberMovement.positions` is an index-addressed array: the renderer
 * turns a time into `(t - positionsStartMs) / pollingRate`. That arithmetic
 * is only valid if the samples are a CONTIGUOUS run of `poll_ms` ticks, so
 * this checks it instead of assuming it. Measured on this fixture: all 93
 * tracks are contiguous, every timestamp is an exact multiple of
 * `poll_ms = 300`, and they start at 10 DIFFERENT ticks (one at 0, 82 at
 * 300, ten between 30000 and 100800) with 45 distinct lengths. There is no
 * shared polling grid, which is exactly why the start instant has to travel
 * with the array.
 *
 * A hole is NOT interpolated and a late start is NOT back-filled: either
 * would invent a position the player never occupied, at a moment the log
 * says nothing about.
 */
function projectTrack(
    track: ReplayTrack,
    arena: Arena,
    pollMs: number,
    label: string,
): { positions: [number, number][]; startMs: number } {
    const samples = track.samples;
    const startMs = samples[0][0];
    const positions: [number, number][] = [];
    for (let i = 0; i < samples.length; i++) {
        const [t, x, y] = samples[i];
        if (t !== startMs + i * pollMs) {
            throw new Error(
                `extractMovement: ${label}'s replay track is not a contiguous ${pollMs}ms run --`
                + ` sample ${i} is at t=${t}, expected ${startMs + i * pollMs}`,
            );
        }
        positions.push(projectToArena(arena, x, y));
    }
    return { positions, startMs };
}

/**
 * One entity's casts, filtered to what the map view draws.
 *
 * Two rules, both lifted from the EI producer rather than reinvented:
 *   - the skill must be in `skillIcons` (has an icon, is not an auto-attack);
 *   - a POSITIVE-id cast with `duration <= 0` is dropped. Trait/gear procs
 *     are instant and fire constantly; a user-pressed skill, even an instant
 *     one, still registers an animation duration. The negative pseudo-ids
 *     (dodge, weapon swap) are exempt because they are genuinely instant and
 *     are the whole point of the lane.
 *
 * `casts` absent means the `{ rotation: true }` gate was off for this parse
 * -- the format's own doc says an EMPTY array means "the pass ran and this
 * entity cast nothing" while an absent field means "it never ran". Those are
 * not the same thing and are not collapsed: the app's fixed `PARSE_OPTS`
 * always passes `rotation: true`, so an absent `casts` is a broken document
 * and throws. Only entities with no rotation ROW at all (every enemy player
 * on this fixture -- the block covers squad and friendlies only) get
 * `undefined`, matching the EI producer, which left `skillCasts` undefined
 * for a player with no `rotation`.
 */
function buildSkillCasts(
    r: ReportV1,
    entityId: number,
    skillIcons: Record<number, { name: string; icon: string }>,
): SkillCast[] | undefined {
    const row = r.blocks.rotation?.by_entity[String(entityId)];
    if (!row) return undefined;
    if (row.casts === undefined) {
        throw new Error(
            `extractMovement: blocks.rotation.by_entity[${entityId}] has no \`casts\` --`
            + ' it was parsed without `rotation: true`',
        );
    }
    const out: SkillCast[] = [];
    for (const cast of row.casts) {
        const id = signedSkillId(cast.skill_id);
        if (!skillIcons[id]) continue;
        if (id > 0 && cast.duration_ms <= 0) continue;
        out.push({ id, time: cast.cast_time_ms, duration: cast.duration_ms });
    }
    // CHECKED, not sorted. The EI producer sorted because EI's `rotation`
    // was grouped BY SKILL and therefore out of time order by construction.
    // `blocks.rotation` is documented as "a flat, time-ordered cast list per
    // entity" and this fixture honours it for all 47 rows (measured: zero
    // out-of-order pairs), so a sort here would be a silent repair that can
    // never be observed to have been needed -- proved by mutation: deleting
    // it left all 27 tests passing. The renderer's cast strip walks the
    // array assuming monotonic time, so a document that broke the guarantee
    // has to fail loudly instead.
    for (let i = 1; i < out.length; i++) {
        if (out[i].time < out[i - 1].time) {
            throw new Error(
                `extractMovement: blocks.rotation.by_entity[${entityId}] is not in cast-start`
                + ` order -- cast ${i} is at t=${out[i].time}, after t=${out[i - 1].time}`,
            );
        }
    }
    return out;
}

/**
 * Every buff state timeline the map view's boon strip can draw, for one
 * entity.
 *
 * COVERAGE GAP, same one `extract/timeline.ts` documents: EI carried boons
 * and conditions together in `buffUptimes`, so this map was keyed by all 18
 * `ALL_TRACKED_BUFF_IDS`. Native splits them, and `blocks.boons.by_entity`
 * covers the 12 `WVW_BOON_IDS` only -- the six CC ids (Stun, Daze, Fear,
 * Chill, Immobilize, Slow) have no squad-side state timeline in this format
 * at all. Nothing substitutes a zero: the ids are simply absent from the
 * document, and the intersection is taken rather than the union so an id
 * axilog adds later appears automatically.
 *
 * `undefined` (not `{}`) for an entity with no boons row, matching the EI
 * producer's `if (p.buffUptimes)` -- on this fixture that is exactly the 46
 * enemy players, whom the block does not cover.
 */
function buildBoonStates(
    r: ReportV1,
    entityId: number,
): Record<number, [number, number][]> | undefined {
    const row = r.blocks.boons?.by_entity[String(entityId)];
    if (!row) return undefined;
    const out: Record<number, [number, number][]> = {};
    for (const [key, entry] of Object.entries(row)) {
        const id = Number(key);
        if (!ALL_TRACKED_BUFF_IDS.has(id)) continue;
        if (entry.states === undefined) {
            throw new Error(
                `extractMovement: blocks.boons.by_entity[${entityId}][${id}] has no \`states\``
                + ' timeline -- it was parsed without `timeseries: true`',
            );
        }
        if (entry.states.length === 0) continue;
        out[id] = (entry.states as [number, number][]).map(([t, v]) => [t, v] as [number, number]);
    }
    return out;
}

/** Roles the map view draws, in the order the EI producer emitted them
 *  (allies from `json.players`, then enemies from `json.targets`). The
 *  native `entities[]` array is already grouped that way, so iterating it in
 *  order reproduces the EI ordering without a second pass. */
const DRAWN_ROLES = new Set(['squad', 'friendly_player', 'enemy_player']);

/**
 * The combat-replay movement model for one fight, seen from entity `id`.
 *
 * Returns `null` for exactly three whole-feature absences, all of them
 * documented states of the format rather than data gaps:
 *
 *   1. `blocks.replay` absent -- coverage `not_computed`/`unsupported`.
 *   2. `blocks.replay.tracks` absent -- the position pass is gated on
 *      `{ replay: true }` separately from the rest of the block, and
 *      axilog's own doc warns that `coverage.replay === "present"` does NOT
 *      mean positions are available.
 *   3. `blocks.replay.tracks.arena` absent -- documented as "Omitted when
 *      the log's map id has no known arena". Without the world rect there is
 *      no pixel space to project into, no map image to draw on, and no
 *      `inchToPixel`; a non-WvW or unrecognised map is a map this view
 *      cannot render, not a corrupt log.
 *
 * Everything else absent throws. In particular an entity that is in
 * `entities[]` with a replay track but whose identity fields are missing is
 * a broken document, not an empty movement view.
 */
export function extractMovement(r: ReportV1, id: number): MovementData | null {
    const replay = r.blocks.replay;
    if (replay === undefined) return null;
    const tracks = replay.tracks;
    if (tracks === undefined) return null;
    const arena = tracks.arena;
    if (arena === undefined) return null;

    // Read, never inferred from sample spacing and never defaulted to 300.
    // axilog's `DEFAULT_POLL_MS` happens to be 300 and `ParseOptions` exposes
    // no override, but that is axilog's business, not this module's.
    const pollingRate = tracks.poll_ms;
    if (!(pollingRate > 0)) {
        throw new Error(`extractMovement: blocks.replay.tracks.poll_ms is ${pollingRate}`);
    }

    const skillIcons = buildSkillIcons(r);
    const boonIcons = buildBoonIcons(r);
    // BLOCK-level absence throws; per-ENTITY absence does not. The two are
    // different facts and the previous `r.blocks.series` + optional chaining
    // collapsed them:
    //   - an absent `blocks.series` means the `timeseries` gate was off, the
    //     same gate that makes `boons[].states` throw two functions away.
    //     Under the app's fixed `PARSE_OPTS` it is always on, so absence is
    //     a broken parse -- and swallowing it renders every member with a
    //     flat 100% health bar (`MovementView.getHealthPercent` returns 100
    //     when it finds no timeline), which reads as "everyone was fine".
    //   - an absent `health_percents` on a PRESENT row is documented as
    //     legitimate ("the entity emitted no health updates at all"), and
    //     stays an absent field rather than an invented `[]`.
    const series = requireBlock(r, 'series');

    const members: SquadMemberMovement[] = [];
    for (const e of r.entities) {
        if (!DRAWN_ROLES.has(e.role)) continue;
        const track = tracks.by_entity[String(e.id)];
        if (!track || track.samples.length === 0) continue;

        // Players carry `character`, non-players carry `name`. Enemy players
        // are anonymised by axilog into the `name` slot with no `account`,
        // which is why the EI producer used `account: ''` for them too --
        // preserved literally rather than substituted with the character
        // name, so the two populations stay distinguishable downstream.
        const displayName = e.character ?? e.name;
        if (displayName === undefined) {
            throw new Error(`extractMovement: entity ${e.id} (${e.role}) has neither character nor name`);
        }
        if (e.profession === undefined) {
            throw new Error(`extractMovement: entity ${e.id} (${e.role}) has no profession`);
        }
        // KNOWN UPSTREAM DEFECT, not worked around here: 8 of the 93 player
        // entities in this fixture carry `elite_spec: ''`. The format
        // documents that as "the agent has no elite spec, or one this
        // project cannot name", so the empty string is mapped literally and
        // the renderer's existing `getProfessionIconPath(eliteSpec) ??
        // getProfessionIconPath(profession)` ladder handles it. Substituting
        // the profession here would hide the upstream bug.
        if (e.elite_spec === undefined) {
            throw new Error(`extractMovement: entity ${e.id} (${e.role}) has no elite_spec`);
        }
        // Squad members are the only entities with a real subgroup; the EI
        // producer hardcoded `group: 0` for enemies and non-squad allies, and
        // the party panel filters on it. A SQUAD member without one is a
        // broken document.
        if (e.role === 'squad' && e.subgroup === undefined) {
            throw new Error(`extractMovement: squad entity ${e.id} has no subgroup`);
        }

        const { positions, startMs } = projectTrack(track, arena, pollingRate, `entity ${e.id}`);

        members.push({
            name: displayName,
            account: e.account ?? '',
            profession: e.profession,
            eliteSpec: e.elite_spec,
            group: e.role === 'squad' ? e.subgroup! : 0,
            isCommander: e.commander !== undefined,
            isLocal: e.id === id,
            isEnemy: e.role === 'enemy_player',
            inSquad: e.role === 'squad',
            positions,
            positionsStartMs: startMs,
            // From the TRACK, not from `replay.by_entity`: the two carry the
            // same values for an entity in both, but `by_entity` is squad-only
            // and every enemy's down/dead history lives only here.
            downRanges: track.down_intervals.map(([a, b]) => [a, b] as [number, number]),
            deadRanges: track.dead_intervals.map(([a, b]) => [a, b] as [number, number]),
            boonStates: buildBoonStates(r, e.id),
            // Copied, not aliased, for the same reason `extract/timeline.ts`
            // copies: a `ReportV1` is a parsed input document and the test
            // fixture is memoized across every call in a file.
            healthPercents: series.by_entity[String(e.id)]?.health_percents
                ?.map(([t, v]) => [t, v] as [number, number]),
            skillCasts: buildSkillCasts(r, e.id, skillIcons),
        });
    }

    // Matches the EI producer: no drawable entity means no movement view.
    if (members.length === 0) return null;

    return {
        pollingRate,
        durationMs: r.encounter.duration_ms,
        inchToPixel: arenaInchToPixel(arena),
        members,
        boonIcons,
        skillIcons,
    };
}
