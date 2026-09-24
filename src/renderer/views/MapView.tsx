import { useRef, useState, useCallback, useEffect, type MouseEvent } from 'react';
import { MapPin, RotateCcw, ZoomIn, ZoomOut } from 'lucide-react';
import { useAppStore } from '../store';
import { SubviewCapsule } from '../app/SubviewCapsule';
import type { MapSubview } from '../store';
import { WVW_LANDMARKS, type WvwLandmark } from '../../shared/wvwLandmarks';
import { resolveMapFromMapId } from '../../shared/mapUtils';
import { resolveMapPixelSize } from '../../shared/wvwTiles';
import { MovementView } from './map/MovementView';

const MAP_PILLS = [
    { id: 'overview', label: 'Overview' },
    { id: 'movement', label: 'Movement' },
];

export function MapView() {
    const mapSubview = useAppStore(s => s.mapSubview);
    const setMapSubview = useAppStore(s => s.setMapSubview);

    return (
        <div className="flex flex-col h-full">
            <div className="mb-3 shrink-0">
                <SubviewCapsule
                    pills={MAP_PILLS}
                    activeId={mapSubview}
                    onSelect={(id) => setMapSubview(id as MapSubview)}
                    layoutGroup="map"
                />
            </div>
            <div className="flex-1 min-h-0">
                {mapSubview === 'movement' ? <MovementView /> : <MapOverview />}
            </div>
        </div>
    );
}

// Landmarks are chrome, not domain data - see MovementView.tsx for the full
// rationale. This file already imports MovementView's component below but
// not its TYPE_COLORS/TYPE_SCALES consts, which predate this task and stay
// duplicated here rather than being refactored into a shared export.
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

// Lucide paths (viewBox 0 0 24 24)
const PIN_PATH = 'M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0';

const MIN_ZOOM = 1;
const MAX_ZOOM = 6;
const ZOOM_STEP = 0.15;
const DEFAULT_ZOOM_PADDING = 1.15;

function MapOverview() {
    const currentFight = useAppStore(s => s.currentFight);
    const containerRef = useRef<HTMLDivElement>(null);
    const [view, setView] = useState({ scale: 1, tx: 0, ty: 0 });
    const dragRef = useRef<{ startX: number; startY: number; startTx: number; startTy: number } | null>(null);
    const lastFightRef = useRef<number | null>(null);

    useEffect(() => {
        if (!currentFight || currentFight.fightNumber === lastFightRef.current) return;
        lastFightRef.current = currentFight.fightNumber;
        const container = containerRef.current;
        if (!container || !currentFight.avgPosition || !currentFight.mapSize) return;
        requestAnimationFrame(() => {
            const rect = container.getBoundingClientRect();
            const [mw, mh] = currentFight.mapSize!;
            const renderScale = Math.min(rect.width / mw, rect.height / mh);
            const renderH = mh * renderScale;
            const zoom = (rect.width / (mw * renderScale)) * DEFAULT_ZOOM_PADDING;
            const ny = currentFight.avgPosition![1] / mh;
            setView({
                scale: zoom,
                tx: 0,
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

    const handleMouseDown = useCallback((e: MouseEvent) => {
        if (e.button !== 0) return;
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
                <span className="text-sm font-medium" style={{ color: 'var(--axi-text-dim)' }}>Fight Map</span>
                <span className="text-xs" style={{ color: 'var(--axi-text-faint)' }}>Map data will appear here after a fight is parsed</span>
            </div>
        );
    }

    const { mapImageUrl, mapSize, mapId, avgPosition, mapName } = currentFight;
    // By map ID, not by display name -- see MovementView.
    const map = mapId === null ? null : resolveMapFromMapId(mapId);
    const landmarks = map ? WVW_LANDMARKS[map] : [];
    // `null` means this app has no coordinate space for the log's map at all.
    // Explicit branch, not a `[0, 0]` viewBox -- a degenerate space collapses
    // every landmark onto the origin and reads as a map that failed to load.
    const pixelSize = resolveMapPixelSize(mapSize, map);
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
    const [width, height] = pixelSize;

    return (
        <div className="flex flex-col h-full gap-3">
            <div className="flex items-center gap-4">
                <span className="text-sm font-medium" style={{ color: 'var(--axi-text)' }}>{mapName}</span>
                {currentFight.nearestLandmark && (
                    <span className="text-xs" style={{ color: 'var(--axi-text-dim)' }}>Near {currentFight.nearestLandmark}</span>
                )}
                <div className="flex items-center gap-2 ml-auto">
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
                    <div className="flex items-center gap-3 ml-2 text-[10px]" style={{ color: 'var(--axi-text-faint)' }}>
                        {/* Every landmark type is var(--axi-accent) now (chrome, not domain
                            data - rule 9), so hue no longer distinguishes them: size is the
                            only remaining cue (TYPE_SCALES, also applied to the on-map pins
                            below). The legend has to carry the same cue or it stops teaching
                            the mapping it exists to teach. Scaled relative to `keep`, the
                            largest type, so it keeps its previous 10x12 size exactly. */}
                        {(['keep', 'tower', 'camp', 'ruins'] as const).map(type => {
                            const legendScale = TYPE_SCALES[type] / TYPE_SCALES.keep;
                            return (
                                <span key={type} className="flex items-center gap-1">
                                    <svg width={10 * legendScale} height={12 * legendScale} viewBox="0 0 24 24" style={{ fill: TYPE_COLORS[type] }}>
                                        <path d={PIN_PATH} />
                                    </svg>
                                    {type}
                                </span>
                            );
                        })}
                        {/* No border-radius (rule 2), so the "fight" legend swatch is a
                            small bordered square, the same shape .ap-status-dot uses. */}
                        <span className="flex items-center gap-1">
                            <span className="inline-block w-2.5 h-2.5" style={{ border: 'var(--axi-border-hairline) solid var(--axi-accent)', background: 'transparent' }} />
                            fight
                        </span>
                    </div>
                </div>
            </div>

            <div
                ref={containerRef}
                className="flex-1 flex items-center justify-center overflow-hidden cursor-grab active:cursor-grabbing"
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
                        transform: `translate(${view.tx}px, ${view.ty}px) scale(${view.scale})`,
                        transformOrigin: 'center center',
                    }}
                >
                    {mapImageUrl ? (
                        <img
                            src={mapImageUrl}
                            alt={mapName}
                            className="w-full h-full object-contain"
                            // A photographic basemap, not a token colour: fading the
                            // raster is what keeps the overlay readable over it, and
                            // there is no token that can express "this bitmap, quieter".
                            // Rule 2 bans mixing a COLOUR with the ground; this mixes an
                            // image, so it stays.
                            style={{ opacity: 0.7 }}
                            draggable={false}
                        />
                    ) : (
                        <div
                            className="w-full h-full"
                            style={{ background: 'var(--axi-surface)', aspectRatio: `${width}/${height}`, minHeight: 400 }}
                        />
                    )}

                    <svg
                        className="absolute inset-0 w-full h-full"
                        viewBox={`0 0 ${width} ${height}`}
                        preserveAspectRatio="xMidYMid meet"
                        overflow="visible"
                    >
                        {/* fill/stroke are SVG presentation attributes and do not parse
                            var(), so the token-bearing colour is set via style - see
                            MovementView.tsx for the same fix. */}
                        {landmarks.map((lm, i) => {
                            const s = TYPE_SCALES[lm.type];
                            const color = TYPE_COLORS[lm.type];
                            const dotOffsetY = 10 * s;
                            return (
                                <g key={i} transform={`translate(${lm.x}, ${lm.y})`}>
                                    <g transform={`translate(${-12 * s}, ${-dotOffsetY}) scale(${s})`}>
                                        {/* The tinted body (fillOpacity) and the group dim were
                                            a colour mixed with the ground - rule 2's exact
                                            prohibition. Rule 5 gives the legal cue for the same
                                            job: a landmark is an annotation, so it is OUTLINED
                                            rather than filled, and the outline then needs no
                                            dimming to sit behind the squad marks. */}
                                        <path d={PIN_PATH} style={{ fill: 'none', stroke: color }} strokeWidth={1.5} />
                                        <circle cx={12} cy={10} r={2.5} style={{ fill: color }} />
                                    </g>
                                    <text
                                        x={0}
                                        y={-dotOffsetY - 2}
                                        textAnchor="middle"
                                        style={{ fill: 'var(--axi-text)' }}
                                        fontSize={9}
                                    >
                                        {lm.name}
                                    </text>
                                </g>
                            );
                        })}

                        {avgPosition && (
                            <>
                                <circle cx={avgPosition[0]} cy={avgPosition[1]} r={4} style={{ fill: 'var(--axi-accent)' }} />
                                {/* Was a pair of SMIL <animate> elements on `r` and `opacity`.
                                    `r` is not a compositor property (it forces a geometry
                                    re-resolve every frame) and SMIL is not CSS, so
                                    `prefers-reduced-motion` could never reach it - rule 11
                                    broken twice. .ap-map-pulse re-draws the same ripple as a
                                    CSS transform+opacity keyframe, and rests as a plain static
                                    ring under reduced motion. vector-effect keeps the stroke
                                    1.5 wide while the ring scales, which is what animating `r`
                                    used to give for free. */}
                                <circle
                                    className="ap-map-pulse"
                                    cx={avgPosition[0]}
                                    cy={avgPosition[1]}
                                    r={6}
                                    fill="none"
                                    style={{ stroke: 'var(--axi-accent)' }}
                                    strokeWidth={1.5}
                                    vectorEffect="non-scaling-stroke"
                                />
                            </>
                        )}
                    </svg>
                </div>
            </div>
        </div>
    );
}
