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
        <div className="ap-capsule">
            {pills.map(pill => {
                const isActive = pill.id === activeId;
                return (
                    <button
                        key={pill.id}
                        onClick={() => onSelect(pill.id)}
                        className={`ap-capsule-seg ${isActive ? 'ap-capsule-seg--active' : ''}`}
                    >
                        {isActive && (
                            <motion.div
                                layoutId={`capsule-highlight-${layoutGroup}`}
                                className="ap-capsule-seg__fill"
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
