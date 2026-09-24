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

// Fixed per-buff/effect identity colours (rule 9/10: domain data carries its
// own colour, independent of the accent). Canonical boon tokens are the same
// ones BoonsSubview reads from series.css; the CC-only effects (Stun, Daze,
// Fear, Chill, Immobilize, Slow) have no boon-panel equivalent, so Task 10
// adds a matching --axi-series-cc-* block to series.css rather than keeping
// them as one-off literals here.
const BUFF_COLORS: Record<number, string> = {
    740: 'var(--axi-series-boon-might)',
    725: 'var(--axi-series-boon-fury)',
    1187: 'var(--axi-series-boon-quickness)',
    30328: 'var(--axi-series-boon-alacrity)',
    1122: 'var(--axi-series-boon-stability)',
    717: 'var(--axi-series-boon-protection)',
    26980: 'var(--axi-series-boon-resistance)',
    743: 'var(--axi-series-boon-aegis)',
    872: 'var(--axi-series-cc-stun)',
    833: 'var(--axi-series-cc-daze)',
    791: 'var(--axi-series-cc-fear)',
    722: 'var(--axi-series-cc-chill)',
    727: 'var(--axi-series-cc-immobilize)',
    26766: 'var(--axi-series-cc-slow)',
};

export function TimelineBoonLane({ label, color, buffs, durationMs }: TimelineBoonLaneProps) {
    const buffEntries = Object.entries(buffs);
    const rowHeight = buffEntries.length > 0 ? Math.max(7, Math.min(10, 36 / buffEntries.length)) : 10;
    const laneHeight = Math.max(28, buffEntries.length * (rowHeight + 2) + 4);

    return (
        <div className="flex items-center mb-0.5" style={{ height: laneHeight }}>
            <div className="w-[90px] text-right pr-2.5 text-[10px] font-medium shrink-0" style={{ color }}>{label}</div>
            <div
                className="flex-1 h-full relative overflow-hidden"
                style={{ background: 'var(--axi-ground)', border: 'var(--axi-border-control) solid var(--axi-ink-line)', padding: '2px 0' }}
            >
                {buffEntries.length === 0 && (
                    <div className="flex items-center justify-center h-full">
                        <span className="text-[8px]" style={{ color: 'var(--axi-text-faint)' }}>None detected</span>
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
                                    className="absolute"
                                    style={{
                                        left: `${seg.startPct}%`,
                                        width: `${seg.widthPct}%`,
                                        height: '100%',
                                        background: barColor,
                                    }}
                                >
                                    {i === 0 && entry.icon && seg.widthPct > 3 && (
                                        <img
                                            src={entry.icon}
                                            alt={entry.name}
                                            style={{ left: 1, top: 0, height: rowHeight, width: rowHeight, position: 'absolute' }}
                                        />
                                    )}
                                </div>
                            ))}
                            <span
                                className="absolute text-right truncate pointer-events-none"
                                style={{
                                    right: 2, top: 0,
                                    zIndex: 2,
                                    fontSize: 10, color: barColor,
                                    lineHeight: `${rowHeight}px`,
                                    maxWidth: 70,
                                    background: 'var(--axi-surface-raised)',
                                    padding: '0 3px',
                                }}
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
