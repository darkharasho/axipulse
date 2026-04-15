import type { TimelineBucket, BuffStateEntry } from './types';

export function getHealthInRange(
    healthPercent: [number, number][],
    startMs: number,
    endMs: number,
): [number, number][] {
    if (healthPercent.length === 0) return [];

    const result: [number, number][] = [];
    let lastBefore: [number, number] | null = null;

    for (const point of healthPercent) {
        if (point[0] < startMs) {
            lastBefore = point;
        } else if (point[0] <= endMs) {
            if (result.length === 0 && lastBefore && point[0] > startMs) {
                result.push(lastBefore);
            }
            result.push(point);
        }
    }

    if (result.length === 0 && lastBefore) {
        result.push(lastBefore);
    }

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

export function getAvgDistanceInRange(
    buckets: TimelineBucket[],
    startMs: number,
    endMs: number,
): { avg: number; max: number } {
    const inRange = buckets.filter(b => b.time >= startMs && b.time <= endMs);
    if (inRange.length === 0) return { avg: 0, max: 0 };

    const sum = inRange.reduce((s, b) => s + b.value, 0);
    const max = Math.max(...inRange.map(b => b.value));
    return { avg: Math.round(sum / inRange.length), max };
}
