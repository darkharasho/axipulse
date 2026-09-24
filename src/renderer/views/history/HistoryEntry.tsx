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
            className="ap-history-entry w-full text-left px-3 py-2.5"
            style={{
                background: isActive ? 'var(--axi-accent)' : 'var(--axi-surface)',
                color: isActive ? 'var(--axi-accent-ink)' : undefined,
                borderColor: isCurrent ? 'var(--axi-accent)' : undefined,
            }}
        >
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-[color:var(--text-primary)]">{entry.fightLabel}</span>
                    {isCurrent && (
                        <span className="axi-chip">
                            Latest
                        </span>
                    )}
                </div>
                <span className="text-[10px] text-[color:var(--text-muted)]">
                    {/* `null` when the log carries no CBTS_LOGSTART event.
                        `new Date(null)` is the epoch, which would render a
                        confident and wrong "01:00". */}
                    {entry.timestamp === null
                        ? '—'
                        : new Date(entry.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
            </div>
            <div className="flex items-center gap-3 mt-1">
                <span className="text-[10px] text-[color:var(--text-secondary)]">{entry.eliteSpec || entry.profession}</span>
                <span className="text-[10px] text-[color:var(--text-muted)]">
                    {entry.quickStats.damage.toLocaleString()} dmg
                </span>
                <span className="text-[10px] text-[color:var(--text-muted)]">
                    {entry.quickStats.strips} strips
                </span>
                {entry.quickStats.deaths > 0 && (
                    <span className="text-[10px] text-[color:var(--status-error)]">
                        {entry.quickStats.deaths} death{entry.quickStats.deaths > 1 ? 's' : ''}
                    </span>
                )}
            </div>
        </button>
    );
}
