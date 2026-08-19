import { describe, it, expect } from 'vitest';
import {
    getHealthInRange, getBoonStateAtTime, getAvgDistanceInRange, interpolateHealth,
} from '../../src/shared/timelineInspector';
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

describe('interpolateHealth', () => {
    const health: [number, number][] = [[0, 100], [2000, 90], [5000, 60]];

    it('interpolates strictly between two samples', () => {
        expect(interpolateHealth(health, 1000)).toBe(95);
        expect(interpolateHealth(health, 3500)).toBe(75);
    });

    it('returns the sample itself on a sample instant', () => {
        expect(interpolateHealth(health, 0)).toBe(100);
        expect(interpolateHealth(health, 2000)).toBe(90);
        expect(interpolateHealth(health, 5000)).toBe(60);
    });

    it('clamps outside the sampled window rather than extrapolating', () => {
        expect(interpolateHealth(health, -5000)).toBe(100);
        expect(interpolateHealth(health, 50_000)).toBe(60);
    });

    it('returns 0, not 100, for a health timeline with no samples at all', () => {
        // The distinction matters: 100 is "at full health", a claim about
        // the player. 0 here means "no reading" and the panel draws nothing.
        expect(interpolateHealth([], 1000)).toBe(0);
        expect(interpolateHealth([], 0)).toBe(0);
    });

    it('takes the earlier value when two samples share a timestamp', () => {
        expect(interpolateHealth([[0, 100], [1000, 80], [1000, 40], [2000, 10]], 1000)).toBe(80);
    });
});

describe('getBoonStateAtTime', () => {
    /**
     * The `>` / `>=` boundary. A state stamped at exactly `timeMs` is part of
     * the snapshot AT that instant; `t >= timeMs` would break one poll early
     * and show the previous stack count for the whole tick.
     */
    it('includes a state stamped at exactly the queried instant', () => {
        const entry: BuffStateEntry = {
            name: 'Stability', icon: 'https://example.com/stab.png',
            states: [[0, 1], [1000, 3], [2000, 5]],
        };
        expect(getBoonStateAtTime(entry, 999).stacks).toBe(1);
        expect(getBoonStateAtTime(entry, 1000).stacks).toBe(3);
        expect(getBoonStateAtTime(entry, 1001).stacks).toBe(3);
        expect(getBoonStateAtTime(entry, 2000).stacks).toBe(5);
    });

    it('reports nothing before the first state, rather than the first value', () => {
        const entry: BuffStateEntry = {
            name: 'Stability', icon: 'https://example.com/stab.png',
            states: [[5000, 4]],
        };
        expect(getBoonStateAtTime(entry, 4999)).toMatchObject({ stacks: 0, active: false });
        expect(getBoonStateAtTime(entry, 5000)).toMatchObject({ stacks: 4, active: true });
    });

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
        expect(result).not.toBeNull();
        expect(result!.avg).toBe(300);
        expect(result!.max).toBe(400);
    });

    /**
     * `null`, not `{ avg: 0, max: 0 }` -- changed by Task 11. Zero inches
     * from the tag is a claim ("perfectly stacked", painted green, warning
     * suppressed); an unsampled range is an absence. Under Elite Insights
     * the two were indistinguishable because the EI `distanceToTag` lane was
     * empty for every player on the frozen fixture, so this branch was the
     * ONLY one that ever ran and it always lied. `PositionPanel` renders the
     * null as an em dash.
     */
    it('returns null, not zero, when no bucket falls in the range', () => {
        expect(getAvgDistanceInRange([], 0, 5000)).toBeNull();
        expect(getAvgDistanceInRange([{ time: 0, value: 500 }], 9000, 10000)).toBeNull();
    });

    /**
     * The OTHER half of "absence is distinguishable from a genuine zero",
     * which the test above only proves in one direction. A player standing
     * exactly on the commander is a real measurement of 0 inches and must
     * still come back as `{ avg: 0 }` -- collapsing it to `null` would
     * replace one silent substitution with its mirror image and hide a
     * genuinely perfect stack behind an em dash.
     */
    /**
     * The mean is ROUNDED, not truncated, and the range boundaries are
     * INCLUSIVE at both ends. Both survived: `Math.floor` for `Math.round`
     * and `>`/`<` for `>=`/`<=` left the suite green.
     */
    it('rounds the mean rather than truncating it', () => {
        expect(getAvgDistanceInRange([{ time: 0, value: 100 }, { time: 1000, value: 101 }], 0, 1000))
            .toEqual({ avg: 101, max: 101 });
        expect(getAvgDistanceInRange([{ time: 0, value: 100 }, { time: 1000, value: 103 }], 0, 1000))
            .toEqual({ avg: 102, max: 103 });
    });

    it('includes buckets sitting exactly on either range boundary', () => {
        const buckets: TimelineBucket[] = [
            { time: 0, value: 10 }, { time: 1000, value: 900 }, { time: 2000, value: 20 },
        ];
        // All three: 310 mean. Excluding either endpoint changes it.
        expect(getAvgDistanceInRange(buckets, 0, 2000)).toEqual({ avg: 310, max: 900 });
        expect(getAvgDistanceInRange(buckets, 1000, 1000)).toEqual({ avg: 900, max: 900 });
    });

    it('returns a genuine sampled zero as zero, not as absence', () => {
        expect(getAvgDistanceInRange([{ time: 0, value: 0 }], 0, 1000))
            .toEqual({ avg: 0, max: 0 });
        expect(getAvgDistanceInRange(
            [{ time: 0, value: 0 }, { time: 1000, value: 0 }, { time: 2000, value: 0 }], 0, 5000,
        )).toEqual({ avg: 0, max: 0 });
    });
});
