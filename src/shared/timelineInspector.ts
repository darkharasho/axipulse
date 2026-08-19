import type { TimelineBucket, BuffStateEntry } from './types';

function interpolateHealth(healthPercent: [number, number][], timeMs: number): number {
    if (healthPercent.length === 0) return 0;
    if (timeMs <= healthPercent[0][0]) return healthPercent[0][1];
    if (timeMs >= healthPercent[healthPercent.length - 1][0]) return healthPercent[healthPercent.length - 1][1];
    for (let i = 0; i < healthPercent.length - 1; i++) {
        const [t0, v0] = healthPercent[i];
        const [t1, v1] = healthPercent[i + 1];
        if (timeMs >= t0 && timeMs <= t1) {
            if (t1 === t0) return v0;
            const frac = (timeMs - t0) / (t1 - t0);
            return v0 + frac * (v1 - v0);
        }
    }
    return healthPercent[healthPercent.length - 1][1];
}

export function getHealthInRange(
    healthPercent: [number, number][],
    startMs: number,
    endMs: number,
): [number, number][] {
    if (healthPercent.length === 0) return [];

    const result: [number, number][] = [];

    result.push([startMs, interpolateHealth(healthPercent, startMs)]);

    for (const point of healthPercent) {
        if (point[0] > startMs && point[0] < endMs) {
            result.push(point);
        }
    }

    result.push([endMs, interpolateHealth(healthPercent, endMs)]);

    return result;
}

export interface BoonSnapshot {
    name: string;
    icon: string;
    stacks: number;
    active: boolean;
    droppedAgoMs?: number;
}

export function getBoonStateAtTime(entry: BuffStateEntry, timeMs: number): BoonSnapshot {
    let currentStacks = 0;
    let lastActiveTime: number | undefined;

    for (const [t, stacks] of entry.states) {
        if (t > timeMs) break;
        if (stacks > 0) lastActiveTime = t;
        currentStacks = stacks;
    }

    const active = currentStacks > 0;
    let droppedAgoMs: number | undefined;

    if (!active && lastActiveTime !== undefined) {
        let droppedAt = 0;
        for (const [t, stacks] of entry.states) {
            if (t > timeMs) break;
            if (stacks === 0 && lastActiveTime !== undefined && t > lastActiveTime) {
                droppedAt = t;
                break;
            }
        }
        if (droppedAt > 0) {
            droppedAgoMs = timeMs - droppedAt;
        }
    }

    return { name: entry.name, icon: entry.icon, stacks: currentStacks, active, droppedAgoMs };
}

/**
 * Mean and peak distance to the commander over a time range, or `null` when
 * the range holds no sampled bucket.
 *
 * `null`, not `{ avg: 0, max: 0 }`. Zero inches from the tag reads as
 * "perfectly stacked" -- the panel paints it green and hides the "far from
 * squad" warning -- which is the exact opposite of "we do not know where
 * they were". The distinction was invisible under Elite Insights, whose
 * `distanceToTag` lane was empty for the ENTIRE roster on this app's frozen
 * fixture, so the panel showed a confident green 0 for everyone. The native
 * lane populates it for 45 of 46 squad members, which makes the remaining
 * absences (the commander, who has no distance to their own tag, and any
 * range outside a member's sampled window) meaningful for the first time.
 */
export function getAvgDistanceInRange(
    buckets: TimelineBucket[],
    startMs: number,
    endMs: number,
): { avg: number; max: number } | null {
    const inRange = buckets.filter(b => b.time >= startMs && b.time <= endMs);
    if (inRange.length === 0) return null;

    const sum = inRange.reduce((s, b) => s + b.value, 0);
    const max = Math.max(...inRange.map(b => b.value));
    return { avg: Math.round(sum / inRange.length), max };
}
