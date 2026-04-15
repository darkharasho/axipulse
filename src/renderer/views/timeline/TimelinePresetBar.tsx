import { useAppStore, type TimelinePreset } from '../../store';
import { TIMELINE_LANES, PRESET_LABELS } from './TimelinePresets';

export function TimelinePresetBar() {
    const preset = useAppStore(s => s.timelinePreset);
    const toggles = useAppStore(s => s.timelineToggles);
    const setToggle = useAppStore(s => s.setTimelineToggle);
    const applyPreset = useAppStore(s => s.applyPreset);

    return (
        <div className="flex items-center gap-3 mb-3 px-1">
            <span className="text-[10px] text-[color:var(--text-muted)] uppercase tracking-wider">Preset:</span>
            <div className="flex gap-1.5">
                {PRESET_LABELS.map(p => (
                    <button
                        key={p.key}
                        onClick={() => applyPreset(p.key as Exclude<TimelinePreset, 'custom'>)}
                        className="px-2.5 py-1 text-[10px] rounded border transition-colors"
                        style={{
                            borderColor: preset === p.key ? 'var(--brand-primary)' : '#333',
                            background: preset === p.key ? 'rgba(16,185,129,0.15)' : 'transparent',
                            color: preset === p.key ? 'var(--brand-primary)' : '#888',
                        }}
                    >
                        {p.label}
                    </button>
                ))}
            </div>
            <div className="ml-auto flex items-center gap-1.5">
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
        </div>
    );
}
