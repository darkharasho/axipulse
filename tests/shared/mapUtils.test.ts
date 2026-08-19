import { describe, it, expect } from 'vitest';
import {
    resolveMapFromMapId, normalizeMapName, stripPrefix, formatDuration,
} from '../../src/shared/mapUtils';
import { resolveMapFromZone } from './ei/mapUtils';
import { WvwMap } from '../../src/shared/wvwLandmarks';

describe('resolveMapFromZone', () => {
    it('resolves Eternal Battlegrounds variants', () => {
        expect(resolveMapFromZone('Eternal Battlegrounds')).toBe(WvwMap.EternalBattlegrounds);
        expect(resolveMapFromZone('Detailed WvW - Eternal Battlegrounds')).toBe(WvwMap.EternalBattlegrounds);
    });

    it('resolves Green Borderlands', () => {
        expect(resolveMapFromZone('Green Alpine Borderlands')).toBe(WvwMap.GreenBorderlands);
        expect(resolveMapFromZone('Green Desert Borderlands')).toBe(WvwMap.GreenBorderlands);
    });

    it('resolves Blue Borderlands', () => {
        expect(resolveMapFromZone('Blue Alpine Borderlands')).toBe(WvwMap.BlueBorderlands);
    });

    it('resolves Red Borderlands', () => {
        expect(resolveMapFromZone('Red Desert Borderlands')).toBe(WvwMap.RedBorderlands);
    });

    it('returns null for non-WvW zones', () => {
        expect(resolveMapFromZone('Lions Arch')).toBeNull();
    });
});

describe('stripPrefix', () => {
    it('removes each of the three arcdps zone prefixes', () => {
        expect(stripPrefix('Detailed WvW - Eternal Battlegrounds')).toBe('Eternal Battlegrounds');
        expect(stripPrefix('World vs World - Green Alpine Borderlands')).toBe('Green Alpine Borderlands');
        expect(stripPrefix('WvW - Red Desert Borderlands')).toBe('Red Desert Borderlands');
    });

    it('returns an unprefixed zone unchanged', () => {
        expect(stripPrefix('Eternal Battlegrounds')).toBe('Eternal Battlegrounds');
        expect(stripPrefix('')).toBe('');
    });

    it('strips only a LEADING prefix, and only the first match', () => {
        // The prefixes are ordered longest-first; a zone that merely
        // contains one keeps it.
        expect(stripPrefix('Home of WvW - Eternal')).toBe('Home of WvW - Eternal');
        expect(stripPrefix('WvW - WvW - Eternal')).toBe('WvW - Eternal');
    });
});

describe('normalizeMapName', () => {
    it('shortens map names for display', () => {
        expect(normalizeMapName('Eternal Battlegrounds')).toBe('EBG');
        expect(normalizeMapName('Green Alpine Borderlands')).toBe('Green BL');
        expect(normalizeMapName('Blue Desert Borderlands')).toBe('Blue BL');
        expect(normalizeMapName('Red Alpine Borderlands')).toBe('Red BL');
    });

    it('matches case-insensitively and through a zone prefix', () => {
        expect(normalizeMapName('DETAILED WvW - ETERNAL BATTLEGROUNDS')).toBe('EBG');
        expect(normalizeMapName('WvW - green alpine borderlands')).toBe('Green BL');
    });

    it('falls back to the prefix-stripped zone, not to a default map', () => {
        // Nothing here substitutes EBG for an unrecognised zone -- the raw
        // (de-prefixed) name comes through so the mislabel is visible.
        expect(normalizeMapName('Lions Arch')).toBe('Lions Arch');
        expect(normalizeMapName('Detailed WvW - Obsidian Sanctum')).toBe('Obsidian Sanctum');
    });
});

describe('formatDuration', () => {
    it('formats minutes and zero-padded seconds', () => {
        expect(formatDuration(0)).toBe('0:00');
        expect(formatDuration(5000)).toBe('0:05');
        expect(formatDuration(65_000)).toBe('1:05');
        expect(formatDuration(600_000)).toBe('10:00');
        expect(formatDuration(3_661_000)).toBe('61:01');
    });

    it('pads the seconds to two digits', () => {
        // Without `padStart(2, '0')` this reads "2:9", which is not a time.
        expect(formatDuration(129_000)).toBe('2:09');
    });

    it('truncates the sub-second remainder rather than rounding it up', () => {
        // `Math.round` here would turn 59.6s into 1:00 -- a fight one second
        // longer than the log says it was.
        expect(formatDuration(59_600)).toBe('0:59');
        expect(formatDuration(999)).toBe('0:00');
        expect(formatDuration(1999)).toBe('0:01');
    });

    it('formats the fixture\'s own duration', () => {
        // 138333ms -- the value `extractPlayerFightData` puts in the fight label.
        expect(formatDuration(138_333)).toBe('2:18');
    });
});

/**
 * `encounter.map_id` replaces display-name matching for the native path.
 * Every id below was verified live against
 * `https://api.guildwars2.com/v2/maps/<id>`, whose `type` field names the
 * WvW slot: 38 Center, 95 GreenHome, 96 BlueHome, 1099 RedHome (Desert).
 * Id 94 -- the obvious guess for a fourth borderland -- returns
 * "no such id", which is why there is no red ALPINE entry.
 */
describe('resolveMapFromMapId', () => {
    it('resolves the four live WvW map ids', () => {
        expect(resolveMapFromMapId(38)).toBe(WvwMap.EternalBattlegrounds);
        expect(resolveMapFromMapId(95)).toBe(WvwMap.GreenBorderlands);
        expect(resolveMapFromMapId(96)).toBe(WvwMap.BlueBorderlands);
        expect(resolveMapFromMapId(1099)).toBe(WvwMap.RedBorderlands);
    });

    it('agrees with the display-name path on every id it knows', () => {
        expect(resolveMapFromMapId(38)).toBe(resolveMapFromZone('Eternal Battlegrounds'));
        expect(resolveMapFromMapId(95)).toBe(resolveMapFromZone('Green Alpine Borderlands'));
        expect(resolveMapFromMapId(96)).toBe(resolveMapFromZone('Blue Alpine Borderlands'));
        expect(resolveMapFromMapId(1099)).toBe(resolveMapFromZone('Red Desert Borderlands'));
    });

    it('returns null rather than defaulting to a map, for non-WvW and unknown ids', () => {
        expect(resolveMapFromMapId(94)).toBeNull();
        expect(resolveMapFromMapId(15)).toBeNull();
        expect(resolveMapFromMapId(0)).toBeNull();
        expect(resolveMapFromMapId(-1)).toBeNull();
    });
});
