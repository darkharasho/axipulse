// src/renderer/views/pulse/BoonsSubview.tsx
import type { PlayerFightData } from '../../../shared/types';

export function BoonsSubview({ data }: { data: PlayerFightData }) {
    const { boons } = data;

    return (
        <div className="space-y-4">
            {boons.uptimes.length > 0 && (
                <div>
                    <div className="text-[10px] uppercase tracking-wider text-[color:var(--text-muted)] mb-2">Boon Uptime</div>
                    <div className="space-y-1">
                        {boons.uptimes.map(boon => (
                            <div key={boon.id} className="flex items-center gap-2 text-[11px]">
                                <span className="w-24 text-[color:var(--text-secondary)]">{boon.name}</span>
                                <div className="flex-1 h-3 rounded-sm overflow-hidden" style={{ background: 'var(--bg-base)' }}>
                                    <div
                                        className="h-full rounded-sm"
                                        style={{ width: `${Math.min(boon.uptime, 100)}%`, background: 'var(--brand-secondary)', opacity: 0.7 }}
                                    />
                                </div>
                                <span className="w-12 text-right text-[color:var(--text-muted)]">{boon.uptime.toFixed(1)}%</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}
            {boons.generation.length > 0 && (
                <div>
                    <div className="text-[10px] uppercase tracking-wider text-[color:var(--text-muted)] mb-2">Boon Generation</div>
                    <table className="w-full text-[11px]">
                        <thead>
                            <tr className="text-[color:var(--text-muted)]">
                                <th className="text-left font-normal pb-1">Boon</th>
                                <th className="text-right font-normal pb-1">Self</th>
                                <th className="text-right font-normal pb-1">Group</th>
                                <th className="text-right font-normal pb-1">Squad</th>
                            </tr>
                        </thead>
                        <tbody>
                            {boons.generation.map(boon => (
                                <tr key={boon.id} className="text-[color:var(--text-secondary)]">
                                    <td className="py-0.5">{boon.name}</td>
                                    <td className="text-right">{boon.selfGeneration.toFixed(1)}</td>
                                    <td className="text-right">{boon.groupGeneration.toFixed(1)}</td>
                                    <td className="text-right">{boon.squadGeneration.toFixed(1)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
