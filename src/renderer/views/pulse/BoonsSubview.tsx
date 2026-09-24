import { motion } from 'framer-motion';
import type { PlayerFightData } from '../../../shared/types';
import { MAX_BOON_STACKS } from '../../../shared/boonData';
import { BoonPerformanceChart } from './BoonPerformanceChart';

const BOON_COLORS: Record<string, string> = {
    Might: 'var(--axi-series-boon-might)',
    Fury: 'var(--axi-series-boon-fury)',
    Quickness: 'var(--axi-series-boon-quickness)',
    Alacrity: 'var(--axi-series-boon-alacrity)',
    Protection: 'var(--axi-series-boon-protection)',
    Regeneration: 'var(--axi-series-boon-regeneration)',
    Vigor: 'var(--axi-series-boon-vigor)',
    Swiftness: 'var(--axi-series-boon-swiftness)',
    Resistance: 'var(--axi-series-boon-resistance)',
    Stability: 'var(--axi-series-boon-stability)',
    Aegis: 'var(--axi-series-boon-aegis)',
    Resolution: 'var(--axi-series-boon-resolution)',
    Retaliation: 'var(--axi-series-boon-retaliation)',
};

function getBoonColor(name: string): string {
    return BOON_COLORS[name] ?? 'var(--axi-accent)';
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
                    <div className="text-xs uppercase tracking-[0.08em] font-medium mb-3" style={{ color: 'var(--axi-text-faint)' }}>
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
                                    <div className="ap-meter flex-1">
                                        <div
                                            className="ap-meter-fill stat-bar-fill"
                                            style={{
                                                width: `${barPercent}%`,
                                                background: color,
                                                animationDelay: `${0.1 + i * 0.05}s`,
                                            }}
                                        />
                                    </div>
                                    <span className="w-16 text-right text-sm font-stat font-semibold" style={{ color: 'var(--axi-text-faint)' }}>
                                        {label}
                                    </span>
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
                    <div className="text-xs uppercase tracking-[0.08em] font-medium mb-3" style={{ color: 'var(--axi-text-faint)' }}>
                        Boon Generation
                    </div>
                    <div
                        className="overflow-hidden"
                        style={{
                            background: 'var(--axi-surface)',
                            border: 'var(--axi-border-panel) solid var(--axi-ink-line)',
                        }}
                    >
                        <table className="w-full text-sm">
                            <thead>
                                <tr style={{ background: 'var(--axi-ground)' }}>
                                    <th className="text-left font-medium px-3 py-2 text-[color:var(--axi-text-faint)]">Boon</th>
                                    <th className="text-right font-medium px-3 py-2 text-[color:var(--axi-text-faint)]">Self</th>
                                    <th className="text-right font-medium px-3 py-2 text-[color:var(--axi-text-faint)]">Group</th>
                                    <th className="text-right font-medium px-3 py-2 text-[color:var(--axi-text-faint)]">Squad</th>
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
                                            style={{ borderTop: 'var(--axi-border-hairline) solid var(--axi-ink-line)' }}
                                        >
                                            <td className="px-3 py-2 font-semibold" style={{ color }}>{boon.name}</td>
                                            <td className="text-right px-3 py-2 font-stat font-bold text-[color:var(--axi-text-dim)]">
                                                {boon.selfGeneration.toFixed(1)}
                                            </td>
                                            <td className="text-right px-3 py-2 font-stat font-bold text-[color:var(--axi-text-dim)]">
                                                {boon.groupGeneration.toFixed(1)}
                                            </td>
                                            <td className="text-right px-3 py-2 font-stat font-bold text-[color:var(--axi-text-dim)]">
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

            {boons.boonPerformance && (
                <BoonPerformanceChart performance={boons.boonPerformance} />
            )}
        </div>
    );
}
