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
            className={`w-full text-left px-3 py-2.5 rounded transition-colors ${
                isActive ? 'ring-1 ring-[color:var(--accent-border)]' : ''
            }`}
            style={{
                background: isActive ? 'var(--accent-bg)' : 'var(--bg-card)',
                borderLeft: isCurrent ? '2px solid var(--brand-primary)' : '2px solid transparent',
            }}
        >
            <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-[color:var(--text-primary)]">{entry.fightLabel}</span>
                <span className="text-[10px] text-[color:var(--text-muted)]">
                    {new Date(entry.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
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
