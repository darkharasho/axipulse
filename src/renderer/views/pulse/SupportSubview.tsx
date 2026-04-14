// src/renderer/views/pulse/SupportSubview.tsx
import type { PlayerFightData } from '../../../shared/types';
import { StatCard } from '../StatCard';

export function SupportSubview({ data }: { data: PlayerFightData }) {
    const { support, squadContext } = data;

    return (
        <div className="grid grid-cols-2 gap-2">
            <StatCard
                label="Boon Strips"
                value={support.boonStrips}
                detail={squadContext.stripsRank <= 3 ? `${squadContext.stripsRank}${ordinal(squadContext.stripsRank)} in squad` : undefined}
                detailColor="good"
            />
            <StatCard label="Cleanses" value={support.cleanses} detail={`self: ${support.cleanseSelf}`} />
            {support.healingOutput > 0 && (
                <StatCard
                    label="Healing Output"
                    value={support.healingOutput.toLocaleString()}
                    detail={squadContext.healingRank <= 3 ? `${squadContext.healingRank}${ordinal(squadContext.healingRank)} in squad` : undefined}
                    detailColor="good"
                />
            )}
            {support.barrierOutput > 0 && (
                <StatCard label="Barrier Output" value={support.barrierOutput.toLocaleString()} detailColor="good" />
            )}
            <StatCard label="Stability Gen" value={`${support.stabilityGeneration.toFixed(1)}s`} />
        </div>
    );
}

function ordinal(n: number): string {
    if (n === 1) return 'st';
    if (n === 2) return 'nd';
    if (n === 3) return 'rd';
    return 'th';
}
