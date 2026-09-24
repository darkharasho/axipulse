import { useRef, useState, useCallback, useEffect, useMemo, type MouseEvent } from 'react';
import { ChevronRight, Crosshair, MapPin, Pause, Play, RotateCcw, Users, ZoomIn, ZoomOut } from 'lucide-react';
import { useAppStore } from '../../store';
import { WVW_LANDMARKS, WvwMap, type WvwLandmark } from '../../../shared/wvwLandmarks';
import { resolveMapFromMapId } from '../../../shared/mapUtils';
import { getMapTiles, hasTileData, resolveMapPixelSize } from '../../../shared/wvwTiles';
import type { SkillCast, SquadMemberMovement } from '../../../shared/types';
import { lerpPos, memberFrame, memberPosAt } from '../../../shared/movementFrame';
import { getProfessionIconPath } from '../../classIconUtils';
import { getProfessionColor } from '../../../shared/professionUtils';
import { healthBand, STATUS_COLORS } from '../timeline/healthBands';
import Tooltip from '../../components/Tooltip';

// Landmarks are chrome, not domain data: the accent drives them. The type is
// carried by TYPE_SCALES below (a keep is 1.7x a camp) rather than by hue,
// and by whether the landmark is a claimable objective or a named location.
// `ruins` takes --axi-meta because ruins are a secondary, meta objective
// (rule 6); `named` takes faint text because a named location is a label,
// not an objective.
const TYPE_COLORS: Record<WvwLandmark['type'], string> = {
    keep: 'var(--axi-accent)',
    tower: 'var(--axi-accent)',
    camp: 'var(--axi-accent)',
    ruins: 'var(--axi-meta)',
    named: 'var(--axi-text-faint)',
};

const TYPE_SCALES: Record<WvwLandmark['type'], number> = {
    keep: 0.6,
    tower: 0.45,
    camp: 0.4,
    ruins: 0.35,
    named: 0.35,
};

const PIN_PATH = 'M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0';
const SKULL_PATH = 'M12 2a8 8 0 0 0-8 8c0 2.5 1.2 4.7 3 6.2V18a1 1 0 0 0 1 1h1v1a1 1 0 0 0 2 0v-1h2v1a1 1 0 0 0 2 0v-1h1a1 1 0 0 0 1-1v-1.8c1.8-1.5 3-3.7 3-6.2a8 8 0 0 0-8-8zm-2.5 9a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm5 0a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3z';

const TRAIL_LENGTH = 15;

const MIN_ZOOM = 1;
const MAX_ZOOM = 50;
const ZOOM_STEP = 0.15;

function getMemberStatus(member: SquadMemberMovement, timeMs: number): 'alive' | 'down' | 'dead' {
    for (const [start, end] of member.deadRanges) {
        if (timeMs >= start && timeMs <= end) return 'dead';
    }
    for (const [start, end] of member.downRanges) {
        if (timeMs >= start && timeMs <= end) return 'down';
    }
    return 'alive';
}

function getBoonStacks(member: SquadMemberMovement, boonId: number, timeMs: number): number {
    const states = member.boonStates?.[boonId];
    if (!states?.length) return 0;
    let stacks = 0;
    for (const [t, s] of states) {
        if (t > timeMs) break;
        stacks = s;
    }
    return stacks;
}

function getHealthPercent(member: SquadMemberMovement, timeMs: number): number {
    const hp = member.healthPercents;
    if (!hp?.length) return 100;
    let pct = hp[0][1];
    for (const [t, p] of hp) {
        if (t > timeMs) break;
        pct = p;
    }
    return pct;
}

const SKILL_FADE_MS = 1500;
const LATEST_HOLD_MS = 1200;
const LATEST_FADE_MS = 2500;
const MAX_VISIBLE_SKILLS = 4;

function getRecentSkills(
    casts: SkillCast[] | undefined,
    timeMs: number,
    skillIcons: Record<number, { name: string; icon: string }> | undefined,
): { id: number; opacity: number }[] {
    if (!casts?.length) return [];
    const result: { id: number; opacity: number }[] = [];
    let foundLatest = false;
    for (let i = casts.length - 1; i >= 0; i--) {
        const c = casts[i];
        if (c.time > timeMs) continue;
        if (!skillIcons?.[c.id]?.icon) continue;
        const age = timeMs - c.time;
        if (!foundLatest) {
            foundLatest = true;
            const totalLife = LATEST_HOLD_MS + LATEST_FADE_MS;
            if (age > totalLife) break;
            const opacity = age <= LATEST_HOLD_MS ? 1 : 1 - (age - LATEST_HOLD_MS) / LATEST_FADE_MS;
            result.push({ id: c.id, opacity });
        } else {
            if (age > SKILL_FADE_MS) continue;
            result.push({ id: c.id, opacity: 1 - age / SKILL_FADE_MS });
        }
        if (result.length >= MAX_VISIBLE_SKILLS) break;
    }
    result.reverse();
    return result;
}

const PANEL_BOON_ORDER = [740, 725, 717, 718, 726, 1122, 719, 743, 873, 1187, 30328, 26980];

function formatTime(ms: number): string {
    const sec = Math.floor(ms / 1000);
    return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
}

function tileZoomForScale(scale: number): number {
    if (scale >= 8) return 7;
    if (scale >= 4) return 6;
    if (scale >= 2) return 5;
    return 4;
}

export function MovementView() {
    const currentFight = useAppStore(s => s.currentFight);
    const containerRef = useRef<HTMLDivElement>(null);
    const [view, setView] = useState({ scale: 1, tx: 0, ty: 0 });
    const dragRef = useRef<{ startX: number; startY: number; startTx: number; startTy: number } | null>(null);
    const [timeMs, setTimeMs] = useState(0);
    const [showSquad, setShowSquad] = useState(false);
    const followPlayer = useAppStore(s => s.mapFollowPlayer);
    const setFollowPlayer = useAppStore(s => s.setMapFollowPlayer);
    const [playing, setPlaying] = useState(false);
    const [playSpeed, setPlaySpeed] = useState(1);
    const playSpeedRef = useRef(1);
    useEffect(() => { playSpeedRef.current = playSpeed; }, [playSpeed]);
    const [showPanel, setShowPanel] = useState(false);
    const lastFightRef = useRef<number | null>(null);

    useEffect(() => {
        if (!currentFight || currentFight.fightNumber === lastFightRef.current) return;
        lastFightRef.current = currentFight.fightNumber;
        setTimeMs(0);
        setPlaying(false);
        const container = containerRef.current;
        if (!container || !currentFight.avgPosition || !currentFight.mapSize) return;
        requestAnimationFrame(() => {
            const rect = container.getBoundingClientRect();
            const [mw, mh] = currentFight.mapSize!;
            const renderScale = Math.min(rect.width / mw, rect.height / mh);
            const renderH = mh * renderScale;
            const zoom = (rect.width / (mw * renderScale)) * 3;
            const ny = currentFight.avgPosition![1] / mh;
            const nx = currentFight.avgPosition![0] / mw;
            const renderW = mw * renderScale;
            setView({
                scale: zoom,
                tx: -(nx - 0.5) * renderW * zoom,
                ty: -(ny - 0.5) * renderH * zoom,
            });
        });
    }, [currentFight]);

    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;
        const onWheel = (e: globalThis.WheelEvent) => {
            e.preventDefault();
            const rect = container.getBoundingClientRect();
            const cx = rect.width / 2;
            const cy = rect.height / 2;
            const mouseX = e.clientX - rect.left - cx;
            const mouseY = e.clientY - rect.top - cy;
            setView(prev => {
                const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, prev.scale * (1 - Math.sign(e.deltaY) * ZOOM_STEP)));
                if (next === prev.scale) return prev;
                const ratio = next / prev.scale;
                return {
                    scale: next,
                    tx: prev.tx - (ratio - 1) * (mouseX - prev.tx),
                    ty: prev.ty - (ratio - 1) * (mouseY - prev.ty),
                };
            });
        };
        container.addEventListener('wheel', onWheel, { passive: false });
        return () => container.removeEventListener('wheel', onWheel);
    }, []);

    // Follow player: center view on local player's position
    useEffect(() => {
        if (!followPlayer || !currentFight?.movementData || !containerRef.current) return;
        const { movementData, mapSize, mapId } = currentFight;
        const local = movementData.members.find(m => m.isLocal);
        if (!local) return;
        // Same resolver the render path uses. The `?? 523 / ?? 750` that stood
        // here was Alpine's size, silently applied to EBG (716x750) and Red
        // Desert (750x750) -- which mis-framed the follow camera on two of the
        // four maps. Missed in Task 11's first pass because it is inside an
        // effect rather than the render body.
        const pixelSize = resolveMapPixelSize(mapSize, mapId === null ? null : resolveMapFromMapId(mapId));
        if (pixelSize === null) return;
        const [mw, mh] = pixelSize;
        const rect = containerRef.current.getBoundingClientRect();
        const renderScale = Math.min(rect.width / mw, rect.height / mh);
        const renderW = mw * renderScale;
        const renderH = mh * renderScale;
        const pos = memberPosAt(local, timeMs, movementData.pollingRate);
        if (!pos) return;
        const nx = pos[0] / mw;
        const ny = pos[1] / mh;
        setView(prev => ({
            scale: prev.scale,
            tx: -(nx - 0.5) * renderW * prev.scale,
            ty: -(ny - 0.5) * renderH * prev.scale,
        }));
    }, [followPlayer, timeMs, currentFight]);

    // Auto-play: smooth real-time playback via requestAnimationFrame
    useEffect(() => {
        if (!playing || !currentFight?.movementData) return;
        const { durationMs } = currentFight.movementData;
        let prevFrame: number | null = null;
        let raf: number;
        const tick = (timestamp: number) => {
            if (prevFrame !== null) {
                const delta = (timestamp - prevFrame) * playSpeedRef.current;
                setTimeMs(prev => {
                    const next = prev + delta;
                    if (next >= durationMs) {
                        setPlaying(false);
                        return durationMs;
                    }
                    return next;
                });
            }
            prevFrame = timestamp;
            raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(raf);
    }, [playing, currentFight]);

    const handleMouseDown = useCallback((e: MouseEvent) => {
        if (e.button !== 0) return;
        setFollowPlayer(false);
        setView(prev => {
            dragRef.current = { startX: e.clientX, startY: e.clientY, startTx: prev.tx, startTy: prev.ty };
            return prev;
        });
    }, []);

    const handleMouseMove = useCallback((e: MouseEvent) => {
        const drag = dragRef.current;
        if (!drag) return;
        setView(prev => ({
            ...prev,
            tx: drag.startTx + (e.clientX - drag.startX),
            ty: drag.startTy + (e.clientY - drag.startY),
        }));
    }, []);

    const handleMouseUp = useCallback(() => {
        dragRef.current = null;
    }, []);

    const resetView = useCallback(() => {
        setView({ scale: 1, tx: 0, ty: 0 });
    }, []);

    const zoomCenter = useCallback((direction: 1 | -1) => {
        setView(prev => {
            const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, prev.scale * (1 + direction * ZOOM_STEP * 2)));
            if (next === prev.scale) return prev;
            const ratio = next / prev.scale;
            return {
                scale: next,
                tx: prev.tx * ratio,
                ty: prev.ty * ratio,
            };
        });
    }, []);

    if (!currentFight) {
        return (
            <div className="flex flex-col items-center justify-center h-full gap-2">
                <MapPin className="w-8 h-8" style={{ color: 'var(--axi-text-faint)' }} />
                <span className="text-sm font-medium" style={{ color: 'var(--axi-text-dim)' }}>Movement Replay</span>
                <span className="text-xs" style={{ color: 'var(--axi-text-faint)' }}>Movement data will appear here after a fight is parsed</span>
            </div>
        );
    }

    const { mapImageUrl, mapSize, mapId, mapName, movementData } = currentFight;
    // By map ID, not by display name. `resolveMapFromMapId` covers all four
    // WvW maps and cannot be broken by a localisation or a rewording.
    const map = mapId === null ? null : resolveMapFromMapId(mapId);
    const landmarks = map ? WVW_LANDMARKS[map] : [];
    // `mapSize` is the log's own arena, squeezed into EI pixel space; the
    // per-map table is the fallback for a log with no arena; `null` means no
    // assets for this map at all. The bare `?? 523 / ?? 750` this replaced
    // was Alpine's size applied to EBG and Red Desert too, and the `[0, 0]`
    // that briefly replaced THAT was a degenerate coordinate space.
    const pixelSize = resolveMapPixelSize(mapSize, map);
    const useTiles = map && hasTileData(map);
    const tileZoom = tileZoomForScale(view.scale);
    const tiles = useMemo(
        // Third argument: the tiles are laid out in the SAME pixel space the
        // markers are, so they cannot drift from the table.
        () => (useTiles ? getMapTiles(map as WvwMap, tileZoom, mapSize ?? undefined) : []),
        [useTiles, map, tileZoom, mapSize],
    );

    // After every hook, so the rules of hooks hold on both branches.
    if (pixelSize === null) {
        return (
            <div className="flex flex-col items-center justify-center h-full gap-2">
                <MapPin className="w-8 h-8" style={{ color: 'var(--axi-text-faint)' }} />
                <span className="text-sm font-medium" style={{ color: 'var(--axi-text-dim)' }}>No Map Assets</span>
                <span className="text-xs" style={{ color: 'var(--axi-text-faint)' }}>
                    {mapName} is not a WvW map this app has landmark or tile data for
                </span>
            </div>
        );
    }

    if (!movementData || movementData.members.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center h-full gap-2">
                <MapPin className="w-8 h-8" style={{ color: 'var(--axi-text-faint)' }} />
                <span className="text-sm font-medium" style={{ color: 'var(--axi-text-dim)' }}>No Movement Data</span>
                <span className="text-xs" style={{ color: 'var(--axi-text-faint)' }}>This fight has no combat replay position data</span>
            </div>
        );
    }

    const [width, height] = pixelSize;

    const { pollingRate, durationMs, inchToPixel, members, boonIcons, skillIcons } = movementData;
    // There is no shared position index across members -- `members[0]`'s
    // array length is not every member's, and index i is a different instant
    // for each. Every site below resolves its own frame from `timeMs`.
    const markerScale = 1 / Math.pow(view.scale, 0.7);

    const allies = members.filter(m => !m.isEnemy && m.inSquad);
    const enemies = members.filter(m => m.isEnemy);
    const localPlayer = allies.find(m => m.isLocal);
    const localGroup = localPlayer?.group ?? -1;
    const commander = allies.find(m => m.isCommander);
    const commanderPos = commander ? memberPosAt(commander, timeMs, pollingRate) : null;

    return (
        <div className="flex flex-col h-full gap-2">
            <div className="flex items-center gap-4">
                <span className="text-sm font-medium" style={{ color: 'var(--axi-text)' }}>{mapName}</span>
                <span className="text-xs tabular-nums" style={{ color: 'var(--axi-text-dim)' }}>{formatTime(timeMs)}</span>
                <div className="flex items-center gap-2 ml-auto">
                    {/* Squad/Follow are on/off toggles, not status - the active
                        state is a solid accent fill, matching the selected-state
                        pattern used for nav tabs and the active capsule segment. */}
                    <button
                        onClick={() => setShowSquad(v => !v)}
                        className="flex items-center gap-1.5 px-2 py-0.5 text-xs"
                        style={{
                            color: showSquad ? 'var(--axi-accent-ink)' : 'var(--axi-text-faint)',
                            background: showSquad ? 'var(--axi-accent)' : 'transparent',
                        }}
                    >
                        <Users className="w-3.5 h-3.5" />
                        Squad
                    </button>
                    <button
                        onClick={() => setFollowPlayer(!followPlayer)}
                        className="flex items-center gap-1.5 px-2 py-0.5 text-xs"
                        style={{
                            color: followPlayer ? 'var(--axi-accent-ink)' : 'var(--axi-text-faint)',
                            background: followPlayer ? 'var(--axi-accent)' : 'transparent',
                        }}
                    >
                        <Crosshair className="w-3.5 h-3.5" />
                        Follow
                    </button>
                    <button onClick={() => zoomCenter(1)} className="ap-icon-btn p-1">
                        <ZoomIn className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => zoomCenter(-1)} className="ap-icon-btn p-1">
                        <ZoomOut className="w-3.5 h-3.5" />
                    </button>
                    {view.scale !== 1 && (
                        <button onClick={resetView} className="ap-icon-btn p-1">
                            <RotateCcw className="w-3.5 h-3.5" />
                        </button>
                    )}
                </div>
            </div>

            <div className="flex-1 relative overflow-hidden">
                {/* Party panel tab */}
                <button
                    onClick={() => setShowPanel(v => !v)}
                    className="ap-map-toggle absolute top-2 left-0 z-20 flex items-center px-1 py-2"
                    style={{
                        background: 'var(--axi-surface)',
                        border: `var(--axi-border-hairline) solid var(--axi-rule)`,
                        borderLeft: 'none',
                        color: showPanel ? 'var(--axi-text)' : 'var(--axi-text-faint)',
                        transform: showPanel ? 'translateX(260px)' : 'translateX(0)',
                    }}
                >
                    <ChevronRight className="ap-map-chevron w-3.5 h-3.5" style={{ transform: showPanel ? 'rotate(180deg)' : 'none' }} />
                </button>

                {/* Party info panel */}
                <div
                    className="ap-map-toggle absolute top-0 left-0 bottom-0 z-10 overflow-y-auto"
                    style={{
                        width: 260,
                        background: 'var(--axi-surface)',
                        borderRight: `var(--axi-border-hairline) solid var(--axi-rule)`,
                        transform: showPanel ? 'translateX(0)' : 'translateX(-100%)',
                        pointerEvents: showPanel ? 'auto' : 'none',
                    }}
                >
                    <div className="p-3 flex flex-col gap-2">
                        <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--axi-text-faint)' }}>Party</span>
                        {allies.filter(m => m.group === localGroup).map((member) => {
                            const status = getMemberStatus(member, timeMs);
                            const iconUrl = getProfessionIconPath(member.eliteSpec) ?? getProfessionIconPath(member.profession) ?? '';
                            const health = getHealthPercent(member, timeMs);
                            // The bar's length is the quantity (rule 9); its fill is the
                            // threshold, imported from the Timeline's healthBands so the two
                            // screens agree on what a given percentage means.
                            const healthFill = STATUS_COLORS[healthBand(health)];
                            // down and dead are discrete states, so they get a dot rather
                            // than a fourth/fifth ink (only three status inks exist). `down`
                            // loses its old distinct blue for the same reason.
                            const stateDot = status === 'dead' ? 'ap-status-dot--danger' : status === 'down' ? 'ap-status-dot--warn' : null;
                            const memberPos = memberPosAt(member, timeMs, pollingRate);
                            const panelDist = memberPos && commanderPos && !member.isCommander
                                ? Math.round(Math.hypot(memberPos[0] - commanderPos[0], memberPos[1] - commanderPos[1]) / inchToPixel)
                                : null;
                            return (
                                <div key={member.account} className="flex flex-col gap-1.5 px-2.5 py-2" style={{ background: 'var(--axi-ground)' }}>
                                    <div className="flex items-center gap-2">
                                        {iconUrl ? (
                                            <img src={iconUrl} alt="" className="w-5 h-5" />
                                        ) : (
                                            <div className="w-5 h-5" style={{ background: getProfessionColor(member.profession) }} />
                                        )}
                                        <span className="text-xs font-medium truncate flex-1" style={{ color: 'var(--axi-text)' }}>
                                            {member.name}
                                        </span>
                                        {panelDist != null && (
                                            <span
                                                className="text-[9px] tabular-nums px-1 font-semibold"
                                                style={{
                                                    background: panelDist > 600 ? 'var(--axi-danger)' : panelDist > 300 ? 'var(--axi-warn)' : 'var(--axi-ok)',
                                                    color: 'var(--axi-ink-line)',
                                                }}
                                            >
                                                {panelDist}
                                            </span>
                                        )}
                                        {/* CMD/YOU are an identity tag, not a status: solid accent fill
                                            matches the selected-state pattern used elsewhere (nav tabs,
                                            active capsule segment, active history entry). */}
                                        {member.isCommander && <span className="text-[9px] px-1" style={{ background: 'var(--axi-accent)', color: 'var(--axi-accent-ink)' }}>CMD</span>}
                                        {member.isLocal && <span className="text-[9px] px-1" style={{ background: 'var(--axi-accent)', color: 'var(--axi-accent-ink)' }}>YOU</span>}
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                        <div className="ap-meter flex-1">
                                            <div
                                                className="ap-meter-fill ap-map-bar"
                                                style={{
                                                    // dead additionally renders an empty bar - width 0 - so a
                                                    // corpse is not shown holding health.
                                                    width: `${status === 'dead' ? 0 : Math.max(0, Math.min(100, health))}%`,
                                                    background: healthFill,
                                                }}
                                            />
                                        </div>
                                        {stateDot && <span className={`ap-status-dot ${stateDot}`} />}
                                        <span className="text-[10px] tabular-nums w-8 text-right" style={{ color: 'var(--axi-text-dim)' }}>
                                            {status === 'dead' ? 'Dead' : status === 'down' ? 'Down' : `${Math.round(health)}%`}
                                        </span>
                                    </div>
                                    {member.boonStates && (
                                        <div className="flex flex-wrap gap-1">
                                            {PANEL_BOON_ORDER.map(boonId => {
                                                const stacks = getBoonStacks(member, boonId, timeMs);
                                                if (stacks === 0) return null;
                                                const boon = boonIcons?.[boonId];
                                                return (
                                                    <div key={boonId} className="relative flex items-center justify-center" style={{ width: 18, height: 18 }} title={boon?.name ?? String(boonId)}>
                                                        {boon?.icon ? (
                                                            <img src={boon.icon} alt="" className="w-full h-full" />
                                                        ) : (
                                                            <div className="w-full h-full" style={{ background: 'var(--axi-surface-raised)' }} />
                                                        )}
                                                        {stacks > 1 && (
                                                            // A chip raised off the (ground-toned) card, not the ground
                                                            // itself, or the count would sit at the same value as its
                                                            // own background and disappear.
                                                            <span className="absolute -bottom-0.5 -right-0.5 text-[8px] font-bold leading-none px-0.5" style={{ background: 'var(--axi-surface-raised)', color: 'var(--axi-text)' }}>
                                                                {stacks}
                                                            </span>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                    {(() => {
                                        const recent = getRecentSkills(member.skillCasts, timeMs, skillIcons);
                                        if (recent.length === 0) return null;
                                        return (
                                            <div className="flex gap-1">
                                                {recent.map((s, i) => {
                                                    const skill = skillIcons![s.id];
                                                    const isLatest = i === recent.length - 1;
                                                    return (
                                                        <div key={`${s.id}-${i}`} className="flex items-center gap-1 ap-map-fade" style={{ opacity: s.opacity }}>
                                                            <img
                                                                src={skill.icon}
                                                                alt=""
                                                                title={skill.name}
                                                                style={{ width: 20, height: 20 }}
                                                            />
                                                            {isLatest && (
                                                                <span className="text-[10px] font-medium truncate" style={{ color: 'var(--axi-text-dim)', maxWidth: 120 }}>
                                                                    {skill.name}
                                                                </span>
                                                            )}
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        );
                                    })()}
                                </div>
                            );
                        })}
                    </div>
                </div>

                <div
                    ref={containerRef}
                    className="absolute inset-0 flex items-center justify-center cursor-grab active:cursor-grabbing"
                    onMouseDown={handleMouseDown}
                    onMouseMove={handleMouseMove}
                    onMouseUp={handleMouseUp}
                    onMouseLeave={handleMouseUp}
                >
                <div
                    className="relative"
                    style={{
                        maxWidth: '100%',
                        maxHeight: '100%',
                        aspectRatio: `${width}/${height}`,
                        overflow: 'hidden',
                        transform: `translate(${view.tx}px, ${view.ty}px) scale(${view.scale})`,
                        transformOrigin: 'center center',
                    }}
                >
                    {mapImageUrl ? (
                        <img
                            src={mapImageUrl}
                            alt={mapName}
                            className="w-full h-full object-contain"
                            style={{ opacity: tiles.length > 0 ? 0 : 0.7 }}
                            draggable={false}
                        />
                    ) : (
                        <div
                            className="w-full h-full"
                            style={{ background: 'var(--axi-surface)', aspectRatio: `${width}/${height}`, minHeight: 400 }}
                        />
                    )}
                    {tiles.length > 0 && (
                        <div className="absolute inset-0" style={{ opacity: 0.8, overflow: 'hidden' }}>
                            {tiles.map((tile) => (
                                <img
                                    key={tile.url}
                                    src={tile.url}
                                    alt=""
                                    draggable={false}
                                    className="absolute"
                                    style={{
                                        left: `${(tile.x / width) * 100}%`,
                                        top: `${(tile.y / height) * 100}%`,
                                        width: `${(tile.width / width) * 100}%`,
                                        height: `${(tile.height / height) * 100}%`,
                                    }}
                                />
                            ))}
                        </div>
                    )}

                    <svg
                        className="absolute inset-0 w-full h-full"
                        viewBox={`0 0 ${width} ${height}`}
                        xmlns="http://www.w3.org/2000/svg"
                        preserveAspectRatio="xMidYMid meet"
                        overflow="visible"
                    >
                        <defs>
                            {/* feFlood/flood-color are stylable like fill/stroke (SVG2), so this
                                takes the same style={{}} route rather than a var()-fed attribute.
                                Two shades are needed for a legible silhouette: the outline takes
                                the universal outline ink (--axi-ink-line, rule 3's outline colour
                                everywhere else) and the tint takes the enemy status ink
                                (--axi-danger) rather than inventing a third red. */}
                            <filter id="enemy-red-tint" x="-15%" y="-15%" width="130%" height="130%">
                                <feMorphology in="SourceAlpha" operator="dilate" radius="0.6" result="expanded" />
                                <feFlood style={{ floodColor: 'var(--axi-ink-line)' }} result="darkColor" />
                                <feComposite in="darkColor" in2="expanded" operator="in" result="outline" />
                                <feFlood style={{ floodColor: 'var(--axi-danger)' }} result="redOverlay" />
                                <feComposite in="redOverlay" in2="SourceAlpha" operator="in" result="tint" />
                                <feBlend in="SourceGraphic" in2="tint" mode="overlay" result="tinted" />
                                <feComposite in="tinted" in2="SourceAlpha" operator="in" result="clipped" />
                                <feComposite in="clipped" in2="outline" operator="over" />
                            </filter>
                        </defs>
                        {/* Landmark pins. fill/stroke are SVG presentation attributes and do
                            not parse var(), so the token-bearing colour is set via style. */}
                        {landmarks.map((lm, i) => {
                            const s = TYPE_SCALES[lm.type];
                            const color = TYPE_COLORS[lm.type];
                            const dotOffsetY = 10 * s;
                            return (
                                <g key={i} transform={`translate(${lm.x}, ${lm.y})`} opacity={0.4}>
                                    <g transform={`translate(${-12 * s}, ${-dotOffsetY}) scale(${s})`}>
                                        <path d={PIN_PATH} style={{ fill: color, stroke: color }} fillOpacity={0.1} strokeWidth={1} />
                                        <circle cx={12} cy={10} r={2.5} style={{ fill: color }} />
                                    </g>
                                    <text x={0} y={-dotOffsetY - 2} textAnchor="middle" style={{ fill: 'var(--axi-text)' }} fontSize={7} opacity={0.6}>
                                        {lm.name}
                                    </text>
                                </g>
                            );
                        })}

                        {/* Enemy markers (rendered first, behind allies) */}
                        {enemies.map((member, i) => {
                            const pos = memberPosAt(member, timeMs, pollingRate);
                            if (!pos) return null;
                            const iconUrl = getProfessionIconPath(member.eliteSpec) ?? getProfessionIconPath(member.profession) ?? '';
                            const enemyId = `enemy-${member.name}-${i}`;
                            const sz = 14;
                            const status = getMemberStatus(member, timeMs);
                            return (
                                <g key={enemyId} opacity={0.3}>
                                    <g transform={`translate(${pos[0]}, ${pos[1]}) scale(${markerScale})`}>
                                        {/* down/dead are status, so they take the fixed warn/danger
                                            inks (outlined with the universal ink-line) rather than the
                                            old bespoke reds - matching the party panel's status dot. */}
                                        {status === 'down' && (
                                            <g transform="translate(-6, -18)">
                                                <svg width="12" height="14" viewBox="0 0 24 24">
                                                    <path d={PIN_PATH} style={{ fill: 'var(--axi-warn)', stroke: 'var(--axi-ink-line)' }} fillOpacity={0.8} strokeWidth={1.5} />
                                                </svg>
                                            </g>
                                        )}
                                        {status === 'dead' && (
                                            <g transform="translate(-6, -18)">
                                                <svg width="12" height="14" viewBox="0 0 24 24">
                                                    <path d={SKULL_PATH} style={{ fill: 'var(--axi-danger)', stroke: 'var(--axi-ink-line)' }} strokeWidth={0.5} />
                                                </svg>
                                            </g>
                                        )}
                                        {status === 'alive' && (iconUrl ? (
                                            <image href={iconUrl} x={-sz / 2} y={-sz / 2} width={sz} height={sz} filter="url(#enemy-red-tint)" />
                                        ) : (
                                            <circle r={4} style={{ fill: 'var(--axi-danger)' }} />
                                        ))}
                                        {/* A real DOM element (not raw SVG geometry) so Tooltip's
                                            getBoundingClientRect measures true screen position under the
                                            map's own pan/zoom transform - see Tooltip.tsx's portal note. */}
                                        <foreignObject x={-12} y={-12} width={24} height={24} style={{ overflow: 'visible' }}>
                                            <Tooltip text={`${member.name} · ${member.profession}`} position="top">
                                                <div style={{ width: 24, height: 24, cursor: 'pointer' }} />
                                            </Tooltip>
                                        </foreignObject>
                                    </g>
                                </g>
                            );
                        })}

                        {/* Allied trails and markers */}
                        {allies.map((member) => {
                            const isParty = member.isCommander || member.group === localGroup;
                            const visible = showSquad || isParty;
                            const frame = memberFrame(member, timeMs, pollingRate);
                            if (!frame) return null;
                            const currentIdx = frame.idx;
                            const pos = lerpPos(member.positions, currentIdx, frame.frac);

                            const color = getProfessionColor(member.profession);
                            const status = getMemberStatus(member, timeMs);

                            const recentStart = Math.max(0, currentIdx - TRAIL_LENGTH);
                            const historyPoints = member.positions.slice(0, recentStart + 1);
                            const recentPoints = member.positions.slice(recentStart, currentIdx + 1);

                            let distToTag: number | null = null;
                            if (commanderPos && !member.isCommander) {
                                distToTag = Math.round(Math.hypot(pos[0] - commanderPos[0], pos[1] - commanderPos[1]) / inchToPixel);
                            }

                            const tooltipText = `${member.name} · ${member.profession}`
                                + (member.isCommander ? ' · Commander' : distToTag != null ? ` · ${distToTag} to tag` : '');

                            return (
                                <g key={member.account} className="ap-map-fade" style={{ opacity: visible ? 1 : 0, pointerEvents: visible ? 'auto' : 'none' }}>
                                    {/* Historical path (dashed) */}
                                    {historyPoints.length > 1 && (
                                        <polyline
                                            points={historyPoints.map(p => `${p[0]},${p[1]}`).join(' ')}
                                            fill="none"
                                            style={{ stroke: color }}
                                            strokeWidth={1 * markerScale}
                                            strokeDasharray={`${3 * markerScale} ${3 * markerScale}`}
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                            opacity={0.3}
                                        />
                                    )}
                                    {/* Recent trail (solid) */}
                                    {recentPoints.length > 1 && (
                                        <polyline
                                            points={recentPoints.map(p => `${p[0]},${p[1]}`).join(' ')}
                                            fill="none"
                                            style={{ stroke: color }}
                                            strokeWidth={(member.isLocal ? 2.5 : 1.5) * markerScale}
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                            opacity={0.5}
                                        />
                                    )}

                                    <g transform={`translate(${pos[0]}, ${pos[1]}) scale(${markerScale})`}>
                                        {/* Status marker: down or dead - warn/danger, outlined in
                                            ink-line, same convention as the enemy markers above. `down`
                                            loses its old distinct blue: only three status inks exist. */}
                                        {status === 'down' && (
                                            <g transform="translate(-8, -22)">
                                                <svg width="16" height="20" viewBox="0 0 24 24">
                                                    <path d={PIN_PATH} style={{ fill: 'var(--axi-warn)', stroke: 'var(--axi-ink-line)' }} fillOpacity={0.8} strokeWidth={1.5} />
                                                </svg>
                                            </g>
                                        )}
                                        {status === 'dead' && (
                                            <g transform="translate(-8, -22)">
                                                <svg width="16" height="20" viewBox="0 0 24 24">
                                                    <path d={SKULL_PATH} style={{ fill: 'var(--axi-danger)' }} />
                                                </svg>
                                            </g>
                                        )}

                                        {/* Player marker */}
                                        {status === 'alive' && (() => {
                                            if (member.isCommander) {
                                                const tagSz = 20;
                                                return <image href="./img/commander_tag.svg" x={-tagSz / 2} y={-tagSz / 2} width={tagSz} height={tagSz} />;
                                            }
                                            const iconUrl = getProfessionIconPath(member.eliteSpec) ?? getProfessionIconPath(member.profession) ?? '';
                                            const sz = member.isLocal ? 24 : 20;
                                            if (iconUrl) {
                                                return (
                                                    <>
                                                        {member.isLocal && (
                                                            <circle r={sz / 2 + 4} fill="none" style={{ stroke: 'var(--axi-accent)' }} strokeWidth={2.5} opacity={0.85} />
                                                        )}
                                                        <image href={iconUrl} x={-sz / 2} y={-sz / 2} width={sz} height={sz} />
                                                    </>
                                                );
                                            }
                                            return (
                                                <>
                                                    {member.isLocal && (
                                                        <>
                                                            {/* Ground-coloured separator between the accent ring and
                                                                the profession-coloured dot: the accent and a domain
                                                                colour can resolve byte-identical for some accent/
                                                                profession pairing, and this guards the ring against
                                                                collapsing into the dot generally rather than for one
                                                                case (see BoonPerformanceChart's selfColor guard and
                                                                the Timeline's contrast guard for the same problem). */}
                                                            <circle r={10} fill="none" style={{ stroke: 'var(--axi-ground)' }} strokeWidth={1.5} />
                                                            <circle r={12} fill="none" style={{ stroke: 'var(--axi-accent)' }} strokeWidth={2.5} opacity={0.85} />
                                                        </>
                                                    )}
                                                    <circle r={member.isLocal ? 8 : 6} style={{ fill: color, stroke: color }} fillOpacity={0.9} strokeWidth={1} />
                                                </>
                                            );
                                        })()}

                                        {/* A real DOM element (not raw SVG geometry) so Tooltip's
                                            getBoundingClientRect measures true screen position under the
                                            map's own pan/zoom transform - see Tooltip.tsx's portal note. */}
                                        <foreignObject x={-16} y={-16} width={32} height={32} style={{ overflow: 'visible' }}>
                                            <Tooltip text={tooltipText} position="top">
                                                <div style={{ width: 32, height: 32, cursor: 'pointer' }} />
                                            </Tooltip>
                                        </foreignObject>
                                    </g>
                                </g>
                            );
                        })}
                    </svg>
                </div>
            </div>
            </div>

            {/* Timeline slider */}
            <div className="shrink-0 px-2 pb-1">
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => {
                            if (timeMs >= durationMs) setTimeMs(0);
                            setPlaying(v => !v);
                        }}
                        className={`ap-icon-btn p-1 shrink-0${playing ? ' ap-icon-btn--active' : ''}`}
                    >
                        {playing ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                    </button>
                    <button
                        onClick={() => setPlaySpeed(s => s === 1 ? 1.5 : s === 1.5 ? 2 : s === 2 ? 0.5 : 1)}
                        className={`ap-icon-btn p-1.5 shrink-0 text-[10px] tabular-nums font-semibold${playSpeed !== 1 ? ' ap-icon-btn--active' : ''}`}
                        style={{ minWidth: 28 }}
                        title="Playback speed"
                    >
                        {playSpeed}x
                    </button>
                    <span className="text-[10px] tabular-nums w-8 text-right" style={{ color: 'var(--axi-text-faint)' }}>
                        {formatTime(timeMs)}
                    </span>
                    <input
                        type="range"
                        min={0}
                        max={durationMs}
                        step={pollingRate}
                        value={timeMs}
                        onChange={(e) => {
                            setTimeMs(Number(e.target.value));
                            setPlaying(false);
                        }}
                        className="flex-1 h-1 cursor-pointer"
                        style={{ accentColor: 'var(--axi-accent)' }}
                    />
                    <span className="text-[10px] tabular-nums w-8" style={{ color: 'var(--axi-text-faint)' }}>
                        {formatTime(durationMs)}
                    </span>
                </div>
            </div>
        </div>
    );
}
