// src/renderer/views/pulse/FightCompositionCard.tsx
import { useState } from 'react';
import type { FightComposition } from '../../../shared/types';
import { getProfessionIconPath } from '../../classIconUtils';

const SEGMENT_COLORS = ['#ef4444', '#f97316', '#dc2626'] as const;

interface Group {
    key: string;
    label: string;
    count: number;
    color: string;
    classCounts: Record<string, number>;
}

export function FightCompositionCard({ composition }: { composition: FightComposition }) {
    const [activeKey, setActiveKey] = useState<string | null>(null);

    const { squadCount, allyCount, enemyCount, teamBreakdown, squadClassCounts, allyClassCounts, enemyClassCountsByTeam } = composition;

    if (squadCount + allyCount + enemyCount === 0) return null;

    const groups: Group[] = [];
    if (squadCount > 0) groups.push({ key: 'squad', label: 'Squad', count: squadCount, color: '#10b981', classCounts: squadClassCounts });
    if (allyCount > 0)  groups.push({ key: 'ally',  label: 'Allies', count: allyCount, color: '#06b6d4', classCounts: allyClassCounts });
    teamBreakdown.forEach(({ teamId, count }, i) => {
        groups.push({
            key: `team-${teamId}`,
            label: `Enemy T${i + 1}`,
            count,
            color: SEGMENT_COLORS[i] ?? SEGMENT_COLORS[2],
            classCounts: enemyClassCountsByTeam[teamId] ?? {},
        });
    });

    const total = groups.reduce((s, g) => s + g.count, 0);
    const activeGroup = groups.find(g => g.key === activeKey) ?? null;

    function toggle(key: string) {
        setActiveKey(prev => prev === key ? null : key);
    }

    return (
        <div
            className="rounded-md p-2.5"
            style={{
                gridColumn: '1 / -1',
                background: 'rgba(239,68,68,0.04)',
                border: '1px solid rgba(239,68,68,0.2)',
            }}
        >
            <div className="text-[9px] uppercase tracking-[0.07em] mb-2" style={{ color: '#f87171' }}>
                Fight Composition
            </div>

            {/* Segmented bar */}
            <div className="flex h-2.5 rounded-full overflow-hidden gap-[2px] mb-2">
                {groups.map(g => (
                    <div
                        key={g.key}
                        className="rounded-sm cursor-pointer transition-opacity duration-150"
                        style={{
                            flex: g.count,
                            background: g.color,
                            opacity: activeKey && activeKey !== g.key ? 0.3 : 1,
                        }}
                        onClick={() => toggle(g.key)}
                    />
                ))}
            </div>

            {/* Legend pills */}
            <div className="flex flex-wrap gap-1.5">
                {groups.map(g => (
                    <button
                        key={g.key}
                        onClick={() => toggle(g.key)}
                        className="flex items-center gap-1.5 text-[10px] px-2 py-0.5 rounded-full transition-colors"
                        style={{
                            border: `1px solid ${activeKey === g.key ? g.color : 'transparent'}`,
                            background: activeKey === g.key ? 'rgba(255,255,255,0.08)' : 'transparent',
                            cursor: 'pointer',
                        }}
                    >
                        <span className="inline-block w-2 h-2 rounded-sm" style={{ background: g.color }} />
                        <span style={{ color: '#e2e8f0', fontWeight: 700 }}>{g.count}</span>
                        <span style={{ color: '#64748b' }}>{g.label}</span>
                        <span style={{ color: '#374151' }}>
                            {Math.round((g.count / total) * 100)}%
                        </span>
                    </button>
                ))}
            </div>

            {/* Class breakdown panel */}
            {activeGroup && (
                <div className="mt-2 pt-2" style={{ borderTop: '1px solid #1a2535' }}>
                    <div className="flex flex-wrap gap-1.5">
                        {Object.entries(activeGroup.classCounts)
                            .sort((a, b) => b[1] - a[1])
                            .map(([spec, count]) => {
                                const iconUrl = getProfessionIconPath(spec);
                                return (
                                    <div
                                        key={spec}
                                        className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded"
                                        style={{ background: '#0f1520', border: '1px solid #1a2535' }}
                                    >
                                        {iconUrl && (
                                            <img src={iconUrl} alt={spec} width={14} height={14} className="rounded-sm" />
                                        )}
                                        <span style={{ color: '#94a3b8' }}>{spec}</span>
                                        <span style={{ color: '#e2e8f0', fontWeight: 700 }}>{count}</span>
                                    </div>
                                );
                            })}
                    </div>
                </div>
            )}
        </div>
    );
}
