import { useMemo } from 'react';
import type { TimelineBucket } from '../../../shared/types';

interface TimelineLaneProps {
    label: string;
    color: string;
    data: TimelineBucket[];
    domainMs: [number, number];
}

export function TimelineLane({ label, color, data, domainMs }: TimelineLaneProps) {
    if (data.length === 0) {
        return (
            <div className="flex items-center mb-0.5" style={{ height: 32 }}>
                <div className="w-[90px] text-right pr-2.5 text-[10px] font-medium" style={{ color }}>{label}</div>
                <div className="flex-1 h-full bg-[#0f0f0f] rounded border border-[#1a1a1a] flex items-center justify-center">
                    <span className="text-[8px] text-[#333]">No data</span>
                </div>
            </div>
        );
    }

    const { fillPath, strokePath } = useMemo(() => {
        const sorted = data.map(d => d.value).sort((a, b) => a - b);
        const p95Idx = Math.floor(sorted.length * 0.95);
        const p95 = sorted[p95Idx] || sorted[sorted.length - 1];
        const absMax = sorted[sorted.length - 1];
        const maxVal = Math.max(1, p95 < absMax * 0.5 ? p95 * 1.2 : absMax);
        const range = domainMs[1] - domainMs[0];
        const pts = data.map(d => ({
            x: (d.time - domainMs[0]) / range,
            y: Math.max(0, 1 - d.value / maxVal),
        }));

        let d = `M ${pts[0].x} ${pts[0].y}`;
        for (let i = 1; i < pts.length; i++) {
            d += ` L ${pts[i].x} ${pts[i].y}`;
        }

        const fill = `${d} L ${pts[pts.length - 1].x} 1 L ${pts[0].x} 1 Z`;
        return { fillPath: fill, strokePath: d };
    }, [data, domainMs]);

    return (
        <div className="flex items-center mb-0.5" style={{ height: 32 }}>
            <div className="w-[90px] text-right pr-2.5 text-[10px] font-medium shrink-0" style={{ color }}>{label}</div>
            <div className="flex-1 h-full bg-[#0f0f0f] rounded border border-[#1a1a1a] overflow-hidden">
                <svg width="100%" height="100%" viewBox="0 0 1 1" preserveAspectRatio="none">
                    <path d={fillPath} fill={`${color}55`} />
                    <path d={strokePath} fill="none" stroke={color} strokeWidth={1} vectorEffect="non-scaling-stroke" />
                </svg>
            </div>
        </div>
    );
}
