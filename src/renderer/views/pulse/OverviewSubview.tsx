// src/renderer/views/pulse/OverviewSubview.tsx
import type { PlayerFightData } from '../../../shared/types';
import { StatCard } from '../StatCard';

export function OverviewSubview({ data }: { data: PlayerFightData }) {
    const { damage, defense, support, squadContext } = data;

    return (
        <div className="grid grid-cols-2 gap-2">
            <StatCard
                label="Damage"
                value={damage.totalDamage.toLocaleString()}
                detail={`${damage.dps.toLocaleString()} DPS`}
                detailColor="good"
            />
            <StatCard
                label="Down Cont."
                value={damage.downContribution}
                detail={squadContext.damageRank <= 3 ? `${squadContext.damageRank}${ordinal(squadContext.damageRank)} in squad` : undefined}
                detailColor="good"
            />
            <StatCard
                label="Deaths / Downs"
                value={`${defense.deaths} / ${defense.downs}`}
                detail={defense.deathTimes.length > 0 ? `at ${defense.deathTimes.map(t => formatTime(t)).join(', ')}` : undefined}
                detailColor={defense.deaths > 0 ? 'bad' : 'good'}
            />
            <StatCard
                label="Strips"
                value={support.boonStrips}
                detail={squadContext.stripsRank <= 3 ? `${squadContext.stripsRank}${ordinal(squadContext.stripsRank)} in squad` : undefined}
                detailColor="good"
            />
            <StatCard label="Cleanses" value={support.cleanses} detail={`self: ${support.cleanseSelf}`} />
            {support.healingOutput > 0 && (
                <StatCard
                    label="Healing"
                    value={support.healingOutput.toLocaleString()}
                    detail="squad total"
                    detailColor="good"
                />
            )}
        </div>
    );
}

function ordinal(n: number): string {
    if (n === 1) return 'st';
    if (n === 2) return 'nd';
    if (n === 3) return 'rd';
    return 'th';
}

function formatTime(ms: number): string {
    const sec = Math.floor(ms / 1000);
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
}
