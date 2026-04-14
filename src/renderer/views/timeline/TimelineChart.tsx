// src/renderer/views/timeline/TimelineChart.tsx
import { ComposedChart, Area, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import type { TimelineData } from '../../../shared/types';
import type { TimelineLayerToggles } from '../../store';

const PIN_PATH = 'M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0';
const SKULL_PATH = 'M12 2a8 8 0 0 0-8 8c0 2.5 1.2 4.7 3 6.2V18a1 1 0 0 0 1 1h1v1a1 1 0 0 0 2 0v-1h2v1a1 1 0 0 0 2 0v-1h1a1 1 0 0 0 1-1v-1.8c1.8-1.5 3-3.7 3-6.2a8 8 0 0 0-8-8zm-2.5 9a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm5 0a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3z';

function DownLabel({ viewBox }: { viewBox?: { x?: number; y?: number } }) {
    const x = viewBox?.x ?? 0;
    return (
        <g transform={`translate(${x - 7}, 2)`}>
            <svg width="14" height="16" viewBox="0 0 24 24">
                <path d={PIN_PATH} fill="#eab308" fillOpacity={0.6} stroke="#eab308" strokeWidth={1.5} />
            </svg>
        </g>
    );
}

function DeathLabel({ viewBox }: { viewBox?: { x?: number; y?: number } }) {
    const x = viewBox?.x ?? 0;
    return (
        <g transform={`translate(${x - 7}, 2)`}>
            <svg width="14" height="16" viewBox="0 0 24 24">
                <path d={SKULL_PATH} fill="#ef4444" />
            </svg>
        </g>
    );
}

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
                    <ReferenceLine key={`death-${i}`} x={t} stroke="#ef4444" strokeDasharray="3 3" label={<DeathLabel />} />
                ))}
                {data.downEvents.map((t, i) => (
                    <ReferenceLine key={`down-${i}`} x={t} stroke="#f59e0b" strokeDasharray="2 2" label={<DownLabel />} />
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
