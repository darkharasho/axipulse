// tests/shared/extractPlayerData.test.ts
//
// The integration oracle. Tasks 3-10 proved each `extract/*` unit against
// Elite Insights in isolation; this file proves the COMPOSER -- that each
// field of `PlayerFightData` is fed from the unit it is supposed to be fed
// from, and that the handful of values composed here rather than delegated
// (map identity, fight label, distance-to-tag summary, replay-derived
// positions) are right.
//
// Two layers, deliberately:
//   1. a direct EI oracle on every scalar, which catches a field wired to
//      the WRONG source -- the failure mode an integration seam has and a
//      unit test cannot see;
//   2. an identity check against the unit's own output, which catches a
//      field wired to no source at all or to a stale copy.
// A populated-ness floor sits under both, but it is the floor, not the test:
// `toBeGreaterThan(0)` passes on a report full of wrong-but-positive numbers.
import { describe, it, expect } from 'vitest';
import {
    extractPlayerFightData, computeDistanceToTagStats,
} from '../../src/shared/extractPlayerData';
import { extractIdentity } from '../../src/shared/extract/identity';
import { extractDamage } from '../../src/shared/extract/damage';
import { extractSupport } from '../../src/shared/extract/support';
import { extractDefense } from '../../src/shared/extract/defense';
import { extractBoons } from '../../src/shared/extract/boons';
import { extractTimeline } from '../../src/shared/extract/timeline';
import { extractComposition, extractSquadContext } from '../../src/shared/extract/composition';
import { extractMovement, arenaPixelSize } from '../../src/shared/extract/movement';
import { classifyRole } from '../../src/shared/classifyRole';
import { memberPosAt } from '../../src/shared/movementFrame';
import { localPlayerId, commanderId, requireBlock, squadMembers } from '../../src/shared/report';
import type { ReportV1 } from '../../src/shared/report';
import { resolveMapFromMapId } from '../../src/shared/mapUtils';
import { WvwMap } from '../../src/shared/wvwLandmarks';
import { extractBoonUptimesEi, extractBoonGenerationEi } from './ei/boonData';
import { classifySquadRolesEi } from './ei/classifyRoles';
import { loadEiFixture, loadNativeFixture, accountOf } from './oracle';
import type { EiJson, EiPlayer } from './ei/types';

/** The renderer store's default (`src/renderer/store.ts`). */
const BUCKET_MS = 1000;

/** The local player on this fixture: `encounter.recorded_by` is entity 11,
 *  account `Anon150.6550`, a Harbinger in subgroup 3. */
const LOCAL_ACCOUNT = 'Anon150.6550';

function fight(bucketSizeMs = BUCKET_MS) {
    return extractPlayerFightData(loadNativeFixture(), 1, bucketSizeMs);
}

function eiLocal(ei: EiJson): EiPlayer {
    const p = ei.players.find(x => x.account === LOCAL_ACCOUNT);
    if (!p) throw new Error(`no EI player ${LOCAL_ACCOUNT}`);
    return p;
}

/** A shallow-cloned report with one surgical edit to `encounter`. Never
 *  mutates the memoized fixture. */
function withEncounter(r: ReportV1, patch: Record<string, unknown>): ReportV1 {
    return { ...r, encounter: { ...r.encounter, ...patch } } as ReportV1;
}

describe('extractPlayerFightData -- populated-ness floor', () => {
    it('produces a fully populated PlayerFightData', () => {
        const d = fight();
        expect(d.playerName.length).toBeGreaterThan(0);
        expect(d.accountName.length).toBeGreaterThan(0);
        expect(d.profession.length).toBeGreaterThan(0);
        expect(d.duration).toBeGreaterThan(0);
        expect(d.durationFormatted).toMatch(/^\d+:\d{2}$/);
        expect(d.damage.totalDamage).toBeGreaterThan(0);
        expect(d.damage.topSkills.length).toBeGreaterThan(0);
        expect(d.support.boonStrips).toBeGreaterThanOrEqual(0);
        expect(d.defense.damageTaken).toBeGreaterThan(0);
        expect(d.boons.uptimes.length).toBeGreaterThan(0);
        expect(d.timeline.damageDealt.length).toBeGreaterThan(0);
        expect(d.timeline.incomingHealing.length).toBeGreaterThan(0);
        expect(d.squadContext.squadSize).toBeGreaterThan(0);
        expect(d.fightComposition.squadCount).toBeGreaterThan(0);
        expect(d.movementData).not.toBeNull();
        expect(d.roleClassification).toBeDefined();
    });
});

describe('extractPlayerFightData -- identity and fight metadata vs EI', () => {
    it('names the same player Elite Insights named', () => {
        const ei = loadEiFixture();
        const p = eiLocal(ei);
        const d = fight();

        expect(d.accountName).toBe(p.account);
        expect(d.playerName).toBe(p.name);
        // EI's `players[].profession` carries the ELITE SPEC name where one
        // exists (established in Task 3's identity oracle -- EI's JSON has no
        // `elite_spec` field at all despite the legacy `EiPlayer` declaring
        // one), so it is native's `eliteSpec` that matches it, not
        // `profession`.
        expect(d.eliteSpec).toBe(p.profession);
        expect(d.profession).toBe('Necromancer');
        expect(d.isCommander).toBe(p.hasCommanderTag);
        expect(d.isCommander).toBe(false);
    });

    it('takes duration from the encounter, matching EI exactly', () => {
        const ei = loadEiFixture();
        const d = fight();
        expect(d.duration).toBe(ei.durationMS);
        expect(d.duration).toBe(138333);
        expect(d.durationFormatted).toBe('2:18');
    });

    /**
     * `encounter.started_at_unix` is SECONDS. The oracle is EI's
     * `timeStartStd`, which carries the same instant with an explicit
     * offset -- so this checks the x1000 AND the interpretation, not just
     * that some ISO string came out. A missing multiply would land in 1970
     * and a seconds/ms mix-up would land in 57000 AD; both fail here.
     */
    it('converts started_at_unix (seconds) to the instant EI recorded', () => {
        const ei = loadEiFixture();
        const d = fight();
        expect(ei.timeStartStd).toBe('2026-02-03 18:08:18 -08:00');
        expect(d.timestamp).toBe('2026-02-04T02:08:18.000Z');
        expect(new Date(d.timestamp!).getTime())
            .toBe(new Date(ei.timeStartStd!).getTime());
        expect(loadNativeFixture().encounter.started_at_unix).toBe(1770170898);
    });

    /**
     * Amendment D. The format documents the absence as "deliberately
     * distinguishable from epoch zero, so do not default it to 0", and the
     * EI path's `?? new Date().toISOString()` was worse than epoch zero --
     * it stamped an old log with the time it happened to be parsed, which
     * is confidently wrong rather than obviously missing.
     *
     * Chosen: an explicit `null`, not a throw. A fight is completely
     * analysable without a wall clock; only the history list's timestamp
     * renders it, and `HistoryEntry.tsx` shows an em dash. The type is
     * `string | null` so a renderer that forgets the case is a compile
     * error rather than a `new Date(null)` reading 1970.
     */
    it('reports a null timestamp rather than an invented one when the log has no start event', () => {
        const d = extractPlayerFightData(
            withEncounter(loadNativeFixture(), { started_at_unix: undefined }), 1, BUCKET_MS,
        );
        expect(d.timestamp).toBeNull();
        // and nothing else degrades with it
        expect(d.duration).toBe(138333);
        expect(d.damage.totalDamage).toBeGreaterThan(0);
    });

    it('resolves the map by id, agreeing with the display name EI carried', () => {
        const ei = loadEiFixture();
        const d = fight();

        expect(d.mapId).toBe(95);
        expect(resolveMapFromMapId(d.mapId!)).toBe(WvwMap.GreenBorderlands);
        // The two documents' names for the same map, and the normalised
        // label the id path now drives.
        expect(loadNativeFixture().encounter.map).toBe('Green Alpine Borderlands');
        expect(ei.fightName).toBe('Detailed WvW - Green Alpine Borderlands');
        expect(d.mapName).toBe('Green BL');
    });

    it('leaves mapId null, and the label landmark-free, when the log carries no MAP_ID', () => {
        const d = extractPlayerFightData(
            withEncounter(loadNativeFixture(), { map_id: undefined }), 1, BUCKET_MS,
        );
        expect(d.mapId).toBeNull();
        expect(d.nearestLandmark).toBeNull();
        expect(d.fightLabel).toBe('F1 — Green BL — 2:18');
        // mapName still resolves: it reads `encounter.map`, not the id.
        expect(d.mapName).toBe('Green BL');
    });

    it('builds the fight label from map, landmark and duration', () => {
        expect(fight().fightLabel).toBe("F1 — Green BL — Gertzz's Estate — 2:18");
        expect(extractPlayerFightData(loadNativeFixture(), 7, BUCKET_MS).fightNumber).toBe(7);
        expect(extractPlayerFightData(loadNativeFixture(), 7, BUCKET_MS).fightLabel)
            .toBe("F7 — Green BL — Gertzz's Estate — 2:18");
    });

    /**
     * `mapSize` is the arena squeezed into GW2EI's 750px-max combat-replay
     * pixel space -- the space the landmark tables and the tile calibration
     * already live in. 697x1000 * (750/1000) = 522.75x750, which is the
     * [523, 750] `wvwTiles.ts` carries for Alpine by hand. Taking it from
     * the DOCUMENT rather than from that table is what guarantees the tiles
     * and the position markers cannot disagree.
     */
    it('takes mapSize from the log\'s own arena, in EI\'s squeezed pixel space', () => {
        const native = loadNativeFixture();
        const arena = requireBlock(native, 'replay').tracks!.arena!;
        expect([arena.image_width, arena.image_height]).toEqual([697, 1000]);
        expect(fight().mapSize).toEqual(arenaPixelSize(arena));
        expect(fight().mapSize).toEqual([522.75, 750]);
    });

    /**
     * A permanent, deliberate `null`, not an unwired field: GW2EI rendered a
     * combat-replay map image and served it from its own host
     * (`combatReplayMetaData.maps[0].url`); the native format emits the
     * world rect and leaves imagery to the consumer. Both map views already
     * fall back to the live GW2 tile service, which is the better source.
     * Pinned so a future axilog release that DOES carry an image is a test
     * failure rather than a silently ignored field.
     */
    it('reports mapImageUrl as null -- the native format carries no replay image', () => {
        expect(fight().mapImageUrl).toBeNull();
        expect(loadEiFixture().combatReplayMetaData?.maps).toBeUndefined();
    });
});

describe('extractPlayerFightData -- per-block values vs EI', () => {
    it('matches EI on every damage figure it did not change the definition of', () => {
        const p = eiLocal(loadEiFixture());
        const d = fight();

        expect(d.damage.totalDamage).toBe(p.dpsAll[0].damage);
        expect(d.damage.totalDamage).toBe(29344);
        expect(d.damage.breakbarDamage).toBe(p.dpsAll[0].breakbarDamage);

        // DPS: EI divided by the player's ACTIVE time and rounded to an
        // integer; axilog divides by the ENCOUNTER duration for every
        // entity. Same number here to within EI's rounding because this
        // player was active for the whole fight, and pinned rather than
        // toleranced away.
        expect(d.damage.dps).toBeCloseTo(29344 / (138333 / 1000), 9);
        expect(Math.round(d.damage.dps)).toBe(p.dpsAll[0].dps);
    });

    /**
     * KNOWN, ACCEPTED DIVERGENCE (already in the migration spec). Native's
     * `contribution.downs_contribution.damage` is the arcdps methodology;
     * EI's `statsAll[0].downContribution` is its own
     * 90%-of-health-to-downstate window algorithm. Different algorithms,
     * different numbers -- 41 of 46 squad members' values and 36 of 46 ranks
     * change. Pinned with the MEASURED values rather than covered by a
     * widened tolerance, so a change in either direction fails.
     */
    it('pins the accepted down-contribution divergence rather than toleranating it', () => {
        const ei = loadEiFixture();
        const native = loadNativeFixture();
        const d = fight();

        expect(d.damage.downContribution).toBe(7721);
        expect(eiLocal(ei).statsAll[0].downContribution).toBe(4512);

        let valueDiffs = 0;
        for (const e of squadMembers(native)) {
            const p = ei.players.find(x => x.account === accountOf(e))!;
            if (extractDamage(native, e.id).downContribution !== p.statsAll[0].downContribution) {
                valueDiffs++;
            }
        }
        expect(valueDiffs, 'squad members whose down contribution changed').toBe(41);
    });

    it('matches EI exactly on every support figure', () => {
        const p = eiLocal(loadEiFixture());
        const d = fight();
        expect(d.support.boonStrips).toBe(p.support[0].boonStrips);
        expect(d.support.boonStrips).toBe(43);
        expect(d.support.cleanses).toBe(p.support[0].condiCleanse);
        expect(d.support.cleanseSelf).toBe(p.support[0].condiCleanseSelf);
        // EI rounds `squadBuffs` generation to three decimals.
        const eiStab = (p.squadBuffs ?? []).find(b => b.id === 1122)?.buffData[0]?.generation ?? 0;
        expect(Math.abs(d.support.stabilityGeneration - eiStab)).toBeLessThan(0.005);
    });

    it('matches EI exactly on every defensive counter', () => {
        const p = eiLocal(loadEiFixture());
        const d = fight();
        const def = p.defenses[0];

        expect(d.defense.deaths).toBe(def.deadCount);
        expect(d.defense.dodges).toBe(def.dodgeCount);
        expect(d.defense.blocked).toBe(def.blockedCount);
        expect(d.defense.evaded).toBe(def.evadedCount);
        expect(d.defense.missed).toBe(def.missedCount);
        expect(d.defense.invulned).toBe(def.invulnedCount);
        expect(d.defense.interrupted).toBe(def.interruptedCount);
        expect(d.defense.incomingCC).toBe(def.receivedCrowdControl);
        expect(d.defense.incomingStrips).toBe(def.boonStrips);
        expect(d.defense.deathTimes).toEqual([]);
    });

    /**
     * KNOWN AXILOG DEFECT #2, carried through visibly. `downs_taken`
     * disagrees with EI's `downCount` on 21 of 46 squad members; the local
     * player is one of them (native 1, EI 0). Not worked around, not
     * toleranced -- pinned, so it fails loudly whichever way it moves.
     */
    it('pins axilog\'s downs_taken disagreement with EI\'s downCount', () => {
        const ei = loadEiFixture();
        const native = loadNativeFixture();

        expect(fight().defense.downs).toBe(1);
        expect(eiLocal(ei).defenses[0].downCount).toBe(0);

        const disagreeing: string[] = [];
        for (const e of squadMembers(native)) {
            const p = ei.players.find(x => x.account === accountOf(e))!;
            if (extractDefense(native, e.id).downs !== p.defenses[0].downCount) {
                disagreeing.push(accountOf(e));
            }
        }
        expect(disagreeing.length, 'squad members whose downs count disagrees with EI').toBe(21);
    });

    /**
     * KNOWN AXILOG DEFECT #3: `damage.taken` runs 1-4 high on 18 of 46 squad
     * members, fully explained by skill id 23279 (established in Task 10's
     * fix round). Pinned at the local player's exact residue.
     */
    it('pins the +4 damage-taken residue against EI', () => {
        const p = eiLocal(loadEiFixture());
        const d = fight();
        expect(p.defenses[0].damageTaken).toBe(54983);
        expect(d.defense.damageTaken).toBe(54987);
        expect(d.defense.damageTaken - p.defenses[0].damageTaken).toBe(4);
    });

    it('matches EI\'s boon uptimes and generation entry-for-entry', () => {
        const p = eiLocal(loadEiFixture());
        const d = fight();

        const eiUptimes = new Map(extractBoonUptimesEi(p).map(u => [u.id, u]));
        expect(d.boons.uptimes.length).toBe(12);
        for (const u of d.boons.uptimes) {
            const theirs = eiUptimes.get(u.id);
            expect(theirs, `EI has no uptime for boon ${u.id}`).toBeDefined();
            expect(u.name, String(u.id)).toBe(theirs!.name);
            expect(u.stacking, String(u.id)).toBe(theirs!.stacking);
            // EI rounds uptimes/avg-stacks to 2-3 decimals.
            expect(Math.abs(u.uptime - theirs!.uptime), String(u.id)).toBeLessThan(0.02);
        }

        const eiGen = new Map(extractBoonGenerationEi(p).map(g => [g.id, g]));
        for (const g of d.boons.generation) {
            const theirs = eiGen.get(g.id);
            expect(theirs, `EI has no generation for boon ${g.id}`).toBeDefined();
            expect(g.name, String(g.id)).toBe(theirs!.name);
        }
    });

    it('matches EI\'s damage timeline bucket-for-bucket', () => {
        const p = eiLocal(loadEiFixture());
        const d = fight();
        const cum = p.damage1S[0];

        expect(d.timeline.damageDealt.length).toBe(cum.length);
        for (let i = 0; i < cum.length; i++) {
            const expected = i === 0 ? cum[0] : cum[i] - cum[i - 1];
            expect(d.timeline.damageDealt[i].value, `bucket ${i}`).toBe(expected);
            expect(d.timeline.damageDealt[i].time, `bucket ${i}`).toBe(i * BUCKET_MS);
        }
    });

    it('matches EI on the fight composition populations', () => {
        const ei = loadEiFixture();
        const d = fight();
        expect(d.fightComposition.squadCount)
            .toBe(ei.players.filter(p => !p.notInSquad && !p.isFake).length);
        expect(d.fightComposition.allyCount)
            .toBe(ei.players.filter(p => p.notInSquad && !p.isFake).length);
        expect(d.fightComposition.enemyCount)
            .toBe(ei.targets.filter(t => t.enemyPlayer && !t.isFake).length);
        expect([d.fightComposition.squadCount, d.fightComposition.allyCount, d.fightComposition.enemyCount])
            .toEqual([46, 1, 46]);
    });

    /**
     * The role LABEL is the claim, not the score: three of the six scoring
     * inputs are different quantities after the cutover (see
     * `classifyRole.test.ts`). Compared against the EI classifier, which
     * survives as an oracle in `tests/shared/ei/classifyRoles.ts`.
     */
    it('agrees with the EI role classifier on the local player', () => {
        const ei = loadEiFixture();
        const eiRoles = classifySquadRolesEi(ei.players.filter(p => !p.notInSquad && !p.isFake));
        const d = fight();
        expect(d.roleClassification.role).toBe(eiRoles.get(LOCAL_ACCOUNT)!.role);
        expect(d.roleClassification.role).toBe('support');
        expect(d.roleClassification.confidenceScore).toBeGreaterThanOrEqual(0);
        expect(d.roleClassification.confidenceScore).toBeLessThanOrEqual(1);
    });

    /**
     * KNOWN COVERAGE GAP #3, surfaced at the integration seam where it is
     * user-visible: the Timeline view's Hard CC and Soft CC lanes are empty
     * after the cutover and will stay empty. EI carried boons and conditions
     * together in `buffUptimes`; native's `blocks.boons` covers the twelve
     * core boons only and `blocks.conditions` covers enemies and NPCs, never
     * a squad member. Squad-side CC survives natively only as the SCALARS
     * `defense.incomingCC` / `incomingStrips`, which are populated and
     * oracled above. Nothing substitutes a zero here -- the states are not
     * in the document. Pinned so a later axilog release closing the gap
     * fails this test rather than going unnoticed.
     */
    it('pins the empty hardCC/softCC lanes as a data gap, with the scalars still live', () => {
        const d = fight();
        expect(Object.keys(d.timeline.hardCC)).toEqual([]);
        expect(Object.keys(d.timeline.softCC)).toEqual([]);
        expect(Object.keys(d.timeline.offensiveBoons).length).toBe(4);
        expect(Object.keys(d.timeline.defensiveBoons).length).toBe(4);
        expect(d.defense.incomingCC).toBe(2);
        expect(d.defense.incomingStrips).toBe(7);
    });
});

describe('extractPlayerFightData -- every field is wired to its own unit', () => {
    /**
     * The other half of the seam test. The EI oracles above catch a field
     * fed from the wrong SOURCE; these catch a field fed from a stale or
     * partial copy of the right one -- the composer re-implementing a unit
     * instead of calling it, which no EI comparison would notice as long as
     * the re-implementation happened to agree.
     */
    it('delegates every block to the extract unit that owns it', () => {
        const native = loadNativeFixture();
        const id = localPlayerId(native);
        const d = fight();
        const identity = extractIdentity(native, id);

        expect(d.playerName).toBe(identity.playerName);
        expect(d.accountName).toBe(identity.accountName);
        expect(d.profession).toBe(identity.profession);
        expect(d.eliteSpec).toBe(identity.eliteSpec);
        expect(d.isCommander).toBe(identity.isCommander);

        expect(d.damage).toEqual(extractDamage(native, id));
        expect(d.support).toEqual(extractSupport(native, id));
        expect(d.defense).toEqual(extractDefense(native, id));
        expect(d.boons).toEqual(extractBoons(native, id, BUCKET_MS));
        expect(d.timeline).toEqual(extractTimeline(native, id, BUCKET_MS));
        expect(d.squadContext).toEqual(extractSquadContext(native, id));
        expect(d.fightComposition).toEqual(extractComposition(native));
        expect(d.movementData).toEqual(extractMovement(native, id));
        expect(d.roleClassification).toEqual(classifyRole(native, id));
    });

    it('resolves the local player from encounter.recorded_by, once', () => {
        const native = loadNativeFixture();
        expect(native.encounter.recorded_by).toBe(11);
        expect(localPlayerId(native)).toBe(11);
        expect(fight().accountName).toBe(LOCAL_ACCOUNT);
        expect(fight().movementData!.members.filter(m => m.isLocal).length).toBe(1);
        expect(fight().movementData!.members.find(m => m.isLocal)!.account).toBe(LOCAL_ACCOUNT);
    });

    /**
     * The Task 7 amendment, checked at the seam it matters: `SettingsView`
     * offers 1000/2000/3000/5000ms and `useFightListener` passes the live
     * value in. `extractBoons` used to bake 1000 in, which would have made
     * the control a silent no-op for the boon-performance charts ONLY --
     * every other lane would have moved, so the bug would have looked like a
     * chart that "just doesn't have that resolution".
     */
    it('threads the live bucketSizeMs into every lane, including the boon charts', () => {
        const at1s = fight(1000);
        const at5s = fight(5000);

        expect(at1s.timeline.bucketSizeMs).toBe(1000);
        expect(at5s.timeline.bucketSizeMs).toBe(5000);
        expect(at1s.timeline.damageDealt.length).toBe(140);
        expect(at5s.timeline.damageDealt.length).toBe(28);

        expect(at1s.boons.boonPerformance!.stability!.bucketSizeMs).toBe(1000);
        expect(at5s.boons.boonPerformance!.stability!.bucketSizeMs).toBe(5000);
        expect(at1s.boons.boonPerformance!.might!.bucketCount).toBe(139);
        expect(at5s.boons.boonPerformance!.might!.bucketCount).toBe(28);
    });
});

describe('extractPlayerFightData -- distanceToTag summary', () => {
    /**
     * THE amendment item. Task 8 left the runback exclusion to the consumer
     * on purpose, so `extract/timeline.ts`'s lane still carries its
     * dead-interval buckets and THIS is the only place they are dropped. The
     * amendment warned the omission would be undetectable because
     * `combatReplayData.dead` is `[]` across the whole EI fixture -- true of
     * the EI side, and it is still true that the LOCAL player has no deaths.
     * But it is NOT true of the native side: three squad members carry real
     * `blocks.replay.by_entity[id].dead` intervals, and for two of them the
     * exclusion moves the average by an order of magnitude. So the omission
     * is directly testable after all, and this pins it.
     *
     * Corroboration that the excluded value is the RIGHT one, not merely a
     * different one: `blocks.replay.by_entity[id].dist_to_com` is axilog's
     * own mean distance to commander over the actor's ACTIVE polls, and for
     * all three it sits with the UNEXCLUDED figure -- 19861 vs an unexcluded
     * 17986 for `Anon151.6587`, against 2046 excluded. `dist_to_com` does
     * not itself exclude the runback, which is exactly why this function
     * exists.
     */
    it('excludes deaths and runbacks, moving the average by 8x on the members who died', () => {
        const native = loadNativeFixture();
        const replay = requireBlock(native, 'replay').by_entity;
        const cmd = commanderId(native);

        const measured: Record<string, unknown>[] = [];
        for (const e of squadMembers(native)) {
            const row = replay[String(e.id)];
            if (row.dead.length === 0) continue;
            const timeline = extractTimeline(native, e.id, BUCKET_MS);
            measured.push({
                account: accountOf(e),
                dead: row.dead,
                excluded: computeDistanceToTagStats(timeline, row.dead, e.id === cmd),
                unexcluded: computeDistanceToTagStats(timeline, [], e.id === cmd),
            });
        }

        expect(measured).toEqual([
            {
                account: 'Anon151.6587',
                dead: [[40075, 54671]],
                excluded: { average: 2046, median: 2136 },
                unexcluded: { average: 17986, median: 17906 },
            },
            {
                account: 'Anon175.7475',
                dead: [[19849, 30603]],
                excluded: { average: 1805, median: 1496 },
                unexcluded: { average: 19027, median: 16352 },
            },
            {
                account: 'Anon174.7438',
                dead: [[113683, 127711]],
                excluded: { average: 454, median: 173 },
                unexcluded: { average: 592, median: 196 },
            },
        ]);
    });

    /** The composer passes the dead intervals, not `[]`. Verified against
     *  the same three members through `extractPlayerFightData` itself, by
     *  pointing `recorded_by` at each of them in turn. */
    it('feeds computeDistanceToTagStats the replay dead intervals', () => {
        const native = loadNativeFixture();
        const byAccount = new Map(squadMembers(native).map(e => [accountOf(e), e.id]));

        for (const [account, expected] of [
            ['Anon151.6587', { average: 2046, median: 2136 }],
            ['Anon175.7475', { average: 1805, median: 1496 }],
            ['Anon174.7438', { average: 454, median: 173 }],
        ] as const) {
            const d = extractPlayerFightData(
                withEncounter(native, { recorded_by: byAccount.get(account) }), 1, BUCKET_MS,
            );
            expect(d.accountName, account).toBe(account);
            expect(d.distanceToTag, account).toEqual(expected);
        }
    });

    it('is null for the commander, who has no distance to themselves', () => {
        const native = loadNativeFixture();
        const cmd = commanderId(native);
        expect(cmd).toBe(6);
        const d = extractPlayerFightData(withEncounter(native, { recorded_by: cmd }), 1, BUCKET_MS);
        expect(d.isCommander).toBe(true);
        expect(d.distanceToTag).toBeNull();
        expect(d.timeline.distanceToTag).toEqual([]);
    });

    /**
     * -1 is GW2EI's "the pass ran and nothing qualified" sentinel and the
     * native lane can produce an EMPTY bucket list for the same situation.
     * Neither may surface as a distance: a negative reads as nonsense and a
     * zero reads as "standing on the tag", which is the silent zero this
     * migration has removed three times. The contract is `null` for both.
     */
    it('never reports a negative distance, for any squad member', () => {
        const native = loadNativeFixture();
        const bad: unknown[] = [];
        for (const e of squadMembers(native)) {
            const d = extractPlayerFightData(
                withEncounter(native, { recorded_by: e.id }), 1, BUCKET_MS,
            );
            if (d.distanceToTag === null) continue;
            if (d.distanceToTag.average < 0 || d.distanceToTag.median < 0) {
                bad.push([accountOf(e), d.distanceToTag]);
            }
        }
        expect(bad).toEqual([]);
    });

    it('returns null rather than 0 when the lane is empty', () => {
        const empty = { distanceToTag: [] } as never;
        expect(computeDistanceToTagStats(empty, [], false)).toBeNull();
    });

    /**
     * The commander guard, tested DIRECTLY rather than through the composer.
     *
     * Found by mutation: deleting `if (isCommander) return null` left the
     * whole suite green, because `extractTimeline` already returns an empty
     * `distanceToTag` lane for the commander (`distanceToTagBuckets` bails
     * when `cmdId === id`), so the `buckets.length === 0` check below caught
     * it anyway. That made the guard an equivalent mutant IN THE COMPOSER --
     * but it is not redundant: it encodes a domain fact ("a commander has no
     * distance to their own tag") that must not depend on another function's
     * output shape. So it is kept and given the one input that distinguishes
     * it: a non-empty lane with `isCommander` true. Without this the guard
     * would be untested code that happens to be unreachable.
     */
    it('returns null for a commander even when the lane is populated', () => {
        const lane = { distanceToTag: [{ time: 0, value: 500 }, { time: 1000, value: 700 }] } as never;
        expect(computeDistanceToTagStats(lane, [], true)).toBeNull();
        expect(computeDistanceToTagStats(lane, [], false)).toEqual({ average: 600, median: 600 });
    });
});

describe('extractPlayerFightData -- replay-derived positions', () => {
    /**
     * `avgPosition` is the component-wise median of the local player's
     * PROJECTED track -- deliberately not a position they occupied. It has
     * no EI counterpart (the frozen EI document carries an empty
     * `combatReplayData` for every player, so the EI path produced `null`
     * here for the entire roster; this is the first code that fills it).
     * Oracled structurally instead: inside the arena rect, equal to the two
     * medians, and driving the landmark the label names.
     */
    it('places the fight at the median of the local track, inside the arena', () => {
        const d = fight();
        const local = d.movementData!.members.find(m => m.isLocal)!;
        const xs = local.positions.map(p => p[0]).sort((a, b) => a - b);
        const ys = local.positions.map(p => p[1]).sort((a, b) => a - b);
        const mid = Math.floor(local.positions.length / 2);

        expect(d.avgPosition).toEqual([xs[mid], ys[mid]]);
        expect(d.avgPosition![0]).toBeGreaterThan(0);
        expect(d.avgPosition![0]).toBeLessThan(d.mapSize![0]);
        expect(d.avgPosition![1]).toBeGreaterThan(0);
        expect(d.avgPosition![1]).toBeLessThan(d.mapSize![1]);
        expect(d.nearestLandmark).toBe("Gertzz's Estate");
    });

    /**
     * The bug class this migration has hit FOUR times. Down/death markers
     * are placed by converting the event time through
     * `positionsStartMs`/`pollingRate` (`memberPosAt`), never by indexing
     * `positions[floor(t / pollingRate)]` -- tracks do not share a start
     * tick (93 tracks, ten distinct start instants on this fixture), so the
     * index form is only correct for a track that begins at 0.
     *
     * The local player never went down, so the assertion is made against the
     * three squad members who did. For `Anon174.7438` the two forms differ
     * by over 40 units, so this is a real discriminator and not a vacuous
     * pass: the index form is asserted to be WRONG as well as the time form
     * to be right.
     */
    it('places down/death markers through time, not through the array index', () => {
        const native = loadNativeFixture();
        const replay = requireBlock(native, 'replay').by_entity;
        let discriminated = 0;

        for (const e of squadMembers(native)) {
            const row = replay[String(e.id)];
            if (row.down.length === 0 && row.dead.length === 0) continue;
            const d = extractPlayerFightData(
                withEncounter(native, { recorded_by: e.id }), 1, BUCKET_MS,
            );
            const m = d.movementData!.members.find(x => x.isLocal)!;
            const poll = d.movementData!.pollingRate;

            for (const [label, times, actual] of [
                ['down', row.down.map(([t]) => t), d.downPositions],
                ['dead', row.dead.map(([t]) => t), d.deathPositions],
            ] as const) {
                const byTime = times
                    .map(t => memberPosAt(m, t, poll))
                    .filter((p): p is [number, number] => p !== null);
                expect(actual, `${accountOf(e)} ${label}`).toEqual(byTime);

                for (const t of times) {
                    const naive = m.positions[Math.floor(t / poll)];
                    const correct = memberPosAt(m, t, poll)!;
                    if (naive && Math.hypot(naive[0] - correct[0], naive[1] - correct[1]) > 1) {
                        discriminated++;
                    }
                }
            }
        }
        // Vacuity guard: without this, an index join would pass the check above.
        expect(discriminated, 'events where the index join gives a different position')
            .toBeGreaterThan(0);
    });

    it('has no down or death markers for the local player, who never went down', () => {
        const native = loadNativeFixture();
        const row = requireBlock(native, 'replay').by_entity[String(localPlayerId(native))];
        expect(row.down).toEqual([]);
        expect(row.dead).toEqual([]);
        expect(fight().downPositions).toEqual([]);
        expect(fight().deathPositions).toEqual([]);
    });
});
