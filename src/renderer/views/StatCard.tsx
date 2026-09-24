import { motion } from 'framer-motion';

interface StatCardProps {
    label: string;
    value: string | number;
    detail?: string;
    detailColor?: 'good' | 'bad' | 'neutral';
    accentColor?: string;
    hero?: boolean;
    index?: number;
}

export function StatCard({ label, value, detail, detailColor = 'neutral', accentColor, hero, index = 0 }: StatCardProps) {
    const colorClass = detailColor === 'good' ? 'text-[color:var(--axi-ok)]'
        : detailColor === 'bad' ? 'text-[color:var(--axi-danger)]'
        : 'text-[color:var(--axi-text-faint)]';

    const accent = accentColor ?? 'var(--axi-accent)';

    return (
        <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: index * 0.05, ease: [0.16, 1, 0.3, 1] }}
            className="ap-stat-card"
            style={{
                borderLeft: `var(--axi-border-panel) solid ${accent}`,
            }}
        >
            <div className={hero ? 'px-4 py-3' : 'px-3 py-2.5'}>
                <div className="text-xs uppercase tracking-[0.08em] font-medium" style={{ color: accent }}>
                    {label}
                </div>
                <div
                    className={`font-stat font-bold leading-none mt-1 ${hero ? 'text-3xl' : 'text-2xl'}`}
                    style={{ color: 'var(--axi-text)' }}
                >
                    {typeof value === 'number' ? value.toLocaleString() : value}
                </div>
                {detail && (
                    <div className={`text-xs mt-1 font-medium ${colorClass}`}>{detail}</div>
                )}
            </div>
        </motion.div>
    );
}
