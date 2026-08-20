// tests/shared/ei/boonData.ts
//
// The EI-shaped boon extractors, MOVED here from `src/shared/boonData.ts` by
// Task 11. They have no production caller after the cutover; they survive as
// the left-hand side of `extractPlayerData.test.ts`'s `boons.uptimes` /
// `boons.generation` oracles. The id/name tables they read still live in
// `src/shared/boonData.ts`, which is native-only now.
import type { EiPlayer } from './types';
import type { BoonUptimeEntry, BoonGenerationEntry } from '../../../src/shared/types';
import {
    WVW_BOON_IDS, INTENSITY_STACKING_BOON_IDS, BOON_NAMES,
} from '../../../src/shared/boonData';

export function extractBoonUptimesEi(player: EiPlayer): BoonUptimeEntry[] {
    const uptimes: BoonUptimeEntry[] = [];
    for (const buff of player.buffUptimes ?? []) {
        if (!WVW_BOON_IDS.has(buff.id)) continue;
        const name = BOON_NAMES[buff.id] ?? `Boon ${buff.id}`;
        const uptime = buff.buffData[0]?.uptime ?? 0;
        const stacking: 'duration' | 'intensity' = INTENSITY_STACKING_BOON_IDS.has(buff.id) ? 'intensity' : 'duration';
        uptimes.push({ id: buff.id, name, uptime, stacking });
    }
    return uptimes;
}

export function extractBoonGenerationEi(player: EiPlayer): BoonGenerationEntry[] {
    const genMap = new Map<number, BoonGenerationEntry>();

    for (const buff of player.selfBuffs ?? []) {
        if (!WVW_BOON_IDS.has(buff.id)) continue;
        const name = BOON_NAMES[buff.id] ?? `Boon ${buff.id}`;
        genMap.set(buff.id, {
            id: buff.id, name,
            selfGeneration: buff.buffData[0]?.generation ?? 0,
            groupGeneration: 0,
            squadGeneration: 0,
        });
    }

    for (const buff of player.groupBuffs ?? []) {
        if (!WVW_BOON_IDS.has(buff.id)) continue;
        const existing = genMap.get(buff.id);
        if (existing) {
            existing.groupGeneration = buff.buffData[0]?.generation ?? 0;
        } else {
            const name = BOON_NAMES[buff.id] ?? `Boon ${buff.id}`;
            genMap.set(buff.id, {
                id: buff.id, name,
                selfGeneration: 0,
                groupGeneration: buff.buffData[0]?.generation ?? 0,
                squadGeneration: 0,
            });
        }
    }

    for (const buff of player.squadBuffs ?? []) {
        if (!WVW_BOON_IDS.has(buff.id)) continue;
        const existing = genMap.get(buff.id);
        if (existing) {
            existing.squadGeneration = buff.buffData[0]?.generation ?? 0;
        } else {
            const name = BOON_NAMES[buff.id] ?? `Boon ${buff.id}`;
            genMap.set(buff.id, {
                id: buff.id, name,
                selfGeneration: 0,
                groupGeneration: 0,
                squadGeneration: buff.buffData[0]?.generation ?? 0,
            });
        }
    }

    return Array.from(genMap.values());
}
