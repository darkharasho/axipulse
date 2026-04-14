// src/shared/boonData.ts
import type { EiPlayer, BoonUptimeEntry, BoonGenerationEntry } from './types';

const BOON_NAMES: Record<number, string> = {
    740: 'Might',
    725: 'Fury',
    717: 'Protection',
    718: 'Regeneration',
    726: 'Vigor',
    1122: 'Stability',
    719: 'Swiftness',
    743: 'Aegis',
    873: 'Resolution',
    1187: 'Quickness',
    30328: 'Alacrity',
    26980: 'Resistance',
};

export const WVW_BOON_IDS = new Set(Object.keys(BOON_NAMES).map(Number));

export function extractBoonUptimes(player: EiPlayer): BoonUptimeEntry[] {
    const uptimes: BoonUptimeEntry[] = [];
    for (const buff of player.buffUptimes) {
        if (!WVW_BOON_IDS.has(buff.id)) continue;
        const name = BOON_NAMES[buff.id] ?? `Boon ${buff.id}`;
        const uptime = buff.buffData[0]?.uptime ?? 0;
        uptimes.push({ id: buff.id, name, uptime });
    }
    return uptimes;
}

export function extractBoonGeneration(player: EiPlayer): BoonGenerationEntry[] {
    const genMap = new Map<number, BoonGenerationEntry>();

    for (const buff of player.selfBuffs) {
        if (!WVW_BOON_IDS.has(buff.id)) continue;
        const name = BOON_NAMES[buff.id] ?? `Boon ${buff.id}`;
        genMap.set(buff.id, {
            id: buff.id, name,
            selfGeneration: buff.buffData[0]?.generation ?? 0,
            groupGeneration: 0,
            squadGeneration: 0,
        });
    }

    for (const buff of player.groupBuffs) {
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

    for (const buff of player.squadBuffs) {
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
