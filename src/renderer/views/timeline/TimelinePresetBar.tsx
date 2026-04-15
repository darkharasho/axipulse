import { useAppStore } from '../../store';
import { TIMELINE_LANES } from './TimelinePresets';

export function TimelineLaneToggles() {
    const toggles = useAppStore(s => s.timelineToggles);
    const setToggle = useAppStore(s => s.setTimelineToggle);

    return (
        <div className="flex items-center gap-1.5">
            <span className="text-[9px] text-[color:var(--text-muted)]">Lanes:</span>
            {TIMELINE_LANES.map(lane => (
                <div
                    key={lane.key}
                    title={lane.label}
                    onClick={() => setToggle(lane.key, !toggles[lane.key])}
                    className="w-2 h-2 rounded-sm cursor-pointer transition-opacity"
                    style={{
                        background: lane.color,
                        opacity: toggles[lane.key] ? 0.9 : 0.25,
                    }}
                />
            ))}
        </div>
    );
}
