// src/shared/professionUtils.ts
export const PROFESSION_COLORS: Record<string, string> = {
    'Guardian': '#72C1D9',
    'Dragonhunter': '#72C1D9',
    'Firebrand': '#72C1D9',
    'Willbender': '#72C1D9',
    'Luminary': '#72C1D9',

    'Revenant': '#D16E5A',
    'Herald': '#D16E5A',
    'Renegade': '#D16E5A',
    'Vindicator': '#D16E5A',
    'Conduit': '#D16E5A',

    'Warrior': '#FFD166',
    'Berserker': '#FFD166',
    'Spellbreaker': '#FFD166',
    'Bladesworn': '#FFD166',
    'Paragon': '#FFD166',

    'Engineer': '#D09C59',
    'Scrapper': '#D09C59',
    'Holosmith': '#D09C59',
    'Mechanist': '#D09C59',
    'Amalgam': '#D09C59',

    'Ranger': '#8CDC82',
    'Druid': '#8CDC82',
    'Soulbeast': '#8CDC82',
    'Untamed': '#8CDC82',
    'Galeshot': '#8CDC82',

    'Thief': '#C08F95',
    'Daredevil': '#C08F95',
    'Deadeye': '#C08F95',
    'Specter': '#C08F95',
    'Antiquary': '#C08F95',

    'Elementalist': '#F68A87',
    'Tempest': '#F68A87',
    'Weaver': '#F68A87',
    'Catalyst': '#F68A87',
    'Evoker': '#F68A87',

    'Mesmer': '#B679D5',
    'Chronomancer': '#B679D5',
    'Mirage': '#B679D5',
    'Virtuoso': '#B679D5',
    'Troubadour': '#B679D5',

    'Necromancer': '#52A76F',
    'Reaper': '#52A76F',
    'Scourge': '#52A76F',
    'Harbinger': '#52A76F',
    'Ritualist': '#52A76F',

    'Unknown': '#64748B',
};

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

export function getProfessionBase(profession: string): string {
    if (!profession) return 'Unknown';
    return PROFESSION_BASE[profession] ?? profession;
}

export function getProfessionColor(profession: string): string {
    return PROFESSION_COLORS[profession] ?? PROFESSION_COLORS['Unknown'];
}
