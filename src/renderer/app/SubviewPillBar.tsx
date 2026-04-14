// src/renderer/app/SubviewPillBar.tsx
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { useAppStore } from '../store';

interface PillDef {
    id: string;
    label: string;
}

interface SubviewPillBarProps {
    pills: PillDef[];
    activeId: string;
    onSelect: (id: string) => void;
}

export function SubviewToggle({ pills, activeId }: { pills: PillDef[]; activeId: string }) {
    const expanded = useAppStore(s => s.pillBarExpanded);
    const togglePillBar = useAppStore(s => s.togglePillBar);
    const activePill = pills.find(p => p.id === activeId);

    return (
        <button
            onClick={togglePillBar}
            className="flex items-center gap-1.5 no-drag px-2 py-1 rounded transition-colors hover:bg-white/5"
        >
            <span className="text-[11px] text-[color:var(--text-secondary)]">
                {activePill?.label ?? 'Select'}
            </span>
            {expanded
                ? <ChevronUp className="w-3 h-3 text-[color:var(--brand-primary)]" />
                : <ChevronDown className="w-3 h-3 text-[color:var(--text-muted)]" />
            }
        </button>
    );
}

export function SubviewPillExpansion({ pills, activeId, onSelect }: SubviewPillBarProps) {
    const expanded = useAppStore(s => s.pillBarExpanded);
    const togglePillBar = useAppStore(s => s.togglePillBar);

    return (
        <AnimatePresence>
            {expanded && (
                <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
                    className="overflow-hidden border-b shrink-0"
                    style={{ borderColor: 'var(--border-subtle)', background: 'var(--bg-base)' }}
                >
                    <div className="flex items-center px-3 py-1.5 gap-1.5">
                        {pills.map(pill => (
                            <button
                                key={pill.id}
                                onClick={() => {
                                    onSelect(pill.id);
                                    togglePillBar();
                                }}
                                className={`px-2.5 py-1 text-[11px] rounded-full transition-colors ${
                                    pill.id === activeId
                                        ? 'text-[color:var(--brand-primary)] bg-[color:var(--accent-bg)] border border-[color:var(--accent-border)]'
                                        : 'text-[color:var(--text-muted)] hover:text-[color:var(--text-secondary)]'
                                }`}
                            >
                                {pill.label}
                            </button>
                        ))}
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
