import { describe, it, expect } from 'vitest';
import { getHealthInRange, getBoonStateAtTime, getAvgDistanceInRange } from '../../src/shared/timelineInspector';
import type { TimelineBucket, BuffStateEntry } from '../../src/shared/types';

describe('getHealthInRange', () => {
    const healthPercent: [number, number][] = [
        [0, 100], [2000, 90], [5000, 60], [8000, 30], [10000, 0],
    ];

    it('returns health points within the time range', () => {
        const result = getHealthInRange(healthPercent, 2000, 8000);
        expect(result).toEqual([[2000, 90], [5000, 60], [8000, 30]]);
    });

    it('includes boundary points interpolated from before range', () => {
        const result = getHealthInRange(healthPercent, 3000, 6000);
        expect(result.length).toBeGreaterThanOrEqual(1);
        expect(result[0][0]).toBeLessThanOrEqual(3000);
    });

    it('returns empty for empty input', () => {
        expect(getHealthInRange([], 0, 5000)).toEqual([]);
    });
});

describe('getBoonStateAtTime', () => {
    it('returns current stack count at given time', () => {
        const entry: BuffStateEntry = {
            name: 'Might',
            icon: 'https://example.com/might.png',
            states: [[0, 15], [3000, 25], [7000, 0]],
        };
        expect(getBoonStateAtTime(entry, 5000)).toEqual({ name: 'Might', icon: 'https://example.com/might.png', stacks: 25, active: true });
    });

    it('returns inactive when stacks are 0', () => {
        const entry: BuffStateEntry = {
            name: 'Stability',
            icon: 'https://example.com/stab.png',
            states: [[0, 1], [3000, 0]],
        };
        const result = getBoonStateAtTime(entry, 5000);
        expect(result.active).toBe(false);
        expect(result.stacks).toBe(0);
    });

    it('finds when boon was last active for droppedAgoMs', () => {
        const entry: BuffStateEntry = {
            name: 'Stability',
            icon: 'https://example.com/stab.png',
            states: [[0, 1], [3000, 0]],
        };
        const result = getBoonStateAtTime(entry, 5000);
        expect(result.droppedAgoMs).toBe(2000);
    });

    it('returns no droppedAgoMs when boon was never active', () => {
        const entry: BuffStateEntry = {
            name: 'Aegis',
            icon: '',
            states: [[0, 0]],
        };
        const result = getBoonStateAtTime(entry, 5000);
        expect(result.droppedAgoMs).toBeUndefined();
    });
});

describe('getAvgDistanceInRange', () => {
    it('averages distance buckets within range', () => {
        const buckets: TimelineBucket[] = [
            { time: 0, value: 100 },
            { time: 1000, value: 200 },
            { time: 2000, value: 300 },
            { time: 3000, value: 400 },
            { time: 4000, value: 500 },
        ];
        const result = getAvgDistanceInRange(buckets, 1000, 3000);
        expect(result.avg).toBe(300);
        expect(result.max).toBe(400);
    });

    it('returns 0 for empty range', () => {
        const result = getAvgDistanceInRange([], 0, 5000);
        expect(result.avg).toBe(0);
        expect(result.max).toBe(0);
    });
});
