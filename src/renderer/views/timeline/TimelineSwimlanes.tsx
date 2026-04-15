import { useRef, useState, useCallback } from 'react';
import type { TimelineData } from '../../../shared/types';
import type { TimelineLayerToggles } from '../../store';
import { TimelineLane } from './TimelineLane';
import { TimelineBoonLane } from './TimelineBoonLane';
import { TimelineEventMarkers } from './TimelineEventMarkers';

interface TimelineSwimlanesProps {
    data: TimelineData;
    toggles: TimelineLayerToggles;
    durationMs: number;
    onSelectionChange: (selection: { startMs: number; endMs: number } | null) => void;
    selection: { startMs: number; endMs: number } | null;
}

function healthPercentToBuckets(healthPercent: [number, number][], durationMs: number, bucketSizeMs: number): { time: number; value: number }[] {
    if (healthPercent.length === 0) return [];
    const bucketCount = Math.ceil(durationMs / bucketSizeMs);
    const buckets: { time: number; value: number }[] = [];
    let stateIdx = 0;

    for (let b = 0; b < bucketCount; b++) {
        const t = b * bucketSizeMs;
        while (stateIdx < healthPercent.length - 1 && healthPercent[stateIdx + 1][0] <= t) {
            stateIdx++;
        }
        buckets.push({ time: t, value: healthPercent[stateIdx][1] });
    }
    return buckets;
}

export function TimelineSwimlanes({ data, toggles, durationMs, onSelectionChange, selection }: TimelineSwimlanesProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const [dragging, setDragging] = useState(false);
    const [dragStart, setDragStart] = useState<number | null>(null);
    const [dragEnd, setDragEnd] = useState<number | null>(null);

    const labelWidth = 90;

    const pxToMs = useCallback((clientX: number) => {
        if (!containerRef.current) return 0;
        const rect = containerRef.current.getBoundingClientRect();
        const dataWidth = rect.width - labelWidth;
        const relX = clientX - rect.left - labelWidth;
        const pct = Math.max(0, Math.min(1, relX / dataWidth));
        return Math.round(pct * durationMs);
    }, [durationMs]);

    const handleMouseDown = (e: React.MouseEvent) => {
        const ms = pxToMs(e.clientX);
        setDragging(true);
        setDragStart(ms);
        setDragEnd(ms);
    };

    const handleMouseMove = (e: React.MouseEvent) => {
        if (!dragging) return;
        setDragEnd(pxToMs(e.clientX));
    };

    const handleMouseUp = () => {
        if (dragging && dragStart !== null && dragEnd !== null) {
            const startMs = Math.min(dragStart, dragEnd);
            const endMs = Math.max(dragStart, dragEnd);
            if (endMs - startMs > 500) {
                onSelectionChange({ startMs, endMs });
            } else {
                onSelectionChange(null);
            }
        }
        setDragging(false);
        setDragStart(null);
        setDragEnd(null);
    };

    const handleEventClick = (timeMs: number) => {
        const startMs = Math.max(0, timeMs - 10000);
        const endMs = Math.min(durationMs, timeMs + 3000);
        onSelectionChange({ startMs, endMs });
    };

    const domainMs: [number, number] = [0, durationMs];
    const healthBuckets = healthPercentToBuckets(data.healthPercent, durationMs, data.bucketSizeMs);

    const activeSelection = dragging && dragStart !== null && dragEnd !== null
        ? { startMs: Math.min(dragStart, dragEnd), endMs: Math.max(dragStart, dragEnd) }
        : selection;

    const formatTick = (ms: number) => {
        const sec = Math.floor(ms / 1000);
        return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
    };

    const tickCount = Math.min(8, Math.max(3, Math.floor(durationMs / 30000) + 1));
    const ticks = Array.from({ length: tickCount }, (_, i) => Math.round((i / (tickCount - 1)) * durationMs));

    return (
        <div className="relative" ref={containerRef}>
            {/* Time axis */}
            <div className="flex justify-between text-[9px] text-[#555] mb-1.5" style={{ paddingLeft: labelWidth, paddingRight: 4 }}>
                {ticks.map(t => <span key={t}>{formatTick(t)}</span>)}
            </div>

            {/* Swimlane area with drag handler */}
            <div
                className="relative cursor-crosshair select-none"
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
            >
                {/* Selection highlight */}
                {activeSelection && activeSelection.endMs - activeSelection.startMs > 500 && (
                    <div
                        className="absolute top-0 bottom-0 z-[5] pointer-events-none"
                        style={{
                            left: `calc(${labelWidth}px + ${(activeSelection.startMs / durationMs) * 100}% * (100% - ${labelWidth}px) / 100%)`,
                            width: `calc(${((activeSelection.endMs - activeSelection.startMs) / durationMs) * 100}% * (100% - ${labelWidth}px) / 100%)`,
                            background: 'rgba(96,165,250,0.06)',
                            borderLeft: '1.5px solid rgba(96,165,250,0.4)',
                            borderRight: '1.5px solid rgba(96,165,250,0.4)',
                        }}
                    />
                )}

                {/* Event markers — click to auto-select window around event */}
                <TimelineEventMarkers
                    downEvents={data.downEvents}
                    deathEvents={data.deathEvents}
                    durationMs={durationMs}
                    onEventClick={handleEventClick}
                />

                {/* Area chart lanes */}
                {toggles.health && <TimelineLane label="Health" color="#10b981" data={healthBuckets} domainMs={domainMs} />}
                {toggles.damageDealt && <TimelineLane label="Dmg Dealt" color="#ef4444" data={data.damageDealt} domainMs={domainMs} />}
                {toggles.damageTaken && <TimelineLane label="Dmg Taken" color="#f87171" data={data.damageTaken} domainMs={domainMs} />}
                {toggles.distanceToTag && <TimelineLane label="Dist to Tag" color="#f59e0b" data={data.distanceToTag} domainMs={domainMs} />}
                {toggles.incomingHealing && <TimelineLane label="Healing" color="#4ade80" data={data.incomingHealing} domainMs={domainMs} />}
                {toggles.incomingBarrier && <TimelineLane label="Barrier" color="#a78bfa" data={data.incomingBarrier} domainMs={domainMs} />}

                {/* Boon/condition bar lanes */}
                {toggles.offensiveBoons && <TimelineBoonLane label="Off Boons" color="#60a5fa" buffs={data.offensiveBoons} durationMs={durationMs} />}
                {toggles.defensiveBoons && <TimelineBoonLane label="Def Boons" color="#38bdf8" buffs={data.defensiveBoons} durationMs={durationMs} />}
                {toggles.hardCC && <TimelineBoonLane label="Hard CC" color="#f43f5e" buffs={data.hardCC} durationMs={durationMs} />}
                {toggles.softCC && <TimelineBoonLane label="Soft CC" color="#c084fc" buffs={data.softCC} durationMs={durationMs} />}
            </div>
        </div>
    );
}
