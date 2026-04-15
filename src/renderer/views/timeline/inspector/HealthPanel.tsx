import { AreaChart, Area, ResponsiveContainer } from 'recharts';
import { getHealthInRange } from '../../../../shared/timelineInspector';

interface HealthPanelProps {
    healthPercent: [number, number][];
    startMs: number;
    endMs: number;
    downEvents: number[];
    deathEvents: number[];
}

export function HealthPanel({ healthPercent, startMs, endMs, downEvents, deathEvents }: HealthPanelProps) {
    const points = getHealthInRange(healthPercent, startMs, endMs);
    const chartData = points.map(([time, value]) => ({ time, value }));
    const startHealth = points.length > 0 ? points[0][1] : 0;
    const endHealth = points.length > 0 ? points[points.length - 1][1] : 0;

    const downsInRange = downEvents.filter(t => t >= startMs && t <= endMs);
    const deathsInRange = deathEvents.filter(t => t >= startMs && t <= endMs);

    const formatTime = (ms: number) => {
        const sec = Math.floor(ms / 1000);
        return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
    };

    return (
        <div className="bg-[#111] rounded-[5px] p-2.5 border border-[#1a1a1a]">
            <div className="text-[9px] text-[#10b981] mb-2 uppercase tracking-wider">Health Trajectory</div>
            {chartData.length > 1 ? (
                <div className="h-[50px] mb-1.5 relative">
                    <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={chartData} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
                            <Area type="monotone" dataKey="value" fill="#10b98133" stroke="#10b981" strokeWidth={1} isAnimationActive={false} />
                        </AreaChart>
                    </ResponsiveContainer>
                    <div className="absolute top-0.5 left-1 text-[9px] text-[#10b981]">{startHealth}%</div>
                    <div className="absolute bottom-0.5 right-1 text-[12px] font-bold" style={{ color: endHealth > 50 ? '#10b981' : endHealth > 20 ? '#f59e0b' : '#ef4444' }}>
                        {endHealth}%
                    </div>
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
