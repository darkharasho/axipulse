// src/renderer/views/timeline/TimelineControls.tsx
import { useAppStore } from '../../store';
import { TIMELINE_LAYERS } from './TimelinePresets';

export function TimelineControls() {
    const toggles = useAppStore(s => s.timelineToggles);
    const setToggle = useAppStore(s => s.setTimelineToggle);

    return (
        <div className="flex flex-wrap gap-2 mb-3">
            {TIMELINE_LAYERS.map(layer => (
                <label
                    key={layer.key}
                    className="flex items-center gap-1.5 text-[10px] cursor-pointer select-none"
                >
                    <div
                        className="w-2.5 h-2.5 rounded-sm border"
                        style={{
                            borderColor: layer.color,
                            background: toggles[layer.key] ? layer.color : 'transparent',
                        }}
                        onClick={() => setToggle(layer.key, !toggles[layer.key])}
                    />
                    <span className={toggles[layer.key] ? 'text-[color:var(--text-primary)]' : 'text-[color:var(--text-muted)]'}>
                        {layer.label}
                    </span>
                </label>
            ))}
        </div>
    );
}
