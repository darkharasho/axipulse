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
        <div className="bg-[#111] rounded-[5px] p-2.5 border border-[#1a1a1a]">
            <div className="text-[9px] text-[#f87171] mb-2 uppercase tracking-wider">Top Hits Taken</div>
            <div className="flex flex-col gap-1.5">
                {top5.length === 0 && <div className="text-[10px] text-[#555]">No damage data</div>}
                {top5.map((skill, i) => (
                    <div key={i}>
                        <div className="flex justify-between text-[10px] mb-0.5">
                            <span className="text-[#ddd] flex items-center gap-1">
                                {skill.icon && <img src={skill.icon} alt={skill.name} className="w-3.5 h-3.5 rounded-sm border border-[#333]" />}
                                {skill.name}
                            </span>
                            <span className="text-[#ef4444] font-semibold">-{skill.damage.toLocaleString()}</span>
                        </div>
                        <div className="h-[3px] bg-[#1a1a1a] rounded">
                            <div
                                className="h-full bg-[#ef4444] rounded opacity-60"
                                style={{ width: `${(skill.damage / maxDmg) * 100}%` }}
                            />
                        </div>
                    </div>
                ))}
                {remaining.length > 0 && (
                    <div className="flex justify-between text-[10px]">
                        <span className="text-[#ccc]">+ {remaining.length} more</span>
                        <span className="text-[#f8717188]">-{remainingTotal.toLocaleString()}</span>
                    </div>
                )}
            </div>
        </div>
    );
}
