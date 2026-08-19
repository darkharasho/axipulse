// src/shared/report.ts
//
// The primitives every native-format consumer needs. axilog ships the
// types but no JS runtime helpers, so the RLE decoder and the coverage
// guard live here rather than being re-derived per module.
import type {
    ReportV1, EntityOut, SeriesOut, CoverageState,
} from '@axiapps/axilog/types';

export type { ReportV1, EntityOut, SeriesOut, CoverageState };

/**
 * Expand one of the format's series envelopes.
 *
 * `enc` is `'raw'` (a plain value array) or `'rle'` (`[value, runLength]`
 * pairs), chosen per series by whichever serializes smaller. `len` is the
 * DECODED length in both cases -- NOT `data.length` -- which is why this
 * validates after decoding rather than trusting either.
 */
export function decodeSeries(s: SeriesOut): number[] {
    let out: number[];
    if (s.enc === 'raw') {
        out = s.data as number[];
    } else {
        out = [];
        for (const pair of s.data as [number, number][]) {
            const [value, run] = pair;
            for (let i = 0; i < run; i++) out.push(value);
        }
    }
    if (out.length !== s.len) {
        throw new Error(
            `decodeSeries: expected ${s.len} samples, decoded ${out.length} (enc=${s.enc})`,
        );
    }
    return out;
}

export function entityById(r: ReportV1): Map<number, EntityOut> {
    return new Map(r.entities.map(e => [e.id, e]));
}

export function squadMembers(r: ReportV1): EntityOut[] {
    return r.entities.filter(e => e.role === 'squad');
}

export function enemyPlayers(r: ReportV1): EntityOut[] {
    return r.entities.filter(e => e.role === 'enemy_player');
}

/**
 * Fetch a block, or throw.
 *
 * Per the migration spec, a block this app reads whose coverage is
 * `not_computed` is a hard failure: it means the parse options drifted
 * from what the code expects, and rendering a zero would silently report
 * "measured, and it was nothing".
 */
export function requireBlock<K extends keyof ReportV1['blocks']>(
    r: ReportV1,
    name: K,
): NonNullable<ReportV1['blocks'][K]> {
    const block = r.blocks[name];
    if (block === undefined) {
        const state: CoverageState | undefined = r.coverage[name as string];
        throw new Error(
            `axilog report is missing the "${String(name)}" block (coverage: ${state ?? 'absent'})`,
        );
    }
    return block as NonNullable<ReportV1['blocks'][K]>;
}

/**
 * The recording player's entity id.
 *
 * `encounter.recorded_by` is an entity id, not a name -- so unlike the EI
 * path there is no `recordedAccountBy`/`recordedBy`/heuristic ladder.
 * Falls back to the first squad member only when the log carries no
 * recorder at all.
 */
export function localPlayerId(r: ReportV1): number {
    if (typeof r.encounter.recorded_by === 'number') return r.encounter.recorded_by;
    const first = squadMembers(r)[0];
    if (!first) throw new Error('axilog report has no squad members and no recorded_by');
    return first.id;
}

/** The commander's entity id, or null when nobody held a tag. */
export function commanderId(r: ReportV1): number | null {
    return r.entities.find(e => e.commander)?.id ?? null;
}
