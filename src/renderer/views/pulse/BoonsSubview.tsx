import { motion } from 'framer-motion';
import type { PlayerFightData } from '../../../shared/types';
import { MAX_BOON_STACKS } from '../../../shared/boonData';
import { StabPerformanceChart } from './StabPerformanceChart';

const BOON_COLORS: Record<string, string> = {
    Might: '#e85d3a',
    Fury: '#e8983a',
    Quickness: '#c06cf0',
    Alacrity: '#f06cbe',
    Protection: '#5b9bd5',
    Regeneration: '#4ade80',
    Vigor: '#a3e635',
    Swiftness: '#facc15',
    Resistance: '#c4a35a',
    Stability: '#f59e0b',
    Aegis: '#7dd3fc',
    Resolution: '#a78bfa',
    Retaliation: '#fb923c',
};

function getBoonColor(name: string): string {
    return BOON_COLORS[name] ?? 'var(--brand-secondary)';
}

export function BoonsSubview({ data }: { data: PlayerFightData }) {
    const { boons } = data;

    return (
        <div className="space-y-5">
            {boons.uptimes.length > 0 && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.3 }}
                >
                    <div className="text-xs uppercase tracking-[0.08em] font-medium mb-3" style={{ color: 'var(--text-muted)' }}>
                        Boon Uptime
                    </div>
                    <div className="space-y-2.5">
                        {boons.uptimes.map((boon, i) => {
                            const color = getBoonColor(boon.name);
                            const isIntensity = boon.stacking === 'intensity';
                            const maxStacks = MAX_BOON_STACKS[boon.id] ?? 25;
                            const barPercent = isIntensity
                                ? Math.min((boon.uptime / maxStacks) * 100, 100)
                                : Math.min(boon.uptime, 100);
                            const label = isIntensity
                                ? `${boon.uptime.toFixed(1)} stacks`
                                : `${boon.uptime.toFixed(1)}%`;
                            return (
                                <motion.div
                                    key={boon.id}
                                    initial={{ opacity: 0, x: -6 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    transition={{ delay: i * 0.04, duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                                    className="group flex items-center gap-2.5"
                                >
                                    <span
                                        className="w-28 text-sm font-semibold truncate transition-colors"
                                        style={{ color }}
                                    >
                                        {boon.name}
                                    </span>
                                    <div className="flex-1 h-6 rounded overflow-hidden relative" style={{ background: 'var(--bg-base)' }}>
                                        <div
                                            className="h-full rounded stat-bar-fill"
                                            style={{
                                                width: `${barPercent}%`,
                                                background: `linear-gradient(90deg, ${color}, ${color}aa)`,
                                                opacity: 0.7,
                                                animationDelay: `${0.1 + i * 0.05}s`,
                                            }}
                                        />
                                        {barPercent > 8 && (
                                            <span
                                                className="absolute inset-y-0 left-2.5 flex items-center text-xs font-stat font-bold"
                                                style={{ color: '#fff', textShadow: '0 1px 3px rgba(0,0,0,0.7)' }}
                                            >
                                                {label}
                                            </span>
                                        )}
                                    </div>
                                    {barPercent <= 8 && (
                                        <span className="w-16 text-right text-sm font-stat font-semibold" style={{ color: 'var(--text-muted)' }}>
                                            {label}
                                        </span>
                                    )}
                                </motion.div>
                            );
                        })}
                    </div>
                </motion.div>
            )}

            {boons.generation.length > 0 && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.2, duration: 0.3 }}
                >
                    <div className="text-xs uppercase tracking-[0.08em] font-medium mb-3" style={{ color: 'var(--text-muted)' }}>
                        Boon Generation
                    </div>
                    <div className="rounded-md overflow-hidden" style={{ background: 'var(--bg-card)' }}>
                        <table className="w-full text-sm">
                            <thead>
                                <tr style={{ background: 'var(--bg-card-inner)' }}>
                                    <th className="text-left font-medium px-3 py-2 text-[color:var(--text-muted)]">Boon</th>
                                    <th className="text-right font-medium px-3 py-2 text-[color:var(--text-muted)]">Self</th>
                                    <th className="text-right font-medium px-3 py-2 text-[color:var(--text-muted)]">Group</th>
                                    <th className="text-right font-medium px-3 py-2 text-[color:var(--text-muted)]">Squad</th>
                                </tr>
                            </thead>
                            <tbody>
                                {boons.generation.map((boon, i) => {
                                    const color = getBoonColor(boon.name);
                                    return (
                                        <motion.tr
                                            key={boon.id}
                                            initial={{ opacity: 0 }}
                                            animate={{ opacity: 1 }}
                                            transition={{ delay: 0.25 + i * 0.03 }}
                                            className="border-t hover:bg-white/[0.02] transition-colors"
                                            style={{ borderColor: 'var(--border-subtle)' }}
                                        >
                                            <td className="px-3 py-2 font-semibold" style={{ color }}>{boon.name}</td>
                                            <td className="text-right px-3 py-2 font-stat font-bold text-[color:var(--text-secondary)]">
                                                {boon.selfGeneration.toFixed(1)}
                                            </td>
                                            <td className="text-right px-3 py-2 font-stat font-bold text-[color:var(--text-secondary)]">
                                                {boon.groupGeneration.toFixed(1)}
                                            </td>
                                            <td className="text-right px-3 py-2 font-stat font-bold text-[color:var(--text-secondary)]">
                                                {boon.squadGeneration.toFixed(1)}
                                            </td>
                                        </motion.tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </motion.div>
            )}

            {boons.stabPerformance && (
                <StabPerformanceChart breakdown={boons.stabPerformance} />
            )}
        </div>
    );
}
