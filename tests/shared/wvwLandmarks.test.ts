import { describe, it, expect } from 'vitest';
import { WvwMap, findNearestLandmark, WVW_LANDMARKS } from '../../src/shared/wvwLandmarks';

describe('WVW_LANDMARKS', () => {
    it('has entries for calibrated maps', () => {
        expect(WVW_LANDMARKS[WvwMap.EternalBattlegrounds].length).toBeGreaterThan(0);
        expect(WVW_LANDMARKS[WvwMap.GreenBorderlands].length).toBeGreaterThan(0);
        expect(WVW_LANDMARKS[WvwMap.BlueBorderlands].length).toBeGreaterThan(0);
    });

    it('has an array for Red BL (not yet calibrated)', () => {
        expect(Array.isArray(WVW_LANDMARKS[WvwMap.RedBorderlands])).toBe(true);
    });
});

describe('findNearestLandmark', () => {
    it('returns the closest landmark by euclidean distance', () => {
        const landmarks = WVW_LANDMARKS[WvwMap.EternalBattlegrounds];
        const target = landmarks[0];
        const result = findNearestLandmark(WvwMap.EternalBattlegrounds, target.x + 1, target.y + 1);
        expect(result.name).toBe(target.name);
    });

    it('returns null for a map with no landmarks', () => {
        const result = findNearestLandmark('nonexistent' as WvwMap, 0, 0);
        expect(result).toBeNull();
    });
});
