// src/shared/types.ts

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
    buffUptimes?: { id: number; buffData: { uptime: number; generation: number; overstack: number; wasted: number }[]; states?: [number, number][]; statesPerSource?: Record<string, [number, number][]> }[];
    selfBuffs?: { id: number; buffData: { generation: number; overstack: number; wasted: number }[] }[];
    groupBuffs?: { id: number; buffData: { generation: number; overstack: number; wasted: number }[] }[];
    squadBuffs?: { id: number; buffData: { generation: number; overstack: number; wasted: number }[] }[];
    extHealingStats?: {
        outgoingHealingAllies: { healing: number }[][];
        totalHealingDist: { id: number; name: string; totalHealing: number; hits: number }[][];
        healingReceived1S?: number[][];
    };
    extBarrierStats?: {
        outgoingBarrierAllies: { barrier: number }[][];
        totalBarrierDist: { id: number; name: string; totalBarrier: number; hits: number }[][];
        barrierReceived1S?: number[][];
    };
    rotation: { id: number; skills: { castTime: number; duration: number }[] }[];
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
    profession?: string;
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

export interface SquadMemberMovement {
    name: string;
    account: string;
    profession: string;
    eliteSpec: string;
    group: number;
    isCommander: boolean;
    isLocal: boolean;
    positions: [number, number][];
    downRanges: [number, number][];
    deadRanges: [number, number][];
}

export interface MovementData {
    pollingRate: number;
    durationMs: number;
    members: SquadMemberMovement[];
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
    hits: number;
}

export interface SupportStats {
    boonStrips: number;
    cleanses: number;
    cleanseSelf: number;
    healingOutput: number;
    barrierOutput: number;
    stabilityGeneration: number;
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
}

export interface BoonUptimeEntry {
    id: number;
    name: string;
    uptime: number;
}

export interface BoonGenerationEntry {
    id: number;
    name: string;
    selfGeneration: number;
    groupGeneration: number;
    squadGeneration: number;
}

export interface BoonStats {
    uptimes: BoonUptimeEntry[];
    generation: BoonGenerationEntry[];
}

export interface TimelineBucket {
    time: number;
    value: number;
}

export interface TimelineData {
    bucketSizeMs: number;
    damageDealt: TimelineBucket[];
    damageTaken: TimelineBucket[];
    distanceToTag: TimelineBucket[];
    incomingHealing: TimelineBucket[];
    incomingBarrier: TimelineBucket[];
    boonUptimeTimeline: Record<string, TimelineBucket[]>;
    boonGenerationTimeline: Record<string, TimelineBucket[]>;
    ccDealt: number[];
    ccReceived: number[];
    deathEvents: number[];
    downEvents: number[];
}

export interface SquadContext {
    squadSize: number;
    damageRank: number;
    stripsRank: number;
    healingRank: number;
    cleanseRank: number;
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
