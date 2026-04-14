// src/renderer/views/pulse/DefenseSubview.tsx
import type { PlayerFightData } from '../../../shared/types';
import { StatCard } from '../StatCard';

export function DefenseSubview({ data }: { data: PlayerFightData }) {
    const { defense } = data;

    return (
        <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2">
                <StatCard label="Damage Taken" value={defense.damageTaken.toLocaleString()} />
                <StatCard
                    label="Deaths / Downs"
                    value={`${defense.deaths} / ${defense.downs}`}
                    detail={defense.deathTimes.length > 0 ? `deaths at ${defense.deathTimes.map(t => formatTime(t)).join(', ')}` : undefined}
                    detailColor={defense.deaths > 0 ? 'bad' : 'good'}
                />
                <StatCard label="Dodges" value={defense.dodges} />
                <StatCard label="Incoming CC" value={defense.incomingCC} detailColor={defense.incomingCC > 3 ? 'bad' : 'neutral'} />
                <StatCard label="Incoming Strips" value={defense.incomingStrips} detailColor={defense.incomingStrips > 5 ? 'bad' : 'neutral'} />
            </div>
            <div>
                <div className="text-[10px] uppercase tracking-wider text-[color:var(--text-muted)] mb-2">Damage Mitigated</div>
                <div className="grid grid-cols-3 gap-2">
                    {([
                        ['Blocked', defense.blocked],
                        ['Evaded', defense.evaded],
                        ['Missed', defense.missed],
                        ['Invulned', defense.invulned],
                        ['Interrupted', defense.interrupted],
                    ] as const).map(([label, val]) => (
                        <div key={label} className="rounded px-2 py-1.5" style={{ background: 'var(--bg-card)' }}>
                            <div className="text-[9px] text-[color:var(--text-muted)]">{label}</div>
                            <div className="text-sm font-medium text-[color:var(--text-primary)]">{val}</div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

function formatTime(ms: number): string {
    const sec = Math.floor(ms / 1000);
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
}
