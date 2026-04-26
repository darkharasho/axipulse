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

function cumulativeToDeltas(cum: number[]): number[] {
    return cum.map((v, i) => Math.max(0, Number(v || 0) - Number(cum[i - 1] || 0)));
}

function computePartyIncomingDamage(
    partyPlayers: EiPlayer[],
    bucketCount: number,
    bucketSizeMs: number,
): number[] {
    const out = new Array<number>(bucketCount).fill(0);
    const bucketSizeSec = Math.max(1, Math.round(bucketSizeMs / 1000));
    for (const p of partyPlayers) {
        const row = (p.damageTaken1S ?? [])[0] ?? [];
        if (row.length === 0) continue;
        const deltas = cumulativeToDeltas(row.map(Number));
        for (let s = 0; s < deltas.length; s++) {
            const bucketIdx = Math.min(bucketCount - 1, Math.floor(s / bucketSizeSec));
            out[bucketIdx] += deltas[s];
        }
    }
    return out;
}

function computeSelfGenerationPerBucket(
    json: EiJson,
    localPlayer: EiPlayer,
    bucketCount: number,
    bucketSizeMs: number,
    durationMs: number,
): number[] {
    const localName = localPlayer.name;
    const squadMembers = json.players.filter(p => p && !p.notInSquad && !p.isFake);
    let anyStatesPerSource = false;
    const summed = new Array<number>(bucketCount).fill(0);
    for (const member of squadMembers) {
        const stab = (member.buffUptimes ?? []).find(b => Number(b?.id) === STABILITY_BUFF_ID);
        const sps = stab?.statesPerSource;
        if (!sps || typeof sps !== 'object') continue;
        const sourceStates = sps[localName];
        if (!Array.isArray(sourceStates) || sourceStates.length === 0) continue;
        anyStatesPerSource = true;
        const states = sourceStates.map(s => [Number(s[0]), Number(s[1])] as [number, number]);
        const perBucket = integrateStatesPerBucket(states, bucketCount, bucketSizeMs);
        for (let b = 0; b < bucketCount; b++) summed[b] += perBucket[b];
    }
    if (anyStatesPerSource) return summed;

    // Fallback: distribute total generation evenly. Less accurate; statesPerSource is preferred.
    let totalGenMs = 0;
    for (const buff of localPlayer.selfBuffs ?? []) {
        if (Number(buff?.id) === STABILITY_BUFF_ID) totalGenMs += Number(buff.buffData?.[0]?.generation || 0);
    }
    for (const buff of localPlayer.groupBuffs ?? []) {
        if (Number(buff?.id) === STABILITY_BUFF_ID) totalGenMs += Number(buff.buffData?.[0]?.generation || 0);
    }
    for (const buff of localPlayer.squadBuffs ?? []) {
        if (Number(buff?.id) === STABILITY_BUFF_ID) totalGenMs += Number(buff.buffData?.[0]?.generation || 0);
    }
    if (totalGenMs <= 0 || durationMs <= 0) return summed;
    const uptimeFraction = totalGenMs / durationMs;
    return summed.map(() => uptimeFraction);
}

function resolveCommander(json: EiJson, localPlayer: EiPlayer): EiPlayer {
    if (localPlayer.hasCommanderTag) return localPlayer;
    const tagged = json.players.find(p => p?.hasCommanderTag && !p.notInSquad && !p.isFake);
    return tagged ?? localPlayer;
}

function computeDistancesPerBucket(
    player: EiPlayer,
    cmdPositions: Array<[number, number]>,
    cmdStartMs: number,
    pollingRate: number,
    inchToPixel: number,
    fallbackDist: number,
    bucketCount: number,
    bucketSizeMs: number,
): number[] {
    const playerPositions = player.combatReplayData?.positions ?? [];
    const playerStartMs = Number(player.combatReplayData?.start ?? 0);
    const cmdOffset = Math.floor(cmdStartMs / pollingRate);
    const playerOffset = Math.floor(playerStartMs / pollingRate);

    return Array.from({ length: bucketCount }, (_, b) => {
        if (cmdPositions.length === 0 || playerPositions.length === 0) return fallbackDist;
        const bucketStart = b * bucketSizeMs;
        const bucketEnd = bucketStart + bucketSizeMs;
        let sum = 0;
        let count = 0;
        for (let t = bucketStart; t < bucketEnd; t += pollingRate) {
            const tick = Math.floor(t / pollingRate);
            const cmdIdx = tick - cmdOffset;
            const playerIdx = tick - playerOffset;
            if (cmdIdx < 0 || cmdIdx >= cmdPositions.length) continue;
            if (playerIdx < 0 || playerIdx >= playerPositions.length) continue;
            const [cx, cy] = cmdPositions[cmdIdx];
            const [px, py] = playerPositions[playerIdx];
            const d = Math.hypot(px - cx, py - cy) / inchToPixel;
            if (Number.isFinite(d)) { sum += d; count++; }
        }
        return count > 0 ? sum / count : fallbackDist;
    });
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

    const meta = json.combatReplayMetaData ?? {};
    const inchToPixel = Number(meta.inchToPixel || 0) > 0 ? Number(meta.inchToPixel) : 1;
    const pollingRate = Number(meta.pollingRate || 0) > 0 ? Number(meta.pollingRate) : 500;
    const commander = resolveCommander(json, localPlayer);
    const cmdPositions = (commander.combatReplayData?.positions ?? []) as Array<[number, number]>;
    const cmdStartMs = Number(commander.combatReplayData?.start ?? 0);

    const partyMembers: StabPerfPartyMember[] = partyPlayers.map(p => {
        const stabBuff = getStabilityBuff(p);
        const states = (stabBuff?.states ?? []).map(s => [Number(s[0]), Number(s[1])] as [number, number]);
        return {
            key: p.account,
            displayName: p.account.split('.')[0],
            profession: p.profession,
            stacks: integrateStatesPerBucket(states, bucketCount, effectiveBucketMs),
            deaths: computeDeathsPerBucket(p, bucketCount, effectiveBucketMs),
            distances: computeDistancesPerBucket(
                p,
                cmdPositions,
                cmdStartMs,
                pollingRate,
                inchToPixel,
                Number(p.statsAll?.[0]?.distToCom ?? 0),
                bucketCount,
                effectiveBucketMs,
            ),
        };
    });

    return {
        bucketSizeMs: effectiveBucketMs,
        bucketCount,
        buckets,
        selfGeneration: computeSelfGenerationPerBucket(json, localPlayer, bucketCount, effectiveBucketMs, durationMs),
        partyIncomingDamage: computePartyIncomingDamage(partyPlayers, bucketCount, effectiveBucketMs),
        partyMembers,
    };
}
