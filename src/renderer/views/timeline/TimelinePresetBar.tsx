import { useAppStore } from '../../store';
import { TIMELINE_LANES } from './TimelinePresets';

export function TimelineLaneToggles() {
    const toggles = useAppStore(s => s.timelineToggles);
    const setToggle = useAppStore(s => s.setTimelineToggle);

    return (
        <div className="flex items-center gap-1.5">
            <span className="text-[9px]" style={{ color: 'var(--axi-text-faint)' }}>Lanes:</span>
            {TIMELINE_LANES.map(lane => (
                <button
                    key={lane.key}
                    type="button"
                    title={lane.label}
                    aria-pressed={toggles[lane.key]}
                    onClick={() => setToggle(lane.key, !toggles[lane.key])}
                    className="axi-pill"
                    style={{ padding: '2px 6px', font: 'var(--axi-t-micro)', '--axi-pill-fill': lane.color } as React.CSSProperties}
                >
                    {lane.label}
                </button>
            ))}
        </div>
    );
}
