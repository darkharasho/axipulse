// Shared health-status banding for the two hand-rolled SVG health traces
// (TimelineHealthLane, the full-fight swimlane; HealthPanel, the inspector's
// selection-window trace). Health is status, not a free-form domain colour,
// so it reads through the fixed --axi-ok/-warn/-danger inks (rule 5) rather
// than the continuous red-amber-green blend the original code drew with an
// SVG <linearGradient> (rule 2 forbids both the gradient and the opacity it
// used to soften the fill; rule 7 keeps the quantity itself on the y-axis as
// length, not colour).
//
// Thresholds are `> 50 → ok`, `> 25 → warn`, else `danger` — matching the
// only other health-colouring site in the app, MapView/MovementView's
// `>50 / >25` split, and the single inflection point (50) the original
// gradient actually had. There is nothing in the data model that defines a
// 66/33 split; using one here would let the Timeline and the Map disagree
// about what a given health percentage means.
export const STATUS_COLORS = { ok: 'var(--axi-ok)', warn: 'var(--axi-warn)', danger: 'var(--axi-danger)' } as const;

export type Band = keyof typeof STATUS_COLORS;

export function healthBand(pct: number): Band {
    const clamped = Math.max(0, Math.min(100, pct));
    if (clamped > 50) return 'ok';
    if (clamped > 25) return 'warn';
    return 'danger';
}

export interface Segment {
    fillPath: string;
    strokePath: string;
    band: Band;
}

// Splits a health trace into contiguous same-band runs so each can be drawn
// as its own solid-filled <path> instead of one gradient-filled path. A run
// that changes band closes on the crossing point and the next run opens on
// that same point, so segments stay visually contiguous (no gap, no
// double-painted interval).
export function buildSegments(pts: { x: number; y: number; pct: number }[]): Segment[] {
    if (pts.length === 0) return [];
    const segments: Segment[] = [];
    let run: typeof pts = [pts[0]];
    let runBand = healthBand(pts[0].pct);

    const flush = () => {
        if (run.length === 0) return;
        let d = `M ${run[0].x} ${run[0].y}`;
        for (let i = 1; i < run.length; i++) d += ` L ${run[i].x} ${run[i].y}`;
        const fill = `${d} L ${run[run.length - 1].x} 1 L ${run[0].x} 1 Z`;
        segments.push({ fillPath: fill, strokePath: d, band: runBand });
    };

    for (let i = 1; i < pts.length; i++) {
        const band = healthBand(pts[i].pct);
        if (band !== runBand) {
            run.push(pts[i]);
            flush();
            run = [pts[i]];
            runBand = band;
        } else {
            run.push(pts[i]);
        }
    }
    flush();

    return segments;
}
