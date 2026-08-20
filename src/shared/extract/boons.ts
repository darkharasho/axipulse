// src/shared/extract/boons.ts
import type { ReportV1 } from '../report';
import { requireBlock } from '../report';
import type { BoonStats } from '../types';
import { extractBoonUptimes, extractBoonGeneration } from '../boonData';
import { computeBoonPerformance, STABILITY_BUFF_ID, MIGHT_BUFF_ID } from '../boonPerformance';

/**
 * Boon stats for one entity: uptimes, self/group/squad generation, and the
 * stability/might per-bucket party breakdown.
 *
 * `bucketSizeMs` is a PARAMETER, not a constant. It was hardcoded to 1000
 * when this unit was written in isolation, which matched the renderer
 * store's default -- but the value is user-mutable in-session
 * (`SettingsView.tsx`'s bucket-size control) and `useFightListener` passes
 * the live `state.bucketSizeMs` into `extractPlayerFightData`. Baking the
 * default in would have turned that control into a silent no-op for the two
 * boon-performance charts, which is a user-visible regression the cutover
 * would have introduced. `boons.test.ts` pins that a non-default value
 * changes the bucket count.
 *
 * `uptimes`/`generation` read `blocks.boons.by_entity[id]` directly (see
 * `boonData.ts`). `boonPerformance` additionally needs `blocks.replay` (for
 * commander/party positions and death intervals) and `blocks.series` (for
 * party incoming damage) -- `computeBoonPerformance` requires those itself,
 * so this function only guards `boons`, the block both halves share.
 */
export function extractBoons(r: ReportV1, id: number, bucketSizeMs: number): BoonStats {
    requireBlock(r, 'boons');

    return {
        uptimes: extractBoonUptimes(r, id),
        generation: extractBoonGeneration(r, id),
        boonPerformance: {
            stability: computeBoonPerformance(r, id, bucketSizeMs, STABILITY_BUFF_ID),
            might: computeBoonPerformance(r, id, bucketSizeMs, MIGHT_BUFF_ID),
        },
    };
}
