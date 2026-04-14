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

export function extractDistanceToTagTimeline(
    playerPositions: [number, number][],
    tagPositions: [number, number][],
    pollingRate: number,
    inchToPixel: number,
    bucketSizeMs: number,
): TimelineBucket[] {
    const scale = inchToPixel || 1;
    const perSample: number[] = [];

    const len = Math.min(playerPositions.length, tagPositions.length);
    for (let i = 0; i < len; i++) {
        const [px, py] = playerPositions[i];
        const [tx, ty] = tagPositions[i];
        perSample.push(Math.round(Math.hypot(px - tx, py - ty) / scale));
    }

    // Resample from pollingRate intervals to 1-second intervals
    const samplesPerSecond = Math.max(1, Math.round(1000 / pollingRate));
    const perSecond: number[] = [];
    for (let i = 0; i < perSample.length; i += samplesPerSecond) {
        let sum = 0;
        let count = 0;
        for (let j = i; j < Math.min(i + samplesPerSecond, perSample.length); j++) {
            sum += perSample[j];
            count++;
        }
        perSecond.push(count > 0 ? Math.round(sum / count) : 0);
    }

    return bucketTimeline(perSecond, bucketSizeMs);
}
