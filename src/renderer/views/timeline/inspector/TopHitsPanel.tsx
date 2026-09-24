import type { SkillDamage } from '../../../../shared/types';

interface TopHitsPanelProps {
    topDamageTakenSkills: SkillDamage[];
}

export function TopHitsPanel({ topDamageTakenSkills }: TopHitsPanelProps) {
    const top5 = topDamageTakenSkills.slice(0, 5);
    const maxDmg = top5.length > 0 ? top5[0].damage : 1;
    const remaining = topDamageTakenSkills.slice(5);
    const remainingTotal = remaining.reduce((sum, s) => sum + s.damage, 0);

    return (
        <div className="axi-panel p-2.5">
            <div className="axi-eyebrow" style={{ color: 'var(--axi-danger)' }}>Top Hits Taken</div>
            <div className="flex flex-col gap-1.5">
                {top5.length === 0 && <div className="text-[10px]" style={{ color: 'var(--axi-text-faint)' }}>No damage data</div>}
                {top5.map((skill, i) => (
                    <div key={i}>
                        <div className="flex justify-between text-[10px] mb-0.5">
                            <span className="flex items-center gap-1" style={{ color: 'var(--axi-text)' }}>
                                {skill.icon && (
                                    <img
                                        src={skill.icon}
                                        alt={skill.name}
                                        className="w-3.5 h-3.5"
                                        style={{ border: 'var(--axi-border-hairline) solid var(--axi-ink-line)' }}
                                    />
                                )}
                                {skill.name}
                            </span>
                            <span className="font-semibold" style={{ color: 'var(--axi-danger)' }}>-{skill.damage.toLocaleString()}</span>
                        </div>
                        <div className="ap-meter">
                            <div
                                className="ap-meter-fill"
                                style={{ width: `${(skill.damage / maxDmg) * 100}%`, background: 'var(--axi-danger)' }}
                            />
                        </div>
                    </div>
                ))}
                {remaining.length > 0 && (
                    <div className="flex justify-between text-[9px]">
                        <span style={{ color: 'var(--axi-text-dim)' }}>+ {remaining.length} more</span>
                        <span style={{ color: 'var(--axi-text-dim)' }}>-{remainingTotal.toLocaleString()}</span>
                    </div>
                )}
            </div>
        </div>
    );
}
