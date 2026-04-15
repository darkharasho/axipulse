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
        <div className="bg-[#111] rounded-[5px] p-2.5 border border-[#1a1a1a]">
            <div className="text-[9px] text-[#38bdf8] mb-2 uppercase tracking-wider">Boon State</div>
            <div className="flex flex-col gap-1">
                {entries.length === 0 && <div className="text-[10px] text-[#555]">No boon data</div>}
                {entries.map(snap => (
                    <div key={snap.name} className="flex items-center gap-1.5">
                        <span className="text-[10px]" style={{ color: snap.active ? '#10b981' : '#ef4444' }}>
                            {snap.active ? '✓' : '✗'}
                        </span>
                        {snap.icon && <img src={snap.icon} alt={snap.name} className="w-3.5 h-3.5 rounded-sm" />}
                        <span className={`text-[10px] ${snap.active ? 'text-[#ddd]' : 'text-[#888] line-through'}`}>
                            {snap.name}{snap.stacks > 1 ? ` ×${snap.stacks}` : ''}
                        </span>
                        {!snap.active && snap.droppedAgoMs !== undefined && (
                            <span className="text-[8px] text-[#ef4444]">{formatDrop(snap.droppedAgoMs)}</span>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
}
