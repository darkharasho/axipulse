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
            <div className="flex flex-col items-center justify-center h-full gap-4 text-[color:var(--axi-text-faint)]">
                {/* Rule 2: the empty-state glyph is decoration, so it stays the quietest
                    mark on the screen - but an opacity multiplier over the ground is the
                    forbidden mechanism. --axi-rule is the system's faintest ink (the one
                    reserved for internal rules), so it keeps the icon below the faint body
                    text without mixing a colour. Same call in PulseView, HistoryView and
                    TimelineView. */}
                <Clock3 className="w-12 h-12" style={{ color: 'var(--axi-rule)' }} />
                <div className="text-center">
                    <p className="text-sm font-medium text-[color:var(--axi-text-dim)]">Session History</p>
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
