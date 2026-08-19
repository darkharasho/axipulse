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
        for (const [id, e] of Object.entries(series.by_entity)) {
            const total = damage.by_entity[id]?.total;
            if (total === undefined) continue;
            const decoded = decodeSeries(e.damage);
            expect(decoded[decoded.length - 1], `entity ${id} final damage sample vs DamageBlock total`).toBe(total);
        }
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
        expect(squadMembers(r).every(e => e.role === 'squad')).toBe(true);
        expect(enemyPlayers(r).every(e => e.role === 'enemy_player')).toBe(true);
        expect(squadMembers(r).length).toBeGreaterThan(0);
    });

    it('resolves the local player from encounter.recorded_by', () => {
        const r = loadNativeFixture();
        expect(entityById(r).has(localPlayerId(r))).toBe(true);
    });

    it('resolves the commander, or null when the fight had none', () => {
        const r = loadNativeFixture();
        const id = commanderId(r);
        if (id !== null) expect(entityById(r).get(id)!.commander).toBeDefined();
    });
});
