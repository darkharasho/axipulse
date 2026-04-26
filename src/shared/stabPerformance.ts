import type { EiJson, EiPlayer, StabPerfBreakdown, StabPerfPartyMember } from './types';

const STABILITY_BUFF_ID = 1122;
const DEATH_SKILL_ID = -28;
const DISTANCE_THRESHOLD_UNITS = 600;

function integrateStatesPerBucket(
    states: Array<[number, number]>,
    bucketCount: number,
    bucketSizeMs: number,
): number[] {
    const out = new Array<number>(bucketCount).fill(0);
    if (!states || states.length === 0) return out;
    const sorted = [...states].sort((a, b) => Number(a[0]) - Number(b[0]));
    for (let b = 0; b < bucketCount; b++) {
        const bucketStart = b * bucketSizeMs;
        const bucketEnd = bucketStart + bucketSizeMs;
        // Find stack value at bucketStart (last state at or before it)
        let curStacks = 0;
        for (let i = sorted.length - 1; i >= 0; i--) {
            if (Number(sorted[i][0]) <= bucketStart) { curStacks = Number(sorted[i][1]); break; }
        }
        let weightedSum = 0;
        let prevTime = bucketStart;
        for (const [tRaw, sRaw] of sorted) {
            const t = Number(tRaw);
            if (t <= bucketStart) continue;
            if (t >= bucketEnd) break;
            weightedSum += curStacks * (t - prevTime);
            prevTime = t;
            curStacks = Number(sRaw);
        }
        weightedSum += curStacks * (bucketEnd - prevTime);
        out[b] = weightedSum / bucketSizeMs;
    }
    return out;
}

function getStabilityBuff(player: EiPlayer) {
    return (player.buffUptimes ?? []).find(b => Number(b?.id) === STABILITY_BUFF_ID);
}

function computeDeathsPerBucket(player: EiPlayer, bucketCount: number, bucketSizeMs: number): number[] {
    const out = new Array<number>(bucketCount).fill(0);
    const deathSkill = (player.rotation ?? []).find(r => Number(r?.id) === DEATH_SKILL_ID);
    if (!deathSkill || !Array.isArray(deathSkill.skills)) return out;
    for (const skill of deathSkill.skills) {
        const idx = Math.min(bucketCount - 1, Math.floor(Number(skill?.castTime || 0) / bucketSizeMs));
        if (idx >= 0) out[idx]++;
    }
    return out;
}

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

    const localGroup = Number(localPlayer?.group || 0);
    const partyPlayers = localGroup > 0
        ? json.players.filter(p =>
            p && !p.notInSquad && !p.isFake
            && Number(p.group || 0) === localGroup
            && p.account !== localPlayer.account)
        : [];

    const partyMembers: StabPerfPartyMember[] = partyPlayers.map(p => {
        const stabBuff = getStabilityBuff(p);
        const states = (stabBuff?.states ?? []).map(s => [Number(s[0]), Number(s[1])] as [number, number]);
        return {
            key: p.account,
            displayName: p.account.split('.')[0],
            profession: p.profession,
            stacks: integrateStatesPerBucket(states, bucketCount, effectiveBucketMs),
            deaths: computeDeathsPerBucket(p, bucketCount, effectiveBucketMs),
            distances: new Array(bucketCount).fill(0),
        };
    });

    return {
        bucketSizeMs: effectiveBucketMs,
        bucketCount,
        buckets,
        selfGeneration: new Array(bucketCount).fill(0),
        partyIncomingDamage: new Array(bucketCount).fill(0),
        partyMembers,
    };
}
