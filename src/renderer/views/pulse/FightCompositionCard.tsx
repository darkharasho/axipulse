// src/renderer/views/pulse/FightCompositionCard.tsx
import { useState } from 'react';
import type { FightComposition } from '../../../shared/types';
import { getProfessionIconPath } from '../../classIconUtils';
import { getProfessionColor } from '../../../shared/professionUtils';

// Squad / Allies / Enemy T1..T3 is ONE categorical domain scale, so every
// member of it comes from --axi-series-* (rule 9) and NONE of it comes from
// a chrome ink. Squad used to be var(--axi-accent) and Allies var(--axi-meta),
// and both were defects: the accent is byte-identical to two of the enemy
// tokens under two of the eleven accents (crimson-red === -damage-dealt,
// rose-pink === -hard-cc), which collapsed Squad into Enemy T1 or T3 in both
// the bar and the legend; and --axi-meta is reserved by rule 6 for meta
// information, so using it as a data-series colour gave that token two
// meanings. Keep the accent out of this scale. The only place the accent
// legitimately appears below is the ACTIVE legend pill's fill, which is a
// selection state, not a series identity.
const GROUP_COLORS = {
    squad: 'var(--axi-series-4)',
    ally: 'var(--axi-series-1)',
} as const;

const SEGMENT_COLORS = [
    'var(--axi-series-metric-damage-dealt)',
    'var(--axi-series-6)',
    'var(--axi-series-metric-hard-cc)',
] as const;

interface Group {
    key: string;
    label: string;
    count: number;
    color: string;
    classCounts: Record<string, number>;
}

const CARD_THEMES = {
    support: { bg: 'transparent', border: 'var(--axi-ok)', label: 'var(--axi-ok)' },
    damage: { bg: 'transparent', border: 'var(--axi-danger)', label: 'var(--axi-danger)' },
} as const;

export function FightCompositionCard({ composition, isSupport }: { composition: FightComposition; isSupport?: boolean }) {
    const theme = CARD_THEMES[isSupport ? 'support' : 'damage'];
    const [activeKey, setActiveKey] = useState<string | null>(null);

    const { squadCount, allyCount, enemyCount, teamBreakdown, squadClassCounts, allyClassCounts, enemyClassCountsByTeam } = composition;

    if (squadCount + allyCount + enemyCount === 0) return null;

    const groups: Group[] = [];
    if (squadCount > 0) groups.push({ key: 'squad', label: 'Squad', count: squadCount, color: GROUP_COLORS.squad, classCounts: squadClassCounts });
    if (allyCount > 0)  groups.push({ key: 'ally',  label: 'Allies', count: allyCount, color: GROUP_COLORS.ally, classCounts: allyClassCounts });
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
            className="p-2.5"
            style={{
                gridColumn: '1 / -1',
                background: theme.bg,
                border: `var(--axi-border-control) solid ${theme.border}`,
            }}
        >
            <div className="text-[9px] uppercase tracking-[0.07em] mb-2" style={{ color: theme.label }}>
                Fight Composition
            </div>

            {/* Segmented bar */}
            <div className="ap-meter flex gap-[2px] mb-2">
                {groups.map(g => (
                    <div
                        key={g.key}
                        className="cursor-pointer"
                        style={{
                            flex: g.count,
                            background: g.color,
                            boxShadow: activeKey === g.key
                                ? 'inset 0 0 0 var(--axi-border-hairline) var(--axi-accent-ink)'
                                : 'none',
                        }}
                        onClick={() => toggle(g.key)}
                    />
                ))}
            </div>

            {/* Legend pills */}
            <div className="flex flex-wrap gap-1.5">
                {groups.map(g => {
                    const isActive = activeKey === g.key;
                    return (
                        <button
                            key={g.key}
                            onClick={() => toggle(g.key)}
                            className="flex items-center gap-1.5 text-[10px] px-2 py-0.5 transition-colors"
                            style={{
                                border: `var(--axi-border-control) solid ${isActive ? 'var(--axi-accent-ink)' : 'transparent'}`,
                                background: isActive ? 'var(--axi-accent)' : 'transparent',
                                cursor: 'pointer',
                            }}
                        >
                            <span className="inline-block w-2 h-2" style={{ background: isActive ? 'var(--axi-accent-ink)' : g.color }} />
                            <span style={{ color: isActive ? 'var(--axi-accent-ink)' : 'var(--axi-text)', fontWeight: 700 }}>{g.count}</span>
                            <span style={{ color: isActive ? 'var(--axi-accent-ink)' : 'var(--axi-text-dim)' }}>{g.label}</span>
                            <span style={{ color: isActive ? 'var(--axi-accent-ink)' : 'var(--axi-text-faint)' }}>
                                {Math.round((g.count / total) * 100)}%
                            </span>
                        </button>
                    );
                })}
            </div>

            {/* Class breakdown panel */}
            {activeGroup && (
                <div className="mt-2 pt-2" style={{ borderTop: 'var(--axi-border-control) solid var(--axi-ink-line)' }}>
                    <div className="flex flex-wrap gap-1.5">
                        {Object.entries(activeGroup.classCounts)
                            .sort((a, b) => b[1] - a[1])
                            .map(([spec, count]) => {
                                const iconUrl = getProfessionIconPath(spec);
                                return (
                                    <div
                                        key={spec}
                                        className="flex items-center gap-1 text-[10px] px-1.5 py-0.5"
                                        style={{ background: 'var(--axi-ground)', border: `var(--axi-border-control) solid ${getProfessionColor(spec)}` }}
                                    >
                                        {iconUrl
                                            ? <img src={iconUrl} alt={spec} width={14} height={14} />
                                            : <span className="inline-block w-2 h-2 flex-shrink-0" style={{ background: getProfessionColor(spec) }} />
                                        }
                                        <span style={{ color: getProfessionColor(spec) }}>{spec}</span>
                                        <span style={{ color: 'var(--axi-text)', fontWeight: 700 }}>{count}</span>
                                    </div>
                                );
                            })}
                    </div>
                </div>
            )}
        </div>
    );
}
