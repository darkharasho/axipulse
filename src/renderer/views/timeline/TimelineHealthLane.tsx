import { useMemo } from 'react';
import type { TimelineBucket } from '../../../shared/types';

interface TimelineHealthLaneProps {
    data: TimelineBucket[];
    domainMs: [number, number];
}

// Health is status, not a free-form domain colour, so it reads through the
// fixed --axi-ok/-warn/-danger inks (rule 5) rather than a continuous
// red-amber-green blend (rule 2 forbids the gradient/opacity that used to
// draw it, rule 7 keeps the quantity itself on the y-axis as length). These
// land on an SVG `style={{ fill }}` object below, which is a CSS declaration
// and parses var() fine (unlike a bare `fill="var(--x)"` attribute), so no
// readToken() resolution is needed here.
const STATUS_COLORS = { ok: 'var(--axi-ok)', warn: 'var(--axi-warn)', danger: 'var(--axi-danger)' } as const;

type Band = keyof typeof STATUS_COLORS;

function healthBand(pct: number): Band {
    const clamped = Math.max(0, Math.min(100, pct));
    if (clamped > 66) return 'ok';
    if (clamped > 33) return 'warn';
    return 'danger';
}

interface Segment {
    fillPath: string;
    strokePath: string;
    band: Band;
}

function buildSegments(pts: { x: number; y: number; pct: number }[]): Segment[] {
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
            // Close the run at the boundary point so segments stay contiguous
            // (no gap between bands), then start the next run from that same
            // point.
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

export function TimelineHealthLane({ data, domainMs }: TimelineHealthLaneProps) {
    const segments = useMemo(() => {
        if (data.length === 0) return [];
        const max = Math.max(...data.map(d => d.value), 1);
        const pts = data.map(d => ({
            x: (d.time - domainMs[0]) / (domainMs[1] - domainMs[0]),
            y: 1 - d.value / max,
            pct: d.value,
        }));
        return buildSegments(pts);
    }, [data, domainMs]);

    if (data.length === 0) {
        return (
            <div className="flex items-center mb-0.5" style={{ height: 32 }}>
                <div className="w-[90px] text-right pr-2.5 text-[10px] font-medium" style={{ color: 'var(--axi-series-metric-health)' }}>Health</div>
                <div
                    className="flex-1 h-full flex items-center justify-center"
                    style={{ background: 'var(--axi-ground)', border: 'var(--axi-border-control) solid var(--axi-ink-line)' }}
                >
                    <span className="text-[8px]" style={{ color: 'var(--axi-text-faint)' }}>No data</span>
                </div>
            </div>
        );
    }

    const status = STATUS_COLORS;

    return (
        <div className="flex items-center mb-0.5" style={{ height: 32 }}>
            <div className="w-[90px] text-right pr-2.5 text-[10px] font-medium shrink-0" style={{ color: 'var(--axi-series-metric-health)' }}>Health</div>
            <div
                className="flex-1 h-full overflow-hidden"
                style={{ background: 'var(--axi-ground)', border: 'var(--axi-border-control) solid var(--axi-ink-line)' }}
            >
                <svg width="100%" height="100%" viewBox="0 0 1 1" preserveAspectRatio="none">
                    {segments.map((seg, i) => (
                        <path key={`fill-${i}`} d={seg.fillPath} style={{ fill: status[seg.band] }} />
                    ))}
                    {segments.map((seg, i) => (
                        <path
                            key={`stroke-${i}`}
                            d={seg.strokePath}
                            fill="none"
                            style={{ stroke: status[seg.band] }}
                            strokeWidth={0.02}
                            vectorEffect="non-scaling-stroke"
                        />
                    ))}
                </svg>
            </div>
        </div>
    );
}
