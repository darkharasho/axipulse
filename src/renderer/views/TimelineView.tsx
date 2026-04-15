import { useAppStore, type TimelinePreset } from '../store';
import { SubviewCapsule } from '../app/SubviewCapsule';
import { TimelineLaneToggles } from './timeline/TimelinePresetBar';
import { TimelineSwimlanes } from './timeline/TimelineSwimlanes';
import { TimelineInspector } from './timeline/TimelineInspector';
import { GanttChart } from 'lucide-react';

const TIMELINE_PILLS = [
    { id: 'show-all', label: 'Show all' },
    { id: 'why-died', label: 'Why did I die?' },
    { id: 'my-damage', label: 'My damage' },
    { id: 'support', label: 'Getting support?' },
    { id: 'custom', label: 'Custom' },
];

export function TimelineView() {
    const currentFight = useAppStore(s => s.currentFight);
    const preset = useAppStore(s => s.timelinePreset);
    const toggles = useAppStore(s => s.timelineToggles);
    const selection = useAppStore(s => s.timelineSelection);
    const setSelection = useAppStore(s => s.setTimelineSelection);
    const applyPreset = useAppStore(s => s.applyPreset);
    const setTimelinePreset = useAppStore(s => s.setTimelinePreset);

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

    const handlePresetSelect = (id: string) => {
        if (id !== 'custom') {
            applyPreset(id as Exclude<TimelinePreset, 'custom'>);
        }
        setTimelinePreset(id as TimelinePreset);
    };

    return (
        <div className="flex flex-col">
            <div className="flex items-center justify-between mb-3">
                <SubviewCapsule
                    pills={TIMELINE_PILLS}
                    activeId={preset}
                    onSelect={handlePresetSelect}
                    layoutGroup="timeline"
                />
                <TimelineLaneToggles />
            </div>
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
