import { useRef, useState, useCallback, useMemo } from 'react';
import type { TimelineData, TimelineBucket } from '../../../shared/types';
import type { TimelineLayerToggles } from '../../store';
import { TimelineLane } from './TimelineLane';
import { TimelineHealthLane } from './TimelineHealthLane';
import { TimelineBoonLane } from './TimelineBoonLane';
import { TimelineEventMarkers } from './TimelineEventMarkers';
import { TIMELINE_LANES } from './TimelinePresets';

const laneColor = (key: keyof TimelineLayerToggles): string =>
    TIMELINE_LANES.find(l => l.key === key)?.color ?? 'var(--axi-text-dim)';

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

function nearestBucketValue(buckets: TimelineBucket[], timeMs: number): number | null {
    if (buckets.length === 0) return null;
    let best = buckets[0];
    let bestDist = Math.abs(buckets[0].time - timeMs);
    for (let i = 1; i < buckets.length; i++) {
        const dist = Math.abs(buckets[i].time - timeMs);
        if (dist < bestDist) { best = buckets[i]; bestDist = dist; }
        else break;
    }
    return best.value;
}

export function TimelineSwimlanes({ data, toggles, durationMs, onSelectionChange, selection }: TimelineSwimlanesProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const [dragging, setDragging] = useState(false);
    const [dragStart, setDragStart] = useState<number | null>(null);
    const [dragEnd, setDragEnd] = useState<number | null>(null);
    const [hoverX, setHoverX] = useState<number | null>(null);

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

    const clientXToPct = useCallback((clientX: number) => {
        if (!containerRef.current) return null;
        const rect = containerRef.current.getBoundingClientRect();
        const dataWidth = rect.width - labelWidth;
        const relX = clientX - rect.left - labelWidth;
        const pct = relX / dataWidth;
        if (pct < 0 || pct > 1) return null;
        return pct;
    }, []);

    const handleMouseMove = (e: React.MouseEvent) => {
        setHoverX(clientXToPct(e.clientX));
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

    const hoverTimeMs = hoverX !== null ? Math.round(hoverX * durationMs) : null;

    const tooltipRows = useMemo(() => {
        if (hoverTimeMs === null || dragging) return [];
        const rows: { label: string; color: string; value: string }[] = [];
        if (toggles.health) {
            const v = nearestBucketValue(healthBuckets, hoverTimeMs);
            if (v !== null) rows.push({ label: 'Health', color: laneColor('health'), value: `${Math.round(v)}%` });
        }
        if (toggles.damageDealt) {
            const v = nearestBucketValue(data.damageDealt, hoverTimeMs);
            if (v !== null) rows.push({ label: 'Dmg Dealt', color: laneColor('damageDealt'), value: v.toLocaleString() });
        }
        if (toggles.damageTaken) {
            const v = nearestBucketValue(data.damageTaken, hoverTimeMs);
            if (v !== null) rows.push({ label: 'Dmg Taken', color: laneColor('damageTaken'), value: v.toLocaleString() });
        }
        if (toggles.distanceToTag) {
            const v = nearestBucketValue(data.distanceToTag, hoverTimeMs);
            if (v !== null) rows.push({ label: 'Dist to Tag', color: laneColor('distanceToTag'), value: v.toLocaleString() });
        }
        if (toggles.incomingHealing) {
            const v = nearestBucketValue(data.incomingHealing, hoverTimeMs);
            if (v !== null) rows.push({ label: 'Healing', color: laneColor('incomingHealing'), value: v.toLocaleString() });
        }
        if (toggles.incomingBarrier) {
            const v = nearestBucketValue(data.incomingBarrier, hoverTimeMs);
            if (v !== null) rows.push({ label: 'Barrier', color: laneColor('incomingBarrier'), value: v.toLocaleString() });
        }
        return rows;
    }, [hoverTimeMs, dragging, toggles, healthBuckets, data]);

    return (
        <div className="relative" ref={containerRef}>
            {/* Time axis */}
            <div className="flex justify-between text-[9px] mb-1.5" style={{ paddingLeft: labelWidth, paddingRight: 4, color: 'var(--axi-text-faint)' }}>
                {ticks.map(t => <span key={t}>{formatTick(t)}</span>)}
            </div>

            {/* Swimlane area with drag handler */}
            <div
                className="relative cursor-crosshair select-none"
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={() => { handleMouseUp(); setHoverX(null); }}
            >
                {/* Selection highlight */}
                {activeSelection && activeSelection.endMs - activeSelection.startMs > 500 && (
                    <div
                        className="absolute top-0 bottom-0 z-[5] pointer-events-none"
                        style={{
                            left: `calc(${labelWidth}px + ${(activeSelection.startMs / durationMs)} * (100% - ${labelWidth}px))`,
                            width: `calc(${((activeSelection.endMs - activeSelection.startMs) / durationMs)} * (100% - ${labelWidth}px))`,
                            background: 'transparent',
                            borderLeft: 'var(--axi-border-control) solid var(--axi-accent)',
                            borderRight: 'var(--axi-border-control) solid var(--axi-accent)',
                        }}
                    />
                )}

                {/* Crosshair + tooltip */}
                {hoverX !== null && !dragging && (
                    <>
                        <div
                            className="absolute top-0 bottom-0 z-[4] pointer-events-none"
                            style={{
                                left: `calc(${labelWidth}px + ${hoverX} * (100% - ${labelWidth}px))`,
                                width: 1,
                                background: 'var(--axi-rule)',
                            }}
                        />
                        {tooltipRows.length > 0 && (
                            <div
                                className="axi-tooltip absolute z-[6] pointer-events-none py-1 px-2"
                                style={{
                                    position: 'absolute',
                                    top: 0,
                                    left: `calc(${labelWidth}px + ${hoverX} * (100% - ${labelWidth}px) + 8px)`,
                                    transform: hoverX > 0.75 ? 'translateX(calc(-100% - 16px))' : undefined,
                                }}
                            >
                                <div className="text-[8px] mb-0.5" style={{ color: 'var(--axi-text-dim)' }}>{formatTick(hoverTimeMs!)}</div>
                                {tooltipRows.map(r => (
                                    <div key={r.label} className="flex items-center gap-1.5 text-[9px] leading-[14px]">
                                        <span className="w-1.5 h-1.5 shrink-0" style={{ background: r.color }} />
                                        <span style={{ color: 'var(--axi-text-dim)' }}>{r.label}</span>
                                        <span className="ml-auto pl-2 font-medium" style={{ color: 'var(--axi-text)' }}>{r.value}</span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </>
                )}

                {/* Event markers — click to auto-select window around event */}
                <TimelineEventMarkers
                    downEvents={data.downEvents}
                    deathEvents={data.deathEvents}
                    durationMs={durationMs}
                    onEventClick={handleEventClick}
                />

                {/* Area chart lanes */}
                {toggles.health && <TimelineHealthLane data={healthBuckets} domainMs={domainMs} />}
                {toggles.damageDealt && <TimelineLane label="Dmg Dealt" color={laneColor('damageDealt')} data={data.damageDealt} domainMs={domainMs} />}
                {toggles.damageTaken && <TimelineLane label="Dmg Taken" color={laneColor('damageTaken')} data={data.damageTaken} domainMs={domainMs} />}
                {toggles.distanceToTag && <TimelineLane label="Dist to Tag" color={laneColor('distanceToTag')} data={data.distanceToTag} domainMs={domainMs} />}
                {toggles.incomingHealing && <TimelineLane label="Healing" color={laneColor('incomingHealing')} data={data.incomingHealing} domainMs={domainMs} />}
                {toggles.incomingBarrier && <TimelineLane label="Barrier" color={laneColor('incomingBarrier')} data={data.incomingBarrier} domainMs={domainMs} />}

                {/* Boon/condition bar lanes */}
                {toggles.offensiveBoons && <TimelineBoonLane label="Off Boons" color={laneColor('offensiveBoons')} buffs={data.offensiveBoons} durationMs={durationMs} />}
                {toggles.defensiveBoons && <TimelineBoonLane label="Def Boons" color={laneColor('defensiveBoons')} buffs={data.defensiveBoons} durationMs={durationMs} />}
                {toggles.hardCC && <TimelineBoonLane label="Hard CC" color={laneColor('hardCC')} buffs={data.hardCC} durationMs={durationMs} />}
                {toggles.softCC && <TimelineBoonLane label="Soft CC" color={laneColor('softCC')} buffs={data.softCC} durationMs={durationMs} />}
            </div>
        </div>
    );
}
