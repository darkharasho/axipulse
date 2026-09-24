import { getAvgDistanceInRange } from '../../../../shared/timelineInspector';
import type { TimelineBucket } from '../../../../shared/types';

interface PositionPanelProps {
    distanceToTag: TimelineBucket[];
    startMs: number;
    endMs: number;
}

export function PositionPanel({ distanceToTag, startMs, endMs }: PositionPanelProps) {
    const stats = getAvgDistanceInRange(distanceToTag, startMs, endMs);
    // `null` means no replay sample in this window -- for the commander that
    // is permanent (no distance to their own tag). Rendering 0 would paint a
    // green "perfectly stacked" readout over an absence.
    if (stats === null) {
        return (
            <div className="axi-panel p-2.5">
                <div className="axi-eyebrow" style={{ color: 'var(--axi-warn)' }}>Positioning</div>
                <div className="text-center py-3">
                    <div style={{ font: 'var(--axi-t-h2)', color: 'var(--axi-text-faint)' }}>—</div>
                    <div className="text-[9px]" style={{ color: 'var(--axi-text-dim)' }}>no distance data in this range</div>
                </div>
            </div>
        );
    }
    const { avg, max } = stats;
    const distColor = avg < 600 ? 'var(--axi-ok)' : avg < 1200 ? 'var(--axi-warn)' : 'var(--axi-danger)';
    const barPct = Math.min(100, (avg / 2400) * 100);

    return (
        <div className="axi-panel p-2.5">
            <div className="axi-eyebrow" style={{ color: 'var(--axi-warn)' }}>Positioning</div>
            <div className="text-center mb-2">
                <div style={{ font: 'var(--axi-t-h2)', color: distColor }}>{avg.toLocaleString()}</div>
                <div className="text-[9px]" style={{ color: 'var(--axi-text-dim)' }}>avg distance to tag</div>
            </div>
            <div className="ap-meter mb-1.5">
                <div className="ap-meter-fill" style={{ width: `${barPct}%`, background: distColor }} />
            </div>
            <div className="flex justify-between" style={{ font: 'var(--axi-t-micro)', color: 'var(--axi-text-faint)' }}>
                <span>0</span><span>600</span><span>1200</span><span>2400+</span>
            </div>
            {avg > 1200 && (
                <div className="mt-2 text-[9px] px-1.5 py-1" style={{ color: 'var(--axi-warn)', background: 'transparent', border: 'var(--axi-border-control) solid var(--axi-warn)' }}>
                    ⚠️ Far from squad — peaked at {max.toLocaleString()}
                </div>
            )}
        </div>
    );
}
