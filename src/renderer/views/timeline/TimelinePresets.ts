import type { TimelineLayerToggles } from '../../store';

export interface TimelineLayer {
    key: keyof TimelineLayerToggles;
    label: string;
    color: string;
    type: 'area' | 'bars';
}

export const TIMELINE_LANES: TimelineLayer[] = [
    { key: 'health', label: 'Health', color: 'var(--axi-series-metric-health)', type: 'area' },
    { key: 'damageDealt', label: 'Dmg Dealt', color: 'var(--axi-series-metric-damage-dealt)', type: 'area' },
    { key: 'damageTaken', label: 'Dmg Taken', color: 'var(--axi-series-metric-damage-taken)', type: 'area' },
    { key: 'distanceToTag', label: 'Dist to Tag', color: 'var(--axi-series-metric-distance-to-tag)', type: 'area' },
    { key: 'incomingHealing', label: 'Healing', color: 'var(--axi-series-metric-incoming-healing)', type: 'area' },
    { key: 'incomingBarrier', label: 'Barrier', color: 'var(--axi-series-metric-incoming-barrier)', type: 'area' },
    { key: 'offensiveBoons', label: 'Off Boons', color: 'var(--axi-series-metric-offensive-boons)', type: 'bars' },
    { key: 'defensiveBoons', label: 'Def Boons', color: 'var(--axi-series-metric-defensive-boons)', type: 'bars' },
    { key: 'hardCC', label: 'Hard CC', color: 'var(--axi-series-metric-hard-cc)', type: 'bars' },
    { key: 'softCC', label: 'Soft CC', color: 'var(--axi-series-metric-soft-cc)', type: 'bars' },
];

export const PRESET_LABELS: { key: string; label: string }[] = [
    { key: 'why-died', label: 'Why did I die?' },
    { key: 'my-damage', label: 'My Damage' },
    { key: 'support', label: 'Am I Getting Support?' },
    { key: 'show-all', label: 'Show All' },
];
