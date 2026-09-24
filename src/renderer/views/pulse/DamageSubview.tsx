import { useState } from 'react';
import { motion } from 'framer-motion';
import type { PlayerFightData } from '../../../shared/types';
import { StatCard } from '../StatCard';

type SkillMode = 'damage' | 'downContribution';

export function DamageSubview({ data }: { data: PlayerFightData }) {
    const { damage } = data;
    const [skillMode, setSkillMode] = useState<SkillMode>('damage');

    const skills = skillMode === 'downContribution'
        ? [...damage.topSkills].sort((a, b) => b.downContribution - a.downContribution).filter(s => s.downContribution > 0)
        : damage.topSkills;

    const getValue = (skill: typeof skills[number]) =>
        skillMode === 'downContribution' ? skill.downContribution : skill.damage;

    const total = skills.reduce((sum, s) => sum + getValue(s), 0) || 1;
    const maxVal = skills[0] ? getValue(skills[0]) : 1;

    return (
        <div className="space-y-5">
            <div className="grid grid-cols-2 gap-2">
                <StatCard
                    label="Total Damage"
                    value={damage.totalDamage.toLocaleString()}
                    detail={`${damage.dps.toLocaleString()} DPS`}
                    detailColor="good"
                    accentColor="var(--axi-series-metric-damage-dealt)"
                    hero
                    index={0}
                />
                <StatCard
                    label="Down Contribution"
                    value={damage.downContribution}
                    accentColor="var(--axi-series-metric-damage-taken)"
                    hero
                    index={1}
                />
            </div>

            {damage.topSkills.length > 0 && (
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
                            <button
                                onClick={() => setSkillMode('damage')}
                                className="px-3 py-1 text-xs font-medium transition-colors"
                                style={{
                                    color: skillMode === 'damage' ? 'var(--axi-series-metric-damage-dealt)' : 'var(--axi-text-faint)',
                                    borderBottom: skillMode === 'damage'
                                        ? 'var(--axi-border-control) solid var(--axi-series-metric-damage-dealt)'
                                        : 'var(--axi-border-control) solid transparent',
                                }}
                            >
                                Damage
                            </button>
                            <button
                                onClick={() => setSkillMode('downContribution')}
                                className="px-3 py-1 text-xs font-medium transition-colors"
                                style={{
                                    color: skillMode === 'downContribution' ? 'var(--axi-series-metric-damage-taken)' : 'var(--axi-text-faint)',
                                    borderLeft: 'var(--axi-border-control) solid var(--axi-ink-line)',
                                    borderBottom: skillMode === 'downContribution'
                                        ? 'var(--axi-border-control) solid var(--axi-series-metric-damage-taken)'
                                        : 'var(--axi-border-control) solid transparent',
                                }}
                            >
                                Down Cont.
                            </button>
                        </div>
                    </div>
                    <div className="space-y-2">
                        {skills.slice(0, 8).map((skill, i) => {
                            const val = getValue(skill);
                            const barPct = maxVal > 0 ? (val / maxVal) * 100 : 0;
                            const pct = (val / total) * 100;
                            const barColor = skillMode === 'downContribution'
                                ? 'var(--axi-series-metric-damage-taken)'
                                : 'var(--axi-series-metric-damage-dealt)';
                            return (
                                <motion.div
                                    key={`${skill.id}-${skillMode}`}
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
                                                background: barColor,
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
                </motion.div>
            )}
        </div>
    );
}
