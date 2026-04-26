// src/shared/types.ts
import type { RoleClassification } from './classifyRole';

// --- Raw EI JSON types (subset we use) ---

export interface EiPlayer {
    name: string;
    account: string;
    profession: string;
    elite_spec: string;
    group: number;
    hasCommanderTag: boolean;
    notInSquad: boolean;
    isFake: boolean;
    teamID?: number;
    teamId?: number;
    activeTimes: number[];
    dpsAll: { damage: number; dps: number; breakbarDamage: number }[];
    statsAll: { downContribution: number; distToCom: number; stackDist: number; appliedCrowdControl: number; appliedCrowdControlDuration: number }[];
    defenses: {
        damageTaken: number; deadCount: number; downCount: number;
        dodgeCount: number; blockedCount: number; evadedCount: number;
        missedCount: number; invulnedCount: number; interruptedCount: number;
        receivedCrowdControl: number; receivedCrowdControlDuration: number;
        boonStrips: number; boonStripsTime: number;
    }[];
    support: { condiCleanse: number; condiCleanseSelf: number; boonStrips: number; boonStripsTime: number }[];
    damage1S: number[][];
    targetDamage1S?: number[][];
    damageTaken1S?: number[][];
    totalDamageDist: { id: number; name: string; totalDamage: number; connectedHits: number; min: number; max: number; downContribution?: number }[][];
    totalDamageTaken: { id: number; totalDamage: number; connectedHits: number; indirectDamage: boolean }[][];
    buffUptimes?: { id: number; buffData: { uptime: number; generation: number; overstack: number; wasted: number }[]; states?: [number, number][]; statesPerSource?: Record<string, [number, number][]> }[];
    selfBuffs?: { id: number; buffData: { generation: number; overstack: number; wasted: number }[] }[];
    groupBuffs?: { id: number; buffData: { generation: number; overstack: number; wasted: number }[] }[];
    squadBuffs?: { id: number; buffData: { generation: number; overstack: number; wasted: number }[] }[];
    extHealingStats?: {
        outgoingHealingAllies: { healing: number }[][];
        totalHealingDist: { id: number; name: string; totalHealing: number; totalDownedHealing: number; hits: number }[][];
        healingReceived1S?: number[][];
    };
    extBarrierStats?: {
        outgoingBarrierAllies: { barrier: number }[][];
        totalBarrierDist: { id: number; name: string; totalBarrier: number; hits: number }[][];
        barrierReceived1S?: number[][];
    };
    rotation: { id: number; skills: { castTime: number; duration: number }[] }[];
    healthPercents?: [number, number][];
    combatReplayData?: {
        positions?: [number, number][];
        dead?: [number, number][];
        down?: [number, number][];
        start?: number;
    };
}

export interface EiTarget {
    name: string;
    totalDamageDist: { id: number; name: string; totalDamage: number; connectedHits: number; min: number; max: number }[][];
    damage1S?: number[][];
    enemyPlayer: boolean;
    isFake: boolean;
    teamID?: number;
    teamId?: number;
    profession?: string;
    combatReplayData?: {
        positions?: [number, number][];
        dead?: [number, number][];
        down?: [number, number][];
        start?: number;
    };
}

export interface EiJson {
    fightName: string;
    zone?: string;
    mapName?: string;
    map?: string;
    durationMS: number;
    success: boolean;
    uploadTime?: string;
    timeStartStd?: string;
    recordedBy?: string;
    recordedAccountBy?: string;
    players: EiPlayer[];
    targets: EiTarget[];
    skillMap: Record<string, { name: string; icon: string; autoAttack: boolean }>;
    buffMap: Record<string, { name: string; stacking: string; icon: string; classification?: string }>;
    combatReplayMetaData?: {
        inchToPixel?: number;
        pollingRate?: number;
        sizes?: [number, number];
        maps?: { url: string; interval: [number, number]; position: [number, number] }[];
    };
}

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
    nearestLandmark: string | null;
    mapImageUrl: string | null;
    mapSize: [number, number] | null;
    avgPosition: [number, number] | null;
    downPositions: [number, number][];
    deathPositions: [number, number][];
    duration: number;
    durationFormatted: string;
    timestamp: string;
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
    timestamp: string;
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
