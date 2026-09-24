import type { FightHistoryEntry } from '../../../shared/types';

interface HistoryEntryProps {
    entry: FightHistoryEntry;
    isActive: boolean;
    isCurrent: boolean;
    onClick: () => void;
}

export function HistoryEntry({ entry, isActive, isCurrent, onClick }: HistoryEntryProps) {
    return (
        <button
            onClick={onClick}
            className={`ap-history-entry w-full text-left px-3 py-2.5${isActive ? ' ap-history-entry--active' : ''}`}
            style={{
                background: isActive ? 'var(--axi-accent)' : 'var(--axi-surface)',
                borderColor: isCurrent ? 'var(--axi-accent)' : undefined,
            }}
        >
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-[color:var(--axi-text)]">{entry.fightLabel}</span>
                    {isCurrent && (
                        <span className="axi-chip">
                            Latest
                        </span>
                    )}
                </div>
                <span className="text-[10px] text-[color:var(--axi-text-faint)]">
                    {/* `null` when the log carries no CBTS_LOGSTART event.
                        `new Date(null)` is the epoch, which would render a
                        confident and wrong "01:00". */}
                    {entry.timestamp === null
                        ? '—'
                        : new Date(entry.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
            </div>
            <div className="flex items-center gap-3 mt-1">
                <span className="text-[10px] text-[color:var(--axi-text-dim)]">{entry.eliteSpec || entry.profession}</span>
                <span className="text-[10px] text-[color:var(--axi-text-faint)]">
                    {entry.quickStats.damage.toLocaleString()} dmg
                </span>
                <span className="text-[10px] text-[color:var(--axi-text-faint)]">
                    {entry.quickStats.strips} strips
                </span>
                {entry.quickStats.deaths > 0 && (
                    <span className="text-[10px] text-[color:var(--axi-danger)]">
                        {entry.quickStats.deaths} death{entry.quickStats.deaths > 1 ? 's' : ''}
                    </span>
                )}
            </div>
        </button>
    );
}
