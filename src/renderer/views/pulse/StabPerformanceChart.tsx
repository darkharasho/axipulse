import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
    Bar, Brush, CartesianGrid, Cell, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { MapPin, Shield, Skull } from 'lucide-react';
import type { StabPerfBreakdown } from '../../../shared/types';
import { getProfessionColor } from '../../../shared/professionUtils';

const PARTY_MEMBER_COLORS = [
    '#a78bfa', '#34d399', '#f59e0b', '#60a5fa', '#f472b6',
    '#fb923c', '#4ade80', '#e879f9', '#38bdf8', '#fbbf24',
];

const FALLBACK_SELF_COLOR = '#10b981';
const DISTANCE_THRESHOLD = 600;

type Props = {
    breakdown: StabPerfBreakdown;
    localProfession: string;
};

type ChartPoint = {
    label: string;
    value: number;
    incomingDamage: number;
    incomingIntensity: number;
    incomingHeatBand: 1;
    [memberKey: string]: any; // pm_<key>, deaths_<key>, distance_<key>
};

export function StabPerformanceChart({ breakdown, localProfession }: Props) {
    const [showHeatmap, setShowHeatmap] = useState(true);
    const [showDeaths, setShowDeaths] = useState(true);
    const [showDistance, setShowDistance] = useState(true);

    const selfColor = getProfessionColor(localProfession) || FALLBACK_SELF_COLOR;

    const { data, hasIncomingHeat, partyColorByKey } = useMemo(() => {
        const incomingMax = breakdown.partyIncomingDamage.reduce((m, v) => Math.max(m, v), 0);
        const colorByKey = Object.fromEntries(
            breakdown.partyMembers.map((m, mi) => [m.key, PARTY_MEMBER_COLORS[mi % PARTY_MEMBER_COLORS.length]] as const),
        );
        const points: ChartPoint[] = breakdown.buckets.map((b, i) => {
            const incomingDamage = breakdown.partyIncomingDamage[i] ?? 0;
            const intensity = incomingMax > 0 ? Math.max(0, Math.min(1, incomingDamage / incomingMax)) : 0;
            const point: ChartPoint = {
                label: b.label,
                value: breakdown.selfGeneration[i] ?? 0,
                incomingDamage,
                incomingIntensity: intensity,
                incomingHeatBand: 1,
            };
            for (const m of breakdown.partyMembers) {
                point[`pm_${m.key}`] = m.stacks[i] ?? 0;
                point[`deaths_${m.key}`] = m.deaths[i] ?? 0;
                point[`distance_${m.key}`] = m.distances[i] ?? 0;
            }
            return point;
        });
        return { data: points, hasIncomingHeat: incomingMax > 0, partyColorByKey: colorByKey };
    }, [breakdown]);

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3, duration: 0.3 }}
        >
            <div className="flex items-center justify-between mb-3">
                <div className="text-xs uppercase tracking-[0.08em] font-medium flex items-center gap-1.5"
                    style={{ color: 'var(--text-muted)' }}>
                    <Shield className="w-3.5 h-3.5 text-violet-300" />
                    Stab Performance
                </div>
                <div className="flex gap-3">
                    <ToggleButton active={showHeatmap} onClick={() => setShowHeatmap(v => !v)}
                        activeColor="text-red-300" hoverActive="hover:text-red-200">
                        Party Damage
                    </ToggleButton>
                    <ToggleButton active={showDeaths} onClick={() => setShowDeaths(v => !v)}
                        activeColor="text-red-400" hoverActive="hover:text-red-300">
                        Deaths
                    </ToggleButton>
                    <ToggleButton active={showDistance} onClick={() => setShowDistance(v => !v)}
                        activeColor="text-yellow-300" hoverActive="hover:text-yellow-200"
                        title={`Flags party members averaging more than ${DISTANCE_THRESHOLD} units from the commander`}>
                        Distance
                    </ToggleButton>
                </div>
            </div>

            {breakdown.partyMembers.length > 0 ? (
                <div className="flex flex-wrap gap-x-4 gap-y-1 mb-2">
                    {breakdown.partyMembers.map(m => (
                        <div key={m.key} className="flex items-center gap-1.5">
                            <div className="w-5 h-0"
                                style={{ borderTop: `2px dashed ${partyColorByKey[m.key]}` }} />
                            <span className="text-[10px] text-[color:var(--text-muted)]">{m.displayName}</span>
                        </div>
                    ))}
                </div>
            ) : (
                <div className="text-[10px] text-[color:var(--text-muted)] mb-2 italic">
                    No group-mates in this fight
                </div>
            )}

            <div className="h-[260px] rounded-md p-2" style={{ background: 'var(--bg-card)' }}>
                <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={data}>
                        <CartesianGrid stroke="rgba(255,255,255,0.08)" strokeDasharray="3 3" />
                        <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#64748b' }}
                            axisLine={{ stroke: 'rgba(255,255,255,0.08)' }} tickLine={false} />
                        <YAxis tick={{ fontSize: 10, fill: '#64748b' }}
                            axisLine={{ stroke: 'rgba(255,255,255,0.08)' }} tickLine={false}
                            tickFormatter={(v: number) => v.toFixed(1)} width={36} />
                        <YAxis yAxisId="incomingHeat" hide domain={[0, 1]} />
                        <YAxis yAxisId="stabStacks" orientation="right"
                            domain={[0, 25]} ticks={[0, 5, 10, 15, 20, 25]}
                            tick={{ fontSize: 10, fill: '#64748b' }}
                            axisLine={{ stroke: 'rgba(255,255,255,0.08)' }} tickLine={false}
                            width={32} />
                        <Tooltip content={(props: any) => (
                            <StabTooltip {...props} breakdown={breakdown}
                                partyColorByKey={partyColorByKey}
                                selfColor={selfColor}
                                showHeatmap={showHeatmap}
                                showDeaths={showDeaths}
                                showDistance={showDistance} />
                        )} />
                        {showHeatmap && hasIncomingHeat && (
                            <Bar
                                yAxisId="incomingHeat"
                                dataKey="incomingHeatBand"
                                barSize={24}
                                fill="rgba(239,68,68,0.35)"
                                stroke="none"
                                isAnimationActive={false}
                            >
                                {data.map((entry, idx) => {
                                    const alpha = 0.06 + 0.52 * entry.incomingIntensity;
                                    return <Cell key={`heat-${idx}`} fill={`rgba(239, 68, 68, ${alpha.toFixed(3)})`} />;
                                })}
                            </Bar>
                        )}
                        <Line type="monotone" dataKey="value"
                            name="Self Stab Generation"
                            stroke={selfColor} strokeWidth={2}
                            dot={{ r: 2, fill: selfColor }}
                            activeDot={{ r: 4 }}
                            isAnimationActive animationDuration={500} animationEasing="ease-out" />
                        {breakdown.partyMembers.map(m => {
                            const color = partyColorByKey[m.key];
                            return (
                                <Line key={m.key}
                                    yAxisId="stabStacks"
                                    type="monotone"
                                    dataKey={`pm_${m.key}`}
                                    name={m.displayName}
                                    stroke={color} strokeWidth={1.5} strokeDasharray="4 2"
                                    dot={(props: any) => {
                                        const point = props.payload;
                                        if (!point) return null;
                                        const deaths = Number(point[`deaths_${m.key}`] || 0);
                                        const distance = Number(point[`distance_${m.key}`] || 0);
                                        const hasDeath = showDeaths && deaths > 0;
                                        const hasFar = showDistance && distance > DISTANCE_THRESHOLD;
                                        if (!hasDeath && !hasFar) return null;
                                        const size = 16;
                                        const half = size / 2;
                                        return (
                                            <g transform={`translate(${props.cx - half}, ${props.cy - half})`}>
                                                {hasDeath && <Skull width={size} height={size} color="#ffffff" strokeWidth={2} />}
                                                {!hasDeath && hasFar && <MapPin width={size} height={size} color="#fbbf24" strokeWidth={2} />}
                                            </g>
                                        );
                                    }}
                                    activeDot={{ r: 3, fill: color }}
                                    isAnimationActive animationDuration={500} animationEasing="ease-out" />
                            );
                        })}
                        {data.length > 10 && (
                            <Brush dataKey="label" height={20}
                                stroke="rgba(129,140,248,0.4)" fill="rgba(15,23,42,0.8)"
                                travellerWidth={8} tickFormatter={() => ''} />
                        )}
                    </ComposedChart>
                </ResponsiveContainer>
            </div>
        </motion.div>
    );
}

function ToggleButton({
    active, onClick, activeColor, hoverActive, title, children,
}: {
    active: boolean;
    onClick: () => void;
    activeColor: string;
    hoverActive: string;
    title?: string;
    children: React.ReactNode;
}) {
    return (
        <button
            onClick={onClick}
            title={title}
            className={`text-[10px] uppercase tracking-wider transition-colors ${
                active ? `${activeColor} ${hoverActive}` : 'text-slate-500 hover:text-slate-300'
            }`}
        >
            {children}
        </button>
    );
}

function StabTooltip({
    payload, label, breakdown, partyColorByKey, selfColor, showHeatmap, showDeaths, showDistance,
}: {
    payload?: any[];
    label?: string;
    breakdown: StabPerfBreakdown;
    partyColorByKey: Record<string, string>;
    selfColor: string;
    showHeatmap: boolean;
    showDeaths: boolean;
    showDistance: boolean;
}) {
    if (!payload || payload.length === 0) return null;
    const point = payload[0]?.payload || {};
    const gen = Number(point.value || 0);
    const damage = Number(point.incomingDamage || 0);
    const sortedMembers = [...breakdown.partyMembers]
        .sort((a, b) => a.displayName.localeCompare(b.displayName));

    return (
        <div className="bg-slate-900 border border-white/10 rounded-lg px-3 py-2 text-xs shadow-xl">
            <div className="text-slate-200 font-medium mb-1">
                {String(label || '')}
                {gen > 0 && (
                    <span style={{ color: selfColor }}>{` · Gen: ${gen.toFixed(2)} stacks`}</span>
                )}
            </div>
            {showHeatmap && damage > 0 && (
                <div className="text-red-300 mb-1">
                    Party Incoming Damage: {Math.round(damage).toLocaleString()}
                </div>
            )}
            {sortedMembers.map(m => {
                const color = partyColorByKey[m.key];
                const stacks = Number(point[`pm_${m.key}`] ?? 0);
                const deaths = Number(point[`deaths_${m.key}`] || 0);
                const distance = Number(point[`distance_${m.key}`] || 0);
                const hasFar = distance > DISTANCE_THRESHOLD;
                return (
                    <div key={m.key} style={{ color }} className="py-px flex items-center gap-1">
                        <span>{m.displayName}</span>
                        <span>: {stacks === 0 ? 'No stab' : `${stacks.toFixed(1)} stacks`}</span>
                        {showDistance && distance > 0 && (
                            <span className={`flex items-center gap-0.5 ${hasFar ? 'text-yellow-400' : 'text-slate-400'}`}>
                                <MapPin className="inline w-3 h-3" />
                                {Math.round(distance)}u
                            </span>
                        )}
                        {showDeaths && deaths > 0 && <Skull className="inline w-3.5 h-3.5 text-white" />}
                    </div>
                );
            })}
        </div>
    );
}
