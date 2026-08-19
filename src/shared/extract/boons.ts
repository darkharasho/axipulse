// src/shared/extract/boons.ts
import type { ReportV1 } from '../report';
import { requireBlock } from '../report';
import type { BoonStats } from '../types';
import { extractBoonUptimes, extractBoonGeneration } from '../boonData';
import { computeBoonPerformance, STABILITY_BUFF_ID, MIGHT_BUFF_ID } from '../boonPerformance';

/**
 * The bucket size baked into the `boonPerformance` breakdown this function
 * returns. `extractBoons`'s interface (per the migration brief) takes no
 * `bucketSizeMs` parameter -- matches the renderer store's default
 * (`src/renderer/store.ts`'s initial `bucketSizeMs: 1000`). A caller that
 * needs a different bucket size (e.g. the user's saved setting) calls
 * `computeBoonPerformance` directly rather than through this function.
 */
const DEFAULT_BUCKET_MS = 1000;

/**
 * Boon stats for one entity: uptimes, self/group/squad generation, and the
 * stability/might per-bucket party breakdown.
 *
 * `uptimes`/`generation` read `blocks.boons.by_entity[id]` directly (see
 * `boonData.ts`). `boonPerformance` additionally needs `blocks.replay` (for
 * commander/party positions and death intervals) and `blocks.series` (for
 * party incoming damage) -- `computeBoonPerformance` requires those itself,
 * so this function only guards `boons`, the block both halves share.
 */
export function extractBoons(r: ReportV1, id: number): BoonStats {
    requireBlock(r, 'boons');

    return {
        uptimes: extractBoonUptimes(r, id),
        generation: extractBoonGeneration(r, id),
        boonPerformance: {
            stability: computeBoonPerformance(r, id, DEFAULT_BUCKET_MS, STABILITY_BUFF_ID),
            might: computeBoonPerformance(r, id, DEFAULT_BUCKET_MS, MIGHT_BUFF_ID),
        },
    };
}
