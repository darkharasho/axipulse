import { useAppStore } from '../store';
import { HistoryEntry } from './history/HistoryEntry';
import { Clock3 } from 'lucide-react';

export function HistoryView() {
    const sessionHistory = useAppStore(s => s.sessionHistory);
    const activeFightNumber = useAppStore(s => s.activeFightNumber);
    const loadFromHistory = useAppStore(s => s.loadFromHistory);
    const fightCounter = useAppStore(s => s.fightCounter);

    if (sessionHistory.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center h-full gap-4 text-[color:var(--text-muted)]">
                <Clock3 className="w-12 h-12 opacity-30" />
                <div className="text-center">
                    <p className="text-sm font-medium text-[color:var(--text-secondary)]">Session History</p>
                    <p className="text-xs mt-1">Past fights from this session will appear here</p>
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-1.5">
            {sessionHistory.map(entry => (
                <HistoryEntry
                    key={entry.fightNumber}
                    entry={entry}
                    isActive={entry.fightNumber === activeFightNumber}
                    isCurrent={entry.fightNumber === fightCounter}
                    onClick={() => loadFromHistory(entry.fightNumber)}
                />
            ))}
        </div>
    );
}
