// src/shared/extractPlayerData.ts
import type { EiJson, EiPlayer, PlayerFightData, TimelineData, SquadContext } from './types';
import { getDamage, getDps, getBreakbarDamage, getCleanses, getCleanseSelf, getStrips, getDamageTaken, getDeaths, getDowns, getDodges, getDownContribution, getIncomingCC, getIncomingStrips, getBlocked, getEvaded, getMissed, getInvulned, getInterrupted } from './dashboardMetrics';
import { getHealingOutput, getBarrierOutput, getStabilityGeneration, getTopSkillDamage, getSquadRank, getDeathTimes, getDownTimes } from './combatMetrics';
import { extractBoonUptimes, extractBoonGeneration } from './boonData';
import { extractDamageTimeline, extractDistanceToTagTimeline } from './timelineData';
import { resolveMapFromZone, normalizeMapName, formatDuration } from './mapUtils';
import { findNearestLandmark } from './wvwLandmarks';

function findLocalPlayer(json: EiJson): EiPlayer {
    const candidate = json.players.find(p => !p.isFake && !p.notInSquad);
    return candidate ?? json.players[0];
}

function findCommander(players: EiPlayer[]): EiPlayer | null {
    const commanders = players.filter(p => p.hasCommanderTag);
    if (commanders.length === 0) return null;
    commanders.sort((a, b) => (b.activeTimes[0] ?? 0) - (a.activeTimes[0] ?? 0));
    return commanders[0];
}

function computeAveragePosition(players: EiPlayer[]): [number, number] | null {
    let totalX = 0, totalY = 0, count = 0;
    for (const p of players) {
        const positions = p.combatReplayData?.positions;
        if (!positions || positions.length === 0) continue;
        const midIdx = Math.floor(positions.length / 2);
        totalX += positions[midIdx][0];
        totalY += positions[midIdx][1];
        count++;
    }
    if (count === 0) return null;
    return [totalX / count, totalY / count];
}

function buildSquadContext(json: EiJson, player: EiPlayer): SquadContext {
    const squadPlayers = json.players.filter(p => !p.notInSquad && !p.isFake);
    return {
        squadSize: squadPlayers.length,
        damageRank: getSquadRank(squadPlayers, player, getDamage),
        stripsRank: getSquadRank(squadPlayers, player, getStrips),
        healingRank: getSquadRank(squadPlayers, player, getHealingOutput),
        cleanseRank: getSquadRank(squadPlayers, player, getCleanses),
    };
}

function buildTimeline(json: EiJson, player: EiPlayer, bucketSizeMs: number): TimelineData {
    const damage1S = player.targetDamage1S?.[0] ?? player.damage1S?.[0] ?? [];
    const damageDealt = extractDamageTimeline(damage1S, bucketSizeMs);

    const damageTaken1S = player.damageTaken1S?.[0] ?? [];
    const damageTaken = extractDamageTimeline(damageTaken1S, bucketSizeMs);

    let distanceToTag: { time: number; value: number }[] = [];
    const commander = findCommander(json.players);
    const meta = json.combatReplayMetaData;
    if (commander && player !== commander && meta?.pollingRate && meta?.inchToPixel) {
        const playerPos = player.combatReplayData?.positions ?? [];
        const tagPos = commander.combatReplayData?.positions ?? [];
        if (playerPos.length > 0 && tagPos.length > 0) {
            distanceToTag = extractDistanceToTagTimeline(playerPos, tagPos, meta.pollingRate, meta.inchToPixel, bucketSizeMs);
        }
    }

    return {
        bucketSizeMs,
        damageDealt,
        damageTaken,
        distanceToTag,
        incomingHealing: [],
        incomingBarrier: [],
        boonUptimeTimeline: {},
        boonGenerationTimeline: {},
        ccDealt: [],
        ccReceived: [],
        deathEvents: getDeathTimes(player),
        downEvents: getDownTimes(player),
    };
}

export function extractPlayerFightData(json: EiJson, fightNumber: number, bucketSizeMs: number): PlayerFightData {
    const player = findLocalPlayer(json);
    const zone = json.fightName ?? json.zone ?? json.mapName ?? json.map ?? '';
    const map = resolveMapFromZone(zone);
    const mapName = normalizeMapName(zone);

    const meta = json.combatReplayMetaData;
    const mapImageUrl = meta?.maps?.[0]?.url ?? null;
    const mapSize = meta?.sizes ?? null;
    const avgPos = computeAveragePosition(json.players.filter(p => !p.notInSquad));

    let nearestLandmark: string | null = null;
    if (map && avgPos) {
        const landmark = findNearestLandmark(map, avgPos[0], avgPos[1]);
        nearestLandmark = landmark?.name ?? null;
    }

    const durationFormatted = formatDuration(json.durationMS);
    const landmarkPart = nearestLandmark ? ` — ${nearestLandmark}` : '';
    const fightLabel = `F${fightNumber} — ${mapName}${landmarkPart} — ${durationFormatted}`;

    return {
        fightLabel,
        fightNumber,
        mapName,
        nearestLandmark,
        mapImageUrl,
        mapSize,
        avgPosition: avgPos,
        duration: json.durationMS,
        durationFormatted,
        timestamp: json.timeStartStd ?? json.uploadTime ?? new Date().toISOString(),
        playerName: player.name,
        accountName: player.account,
        profession: player.profession,
        eliteSpec: player.elite_spec,
        isCommander: player.hasCommanderTag,

        damage: {
            totalDamage: getDamage(player),
            dps: getDps(player),
            breakbarDamage: getBreakbarDamage(player),
            downContribution: getDownContribution(player),
            topSkills: getTopSkillDamage(player, json.skillMap),
        },
        support: {
            boonStrips: getStrips(player),
            cleanses: getCleanses(player),
            cleanseSelf: getCleanseSelf(player),
            healingOutput: getHealingOutput(player),
            barrierOutput: getBarrierOutput(player),
            stabilityGeneration: getStabilityGeneration(player),
        },
        defense: {
            damageTaken: getDamageTaken(player),
            deaths: getDeaths(player),
            downs: getDowns(player),
            deathTimes: getDeathTimes(player),
            downTimes: getDownTimes(player),
            dodges: getDodges(player),
            blocked: getBlocked(player),
            evaded: getEvaded(player),
            missed: getMissed(player),
            invulned: getInvulned(player),
            interrupted: getInterrupted(player),
            incomingCC: getIncomingCC(player),
            incomingStrips: getIncomingStrips(player),
        },
        boons: {
            uptimes: extractBoonUptimes(player),
            generation: extractBoonGeneration(player),
        },
        timeline: buildTimeline(json, player, bucketSizeMs),
        squadContext: buildSquadContext(json, player),
    };
}
