import { useMemo } from 'react';
import { getHealthInRange } from '../../../../shared/timelineInspector';

interface HealthPanelProps {
    healthPercent: [number, number][];
    startMs: number;
    endMs: number;
    downEvents: number[];
    deathEvents: number[];
}

// Health is status (rule 5), so it reads through the fixed --axi-ok/-warn/
// -danger inks rather than a continuous red-amber-green blend — rule 2
// forbids the gradient/opacity that used to draw it. These are CSS
// declarations (style={{}}), which parse var() fine.
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

export function HealthPanel({ healthPercent, startMs, endMs, downEvents, deathEvents }: HealthPanelProps) {
    const points = getHealthInRange(healthPercent, startMs, endMs);
    const startHealth = points.length > 0 ? Math.round(points[0][1]) : 0;
    const endHealth = points.length > 0 ? Math.round(points[points.length - 1][1]) : 0;

    const downsInRange = downEvents.filter(t => t >= startMs && t <= endMs);
    const deathsInRange = deathEvents.filter(t => t >= startMs && t <= endMs);

    const segments = useMemo(() => {
        if (points.length < 2) return [];
        const rangeMs = endMs - startMs;
        const max = Math.max(...points.map(p => p[1]), 1);
        const pts = points.map(p => ({
            x: (p[0] - startMs) / rangeMs,
            y: 1 - p[1] / max,
            pct: p[1],
        }));
        return buildSegments(pts);
    }, [points, startMs, endMs]);

    const formatTime = (ms: number) => {
        const sec = Math.floor(ms / 1000);
        return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
    };

    return (
        <div className="axi-panel p-2.5">
            <div className="axi-eyebrow" style={{ color: 'var(--axi-ok)' }}>Health Trajectory</div>
            {points.length > 1 ? (
                <div className="h-[50px] mb-1.5 relative">
                    <svg width="100%" height="100%" viewBox="0 0 1 1" preserveAspectRatio="none">
                        {segments.map((seg, i) => (
                            <path key={`fill-${i}`} d={seg.fillPath} style={{ fill: STATUS_COLORS[seg.band] }} />
                        ))}
                        {segments.map((seg, i) => (
                            <path
                                key={`stroke-${i}`}
                                d={seg.strokePath}
                                fill="none"
                                style={{ stroke: STATUS_COLORS[seg.band] }}
                                strokeWidth={0.02}
                                vectorEffect="non-scaling-stroke"
                            />
                        ))}
                    </svg>
                    <div className="absolute top-0.5 left-1 text-[9px]" style={{ color: STATUS_COLORS[healthBand(startHealth)] }}>{startHealth}%</div>
                    <div className="absolute bottom-0.5 right-1 text-[12px] font-bold" style={{ color: STATUS_COLORS[healthBand(endHealth)] }}>
                        {endHealth}%
                    </div>
                </div>
            ) : points.length === 1 ? (
                <div className="h-[50px] flex items-center justify-center mb-1.5">
                    <span className="text-[18px] font-bold" style={{ color: STATUS_COLORS[healthBand(startHealth)] }}>{startHealth}%</span>
                    <span className="text-[9px] ml-1.5" style={{ color: 'var(--axi-text-faint)' }}>stable</span>
                </div>
            ) : (
                <div className="h-[50px] flex items-center justify-center text-[10px]" style={{ color: 'var(--axi-text-faint)' }}>No health data</div>
            )}
            <div className="text-[9px] space-y-0.5" style={{ color: 'var(--axi-text-dim)' }}>
                {downsInRange.map((t, i) => (
                    <div key={i}><span style={{ color: 'var(--axi-warn)' }}>⬇ Downed</span> at {formatTime(t)}</div>
                ))}
                {deathsInRange.map((t, i) => (
                    <div key={i}><span style={{ color: 'var(--axi-danger)' }}>💀 Dead</span> at {formatTime(t)}</div>
                ))}
            </div>
        </div>
    );
}
