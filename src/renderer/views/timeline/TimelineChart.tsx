// src/renderer/views/timeline/TimelineChart.tsx
import { ComposedChart, Area, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import type { TimelineData } from '../../../shared/types';
import type { TimelineLayerToggles } from '../../store';

interface TimelineChartProps {
    data: TimelineData;
    toggles: TimelineLayerToggles;
    durationMs: number;
}

export function TimelineChart({ data, toggles, durationMs: _durationMs }: TimelineChartProps) {
    const timeMap = new Map<number, Record<string, number>>();

    function addSeries(key: string, buckets: { time: number; value: number }[]) {
        for (const { time, value } of buckets) {
            const entry = timeMap.get(time) ?? { time };
            entry[key] = value;
            timeMap.set(time, entry);
        }
    }

    if (toggles.damageDealt) addSeries('damageDealt', data.damageDealt);
    if (toggles.damageTaken) addSeries('damageTaken', data.damageTaken);
    if (toggles.distanceToTag) addSeries('distanceToTag', data.distanceToTag);
    if (toggles.incomingHealing) addSeries('incomingHealing', data.incomingHealing);
    if (toggles.incomingBarrier) addSeries('incomingBarrier', data.incomingBarrier);

    const chartData = Array.from(timeMap.values()).sort((a, b) => a.time - b.time);

    if (chartData.length === 0) {
        return (
            <div className="flex items-center justify-center h-full text-[color:var(--text-muted)] text-xs">
                Enable layers above to see timeline data
            </div>
        );
    }

    const formatTick = (ms: number) => {
        const sec = Math.floor(ms / 1000);
        return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
    };

    return (
        <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData} margin={{ top: 5, right: 10, bottom: 5, left: 10 }}>
                <XAxis dataKey="time" tickFormatter={formatTick} tick={{ fontSize: 10, fill: '#8b929e' }} />
                <YAxis tick={{ fontSize: 10, fill: '#8b929e' }} width={45} />
                <Tooltip
                    labelFormatter={(label) => formatTick(Number(label))}
                    contentStyle={{ background: '#1a1f2e', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 4, fontSize: 11 }}
                />

                {data.deathEvents.map((t, i) => (
                    <ReferenceLine key={`death-${i}`} x={t} stroke="#ef4444" strokeDasharray="3 3" />
                ))}
                {data.downEvents.map((t, i) => (
                    <ReferenceLine key={`down-${i}`} x={t} stroke="#f59e0b" strokeDasharray="2 2" />
                ))}

                {toggles.damageDealt && <Area type="monotone" dataKey="damageDealt" fill="#ef444433" stroke="#ef4444" strokeWidth={1.5} />}
                {toggles.damageTaken && <Area type="monotone" dataKey="damageTaken" fill="#f8717133" stroke="#f87171" strokeWidth={1.5} />}
                {toggles.distanceToTag && <Line type="monotone" dataKey="distanceToTag" stroke="#f59e0b" strokeWidth={1.5} dot={false} />}
                {toggles.incomingHealing && <Area type="monotone" dataKey="incomingHealing" fill="#4ade8033" stroke="#4ade80" strokeWidth={1.5} />}
                {toggles.incomingBarrier && <Area type="monotone" dataKey="incomingBarrier" fill="#a78bfa33" stroke="#a78bfa" strokeWidth={1.5} />}
            </ComposedChart>
        </ResponsiveContainer>
    );
}
