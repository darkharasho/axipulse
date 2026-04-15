import { useAppStore } from '../store';
import { TimelinePresetBar } from './timeline/TimelinePresetBar';
import { TimelineSwimlanes } from './timeline/TimelineSwimlanes';
import { TimelineInspector } from './timeline/TimelineInspector';
import { GanttChart } from 'lucide-react';

export function TimelineView() {
    const currentFight = useAppStore(s => s.currentFight);
    const toggles = useAppStore(s => s.timelineToggles);
    const selection = useAppStore(s => s.timelineSelection);
    const setSelection = useAppStore(s => s.setTimelineSelection);

    if (!currentFight) {
        return (
            <div className="flex flex-col items-center justify-center h-full gap-4 text-[color:var(--text-muted)]">
                <GanttChart className="w-12 h-12 opacity-30" />
                <div className="text-center">
                    <p className="text-sm font-medium text-[color:var(--text-secondary)]">Fight Timeline</p>
                    <p className="text-xs mt-1">Timeline analysis will appear here after a fight is parsed</p>
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full overflow-y-auto px-2 py-2">
            <TimelinePresetBar />
            <TimelineSwimlanes
                data={currentFight.timeline}
                toggles={toggles}
                durationMs={currentFight.duration}
                onSelectionChange={setSelection}
                selection={selection}
            />
            {selection && (
                <TimelineInspector
                    data={currentFight.timeline}
                    selection={selection}
                    topDamageTakenSkills={currentFight.defense.topDamageTakenSkills}
                />
            )}
        </div>
    );
}
