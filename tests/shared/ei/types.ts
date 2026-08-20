// tests/shared/ei/types.ts
//
// The Elite Insights JSON shape, MOVED here from `src/shared/types.ts` by
// Task 11 -- not deleted.
//
// Production code no longer reads Elite Insights at all, but these types are
// what the migration's EVIDENCE is made of: fourteen test files compute each
// value twice, once from `tests/fixtures/wvw.ei.json` through these types and
// once from the native `ReportV1`, and assert the two agree. Deleting them
// would have been silent -- `npm run typecheck`'s `tsconfig.json` does not
// include `tests/`, and vitest's esbuild transform erases `import type`
// without resolving it -- so every oracle would have degraded to `any` with a
// green suite and a green typecheck. See `npm run typecheck:tests`, added by
// this task, which is the gate that would now catch it.
export interface EiPlayer {
    name: string;
    account: string;
    /** arcdps instance id. Present on all 47 players and all 47 targets of
     *  the frozen fixture (measured); the enemy-identity oracle in
     *  `extract/composition.test.ts` joins on it. Declared by Task 11 when
     *  `tsconfig.tests.json` first typechecked this tree and found the
     *  oracle reading a field the type did not have. */
    instanceID: number;
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
        // Keyed by ALLY index into `players` (positional, like `outgoingHealingAllies`),
        // then by phase, then the per-skill rows healing that ally. Includes the
        // healer's own index (self-healing), unlike the field name's "allied"
        // implies -- see extract/support.test.ts's healingOutput oracle notes.
        alliedHealingDist?: { id: number; totalHealing: number; totalDownedHealing: number; hits: number }[][][];
    };
    extBarrierStats?: {
        outgoingBarrierAllies: { barrier: number }[][];
        totalBarrierDist: { id: number; name: string; totalBarrier: number; hits: number }[][];
        barrierReceived1S?: number[][];
        // Same shape as `alliedHealingDist`, for barrier.
        alliedBarrierDist?: { id: number; totalBarrier: number; hits: number }[][][];
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
    /** See `EiPlayer.instanceID`. */
    instanceID: number;
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
