import type { BuffStateEntry } from '../../../shared/types';

interface TimelineBoonLaneProps {
    label: string;
    color: string;
    buffs: Record<number, BuffStateEntry>;
    durationMs: number;
}

interface BarSegment {
    startPct: number;
    widthPct: number;
}

function getBarSegments(states: [number, number][], durationMs: number): BarSegment[] {
    if (states.length === 0 || durationMs <= 0) return [];
    const segments: BarSegment[] = [];
    let activeStart: number | null = null;

    for (const [time, stacks] of states) {
        if (stacks > 0 && activeStart === null) {
            activeStart = time;
        } else if (stacks === 0 && activeStart !== null) {
            segments.push({
                startPct: (activeStart / durationMs) * 100,
                widthPct: ((time - activeStart) / durationMs) * 100,
            });
            activeStart = null;
        }
    }
    if (activeStart !== null) {
        segments.push({
            startPct: (activeStart / durationMs) * 100,
            widthPct: ((durationMs - activeStart) / durationMs) * 100,
        });
    }
    return segments;
}

const BUFF_COLORS: Record<number, string> = {
    740: '#f59e0b',   // Might
    725: '#ef4444',   // Fury
    1187: '#a78bfa',  // Quickness
    30328: '#818cf8', // Alacrity
    1122: '#10b981',  // Stability
    717: '#60a5fa',   // Protection
    26980: '#a78bfa', // Resistance
    743: '#fbbf24',   // Aegis
    872: '#f43f5e',   // Stun
    833: '#e879f9',   // Daze
    785: '#fb923c',   // Fear
    722: '#67e8f9',   // Chill
    727: '#fbbf24',   // Immobilize
    26766: '#a78bfa', // Slow
};

export function TimelineBoonLane({ label, color, buffs, durationMs }: TimelineBoonLaneProps) {
    const buffEntries = Object.entries(buffs);
    const rowHeight = buffEntries.length > 0 ? Math.max(7, Math.min(10, 36 / buffEntries.length)) : 10;
    const laneHeight = Math.max(28, buffEntries.length * (rowHeight + 2) + 4);

    return (
        <div className="flex items-center mb-0.5" style={{ height: laneHeight }}>
            <div className="w-[90px] text-right pr-2.5 text-[10px] font-medium shrink-0" style={{ color }}>{label}</div>
            <div className="flex-1 h-full bg-[#0f0f0f] rounded border border-[#1a1a1a] relative overflow-hidden" style={{ padding: '2px 0' }}>
                {buffEntries.length === 0 && (
                    <div className="flex items-center justify-center h-full">
                        <span className="text-[8px] text-[#333]">None detected</span>
                    </div>
                )}
                {buffEntries.map(([idStr, entry], rowIdx) => {
                    const id = Number(idStr);
                    const segments = getBarSegments(entry.states, durationMs);
                    const barColor = BUFF_COLORS[id] ?? color;

                    return (
                        <div
                            key={id}
                            className="absolute w-full"
                            style={{ top: 2 + rowIdx * (rowHeight + 2), height: rowHeight }}
                        >
                            {segments.map((seg, i) => (
                                <div
                                    key={i}
                                    className="absolute rounded-sm"
                                    style={{
                                        left: `${seg.startPct}%`,
                                        width: `${seg.widthPct}%`,
                                        height: '100%',
                                        background: barColor,
                                        opacity: 0.5,
                                    }}
                                >
                                    {i === 0 && entry.icon && seg.widthPct > 3 && (
                                        <img
                                            src={entry.icon}
                                            alt={entry.name}
                                            className="absolute rounded-sm"
                                            style={{ left: 1, top: 0, height: rowHeight, width: rowHeight }}
                                        />
                                    )}
                                </div>
                            ))}
                            <span
                                className="absolute text-right pr-1"
                                style={{ right: 0, top: 0, fontSize: Math.min(7, rowHeight - 1), color: `${barColor}88`, lineHeight: `${rowHeight}px` }}
                            >
                                {entry.name}
                            </span>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
