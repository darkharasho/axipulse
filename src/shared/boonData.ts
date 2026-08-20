// src/shared/boonData.ts
import type { BoonUptimeEntry, BoonGenerationEntry } from './types';
import type { ReportV1 } from './report';
import { requireBlock } from './report';

export const BOON_NAMES: Record<number, string> = {
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

export const OFFENSIVE_BOON_IDS = new Set([740, 725, 1187, 30328]); // Might, Fury, Quickness, Alacrity
export const DEFENSIVE_BOON_IDS = new Set([1122, 717, 26980, 743]); // Stability, Protection, Resistance, Aegis

// EI's buffData.uptime for these represents average stacks (0-25), not a percentage.
// Native's `catalogs.buffs[id].stacking` carries the same distinction and is
// preferred when available (see `extractBoonUptimes` below) -- this set is
// the EI-side fallback/legacy source of truth.
export const INTENSITY_STACKING_BOON_IDS = new Set([740, 1122]); // Might, Stability
export const MAX_BOON_STACKS: Record<number, number> = { 740: 25, 1122: 25 };

export const CONDITION_NAMES: Record<number, string> = {
    872: 'Stun',
    833: 'Daze',
    791: 'Fear',
    727: 'Immobilize',
    722: 'Chill',
    26766: 'Slow',
};

// Fear is buff id 791, not 785. `785` appears in NEITHER document: it is
// absent from native's `catalogs.buffs` and EI's `buffMap` has no `b785`,
// while both define 791 as Fear. The wrong id silently dropped Fear from
// the hard-CC lane on the still-live EI path (7 EI players in the frozen
// fixture carry a `b791` state timeline). Pinned by boonData.test.ts.
export const HARD_CC_IDS = new Set([872, 833, 791]); // Stun, Daze, Fear
export const SOFT_CC_IDS = new Set([722, 727, 26766]); // Chill, Immobilize, Slow

export const ALL_TRACKED_BUFF_IDS = new Set([
    ...WVW_BOON_IDS,
    ...HARD_CC_IDS,
    ...SOFT_CC_IDS,
]);

/**
 * Boon uptimes for one entity, native format.
 *
 * `blocks.boons.by_entity[id]` is keyed by buff id (string), one row per
 * tracked buff -- verified against the fixture: every one of the 46 squad
 * members carries exactly the 12 `WVW_BOON_IDS` keys, no more, no fewer.
 * `uptime` reads `avg_stacks` for intensity-stacking buffs (Might,
 * Stability) and `uptime_pct` for duration-stacking ones -- chosen from
 * `catalogs.buffs[id].stacking`, never inferred from the id, and a missing
 * catalog entry throws rather than falling back to an id list.
 */
export function extractBoonUptimes(r: ReportV1, id: number): BoonUptimeEntry[] {
    const boons = requireBlock(r, 'boons').by_entity[String(id)];
    if (!boons) throw new Error(`extractBoonUptimes: no boons row for entity ${id}`);

    const uptimes: BoonUptimeEntry[] = [];
    for (const buffId of WVW_BOON_IDS) {
        const row = boons[String(buffId)];
        if (!row) continue;
        // `catalogs.buffs[buffId].stacking` is the ONLY source of truth for
        // which field to read. There is deliberately no `INTENSITY_STACKING_BOON_IDS`
        // fallback: a hardcoded id list silently winning over the catalog on
        // a log whose catalog entry is missing is exactly the failure mode
        // the `coverage: not_computed` rule forbids, so a missing entry is a
        // hard error instead.
        const def = r.catalogs.buffs[String(buffId)];
        if (!def?.stacking) {
            throw new Error(
                `extractBoonUptimes: catalogs.buffs[${buffId}] has no \`stacking\` for entity ${id}`
                + ' -- refusing to infer it from a hardcoded id list',
            );
        }
        const stacking = def.stacking;
        // `avg_stacks` is documented as always present for intensity-stacking
        // buffs and omitted (not a meaningless 0) for duration ones
        // (`@axiapps/axilog/types.d.ts`, `BoonOut`). Rendering a 0 for a
        // missing one is the banned silent zero.
        if (stacking === 'intensity' && row.avg_stacks === undefined) {
            throw new Error(
                `extractBoonUptimes: buff ${buffId} is intensity-stacking but`
                + ` blocks.boons.by_entity[${id}][${buffId}].avg_stacks is absent`,
            );
        }
        const uptime = stacking === 'intensity' ? row.avg_stacks! : row.uptime_pct;
        uptimes.push({ id: buffId, name: def.name, uptime, stacking });
    }
    return uptimes;
}

/**
 * Boon self/group/squad generation for one entity, native format.
 *
 * Replaces EI's three separate `selfBuffs`/`groupBuffs`/`squadBuffs` arrays
 * with one `GenerationRow` per buff (`generation.{self_pct,group_pct,squad_pct}`).
 */
export function extractBoonGeneration(r: ReportV1, id: number): BoonGenerationEntry[] {
    const boons = requireBlock(r, 'boons').by_entity[String(id)];
    if (!boons) throw new Error(`extractBoonGeneration: no boons row for entity ${id}`);

    const generation: BoonGenerationEntry[] = [];
    for (const buffId of WVW_BOON_IDS) {
        const row = boons[String(buffId)];
        if (!row) continue;
        // Same rule as `extractBoonUptimes` above, which throws for the same
        // absence: the catalog is the only source of truth for a buff's
        // name, and the `BOON_NAMES[buffId] ?? \`Boon ${buffId}\`` ladder this
        // replaces meant the two halves of the same block disagreed about
        // whether a missing catalog entry was an error. Measured: all twelve
        // `WVW_BOON_IDS` resolve in the fixture's `catalogs.buffs`.
        const def = r.catalogs.buffs[String(buffId)];
        if (!def) {
            throw new Error(
                `extractBoonGeneration: catalogs.buffs[${buffId}] is missing for entity ${id}`,
            );
        }
        const name = def.name;
        generation.push({
            id: buffId,
            name,
            selfGeneration: row.generation.self_pct,
            groupGeneration: row.generation.group_pct,
            squadGeneration: row.generation.squad_pct,
        });
    }
    return generation;
}
