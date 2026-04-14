// src/renderer/views/TimelineView.tsx
import { useAppStore } from '../store';
import { TimelineChart } from './timeline/TimelineChart';
import { TimelineControls } from './timeline/TimelineControls';
import { GanttChart } from 'lucide-react';

export function TimelineView() {
    const currentFight = useAppStore(s => s.currentFight);
    const toggles = useAppStore(s => s.timelineToggles);

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
        <div className="flex flex-col h-full">
            <TimelineControls />
            <div className="flex-1 min-h-0">
                <TimelineChart data={currentFight.timeline} toggles={toggles} durationMs={currentFight.duration} />
            </div>
        </div>
    );
}
