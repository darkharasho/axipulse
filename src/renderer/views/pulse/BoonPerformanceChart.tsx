import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
    Bar, Brush, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip as RechartsTooltip, XAxis, YAxis,
} from 'recharts';
import { MapPin, Shield, Skull } from 'lucide-react';
import type { BoonPerfBreakdown, BoonPerformanceData } from '../../../shared/types';
import { useAppStore } from '../../store';
import { readToken } from '../../themes/readToken';
import { SubviewCapsule } from '../../app/SubviewCapsule';
import Tooltip from '../../components/Tooltip';

// Series tokens are accent-independent (Task 3), so the ramp only needs to
// be read once - but not at module-evaluation time: this module can be
// imported (via the static App -> AppLayout -> PulseView -> BoonsSubview
// chain) before series.css has been evaluated, which would resolve every
// entry to readToken's 'currentColor' fallback. Lazy + cached avoids
// depending on import order in a file this one doesn't control.
let SERIES: string[] | null = null;
const getSeries = () => (SERIES ??= Array.from({ length: 10 }, (_, i) => readToken(`--axi-series-${i + 1}`)));

const DISTANCE_THRESHOLD = 600;

type BoonKey = 'stability' | 'might';

const BOON_LABELS: Record<BoonKey, string> = {
    stability: 'Stab',
    might: 'Might',
};

const BOON_PILLS = (Object.keys(BOON_LABELS) as BoonKey[]).map(key => ({ id: key, label: BOON_LABELS[key] }));

type Props = {
    performance: BoonPerformanceData;
};

type ChartPoint = {
    label: string;
    value: number;
    incomingDamage: number;
    incomingIntensity: number;
    [memberKey: string]: any; // pm_<key>, deaths_<key>, distance_<key>
};

export function BoonPerformanceChart({ performance }: Props) {
    const [activeBoon, setActiveBoon] = useState<BoonKey>('stability');
    const [showHeatmap, setShowHeatmap] = useState(true);
    const [showDeaths, setShowDeaths] = useState(true);
    const [showDistance, setShowDistance] = useState(true);

    const accentId = useAppStore(s => s.accentId);
    // The self series is the app's own colour rather than domain data, so it
    // tracks the accent - and must re-read when the accent changes, since
    // readToken reads computed style at call time.
    const selfColor = useMemo(() => readToken('--axi-accent'), [accentId]);

    const breakdown = performance[activeBoon];

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3, duration: 0.3 }}
        >
            <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
                <div className="flex items-center gap-3">
                    <span className="axi-eyebrow flex items-center gap-1.5" style={{ margin: 0 }}>
                        <Shield className="w-3.5 h-3.5" style={{ color: 'var(--axi-text-faint)' }} />
                        Boon Performance
                    </span>
                    <SubviewCapsule
                        pills={BOON_PILLS}
                        activeId={activeBoon}
                        onSelect={(id) => setActiveBoon(id as BoonKey)}
                        layoutGroup="boon-perf"
                    />
                </div>
                <div className="flex gap-3">
                    <ToggleButton active={showHeatmap} onClick={() => setShowHeatmap(v => !v)} ink="var(--axi-danger)">
                        Party Damage
                    </ToggleButton>
                    <ToggleButton active={showDeaths} onClick={() => setShowDeaths(v => !v)} ink="var(--axi-danger)">
                        Deaths
                    </ToggleButton>
                    <Tooltip
                        text={`Flags party members averaging more than ${DISTANCE_THRESHOLD} units from the commander`}
                        position="bottom"
                    >
                        <ToggleButton active={showDistance} onClick={() => setShowDistance(v => !v)} ink="var(--axi-warn)">
                            Distance
                        </ToggleButton>
                    </Tooltip>
                </div>
            </div>

            {breakdown ? (
                <ChartBody
                    breakdown={breakdown}
                    selfColor={selfColor}
                    showHeatmap={showHeatmap}
                    showDeaths={showDeaths}
                    showDistance={showDistance}
                />
            ) : (
                <div className="h-[260px] p-2 flex items-center justify-center text-xs italic"
                    style={{ color: 'var(--axi-text-faint)' }}>
                    No {BOON_LABELS[activeBoon].toLowerCase()} data for this fight
                </div>
            )}
        </motion.div>
    );
}

function ChartBody({
    breakdown, selfColor, showHeatmap, showDeaths, showDistance,
}: {
    breakdown: BoonPerfBreakdown;
    selfColor: string;
    showHeatmap: boolean;
    showDeaths: boolean;
    showDistance: boolean;
}) {
    const accentId = useAppStore(s => s.accentId);
    // Chrome tokens read under the same accentId dependency as selfColor -
    // --axi-text-faint/-rule/-ink-line/-ground/-warn don't themselves move
    // with the accent, but one rule for every token read in this file is
    // simpler than reasoning about which ones do.
    const tickColor = useMemo(() => readToken('--axi-text-faint'), [accentId]);
    const ruleColor = useMemo(() => readToken('--axi-rule'), [accentId]);
    const controlLineColor = useMemo(() => readToken('--axi-ink-line'), [accentId]);
    // --axi-surface, not --axi-ground: the ground colour is near-identical
    // to the ink-line outline, which left the brush control almost
    // contrastless against its own border.
    const brushFillColor = useMemo(() => readToken('--axi-surface'), [accentId]);
    const dangerColor = useMemo(() => readToken('--axi-danger'), [accentId]);
    const warnColor = useMemo(() => readToken('--axi-warn'), [accentId]);
    const textColor = useMemo(() => readToken('--axi-text'), [accentId]);

    const { data, hasIncomingHeat, partyColorByKey } = useMemo(() => {
        const incomingMax = breakdown.partyIncomingDamage.reduce((m, v) => Math.max(m, v), 0);
        // The self line already claims one ink (selfColor, accent-derived);
        // drop any ramp entry that resolves to the same value so a party
        // member never lands on top of it. A resolved-value comparison,
        // not a slot index, so this holds for every accent, not just the
        // ones we happened to notice collide (emerald-mint == series-2).
        const availableSeries = getSeries().filter(c => c !== selfColor);
        const colorByKey = Object.fromEntries(
            breakdown.partyMembers.map((m, mi) => [m.key, availableSeries[mi % availableSeries.length]] as const),
        );
        const points: ChartPoint[] = breakdown.buckets.map((b, i) => {
            const incomingDamage = breakdown.partyIncomingDamage[i] ?? 0;
            const intensity = incomingMax > 0 ? Math.max(0, Math.min(1, incomingDamage / incomingMax)) : 0;
            const point: ChartPoint = {
                label: b.label,
                value: breakdown.selfGeneration[i] ?? 0,
                incomingDamage,
                incomingIntensity: intensity,
            };
            for (const m of breakdown.partyMembers) {
                point[`pm_${m.key}`] = m.stacks[i] ?? 0;
                point[`deaths_${m.key}`] = m.deaths[i] ?? 0;
                point[`distance_${m.key}`] = m.distances[i] ?? 0;
            }
            return point;
        });
        return { data: points, hasIncomingHeat: incomingMax > 0, partyColorByKey: colorByKey };
    }, [breakdown, selfColor]);

    return (
        <>
            {breakdown.partyMembers.length > 0 ? (
                <div className="flex flex-wrap gap-x-4 gap-y-1 mb-2">
                    {breakdown.partyMembers.map(m => (
                        <div key={m.key} className="flex items-center gap-1.5">
                            <div className="w-5 h-0"
                                style={{ borderTop: `2px dashed ${partyColorByKey[m.key]}` }} />
                            <span className="text-[10px] text-[color:var(--axi-text-faint)]">{m.displayName}</span>
                        </div>
                    ))}
                </div>
            ) : (
                <div className="text-[10px] text-[color:var(--axi-text-faint)] mb-2 italic">
                    No group-mates in this fight
                </div>
            )}

            <div className="h-[260px] p-2"
                style={{ background: 'var(--axi-surface)', border: 'var(--axi-border-panel) solid var(--axi-ink-line)' }}>
                <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={data}>
                        <CartesianGrid stroke={ruleColor} strokeDasharray="3 3" />
                        <XAxis dataKey="label" tick={{ fontSize: 10, fill: tickColor }}
                            axisLine={{ stroke: ruleColor }} tickLine={false} />
                        <YAxis tick={{ fontSize: 10, fill: tickColor }}
                            axisLine={{ stroke: ruleColor }} tickLine={false}
                            tickFormatter={(v: number) => v.toFixed(1)} width={36} />
                        <YAxis yAxisId="incomingHeat" hide domain={[0, 1]} />
                        <YAxis yAxisId="boonStacks" orientation="right"
                            domain={[0, 25]} ticks={[0, 5, 10, 15, 20, 25]}
                            tick={{ fontSize: 10, fill: tickColor }}
                            axisLine={{ stroke: ruleColor }} tickLine={false}
                            width={32} />
                        <RechartsTooltip content={(props: any) => (
                            <BoonTooltip {...props} breakdown={breakdown}
                                partyColorByKey={partyColorByKey}
                                selfColor={selfColor}
                                showHeatmap={showHeatmap}
                                showDeaths={showDeaths}
                                showDistance={showDistance} />
                        )} />
                        {showHeatmap && hasIncomingHeat && (
                            // Incoming party damage per bucket is a quantity, drawn as
                            // length (bar height against the hidden 0-1 axis), never as
                            // colour intensity (rule 7) - a solid danger fill, not a
                            // per-cell alpha ramp.
                            <Bar
                                yAxisId="incomingHeat"
                                dataKey="incomingIntensity"
                                barSize={24}
                                fill={dangerColor}
                                stroke="none"
                                isAnimationActive={false}
                            />
                        )}
                        <Line type="monotone" dataKey="value"
                            name="Self Generation"
                            stroke={selfColor} strokeWidth={2}
                            dot={{ r: 2, fill: selfColor }}
                            activeDot={{ r: 4 }}
                            isAnimationActive animationDuration={500} animationEasing="ease-out" />
                        {breakdown.partyMembers.map(m => {
                            const color = partyColorByKey[m.key];
                            return (
                                <Line key={m.key}
                                    yAxisId="boonStacks"
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
                                                {hasDeath && <Skull width={size} height={size} color={textColor} strokeWidth={2} />}
                                                {!hasDeath && hasFar && <MapPin width={size} height={size} color={warnColor} strokeWidth={2} />}
                                            </g>
                                        );
                                    }}
                                    activeDot={{ r: 3, fill: color }}
                                    isAnimationActive animationDuration={500} animationEasing="ease-out" />
                            );
                        })}
                        {data.length > 10 && (
                            <Brush dataKey="label" height={20}
                                stroke={controlLineColor} fill={brushFillColor}
                                travellerWidth={8} tickFormatter={() => ''} />
                        )}
                    </ComposedChart>
                </ResponsiveContainer>
            </div>
        </>
    );
}

function ToggleButton({
    active, onClick, ink, children,
}: {
    active: boolean;
    onClick: () => void;
    ink: string;
    children: React.ReactNode;
}) {
    return (
        <button
            onClick={onClick}
            className={`ap-chart-toggle ${active ? 'ap-chart-toggle--active' : ''}`}
            style={active ? ({ '--ap-chart-toggle-ink': ink } as React.CSSProperties) : undefined}
        >
            {children}
        </button>
    );
}

function BoonTooltip({
    payload, label, breakdown, partyColorByKey, selfColor, showHeatmap, showDeaths, showDistance,
}: {
    payload?: any[];
    label?: string;
    breakdown: BoonPerfBreakdown;
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
        <div className="ap-chart-tooltip">
            <div style={{ color: 'var(--axi-text)' }}>
                {String(label || '')}
                {gen > 0 && (
                    <span style={{ color: selfColor }}>{` · Gen: ${gen.toFixed(2)} stacks`}</span>
                )}
            </div>
            {showHeatmap && damage > 0 && (
                <div style={{ color: 'var(--axi-danger)' }}>
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
                        <span>: {stacks === 0 ? 'None' : `${stacks.toFixed(1)} stacks`}</span>
                        {showDistance && distance > 0 && (
                            <span className="flex items-center gap-0.5" style={{ color: hasFar ? 'var(--axi-warn)' : 'var(--axi-text-dim)' }}>
                                <MapPin className="inline w-3 h-3" />
                                {Math.round(distance)}u
                            </span>
                        )}
                        {showDeaths && deaths > 0 && <Skull className="inline w-3.5 h-3.5" style={{ color: 'var(--axi-text)' }} />}
                    </div>
                );
            })}
        </div>
    );
}
