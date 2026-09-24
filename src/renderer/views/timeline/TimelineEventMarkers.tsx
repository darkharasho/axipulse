interface TimelineEventMarkersProps {
    downEvents: number[];
    deathEvents: number[];
    durationMs: number;
    onEventClick: (timeMs: number) => void;
}

export function TimelineEventMarkers({ downEvents, deathEvents, durationMs, onEventClick }: TimelineEventMarkersProps) {
    if (durationMs <= 0) return null;

    return (
        <>
            {downEvents.map((t, i) => (
                <div
                    key={`down-${i}`}
                    className="absolute top-0 bottom-0 z-[6] cursor-pointer"
                    style={{ left: `calc(90px + ${t / durationMs} * (100% - 90px))`, width: 12, marginLeft: -6 }}
                    onClick={(e) => { e.stopPropagation(); onEventClick(t); }}
                >
                    <div className="absolute top-[-12px] left-[2px] text-[8px]">⬇</div>
                    {/* Guarded on both sides by ground (rule-general, not
                        accent-specific) so the dashed line reads against
                        whatever colour the lane underneath it happens to be. */}
                    <div className="absolute left-[4px] top-0 bottom-0 w-0 border-l" style={{ borderColor: 'var(--axi-ground)' }} />
                    <div className="absolute left-[5px] top-0 bottom-0 w-0 border-l border-dashed" style={{ borderColor: 'var(--axi-warn)' }} />
                    <div className="absolute left-[6px] top-0 bottom-0 w-0 border-l" style={{ borderColor: 'var(--axi-ground)' }} />
                </div>
            ))}
            {deathEvents.map((t, i) => (
                <div
                    key={`death-${i}`}
                    className="absolute top-0 bottom-0 z-[6] cursor-pointer"
                    style={{ left: `calc(90px + ${t / durationMs} * (100% - 90px))`, width: 12, marginLeft: -6 }}
                    onClick={(e) => { e.stopPropagation(); onEventClick(t); }}
                >
                    <div className="absolute top-[-12px] left-[1px] text-[8px]">💀</div>
                    <div className="absolute left-[4px] top-0 bottom-0 w-0 border-l" style={{ borderColor: 'var(--axi-ground)' }} />
                    <div className="absolute left-[5px] top-0 bottom-0 w-0 border-l border-dashed" style={{ borderColor: 'var(--axi-danger)' }} />
                    <div className="absolute left-[6px] top-0 bottom-0 w-0 border-l" style={{ borderColor: 'var(--axi-ground)' }} />
                </div>
            ))}
        </>
    );
}
