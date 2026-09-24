import { useAppStore } from '../../store';
import { TIMELINE_LANES } from './TimelinePresets';

export function TimelineLaneToggles() {
    const toggles = useAppStore(s => s.timelineToggles);
    const setToggle = useAppStore(s => s.setTimelineToggle);

    return (
        <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[9px]" style={{ color: 'var(--axi-text-faint)' }}>Lanes:</span>
            {TIMELINE_LANES.map(lane => (
                <button
                    key={lane.key}
                    type="button"
                    title={lane.label}
                    aria-pressed={toggles[lane.key]}
                    onClick={() => setToggle(lane.key, !toggles[lane.key])}
                    className="axi-pill"
                    style={{
                        padding: '2px 6px',
                        font: 'var(--axi-t-micro)',
                        letterSpacing: 'var(--axi-ls-micro)',
                        '--axi-pill-fill': lane.color,
                    } as React.CSSProperties}
                >
                    {/* .axi-pill only fills with the lane colour once pressed
                        (--axi-pill-fill is read as the PRESSED background), so
                        an unpressed pill would otherwise show no lane colour at
                        all — the colour<->lane mapping the old dot always
                        carried would be unlearnable while off. This marker
                        keeps the cue legible in both states. */}
                    <span
                        className="shrink-0"
                        style={{ width: 6, height: 6, background: lane.color }}
                    />
                    {lane.label}
                </button>
            ))}
        </div>
    );
}
