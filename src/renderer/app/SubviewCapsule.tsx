import { motion } from 'framer-motion';

interface PillDef {
    id: string;
    label: string;
}

interface SubviewCapsuleProps {
    pills: PillDef[];
    activeId: string;
    onSelect: (id: string) => void;
    layoutGroup: string;
}

export function SubviewCapsule({ pills, activeId, onSelect, layoutGroup }: SubviewCapsuleProps) {
    return (
        <div
            className="inline-flex items-center gap-[1px] rounded-[9px] p-[3px]"
            style={{
                background: '#0a0a16',
                border: '1px solid rgba(255,255,255,0.024)',
                boxShadow: '0 1px 4px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.015)',
            }}
        >
            {pills.map(pill => {
                const isActive = pill.id === activeId;
                return (
                    <button
                        key={pill.id}
                        onClick={() => onSelect(pill.id)}
                        className="relative px-[13px] py-[5px] rounded-[6px] text-[10px] transition-colors duration-150 cursor-pointer"
                        style={{
                            color: isActive ? 'var(--brand-primary)' : '#555',
                            fontWeight: isActive ? 500 : 400,
                        }}
                    >
                        {isActive && (
                            <motion.div
                                layoutId={`capsule-highlight-${layoutGroup}`}
                                className="absolute inset-0 rounded-[6px]"
                                style={{
                                    background: 'linear-gradient(135deg, rgba(16,185,129,0.13), rgba(16,185,129,0.06))',
                                    boxShadow: '0 0 10px rgba(16,185,129,0.06), inset 0 1px 0 rgba(16,185,129,0.08)',
                                }}
                                transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                            />
                        )}
                        <span className="relative z-10">{pill.label}</span>
                    </button>
                );
            })}
        </div>
    );
}
