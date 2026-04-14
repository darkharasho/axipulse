import { WvwMap } from './wvwLandmarks';

const ZONE_PREFIXES = ['Detailed WvW - ', 'World vs World - ', 'WvW - '];

function stripPrefix(zone: string): string {
    for (const prefix of ZONE_PREFIXES) {
        if (zone.startsWith(prefix)) return zone.slice(prefix.length);
    }
    return zone;
}

export function resolveMapFromZone(zone: string): WvwMap | null {
    const clean = stripPrefix(zone).toLowerCase();
    if (clean.includes('eternal battlegrounds')) return WvwMap.EternalBattlegrounds;
    if (clean.includes('green')) return WvwMap.GreenBorderlands;
    if (clean.includes('blue')) return WvwMap.BlueBorderlands;
    if (clean.includes('red')) return WvwMap.RedBorderlands;
    return null;
}

export function normalizeMapName(zone: string): string {
    const clean = stripPrefix(zone).toLowerCase();
    if (clean.includes('eternal battlegrounds')) return 'EBG';
    if (clean.includes('green')) return 'Green BL';
    if (clean.includes('blue')) return 'Blue BL';
    if (clean.includes('red')) return 'Red BL';
    return zone;
}

export function formatDuration(ms: number): string {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${String(seconds).padStart(2, '0')}`;
}
