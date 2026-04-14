import { useRef, useState, useCallback, useEffect, type MouseEvent } from 'react';
import { MapPin, RotateCcw, ZoomIn, ZoomOut } from 'lucide-react';
import { useAppStore } from '../store';
import { WVW_LANDMARKS, type WvwLandmark } from '../../shared/wvwLandmarks';
import { resolveMapFromZone } from '../../shared/mapUtils';
import { MovementView } from './map/MovementView';

export function MapView() {
    const mapSubview = useAppStore(s => s.mapSubview);

    switch (mapSubview) {
        case 'movement': return <MovementView />;
        default: return <MapOverview />;
    }
}

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
                <MapPin className="w-8 h-8" style={{ color: 'var(--text-muted)' }} />
                <span className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>Fight Map</span>
                <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Map data will appear here after a fight is parsed</span>
            </div>
        );
    }

    const { mapImageUrl, mapSize, avgPosition, mapName } = currentFight;
    const map = resolveMapFromZone(mapName);
    const landmarks = map ? WVW_LANDMARKS[map] : [];
    const width = mapSize?.[0] ?? 523;
    const height = mapSize?.[1] ?? 750;

    return (
        <div className="flex flex-col h-full gap-3">
            <div className="flex items-center gap-4">
                <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{mapName}</span>
                {currentFight.nearestLandmark && (
                    <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>Near {currentFight.nearestLandmark}</span>
                )}
                <div className="flex items-center gap-2 ml-auto">
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
                    <div className="flex items-center gap-3 ml-2 text-[10px]" style={{ color: 'var(--text-muted)' }}>
                        {(['keep', 'tower', 'camp', 'ruins'] as const).map(type => (
                            <span key={type} className="flex items-center gap-1">
                                <svg width="10" height="12" viewBox="0 0 24 24" fill={TYPE_COLORS[type]}>
                                    <path d={PIN_PATH} />
                                </svg>
                                {type}
                            </span>
                        ))}
                        <span className="flex items-center gap-1">
                            <span className="inline-block w-2.5 h-2.5 rounded-full border-2" style={{ borderColor: 'var(--brand-primary)', background: 'transparent' }} />
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
                            className="w-full h-full object-contain rounded"
                            style={{ opacity: 0.7 }}
                            draggable={false}
                        />
                    ) : (
                        <div
                            className="w-full h-full rounded"
                            style={{ background: 'var(--bg-card)', aspectRatio: `${width}/${height}`, minHeight: 400 }}
                        />
                    )}

                    <svg
                        className="absolute inset-0 w-full h-full"
                        viewBox={`0 0 ${width} ${height}`}
                        preserveAspectRatio="xMidYMid meet"
                        overflow="visible"
                    >
                        {landmarks.map((lm, i) => {
                            const s = TYPE_SCALES[lm.type];
                            const color = TYPE_COLORS[lm.type];
                            const dotOffsetY = 10 * s;
                            return (
                                <g key={i} transform={`translate(${lm.x}, ${lm.y})`}>
                                    <g transform={`translate(${-12 * s}, ${-dotOffsetY}) scale(${s})`}>
                                        <path d={PIN_PATH} fill={color} fillOpacity={0.15} stroke={color} strokeWidth={1.5} opacity={0.8} />
                                        <circle cx={12} cy={10} r={2.5} fill={color} opacity={0.8} />
                                    </g>
                                    <text
                                        x={0}
                                        y={-dotOffsetY - 2}
                                        textAnchor="middle"
                                        fill="#e8eaed"
                                        fontSize={9}
                                        fontFamily="Inter, sans-serif"
                                    >
                                        {lm.name}
                                    </text>
                                </g>
                            );
                        })}

                        {avgPosition && (
                            <>
                                <circle cx={avgPosition[0]} cy={avgPosition[1]} r={4} fill="#10b981" opacity={0.9} />
                                <circle cx={avgPosition[0]} cy={avgPosition[1]} r={6} fill="none" stroke="#10b981" strokeWidth={1.5} opacity={0}>
                                    <animate attributeName="r" values="6;28" dur="1.8s" repeatCount="indefinite" />
                                    <animate attributeName="opacity" values="0.8;0" dur="1.8s" repeatCount="indefinite" />
                                </circle>
                            </>
                        )}
                    </svg>
                </div>
            </div>
        </div>
    );
}
