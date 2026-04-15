import { useMemo, useId } from 'react';
import { getHealthInRange } from '../../../../shared/timelineInspector';

interface HealthPanelProps {
    healthPercent: [number, number][];
    startMs: number;
    endMs: number;
    downEvents: number[];
    deathEvents: number[];
}

function healthColor(pct: number): string {
    const clamped = Math.max(0, Math.min(100, pct));
    if (clamped > 50) {
        const t = (clamped - 50) / 50;
        const r = Math.round(234 * (1 - t) + 16 * t);
        const g = Math.round(179 * (1 - t) + 185 * t);
        const b = Math.round(8 * (1 - t) + 129 * t);
        return `rgb(${r},${g},${b})`;
    }
    const t = clamped / 50;
    const r = Math.round(239 * (1 - t) + 234 * t);
    const g = Math.round(68 * (1 - t) + 179 * t);
    const b = Math.round(8 * (1 - t) + 8 * t);
    return `rgb(${r},${g},${b})`;
}

export function HealthPanel({ healthPercent, startMs, endMs, downEvents, deathEvents }: HealthPanelProps) {
    const points = getHealthInRange(healthPercent, startMs, endMs);
    const startHealth = points.length > 0 ? Math.round(points[0][1]) : 0;
    const endHealth = points.length > 0 ? Math.round(points[points.length - 1][1]) : 0;
    const gradientId = useId();

    const downsInRange = downEvents.filter(t => t >= startMs && t <= endMs);
    const deathsInRange = deathEvents.filter(t => t >= startMs && t <= endMs);

    const { fillPath, strokePath, stops } = useMemo(() => {
        if (points.length < 2) return { fillPath: '', strokePath: '', stops: [] };
        const rangeMs = endMs - startMs;
        const max = Math.max(...points.map(p => p[1]), 1);

        const pts = points.map(p => ({
            x: (p[0] - startMs) / rangeMs,
            y: 1 - p[1] / max,
            pct: p[1],
        }));

        let d = `M ${pts[0].x} ${pts[0].y}`;
        for (let i = 1; i < pts.length; i++) {
            d += ` L ${pts[i].x} ${pts[i].y}`;
        }
        const fill = `${d} L ${pts[pts.length - 1].x} 1 L ${pts[0].x} 1 Z`;

        const colorStops = pts.map(p => ({
            offset: p.x,
            color: healthColor(p.pct),
        }));

        return { fillPath: fill, strokePath: d, stops: colorStops };
    }, [points, startMs, endMs]);

    const formatTime = (ms: number) => {
        const sec = Math.floor(ms / 1000);
        return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
    };

    return (
        <div className="bg-[#111] rounded-[5px] p-2.5 border border-[#1a1a1a]">
            <div className="text-[9px] text-[#10b981] mb-2 uppercase tracking-wider">Health Trajectory</div>
            {points.length > 1 ? (
                <div className="h-[50px] mb-1.5 relative">
                    <svg width="100%" height="100%" viewBox="0 0 1 1" preserveAspectRatio="none">
                        <defs>
                            <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="0">
                                {stops.map((s, i) => (
                                    <stop key={i} offset={s.offset} stopColor={s.color} stopOpacity={0.3} />
                                ))}
                            </linearGradient>
                            <linearGradient id={`${gradientId}-stroke`} x1="0" y1="0" x2="1" y2="0">
                                {stops.map((s, i) => (
                                    <stop key={i} offset={s.offset} stopColor={s.color} stopOpacity={1} />
                                ))}
                            </linearGradient>
                        </defs>
                        <path d={fillPath} fill={`url(#${gradientId})`} />
                        <path d={strokePath} fill="none" stroke={`url(#${gradientId}-stroke)`} strokeWidth={0.02} vectorEffect="non-scaling-stroke" />
                    </svg>
                    <div className="absolute top-0.5 left-1 text-[9px]" style={{ color: healthColor(startHealth) }}>{startHealth}%</div>
                    <div className="absolute bottom-0.5 right-1 text-[12px] font-bold" style={{ color: healthColor(endHealth) }}>
                        {endHealth}%
                    </div>
                </div>
            ) : points.length === 1 ? (
                <div className="h-[50px] flex items-center justify-center mb-1.5">
                    <span className="text-[18px] font-bold" style={{ color: healthColor(startHealth) }}>{startHealth}%</span>
                    <span className="text-[9px] text-[#555] ml-1.5">stable</span>
                </div>
            ) : (
                <div className="h-[50px] flex items-center justify-center text-[10px] text-[#555]">No health data</div>
            )}
            <div className="text-[9px] text-[#888] space-y-0.5">
                {downsInRange.map((t, i) => (
                    <div key={i}><span className="text-[#f59e0b]">⬇ Downed</span> at {formatTime(t)}</div>
                ))}
                {deathsInRange.map((t, i) => (
                    <div key={i}><span className="text-[#ef4444]">💀 Dead</span> at {formatTime(t)}</div>
                ))}
            </div>
        </div>
    );
}
