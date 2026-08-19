import { WvwMap } from './wvwLandmarks';

const ZONE_PREFIXES = ['Detailed WvW - ', 'World vs World - ', 'WvW - '];

export function stripPrefix(zone: string): string {
    for (const prefix of ZONE_PREFIXES) {
        if (zone.startsWith(prefix)) return zone.slice(prefix.length);
    }
    return zone;
}

/**
 * GW2 map id -> the map asset set this app holds.
 *
 * The native format carries `encounter.map_id`, which is the join key GW2's
 * own API uses, so identification no longer has to fuzzy-match a localised
 * display name. Task 11 made this the only production path and moved the
 * display-name matcher to `tests/shared/ei/mapUtils.ts`, where it survives
 * as the oracle that the two agree on all four maps.
 *
 * Every entry is verified against `https://api.guildwars2.com/v2/maps/<id>`,
 * whose `type` field names the WvW slot directly:
 *
 *   38   Center     "Eternal Battlegrounds"
 *   95   GreenHome  " Alpine Borderlands"
 *   96   BlueHome   " Alpine Borderlands"
 *   1099 RedHome    " Desert Borderlands"
 *
 * Those four are the whole current WvW rotation -- there is no live id for a
 * red ALPINE borderland (id 94 returns "no such id"), so `RedBorderlands`
 * maps to the desert map, exactly as `WVW_LANDMARKS[RedBorderlands]`
 * (`RED_DESERT`) already assumed.
 *
 * The same API run confirms every `continentRect` in `wvwTiles.ts` matches
 * that map's `continent_rect` exactly, and that map 95's `map_rect`
 * (`[[-30720,-43008],[30720,43008]]`) is byte-identical to the `arena` world
 * rect axilog emits for this app's fixture -- so the arena rect and this
 * table are the same static GW2 data reached two ways.
 */
const MAP_ID_TO_WVW_MAP: Record<number, WvwMap> = {
    38: WvwMap.EternalBattlegrounds,
    95: WvwMap.GreenBorderlands,
    96: WvwMap.BlueBorderlands,
    1099: WvwMap.RedBorderlands,
};

/** `null` for any map this app has no landmark/tile assets for -- PvE, WvW
 *  lounges, and anything ArenaNet adds later. Callers decide what to do with
 *  that; nothing here substitutes a default map. */
export function resolveMapFromMapId(mapId: number): WvwMap | null {
    return MAP_ID_TO_WVW_MAP[mapId] ?? null;
}

export function normalizeMapName(zone: string): string {
    const clean = stripPrefix(zone).toLowerCase();
    if (clean.includes('eternal')) return 'EBG';
    if (clean.includes('green')) return 'Green BL';
    if (clean.includes('blue')) return 'Blue BL';
    if (clean.includes('red')) return 'Red BL';
    return stripPrefix(zone);
}

export function formatDuration(ms: number): string {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${String(seconds).padStart(2, '0')}`;
}
