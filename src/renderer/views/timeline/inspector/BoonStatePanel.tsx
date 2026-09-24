import { getBoonStateAtTime } from '../../../../shared/timelineInspector';
import type { BuffStateEntry } from '../../../../shared/types';

interface BoonStatePanelProps {
    offensiveBoons: Record<number, BuffStateEntry>;
    defensiveBoons: Record<number, BuffStateEntry>;
    timeMs: number;
}

export function BoonStatePanel({ offensiveBoons, defensiveBoons, timeMs }: BoonStatePanelProps) {
    const allBoons = { ...offensiveBoons, ...defensiveBoons };
    const entries = Object.entries(allBoons).map(([idStr, entry]) => ({
        id: Number(idStr),
        ...getBoonStateAtTime(entry, timeMs),
    }));

    const formatDrop = (ms: number) => {
        const sec = Math.round(ms / 1000);
        return `dropped ${sec}s ago`;
    };

    return (
        <div className="axi-panel p-2.5">
            <div className="axi-eyebrow" style={{ color: 'var(--axi-series-metric-defensive-boons)' }}>Boon State</div>
            <div className="flex flex-col gap-1">
                {entries.length === 0 && <div className="text-[10px]" style={{ color: 'var(--axi-text-faint)' }}>No boon data</div>}
                {entries.map(snap => (
                    <div key={snap.name} className="flex items-center gap-1.5">
                        <span className="text-[10px]" style={{ color: snap.active ? 'var(--axi-ok)' : 'var(--axi-danger)' }}>
                            {snap.active ? '✓' : '✗'}
                        </span>
                        {snap.icon && (
                            <img
                                src={snap.icon}
                                alt={snap.name}
                                className="w-3.5 h-3.5"
                                style={{ border: 'var(--axi-border-hairline) solid var(--axi-ink-line)' }}
                            />
                        )}
                        <span
                            className={`text-[10px] ${snap.active ? '' : 'line-through'}`}
                            style={{ color: snap.active ? 'var(--axi-text)' : 'var(--axi-text-dim)' }}
                        >
                            {snap.name}{snap.stacks > 1 ? ` ×${snap.stacks}` : ''}
                        </span>
                        {!snap.active && snap.droppedAgoMs !== undefined && (
                            <span className="text-[8px]" style={{ color: 'var(--axi-danger)' }}>{formatDrop(snap.droppedAgoMs)}</span>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
}
