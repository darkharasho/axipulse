import type { EiJson, EiPlayer, BoonPerfBreakdown, BoonPerfPartyMember } from './types';
import type { ReportV1 } from './report';
import { requireBlock, squadMembers, commanderId, decodeSeries } from './report';

export const STABILITY_BUFF_ID = 1122;
export const MIGHT_BUFF_ID = 740;

const DEATH_SKILL_ID = -28;

// ---- Shared pure bucket arithmetic -- unchanged by the native migration,
// used by both the legacy EI path and the native path below. ----

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

function cumulativeToDeltas(cum: number[]): number[] {
    return cum.map((v, i) => i === 0 ? 0 : Math.max(0, Number(v || 0) - Number(cum[i - 1] || 0)));
}

// ---- EI-shaped (legacy pipeline) -- kept verbatim under an `Ei` suffix so
// `extractPlayerData.ts` keeps compiling and behaving identically until
// Task 11 recomposes it onto the native extract units. Not part of this
// task's native migration. ----

function getBuffUptime(player: EiPlayer, buffId: number) {
    return (player.buffUptimes ?? []).find(b => Number(b?.id) === buffId);
}

function computeDeathsPerBucketEi(player: EiPlayer, bucketCount: number, bucketSizeMs: number): number[] {
    const out = new Array<number>(bucketCount).fill(0);
    const deathSkill = (player.rotation ?? []).find(r => Number(r?.id) === DEATH_SKILL_ID);
    if (!deathSkill || !Array.isArray(deathSkill.skills)) return out;
    for (const skill of deathSkill.skills) {
        const idx = Math.min(bucketCount - 1, Math.floor(Number(skill?.castTime || 0) / bucketSizeMs));
        if (idx >= 0) out[idx]++;
    }
    return out;
}

function computePartyIncomingDamageEi(
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

function computeSelfGenerationPerBucketEi(
    json: EiJson,
    localPlayer: EiPlayer,
    buffId: number,
    bucketCount: number,
    bucketSizeMs: number,
    durationMs: number,
): number[] {
    const localName = localPlayer.name;
    const squadMembersEi = json.players.filter(p => p && !p.notInSquad && !p.isFake);
    let anyStatesPerSource = false;
    const summed = new Array<number>(bucketCount).fill(0);
    for (const member of squadMembersEi) {
        const buff = getBuffUptime(member, buffId);
        const sps = buff?.statesPerSource;
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
        if (Number(buff?.id) === buffId) totalGenMs += Number(buff.buffData?.[0]?.generation || 0);
    }
    for (const buff of localPlayer.groupBuffs ?? []) {
        if (Number(buff?.id) === buffId) totalGenMs += Number(buff.buffData?.[0]?.generation || 0);
    }
    for (const buff of localPlayer.squadBuffs ?? []) {
        if (Number(buff?.id) === buffId) totalGenMs += Number(buff.buffData?.[0]?.generation || 0);
    }
    if (totalGenMs <= 0 || durationMs <= 0) return summed;
    const uptimeFraction = totalGenMs / durationMs;
    return summed.map(() => uptimeFraction);
}

function resolveCommanderEi(json: EiJson, localPlayer: EiPlayer): EiPlayer {
    if (localPlayer.hasCommanderTag) return localPlayer;
    const tagged = json.players.find(p => p?.hasCommanderTag && !p.notInSquad && !p.isFake);
    return tagged ?? localPlayer;
}

function computeDistancesPerBucketEi(
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

export function computeBoonPerformanceEi(
    json: EiJson,
    localPlayer: EiPlayer,
    bucketSizeMs: number,
    buffId: number,
): BoonPerfBreakdown | null {
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
    const commander = resolveCommanderEi(json, localPlayer);
    const cmdPositions = (commander.combatReplayData?.positions ?? []) as Array<[number, number]>;
    const cmdStartMs = Number(commander.combatReplayData?.start ?? 0);

    const partyMembers: BoonPerfPartyMember[] = partyPlayers.map(p => {
        const buff = getBuffUptime(p, buffId);
        const states = (buff?.states ?? []).map(s => [Number(s[0]), Number(s[1])] as [number, number]);
        return {
            key: p.account,
            displayName: p.account.split('.')[0],
            profession: p.profession,
            stacks: integrateStatesPerBucket(states, bucketCount, effectiveBucketMs),
            deaths: computeDeathsPerBucketEi(p, bucketCount, effectiveBucketMs),
            distances: computeDistancesPerBucketEi(
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
        selfGeneration: computeSelfGenerationPerBucketEi(json, localPlayer, buffId, bucketCount, effectiveBucketMs, durationMs),
        partyIncomingDamage: computePartyIncomingDamageEi(partyPlayers, bucketCount, effectiveBucketMs),
        partyMembers,
    };
}

// ---- Native (axilog ReportV1) ----

function computeDeathsPerBucketNative(
    dead: [number, number][],
    bucketCount: number,
    bucketSizeMs: number,
): number[] {
    const out = new Array<number>(bucketCount).fill(0);
    for (const [start] of dead) {
        const idx = Math.min(bucketCount - 1, Math.floor(start / bucketSizeMs));
        if (idx >= 0) out[idx]++;
    }
    return out;
}

/**
 * Positions in `blocks.replay.tracks` are raw world inches already -- no
 * `inchToPixel` conversion needed here (unlike the EI path, whose combat
 * replay positions were image pixels). Samples for different entities can
 * have different lengths (players join/leave at different times), so this
 * indexes each side independently and skips a tick where either is absent.
 */
function computeDistancesPerBucketNative(
    memberSamples: [number, number, number][],
    cmdSamples: [number, number, number][],
    pollMs: number,
    fallbackDist: number,
    bucketCount: number,
    bucketSizeMs: number,
): number[] {
    return Array.from({ length: bucketCount }, (_, b) => {
        if (cmdSamples.length === 0 || memberSamples.length === 0 || pollMs <= 0) return fallbackDist;
        const bucketStart = b * bucketSizeMs;
        const bucketEnd = bucketStart + bucketSizeMs;
        const startIdx = Math.max(0, Math.floor(bucketStart / pollMs));
        const endIdx = Math.ceil(bucketEnd / pollMs);
        let sum = 0;
        let count = 0;
        for (let i = startIdx; i < endIdx; i++) {
            const cmd = cmdSamples[i];
            const mem = memberSamples[i];
            if (!cmd || !mem) continue;
            const d = Math.hypot(mem[1] - cmd[1], mem[2] - cmd[2]);
            if (Number.isFinite(d)) { sum += d; count++; }
        }
        return count > 0 ? sum / count : fallbackDist;
    });
}

/**
 * Sums, across every squad member, the portion of `buffId`'s stack timeline
 * that `localId` applied -- the rekeyed equivalent of EI's
 * `statesPerSource[localName]`. Native's `per_source.by_source` is keyed by
 * the APPLYING entity's id, so no name join (and no name-collision hazard)
 * is needed.
 */
function computeSelfGenerationPerBucketNative(
    r: ReportV1,
    localId: number,
    buffId: number,
    bucketCount: number,
    bucketSizeMs: number,
): number[] {
    const boons = requireBlock(r, 'boons');
    const summed = new Array<number>(bucketCount).fill(0);
    let anyPerSource = false;
    for (const member of squadMembers(r)) {
        const row = boons.by_entity[String(member.id)]?.[String(buffId)];
        const sourceStates = row?.per_source?.by_source?.[String(localId)];
        if (!sourceStates || sourceStates.length === 0) continue;
        anyPerSource = true;
        const perBucket = integrateStatesPerBucket(sourceStates as Array<[number, number]>, bucketCount, bucketSizeMs);
        for (let b = 0; b < bucketCount; b++) summed[b] += perBucket[b];
    }
    if (anyPerSource) return summed;

    // Fallback: distribute the local entity's own attributed generation
    // evenly across buckets. Unlike the EI fallback, no ms->fraction
    // conversion is needed -- `generation.*_pct` for the intensity boons
    // this function is ever called with (Stability, Might) is already on
    // the avg-concurrent-stack scale `selfGeneration` returns.
    const localRow = boons.by_entity[String(localId)]?.[String(buffId)];
    const fallback = (localRow?.generation.self_pct ?? 0)
        + (localRow?.generation.group_pct ?? 0)
        + (localRow?.generation.squad_pct ?? 0);
    if (fallback <= 0) return summed;
    return summed.map(() => fallback);
}

function computePartyIncomingDamageNative(
    r: ReportV1,
    partyIds: number[],
    bucketCount: number,
    bucketSizeMs: number,
): number[] {
    const out = new Array<number>(bucketCount).fill(0);
    const series = requireBlock(r, 'series');
    for (const pid of partyIds) {
        const entitySeries = series.by_entity[String(pid)];
        if (!entitySeries) continue;
        // `damage_taken` is a CUMULATIVE running total (established in Task 2)
        // -- difference it before bucketing, same as the EI path differenced
        // `damageTaken1S`.
        const cum = decodeSeries(entitySeries.damage_taken);
        const deltas = cumulativeToDeltas(cum);
        const intervalMs = entitySeries.damage_taken.interval_ms;
        if (deltas.length === 0 || intervalMs <= 0) continue;
        const bucketSizeIntervals = Math.max(1, Math.round(bucketSizeMs / intervalMs));
        for (let s = 0; s < deltas.length; s++) {
            const bucketIdx = Math.min(bucketCount - 1, Math.floor(s / bucketSizeIntervals));
            out[bucketIdx] += deltas[s];
        }
    }
    return out;
}

/**
 * Boon-performance breakdown for one entity, native format.
 *
 * Rekeying: EI's `statesPerSource` is keyed by character NAME; native's
 * `per_source` is keyed by entity id. `BoonPerfPartyMember.key` is built
 * from the entity id (`String(e.id)`), not an account string -- two players
 * sharing a character name collided under EI and cannot under native, which
 * is a fix, not a regression.
 */
export function computeBoonPerformance(
    r: ReportV1,
    id: number,
    bucketSizeMs: number,
    buffId: number,
): BoonPerfBreakdown | null {
    const durationMs = r.encounter.duration_ms;
    if (!durationMs || durationMs <= 0) return null;

    const effectiveBucketMs = Math.max(1000, Math.round(bucketSizeMs / 1000) * 1000);
    const bucketCount = Math.max(1, Math.ceil(durationMs / effectiveBucketMs));
    const buckets = Array.from({ length: bucketCount }, (_, i) => ({
        startMs: i * effectiveBucketMs,
        label: `${Math.round((i * effectiveBucketMs) / 1000)}s`,
    }));

    const local = r.entities.find(e => e.id === id);
    const localSubgroup = local?.subgroup ?? 0;
    const partyEntities = localSubgroup > 0
        ? squadMembers(r).filter(e => e.subgroup === localSubgroup && e.id !== id)
        : [];

    const boons = requireBlock(r, 'boons');
    const replay = requireBlock(r, 'replay');
    const tracks = replay.tracks;

    const cmdId = commanderId(r) ?? id;
    const cmdSamples = tracks?.by_entity[String(cmdId)]?.samples ?? [];
    const pollMs = tracks?.poll_ms ?? 0;

    const partyMembers: BoonPerfPartyMember[] = partyEntities.map(e => {
        const row = boons.by_entity[String(e.id)]?.[String(buffId)];
        const states = (row?.states ?? []) as Array<[number, number]>;
        const dead = replay.by_entity[String(e.id)]?.dead ?? [];
        const memberSamples = tracks?.by_entity[String(e.id)]?.samples ?? [];
        const rawFallbackDist = replay.by_entity[String(e.id)]?.dist_to_com;
        const fallbackDist = rawFallbackDist !== undefined && rawFallbackDist >= 0 ? rawFallbackDist : 0;
        return {
            key: String(e.id),
            displayName: (e.account ?? e.name ?? '').split('.')[0],
            profession: e.profession ?? '',
            stacks: integrateStatesPerBucket(states, bucketCount, effectiveBucketMs),
            deaths: computeDeathsPerBucketNative(dead, bucketCount, effectiveBucketMs),
            distances: computeDistancesPerBucketNative(
                memberSamples,
                cmdSamples,
                pollMs,
                fallbackDist,
                bucketCount,
                effectiveBucketMs,
            ),
        };
    });

    return {
        bucketSizeMs: effectiveBucketMs,
        bucketCount,
        buckets,
        selfGeneration: computeSelfGenerationPerBucketNative(r, id, buffId, bucketCount, effectiveBucketMs),
        partyIncomingDamage: computePartyIncomingDamageNative(r, partyEntities.map(e => e.id), bucketCount, effectiveBucketMs),
        partyMembers,
    };
}
