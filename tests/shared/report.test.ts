import { describe, it, expect } from 'vitest';
import {
    decodeSeries, entityById, squadMembers, enemyPlayers,
    requireBlock, localPlayerId, commanderId,
} from '../../src/shared/report';
import { loadNativeFixture } from './oracle';
import type { SeriesOut, ReportV1 } from '@axiapps/axilog/types';

describe('decodeSeries', () => {
    it('passes raw series through', () => {
        const s = { interval_ms: 1000, len: 3, enc: 'raw', data: [1, 2, 3] } as SeriesOut;
        expect(decodeSeries(s)).toEqual([1, 2, 3]);
    });

    it('expands rle runs', () => {
        const s = { interval_ms: 1000, len: 5, enc: 'rle', data: [[0, 3], [7, 2]] } as SeriesOut;
        expect(decodeSeries(s)).toEqual([0, 0, 0, 7, 7]);
    });

    it('expands a single-run rle series', () => {
        const s = { interval_ms: 1000, len: 4, enc: 'rle', data: [[9, 4]] } as SeriesOut;
        expect(decodeSeries(s)).toEqual([9, 9, 9, 9]);
    });

    it('throws when the decoded length disagrees with len', () => {
        const s = { interval_ms: 1000, len: 5, enc: 'rle', data: [[1, 2]] } as SeriesOut;
        expect(() => decodeSeries(s)).toThrow(/expected 5/);
    });

    it('decodes every series in the real fixture to its declared length', () => {
        const r = loadNativeFixture();
        const series = requireBlock(r, 'series');
        for (const [id, e] of Object.entries(series.by_entity)) {
            expect(decodeSeries(e.damage).length, `entity ${id} damage`).toBe(e.damage.len);
            expect(decodeSeries(e.damage_taken).length, `entity ${id} taken`).toBe(e.damage_taken.len);
        }
    });

    it('ends a real entity damage series at that entity\'s DamageBlock total', () => {
        const r = loadNativeFixture();
        const series = requireBlock(r, 'series');
        const damage = requireBlock(r, 'damage');
        // Verified against the real fixture (entity 0's decoded `damage`
        // series rises then plateaus, e.g. [...,941,1471,1471,...]) rather
        // than assumed: the per-entity `damage` series is a CUMULATIVE
        // running total, so its final sample -- not the sum of its
        // buckets -- should equal DamageBlock's fight-total `total`.
        let compared = 0;
        for (const [id, e] of Object.entries(series.by_entity)) {
            const total = damage.by_entity[id]?.total;
            if (total === undefined) continue;
            const decoded = decodeSeries(e.damage);
            expect(decoded[decoded.length - 1], `entity ${id} final damage sample vs DamageBlock total`).toBe(total);
            compared++;
        }
        // Measured on the fixture: all 103 series entities have a
        // DamageBlock total, so a `continue` that skipped every row would
        // be the bug, not the fixture.
        expect(compared, 'entities actually compared').toBe(103);
    });

    it('returns a copy, so a caller mutating the result cannot corrupt the source', () => {
        // `decodeSeries` slices rather than returning `data` itself. The
        // reason is not "the parse cache in production" -- `extract/timeline.ts`
        // refutes that -- it is that a raw-encoded series would otherwise hand
        // out its own backing array, and the fixture IS shared between the
        // tests in a file via `loadNativeFixture`'s module-level cache.
        const data = [1, 2, 3];
        const s = { interval_ms: 1000, len: 3, enc: 'raw', data } as SeriesOut;
        const decoded = decodeSeries(s);
        expect(decoded).not.toBe(data);
        decoded[0] = 999;
        expect(data[0]).toBe(1);
    });
});

describe('requireBlock', () => {
    it('returns a present block', () => {
        expect(requireBlock(loadNativeFixture(), 'damage')).toBeDefined();
    });

    it('throws with the coverage state when a block was not computed', () => {
        const r = { blocks: {}, coverage: { missiles: 'not_computed' } } as unknown as ReportV1;
        expect(() => requireBlock(r, 'missiles')).toThrow(/missiles.*not_computed/);
    });
});

describe('entity helpers', () => {
    it('indexes every entity by id', () => {
        const r = loadNativeFixture();
        const map = entityById(r);
        expect(map.size).toBe(r.entities.length);
        expect(map.get(r.entities[0].id)).toBe(r.entities[0]);
    });

    it('partitions players by role', () => {
        const r = loadNativeFixture();
        // Counts first: `[].every()` is true, so the predicates below pass
        // vacuously on an empty partition. Measured on the fixture.
        expect(squadMembers(r).length).toBe(46);
        expect(enemyPlayers(r).length).toBe(46);
        expect(squadMembers(r).every(e => e.role === 'squad')).toBe(true);
        expect(enemyPlayers(r).every(e => e.role === 'enemy_player')).toBe(true);
    });

    it('resolves the local player from encounter.recorded_by', () => {
        const r = loadNativeFixture();
        // The identity, not just membership: `entityById(r).has(...)` passes
        // for ANY entity in the log, including a function that ignores
        // `recorded_by` and returns a stranger.
        expect(r.encounter.recorded_by).toBe(11);
        expect(localPlayerId(r)).toBe(11);
    });

    it('throws rather than guessing when the log carries no recorded_by', () => {
        // A personal-performance tool that silently substitutes another
        // squad member renders a stranger's numbers as the user's own, and
        // the output gives no way to notice.
        const r = loadNativeFixture();
        const noRecorder = { ...r, encounter: { ...r.encounter, recorded_by: undefined } } as ReportV1;
        expect(squadMembers(noRecorder).length).toBe(46);
        expect(() => localPlayerId(noRecorder)).toThrow(/recorded_by/);
    });

    it('resolves the commander to the entity that held the tag', () => {
        const r = loadNativeFixture();
        // Measured: exactly one tagged entity, id 6. `if (id !== null)`
        // around this made the test blind to `commanderId` returning null
        // unconditionally.
        expect(commanderId(r)).toBe(6);
        expect(entityById(r).get(6)!.commander).toBeDefined();
    });

    it('returns null when nobody held a tag', () => {
        const r = loadNativeFixture();
        const noTag = { ...r, entities: r.entities.map(e => ({ ...e, commander: undefined })) } as ReportV1;
        expect(commanderId(noTag)).toBeNull();
    });
});
