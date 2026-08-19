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
            <div className="bg-[#111] rounded-[5px] p-2.5 border border-[#1a1a1a]">
                <div className="text-[9px] text-[#f59e0b] mb-2 uppercase tracking-wider">Positioning</div>
                <div className="text-center py-3">
                    <div className="text-[28px] font-bold text-[#555]">—</div>
                    <div className="text-[9px] text-[#888]">no distance data in this range</div>
                </div>
            </div>
        );
    }
    const { avg, max } = stats;
    const distColor = avg < 600 ? '#10b981' : avg < 1200 ? '#f59e0b' : '#ef4444';
    const barPct = Math.min(100, (avg / 2400) * 100);

    return (
        <div className="bg-[#111] rounded-[5px] p-2.5 border border-[#1a1a1a]">
            <div className="text-[9px] text-[#f59e0b] mb-2 uppercase tracking-wider">Positioning</div>
            <div className="text-center mb-2">
                <div className="text-[28px] font-bold" style={{ color: distColor }}>{avg.toLocaleString()}</div>
                <div className="text-[9px] text-[#888]">avg distance to tag</div>
            </div>
            <div className="h-[3px] bg-[#1a1a1a] rounded mb-1.5">
                <div
                    className="h-full rounded"
                    style={{
                        width: `${barPct}%`,
                        background: 'linear-gradient(90deg, #10b981, #f59e0b, #ef4444)',
                    }}
                />
            </div>
            <div className="flex justify-between text-[8px] text-[#555]">
                <span>0</span><span>600</span><span>1200</span><span>2400+</span>
            </div>
            {avg > 1200 && (
                <div className="mt-2 text-[9px] text-[#f59e0b] bg-[#f59e0b11] px-1.5 py-1 rounded">
                    ⚠️ Far from squad — peaked at {max.toLocaleString()}
                </div>
            )}
        </div>
    );
}
