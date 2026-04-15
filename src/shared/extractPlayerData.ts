// src/shared/extractPlayerData.ts
import type { EiJson, EiPlayer, PlayerFightData, TimelineData, SquadContext, MovementData, SquadMemberMovement } from './types';
import { getDamage, getDps, getBreakbarDamage, getCleanses, getCleanseSelf, getStrips, getDamageTaken, getDeaths, getDowns, getDodges, getDownContribution, getIncomingCC, getIncomingStrips, getBlocked, getEvaded, getMissed, getInvulned, getInterrupted } from './dashboardMetrics';
import { getHealingOutput, getBarrierOutput, getStabilityGeneration, getTopSkillDamage, getSquadRank, getDeathTimes, getDownTimes } from './combatMetrics';
import { extractBoonUptimes, extractBoonGeneration } from './boonData';
import { extractDamageTimeline, extractDistanceToTagTimeline, extractBoonStatesTimeline } from './timelineData';
import { WVW_BOON_IDS } from './boonData';
import { resolveMapFromZone, normalizeMapName, formatDuration } from './mapUtils';
import { findNearestLandmark } from './wvwLandmarks';

function findLocalPlayer(json: EiJson): EiPlayer {
    if (json.recordedAccountBy) {
        const byAccount = json.players.find(p => p.account === json.recordedAccountBy);
        if (byAccount) return byAccount;
    }
    if (json.recordedBy) {
        const byName = json.players.find(p => p.name === json.recordedBy);
        if (byName) return byName;
    }
    const candidate = json.players.find(p => !p.isFake && !p.notInSquad);
    return candidate ?? json.players[0];
}

function findCommander(players: EiPlayer[]): EiPlayer | null {
    const commanders = players.filter(p => p.hasCommanderTag);
    if (commanders.length === 0) return null;
    commanders.sort((a, b) => (b.activeTimes[0] ?? 0) - (a.activeTimes[0] ?? 0));
    return commanders[0];
}

function computeFightPosition(player: EiPlayer): [number, number] | null {
    const positions = player.combatReplayData?.positions;
    if (!positions || positions.length === 0) return null;
    const xs = positions.map(p => p[0]).sort((a, b) => a - b);
    const ys = positions.map(p => p[1]).sort((a, b) => a - b);
    const mid = Math.floor(positions.length / 2);
    return [xs[mid], ys[mid]];
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

    const healingReceived1S = player.extHealingStats?.healingReceived1S?.[0] ?? [];
    const incomingHealing = extractDamageTimeline(healingReceived1S, bucketSizeMs);

    const barrierReceived1S = player.extBarrierStats?.barrierReceived1S?.[0] ?? [];
    const incomingBarrier = extractDamageTimeline(barrierReceived1S, bucketSizeMs);

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

    const boonUptimeTimeline: Record<string, { time: number; value: number }[]> = {};
    for (const buff of player.buffUptimes ?? []) {
        if (!WVW_BOON_IDS.has(buff.id) || !buff.states) continue;
        boonUptimeTimeline[String(buff.id)] = extractBoonStatesTimeline(buff.states, json.durationMS, bucketSizeMs);
    }

    return {
        bucketSizeMs,
        damageDealt,
        damageTaken,
        distanceToTag,
        incomingHealing,
        incomingBarrier,
        boonUptimeTimeline,
        boonGenerationTimeline: {},
        ccDealt: [],
        ccReceived: [],
        deathEvents: getDeathTimes(player),
        downEvents: getDownTimes(player),
    };
}

function buildMovementData(json: EiJson, localPlayer: EiPlayer): MovementData | null {
    const pollingRate = json.combatReplayMetaData?.pollingRate ?? 300;

    const members: SquadMemberMovement[] = [];

    const enemyNames = new Set<string>();
    for (const p of json.players) {
        if (p.isFake || !p.combatReplayData?.positions?.length) continue;
        const isEnemy = p.notInSquad;
        if (isEnemy) enemyNames.add(p.name);
        let boonStates: Record<number, [number, number][]> | undefined;
        if (!isEnemy && p.buffUptimes) {
            boonStates = {};
            for (const buff of p.buffUptimes) {
                if (!WVW_BOON_IDS.has(buff.id) || !buff.states?.length) continue;
                boonStates[buff.id] = buff.states;
            }
        }
        members.push({
            name: p.name,
            account: p.account,
            profession: p.profession,
            eliteSpec: p.elite_spec,
            group: p.group,
            isCommander: !isEnemy && p.hasCommanderTag,
            isLocal: p === localPlayer,
            isEnemy,
            positions: p.combatReplayData!.positions!,
            downRanges: p.combatReplayData?.down ?? [],
            deadRanges: p.combatReplayData?.dead ?? [],
            boonStates,
            healthPercents: !isEnemy ? p.healthPercents : undefined,
        });
    }

    for (const t of json.targets) {
        if (!t.enemyPlayer || t.isFake || !t.combatReplayData?.positions?.length) continue;
        if (enemyNames.has(t.name)) continue;
        const specMatch = t.name.match(/^(.+?) pl-\d+$/);
        const specName = specMatch?.[1] ?? '';
        members.push({
            name: t.name,
            account: '',
            profession: t.profession ?? specName,
            eliteSpec: specName,
            group: 0,
            isCommander: false,
            isLocal: false,
            isEnemy: true,
            positions: t.combatReplayData.positions,
            downRanges: t.combatReplayData.down ?? [],
            deadRanges: t.combatReplayData.dead ?? [],
        });
    }

    if (members.length === 0) return null;

    const boonIcons: Record<number, { name: string; icon: string }> = {};
    for (const [key, val] of Object.entries(json.buffMap ?? {})) {
        const id = Number(key.replace('b', ''));
        if (WVW_BOON_IDS.has(id) && val.icon) {
            boonIcons[id] = { name: val.name, icon: val.icon };
        }
    }

    const inchToPixel = json.combatReplayMetaData?.inchToPixel ?? 1;
    return { pollingRate, durationMs: json.durationMS, inchToPixel, members, boonIcons };
}

export function extractPlayerFightData(json: EiJson, fightNumber: number, bucketSizeMs: number): PlayerFightData {
    const player = findLocalPlayer(json);
    const zone = json.fightName ?? json.zone ?? json.mapName ?? json.map ?? '';
    const map = resolveMapFromZone(zone);
    const mapName = normalizeMapName(zone);

    const meta = json.combatReplayMetaData;
    const mapImageUrl = meta?.maps?.[0]?.url ?? null;
    const mapSize = meta?.sizes ?? null;
    const avgPos = computeFightPosition(player);

    let nearestLandmark: string | null = null;
    if (map && avgPos) {
        const landmark = findNearestLandmark(map, avgPos[0], avgPos[1]);
        nearestLandmark = landmark?.name ?? null;
    }

    const pollingRate = meta?.pollingRate ?? 300;
    const positions = player.combatReplayData?.positions ?? [];
    const downPositions = (player.combatReplayData?.down ?? []).map(([t]) => {
        const idx = Math.min(Math.floor(t / pollingRate), positions.length - 1);
        return positions[idx] ?? null;
    }).filter((p): p is [number, number] => p !== null);
    const deathPositions = (player.combatReplayData?.dead ?? []).map(([t]) => {
        const idx = Math.min(Math.floor(t / pollingRate), positions.length - 1);
        return positions[idx] ?? null;
    }).filter((p): p is [number, number] => p !== null);

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
        downPositions,
        deathPositions,
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
        movementData: buildMovementData(json, player),
    };
}
