import { describe, it, expect } from 'vitest';
import { extractDamageTimeline, extractDistanceToTagTimeline, bucketTimeline } from '../../src/shared/timelineData';

describe('bucketTimeline', () => {
    it('buckets per-second data into requested bucket size', () => {
        const perSecond = [100, 200, 300, 400, 500];
        const result = bucketTimeline(perSecond, 1000);
        expect(result).toHaveLength(5);
        expect(result[0]).toEqual({ time: 0, value: 100 });
        expect(result[4]).toEqual({ time: 4000, value: 500 });
    });

    it('aggregates into larger buckets', () => {
        const perSecond = [100, 200, 300, 400, 500, 600];
        const result = bucketTimeline(perSecond, 3000);
        expect(result).toHaveLength(2);
        expect(result[0]).toEqual({ time: 0, value: 600 });
        expect(result[1]).toEqual({ time: 3000, value: 1500 });
    });
});

describe('extractDamageTimeline', () => {
    it('converts cumulative damage1S to per-second values', () => {
        const cumulative = [0, 100, 350, 600, 1000];
        const result = extractDamageTimeline(cumulative, 1000);
        expect(result[0].value).toBe(0);
        expect(result[1].value).toBe(100);
        expect(result[2].value).toBe(250);
        expect(result[3].value).toBe(250);
        expect(result[4].value).toBe(400);
    });
});

describe('extractDistanceToTagTimeline', () => {
    it('samples positions at bucket intervals', () => {
        const playerPositions: [number, number][] = [[100, 100], [110, 100], [120, 100], [130, 100]];
        const tagPositions: [number, number][] = [[100, 100], [100, 100], [100, 100], [100, 100]];
        const pollingRate = 1000;
        const inchToPixel = 1;
        const result = extractDistanceToTagTimeline(playerPositions, tagPositions, pollingRate, inchToPixel, 1000);
        expect(result[0].value).toBe(0);
        expect(result[1].value).toBe(10);
        expect(result[2].value).toBe(20);
        expect(result[3].value).toBe(30);
    });
});
