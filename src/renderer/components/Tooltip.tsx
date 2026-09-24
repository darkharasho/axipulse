import React, { useState, useRef, useEffect, useId } from 'react';
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
    const tooltipId = `ap-tip-${useId()}`;

    const measure = () => {
        if (!triggerRef.current) return;
        const rect = triggerRef.current.getBoundingClientRect();
        let x: number;
        let y: number;
        if (position === 'right') {
            x = rect.right;
            y = rect.top + rect.height / 2;
        } else {
            x = rect.left + rect.width / 2;
            y = position === 'top' ? rect.top : rect.bottom;
        }
        // The tracking loop below re-measures every frame. Returning the
        // PREVIOUS state object when nothing moved makes React bail out of the
        // re-render entirely, so a stationary tooltip (the help button in
        // BoonPerformanceChart) costs one layout read per frame instead of a
        // full portal re-render at 60fps. A moving trigger still produces a
        // fresh object and still tracks.
        setCoords(prev => (prev.x === x && prev.y === y ? prev : { x, y }));
    };

    const clearTimer = () => {
        if (timerRef.current) {
            window.clearTimeout(timerRef.current);
            timerRef.current = null;
        }
    };

    const show = () => {
        timerRef.current = window.setTimeout(() => {
            measure();
            setVisible(true);
        }, delay);
    };

    // Keyboard focus is a deliberate act, not a hover that might be a
    // passing cursor, so it opens the hint immediately rather than after
    // `delay`. Mouse timing is untouched.
    const showNow = () => {
        clearTimer();
        measure();
        setVisible(true);
    };

    const hide = () => {
        clearTimer();
        setVisible(false);
    };

    useEffect(() => () => clearTimer(), []);

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

    // Escape dismisses the hint. The listener is on the window rather than on
    // the trigger because a MOUSE-opened tooltip leaves focus wherever it was,
    // so a key event would never reach the trigger's own handler.
    useEffect(() => {
        if (!visible) return;
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') hide(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [visible]);

    if (!text) return children;

    return (
        // onFocus/onBlur are React's focusin/focusout, so they fire for the
        // focusable element INSIDE this wrapper (the wrapper itself is not a
        // tab stop and must not become one). This is what makes the hint
        // reachable without a mouse - it is the only route left, because the
        // native `title` is stripped from the child below.
        <div
            ref={triggerRef}
            onMouseEnter={show}
            onMouseLeave={hide}
            onMouseDown={hide}
            onFocus={showNow}
            onBlur={hide}
            className="inline-flex"
        >
            {React.cloneElement(children, {
                title: undefined,
                // APG's tooltip pattern: the description is announced only
                // while the tooltip is actually rendered.
                'aria-describedby': visible ? tooltipId : undefined,
            })}
            {/* .axi-tooltip draws the box; the portal to body is its contract:
                a hovered card is transformed (lift), and a transformed ancestor
                would re-anchor position:fixed to itself. */}
            {visible && createPortal(
                <div
                    id={tooltipId}
                    role="tooltip"
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
