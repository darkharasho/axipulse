import { motion } from 'framer-motion';
import type { PlayerFightData } from '../../../shared/types';
import { StatCard } from '../StatCard';

export function OverviewSubview({ data }: { data: PlayerFightData }) {
    const { damage, defense, support, squadContext } = data;

    return (
        <div className="space-y-3">
            {/* Hero DPS Banner */}
            <motion.div
                initial={{ opacity: 0, scale: 0.97 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                className="rounded-lg p-4 relative overflow-hidden"
                style={{ background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.12), rgba(6, 182, 212, 0.08))' }}
            >
                <div className="absolute inset-0 rounded-lg" style={{ border: '1px solid rgba(16, 185, 129, 0.2)' }} />
                <div className="relative flex items-end justify-between">
                    <div>
                        <div className="text-xs uppercase tracking-[0.1em] font-medium" style={{ color: 'var(--brand-primary)' }}>
                            Damage Dealt
                        </div>
                        <div className="font-stat font-bold text-4xl leading-none mt-1 gradient-text">
                            {damage.totalDamage.toLocaleString()}
                        </div>
                    </div>
                    <div className="text-right">
                        <span className="font-stat font-bold text-2xl" style={{ color: 'var(--text-primary)' }}>
                            {damage.dps.toLocaleString()}
                        </span>
                        <span className="text-xs ml-1 font-medium" style={{ color: 'var(--text-muted)' }}>DPS</span>
                        <div className="mt-0.5">
                            <RankBadge rank={squadContext.damageRank} />
                        </div>
                    </div>
                </div>
            </motion.div>

            {/* Stats Grid */}
            <div className="grid grid-cols-2 gap-2">
                <StatCard
                    label="Down Contribution"
                    value={damage.downContribution}
                    detail={`${ordinal(squadContext.downContributionRank)} in squad`}
                    detailColor="good"
                    accentColor="var(--brand-primary)"
                    index={1}
                />
                <StatCard
                    label="Deaths / Downs"
                    value={`${defense.deaths} / ${defense.downs}`}
                    detail={defense.deathTimes.length > 0 ? `at ${defense.deathTimes.map(t => formatTime(t)).join(', ')}` : 'clean fight'}
                    detailColor={defense.deaths > 0 ? 'bad' : 'good'}
                    accentColor={defense.deaths > 0 ? 'var(--status-error)' : 'var(--status-success)'}
                    index={2}
                />
                <StatCard
                    label="Strips"
                    value={support.boonStrips}
                    detail={`${ordinal(squadContext.stripsRank)} in squad`}
                    detailColor="good"
                    accentColor="var(--brand-secondary)"
                    index={3}
                />
                <StatCard
                    label="Cleanses"
                    value={support.cleanses}
                    detail={`${ordinal(squadContext.cleanseRank)} in squad`}
                    detailColor="good"
                    accentColor="var(--brand-secondary)"
                    index={4}
                />
                {support.healingOutput > 0 && (
                    <StatCard
                        label="Healing"
                        value={support.healingOutput.toLocaleString()}
                        detail={`${ordinal(squadContext.healingRank)} in squad`}
                        detailColor="good"
                        accentColor="#a78bfa"
                        index={5}
                    />
                )}
            </div>
        </div>
    );
}

function ordinal(n: number): string {
    const s = ['th', 'st', 'nd', 'rd'];
    const v = n % 100;
    return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
}

function RankBadge({ rank }: { rank: number }) {
    const colors = ['#fbbf24', '#94a3b8', '#cd7f32', 'var(--text-muted)', 'var(--text-muted)'];
    const color = colors[rank - 1] ?? 'var(--text-muted)';
    return (
        <span
            className="inline-block text-xs font-bold px-1.5 py-0.5 rounded font-stat tracking-wide"
            style={{ color, border: `1px solid ${color}`, opacity: 0.9 }}
        >
            {ordinal(rank)}
        </span>
    );
}

function formatTime(ms: number): string {
    const sec = Math.floor(ms / 1000);
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
}
