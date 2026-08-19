import { describe, it, expect } from 'vitest';
import { resolveMapFromZone, resolveMapFromMapId, normalizeMapName } from '../../src/shared/mapUtils';
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

describe('normalizeMapName', () => {
    it('shortens map names for display', () => {
        expect(normalizeMapName('Eternal Battlegrounds')).toBe('EBG');
        expect(normalizeMapName('Green Alpine Borderlands')).toBe('Green BL');
        expect(normalizeMapName('Blue Desert Borderlands')).toBe('Blue BL');
        expect(normalizeMapName('Red Alpine Borderlands')).toBe('Red BL');
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
