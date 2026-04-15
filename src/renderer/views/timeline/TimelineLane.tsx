import { AreaChart, Area, XAxis, YAxis, ResponsiveContainer } from 'recharts';
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

    return (
        <div className="flex items-center mb-0.5" style={{ height: 32 }}>
            <div className="w-[90px] text-right pr-2.5 text-[10px] font-medium shrink-0" style={{ color }}>{label}</div>
            <div className="flex-1 h-full bg-[#0f0f0f] rounded border border-[#1a1a1a] overflow-hidden">
                <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={data} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
                        <XAxis dataKey="time" domain={domainMs} type="number" hide />
                        <YAxis hide />
                        <Area
                            type="monotone"
                            dataKey="value"
                            fill={`${color}33`}
                            stroke={color}
                            strokeWidth={1}
                            isAnimationActive={false}
                        />
                    </AreaChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
}
