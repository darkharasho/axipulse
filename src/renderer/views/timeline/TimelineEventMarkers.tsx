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
                    <div className="absolute left-[5px] top-0 bottom-0 w-0 border-l border-dashed" style={{ borderColor: 'rgba(245,158,11,0.35)' }} />
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
                    <div className="absolute left-[5px] top-0 bottom-0 w-0 border-l border-dashed" style={{ borderColor: 'rgba(239,68,68,0.35)' }} />
                </div>
            ))}
        </>
    );
}
