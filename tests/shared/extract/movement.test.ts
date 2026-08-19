import { describe, it, expect } from 'vitest';
import {
    extractMovement, arenaPixelSize, arenaInchToPixel, projectToArena,
    signedSkillId, EI_MAX_IMAGE_DIM,
} from '../../../src/shared/extract/movement';
import { memberFrame, memberPosAt } from '../../../src/shared/movementFrame';
import { getMapTiles } from '../../../src/shared/wvwTiles';
import { resolveMapFromMapId } from '../../../src/shared/mapUtils';
import { WvwMap } from '../../../src/shared/wvwLandmarks';
import { localPlayerId, commanderId } from '../../../src/shared/report';
import { ALL_TRACKED_BUFF_IDS, WVW_BOON_IDS, HARD_CC_IDS, SOFT_CC_IDS } from '../../../src/shared/boonData';
import { loadEiFixture, loadNativeFixture } from '../oracle';
import type { ReportV1 } from '../../../src/shared/report';
import type { Arena } from '@axiapps/axilog/types';

/** A shallow-cloned report with one surgical change, so a path the fixture
 *  cannot reach is still executed rather than left as untested dead code.
 *  Never mutates the memoized fixture. */
function withReplay(r: ReportV1, edit: (replay: any) => void): ReportV1 {
    const replay = structuredClone(r.blocks.replay);
    edit(replay);
    return { ...r, blocks: { ...r.blocks, replay } } as ReportV1;
}

const ARENA_95: Arena = {
    image_width: 697,
    image_height: 1000,
    image_url: 'https://darkharasho.github.io/axibridge-map-tiles/icons/imgur-nVu2ivF.png',
    world_min_x: -30720,
    world_min_y: -43008,
    world_max_x: 30720,
    world_max_y: 43008,
};

describe('arena geometry', () => {
    /**
     * The world rect axilog ships is not axilog's invention: it is GW2's own
     * `map_rect` for this map. Fetched live from
     * `https://api.guildwars2.com/v2/maps/95` while writing this test:
     * `{"type":"GreenHome","map_rect":[[-30720,-43008],[30720,43008]]}`.
     * Pinned as a literal so a future arena change is a visible diff against
     * the authority rather than a silent reprojection of every marker.
     */
    it('carries GW2\'s own map_rect for the fixture\'s map', () => {
        const native = loadNativeFixture();
        expect(native.encounter.map_id).toBe(95);
        expect(resolveMapFromMapId(native.encounter.map_id!)).toBe(WvwMap.GreenBorderlands);
        const arena = native.blocks.replay!.tracks!.arena!;
        expect([arena.world_min_x, arena.world_min_y, arena.world_max_x, arena.world_max_y])
            .toEqual([-30720, -43008, 30720, 43008]);
        expect([arena.image_width, arena.image_height]).toEqual([697, 1000]);
    });

    /**
     * The squeeze is the load-bearing claim of this module: every map asset
     * this app holds (`WVW_LANDMARKS`, `wvwTiles.ts`' `pixelSize`) is in
     * GW2EI's 750px-max space, so positions have to land there too. 697x1000
     * -> 522.75x750 agrees with `wvwTiles.ts`' hand-transcribed [523, 750]
     * to within half a pixel, which is the independent check that the
     * squeeze is real and not a coincidence of one number.
     */
    it('squeezes the arena image into the same pixel space the map assets use', () => {
        expect(EI_MAX_IMAGE_DIM).toBe(750);
        const [w, h] = arenaPixelSize(ARENA_95);
        expect([w, h]).toEqual([522.75, 750]);
        // `wvwTiles.ts`' table entry for the same map.
        const tiles = getMapTiles(WvwMap.GreenBorderlands, 5);
        const overridden = getMapTiles(WvwMap.GreenBorderlands, 5, [w, h]);
        expect(overridden.length).toBe(tiles.length);
        expect(tiles.length).toBeGreaterThan(0);
        for (let i = 0; i < tiles.length; i++) {
            expect(Math.abs(overridden[i].x - tiles[i].x), `tile ${i} x`).toBeLessThan(0.5);
            expect(Math.abs(overridden[i].y - tiles[i].y), `tile ${i} y`).toBeLessThan(0.5);
        }
        // ... and the override is really being read, not ignored.
        const doubled = getMapTiles(WvwMap.GreenBorderlands, 5, [w * 2, h * 2]);
        expect(doubled[0].width).toBeCloseTo(overridden[0].width * 2, 6);
        expect(doubled[0].width).not.toBeCloseTo(overridden[0].width, 6);
    });

    /**
     * The projection is anisotropic by 2.4%, and `inchToPixel` is one
     * scalar, so some error is unavoidable. The geometric mean splits it
     * evenly. All four numbers are pinned: changing the choice is then a
     * visible decision, not a drift.
     */
    it('pins the anisotropy inchToPixel has to approximate', () => {
        const [w, h] = arenaPixelSize(ARENA_95);
        const sx = w / (ARENA_95.world_max_x - ARENA_95.world_min_x);
        const sy = h / (ARENA_95.world_max_y - ARENA_95.world_min_y);
        expect(sx).toBeCloseTo(0.00850830078125, 12);
        expect(sy).toBeCloseTo(0.008719308035714286, 12);
        expect(sx / sy).toBeCloseTo(0.9758, 4);
        const s = arenaInchToPixel(ARENA_95);
        expect(s).toBeCloseTo(Math.sqrt(sx * sy), 12);
        expect(s).toBeCloseTo(0.008613158269312556, 12);
        // Equalised error: the geometric mean sits the same FACTOR away from
        // each axis scale (sx/s === s/sy exactly), which is the sense in
        // which it is the minimax choice. ~1.2% either way.
        expect(sx / s).toBeCloseTo(s / sy, 12);
        expect(s / sx - 1).toBeCloseTo(0.01232, 5);
        expect(sy / s - 1).toBeCloseTo(0.01232, 5);
    });

    it('projects the arena corners onto the image corners, y flipped', () => {
        const [w, h] = arenaPixelSize(ARENA_95);
        // world y grows northward, image y grows downward
        expect(projectToArena(ARENA_95, -30720, 43008)).toEqual([0, 0]);
        expect(projectToArena(ARENA_95, 30720, -43008)).toEqual([w, h]);
        expect(projectToArena(ARENA_95, 0, 0)).toEqual([w / 2, h / 2]);
    });

    it('rejects a degenerate arena instead of emitting Infinity', () => {
        expect(() => arenaPixelSize({ ...ARENA_95, world_max_x: -30720 }))
            .toThrow(/degenerate/);
        expect(() => arenaPixelSize({ ...ARENA_95, image_height: 0 }))
            .toThrow(/degenerate/);

        // ... and through `extractMovement`, not only through the helper: a
        // degenerate arena is a broken block, so it must THROW rather than
        // take the `arena === undefined -> null` exit two lines above it.
        const native = loadNativeFixture();
        const degenerate = withReplay(native, replay => {
            replay.tracks.arena.world_max_y = replay.tracks.arena.world_min_y;
        });
        expect(() => extractMovement(degenerate, localPlayerId(native))).toThrow(/degenerate/);
    });

    /**
     * The squeeze must never become a STRETCH. Unreachable on this fixture
     * (arena 697x1000), and no second map's arena exists to measure against,
     * so an upscale is made loud instead of guessed at -- whether GW2EI
     * clamps at 1 or scales both ways is unknown.
     */
    it('refuses to upscale a sub-750px arena into the landmark tables\' pixel space', () => {
        expect(Math.max(ARENA_95.image_width, ARENA_95.image_height)).toBe(1000);
        expect(() => arenaPixelSize({ ...ARENA_95, image_width: 349, image_height: 500 }))
            .toThrow(/would UPSCALE/);
        // Exactly at the cap is fine and is the identity.
        expect(arenaPixelSize({ ...ARENA_95, image_width: 523, image_height: 750 }))
            .toEqual([523, 750]);

        const native = loadNativeFixture();
        const small = withReplay(native, replay => {
            replay.tracks.arena.image_width = 349;
            replay.tracks.arena.image_height = 500;
        });
        expect(() => extractMovement(small, localPlayerId(native))).toThrow(/would UPSCALE/);
    });
});

/**
 * The CONSUMER half of `positionsStartMs`, and the reason it is in
 * `src/shared/` at all.
 *
 * The producer-side pin (`positionsStartMs` equals each track's own
 * `samples[0][0]`) says nothing about whether anything downstream USES the
 * offset. Both of these functions previously lived in `MovementView.tsx`,
 * where reverting them to an index join left the whole suite green -- the
 * exact bug class this migration has now hit four times, in the one place
 * added to prevent it.
 */
describe('memberFrame / memberPosAt', () => {
    /** The member whose track starts latest -- t=100800, 100.8 seconds after
     *  the fight begins. An index join misplaces this one by 336 polls. */
    function latestStarter() {
        const native = loadNativeFixture();
        const m = extractMovement(native, localPlayerId(native))!;
        const late = m.members.reduce((a, b) => (b.positionsStartMs > a.positionsStartMs ? b : a));
        expect(late.positionsStartMs, 'the fixture\'s latest-starting track').toBe(100800);
        expect(late.positions.length).toBe(110);
        return { m, late };
    }

    it('resolves a member from their OWN start instant, not from t=0', () => {
        const { m, late } = latestStarter();
        const rate = m.pollingRate;
        expect(rate).toBe(300);

        // Sample i is at positionsStartMs + i * pollingRate. Under an index
        // join, t=100800 resolves to index 336, which this 110-sample track
        // clamps to its LAST position -- a different point on the map.
        expect(memberPosAt(late, 100800, rate)).toEqual(late.positions[0]);
        expect(memberPosAt(late, 101100, rate)).toEqual(late.positions[1]);
        expect(memberPosAt(late, 102000, rate)).toEqual(late.positions[4]);
        expect(memberFrame(late, 100800, rate)).toEqual({ idx: 0, frac: 0 });
        expect(memberFrame(late, 100950, rate)).toEqual({ idx: 0, frac: 0.5 });
        expect(late.positions[0]).not.toEqual(late.positions[late.positions.length - 1]);

        // After the last sample the frame clamps rather than going null.
        const lastT = late.positionsStartMs + (late.positions.length - 1) * rate;
        expect(memberPosAt(late, lastT, rate)).toEqual(late.positions[late.positions.length - 1]);
        expect(memberPosAt(late, lastT + 10_000, rate)).toEqual(late.positions[late.positions.length - 1]);
    });

    it('returns null before a member\'s track begins, rather than pinning them to their first position', () => {
        const { m, late } = latestStarter();
        const rate = m.pollingRate;

        expect(memberFrame(late, 100500, rate)).toBeNull();
        expect(memberPosAt(late, 100500, rate)).toBeNull();
        expect(memberPosAt(late, 0, rate)).toBeNull();
        // Not vacuous: one poll later the same member resolves.
        expect(memberPosAt(late, 100800, rate)).not.toBeNull();

        // 92 of the 93 members have not joined at t=0 -- every track except
        // the single one that starts there. Without this guard each of them
        // would be drawn at their first position for their entire pre-join
        // window; for the 10 of them whose start is not the common t=300
        // that window is between 30 and 100 seconds long. (11 tracks start
        // somewhere other than t=300, but one of those is the single t=0
        // track, which is present at t=0 by definition.)
        const absentAtZero = m.members.filter(x => memberPosAt(x, 0, rate) === null);
        expect(absentAtZero.length).toBe(92);
        expect(absentAtZero.every(x => x.positionsStartMs > 0)).toBe(true);
        expect(absentAtZero.filter(x => x.positionsStartMs !== 300).length).toBe(10);
        expect(m.members.filter(x => x.positionsStartMs !== 300).length).toBe(11);
        // The one track that starts at t=0 resolves there.
        const atZero = m.members.filter(x => x.positionsStartMs === 0);
        expect(atZero.length).toBe(1);
        expect(memberPosAt(atZero[0], 0, rate)).toEqual(atZero[0].positions[0]);
    });

    /**
     * The Task-8-grade guard, adapted from that review's warning: 82 of 93
     * tracks start at t=300 together, so a test written against a typical
     * member catches an index join on almost nobody. Shifting a member's own
     * start by one poll and asserting the OUTPUT moves is the check that
     * bites, because an index join ignores `positionsStartMs` entirely and
     * therefore produces byte-identical output for every member.
     *
     * Measured: 93 of 93 members change under a correct join, 0 of 93 under
     * an index join.
     */
    it('shifting a member\'s start by one poll changes their resolved positions', () => {
        const { m } = latestStarter();
        const rate = m.pollingRate;

        let changedMembers = 0;
        let changedInstants = 0;
        let comparedInstants = 0;
        for (const member of m.members) {
            const shifted = { ...member, positionsStartMs: member.positionsStartMs + rate };
            let changed = false;
            for (let i = 0; i < member.positions.length; i++) {
                const t = member.positionsStartMs + i * rate;
                comparedInstants++;
                const a = memberPosAt(member, t, rate);
                const b = memberPosAt(shifted, t, rate);
                if (JSON.stringify(a) !== JSON.stringify(b)) { changed = true; changedInstants++; }
            }
            if (changed) changedMembers++;
        }
        expect(changedMembers).toBe(93);
        expect(comparedInstants).toBeGreaterThan(30000);
        // Every member changes at their own first instant at minimum (the
        // shifted copy has not started yet there), so the floor is 93.
        expect(changedInstants).toBeGreaterThanOrEqual(93);
    });
});

describe('extractMovement', () => {
    // ---- roster and track shape ---------------------------------------

    /**
     * Vacuity guard for every full-roster loop below, and the roster oracle
     * the brief asks for: the map view draws squad + non-squad friendlies +
     * enemy players, and every one of them has a position track.
     */
    it('draws every player entity that has a replay track', () => {
        const native = loadNativeFixture();
        const roles = native.entities.reduce<Record<string, number>>(
            (a, e) => { a[e.role] = (a[e.role] ?? 0) + 1; return a; }, {},
        );
        expect(roles).toEqual({ squad: 46, friendly_player: 1, enemy_player: 46, npc: 36 });

        const m = extractMovement(native, localPlayerId(native))!;
        expect(m).not.toBeNull();
        expect(m.members.length).toBe(93);
        expect(m.members.filter(x => x.inSquad).length).toBe(46);
        expect(m.members.filter(x => x.isEnemy).length).toBe(46);
        expect(m.members.filter(x => !x.inSquad && !x.isEnemy).length).toBe(1);
        expect(m.members.filter(x => x.isLocal).length).toBe(1);
        expect(m.members.filter(x => x.isCommander).length).toBe(1);
        // Allies first, then enemies -- the order the EI producer emitted
        // (`json.players` then `json.targets`), which the native `entities[]`
        // ordering already reproduces.
        expect(m.members.findIndex(x => x.isEnemy)).toBe(47);
        expect(m.members.slice(47).every(x => x.isEnemy)).toBe(true);
        // No NPC is drawn even though 36 exist.
        expect(m.members.length).toBe(native.entities.length - 36);
    });

    /**
     * The role filter is load-bearing even though no NPC in this fixture has
     * a track: an NPC that DID have one would otherwise be emitted as a
     * member with `isEnemy: false, inSquad: false`, which the map view draws
     * as a non-squad ally. Reached by giving an NPC a track on a clone,
     * because the fixture cannot reach it on its own.
     */
    it('never draws an NPC, even one that has a position track', () => {
        const native = loadNativeFixture();
        const npc = native.entities.find(e => e.role === 'npc')!;
        expect(native.blocks.replay!.tracks!.by_entity[String(npc.id)]).toBeUndefined();

        const withNpcTrack = withReplay(native, replay => {
            replay.tracks.by_entity[String(npc.id)] =
                structuredClone(replay.tracks.by_entity['0']);
        });
        const m = extractMovement(withNpcTrack, localPlayerId(native))!;
        expect(m.members.length).toBe(93);
        expect(Object.keys(withNpcTrack.blocks.replay!.tracks!.by_entity).length).toBe(94);
    });

    /**
     * THE SHAPE OF THE POSITION DATA -- and the reason
     * `positionsStartMs` exists.
     *
     * The plan's original wording asked for "every member's `positions`
     * array is the same length (one polling grid)". That is measurably false
     * here and asserting it would have forced padding, i.e. inventing
     * positions the player never occupied. The real shape: 93 tracks, 45
     * distinct lengths, TEN distinct start ticks. Each track is individually
     * a contiguous `poll_ms` run, which is what makes index addressing valid
     * WITHIN a member and invalid ACROSS members.
     */
    it('has 45 distinct track lengths and ten distinct start ticks, each track contiguous', () => {
        const native = loadNativeFixture();
        const tracks = native.blocks.replay!.tracks!;
        expect(tracks.poll_ms).toBe(300);

        const starts: Record<number, number> = {};
        const lengths = new Set<number>();
        let offGrid = 0;
        let nonContiguous = 0;
        for (const track of Object.values(tracks.by_entity)) {
            const s = track.samples;
            expect(s.length).toBeGreaterThan(0);
            starts[s[0][0]] = (starts[s[0][0]] ?? 0) + 1;
            lengths.add(s.length);
            for (let i = 0; i < s.length; i++) {
                if (s[i][0] % tracks.poll_ms !== 0) offGrid++;
                if (s[i][0] !== s[0][0] + i * tracks.poll_ms) nonContiguous++;
            }
        }
        expect(Object.keys(tracks.by_entity).length).toBe(93);
        expect(lengths.size).toBe(45);
        expect(starts).toEqual({
            0: 1, 300: 82, 30000: 1, 36600: 1, 59700: 1,
            61200: 2, 61800: 2, 63000: 1, 65100: 1, 100800: 1,
        });
        expect(offGrid).toBe(0);
        expect(nonContiguous).toBe(0);
    });

    /**
     * The producer half of the "never join two entities by array index"
     * rule. `positionsStartMs` is what makes the timestamp recoverable from
     * an index; if it were dropped (as the EI producer dropped GW2EI's
     * `combatReplayData.start`), 11 of the 93 members would be drawn at the
     * wrong instant -- one by a single poll and ten by up to 100 seconds.
     */
    it('carries each track\'s own start instant, and they are not all equal', () => {
        const native = loadNativeFixture();
        const tracks = native.blocks.replay!.tracks!;
        const m = extractMovement(native, localPlayerId(native))!;

        const byId = new Map(native.entities.map(e => [e.id, e]));
        const mismatches: string[] = [];
        for (const member of m.members) {
            const entity = native.entities.find(e =>
                (e.character ?? e.name) === member.name
                && (e.account ?? '') === member.account);
            expect(entity, `entity for ${member.name}`).toBeDefined();
            const samples = tracks.by_entity[String(entity!.id)].samples;
            if (member.positionsStartMs !== samples[0][0]) {
                mismatches.push(`${member.name} ${member.positionsStartMs}/${samples[0][0]}`);
            }
            if (member.positions.length !== samples.length) {
                mismatches.push(`${member.name} len ${member.positions.length}/${samples.length}`);
            }
        }
        expect(mismatches).toEqual([]);
        expect(byId.size).toBe(native.entities.length);

        const distinctStarts = new Set(m.members.map(x => x.positionsStartMs));
        expect(distinctStarts.size).toBe(10);
        // 11 members would be misplaced by an index join that assumed t=0.
        expect(m.members.filter(x => x.positionsStartMs !== 300).length).toBe(11);
        expect(Math.max(...distinctStarts)).toBe(100800);
    });

    it('throws on a track with an interior hole rather than interpolating one', () => {
        const native = loadNativeFixture();
        const holed = withReplay(native, replay => {
            const s = replay.tracks.by_entity['0'].samples;
            s.splice(5, 1);
        });
        expect(() => extractMovement(holed, localPlayerId(native)))
            .toThrow(/not a contiguous 300ms run/);
    });

    // ---- scalars -------------------------------------------------------

    /**
     * `pollingRate` is READ from `blocks.replay.tracks.poll_ms`. Proved by
     * mutation: an inferred-from-spacing or hardcoded-300 implementation
     * would ignore this edit and still report 300.
     */
    it('reads pollingRate from poll_ms rather than inferring it', () => {
        const native = loadNativeFixture();
        expect(extractMovement(native, localPlayerId(native))!.pollingRate).toBe(300);

        const retimed = withReplay(native, replay => {
            replay.tracks.poll_ms = 600;
            for (const track of Object.values<any>(replay.tracks.by_entity)) {
                const start = track.samples[0][0];
                track.samples = track.samples.map((s: number[], i: number) =>
                    [start + i * 600, s[1], s[2]]);
            }
        });
        expect(extractMovement(retimed, localPlayerId(native))!.pollingRate).toBe(600);

        const broken = withReplay(native, replay => { replay.tracks.poll_ms = 0; });
        expect(() => extractMovement(broken, localPlayerId(native))).toThrow(/poll_ms is 0/);
    });

    /** Cross-format oracle: the two parsers agree on the fight length exactly. */
    it('reports the same fight duration Elite Insights did', () => {
        const native = loadNativeFixture();
        const ei = loadEiFixture();
        const m = extractMovement(native, localPlayerId(native))!;
        expect(m.durationMs).toBe(138333);
        expect(m.durationMs).toBe(ei.durationMS);
        expect(m.durationMs).toBe(native.encounter.duration_ms);
    });

    it('exposes the arena-derived inchToPixel', () => {
        const native = loadNativeFixture();
        const m = extractMovement(native, localPlayerId(native))!;
        expect(m.inchToPixel).toBeCloseTo(arenaInchToPixel(native.blocks.replay!.tracks!.arena!), 12);
        expect(m.inchToPixel).toBeCloseTo(0.008613158269312556, 12);
    });

    // ---- projection ----------------------------------------------------

    it('projects every position inside the arena image', () => {
        const native = loadNativeFixture();
        const arena = native.blocks.replay!.tracks!.arena!;
        const [w, h] = arenaPixelSize(arena);
        const m = extractMovement(native, localPlayerId(native))!;

        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        const outside: string[] = [];
        for (const member of m.members) {
            for (const [px, py] of member.positions) {
                if (px < 0 || px > w || py < 0 || py > h) outside.push(`${member.name} ${px},${py}`);
                minX = Math.min(minX, px); maxX = Math.max(maxX, px);
                minY = Math.min(minY, py); maxY = Math.max(maxY, py);
            }
        }
        expect(outside).toEqual([]);
        // Pinned so a sign flip or an axis swap -- both of which would still
        // land "inside the image" -- fails.
        expect(minX).toBeCloseTo(71.50, 2);
        expect(maxX).toBeCloseTo(257.84, 2);
        expect(minY).toBeCloseTo(354.34, 2);
        expect(maxY).toBeCloseTo(684.17, 2);

        const cmd = commanderId(native)!;
        const first = native.blocks.replay!.tracks!.by_entity[String(cmd)].samples[0];
        expect(first).toEqual([300, -5130.7, -2971.7]);
        const cmdMember = m.members.find(x => x.isCommander)!;
        expect(cmdMember.positions[0][0]).toBeCloseTo(217.7214611816406, 6);
        expect(cmdMember.positions[0][1]).toBeCloseTo(400.9111676897321, 6);
    });

    // ---- identity ------------------------------------------------------

    it('maps identity fields literally, including the empty elite specs', () => {
        const native = loadNativeFixture();
        const m = extractMovement(native, localPlayerId(native))!;
        // KNOWN UPSTREAM DEFECT (axilog): 8 of the 93 player entities carry
        // `elite_spec: ''`. Mapped through rather than papered over, so the
        // bug stays visible.
        expect(m.members.filter(x => x.eliteSpec === '').length).toBe(8);
        // Enemy players are anonymised with no account; allies all have one.
        expect(m.members.filter(x => x.account === '').length).toBe(46);
        expect(m.members.filter(x => x.isEnemy && x.account !== '').length).toBe(0);
        // Subgroups: squad only.
        expect(m.members.filter(x => !x.inSquad && x.group !== 0).length).toBe(0);
        expect(m.members.filter(x => x.inSquad && x.group === 0).length).toBe(0);
        expect(m.members.every(x => x.profession.length > 0)).toBe(true);

        const local = m.members.find(x => x.isLocal)!;
        const localEntity = native.entities.find(e => e.id === localPlayerId(native))!;
        expect(local.name).toBe(localEntity.character);
        expect(local.account).toBe(localEntity.account);
    });

    it('throws on an entity with a track but no identity', () => {
        const native = loadNativeFixture();
        const id = localPlayerId(native);
        const strip = (field: string) => {
            const entities = native.entities.map(e =>
                e.id === 0 ? Object.fromEntries(Object.entries(e).filter(([k]) => k !== field)) : e);
            return { ...native, entities } as ReportV1;
        };
        expect(() => extractMovement(strip('profession'), id)).toThrow(/no profession/);
        expect(() => extractMovement(strip('elite_spec'), id)).toThrow(/no elite_spec/);
        expect(() => extractMovement(strip('subgroup'), id)).toThrow(/no subgroup/);
        expect(() => extractMovement(strip('character'), id)).toThrow(/neither character nor name/);
    });

    // ---- down/dead -----------------------------------------------------

    /**
     * Read from the TRACK, not from `blocks.replay.by_entity`. The two agree
     * for squad members -- asserted here, which is what makes the choice
     * safe -- but `by_entity` is squad-only, so reading it would have lost
     * every enemy's down/dead history entirely.
     */
    it('takes down/dead ranges from the track, which agrees with by_entity for the squad', () => {
        const native = loadNativeFixture();
        const replay = native.blocks.replay!;
        const m = extractMovement(native, localPlayerId(native))!;
        const byName = new Map(m.members.map(x => [`${x.name}|${x.account}`, x]));

        let squadChecked = 0;
        for (const e of native.entities.filter(x => x.role === 'squad')) {
            const member = byName.get(`${e.character}|${e.account}`)!;
            const intervals = replay.by_entity[String(e.id)];
            expect(member.downRanges, `${e.account} down`).toEqual(intervals.down);
            expect(member.deadRanges, `${e.account} dead`).toEqual(intervals.dead);
            squadChecked++;
        }
        expect(squadChecked).toBe(46);

        // Enemy down/dead exists only on the track, and it is not empty --
        // so the choice of source is load-bearing, not cosmetic.
        const enemyDowns = m.members.filter(x => x.isEnemy && x.downRanges.length > 0).length;
        expect(enemyDowns).toBeGreaterThan(0);
        expect(Object.keys(replay.by_entity).length).toBe(47);
    });

    // ---- health --------------------------------------------------------

    /** Exact cross-format oracle: the health timelines are identical. */
    it('reproduces Elite Insights\' healthPercents exactly for every squad member', () => {
        const native = loadNativeFixture();
        const ei = loadEiFixture();
        const m = extractMovement(native, localPlayerId(native))!;
        const byAccount = new Map(m.members.map(x => [x.account, x]));

        let compared = 0;
        const mismatches: string[] = [];
        for (const p of ei.players) {
            const member = byAccount.get(p.account);
            if (!member) continue;
            compared++;
            if (JSON.stringify(member.healthPercents) !== JSON.stringify(p.healthPercents)) {
                mismatches.push(p.account);
            }
        }
        expect(compared).toBe(46);
        expect(mismatches).toEqual([]);
        // Enemies have no series row at all -- absent, not an empty array.
        expect(m.members.filter(x => x.isEnemy).every(x => x.healthPercents === undefined)).toBe(true);
    });

    // ---- boons ---------------------------------------------------------

    /**
     * Cross-format oracle on the boons both formats carry, plus the pinned
     * coverage gap on the 6 CC ids. `blocks.boons` has no squad-side
     * condition timeline at all, so the map view's boon strip loses Stun,
     * Daze, Fear, Chill, Immobilize and Slow relative to EI. Nothing
     * substitutes a zero for them; the ids are absent from the document.
     *
     * The 504 comparable timelines are compared BYTE-FOR-BYTE first -- 457
     * are identical -- and the 47 that are not are then characterised rather
     * than waved at:
     *
     *   - 41 have IDENTICAL stack-value sequences and differ only in
     *     transition timestamps, by at most 123ms. That is the two parsers
     *     computing a buff's expiry instant slightly differently, and it is
     *     directly observable in the arrays rather than inferred.
     *   - 6 differ in length. The mechanism for those is UNKNOWN; they are
     *     pinned by account and buff id so a change is visible.
     *
     * 40 of the 47 are Regeneration (718), which `extract/timeline.ts`'s own
     * boon oracle does not cover (it compares only the 8 offensive/defensive
     * lane ids). The three it does report -- Anon189.7993:740,
     * Anon189.7993:1122, Anon154.6698:1187 -- appear here too.
     */
    it('reproduces EI\'s boon state timelines and pins the missing CC lanes', () => {
        const native = loadNativeFixture();
        const ei = loadEiFixture();
        const m = extractMovement(native, localPlayerId(native))!;
        const byAccount = new Map(m.members.map(x => [x.account, x]));
        const end = native.encounter.duration_ms;

        expect(ALL_TRACKED_BUFF_IDS.size).toBe(18);
        expect(WVW_BOON_IDS.size).toBe(12);

        const missingLanes = new Set<number>();
        const extraLanes: string[] = [];
        const differing: string[] = [];
        const lengthDiffering: string[] = [];
        let compared = 0;
        let timelines = 0;
        let identical = 0;
        let maxTimestampDelta = 0;
        let valueSequenceDiffering = 0;
        for (const p of ei.players) {
            const member = byAccount.get(p.account);
            if (!member?.boonStates) continue;
            compared++;
            for (const key of Object.keys(member.boonStates)) {
                if (!WVW_BOON_IDS.has(Number(key))) extraLanes.push(`${p.account}:${key}`);
            }
            for (const buff of p.buffUptimes ?? []) {
                if (!ALL_TRACKED_BUFF_IDS.has(buff.id) || !buff.states?.length) continue;
                const nativeStates = member.boonStates[buff.id];
                if (!nativeStates) { missingLanes.add(buff.id); continue; }
                timelines++;
                const eiStates = buff.states as [number, number][];
                if (JSON.stringify(nativeStates) === JSON.stringify(eiStates)) { identical++; continue; }
                differing.push(`${p.account}:${buff.id}`);
                if (nativeStates.length !== eiStates.length) { lengthDiffering.push(`${p.account}:${buff.id}`); continue; }
                let sameValues = true;
                for (let i = 0; i < nativeStates.length; i++) {
                    if (nativeStates[i][1] !== eiStates[i][1]) sameValues = false;
                    maxTimestampDelta = Math.max(maxTimestampDelta, Math.abs(nativeStates[i][0] - eiStates[i][0]));
                }
                if (!sameValues) valueSequenceDiffering++;
            }
        }
        expect(compared).toBe(46);
        expect(extraLanes, 'boon lanes outside WVW_BOON_IDS').toEqual([]);
        expect(timelines).toBe(504);
        expect(identical).toBe(457);
        expect(differing.length).toBe(47);
        // Timestamp-only, and small.
        expect(valueSequenceDiffering).toBe(0);
        expect(maxTimestampDelta).toBe(123);
        expect(lengthDiffering.sort()).toEqual([
            'Anon154.6698:1122',
            'Anon170.7290:743',
            'Anon189.7993:1122',
            'Anon189.7993:740',
            'Anon200.8400:740',
            'Anon163.7031:743',
        ].sort());
        expect(differing.filter(k => k.endsWith(':718')).length).toBe(40);
        // The three `extract/timeline.ts`'s own boon oracle pins show up
        // here too -- checked, not narrated.
        for (const k of ['Anon189.7993:740', 'Anon189.7993:1122', 'Anon154.6698:1187']) {
            expect(differing, `timeline.test.ts pin ${k}`).toContain(k);
        }

        // The CC gap: every lane EI had and native does not is a CC id.
        for (const id of missingLanes) {
            expect(HARD_CC_IDS.has(id) || SOFT_CC_IDS.has(id), `buff ${id} is a CC id`).toBe(true);
        }
        expect(missingLanes.size).toBeGreaterThan(0);
        expect([...missingLanes].every(id => !WVW_BOON_IDS.has(id))).toBe(true);

        // Enemies have no boons row -- `undefined`, not `{}`.
        expect(m.members.filter(x => x.isEnemy).every(x => x.boonStates === undefined)).toBe(true);
        expect(end).toBe(138333);

        // Native emits a row per tracked boon id for every covered entity,
        // including `states: []` for a boon the player never held; EI simply
        // omitted the buff. Empty lanes are dropped so the two agree and the
        // renderer does not draw an always-zero strip -- and the filter is
        // load-bearing, not decorative: the raw block really does carry them.
        const rawEmpty = Object.values(native.blocks.boons!.by_entity)
            .flatMap(row => Object.values(row))
            .filter(entry => entry.states!.length === 0).length;
        expect(rawEmpty).toBeGreaterThan(0);
        const emittedEmpty = m.members
            .flatMap(x => Object.values(x.boonStates ?? {}))
            .filter(states => states.length === 0).length;
        expect(emittedEmpty).toBe(0);
    });

    it('throws when a boons row has no states timeline', () => {
        const native = loadNativeFixture();
        const boons = structuredClone(native.blocks.boons!);
        delete (Object.values(boons.by_entity)[0] as any)[String([...WVW_BOON_IDS][0])].states;
        const broken = { ...native, blocks: { ...native.blocks, boons } } as ReportV1;
        expect(() => extractMovement(broken, localPlayerId(native))).toThrow(/no `states` timeline/);
    });

    // ---- rotation ------------------------------------------------------

    it('emits time-ordered skill casts and none for entities with no rotation row', () => {
        const native = loadNativeFixture();
        const m = extractMovement(native, localPlayerId(native))!;
        const unordered: string[] = [];
        let withCasts = 0;
        for (const member of m.members) {
            if (!member.skillCasts) continue;
            withCasts++;
            for (let i = 1; i < member.skillCasts.length; i++) {
                if (member.skillCasts[i].time < member.skillCasts[i - 1].time) {
                    unordered.push(`${member.name}@${i}`);
                }
            }
        }
        expect(unordered).toEqual([]);
        // `blocks.rotation` covers squad + friendlies only.
        expect(withCasts).toBe(47);
        expect(m.members.filter(x => x.isEnemy).every(x => x.skillCasts === undefined)).toBe(true);
    });

    it('throws on out-of-order casts rather than silently sorting them', () => {
        const native = loadNativeFixture();
        const rotation = structuredClone(native.blocks.rotation!);
        // Reversed rather than a two-element swap: most casts are filtered
        // out by the icon/auto-attack gate, so a swap can land entirely on
        // dropped casts and prove nothing. Entity 2 is used because entity 0
        // keeps NONE of its 14 casts through that gate -- a reversal there
        // would prove nothing either, and the assertion below that the
        // reversal really reordered surviving casts guards that.
        const casts = rotation.by_entity['2'].casts!;
        const before = extractMovement(native, localPlayerId(native))!
            .members.find(x => x.name === native.entities.find(e => e.id === 2)!.character)!.skillCasts!;
        expect(before.length).toBeGreaterThan(1);
        casts.reverse();
        const broken = { ...native, blocks: { ...native.blocks, rotation } } as ReportV1;
        expect(() => extractMovement(broken, localPlayerId(native)))
            .toThrow(/not in cast-start order/);
    });

    it('throws when the rotation gate was off but a row exists', () => {
        const native = loadNativeFixture();
        const rotation = structuredClone(native.blocks.rotation!);
        delete (rotation.by_entity['0'] as any).casts;
        const broken = { ...native, blocks: { ...native.blocks, rotation } } as ReportV1;
        expect(() => extractMovement(broken, localPlayerId(native))).toThrow(/no `casts`/);
    });

    /**
     * GW2EI's pseudo-skill ids are negative; axilog types every skill id as
     * `u32`, so they arrive as their two's-complement. Six of them in this
     * log, and each is exactly its EI counterpart.
     */
    it('converts axilog\'s u32 pseudo-skill ids back to EI\'s negative ids', () => {
        const native = loadNativeFixture();
        const ei = loadEiFixture();
        expect(signedSkillId(4294967294)).toBe(-2);
        expect(signedSkillId(19115)).toBe(19115);

        const big = Object.keys(native.catalogs.skills).map(Number).filter(id => id >= 0x8000_0000);
        expect(big.length).toBe(6);
        for (const id of big) {
            const signed = signedSkillId(id);
            expect(signed).toBeLessThan(0);
            expect(ei.skillMap[`s${signed}`]?.name, `s${signed}`)
                .toBe(native.catalogs.skills[String(id)].name);
        }
    });

    /**
     * Cross-format oracle on the cast lane, and a COMPLETE account of where
     * it diverges -- zero unexplained casts on either side.
     *
     * The filter here is EI's own filter (icon required, no auto-attacks, no
     * zero-duration positive-id cast), re-run against each document's own
     * catalog. Measured over the 46 comparable squad members:
     *
     *   1086 casts agree exactly (same signed id, same cast-start ms);
     *    476 are EI-only -- and ALL 476 are present in axilog's RAW cast
     *         list, dropped only by the filter: 458 because
     *         `catalogs.skills` has no icon for the skill, 18 because
     *         axilog flags it `auto_attack` and EI does not;
     *     46 are native-only -- and all 46 are present in EI's RAW rotation,
     *         dropped only because EI flags them `autoAttack` and axilog
     *         does not.
     *
     * So the residue is entirely upstream CATALOG metadata (icon coverage
     * and auto-attack flags), not cast detection: `notInRaw` is 0 in both
     * directions, and that is asserted, not asserted-around.
     */
    it('oracles skill casts against EI\'s rotation and fully accounts for the divergence', () => {
        const native = loadNativeFixture();
        const ei = loadEiFixture();
        const m = extractMovement(native, localPlayerId(native))!;
        const byAccount = new Map(m.members.map(x => [x.account, x]));

        // The EI producer's own icon gate, rebuilt from EI's catalog.
        const eiIcons = new Set<number>();
        for (const [key, val] of Object.entries(ei.skillMap ?? {})) {
            if (val.icon && !val.autoAttack) eiIcons.add(Number(key.slice(1)));
        }

        let compared = 0;
        let shared = 0;
        let onlyEi = 0;
        let onlyNative = 0;
        let eiMissingFromNativeRaw = 0;
        let nativeMissingFromEiRaw = 0;
        let droppedNoIcon = 0;
        let droppedAuto = 0;
        let droppedDuration = 0;
        let droppedUnexplained = 0;
        let eiDroppedAuto = 0;
        let eiDroppedOther = 0;

        for (const p of ei.players) {
            const member = byAccount.get(p.account);
            if (!member?.skillCasts) continue;
            const entity = native.entities.find(e => e.account === p.account)!;
            const rawNative = new Map<string, { skill_id: number; duration_ms: number }>();
            for (const c of native.blocks.rotation!.by_entity[String(entity.id)].casts!) {
                rawNative.set(`${signedSkillId(c.skill_id)}@${c.cast_time_ms}`, c);
            }
            const rawEi = new Map<string, { id: number; duration: number }>();
            for (const entry of p.rotation ?? []) {
                for (const cast of entry.skills) {
                    rawEi.set(`${entry.id}@${cast.castTime}`, { id: entry.id, duration: cast.duration });
                }
            }
            compared++;

            const eiKeys = new Set<string>();
            for (const entry of p.rotation ?? []) {
                if (!eiIcons.has(entry.id)) continue;
                for (const cast of entry.skills) {
                    if (entry.id > 0 && cast.duration <= 0) continue;
                    eiKeys.add(`${entry.id}@${cast.castTime}`);
                }
            }
            const natKeys = new Set(member.skillCasts.map(c => `${c.id}@${c.time}`));

            for (const k of eiKeys) {
                if (natKeys.has(k)) { shared++; continue; }
                onlyEi++;
                const raw = rawNative.get(k);
                if (!raw) { eiMissingFromNativeRaw++; continue; }
                const def = native.catalogs.skills[String(raw.skill_id)];
                if (!def.icon) droppedNoIcon++;
                else if (def.auto_attack) droppedAuto++;
                else if (signedSkillId(raw.skill_id) > 0 && raw.duration_ms <= 0) droppedDuration++;
                else droppedUnexplained++;
            }
            for (const k of natKeys) {
                if (eiKeys.has(k)) continue;
                onlyNative++;
                const raw = rawEi.get(k);
                if (!raw) { nativeMissingFromEiRaw++; continue; }
                if (ei.skillMap[`s${raw.id}`]?.autoAttack) eiDroppedAuto++;
                else eiDroppedOther++;
            }
        }

        expect(compared).toBe(46);
        expect(shared).toBe(1086);
        expect(onlyEi).toBe(476);
        expect(onlyNative).toBe(46);
        // The whole point: nothing is missing from either raw cast list.
        expect(eiMissingFromNativeRaw).toBe(0);
        expect(nativeMissingFromEiRaw).toBe(0);
        expect(droppedNoIcon).toBe(458);
        expect(droppedAuto).toBe(18);
        expect(droppedDuration).toBe(0);
        expect(droppedUnexplained).toBe(0);
        expect(eiDroppedAuto).toBe(46);
        expect(eiDroppedOther).toBe(0);
    });

    /**
     * KNOWN UPSTREAM GAP (axilog): `catalogs.skills` is missing icons that
     * EI's `skillMap` has, which is the single largest contributor to the
     * `onlyEi` residue above -- the icon gate is EI's rule, applied to a
     * thinner catalog. Pinned so it fails loudly when axilog closes it.
     */
    it('pins axilog\'s missing skill icons against EI\'s catalog', () => {
        const native = loadNativeFixture();
        const ei = loadEiFixture();

        const missingIcon: number[] = [];
        let sharedIds = 0;
        let iconAgrees = 0;
        for (const [key, def] of Object.entries(native.catalogs.skills)) {
            const signed = signedSkillId(Number(key));
            const eiDef = ei.skillMap[`s${signed}`];
            if (!eiDef) continue;
            sharedIds++;
            if (def.icon === eiDef.icon) iconAgrees++;
            else if (!def.icon && eiDef.icon) missingIcon.push(signed);
        }
        expect(sharedIds).toBe(585);
        expect(iconAgrees).toBe(569);
        expect(missingIcon.length).toBe(16);
        // Never the other way round: axilog has no icon EI lacks.
        expect(sharedIds - iconAgrees - missingIcon.length).toBe(0);
        // Six of the eight actually-cast ids are the pseudo-skills, so the
        // map view loses its weapon-swap and dodge markers under native.
        expect(missingIcon.filter(id => id < 0).sort((a, b) => b - a))
            .toEqual([-2, -20, -22, -23, -28, -32].sort((a, b) => b - a));
    });

    // ---- icon maps -----------------------------------------------------

    it('builds icon maps keyed the way the renderer looks them up', () => {
        const native = loadNativeFixture();
        const m = extractMovement(native, localPlayerId(native))!;
        for (const key of Object.keys(m.boonIcons!)) {
            expect(ALL_TRACKED_BUFF_IDS.has(Number(key)), `boon icon ${key}`).toBe(true);
            expect(m.boonIcons![Number(key)].icon.length).toBeGreaterThan(0);
        }
        // Every cast the extractor emitted must be renderable.
        const unrenderable: number[] = [];
        for (const member of m.members) {
            for (const cast of member.skillCasts ?? []) {
                if (!m.skillIcons![cast.id]) unrenderable.push(cast.id);
            }
        }
        expect(unrenderable).toEqual([]);
        // ... and no auto-attack sneaks in.
        for (const key of Object.keys(m.skillIcons!)) {
            const raw = Number(key) < 0 ? Number(key) + 0x1_0000_0000 : Number(key);
            expect(native.catalogs.skills[String(raw)].auto_attack ?? false, `skill ${key}`).toBe(false);
        }
    });

    // ---- whole-block absence -------------------------------------------

    /**
     * `null` is reserved for the three DOCUMENTED whole-feature absences.
     * Everything else throws -- see the identity/rotation/boons tests above.
     */
    it('returns null only for documented whole-feature absence', () => {
        const native = loadNativeFixture();
        const id = localPlayerId(native);

        const noBlock = { ...native, blocks: { ...native.blocks, replay: undefined } } as ReportV1;
        expect(extractMovement(noBlock, id)).toBeNull();

        const noTracks = withReplay(native, replay => { delete replay.tracks; });
        expect(extractMovement(noTracks, id)).toBeNull();

        const noArena = withReplay(native, replay => { delete replay.tracks.arena; });
        expect(extractMovement(noArena, id)).toBeNull();

        const noDrawable = withReplay(native, replay => { replay.tracks.by_entity = {}; });
        expect(extractMovement(noDrawable, id)).toBeNull();

        // But an absent `blocks.series` BLOCK is the `timeseries` gate being
        // off, not a documented absence, and it throws -- the same way
        // `boons[].states` does. Swallowing it would render every member
        // with a flat 100% health bar.
        const noSeries = { ...native, blocks: { ...native.blocks, series: undefined } } as ReportV1;
        expect(() => extractMovement(noSeries, id)).toThrow(/missing the "series" block/);

        // Per-ENTITY absence of `health_percents` stays legitimate: the
        // format documents it for an entity that emitted no health updates,
        // and the field is left absent rather than invented as `[]`.
        const series = structuredClone(native.blocks.series!);
        delete (series.by_entity as any)[String(id)].health_percents;
        const noHealth = { ...native, blocks: { ...native.blocks, series } } as ReportV1;
        const m = extractMovement(noHealth, id)!;
        expect(m.members.find(x => x.isLocal)!.healthPercents).toBeUndefined();
        expect(m.members.filter(x => x.healthPercents !== undefined).length).toBe(46);
    });

    /**
     * The EI path this replaces produced NOTHING on this fixture: GW2EI
     * emitted no `combatReplayData` for any player or target and no
     * `combatReplayMetaData`, so `buildMovementData` hit its
     * `members.length === 0` return and the map view showed "No Movement
     * Data" for the whole log. There is therefore no EI oracle for
     * positions, `pollingRate` or `inchToPixel` -- the native path is the
     * first one that populates this feature at all, which is why every
     * geometric claim above is oracled against GW2's own API and the app's
     * existing map assets instead.
     */
    it('records that the Elite Insights fixture has no combat replay data at all', () => {
        const ei = loadEiFixture();
        expect(ei.combatReplayMetaData).toBeUndefined();
        expect(ei.players.filter(p => p.combatReplayData).length).toBe(0);
        expect(ei.targets.filter(t => t.combatReplayData).length).toBe(0);
    });
});
