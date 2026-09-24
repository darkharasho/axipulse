import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';

interface TooltipProps {
    text: string;
    children: React.ReactElement;
    delay?: number;
    position?: 'top' | 'bottom' | 'right';
}

export default function Tooltip({ text, children, delay = 400, position = 'top' }: TooltipProps) {
    const [visible, setVisible] = useState(false);
    const [coords, setCoords] = useState({ x: 0, y: 0 });
    const timerRef = useRef<number | null>(null);
    const triggerRef = useRef<HTMLDivElement>(null);

    const measure = () => {
        if (!triggerRef.current) return;
        const rect = triggerRef.current.getBoundingClientRect();
        if (position === 'right') {
            setCoords({ x: rect.right, y: rect.top + rect.height / 2 });
        } else {
            setCoords({
                x: rect.left + rect.width / 2,
                y: position === 'top' ? rect.top : rect.bottom,
            });
        }
    };

    const show = () => {
        timerRef.current = window.setTimeout(() => {
            measure();
            setVisible(true);
        }, delay);
    };

    const hide = () => {
        if (timerRef.current) {
            window.clearTimeout(timerRef.current);
            timerRef.current = null;
        }
        setVisible(false);
    };

    useEffect(() => () => {
        if (timerRef.current) window.clearTimeout(timerRef.current);
    }, []);

    // The trigger can itself be moving (an SVG marker under playback, whose
    // <g> transform changes every frame without the Tooltip instance
    // remounting - see MovementView.tsx). A one-shot measurement at show()
    // time is only correct for a stationary trigger. Re-measuring every
    // frame is cheap for a boundingClientRect read but is only ever done
    // while the tooltip is actually showing - a hidden/static tooltip (e.g.
    // BoonPerformanceChart's help button) never enters this loop.
    useEffect(() => {
        if (!visible) return;
        let raf = requestAnimationFrame(function track() {
            measure();
            raf = requestAnimationFrame(track);
        });
        return () => cancelAnimationFrame(raf);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [visible, position]);

    if (!text) return children;

    return (
        <div ref={triggerRef} onMouseEnter={show} onMouseLeave={hide} onMouseDown={hide} className="inline-flex">
            {React.cloneElement(children, { title: undefined })}
            {/* .axi-tooltip draws the box; the portal to body is its contract:
                a hovered card is transformed (lift), and a transformed ancestor
                would re-anchor position:fixed to itself. */}
            {visible && createPortal(
                <div
                    className="axi-tooltip"
                    style={{
                        left: position === 'right' ? coords.x + 8 : coords.x,
                        top: position === 'right' ? coords.y : (position === 'top' ? coords.y - 6 : coords.y + 6),
                        transform: position === 'right'
                            ? 'translate(0, -50%)'
                            : position === 'top'
                                ? 'translate(-50%, -100%)'
                                : 'translate(-50%, 0)',
                    }}
                >
                    {text}
                </div>,
                document.body,
            )}
        </div>
    );
}
