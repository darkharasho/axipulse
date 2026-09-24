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

// The row label used to sit inline with the bar (right: 2, overlapping
// whatever segment was drawn there) with an opaque backdrop plate behind it.
// Two of Task 10's fix-round rulings make that untenable together: solid
// fills (no more translucency) mean the bar segment nearest the label is now
// fully opaque, and the canonical boon-token remap collapsed several boons
// in the same lane onto near-identical hues (Def Boons is two blues and two
// ambers), so the NAME label is now the primary way to tell them apart. A
// label that occludes the exact moment ("did I still have Stability when I
// died?") fights its own job. So the label gets its own thin strip above
// the bar instead of overlaying it — no backdrop needed, nothing to hide.
const LABEL_HEIGHT = 8;
const ROW_GAP = 2;

// box-sizing is border-box app-wide, so the track's own `border:
// var(--axi-border-control) solid ...` (3px, top and bottom) eats into its
// height budget: the PADDING box — the containing block absolutely
// positioned rows are placed against — is the track's own `height` (which
// we set to `laneHeight` via the parent's `h-full`) minus 2 * that border
// width, not `laneHeight` itself. This is the exact bug class documented at
// index.css:99-102 for `.ap-meter` (a 6px track with a 2px border left only
// a 2px content box): here it clipped the last buff row's bar, and it got
// worse when the label-above-bar restructure made each row taller. Budget
// the border explicitly rather than approximating it away.
const CONTROL_BORDER_PX = 3; // matches --axi-border-control
const TRACK_BORDER_BUDGET = CONTROL_BORDER_PX * 2; // top + bottom

export function TimelineBoonLane({ label, color, buffs, durationMs }: TimelineBoonLaneProps) {
    const buffEntries = Object.entries(buffs);
    const rowHeight = buffEntries.length > 0 ? Math.max(7, Math.min(10, 36 / buffEntries.length)) : 10;
    const rowUnit = LABEL_HEIGHT + rowHeight + ROW_GAP;
    const laneHeight = Math.max(28, buffEntries.length * rowUnit + ROW_GAP + TRACK_BORDER_BUDGET);

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
                    const rowTop = ROW_GAP + rowIdx * rowUnit;

                    return (
                        <div key={id} className="absolute w-full" style={{ top: rowTop, height: rowUnit }}>
                            <span
                                className="absolute text-right truncate pointer-events-none"
                                style={{
                                    right: 2, top: 0,
                                    zIndex: 2,
                                    fontSize: 8, color: barColor,
                                    lineHeight: `${LABEL_HEIGHT}px`,
                                    maxWidth: 80,
                                }}
                            >
                                {entry.name}
                            </span>
                            <div className="absolute w-full" style={{ top: LABEL_HEIGHT, height: rowHeight }}>
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
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
