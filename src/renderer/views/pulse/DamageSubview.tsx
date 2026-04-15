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
                    accentColor="var(--brand-primary)"
                    hero
                    index={0}
                />
                <StatCard
                    label="Down Contribution"
                    value={damage.downContribution}
                    accentColor="#f87171"
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
                        <div className="text-xs uppercase tracking-[0.08em] font-medium" style={{ color: 'var(--text-muted)' }}>
                            Top Skills
                        </div>
                        <div
                            className="flex rounded-full overflow-hidden"
                            style={{ border: '1px solid var(--border-default)' }}
                        >
                            <button
                                onClick={() => setSkillMode('damage')}
                                className="px-3 py-1 text-xs font-medium transition-colors"
                                style={{
                                    background: skillMode === 'damage' ? 'var(--accent-bg-strong)' : 'transparent',
                                    color: skillMode === 'damage' ? 'var(--brand-primary)' : 'var(--text-muted)',
                                }}
                            >
                                Damage
                            </button>
                            <button
                                onClick={() => setSkillMode('downContribution')}
                                className="px-3 py-1 text-xs font-medium transition-colors"
                                style={{
                                    background: skillMode === 'downContribution' ? 'rgba(248, 113, 113, 0.18)' : 'transparent',
                                    color: skillMode === 'downContribution' ? '#f87171' : 'var(--text-muted)',
                                    borderLeft: '1px solid var(--border-default)',
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
                                ? 'linear-gradient(90deg, #f87171, #fb923c)'
                                : 'linear-gradient(90deg, var(--brand-primary), var(--brand-secondary))';
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
                                            className="w-7 h-7 rounded-sm shrink-0"
                                            style={{ border: '1px solid var(--border-default)' }}
                                        />
                                    ) : (
                                        <div
                                            className="w-7 h-7 rounded-sm shrink-0"
                                            style={{ background: 'var(--bg-card-inner)', border: '1px solid var(--border-default)' }}
                                        />
                                    )}
                                    <span className="w-40 truncate text-sm font-medium text-[color:var(--text-secondary)] group-hover:text-[color:var(--text-primary)] transition-colors">
                                        {skill.name}
                                    </span>
                                    <div className="flex-1 h-6 rounded overflow-hidden relative" style={{ background: 'var(--bg-base)' }}>
                                        <div
                                            className="h-full rounded stat-bar-fill"
                                            style={{
                                                width: `${barPct}%`,
                                                background: barColor,
                                                opacity: 0.75,
                                                animationDelay: `${0.1 + i * 0.05}s`,
                                            }}
                                        />
                                        {pct > 0 && (
                                            <span
                                                className="absolute inset-y-0 right-2 flex items-center text-xs font-stat font-bold text-[color:var(--text-primary)]"
                                                style={{ textShadow: '0 1px 3px rgba(0,0,0,0.6)' }}
                                            >
                                                {pct.toFixed(1)}%
                                            </span>
                                        )}
                                    </div>
                                    <span className="w-20 text-right font-stat text-base font-bold text-[color:var(--text-secondary)]">
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
