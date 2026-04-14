// src/renderer/views/StatCard.tsx
interface StatCardProps {
    label: string;
    value: string | number;
    detail?: string;
    detailColor?: 'good' | 'bad' | 'neutral';
}

export function StatCard({ label, value, detail, detailColor = 'neutral' }: StatCardProps) {
    const colorClass = detailColor === 'good' ? 'text-[color:var(--brand-primary)]'
        : detailColor === 'bad' ? 'text-[color:var(--status-error)]'
        : 'text-[color:var(--text-muted)]';

    return (
        <div className="rounded p-3" style={{ background: 'var(--bg-card)' }}>
            <div className="text-[10px] uppercase tracking-wider text-[color:var(--text-muted)]">{label}</div>
            <div className="text-lg font-semibold text-[color:var(--text-primary)] mt-0.5">
                {typeof value === 'number' ? value.toLocaleString() : value}
            </div>
            {detail && <div className={`text-[10px] mt-0.5 ${colorClass}`}>{detail}</div>}
        </div>
    );
}
