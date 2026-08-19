import { describe, it, expect } from 'vitest';
import { extractTimeline } from '../../../src/shared/extract/timeline';
import { extractDefense } from '../../../src/shared/extract/defense';
import { localPlayerId, commanderId } from '../../../src/shared/report';
import { extractDamageTimeline } from '../../../src/shared/timelineData';
import { HARD_CC_IDS, SOFT_CC_IDS, WVW_BOON_IDS } from '../../../src/shared/boonData';
import { loadEiFixture, loadNativeFixture } from '../oracle';
import type { EiPlayer } from '../../../src/shared/types';

const BUCKET_MS = 1000;

function eiLocal(ei: ReturnType<typeof loadEiFixture>) {
    return ei.players.find(p => p.account === ei.recordedAccountBy)
        ?? ei.players.find(p => p.name === ei.recordedBy)!;
}

function sum(buckets: { value: number }[]): number {
    return buckets.reduce((a, b) => a + b.value, 0);
}

/** Integral of a step-function state timeline, in stack-milliseconds. */
function integrate(states: [number, number][], endMs: number): number {
    let total = 0;
    for (let i = 0; i < states.length; i++) {
        const to = i + 1 < states.length ? states[i + 1][0] : endMs;
        total += states[i][1] * Math.max(0, Math.min(to, endMs) - states[i][0]);
    }
    return total;
}

describe('extractTimeline', () => {
    // Vacuity guard for every full-roster loop in this file: each one filters
    // `native.entities` by `role === 'squad'` and asserts a collected
    // mismatch array is `[]` (or a pinned set). A filter that returned zero
    // entities -- a fixture regression, a renamed role -- would make all of
    // them pass silently. This makes that failure loud.
    it('has the full 46-member squad roster this file\'s full-roster tests assume', () => {
        const native = loadNativeFixture();
        expect(native.entities.filter(e => e.role === 'squad').length).toBe(46);
    });

    // ---- bucket grid --------------------------------------------------

    it('returns one shared bucket grid across every lane, for every squad member', () => {
        const native = loadNativeFixture();
        const cmd = commanderId(native);
        expect(cmd, 'this fixture must have a commander for the distance lane to exist').not.toBeNull();

        const laneLengthMismatches: string[] = [];
        const timeGridMismatches: string[] = [];
        const emptyDistance: string[] = [];
        let compared = 0;

        for (const e of native.entities.filter(x => x.role === 'squad')) {
            const t = extractTimeline(native, e.id, BUCKET_MS);
            compared++;
            const n = t.damageDealt.length;
            expect(n, `${e.account} damageDealt bucket count`).toBeGreaterThan(0);
            expect(t.bucketSizeMs).toBe(BUCKET_MS);

            for (const [label, lane] of [
                ['damageTaken', t.damageTaken],
                ['incomingHealing', t.incomingHealing],
                ['incomingBarrier', t.incomingBarrier],
            ] as const) {
                if (lane.length !== n) laneLengthMismatches.push(`${e.account}:${label} ${lane.length}/${n}`);
            }

            // The commander's own distance lane is empty by construction
            // (EI's `buildTimeline` had the same `player !== commander`
            // guard); everyone else shares the damage grid.
            if (e.id === cmd) {
                if (t.distanceToTag.length !== 0) emptyDistance.push(`${e.account} commander lane not empty`);
            } else if (t.distanceToTag.length !== n) {
                laneLengthMismatches.push(`${e.account}:distanceToTag ${t.distanceToTag.length}/${n}`);
            }

            for (const lane of [t.damageDealt, t.damageTaken, t.incomingHealing, t.incomingBarrier, t.distanceToTag]) {
                for (let i = 0; i < lane.length; i++) {
                    if (lane[i].time !== i * BUCKET_MS) { timeGridMismatches.push(`${e.account}@${i}`); break; }
                }
            }
        }

        expect(compared).toBe(46);
        expect(laneLengthMismatches, 'lanes disagreeing with the damageDealt bucket count').toEqual([]);
        expect(timeGridMismatches, 'lanes whose bucket times are not i * bucketSizeMs').toEqual([]);
        expect(emptyDistance, 'commander distance-lane shape').toEqual([]);
    });

    it('honours a bucketSizeMs other than the 1000ms default', () => {
        const native = loadNativeFixture();
        const id = localPlayerId(native);
        const fine = extractTimeline(native, id, 1000);
        const coarse = extractTimeline(native, id, 5000);

        expect(coarse.bucketSizeMs).toBe(5000);
        expect(coarse.damageDealt.length).toBe(Math.ceil(fine.damageDealt.length / 5));
        expect(coarse.damageDealt.map(b => b.time).slice(0, 3)).toEqual([0, 5000, 10000]);
        expect(coarse.distanceToTag.length).toBe(coarse.damageDealt.length);

        // Regrouping is exact for the summed lanes: a coarse bucket is the
        // sum of the five fine buckets it covers.
        for (let b = 0; b < coarse.damageDealt.length; b++) {
            const expected = sum(fine.damageDealt.slice(b * 5, b * 5 + 5));
            expect(coarse.damageDealt[b].value, `coarse damage bucket ${b}`).toBe(expected);
        }
        expect(sum(coarse.damageTaken)).toBe(sum(fine.damageTaken));
        expect(sum(coarse.incomingHealing)).toBe(sum(fine.incomingHealing));
    });

    // ---- damage lanes: exact EI oracle ---------------------------------

    /**
     * `damageDealt` is bucket-for-bucket IDENTICAL to EI's own
     * `extractDamageTimeline(damage1S)` for all 46 squad members -- the two
     * cumulative grids are the same length (140) and the same values, so
     * this is exact equality rather than a tolerance.
     *
     * `damageTaken` is not quite: 18 of 46 members have buckets differing
     * by 1 (two single buckets in the whole roster differ by 2, pinned
     * individually), and the whole-fight totals differ by at most
     * 2.7e-4 relative. Cause is rounding of fractional damage into the
     * cumulative grid (each side rounds its own running total, so a
     * fractional remainder crosses an integer boundary a second apart);
     * `damageDealt` does not show it because those totals happen to be
     * whole. The affected accounts are pinned so the set cannot widen
     * unnoticed.
     */
    it('matches EI\'s damage1S/damageTaken1S bucket series for every squad member', () => {
        const ei = loadEiFixture();
        const native = loadNativeFixture();
        const dealtMismatches: string[] = [];
        const takenOverTolerance: string[] = [];
        const takenFarOverTolerance: string[] = [];
        const takenAnyDiff: string[] = [];
        const takenTotalDrift: string[] = [];
        let compared = 0;

        for (const e of native.entities.filter(x => x.role === 'squad')) {
            const p = ei.players.find(q => q.account === e.account);
            expect(p, `no EI player for ${e.account}`).toBeDefined();
            const t = extractTimeline(native, e.id, BUCKET_MS);
            compared++;

            const eiDealt = extractDamageTimeline(p!.damage1S?.[0] ?? [], BUCKET_MS);
            const eiTaken = extractDamageTimeline(p!.damageTaken1S?.[0] ?? [], BUCKET_MS);
            expect(eiDealt.length, `${e.account} EI damage grid length`).toBe(t.damageDealt.length);
            expect(eiTaken.length, `${e.account} EI damage-taken grid length`).toBe(t.damageTaken.length);

            for (let i = 0; i < eiDealt.length; i++) {
                if (t.damageDealt[i].value !== eiDealt[i].value) {
                    dealtMismatches.push(`${e.account}@${i} ${t.damageDealt[i].value}/${eiDealt[i].value}`);
                }
            }

            let anyDiff = false;
            for (let i = 0; i < eiTaken.length; i++) {
                const d = Math.abs(t.damageTaken[i].value - eiTaken[i].value);
                if (d > 0) anyDiff = true;
                if (d > 1) takenOverTolerance.push(`${e.account}@${i} ${t.damageTaken[i].value}/${eiTaken[i].value}`);
                if (d > 2) takenFarOverTolerance.push(`${e.account}@${i} ${t.damageTaken[i].value}/${eiTaken[i].value}`);
            }
            if (anyDiff) takenAnyDiff.push(e.account);
            const eiTotal = sum(eiTaken);
            if (eiTotal > 0 && Math.abs(sum(t.damageTaken) - eiTotal) / eiTotal > 1e-3) {
                takenTotalDrift.push(e.account);
            }
        }

        expect(compared).toBe(46);
        expect(dealtMismatches, 'damageDealt vs EI damage1S').toEqual([]);
        expect(takenFarOverTolerance, 'damageTaken buckets differing from EI by more than 2').toEqual([]);
        // Pinned: exactly two buckets in the whole roster differ by 2
        // rather than 1 (two rounding boundaries crossing in the same
        // second); everything else is off by at most one unit.
        expect(takenOverTolerance, 'damageTaken buckets differing from EI by more than 1').toEqual([
            'Anon153.6661@59 209/207',
            'Anon192.8104@34 228/226',
        ]);
        expect(takenTotalDrift, 'damageTaken whole-fight totals drifting more than 0.1% from EI').toEqual([]);
        // Pinned, not tolerated -- see the comment above.
        expect(takenAnyDiff, 'squad members whose damageTaken differs from EI at all').toEqual([
            'Anon187.7919', 'Anon164.7068', 'Anon172.7364', 'Anon181.7697',
            'Anon150.6550', 'Anon158.6846', 'Anon162.6994', 'Anon163.7031',
            'Anon167.7179', 'Anon179.7623', 'Anon153.6661', 'Anon160.6920',
            'Anon173.7401', 'Anon186.7882', 'Anon191.8067', 'Anon165.7105',
            'Anon192.8104', 'Anon193.8141',
        ]);
    });

    // ---- incoming healing / barrier ------------------------------------

    /**
     * `healing_received_1s`/`barrier_received_1s` are cumulative (the axilog
     * type doc says so, and `extractTimeline` differences them the same way
     * the EI path differenced `healingReceived1S`), so the whole-fight total
     * is the sum of the bucket deltas and is directly comparable to EI's
     * last cumulative element.
     *
     * The totals are EXACTLY equal for all 46 members on healing and 44 of
     * 46 on barrier. They are NOT comparable bucket-by-bucket: 18 members on
     * healing and 11 on barrier have individual heal/barrier events placed
     * in an adjacent one-second slot by the two parsers, in BOTH directions
     * (measured), which drives the running-prefix disagreement as high as
     * 45% of the fight total mid-fight before it closes back to zero. That
     * per-event slot assignment differs for reasons this test does not
     * establish -- the MECHANISM IS UNKNOWN. What is measured and asserted
     * is that it is purely a redistribution: no healing or barrier is
     * created or lost, so every total still agrees.
     */
    it('matches EI\'s final cumulative healingReceived1S/barrierReceived1S for every squad member', () => {
        const ei = loadEiFixture();
        const native = loadNativeFixture();
        const healingMismatches: string[] = [];
        const barrierMismatches: string[] = [];
        let compared = 0;
        let nonZeroHealing = 0;
        let nonZeroBarrier = 0;

        for (const e of native.entities.filter(x => x.role === 'squad')) {
            const p = ei.players.find(q => q.account === e.account)!;
            const t = extractTimeline(native, e.id, BUCKET_MS);
            compared++;

            const eiHealing = p.extHealingStats?.healingReceived1S?.[0]?.at(-1) ?? 0;
            const eiBarrier = p.extBarrierStats?.barrierReceived1S?.[0]?.at(-1) ?? 0;
            if (eiHealing > 0) nonZeroHealing++;
            if (eiBarrier > 0) nonZeroBarrier++;

            if (sum(t.incomingHealing) !== eiHealing) {
                healingMismatches.push(`${e.account} ${sum(t.incomingHealing)}/${eiHealing}`);
            }
            if (sum(t.incomingBarrier) !== eiBarrier) {
                barrierMismatches.push(`${e.account} ${sum(t.incomingBarrier)}/${eiBarrier}`);
            }
        }

        expect(compared).toBe(46);
        // Vacuity guards: an all-zero fixture would satisfy the equalities.
        expect(nonZeroHealing).toBeGreaterThan(30);
        expect(nonZeroBarrier).toBeGreaterThan(30);
        expect(healingMismatches, 'incomingHealing total vs EI healingReceived1S').toEqual([]);
        // Pinned: the two receivers of Anon178.7586's two extra Specter
        // hits -- see the mechanism test below.
        expect(barrierMismatches, 'incomingBarrier total vs EI barrierReceived1S').toEqual([
            'Anon164.7068 47910/47552',
            'Anon171.7327 22147/21096',
        ]);
    });

    /**
     * Mechanism for the two pinned `incomingBarrier` divergences, measured
     * rather than asserted by narrative.
     *
     * `support.test.ts` (Task 6) already pinned `Anon178.7586` as having one
     * extra hit on each of two Specter skills relative to EI: 63066 "Shadow
     * Bolt" (+358 barrier) and 63351 "Shadow Sap" (+1051). This test shows
     * those are the SAME events: the excess on each receiver's
     * `incomingBarrier` total equals, to the unit, the excess on the giver's
     * corresponding per-skill total, and equals the excess on the giver's
     * per-ally row for that receiver. So the receiver-side divergence is not
     * an independent second disagreement.
     */
    it('attributes the two incomingBarrier divergences to Anon178.7586\'s two known extra Specter hits', () => {
        const ei = loadEiFixture();
        const native = loadNativeFixture();

        const giver = native.entities.find(e => e.account === 'Anon178.7586')!;
        const eiGiver = ei.players.find(p => p.account === 'Anon178.7586')!;
        const giverSkills = native.blocks.healing!.by_entity[String(giver.id)]!.detail!.barrier_by_skill!;
        const eiGiverDist = eiGiver.extBarrierStats?.totalBarrierDist?.[0] ?? [];

        const giverExcess = [63066, 63351].map(skillId => {
            const nat = giverSkills[String(skillId)].total;
            const eiTotal = eiGiverDist.find(row => row.id === skillId)!.totalBarrier;
            return nat - eiTotal;
        });
        expect(giverExcess, 'Anon178.7586 per-skill barrier excess (Shadow Bolt, Shadow Sap)').toEqual([358, 1051]);

        const byAlly = native.blocks.healing!.by_entity[String(giver.id)]!.detail!.by_ally!;
        const receiverExcess = ['Anon164.7068', 'Anon171.7327'].map(account => {
            const e = native.entities.find(x => x.account === account)!;
            const p = ei.players.find(q => q.account === account)!;
            const eiIndex = ei.players.findIndex(q => q.account === account);
            const total = sum(extractTimeline(native, e.id, BUCKET_MS).incomingBarrier);
            const eiTotal = p.extBarrierStats?.barrierReceived1S?.[0]?.at(-1) ?? 0;

            // The giver's per-ally row for this receiver, both sides.
            const natPerAlly = byAlly[String(e.id)].barrier;
            const eiPerAlly = (eiGiver.extBarrierStats?.alliedBarrierDist?.[eiIndex]?.[0] ?? [])
                .reduce((a, b) => a + b.totalBarrier, 0);

            return { received: total - eiTotal, perAlly: natPerAlly - eiPerAlly };
        });

        expect(receiverExcess.map(x => x.received), 'receiver-side incomingBarrier excess').toEqual(giverExcess);
        expect(receiverExcess.map(x => x.perAlly), 'giver-side per-ally barrier excess').toEqual(giverExcess);
    });

    // ---- health -------------------------------------------------------

    it('reproduces EI\'s healthPercents step function exactly for every squad member', () => {
        const ei = loadEiFixture();
        const native = loadNativeFixture();
        const mismatches: string[] = [];
        const nonMonotonic: string[] = [];
        const empty: string[] = [];
        let compared = 0;

        for (const e of native.entities.filter(x => x.role === 'squad')) {
            const p = ei.players.find(q => q.account === e.account)!;
            const t = extractTimeline(native, e.id, BUCKET_MS);
            compared++;

            if (t.healthPercent.length === 0) empty.push(e.account);
            for (let i = 1; i < t.healthPercent.length; i++) {
                if (t.healthPercent[i][0] < t.healthPercent[i - 1][0]) { nonMonotonic.push(e.account); break; }
            }
            if (JSON.stringify(t.healthPercent) !== JSON.stringify(p.healthPercents ?? [])) {
                mismatches.push(`${e.account} ${t.healthPercent.length}/${p.healthPercents?.length ?? 0}`);
            }
        }

        expect(compared).toBe(46);
        expect(empty, 'squad members with an empty healthPercent step function').toEqual([]);
        expect(nonMonotonic, 'healthPercent entries out of time order').toEqual([]);
        expect(mismatches, 'healthPercent vs EI healthPercents').toEqual([]);
    });

    // ---- boons --------------------------------------------------------

    /**
     * Every squad member gets all 8 tracked offensive/defensive boon lanes
     * (native's `blocks.boons` always carries a row per boon id; EI omitted
     * a buff the player never held, which shows up here as native `states:
     * []` -- 46 such rows across the roster, individually checked to be
     * empty rather than assumed).
     *
     * The state timelines themselves are compared by their integral in
     * stack-milliseconds, which is what the renderer's boon lane draws.
     * 319 of the 322 EI-comparable timelines match to 1e-6 relative -- i.e.
     * exactly. Three do not, and are pinned; the mechanism for those three
     * is UNKNOWN (they are not a length artefact: the divergence survives
     * integration, and it runs in both directions).
     */
    it('matches EI\'s buffUptimes state timelines for every tracked boon on every squad member', () => {
        const ei = loadEiFixture();
        const native = loadNativeFixture();
        const end = native.encounter.duration_ms;
        const laneKeyMismatches: string[] = [];
        const nonEmptyWhereEiAbsent: string[] = [];
        const integralMismatches: string[] = [];
        const nameOrIconMismatches: string[] = [];
        let comparedTimelines = 0;
        let eiAbsentRows = 0;

        for (const e of native.entities.filter(x => x.role === 'squad')) {
            const p = ei.players.find(q => q.account === e.account)!;
            const t = extractTimeline(native, e.id, BUCKET_MS);

            // Pinned per LANE, not just as a union: Might/Fury/Quickness/
            // Alacrity are the offensive lane and Protection/Aegis/
            // Stability/Resistance the defensive one. A union-only check
            // would survive the two lanes being swapped.
            const offKeys = Object.keys(t.offensiveBoons).map(Number).sort((a, b) => a - b);
            const defKeys = Object.keys(t.defensiveBoons).map(Number).sort((a, b) => a - b);
            if (offKeys.join(',') !== '725,740,1187,30328') laneKeyMismatches.push(`${e.account} off ${offKeys.join(',')}`);
            if (defKeys.join(',') !== '717,743,1122,26980') laneKeyMismatches.push(`${e.account} def ${defKeys.join(',')}`);
            const keys = [...offKeys, ...defKeys];
            // Every lane key must be a real tracked boon, never a condition.
            for (const k of keys) expect(WVW_BOON_IDS.has(k), `${e.account} lane id ${k}`).toBe(true);

            for (const [key, entry] of [...Object.entries(t.offensiveBoons), ...Object.entries(t.defensiveBoons)]) {
                const buffId = Number(key);
                const eiBuff = (p.buffUptimes ?? []).find(x => x.id === buffId);
                const eiMeta = ei.buffMap?.[`b${buffId}`];
                if (eiMeta && (eiMeta.name !== entry.name || eiMeta.icon !== entry.icon)) {
                    nameOrIconMismatches.push(`${e.account}:${buffId}`);
                }
                if (!eiBuff) {
                    eiAbsentRows++;
                    if (entry.states.length > 0) nonEmptyWhereEiAbsent.push(`${e.account}:${buffId}`);
                    continue;
                }
                comparedTimelines++;
                const nat = integrate(entry.states, end);
                const eiVal = integrate((eiBuff.states ?? []) as [number, number][], end);
                const rel = eiVal > 0 ? Math.abs(nat - eiVal) / eiVal : (nat > 0 ? Infinity : 0);
                if (rel > 1e-6) integralMismatches.push(`${e.account}:${buffId}`);
            }
        }

        expect(laneKeyMismatches, 'squad members without the expected offensive/defensive boon lanes').toEqual([]);
        expect(nameOrIconMismatches, 'boon name/icon disagreeing with EI\'s buffMap').toEqual([]);
        expect(nonEmptyWhereEiAbsent, 'native states present where EI omitted the buff entirely').toEqual([]);
        // Vacuity guards: the comparison must actually have run.
        expect(comparedTimelines).toBe(322);
        expect(eiAbsentRows).toBe(46);
        // Pinned, mechanism unknown -- see the comment above.
        expect(integralMismatches, 'boon state integrals disagreeing with EI').toEqual([
            'Anon189.7993:740',
            'Anon189.7993:1122',
            'Anon154.6698:1187',
        ]);
    });

    /**
     * KNOWN COVERAGE GAP, pinned so it fails loudly if a later axilog
     * release closes it: `hardCC`/`softCC` are empty for every squad member
     * under the native format, while EI populated them for 43 of the 46.
     *
     * The mechanism is asserted, not narrated: native's `blocks.conditions`
     * -- the only block carrying condition stack timelines -- has rows for
     * enemy/NPC entities exclusively and none at all for a squad member,
     * and native's `blocks.boons` carries only the 12 boon ids, none of
     * which is a CC id. So there is nowhere in the document for a squad
     * member's incoming Chill/Immobilize/Slow/Stun/Daze timeline to come
     * from. `blocks.cc` and `blocks.defenses.received_cc_*` carry scalar
     * counts, not timelines.
     */
    it('pins hardCC/softCC as an unpopulated native coverage gap, and proves the source is absent', () => {
        const ei = loadEiFixture();
        const native = loadNativeFixture();

        const populated: string[] = [];
        for (const e of native.entities.filter(x => x.role === 'squad')) {
            const t = extractTimeline(native, e.id, BUCKET_MS);
            if (Object.keys(t.hardCC).length > 0) populated.push(`${e.account}:hard`);
            if (Object.keys(t.softCC).length > 0) populated.push(`${e.account}:soft`);
        }
        expect(populated, 'squad members with a populated CC lane').toEqual([]);

        // EI DID have this data -- so the empty lanes are a real loss, not
        // an artefact of a fixture with no CC in it.
        const ccIds = new Set([...HARD_CC_IDS, ...SOFT_CC_IDS]);
        const eiHadCc = ei.players.filter((p: EiPlayer) =>
            (p.buffUptimes ?? []).some(b => ccIds.has(b.id) && (b.states?.length ?? 0) > 0));
        expect(eiHadCc.length, 'EI players carrying at least one CC state timeline').toBe(43);

        // ...and native genuinely has nowhere to read it from.
        const squadIds = new Set(native.entities.filter(e => e.role === 'squad').map(e => String(e.id)));
        const conditionRowEntities = Object.entries(native.blocks.conditions!.by_entity)
            .filter(([, row]) => Object.keys(row).length > 0)
            .map(([id]) => id);
        expect(conditionRowEntities.length, 'entities with condition timelines at all').toBeGreaterThan(0);
        expect(
            conditionRowEntities.filter(id => squadIds.has(id)),
            'squad entities carrying condition timelines in blocks.conditions',
        ).toEqual([]);

        const boonBlockIds = new Set<number>();
        for (const row of Object.values(native.blocks.boons!.by_entity)) {
            for (const k of Object.keys(row)) boonBlockIds.add(Number(k));
        }
        expect([...boonBlockIds].sort((a, b) => a - b)).toEqual(
            [...WVW_BOON_IDS].sort((a, b) => a - b),
        );
        expect([...boonBlockIds].filter(id => ccIds.has(id)), 'CC ids inside blocks.boons').toEqual([]);
    });

    // ---- death / down events -------------------------------------------

    /**
     * `deathEvents`/`downEvents` are the start of each `blocks.replay`
     * dead/down interval -- the same source `extractDefense`'s
     * `deathTimes`/`downTimes` already uses (Task 5), so the two must agree
     * exactly; a divergence would mean one of them drifted.
     *
     * EI's own oracle here is COUNTS only, not times: the frozen EI fixture
     * carries an EMPTY `combatReplayData` for every player (asserted below),
     * so `getDeathTimes`/`getDownTimes` returned `[]` for the whole roster
     * and there are no EI timestamps to compare against. `deadCount` /
     * `downCount` from `defenses[0]` are the comparable quantities.
     * `Anon151.6587` is the one down-detection disagreement, already pinned
     * by `defense.test.ts` for the identical reason.
     */
    it('matches EI\'s deadCount/downCount and extractDefense\'s times for every squad member', () => {
        const ei = loadEiFixture();
        const native = loadNativeFixture();
        const defenseDisagreements: string[] = [];
        const deathCountMismatches: string[] = [];
        const downCountMismatches: string[] = [];
        let membersWithDeaths = 0;
        let membersWithDowns = 0;

        for (const e of native.entities.filter(x => x.role === 'squad')) {
            const p = ei.players.find(q => q.account === e.account)!;
            const t = extractTimeline(native, e.id, BUCKET_MS);
            const d = extractDefense(native, e.id);

            if (JSON.stringify(t.deathEvents) !== JSON.stringify(d.deathTimes)
                || JSON.stringify(t.downEvents) !== JSON.stringify(d.downTimes)) {
                defenseDisagreements.push(e.account);
            }
            if (t.deathEvents.length > 0) membersWithDeaths++;
            if (t.downEvents.length > 0) membersWithDowns++;
            if (t.deathEvents.length !== p.defenses[0].deadCount) deathCountMismatches.push(e.account);
            if (t.downEvents.length !== p.defenses[0].downCount) downCountMismatches.push(e.account);

            for (const ms of [...t.deathEvents, ...t.downEvents]) {
                expect(ms, `${e.account} event time`).toBeGreaterThanOrEqual(0);
                expect(ms, `${e.account} event time`).toBeLessThanOrEqual(native.encounter.duration_ms);
            }
        }

        // The EI fixture has no combat replay at all -- this is why the
        // oracle above is counts and not times.
        expect(
            ei.players.filter(p => Object.keys(p.combatReplayData ?? {}).length > 0).length,
            'EI players carrying any combatReplayData',
        ).toBe(0);

        // Vacuity guards.
        expect(membersWithDeaths).toBe(3);
        expect(membersWithDowns).toBe(6);
        expect(defenseDisagreements, 'extractTimeline vs extractDefense death/down times').toEqual([]);
        expect(deathCountMismatches, 'deathEvents count vs EI deadCount').toEqual([]);
        // Pinned -- the same single disagreement defense.test.ts pins.
        expect(downCountMismatches, 'downEvents count vs EI downCount').toEqual(['Anon151.6587']);
    });

    // ---- distance to tag ------------------------------------------------

    /**
     * The oracle for `distanceToTag` is
     * `blocks.replay.by_entity[id].dist_to_com` -- documented as GW2EI's
     * `distToCom`, the mean distance to the commander over this actor's
     * ACTIVE polls, in world inches. That is exactly the quantity these
     * per-bucket means average, and it is computed by the parser
     * independently of the track join under test, so it is a genuine check.
     *
     * There is NO EI-side timeline oracle for this lane, and that is a
     * property of the frozen fixture rather than a gap in this test: EI's
     * `combatReplayMetaData.pollingRate`/`inchToPixel` are both absent and
     * every player's `combatReplayData` is empty (both asserted below), so
     * `buildTimeline`'s guard short-circuits and EI's `distanceToTag` is
     * `[]` for all 46 members. The native lane is the first populated one.
     *
     * Coverage matching, the trap this plan has hit twice:
     *  - `dist_to_com` averages ACTIVE polls, so buckets that mix live with
     *    downed/dead samples are dropped for members that have a down/dead
     *    interval, leaving a coarser estimate (2.5% there; measured worst
     *    1.78%). Members with no such interval compare at 0.1% (measured
     *    worst 0.011%).
     *  - Buckets hold 3 or 4 of the 300ms polls, so the mean is weighted by
     *    sample count. An unweighted mean is off by up to ~1.2% on its own.
     * The weights come from sample TIMESTAMPS only; the distances themselves
     * are read solely from the extract's output.
     */
    it('mean distanceToTag reproduces blocks.replay.by_entity[id].dist_to_com across the full roster', () => {
        const ei = loadEiFixture();
        const native = loadNativeFixture();
        const replay = native.blocks.replay!;
        const tracks = replay.tracks!;
        const cmd = commanderId(native)!;
        const cmdTimes = new Set((tracks.by_entity[String(cmd)]?.samples ?? []).map(s => s[0]));
        expect(cmdTimes.size).toBeGreaterThan(0);

        // Mechanism for "no EI oracle exists for this lane".
        expect(ei.combatReplayMetaData?.pollingRate, 'EI pollingRate').toBeUndefined();
        expect(ei.combatReplayMetaData?.inchToPixel, 'EI inchToPixel').toBeUndefined();

        const absentDistToCom: string[] = [];
        const sentinelDistToCom: string[] = [];
        const emptyComparison: string[] = [];
        const mismatches: string[] = [];
        let compared = 0;
        let livenessExcluded = 0;
        let commanderRows = 0;

        for (const e of native.entities.filter(x => x.role === 'squad')) {
            const t = extractTimeline(native, e.id, BUCKET_MS);
            if (e.id === cmd) {
                commanderRows++;
                expect(t.distanceToTag, 'the commander has no distance-to-self lane').toEqual([]);
                continue;
            }

            const row = replay.by_entity[String(e.id)]!;
            const expected = row.dist_to_com;
            // Tri-state: absent = the position pass never ran, -1 = an EI
            // sentinel, >= 0 = a real distance. Neither non-real state may
            // be averaged in as if it were a distance.
            if (expected === undefined) { absentDistToCom.push(e.account); continue; }
            if (expected < 0) { sentinelDistToCom.push(e.account); continue; }

            const intervals = [...row.dead, ...row.down];
            const isLive = (ts: number) => !intervals.some(([from, to]) => ts >= from && ts <= to);
            const n = t.distanceToTag.length;
            const matched = new Array<number>(n).fill(0);
            const live = new Array<number>(n).fill(0);
            for (const [ts] of tracks.by_entity[String(e.id)]?.samples ?? []) {
                if (!cmdTimes.has(ts)) continue;
                const b = Math.floor(ts / BUCKET_MS);
                if (b < 0 || b >= n) continue;
                matched[b]++;
                if (isLive(ts)) live[b]++;
            }

            const hasLivenessGap = intervals.length > 0;
            if (hasLivenessGap) livenessExcluded++;
            let total = 0;
            let weight = 0;
            for (let b = 0; b < n; b++) {
                if (matched[b] === 0) continue;
                if (hasLivenessGap && live[b] !== matched[b]) continue;
                total += t.distanceToTag[b].value * matched[b];
                weight += matched[b];
            }
            if (weight === 0) { emptyComparison.push(e.account); continue; }

            compared++;
            const actual = total / weight;
            const tolerance = hasLivenessGap ? 0.025 : 0.0003;
            if (Math.abs(actual - expected) / expected > tolerance) {
                mismatches.push(`${e.account} ${actual.toFixed(2)} vs ${expected.toFixed(2)}`);
            }
        }

        expect(absentDistToCom, 'squad members with no dist_to_com at all').toEqual([]);
        expect(sentinelDistToCom, 'squad members with the -1 dist_to_com sentinel').toEqual([]);
        expect(emptyComparison, 'squad members left with no comparable bucket').toEqual([]);
        // Vacuity guards: the whole roster was reached, and the liveness
        // skip did not empty the tight comparison.
        expect(commanderRows).toBe(1);
        expect(compared).toBe(45);
        expect(livenessExcluded).toBe(6);
        expect(mismatches).toEqual([]);
    });

    /**
     * The precondition that makes an index join wrong, asserted directly so
     * a future refactor back to `samples[i]` vs `cmdSamples[i]` cannot look
     * safe: the tracks do NOT share a start tick or a length, so index `i`
     * is a different instant for different entities. (The join correctness
     * itself is enforced by the `dist_to_com` test above, which an index
     * join fails.)
     */
    it('confirms replay tracks are not index-aligned, so the timestamp join is required', () => {
        const native = loadNativeFixture();
        const tracks = native.blocks.replay!.tracks!;
        const starts = new Set<number>();
        const lengths = new Set<number>();
        let trackCount = 0;
        for (const track of Object.values(tracks.by_entity)) {
            if (track.samples.length === 0) continue;
            trackCount++;
            starts.add(track.samples[0][0]);
            lengths.add(track.samples.length);
        }
        expect(trackCount).toBeGreaterThan(40);
        expect(starts.size, 'distinct track start timestamps').toBeGreaterThan(1);
        expect(lengths.size, 'distinct track lengths').toBeGreaterThan(1);
    });

    /**
     * The distance lane deliberately keeps downed/dead buckets (the EI lane
     * did too). `computeDistanceToTagStats` -- the average/median consumer
     * in `extractPlayerData.ts`, untouched by this task -- applies the
     * runback exclusion by filtering those buckets out itself, which is only
     * possible if they are present here. This asserts they are: the members
     * with a death have real, non-zero distance buckets inside the dead
     * interval, and they are far enough out to be what the exclusion exists
     * to remove.
     */
    it('keeps downed/dead buckets in the distance lane for the runback exclusion to filter', () => {
        const native = loadNativeFixture();
        const replay = native.blocks.replay!;
        let checked = 0;

        for (const e of native.entities.filter(x => x.role === 'squad')) {
            const dead = replay.by_entity[String(e.id)]!.dead;
            if (dead.length === 0) continue;
            const t = extractTimeline(native, e.id, BUCKET_MS);
            for (const [from, to] of dead) {
                const inside = t.distanceToTag.filter(b => b.time >= from && b.time <= to);
                expect(inside.length, `${e.account} buckets inside the dead interval`).toBeGreaterThan(0);
                expect(
                    inside.filter(b => b.value > 0).length,
                    `${e.account} non-zero distance buckets inside the dead interval`,
                ).toBeGreaterThan(0);
                checked++;
            }
        }
        expect(checked, 'dead intervals examined').toBe(3);
    });

    // ---- local player + failure modes ------------------------------------

    it('produces a populated timeline for the local player', () => {
        const ei = loadEiFixture();
        const native = loadNativeFixture();
        const p = eiLocal(ei);
        const t = extractTimeline(native, localPlayerId(native), BUCKET_MS);

        expect(sum(t.damageDealt)).toBe(p.damage1S[0].at(-1));
        expect(sum(t.incomingHealing)).toBe(p.extHealingStats?.healingReceived1S?.[0]?.at(-1));
        expect(t.healthPercent.length).toBeGreaterThan(0);
        expect(Object.keys(t.offensiveBoons).length).toBe(4);
        expect(Object.keys(t.defensiveBoons).length).toBe(4);
        expect(t.distanceToTag.some(b => b.value > 0)).toBe(true);
    });

    it('throws on an unknown entity id rather than returning blanks', () => {
        expect(() => extractTimeline(loadNativeFixture(), 999_999, BUCKET_MS)).toThrow();
    });
});
