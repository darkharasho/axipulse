import type { EiJson, EiPlayer, StabPerfBreakdown, StabPerfPartyMember } from './types';

const STABILITY_BUFF_ID = 1122;
const DEATH_SKILL_ID = -28;
const DISTANCE_THRESHOLD_UNITS = 600;

export function computeStabPerformance(
    json: EiJson,
    localPlayer: EiPlayer,
    bucketSizeMs: number,
): StabPerfBreakdown | null {
    const durationMs = Number(json?.durationMS || 0);
    if (durationMs <= 0) return null;

    const effectiveBucketMs = Math.max(1000, Math.round(bucketSizeMs / 1000) * 1000);
    const bucketCount = Math.max(1, Math.ceil(durationMs / effectiveBucketMs));
    const buckets = Array.from({ length: bucketCount }, (_, i) => ({
        startMs: i * effectiveBucketMs,
        label: `${Math.round((i * effectiveBucketMs) / 1000)}s`,
    }));

    return {
        bucketSizeMs: effectiveBucketMs,
        bucketCount,
        buckets,
        selfGeneration: new Array(bucketCount).fill(0),
        partyIncomingDamage: new Array(bucketCount).fill(0),
        partyMembers: [],
    };
}
