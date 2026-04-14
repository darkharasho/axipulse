// src/renderer/views/pulse/DamageSubview.tsx
import type { PlayerFightData } from '../../../shared/types';
import { StatCard } from '../StatCard';

export function DamageSubview({ data }: { data: PlayerFightData }) {
    const { damage } = data;
    const maxDamage = damage.topSkills[0]?.damage ?? 1;

    return (
        <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2">
                <StatCard label="Total Damage" value={damage.totalDamage.toLocaleString()} detail={`${damage.dps.toLocaleString()} DPS`} detailColor="good" />
                <StatCard label="Breakbar" value={damage.breakbarDamage.toLocaleString()} />
                <StatCard label="Down Contribution" value={damage.downContribution} />
            </div>
            {damage.topSkills.length > 0 && (
                <div>
                    <div className="text-[10px] uppercase tracking-wider text-[color:var(--text-muted)] mb-2">Top Skills</div>
                    <div className="space-y-1">
                        {damage.topSkills.slice(0, 8).map(skill => (
                            <div key={skill.id} className="flex items-center gap-2 text-[11px]">
                                <span className="w-28 truncate text-[color:var(--text-secondary)]">{skill.name}</span>
                                <div className="flex-1 h-3 rounded-sm overflow-hidden" style={{ background: 'var(--bg-base)' }}>
                                    <div
                                        className="h-full rounded-sm"
                                        style={{ width: `${(skill.damage / maxDamage) * 100}%`, background: 'var(--brand-primary)', opacity: 0.7 }}
                                    />
                                </div>
                                <span className="w-16 text-right text-[color:var(--text-muted)]">{skill.damage.toLocaleString()}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
