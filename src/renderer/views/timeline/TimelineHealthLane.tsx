import { useMemo } from 'react';
import type { TimelineBucket } from '../../../shared/types';
import { STATUS_COLORS, buildSegments } from './healthBands';

interface TimelineHealthLaneProps {
    data: TimelineBucket[];
    domainMs: [number, number];
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

    // Every other lane's label colour equals its body colour, and
    // series.css:36-39 says a chart's timeline-metric tokens are
    // deliberately NOT mapped onto --axi-ok/-warn/-danger. This lane is the
    // deliberate exception: the body already has to use the status inks (a
    // health trace is the one place "am I about to die" genuinely is a
    // status assertion, rule 5), so the label is pinned to --axi-ok to agree
    // with it rather than to --axi-series-metric-health. Don't revert this
    // on the strength of the series.css note alone.
    const labelColor = STATUS_COLORS.ok;

    if (data.length === 0) {
        return (
            <div className="flex items-center mb-0.5" style={{ height: 32 }}>
                <div className="w-[90px] text-right pr-2.5 text-[10px] font-medium" style={{ color: labelColor }}>Health</div>
                <div
                    className="flex-1 h-full flex items-center justify-center"
                    style={{ background: 'var(--axi-ground)', border: 'var(--axi-border-control) solid var(--axi-ink-line)' }}
                >
                    <span className="text-[8px]" style={{ color: 'var(--axi-text-faint)' }}>No data</span>
                </div>
            </div>
        );
    }

    return (
        <div className="flex items-center mb-0.5" style={{ height: 32 }}>
            <div className="w-[90px] text-right pr-2.5 text-[10px] font-medium shrink-0" style={{ color: labelColor }}>Health</div>
            <div
                className="flex-1 h-full overflow-hidden"
                style={{ background: 'var(--axi-ground)', border: 'var(--axi-border-control) solid var(--axi-ink-line)' }}
            >
                <svg width="100%" height="100%" viewBox="0 0 1 1" preserveAspectRatio="none">
                    {segments.map((seg, i) => (
                        <path key={`fill-${i}`} d={seg.fillPath} style={{ fill: STATUS_COLORS[seg.band] }} />
                    ))}
                    {segments.map((seg, i) => (
                        <path
                            key={`stroke-${i}`}
                            d={seg.strokePath}
                            fill="none"
                            style={{ stroke: 'var(--axi-ground)' }}
                            strokeWidth={0.02}
                            vectorEffect="non-scaling-stroke"
                        />
                    ))}
                </svg>
            </div>
        </div>
    );
}
