import { useState } from 'react';
import { motion } from 'framer-motion';
import type { PlayerFightData, SkillDamage } from '../../../shared/types';
import { StatCard } from '../StatCard';

function ordinal(n: number): string {
    const s = ['th', 'st', 'nd', 'rd'];
    const v = n % 100;
    return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
}

type SupportMode = 'healing' | 'barrier' | 'downed';

const MODE_CONFIG: Record<SupportMode, { label: string; color: string }> = {
    healing: { label: 'Healing', color: 'var(--axi-series-metric-incoming-healing)' },
    barrier: { label: 'Barrier', color: 'var(--axi-series-metric-incoming-barrier)' },
    downed: { label: 'Downed', color: 'var(--axi-series-metric-damage-taken)' },
};

function getSkillsForMode(mode: SupportMode, healingSkills: SkillDamage[], barrierSkills: SkillDamage[]): SkillDamage[] {
    if (mode === 'barrier') return barrierSkills;
    if (mode === 'downed') {
        return [...healingSkills]
            .filter(s => s.downedHealing > 0)
            .sort((a, b) => b.downedHealing - a.downedHealing);
    }
    return healingSkills;
}

function getValueForMode(mode: SupportMode, skill: SkillDamage): number {
    if (mode === 'downed') return skill.downedHealing;
    return skill.damage;
}

export function SupportSubview({ data }: { data: PlayerFightData }) {
    const { support, squadContext } = data;
    const [mode, setMode] = useState<SupportMode>('healing');

    const hasSkills = support.topHealingSkills.length > 0 || support.topBarrierSkills.length > 0;
    const skills = getSkillsForMode(mode, support.topHealingSkills, support.topBarrierSkills);
    const maxVal = skills[0] ? getValueForMode(mode, skills[0]) : 1;
    const total = skills.reduce((sum, s) => sum + getValueForMode(mode, s), 0) || 1;
    const config = MODE_CONFIG[mode];

    return (
        <div className="space-y-5">
            <div className="grid grid-cols-2 gap-2">
                <StatCard
                    label="Boon Strips"
                    value={support.boonStrips}
                    detail={`${ordinal(squadContext.stripsRank)} in squad`}
                    detailColor="good"
                    accentColor="var(--axi-accent)"
                    hero
                    index={0}
                />
                <StatCard
                    label="Cleanses"
                    value={support.cleanses}
                    detail={`${ordinal(squadContext.cleanseRank)} in squad`}
                    detailColor="good"
                    accentColor="var(--axi-accent)"
                    hero
                    index={1}
                />
            </div>

            {hasSkills && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.15, duration: 0.3 }}
                >
                    <div className="flex items-center justify-between mb-3">
                        <div className="text-xs uppercase tracking-[0.08em] font-medium" style={{ color: 'var(--axi-text-faint)' }}>
                            Top Skills
                        </div>
                        <div
                            className="flex overflow-hidden"
                            style={{ border: 'var(--axi-border-control) solid var(--axi-ink-line)' }}
                        >
                            {(Object.keys(MODE_CONFIG) as SupportMode[]).map((m, i) => (
                                <button
                                    key={m}
                                    onClick={() => setMode(m)}
                                    className="px-3 py-1 text-xs font-medium transition-colors"
                                    style={{
                                        color: mode === m ? MODE_CONFIG[m].color : 'var(--axi-text-faint)',
                                        borderLeft: i > 0 ? 'var(--axi-border-control) solid var(--axi-ink-line)' : undefined,
                                        borderBottom: mode === m
                                            ? `var(--axi-border-control) solid ${MODE_CONFIG[m].color}`
                                            : 'var(--axi-border-control) solid transparent',
                                    }}
                                >
                                    {MODE_CONFIG[m].label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {skills.length > 0 ? (
                        <div className="space-y-2">
                            {skills.slice(0, 8).map((skill, i) => {
                                const val = getValueForMode(mode, skill);
                                const barPct = maxVal > 0 ? (val / maxVal) * 100 : 0;
                                const pct = (val / total) * 100;
                                return (
                                    <motion.div
                                        key={`${skill.id}-${mode}`}
                                        initial={{ opacity: 0, x: -8 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        transition={{ delay: 0.05 + i * 0.04, duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                                        className="group flex items-center gap-2.5"
                                    >
                                        {skill.icon ? (
                                            <img
                                                src={skill.icon}
                                                alt=""
                                                className="w-7 h-7 shrink-0"
                                                style={{ border: 'var(--axi-border-hairline) solid var(--axi-ink-line)' }}
                                            />
                                        ) : (
                                            <div
                                                className="w-7 h-7 shrink-0"
                                                style={{ background: 'var(--axi-ground)', border: 'var(--axi-border-hairline) solid var(--axi-ink-line)' }}
                                            />
                                        )}
                                        <span className="w-40 truncate text-sm font-medium text-[color:var(--axi-text-dim)] group-hover:text-[color:var(--axi-text)] transition-colors">
                                            {skill.name}
                                        </span>
                                        <div className="ap-meter flex-1">
                                            <div
                                                className="ap-meter-fill stat-bar-fill"
                                                style={{
                                                    width: `${barPct}%`,
                                                    background: config.color,
                                                    animationDelay: `${0.1 + i * 0.05}s`,
                                                }}
                                            />
                                        </div>
                                        {pct > 0 && (
                                            <span className="w-14 text-right text-xs font-stat font-bold" style={{ color: 'var(--axi-text-faint)' }}>
                                                {pct.toFixed(1)}%
                                            </span>
                                        )}
                                        <span className="w-20 text-right font-stat text-base font-bold text-[color:var(--axi-text-dim)]">
                                            {val.toLocaleString()}
                                        </span>
                                    </motion.div>
                                );
                            })}
                        </div>
                    ) : (
                        <div className="text-sm py-4 text-center" style={{ color: 'var(--axi-text-faint)' }}>
                            No {config.label.toLowerCase()} skill data
                        </div>
                    )}
                </motion.div>
            )}

            <div className="grid grid-cols-2 gap-2">
                <StatCard
                    label="Stability Gen"
                    value={`${support.stabilityGeneration.toFixed(1)}s`}
                    accentColor="var(--axi-warn)"
                    index={5}
                />
            </div>
        </div>
    );
}
