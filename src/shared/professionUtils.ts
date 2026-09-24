// src/shared/professionUtils.ts
//
// The 46 profession/elite-spec names collapse onto ten base professions, so
// there are ten colours, not 46. Those colours are GW2 domain data - rule 10
// of the axi-design spec - and live as fixed tokens in
// src/renderer/themes/series.css; they are NOT recoloured by the accent.
// This module names the token; it never names the colour.

const PROFESSION_BASE: Record<string, string> = {
    Guardian: 'Guardian', Dragonhunter: 'Guardian', Firebrand: 'Guardian', Willbender: 'Guardian', Luminary: 'Guardian',
    Revenant: 'Revenant', Herald: 'Revenant', Renegade: 'Revenant', Vindicator: 'Revenant', Conduit: 'Revenant',
    Warrior: 'Warrior', Berserker: 'Warrior', Spellbreaker: 'Warrior', Bladesworn: 'Warrior', Paragon: 'Warrior',
    Engineer: 'Engineer', Scrapper: 'Engineer', Holosmith: 'Engineer', Mechanist: 'Engineer', Amalgam: 'Engineer',
    Ranger: 'Ranger', Druid: 'Ranger', Soulbeast: 'Ranger', Untamed: 'Ranger', Galeshot: 'Ranger',
    Thief: 'Thief', Daredevil: 'Thief', Deadeye: 'Thief', Specter: 'Thief', Antiquary: 'Thief',
    Elementalist: 'Elementalist', Tempest: 'Elementalist', Weaver: 'Elementalist', Catalyst: 'Elementalist', Evoker: 'Elementalist',
    Mesmer: 'Mesmer', Chronomancer: 'Mesmer', Mirage: 'Mesmer', Virtuoso: 'Mesmer', Troubadour: 'Mesmer',
    Necromancer: 'Necromancer', Reaper: 'Necromancer', Scourge: 'Necromancer', Harbinger: 'Necromancer', Ritualist: 'Necromancer',
    Unknown: 'Unknown',
};

// The ten bases that have a token in series.css. An unrecognised name - a
// future elite spec, an empty string - must land here rather than produce
// `var(--axi-series-prof-)`, which computes to nothing and renders black.
const TOKENED_BASES = new Set([
    'Guardian', 'Revenant', 'Warrior', 'Engineer', 'Ranger',
    'Thief', 'Elementalist', 'Mesmer', 'Necromancer', 'Unknown',
]);

export function getProfessionBase(profession: string): string {
    if (!profession) return 'Unknown';
    return PROFESSION_BASE[profession] ?? profession;
}

export function getProfessionColor(profession: string): string {
    const base = getProfessionBase(profession);
    const known = TOKENED_BASES.has(base) ? base : 'Unknown';
    return `var(--axi-series-prof-${known.toLowerCase()})`;
}

// Membership test only - "is this a recognised profession/elite-spec name",
// with no colour involved. classIconUtils.ts used PROFESSION_COLORS[profession]
// this way before the colour map moved to CSS tokens; PROFESSION_BASE carries
// the exact same key set, so this predicate preserves that truth table.
export function isKnownProfession(profession: string): boolean {
    return profession in PROFESSION_BASE;
}
