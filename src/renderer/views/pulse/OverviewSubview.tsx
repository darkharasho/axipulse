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
                            accentColor="var(--axi-accent)"
                            index={1}
                        />
                        <StatCard
                            label="Barrier Output"
                            value={support.barrierOutput.toLocaleString()}
                            accentColor="var(--axi-series-6)"
                            index={2}
                        />
                        <StatCard
                            label="Strips"
                            value={support.boonStrips}
                            detail={`${ordinal(squadContext.stripsRank)} in squad`}
                            detailColor="good"
                            accentColor="var(--axi-accent)"
                            index={3}
                        />
                        <StatCard
                            label="Deaths / Downs"
                            value={`${defense.deaths} / ${defense.downs}`}
                            detail={defense.deathTimes.length > 0 ? `at ${defense.deathTimes.map(t => formatTime(t)).join(', ')}` : 'clean fight'}
                            detailColor={defense.deaths > 0 ? 'bad' : 'good'}
                            accentColor={defense.deaths > 0 ? 'var(--axi-danger)' : 'var(--axi-ok)'}
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
                            accentColor="var(--axi-accent)"
                            index={1}
                        />
                        <StatCard
                            label="Deaths / Downs"
                            value={`${defense.deaths} / ${defense.downs}`}
                            detail={defense.deathTimes.length > 0 ? `at ${defense.deathTimes.map(t => formatTime(t)).join(', ')}` : 'clean fight'}
                            detailColor={defense.deaths > 0 ? 'bad' : 'good'}
                            accentColor={defense.deaths > 0 ? 'var(--axi-danger)' : 'var(--axi-ok)'}
                            index={2}
                        />
                        <StatCard
                            label="Strips"
                            value={support.boonStrips}
                            detail={`${ordinal(squadContext.stripsRank)} in squad`}
                            detailColor="good"
                            accentColor="var(--axi-accent)"
                            index={3}
                        />
                        <StatCard
                            label="Cleanses"
                            value={support.cleanses}
                            detail={`${ordinal(squadContext.cleanseRank)} in squad`}
                            detailColor="good"
                            accentColor="var(--axi-accent)"
                            index={4}
                        />
                    </>
                )}
                <StatCard
                    label="Damage Taken"
                    value={defense.damageTaken.toLocaleString()}
                    detail={`${ordinal(squadContext.damageTakenRank)} in squad`}
                    detailColor="neutral"
                    accentColor="var(--axi-warn)"
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
        label: 'var(--axi-accent)',
        value: 'var(--axi-accent)',
    },
    damage: {
        label: 'var(--axi-danger)',
        value: 'var(--axi-danger)',
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
            className="p-4 relative overflow-hidden"
            style={{
                background: 'var(--axi-surface)',
                border: 'var(--axi-border-panel) solid var(--axi-ink-line)',
            }}
        >
            <div className="relative flex items-end justify-between">
                <div>
                    <div className="text-xs uppercase tracking-[0.1em] font-medium" style={{ color: t.label }}>
                        {label}
                    </div>
                    <div
                        className="font-stat font-bold text-4xl leading-none mt-1"
                        style={{ color: t.value }}
                    >
                        {primaryValue.toLocaleString()}
                    </div>
                </div>
                <div className="text-right">
                    <span className="font-stat font-bold text-2xl" style={{ color: 'var(--axi-text)' }}>
                        {secondaryValue.toLocaleString()}
                    </span>
                    <span className="text-xs ml-1 font-medium" style={{ color: 'var(--axi-text-faint)' }}>{secondaryLabel}</span>
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
                accentColor="var(--axi-text-faint)"
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
            accentColor="var(--axi-accent)"
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
    const colors = [
        'var(--axi-warn)',
        'var(--axi-text-dim)',
        'var(--axi-series-metric-distance-to-tag)',
        'var(--axi-text-faint)',
        'var(--axi-text-faint)',
    ];
    const color = colors[rank - 1] ?? 'var(--axi-text-faint)';
    return (
        <span
            className="inline-block text-xs font-bold px-1.5 py-0.5 font-stat tracking-wide"
            style={{ color, border: `var(--axi-border-hairline) solid ${color}` }}
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
