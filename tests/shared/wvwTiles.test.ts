// tests/shared/wvwTiles.test.ts
//
// Added in Task 11's fix round 1. `getMapPixelSize` and `resolveMapPixelSize`
// are production functions the renderer's map layout depends on and had ZERO
// coverage; the 3-arg `getMapTiles(map, zoom, pixelSize)` path was covered
// only incidentally, for Green Alpine, inside `extract/movement.test.ts`.
import { describe, it, expect } from 'vitest';
import {
    getMapTiles, getMapPixelSize, resolveMapPixelSize, hasTileData,
} from '../../src/shared/wvwTiles';
import { WvwMap } from '../../src/shared/wvwLandmarks';

const ALL_MAPS = [
    WvwMap.EternalBattlegrounds,
    WvwMap.GreenBorderlands,
    WvwMap.BlueBorderlands,
    WvwMap.RedBorderlands,
] as const;

describe('getMapPixelSize', () => {
    /**
     * The four sizes are NOT interchangeable, which is the whole reason the
     * renderer's old `?? 523 / ?? 750` was a bug rather than a shortcut: it
     * applied Alpine's 523x750 to EBG (716x750) and Red Desert (750x750).
     * Pinned per map so a table edit is a visible change.
     */
    it('returns the transcribed pixel size for each of the four WvW maps', () => {
        expect(getMapPixelSize(WvwMap.EternalBattlegrounds)).toEqual([716, 750]);
        expect(getMapPixelSize(WvwMap.GreenBorderlands)).toEqual([523, 750]);
        expect(getMapPixelSize(WvwMap.BlueBorderlands)).toEqual([523, 750]);
        expect(getMapPixelSize(WvwMap.RedBorderlands)).toEqual([750, 750]);
    });

    it('covers every WvwMap member with a positive, finite size', () => {
        for (const map of ALL_MAPS) {
            const [w, h] = getMapPixelSize(map);
            expect(w, map).toBeGreaterThan(0);
            expect(h, map).toBeGreaterThan(0);
            expect(hasTileData(map), map).toBe(true);
        }
    });

    /**
     * The `Record<WvwMap, ...>` type makes this unreachable through the type
     * system, but a value cast in from a persisted store or an IPC payload is
     * not type-checked. Without the guard the caller destructures
     * `undefined[0]` and gets a TypeError several frames away from the cause.
     */
    it('throws, rather than returning undefined, for a map with no table entry', () => {
        expect(() => getMapPixelSize('Atlantis' as WvwMap))
            .toThrow(/getMapPixelSize: no tile data for map Atlantis/);
    });
});

describe('resolveMapPixelSize', () => {
    // The log's own arena wins: it travels with the positions being plotted.
    it('prefers the log\'s arena size over the transcribed table', () => {
        expect(resolveMapPixelSize([522.75, 750], WvwMap.GreenBorderlands)).toEqual([522.75, 750]);
        // ... and it is really the arena, not the table that happens to be close.
        expect(resolveMapPixelSize([1, 2], WvwMap.EternalBattlegrounds)).toEqual([1, 2]);
    });

    it('falls back to the table when the log carries no arena', () => {
        expect(resolveMapPixelSize(null, WvwMap.EternalBattlegrounds)).toEqual([716, 750]);
        expect(resolveMapPixelSize(null, WvwMap.RedBorderlands)).toEqual([750, 750]);
    });

    /**
     * The finding this function exists for. Fix round 1 briefly wrote
     * `mapSize ?? (map ? getMapPixelSize(map) : [0, 0])` in both map views: a
     * 0x0 SVG coordinate space, which collapses every landmark onto the origin
     * and renders as a map that failed to load rather than a map this app
     * cannot draw. Absence is now explicit and both views branch on it.
     */
    it('returns null -- never a degenerate [0, 0] -- when there is no map at all', () => {
        expect(resolveMapPixelSize(null, null)).toBeNull();
    });

    it('never returns a zero or negative dimension', () => {
        for (const map of [...ALL_MAPS, null]) {
            const size = resolveMapPixelSize(null, map);
            if (size === null) continue;
            expect(size[0], String(map)).toBeGreaterThan(0);
            expect(size[1], String(map)).toBeGreaterThan(0);
        }
    });
});

describe('getMapTiles pixelSize override', () => {
    /**
     * The 3-arg path `MovementView` now uses. Previously exercised only for
     * Green Alpine as a side-effect of the arena-squeeze test; asserted here
     * for all four maps, because the override has to scale the tile rects and
     * not merely be accepted and ignored.
     */
    it.each(ALL_MAPS)('scales tile rects with the pixelSize override on %s', (map) => {
        const base = getMapTiles(map, 5);
        const explicit = getMapTiles(map, 5, getMapPixelSize(map));
        const doubled = getMapTiles(map, 5, [
            getMapPixelSize(map)[0] * 2, getMapPixelSize(map)[1] * 2,
        ]);

        expect(base.length).toBeGreaterThan(0);
        expect(explicit.length).toBe(base.length);
        expect(doubled.length).toBe(base.length);

        // Passing the table's own value explicitly must be a no-op...
        expect(explicit).toEqual(base);
        // ... and doubling it must double the rects, so the argument is read.
        for (let i = 0; i < base.length; i++) {
            expect(doubled[i].width, `${map} tile ${i} w`).toBeCloseTo(base[i].width * 2, 9);
            expect(doubled[i].height, `${map} tile ${i} h`).toBeCloseTo(base[i].height * 2, 9);
        }
        // The tile URLs are a function of continent space only, so the
        // override must not move them.
        expect(doubled.map(t => t.url)).toEqual(base.map(t => t.url));
    });

    it('returns an empty list for a map with no tile data', () => {
        expect(getMapTiles('Atlantis' as WvwMap, 5)).toEqual([]);
        expect(hasTileData('Atlantis' as WvwMap)).toBe(false);
    });
});
