// src/shared/extractPlayerData.ts
import type { EiJson, EiPlayer, PlayerFightData, TimelineData, TimelineBucket, SquadContext, MovementData, SquadMemberMovement, BuffStateEntry, FightComposition } from './types';
import { getDamage, getDps, getBreakbarDamage, getCleanses, getCleanseSelf, getStrips, getDamageTaken, getDeaths, getDowns, getDodges, getDownContribution, getIncomingCC, getIncomingStrips, getBlocked, getEvaded, getMissed, getInvulned, getInterrupted } from './dashboardMetrics';
import { getHealingOutput, getBarrierOutput, getStabilityGeneration, getTopSkillDamage, getTopHealingSkills, getTopBarrierSkills, getTopDamageTakenSkills, getSquadRank, getDeathTimes, getDownTimes } from './combatMetrics';
import { classifySquadRoles } from './classifyRole';
import { extractBoonUptimes, extractBoonGeneration } from './boonData';
import { extractDamageTimeline, extractDistanceToTagTimeline } from './timelineData';
import { OFFENSIVE_BOON_IDS, DEFENSIVE_BOON_IDS, HARD_CC_IDS, SOFT_CC_IDS, ALL_TRACKED_BUFF_IDS } from './boonData';
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

function computeDistanceToTagStats(
    timeline: TimelineData,
    player: EiPlayer,
): { average: number; median: number } | null {
    if (player.hasCommanderTag) return null;
    const buckets = timeline.distanceToTag;
    if (buckets.length === 0) return null;

    // Exclude dead periods and the subsequent runback. After respawn, keep
    // excluding until the distance-to-tag returns to within 50% of the
    // pre-death value (floor 400 units), so the runback leg doesn't inflate
    // the average. dead[] entries are [startMs, endMs] pairs.
    const deadRanges = player.combatReplayData?.dead ?? [];
    let effective = buckets;
    if (deadRanges.length > 0) {
        const excluded = new Set<number>();
        for (const [s, e] of deadRanges) {
            const preDeathBucket = buckets.filter(b => b.time < s).at(-1);
            const refDist = preDeathBucket?.value ?? 0;
            const returnThreshold = Math.max(refDist * 1.5, 400);
            let inExcluded = false;
            for (let i = 0; i < buckets.length; i++) {
                const b = buckets[i];
                if (b.time >= s && b.time <= e) {
                    excluded.add(i);
                    inExcluded = true;
                } else if (inExcluded && b.time > e) {
                    if (b.value <= returnThreshold) {
                        inExcluded = false;
                    } else {
                        excluded.add(i);
                    }
                }
            }
        }
        const filtered = buckets.filter((_, i) => !excluded.has(i));
        effective = filtered.length > 0 ? filtered : buckets;
    }

    const values = effective.map(b => b.value);
    const sum = values.reduce((a, b) => a + b, 0);
    const average = Math.round(sum / values.length);
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    const median = Math.round(
        sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid],
    );
    return { average, median };
}

function buildSquadContext(squadPlayers: EiPlayer[], player: EiPlayer): SquadContext {
    return {
        squadSize: squadPlayers.length,
        damageRank: getSquadRank(squadPlayers, player, getDamage),
        downContributionRank: getSquadRank(squadPlayers, player, getDownContribution),
        stripsRank: getSquadRank(squadPlayers, player, getStrips),
        cleanseRank: getSquadRank(squadPlayers, player, getCleanses),
        healingRank: getSquadRank(squadPlayers, player, getHealingOutput),
        damageTakenRank: getSquadRank(squadPlayers, player, getDamageTaken),
    };
}

function buildTimeline(json: EiJson, player: EiPlayer, bucketSizeMs: number): TimelineData {
    const damage1S = player.damage1S?.[0] ?? [];
    const damageDealt = extractDamageTimeline(damage1S, bucketSizeMs);

    const damageTaken1S = player.damageTaken1S?.[0] ?? [];
    const damageTaken = extractDamageTimeline(damageTaken1S, bucketSizeMs);

    const healingReceived1S = player.extHealingStats?.healingReceived1S?.[0] ?? [];
    const incomingHealing = extractDamageTimeline(healingReceived1S, bucketSizeMs);

    const barrierReceived1S = player.extBarrierStats?.barrierReceived1S?.[0] ?? [];
    const incomingBarrier = extractDamageTimeline(barrierReceived1S, bucketSizeMs);

    let distanceToTag: TimelineBucket[] = [];
    const commander = findCommander(json.players);
    const meta = json.combatReplayMetaData;
    if (commander && player !== commander && meta?.pollingRate && meta?.inchToPixel) {
        const playerPos = player.combatReplayData?.positions ?? [];
        const tagPos = commander.combatReplayData?.positions ?? [];
        if (playerPos.length > 0 && tagPos.length > 0) {
            distanceToTag = extractDistanceToTagTimeline(
                playerPos, tagPos, meta.pollingRate, meta.inchToPixel, bucketSizeMs,
            );
        }
    }

    const healthPercent: [number, number][] = player.healthPercents ?? [];

    const offensiveBoons: Record<number, BuffStateEntry> = {};
    const defensiveBoons: Record<number, BuffStateEntry> = {};
    const hardCC: Record<number, BuffStateEntry> = {};
    const softCC: Record<number, BuffStateEntry> = {};

    for (const buff of player.buffUptimes ?? []) {
        if (!buff.states || !ALL_TRACKED_BUFF_IDS.has(buff.id)) continue;
        const buffMeta = json.buffMap?.[`b${buff.id}`];
        const entry: BuffStateEntry = {
            name: buffMeta?.name ?? `Buff ${buff.id}`,
            icon: buffMeta?.icon ?? '',
            states: buff.states,
        };
        if (OFFENSIVE_BOON_IDS.has(buff.id)) offensiveBoons[buff.id] = entry;
        else if (DEFENSIVE_BOON_IDS.has(buff.id)) defensiveBoons[buff.id] = entry;
        else if (HARD_CC_IDS.has(buff.id)) hardCC[buff.id] = entry;
        else if (SOFT_CC_IDS.has(buff.id)) softCC[buff.id] = entry;
    }

    return {
        bucketSizeMs,
        damageDealt,
        damageTaken,
        distanceToTag,
        incomingHealing,
        incomingBarrier,
        healthPercent,
        offensiveBoons,
        defensiveBoons,
        hardCC,
        softCC,
        deathEvents: getDeathTimes(player),
        downEvents: getDownTimes(player),
    };
}

function buildMovementData(json: EiJson, localPlayer: EiPlayer): MovementData | null {
    const pollingRate = json.combatReplayMetaData?.pollingRate ?? 300;

    // Build skill icon map first so we can filter casts to only renderable, user-pressable skills
    const skillIcons: Record<number, { name: string; icon: string }> = {};
    for (const [key, val] of Object.entries(json.skillMap ?? {})) {
        const id = Number(key.replace('s', ''));
        if (val.icon && !val.autoAttack) {
            skillIcons[id] = { name: val.name, icon: val.icon };
        }
    }

    const members: SquadMemberMovement[] = [];

    const allyNames = new Set<string>();
    for (const p of json.players) {
        if (p.isFake || !p.combatReplayData?.positions?.length) continue;
        // Everyone in json.players is an ally (squad or non-squad friendly).
        // Enemies only come from json.targets with enemyPlayer=true.
        allyNames.add(p.name);
        let boonStates: Record<number, [number, number][]> | undefined;
        if (p.buffUptimes) {
            boonStates = {};
            for (const buff of p.buffUptimes) {
                if (!ALL_TRACKED_BUFF_IDS.has(buff.id) || !buff.states?.length) continue;
                boonStates[buff.id] = buff.states;
            }
        }
        let skillCasts: { id: number; time: number; duration: number }[] | undefined;
        if (p.rotation?.length) {
            skillCasts = [];
            for (const entry of p.rotation) {
                if (!skillIcons[entry.id]) continue;
                for (const cast of entry.skills) {
                    // Trait procs are instant (duration 0). User-pressed skills, even instant ones,
                    // register an animation duration. Keep negative IDs (dodge, weapon swap).
                    if (entry.id > 0 && cast.duration <= 0) continue;
                    skillCasts.push({ id: entry.id, time: cast.castTime, duration: cast.duration });
                }
            }
            skillCasts.sort((a, b) => a.time - b.time);
        }
        members.push({
            name: p.name,
            account: p.account,
            profession: p.profession,
            eliteSpec: p.elite_spec,
            group: p.group,
            isCommander: p.hasCommanderTag,
            isLocal: p === localPlayer,
            isEnemy: false,
            inSquad: !p.notInSquad,
            positions: p.combatReplayData!.positions!,
            downRanges: p.combatReplayData?.down ?? [],
            deadRanges: p.combatReplayData?.dead ?? [],
            boonStates,
            healthPercents: p.healthPercents,
            skillCasts,
        });
    }

    for (const t of json.targets) {
        if (!t.enemyPlayer || t.isFake || !t.combatReplayData?.positions?.length) continue;
        if (allyNames.has(t.name)) continue;
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
            inSquad: false,
            positions: t.combatReplayData.positions,
            downRanges: t.combatReplayData.down ?? [],
            deadRanges: t.combatReplayData.dead ?? [],
        });
    }

    if (members.length === 0) return null;

    const boonIcons: Record<number, { name: string; icon: string }> = {};
    for (const [key, val] of Object.entries(json.buffMap ?? {})) {
        const id = Number(key.replace('b', ''));
        if (ALL_TRACKED_BUFF_IDS.has(id) && val.icon) {
            boonIcons[id] = { name: val.name, icon: val.icon };
        }
    }

    const inchToPixel = json.combatReplayMetaData?.inchToPixel ?? 1;
    return { pollingRate, durationMs: json.durationMS, inchToPixel, members, boonIcons, skillIcons };
}

function buildFightComposition(json: EiJson): FightComposition {
    const squadPlayers = json.players.filter(p => !p.notInSquad && !p.isFake);
    const allyPlayers  = json.players.filter(p =>  p.notInSquad && !p.isFake);
    const enemies      = json.targets.filter(t => t.enemyPlayer && !t.isFake);

    const allyTeamIds = new Set<number>();
    for (const p of squadPlayers) {
        const id = p.teamID ?? p.teamId;
        if (id != null) allyTeamIds.add(id);
    }

    const classKey = (spec: string | undefined, prof: string) => spec || prof;

    const squadClassCounts: Record<string, number> = {};
    for (const p of squadPlayers) {
        const k = classKey(p.elite_spec, p.profession);
        squadClassCounts[k] = (squadClassCounts[k] ?? 0) + 1;
    }

    const allyClassCounts: Record<string, number> = {};
    for (const p of allyPlayers) {
        const k = classKey(p.elite_spec, p.profession);
        allyClassCounts[k] = (allyClassCounts[k] ?? 0) + 1;
    }

    const teamCountMap = new Map<string, number>();
    const enemyClassCountsByTeam: Record<string, Record<string, number>> = {};
    let filteredEnemyCount = 0;

    for (const t of enemies) {
        const rawId = t.teamID ?? t.teamId;
        if (rawId != null && allyTeamIds.has(rawId)) continue;
        filteredEnemyCount++;
        const teamId = rawId != null ? String(rawId) : 'unknown';
        teamCountMap.set(teamId, (teamCountMap.get(teamId) ?? 0) + 1);
        if (!enemyClassCountsByTeam[teamId]) enemyClassCountsByTeam[teamId] = {};
        const k = t.profession ?? 'Unknown';
        enemyClassCountsByTeam[teamId][k] = (enemyClassCountsByTeam[teamId][k] ?? 0) + 1;
    }

    const teamBreakdown = Array.from(teamCountMap.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([teamId, count]) => ({ teamId, count }));

    return {
        squadCount: squadPlayers.length,
        allyCount: allyPlayers.length,
        enemyCount: filteredEnemyCount,
        teamBreakdown,
        squadClassCounts,
        allyClassCounts,
        enemyClassCountsByTeam,
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

    const squadPlayers = json.players.filter(p => !p.notInSquad && !p.isFake);
    const timeline = buildTimeline(json, player, bucketSizeMs);
    const roleMap = classifySquadRoles(squadPlayers);
    const roleClassification = roleMap.get(player.account) ?? { role: 'damage' as const, supportScore: 0, confidenceScore: 0 };
    const distanceToTagStats = computeDistanceToTagStats(timeline, player);

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
            topSkills: getTopSkillDamage(player, json.skillMap, json.buffMap),
        },
        support: {
            boonStrips: getStrips(player),
            cleanses: getCleanses(player),
            cleanseSelf: getCleanseSelf(player),
            healingOutput: getHealingOutput(player),
            barrierOutput: getBarrierOutput(player),
            stabilityGeneration: getStabilityGeneration(player),
            topHealingSkills: getTopHealingSkills(player, json.skillMap, json.buffMap),
            topBarrierSkills: getTopBarrierSkills(player, json.skillMap, json.buffMap),
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
            topDamageTakenSkills: getTopDamageTakenSkills(player, json.skillMap, json.buffMap),
        },
        boons: {
            uptimes: extractBoonUptimes(player),
            generation: extractBoonGeneration(player),
        },
        timeline,
        squadContext: buildSquadContext(squadPlayers, player),
        movementData: buildMovementData(json, player),
        roleClassification,
        distanceToTag: distanceToTagStats,
        fightComposition: buildFightComposition(json),
    };
}
