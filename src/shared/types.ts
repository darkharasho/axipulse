// src/shared/types.ts
import type { RoleClassification } from './classifyRole';

// --- Movement replay data ---

export interface SkillCast {
    id: number;
    time: number;
    duration: number;
}

export interface SquadMemberMovement {
    name: string;
    account: string;
    profession: string;
    eliteSpec: string;
    group: number;
    isCommander: boolean;
    isLocal: boolean;
    isEnemy: boolean;
    inSquad: boolean;
    positions: [number, number][];
    /**
     * The absolute fight time, in ms, of `positions[0]`.
     *
     * Position tracks do NOT all start at the same tick: this app's native
     * fixture has 93 tracks starting at ten different instants (one at 0, 82
     * at 300, ten between 30000 and 100800, at `pollingRate` 300), because a
     * player who joins the fight late has no earlier position to report.
     * Index `i` therefore means `positionsStartMs + i * pollingRate`, and is
     * a DIFFERENT instant for different members -- so a consumer comparing
     * two members' positions must convert through time, never index directly.
     *
     * GW2EI's own `combatReplayData.start` carried exactly this and the EI
     * movement producer silently dropped it, which is why the map view drew
     * late-joining enemies up to 100 seconds ahead of themselves.
     */
    positionsStartMs: number;
    downRanges: [number, number][];
    deadRanges: [number, number][];
    boonStates?: Record<number, [number, number][]>;
    healthPercents?: [number, number][];
    skillCasts?: SkillCast[];
}

export interface MovementData {
    pollingRate: number;
    durationMs: number;
    inchToPixel: number;
    members: SquadMemberMovement[];
    boonIcons?: Record<number, { name: string; icon: string }>;
    skillIcons?: Record<number, { name: string; icon: string }>;
}

// --- Extracted player-focused data ---

export interface PlayerFightData {
    fightLabel: string;
    fightNumber: number;
    mapName: string;
    /**
     * `encounter.map_id` -- the GW2 map id, the join key into this app's
     * landmark and tile assets (`resolveMapFromMapId`). Carried alongside
     * `mapName` rather than instead of it: the name is for people, the id
     * is for lookups. `null` when the log carries no MAP_ID event.
     *
     * Added by Task 11 so the renderer can stop fuzzy-matching the
     * localised display string.
     */
    mapId: number | null;
    nearestLandmark: string | null;
    mapImageUrl: string | null;
    mapSize: [number, number] | null;
    avgPosition: [number, number] | null;
    downPositions: [number, number][];
    deathPositions: [number, number][];
    duration: number;
    durationFormatted: string;
    /**
     * Wall-clock fight start, ISO 8601 -- or `null` when the log carries no
     * `CBTS_LOGSTART` event. The native format documents that absence as
     * deliberately distinguishable from epoch zero, so it is NOT defaulted:
     * the EI path's `?? new Date().toISOString()` silently stamped old logs
     * with the time they were parsed. Renderers must handle `null`.
     */
    timestamp: string | null;
    playerName: string;
    accountName: string;
    profession: string;
    eliteSpec: string;
    isCommander: boolean;

    damage: DamageStats;
    support: SupportStats;
    defense: DefenseStats;
    boons: BoonStats;
    timeline: TimelineData;
    squadContext: SquadContext;
    movementData: MovementData | null;
    roleClassification: RoleClassification;
    distanceToTag: { average: number; median: number } | null;
    fightComposition: FightComposition;
}

export interface DamageStats {
    totalDamage: number;
    dps: number;
    breakbarDamage: number;
    downContribution: number;
    topSkills: SkillDamage[];
}

export interface SkillDamage {
    id: number;
    name: string;
    damage: number;
    downContribution: number;
    downedHealing: number;
    hits: number;
    icon?: string;
}

export interface SupportStats {
    boonStrips: number;
    cleanses: number;
    cleanseSelf: number;
    healingOutput: number;
    barrierOutput: number;
    stabilityGeneration: number;
    topHealingSkills: SkillDamage[];
    topBarrierSkills: SkillDamage[];
}

export interface DefenseStats {
    damageTaken: number;
    deaths: number;
    downs: number;
    deathTimes: number[];
    downTimes: number[];
    dodges: number;
    blocked: number;
    evaded: number;
    missed: number;
    invulned: number;
    interrupted: number;
    incomingCC: number;
    incomingStrips: number;
    topDamageTakenSkills: SkillDamage[];
}

export interface BoonUptimeEntry {
    id: number;
    name: string;
    // For duration-stacking boons: percentage 0-100. For intensity-stacking (Might, Stability): average stacks 0-25.
    uptime: number;
    stacking: 'duration' | 'intensity';
}

export interface BoonGenerationEntry {
    id: number;
    name: string;
    selfGeneration: number;
    groupGeneration: number;
    squadGeneration: number;
}

export interface BoonPerfPartyMember {
    /** Account name, e.g. "Player.1234" */
    key: string;
    /** Name shown in the UI; account.split('.')[0] */
    displayName: string;
    profession: string;
    /** Avg boon stacks during each bucket (0–25 for might/stability). */
    stacks: number[];
    /** Death count per bucket (typically 0 or 1). */
    deaths: number[];
    /** Average inches to commander per bucket. */
    distances: number[];
}

export interface BoonPerfBreakdown {
    bucketSizeMs: number;
    bucketCount: number;
    buckets: { startMs: number; label: string }[];
    /** Local player's avg boon stacks generated per bucket, summed across the party (can exceed 25). */
    selfGeneration: number[];
    /** Sum of party members' incoming damage per bucket. */
    partyIncomingDamage: number[];
    /** Group-mates of the local player; excludes the local player themselves. */
    partyMembers: BoonPerfPartyMember[];
}

export interface BoonPerformanceData {
    stability: BoonPerfBreakdown | null;
    might: BoonPerfBreakdown | null;
}

export interface BoonStats {
    uptimes: BoonUptimeEntry[];
    generation: BoonGenerationEntry[];
    boonPerformance: BoonPerformanceData | null;
}

export interface TimelineBucket {
    time: number;
    value: number;
}

export interface BuffStateEntry {
    name: string;
    icon: string;
    states: [number, number][];
}

export interface TimelineData {
    bucketSizeMs: number;
    damageDealt: TimelineBucket[];
    damageTaken: TimelineBucket[];
    distanceToTag: TimelineBucket[];
    incomingHealing: TimelineBucket[];
    incomingBarrier: TimelineBucket[];
    healthPercent: [number, number][];
    offensiveBoons: Record<number, BuffStateEntry>;
    defensiveBoons: Record<number, BuffStateEntry>;
    hardCC: Record<number, BuffStateEntry>;
    softCC: Record<number, BuffStateEntry>;
    deathEvents: number[];
    downEvents: number[];
}

export interface SquadContext {
    squadSize: number;
    damageRank: number;
    downContributionRank: number;
    stripsRank: number;
    cleanseRank: number;
    healingRank: number;
    damageTakenRank: number;
}

export interface FightComposition {
    squadCount: number;
    allyCount: number;
    enemyCount: number;
    /** Top 3 enemy teams sorted by count descending */
    teamBreakdown: { teamId: string; count: number }[];
    /** elite_spec or profession → count */
    squadClassCounts: Record<string, number>;
    allyClassCounts: Record<string, number>;
    /** teamId → (elite_spec or profession → count) */
    enemyClassCountsByTeam: Record<string, Record<string, number>>;
}

export interface FightHistoryEntry {
    fightNumber: number;
    fightLabel: string;
    /** See `PlayerFightData.timestamp` -- `null` when the log has no start event. */
    timestamp: string | null;
    profession: string;
    eliteSpec: string;
    duration: number;
    durationFormatted: string;
    quickStats: {
        damage: number;
        deaths: number;
        strips: number;
        dps: number;
    };
    data: PlayerFightData;
}
