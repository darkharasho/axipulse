import { motion } from 'framer-motion';
import type { PlayerFightData } from '../../../shared/types';
import { StatCard } from '../StatCard';
import { FightCompositionCard } from './FightCompositionCard';

export function OverviewSubview({ data }: { data: PlayerFightData }) {
    const { damage, defense, support, squadContext, roleClassification, distanceToTag } = data;
    const isSupport = roleClassification.role === 'support';

    return (
        <div className="space-y-3">
            {isSupport ? (
                <HeroBanner
                    label="Healing Output"
                    primaryValue={support.healingOutput}
                    secondaryValue={support.barrierOutput}
                    secondaryLabel="Barrier"
                    rank={squadContext.healingRank}
                    theme="support"
                />
            ) : (
                <HeroBanner
                    label="Damage Dealt"
                    primaryValue={damage.totalDamage}
                    secondaryValue={damage.dps}
                    secondaryLabel="DPS"
                    rank={squadContext.damageRank}
                    theme="damage"
                />
            )}

            <div className="grid grid-cols-2 gap-2">
                {isSupport ? (
                    <>
                        <StatCard
                            label="Cleanses"
                            value={support.cleanses}
                            detail={`${ordinal(squadContext.cleanseRank)} in squad`}
                            detailColor="good"
                            accentColor="var(--brand-secondary)"
                            index={1}
                        />
                        <StatCard
                            label="Barrier Output"
                            value={support.barrierOutput.toLocaleString()}
                            accentColor="#a78bfa"
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
                            label="Deaths / Downs"
                            value={`${defense.deaths} / ${defense.downs}`}
                            detail={defense.deathTimes.length > 0 ? `at ${defense.deathTimes.map(t => formatTime(t)).join(', ')}` : 'clean fight'}
                            detailColor={defense.deaths > 0 ? 'bad' : 'good'}
                            accentColor={defense.deaths > 0 ? 'var(--status-error)' : 'var(--status-success)'}
                            index={4}
                        />
                    </>
                ) : (
                    <>
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
                    </>
                )}
                <StatCard
                    label="Damage Taken"
                    value={defense.damageTaken.toLocaleString()}
                    detail={`${ordinal(squadContext.damageTakenRank)} in squad`}
                    detailColor="neutral"
                    accentColor="var(--status-warning, #f59e0b)"
                    index={5}
                />
                <DistanceToTagCard distanceToTag={distanceToTag} index={6} />
                <FightCompositionCard composition={data.fightComposition} isSupport={isSupport} />
            </div>
        </div>
    );
}

const BANNER_THEMES = {
    support: {
        gradient: 'linear-gradient(135deg, rgba(16, 185, 129, 0.12), rgba(6, 182, 212, 0.08))',
        border: '1px solid rgba(16, 185, 129, 0.2)',
        label: 'var(--brand-primary)',
        valueGradient: 'linear-gradient(135deg, #10b981, #06b6d4)',
    },
    damage: {
        gradient: 'linear-gradient(135deg, rgba(239, 68, 68, 0.12), rgba(249, 115, 22, 0.08))',
        border: '1px solid rgba(239, 68, 68, 0.2)',
        label: '#ef4444',
        valueGradient: 'linear-gradient(135deg, #ef4444, #f97316)',
    },
} as const;

function HeroBanner({ label, primaryValue, secondaryValue, secondaryLabel, rank, theme }: {
    label: string;
    primaryValue: number;
    secondaryValue: number;
    secondaryLabel: string;
    rank: number;
    theme: 'support' | 'damage';
}) {
    const t = BANNER_THEMES[theme];
    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3 }}
            className="rounded-lg p-4 relative overflow-hidden"
            style={{ background: t.gradient }}
        >
            <div className="absolute inset-0 rounded-lg" style={{ border: t.border }} />
            <div className="relative flex items-end justify-between">
                <div>
                    <div className="text-xs uppercase tracking-[0.1em] font-medium" style={{ color: t.label }}>
                        {label}
                    </div>
                    <div
                        className="font-stat font-bold text-4xl leading-none mt-1"
                        style={{ background: t.valueGradient, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}
                    >
                        {primaryValue.toLocaleString()}
                    </div>
                </div>
                <div className="text-right">
                    <span className="font-stat font-bold text-2xl" style={{ color: 'var(--text-primary)' }}>
                        {secondaryValue.toLocaleString()}
                    </span>
                    <span className="text-xs ml-1 font-medium" style={{ color: 'var(--text-muted)' }}>{secondaryLabel}</span>
                    <div className="mt-0.5">
                        <RankBadge rank={rank} />
                    </div>
                </div>
            </div>
        </motion.div>
    );
}

function DistanceToTagCard({ distanceToTag, index }: {
    distanceToTag: { average: number; median: number } | null;
    index: number;
}) {
    if (!distanceToTag) {
        return (
            <StatCard
                label="Distance to Tag"
                value="N/A"
                detail="no tag data"
                detailColor="neutral"
                accentColor="var(--text-muted)"
                index={index}
            />
        );
    }
    return (
        <StatCard
            label="Distance to Tag"
            value={`${distanceToTag.average} / ${distanceToTag.median}`}
            detail="avg / median"
            detailColor="neutral"
            accentColor="var(--brand-secondary)"
            index={index}
        />
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
