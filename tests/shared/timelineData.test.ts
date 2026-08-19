import { describe, it, expect } from 'vitest';
import { extractDamageTimeline, bucketTimeline } from '../../src/shared/timelineData';

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

/*
 * `extractDistanceToTagTimelineEi` and its synthetic test were DELETED by
 * Task 11, not relocated. Unlike the other EI helpers it has no oracle
 * value: the frozen EI fixture carries an empty `combatReplayData` for every
 * player and no `combatReplayMetaData.pollingRate`/`inchToPixel`, so the
 * function never ran on it and could never have been compared against
 * anything. `extract/timeline.ts`'s native lane is the first code that
 * populates distance-to-tag at all. This also retires
 * `computeDistancesPerBucketEi`'s dormant `floor`-vs-`ceil` bug (Task 9's
 * amendment): both EI distance paths are gone, nothing consumes them, and no
 * `floor` was carried into the native code -- the native distance join is on
 * the sample TIMESTAMP and does no index arithmetic at all.
 */
