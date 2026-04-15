import { useMemo, useId } from 'react';
import type { TimelineBucket } from '../../../shared/types';

interface TimelineHealthLaneProps {
    data: TimelineBucket[];
    domainMs: [number, number];
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
    const b = Math.round(68 * (1 - t) + 8 * t);
    return `rgb(${r},${g},${b})`;
}

export function TimelineHealthLane({ data, domainMs }: TimelineHealthLaneProps) {
    const gradientId = useId();

    const { path, stops } = useMemo(() => {
        if (data.length === 0) return { path: '', stops: [], maxVal: 0 };
        const max = Math.max(...data.map(d => d.value), 1);
        const pts = data.map(d => ({
            x: (d.time - domainMs[0]) / (domainMs[1] - domainMs[0]),
            y: 1 - d.value / max,
            pct: d.value,
        }));

        let d = `M ${pts[0].x} ${pts[0].y}`;
        for (let i = 1; i < pts.length; i++) {
            d += ` L ${pts[i].x} ${pts[i].y}`;
        }
        const fillPath = `${d} L ${pts[pts.length - 1].x} 1 L ${pts[0].x} 1 Z`;

        const colorStops = pts.map(p => ({
            offset: p.x,
            color: healthColor(p.pct),
        }));

        return { path: fillPath, stops: colorStops };
    }, [data, domainMs]);

    if (data.length === 0) {
        return (
            <div className="flex items-center mb-0.5" style={{ height: 32 }}>
                <div className="w-[90px] text-right pr-2.5 text-[10px] font-medium" style={{ color: '#10b981' }}>Health</div>
                <div className="flex-1 h-full bg-[#0f0f0f] rounded border border-[#1a1a1a] flex items-center justify-center">
                    <span className="text-[8px] text-[#333]">No data</span>
                </div>
            </div>
        );
    }

    const strokePath = useMemo(() => {
        if (data.length === 0) return '';
        const max = Math.max(...data.map(d => d.value), 1);
        const pts = data.map(d => ({
            x: (d.time - domainMs[0]) / (domainMs[1] - domainMs[0]),
            y: 1 - d.value / max,
        }));
        let d = `M ${pts[0].x} ${pts[0].y}`;
        for (let i = 1; i < pts.length; i++) {
            d += ` L ${pts[i].x} ${pts[i].y}`;
        }
        return d;
    }, [data, domainMs]);

    return (
        <div className="flex items-center mb-0.5" style={{ height: 32 }}>
            <div className="w-[90px] text-right pr-2.5 text-[10px] font-medium shrink-0" style={{ color: '#10b981' }}>Health</div>
            <div className="flex-1 h-full bg-[#0f0f0f] rounded border border-[#1a1a1a] overflow-hidden">
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
                    <path d={path} fill={`url(#${gradientId})`} />
                    <path d={strokePath} fill="none" stroke={`url(#${gradientId}-stroke)`} strokeWidth={0.02} vectorEffect="non-scaling-stroke" />
                </svg>
            </div>
        </div>
    );
}
