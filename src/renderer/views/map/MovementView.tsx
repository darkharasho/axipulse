import { useRef, useState, useCallback, useEffect, useMemo, type MouseEvent } from 'react';
import { ChevronRight, Crosshair, MapPin, Pause, Play, RotateCcw, Users, ZoomIn, ZoomOut } from 'lucide-react';
import { useAppStore } from '../../store';
import { WVW_LANDMARKS, WvwMap, type WvwLandmark } from '../../../shared/wvwLandmarks';
import { resolveMapFromZone } from '../../../shared/mapUtils';
import { getMapTiles, hasTileData } from '../../../shared/wvwTiles';
import type { SkillCast, SquadMemberMovement } from '../../../shared/types';

const TYPE_COLORS: Record<WvwLandmark['type'], string> = {
    keep: '#ef4444',
    tower: '#f59e0b',
    camp: '#22c55e',
    ruins: '#8b5cf6',
    named: '#6b7280',
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

const PROFESSION_COLORS: Record<string, string> = {
    Guardian: '#72c1d9',
    Warrior: '#ffd166',
    Engineer: '#d09c59',
    Ranger: '#8cdc82',
    Thief: '#c08f95',
    Elementalist: '#f68a87',
    Mesmer: '#b679d0',
    Necromancer: '#52a76f',
    Revenant: '#d16e5a',
};

const TRAIL_LENGTH = 15;

const MIN_ZOOM = 1;
const MAX_ZOOM = 50;
const ZOOM_STEP = 0.15;

const ICON_NAMES = new Set([
    'Amalgam', 'Antiquary', 'Berserker', 'Bladesworn', 'Catalyst', 'Chronomancer',
    'Conduit', 'Daredevil', 'Deadeye', 'Dragonhunter', 'Druid', 'Elementalist',
    'Engineer', 'Evoker', 'Firebrand', 'Galeshot', 'Guardian', 'Harbinger', 'Herald',
    'Holosmith', 'Luminary', 'Mechanist', 'Mesmer', 'Mirage', 'Necromancer', 'Paragon',
    'Ranger', 'Reaper', 'Renegade', 'Revenant', 'Ritualist', 'Scourge', 'Scrapper',
    'Soulbeast', 'Specter', 'Spellbreaker', 'Tempest', 'Thief', 'Troubadour',
    'Untamed', 'Vindicator', 'Virtuoso', 'Warrior', 'Weaver', 'Willbender',
]);

function getClassIconUrl(eliteSpec: string, profession: string): string {
    if (eliteSpec && ICON_NAMES.has(eliteSpec)) return `./img/professions/${eliteSpec}.svg`;
    if (ICON_NAMES.has(profession)) return `./img/professions/${profession}.svg`;
    return '';
}

function getProfessionColor(profession: string): string {
    return PROFESSION_COLORS[profession] ?? '#9ca3af';
}

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

function lerpPos(positions: [number, number][], index: number, frac: number): [number, number] {
    const a = positions[index];
    if (frac === 0 || index >= positions.length - 1) return a;
    const b = positions[index + 1];
    return [a[0] + (b[0] - a[0]) * frac, a[1] + (b[1] - a[1]) * frac];
}

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
    const [hoveredMember, setHoveredMember] = useState<string | null>(null);
    const [showSquad, setShowSquad] = useState(false);
    const [followPlayer, setFollowPlayer] = useState(false);
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
        const { movementData, mapSize } = currentFight;
        const local = movementData.members.find(m => m.isLocal);
        if (!local) return;
        const mw = mapSize?.[0] ?? 523;
        const mh = mapSize?.[1] ?? 750;
        const rect = containerRef.current.getBoundingClientRect();
        const renderScale = Math.min(rect.width / mw, rect.height / mh);
        const renderW = mw * renderScale;
        const renderH = mh * renderScale;
        const maxIdx = Math.max(0, local.positions.length - 1);
        const fIdx = Math.min(timeMs / movementData.pollingRate, maxIdx);
        const idx = Math.min(Math.floor(fIdx), maxIdx);
        const frac = idx < maxIdx ? fIdx - idx : 0;
        const pos = lerpPos(local.positions, idx, frac);
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
                <MapPin className="w-8 h-8" style={{ color: 'var(--text-muted)' }} />
                <span className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>Movement Replay</span>
                <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Movement data will appear here after a fight is parsed</span>
            </div>
        );
    }

    const { mapImageUrl, mapSize, mapName, movementData } = currentFight;
    const map = resolveMapFromZone(mapName);
    const landmarks = map ? WVW_LANDMARKS[map] : [];
    const width = mapSize?.[0] ?? 523;
    const height = mapSize?.[1] ?? 750;
    const useTiles = map && hasTileData(map);
    const tileZoom = tileZoomForScale(view.scale);
    const tiles = useMemo(
        () => (useTiles ? getMapTiles(map as WvwMap, tileZoom) : []),
        [useTiles, map, tileZoom],
    );

    if (!movementData || movementData.members.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center h-full gap-2">
                <MapPin className="w-8 h-8" style={{ color: 'var(--text-muted)' }} />
                <span className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>No Movement Data</span>
                <span className="text-xs" style={{ color: 'var(--text-muted)' }}>This fight has no combat replay position data</span>
            </div>
        );
    }

    const { pollingRate, durationMs, inchToPixel, members, boonIcons, skillIcons } = movementData;
    const maxPosIndex = Math.max(0, members[0].positions.length - 1);
    const fractionalIndex = Math.min(timeMs / pollingRate, maxPosIndex);
    const posIndex = Math.min(Math.floor(fractionalIndex), maxPosIndex);
    const posFrac = fractionalIndex - posIndex;
    const markerScale = 1 / Math.pow(view.scale, 0.7);

    const allies = members.filter(m => !m.isEnemy && m.inSquad);
    const enemies = members.filter(m => m.isEnemy);
    const localPlayer = allies.find(m => m.isLocal);
    const localGroup = localPlayer?.group ?? -1;
    const commander = allies.find(m => m.isCommander);
    const commanderPos = commander ? lerpPos(commander.positions, Math.min(posIndex, commander.positions.length - 1), posIndex < commander.positions.length - 1 ? posFrac : 0) : null;

    return (
        <div className="flex flex-col h-full gap-2">
            <div className="flex items-center gap-4">
                <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{mapName}</span>
                <span className="text-xs tabular-nums" style={{ color: 'var(--text-secondary)' }}>{formatTime(timeMs)}</span>
                <div className="flex items-center gap-2 ml-auto">
                    <button
                        onClick={() => setShowSquad(v => !v)}
                        className="flex items-center gap-1.5 px-2 py-0.5 rounded text-xs transition-colors"
                        style={{
                            color: showSquad ? 'var(--text-primary)' : 'var(--text-muted)',
                            background: showSquad ? 'rgba(255,255,255,0.1)' : 'transparent',
                        }}
                    >
                        <Users className="w-3.5 h-3.5" />
                        Squad
                    </button>
                    <button
                        onClick={() => setFollowPlayer(v => !v)}
                        className="flex items-center gap-1.5 px-2 py-0.5 rounded text-xs transition-colors"
                        style={{
                            color: followPlayer ? 'var(--text-primary)' : 'var(--text-muted)',
                            background: followPlayer ? 'rgba(255,255,255,0.1)' : 'transparent',
                        }}
                    >
                        <Crosshair className="w-3.5 h-3.5" />
                        Follow
                    </button>
                    <button onClick={() => zoomCenter(1)} className="p-1 rounded hover:bg-white/10 transition-colors" style={{ color: 'var(--text-muted)' }}>
                        <ZoomIn className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => zoomCenter(-1)} className="p-1 rounded hover:bg-white/10 transition-colors" style={{ color: 'var(--text-muted)' }}>
                        <ZoomOut className="w-3.5 h-3.5" />
                    </button>
                    {view.scale !== 1 && (
                        <button onClick={resetView} className="p-1 rounded hover:bg-white/10 transition-colors" style={{ color: 'var(--text-muted)' }}>
                            <RotateCcw className="w-3.5 h-3.5" />
                        </button>
                    )}
                </div>
            </div>

            <div className="flex-1 relative overflow-hidden">
                {/* Party panel tab */}
                <button
                    onClick={() => setShowPanel(v => !v)}
                    className="absolute top-2 left-0 z-20 flex items-center px-1 py-2 rounded-r transition-all"
                    style={{
                        background: 'rgba(26,31,46,0.9)',
                        border: '1px solid rgba(255,255,255,0.1)',
                        borderLeft: 'none',
                        color: showPanel ? 'var(--text-primary)' : 'var(--text-muted)',
                        transform: showPanel ? 'translateX(260px)' : 'translateX(0)',
                        transition: 'transform 0.25s ease, color 0.15s',
                    }}
                >
                    <ChevronRight className="w-3.5 h-3.5" style={{ transform: showPanel ? 'rotate(180deg)' : 'none', transition: 'transform 0.25s ease' }} />
                </button>

                {/* Party info panel */}
                <div
                    className="absolute top-0 left-0 bottom-0 z-10 overflow-y-auto"
                    style={{
                        width: 260,
                        background: 'rgba(26,31,46,0.95)',
                        borderRight: '1px solid rgba(255,255,255,0.1)',
                        transform: showPanel ? 'translateX(0)' : 'translateX(-100%)',
                        transition: 'transform 0.25s ease',
                        pointerEvents: showPanel ? 'auto' : 'none',
                    }}
                >
                    <div className="p-3 flex flex-col gap-2">
                        <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Party</span>
                        {allies.filter(m => m.group === localGroup).map((member) => {
                            const status = getMemberStatus(member, timeMs);
                            const iconUrl = getClassIconUrl(member.eliteSpec, member.profession);
                            const health = getHealthPercent(member, timeMs);
                            const healthColor = status === 'dead' ? '#ef4444' : status === 'down' ? '#3b82f6' : health > 50 ? '#22c55e' : health > 25 ? '#f59e0b' : '#ef4444';
                            const memberMaxIdx = member.positions.length - 1;
                            const memberIdx = Math.min(posIndex, memberMaxIdx);
                            const memberFrac = posIndex < memberMaxIdx ? posFrac : 0;
                            const memberPos = lerpPos(member.positions, memberIdx, memberFrac);
                            const panelDist = commanderPos && !member.isCommander
                                ? Math.round(Math.hypot(memberPos[0] - commanderPos[0], memberPos[1] - commanderPos[1]) / inchToPixel)
                                : null;
                            return (
                                <div key={member.account} className="flex flex-col gap-1.5 rounded-lg px-2.5 py-2" style={{ background: 'rgba(255,255,255,0.04)' }}>
                                    <div className="flex items-center gap-2">
                                        {iconUrl ? (
                                            <img src={iconUrl} alt="" className="w-5 h-5" />
                                        ) : (
                                            <div className="w-5 h-5 rounded-full" style={{ background: getProfessionColor(member.profession) }} />
                                        )}
                                        <span className="text-xs font-medium truncate flex-1" style={{ color: 'var(--text-primary)' }}>
                                            {member.name}
                                        </span>
                                        {panelDist != null && <span className="text-[9px] tabular-nums px-1 rounded font-semibold" style={{ background: panelDist > 600 ? 'rgba(239,68,68,0.25)' : panelDist > 300 ? 'rgba(245,158,11,0.25)' : 'rgba(34,197,94,0.2)', color: panelDist > 600 ? '#fca5a5' : panelDist > 300 ? '#fcd34d' : '#86efac' }}>{panelDist}</span>}
                                        {member.isCommander && <span className="text-[9px] px-1 rounded" style={{ background: 'rgba(16,185,129,0.2)', color: '#6ee7b7' }}>CMD</span>}
                                        {member.isLocal && <span className="text-[9px] px-1 rounded" style={{ background: 'rgba(16,185,129,0.2)', color: '#6ee7b7' }}>YOU</span>}
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                        <div className="flex-1 h-3 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
                                            <div
                                                className="h-full rounded-full"
                                                style={{
                                                    width: `${Math.max(0, Math.min(100, health))}%`,
                                                    background: healthColor,
                                                    transition: 'width 0.2s ease, background-color 0.2s ease',
                                                }}
                                            />
                                        </div>
                                        <span className="text-[10px] tabular-nums w-8 text-right" style={{ color: healthColor }}>
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
                                                            <img src={boon.icon} alt="" className="w-full h-full rounded-sm" />
                                                        ) : (
                                                            <div className="w-full h-full rounded-sm" style={{ background: 'rgba(255,255,255,0.15)' }} />
                                                        )}
                                                        {stacks > 1 && (
                                                            <span className="absolute -bottom-0.5 -right-0.5 text-[8px] font-bold leading-none px-0.5 rounded" style={{ background: '#1a1f2e', color: '#e8eaed' }}>
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
                                                        <div key={`${s.id}-${i}`} className="flex items-center gap-1" style={{ opacity: s.opacity, transition: 'opacity 0.15s ease' }}>
                                                            <img
                                                                src={skill.icon}
                                                                alt=""
                                                                title={skill.name}
                                                                className="rounded-sm"
                                                                style={{ width: 20, height: 20 }}
                                                            />
                                                            {isLatest && (
                                                                <span className="text-[10px] font-medium truncate" style={{ color: 'var(--text-secondary)', maxWidth: 120 }}>
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
                            className="w-full h-full object-contain rounded"
                            style={{ opacity: tiles.length > 0 ? 0 : 0.7 }}
                            draggable={false}
                        />
                    ) : (
                        <div
                            className="w-full h-full rounded"
                            style={{ background: 'var(--bg-card)', aspectRatio: `${width}/${height}`, minHeight: 400 }}
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
                            <filter id="enemy-red-tint" x="-15%" y="-15%" width="130%" height="130%">
                                <feMorphology in="SourceAlpha" operator="dilate" radius="0.6" result="expanded" />
                                <feFlood floodColor="#7f1d1d" result="darkColor" />
                                <feComposite in="darkColor" in2="expanded" operator="in" result="outline" />
                                <feFlood floodColor="#ef4444" result="redOverlay" />
                                <feComposite in="redOverlay" in2="SourceAlpha" operator="in" result="tint" />
                                <feBlend in="SourceGraphic" in2="tint" mode="overlay" result="tinted" />
                                <feComposite in="tinted" in2="SourceAlpha" operator="in" result="clipped" />
                                <feComposite in="clipped" in2="outline" operator="over" />
                            </filter>
                        </defs>
                        {/* Landmark pins */}
                        {landmarks.map((lm, i) => {
                            const s = TYPE_SCALES[lm.type];
                            const color = TYPE_COLORS[lm.type];
                            const dotOffsetY = 10 * s;
                            return (
                                <g key={i} transform={`translate(${lm.x}, ${lm.y})`} opacity={0.4}>
                                    <g transform={`translate(${-12 * s}, ${-dotOffsetY}) scale(${s})`}>
                                        <path d={PIN_PATH} fill={color} fillOpacity={0.1} stroke={color} strokeWidth={1} />
                                        <circle cx={12} cy={10} r={2.5} fill={color} />
                                    </g>
                                    <text x={0} y={-dotOffsetY - 2} textAnchor="middle" fill="#e8eaed" fontSize={7} fontFamily="Inter, sans-serif" opacity={0.6}>
                                        {lm.name}
                                    </text>
                                </g>
                            );
                        })}

                        {/* Enemy markers (rendered first, behind allies) */}
                        {enemies.map((member, i) => {
                            const maxIdx = member.positions.length - 1;
                            const currentIdx = Math.min(posIndex, maxIdx);
                            const currentFrac = posIndex < maxIdx ? posFrac : 0;
                            const pos = lerpPos(member.positions, currentIdx, currentFrac);
                            if (!pos) return null;
                            const iconUrl = getClassIconUrl(member.eliteSpec, member.profession);
                            const enemyId = `enemy-${member.name}-${i}`;
                            const sz = 14;
                            const status = getMemberStatus(member, timeMs);
                            return (
                                <g key={enemyId} opacity={0.3}>
                                    <g transform={`translate(${pos[0]}, ${pos[1]}) scale(${markerScale})`}>
                                        {status === 'down' && (
                                            <g transform="translate(-6, -18)">
                                                <svg width="12" height="14" viewBox="0 0 24 24">
                                                    <path d={PIN_PATH} fill="#ef4444" fillOpacity={0.8} stroke="#991b1b" strokeWidth={1.5} />
                                                </svg>
                                            </g>
                                        )}
                                        {status === 'dead' && (
                                            <g transform="translate(-6, -18)">
                                                <svg width="12" height="14" viewBox="0 0 24 24">
                                                    <path d={SKULL_PATH} fill="#ef4444" stroke="#991b1b" strokeWidth={0.5} />
                                                </svg>
                                            </g>
                                        )}
                                        {status === 'alive' && (iconUrl ? (
                                            <image href={iconUrl} x={-sz / 2} y={-sz / 2} width={sz} height={sz} filter="url(#enemy-red-tint)" />
                                        ) : (
                                            <circle r={4} fill="#ef4444" />
                                        ))}
                                        <rect
                                            x={-12} y={-12} width={24} height={24}
                                            fill="transparent"
                                            onMouseEnter={() => setHoveredMember(enemyId)}
                                            onMouseLeave={() => setHoveredMember(null)}
                                            style={{ cursor: 'pointer' }}
                                        />
                                        {hoveredMember === enemyId && (
                                            <g transform="translate(0, -20)" opacity={5}>
                                                <rect x={-100} y={-50} width={200} height={50} rx={8} fill="#1a1f2e" fillOpacity={0.95} stroke="rgba(255,255,255,0.15)" strokeWidth={1.5} />
                                                <text x={0} y={-28} textAnchor="middle" fill="#ef4444" fontSize={18} fontWeight={600} fontFamily="Inter, sans-serif">{member.name}</text>
                                                <text x={0} y={-10} textAnchor="middle" fill="#8b929e" fontSize={14} fontFamily="Inter, sans-serif">{member.profession}</text>
                                            </g>
                                        )}
                                    </g>
                                </g>
                            );
                        })}

                        {/* Allied trails and markers */}
                        {allies.map((member) => {
                            const isParty = member.isCommander || member.group === localGroup;
                            const visible = showSquad || isParty;
                            const maxIdx = member.positions.length - 1;
                            const currentIdx = Math.min(posIndex, maxIdx);
                            const currentFrac = posIndex < maxIdx ? posFrac : 0;
                            const pos = lerpPos(member.positions, currentIdx, currentFrac);
                            if (!pos) return null;

                            const color = getProfessionColor(member.profession);
                            const status = getMemberStatus(member, timeMs);
                            const isHovered = hoveredMember === member.account;

                            const recentStart = Math.max(0, currentIdx - TRAIL_LENGTH);
                            const historyPoints = member.positions.slice(0, recentStart + 1);
                            const recentPoints = member.positions.slice(recentStart, currentIdx + 1);

                            let distToTag: number | null = null;
                            if (commanderPos && !member.isCommander) {
                                distToTag = Math.round(Math.hypot(pos[0] - commanderPos[0], pos[1] - commanderPos[1]) / inchToPixel);
                            }

                            return (
                                <g key={member.account} style={{ opacity: visible ? 1 : 0, transition: 'opacity 0.3s ease', pointerEvents: visible ? 'auto' : 'none' }}>
                                    {/* Historical path (dashed) */}
                                    {historyPoints.length > 1 && (
                                        <polyline
                                            points={historyPoints.map(p => `${p[0]},${p[1]}`).join(' ')}
                                            fill="none"
                                            stroke={color}
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
                                            stroke={color}
                                            strokeWidth={(member.isLocal ? 2.5 : 1.5) * markerScale}
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                            opacity={0.5}
                                        />
                                    )}

                                    <g transform={`translate(${pos[0]}, ${pos[1]}) scale(${markerScale})`}>
                                        {/* Status marker: down or dead */}
                                        {status === 'down' && (
                                            <g transform="translate(-8, -22)">
                                                <svg width="16" height="20" viewBox="0 0 24 24">
                                                    <path d={PIN_PATH} fill="#3b82f6" fillOpacity={0.8} stroke="#3b82f6" strokeWidth={1.5} />
                                                </svg>
                                            </g>
                                        )}
                                        {status === 'dead' && (
                                            <g transform="translate(-8, -22)">
                                                <svg width="16" height="20" viewBox="0 0 24 24">
                                                    <path d={SKULL_PATH} fill="#ef4444" />
                                                </svg>
                                            </g>
                                        )}

                                        {/* Player marker */}
                                        {status === 'alive' && (() => {
                                            if (member.isCommander) {
                                                const tagSz = 20;
                                                return <image href="./img/commander_tag.svg" x={-tagSz / 2} y={-tagSz / 2} width={tagSz} height={tagSz} />;
                                            }
                                            const iconUrl = getClassIconUrl(member.eliteSpec, member.profession);
                                            const sz = member.isLocal ? 24 : 20;
                                            if (iconUrl) {
                                                return (
                                                    <>
                                                        {member.isLocal && (
                                                            <circle r={sz / 2 + 4} fill="none" stroke="#10b981" strokeWidth={2.5} opacity={0.85} />
                                                        )}
                                                        <image href={iconUrl} x={-sz / 2} y={-sz / 2} width={sz} height={sz} />
                                                    </>
                                                );
                                            }
                                            return (
                                                <>
                                                    {member.isLocal && (
                                                        <circle r={12} fill="none" stroke="#10b981" strokeWidth={2.5} opacity={0.85} />
                                                    )}
                                                    <circle r={member.isLocal ? 8 : 6} fill={color} fillOpacity={0.9} stroke={color} strokeWidth={1} />
                                                </>
                                            );
                                        })()}

                                        {/* Hover hit area */}
                                        <rect
                                            x={-16}
                                            y={-16}
                                            width={32}
                                            height={32}
                                            fill="transparent"
                                            onMouseEnter={() => setHoveredMember(member.account)}
                                            onMouseLeave={() => setHoveredMember(null)}
                                            style={{ cursor: 'pointer' }}
                                        />

                                        {/* Hover tooltip */}
                                        {isHovered && (
                                            <g transform="translate(0, -28)">
                                                <rect x={-120} y={-78} width={240} height={78} rx={8} fill="#1a1f2e" fillOpacity={0.95} stroke="rgba(255,255,255,0.15)" strokeWidth={1.5} />
                                                <text x={0} y={-54} textAnchor="middle" fill="#e8eaed" fontSize={22} fontWeight={600} fontFamily="Inter, sans-serif">{member.name}</text>
                                                <text x={0} y={-32} textAnchor="middle" fill="#8b929e" fontSize={17} fontFamily="Inter, sans-serif">{member.account}</text>
                                                <text x={0} y={-12} textAnchor="middle" fill="#6ee7b7" fontSize={14} fontFamily="Inter, sans-serif">
                                                    {member.isCommander ? 'Commander' : distToTag != null ? `${distToTag} to tag` : ''}
                                                </text>
                                            </g>
                                        )}
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
                        className="p-1 rounded hover:bg-white/10 transition-colors shrink-0"
                        style={{ color: playing ? 'var(--brand-primary)' : 'var(--text-muted)' }}
                    >
                        {playing ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                    </button>
                    <button
                        onClick={() => setPlaySpeed(s => s === 1 ? 1.5 : s === 1.5 ? 2 : s === 2 ? 0.5 : 1)}
                        className="px-1.5 py-0.5 rounded hover:bg-white/10 transition-colors shrink-0 text-[10px] tabular-nums font-semibold"
                        style={{ color: playSpeed !== 1 ? 'var(--brand-primary)' : 'var(--text-muted)', minWidth: 28 }}
                        title="Playback speed"
                    >
                        {playSpeed}x
                    </button>
                    <span className="text-[10px] tabular-nums w-8 text-right" style={{ color: 'var(--text-muted)' }}>
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
                        className="flex-1 h-1 accent-[var(--brand-primary)] cursor-pointer"
                        style={{ accentColor: 'var(--brand-primary)' }}
                    />
                    <span className="text-[10px] tabular-nums w-8" style={{ color: 'var(--text-muted)' }}>
                        {formatTime(durationMs)}
                    </span>
                </div>
            </div>
        </div>
    );
}
