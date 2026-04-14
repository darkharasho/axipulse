import { describe, it, expect } from 'vitest';
import { resolveMapFromZone, normalizeMapName } from '../../src/shared/mapUtils';
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
