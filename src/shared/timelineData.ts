// src/shared/timelineData.ts
import type { TimelineBucket } from './types';

export function bucketTimeline(perSecondValues: number[], bucketSizeMs: number): TimelineBucket[] {
    const bucketSizeSec = Math.max(1, Math.round(bucketSizeMs / 1000));
    const buckets: TimelineBucket[] = [];

    for (let i = 0; i < perSecondValues.length; i += bucketSizeSec) {
        let sum = 0;
        for (let j = i; j < Math.min(i + bucketSizeSec, perSecondValues.length); j++) {
            sum += perSecondValues[j];
        }
        buckets.push({ time: i * 1000, value: sum });
    }

    return buckets;
}

export function cumulativeToPerSecond(cumulative: number[]): number[] {
    const perSecond: number[] = [];
    for (let i = 0; i < cumulative.length; i++) {
        perSecond.push(i === 0 ? cumulative[0] : cumulative[i] - cumulative[i - 1]);
    }
    return perSecond;
}

export function extractDamageTimeline(cumulativeDamage1S: number[], bucketSizeMs: number): TimelineBucket[] {
    const perSecond = cumulativeToPerSecond(cumulativeDamage1S);
    return bucketTimeline(perSecond, bucketSizeMs);
}
