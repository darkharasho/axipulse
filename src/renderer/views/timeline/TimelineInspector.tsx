import type { TimelineData, SkillDamage } from '../../../shared/types';
import { HealthPanel } from './inspector/HealthPanel';
import { BoonStatePanel } from './inspector/BoonStatePanel';
import { TopHitsPanel } from './inspector/TopHitsPanel';
import { PositionPanel } from './inspector/PositionPanel';

interface TimelineInspectorProps {
    data: TimelineData;
    selection: { startMs: number; endMs: number };
    topDamageTakenSkills: SkillDamage[];
    isFullFight?: boolean;
}

export function TimelineInspector({ data, selection, topDamageTakenSkills, isFullFight }: TimelineInspectorProps) {
    const formatTime = (ms: number) => {
        const sec = Math.floor(ms / 1000);
        return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
    };

    const windowSec = Math.round((selection.endMs - selection.startMs) / 1000);
    const label = isFullFight
        ? `▲ INSPECTOR: FULL FIGHT (${windowSec}s) ▲`
        : `▲ INSPECTOR: ${formatTime(selection.startMs)} — ${formatTime(selection.endMs)} (${windowSec}s selected) ▲`;

    return (
        <div>
            <div className="border-t border-[#333] my-3 relative">
                <span className="absolute top-[-8px] left-1/2 -translate-x-1/2 bg-[#0a0a0a] px-3 text-[9px] text-[#60a5fa] tracking-wider">
                    {label}
                </span>
            </div>
            <div className="grid grid-cols-4 gap-2.5">
                <HealthPanel
                    healthPercent={data.healthPercent}
                    startMs={selection.startMs}
                    endMs={selection.endMs}
                    downEvents={data.downEvents}
                    deathEvents={data.deathEvents}
                />
                <BoonStatePanel
                    offensiveBoons={data.offensiveBoons}
                    defensiveBoons={data.defensiveBoons}
                    timeMs={selection.endMs}
                />
                <TopHitsPanel topDamageTakenSkills={topDamageTakenSkills} />
                <PositionPanel
                    distanceToTag={data.distanceToTag}
                    startMs={selection.startMs}
                    endMs={selection.endMs}
                />
            </div>
        </div>
    );
}
