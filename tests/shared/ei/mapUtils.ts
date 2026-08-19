// tests/shared/ei/mapUtils.ts
//
// The display-name map matcher, MOVED here from `src/shared/mapUtils.ts` by
// Task 11. Production resolves maps by `encounter.map_id` only
// (`resolveMapFromMapId`), which covers all four WvW maps this app holds
// assets for -- so there is no map the name path is still needed for, and
// none is kept.
//
// It survives here because dropping it would drop the evidence that the
// swap was behaviour-preserving: `mapUtils.test.ts` asserts the two
// resolvers agree on every map, including on the display name this
// project's own fixture carries.
import { WvwMap } from '../../../src/shared/wvwLandmarks';
import { stripPrefix } from '../../../src/shared/mapUtils';

export function resolveMapFromZone(zone: string): WvwMap | null {
    const clean = stripPrefix(zone).toLowerCase();
    if (clean.includes('eternal') || clean === 'ebg') return WvwMap.EternalBattlegrounds;
    if (clean.includes('green')) return WvwMap.GreenBorderlands;
    if (clean.includes('blue')) return WvwMap.BlueBorderlands;
    if (clean.includes('red')) return WvwMap.RedBorderlands;
    return null;
}
