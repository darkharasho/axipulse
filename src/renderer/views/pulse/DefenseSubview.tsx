import { motion } from 'framer-motion';
import type { PlayerFightData } from '../../../shared/types';
import { StatCard } from '../StatCard';

export function DefenseSubview({ data }: { data: PlayerFightData }) {
    const { defense } = data;

    const mitigationStats = [
        { label: 'Blocked', val: defense.blocked, color: '#60a5fa' },
        { label: 'Evaded', val: defense.evaded, color: '#a78bfa' },
        { label: 'Missed', val: defense.missed, color: 'var(--text-muted)' },
        { label: 'Invulned', val: defense.invulned, color: '#fbbf24' },
        { label: 'Interrupted', val: defense.interrupted, color: '#f87171' },
    ];

    const totalMitigation = mitigationStats.reduce((sum, s) => sum + s.val, 0);

    return (
        <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2">
                <StatCard
                    label="Damage Taken"
                    value={defense.damageTaken.toLocaleString()}
                    accentColor="var(--status-error)"
                    index={0}
                />
                <StatCard
                    label="Deaths / Downs"
                    value={`${defense.deaths} / ${defense.downs}`}
                    detail={defense.deathTimes.length > 0 ? `at ${defense.deathTimes.map(t => formatTime(t)).join(', ')}` : undefined}
                    detailColor={defense.deaths > 0 ? 'bad' : 'good'}
                    accentColor={defense.deaths > 0 ? 'var(--status-error)' : 'var(--status-success)'}
                    index={1}
                />
                <StatCard label="Dodges" value={defense.dodges} accentColor="#a78bfa" index={2} />
                <StatCard
                    label="Incoming CC"
                    value={defense.incomingCC}
                    detailColor={defense.incomingCC > 3 ? 'bad' : 'neutral'}
                    accentColor="var(--status-warning)"
                    index={3}
                />
                <StatCard
                    label="Incoming Strips"
                    value={defense.incomingStrips}
                    detailColor={defense.incomingStrips > 5 ? 'bad' : 'neutral'}
                    accentColor="var(--brand-secondary)"
                    index={4}
                />
            </div>

            {defense.topDamageTakenSkills.length > 0 && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.15, duration: 0.3 }}
                >
                    <div className="text-xs uppercase tracking-[0.08em] font-medium mb-3" style={{ color: 'var(--text-muted)' }}>
                        Top Incoming Damage
                    </div>
                    <div className="space-y-2">
                        {(() => {
                            const skills = defense.topDamageTakenSkills;
                            const maxVal = skills[0]?.damage ?? 1;
                            const total = skills.reduce((sum, s) => sum + s.damage, 0) || 1;
                            return skills.slice(0, 8).map((skill, i) => {
                                const barPct = maxVal > 0 ? (skill.damage / maxVal) * 100 : 0;
                                const pct = (skill.damage / total) * 100;
                                return (
                                    <motion.div
                                        key={skill.id}
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
                                                    background: 'linear-gradient(90deg, #f87171, #ef4444)',
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
                                            {skill.damage.toLocaleString()}
                                        </span>
                                    </motion.div>
                                );
                            });
                        })()}
                    </div>
                </motion.div>
            )}

            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.2, duration: 0.3 }}
            >
                <div className="text-xs uppercase tracking-[0.08em] font-medium mb-2.5" style={{ color: 'var(--text-muted)' }}>
                    Damage Mitigated
                    {totalMitigation > 0 && (
                        <span className="ml-2 font-stat font-bold text-sm text-[color:var(--text-secondary)]">{totalMitigation}</span>
                    )}
                </div>

                {/* Stacked bar */}
                {totalMitigation > 0 && (
                    <div className="h-3 rounded-full overflow-hidden flex mb-3" style={{ background: 'var(--bg-base)' }}>
                        {mitigationStats.filter(s => s.val > 0).map((s, i) => (
                            <motion.div
                                key={s.label}
                                initial={{ width: 0 }}
                                animate={{ width: `${(s.val / totalMitigation) * 100}%` }}
                                transition={{ delay: 0.3 + i * 0.05, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                                className="h-full first:rounded-l-full last:rounded-r-full"
                                style={{ background: s.color, opacity: 0.7 }}
                                title={`${s.label}: ${s.val}`}
                            />
                        ))}
                    </div>
                )}

                <div className="grid grid-cols-3 gap-2">
                    {mitigationStats.map((s, i) => (
                        <motion.div
                            key={s.label}
                            initial={{ opacity: 0, y: 4 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.25 + i * 0.04, duration: 0.3 }}
                            className="rounded-md px-2.5 py-2 flex items-center gap-2"
                            style={{ background: 'var(--bg-card)' }}
                        >
                            <div className="w-1.5 h-6 rounded-full" style={{ background: s.color, opacity: 0.7 }} />
                            <div>
                                <div className="text-xs uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>{s.label}</div>
                                <div className="text-base font-stat font-bold text-[color:var(--text-primary)]">{s.val}</div>
                            </div>
                        </motion.div>
                    ))}
                </div>
            </motion.div>
        </div>
    );
}

function formatTime(ms: number): string {
    const sec = Math.floor(ms / 1000);
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
}
